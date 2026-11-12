import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { ModuleExplanation, validateExplanation } from './explanations';

export interface CacheKeyParams {
  promptVersion: string;
  schemaVersion: string;
  model: string;
  maxOutputTokens: number;
  batchPayload: string;
  dependencyHashes: Record<string, string>;
}

/**
 * Produz uma chave de cache SHA-256 estável e determinística.
 * A chave incorpora as versões do prompt e do esquema, o modelo, os parâmetros de geração,
 * o conteúdo exato enviado no lote e os hashes de todas as dependências relevantes do projeto.
 * Qualquer alteração nesses fatores invalida a chave e força nova geração.
 */
export function computeCacheKey(params: CacheKeyParams): string {
  const hash = createHash('sha256');
  const normalizedDependencies = Object.entries(params.dependencyHashes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, fileHash]) => `${path}:${fileHash}`);

  const canonical = JSON.stringify({
    pv: params.promptVersion,
    sv: params.schemaVersion,
    m: params.model,
    out: params.maxOutputTokens,
    p: params.batchPayload,
    d: normalizedDependencies
  });

  return hash.update(canonical, 'utf8').digest('hex');
}

/**
 * Produz um identificador seguro e isolado para a pasta do projeto.
 * Garante que caminhos diferentes (ou de projetos distintos) nunca compartilhem cache.
 */
export function computeProjectKey(projectRoot: string): string {
  const normalized = normalize(projectRoot).replace(/\\/g, '/').toLowerCase();
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

export interface CachedEntry {
  cachedAt: number;
  cacheKey: string;
  projectKey: string;
  module: string;
  explanation: ModuleExplanation;
}

export interface ExplanationCache {
  get(projectKey: string, cacheKey: string): Promise<ModuleExplanation | undefined>;
  set(projectKey: string, cacheKey: string, explanation: ModuleExplanation): Promise<void>;
  clear(projectKey?: string): Promise<void>;
  getStats(projectKey?: string): Promise<{ entryCount: number; totalBytes: number }>;
}

export const DEFAULT_MAX_CACHE_BYTES = 5 * 1024 * 1024; // 5 MiB por projeto

/**
 * Cache persistente em disco para explicações estruturadas.
 * Salva apenas os resultados validados no armazenamento local (fora do repositório).
 * Não persiste cópia de código-fonte.
 * Trata arquivos corrompidos automaticamente como ausência de resultado (cache miss) e remove-os.
 */
export class DiskExplanationCache implements ExplanationCache {
  private readonly baseDir: string;

  constructor(storageDir: string, private readonly maxBytesPerProject: number = DEFAULT_MAX_CACHE_BYTES) {
    if (!storageDir || typeof storageDir !== 'string') {
      throw new TypeError('Diretório de armazenamento do cache é obrigatório.');
    }
    this.baseDir = join(storageDir, 'gemini-cache');
  }

  private projectDir(projectKey: string): string {
    if (!/^[a-f0-9]{8,64}$/.test(projectKey)) {
      throw new RangeError(`projectKey inválido: "${projectKey}".`);
    }
    return join(this.baseDir, projectKey);
  }

  private entryPath(projectKey: string, cacheKey: string): string {
    if (!/^[a-f0-9]{16,64}$/.test(cacheKey)) {
      throw new RangeError(`cacheKey inválido: "${cacheKey}".`);
    }
    return join(this.projectDir(projectKey), `${cacheKey}.json`);
  }

  async get(projectKey: string, cacheKey: string): Promise<ModuleExplanation | undefined> {
    const file = this.entryPath(projectKey, cacheKey);
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      return undefined;
    }

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || parsed.cacheKey !== cacheKey) {
        throw new Error('Metadados de cache inconsistentes.');
      }
      const validation = validateExplanation(parsed.explanation);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }
      return validation.explanation;
    } catch {
      // Trata corrupção como ausência de resultado e limpa o arquivo inválido
      await rm(file, { force: true }).catch(() => {});
      return undefined;
    }
  }

  async set(projectKey: string, cacheKey: string, explanation: ModuleExplanation): Promise<void> {
    const validation = validateExplanation(explanation);
    if (!validation.valid) {
      throw new Error(`Tentativa de persistir explicação inválida no cache: ${validation.reason}`);
    }

    const dir = this.projectDir(projectKey);
    await mkdir(dir, { recursive: true });

    const entry: CachedEntry = {
      cachedAt: Date.now(),
      cacheKey,
      projectKey,
      module: explanation.module,
      explanation: validation.explanation
    };

    const file = this.entryPath(projectKey, cacheKey);
    const serialized = JSON.stringify(entry, null, 2);
    await writeFile(file, serialized, 'utf8');

    await this.enforceBudget(dir);
  }

  async clear(projectKey?: string): Promise<void> {
    const target = projectKey ? this.projectDir(projectKey) : this.baseDir;
    await rm(target, { recursive: true, force: true }).catch(() => {});
  }

  async getStats(projectKey?: string): Promise<{ entryCount: number; totalBytes: number }> {
    const dir = projectKey ? this.projectDir(projectKey) : this.baseDir;
    let entryCount = 0;
    let totalBytes = 0;

    const countDir = async (path: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await readdir(path);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(path, name);
        try {
          const info = await stat(full);
          if (info.isDirectory()) {
            await countDir(full);
          } else if (name.endsWith('.json')) {
            entryCount++;
            totalBytes += info.size;
          }
        } catch {}
      }
    };

    await countDir(dir);
    return { entryCount, totalBytes };
  }

  private async enforceBudget(dir: string): Promise<void> {
    let files: { name: string; size: number; mtime: number }[];
    try {
      const names = await readdir(dir);
      files = await Promise.all(
        names.filter(n => n.endsWith('.json')).map(async name => {
          const s = await stat(join(dir, name));
          return { name, size: s.size, mtime: s.mtimeMs };
        })
      );
    } catch {
      return;
    }

    let total = files.reduce((acc, f) => acc + f.size, 0);
    if (total <= this.maxBytesPerProject) {
      return;
    }

    // Ordena do mais antigo para o mais recente (LRU baseado em mtime)
    files.sort((a, b) => a.mtime - b.mtime);
    for (const f of files) {
      if (total <= this.maxBytesPerProject * 0.8) {
        break;
      }
      try {
        await rm(join(dir, f.name), { force: true });
        total -= f.size;
      } catch {}
    }
  }
}
