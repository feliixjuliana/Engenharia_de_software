# Legacy AI

Projeto acadêmico: Uso de Inteligência Artificial como Apoio à Compreensão e Manutenção de Sistemas Legados.

## Estado atual

A extensão integra o inventário técnico estático de JavaScript e TypeScript com explicações modulares estruturadas geradas pela API do Gemini. As seis etapas do [plano de integração do Gemini](docs/plano-integracao-gemini.md) foram implementadas e validadas:
- **Seleção automática e autorização**: ranqueamento de até 20 arquivos mais relevantes por pontos de entrada e dependências, com exclusão de caminhos e padrões sensíveis.
- **Preparação e fatiamento de contexto**: agrupamento determinístico por módulos/pastas, divisão de arquivos extensos por nós da AST e orçamento em bytes com teto reservado para instruções.
- **Cliente Gemini e controle de taxa**: comunicação HTTPS nativa (sem dependências externas adicionais), requisições estritamente sequenciais, controle de janela móvel de RPM/TPM, cota diária no fuso do Pacífico, cancelamento com AbortSignal e retentativas com espera progressiva (*backoff* exponencial).
- **Esquema estruturado e cache local**: resposta em formato JSON validada rigorosamente (responsabilidade, componentes, relações, referências de linhas, inferências e limitações), blindagem contra injeção de prompt e cache persistente em disco fora do repositório (`globalStorageUri`) com invalidação por hash de dependências e sem armazenamento de código-fonte.
- **Markdown integrado e estados de conclusão**: relatório unificado contendo o inventário técnico e a seção "Entendendo o projeto", com sanitização completa de HTML e links arbitrários (`safe()`) e distinção estrita de estados (**completo** somente com 100% dos módulos explicados, ou **parcial** com pendências justificadas).
- **Validação e documentação**: suíte de 62 testes automatizados cobrindo todo o fluxo, isolamento de segurança e compatibilidade com VS Code Desktop 1.85+.

## Preparação e execução

Requisitos: VS Code Desktop 1.85 ou superior; Node.js 20 ou superior e npm para desenvolvimento. Ambiente validado: Windows, Node.js 24.21.0 e npm 11.19.0.

1. Abra esta pasta no VS Code e execute `npm ci`.
2. Execute `npm run check` e `npm test`.
3. Pressione F5 e escolha **Executar Legacy AI**. A compilação ocorre antes de abrir a janela do Extension Development Host.
4. Na nova janela, abra uma pasta local confiável. Para reproduzir o exemplo com fixtures, use `test/fixtures/project` deste repositório.
5. Cadastre sua chave e configure o modelo (veja seção abaixo).
6. Execute **Legacy AI: Analisar estrutura do projeto** na paleta (Ctrl+Shift+P).
7. Consulte o relatório integrado no documento Markdown aberto. Para pré-visualizar formatado, use **Markdown: Open Preview** (Ctrl+Shift+V).

## Configuração do Gemini (Google AI Studio)

A extensão consome a API do Google Gemini utilizando a faixa gratuita disponível na sua conta.

