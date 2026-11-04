// Storage reads must keep one transaction and exact compound-key boundaries.
import assert from 'node:assert/strict';
import { WorldStorage } from '../src/storage/WorldStorage.js';
import { memoryDatabase } from './fixtures/memory-database.mjs';

let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const compare = (a, b) => {
    for (let n = 0; n < Math.min(a.length, b.length); n++) {
        if (a[n] < b[n]) return -1;
        if (a[n] > b[n]) return 1;
    }
    return a.length - b.length;
};
const originalRange = globalThis.IDBKeyRange;
globalThis.IDBKeyRange = { bound: (lower, upper, lowerOpen, upperOpen) => ({lower,upper,lowerOpen,upperOpen}) };
function database(records, { abortAt = -1, abortAtComplete = false } = {}) {
    const rows = [...records].sort((a,b) => compare([a.worldId,a.cx,a.cz],[b.worldId,b.cx,b.cz]));
    const stats = { transactions: 0, requests: [], completed: 0, maxBatch: 0 };
    return { stats, transaction(name, mode) {
        equal([name,mode],['chunks','readonly'],'single read-only store');
        stats.transactions++;
        let pending = 0, active = true, aborted = false;
        const tx = { objectStore: () => ({
            keyPath: ['worldId','cx','cz'],
            index: () => { throw new Error('Real schema should use bounded primary-key pages'); },
            getAll(range,count) {
                assert.ok(active, 'Next request must be queued inside onsuccess, not after awaiting');
                const number = stats.requests.length + 1;
                stats.requests.push({range,count});
                const values = rows.filter(record => {
                    const key = [record.worldId,record.cx,record.cz];
                    const lower = compare(key,range.lower), upper = compare(key,range.upper);
                    return (lower > 0 || (!range.lowerOpen && lower === 0)) &&
                        (upper < 0 || (!range.upperOpen && upper === 0));
                }).slice(0,count);
                stats.maxBatch = Math.max(stats.maxBatch,values.length);
                const request = {result:structuredClone(values)};
                pending++;
                queueMicrotask(() => {
                    if (aborted) return;
                    active = true;
                    if (number === abortAt) {
                        aborted = true;
                        tx.error = new Error('forced abort');
                        tx.onabort?.();
                        active = false;
                        return;
                    }
                    request.onsuccess?.();
                    pending--;
                    active = false;
                    if (!pending) queueMicrotask(() => {
                        if (abortAtComplete) {
                            tx.error = new Error('abort before complete');
                            tx.onabort?.();
                        } else { stats.completed++; tx.oncomplete?.(); }
                    });
                });
                return request;
            }
        }) };
        return tx;
    } };
}

try {
    const target = 'same-world';
    const targetRecords = Array.from({length:197},(_,n)=>({
        worldId:target,cx:Math.floor(n/7)-14,cz:n%7-3,
        blocks:n%2 ? new Uint8Array(256).fill(n) : new Uint16Array(256).fill(700+n)
    }));
    // Prefix neighbours must not leak through the primary-key range.
    const others = ['same-worl','same-world-more','same-world\u0000','z'].map(worldId=>({
        worldId,cx:-1000,cz:1000,blocks:new Uint16Array([999])
    }));
    const db=database([...targetRecords.reverse(),...others]);
    const storage=new WorldStorage(db);
    const loaded=await storage.loadChunks(target);
    const expected=new Map(targetRecords.map(record=>[`${record.cx},${record.cz}`,record.blocks]));
    equal(loaded,expected,'all negative/positive coordinates and 8/16-bit blocks, no other worlds');
    equal(loaded.size,197,'no lost or duplicate page boundaries');
    equal(db.stats.transactions,1,'pages share one consistent transaction');
    equal(db.stats.requests.length,4,'197 chunks use four database round-trips');
    equal(db.stats.completed,1,'read resolves after transaction completion');
    equal(db.stats.maxBatch,64,'temporary record array stays bounded');
    for(const {range,count} of db.stats.requests) {
        equal(count,64,'bounded getAll count');
        equal(range.upper,[target,Infinity,Infinity],'upper world boundary retained');
    }
    equal(db.stats.requests[0].range.lower,[target,-Infinity,-Infinity],'negative coordinates included');
    equal(db.stats.requests.map(value=>value.range.lowerOpen),[false,true,true,true],'subsequent lower bounds exclusive');
    for(const count of [0,1,64,128]) {
        const testDb=database(targetRecords.slice(0,count));
        const values=await new WorldStorage(testDb).loadChunks(target);
        equal(values.size,count,`exact page boundary ${count}`);
        equal(testDb.stats.requests.length,Math.floor(count/64)+1,`terminal page ${count}`);
    }
    const aborted=database(targetRecords,{abortAt:2});
    await assert.rejects(new WorldStorage(aborted).loadChunks(target),/forced abort/); checks++;
    equal(aborted.stats.requests.length,2,'abort stops subsequent pages');
    const lateAbort=database(targetRecords.slice(0,1),{abortAtComplete:true});
    await assert.rejects(new WorldStorage(lateAbort).loadChunks(target),/abort before complete/); checks++;

    // Existing ports expose no compound keyPath; keep their filtered fallback
    // even if IDBKeyRange exists globally in a browser-based test harness.
    const memory=new WorldStorage(memoryDatabase());
    const chunk={cx:-2,cz:3,blocks:new Uint16Array(256).fill(800)};
    await memory.saveWorldAndChunks({id:target},[chunk]);
    await memory.saveWorldAndChunks({id:'other'},[{...chunk,blocks:new Uint16Array(256).fill(900)}]);
    const fallback=await memory.loadChunks(target);
    equal(fallback.get('-2,3'),chunk.blocks,'memory port fallback keeps world isolation and 16-bit IDs');
    equal(fallback.size,1,'fallback reads target world only');
} finally {
    if(originalRange===undefined) delete globalThis.IDBKeyRange;
    else globalThis.IDBKeyRange=originalRange;
}
console.log(`OK: odczyt zapisów partiami — ${checks} sprawdzeń granic, rozmiaru partii, transakcji, błędów i zgodności portów.`);
