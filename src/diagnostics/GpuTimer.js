// Sparse, asynchronous GPU timing. Never waits for the GPU or reads a pending result.
// A query measures the render submission enclosed by begin/end, not CPU work.
export class GpuTimer {
    constructor({ sampleEvery = 8, capacity = 4, maxAge = 240 } = {}) {
        this.sampleEvery = sampleEvery;
        this.capacity = capacity;
        this.maxAge = maxAge;
        this.gl = null;
        this.ext = null;
        this.webgl2 = false;
        this.pending = [];
        this.active = null;
        this.status = 'not-initialized';
        this.disjoint = 0;
        this.skipped = 0;
        this.expired = 0;
        this.generation = 0;
    }

    attach(renderer) {
        const gl = renderer?.getContext?.();
        if (gl === this.gl && this.status !== 'context-lost') return;
        this.dispose();
        this.gl = gl;
        if (!gl) { this.status = 'unavailable'; return; }
        if (gl.isContextLost?.()) { this.status = 'context-lost'; return; }
        try {
            this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            this.webgl2 = !!this.ext;
            this.ext ??= gl.getExtension('EXT_disjoint_timer_query');
            this.status = this.ext ? 'ready' : 'unsupported';
        } catch { this.ext = null; this.status = 'unavailable'; }
    }

    delete(query) {
        try {
            if (this.webgl2) this.gl?.deleteQuery(query);
            else this.ext?.deleteQueryEXT(query);
        } catch { /* A lost context already invalidated the object. */ }
    }

    clear() {
        if (this.active) this.end();
        for (const item of this.pending) this.delete(item.query);
        this.pending.length = 0;
        this.generation++;
    }

    begin(renderer, frame, at) {
        if (frame % this.sampleEvery !== 0) return false;
        this.attach(renderer);
        if (!this.ext || this.active || this.status === 'context-lost') return false;
        const gl = this.gl, ext = this.ext;
        if (gl.isContextLost?.()) { this.clear(); this.status = 'context-lost'; return false; }
        if (this.pending.length >= this.capacity) { this.skipped++; return false; }
        let query = null;
        try {
            // Cooperate with developer tools/another profiler instead of nesting queries.
            const current = this.webgl2
                ? gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)
                : ext.getQueryEXT(ext.TIME_ELAPSED_EXT, ext.CURRENT_QUERY_EXT);
            if (current) { this.skipped++; return false; }
            query = this.webgl2 ? gl.createQuery() : ext.createQueryEXT();
            if (!query) { this.skipped++; return false; }
            if (this.webgl2) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
            else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, query);
            this.active = { query, frame, at };
            return true;
        } catch {
            if (query) this.delete(query);
            this.status = 'unavailable';
            this.skipped++;
            return false;
        }
    }

    end() {
        if (!this.active) return;
        const item = this.active;
        this.active = null;
        try {
            if (this.webgl2) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
            else this.ext.endQueryEXT(this.ext.TIME_ELAPSED_EXT);
            this.pending.push(item);
        } catch { this.delete(item.query); this.skipped++; }
    }

    poll(frame, accept) {
        if (!this.ext || frame % 4 !== 0 || this.pending.length === 0) return;
        const gl = this.gl, ext = this.ext;
        try {
        if (gl.isContextLost?.()) { this.clear(); this.status = 'context-lost'; return; }
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            this.disjoint += this.pending.length;
            this.clear();
            this.status = 'disjoint';
            return;
        }
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const item = this.pending[i];
            if (frame - item.frame > this.maxAge) {
                this.expired++; this.delete(item.query); this.pending.splice(i, 1); continue;
            }
            const ready = this.webgl2
                ? gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)
                : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_AVAILABLE_EXT);
            if (!ready) continue;
            const ns = this.webgl2
                ? gl.getQueryParameter(item.query, gl.QUERY_RESULT)
                : ext.getQueryObjectEXT(item.query, ext.QUERY_RESULT_EXT);
            this.delete(item.query);
            this.pending.splice(i, 1);
            if (Number.isFinite(ns) && ns >= 0) {
                this.status = 'ready';
                accept({ frame: item.frame, at: item.at, ms: ns / 1e6, latencyFrames: frame - item.frame });
            }
        }
        } catch {
            this.clear();
            this.status = 'unavailable';
        }
    }

    info() {
        return { status: this.status, sampleEvery: this.sampleEvery, pending: this.pending.length,
            disjoint: this.disjoint, skipped: this.skipped, expired: this.expired };
    }

    dispose() {
        this.clear();
        this.gl = null;
        this.ext = null;
    }
}
