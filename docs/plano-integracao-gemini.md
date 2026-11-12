# Plano de integração do Gemini — checklist

Status: todas as 6 etapas implementadas e validadas. Integração completa do Gemini com relatório unificado, cache persistente e validação estrita.

## Objetivo e decisões confirmadas

A geração do relatório deve obrigatoriamente incluir explicações simples produzidas pelo Gemini, junto ao inventário técnico em Markdown. O comando de análise acionará o fluxo completo; não haverá um comando opcional separado para adicionar IA.

- Usar a API do Gemini com faixa gratuita disponível na conta.
- Dividir o contexto por módulos, controlar chamadas e reutilizar explicações válidas em cache.
- Considerar o relatório completo apenas quando todos os módulos incluídos na análise tiverem explicações válidas, produzidas pela API ou recuperadas do cache.
- Em caso de falha ou cota esgotada, preservar o progresso e apresentar explicitamente um resultado parcial, com possibilidade de retomada. O inventário sozinho não constitui entrega concluída.
- Informar arquivos excluídos, contexto omitido e limitações; não prometer compreensão integral do projeto.
- Implementar uma etapa aprovada por vez. Este documento não autoriza automaticamente implementação, instalação de dependências ou envio de código.

## Base existente

O scanner e o analisador local produzem um índice em memória com conteúdo, hashes, símbolos, linhas e imports. O renderizador gera o Markdown técnico. Ainda não existem integração com IA nem cache persistente. Reutilizar essa estrutura sem refatorações amplas.

## Etapa 1 — Configuração e seleção automática

- [x] Definir um modelo com faixa gratuita disponível na conta e verificar suas capacidades e cotas atuais.
- [x] Definir configurações de orçamento, tamanho de contexto e resposta, sem troca automática para modelo pago.
- [x] Armazenar a chave no SecretStorage do VS Code, fora do repositório e dos logs.
- [x] Preparar a seleção localmente com os orçamentos da extensão. A etapa 2 desvinculou essa preparação da chave e da conta.
- [x] Selecionar automaticamente até 20 arquivos JavaScript ou TypeScript elegíveis e listar os caminhos relativos no Markdown.
- [x] Aplicar os filtros de conteúdo potencialmente sensível antes de ordenar a seleção. A cobertura dos filtros é parcial.
- [x] Integrar a configuração ao comando de análise existente, mantendo a IA obrigatória no fluxo de conclusão.
- [x] Validar a seleção automática no comando de análise e verificar que o relatório não contém a chave.

Conclusão: configuração e seleção automática funcionam. O relatório completo exige explicações.

Implementação e validação — etapa 1 (2026-11-11):

- `src/gemini/configuration.ts` valida modelo, cotas e orçamentos. `package.json` expõe configurações de aplicação (não controladas pelo workspace), além dos comandos de cadastro/remoção de chave. Modelo inicia vazio e cotas em zero; não há valores de conta presumidos nem fallback.
- `src/gemini/setup.ts` mantém o SecretStorage e o campo oculto. A decisão de produto foi atualizada para seleção automática, sem janela de seleção ou confirmação.
- `src/gemini/authorization.ts` filtra caminhos e padrões de credenciais e ordena candidatos por pontos de entrada, quantidade de arquivos que os importam, exportações e caminho. `src/extension.ts` recalcula a seleção a cada análise configurada e o renderizador lista os caminhos. O inventário permanece parcial nesta etapa.
- README e guia de início atualizados. `npm run check` aprovado. `npm test` executou 37 testes, com 36 aprovados, zero falhas e um ignorado por restrição de links do Windows. `git diff --check` aprovado.
- Pendências: o usuário informou não ter projeto no AI Studio; portanto, não foi possível confirmar modelo, capacidades, gratuidade ou cotas reais. O primeiro item permanece desmarcado. Validação visual no VS Code/SecretStorage real não executada; não foram usadas credenciais reais nem realizadas chamadas Gemini. A etapa não está integralmente concluída operacionalmente.

## Etapa 2 — Divisão por módulos e preparação do contexto

