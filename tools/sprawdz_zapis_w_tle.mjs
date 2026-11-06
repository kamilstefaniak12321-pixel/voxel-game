import assert from 'node:assert/strict';
import { WorldStorage } from '../src/storage/WorldStorage.js';
import { WorldSaver } from '../src/storage/WorldSaver.js';
import { StorageWorker } from '../src/storage/StorageWorker.js';
import { memoryDatabase } from './fixtures/memory-database.mjs';

// Prawdziwy protokół oraz pakowanie/transakcja WorldStorage; port workera
// odtwarza structured clone i asynchroniczną odpowiedź, bez plików gracza.
const database = memoryDatabase();
const backend = new WorldStorage(database);
class MemoryWorker {
    constructor() { this.messages = []; this.fail = false; }
    postMessage(message, transfer = []) {
        const snapshot = structuredClone(message, { transfer });
        this.transferred = transfer;
        this.messages.push(snapshot);
        if (snapshot.type !== 'save') return;
        queueMicrotask(async () => {
            if (this.terminated) return;
            if (this.fail) return this.onmessage({ data: { id: snapshot.id, error: 'QuotaExceededError' } });
            await backend.saveWorldAndChunks(snapshot.worldInfo, snapshot.chunks);
            this.onmessage({ data: { id: snapshot.id, ms: 1 } });
        });
    }
    terminate() { this.terminated = true; }
}
let worker;
const storage = new WorldStorage(database, { background: true, workerFactory: () => worker = new MemoryWorker() });
const chunks = Array.from({ length: 16 }, (_, cx) => ({ cx, cz: -2, blocks: new Uint16Array(32768).fill(cx ? 700 : 4) }));
const info = { id: 'snapshot', player: { x: 12 }, campfires: [{ fuel: 6 }] };
const saving = storage.saveWorldAndChunks(info, chunks);
chunks[0].blocks[0] = 999;
info.player.x = 50; info.campfires[0].fuel = 1;
await saving;
const loaded = await storage.loadChunks(info.id);
assert.equal(loaded.get('0,-2')[0], 4, 'Przekazanie do workera zachowuje moment zapisu');
assert.ok(loaded.get('0,-2') instanceof Uint8Array);
assert.ok(loaded.get('1,-2') instanceof Uint16Array);
assert.equal(loaded.get('1,-2')[0], 700);
assert.equal((await storage.listWorlds())[0].player.x, 12);
assert.equal((await storage.listWorlds())[0].campfires[0].fuel, 6);
assert.equal(chunks[1].blocks.byteLength, 65536, 'Tablice gry nie mogą być odłączone');
assert.equal(worker.transferred.length, 16, 'Każdy własny bufor migawki jest przekazany');
assert.ok(worker.transferred.every(buffer => buffer.byteLength === 0), 'Transfer odłącza wyłącznie kopie');
assert.equal(storage.background.stats.writes, 1);

const submitted = worker.messages.length;
await storage.saveWorldAndChunks(info, chunks, { immediate: true });
assert.equal(worker.messages.length, submitted, 'Wyjście rozpoczyna bezpośrednią transakcję');
await storage.saveWorldAndChunks(info, chunks.slice(0, 1));
assert.equal(worker.messages.length, submitted, 'Mała edycja bez kosztu workera');

const dirty = new Set(chunks);
const world = {
    takeUnsavedChunks() { const result = [...dirty]; dirty.clear(); return result; },
    markUnsaved(values) { for (const value of values) dirty.add(value); },
    hasUnsavedChanges() { return dirty.size > 0; }
};
const saver = new WorldSaver(storage, info, world, { getState: () => ({ x: 20 }) });
worker.fail = true;
const previousError = console.error;
console.error = () => {};
try { assert.equal(await saver.save(), false); } finally { console.error = previousError; }
assert.equal(dirty.size, 16, 'Błąd transakcji zachowuje wszystkie zmiany do ponowienia');
worker.fail = false;
assert.equal(await saver.flush(), true);
assert.equal(dirty.size, 0);