### 1. Obtenção da chave de API
No [Google AI Studio](https://aistudio.google.com/), crie um projeto e gere sua chave de API (*API key*).

### 2. Cadastro seguro da chave
Na janela do VS Code, abra a paleta de comandos (Ctrl+Shift+P):
- Execute **Legacy AI: Configurar chave do Gemini**: cole sua chave no campo com máscara de senha. A chave é gravada exclusivamente no `SecretStorage` protegido do VS Code, nunca no repositório, em arquivos `.env` ou em logs.
- Para remover a chave a qualquer momento, execute **Legacy AI: Remover chave do Gemini**.

### 3. Configurações de Usuário (legacyAi.gemini)
Abra as configurações do VS Code (Ctrl+,) e procure por `legacyAi.gemini`:

| Configuração | Sugestão (Faixa Gratuita) | Significado |
|---|---|---|
| `legacyAi.gemini.model` | `gemini-1.5-flash` | Identificador do modelo com cota gratuita disponível no seu AI Studio. |
| `legacyAi.gemini.requestsPerMinute` | `15` | Cota de requisições por minuto informada pelo AI Studio (ex: 15 RPM para 1.5 Flash). |
| `legacyAi.gemini.requestsPerDay` | `1500` | Cota de requisições por dia informada pelo AI Studio (ex: 1.500 RPD). |
| `legacyAi.gemini.inputTokensPerMinute` | `1000000` | Cota de tokens de entrada por minuto informada pela conta (ex: 1.000.000 TPM). |
| `legacyAi.gemini.maxRequests` | `5` | Limite local de tentativas por execução de análise. |
| `legacyAi.gemini.maxInputTokens` | `8000` | Orçamento local de tokens de entrada por chamada de lote. |
| `legacyAi.gemini.maxOutputTokens` | `1500` | Orçamento local de tokens de saída da resposta estruturada. |

> [!IMPORTANT]
> **Privacidade e Divulgação Externa**: Ao executar a análise com o Gemini configurado, trechos de código dos arquivos selecionados (até 20 arquivos elegíveis, após filtros de conteúdo potencialmente sensível) são transmitidos via HTTPS para os servidores da Google Generative Language API. O cache local armazena **apenas** as explicações e metadados estruturados, **sem reter cópia do código-fonte**.

## Comandos

- **Legacy AI: Abrir apresentação**: exibe instruções e visão geral dos comandos da extensão.
- **Legacy AI: Selecionar projeto**: identifica uma pasta de workspace e oferece iniciar a análise estrutural.
- **Legacy AI: Analisar estrutura do projeto**: executa o inventário estático local e orquestra a geração/recuperação de explicações do Gemini.
- **Legacy AI: Mostrar último inventário**: reabre o último relatório completo/parcial gerado em memória, sem reler arquivos do disco.
- **Legacy AI: Configurar chave do Gemini**: armazena a credencial com segurança no SecretStorage do VS Code.
- **Legacy AI: Remover chave do Gemini**: apaga a credencial armazenada.
- **Legacy AI: Limpar cache das explicações do Gemini**: esvazia o cache persistente de explicações salvas em disco.

A notificação de progresso permite **Cancelar** a operação a qualquer instante. O processo é interrompido de imediato, preservando os lotes já concluídos no cache para retomada posterior.

## Limites e Configurações de Varredura

Nas configurações do VS Code, em `legacyAi`:

| Configuração | Padrão | Máximo permitido | Descrição |
|---|---:|---:|---|
| `legacyAi.maxFiles` | 2000 | 10000 | Quantidade máxima de arquivos indexados. |
| `legacyAi.maxFileBytes` | 262144 | 4194304 | Tamanho máximo por arquivo (256 KiB padrão). |
| `legacyAi.maxTotalBytes` | 16777216 | 67108864 | Orçamento total de leitura (16 MiB padrão). |
| `legacyAi.maxEntries` | 20000 | 100000 | Quantidade máxima de entradas navegadas. |
| `legacyAi.maxDepth` | 32 | 128 | Profundidade máxima de diretórios. |

## Arquitetura e Componentes

- **`WorkspaceScanner`**: enumeração assíncrona, respeito a regras `.gitignore` raiz e aninhadas, exclusão de segredos e binários, verificação de links simbólicos e controle de limites.
- **`TypeScriptAnalyzer`**: parser da TypeScript Compiler API que extrai AST, símbolos com linhas exatas, declarações, imports/exports e pontos de entrada candidatos.
- **`RepositoryIndex`**: índice e grafo de resolução de módulos locais em memória.
- **`prepareContext`**: particionamento determinístico de módulos por diretório, divisão de arquivos por instruções completas da AST e medição de bytes UTF-8 com reserva de cota.
- **`GeminiHttpClient`**: cliente HTTPS nativo usando `node:https`, sem dependências externas, com timeout de 30s, controle de payload e tradução padronizada de erros de cota e autenticação.
- **`GeminiBatchRunner`**: despachante com fila sequencial única, controle de janelas deslizantes de taxa (RPM e TPM), cota diária persistida com renovação no fuso do Pacífico e retentativas exponenciais respeitando `Retry-After`.
- **`explanations` / `validateExplanation`**: definição do esquema estruturado e validador severo que assegura aderência estrita de tipos, campos, limites e conformidade das referências de linhas com os trechos efetivamente enviados.
- **`DiskExplanationCache`**: persistência de explicações em disco (`globalStorageUri`), com chave determinística baseada no contexto + modelo + hash das dependências (invalidação automática em mudanças de código), com política de descarte LRU e autocura contra arquivos corrompidos.
- **`orchestrateExplanations`**: coordenador que confronta o snapshot atual com o cache, pula chamadas remotas para módulos inalterados, executa lotes pendentes e preserva resultados parciais em caso de interrupção.
- **`renderInventory`**: construtor do Markdown integrado, com cabeçalhos estritos de conclusão e sanitização completa de HTML e links arbitrários (`safe()`).

## Testes automatizados

A suíte de testes utiliza o test runner nativo do Node.js (`node --test`):

```powershell
npm run check
npm test
```

Resultados reais:
- `npm run check`: **0 erros de compilação**.
- `npm test`: **62 testes executados (61 aprovados, zero falhas, 1 ignorado** devido a restrições de privilégios de links simbólicos no Windows).
- Cobertura completa de cenários: varredura e exclusões, parser AST, limites de contexto, controle de taxa HTTP, cota diária, backoff de retentativas, validação de esquema, isolamento de cache, invalidação por dependência, sanitização contra XSS/injeção de links e integração de ponta a ponta na extensão.

## Verificação manual no VS Code

1. Abra o projeto no VS Code e pressione **F5** para iniciar o Extension Development Host.
2. Na janela de teste, cadastre sua chave via **Legacy AI: Configurar chave do Gemini**.
3. Abra as configurações de Usuário e defina `legacyAi.gemini.model` como `gemini-1.5-flash`, além das cotas da sua conta (`requestsPerMinute: 15`, `requestsPerDay: 1500`, `inputTokensPerMinute: 1000000`).
4. Abra a pasta `test/fixtures/project`.
5. Execute **Legacy AI: Analisar estrutura do projeto**.
6. Observe a notificação de progresso e o relatório Markdown aberto:
   - O cabeçalho exibirá `Estado do relatório: completo`.
   - A seção `## Entendendo o projeto` apresentará a responsabilidade dos módulos, componentes com resumo didático, relações, referências com linhas e notas de limitações.
   - O inventário técnico completo permanece preservado logo abaixo.
7. Execute a análise novamente: a execução será instantânea, com o relatório indicando que as explicações foram recuperadas do **cache local**.
8. Teste o comando **Legacy AI: Limpar cache das explicações do Gemini** e verifique a limpeza com sucesso.

## Limitações conhecidas

- A análise de código é sintática e estática: não executa código, não realiza inferência semântica completa de tipos dinâmicos e não garante correção lógica de regras de negócio.
- Referências a linhas de código comprovam apenas que a IA citou trechos presentes nos lotes enviados, não constituindo prova formal da veracidade da interpretação semântica.
- A faixa gratuita do Gemini depende de disponibilidade e cotas da sua conta Google AI Studio, que são compartilhadas entre aplicações associadas ao mesmo projeto Google Cloud.
