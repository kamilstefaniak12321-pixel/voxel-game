import { sanitize, sanitizeText, limitRecord } from './Sanitize.js';
import { diagnosticsReportText } from './Report.js';

const EVENT_LIMIT = 300;
const SAMPLE_LIMIT = 180;
const PENDING_LIMIT = 160;
const STORAGE_LIMIT = 64 * 1024; // Two UTF-16 localStorage values together <=256 KiB.
const CURRENT_KEY = 'voxel-diagnostics-current-v1';
const PREVIOUS_KEY = 'voxel-diagnostics-previous-v1';
const schemaVersion = 1;
const copy = (value) => JSON.parse(JSON.stringify(value));
const boundedIO = (promise, timeoutMs) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Przekroczono czas zapisu/odczytu diagnostyki.')), timeoutMs);
    Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); });
});

export class Diagnostics {
    constructor({ now = () => globalThis.performance?.now?.() ?? Date.now(), wallClock = () => new Date().toISOString() } = {}) {
        this.now = now;
        this.wallClock = wallClock;
        this.started = now();
        this.session = { id: globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            version: 'nieznana', startedAt: wallClock(), cleanShutdown: false };
        this.events = [];
        this.performance = [];
        this.pending = new Map();
        this.encodedSizes = new WeakMap();
        this.previous = null;
        this.sequence = 0;
        // Unlike retained-history counts, this never decreases when the ring evicts
        // an error. Notifications must still notice new failures after a long session.
        this.totalErrorOccurrences = 0;
        this.limits = { droppedEvents: 0, repeatedEvents: 0, evictedEvents: 0, evictedSamples: 0, droppedPending: 0 };
        this.storageState = { state: 'memory', error: null };
        this.listeners = new Set();
        this.rateWindow = this.started;
        this.rateCount = 0;
        this.disposed = false;
        this.contextProvider = null;
        this.ready = Promise.resolve();
        this.cleanups = [];
    }

    initialize(options = {}) {
        if (this.initialized) return this.ready;
        this.initialized = true;
        this.autoFlush = options.autoFlush !== false;
        this.ioTimeoutMs = options.ioTimeoutMs ?? 2000;
        this.disposeTimeoutMs = options.disposeTimeoutMs ?? 3000;
        this.session.version = sanitizeText(options.version || 'nieznana', 80);
        this.contextProvider = options.contextProvider || null;
        this.bridge = options.bridge ?? globalThis.window?.voxelDiagnostics ?? null;
        try { this.storage = options.storage === undefined ? globalThis.localStorage : options.storage; }
        catch { this.storage = null; }
        if (options.captureErrors !== false) this._capture(options.eventTarget ?? globalThis.window, options.console ?? globalThis.console);
        this.ready = this._readPrevious().catch((error) => this._storageFailure(error));
        this.breadcrumb('session.start', `Uruchomiono grę ${this.session.version}.`);
        this._queue({ type: 'session', id: `${this.session.id}:session`, sessionId: this.session.id, ...this.session });
        if (this.autoFlush) this.flushTimer = setInterval(() => { void this.flush(); }, 5000);
        this.flushTimer?.unref?.();
        return this.ready;
    }

    setContextProvider(provider) { this.contextProvider = typeof provider === 'function' ? provider : null; }

    setVersion(version) {
        this.session.version = sanitizeText(version || 'nieznana', 80);
        this._queue({ type: 'session', id: `${this.session.id}:session`, sessionId: this.session.id, ...this.session });
        this._notify();
    }

    _context() {
        try { return this.contextProvider ? sanitize(this.contextProvider(), { nodes: 300, depth: 5, keys: 128 }) : null; }
        catch { return { unavailable: true }; }
    }

