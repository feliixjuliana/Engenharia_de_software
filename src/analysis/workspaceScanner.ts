import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import ignore = require('ignore');
import { Ignore } from 'ignore';
import { Cancellation, defaultLimits, ScanLimits, ScanResult } from './models';

const excludedDirectories = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt',
  '.cache', '.turbo', '.vscode', '.idea', 'vendor'
]);
const generated = /(?:\.min\.(?:js|css)$|\.map$|\.d\.[cm]?ts$|^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$)/i;
const sensitive = /(?:^\.env(?:\.|$)|^\.(?:npmrc|pypirc|netrc)$|\.(?:pem|key|p12|pfx|keystore)$|^(?:credentials|secrets?)(?:\.|$)|^id_(?:rsa|ed25519))/i;
function language(file: string): string | undefined {
  if (/\.(?:ts|tsx|mts|cts)$/i.test(file)) { return 'TypeScript'; }
  if (/\.(?:js|jsx|mjs|cjs)$/i.test(file)) { return 'JavaScript'; }
  if (/\.json$/i.test(file)) { return 'JSON'; }
  if (/\.(?:md|mdx|rst|txt)$/i.test(file) || /^(?:README|LICENSE|CHANGELOG)$/i.test(file)) { return 'Documentation'; }
  return undefined;
}
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
interface IgnoreScope { base: string; rules: Ignore }

