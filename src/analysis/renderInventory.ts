import { RepositoryIndex } from './repositoryIndex';
import { SourcePosition } from './models';
import type { ContextPlan } from '../gemini/prepareContext';
import type { ModuleExplanation } from '../gemini/explanations';

export type ReportStatus = 'complete' | 'partial' | 'cancelled' | 'failed';

export interface ExplanationReportEntry {
  module: string;
  explanation: ModuleExplanation;
  source: 'cache' | 'api';
}

export interface PendingModuleEntry {
  module: string;
  reason: string;
}

export interface ReportExplanationsData {
  status: ReportStatus;
  statusMessage?: string;
  model?: string;
  totalModules?: number;
  explainedModules?: number;
  explanations?: ExplanationReportEntry[];
  pendingModules?: PendingModuleEntry[];
}

export function safe(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~]/g, '\\$&');
}

const location = (item: SourcePosition): string => `${safe(item.path)}:${item.startLine}–${item.endLine}`;

export function renderInventory(
  name: string,
  index: RepositoryIndex,
  contextPlan?: ContextPlan,
  explanationsData?: ReportExplanationsData
): string {
  const data = index.snapshot;

  let reportStatusLine = 'Estado do relatório: parcial — explicações obrigatórias do Gemini pendentes.';
  if (explanationsData) {
    if (explanationsData.status === 'complete') {
      reportStatusLine = 'Estado do relatório: completo — inventário técnico e explicações do Gemini concluídos.';
    } else if (explanationsData.status === 'cancelled') {
      reportStatusLine = 'Estado do relatório: parcial — análise cancelada pelo usuário; explicações concluídas foram preservadas.';
    } else if (explanationsData.status === 'failed') {
      reportStatusLine = `Estado do relatório: parcial — falha na obtenção das explicações do Gemini: ${safe(explanationsData.statusMessage ?? 'erro inesperado')}.`;
    } else {
      const msg = (explanationsData.statusMessage ?? 'explicações obrigatórias do Gemini pendentes').replace(/\.+$/, '');
      reportStatusLine = `Estado do relatório: parcial — ${safe(msg)}.`;
    }
  }

  const lines = [
    '# Inventário técnico — Legacy AI',
    '',
    reportStatusLine,
    '',
    ...(contextPlan
      ? [
          '## Arquivos selecionados automaticamente para o Gemini',
          '',
          ...(contextPlan.selectedPaths.length
            ? contextPlan.selectedPaths.map(file => `- ${safe(file)}`)
            : ['Nenhum arquivo elegível.']),
          '',
          '## Contexto preparado localmente',
          '',
          `${contextPlan.batches.length} lote(s). Teto local de ${contextPlan.payloadBudgetBytes} bytes por lote.`,
          ...contextPlan.batches.map(
            batch => `- Módulo ${safe(batch.module)} — ${batch.bytes} bytes — ${batch.files.map(safe).join(', ')}`
          ),
          '',
          '### Partes omitidas do contexto',
          '',
          `Arquivos indexados fora da seleção: ${data.files.length - contextPlan.selectedPaths.length}.`,
          ...contextPlan.omissions.map(
            item =>
              `- ${safe(item.path)}${item.startLine === undefined ? '' : `:${item.startLine}–${item.endLine}`} — ${safe(item.reason)}`
          ),
          ''
        ]
      : [])
  ];

  // Seção: Entendendo o projeto (explicações estruturadas da IA)
  lines.push('## Entendendo o projeto', '');
  if (explanationsData && ((explanationsData.explanations && explanationsData.explanations.length > 0) || (explanationsData.pendingModules && explanationsData.pendingModules.length > 0))) {
    const total = explanationsData.totalModules ?? contextPlan?.batches.length ?? 0;
    const explained = explanationsData.explainedModules ?? explanationsData.explanations?.length ?? 0;
    const percentage = total > 0 ? Math.round((explained / total) * 100) : 0;

    lines.push(`Cobertura das explicações: ${explained} de ${total} módulo(s) explicados (${percentage}%).`);
    if (explanationsData.model) {
      lines.push(`Modelo utilizado: ${safe(explanationsData.model)}.`);
    }
    lines.push('');

    if (explanationsData.explanations && explanationsData.explanations.length > 0) {
      for (const entry of explanationsData.explanations) {
        const exp = entry.explanation;
        const origin = entry.source === 'cache'
          ? 'cache local (recuperado do armazenamento seguro)'
          : 'API do Gemini (gerado nesta execução)';

        lines.push(`### Módulo ${safe(entry.module)}`, '');
        lines.push(`- **Origem**: ${origin}.`);
        lines.push(`- **Responsabilidade**: ${safe(exp.responsibility)}`, '');

        lines.push('#### Componentes principais', '');
        if (exp.components.length > 0) {
          lines.push(...exp.components.map(c => `- \`${safe(c.name)}\` (${safe(c.kind)}): ${safe(c.summary)}`));
        } else {
          lines.push('- Nenhum componente destacado.');
        }
        lines.push('');

        lines.push('#### Relações e dependências', '');
        if (exp.relations.length > 0) {
          lines.push(...exp.relations.map(r => `- ${safe(r.target)}: ${safe(r.description)}`));
        } else {
          lines.push('- Nenhuma relação externa registrada.');
        }
        lines.push('');

        lines.push('#### Referências no código', '');
        if (exp.references.length > 0) {
          lines.push(
            ...exp.references.map(
              ref => `- ${safe(ref.path)}:${ref.startLine}–${ref.endLine}${ref.note ? ` — ${safe(ref.note)}` : ''}`
            )
          );
        } else {
          lines.push('- Nenhuma referência direta anotada.');
        }
        lines.push('');

        lines.push('#### Inferências', '');
        if (exp.inferences.length > 0) {
          lines.push(...exp.inferences.map(inf => `- ${safe(inf)}`));
        } else {
          lines.push('- Nenhuma inferência adicional.');
        }
        lines.push('');

        lines.push('#### Limitações do módulo', '');
        if (exp.limitations.length > 0) {
          lines.push(...exp.limitations.map(lim => `- ${safe(lim)}`));
        } else {
          lines.push('- Nenhuma limitação específica informada.');
        }
        lines.push('');
      }
    }

    if (explanationsData.pendingModules && explanationsData.pendingModules.length > 0) {
      lines.push('### Módulos pendentes', '');
      lines.push(...explanationsData.pendingModules.map(p => `- Módulo ${safe(p.module)} — ${safe(p.reason)}`));
      lines.push('');
    }
  } else {
    lines.push(
      'Nenhuma explicação foi gerada ainda. O inventário técnico está detalhado abaixo.',
      'O relatório permanece parcial até que todos os módulos selecionados tenham explicações válidas produzidas ou recuperadas do cache.',
      ''
    );
  }

  // Seções existentes do inventário técnico
  lines.push(
    `Projeto: ${safe(name)}`,
    '',
    `Localização: ${safe(data.root)}`,
    '',
    `Estado da análise estática: ${
      data.cancelled
        ? 'cancelado — resultado parcial'
        : data.limitations.length || data.errors.length || data.files.some(file => file.errors.length)
        ? 'concluído com limitações — consulte os detalhes'
        : 'concluído no escopo configurado'
    }.`,
    '',
    `Arquivos lidos e indexados: ${data.files.length}. Entradas visitadas: ${data.entriesVisited}. Bytes lidos (incluindo regras e arquivos rejeitados após leitura): ${data.bytesRead}.`,
    '',
    `Linguagens/tipos: ${[...new Set(data.files.map(file => file.language))].join(', ') || 'nenhum'}.`,
    '',
    `Limites: ${Object.entries(data.limits).map(([key, value]) => `${key}=${value}`).join('; ')}.`,
    '',
    '## Estrutura de diretórios e arquivos',
    '',
    'Somente arquivos aceitos; diretórios excluídos não são enumerados internamente.',
    ''
  );

  const directories = new Set<string>();
  for (const file of data.files) {
    const parts = file.path.split('/');
    for (let count = 1; count < parts.length; count++) {
      directories.add(parts.slice(0, count).join('/'));
    }
  }
  lines.push(...[...directories].sort().map(directory => `- ${safe(directory)}/`));
  lines.push(...data.files.map(file => `- ${safe(file.path)} — ${file.language}, ${file.bytes} bytes`));

  lines.push('', '## Símbolos: classes, interfaces, funções e demais declarações', '');
  const symbols = data.files.flatMap(file => file.symbols);
  lines.push(
    ...(symbols.length
      ? symbols.map(item => `- ${safe(item.kind)} ${safe(item.name)} — ${location(item)}`)
      : ['Nenhum símbolo extraído.'])
  );

  lines.push('', '## Imports e relações entre módulos', '');
  const imports = data.files.flatMap(file => file.imports);
  lines.push(
    ...(imports.length
      ? imports.map(
          item =>
            `- ${location(item)} — ${safe(item.kind)} ${safe(item.specifier)} → ${
              item.target ? safe(item.target) : safe(item.status ?? 'unresolved')
            }`
        )
      : ['Nenhuma referência extraída.'])
  );

  lines.push('', '## Exports', '');
  const exports = data.files.flatMap(file => file.exports);
  lines.push(
    ...(exports.length
      ? exports.map(item => `- ${safe(item.name)} (${safe(item.kind)}) — ${location(item)}`)
      : ['Nenhum export extraído.'])
  );

  lines.push('', '## Dependências declaradas', '');
  const dependencies = data.files.flatMap(file => file.dependencies);
  lines.push(
    ...(dependencies.length
      ? dependencies.map(item => `- ${safe(item.name)}: ${safe(item.version)} [${safe(item.group)}] — ${location(item)}`)
      : ['Nenhuma dependência declarada identificada.'])
  );

  lines.push('', '## Possíveis pontos de entrada', '');
  const entries = data.files.flatMap(file => file.entryPoints);
  lines.push(
    ...(entries.length
      ? entries.map(item => `- ${safe(item.value)} — ${safe(item.reason)} — ${location(item)}`)
      : ['Nenhum candidato identificado.'])
  );

  lines.push('', '## Arquivos e diretórios ignorados', '');
  lines.push(
    ...(data.ignored.length
      ? data.ignored.map(item => `- ${safe(item.path)} — ${safe(item.reason)}`)
      : ['Nenhuma exclusão registrada.'])
  );

  lines.push('', '## Erros e falhas de análise', '');
  const errors = [...data.errors, ...data.files.flatMap(file => file.errors)];
  lines.push(...(errors.length ? errors.map(error => `- ${safe(error)}`) : ['Nenhum erro registrado.']));

  lines.push(
    '',
    '## Limitações',
    '',
    ...data.limitations.map(item => `- ${safe(item)}`),
    '- Análise estática sintática de arquivos UTF-8 salvos; nenhum código foi executado.',
    '- Conteúdo do editor ainda não salvo não é incluído. Arquivos podem mudar durante a execução; não há snapshot transacional.',
    '- Imports relativos usam candidatos do índice; múltiplos candidatos permanecem não resolvidos. Sem resolução de aliases, tsconfig paths, package exports ou grafo de chamadas.',
    '- Bare imports são classificados como externos; podem representar aliases não reconhecidos. Dependências declaradas não comprovam uso.',
    '- Apenas imports com strings literais são extraídos. Pontos de entrada são candidatos, sem confirmação de comportamento.',
    '- Exclusões por nome/cabeçalho não detectam todos os arquivos gerados ou segredos presentes em código.',
    '- Diretórios excluídos são registrados uma vez; seus descendentes e entradas além dos limites não são inventariados.',
    '- JSON inválido e erros sintáticos são registrados; não há verificação semântica ou de tipos.',
    '- As explicações da IA são geradas com base estritamente no código enviado e no cache local validado; referências de linhas não garantem correção semântica integral.'
  );

  return lines.join('\n');
}
