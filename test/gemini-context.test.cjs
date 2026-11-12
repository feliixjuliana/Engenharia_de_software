const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareContext } = require('../out/gemini/prepareContext');

function file(path, content, extra = {}) {
  return { path, content, language: 'TypeScript', imports: [], exports: [], entryPoints: [], errors: [], ...extra };
}

test('groups by directory and follows local imports without duplicating cyclic files', () => {
  const files = [
    file('src/z.ts', 'export const z = 1;', { imports: [{ target: 'src/a.ts' }] }),
    file('src/a.ts', 'export const a = 1;', { imports: [{ target: 'src/z.ts' }, { target: 'lib/b.ts' }] }),
    file('lib/b.ts', 'export const b = 1;'),
    file('src/main.ts', 'export const main = 1;', { entryPoints: [{}], imports: [{ target: 'src/z.ts' }] })
  ];
  const plan = prepareContext(files, 4000, 600);
  assert.deepEqual(prepareContext(files.toReversed(), 4000, 600), plan);
  assert.deepEqual(plan.batches.map(batch => [batch.module, batch.files]), [
    ['src', ['src/main.ts', 'src/z.ts', 'src/a.ts']], ['lib', ['lib/b.ts']]
  ]);
  const { fragments } = JSON.parse(plan.batches[0].payload);
  assert.deepEqual(fragments[2].dependencies, ['lib/b.ts', 'src/z.ts']);
  assert.equal(fragments[0].completeFile, true);
  assert.equal(plan.maxOutputTokens, 600);
});

test('splits a large file on statements and records oversized declarations and trailing comments', () => {
  const content = [
    'export function first() { return "á".repeat(10); }',
    `export function tooLarge() { return "${'x'.repeat(800)}"; }`,
    'export function last() { return "ok"; }',
    '// trailing note'
  ].join('\r\n');
  const plan = prepareContext([file('src/large.ts', content)], 420, 80);
  assert.equal(plan.batches.length, 2);
  for (const batch of plan.batches) {
    assert.equal(batch.bytes, Buffer.byteLength(batch.payload, 'utf8'));
    assert(batch.bytes <= plan.payloadBudgetBytes);
  }
  const fragments = plan.batches.flatMap(batch => JSON.parse(batch.payload).fragments);
  assert.deepEqual(fragments.map(({ code, endLine, completeFile }) => [code.trim(), endLine, completeFile]), [
    ['export function first() { return "á".repeat(10); }', 1, false],
    ['export function last() { return "ok"; }', 3, false]
  ]);
  assert(fragments.every(({ code, startLine, endLine }) =>
    content.split('\r\n').slice(startLine - 1, endLine).join('\r\n').includes(code.trim())));
  assert.deepEqual(plan.omissions.map(({ endLine }) => endLine), [2, 4]);
});

test('excludes sensitive and invalid code and keeps only safe dependency metadata', () => {
  const plan = prepareContext([
    file('src/index.ts', 'export const ok = true;', { imports: [
      { target: 'secrets/key.ts', status: 'resolved' }, { status: 'unresolved', specifier: './private-missing' }
    ] }),
    file('secrets/key.ts', 'export const confidential = 1;'),
    file('src/broken.ts', 'const =', { errors: ['parse error'] })
  ], 3000, 600);
  assert.deepEqual(plan.omissions.map(item => item.path), ['src/broken.ts']);
  const payload = plan.batches[0].payload;
  assert(!payload.includes('secrets/key.ts') && !payload.includes('private-missing') && !payload.includes('const ='));
  const fragment = JSON.parse(payload).fragments[0];
  assert.equal(fragment.unresolvedImports, 1);
  assert.equal(fragment.importsOutsideSelection, 1);
  const tiny = prepareContext([file('a.ts', 'const a = 1;')], 1, 1);
  assert.deepEqual(tiny.batches, []);
  assert.equal(tiny.omissions.length, 1);
});
