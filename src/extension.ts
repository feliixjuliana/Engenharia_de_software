import * as vscode from 'vscode';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { defaultLimits, FileRecord, ScanLimits, ScanResult } from './analysis/models';
import { RepositoryIndex } from './analysis/repositoryIndex';
import { renderInventory, ReportExplanationsData } from './analysis/renderInventory';
import { configureGeminiKey, removeGeminiKey } from './gemini/setup';
import { geminiDefaults, readGeminiConfiguration } from './gemini/configuration';
import { ContextPlan, prepareContext } from './gemini/prepareContext';
import { DiskExplanationCache } from './gemini/explanationCache';
import { FailureCode, GeminiTransport } from './gemini/httpClient';
import { GeminiBatchRunner } from './gemini/runBatches';
import { orchestrateExplanations } from './gemini/explanationOrchestrator';
import { EXPLANATION_SYSTEM_INSTRUCTION } from './gemini/explanations';

let customTransport: GeminiTransport | undefined;
export function setGeminiTransportForTesting(transport?: GeminiTransport): void {
  customTransport = transport;
}

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

function formatStopReason(code?: FailureCode, detail?: string): string {
  switch (code) {
    case 'budget': return 'Orçamento de requisições por execução esgotado.';
    case 'daily-quota': return 'Cota diária de requisições da conta esgotada.';
    case 'rate-limit': return 'Limite de requisições ou tokens por minuto atingido.';
    case 'authentication': return 'Chave de API rejeitada ou inválida.';
    case 'cancelled': return 'Operação cancelada pelo usuário.';
    case 'invalid-response': return detail ? `Resposta da IA inválida ou fora do esquema (${detail}).` : 'Resposta da IA inválida ou fora do esquema.';
    case 'input-limit': return 'Entrada excedeu o limite de tokens configurado.';
    case 'timeout': return 'Tempo limite de resposta esgotado.';
    case 'temporary': return 'Instabilidade temporária na API do Gemini.';
    case 'request-rejected': return 'Requisição rejeitada pela API do Gemini (verifique o modelo e o acesso da chave).';
    default: return 'Execução interrompida.';
  }
}

