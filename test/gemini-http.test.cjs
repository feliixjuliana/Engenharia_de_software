const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const { GeminiBatchRunner } = require('../out/gemini/runBatches');

const configuration = { model: 'gemini-test-model', maxRequests: 6, maxInputTokens: 80, maxOutputTokens: 100,
  requestsPerMinute: 3, requestsPerDay: 15, inputTokensPerMinute: 100 };
const syntheticKey = 'synthetic-test-credential';
const plan = (count = 1) => ({
  maxOutputTokens: 80,
  batches: Array.from({ length: count }, (_, index) => ({ payload: JSON.stringify({ module: `module-${index}` }) }))
});
const countResponse = (totalTokens = 30) => ({ status: 200, body: { totalTokens } });
const generationResponse = (promptTokenCount = 30) => ({
  status: 200, body: { candidates: [{ finishReason: 'STOP', content: { parts: [
    { text: 'hidden', thought: true }, { text: 'Explicação.' }
  ] } }], usageMetadata: { promptTokenCount, candidatesTokenCount: 7 } }
});

function simulate(handler, overrides = {}, timeoutMs) {
  const initial = Date.parse('2026-11-11T12:00:00Z');
  let now = initial;
  const calls = [];
  const waits = [];
  const runner = new GeminiBatchRunner({ ...configuration, ...overrides }, syntheticKey,
    async (url, key, body, signal) => {
      assert.equal(url.origin, 'https://generativelanguage.googleapis.com');
      assert.equal(url.search, '');
      assert.equal(key, syntheticKey);
      assert(!body.includes(syntheticKey));
      const operation = url.pathname.endsWith(':countTokens') ? 'count' : 'generate';
      assert.equal(url.pathname, `/v1beta/models/gemini-test-model:${operation === 'count' ? 'countTokens' : 'generateContent'}`);
      calls.push({ operation, time: now - initial, body: JSON.parse(body) });
      return handler ? handler(operation, signal, calls.at(-1)) :
        operation === 'count' ? countResponse() : generationResponse();
    }, timeoutMs, () => now, async (ms, signal) => {
      assert(!signal?.aborted);
      waits.push(ms);
      now += ms;
    });
  return { runner, calls, waits, advance: ms => { now += ms; } };
}

test('counts the generation input, caps output and sends each batch independently', async () => {
  const { runner, calls } = simulate();
  const result = await runner.run(plan(2));
  assert.deepEqual(result.attempts, { count: 2, generate: 2 });
  assert.equal(result.nextBatch, 2);
  assert.equal(result.stopped, undefined);
  for (let i = 0; i < 2; i++) {
    const { model, ...countInput } = calls[i * 2].body.generateContentRequest;
    const input = calls[i * 2 + 1].body;
    assert.equal(model, 'models/gemini-test-model');
    assert.deepEqual(countInput, input);
    assert.equal(input.generationConfig.maxOutputTokens, 80);
    assert.equal(input.contents[0].parts[0].text, plan(2).batches[i].payload);
    assert.deepEqual(result.completed[i].result, { text: 'Explicação.', promptTokens: 30, outputTokens: 7 });
  }
});

test('checks measured input before generating and spaces requests by rolling token and request windows', async () => {
  const over = simulate(() => countResponse(81));
  const blocked = await over.runner.run(plan());
  assert.equal(blocked.stopped, 'input-limit');
  assert.deepEqual(blocked.attempts, { count: 1, generate: 0 });

  const tokens = simulate(op => op === 'count' ? countResponse(30) : generationResponse(80));
  const spaced = await tokens.runner.run(plan(2));
  assert.equal(spaced.nextBatch, 2);
  assert.deepEqual(tokens.calls.filter(call => call.operation === 'generate').map(call => call.time), [0, 60_000]);

  const requests = simulate(undefined, { requestsPerMinute: 1 });
  await requests.runner.run(plan(2));
  for (const operation of ['count', 'generate']) {
    assert.deepEqual(requests.calls.filter(call => call.operation === operation).map(call => call.time), [0, 60_000]);
  }
});

test('keeps completed batches and resumes with a fresh execution budget', async () => {
  const { runner, calls } = simulate(undefined, { maxRequests: 1 });
  const input = plan(2);
  const first = await runner.run(input);
  assert.equal(first.stopped, 'budget');
  assert.deepEqual(first.completed.map(item => item.batchIndex), [0]);
  const second = await runner.run(input, { startAt: first.nextBatch });
  assert.deepEqual(second.completed.map(item => item.batchIndex), [1]);
  assert.equal(second.nextBatch, 2);
  assert.equal(second.stopped, undefined);
  assert.equal(calls.length, 4);
});

test('honors Retry-After and RetryInfo and spends a generation attempt on each retry', async () => {
  let failures = 0;
  const { runner, waits } = simulate(op => {
    if (op === 'count') { return countResponse(); }
    if (failures++ === 0) { return { status: 503, retryAfter: '3' }; }
    if (failures === 2) {
      return { status: 429, body: { error: { details: [
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '4.5s' }
      ] } } };
    }
    return generationResponse();
  });
  const result = await runner.run(plan());
  assert.equal(result.nextBatch, 1);
  assert.deepEqual(result.attempts, { count: 1, generate: 3 });
  assert.deepEqual(waits, [3000, 4500]);

  const budget = simulate(op => op === 'count' ? countResponse() : { status: 503 }, { maxRequests: 1 });
  const stopped = await budget.runner.run(plan());
  assert.equal(stopped.stopped, 'temporary');
  assert.deepEqual(stopped.attempts, { count: 1, generate: 1 });
});

