import { parentPort, workerData } from 'node:worker_threads';
import { analyzeRepository } from './analyzeRepository';
import { ScanLimits } from './models';

const token = { isCancellationRequested: false };
parentPort?.on('message', message => { if (message === 'cancel') { token.isCancellationRequested = true; } });
const options = workerData as { root: string; limits: ScanLimits };
let lastProgress = 0;
void analyzeRepository(options.root, options.limits, token, message => {
  if (Date.now() - lastProgress > 100) {
    parentPort?.postMessage({ type: 'progress', message }); lastProgress = Date.now();
  }
}).then(result => parentPort?.postMessage({ type: 'result', result }))
  .catch(error => parentPort?.postMessage({ type: 'error', message: String(error) }))
  .finally(() => parentPort?.close());