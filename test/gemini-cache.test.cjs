const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {
  validateExplanation,
  EXPLANATION_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  SCHEMA_VERSION
} = require('../out/gemini/explanations');
const {
  DiskExplanationCache,
  computeCacheKey,
  computeProjectKey
} = require('../out/gemini/explanationCache');
const { orchestrateExplanations } = require('../out/gemini/explanationOrchestrator');
const { GeminiBatchRunner } = require('../out/gemini/runBatches');

const sampleExplanation = {
  module: 'src/auth',
  responsibility: 'Gerencia a autenticação e validação de tokens dos usuários de forma segura.',
  components: [
    { name: 'authenticateUser', kind: 'function', summary: 'Verifica credenciais e retorna o token de acesso.' },
    { name: 'TokenValidator', kind: 'class', summary: 'Valida a assinatura criptográfica dos tokens.' }
  ],
  relations: [
    { target: 'src/database', description: 'Consulta dados de usuários para verificação.' }
  ],
  references: [
    { path: 'src/auth/service.ts', startLine: 10, endLine: 25, note: 'Lógica central de login' }
  ],
  inferences: [
    'O sistema parece utilizar autenticação baseada em JWT com base nos nomes das funções.'
  ],
  limitations: [
    'A rotação de chaves criptográficas não foi identificada nos trechos analisados.'
  ]
};

const sampleContext = {
  module: 'src/auth',
  files: ['src/auth/service.ts'],
  fragments: [{ path: 'src/auth/service.ts', startLine: 1, endLine: 50 }]
};

test('validateExplanation: accepts valid structured response and enforces constraints', () => {
  const result = validateExplanation(JSON.stringify(sampleExplanation), sampleContext);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.explanation.module, 'src/auth');
    assert.equal(result.explanation.components.length, 2);
    assert.equal(result.explanation.relations.length, 1);
    assert.equal(result.explanation.references.length, 1);
  }
});

test('validateExplanation: rejects malformed JSON, empty responses and invalid fields', () => {
  assert.equal(validateExplanation('').valid, false);
  assert.equal(validateExplanation('{ malformed json').valid, false);
  assert.equal(validateExplanation('[]').valid, false);

  const missingResp = { ...sampleExplanation, responsibility: 'curto' };
  assert.equal(validateExplanation(missingResp, sampleContext).valid, false);

  const badModule = { ...sampleExplanation, module: 'outro/modulo' };
  assert.equal(validateExplanation(badModule, sampleContext).valid, false);

  const badKind = {
    ...sampleExplanation,
    components: [{ name: 'x', kind: 'invalid-kind', summary: 'resumo' }]
  };
  assert.equal(validateExplanation(badKind, sampleContext).valid, false);
});

test('validateExplanation: enforces references belong strictly to sent files and sent lines', () => {
  const outsideFile = {
    ...sampleExplanation,
    references: [{ path: 'src/unrelated.ts', startLine: 1, endLine: 10 }]
  };
  const res1 = validateExplanation(outsideFile, sampleContext);
  assert.equal(res1.valid, false);
  assert.match(res1.reason, /não estava presente no lote/);

  const outsideLines = {
    ...sampleExplanation,
    references: [{ path: 'src/auth/service.ts', startLine: 100, endLine: 150 }]
  };
  const res2 = validateExplanation(outsideLines, sampleContext);
  assert.equal(res2.valid, false);
  assert.match(res2.reason, /fora dos trechos de código enviados/);
});

test('computeCacheKey: deterministically changes on any code, dependency or parameter change', () => {
  const baseParams = {
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    model: 'gemini-1.5-flash',
    maxOutputTokens: 1500,
    batchPayload: JSON.stringify({ module: 'src', fragments: [] }),
    dependencyHashes: { 'lib/util.ts': 'hash-1' }
  };

  const key1 = computeCacheKey(baseParams);
  const key1Duplicate = computeCacheKey(baseParams);
  assert.equal(key1, key1Duplicate);

  // Invalidação por dependência alterada
  const keyDepChanged = computeCacheKey({
    ...baseParams,
    dependencyHashes: { 'lib/util.ts': 'hash-2-modified' }
  });
  assert.notEqual(key1, keyDepChanged);

  // Invalidação por código no lote alterado
  const keyCodeChanged = computeCacheKey({
    ...baseParams,
    batchPayload: JSON.stringify({ module: 'src', fragments: [{ code: 'new code' }] })
  });
  assert.notEqual(key1, keyCodeChanged);

  // Invalidação por modelo ou versão de prompt
  const keyModelChanged = computeCacheKey({ ...baseParams, model: 'gemini-2.0-flash' });
  assert.notEqual(key1, keyModelChanged);

  const keyPromptChanged = computeCacheKey({ ...baseParams, promptVersion: '2.0.0' });
  assert.notEqual(key1, keyPromptChanged);
});

