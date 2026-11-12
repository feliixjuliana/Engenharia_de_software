import { FileRecord } from '../analysis/models';

const sensitiveName = /(?:^|\/)(?:\.env(?:\.|$)|\.(?:npmrc|pypirc|netrc)$|(?:credentials|secrets?)(?:\.|\/|$)|id_(?:rsa|ed25519)(?:\.|$))|\.(?:pem|key|p12|pfx|keystore)$/i;
const sensitiveContent = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bAIza[0-9A-Za-z_-]{35}\b|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|\b(?:api[_-]?key|password|passwd|secret|access[_-]?token|authorization)\b["']?\s*[:=]\s*["'][^"'\r\n]+["']/i;

/** Extra filtering for external disclosure; not a guarantee that content has no secrets or personal data. */
export function canAuthorizeFile(file: Pick<FileRecord, 'path' | 'content'>): boolean {
  const parts = file.path.split('/');
  return file.path.length > 0 && !/[\\:\x00-\x1f\x7f]/.test(file.path)
    && parts.every(part => part !== '' && part !== '.' && part !== '..')
    && !sensitiveName.test(file.path) && !sensitiveContent.test(file.content);
}

/** Rank code from the current snapshot before the context preparation stage. */
export function selectRelevantFiles(files: readonly FileRecord[]): string[] {
  const candidates = files.filter(file =>
    (file.language === 'JavaScript' || file.language === 'TypeScript') && canAuthorizeFile(file));
  const incoming = new Map<string, number>();
  for (const file of candidates) {
    const targets = new Set(file.imports.map(reference => reference.target));
    for (const target of targets) {
      if (target && target !== file.path) { incoming.set(target, (incoming.get(target) ?? 0) + 1); }
    }
  }
  return candidates.sort((left, right) =>
    Number(right.entryPoints.length > 0) - Number(left.entryPoints.length > 0)
    || (incoming.get(right.path) ?? 0) - (incoming.get(left.path) ?? 0)
    || right.exports.length - left.exports.length
    || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  ).slice(0, 20).map(file => file.path);
}
