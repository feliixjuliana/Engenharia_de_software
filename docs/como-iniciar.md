# Como iniciar o Legacy AI

O Legacy AI é uma extensão do VS Code Desktop. Nesta etapa, analisa arquivos JavaScript e TypeScript localmente, sem backend, servidor HTTP ou chave de API. Não há comando `npm start`.

## Requisitos

- VS Code Desktop 1.85 ou superior.
- Node.js 20 ou superior e npm disponíveis no terminal.
- Git, se for clonar o repositório.

## Instalar e verificar

Clone o repositório e abra sua pasta raiz no VS Code, onde está o `package.json`. No terminal integrado, execute:

```powershell
node --version
npm --version
npm ci
npm run check
npm test
```

No PowerShell, se a política de execução bloquear `npm.ps1`, use `npm.cmd` no lugar de `npm`.

Execute esses comandos na raiz da extensão. Não é necessário instalar dependências dentro de `test/fixtures/project`.

## Abrir a extensão

1. Abra **Executar e Depurar** no VS Code.
2. Selecione **Executar Legacy AI** e pressione **F5**.
3. A tarefa de pré-execução compila o TypeScript em `out/` e abre outra janela, o **Extension Development Host**.
4. Nessa nova janela, abra `test/fixtures/project` ou outra pasta local que você confie.
5. Pressione **Ctrl+Shift+P** e execute **Legacy AI: Analisar estrutura do projeto**.
6. O resultado aparece em um documento Markdown não salvo. Use **Markdown: Open Preview** para visualizá-lo.

O exemplo contém seis arquivos e um erro sintático intencional em `src/broken.ts`. O inventário deve registrar esse erro e continuar analisando os demais arquivos. Não execute os arquivos do exemplo.

A análise exige um workspace confiável. Revise a pasta antes de autorizar a confiança no VS Code.

## Durante o desenvolvimento

```powershell
npm run compile
npm run watch
```

`compile` compila uma vez; `watch` recompila ao salvar os fontes. Encerre o modo de observação com **Ctrl+C**. Reinicie a sessão de depuração para carregar o código recompilado.

As configurações versionadas de depuração usam `npm.cmd`, para Windows. No Linux/macOS, altere o campo `command` de `.vscode/tasks.json` para `npm`.

## Problemas comuns

- **Comandos Legacy AI não aparecem:** execute-os na janela Extension Development Host aberta pelo F5.
- **Worker ou `out/extension.js` ausente:** execute `npm run compile` na raiz e reinicie a depuração.
- **Nenhuma pasta selecionada:** abra uma pasta local na janela de teste.
- **Resultado antigo:** execute uma nova análise. **Mostrar último inventário** reutiliza o resultado em memória.
- **Inventário parcial:** consulte os limites e exclusões indicados no relatório e as configurações `legacyAi` do VS Code.

Não há arquivo `.env` obrigatório. O inventário permanece em memória; salvar o documento Markdown é uma ação manual.