test('DiskExplanationCache: stores validated explanation, isolates by project, and omits code', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-cache-test-'));
  try {
    const cache = new DiskExplanationCache(tmpDir);
    const projA = computeProjectKey('C:/projects/alpha');
    const projB = computeProjectKey('C:/projects/beta');
    const cacheKey = computeCacheKey({
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      model: 'gemini-1.5-flash',
      maxOutputTokens: 1500,
      batchPayload: 'payload-test',
      dependencyHashes: {}
    });

    // Inicialmente vazio
    const initial = await cache.get(projA, cacheKey);
    assert.equal(initial, undefined);

    // Salva para Projeto A
    await cache.set(projA, cacheKey, sampleExplanation);
    const storedA = await cache.get(projA, cacheKey);
    assert.deepEqual(storedA, sampleExplanation);

    // Projeto B está isolado e não vê o cache do Projeto A
    const storedB = await cache.get(projB, cacheKey);
    assert.equal(storedB, undefined);

    // Confere que o arquivo em disco não contém cópia de código
    const filePath = path.join(tmpDir, 'gemini-cache', projA, `${cacheKey}.json`);
    const rawContent = await fs.readFile(filePath, 'utf8');
    assert(!rawContent.includes('export function') && !rawContent.includes('const secret'));
    assert(rawContent.includes('authenticateUser'));

    // Limpeza de cache para projeto específico
    await cache.clear(projA);
    assert.equal(await cache.get(projA, cacheKey), undefined);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('DiskExplanationCache: handles corrupted cache safely by treating as miss and removing it', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-corrupt-test-'));
  try {
    const cache = new DiskExplanationCache(tmpDir);
    const proj = computeProjectKey('C:/projects/gamma');
    const cacheKey = 'a'.repeat(32);

    const projectDir = path.join(tmpDir, 'gemini-cache', proj);
    await fs.mkdir(projectDir, { recursive: true });
    const corruptFile = path.join(projectDir, `${cacheKey}.json`);

    // Escreve JSON quebrado
    await fs.writeFile(corruptFile, '{"broken": true, non-terminated-json');

    const result = await cache.get(proj, cacheKey);
    assert.equal(result, undefined);

    // Arquivo corrompido deve ter sido deletado
    let exists = true;
    try {
      await fs.stat(corruptFile);
    } catch {
      exists = false;
    }
    assert.equal(exists, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('DiskExplanationCache: enforces storage limit and prunes oldest entries', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-prune-test-'));
  try {
    // Limite minúsculo de 1500 bytes para testar descarte do mais antigo
    const cache = new DiskExplanationCache(tmpDir, 1500);
    const proj = computeProjectKey('C:/projects/delta');

    const key1 = '1'.repeat(32);
    const key2 = '2'.repeat(32);
    const key3 = '3'.repeat(32);

    await cache.set(proj, key1, { ...sampleExplanation, module: 'mod-1' });
    await new Promise(r => setTimeout(r, 20));
    await cache.set(proj, key2, { ...sampleExplanation, module: 'mod-2' });
    await new Promise(r => setTimeout(r, 20));
    await cache.set(proj, key3, { ...sampleExplanation, module: 'mod-3' });

    // key1 (mais antigo) deve ter sido podado para respeitar o teto
    const res1 = await cache.get(proj, key1);
    const res3 = await cache.get(proj, key3);
    assert.equal(res1, undefined);
    assert.notEqual(res3, undefined);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('orchestrateExplanations: reuses cache, regenerates only on invalidation, and resumes cleanly', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-orch-test-'));
  try {
    const cache = new DiskExplanationCache(tmpDir);
    const projectRoot = 'C:/test-project';
    const config = {
      model: 'gemini-test-model',
      maxRequests: 5,
      maxInputTokens: 5000,
      maxOutputTokens: 1000,
      requestsPerMinute: 10,
      requestsPerDay: 50,
      inputTokensPerMinute: 10000
    };

    const files = [
      {
        path: 'src/main.ts',
        hash: 'hash-main-v1',
        content: 'import { helper } from "./helper";\nexport const main = 1;',
        language: 'TypeScript',
        bytes: 50,
        imports: [{ target: 'src/helper.ts' }],
        exports: [],
        dependencies: [],
        entryPoints: [],
        errors: []
      },
      {
        path: 'src/helper.ts',
        hash: 'hash-helper-v1',
        content: 'export const helper = 2;',
        language: 'TypeScript',
        bytes: 25,
        imports: [],
        exports: [],
        dependencies: [],
        entryPoints: [],
        errors: []
      }
    ];

    const plan = {
      selectedPaths: ['src/main.ts', 'src/helper.ts'],
      batches: [
        {
          module: 'src',
          payload: JSON.stringify({
            module: 'src',
            fragments: [
              {
                path: 'src/main.ts',
                startLine: 1,
                endLine: 2,
                dependencies: ['src/helper.ts'],
                code: 'export const main = 1;'
              }
            ]
          }),
          bytes: 120,
          files: ['src/main.ts']
        }
      ],
      omissions: [],
      payloadBudgetBytes: 4000,
      reservedInputTokens: 1000,
      maxOutputTokens: 1000
    };

    const explanationText = JSON.stringify({
      module: 'src',
      responsibility: 'Responsabilidade do módulo principal de testes.',
      components: [{ name: 'main', kind: 'variable', summary: 'Constante principal.' }],
      relations: [{ target: 'src/helper.ts', description: 'Usa funções auxiliares.' }],
      references: [{ path: 'src/main.ts', startLine: 1, endLine: 2 }],
      inferences: [],
      limitations: []
    });

    let callsCount = 0;
    const runner = new GeminiBatchRunner(config, 'test-key', async (url, key, body) => {
      callsCount++;
      const op = url.pathname.endsWith(':countTokens') ? 'count' : 'generate';
      if (op === 'count') {
        return { status: 200, body: { totalTokens: 50 } };
      }
      return {
        status: 200,
        body: {
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: explanationText }] } }],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 }
        }
      };
    });

    // 1ª execução: cache vazio, faz chamadas à API
    const res1 = await orchestrateExplanations({
      projectRoot,
      plan,
      files,
      configuration: config,
      runner,
      cache
    });
    assert.equal(res1.isComplete, true);
    assert.equal(res1.cachedCount, 0);
    assert.equal(res1.generatedCount, 1);
    assert.equal(callsCount, 2); // 1 countTokens + 1 generateContent

    // 2ª execução com mesmo snapshot: reaproveita 100% do cache (zero chamadas adicionais)
    const res2 = await orchestrateExplanations({
      projectRoot,
      plan,
      files,
      configuration: config,
      runner,
      cache
    });
    assert.equal(res2.isComplete, true);
    assert.equal(res2.cachedCount, 1);
    assert.equal(res2.generatedCount, 0);
    assert.equal(callsCount, 2); // Não aumentou!

    // 3ª execução: dependência 'src/helper.ts' tem hash alterado -> invalida cache e chama API
    const modifiedFiles = [
      files[0],
      { ...files[1], hash: 'hash-helper-v2-modified' }
    ];
    const res3 = await orchestrateExplanations({
      projectRoot,
      plan,
      files: modifiedFiles,
      configuration: config,
      runner,
      cache
    });
    assert.equal(res3.isComplete, true);
    assert.equal(res3.cachedCount, 0);
    assert.equal(res3.generatedCount, 1);
    assert.equal(callsCount, 4); // Fez nova chamada devido à invalidação!
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('orchestrateExplanations: does not cache invalid responses and reports stopped failure', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-ai-bad-resp-test-'));
  try {
    const cache = new DiskExplanationCache(tmpDir);
    const projectRoot = 'C:/test-project';
    const config = {
      model: 'gemini-test-model',
      maxRequests: 5,
      maxInputTokens: 5000,
      maxOutputTokens: 1000,
      requestsPerMinute: 10,
      requestsPerDay: 50,
      inputTokensPerMinute: 10000
    };

    const plan = {
      selectedPaths: ['src/a.ts'],
      batches: [
        {
          module: 'src',
          payload: JSON.stringify({
            module: 'src',
            fragments: [{ path: 'src/a.ts', startLine: 1, endLine: 5, code: 'const a = 1;' }]
          }),
          bytes: 80,
          files: ['src/a.ts']
        }
      ],
      omissions: [],
      payloadBudgetBytes: 4000,
      reservedInputTokens: 1000,
      maxOutputTokens: 1000
    };

    // Runner retorna JSON inválido (fora do schema estruturado)
    const runner = new GeminiBatchRunner(config, 'test-key', async (url) => {
      const op = url.pathname.endsWith(':countTokens') ? 'count' : 'generate';
      if (op === 'count') { return { status: 200, body: { totalTokens: 30 } }; }
      return {
        status: 200,
        body: {
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Texto livre não JSON' }] } }]
        }
      };
    });

    const res = await orchestrateExplanations({
      projectRoot,
      plan,
      files: [],
      configuration: config,
      runner,
      cache
    });

    assert.equal(res.isComplete, false);
    assert.equal(res.stopped, 'invalid-response');
    assert.equal(res.completed.length, 0);

    // Nada deve ter sido gravado no cache
    const stats = await cache.getStats(computeProjectKey(projectRoot));
    assert.equal(stats.entryCount, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
