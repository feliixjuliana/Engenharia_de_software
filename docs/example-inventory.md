# Inventário técnico — Legacy AI

Projeto: legacy-example

Localização: /caminho/do/repositorio/test/fixtures/project

Estado: concluído com limitações — consulte os detalhes.

Arquivos lidos e indexados: 6. Entradas visitadas: 7. Bytes lidos (incluindo regras e arquivos rejeitados após leitura): 916.

Linguagens/tipos: JSON, Documentation, TypeScript, JavaScript.

Limites: maxFiles=2000; maxFileBytes=262144; maxTotalBytes=16777216; maxEntries=20000; maxDepth=32.

## Estrutura de diretórios e arquivos

Somente arquivos aceitos; diretórios excluídos não são enumerados internamente.

- src/
- package\.json — JSON, 149 bytes
- README\.md — Documentation, 165 bytes
- src/broken\.ts — TypeScript, 25 bytes
- src/helper\.js — JavaScript, 254 bytes
- src/index\.ts — TypeScript, 165 bytes
- src/user\.ts — TypeScript, 158 bytes

## Símbolos: classes, interfaces, funções e demais declarações

- function broken — src/broken\.ts:1–1
- constant \{ UserService \} — src/helper\.js:1–1
- function normalize — src/helper\.js:2–2
- function registerUser — src/index\.ts:3–5
- interface User — src/user\.ts:1–3
- class UserService — src/user\.ts:4–8
- method UserService\.register — src/user\.ts:5–7
- constant MAX\_USERS — src/user\.ts:9–9

## Imports e relações entre módulos

- src/helper\.js:1–1 — require \./user → src/user\.ts
- src/index\.ts:1–1 — import \./user → src/user\.ts
- src/index\.ts:2–2 — re-export \./user → src/user\.ts

## Exports

- broken (export) — src/broken\.ts:1–1
- module\.exports (commonjs-export) — src/helper\.js:3–3
- \{ UserService \} (export) — src/index\.ts:2–2
- registerUser (export) — src/index\.ts:3–5
- User (export) — src/user\.ts:1–3
- UserService (export) — src/user\.ts:4–8
- MAX\_USERS (export) — src/user\.ts:9–9

## Dependências declaradas

- express: ^4\.21\.0 [dependencies] — package\.json:4–4
- typescript: \~5\.9\.3 [devDependencies] — package\.json:5–5

## Possíveis pontos de entrada

- src/index\.ts — Declaração package\.json:main; não executada — package\.json:3–3
- src/index\.ts — Convenção de nome; candidato, sem confirmação de execução — src/index\.ts:1–1

## Arquivos e diretórios ignorados

Nenhuma exclusão registrada.

## Erros e falhas de análise

- src/broken\.ts:1: '\}' expected\.

## Limitações

- Análise estática sintática de arquivos UTF-8 salvos; nenhum código foi executado.
- Conteúdo do editor ainda não salvo não é incluído. Arquivos podem mudar durante a execução; não há snapshot transacional.
- Imports relativos usam candidatos do índice; múltiplos candidatos permanecem não resolvidos. Sem resolução de aliases, tsconfig paths, package exports ou grafo de chamadas.
- Bare imports são classificados como externos; podem representar aliases não reconhecidos. Dependências declaradas não comprovam uso.
- Apenas imports com strings literais são extraídos. Pontos de entrada são candidatos, sem confirmação de comportamento.
- Exclusões por nome/cabeçalho não detectam todos os arquivos gerados ou segredos presentes em código.
- Diretórios excluídos são registrados uma vez; seus descendentes e entradas além dos limites não são inventariados.
- JSON inválido e erros sintáticos são registrados; não há verificação semântica ou de tipos.
- Nenhum dado foi enviado a serviços externos e nenhum arquivo do projeto foi alterado.