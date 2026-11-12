# Instruções do projeto

## Plano da integração Gemini

Antes de trabalhar na integração de IA, consulte [o checklist da integração Gemini](docs/plano-integracao-gemini.md) e identifique a etapa aprovada e suas pendências.

- A integração Gemini é obrigatória para concluir o relatório. Explicações válidas em cache satisfazem essa exigência; inventário técnico sem explicações deve ser identificado como resultado parcial.
- Implemente somente a etapa autorizada. O plano não constitui autorização automática para iniciar etapas seguintes ou realizar ações sensíveis.
- Atualize o checklist conforme os itens forem efetivamente implementados e validados. Não marque trabalho planejado ou validação não executada como concluídos.
- Ao finalizar uma etapa, registre no próprio plano uma breve explicação do que foi implementado, quais arquivos/responsabilidades foram afetados, verificações executadas e seus resultados, além de limitações e pendências.
- Se a etapa estiver incompleta, registre o progresso parcial e mantenha os itens pendentes desmarcados.
- Registre alterações de direção aprovadas pelo usuário no plano para manter documentação e implementação alinhadas.
- Preserve alterações preexistentes do usuário e nunca inclua chaves, segredos ou conteúdo privado nos registros de progresso.

## Validação

Para mudanças de código, use as verificações pertinentes ao escopo. Os comandos existentes são `npm run check` e `npm test`. Registre resultados reais; testes simulados não substituem a validação manual no VS Code nem a verificação controlada da integração real.
