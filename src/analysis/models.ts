export interface Cancellation { readonly isCancellationRequested: boolean }
export interface ScanLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
  maxDepth: number;
}
export const defaultLimits: ScanLimits = {
  maxFiles: 2000, maxFileBytes: 262144, maxTotalBytes: 16777216,
  maxEntries: 20000, maxDepth: 32
};
export interface SourcePosition { path: string; startLine: number; endLine: number }
export interface SourceSymbol extends SourcePosition { name: string; kind: string }
export interface ModuleReference extends SourcePosition {
  specifier: string;
  kind: string;
  target?: string;
  status?: 'resolved' | 'external' | 'unresolved' | 'outside-root';
}
export interface Dependency extends SourcePosition { name: string; version: string; group: string }
export interface EntryPoint extends SourcePosition { value: string; reason: string }
export interface FileRecord {
  path: string; language: string; bytes: number; hash: string; content: string;
  symbols: SourceSymbol[]; imports: ModuleReference[]; exports: SourceSymbol[];
  dependencies: Dependency[]; entryPoints: EntryPoint[]; errors: string[];
}
export interface ScanResult {
  root: string; files: FileRecord[];
  ignored: { path: string; reason: string }[];
  errors: string[]; limitations: string[]; cancelled: boolean;
  entriesVisited: number; bytesRead: number; limits: ScanLimits;
}