    record(level, kind, message, data = null) {
        if (this.disposed) return null;
        level = ['info', 'warn', 'error', 'fatal'].includes(level) ? level : 'info';
        if (level === 'error' || level === 'fatal') this.totalErrorOccurrences++;
        const now = this.now();
        const safeKind = sanitizeText(kind || 'event', 100);
        const safeMessage = sanitizeText(message);
        const safeData = sanitize(data, safeKind.startsWith('performance.') || safeKind === 'user.problem'
            ? { nodes: 1200, depth: 10 } : {});
        const errorData = Array.isArray(safeData) ? safeData.find((part) => part?.stack) : safeData?.error || safeData;
        const stack = typeof errorData?.stack === 'string' ? errorData.stack.split('\n').slice(0, 5).join('\n') : '';
        const signature = `${safeKind}|${safeMessage}|${stack}|${safeData?.source || ''}|${safeData?.line || ''}`;
        // Search only a tiny tail: repeats do not grow memory or spam disk.
        // Explicit markers and breadcrumbs carry distinct timestamps/context even
        // when their generic message is the same (different settings, world/state).
        const canGroup = level === 'error' || level === 'fatal' || safeKind.startsWith('console.');
        const duplicate = canGroup && this.events.slice(-12).find((entry) => entry.level === level && entry.kind === safeKind
            && entry._signature === signature && now - entry.elapsedMs - this.started < 10000);
        if (duplicate) {
            duplicate.count++;
            duplicate.lastAt = this.wallClock();
            this.encodedSizes.delete(duplicate);
            this.limits.repeatedEvents++;
            this._queue(duplicate);
            this._notify();
            return duplicate.id;
        }
        if (now - this.rateWindow >= 10000) { this.rateWindow = now; this.rateCount = 0; }
        if (this.rateCount++ >= 60) { this.limits.droppedEvents++; this._notify(); return null; }
        const record = limitRecord({ type: 'event', id: `${this.session.id}:e${++this.sequence}`, sessionId: this.session.id,
            at: this.wallClock(), elapsedMs: Math.max(0, now - this.started), level, kind: safeKind, message: safeMessage,
            count: 1, data: safeData, context: this._context() });
        Object.defineProperty(record, '_signature', { value: signature });
        this.events.push(record);
        if (this.events.length > EVENT_LIMIT) { this.events.shift(); this.limits.evictedEvents++; }
        this._queue(record);
        this._notify();
        if ((level === 'error' || level === 'fatal') && this.autoFlush && !this.errorTimer) {
            this.errorTimer = setTimeout(() => { this.errorTimer = null; void this.flush(); }, 100);
            this.errorTimer?.unref?.();
        }
        return record.id;
    }

    error(kind, error, data = null) {
        let message;
        try { message = error?.message || String(error); } catch { message = 'Nieczytelny błąd'; }
        return this.record('error', kind, message, { error: sanitize(error), details: data });
    }

    breadcrumb(kind, message, data = null) { return this.record('info', kind, message, data); }

    recordPerformance(summary) {
        if (this.disposed || !summary || typeof summary !== 'object') return;
        const record = limitRecord({ ...sanitize(summary, { nodes: 1200, depth: 10 }), type: 'performance',
            id: `${this.session.id}:p${++this.sequence}`, sessionId: this.session.id,
            at: this.wallClock(), elapsedMs: Math.max(0, this.now() - this.started) });
        this.performance.push(record);
        if (this.performance.length > SAMPLE_LIMIT) { this.performance.shift(); this.limits.evictedSamples++; }
        this._queue(record);
        this._notify();
    }

