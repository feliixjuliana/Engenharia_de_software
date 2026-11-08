import * as vscode from 'vscode';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { defaultLimits, ScanLimits, ScanResult } from './analysis/models';
import { RepositoryIndex } from './analysis/repositoryIndex';
import { renderInventory } from './analysis/renderInventory';

async function selectFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    await vscode.window.showInformationMessage('Legacy AI: abra uma pasta ou um workspace para selecionar um projeto.');
    return undefined;
  }
  const folder = folders.length === 1 ? folders[0] : await vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Legacy AI — escolha uma pasta do workspace'
  });
  if (folder && folder.uri.scheme !== 'file') {
    await vscode.window.showWarningMessage('Legacy AI: nesta versão, selecione uma pasta local.');
    return undefined;
  }
  return folder;
}

async function showMarkdown(content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language: 'markdown', content });
  await vscode.window.showTextDocument(document, { preview: true });
}

function runWorker(context: vscode.ExtensionContext, folder: vscode.WorkspaceFolder,
  limits: ScanLimits, token: vscode.CancellationToken,
  progress: vscode.Progress<{ message?: string }>): Promise<ScanResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(context.extensionPath, 'out', 'analysis', 'worker.js'), {
      workerData: { root: folder.uri.fsPath, limits }
    });
    let settled = false;
    let cancellation: vscode.Disposable | undefined;
    const finish = (error?: Error, result?: ScanResult): void => {
      if (settled) { return; }
      settled = true;
      cancellation?.dispose();
      void worker.terminate();
      if (error) { reject(error); }
      else if (result) { resolve(result); }
      else { reject(new Error('Worker finalizou sem resultado.')); }
    };
    cancellation = token.onCancellationRequested(() => finish(new vscode.CancellationError()));
    worker.on('message', (message: { type: string; message?: string; result?: ScanResult }) => {
      if (settled) { return; }
      if (message.type === 'progress') { progress.report({ message: message.message }); }
      else if (message.type === 'result') { finish(undefined, message.result); }
      else if (message.type === 'error') { finish(new Error(message.message ?? 'Falha na análise.')); }
    });
    worker.on('error', error => finish(error));
    worker.on('exit', code => { if (!settled) { finish(new Error(`Worker encerrou sem resultado (código ${code}).`)); } });
    if (token.isCancellationRequested) { finish(new vscode.CancellationError()); }
  });
}

export function activate(context: vscode.ExtensionContext): void {
  let latest: { name: string; index: RepositoryIndex } | undefined;
  let running = false;
  const analyze = async (folder?: vscode.WorkspaceFolder): Promise<void> => {
    if (running) {
      await vscode.window.showInformationMessage('Legacy AI: já existe uma análise em andamento.'); return;
    }
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showWarningMessage('Legacy AI: a análise requer um workspace confiável. Revise a confiança do projeto antes de continuar.'); return;
    }
    folder ??= await selectFolder();
    if (!folder) { return; }
    // Recheck after the folder picker, before starting any reads.
    if (running || !vscode.workspace.isTrusted) { return; }
    const selected = folder;
    running = true;
    try {
      const configuration = vscode.workspace.getConfiguration('legacyAi', selected.uri);
      const limits = Object.fromEntries(Object.entries(defaultLimits).map(([key, value]) =>
        [key, configuration.get<number>(key, value)])) as unknown as ScanLimits;
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title: 'Legacy AI — Análise estrutural', cancellable: true
      }, (progress, token) => runWorker(context, selected, limits, token, progress));
      latest = { name: selected.name, index: new RepositoryIndex(result) };
      await showMarkdown(renderInventory(latest.name, latest.index));
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        await vscode.window.showInformationMessage('Legacy AI: análise cancelada; o último inventário concluído foi preservado.');
      } else {
        await vscode.window.showErrorMessage(`Legacy AI: não foi possível analisar o projeto. ${String(error)}`);
      }
    } finally { running = false; }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('legacyAi.open', () => showMarkdown([
      '# Legacy AI', '', 'Apoio à compreensão e manutenção de sistemas legados.', '',
      '## Etapa 3 — Exploração e análise estrutural', '',
      'Na paleta de comandos (Ctrl+Shift+P):', '',
      '- **Legacy AI: Selecionar projeto** identifica uma pasta e oferece iniciar sua análise.',
      '- **Legacy AI: Analisar estrutura do projeto** executa o inventário estático de JavaScript e TypeScript.',
      '- **Legacy AI: Mostrar último inventário** reutiliza o índice em memória, sem reler o projeto.', '',
      'A análise exige workspace confiável e permite cancelamento pela notificação de progresso.',
      'Nenhum código é executado, nenhum arquivo do projeto é alterado e nenhum dado é enviado a serviços externos.'
    ].join('\n'))),
    vscode.commands.registerCommand('legacyAi.selectWorkspace', async () => {
      const folder = await selectFolder();
      if (!folder) { return; }
      const trustNotice = vscode.workspace.isTrusted ? '' : ' Workspace em modo restrito; análise indisponível.';
      const action = await vscode.window.showInformationMessage(
        `Legacy AI: projeto selecionado: ${folder.name} (${folder.uri.fsPath}).${trustNotice}`,
        ...(vscode.workspace.isTrusted ? ['Analisar estrutura'] : [])
      );
      if (action === 'Analisar estrutura') { await analyze(folder); }
    }),
    vscode.commands.registerCommand('legacyAi.analyze', () => analyze()),
    vscode.commands.registerCommand('legacyAi.showInventory', async () => {
      if (!vscode.workspace.isTrusted) {
        await vscode.window.showWarningMessage('Legacy AI: o inventário requer workspace confiável.'); return;
      }
      if (!latest) { await vscode.window.showInformationMessage('Legacy AI: execute uma análise primeiro.'); return; }
      await showMarkdown(renderInventory(latest.name, latest.index));
    })
  );
}