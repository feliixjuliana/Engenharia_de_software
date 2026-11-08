import * as path from 'node:path';
import { FileRecord, ModuleReference, ScanResult, SourceSymbol } from './models';

/** One analysis snapshot; queries never read the filesystem. */
export class RepositoryIndex {
  private readonly byPath: Map<string, FileRecord>;
  constructor(readonly snapshot: ScanResult) {
    this.byPath = new Map(snapshot.files.map(file => [file.path, file]));
    for (const file of snapshot.files) {
      for (const reference of file.imports) { this.resolve(file.path, reference); }
    }
  }
  get files(): readonly FileRecord[] { return this.snapshot.files; }
  getFile(relativePath: string): FileRecord | undefined { return this.byPath.get(relativePath); }
  findSymbols(name: string): SourceSymbol[] {
    const term = name.toLowerCase();
    return this.snapshot.files.flatMap(file => file.symbols.filter(symbol => symbol.name.toLowerCase().includes(term)));
  }
  importsFrom(relativePath: string): readonly ModuleReference[] { return this.byPath.get(relativePath)?.imports ?? []; }
  dependentsOf(relativePath: string): string[] {
    return this.snapshot.files.filter(file => file.imports.some(item => item.target === relativePath)).map(file => file.path);
  }
  private resolve(from: string, reference: ModuleReference): void {
    if (!reference.specifier.startsWith('.')) {
      reference.status = reference.specifier.startsWith('/') || /^[A-Za-z]:/.test(reference.specifier)
        ? 'outside-root' : reference.specifier.startsWith('#') || reference.specifier.startsWith('@/')
          ? 'unresolved' : 'external';
      return;
    }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), reference.specifier));
    if (base === '..' || base.startsWith('../') || reference.specifier.includes('\\')) { reference.status = 'outside-root'; return; }
    const candidates = [base];
    if (/\.[cm]?jsx?$/.test(base)) {
      const prefix = base.replace(/\.[cm]?jsx?$/, '');
      candidates.push(...(/\.mjs$/.test(base) ? [prefix + '.mts'] : /\.cjs$/.test(base)
        ? [prefix + '.cts'] : [prefix + '.ts', prefix + '.tsx']));
    }
    if (!path.posix.extname(base)) {
      for (const extension of ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json']) {
        candidates.push(base + extension, `${base}/index${extension}`);
      }
    }
    const matches = [...new Set(candidates.map(candidate => path.posix.normalize(candidate)).filter(candidate => this.byPath.has(candidate)))];
    if (matches.length === 1) { reference.target = matches[0]; reference.status = 'resolved'; }
    else { reference.status = 'unresolved'; }
  }
}