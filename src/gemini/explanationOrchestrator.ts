import { FileRecord } from '../analysis/models';
import { GeminiConfiguration } from './configuration';
import {
  computeCacheKey,
  computeProjectKey,
  ExplanationCache
} from './explanationCache';
import {
  EXPLANATION_SYSTEM_INSTRUCTION,
  ModuleExplanation,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  validateExplanation
} from './explanations';
import { FailureCode } from './httpClient';
import { ContextPlan } from './prepareContext';
import { GeminiBatchRunner } from './runBatches';

export interface BatchExplanationResult {
  batchIndex: number;
  module: string;
  explanation: ModuleExplanation;
  source: 'cache' | 'api';
}

export interface OrchestrationResult {
  completed: BatchExplanationResult[];
  pendingBatchIndices: number[];
  isComplete: boolean;
  stopped?: FailureCode;
  validationReason?: string;
  cachedCount: number;
  generatedCount: number;
}

interface ParsedBatchPayload {
  module: string;
  fragments: {
    path: string;
    startLine: number;
    endLine: number;
    dependencies?: string[];
  }[];
}

/** Extrai dependências e trechos do payload preparado na etapa 2. */
function parseBatchMetadata(payload: string): {
  module: string;
  fragments: { path: string; startLine: number; endLine: number }[];
  dependencyPaths: string[];
} {
  try {
    const parsed = JSON.parse(payload) as ParsedBatchPayload;
    const module = parsed.module ?? '';
    const fragments = (parsed.fragments ?? []).map(f => ({
      path: f.path,
      startLine: f.startLine,
      endLine: f.endLine
    }));
    const dependencyPaths = [
      ...new Set(
        (parsed.fragments ?? []).flatMap(f => (Array.isArray(f.dependencies) ? f.dependencies : []))
      )
    ].sort();
    return { module, fragments, dependencyPaths };
  } catch {
    return { module: '', fragments: [], dependencyPaths: [] };
  }
}

/**
 * Orquestra a obtenção de explicações para um plano de contexto:
 * 1. Verifica cache persistente para cada lote antes de qualquer requisição externa.
 * 2. Se houver lote com código ou dependência alterados, reconstrói as pendências.
 * 3. Envia apenas lotes pendentes ao Gemini, respeitando cotas e limites.
 * 4. Valida cada resposta e persiste imediatamente no cache do projeto.
 * 5. Garante que falhas ou respostas inválidas jamais sejam salvas como sucesso.
 */
export async function orchestrateExplanations(options: {
  projectRoot: string;
  plan: ContextPlan;
  files: readonly FileRecord[];
  configuration: GeminiConfiguration;
  runner: GeminiBatchRunner;
  cache: ExplanationCache;
  signal?: AbortSignal;
}): Promise<OrchestrationResult> {
  const { projectRoot, plan, files, configuration, runner, cache, signal } = options;
  const projectKey = computeProjectKey(projectRoot);
  const filesByPath = new Map(files.map(f => [f.path, f.hash]));

  const completedMap = new Map<number, BatchExplanationResult>();
  const pendingIndices: number[] = [];

  interface BatchMeta {
    index: number;
    cacheKey: string;
    module: string;
    files: string[];
    fragments: { path: string; startLine: number; endLine: number }[];
    batch: ContextPlan['batches'][number];
  }

  const batchMetas: BatchMeta[] = [];

  // Passo 1: Inspeciona cada lote, calcula sua chave de cache e verifica se já existe explicação válida
  for (let i = 0; i < plan.batches.length; i++) {
    const batch = plan.batches[i]!;
    const { module, fragments, dependencyPaths } = parseBatchMetadata(batch.payload);
    const dependencyHashes: Record<string, string> = {};
    for (const depPath of dependencyPaths) {
      const hash = filesByPath.get(depPath);
      if (hash) {
        dependencyHashes[depPath] = hash;
      }
    }

    const cacheKey = computeCacheKey({
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      model: configuration.model,
      maxOutputTokens: plan.maxOutputTokens,
      batchPayload: batch.payload,
      dependencyHashes
    });

    const meta: BatchMeta = {
      index: i,
      cacheKey,
      module: batch.module || module,
      files: batch.files,
      fragments,
      batch
    };
    batchMetas.push(meta);

    const cached = await cache.get(projectKey, cacheKey);
    if (cached) {
      completedMap.set(i, {
        batchIndex: i,
        module: meta.module,
        explanation: cached,
        source: 'cache'
      });
    } else {
      pendingIndices.push(i);
    }
  }

  // Se todos os lotes estiverem válidos no cache, conclui imediatamente sem gastar chamadas
  if (pendingIndices.length === 0) {
    const completed = Array.from(completedMap.values()).sort((a, b) => a.batchIndex - b.batchIndex);
    return {
      completed,
      pendingBatchIndices: [],
      isComplete: true,
      cachedCount: completed.length,
      generatedCount: 0
    };
  }

  // Passo 2: Executa apenas os lotes pendentes usando o runner
  const pendingBatches = pendingIndices.map(idx => batchMetas[idx]!.batch);
  const pendingPlan = {
    batches: pendingBatches,
    maxOutputTokens: plan.maxOutputTokens
  };

  const runResult = await runner.run(pendingPlan, {
    signal,
    instruction: EXPLANATION_SYSTEM_INSTRUCTION
  });
  let generatedCount = 0;
  let stoppedReason = runResult.stopped;
  let validationReason: string | undefined;

  for (const item of runResult.completed) {
    const originalIndex = pendingIndices[item.batchIndex];
    if (originalIndex === undefined) {
      continue;
    }
    const meta = batchMetas[originalIndex]!;

    const validation = validateExplanation(item.result.text, {
      module: meta.module,
      files: meta.files,
      fragments: meta.fragments
    });

    if (validation.valid) {
      // Salva no cache imediatamente após validação bem-sucedida
      await cache.set(projectKey, meta.cacheKey, validation.explanation);
      completedMap.set(originalIndex, {
        batchIndex: originalIndex,
        module: meta.module,
        explanation: validation.explanation,
        source: 'api'
      });
      generatedCount++;
    } else {
      // Resposta inválida: jamais persiste no cache e interrompe o status de conclusão
      stoppedReason = 'invalid-response';
      validationReason = validation.reason;
      break;
    }
  }

  const remainingPending: number[] = [];
  for (let i = 0; i < plan.batches.length; i++) {
    if (!completedMap.has(i)) {
      remainingPending.push(i);
    }
  }

  const completed = Array.from(completedMap.values()).sort((a, b) => a.batchIndex - b.batchIndex);

  return {
    completed,
    pendingBatchIndices: remainingPending,
    isComplete: remainingPending.length === 0,
    stopped: stoppedReason,
    validationReason,
    cachedCount: completed.length - generatedCount,
    generatedCount
  };
}
