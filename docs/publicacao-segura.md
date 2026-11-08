# Revisão antes de publicar o repositório

## O que foi encontrado

A revisão local encontrou um caminho absoluto com o usuário do Windows em `docs/example-inventory.md`. Esse caminho foi substituído por um exemplo genérico. A busca por padrões comuns nos arquivos de código, configuração e documentação não apontou outras credenciais aparentes. Isso não garante ausência de segredos: a revisão não incluiu o conteúdo de `node_modules/` e `out/`, e esta pasta ainda não tinha um repositório Git para examinar histórico.

## O que deixar fora do Git

- `node_modules/`: dependências recuperadas com `npm ci`.
- `out/`, `dist/`, `build/`, `coverage/`, logs e pacotes `*.vsix`: saídas geradas; podem conter código e caminhos locais.
- Arquivos `.env`, chaves privadas, certificados privados, arquivos de credenciais e configurações pessoais: protegidos pelos padrões do `.gitignore`.
- Inventários de projetos privados: revise antes de incluir. Podem revelar caminhos absolutos, nomes de arquivos, símbolos, dependências e mensagens de erro.

Não é necessário apagar dependências ou a compilação da sua máquina: basta mantê-las fora do commit. A exclusão de arquivos não foi feita nesta revisão.

Um eventual `.env.example` deve conter somente valores fictícios. O `.gitignore` permite esse nome para documentar configurações futuras; a versão atual não precisa desse arquivo.

## O que manter

Versione `src/`, `test/` e seus fixtures, `docs/` revisados, `README.md`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.vscodeignore`, `.vscode/launch.json` e `.vscode/tasks.json`.

Mantenha o lockfile para permitir `npm ci` com as versões registradas. Se futuramente usar um registro privado, revise URLs e referências internas do lockfile antes de publicar.

O `.vscodeignore` controla o conteúdo do pacote da extensão, não o Git. Seus padrões para `src/` e `test/` não impedem que esses diretórios sejam enviados ao repositório.

## Conferir o primeiro commit

Após criar o repositório Git, prepare os arquivos e confira exatamente o que será publicado:

```powershell
git init
git add .
git status --short
git diff --cached --stat
git diff --cached
```

Confira especialmente caminhos pessoais, e-mails privados, URLs internas e valores de tokens ou senhas. Esses comandos apenas preparam e mostram o commit; não publicam o repositório.

Se algum arquivo sensível já estiver rastreado, adicionar uma regra ao `.gitignore` não o remove do Git nem do histórico. Remova-o do índice antes de publicar e, se uma credencial já tiver sido exposta, revogue-a e substitua-a. Não basta apagar o valor na versão mais recente.
