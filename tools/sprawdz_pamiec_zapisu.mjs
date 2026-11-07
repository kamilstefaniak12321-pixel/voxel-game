import assert from 'node:assert/strict';
import { SavedChunkStore } from '../src/storage/SavedChunkStore.js';
import { WorldStorage } from '../src/storage/WorldStorage.js';
import { memoryDatabase } from './fixtures/memory-database.mjs';

let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const check = (value, label) => { assert.ok(value, label); checks++; };
const length = 16 * 16 * 128;
const summarize = blocks => ({ heights: new Uint8Array(256).fill(blocks?.length ? 42 : 0),
    materials: new Uint16Array(256).fill(blocks?.[0] ?? 0) });
const store = new SavedChunkStore({ summarize, maxDecodedBytes: length * 2, maxDecodedEntries: 2 });

// Fixed patterns, long runs, original element type, and 16-bit IDs survive
// eviction byte-for-byte. Legacy Uint8Array IDs must retain their migration tag.
let random = 0x12345678;
const next = () => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return random >>> 0; };
const inputs = [new Uint8Array(), new Uint16Array(), new Uint8Array(length),
    new Uint16Array(length).fill(7), new Uint16Array(length).fill(65535),
    Uint8Array.from({ length }, (_, n) => n % 256),
    Uint16Array.from({ length }, () => next() & 65535),
    Uint16Array.from({ length }, (_, n) => n < 10000 ? 0 : n < 20000 ? 5012 : n % 2 ? 65535 : 1),
    new Uint16Array(70000).fill(700), // malformed world size, valid lossless snapshot
    new Uint8Array(256), new Uint16Array(257), null, undefined, [1, 700, 0]];
for (let n = 0; n < inputs.length; n++) {
    const key = `${n},0`, input = inputs[n];
    store.set(key, input);
    check(store.has(key), 'Recorded keys include invalid/undefined snapshots');
    const revision = store.revision(key);
    equal(store.get(key), input, `Exact first decode ${n}`);
    if (ArrayBuffer.isView(input)) {
        check(store.get(key).constructor === input.constructor, `Original typed-array identity ${n}`);
        check(store.records.get(key).encoded.bytes <= input.byteLength, `No incompressible expansion ${n}`);
    }
    store.releaseDecoded(key);
    equal(store.get(key), input, `Exact revisit ${n}`);
    check(store.revision(key) === revision, 'Eviction never changes a snapshot revision');
    check(store.stats().decodedBytes <= store.maxDecodedBytes, 'Decoded byte bound');
    check(store.stats().decodedEntries <= store.maxDecodedEntries, 'Decoded entry bound');
}
check(store.stats().encodedBytes < 230000, 'Mixed fixture remains compact');

// Neither an incoming live array nor a returned decoded array is the immutable
// stored snapshot. Replacing one key invalidates its decode and revision only.
const source = new Uint16Array(length).fill(300);
store.set('-17,-1', source);
const oldRevision = store.revision('-17,-1');
source.fill(999);
equal(store.get('-17,-1'), new Uint16Array(length).fill(300), 'Input mutation does not alter snapshot');
store.get('-17,-1').fill(888);
store.releaseDecoded('-17,-1');
equal(store.get('-17,-1'), new Uint16Array(length).fill(300), 'Decoded mutation cannot corrupt encoded buffers');
store.set('-17,-1', source);
check(store.revision('-17,-1') !== oldRevision, 'Replacement changes stable revision');
equal(store.get('-17,-1'), source, 'Replacement does not reuse stale decode');
check(store.revision('missing') === undefined && store.get('missing') === undefined, 'Missing key semantics');

