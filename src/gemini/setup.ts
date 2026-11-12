import * as vscode from 'vscode';

const secretKey = 'legacyAi.gemini.apiKey';

export async function configureGeminiKey(context: vscode.ExtensionContext): Promise<boolean> {
  if (!vscode.workspace.isTrusted) {
    await vscode.window.showWarningMessage('Legacy AI: configure a chave em um workspace confiável.');
    return false;
  }
  const key = await vscode.window.showInputBox({
    title: 'Legacy AI — Chave do Gemini', password: true, ignoreFocusOut: true,
    prompt: 'Cole a chave do seu projeto gratuito. Ela será guardada no armazenamento seguro do VS Code. Escape mantém a chave anterior.',
    validateInput: value => value.trim().length === 0 || /\s/.test(value.trim())
      ? 'Informe uma chave sem espaços.' : undefined
  });
  if (key === undefined || !vscode.workspace.isTrusted) { return false; }
  if (!key.trim() || /\s/.test(key.trim())) { return false; }
  try {
    await context.secrets.store(secretKey, key.trim());
    await vscode.window.showInformationMessage('Legacy AI: chave armazenada. Sua validade e a gratuidade da conta ainda não foram verificadas pela API.');
    return true;
  } catch {
    await vscode.window.showErrorMessage('Legacy AI: não foi possível armazenar a chave no armazenamento seguro.');
    return false;
  }
}

export async function removeGeminiKey(context: vscode.ExtensionContext): Promise<void> {
  try {
    await context.secrets.delete(secretKey);
    await vscode.window.showInformationMessage('Legacy AI: chave do Gemini removida.');
  } catch {
    await vscode.window.showErrorMessage('Legacy AI: não foi possível remover a chave do armazenamento seguro.');
  }
}
