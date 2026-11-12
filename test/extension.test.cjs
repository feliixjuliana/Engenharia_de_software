const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function setup() {
  const commands = new Map();
  const messages = [];
  const documents = [];
  const settings = { 'gemini.model': 'gemini-test-model', 'gemini.requestsPerMinute': 2,
    'gemini.requestsPerDay': 10, 'gemini.inputTokensPerMinute': 10000 };
  const secrets = new Map([['legacyAi.gemini.apiKey', 'synthetic-test-credential']]);
  const prompts = [];
  const folder = { name: 'example', uri: { scheme: 'file', fsPath: 'C:/example' } };
  const vscode = {
    workspace: {
      workspaceFolders: [], isTrusted: true,
      getConfiguration() { return { get(key, fallback) { return settings[key] ?? fallback; } }; },
      async openTextDocument(document) { documents.push(document); return document; }
    },
    window: {
      async showInformationMessage(message) { messages.push(message); },
      async showWarningMessage(message) { messages.push(message); },
      async showInputBox(options) { prompts.push(options); return undefined; },
      async showQuickPick(items, options) { prompts.push(options); return undefined; },
      async showTextDocument() {},
      async showErrorMessage(message) { messages.push(message); },
      async withProgress(options, task) {
        return task({ report() {} }, { isCancellationRequested: false, onCancellationRequested() { return { dispose() {} }; } });
      },
      async showWorkspaceFolderPick() { return folder; }
    },
    CancellationError: class CancellationError extends Error {},
    ProgressLocation: { Notification: 15 },
    commands: { registerCommand(name, handler) { commands.set(name, handler); return { dispose() {} }; } }
  };
  const original = Module._load;
  const filename = require.resolve('../out/extension');
  delete require.cache[filename];
  delete require.cache[require.resolve('../out/gemini/setup')];
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : original.call(this, name, ...args); };
  let extension;
  try { extension = require(filename); } finally { Module._load = original; }
  const os = require('node:os');
  const context = { subscriptions: [], extensionPath: path.join(__dirname, '..'), globalStorageUri: { fsPath: path.join(os.tmpdir(), 'legacy-ai-test-ext-storage') }, secrets: {
    async get(key) { return secrets.get(key); },
    async store(key, value) { secrets.set(key, value); },
    async delete(key) { secrets.delete(key); }
  } };
  extension.activate(context);
  return { vscode, commands, messages, documents, folder, context, settings, secrets, prompts };
}

test('extension preserves commands and handles no open workspace', async () => {
  const state = setup();
  assert.equal(state.context.subscriptions.length, 7);
  await state.commands.get('legacyAi.selectWorkspace')();
  await state.commands.get('legacyAi.analyze')();
  assert.equal(state.messages.length, 2);
  assert(state.messages.every(message => message.includes('abra uma pasta')));
});

test('restricted workspace blocks analysis before filesystem work', async () => {
  const state = setup();
  state.vscode.workspace.isTrusted = false;
  await state.commands.get('legacyAi.analyze')();
  await state.commands.get('legacyAi.showInventory')();
  assert(state.messages.every(message => message.includes('workspace confiável')));
});

test('initial presentation is an unsaved Markdown document', async () => {
  const state = setup();
  await state.commands.get('legacyAi.open')();
  assert.equal(state.documents.length, 1);
  assert.equal(state.documents[0].language, 'markdown');
  assert.match(state.documents[0].content, /Etapa 3/);
});

test('multi-root selection and cancellation retain existing behavior', async () => {
  const state = setup();
  state.vscode.workspace.workspaceFolders = [state.folder, { ...state.folder, name: 'second' }];
  await state.commands.get('legacyAi.selectWorkspace')();
  assert.match(state.messages[0], /example/);
  state.vscode.window.showWorkspaceFolderPick = async () => undefined;
  await state.commands.get('legacyAi.selectWorkspace')();
  assert.equal(state.messages.length, 1);
});
const fixturePath = path.join(__dirname, 'fixtures/project');
test('analysis command runs a real worker and reopens cached inventory', async () => {
  const state = setup();
  state.folder.uri.fsPath = fixturePath;
  state.vscode.workspace.workspaceFolders = [state.folder];
  await state.commands.get('legacyAi.analyze')();
  assert.equal(state.documents.length, 1, state.messages.join('\n'));
  assert.match(state.documents[0].content, /UserService/);
  assert.match(state.documents[0].content, /Arquivos lidos e indexados: 6/);
  assert.match(state.documents[0].content, /Estado do relatório: parcial/);
  state.folder.uri.fsPath = 'nonexistent-path-not-to-be-read';
  await state.commands.get('legacyAi.showInventory')();
  assert.equal(state.documents.length, 2);
  assert.equal(state.documents[0].content, state.documents[1].content);
});