// Even a zero-byte snapshot cannot bypass the entry bound. Oversized snapshots
// are decoded for the caller but are not retained in the bounded cache.
const tiny = new SavedChunkStore({ maxDecodedBytes: 0, maxDecodedEntries: 1 });
for (let n = 0; n < 10; n++) { tiny.set(`${n},0`, new Uint16Array()); tiny.get(`${n},0`); }
equal(tiny.stats().decodedEntries, 1, 'Zero-length entries have a count bound');
tiny.set('large', new Uint16Array(length)); tiny.get('large');
equal(tiny.stats().decodedBytes, 0, 'Oversized decode is never retained');
const disabled = new SavedChunkStore({ maxDecodedBytes: 1e6, maxDecodedEntries: 0 });
disabled.set('0,0', source); disabled.get('0,0');
equal(disabled.stats().decodedEntries, 0, 'Entry limit zero disables decoded caching');

// Spatial queries include exact negative/positive boundaries and never call get.
const spatial = new SavedChunkStore({ summarize });
const expected = new Map();
for (const cx of [-33,-32,-17,-16,-1,0,15,16,17,31,32]) for (const cz of [-17,-16,-1,0,15,16,32]) {
    const key = `${cx},${cz}`;
    spatial.set(key, new Uint16Array(256).fill(700 + cx + cz));
    expected.set(key, { cx, cz });
}
for (const bounds of [[-17,-16,16,16],[-33,-17,32,32],[0,0,0,0],[16,16,17,32],[-100000,-100000,100000,100000]]) {
    const entries = [...spatial.entriesIn(...bounds)];
    equal(entries.map(([key]) => key).sort(), [...expected].filter(([, p]) =>
        p.cx >= bounds[0] && p.cz >= bounds[1] && p.cx <= bounds[2] && p.cz <= bounds[3]).map(([key]) => key).sort(),
    `Exact inclusive query ${bounds}`);
    for (const [key, summary] of entries) equal(summary.materials[0], 700 + expected.get(key).cx + expected.get(key).cz, 'Summary belongs to key');
}
equal([...spatial.entriesIn(2,2,1,1)], [], 'Empty rectangle');
equal(spatial.stats().decodedBytes, 0, 'Spatial summaries never decode blocks');
equal(spatial.stats().misses, 0, 'No hidden decode during summaries');
equal(spatial.stats().summaryBytes, spatial.size * 768, 'Exact summary backing bytes');
spatial.set('0,0', new Uint16Array(length).fill(800));
equal([...spatial.entriesIn(0,0,0,0)].length, 1, 'Replacement adds no duplicate spatial entry');

// Errors preparing a replacement preserve its previous snapshot and counters.
let refuse = false;
const atomic = new SavedChunkStore({ summarize: value => { if (refuse) throw Error('summary failed'); return summarize(value); } });
atomic.set('0,0', source); const before = atomic.stats(), stamp = atomic.revision('0,0');
refuse = true;
assert.throws(() => atomic.set('0,0', new Uint16Array(256)), /summary failed/); checks++;
equal(atomic.stats(), before, 'Failed preparation does not change ownership or accounting');
check(atomic.revision('0,0') === stamp, 'Failed preparation keeps revision');

