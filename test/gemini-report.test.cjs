const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { renderInventory, safe } = require('../out/analysis/renderInventory');
const { RepositoryIndex } = require('../out/analysis/repositoryIndex');

function makeIndex() {
  return new RepositoryIndex({
    root: 'C:/projects/sample',
    files: [
      {
        path: 'src/app.ts',
        language: 'TypeScript',
        bytes: 100,
        hash: 'hash-app',
        content: 'export const app = 1;',
        symbols: [{ path: 'src/app.ts', startLine: 1, endLine: 1, name: 'app', kind: 'variable' }],
        imports: [],
        exports: [{ path: 'src/app.ts', startLine: 1, endLine: 1, name: 'app', kind: 'variable' }],
        dependencies: [],
        entryPoints: [{ path: 'src/app.ts', startLine: 1, endLine: 1, value: 'app', reason: 'main entry' }],
        errors: []
      }
    ],
    ignored: [],
    errors: [],
    limitations: [],
    cancelled: false,
    entriesVisited: 1,
    bytesRead: 100,
    limits: {
      maxFiles: 100,
      maxFileBytes: 10000,
      maxTotalBytes: 50000,
      maxEntries: 500,
      maxDepth: 10
    }
  });
}

const sampleExplanation = {
  module: 'src',
  responsibility: 'Inicializa os serviços principais da aplicação e define o ponto de partida do fluxo.',
  components: [
    { name: 'app', kind: 'variable', summary: 'Instância singleton da aplicação.' }
  ],
  relations: [
    { target: 'src/config', description: 'Carrega configurações globais.' }
  ],
  references: [
    { path: 'src/app.ts', startLine: 1, endLine: 1, note: 'Definição da instância principal' }
  ],
  inferences: [
    'O projeto adota inicialização estática dos módulos.'
  ],
  limitations: [
    'Não foram encontrados testes automatizados para este arquivo.'
  ]
};

const samplePlan = {
  selectedPaths: ['src/app.ts'],
  batches: [
    {
      module: 'src',
      payload: JSON.stringify({ module: 'src', fragments: [] }),
      bytes: 80,
      files: ['src/app.ts']
    }
  ],
  omissions: [],
  payloadBudgetBytes: 4000,
  reservedInputTokens: 1000,
  maxOutputTokens: 1000
};

