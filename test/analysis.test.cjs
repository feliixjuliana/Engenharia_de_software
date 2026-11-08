const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const { WorkspaceScanner } = require('../out/analysis/workspaceScanner');
const { analyzeRepository } = require('../out/analysis/analyzeRepository');
const { RepositoryIndex } = require('../out/analysis/repositoryIndex');
const { renderInventory } = require('../out/analysis/renderInventory');
const { TypeScriptAnalyzer } = require('../out/analysis/typeScriptAnalyzer');
const fixture = path.join(__dirname, 'fixtures/project');
const active = { isCancellationRequested: false };

async function project(t, entries = {}) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-stage3-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(entries)) {
    const destination = path.join(root, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
  return root;
}

function record(name, content, language = 'TypeScript') {
  return { path: name, content, language, bytes: Buffer.byteLength(content), hash: '',
    symbols: [], imports: [], exports: [], dependencies: [], entryPoints: [], errors: [] };
}

test('fixture: files, JS/TS symbols, exact lines, imports, dependencies and invalid syntax', async () => {
  const result = await analyzeRepository(fixture, {}, active);
  const index = new RepositoryIndex(result);
  assert.equal(result.files.length, 6);
  assert.deepEqual(new Set(result.files.map(file => file.language)), new Set(['JSON', 'Documentation', 'JavaScript', 'TypeScript']));
  const user = index.getFile('src/user.ts');
  assert.deepEqual(user.symbols.find(item => item.name === 'UserService'), {
    path: 'src/user.ts', startLine: 4, endLine: 8, name: 'UserService', kind: 'class'
  });
  assert.equal(user.symbols.find(item => item.name === 'UserService.register').startLine, 5);
  assert.equal(user.symbols.find(item => item.name === 'User').kind, 'interface');
  assert.equal(user.symbols.find(item => item.name === 'MAX_USERS').kind, 'constant');
  assert.equal(index.getFile('src/helper.js').symbols.find(item => item.name === 'normalize').kind, 'function');
  assert.equal(index.importsFrom('src/index.ts')[0].target, 'src/user.ts');
  assert.equal(index.importsFrom('src/helper.js')[0].target, 'src/user.ts');
  assert(index.dependentsOf('src/user.ts').includes('src/index.ts'));
  const dependency = index.getFile('package.json').dependencies.find(item => item.name === 'express');
  assert.equal(dependency.version, '^4.21.0');
  assert.equal(dependency.startLine, 4);
  assert.equal(index.getFile('package.json').entryPoints[0].value, 'src/index.ts');
  assert(index.getFile('src/broken.ts').errors.length > 0);
  assert(index.getFile('src/index.ts').symbols.some(item => item.name === 'registerUser'));
  assert.match(renderInventory('example', index), /Inventário técnico/);
});

test('built-in exclusions, secrets, generated files, binary content and unsupported files', async t => {
  const root = await project(t, {
    'src/app.ts': 'export const value = 1;',
    'node_modules/a/index.js': 'secret()', '.git/config': 'secret',
    'dist/app.js': 'secret()', 'build/app.js': 'secret()', 'out/app.js': 'secret()',
    '.env': 'TOKEN=secret', '.env.local': 'TOKEN=secret', 'credentials.json': '{}',
    '.aws/credentials': 'secret', 'app.min.js': 'minified', 'app.d.ts': 'declare const x: number;',
    'generated.ts': '// @generated do not edit\nexport const x = 1;',
    'binary.js': Buffer.from([0, 1, 2]), 'picture.png': Buffer.from([0, 1, 2]),
    'bad-encoding.ts': Buffer.from([0xff, 0xfe]), 'package-lock.json': '{}'
  });
  const result = await new WorkspaceScanner().scan(root);
  assert.deepEqual(result.files.map(file => file.path), ['src/app.ts']);
  for (const name of ['node_modules', '.git', 'dist', 'build', 'out', '.env', '.aws', 'binary.js', 'generated.ts', 'bad-encoding.ts']) {
    assert(result.ignored.some(item => item.path === name && item.reason));
  }
});

test('root and nested gitignore rules, including negation and anchored patterns', async t => {
  const root = await project(t, {
    '.gitignore': '*.skip.ts\n!keep.skip.ts\n/root-only.ts\nignored/\n',
    'drop.skip.ts': 'export const x=1', 'keep.skip.ts': 'export const x=1',
    'root-only.ts': '', 'nested/root-only.ts': '', 'ignored/file.ts': '',
    'nested/.gitignore': '/private.ts\n!nested.keep.skip.ts\n',
    'nested/private.ts': '', 'nested/nested.keep.skip.ts': '', 'nested/deeper/private.ts': ''
  });
  const result = await new WorkspaceScanner().scan(root);
  assert.deepEqual(result.files.map(file => file.path).sort(), [
    'keep.skip.ts', 'nested/deeper/private.ts', 'nested/nested.keep.skip.ts', 'nested/root-only.ts'
  ]);
  assert(result.ignored.some(item => item.path === 'ignored' && item.reason === 'Regra .gitignore'));
});

test('file count, per-file size and aggregate byte budgets', async t => {
  const root = await project(t, { 'a.ts': 'abcdef', 'b.ts': 'abcdef', 'c.ts': 'abcdef' });
  const scanner = new WorkspaceScanner();
  const count = await scanner.scan(root, { maxFiles: 1 });
  assert.equal(count.files.length, 1);
  assert.equal(count.ignored.filter(item => item.reason === 'Limite de quantidade de arquivos').length, 2);
  const size = await scanner.scan(root, { maxFileBytes: 3 });
  assert.equal(size.files.length, 0);
  assert(size.ignored.every(item => item.reason === 'Limite de tamanho por arquivo'));
  const total = await scanner.scan(root, { maxTotalBytes: 6 });
  assert.equal(total.files.length, 1);
  assert.equal(total.bytesRead, 6);
  assert(total.limitations.some(item => item.includes('maxTotalBytes')));
});

test('depth and visited-entry limits bound even unsupported trees', async t => {
  const root = await project(t, { 'a/b/c.ts': '', 'z.dat': '', 'y.dat': '', 'x.dat': '' });
  const scanner = new WorkspaceScanner();
  const depth = await scanner.scan(root, { maxDepth: 1 });
  assert(depth.ignored.some(item => item.path === 'a/b' && item.reason === 'Limite de profundidade'));
  const entries = await scanner.scan(root, { maxEntries: 2 });
  assert.equal(entries.entriesVisited, 2);
  assert(entries.limitations.some(item => item.includes('maxEntries')));
});

test('invalid limits rejected before traversal', async () => {
  for (const limits of [{ maxFiles: 0 }, { maxDepth: -1 }, { maxFileBytes: 1.2 }, { maxFiles: 10001 }]) {
    await assert.rejects(() => new WorkspaceScanner().scan(fixture, limits), /Limite inválido/);
  }
});

test('invalid JSON is reported and does not stop other files', async t => {
  const root = await project(t, { 'bad.json': '{oops', 'ok.ts': 'export function ok() {}' });
  const result = await analyzeRepository(root, {}, active);
  assert(result.files.find(file => file.path === 'bad.json').errors.some(error => error.includes('JSON inválido')));
  assert.equal(result.files.find(file => file.path === 'ok.ts').symbols[0].name, 'ok');
});

test('cancellation before scanning and during enumeration produces partial status', async t => {
  const root = await project(t, { 'a.ts': 'const a = 1', 'b.ts': 'const b = 2' });
  const before = await new WorkspaceScanner().scan(root, {}, { isCancellationRequested: true });
  assert.equal(before.cancelled, true);
  assert.equal(before.files.length, 0);
  const token = { isCancellationRequested: false };
  const during = await new WorkspaceScanner().scan(root, {}, token, () => { token.isCancellationRequested = true; });
  assert.equal(during.cancelled, true);
  assert(during.entriesVisited <= 1);
});

test('cancellation during extraction stops subsequent files', async t => {
  const root = await project(t, { 'a.ts': 'export const a = 1', 'b.ts': 'export const b = 2' });
  const token = { isCancellationRequested: false };
  const result = await analyzeRepository(root, {}, token, message => {
    if (message.startsWith('Extraindo estrutura:')) { token.isCancellationRequested = true; }
  });
  assert(result.cancelled);
  assert.equal(result.files.filter(file => file.symbols.length).length, 1);
});

test('empty directory yields a valid empty inventory', async t => {
  const root = await project(t);
  const result = await analyzeRepository(root, {}, active);
  assert.equal(result.files.length, 0);
  assert.equal(result.errors.length, 0);
  assert.match(renderInventory('empty', new RepositoryIndex(result)), /Arquivos lidos e indexados: 0/);
});

test('local module resolution remains inside indexed files and flags ambiguity', async t => {
  const root = await project(t, {
    'src/a.ts': "import './b.js';\nimport '../folder';\nimport '../../outside';\nimport './missing';\nimport 'express';\nimport '@/alias';\nimport './ambiguous';",
    'src/b.ts': 'export const b=1;', 'folder/index.ts': '',
    'src/ambiguous.ts': '', 'src/ambiguous.js': ''
  });
  const index = new RepositoryIndex(await analyzeRepository(root, {}, active));
  assert.deepEqual(index.importsFrom('src/a.ts').map(item => item.status), [
    'resolved', 'resolved', 'outside-root', 'unresolved', 'external', 'unresolved', 'unresolved'
  ]);
  assert.equal(index.importsFrom('src/a.ts')[0].target, 'src/b.ts');
});

test('index supports queries after source removal, without rereading the project', async t => {
  const root = await project(t, { 'a.ts': 'export class Original {}' });
  const index = new RepositoryIndex(await analyzeRepository(root, {}, active));
  await fs.unlink(path.join(root, 'a.ts'));
  assert.equal(index.findSymbols('original')[0].name, 'Original');
  assert.equal(index.getFile('a.ts').content, 'export class Original {}');
});

test('scanner refuses directory links/junctions to an outside project', async t => {
  const root = await project(t, { 'inside.ts': '' });
  const outside = await project(t, { 'secret.ts': 'export const secret=1;' });
  try { await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Sistema não permite criar links'); return; } throw error; }
  const result = await new WorkspaceScanner().scan(root);
  assert.deepEqual(result.files.map(file => file.path), ['inside.ts']);
  assert(result.ignored.some(item => item.path === 'linked' && item.reason.includes('Link')));
  await assert.rejects(() => new WorkspaceScanner().scan(path.join(root, 'linked')), /sem link simbólico/);
});

test('file symlinks and symlinked gitignore are never read', async t => {
  const root = await project(t, { 'app.ts': 'export const app = 1' });
  const outside = await project(t, { 'rules': '*.ts', 'external.ts': 'export const secret = 1' });
  try { await fs.symlink(path.join(outside, 'external.ts'), path.join(root, 'linked.ts'), 'file'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Sistema não permite links de arquivo'); return; } throw error; }
  let result = await new WorkspaceScanner().scan(root);
  assert(!result.files.some(file => file.path === 'linked.ts'));
  await fs.symlink(path.join(outside, 'rules'), path.join(root, '.gitignore'), 'file');
  result = await new WorkspaceScanner().scan(root);
  assert.equal(result.files.length, 0);
  assert(result.limitations.some(item => item.includes('link simbólico')));
});

test('AST extracts exports, literal dynamic imports, import-equals and class methods', () => {
  const file = record('a.ts', [
    "import fs = require('node:fs');",
    "export const loader = () => import('./lazy');",
    'export default class Example { constructor() {} run() {} handler = () => 1; }',
    'const dynamic = require(someVariable);',
    'module.exports = Example;'
  ].join('\n'));
  new TypeScriptAnalyzer().analyze(file);
  assert.deepEqual(file.imports.map(item => item.kind), ['import-equals', 'dynamic-import']);
  for (const name of ['loader', 'Example', 'Example.constructor', 'Example.run', 'Example.handler']) {
    assert(file.symbols.some(item => item.name === name), name);
  }
  assert(file.exports.some(item => item.kind === 'commonjs-export'));
});

test('inventory escapes untrusted Markdown/HTML from paths and source names', async t => {
  const root = await project(t, { 'a.ts': 'export const value = 1' });
  const result = await analyzeRepository(root, {}, active);
  const text = renderInventory('<script>[click](command:evil)</script>', new RepositoryIndex(result));
  assert(!text.includes('<script>'));
  assert(!text.includes('[click](command:evil)'));
});

test('real worker returns the same fixture inventory and exits cleanly', async () => {
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../out/analysis/worker.js'), { workerData: { root: fixture, limits: {} } });
    let snapshot;
    worker.on('message', message => {
      if (message.type === 'result') { snapshot = message.result; }
      if (message.type === 'error') { reject(new Error(message.message)); }
    });
    worker.on('error', reject);
    worker.on('exit', code => code === 0 && snapshot ? resolve(snapshot) : reject(new Error(`worker exit ${code}`)));
  });
  assert.equal(result.files.length, 6);
  assert(result.files.some(file => file.symbols.some(symbol => symbol.name === 'UserService')));
});
test('unreadable child directory is reported without stopping sibling analysis', async t => {
  const root = await project(t, { 'bad/hidden.ts': '', 'ok.ts': 'export const ok = 1' });
  const original = fs.opendir;
  fs.opendir = async function(directory, ...args) {
    if (directory === path.join(root, 'bad')) { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); }
    return original.call(this, directory, ...args);
  };
  try {
    const result = await analyzeRepository(root, {}, active);
    assert(result.errors.some(error => error.includes('bad') && error.includes('permission denied')));
    assert.equal(result.files[0].symbols[0].name, 'ok');
  } finally { fs.opendir = original; }
});

test('unreadable gitignore fails closed rather than exploring an unfiltered directory', async t => {
  const root = await project(t, { '.gitignore': 'secret.ts\n', 'secret.ts': 'secret' });
  const result = await new WorkspaceScanner().scan(root, { maxFileBytes: 3 });
  assert.equal(result.files.length, 0);
  assert(result.limitations.some(item => item.includes('não puderam ser carregadas')));
});

test('reaching the entry budget at a directory boundary still marks a partial result', async t => {
  const root = await project(t, { 'a/one.ts': '', 'z.ts': '' });
  const result = await new WorkspaceScanner().scan(root, { maxEntries: 2 });
  assert.equal(result.entriesVisited, 2);
  assert(result.limitations.some(item => item.includes('maxEntries')));
});

test('relative directory import at root resolves normalized index path', async t => {
  const root = await project(t, { 'index.ts': 'export const x=1;', 'other.ts': "import './';" });
  const index = new RepositoryIndex(await analyzeRepository(root, {}, active));
  assert.equal(index.importsFrom('other.ts')[0].target, 'index.ts');
});