// Diagnostyka jest obserwatorem. Nawet rzucający callback nie może
// zamienić udanej transakcji w błąd ani przerwać ponawiania po błędzie bazy.
const diagnosticBackend = new WorldStorage(memoryDatabase());
const diagnosticChunk = { cx: 3, cz: -4, blocks: new Uint8Array(32768).fill(7) };
const diagnosticDirty = new Set([diagnosticChunk]);
const diagnosticWorld = {
    takeUnsavedChunks() { const result = [...diagnosticDirty]; diagnosticDirty.clear(); return result; },
    markUnsaved(values) { for (const value of values) diagnosticDirty.add(value); },
    hasUnsavedChanges: () => diagnosticDirty.size > 0
};
let diagnosticStorageFails = false;
const diagnosticCalls = [];
const diagnosticSaver = new WorldSaver({
    async saveWorldAndChunks(...args) {
        if (diagnosticStorageFails) throw new Error('QuotaExceededError');
        return diagnosticBackend.saveWorldAndChunks(...args);
    }
}, { id: 'diagnostic-isolation' }, diagnosticWorld, { getState: () => ({ x: 30 }) });
diagnosticSaver.onDiagnostic = (level, kind) => {
    diagnosticCalls.push({ level, kind });
    throw new Error('Uszkodzony odbiorca logów');
};
assert.equal(await diagnosticSaver.save(), true, 'Awaria callbacku logów nie zmienia sukcesu zapisu');
assert.equal((await diagnosticBackend.loadChunks('diagnostic-isolation')).get('3,-4')[0], 7,
    'Sukces jest potwierdzony odczytem faktycznej transakcji');
assert.equal(diagnosticDirty.size, 0, 'Callback nie przywraca zapisanych chunków do niezapisanych');
assert.equal(diagnosticSaver.getStatus(), 'Świat zapisany', 'HUD zachowuje prawdziwy wynik zapisu');
assert.equal(diagnosticSaver.activeBatches.size, 0);
diagnosticChunk.blocks[0] = 8;
diagnosticDirty.add(diagnosticChunk);
diagnosticStorageFails = true;
assert.equal(await diagnosticSaver.save(), false, 'Awaria logów nie odrzuca Promise obsłużonego błędu zapisu');
assert.equal(diagnosticDirty.size, 1, 'Błąd bazy zachowuje chunk do ponowienia mimo awarii logów');
assert.equal(diagnosticSaver.getStatus(), 'Błąd zapisu świata!');
assert.equal(diagnosticSaver.activeBatches.size, 0);
assert.ok(Number.isFinite(diagnosticSaver.lastWriteMs));
diagnosticStorageFails = false;
assert.equal(await diagnosticSaver.flush(), true, 'Ponowienie działa po błędzie bazy i callbacku');
assert.equal((await diagnosticBackend.loadChunks('diagnostic-isolation')).get('3,-4')[0], 8,
    'Ponowienie zapisuje najnowszą edycję');
assert.equal(diagnosticDirty.size, 0);
assert.deepEqual(diagnosticCalls.map(call => call.kind), ['world.saved', 'world.save.failed', 'world.saved']);

// Awaria procesu workera: pierwsza operacja odrzucona, następna korzysta
// ze sprawdzonej ścieżki bezpośredniej, bez pozornego potwierdzenia zapisu.
const pending = storage.saveWorldAndChunks(info, chunks);
worker.onerror({ message: 'worker crash', preventDefault() {} });
await assert.rejects(pending, /worker crash/);
assert.equal(storage.background.disabled, true);
await storage.saveWorldAndChunks(info, chunks);

// Odczyt po kursorze: rekordy tylko wybranego świata, stare i nowe ID.
const records = [...loaded].map(([key, blocks]) => {
    const [cx, cz] = key.split(',').map(Number); return { cx, cz, blocks };
});
let delivered = 0;
const cursorStorage = new WorldStorage({ transaction() {
    return { objectStore() { return { index() { return { openCursor(id) {
        assert.equal(id, 'snapshot');
        const request = {};
        let next = 0;
        const advance = () => queueMicrotask(() => {
            request.result = next < records.length
                ? { value: structuredClone(records[next++]), continue: advance } : null;
            delivered++;
            request.onsuccess();
        });
        advance(); return request;
    }, getAll() { throw new Error('Nie wolno dublować całej bazy przez getAll'); } }; } }; } };
} });
assert.deepEqual(await cursorStorage.loadChunks('snapshot'), loaded);
assert.equal(delivered, 17);

