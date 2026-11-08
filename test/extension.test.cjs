const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function setup() {
  const commands = new Map();
  const messages = [];
  const documents = [];
  const folder = { name: 'example', uri: { scheme: 'file', fsPath: 'C:/example' } };
  const vscode = {
    workspace: {
      workspaceFolders: [], isTrusted: true,
      getConfiguration() { return { get(key, fallback) { return fallback; } }; },
      async openTextDocument(document) { documents.push(document); return document; }
    },
    window: {
      async showInformationMessage(message) { messages.push(message); },
      async showWarningMessage(message) { messages.push(message); },
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
  Module._load = function(name, ...args) { return name === 'vscode' ? vscode : original.call(this, name, ...args); };
  let extension;
  try { extension = require(filename); } finally { Module._load = original; }
  const context = { subscriptions: [], extensionPath: path.join(__dirname, '..') };
  extension.activate(context);
  return { vscode, commands, messages, documents, folder, context };
}

test('extension preserves commands and handles no open workspace', async () => {
  const state = setup();
  assert.equal(state.context.subscriptions.length, 4);
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
  state.folder.uri.fsPath = 'nonexistent-path-not-to-be-read';
  await state.commands.get('legacyAi.showInventory')();
  assert.equal(state.documents.length, 2);
  assert.equal(state.documents[0].content, state.documents[1].content);
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