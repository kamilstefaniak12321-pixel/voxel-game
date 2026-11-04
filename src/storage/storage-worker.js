import { WorldStorage } from './WorldStorage.js';

let storage;
let opening;
let queue = Promise.resolve();

function openDatabase(name) {
    return new Promise((resolve, reject) => {
        // Baza została już otwarta i utworzona przez główny wątek.
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => request.transaction.abort();
        request.onblocked = () => reject(new Error('Baza świata jest zablokowana.'));
        request.onerror = () => reject(request.error || new Error('Brak bazy świata.'));
        request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(new WorldStorage(request.result));
        };
    });
}

self.onmessage = ({ data }) => {
    if (data.type === 'init') {
        opening = openDatabase(data.databaseName);
        opening.catch(error => self.postMessage({ type: 'unavailable', error: error?.message || String(error) }));
        return;
    }
    if (data.type !== 'save') return;
    queue = queue.then(async () => {
        const start = performance.now();
        try {
            storage ??= await opening;
            if (!storage) throw new Error('Zapis w tle nie został przygotowany.');
            await storage.saveWorldAndChunks(data.worldInfo, data.chunks);
            self.postMessage({ id: data.id, ms: performance.now() - start });
        } catch (error) {
            self.postMessage({ id: data.id, error: error?.message || String(error) });
        }
    });
};