// Prośba o zapis przy wyjściu podczas trwającego zapisu zachowuje tryb
// bezpośredni również w kolejce WorldSaver.
let release;
const modes = [];
const serialStorage = { saveWorldAndChunks(_info, _chunks, options) {
    modes.push(options.immediate);
    return modes.length === 1 ? new Promise(resolve => release = resolve) : Promise.resolve();
} };
const serialSaver = new WorldSaver(serialStorage, { id: 'serial' }, world, { getState: () => ({}) });
const first = serialSaver.save();
const queued = serialSaver.save({ immediate: true });
serialSaver.save();
release(); await first; await queued;
assert.deepEqual(modes, [false, true]);

// Wyjście przed odpowiedzią workera: komplet bieżących bloków musi
// trafić do bezpośredniej transakcji jeszcze w tym samym zadaniu JS.
class HeldWorker extends MemoryWorker {
    postMessage(message) { this.messages.push(structuredClone(message)); }
}
const exitDatabase = memoryDatabase();
const exitWorkers = [];
const exitStorage = new WorldStorage(exitDatabase, { background: true,
    workerFactory: () => { const w = new HeldWorker(); exitWorkers.push(w); return w; } });
for (const chunk of chunks) dirty.add(chunk);
const exitSaver = new WorldSaver(exitStorage, info, world, { getState: () => ({ x: 123 }) });
const beforeExit = exitSaver.save();
assert.equal(dirty.size, 0);
// A został wyładowany, a B spod tych samych współrzędnych zmieniony.
const currentChunk = { ...chunks[0], blocks: chunks[0].blocks.slice() };
currentChunk.blocks[0] = 777;
world.getChunk = (cx, cz) => cx === currentChunk.cx && cz === currentChunk.cz ? currentChunk : null;
dirty.add(currentChunk);
const exitSave = exitSaver.save({ immediate: true });
assert.equal(exitWorkers[0].terminated, true, 'Stary worker nie może później nadpisać nowego zapisu');
assert.equal(exitSaver.saving, exitSave);
assert.equal(await beforeExit, false);
assert.equal(await exitSave, true);
assert.equal((await exitStorage.loadChunks(info.id)).get('0,-2')[0], 777);
assert.equal((await exitStorage.loadChunks(info.id)).size, 16, 'Wyjście odzyskuje całą partię w locie');
assert.equal(dirty.size, 0, 'Celowe przerwanie nie zgłasza ponownie już zapisanych zmian');
assert.equal(exitSaver.saving, null);
assert.equal(exitSaver.activeBatches.size, 0);
// Także najnowsze dane ponownie wyładowanego B wygrywają z A.
world.getChunk = () => null;
world.savedChunks = new Map([[`${currentChunk.cx},${currentChunk.cz}`, currentChunk.blocks]]);
dirty.add(chunks[0]);
assert.equal(await exitSaver.save({ immediate: true }), true);
assert.equal((await exitStorage.loadChunks(info.id)).get('0,-2')[0], 777);
for (const chunk of chunks) dirty.add(chunk);
const resumed = exitSaver.save();
assert.equal(exitWorkers.length, 2, 'Po powrocie z minimalizacji zapis w tle działa ponownie');
const resumedMessage = exitWorkers[1].messages.find(value => value.type === 'save');
exitWorkers[1].onmessage({ data: { id: resumedMessage.id, ms: 1 } });
assert.equal(await resumed, true);
exitStorage.background.stop();
const silent = new StorageWorker('silent', () => new HeldWorker(), 20);
await assert.rejects(silent.write(info, chunks), /czas oczekiwania/);
assert.equal(silent.disabled, true);
assert.equal(silent.pending.size, 0);
console.log('OK: zapis w tle — migawka, 8/16-bitowe ID, atomowy protokół, błędy/ponowienie, kursor i wyjście.');
