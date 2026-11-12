# Inventário técnico — Legacy AI

Projeto: Legacy AI

Localização: C:\\Users\\danil\\Documents\\Code\\IFPE\\Engenharia de Software\\Engenharia\_de\_software

Estado: concluído com limitações — consulte os detalhes.

Arquivos lidos e indexados: 22. Entradas visitadas: 36. Bytes lidos (incluindo regras e arquivos rejeitados após leitura): 85889.

Linguagens/tipos: Documentation, JSON, TypeScript, JavaScript.

Limites: maxFiles=2000; maxFileBytes=262144; maxTotalBytes=16777216; maxEntries=20000; maxDepth=32.

## Estrutura de diretórios e arquivos

Somente arquivos aceitos; diretórios excluídos não são enumerados internamente.

- docs/
- src/
- src/analysis/
- test/
- test/fixtures/
- test/fixtures/project/
- test/fixtures/project/src/
- docs/como-iniciar\.md — Documentation, 2791 bytes
- docs/example-inventory\.md — Documentation, 3581 bytes
- docs/stage3\.md — Documentation, 3385 bytes
- package\.json — JSON, 7824 bytes
- README\.md — Documentation, 8045 bytes
- src/analysis/analyzeRepository\.ts — TypeScript, 1160 bytes
- src/analysis/models\.ts — TypeScript, 1444 bytes
- src/analysis/renderInventory\.ts — TypeScript, 5226 bytes
- src/analysis/repositoryIndex\.ts — TypeScript, 2665 bytes
- src/analysis/typeScriptAnalyzer\.ts — TypeScript, 7509 bytes
- src/analysis/worker\.ts — TypeScript, 824 bytes
- src/analysis/workspaceScanner\.ts — TypeScript, 11969 bytes
- src/extension\.ts — TypeScript, 6808 bytes
- test/analysis\.test\.cjs — JavaScript, 15563 bytes
- test/extension\.test\.cjs — JavaScript, 5240 bytes
- test/fixtures/project/package\.json — JSON, 154 bytes
- test/fixtures/project/README\.md — Documentation, 168 bytes
- test/fixtures/project/src/broken\.ts — TypeScript, 25 bytes
- test/fixtures/project/src/helper\.js — JavaScript, 258 bytes
- test/fixtures/project/src/index\.ts — TypeScript, 169 bytes
- test/fixtures/project/src/user\.ts — TypeScript, 166 bytes
- tsconfig\.json — JSON, 411 bytes

## Símbolos: classes, interfaces, funções e demais declarações