/** Local, read-only traversal. No project code, config plugins or scripts are loaded. */
export class WorkspaceScanner {
  async scan(rootPath: string, overrides: Partial<ScanLimits> = {},
    token: Cancellation = { isCancellationRequested: false },
    progress: (message: string) => void = () => undefined): Promise<ScanResult> {
    const limits = { ...defaultLimits, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > ({ maxFiles: 10000, maxFileBytes: 4194304, maxTotalBytes: 67108864, maxEntries: 100000, maxDepth: 128 } as Record<string, number>)[name]!) { throw new Error(`Limite inválido: ${name}`); }
    }
    const root = path.resolve(rootPath);
    const result: ScanResult = {
      root, files: [], ignored: [], errors: [], limitations: [], cancelled: false,
      entriesVisited: 0, bytesRead: 0, limits
    };
    const rootStat = await fs.lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) { throw new Error('A raiz precisa ser um diretório real, sem link simbólico.'); }
    const canonicalRoot = await fs.realpath(root);
    // Reject a selected folder reached through a symlink/junction in an ancestor too.
    if (path.relative(root, canonicalRoot) !== '') { throw new Error('O caminho da raiz contém um link simbólico ou junction.'); }
    const addLimit = (message: string): void => {
      if (!result.limitations.includes(message)) { result.limitations.push(message); }
    };
    const checkCancelled = (): boolean => {
      if (token.isCancellationRequested) { result.cancelled = true; return true; }
      return false;
    };
    const securePath = async (relative: string): Promise<string> => {
      const absolute = path.resolve(root, relative);
      if (!inside(root, absolute)) { throw new Error('Caminho fora da raiz'); }
      let current = root;
      for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink()) { throw new Error('Link simbólico ou junction bloqueado'); }
      }
      if (!inside(canonicalRoot, await fs.realpath(absolute))) { throw new Error('Destino fora da raiz'); }
      return absolute;
    };
    const readText = async (relative: string): Promise<{ content: string; bytes: number } | undefined> => {
      const absolute = await securePath(relative);
      const stat = await fs.lstat(absolute);
      if (!stat.isFile()) { throw new Error('Não é arquivo regular'); }
      if (stat.size > limits.maxFileBytes) {
        result.ignored.push({ path: relative, reason: 'Limite de tamanho por arquivo' });
        addLimit('Há arquivos acima de maxFileBytes.'); return undefined;
      }
      if (result.bytesRead + stat.size > limits.maxTotalBytes) {
        result.ignored.push({ path: relative, reason: 'Limite total de bytes' });
        addLimit('Limite maxTotalBytes atingido.'); return undefined;
      }
      // Bounded read even if the file grows between stat and read.
      const handle = await fs.open(absolute, 'r');
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) { throw new Error('Arquivo alterado durante a leitura'); }
        await securePath(relative);
        const checked = await fs.lstat(absolute);
        if (checked.isSymbolicLink() || checked.dev !== opened.dev || checked.ino !== opened.ino) { throw new Error('Caminho alterado durante a abertura'); }
        const capacity = Math.min(limits.maxFileBytes, limits.maxTotalBytes - result.bytesRead);
        const buffer = Buffer.alloc(capacity + 1);
        let count = 0;
        while (count < buffer.length) {
          if (checkCancelled()) { return undefined; }
          const chunk = await handle.read(buffer, count, buffer.length - count, null);
          if (!chunk.bytesRead) { break; }
          count += chunk.bytesRead;
        }
        result.bytesRead += count;
        if (count > capacity) {
          result.ignored.push({ path: relative, reason: 'Arquivo cresceu além do orçamento durante a leitura' });
          addLimit('Arquivo alterado durante a análise; orçamento excedido em no máximo um byte.'); return undefined;
        }
        const bytes = buffer.subarray(0, count);
        if (bytes.some(value => value === 0 || (value < 9) || (value > 13 && value < 32))) {
          result.ignored.push({ path: relative, reason: 'Conteúdo binário' }); return undefined;
        }
        try { return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes: count }; }
        catch { result.ignored.push({ path: relative, reason: 'Codificação inválida: esperado UTF-8' }); return undefined; }
      } finally { await handle.close(); }
    };
    const walk = async (directory: string, scopes: IgnoreScope[], depth: number): Promise<void> => {
      if (checkCancelled()) { return; }
      try {
        const absolute = await securePath(directory);
        const entries = await fs.opendir(absolute);
        // Load this directory's rules before examining its children.
        let localScopes = scopes;
        const ignorePath = directory ? `${directory}/.gitignore` : '.gitignore';
        try {
          const ignoreAbsolute = path.join(absolute, '.gitignore');
          const ignoreStat = await fs.lstat(ignoreAbsolute);
          if (ignoreStat.isSymbolicLink()) {
            result.ignored.push({ path: ignorePath, reason: 'Link simbólico nas regras de exclusão; diretório não explorado' });
            addLimit('Diretório não explorado por regras .gitignore em link simbólico.');
            await entries.close(); return;
          }
          if (ignoreStat.isFile()) {
            const text = await readText(ignorePath);
            if (text) { localScopes = [...scopes, { base: directory, rules: ignore().add(text.content) }]; }
            else { addLimit(`Regras de ${ignorePath} não puderam ser carregadas; diretório não explorado.`); }
            if (!text) { await entries.close(); return; }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            result.errors.push(`${ignorePath}: ${String(error)}`);
            addLimit(`Diretório ${directory || '.'} não explorado por falha ao ler regras de exclusão.`);
            await entries.close(); return;
          }
        }
        for await (const entry of entries) {
          if (checkCancelled()) { break; }
          if (result.entriesVisited >= limits.maxEntries) { addLimit('Limite maxEntries atingido; inventário parcial.'); break; }
          result.entriesVisited++;
          const relative = directory ? `${directory}/${entry.name}` : entry.name;
          progress(relative);
          if (entry.isSymbolicLink()) { result.ignored.push({ path: relative, reason: 'Link simbólico ou junction' }); continue; }
          const isDirectory = entry.isDirectory();
          if (sensitive.test(entry.name) || (isDirectory && /^(?:\.ssh|\.aws|\.azure|secrets?|credentials)$/i.test(entry.name))) {
            result.ignored.push({ path: relative, reason: 'Arquivo ou diretório potencialmente sensível' }); continue;
          }
          if (isDirectory && excludedDirectories.has(entry.name.toLowerCase())) {
            result.ignored.push({ path: relative, reason: 'Diretório de dependências, gerado ou interno' }); continue;
          }
          let ignored = false;
          for (const scope of localScopes) {
            const scopeRelative = scope.base ? relative.slice(scope.base.length + 1) : relative;
            const match = scope.rules.test(scopeRelative + (isDirectory ? '/' : ''));
            if (match.ignored) { ignored = true; }
            else if (match.unignored) { ignored = false; }
          }
          if (ignored) { result.ignored.push({ path: relative, reason: 'Regra .gitignore' }); continue; }
          if (isDirectory) {
            if (depth >= limits.maxDepth) {
              result.ignored.push({ path: relative, reason: 'Limite de profundidade' }); addLimit('Limite maxDepth atingido.');
            } else { await walk(relative, localScopes, depth + 1); }
            if (result.entriesVisited >= limits.maxEntries) { addLimit('Limite maxEntries atingido; inventário parcial.'); break; }
            if (checkCancelled()) { break; }
            continue;
          }
          if (!entry.isFile()) { result.ignored.push({ path: relative, reason: 'Tipo de arquivo não suportado' }); continue; }
          if (entry.name === '.gitignore') { result.ignored.push({ path: relative, reason: 'Arquivo de regras aplicado ao scanner' }); continue; }
          if (generated.test(entry.name)) { result.ignored.push({ path: relative, reason: 'Arquivo gerado ou lockfile' }); continue; }
          const detected = language(entry.name);
          if (!detected) { result.ignored.push({ path: relative, reason: 'Extensão fora do escopo' }); continue; }
          if (result.files.length >= limits.maxFiles) {
            result.ignored.push({ path: relative, reason: 'Limite de quantidade de arquivos' }); addLimit('Limite maxFiles atingido.'); continue;
          }
          try {
            const text = await readText(relative);
            if (!text) { continue; }
            if (/^\s*(?:\/\*|\/\/|<!--)[\s\S]{0,500}?(?:@generated|auto-generated|automatically generated|do not edit)/i.test(text.content)) {
              result.ignored.push({ path: relative, reason: 'Cabeçalho de arquivo gerado' }); continue;
            }
            result.files.push({ path: relative, language: detected, bytes: text.bytes,
              hash: createHash('sha256').update(text.content).digest('hex'), content: text.content,
              symbols: [], imports: [], exports: [], dependencies: [], entryPoints: [], errors: [] });
          } catch (error) { result.errors.push(`${relative}: ${String(error)}`); }
        }
      } catch (error) { result.errors.push(`${directory || '.'}: ${String(error)}`); }
    };
    await walk('', [], 0);
    checkCancelled();
    if (result.cancelled) { addLimit('Análise cancelada; inventário parcial.'); }
    result.files.sort((a, b) => a.path.localeCompare(b.path));
    return result;
  }
}