test('key commands store privately, preserve on cancellation and delete', async () => {
  const state = setup();
  state.vscode.window.showInputBox = async options => {
    assert.equal(options.password, true);
    return ' synthetic-replacement-credential ';
  };
  await state.commands.get('legacyAi.configureGeminiKey')();
  assert.equal(state.secrets.get('legacyAi.gemini.apiKey'), 'synthetic-replacement-credential');
  state.vscode.window.showInputBox = async () => undefined;
  await state.commands.get('legacyAi.configureGeminiKey')();
  assert.equal(state.secrets.get('legacyAi.gemini.apiKey'), 'synthetic-replacement-credential');
  assert(!JSON.stringify([state.messages, state.documents, state.settings]).includes('synthetic-replacement-credential'));
  await state.commands.get('legacyAi.removeGeminiKey')();
  assert.equal(state.secrets.size, 0);
});

test('fresh installation without account or key prepares context without reading credentials', async () => {
  const state = setup();
  for (const key of Object.keys(state.settings)) { delete state.settings[key]; }
  state.secrets.clear();
  let keyReads = 0;
  state.context.secrets.get = async () => { keyReads++; };
  state.folder.uri.fsPath = fixturePath;
  state.vscode.workspace.workspaceFolders = [state.folder];
  await state.commands.get('legacyAi.analyze')();
  assert.match(state.documents[0].content, /UserService/);
  assert.match(state.documents[0].content, /Estado do relatório: parcial/);
  assert.match(state.documents[0].content, /Contexto preparado localmente/);
  assert.equal(keyReads, 0);
  assert.equal(state.prompts.length, 0);
});

test('selects relevant files automatically and shows them without prompts', async () => {
  const state = setup();
  state.folder.uri.fsPath = fixturePath;
  state.vscode.workspace.workspaceFolders = [state.folder];
  state.vscode.window.showQuickPick = async () => assert.fail('Unexpected file selection prompt');
  state.vscode.window.showWarningMessage = async () => assert.fail('Unexpected confirmation');
  await state.commands.get('legacyAi.analyze')();
  assert.equal(state.documents.length, 1);
  const report = state.documents[0].content;
  assert.match(report, /Estado do relatório: parcial/);
  const selection = report.split('## Arquivos selecionados automaticamente para o Gemini')[1].split('Projeto:')[0];
  assert(selection.includes('src/index'));
  assert(selection.includes('src/user'));
  assert(!selection.includes('README'));
  assert(!selection.includes('synthetic-test-credential'));
});

test('UI cancellation terminates the worker and preserves the last completed inventory', async () => {
  const state = setup();
  state.folder.uri.fsPath = fixturePath;
  state.vscode.workspace.workspaceFolders = [state.folder];
  await state.commands.get('legacyAi.analyze')();
  const previous = state.documents[0].content;
  state.vscode.window.withProgress = async (options, task) => {
    let cancelled = false;
    const result = task({ report() {} }, {
      get isCancellationRequested() { return cancelled; },
      onCancellationRequested(handler) {
        setImmediate(() => { cancelled = true; handler(); });
        return { dispose() {} };
      }
    });
    return result;
  };
  await state.commands.get('legacyAi.analyze')();
  assert(state.messages.some(message => message.includes('análise cancelada')));
  assert.equal(state.documents.length, 1);
  await state.commands.get('legacyAi.showInventory')();
  assert.equal(state.documents[1].content, previous);
});

test('clearGeminiCache command clears storage and notifies user', async () => {
  const state = setup();
  await state.commands.get('legacyAi.clearGeminiCache')();
  assert(state.messages.some(message => message.includes('cache das explicações do Gemini foi limpo')));
});
