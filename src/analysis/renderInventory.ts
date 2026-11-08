import { RepositoryIndex } from './repositoryIndex';
import { SourcePosition } from './models';

function safe(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}\[\]()#+.!|~]/g, '\\$&');
}
const location = (item: SourcePosition): string => `${safe(item.path)}:${item.startLine}–${item.endLine}`;
export function renderInventory(name: string, index: RepositoryIndex): string {
  const data = index.snapshot;
  const lines = [
    '# Inventário técnico — Legacy AI', '',
    `Projeto: ${safe(name)}`, '', `Localização: ${safe(data.root)}`, '',
    `Estado: ${data.cancelled ? 'cancelado — resultado parcial' : data.limitations.length || data.errors.length || data.files.some(file => file.errors.length) ? 'concluído com limitações — consulte os detalhes' : 'concluído no escopo configurado'}.`, '',
    `Arquivos lidos e indexados: ${data.files.length}. Entradas visitadas: ${data.entriesVisited}. Bytes lidos (incluindo regras e arquivos rejeitados após leitura): ${data.bytesRead}.`, '',
    `Linguagens/tipos: ${[...new Set(data.files.map(file => file.language))].join(', ') || 'nenhum'}.`, '',
    `Limites: ${Object.entries(data.limits).map(([key, value]) => `${key}=${value}`).join('; ')}.`, '',
    '## Estrutura de diretórios e arquivos', '',
    'Somente arquivos aceitos; diretórios excluídos não são enumerados internamente.', ''
  ];
  const directories = new Set<string>();
  for (const file of data.files) {
    const parts = file.path.split('/');
    for (let count = 1; count < parts.length; count++) { directories.add(parts.slice(0, count).join('/')); }
  }
  lines.push(...[...directories].sort().map(directory => `- ${safe(directory)}/`));
  lines.push(...data.files.map(file => `- ${safe(file.path)} — ${file.language}, ${file.bytes} bytes`));
  lines.push('', '## Símbolos: classes, interfaces, funções e demais declarações', '');
  const symbols = data.files.flatMap(file => file.symbols);
  lines.push(...(symbols.length ? symbols.map(item => `- ${safe(item.kind)} ${safe(item.name)} — ${location(item)}`) : ['Nenhum símbolo extraído.']));
  lines.push('', '## Imports e relações entre módulos', '');
  const imports = data.files.flatMap(file => file.imports);
  lines.push(...(imports.length ? imports.map(item => `- ${location(item)} — ${safe(item.kind)} ${safe(item.specifier)} → ${item.target ? safe(item.target) : safe(item.status ?? 'unresolved')}`) : ['Nenhuma referência extraída.']));
  lines.push('', '## Exports', '');
  const exports = data.files.flatMap(file => file.exports);
  lines.push(...(exports.length ? exports.map(item => `- ${safe(item.name)} (${safe(item.kind)}) — ${location(item)}`) : ['Nenhum export extraído.']));
  lines.push('', '## Dependências declaradas', '');
  const dependencies = data.files.flatMap(file => file.dependencies);
  lines.push(...(dependencies.length ? dependencies.map(item => `- ${safe(item.name)}: ${safe(item.version)} [${safe(item.group)}] — ${location(item)}`) : ['Nenhuma dependência declarada identificada.']));
  lines.push('', '## Possíveis pontos de entrada', '');
  const entries = data.files.flatMap(file => file.entryPoints);
  lines.push(...(entries.length ? entries.map(item => `- ${safe(item.value)} — ${safe(item.reason)} — ${location(item)}`) : ['Nenhum candidato identificado.']));
  lines.push('', '## Arquivos e diretórios ignorados', '');
  lines.push(...(data.ignored.length ? data.ignored.map(item => `- ${safe(item.path)} — ${safe(item.reason)}`) : ['Nenhuma exclusão registrada.']));
  lines.push('', '## Erros e falhas de análise', '');
  const errors = [...data.errors, ...data.files.flatMap(file => file.errors)];
  lines.push(...(errors.length ? errors.map(error => `- ${safe(error)}`) : ['Nenhum erro registrado.']));
  lines.push('', '## Limitações', '',
    ...data.limitations.map(item => `- ${safe(item)}`),
    '- Análise estática sintática de arquivos UTF-8 salvos; nenhum código foi executado.',
    '- Conteúdo do editor ainda não salvo não é incluído. Arquivos podem mudar durante a execução; não há snapshot transacional.',
    '- Imports relativos usam candidatos do índice; múltiplos candidatos permanecem não resolvidos. Sem resolução de aliases, tsconfig paths, package exports ou grafo de chamadas.',
    '- Bare imports são classificados como externos; podem representar aliases não reconhecidos. Dependências declaradas não comprovam uso.',
    '- Apenas imports com strings literais são extraídos. Pontos de entrada são candidatos, sem confirmação de comportamento.',
    '- Exclusões por nome/cabeçalho não detectam todos os arquivos gerados ou segredos presentes em código.',
    '- Diretórios excluídos são registrados uma vez; seus descendentes e entradas além dos limites não são inventariados.',
    '- JSON inválido e erros sintáticos são registrados; não há verificação semântica ou de tipos.',
    '- Nenhum dado foi enviado a serviços externos e nenhum arquivo do projeto foi alterado.');
  return lines.join('\n');
}