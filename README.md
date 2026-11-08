# Legacy AI

Projeto acadêmico: Uso de Inteligência Artificial como Apoio à Compreensão e Manutenção de Sistemas Legados.

## Estado atual

Etapa 3: inventário estático de projetos JavaScript e TypeScript, sem LLM. Os comandos da Etapa 2 foram preservados. Não há backend, Webview, embeddings, banco de dados ou execução de código do projeto analisado.

## Preparação e execução

Requisitos: VS Code Desktop 1.85 ou superior; Node.js 20 ou superior e npm para desenvolvimento. Ambiente validado: Windows, Node.js 24.21.0 e npm 11.19.0.

1. Abra esta pasta no VS Code e execute `npm ci`.
2. Execute `npm run check` e `npm test`.
3. Pressione F5 e escolha **Executar Legacy AI**. A compilação ocorre antes de abrir o Extension Development Host.
4. Na nova janela, abra uma pasta local confiável. Para reproduzir o exemplo, use `test/fixtures/project` deste repositório. Não é necessário instalar ou executar o projeto analisado.
5. Abra a paleta (Ctrl+Shift+P) e execute **Legacy AI: Analisar estrutura do projeto**.
6. Consulte o inventário no documento Markdown temporário. Para pré-visualizar, use o comando nativo **Markdown: Open Preview**.

## Comandos

- **Legacy AI: Abrir apresentação**: instruções iniciais em Markdown não salvo.
- **Legacy AI: Selecionar projeto**: identifica a pasta e oferece **Analisar estrutura**. Em workspaces com várias pastas, solicita uma escolha.
- **Legacy AI: Analisar estrutura do projeto**: seleciona uma pasta e cria um inventário estático.
- **Legacy AI: Mostrar último inventário**: reutiliza o último índice concluído, sem reler arquivos. Há somente um índice por sessão da extensão; uma nova análise concluída o substitui.

Use **Cancelar** na notificação para interromper a análise. O worker é encerrado e o último índice concluído é preservado. Apenas uma análise pode executar por vez. A seleção de pasta, isoladamente, não é persistida.

## Configuração

Nas configurações do VS Code, procure **Legacy AI**. Valores por pasta/workspace também são aceitos, com validação de limites antes da leitura.

| Configuração | Padrão | Máximo permitido |
|---|---:|---:|
| `legacyAi.maxFiles` | 2000 | 10000 |
| `legacyAi.maxFileBytes` | 262144 | 4194304 |
| `legacyAi.maxTotalBytes` | 16777216 | 67108864 |
| `legacyAi.maxEntries` | 20000 | 100000 |
| `legacyAi.maxDepth` | 32 | 128 |

Todos os valores devem ser inteiros positivos. O orçamento de bytes inclui regras `.gitignore` e arquivos rejeitados após leitura. Um arquivo que cresça durante a leitura pode consumir um byte adicional para detectar o excesso. Arquivos acima dos limites são ignorados; regras `.gitignore` que não possam ser lidas impedem a exploração daquele diretório. Limites e falhas aparecem no inventário. A seleção parcial segue a ordem de enumeração do sistema de arquivos, não uma classificação de relevância.

## Componentes

- `WorkspaceScanner`: leitura assíncrona local, políticas de exclusão, `.gitignore` aninhados, limites, verificação de links, erros e cancelamento.
- `TypeScriptAnalyzer`: AST sobre o texto já lido, com posições de símbolos, imports, exports, dependências e candidatos a entradas. Não utiliza um CompilerHost que busque arquivos adicionais.
- `RepositoryIndex`: snapshot em memória com consultas por caminho, símbolo, imports e dependentes. Resolve imports relativos somente contra arquivos do próprio índice.
- `analyzeRepository` e `worker`: coordenam exploração e extração fora da thread do editor.
- `renderInventory`: gera um relatório determinístico a partir do índice, sem interpretação por IA. Texto vindo do projeto é escapado para Markdown.

