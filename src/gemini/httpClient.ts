import { request } from 'node:https';

export type FailureCode = 'authentication' | 'daily-quota' | 'rate-limit' | 'temporary' | 'timeout' |
  'cancelled' | 'invalid-response' | 'request-rejected' | 'budget' | 'input-limit';

export class GeminiFailure extends Error {
  constructor(readonly code: FailureCode, readonly retryAfterMs?: number) {
    super(code);
    this.name = 'GeminiFailure';
  }
}

interface HttpResponse { status: number; body: unknown; retryAfter?: string }
export type GeminiTransport = (url: URL, key: string, body: string, signal: AbortSignal) => Promise<HttpResponse>;

const maxResponseBytes = 1024 * 1024;
export const httpsTransport: GeminiTransport = (url, key, body, signal) => new Promise((resolve, reject) => {
  const req = request(url, { method: 'POST', signal, headers: {
    'x-goog-api-key': key, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body)
  } }, response => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxResponseBytes) {
        reject(new GeminiFailure('invalid-response'));
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on('error', reject);
    response.on('end', () => {
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { parsed = undefined; }
      resolve({ status: response.statusCode ?? 0, body: parsed, retryAfter: response.headers['retry-after'] });
    });
  });
  req.on('error', reject);
  req.end(body);
});

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter(item => item !== undefined) : [];
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function responseFailure(response: HttpResponse, now: number): GeminiFailure {
  const error = record(record(response.body)?.error);
  const details = records(error?.details);
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : undefined;
  if (response.status === 401 || response.status === 403 ||
      details.some(detail => detail.reason === 'API_KEY_INVALID' || detail.reason === 'API_KEY_SERVICE_BLOCKED') ||
      (message && /api[ _-]?key/i.test(message))) {
    return new GeminiFailure('authentication');
  }
  let retryAfterMs: number | undefined;
  const retry = response.retryAfter?.trim();
  if (retry) {
    const ms = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now;
    if (Number.isFinite(ms)) { retryAfterMs = Math.max(0, ms); }
  }
  for (const detail of details) {
    const delay = detail.retryDelay;
    if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo' &&
        typeof delay === 'string' && /^\d+(?:\.\d+)?s$/.test(delay)) {
      retryAfterMs = Math.max(retryAfterMs ?? 0, Math.ceil(Number(delay.slice(0, -1)) * 1000));
    }
  }
  if (response.status === 429) {
    const quota = details.flatMap(detail => records(detail.violations))
      .flatMap(violation => [violation.quotaId, violation.quotaMetric]);
    const isDaily = [...quota, error?.message].some(value =>
      typeof value === 'string' && /per[ _-]?day|daily|\brpd\b/i.test(value));
    return isDaily ? new GeminiFailure('daily-quota') : new GeminiFailure('rate-limit', retryAfterMs);
  }
  if ([500, 502, 503, 504].includes(response.status)) { return new GeminiFailure('temporary', retryAfterMs); }
  return new GeminiFailure('request-rejected');
}

export interface GenerationRequest {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: 'user'; parts: { text: string }[] }[];
  generationConfig: {
    maxOutputTokens: number;
    responseMimeType?: string;
    responseSchema?: unknown;
  };
}

export interface GeneratedText {
  text: string;
  promptTokens?: number;
  outputTokens?: number;
}

export class GeminiHttpClient {
  private readonly model: string;
  constructor(model: string, private readonly key: string,
    private readonly transport: GeminiTransport = httpsTransport, private readonly timeoutMs = 30_000,
    private readonly now: () => number = Date.now) {
    this.model = typeof model === 'string' ? model.trim().replace(/^models\//, '') : '';
    if (!/^gemini-[a-z0-9][a-z0-9.-]{0,99}$/.test(this.model) || !key || /[^!-~]/.test(key) ||
        !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      throw new GeminiFailure('request-rejected');
    }
  }

  async countTokens(input: GenerationRequest, signal?: AbortSignal): Promise<number> {
    const response = await this.call('countTokens', { generateContentRequest: {
      ...input, model: `models/${this.model}`
    } }, signal);
    const count = tokenCount(record(response)?.totalTokens);
    if (count === undefined || count === 0) { throw new GeminiFailure('invalid-response'); }
    return count;
  }

  async generate(input: GenerationRequest, signal?: AbortSignal): Promise<GeneratedText> {
    const response = record(await this.call('generateContent', input, signal));
    const candidate = records(response?.candidates)[0];
    const text = records(record(candidate?.content)?.parts)
      .filter(part => part.thought !== true && typeof part.text === 'string').map(part => part.text).join('');
    if (candidate?.finishReason !== 'STOP' || !text.trim()) { throw new GeminiFailure('invalid-response'); }
    const usage = record(response?.usageMetadata);
    return { text, promptTokens: tokenCount(usage?.promptTokenCount), outputTokens: tokenCount(usage?.candidatesTokenCount) };
  }

  private async call(method: 'countTokens' | 'generateContent', body: object, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) { throw new GeminiFailure('cancelled'); }
    const controller = new AbortController();
    const cancel = (): void => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, this.timeoutMs);
    try {
      const response = await this.transport(
        new URL(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:${method}`),
        this.key, JSON.stringify(body), controller.signal
      );
      if (controller.signal.aborted) { throw new GeminiFailure('timeout'); }
      if (response.status < 200 || response.status >= 300) { throw responseFailure(response, this.now()); }
      return response.body;
    } catch (error) {
      if (signal?.aborted) { throw new GeminiFailure('cancelled'); }
      if (controller.signal.aborted) { throw new GeminiFailure('timeout'); }
      if (error instanceof GeminiFailure) { throw error; }
      throw new GeminiFailure('temporary');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}