    _queue(record) {
        this.pending.set(record.id, record);
        while (this.pending.size > PENDING_LIMIT) { this.pending.delete(this.pending.keys().next().value); this.limits.droppedPending++; }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notify() {
        if (this.notificationPending || !this.listeners.size) return;
        this.notificationPending = true;
        queueMicrotask(() => {
            this.notificationPending = false;
            for (const listener of this.listeners) { try { listener(this.status()); } catch { /* A broken UI must not break logging. */ } }
        });
    }

    status() {
        const errors = this.events.filter((entry) => entry.level === 'error' || entry.level === 'fatal');
        const incidents = this.events.filter((entry) => entry.kind === 'performance.drop');
        return { sessionId: this.session.id, events: this.events.length,
            errors: errors.reduce((sum, entry) => sum + entry.count, 0), incidents: incidents.length,
            totalErrorOccurrences: this.totalErrorOccurrences,
            samples: this.performance.length, lastError: errors.at(-1)?.message || null,
            latestPerformance: this.performance.at(-1) || null, previousAvailable: Boolean(this.previous),
            storage: { ...this.storageState }, dropped: this.limits.droppedEvents, pending: this.pending.size };
    }

    snapshot({ includePrevious = true } = {}) {
        return copy({ schemaVersion, exportedAt: this.wallClock(), session: { ...this.session, context: this._context() },
            events: this.events, performance: this.performance, limits: this.limits, storage: this.storageState,
            totals: { errorOccurrences: this.totalErrorOccurrences },
            ...(includePrevious && this.previous ? { previous: this.previous } : {}) });
    }

    recentEvents(limit = 30) {
        return copy(this.events.slice(-Math.max(1, Math.min(100, Number(limit) || 30))));
    }

    reportText(report = this.snapshot()) { return diagnosticsReportText(report); }

    async _readPrevious() {
        if (this.bridge?.readPrevious) {
            try {
                const previous = await boundedIO(this.bridge.readPrevious(), this.ioTimeoutMs);
                if (previous) this.previous = this._boundedPrevious(previous);
                this.storageState = { state: 'desktop', error: null };
                return;
            } catch (error) { this._storageFailure(error); }
        }
        if (!this.storage) return;
        const current = this.storage.getItem(CURRENT_KEY);
        const prior = current || this.storage.getItem(PREVIOUS_KEY);
        if (prior && prior.length <= STORAGE_LIMIT) {
            try {
                const parsed = JSON.parse(prior);
                if (parsed.schemaVersion === schemaVersion) {
                    this.previous = this._boundedPrevious(parsed);
                    this.storage.setItem(PREVIOUS_KEY, prior);
                }
            } catch { /* Corrupt/old local data cannot prevent game startup. */ }
        }
        this.storageState = { state: 'browser', error: null };
    }

    _boundedPrevious(previous) {
        // Desktop owns a larger bounded history. Take a tail for the UI/export.
        const records = previous.records;
        if (Array.isArray(records)) {
            const unique = new Map();
            for (const record of records.slice(-400)) {
                const safe = sanitize(record, { nodes: 1400, depth: 12 });
                unique.set(safe.id || `${unique.size}`, safe);
            }
            return { sessionId: sanitizeText(previous.sessionId || ''), records: [...unique.values()],
                cleanExit: previous.cleanExit === true, truncated: Boolean(previous.truncated || records.length > 400) };
        }
        return { session: sanitize(previous.session), events: (previous.events || []).slice(-120).map((entry) => sanitize(entry, { nodes: 1400, depth: 12 })),
            performance: (previous.performance || []).slice(-30).map((entry) => sanitize(entry, { nodes: 1400, depth: 12 })),
            truncated: Boolean(previous.truncated) };
    }

    _storageFailure(error) {
        this.storageState = { state: this.storage ? 'browser-fallback' : 'memory', error: sanitizeText(error?.message || error, 200) };
        this._notify();
    }

    _browserSnapshot() {
        // Size each immutable sample once; event sizes are invalidated on a
        // duplicate. Choosing the retained tail only adds/subtracts numbers,
        // rather than repeatedly serializing megabytes to remove one entry.
        const size = (record) => {
            let value = this.encodedSizes.get(record);
            if (value === undefined) {
                value = JSON.stringify(record).length;
                this.encodedSizes.set(record, value);
            }
            return value;
        };
        const snapshot = { schemaVersion, exportedAt: this.wallClock(),
            session: { ...this.session, context: this._context() }, events: [], performance: [],
            limits: this.limits, storage: this.storageState, totals: { errorOccurrences: this.totalErrorOccurrences } };
        // A broken context provider must not defeat the storage bound.
        if (JSON.stringify(snapshot.session).length > 8192) {
            snapshot.session.context = { truncated: true, note: 'Kontekst przekroczył limit zapisu lokalnego.' };
        }
        const eventSizes = this.events.map(size), sampleSizes = this.performance.map(size);
        let eventStart = 0, sampleStart = 0;
        let payload = eventSizes.reduce((sum, value) => sum + value, 0) + sampleSizes.reduce((sum, value) => sum + value, 0)
            + Math.max(0, eventSizes.length - 1) + Math.max(0, sampleSizes.length - 1);
        let header = JSON.stringify(snapshot).length;
        if (header + payload > STORAGE_LIMIT) { snapshot.truncated = true; header = JSON.stringify(snapshot).length; }
        while (header + payload > STORAGE_LIMIT && (eventSizes.length - eventStart > 1 || sampleSizes.length > sampleStart)) {
            const samples = sampleSizes.length - sampleStart;
            const events = eventSizes.length - eventStart;
            if (samples > 10 || events <= 1) {
                payload -= sampleSizes[sampleStart++] + (samples > 1 ? 1 : 0);
            } else payload -= eventSizes[eventStart++] + (events > 1 ? 1 : 0);
        }
        snapshot.events = this.events.slice(eventStart);
        snapshot.performance = this.performance.slice(sampleStart);
        return JSON.stringify(snapshot);
    }

    flush() {
        if (this.flushing) { this.flushAgain = true; return this.flushing; }
        this.flushing = this._flush().catch(async (error) => {
            this._storageFailure(error);
            if (this.storage) {
                try { return await this._flush(); } catch (fallbackError) { this._storageFailure(fallbackError); }
            }
            return false;
        }).finally(() => {
            this.flushing = null;
            if (this.flushAgain) { this.flushAgain = false; void this.flush(); }
        });
        return this.flushing;
    }

    async _flush() {
        await this.ready;
        if (this.bridge?.append && this.storageState.state === 'desktop') {
            // Freeze this flush's work. An error repeated every frame must not
            // keep the same disk operation alive forever by changing its count.
            const remaining = [...this.pending.values()].map(copy);
            let cursor = 0;
            while (cursor < remaining.length) {
                const entries = [];
                let bytes = 0;
                while (cursor < remaining.length) {
                    const entry = remaining[cursor];
                    const size = JSON.stringify(entry).length * 3;
                    if (entries.length && (entries.length >= 32 || bytes + size > 90 * 1024)) break;
                    entries.push(entry); bytes += size; cursor++;
                }
                const result = await boundedIO(this.bridge.append({ sessionId: this.session.id, records: entries }), this.ioTimeoutMs);
                if (result?.ok === false) throw new Error(result.error || 'Nie udało się zapisać logów na dysku.');
                for (const entry of entries) {
                    // Preserve a duplicate updated while IPC was in flight.
                    if (JSON.stringify(this.pending.get(entry.id)) === JSON.stringify(entry)) this.pending.delete(entry.id);
                }
            }
            return true;
        }
        if (!this.storage) return false;
        const encoded = this._browserSnapshot();
        this.storage.setItem(CURRENT_KEY, encoded);
        this.pending.clear();
        return true;
    }

    _capture(target, output) {
        const listen = (name, callback) => {
            target?.addEventListener?.(name, callback);
            this.cleanups.push(() => target?.removeEventListener?.(name, callback));
        };
        listen('error', (event) => {
            this.error('runtime.error', event.error || new Error(event.message || 'Nieobsłużony błąd'),
                { source: event.filename, line: event.lineno, column: event.colno });
        });
        listen('unhandledrejection', (event) => this.error('runtime.promise', event.reason || new Error('Nieobsłużone odrzucenie Promise')));
        listen('pagehide', () => { void this.flush(); });
        for (const level of ['warn', 'error']) {
            const original = output?.[level];
            if (typeof original !== 'function') continue;
            const logger = this;
            const wrapper = function (...args) {
                // Preserve console behavior; logging itself never writes back to console.
                try { original.apply(output, args); } catch { /* Closed devtools / unusual console. */ }
                const safe = args.slice(0, 16).map((arg) => sanitize(arg));
                const message = safe.map((arg) => typeof arg === 'string' ? arg : arg?.message || (typeof arg === 'object' ? '[obiekt]' : String(arg))).join(' ');
                logger.record(level, `console.${level}`, message, safe);
            };
            try { output[level] = wrapper; } catch { continue; }
            this.cleanups.push(() => { if (output[level] === wrapper) output[level] = original; });
        }
    }

    async dispose() {
        if (this.disposed) return this.disposing;
        this.breadcrumb('session.end', 'Sesja zamknięta poprawnie.');
        this.session.cleanShutdown = true;
        this._queue({ type: 'session', id: `${this.session.id}:session`, sessionId: this.session.id, ...this.session });
        this.disposed = true;
        clearInterval(this.flushTimer); clearTimeout(this.errorTimer);
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        let expired = false;
        const drain = async () => {
            // A flush joined above may schedule a follow-up for records queued
            // while its IPC was in flight. Await that work as well. Since disposed
            // blocks new events, the queue can only shrink from here.
            while (!expired) {
                const ok = await this.flush();
                if (!ok) return false;
                if (!this.pending.size) return true;
            }
            return false;
        };
        this.disposing = boundedIO(drain(), this.disposeTimeoutMs).catch((error) => {
            expired = true;
            this.session.cleanShutdown = false;
            this._storageFailure(error);
            return false;
        }).finally(() => this.listeners.clear());
        return this.disposing;
    }
}

export const diagnostics = new Diagnostics();