O scanner ignora dependências instaladas, diretórios internos e gerados, lockfiles, declarações `.d.ts`, minificados, source maps, cabeçalhos reconhecidos de geração e nomes potencialmente sensíveis. Diretórios excluídos são registrados como uma única entrada, sem enumerar seus descendentes. Documentação, JSON e código UTF-8 são aceitos; binários e codificações incompatíveis são registrados como exclusões.

TypeScript e `ignore` são dependências de execução; não removê-los do pacote da extensão. Os tipos de Node.js e VS Code são dependências de desenvolvimento. As configurações de TypeScript e depuração da Etapa 2 foram mantidas.

## Testes automatizados

`npm test` compila a extensão e executa testes com o runner nativo do Node.js. A suíte verifica arquivos, filtros, `.gitignore`, AST e linhas, imports, índice sem releitura, limites, JSON/código inválidos, erros de leitura, cancelamento e pasta vazia. Também executa workers reais e comandos com uma API VS Code simulada.

Os testes de limites/exclusões usam diretórios temporários e removem somente os diretórios criados pelo próprio teste. O projeto de exemplo inclui código que lança um erro se executado e sintaxe inválida intencional; a análise deve apenas ler esses arquivos.

Resultado desta entrega: **27 testes, 26 aprovados, 0 falhas, 1 não executado**. O teste de links de arquivo depende de permissão do Windows; o bloqueio de junctions de diretórios foi executado e aprovado. Os testes simulados da API não substituem a verificação visual no Extension Development Host.

## Verificação manual no VS Code

1. Sem pasta aberta: os comandos de seleção/análise orientam abrir um projeto.
2. Em modo restrito: apresentação e seleção continuam disponíveis; análise é bloqueada.
3. Com várias pastas: escolha uma; Escape cancela a seleção sem efeitos.
4. Analise `test/fixtures/project`: espere seis arquivos, as quatro categorias de linguagem/tipo, a classe `UserService`, a interface `User`, `registerUser`, imports resolvidos para `src/user.ts`, dependências do manifesto e o erro intencional de `broken.ts`.
5. Em um projeto próprio, confirme exclusões como `.gitignore`, `node_modules`, `dist` e `.env`.
6. Reduza `legacyAi.maxFiles` a 1 e confirme inventário parcial e motivos de exclusão; restaure o valor depois.
7. Em um projeto suficientemente grande, cancele pela notificação e confirme que o último inventário permanece disponível.
8. Após uma análise, modifique um arquivo: **Mostrar último inventário** deve manter o snapshot anterior. Execute nova análise para atualizar.
9. Confirme que nenhum arquivo de relatório foi criado no projeto; o resultado é um documento não salvo.

## Limitações e próxima etapa

A análise é sintática: não verifica tipos, não constrói grafo de chamadas e não comprova regras de negócio. Imports dinâmicos exigem strings literais. Bare imports podem ser pacotes ou aliases; a resolução não interpreta `tsconfig paths`, `package exports` ou configurações de bundlers. Múltiplos candidatos permanecem não resolvidos. Nomes de entrada e campos do manifesto indicam candidatos, sem comprovar execução.

Somente arquivos salvos em UTF-8 são considerados. O índice mantém texto e metadados em memória até a próxima análise ou encerramento da extensão, sem persistência. Há verificação de caminhos reais e rejeição de links/junctions, inclusive na raiz; arquivos não devem ser trocados concorrentemente por processos externos durante a análise, que não oferece snapshot transacional nem isolamento de sistema operacional.

Melhorias futuras: ampliar os testes no Extension Development Host real, validar links de arquivo com permissão adequada e adicionar resolução de módulos/aliases conforme a necessidade. Integração com LLM permanece reservada à Etapa 4, mediante autorização.

Referências de implementação: [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [VS Code API](https://code.visualstudio.com/api/references/vscode-api).

## Guias

- [Como iniciar a extensão](docs/como-iniciar.md)
- [Revisão antes de publicar](docs/publicacao-segura.md)
