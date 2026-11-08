# Etapa 3 — Entrega técnica

## Arquivos

Criados: `src/analysis/models.ts`, `workspaceScanner.ts`, `typeScriptAnalyzer.ts`, `repositoryIndex.ts`, `analyzeRepository.ts`, `worker.ts` e `renderInventory.ts`; `test/analysis.test.cjs`, `test/extension.test.cjs` e os seis arquivos de `test/fixtures/project`; esta nota e `docs/example-inventory.md`.

Modificados: `src/extension.ts`, `package.json`, `package-lock.json`, `.vscodeignore` e `README.md`. `tsconfig.json`, `.gitignore`, configurações de depuração e tarefa foram preservados.

## Decisões

A exploração e o parser executam em worker. A interface recebe progresso limitado a aproximadamente uma atualização por 100 ms e um snapshot ao concluir. Cancelar termina o worker e preserva o índice anterior. Os módulos internos também aceitam um token cooperativo, utilizado nos testes.

Os filtros obrigatórios têm precedência sobre regras `.gitignore`; uma negação não pode reintroduzir segredos, links, dependências instaladas ou diretórios gerados. Regras de diretórios excluídos não são lidas. `.git/info/exclude` e regras globais do Git não fazem parte deste scanner.

A leitura é limitada por arquivo, bytes totais, arquivos aceitos, entradas visitadas e profundidade. O índice armazena texto, hash SHA-256 do texto UTF-8 decodificado, tamanho, símbolos, relações e posições. Consultas do índice não realizam I/O. Não há histórico persistente ou alterações automáticas no projeto.

O analisador recebe apenas texto fornecido pelo scanner. Não carrega scripts, plugins, tsconfig ou dependências do projeto e não executa o código de exemplo.

## Exemplo verificado

Projeto: `test/fixtures/project`, seis arquivos. Tipos: JavaScript, TypeScript, JSON e documentação.

| Elemento | Localização |
|---|---|
| Interface `User` | `src/user.ts:1–3` |
| Classe `UserService` | `src/user.ts:4–8` |
| Método `UserService.register` | `src/user.ts:5–7` |
| Constante `MAX_USERS` | `src/user.ts:9` |
| Função `registerUser` | `src/index.ts:3–5` |
| Função arrow `normalize` | `src/helper.js:2` |
| Import `./user` resolvido para `src/user.ts` | `src/index.ts:1` |
| Re-export `./user` resolvido para `src/user.ts` | `src/index.ts:2` |
| `require('./user')` resolvido para `src/user.ts` | `src/helper.js:1` |
| Dependência `express`, versão `^4.21.0` | `package.json:4` |
| Dependência de desenvolvimento `typescript`, versão `~5.9.3` | `package.json:5` |
| Candidato de entrada `src/index.ts` | `package.json:3` |

O erro sintático em `src/broken.ts` é registrado sem impedir os resultados dos demais arquivos. A dependência do exemplo é apenas um dado declarado; sua versão não é uma recomendação de instalação.

## Validação

- `npm test`: 27 testes, 26 aprovados, zero falhas, um teste não executado por falta de permissão para links de arquivo no Windows.
- Junction de diretório externo: bloqueio validado com link real.
- Workers reais: inventário, encerramento e cancelamento pela camada de comandos validados.
- Comandos: exercitados com API VS Code simulada, incluindo workspace vazio e modo restrito.
- Verificação visual no VS Code: pendente de execução manual conforme o README.

Os testes são locais e não fazem chamadas a LLM ou executam o projeto de exemplo. A Etapa 4 não foi iniciada.