- function analyzeRepository — src/analysis/analyzeRepository\.ts:7–23
- interface Cancellation — src/analysis/models\.ts:1–1
- interface ScanLimits — src/analysis/models\.ts:2–8
- constant defaultLimits — src/analysis/models\.ts:9–12
- interface SourcePosition — src/analysis/models\.ts:13–13
- interface SourceSymbol — src/analysis/models\.ts:14–14
- interface ModuleReference — src/analysis/models\.ts:15–20
- interface Dependency — src/analysis/models\.ts:21–21
- interface EntryPoint — src/analysis/models\.ts:22–22
- interface FileRecord — src/analysis/models\.ts:23–27
- interface ScanResult — src/analysis/models\.ts:28–33
- function safe — src/analysis/renderInventory\.ts:4–7
- function location — src/analysis/renderInventory\.ts:8–8
- function renderInventory — src/analysis/renderInventory\.ts:9–60
- class RepositoryIndex — src/analysis/repositoryIndex\.ts:5–47
- constructor RepositoryIndex\.constructor — src/analysis/repositoryIndex\.ts:7–12
- accessor RepositoryIndex\.files — src/analysis/repositoryIndex\.ts:13–13
- method RepositoryIndex\.getFile — src/analysis/repositoryIndex\.ts:14–14
- method RepositoryIndex\.findSymbols — src/analysis/repositoryIndex\.ts:15–18
- method RepositoryIndex\.importsFrom — src/analysis/repositoryIndex\.ts:19–19
- method RepositoryIndex\.dependentsOf — src/analysis/repositoryIndex\.ts:20–22
- method RepositoryIndex\.resolve — src/analysis/repositoryIndex\.ts:23–46
- class TypeScriptAnalyzer — src/analysis/typeScriptAnalyzer\.ts:5–115
- method TypeScriptAnalyzer\.analyze — src/analysis/typeScriptAnalyzer\.ts:6–114
- function position — src/analysis/typeScriptAnalyzer\.ts:11–15
- function textName — src/analysis/typeScriptAnalyzer\.ts:22–22
- function addReference — src/analysis/typeScriptAnalyzer\.ts:23–27
- function visit — src/analysis/typeScriptAnalyzer\.ts:28–76
- function collect — src/analysis/typeScriptAnalyzer\.ts:105–110
- constant token — src/analysis/worker\.ts:5–5
- constant options — src/analysis/worker\.ts:7–7
- variable lastProgress — src/analysis/worker\.ts:8–8
- constant excludedDirectories — src/analysis/workspaceScanner\.ts:8–11
- constant generated — src/analysis/workspaceScanner\.ts:12–12
- constant sensitive — src/analysis/workspaceScanner\.ts:13–13
- function language — src/analysis/workspaceScanner\.ts:14–20
- function inside — src/analysis/workspaceScanner\.ts:21–24
- interface IgnoreScope — src/analysis/workspaceScanner\.ts:25–25
- class WorkspaceScanner — src/analysis/workspaceScanner\.ts:28–193
- method WorkspaceScanner\.scan — src/analysis/workspaceScanner\.ts:29–192
- function addLimit — src/analysis/workspaceScanner\.ts:46–48
- function checkCancelled — src/analysis/workspaceScanner\.ts:49–52
- function securePath — src/analysis/workspaceScanner\.ts:53–64
- function readText — src/analysis/workspaceScanner\.ts:65–106
- function walk — src/analysis/workspaceScanner\.ts:107–186
- function selectFolder — src/extension\.ts:8–22
- function showMarkdown — src/extension\.ts:24–27
- function runWorker — src/extension\.ts:29–58
- function finish — src/extension\.ts:38–46
- function activate — src/extension\.ts:60–123
- function analyze — src/extension\.ts:63–92
- constant test — test/analysis\.test\.cjs:1–1
- constant assert — test/analysis\.test\.cjs:2–2
- constant fs — test/analysis\.test\.cjs:3–3
- constant path — test/analysis\.test\.cjs:4–4
- constant os — test/analysis\.test\.cjs:5–5
- constant \{ Worker \} — test/analysis\.test\.cjs:6–6
- constant \{ WorkspaceScanner \} — test/analysis\.test\.cjs:7–7
- constant \{ analyzeRepository \} — test/analysis\.test\.cjs:8–8
- constant \{ RepositoryIndex \} — test/analysis\.test\.cjs:9–9
- constant \{ renderInventory \} — test/analysis\.test\.cjs:10–10
- constant \{ TypeScriptAnalyzer \} — test/analysis\.test\.cjs:11–11
- constant fixture — test/analysis\.test\.cjs:12–12
- constant active — test/analysis\.test\.cjs:13–13
- function project — test/analysis\.test\.cjs:15–24
- function record — test/analysis\.test\.cjs:26–29
- constant test — test/extension\.test\.cjs:1–1
- constant assert — test/extension\.test\.cjs:2–2
- constant Module — test/extension\.test\.cjs:3–3
- constant path — test/extension\.test\.cjs:4–4
- function setup — test/extension\.test\.cjs:6–40
- method getConfiguration — test/extension\.test\.cjs:14–14
- method get — test/extension\.test\.cjs:14–14
- method openTextDocument — test/extension\.test\.cjs:15–15
- method showInformationMessage — test/extension\.test\.cjs:18–18
- method showWarningMessage — test/extension\.test\.cjs:19–19
- method showTextDocument — test/extension\.test\.cjs:20–20
- method showErrorMessage — test/extension\.test\.cjs:21–21
- method withProgress — test/extension\.test\.cjs:22–24
- method report — test/extension\.test\.cjs:23–23
- method onCancellationRequested — test/extension\.test\.cjs:23–23
- method dispose — test/extension\.test\.cjs:23–23
- method showWorkspaceFolderPick — test/extension\.test\.cjs:25–25
- class CancellationError — test/extension\.test\.cjs:27–27
- method registerCommand — test/extension\.test\.cjs:29–29
- method dispose — test/extension\.test\.cjs:29–29
- constant fixturePath — test/extension\.test\.cjs:76–76
- method report — test/extension\.test\.cjs:99–99
- accessor isCancellationRequested — test/extension\.test\.cjs:100–100
- method onCancellationRequested — test/extension\.test\.cjs:101–104
- method dispose — test/extension\.test\.cjs:103–103
- function broken — test/fixtures/project/src/broken\.ts:1–1
- constant \{ UserService \} — test/fixtures/project/src/helper\.js:1–1
- function normalize — test/fixtures/project/src/helper\.js:2–2
- function registerUser — test/fixtures/project/src/index\.ts:3–5
- interface User — test/fixtures/project/src/user\.ts:1–3
- class UserService — test/fixtures/project/src/user\.ts:4–8
- method UserService\.register — test/fixtures/project/src/user\.ts:5–7
- constant MAX\_USERS — test/fixtures/project/src/user\.ts:9–9