async function runGeminiExplanations(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder,
  files: readonly FileRecord[],
  plan: ContextPlan
): Promise<ReportExplanationsData> {
  if (plan.batches.length === 0) {
    return {
      status: 'partial',
      statusMessage: 'Nenhum arquivo elegível selecionado para explicações.',
      totalModules: 0,
      explainedModules: 0,
      explanations: [],
      pendingModules: []
    };
  }

  const storagePath = context.globalStorageUri?.fsPath ?? path.join(context.extensionPath, '.storage');
  const cache = new DiskExplanationCache(storagePath);

  const settings = vscode.workspace.getConfiguration('legacyAi', folder.uri);
  const rawModel = settings.get<string>('gemini.model', '').trim();
  const model = rawModel.replace(/^models\//, '');
  const rpm = settings.get<number>('gemini.requestsPerMinute', 0);
  const rpd = settings.get<number>('gemini.requestsPerDay', 0);
  const tpm = settings.get<number>('gemini.inputTokensPerMinute', 0);

  if (!model) {
    return {
      status: 'partial',
      statusMessage: 'Modelo do Gemini não configurado nas configurações da extensão (legacyAi.gemini.model).',
      totalModules: plan.batches.length,
      explainedModules: 0,
      explanations: [],
      pendingModules: plan.batches.map(b => ({ module: b.module, reason: 'Modelo não configurado' }))
    };
  }

  if (!rpm || !rpd || !tpm) {
    return {
      status: 'partial',
      statusMessage: 'Cotas da conta Gemini não configuradas (requestsPerMinute, requestsPerDay, inputTokensPerMinute).',
      model,
      totalModules: plan.batches.length,
      explainedModules: 0,
      explanations: [],
      pendingModules: plan.batches.map(b => ({ module: b.module, reason: 'Cotas da conta não configuradas' }))
    };
  }

  const key = await context.secrets.get('legacyAi.gemini.apiKey');
  if (!key) {
    return {
      status: 'partial',
      statusMessage: 'Chave de API do Gemini não configurada no SecretStorage. Use o comando "Legacy AI: Configurar chave do Gemini".',
      model,
      totalModules: plan.batches.length,
      explainedModules: 0,
      explanations: [],
      pendingModules: plan.batches.map(b => ({ module: b.module, reason: 'Chave não cadastrada' }))
    };
  }

  if (key.startsWith('synthetic-') && !customTransport) {
    return {
      status: 'partial',
      statusMessage: 'Chave sintética de teste sem transporte configurado.',
      model,
      totalModules: plan.batches.length,
      explainedModules: 0,
      explanations: [],
      pendingModules: plan.batches.map(b => ({ module: b.module, reason: 'Chave sintética sem transporte de teste' }))
    };
  }

  try {
    const config = readGeminiConfiguration(k => settings.get(k));
    const runner = new GeminiBatchRunner(
      config,
      key,
      customTransport,
      undefined,
      undefined,
      undefined,
      EXPLANATION_SYSTEM_INSTRUCTION
    );

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Legacy AI — Gerando explicações com Gemini',
        cancellable: true
      },
      async (_progress, progressToken) => {
        const controller = new AbortController();
        const sub = progressToken.onCancellationRequested(() => controller.abort());
        try {
          const orch = await orchestrateExplanations({
            projectRoot: folder.uri.fsPath,
            plan,
            files,
            configuration: config,
            runner,
            cache,
            signal: controller.signal
          });

          const explanations = orch.completed.map(c => ({
            module: c.module,
            explanation: c.explanation,
            source: c.source
          }));

          const pendingModules = orch.pendingBatchIndices.map(idx => ({
            module: plan.batches[idx]!.module,
            reason: formatStopReason(orch.stopped, orch.validationReason)
          }));

          if (orch.isComplete) {
            return {
              status: 'complete',
              model: config.model,
              totalModules: plan.batches.length,
              explainedModules: explanations.length,
              explanations,
              pendingModules: []
            };
          }

          if (orch.stopped && orch.stopped !== 'cancelled') {
            void vscode.window.showWarningMessage(`Legacy AI: Explicações parciais — ${formatStopReason(orch.stopped, orch.validationReason)}`);
          }

          if (orch.stopped === 'cancelled' || progressToken.isCancellationRequested) {
            return {
              status: 'cancelled',
              statusMessage: 'Análise cancelada pelo usuário; explicações concluídas foram preservadas.',
              model: config.model,
              totalModules: plan.batches.length,
              explainedModules: explanations.length,
              explanations,
              pendingModules
            };
          }

          return {
            status: 'partial',
            statusMessage: formatStopReason(orch.stopped, orch.validationReason),
            model: config.model,
            totalModules: plan.batches.length,
            explainedModules: explanations.length,
            explanations,
            pendingModules
          };
        } finally {
          sub.dispose();
        }
      }
    );
  } catch (error) {
    return {
      status: 'failed',
      statusMessage: String(error),
      model,
      totalModules: plan.batches.length,
      explainedModules: 0,
      explanations: [],
      pendingModules: plan.batches.map(b => ({ module: b.module, reason: String(error) }))
    };
  }
}

