import { posix } from 'node:path';
import * as ts from 'typescript';
import { FileRecord } from '../analysis/models';
import { selectRelevantFiles } from './authorization';

interface Omission {
  path: string;
  startLine?: number;
  endLine?: number;
  reason: string;
}

interface Fragment {
  path: string;
  startLine: number;
  endLine: number;
  completeFile: boolean;
  code: string;
  dependencies: string[];
  importsOutsideSelection: number;
  unresolvedImports: number;
}

export interface ContextPlan {
  selectedPaths: string[];
  batches: { module: string; payload: string; bytes: number; files: string[] }[];
  omissions: Omission[];
  payloadBudgetBytes: number;
  reservedInputTokens: number;
  maxOutputTokens: number;
}

function groupFiles(files: FileRecord[]): Map<string, FileRecord[]> {
  const byPath = new Map(files.map(file => [file.path, file]));
  const groups = new Map<string, FileRecord[]>();
  const visited = new Set<string>();
  const visit = (file: FileRecord, directory: string, group: FileRecord[]): void => {
    if (visited.has(file.path)) { return; }
    visited.add(file.path);
    group.push(file);
    const targets = [...new Set(file.imports.map(reference => reference.target))].sort();
    for (const target of targets) {
      const dependency = target && byPath.get(target);
      if (dependency && posix.dirname(dependency.path) === directory) { visit(dependency, directory, group); }
    }
  };
  for (const file of files) {
    const directory = posix.dirname(file.path);
    const group = groups.get(directory) ?? [];
    groups.set(directory, group);
    visit(file, directory, group);
  }
  return groups;
}

/** Prepares standalone payloads from the local snapshot. Byte budgeting is a proxy for input tokens. */
export function prepareContext(files: readonly FileRecord[], maxInputTokens: number, maxOutputTokens: number): ContextPlan {
  if (![maxInputTokens, maxOutputTokens].every(limit => Number.isSafeInteger(limit) && limit > 0)) {
    throw new RangeError('Os orçamentos do contexto devem ser inteiros positivos.');
  }
  const reservedInputTokens = Math.min(1024, Math.ceil(maxInputTokens / 4));
  const payloadBudgetBytes = maxInputTokens - reservedInputTokens;
  const selectedPaths = selectRelevantFiles(files);
  const byPath = new Map(files.map(file => [file.path, file]));
  const selected = selectedPaths.map(file => byPath.get(file)!);
  const scope = new Set(selectedPaths);
  const plan: ContextPlan = { selectedPaths, batches: [], omissions: [], payloadBudgetBytes,
    reservedInputTokens, maxOutputTokens };
  for (const [module, group] of groupFiles(selected)) {
    const prefix = `{"module":${JSON.stringify(module)},"fragments":[`;
    const suffix = ']}';
    const overhead = Buffer.byteLength(prefix + suffix);
    let bytes = overhead;
    let fragments: string[] = [];
    let batchFiles = new Set<string>();
    const flush = (): void => {
      if (!fragments.length) { return; }
      plan.batches.push({ module, payload: prefix + fragments.join(',') + suffix, bytes, files: [...batchFiles] });
      fragments = [];
      batchFiles = new Set<string>();
      bytes = overhead;
    };
    const add = (fragment: Fragment): boolean => {
      const json = JSON.stringify(fragment);
      const size = Buffer.byteLength(json);
      if (overhead + size > payloadBudgetBytes) { return false; }
      if (bytes + size + Number(fragments.length > 0) > payloadBudgetBytes) { flush(); }
      bytes += size + Number(fragments.length > 0);
      fragments.push(json);
      batchFiles.add(fragment.path);
      return true;
    };
    for (const file of group) {
      if (file.errors.length || !file.content.trim()) {
        plan.omissions.push({ path: file.path, reason: file.errors.length
          ? 'Arquivo com erros na análise estática' : 'Arquivo sem conteúdo' });
        continue;
      }
      const dependencies = [...new Set(file.imports.flatMap(reference =>
        reference.target && scope.has(reference.target) ? [reference.target] : []))].sort();
      const unresolvedImports = file.imports.filter(reference => reference.status === 'unresolved').length;
      const importsOutsideSelection = file.imports.filter(reference =>
        reference.status !== 'unresolved' && (!reference.target || !scope.has(reference.target))).length;
      const metadata = { path: file.path, dependencies, unresolvedImports, importsOutsideSelection };
      // Avoid serializing a huge file just to discover it cannot fit.
      if (Buffer.byteLength(file.content) <= payloadBudgetBytes &&
        add({ ...metadata, startLine: 1, endLine: file.content.split(/\r\n?|\n|\u2028|\u2029/).length,
          completeFile: true, code: file.content })) {
        continue;
      }
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, false);
      const lineAt = (offset: number): number => source.getLineAndCharacterOfPosition(offset).line + 1;
      const omit = (start: number, end: number, reason: string): void => {
        const startLine = lineAt(start);
        const endLine = lineAt(Math.max(start, end - 1));
        const previous = plan.omissions.at(-1);
        if (previous?.path === file.path && previous.reason === reason && startLine <= (previous.endLine ?? 0) + 1) {
          previous.endLine = endLine;
        } else {
          plan.omissions.push({ path: file.path, startLine, endLine, reason });
        }
      };
      for (const statement of source.statements) {
        const start = statement.getFullStart();
        const end = statement.end;
        const code = file.content.slice(start, end);
        if (Buffer.byteLength(code) > payloadBudgetBytes ||
          !add({ ...metadata, startLine: lineAt(start), endLine: lineAt(end - 1), completeFile: false, code })) {
          omit(start, end, 'Declaração ou instrução excede o orçamento do contexto');
        }
      }
      const last = source.statements.at(-1)?.end ?? 0;
      if (file.content.slice(last).trim()) {
        omit(last, file.content.length, 'Conteúdo final fora de uma declaração ou instrução');
      }
    }
    flush();
  }
  return plan;
}
