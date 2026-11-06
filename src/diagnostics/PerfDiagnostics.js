import { GpuTimer } from './GpuTimer.js';

export const PERF_STAGES = Object.freeze([
    ['update', 'Pozostała logika gry'], ['player', 'Gracz, fizyka i interakcje'],
    ['stream', 'Kolejka terenu'], ['mesh', 'Siatki bloków i roślin'],
    ['generation', 'Odbiór lub generowanie terenu'], ['far', 'Budowanie dalekiego terenu'],
    ['light', 'Światło lokalne i odbicia'], ['plants', 'Wzrost i animacje roślin'],
    ['save', 'Przygotowanie zapisu'], ['effects', 'Efekty i ogniska'],
    ['render', 'Przygotowanie renderowania (CPU)'], ['shadows', 'Wysyłanie cieni (CPU)'],
    ['sky', 'Wysyłanie nieba i horyzontu (CPU)'], ['world', 'Wysyłanie świata (CPU)'],
    ['post', 'Promienie i obraz końcowy (CPU)'], ['ui', 'Interfejs i dźwięk'],
]);
const STAGES = PERF_STAGES.length, CAPACITY = 2048;
const INDEX = Object.fromEntries(PERF_STAGES.map(([id], i) => [id, i]));
const round = n => Math.round(n * 1000) / 1000;

