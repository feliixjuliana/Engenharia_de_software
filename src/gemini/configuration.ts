export interface GeminiConfiguration {
  model: string;
  maxRequests: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  requestsPerMinute: number;
  requestsPerDay: number;
  inputTokensPerMinute: number;
}

// These are application budgets, not advertised Gemini quotas.
export const geminiDefaults: GeminiConfiguration = {
  model: '', maxRequests: 5, maxInputTokens: 8000, maxOutputTokens: 1500,
  requestsPerMinute: 0, requestsPerDay: 0, inputTokensPerMinute: 0
};

export function readGeminiConfiguration(get: (key: string, fallback: unknown) => unknown): GeminiConfiguration {
  let model = get('gemini.model', geminiDefaults.model);
  if (typeof model === 'string') {
    model = model.trim().replace(/^models\//, '');
  }
  if (typeof model !== 'string' || !/^gemini-[a-z0-9][a-z0-9.-]{0,99}$/.test(model)) {
    throw new Error('Configure legacyAi.gemini.model com o identificador do modelo gratuito disponível no seu AI Studio.');
  }
  const values: Record<string, number> = {};
  const maximums = {
    maxRequests: 100, maxInputTokens: 100000, maxOutputTokens: 16000,
    requestsPerMinute: 1000, requestsPerDay: 100000, inputTokensPerMinute: 10000000
  };
  for (const [key, maximum] of Object.entries(maximums)) {
    const value = get(`gemini.${key}`, geminiDefaults[key as keyof GeminiConfiguration]);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error(`Configure legacyAi.gemini.${key} com um inteiro entre 1 e ${maximum}. Consulte as cotas da sua conta.`);
    }
    values[key] = value;
  }
  if (values.maxInputTokens! > values.inputTokensPerMinute!) {
    throw new Error('legacyAi.gemini.maxInputTokens não pode exceder inputTokensPerMinute.');
  }
  return { model, ...values } as GeminiConfiguration;
}