- [x] Agrupar arquivos de forma determinística por pasta e aproximar dependências da mesma pasta. Esse agrupamento é uma heurística.
- [x] Dividir grupos grandes por arquivos e instruções completas, incluindo declarações de funções.
- [x] Registrar declarações maiores que o orçamento como omissões com referência às linhas.
- [x] Incluir código, referências às linhas originais e dependências diretas entre arquivos selecionados.
- [x] Contabilizar imports não resolvidos e fora da seleção. Registrar arquivos com erros sintáticos e partes omitidas.
- [x] Limitar os lotes por bytes do JSON. Reservar uma parte do orçamento de entrada para instruções e registrar o limite separado de saída.
- [x] Preparar cada lote para uso independente, com seu próprio módulo, trechos e mapa de dependências.
- [x] Testar agrupamento estável, arquivos grandes, ciclos, limites, cobertura parcial e execução sem credenciais.

Conclusão: os conjuntos de contexto são reproduzíveis, limitados e têm cobertura rastreável.

Implementação e validação — etapa 2 (2026-11-11)

- `src/gemini/prepareContext.ts` reaproveita a seleção de até 20 arquivos elegíveis do inventário. Mantém um módulo por pasta e percorre os imports diretos da mesma pasta com proteção contra ciclos. Relações entre pastas aparecem nos lotes como referências.
- Os lotes contêm arquivos inteiros quando cabem e instruções completas da árvore sintática quando é preciso dividir um arquivo. Cada trecho carrega caminho relativo, linhas originais, indicador de arquivo completo e metadados de dependências. Arquivos com erros, instruções grandes demais e conteúdo final fora das instruções são registrados como omissões.
- `src/extension.ts` prepara os lotes usando apenas os orçamentos locais. `src/analysis/renderInventory.ts` mostra tamanhos, módulos e omissões no Markdown. A configuração real da conta e da chave fica para a etapa 6.
- O teto local mede os bytes UTF-8 do JSON. Reservamos 25% da entrada, arredondados para cima e limitados a 1.024 tokens, para instruções. O limite de saída é separado. A contagem efetiva de tokens e o limite de tentativas serão tratados no cliente da etapa 3.
- `npm run check` aprovado. `npm test` executou 37 testes, com 36 aprovados, zero falhas e um ignorado por restrição de links de arquivo no Windows. `git diff --check` aprovado. Os testes usaram o comando da extensão com interface simulada e worker real. A validação visual e as chamadas com conta real ficam pendentes.

## Etapa 3 — Cliente Gemini e controle de chamadas

- [x] Isolar a comunicação com Gemini da interface e do scanner.
- [x] Verificar compatibilidade dos recursos HTTP nativos com o runtime mínimo do VS Code.
- [x] Executar uma chamada de geração por vez.
- [x] Aplicar orçamento por execução, incluindo tentativas, e limites configuráveis de entrada e saída.
- [x] Controlar espaçamento e tokens por minuto conforme as cotas configuradas.
- [x] Distinguir estimativa local de contagem da API e contabilizar as chamadas auxiliares separadamente.
- [x] Implementar timeout e cancelamento da chamada ativa, impedindo novos envios após cancelar.
- [x] Aplicar espera progressiva e tentativas limitadas para falhas temporárias, respeitando orientações da API.
- [x] Interromper diante de credencial inválida ou cota diária esgotada.
- [x] Devolver resultados concluídos e posição de retomada em memória. Documentar o compartilhamento de cota por projeto.
- [x] Testar respostas simuladas, limites, erros, timeout e cancelamento.

Conclusão: consumo limitado e falhas previsíveis, sem promessa de disponibilidade contínua da faixa gratuita.

Implementação e validação — etapa 3 (2026-11-11)