function distribution(values) {
    if (!values.length) return { samples: 0, meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
    values.sort((a, b) => a - b);
    return { samples: values.length, meanMs: round(values.reduce((sum, n) => sum + n, 0) / values.length),
        p50Ms: round(values[Math.ceil(values.length * .5) - 1]),
        p95Ms: round(values[Math.ceil(values.length * .95) - 1]),
        p99Ms: round(values[Math.ceil(values.length * .99) - 1]), maxMs: round(values.at(-1)) };
}

export function performanceSuspects(summary) {
    const list = [], budget = 1000 / summary.targetFps;
    const explainedSpike = summary.slowFrames?.find(frame => frame.cpuMs >= budget * .8
        && frame.frameMs > budget * 1.25);
    if (explainedSpike) {
        for (const stage of explainedSpike.stages.filter(stage => stage.ms >= 1).slice(0, 3)) {
            list.push({ kind: 'cpu', message: `${stage.label}: zmierzony koszt CPU w tej samej wolnej klatce.`,
                evidence: { stage: stage.id, ms: stage.ms, cpuMs: explainedSpike.cpuMs,
                    frameMs: explainedSpike.frameMs, at: explainedSpike.at }, certainty: 'same-frame-measured-cost' });
        }
    }
    const costlyCpu = summary.cpu.p95Ms >= budget * .8;
    if (costlyCpu) {
        for (const stage of summary.stages.filter(s => s.p95Ms >= 1).slice(0, 3)) {
            if (list.some(suspect => suspect.evidence.stage === stage.id)) continue;
            list.push({ kind: 'cpu', message: `${stage.label}: duży zmierzony koszt CPU.`,
                evidence: { stage: stage.id, p95Ms: stage.p95Ms, meanMs: stage.meanMs }, certainty: 'measured-cost' });
        }
    }
    if (summary.gpu.samples >= 3 && summary.gpu.p95Ms >= budget * .8) {
        list.push({ kind: 'gpu', message: 'Renderowanie GPU było kosztowne w próbkach tego okresu; próbki nie wskazują konkretnego przycięcia.',
            evidence: { samples: summary.gpu.samples, p95Ms: summary.gpu.p95Ms }, certainty: 'sampled-window' });
    }
    if (!list.length && summary.frame.aboveBudget > 0) {
        list.push({ kind: 'unattributed', message: 'Odstęp między klatkami wzrósł bez wystarczającego dowodu przyczyny. Możliwe oczekiwanie na prezentację, sterownik lub system; nie zmierzono ich osobno.',
            evidence: { cpuP95Ms: summary.cpu.p95Ms, gpuSamples: summary.gpu.samples, gpuStatus: summary.gpu.status }, certainty: 'unknown' });
    }
    return list;
}

// One bounded recorder per renderer. Fixed arrays and stage markers in the hot path;
// objects, sorting and resource snapshots only once per second. Stage times are
// exclusive: nested meshing is subtracted from the encompassing world/update stage.
export class PerfDiagnostics {
    constructor({ onSummary = () => {}, onIncident = () => {}, now = () => performance.now(), gpuTimer = new GpuTimer() } = {}) {
        this.now = now;
        this.onSummary = onSummary;
        this.onIncident = onIncident;
        this.gpuTimer = gpuTimer;
        this.frames = new Float32Array(CAPACITY);
        this.frameAt = new Float64Array(CAPACITY);
        this.cpu = new Float32Array(CAPACITY);
        this.stageHistory = new Float32Array(CAPACITY * STAGES);
        this.stageCurrent = new Float64Array(STAGES);
        this.stagePrevious = new Float64Array(STAGES);
        this.stackIds = new Int16Array(16);
        this.stackAt = new Float64Array(16);
        this.stackChildren = new Float64Array(16);
        this.depth = 0;
        this.count = 0;
        this.frameId = 0;
        this.previous = false;
        this.active = false;
        this.enabled = true;
        this.previousCpu = 0;
        this.lastRaf = 0;
        this.windowAt = 0;
        this.lastIncident = -Infinity;
        this.latest = null;
        this.gpuSamples = [];
        this.overhead = 0;
        this.droppedFrames = 0;
        this.excludedGaps = 0;
        this.deliveryErrors = 0;
        this.lastGame = null;
        this.lastRenderer = null;
        this.acceptGpu = sample => { if (this.gpuSamples.length < 256) this.gpuSamples.push(sample); };
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) this.reset('disabled');
    }

    reset(reason = 'pause') {
        if (reason === 'world-closed' || reason === 'disposed') {
            this.lastGame = null;
            this.lastRenderer = null;
        }
        this.previous = false;
        this.active = false;
        this.depth = 0;
        this.count = 0;
        this.lastRaf = 0;
        this.windowAt = 0;
        this.overhead = 0;
        this.gpuSamples.length = 0;
        this.gpuTimer.clear();
        this.lastResetReason = reason;
    }

    beginFrame(raf, { active = true, state = 'playing', fpsLimit = 0, hidden = false } = {}) {
        const started = this.now();
        const targetFps = Math.min(60, fpsLimit > 0 ? fpsLimit : 60);
        const eligible = this.enabled && active && !hidden;
        if (!eligible) { if (this.active || this.previous) this.reset(hidden ? 'hidden' : state); return false; }
        // Chat/inventory do not pause the simulation. Other phases are explicitly
        // excluded by the caller; a changed FPS cap must start a new window.
        if (this.targetFps !== targetFps) this.reset('fps-limit');
        this.active = true;
        this.targetFps = targetFps;
        this.state = state;
        this.frameId++;
        const gpuGeneration = this.gpuTimer.generation;
        this.gpuTimer.poll(this.frameId, this.acceptGpu);
        if (this.gpuTimer.generation !== gpuGeneration) this.gpuSamples.length = 0;
        if (this.previous) {
            const interval = raf - this.lastRaf;
            if (interval > 0 && interval <= 10000) {
                if (this.count < CAPACITY) {
                    const i = this.count++;
                    this.frames[i] = interval;
                    this.frameAt[i] = this.lastRaf;
                    this.cpu[i] = this.previousCpu;
                    this.stageHistory.set(this.stagePrevious, i * STAGES);
                } else this.droppedFrames++;
            } else {
                // A suspension/debugger break is not confidently attributable to rendering.
                this.excludedGaps++;
                this.reset('clock-gap');
                this.active = true;
            }
        }
        if (this.windowAt === 0) this.windowAt = raf;
        if (raf - this.windowAt >= 1000 && this.count > 0) this.publish(raf);
        this.stageCurrent.fill(0);
        this.depth = 0;
        this.lastRaf = raf;
        this.frameCpuAt = this.now();
        this.previous = false;
        this.overhead += this.frameCpuAt - started;
        return true;
    }

    beginStage(id) {
        if (!this.active || this.depth >= this.stackIds.length || INDEX[id] === undefined) return;
        const t = this.now(), d = this.depth++;
        this.stackIds[d] = INDEX[id];
        this.stackAt[d] = t;
        this.stackChildren[d] = 0;
    }

    endStage(id) {
        if (!this.active || this.depth === 0) return;
        const d = this.depth - 1;
        if (this.stackIds[d] !== INDEX[id]) return;
        this.depth = d;
        const elapsed = Math.max(0, this.now() - this.stackAt[d]);
        this.stageCurrent[this.stackIds[d]] += Math.max(0, elapsed - this.stackChildren[d]);
        if (d > 0) this.stackChildren[d - 1] += elapsed;
    }

    beginGpu(renderer) {
        if (!this.active) return;
        const started = this.now();
        this.gpuTimer.begin(renderer, this.frameId, this.lastRaf);
        this.overhead += this.now() - started;
    }

    endGpu() {
        const started = this.now();
        this.gpuTimer.end();
        this.overhead += this.now() - started;
    }

    endFrame({ game, renderer } = {}) {
        if (!this.active) return;
        const started = this.now();
        // Any open section means its enclosing game operation threw. Do not carry
        // that section into the next frame; the error recorder owns the failure.
        this.depth = 0;
        this.previousCpu = Math.max(0, started - this.frameCpuAt);
        this.stagePrevious.set(this.stageCurrent);
        this.lastGame = game ?? null;
        this.lastRenderer = renderer ?? null;
        this.previous = true;
        this.overhead += this.now() - started;
    }

    resources() {
        const game = this.lastGame, renderer = this.lastRenderer;
        if (!game) return {};
        const world = game.world, far = game.farTerrain;
        return {
            chunks: world?.chunks?.size ?? 0, queued: world?.loadQueue?.length ?? 0,
            dirty: world?.dirtyChunks?.size ?? 0, meshVersion: world?.meshVersion ?? 0,
            dirtyPlants: world?.dirtyPlants?.size ?? 0,
            distanceLod: { enabled: Boolean(world?.distanceLod),
                dataRadiusChunks: world?.loadRadius ?? 0, visualDistance: game.viewDistance ?? null },
            shaftDepthSource: game.lightShafts?.lastDepthSource ?? 'unknown',
            meshJobs: { terrain: Boolean(world?.meshJobs?.terrain), plants: Boolean(world?.meshJobs?.plants) },
            generation: world?.generation?.getStats?.() ?? null,
            far: { shown: far?.shown?.size ?? 0, wanted: far?.wanted?.length ?? 0, cached: far?.tiles?.size ?? 0 },
            shadows: game.shadows?.stats?.() ?? null,
            bounce: game.bounce?.stats?.() ?? null,
            memory: renderer?.info?.memory ? { ...renderer.info.memory } : null,
            draws: renderer?.info?.render ? { ...renderer.info.render } : null,
            heapMiB: globalThis.performance?.memory ? round(performance.memory.usedJSHeapSize / 1048576) : null,
            counterScope: 'snapshot-at-window-end; draws describe the preceding rendered frame, not GPU duration',
        };
    }

    publish(at) {
        const intervals = Array.from(this.frames.subarray(0, this.count));
        const cpu = distribution(Array.from(this.cpu.subarray(0, this.count)));
        const frame = distribution([...intervals]);
        const durationMs = intervals.reduce((sum, n) => sum + n, 0);
        const budget = 1000 / this.targetFps;
        frame.aboveBudget = intervals.filter(n => n > budget * 1.25).length;
        frame.above33ms = intervals.filter(n => n > 1000 / 30).length;
        frame.above50ms = intervals.filter(n => n > 50).length;
        const stages = PERF_STAGES.map(([id, label], j) => {
            const values = [];
            for (let i = 0; i < this.count; i++) values.push(this.stageHistory[i * STAGES + j]);
            return { id, label, ...distribution(values) };
        }).filter(stage => stage.maxMs > .001).sort((a, b) => b.p95Ms - a.p95Ms);
        // Keep exact CPU evidence for isolated hitches; one severe frame can be
        // hidden by p95 in a high-refresh window. Values remain paired with its
        // following RAF interval, including each exclusive stage of that frame.
        const slowFrames = intervals.map((frameMs, i) => ({ frameMs, i }))
            .filter(item => item.frameMs > budget * 1.25)
            .sort((a, b) => b.frameMs - a.frameMs).slice(0, 3).map(({ frameMs, i }) => ({
                at: round(this.frameAt[i]), frameMs: round(frameMs), cpuMs: round(this.cpu[i]),
                stages: PERF_STAGES.map(([id, label], j) => ({ id, label,
                    ms: round(this.stageHistory[i * STAGES + j]) }))
                    .filter(stage => stage.ms >= .01).sort((a, b) => b.ms - a.ms).slice(0, 5),
            }));
        // Query results arrive later than the originating frame. Keep valid recent
        // samples even if their frame preceded this CPU window, and expose the
        // exact sample time range instead of silently relabelling their time.
        const usefulGpu = this.gpuSamples.filter(s => s.at >= at - 5000 && s.at <= at);
        const gpu = { ...this.gpuTimer.info(), ...distribution(usefulGpu.map(s => s.ms)),
            maxLatencyFrames: usefulGpu.length ? Math.max(...usefulGpu.map(s => s.latencyFrames)) : null,
            sampledFrom: usefulGpu.length ? Math.min(...usefulGpu.map(s => s.at)) : null,
            sampledTo: usefulGpu.length ? Math.max(...usefulGpu.map(s => s.at)) : null,
            scope: 'sampled render GPU time; delayed results, not exact attribution of each slow frame' };
        let resources;
        try { resources = this.resources(); }
        catch { resources = { unavailable: true }; }
        const summary = { at: round(at), durationMs: round(durationMs), frames: this.count,
            fps: round(1000 * this.count / durationMs), targetFps: this.targetFps, state: this.state,
            frame, cpu, stages, slowFrames, gpu, resources,
            overheadMs: round(this.overhead), overheadScope: 'recorder/GPU-query CPU per window; stage clock calls are inside measured CPU',
            droppedFrames: this.droppedFrames, excludedGaps: this.excludedGaps, deliveryErrors: this.deliveryErrors,
            thresholdMs: round(budget * 1.25), stageScope: 'exclusive CPU; render stages measure command submission, not GPU execution' };
        summary.suspects = performanceSuspects(summary);
        this.latest = summary;
        try { this.onSummary(summary); } catch { this.deliveryErrors++; }
        const sustained = summary.frames >= 12 && summary.fps < this.targetFps * .9;
        const hitch = frame.maxMs > Math.max(50, budget * 2);
        if ((sustained || hitch) && at - this.lastIncident >= 10000) {
            this.lastIncident = at;
            const incident = { kind: 'performance.drop', message: hitch
                ? `Przycięcie ${frame.maxMs.toFixed(1)} ms; ${summary.fps.toFixed(1)} FPS w ostatnim okresie.`
                : `Spadek płynności: ${summary.fps.toFixed(1)} FPS przy celu ${this.targetFps} FPS.`,
                at: summary.at, trigger: hitch ? 'hitch' : 'sustained', summary };
            try { this.onIncident(incident); } catch { this.deliveryErrors++; }
        }
        this.count = 0;
        this.windowAt = at;
        this.gpuSamples.length = 0;
        this.overhead = 0;
    }

    snapshot() { return this.latest; }
    dispose() { this.reset('disposed'); this.gpuTimer.dispose(); }
}