## Imports e relações entre módulos

- src/analysis/analyzeRepository\.ts:1–1 — import node:timers/promises → external
- src/analysis/analyzeRepository\.ts:2–2 — import \./models → src/analysis/models\.ts
- src/analysis/analyzeRepository\.ts:3–3 — import \./workspaceScanner → src/analysis/workspaceScanner\.ts
- src/analysis/analyzeRepository\.ts:4–4 — import \./typeScriptAnalyzer → src/analysis/typeScriptAnalyzer\.ts
- src/analysis/analyzeRepository\.ts:5–5 — import \./repositoryIndex → src/analysis/repositoryIndex\.ts
- src/analysis/renderInventory\.ts:1–1 — import \./repositoryIndex → src/analysis/repositoryIndex\.ts
- src/analysis/renderInventory\.ts:2–2 — import \./models → src/analysis/models\.ts
- src/analysis/repositoryIndex\.ts:1–1 — import node:path → external
- src/analysis/repositoryIndex\.ts:2–2 — import \./models → src/analysis/models\.ts
- src/analysis/typeScriptAnalyzer\.ts:1–1 — import typescript → external
- src/analysis/typeScriptAnalyzer\.ts:2–2 — import \./models → src/analysis/models\.ts
- src/analysis/worker\.ts:1–1 — import node:worker\_threads → external
- src/analysis/worker\.ts:2–2 — import \./analyzeRepository → src/analysis/analyzeRepository\.ts
- src/analysis/worker\.ts:3–3 — import \./models → src/analysis/models\.ts
- src/analysis/workspaceScanner\.ts:1–1 — import node:fs/promises → external
- src/analysis/workspaceScanner\.ts:2–2 — import node:path → external
- src/analysis/workspaceScanner\.ts:3–3 — import node:crypto → external
- src/analysis/workspaceScanner\.ts:4–4 — import-equals ignore → external
- src/analysis/workspaceScanner\.ts:5–5 — import ignore → external
- src/analysis/workspaceScanner\.ts:6–6 — import \./models → src/analysis/models\.ts
- src/extension\.ts:1–1 — import vscode → external
- src/extension\.ts:2–2 — import node:path → external
- src/extension\.ts:3–3 — import node:worker\_threads → external
- src/extension\.ts:4–4 — import \./analysis/models → src/analysis/models\.ts
- src/extension\.ts:5–5 — import \./analysis/repositoryIndex → src/analysis/repositoryIndex\.ts
- src/extension\.ts:6–6 — import \./analysis/renderInventory → src/analysis/renderInventory\.ts
- test/analysis\.test\.cjs:1–1 — require node:test → external
- test/analysis\.test\.cjs:2–2 — require node:assert/strict → external
- test/analysis\.test\.cjs:3–3 — require node:fs/promises → external
- test/analysis\.test\.cjs:4–4 — require node:path → external
- test/analysis\.test\.cjs:5–5 — require node:os → external
- test/analysis\.test\.cjs:6–6 — require node:worker\_threads → external
- test/analysis\.test\.cjs:7–7 — require \.\./out/analysis/workspaceScanner → unresolved
- test/analysis\.test\.cjs:8–8 — require \.\./out/analysis/analyzeRepository → unresolved
- test/analysis\.test\.cjs:9–9 — require \.\./out/analysis/repositoryIndex → unresolved
- test/analysis\.test\.cjs:10–10 — require \.\./out/analysis/renderInventory → unresolved
- test/analysis\.test\.cjs:11–11 — require \.\./out/analysis/typeScriptAnalyzer → unresolved
- test/extension\.test\.cjs:1–1 — require node:test → external
- test/extension\.test\.cjs:2–2 — require node:assert/strict → external
- test/extension\.test\.cjs:3–3 — require node:module → external
- test/extension\.test\.cjs:4–4 — require node:path → external
- test/fixtures/project/src/helper\.js:1–1 — require \./user → test/fixtures/project/src/user\.ts
- test/fixtures/project/src/index\.ts:1–1 — import \./user → test/fixtures/project/src/user\.ts
- test/fixtures/project/src/index\.ts:2–2 — re-export \./user → test/fixtures/project/src/user\.ts