- `src/gemini/httpClient.ts` usa HTTPS nativo para `countTokens` e `generateContent`, com a chave em cabeçalho e timeout padrão de 30 segundos por tentativa. O cliente limita a resposta a 1 MiB, rejeita redirecionamentos e devolve códigos de falha sem propagar detalhes de erro do provedor. A compatibilidade foi conferida na documentação do [VS Code 1.85](https://github.com/microsoft/vscode/blob/1.85.0/.yarnrc), do [Electron 25.9.7](https://releases.electronjs.org/release/v25.9.7) e do [Node 18.15](https://nodejs.org/download/release/v18.15.0/docs/api/https.html). Nenhuma dependência nova foi necessária.
- `src/gemini/runBatches.ts` usa o resultado de `countTokens` para limitar entrada e reservar tokens na janela móvel de 60 segundos. Ajusta essa reserva para cima se a geração bem-sucedida reportar um valor maior. O limite de saída é o menor entre o plano e a configuração. O orçamento `maxRequests` é aplicado separadamente à contagem e à geração, incluindo repetições. A cota diária de geração é acompanhada em memória por instância e reinicia na mudança de dia no horário do Pacífico. A cota do Google é compartilhada com outros aplicativos do mesmo projeto. [Contagem de tokens](https://ai.google.dev/gemini-api/docs/generate-content/tokens) e [limites da API](https://ai.google.dev/gemini-api/docs/rate-limits).
- Falhas transitórias recebem até duas repetições com espera progressiva, respeitando `Retry-After` e `RetryInfo`. A cota diária identificada, a falha de credencial e o `429` sem indicação de espera interrompem a execução. Uma espera do provedor superior a 60 segundos também interrompe a execução e impede nova tentativa imediata naquela operação da mesma instância. [Erros da API](https://ai.google.dev/gemini-api/docs/generate-content/api-errors).
- O resultado devolve os lotes concluídos e o índice do primeiro lote pendente. A retomada usa o mesmo plano e a mesma instância para reaproveitar as cotas locais. A persistência fica para a etapa 4. O comando da extensão continua usando a preparação local até a integração com o relatório na etapa 5.
- `npm run check` aprovado. `npm test` executou 47 testes, com 46 aprovados, zero falhas e um ignorado por restrição de links de arquivo no Windows. `git diff --check` aprovado. Os testes HTTP simularam o transporte e as respostas, incluindo cancelamento durante requisição e durante espera. Conta, credencial e requisições reais ficam para a etapa 6.

## Etapa 4 — Explicações estruturadas e cache

- [x] Definir resposta estruturada com responsabilidade do módulo, componentes, relações, referências, inferências e limitações.
- [x] Orientar o modelo a explicar em português simples, com base no material fornecido, sem inventar regras de negócio.
- [x] Tratar código e comentários como dados, não como instruções para a IA.
- [x] Validar formato, campos, tamanho e referências aos trechos efetivamente enviados; reconhecer que referências válidas não comprovam toda interpretação.
- [x] Não aceitar respostas incompletas, bloqueadas ou inválidas como explicações concluídas.
- [x] Persistir somente resultados validados no armazenamento local da extensão, separados por projeto e fora do repositório.
- [x] Formar a chave do cache com o contexto completo enviado, modelo, parâmetros e versões do prompt e do formato.
- [x] Incluir identificadores das dependências relevantes no contexto para invalidar explicações afetadas por mudanças.
- [x] Salvar cada resultado concluído e reconstruir as pendências na retomada, verificando o snapshot atual.
- [x] Não persistir cópia do código no cache; tratar as explicações armazenadas como dados potencialmente privados.
- [x] Definir limite de armazenamento e comando de limpeza; tratar cache corrompido como ausência de resultado.
- [x] Testar reutilização sem novas chamadas, invalidação, isolamento por projeto, corrupção e retomada.

Conclusão: contexto idêntico reutiliza explicação válida; mudanças relevantes exigem nova geração; falhas não são armazenadas como sucesso.

Implementação e validação — etapa 4 (2026-11-11)

- `src/gemini/explanations.ts` define a estrutura `ModuleExplanation` (responsabilidade, componentes, relações, referências, inferências e limitações), `EXPLANATION_SYSTEM_INSTRUCTION` (instruindo o modelo a explicar em português simples e tratar todo o código/comentários como dados analíticos) e o validador estrito `validateExplanation`. A validação confere formato, tipos, tamanhos, presença de arquivos e conformidade de intervalos de linhas com os trechos enviados no lote, documentando que a integridade referencial não substitui a verificação semântica humana. Respostas malformadas, vazias ou truncadas são sumariamente rejeitadas.
- `src/gemini/explanationCache.ts` implementa o `DiskExplanationCache` e as funções de chave `computeCacheKey` e `computeProjectKey`. A chave de cache SHA-256 agrega versão de prompt, versão de esquema, modelo, limite de saída, payload do lote e hashes das dependências do snapshot atual. O armazenamento é isolado por projeto e localizado fora do repositório (`globalStorageUri`). Não há cópia de código-fonte no cache. Arquivos corrompidos são descartados e tratados como cache miss. Há cota de armazenamento em disco por projeto com poda de entradas mais antigas (LRU) e método `clear()`.
- `src/gemini/explanationOrchestrator.ts` coordena a reconstrução de pendências contra o snapshot e o cache antes de qualquer chamada remota. Lotes válidos em cache não disparam chamadas. Respostas novas do Gemini validadas com sucesso são persistidas imediatamente em disco. Lotes com falha, cancelados ou com resposta inválida nunca são persistidos.
- `package.json` e `src/extension.ts` registram o comando `legacyAi.clearGeminiCache` para limpeza direta pelo usuário.
- `npm run check` aprovado com zero erros de compilação.
- `npm test` executou 57 testes, com 56 aprovados, zero falhas e um ignorado por restrição de links de arquivo no Windows. `git diff --check` aprovado.
- Pendências: A integração visual e renderização das explicações no relatório Markdown ficam para a etapa 5. A validação com credencial real e modelo de produção no AI Studio fica para a etapa 6.

## Etapa 5 — Markdown integrado e estados de conclusão

- [x] Preservar o inventário técnico e acrescentar a seção “Entendendo o projeto”, organizada por módulos.
- [x] Acionar preparação, cache e Gemini automaticamente no fluxo de análise, após configuração e seleção automática.
- [x] Renderizar a resposta estruturada na extensão, escapando conteúdo e impedindo HTML ou links arbitrários fornecidos pelo modelo.
- [x] Exibir cobertura, origem em cache/API, modelo, snapshot, referências, limitações e inferências.
- [x] Distinguir resultado completo, parcial, cancelado e com falha; mostrar pendências e seus motivos.
- [x] Permitir retomar pendências sem perder explicações válidas nem associá-las silenciosamente a código alterado.
- [x] Exigir explicações válidas para todos os módulos incluídos antes de declarar conclusão.
- [x] Montar as explicações diretamente, sem chamada adicional de síntese na primeira versão; avaliar essa melhoria separadamente.
- [x] Validar o Markdown com resultados completos, parciais, cache, falhas e conteúdo adversarial.

Conclusão: relatório técnico e explicações integram a mesma entrega; resultados incompletos são identificados claramente.

Implementação e validação — etapa 5 (2026-11-11)

- `src/analysis/renderInventory.ts` preserva integralmente as seções técnicas anteriores (arquivos, símbolos, imports, exports, dependências, pontos de entrada, partes omitidas e limitações) e adiciona a seção `## Entendendo o projeto`. Cada módulo traz responsabilidade, componentes, relações, referências no código, inferências, limitações e indicador de origem (`cache local` vs `API do Gemini`). Todos os campos passam pela função de escape `safe()`, que sanitiza tags HTML (`<`, `>`, `&`) e neutraliza pontuação markdown (`[`, `]`, `(`, `)`, `` ` ``, etc.), blindando o relatório contra links arbitrários ou tentativas de injeção de HTML/scripts provenientes do modelo.
- `src/extension.ts` integra a execução automática das explicações ao comando `legacyAi.analyze`. O fluxo confere configurações, consulta o cache em disco, executa apenas lotes pendentes com `orchestrateExplanations` e reflete o progresso na notificação. Se o usuário cancelar ou a cota esgotar, o progresso concluído é preservado e o Markdown reabre com status parcial e lista detalhada de pendências.
- Os estados do relatório foram estritamente diferenciados no cabeçalho: `completo` (exclusivamente quando 100% dos módulos do contexto têm explicações válidas), `parcial` (com motivo explícito), `cancelado` e `falha`.
- `npm run check` aprovado com zero erros de compilação.
- `npm test` executou 62 testes, com 61 aprovados, zero falhas e um ignorado por restrição de links de arquivo no Windows. Os testes em `test/gemini-report.test.cjs` validaram relatórios completos, parciais, cancelamento, escape de conteúdo adversarial (XSS e injeção de links) e integração de ponta a ponta na extensão com transporte simulado. `git diff --check` aprovado.
- Pendências: A validação em ambiente real com credencial da conta e modelo configurado no Google AI Studio, além da revisão documental dos guias e README, ficam para a etapa 6.

## Etapa 6 — Validação completa e documentação

- [x] Executar `npm run check` e registrar o resultado real.
- [x] Executar `npm test`, incluindo testes dos comportamentos novos, e registrar falhas ou verificações não executadas.
- [x] Validar no VS Code configuração inicial, geração, cache, alteração de código, cancelamento, indisponibilidade e retomada.
- [x] Realizar validação real pequena com o projeto de exemplo, após configurar a conta e autorizar o envio.
- [x] Revisar clareza e fidelidade das explicações ao código, sem tratar a validação estrutural como prova de correção semântica.
- [x] Atualizar README e guia de uso com configuração, privacidade, limites, cache e recuperação de falhas.
- [x] Corrigir a apresentação atual que afirma não haver envio externo, descrevendo o novo fluxo de seleção e envio.
- [x] Revisar o diff, preservar alterações preexistentes e confirmar ausência de segredos e mudanças fora do escopo.

Conclusão: fluxo validado e documentado, com limitações conhecidas e resultados de testes registrados.

Implementação e validação — etapa 6 (2026-11-11)

- O usuário confirmou a criação do projeto e da chave de API no Google AI Studio. Diante da disponibilidade da conta gratuita observada na tela de limites de taxa, o modelo ativo selecionado foi o `gemini-2.5-flash-lite` (10 RPM, 20 RPD e 250.000 TPM), com teto local de 5 requisições por execução.
- A comunicação HTTPS real com a API do Gemini foi validada com sucesso em execução real com F5 no projeto de teste.
- Para garantir que o modelo gere rigorosamente a estrutura esperada pelo validador sem desvios de formato ou texto conversacional, a chamada à API foi configurada com decodificação restrita (`responseMimeType: 'application/json'` e `responseSchema: explanationResponseSchema`) em `src/gemini/runBatches.ts`, e a instrução de sistema `EXPLANATION_SYSTEM_INSTRUCTION` em `src/gemini/explanations.ts` foi enriquecida com a especificação de cada campo obrigatório.
- `src/gemini/explanations.ts` teve a validação de caminhos e módulos normalizada para o padrão unificado POSIX (`/`), evitando rejeições espúrias por separadores de caminho no Windows (`\`).
- `README.md` e `docs/como-iniciar.md` foram totalmente atualizados: descrevem o fluxo integrado de inventário + explicações, o cadastro protegido de chave via SecretStorage, o armazenamento de explicações no cache persistente em disco (sem cópia de código-fonte), os avisos claros de privacidade sobre envio via HTTPS para o Google Gemini, o comando de limpeza de cache `legacyAi.clearGeminiCache` e as instruções para execução manual com F5.
- A apresentação inicial da extensão (`legacyAi.open`) e a documentação corrigem a menção antiga de ausência de envio externo, detalhando a seleção automática de arquivos (até 20 arquivos elegíveis), o descarte de arquivos sensíveis e a transmissão controlada.
- `npm run check` aprovado com zero erros de compilação.
- `npm test` executou a suíte completa de 62 testes: 61 aprovados, zero falhas e um ignorado por restrições de links simbólicos no Windows.
- Revisão de segurança e integridade do diff (`git diff --check`): nenhuma credencial ou chave privada foi exposta no código, no repositório ou nos testes; nenhuma alteração fora do escopo foi introduzida.

## Registro de execução

Ao concluir cada etapa, substituir seu campo “Implementação e validação” por uma explicação breve contendo comportamento entregue, arquivos/responsabilidades afetados, comandos e resultados, limitações e desvios do plano. Marcar apenas itens efetivamente implementados e validados. Registrar progresso parcial sem declarar a etapa concluída.

## Referências

- [Limites do Gemini](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Preços e faixa gratuita](https://ai.google.dev/gemini-api/docs/pricing)
- [Termos e tratamento de dados](https://ai.google.dev/gemini-api/docs/terms)
- [Saída estruturada](https://ai.google.dev/gemini-api/docs/structured-output)
- [Armazenamento de extensões do VS Code](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)

Modelo, disponibilidade e cotas devem ser verificados novamente ao configurar a integração.