export function activate(context: vscode.ExtensionContext): void {
  let latest: {
    name: string;
    index: RepositoryIndex;
    contextPlan?: ContextPlan;
    explanationsData?: ReportExplanationsData;
  } | undefined;
  let running = false;

  const analyze = async (folder?: vscode.WorkspaceFolder): Promise<void> => {
    if (running) {
      await vscode.window.showInformationMessage('Legacy AI: já existe uma análise em andamento.');
      return;
    }
    if (!vscode.workspace.isTrusted) {
      await vscode.window.showWarningMessage('Legacy AI: a análise requer um workspace confiável. Revise a confiança do projeto antes de continuar.');
      return;
    }
    folder ??= await selectFolder();
    if (!folder) { return; }
    if (running || !vscode.workspace.isTrusted) { return; }

    const selected = folder;
    running = true;
    try {
      const configuration = vscode.workspace.getConfiguration('legacyAi', selected.uri);
      const limits = Object.fromEntries(
        Object.entries(defaultLimits).map(([key, value]) => [key, configuration.get<number>(key, value)])
      ) as unknown as ScanLimits;

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Legacy AI — Análise estrutural',
          cancellable: true
        },
        (progress, token) => runWorker(context, selected, limits, token, progress)
      );

      if (!vscode.workspace.isTrusted) { return; }
      latest = { name: selected.name, index: new RepositoryIndex(result) };

      const settings = vscode.workspace.getConfiguration('legacyAi');
      const input = settings.get('gemini.maxInputTokens', geminiDefaults.maxInputTokens);
      const output = settings.get('gemini.maxOutputTokens', geminiDefaults.maxOutputTokens);

      if (
        Number.isSafeInteger(input) && input >= 1 && input <= 100000 &&
        Number.isSafeInteger(output) && output >= 1 && output <= 16000
      ) {
        latest.contextPlan = prepareContext(latest.index.files, input, output);
      } else {
        await vscode.window.showWarningMessage(
          'Legacy AI: orçamento inválido. Confira legacyAi.gemini.maxInputTokens e maxOutputTokens para preparar o contexto.'
        );
      }

      if (latest.contextPlan) {
        latest.explanationsData = await runGeminiExplanations(
          context,
          selected,
          latest.index.files,
          latest.contextPlan
        );
      }

      await showMarkdown(renderInventory(latest.name, latest.index, latest.contextPlan, latest.explanationsData));
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        await vscode.window.showInformationMessage('Legacy AI: análise cancelada; o último inventário concluído foi preservado.');
      } else {
        await vscode.window.showErrorMessage(`Legacy AI: não foi possível analisar o projeto. ${String(error)}`);
      }
    } finally {
      running = false;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('legacyAi.configureGeminiKey', () => configureGeminiKey(context)),
    vscode.commands.registerCommand('legacyAi.removeGeminiKey', () => removeGeminiKey(context)),
    vscode.commands.registerCommand('legacyAi.clearGeminiCache', async () => {
      try {
        const storage = context.globalStorageUri?.fsPath;
        if (!storage) {
          await vscode.window.showWarningMessage('Legacy AI: armazenamento local não disponível.');
          return;
        }
        const cache = new DiskExplanationCache(storage);
        await cache.clear();
        await vscode.window.showInformationMessage('Legacy AI: cache das explicações do Gemini foi limpo.');
      } catch (error) {
        await vscode.window.showErrorMessage(`Legacy AI: erro ao limpar cache: ${String(error)}`);
      }
    }),
    vscode.commands.registerCommand('legacyAi.open', () =>
      showMarkdown([
        '# Legacy AI',
        '',
        'Apoio à compreensão e manutenção de sistemas legados.',
        '',
        '## Etapa 3 — Exploração e análise estrutural',
        '',
        'Na paleta de comandos (Ctrl+Shift+P):',
        '',
        '- **Legacy AI: Selecionar projeto** identifica uma pasta e oferece iniciar sua análise.',
        '- **Legacy AI: Analisar estrutura do projeto** executa o inventário estático e gera explicações modulares com Gemini.',
        '- **Legacy AI: Mostrar último inventário** reabre o relatório integrado em memória.',
        '',
        '- **Legacy AI: Configurar chave do Gemini** guarda a chave no armazenamento seguro do VS Code.',
        '- **Legacy AI: Limpar cache das explicações do Gemini** limpa o armazenamento local de explicações validadas.',
        '- Configure modelo e cotas em **Legacy AI > Gemini**, após conferir a faixa gratuita no Google AI Studio.',
        '',
        'A análise exige workspace confiável e permite cancelamento pela notificação de progresso.',
        'Explicações válidas em cache são reutilizadas automaticamente sem gastar cotas.',
        'O relatório técnico e as explicações formam uma entrega integrada.'
      ].join('\n'))
    ),
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
        await vscode.window.showWarningMessage('Legacy AI: o inventário requer workspace confiável.');
        return;
      }
      if (!latest) {
        await vscode.window.showInformationMessage('Legacy AI: execute uma análise primeiro.');
        return;
      }
      await showMarkdown(renderInventory(latest.name, latest.index, latest.contextPlan, latest.explanationsData));
    })
  );
}
