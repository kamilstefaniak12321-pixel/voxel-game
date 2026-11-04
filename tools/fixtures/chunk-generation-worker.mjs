// Browser Worker adapter for the actual module, not a generator stub.
import { parentPort, workerData } from 'node:worker_threads';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
    return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/assets/'))
        ? { ...context, format: 'module' } : context);
} });
globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
// Match a browser module worker: early messages during awaited imports do not
// wait for an onmessage handler that has not been installed yet.
parentPort.on('message', data => self.onmessage?.({ data }));
await import(new URL(`../../src/world/${workerData?.module ?? 'ChunkGenerationWorker'}.js`, import.meta.url));
