// Isolated CPU/data-footprint counterpart of the Chromium IndexedDB benchmark.
// The database port generates bounded pages; no disk/browser/GPU timings are
// claimed. Run baseline and candidate sequentially, using the same --root data.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { SAVED_BENCH_CELLS, SAVED_BENCH_NOISE_COUNT, savedBenchBlocks,
    savedBenchCoordinates, savedBenchSignature } from './fixtures/saved-streaming-data.mjs';

const argument = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const root = resolve(argument('--root', fileURLToPath(new URL('../', import.meta.url))));
const output = resolve(argument('--output', 'test-results/saved-cpu'));
const count = Number(argument('--chunks', '4096')), repetitions = Number(argument('--samples', '3'));
assert.ok(Number.isInteger(count) && count >= 32 && count <= 16384);
assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10);
const url = relative => pathToFileURL(resolve(root, relative)).href;
registerHooks({
    resolve(specifier, context, next) { return next(specifier === 'three' ? url('lib/three/three.module.js') : specifier, context); },
    load(url, context, next) { return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
        ? { ...context, format: 'module' } : context); }
});
const { WorldStorage } = await import(url('src/storage/WorldStorage.js'));
const { getBlockId } = await import(url('src/blocks/BlockRegistry.js'));
const ids = { stone: getBlockId('stone'), dirt: getBlockId('dirt'), grass: getBlockId('grass'),
    planks: getBlockId('oak_planks') || getBlockId('planks') || getBlockId('stone'), modern: getBlockId('indygowiec_etap3') };
assert.ok(ids.modern > 255 && ids.stone && ids.grass && ids.dirt);
let summarize;
if (WorldStorage.prototype.loadSavedChunks) ({ summarizeSavedChunk: summarize } = await import(url('src/world/SavedChunkSurface.js')));
globalThis.IDBKeyRange = { bound: (lower, upper, lowerOpen, upperOpen) => ({ lower, upper, lowerOpen, upperOpen }) };

function database(total, noise) {
    const stats = { requests: 0, maxPage: 0, sourceBytes: 0 };
    return { stats, transaction() {
        let pending = 0;
        const transaction = { objectStore() { return { keyPath: ['worldId', 'cx', 'cz'],
            getAll(range, size) {
                assert.equal(size, 64);
                const request = {}, lower = range.lower;
                const first = Number.isFinite(lower[1])
                    ? (lower[1] - 256) * 64 + lower[2] + 32 + (range.lowerOpen ? 1 : 0) : 0;
                pending++; stats.requests++;
                setImmediate(() => {
                    const records = [];
                    for (let i = first; i < Math.min(total, first + size); i++) {
                        const blocks = savedBenchBlocks(i, ids, noise);
                        stats.sourceBytes += blocks.byteLength;
                        records.push({ worldId: 'bench', ...savedBenchCoordinates(i), blocks });
                    }
                    stats.maxPage = Math.max(stats.maxPage, records.length);
                    request.result = records; pending--;
                    request.onsuccess();
                    if (!pending) queueMicrotask(() => transaction.oncomplete?.());
                });
                return request;
            }
        }; } };
        return transaction;
    } };
}
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
function retained(store) {
    if (store.stats) return { mode: 'compact', ...store.stats() };
    let bytes = 0;
    for (const blocks of store.values()) bytes += blocks.byteLength;
    return { mode: 'eager-map', entries: store.size, encodedBytes: bytes, summaryBytes: 0, decodedBytes: 0, totalBytes: bytes };
}
async function trial(total, noise, sample) {
    globalThis.gc?.();
    const db = database(total, noise), storage = new WorldStorage(db);
    const before = process.memoryUsage();
    const began = performance.now();
    const store = await (storage.loadSavedChunks
        ? storage.loadSavedChunks('bench', { summarize }) : storage.loadChunks('bench'));
    const openingMs = performance.now() - began;
    assert.equal(store.size, total);
    assert.equal(db.stats.maxPage, Math.min(total, 64));
    const atOpen = retained(store), reads = [];
    const visits = Math.min(total, 512);
    for (let n = 0; n < visits; n++) {
        const i = n, { cx, cz } = savedBenchCoordinates(i);
        const began = performance.now(), blocks = store.get(`${cx},${cz}`);
        reads.push(performance.now() - began);
        assert.equal(blocks.length, SAVED_BENCH_CELLS);
    }
    const afterTraversal = retained(store);
    const checked = [0, 1, 31, 32, 63, Math.floor(total / 2), total - 1];
    for (const i of checked) {
        const { cx, cz } = savedBenchCoordinates(i), actual = store.get(`${cx},${cz}`), expected = savedBenchBlocks(i, ids, noise);
        assert.equal(actual.constructor, expected.constructor);
        assert.equal(savedBenchSignature(actual), savedBenchSignature(expected));
    }
    globalThis.gc?.();
    const memory = process.memoryUsage();
    if (afterTraversal.mode === 'compact') {
        assert.ok(afterTraversal.decodedBytes <= afterTraversal.maxDecodedBytes);
        assert.ok(afterTraversal.decodedEntries <= afterTraversal.maxDecodedEntries);
    }
    return { sample, total, noise, openingMs, atOpen, afterTraversal, source: db.stats,
        reads: { count: reads.length, p50Ms: percentile(reads, .5), p95Ms: percentile(reads, .95), maxMs: Math.max(...reads) },
        checks: { checksumAndType: checked.length, decodedLimit: afterTraversal.mode === 'compact' },
        memory: { before, retained: memory, forcedGc: Boolean(globalThis.gc) } };
}
await mkdir(output, { recursive: true });
const digest = contents => createHash('sha256').update(contents).digest('hex');
const report = { scope: 'Node CPU/data-footprint with a bounded generated-page database port; no real IndexedDB, graphics or FPS',
    node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length, count, repetitions, ids,
    commit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    harnessSha256: digest(await readFile(fileURLToPath(import.meta.url))),
    dataSha256: digest(await readFile(new URL('./fixtures/saved-streaming-data.mjs', import.meta.url))),
    sourceSha256: {}, samples: [] };
for (const name of ['src/storage/WorldStorage.js', 'src/storage/SavedChunkStore.js', 'src/world/SavedChunkSurface.js']) {
    try { report.sourceSha256[name] = digest(await readFile(resolve(root, name))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
}
for (let sample = 0; sample < repetitions; sample++) {
    const terrain = await trial(count, false, sample), noise = await trial(SAVED_BENCH_NOISE_COUNT, true, sample);
    report.samples.push({ terrain, noise });
    console.log(JSON.stringify({ sample, mode: terrain.atOpen.mode, openingMs: terrain.openingMs,
        retainedMiB: terrain.afterTraversal.totalBytes / 1048576, noiseMiB: noise.afterTraversal.totalBytes / 1048576 }));
}
report.valid = true;
await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
