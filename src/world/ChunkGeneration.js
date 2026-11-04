// One worker and at most two results in flight. CPU work and retained buffers
// cannot grow with render distance. The loading queue stays owned by World.
const MAX_JOBS = 2;
const JOB_TIMEOUT_MS = 15000;
const defaultWorker = () => new Worker(new URL('./ChunkGenerationWorker.js', import.meta.url), { type: 'module' });

export class ChunkGeneration {
    constructor(terrain, seed, { workerFactory } = {}) {
        this.terrain = terrain;
        this.seed = seed;
        this.workerFactory = workerFactory ?? (typeof Worker === 'function' ? defaultWorker : null);
        this.enabled = terrain === 'realistic' && !!this.workerFactory;
        this.worker = null;
        this.workerReady = false;
        this.started = 0;
        this.jobs = new Map();
        this.nextId = 1;
        this.disposed = false;
        this.stats = { requested: 0, completed: 0, applied: 0, discarded: 0, failures: 0,
            resets: 0, cache: null, workerMs: 0, lastApplyMs: 0, maxApplyMs: 0, lastError: null };
    }

    start() {
        if (!this.enabled || this.disposed) return false;
        if (this.worker) return true;
        try {
            const worker = this.workerFactory();
            this.worker = worker;
            this.started = performance.now();
            worker.onmessage = event => {
                if (this.disposed || this.worker !== worker) return;
                const message = event.data;
                if (message.type === 'ready') {
                    if (this.workerReady) return;
                    this.workerReady = true;
                    try {
                        worker.postMessage({ type: 'init', terrain: this.terrain, seed: this.seed });
                    } catch (error) { this.fail(error?.message ?? error); }
                    return;
                }
                if (message.type === 'error') {
                    this.fail(message.message);
                    return;
                }
                if (message.type !== 'chunk') return;
                const job = this.jobs.get(message.id);
                if (!job) return;
                this.stats.completed++;
                this.stats.resets = message.data.resets;
                this.stats.cache = message.data.cache;
                this.stats.workerMs = message.data.workerMs;
                if (job.cancelled) {
                    this.jobs.delete(message.id);
                    this.stats.discarded++;
                } else {
                    job.data = message.data;
                }
            };
            worker.onerror = event => this.fail(event?.message ?? 'Błąd wątku terenu');
            worker.onmessageerror = () => this.fail('Nie udało się odebrać danych terenu');
            return true;
        } catch (error) {
            this.fail(error?.message ?? error);
            return false;
        }
    }

    fail(message) {
        if (this.disposed || !this.enabled) return;
        this.stats.failures++;
        this.stats.lastError = String(message);
        this.enabled = false;
        this.workerReady = false;
        this.worker?.terminate();
        this.worker = null;
        this.jobs.clear();
        // Functional synchronous fallback: no missing chunks or lost save data.
        console.warn('Generowanie terenu w tle niedostępne; wracam do głównego wątku.', message);
    }

    find(cx, cz) {
        for (const job of this.jobs.values()) {
            if (!job.cancelled && job.cx === cx && job.cz === cz) return job;
        }
        return null;
    }

    request(cx, cz, saved) {
        if (this.find(cx, cz)) return true;
        if (!this.enabled || this.disposed || this.jobs.size >= MAX_JOBS || !this.start() || !this.workerReady) return false;
        const id = this.nextId++;
        const job = { id, cx, cz, saved, data: null, cancelled: false, started: performance.now() };
        this.jobs.set(id, job);
        try {
            // Saved blocks are cloned, never transferred/detached from the save.
            this.worker.postMessage({ type: 'chunk', id, cx, cz, saved });
            this.stats.requested++;
            return true;
        } catch (error) {
            this.fail(error?.message ?? error);
            return false;
        }
    }

    take(cx, cz, saved) {
        const job = this.find(cx, cz);
        if (!job?.data) return null;
        this.jobs.delete(job.id);
        if (job.saved !== saved) {
            this.stats.discarded++;
            return null;
        }
        return job.data;
    }

    readyChunks() {
        return [...this.jobs.values()].filter(job => !job.cancelled && job.data);
    }

    checkHealth() {
        const now = performance.now();
        if (this.worker && !this.workerReady && now - this.started > JOB_TIMEOUT_MS) {
            this.fail('Przekroczony czas uruchamiania wątku terenu');
        }
        for (const job of this.jobs.values()) {
            if (!job.data && now - job.started > JOB_TIMEOUT_MS) {
                this.fail('Przekroczony czas oczekiwania na teren');
                break;
            }
        }
        return this.enabled;
    }

    retain(wanted) {
        for (const [id, job] of this.jobs) {
            if (wanted(job.cx, job.cz)) continue;
            if (job.data) {
                this.jobs.delete(id);
                this.stats.discarded++;
            } else {
                // Keep a tombstone until the reply: pending work still counts
                // against MAX_JOBS, even after a teleport or distance change.
                job.cancelled = true;
                job.saved = undefined;
            }
        }
    }

    applied(ms) {
        this.stats.applied++;
        this.stats.lastApplyMs = ms;
        this.stats.maxApplyMs = Math.max(this.stats.maxApplyMs, ms);
    }

    getStats() {
        let ready = 0;
        for (const job of this.jobs.values()) if (job.data) ready++;
        return { enabled: this.enabled, workerReady: this.workerReady,
            pending: this.jobs.size - ready, ready, ...this.stats };
    }

    dispose() {
        this.disposed = true;
        this.enabled = false;
        this.workerReady = false;
        this.worker?.terminate();
        this.worker = null;
        this.jobs.clear();
    }
}