// Production read path feeds each database page directly to compact records.
// Ports here model IDB's page and transaction events, not encoding behavior.
const originalRange = globalThis.IDBKeyRange;
globalThis.IDBKeyRange = { bound: (lower, upper, lowerOpen = false) => ({ lower, upper, lowerOpen }) };
const compare = (a, b) => { for (let n = 0; n < a.length; n++) { if (a[n] < b[n]) return -1; if (a[n] > b[n]) return 1; } return 0; };
function pages(records, abortAt = -1) {
    const sorted = records.toSorted((a,b) => compare([a.worldId,a.cx,a.cz],[b.worldId,b.cx,b.cz]));
    const stats = { requests: 0, maxPage: 0, aborted: 0 };
    return { stats, transaction() {
        let pending = 0, stopped = false;
        const tx = { abort() { stopped = true; stats.aborted++; queueMicrotask(() => tx.onabort?.()); },
            objectStore: () => ({ keyPath: ['worldId','cx','cz'], getAll(range, count) {
            const request = {}, requestNumber = ++stats.requests;
            const values = sorted.filter(record => {
                const key = [record.worldId,record.cx,record.cz];
                return compare(key,range.lower) >= (range.lowerOpen ? 1 : 0) && compare(key,range.upper) <= 0;
            }).slice(0,count);
            stats.maxPage = Math.max(stats.maxPage, values.length); pending++;
            queueMicrotask(() => {
                if (stopped) return;
                if (requestNumber === abortAt) { stopped = true; tx.error = Error('forced read failure'); tx.onabort?.(); return; }
                request.result = structuredClone(values); request.onsuccess?.();
                if (--pending === 0) queueMicrotask(() => tx.oncomplete?.());
            });
            return request;
        } }) };
        return tx;
    } };
}
try {
    const records = Array.from({ length: 137 }, (_, n) => ({ worldId: 'test', cx: n - 68, cz: n % 3 - 1,
        blocks: n % 2 ? new Uint8Array(length).fill(n) : new Uint16Array(length).fill(700+n) }));
    records.push({ worldId: 'test-more', cx: 0, cz: 0, blocks: new Uint16Array([999]) });
    const db = pages(records), storage = new WorldStorage(db);
    const compact = await storage.loadSavedChunks('test', { summarize, maxDecodedBytes: length });
    equal(compact.size, 137, 'All and only chosen-world records streamed into store');
    equal(compact.stats().decodedBytes, 0, 'Opening a save does not retain decoded snapshots');
    equal(db.stats.maxPage, 64, 'Temporary disk records bounded to one page');
    equal(db.stats.requests, 3, '137 chunks read in three pages');
    for (const record of records.filter(r => r.worldId === 'test')) equal(compact.get(`${record.cx},${record.cz}`), record.blocks, 'Paged compact read exact');
    check(compact.stats().decodedBytes <= length, 'Byte cap after full traversal');
    const oldApi = await storage.loadChunks('test');
    check(oldApi instanceof Map && oldApi.size === 137, 'Original full-map API remains compatible');
    await assert.rejects(new WorldStorage(pages(records, 2)).loadSavedChunks('test', { summarize }), /forced read failure/); checks++;
    await assert.rejects(storage.loadSavedChunks('test', { summarize() { throw Error('conversion failed'); } }), /conversion failed/); checks++;
    equal(db.stats.aborted, 1, 'Conversion failure aborts the remaining read-only page stream');
    const cursorStats = { continued: 0, aborted: 0 };
    const cursorStorage = new WorldStorage({ transaction() {
        const tx = { abort() { cursorStats.aborted++; queueMicrotask(() => tx.onabort?.()); },
            objectStore: () => ({ index: () => ({ openCursor() {
                const request = { result: { value: records[0], continue() { cursorStats.continued++; } } };
                queueMicrotask(() => request.onsuccess?.()); return request;
            } }) }) };
        return tx;
    } });
    await assert.rejects(cursorStorage.loadSavedChunks('test', { summarize() { throw Error('cursor conversion failed'); } }), /cursor conversion failed/); checks++;
    equal(cursorStats, { continued: 0, aborted: 1 }, 'Cursor conversion error rejects and stops reading');
    equal(records[0].blocks, new Uint16Array(length).fill(700), 'Failed read never modifies existing disk records');
    const memory = new WorldStorage(memoryDatabase());
    await memory.saveWorldAndChunks({id:'a'}, [{cx:0,cz:0,blocks:source}]);
    await memory.saveWorldAndChunks({id:'b'}, [{cx:0,cz:0,blocks:new Uint8Array([1])}]);
    const saved = await memory.loadSavedChunks('a', { summarize });
    equal(saved.size, 1, 'Fallback port isolates worlds'); equal(saved.get('0,0'), source, 'Fallback port exact data');
} finally {
    if (originalRange === undefined) delete globalThis.IDBKeyRange;
    else globalThis.IDBKeyRange = originalRange;
}
spatial.dispose();
equal([spatial.size, spatial.stats().totalBytes, spatial.stats().buckets], [0,0,0], 'Dispose releases buffers and index');
console.log(`OK: pamięć zapisów — ${checks} sprawdzeń kompresji, typów ID, cache, migawek, powierzchni i odczytu partiami.`);
