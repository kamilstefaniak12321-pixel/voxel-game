// Diagnostics deliberately keep technical context, not save contents or personal paths.
const PRIVATE_KEY = /password|passwd|secret|token|api.?key|authorization|cookie|credential|chat|clipboard|screenshot|inventory|worldName|worldData|playerName|userName|email/i;
const MAX_TEXT = 1600;

export function sanitizeText(value, limit = MAX_TEXT) {
    let text;
    try { text = String(value); } catch { return '[nieczytelna wartość]'; }
    text = text
        .replace(/https?:\/\/[^\s"'<>)]*/gi, (url) => {
            try {
                const parsed = new URL(url);
                return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
            } catch { return '[adres]'; }
        })
        .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[ukryte uwierzytelnienie]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{15,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,})\b/g, '[ukryty klucz]')
        .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*["']?[^\s,"';&]+/gi, '$1=[ukryte]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[ukryty email]')
        .replace(/((?:file:\/{2,3})?[A-Za-z]:[\\/]Users[\\/])[^\\/\r\n]+[\\/]/gi, '$1[użytkownik]/')
        .replace(/(\/(?:Users|home)\/)[^/\r\n]+\//g, '$1[użytkownik]/')
        // Keep a source basename and line numbers: useful stack, no username/path.
        .replace(/(?:file:\/{2,3})?(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>)]*/g, (path) => {
            const name = path.replace(/\\/g, '/').split('/').pop();
            return `<plik>/${name || '[ścieżka]'}`;
        })
        .replace(/\/(?:Users|home|data\/user|storage\/emulated)\/[^\s"'<>)]*/g, (path) => `<plik>/${path.split('/').pop()}`)
        .replace(/%[A-Za-z_]+%[\\/][^\s"'<>)]*/g, '[ścieżka]');
    return text.length > limit ? `${text.slice(0, limit)}…[ucięto]` : text;
}

export function sanitize(value, options = {}) {
    const seen = new WeakSet();
    let nodes = 0;
    const depthLimit = options.depth ?? 6;
    const nodeLimit = options.nodes ?? 240;
    function visit(input, depth, key = '') {
        if (PRIVATE_KEY.test(key)) return '[ukryte]';
        if (++nodes > nodeLimit) return '[limit danych]';
        if (input === null || input === undefined) return input ?? null;
        if (typeof input === 'string') return sanitizeText(input, key === 'stack' ? 4000 : MAX_TEXT);
        if (typeof input === 'number') return Number.isFinite(input) ? input : null;
        if (typeof input === 'boolean') return input;
        if (typeof input === 'bigint') return String(input);
        if (typeof input === 'function' || typeof input === 'symbol') return `[${typeof input}]`;
        if (depth > depthLimit) return '[limit głębokości]';
        if (seen.has(input)) return '[cykl]';
        seen.add(input);
        if (input instanceof Error) {
            return { name: sanitizeText(input.name, 100), message: sanitizeText(input.message),
                stack: sanitizeText(input.stack || '', 4000),
                ...(input.cause ? { cause: visit(input.cause, depth + 1) } : {}) };
        }
        if (Array.isArray(input)) {
            const result = input.slice(0, 32).map((entry) => visit(entry, depth + 1));
            if (input.length > 32) result.push(`[pominięto ${input.length - 32}]`);
            return result;
        }
        const result = {};
        let descriptors;
        try { descriptors = Object.getOwnPropertyDescriptors(input); }
        catch { return '[nieczytelny obiekt]'; }
        for (const [name, descriptor] of Object.entries(descriptors).slice(0, options.keys ?? 48)) {
            if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
            result[sanitizeText(name, 80)] = 'value' in descriptor
                ? visit(descriptor.value, depth + 1, name) : '[getter pominięty]';
        }
        return result;
    }
    try { return visit(value, 0); } catch { return '[błąd odczytu danych]'; }
}

export function limitRecord(record, maxChars = 12000) {
    if (JSON.stringify(record).length <= maxChars) return record;
    const result = { type: record.type, id: record.id, sessionId: record.sessionId, at: record.at,
        elapsedMs: record.elapsedMs, level: record.level, kind: record.kind, message: record.message,
        count: record.count, data: { truncated: true, note: 'Szczegóły przekroczyły limit rekordu.' } };
    if (record.type === 'performance') Object.assign(result, { frames: record.frames, durationMs: record.durationMs,
        fps: record.fps, frame: record.frame, cpu: record.cpu, gpu: record.gpu,
        stages: record.stages?.slice(0, 8), resources: { truncated: true } });
    return JSON.stringify(result).length <= maxChars ? result : {
        type: record.type, id: record.id, sessionId: record.sessionId, at: record.at,
        elapsedMs: record.elapsedMs, level: record.level, kind: record.kind,
        message: sanitizeText(record.message || 'Przekroczono limit danych rekordu.', 200),
        count: record.count, truncated: true
    };
}
