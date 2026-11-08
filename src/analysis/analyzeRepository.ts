import { setImmediate } from 'node:timers/promises';
import { Cancellation, ScanLimits, ScanResult } from './models';
import { WorkspaceScanner } from './workspaceScanner';
import { TypeScriptAnalyzer } from './typeScriptAnalyzer';
import { RepositoryIndex } from './repositoryIndex';

export async function analyzeRepository(root: string, limits: Partial<ScanLimits>, token: Cancellation,
  progress: (message: string) => void = () => undefined): Promise<ScanResult> {
  const result = await new WorkspaceScanner().scan(root, limits, token, progress);
  const analyzer = new TypeScriptAnalyzer();
  for (const file of result.files) {
    await setImmediate();
    if (token.isCancellationRequested) { result.cancelled = true; break; }
    progress(`Extraindo estrutura: ${file.path}`);
    try { analyzer.analyze(file); }
    catch (error) { file.errors.push(`Extração incompleta: ${String(error)}`); }
  }
  if (result.cancelled && !result.limitations.includes('Análise cancelada; inventário parcial.')) {
    result.limitations.push('Análise cancelada; inventário parcial.');
  }
  new RepositoryIndex(result);
  return result;
}