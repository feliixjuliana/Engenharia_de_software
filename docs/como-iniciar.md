# Como iniciar o Legacy AI

O Legacy AI é uma extensão do VS Code Desktop que analisa projetos JavaScript e TypeScript, gerando um inventário técnico estático enriquecido com explicações modulares geradas pela inteligência artificial do Google Gemini.

## Requisitos

- VS Code Desktop 1.85 ou superior.
- Node.js 20 ou superior e npm disponíveis no terminal.
- Uma conta no [Google AI Studio](https://aistudio.google.com/) com chave de API gerada.
- Git, se for clonar o repositório.

## Instalar e verificar

Abra a pasta do projeto no VS Code e, no terminal integrado, execute:

```powershell
node --version
npm --version
npm ci
npm run check
npm test
```

> [!NOTE]
> No PowerShell do Windows, se a política de execução bloquear scripts `.ps1`, utilize o comando `npm.cmd` no lugar de `npm`.

## Configuração do Gemini

Antes de iniciar a depuração, você pode deixar configurado o modelo e a chave de acesso:

### 1. Cadastrar a chave de API
Na paleta de comandos do VS Code (**Ctrl+Shift+P**):
1. Digite e selecione **Legacy AI: Configurar chave do Gemini**.
2. Cole sua chave obtida no Google AI Studio. O campo é mascarado e a chave é armazenada de forma criptografada no `SecretStorage` do VS Code.
3. Se precisar remover a chave futuramente, use o comando **Legacy AI: Remover chave do Gemini**.

### 2. Configurações da extensão
Abra as configurações do VS Code (**Ctrl+,**), filtre por `legacyAi.gemini` e informe os parâmetros da sua conta gratuita observados na tela de **Limite de taxa** do AI Studio. Por exemplo, para o modelo `gemini-2.5-flash-lite`:
- **`legacyAi.gemini.model`**: `gemini-2.5-flash-lite` (ou o modelo ativo confirmado no seu AI Studio, como `gemini-1.5-flash`).
- **`legacyAi.gemini.requestsPerMinute`**: `10` (ou o valor da coluna RPM do seu modelo).
- **`legacyAi.gemini.requestsPerDay`**: `20` (ou o valor da coluna RPD do seu modelo).
- **`legacyAi.gemini.inputTokensPerMinute`**: `250000` (ou o valor da coluna TPM do seu modelo).
- **`legacyAi.gemini.maxRequests`**: `5` (limite local de requisições por execução).
- **`legacyAi.gemini.maxInputTokens`**: `8000`.
- **`legacyAi.gemini.maxOutputTokens`**: `1500`.

## Abrir e executar a extensão

1. Pressione **F5** no VS Code (ou acesse a aba **Executar e Depurar** e selecione **Executar Legacy AI**).
2. O VS Code compilará a extensão e abrirá uma janela de desenvolvimento separada (**Extension Development Host**).
3. Nessa janela de teste, abra uma pasta local confiável que você deseje analisar (para reproduzir os testes com exemplo controlado, abra `test/fixtures/project`).
4. Pressione **Ctrl+Shift+P** e execute o comando **Legacy AI: Analisar estrutura do projeto**.
5. A extensão executará a leitura estática e, em seguida, fará a consulta ao Gemini para gerar as explicações modulares.
6. Um documento Markdown temporário será aberto na tela contendo:
   - **Cabeçalho com estado de conclusão**: indicando relatório **completo** (se todos os módulos foram explicados) ou **parcial** (se houve cancelamento, falta de cota ou chave pendente).
   - **Seção "Entendendo o projeto"**: com responsabilidade, componentes, relações, referências no código e origem (`cache local` ou `API do Gemini`).
   - **Inventário técnico detalhado**: com símbolos, imports, exports, dependências e limitações.
7. Para visualizar o Markdown formatado, pressione **Ctrl+Shift+V** (**Markdown: Open Preview**).

## Testando o Cache e a Retomada

- **Reutilização de cache**: Execute a análise novamente no mesmo projeto. O processamento será imediato, sem consumir novas chamadas à API, pois o sistema reaproveita o cache persistente.
- **Invalidação inteligente**: Modifique um arquivo do projeto (como `src/user.ts`) e rode a análise novamente. Apenas o módulo alterado e seus dependentes serão reanalisados pelo Gemini; os demais continuarão em cache.
- **Limpeza de cache**: Para apagar o histórico de explicações salvas em disco, execute o comando **Legacy AI: Limpar cache das explicações do Gemini** na paleta de comandos.

## Problemas comuns

- **Comandos do Legacy AI não aparecem:** Certifique-se de estar executando os comandos na janela secundária aberta após pressionar **F5** (Extension Development Host).
- **Relatório parcial por falta de modelo ou cota:** Verifique se as configurações de usuário `legacyAi.gemini.model` e as cotas por minuto/dia foram devidamente preenchidas nas configurações do VS Code.
- **Relatório parcial por chave ausente:** Cadastre a chave através de **Legacy AI: Configurar chave do Gemini** na paleta de comandos.
- **A análise foi cancelada:** É possível cancelar a execução a qualquer momento na notificação de progresso. O que já tiver sido processado é mantido no cache para a próxima execução.