test('renderInventory: renders complete report when all modules are explained', () => {
  const index = makeIndex();
  const md = renderInventory('SampleApp', index, samplePlan, {
    status: 'complete',
    model: 'gemini-1.5-flash',
    totalModules: 1,
    explainedModules: 1,
    explanations: [
      {
        module: 'src',
        explanation: sampleExplanation,
        source: 'api'
      }
    ],
    pendingModules: []
  });

  // Estado completo
  assert.match(md, /Estado do relatório: completo — inventário técnico e explicações do Gemini concluídos/);

  // Seção "Entendendo o projeto"
  assert.match(md, /## Entendendo o projeto/);
  assert.match(md, /Cobertura das explicações: 1 de 1 módulo\(s\) explicados \(100%\)/);
  assert.match(md, /Modelo utilizado: gemini/);
  assert.match(md, /### Módulo src/);
  assert.match(md, /API do Gemini \(gerado nesta execução\)/);
  assert.match(md, /Inicializa os serviços principais/);
  assert.match(md, /Instância singleton da aplicação/);
  assert.match(md, /Carrega configurações globais/);
  assert.match(md, /src\/app.*:1–1 — Definição da instância principal/);
  assert.match(md, /O projeto adota inicialização estática/);
  assert.match(md, /Não foram encontrados testes automatizados/);

  // Seções preexistentes do inventário técnico preservadas
  assert.match(md, /## Estrutura de diretórios e arquivos/);
  assert.match(md, /## Símbolos: classes, interfaces, funções e demais declarações/);
  assert.match(md, /## Exports/);
  assert.match(md, /## Limitações/);
});

test('renderInventory: renders partial report with pending modules and reasons', () => {
  const index = makeIndex();
  const md = renderInventory('SampleApp', index, samplePlan, {
    status: 'partial',
    statusMessage: 'Cota diária de requisições da conta esgotada.',
    model: 'gemini-1.5-flash',
    totalModules: 2,
    explainedModules: 1,
    explanations: [
      {
        module: 'src',
        explanation: sampleExplanation,
        source: 'cache'
      }
    ],
    pendingModules: [
      {
        module: 'lib/util',
        reason: 'Cota diária de requisições esgotada.'
      }
    ]
  });

  assert.match(md, /Estado do relatório: parcial — Cota diária de requisições da conta esgotada/);
  assert.match(md, /Cobertura das explicações: 1 de 2 módulo\(s\) explicados \(50%\)/);
  assert.match(md, /cache local \(recuperado do armazenamento seguro\)/);
  assert.match(md, /### Módulos pendentes/);
  assert.match(md, /Módulo lib\/util — Cota diária de requisições esgotada/);
});

test('renderInventory: handles cancelled and failed states gracefully', () => {
  const index = makeIndex();
  const mdCancelled = renderInventory('SampleApp', index, samplePlan, {
    status: 'cancelled',
    totalModules: 1,
    explainedModules: 0,
    explanations: [],
    pendingModules: [{ module: 'src', reason: 'Operação cancelada pelo usuário.' }]
  });
  assert.match(mdCancelled, /Estado do relatório: parcial — análise cancelada pelo usuário/);

  const mdFailed = renderInventory('SampleApp', index, samplePlan, {
    status: 'failed',
    statusMessage: 'Instabilidade temporária na API do Gemini',
    totalModules: 1,
    explainedModules: 0,
    explanations: [],
    pendingModules: [{ module: 'src', reason: 'Falha temporária' }]
  });
  assert.match(mdFailed, /Estado do relatório: parcial — falha na obtenção das explicações do Gemini/);
});

test('renderInventory: strictly escapes adversarial content from model responses', () => {
  const adversarialExplanation = {
    module: 'src/hack',
    responsibility: '<script>alert("pwned")</script> [Clique aqui](https://malicious.site) `rm -rf /`',
    components: [
      {
        name: '<img src=x onerror=alert(1)>',
        kind: 'other',
        summary: 'Injeção de tag <iframe src="evil.html"> e [link](javascript:void(0))'
      }
    ],
    relations: [
      {
        target: '<a href="http://phishing.com">banco</a>',
        description: 'Tenta quebrar formato # Título Fake \n---\n**negrito**'
      }
    ],
    references: [
      {
        path: 'src/hack.ts',
        startLine: 1,
        endLine: 5,
        note: '<script>evil()</script>'
      }
    ],
    inferences: [
      '<svg/onload=alert(2)> inferência maliciosa'
    ],
    limitations: [
      '<b>HTML não permitido</b>'
    ]
  };

  const index = makeIndex();
  const md = renderInventory('SampleApp', index, samplePlan, {
    status: 'complete',
    model: 'gemini-adversarial',
    totalModules: 1,
    explainedModules: 1,
    explanations: [{ module: 'src/hack', explanation: adversarialExplanation, source: 'api' }],
    pendingModules: []
  });

  // Nenhuma tag HTML crua deve existir
  assert(!md.includes('<script>'));
  assert(!md.includes('</script>'));
  assert(!md.includes('<img'));
  assert(!md.includes('<iframe'));
  assert(!md.includes('<svg'));
  assert(!md.includes('<b>'));

  // Entidades HTML escapadas
  assert(md.includes('&lt;script&gt;'));
  assert(md.includes('&lt;img'));
  assert(md.includes('&lt;iframe'));
  assert(md.includes('&lt;svg'));
  assert(md.includes('&lt;b&gt;'));

  // Links markdown arbitrários devem ter colchetes e parênteses escapados para não serem clicáveis
  assert(!md.includes('[Clique aqui](https://malicious.site)'));
  assert(md.includes('\\[Clique aqui\\]\\(https://malicious\\.site\\)'));
  assert(!md.includes('[link](javascript:void(0))'));
  assert(md.includes('\\[link\\]\\(javascript:void\\(0\\)\\)'));
});

test('extension: end-to-end integration produces complete report when Gemini succeeds', async () => {
  const commands = new Map();
  const messages = [];
  const documents = [];
  const settings = {
    'gemini.model': 'gemini-1.5-flash',
    'gemini.requestsPerMinute': 5,
    'gemini.requestsPerDay': 20,
    'gemini.inputTokensPerMinute': 50000,
    'gemini.maxRequests': 5,
    'gemini.maxInputTokens': 8000,
    'gemini.maxOutputTokens': 1500
  };
  const secrets = new Map([['legacyAi.gemini.apiKey', 'real-mocked-key']]);
  const fixturePath = path.join(__dirname, 'fixtures/project');
  const folder = { name: 'project', uri: { scheme: 'file', fsPath: fixturePath } };

  const vscode = {
    workspace: {
      workspaceFolders: [folder],
      isTrusted: true,
      getConfiguration() { return { get(key, fallback) { return settings[key] ?? fallback; } }; },
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

  const os = require('node:os');
  const fsPromises = require('node:fs/promises');
  const tmpStorage = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-integ-'));

  const context = {
    subscriptions: [],
    extensionPath: path.join(__dirname, '..'),
    globalStorageUri: { fsPath: tmpStorage },
    secrets: {
      async get(key) { return secrets.get(key); },
      async store(key, value) { secrets.set(key, value); },
      async delete(key) { secrets.delete(key); }
    }
  };

  // Configura transporte simulado que responde com explicação válida para qualquer lote
  extension.setGeminiTransportForTesting(async (url, key, body) => {
    const op = url.pathname.endsWith(':countTokens') ? 'count' : 'generate';
    if (op === 'count') {
      return { status: 200, body: { totalTokens: 40 } };
    }
    const parsedBody = JSON.parse(body);
    const textContent = parsedBody.contents?.[0]?.parts?.[0]?.text ?? '{}';
    let moduleName = 'src';
    try {
      moduleName = JSON.parse(textContent).module ?? 'src';
    } catch {}

    const explanationObj = {
      module: moduleName,
      responsibility: `Responsabilidade explicada com sucesso para o módulo ${moduleName}.`,
      components: [{ name: 'mainService', kind: 'function', summary: 'Função operacional central.' }],
      relations: [],
      references: [],
      inferences: [],
      limitations: []
    };

    return {
      status: 200,
      body: {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(explanationObj) }] } }],
        usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 15 }
      }
    };
  });

  extension.activate(context);

  try {
    await commands.get('legacyAi.analyze')();
    assert.equal(documents.length, 1);
    const report = documents[0].content;

    // Verifica que o relatório integrado foi gerado como completo!
    assert.match(report, /Estado do relatório: completo — inventário técnico e explicações do Gemini concluídos/);
    assert.match(report, /## Entendendo o projeto/);
    assert.match(report, /Responsabilidade explicada com sucesso/);
    assert.match(report, /mainService/);
  } finally {
    extension.setGeminiTransportForTesting(undefined);
    await fsPromises.rm(tmpStorage, { recursive: true, force: true });
  }
});