test('stops on rejected credentials, unknown 429 or remote daily quota', async () => {
  const errors = [
    [{ status: 400, body: { error: { message: syntheticKey, details: [{ reason: 'API_KEY_INVALID' }] } } }, 'authentication'],
    [{ status: 429, body: { error: { message: 'quota' } } }, 'rate-limit'],
    [{ status: 429, retryAfter: '3', body: { error: { details: [
      { violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }
    ] } } }, 'daily-quota']
  ];
  for (const [response, reason] of errors) {
    const { runner, calls, waits } = simulate(op => op === 'count' ? countResponse() : response);
    const result = await runner.run(plan(2));
    assert.equal(result.stopped, reason);
    assert.equal(result.nextBatch, 0);
    assert(!JSON.stringify(result).includes(syntheticKey));
    assert.equal(calls.length, 2);
    assert.deepEqual(waits, []);
    if (reason === 'daily-quota') {
      assert.equal((await runner.run(plan())).stopped, 'daily-quota');
      assert.equal(calls.length, 2);
    }
  }
});

test('keeps the local daily quota across runs and resets it on the next Pacific day', async () => {
  const { runner, calls, advance } = simulate(undefined, { requestsPerDay: 1 });
  const input = plan(2);
  const result = await runner.run(input);
  assert.equal(result.stopped, 'daily-quota');
  assert.equal(result.nextBatch, 1);
  assert.equal((await runner.run(input, { startAt: 1 })).stopped, 'daily-quota');
  assert.equal(calls.length, 2);
  advance(86_400_000);
  assert.equal((await runner.run(input, { startAt: 1 })).nextBatch, 2);
});

test('cancels the active request, retains completed results and refuses concurrent runs', async () => {
  const controller = new AbortController();
  let started;
  const active = new Promise(resolve => { started = resolve; });
  const { runner, calls } = simulate((op, signal, call) => {
    if (op === 'count') { return countResponse(); }
    if (call.body.contents[0].parts[0].text.includes('module-0')) { return generationResponse(); }
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      started();
    });
  });
  const running = runner.run(plan(3), { signal: controller.signal });
  await active;
  await assert.rejects(runner.run(plan()), /em andamento/);
  controller.abort();
  const result = await running;
  assert.equal(result.stopped, 'cancelled');
  assert.deepEqual(result.completed.map(item => item.batchIndex), [0]);
  assert.equal(result.nextBatch, 1);
  assert.equal(calls.length, 4);
});

test('times out an active request and rejects truncated or malformed responses', async () => {
  const timed = simulate((op, signal) => op === 'count' ? countResponse() : new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), { maxRequests: 1 }, 15);
  assert.equal((await timed.runner.run(plan())).stopped, 'timeout');
  const truncated = simulate(op => op === 'count' ? countResponse() : {
    status: 200, body: { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'partial' }] } }] }
  });
  assert.equal((await truncated.runner.run(plan())).stopped, 'invalid-response');
  const invalid = simulate(() => ({ status: 200, body: { totalTokens: '30' } }));
  assert.deepEqual((await invalid.runner.run(plan())).attempts, { count: 1, generate: 0 });
});

test('native adapter uses the key header and refuses redirects', async t => {
  const calls = [];
  t.mock.method(https, 'request', (url, options, callback) => {
    const req = new EventEmitter();
    req.end = body => {
      calls.push({ url, options, body });
      const response = new EventEmitter();
      response.statusCode = 307;
      response.headers = { location: 'https://example.test/' };
      callback(response);
      response.emit('end');
    };
    return req;
  });
  const runner = new GeminiBatchRunner(configuration, syntheticKey);
  assert.equal((await runner.run(plan())).stopped, 'request-rejected');
  assert.equal(calls.length, 1);
  const { url, options, body } = calls[0];
  assert.equal(url.hostname, 'generativelanguage.googleapis.com');
  assert.equal(url.search, '');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['x-goog-api-key'], syntheticKey);
  assert.equal(options.headers['content-length'], Buffer.byteLength(body));
  assert(!body.includes(syntheticKey));
  assert(options.signal instanceof AbortSignal);
});

test('cancellation while waiting on the local window sends no further requests', async () => {
  const controller = new AbortController();
  const calls = [];
  const runner = new GeminiBatchRunner({ ...configuration, requestsPerMinute: 1 }, syntheticKey,
    async url => {
      calls.push(url.pathname);
      return url.pathname.endsWith(':countTokens') ? countResponse() : generationResponse();
    }, undefined, Date.now, async () => { controller.abort(); });
  const result = await runner.run(plan(2), { signal: controller.signal });
  assert.equal(result.stopped, 'cancelled');
  assert.equal(result.nextBatch, 1);
  assert.deepEqual(result.attempts, { count: 1, generate: 1 });
  assert.equal(calls.length, 2);
});
