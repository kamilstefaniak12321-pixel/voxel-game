// Bounded journal. The renderer supplies records, never paths. Normal writes are
// queued and asynchronous; only the fatal-process monitor uses a synchronous append.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_BATCH_BYTES = 96 * 1024;
const MAX_RECORD_BYTES = 16 * 1024;
const FILE_PATTERN = /^session-(\d{8}T\d{9}Z-[a-f0-9]{8})-(\d{5})\.jsonl$/;

function redactText(value, limit = 4096) {
    return String(value).slice(0, limit)
        .replace(/\b(Bearer\s+)[\w.+\/-]+/gi, '$1[ukryte]')
        .replace(/\bBasic\s+[A-Za-z0-9+/=]+/gi, 'Basic [ukryte]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,})\b/g, '[ukryty klucz]')
        .replace(/\b(token|password|passwd|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[ukryte]')
        .replace(/([a-z][\w+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[ukryte]@')
        .replace(/([a-z][\w+.-]*:\/\/[^\s?#]+)[?#][^\s)]*/gi, '$1?[ukryte]')
        .replace(/([a-z]:[\\/]Users[\\/])[^\\/\r\n]+[\\/]/gi, '$1[użytkownik]/')
        .replace(/(\/(?:Users|home)\/)[^/\r\n]+\//g, '$1[użytkownik]/')
        .replace(/(?:file:\/{2,3})?(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>)]*/g,
            local => `<plik>/${local.replace(/\\/g, '/').split('/').pop() || '[ścieżka]'}`)
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
}

function sanitize(value, depth = 0, seen = new Set(), arrayLimit = 100) {
    if (value == null || typeof value === 'boolean') return value ?? null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return redactText(value);
    if (typeof value !== 'object') return '[pominięte]';
    if (seen.has(value)) return '[cykl]';
    if (depth >= 12) return '[limit głębokości]';
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = value.slice(0, arrayLimit).map(item => sanitize(item, depth + 1, seen, arrayLimit));
    else {
        result = {};
        for (const key of Object.keys(value).slice(0, 60)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            const safeKey = redactText(key, 100);
            if (/password|passwd|token|secret|authorization|cookie|credential|api.?key|chat|clipboard|screenshot|inventory|worldName|worldData|playerName|userName|email/i.test(key)) {
                result[safeKey] = '[ukryte]';
                continue;
            }
            try { result[safeKey] = sanitize(value[key], depth + 1, seen, arrayLimit); }
            catch { result[safeKey] = '[niedostępne]'; }
        }
    }
    seen.delete(value);
    return result;
}

// Apply limits to each diagnostic record, not the whole report tree: adding a
// previous-session envelope must not erase its slow-frame/GPU evidence.
function sanitizeReport(report) {
    const safe = sanitize({ ...report, events: null, performance: null, previous: null });
    const history = (items, count) => Array.isArray(items)
        ? items.slice(-count).map(item => sanitize(item)) : [];
    safe.events = history(report.events, 300);
    safe.performance = history(report.performance, 180);
    if (report.previous && typeof report.previous === 'object') {
        safe.previous = sanitize({ ...report.previous, records: null, events: null, performance: null });
        if (Array.isArray(report.previous.records)) safe.previous.records = history(report.previous.records, 400);
        if (Array.isArray(report.previous.events)) safe.previous.events = history(report.previous.events, 120);
        if (Array.isArray(report.previous.performance)) safe.previous.performance = history(report.previous.performance, 30);
    } else delete safe.previous;
    return safe;
}

function recordLine(record) {
    const safe = sanitize(record);
    let line = JSON.stringify(safe);
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) {
        line = JSON.stringify({ type: safe.type, id: safe.id, sessionId: safe.sessionId,
            at: safe.at, level: safe.level, kind: safe.kind, message: safe.message,
            truncated: true, data: { note: 'Rekord przekroczył limit 16 KiB.' } });
    }
    return line + '\n';
}

function validateBatch(batch) {
    if (!batch || typeof batch !== 'object' || typeof batch.sessionId !== 'string' ||
        !/^[a-zA-Z0-9_.:-]{1,100}$/.test(batch.sessionId) || !Array.isArray(batch.records) ||
        batch.records.length > 32) return false;
    try {
        if (Buffer.byteLength(JSON.stringify(batch)) > MAX_BATCH_BYTES) return false;
        return batch.records.every(record => record && typeof record === 'object' && !Array.isArray(record) &&
            ['event', 'performance', 'session'].includes(record.type));
    } catch { return false; }
}

function createDiagnosticsLog({ directory, version, io = fs.promises, syncIo = fs,
    now = () => new Date(), maxFileBytes = 2 * 1024 * 1024, maxFiles = 8,
    maxSessions = 5, maxQueueBytes = 512 * 1024 } = {}) {
    const folder = path.resolve(directory);
    const sessionId = now().toISOString().replace(/[-:.]/g, '') + '-' + randomUUID().slice(0, 8);
    let segment = 0, size = 0, pendingBytes = 0, dropped = 0, lastError = null, closed = false;
    let nativeSequence = 0;
    const nativeRecords = [];
    let chain = Promise.resolve(), previous = null, initialized = false;
    const fileName = () => `session-${sessionId}-${String(segment).padStart(5, '0')}.jsonl`;
    const filePath = () => path.join(folder, fileName());
    const safeFailure = () => { lastError = 'Nie udało się zapisać logów na dysku.'; };
    function nativeRecord(type, level, kind, message, data) {
        const record = { type, sessionId, id: `${sessionId}:native:${++nativeSequence}`,
            at: now().toISOString(), level, kind, message, data };
        const line = recordLine(record);
        nativeRecords.push(JSON.parse(line));
        if (nativeRecords.length > 64) nativeRecords.shift();
        return line;
    }

    async function files() {
        const entries = await io.readdir(folder, { withFileTypes: true });
        return entries.filter(entry => entry.isFile() && FILE_PATTERN.test(entry.name)).map(entry => entry.name).sort();
    }

    async function retain() {
        const names = await files();
        const sessions = [...new Set(names.map(name => FILE_PATTERN.exec(name)[1]))];
        const allowed = new Set(sessions.slice(-maxSessions));
        const eligible = names.filter(name => allowed.has(FILE_PATTERN.exec(name)[1]));
        const keep = new Set(eligible.slice(-maxFiles));
        for (const name of names) if (!keep.has(name) && name !== fileName()) await io.unlink(path.join(folder, name));
    }

    async function loadPrevious(names) {
        if (!names.length) return null;
        const previousId = FILE_PATTERN.exec(names.at(-1))[1];
        const selected = names.filter(name => FILE_PATTERN.exec(name)[1] === previousId);
        const records = [];
        let bytes = 0, truncated = false;
        for (const name of selected.reverse()) {
            // Read only bounded files written by this journal. An oversized foreign
            // file matching the name pattern must not turn startup into an OOM.
            const file = path.join(folder, name);
            const stats = await io.stat(file);
            if (stats.size > maxFileBytes + MAX_RECORD_BYTES) { truncated = true; continue; }
            const lines = (await io.readFile(file, 'utf8')).split('\n').filter(Boolean).reverse();
            for (const line of lines) {
                if (records.length >= 256 || bytes + Buffer.byteLength(line) > 256 * 1024) { truncated = true; break; }
                try { records.push(sanitize(JSON.parse(line))); bytes += Buffer.byteLength(line); }
                catch { truncated = true; } // A killed process may leave a partial last line.
            }
            if (truncated && (records.length >= 256 || bytes > 240 * 1024)) break;
        }
        records.reverse();
        return { sessionId: previousId, records, truncated,
            cleanExit: records.at(-1)?.kind === 'desktop.session.end' };
    }

    const ready = (async () => {
        try {
            await io.mkdir(folder, { recursive: true });
            previous = await loadPrevious(await files());
            await io.writeFile(filePath(), nativeRecord('session', 'info', 'desktop.session.start',
                'Uruchomienie aplikacji.', { version, platform: process.platform }), { flag: 'wx' });
            size = (await io.stat(filePath())).size;
            initialized = true;
            await retain();
        } catch { safeFailure(); }
    })();

    function enqueue(lines) {
        const bytes = Buffer.byteLength(lines);
        if (closed) return Promise.resolve({ ok: false, error: 'Sesja logów jest zamknięta.' });
        if (pendingBytes + bytes > maxQueueBytes) { dropped++; return Promise.resolve({ ok: false, error: 'Kolejka logów jest pełna.' }); }
        pendingBytes += bytes;
        const run = chain.then(async () => {
            await ready;
            try {
                if (!initialized) return { ok: false, error: lastError };
                if (size && size + bytes > maxFileBytes) {
                    segment++;
                    size = 0;
                    await io.writeFile(filePath(), '', { flag: 'wx' });
                    await retain();
                }
                await io.appendFile(filePath(), lines, 'utf8');
                size += bytes;
                return { ok: true };
            } catch { safeFailure(); return { ok: false, error: lastError }; }
            finally { pendingBytes -= bytes; }
        });
        chain = run.catch(() => { pendingBytes = Math.max(0, pendingBytes - bytes); safeFailure(); });
        return run;
    }

    return {
        sessionId, directory: folder,
        async append(batch) {
            if (!validateBatch(batch)) return { ok: false, error: 'Nieprawidłowa lub zbyt duża paczka logów.' };
            if (!batch.records.length) return { ok: true };
            return enqueue(batch.records.map(record => recordLine({ ...record, sessionId: batch.sessionId })).join(''));
        },
        event(level, kind, message, data) {
            return enqueue(nativeRecord('event', level, kind, message, data));
        },
        async readPrevious() { await ready; return previous; },
        async flush() { await ready; await chain; return { ok: !lastError, ...(lastError ? { error: lastError } : {}) }; },
        async close(clean = true) {
            if (closed) return this.flush();
            await this.event(clean ? 'info' : 'warn', clean ? 'desktop.session.end' : 'desktop.session.incomplete',
                clean ? 'Aplikacja zamknięta prawidłowo.' : 'Zamknięcie bez potwierdzenia zapisu gry.');
            closed = true;
            return this.flush();
        },
        status() { return { sessionId, pendingBytes, dropped, lastError }; },
        nativeSnapshot() { return { sessionId, records: JSON.parse(JSON.stringify(nativeRecords)),
            persistence: { pendingBytes, dropped, lastError } }; },
        fatal(error, origin) {
            // A monitor does not handle the exception: Node still terminates.
            // One bounded synchronous append is necessary before that happens.
            try {
                syncIo.mkdirSync(folder, { recursive: true });
                const record = nativeRecord('event', 'fatal', 'desktop.fatal', error?.message ?? String(error),
                    { origin, stack: error?.stack });
                syncIo.appendFileSync(filePath(), record, 'utf8');
            } catch { /* Disk failure must never replace the original fatal error. */ }
        }
    };
}

module.exports = { createDiagnosticsLog, sanitize, sanitizeReport, redactText, validateBatch, MAX_BATCH_BYTES };
