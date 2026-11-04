// Pakowanie i transakcja dużego autozapisu poza wątkiem obrazu.
// Osobne kopie bloków trafiają do workera przez transfer; żywe tablice
// chunków nie są odłączane. Błąd zostawia zmiany do ponowienia.
export class StorageWorker {
    constructor(databaseName, workerFactory = url => new Worker(url, { type: 'module' }), timeoutMs = 30000) {
        this.pending = new Map();
        this.nextId = 1;
        this.disabled = false;
        this.timeoutMs = timeoutMs;
        this.stats = { writes: 0, failures: 0, lastSubmitMs: 0, lastWorkerMs: 0 };
        try {
            this.worker = workerFactory(new URL('./storage-worker.js', import.meta.url));
            this.worker.onmessage = ({ data }) => {
                if (data?.type === 'unavailable') {
                    this.stop(new Error(data.error || 'Baza w wątku zapisu jest niedostępna.'));
                    return;
                }
                const job = this.pending.get(data?.id);
                if (!job) return;
                this.pending.delete(data.id);
                clearTimeout(job.timer);
                if (data.error) {
                    this.stats.failures++;
                    job.reject(new Error(data.error));
                } else {
                    this.stats.writes++;
                    this.stats.lastWorkerMs = data.ms;
                    job.resolve();
                }
            };
            this.worker.onerror = event => {
                event.preventDefault?.();
                this.stop(new Error(event.message || 'Nie udało się uruchomić zapisu w tle.'));
            };
            this.worker.onmessageerror = () => this.stop(new Error('Nie udało się odczytać odpowiedzi zapisu.'));
            this.worker.postMessage({ type: 'init', databaseName });
        } catch (error) {
            this.stop(error);
        }
    }

    write(worldInfo, chunks) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            if (this.disabled) return reject(new Error('Zapis w tle jest niedostępny.'));
            const timer = setTimeout(() => this.stop(new Error('Przekroczony czas oczekiwania na zapis w tle.')), this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            const start = performance.now();
            try {
                // Własne bufory migawki omijają koszt serializacji dużych
                // ArrayBuffer w postMessage. Kopia nadal powstaje w tej samej
                // synchronicznej operacji, przed następną zmianą świata.
                const snapshot = chunks.map(chunk => ({ cx: chunk.cx, cz: chunk.cz,
                    blocks: chunk.blocks.slice() }));
                this.worker.postMessage({ type: 'save', id, worldInfo, chunks: snapshot },
                    snapshot.map(chunk => chunk.blocks.buffer));
                this.stats.lastSubmitMs = performance.now() - start;
            } catch (error) {
                this.stop(error);
            }
        });
    }

    stop(error = new Error('Zapis w tle został zamknięty.')) {
        this.disabled = true;
        this.worker?.terminate();
        this.worker = null;
        for (const job of this.pending.values()) {
            clearTimeout(job.timer);
            this.stats.failures++;
            job.reject(error);
        }
        this.pending.clear();
    }
}
