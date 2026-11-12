const test = require('node:test');
const assert = require('node:assert/strict');
const { readGeminiConfiguration } = require('../out/gemini/configuration');
const { canAuthorizeFile, selectRelevantFiles } = require('../out/gemini/authorization');

test('selection prioritizes entry points and distinct importers with a stable cap', () => {
  const file = (path, options = {}) => ({
    path, language: 'TypeScript', content: '', imports: [], exports: [], entryPoints: [], ...options
  });
  const files = [
    file('z-entry.ts', { entryPoints: [{}], imports: [{ target: 'z-core.ts' }, { target: 'a-util.ts' }, { target: 'a-util.ts' }] }),
    file('z-core.ts'),
    file('a-util.ts'),
    file('b-client.ts', { imports: [{ target: 'z-core.ts' }] }),
    file('secrets/config.ts', { entryPoints: [{}] }),
    file('src/config.ts', { content: 'const password = "example-only";' }),
    file('README.md', { language: 'Documentation' }),
    ...Array.from({ length: 20 }, (_, i) => file(`extra-${i}.ts`))
  ];
  const selected = selectRelevantFiles(files);
  assert.equal(selected.length, 20);
  assert.deepEqual(selected.slice(0, 3), ['z-entry.ts', 'z-core.ts', 'a-util.ts']);
  assert.deepEqual(selectRelevantFiles(files.slice().reverse()), selected);
  assert(!selected.some(path => ['secrets/config.ts', 'src/config.ts', 'README.md'].includes(path)));
});

const configured = { 'gemini.model': 'gemini-test-model', 'gemini.requestsPerMinute': 2,
  'gemini.requestsPerDay': 10, 'gemini.inputTokensPerMinute': 10000 };
const read = overrides => readGeminiConfiguration((key, fallback) => ({ ...configured, ...overrides })[key] ?? fallback);

test('configuration validates budgets and refuses missing account quotas', () => {
  assert.equal(read({}).maxRequests, 5);
  for (const key of ['requestsPerMinute', 'requestsPerDay', 'inputTokensPerMinute']) {
    assert.throws(() => read({ [`gemini.${key}`]: 0 }), /Configure/);
  }
  for (const value of [-1, 1.5, NaN, Infinity, '10', 101]) {
    assert.throws(() => read({ 'gemini.maxRequests': value }), /Configure/);
  }
  assert.throws(() => read({ 'gemini.maxInputTokens': 11000 }), /não pode exceder/);
  assert.throws(() => read({ 'gemini.model': '' }), /identificador/);
});

test('external disclosure filters reject unsafe paths and credential-like content', () => {
  for (const filePath of ['/absolute.ts', '../escape.ts', 'C:/absolute.ts', 'src\\file.ts',
    'src/.env', 'secrets/settings.json', 'src/key.pem', 'src/invalid\nname.ts']) {
    assert.equal(canAuthorizeFile({ path: filePath, content: '' }), false, filePath);
  }
  for (const content of ['const password = "example-only";', '{"api_key":"example-only"}',
    '-----BEGIN PRIVATE KEY-----']) {
    assert.equal(canAuthorizeFile({ path: 'src/config.ts', content }), false);
  }
  assert.equal(canAuthorizeFile({ path: 'src/user.ts', content: 'export const count = 1;' }), true);
});

test('configuration manifest keeps Gemini settings outside workspace control and has no key setting', () => {
  const manifest = require('../package.json');
  const entries = Object.entries(manifest.contributes.configuration.properties)
    .filter(([key]) => key.startsWith('legacyAi.gemini.'));
  assert.equal(entries.length, 7);
  assert(entries.every(([, value]) => value.scope === 'application'));
  assert(entries.every(([key]) => !/apiKey|secret/i.test(key)));
});
