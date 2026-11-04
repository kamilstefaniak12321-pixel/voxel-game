// Browser Worker adapter for the actual module, not a generator stub.
import { parentPort, workerData } from 'node:worker_threads';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
    return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/assets/'))
        ? { ...context, format: 'module' } : context);
} });
globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
await import(new URL(`../../src/world/${workerData?.module ?? 'ChunkGenerationWorker'}.js`, import.meta.url));
parentPort.on('message', data => self.onmessage({ data }));