## Exports

- analyzeRepository (export) — src/analysis/analyzeRepository\.ts:7–23
- Cancellation (export) — src/analysis/models\.ts:1–1
- ScanLimits (export) — src/analysis/models\.ts:2–8
- defaultLimits (export) — src/analysis/models\.ts:9–12
- SourcePosition (export) — src/analysis/models\.ts:13–13
- SourceSymbol (export) — src/analysis/models\.ts:14–14
- ModuleReference (export) — src/analysis/models\.ts:15–20
- Dependency (export) — src/analysis/models\.ts:21–21
- EntryPoint (export) — src/analysis/models\.ts:22–22
- FileRecord (export) — src/analysis/models\.ts:23–27
- ScanResult (export) — src/analysis/models\.ts:28–33
- renderInventory (export) — src/analysis/renderInventory\.ts:9–60
- RepositoryIndex (export) — src/analysis/repositoryIndex\.ts:5–47
- TypeScriptAnalyzer (export) — src/analysis/typeScriptAnalyzer\.ts:5–115
- WorkspaceScanner (export) — src/analysis/workspaceScanner\.ts:28–193
- activate (export) — src/extension\.ts:60–123
- broken (export) — test/fixtures/project/src/broken\.ts:1–1
- module\.exports (commonjs-export) — test/fixtures/project/src/helper\.js:3–3
- \{ UserService \} (export) — test/fixtures/project/src/index\.ts:2–2
- registerUser (export) — test/fixtures/project/src/index\.ts:3–5
- User (export) — test/fixtures/project/src/user\.ts:1–3
- UserService (export) — test/fixtures/project/src/user\.ts:4–8
- MAX\_USERS (export) — test/fixtures/project/src/user\.ts:9–9

## Dependências declaradas

- @types/node: ^20\.19\.43 [devDependencies] — package\.json:98–98
- @types/vscode: 1\.85\.0 [devDependencies] — package\.json:99–99
- ignore: ^7\.0\.5 [dependencies] — package\.json:102–102
- typescript: \~5\.9\.3 [dependencies] — package\.json:103–103
- express: ^4\.21\.0 [dependencies] — test/fixtures/project/package\.json:4–4
- typescript: \~5\.9\.3 [devDependencies] — test/fixtures/project/package\.json:5–5

## Possíveis pontos de entrada

- \./out/extension\.js — Declaração package\.json:main; não executada — package\.json:13–13
- src/index\.ts — Declaração package\.json:main; não executada — test/fixtures/project/package\.json:3–3
- test/fixtures/project/src/index\.ts — Convenção de nome; candidato, sem confirmação de execução — test/fixtures/project/src/index\.ts:1–1

## Arquivos e diretórios ignorados

- \.git — Diretório de dependências, gerado ou interno
- \.gitignore — Arquivo de regras aplicado ao scanner
- \.vscode — Diretório de dependências, gerado ou interno
- \.vscodeignore — Extensão fora do escopo
- node\_modules — Diretório de dependências, gerado ou interno
- out — Diretório de dependências, gerado ou interno
- package-lock\.json — Arquivo gerado ou lockfile

## Erros e falhas de análise

- test/fixtures/project/src/broken\.ts:1: '\}' expected\.

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