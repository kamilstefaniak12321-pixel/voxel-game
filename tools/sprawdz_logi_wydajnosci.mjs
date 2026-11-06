import assert from 'node:assert/strict';
import { PerfDiagnostics, performanceSuspects } from '../src/diagnostics/PerfDiagnostics.js';
import { GpuTimer } from '../src/diagnostics/GpuTimer.js';
import { PerfMonitor } from '../src/game/PerfMonitor.js';

let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const near = (a, b, label) => ok(Math.abs(a - b) < .005, `${label}: ${a} != ${b}`);

function profiler() {
    let clock = 100;
    const summaries = [], incidents = [];
    const recorder = new PerfDiagnostics({ now: () => clock,
        onSummary: item => summaries.push(item), onIncident: item => incidents.push(item) });
    return { recorder, summaries, incidents, time: n => { clock = n; }, add: n => { clock += n; } };
}

// CPU work of frame A must be paired with A→B, never with B's CPU work.
{
    const p = profiler(), r = p.recorder;
    r.beginFrame(100);
    r.beginStage('update'); p.add(1);
    r.beginStage('mesh'); p.add(8); r.endStage('mesh');
    p.add(1); r.endStage('update'); r.endFrame();
    p.time(200); r.beginFrame(200);
    near(r.frames[0], 100, 'Interval of previous frame');
    near(r.cpu[0], 10, 'CPU from previous frame');
    near(r.stageHistory[0], 2, 'Parent excludes nested work');
    near(r.stageHistory[3], 8, 'Meshing retains measured work');
    r.beginStage('update'); p.add(1); r.endStage('update'); r.endFrame();
    p.time(216); r.beginFrame(216);
    near(r.cpu[1], 1, 'Cheap next frame does not explain preceding hitch');
    r.endFrame(); r.publish(1100);
    equal(p.incidents.length, 1, 'Hitch raises one bounded incident');
    equal(p.summaries[0].frame.maxMs, 100, 'Maximum retained');
    ok(!p.summaries[0].suspects.some(s => s.kind === 'gpu'), 'No GPU diagnosis without measurements');
}

// Pauses, hidden tabs, FPS limits and impossible clock gaps cannot become bogus stalls.
{
    const p = profiler(), r = p.recorder;
    r.beginFrame(100); p.add(2); r.endFrame();
    r.beginFrame(10000, { hidden: true });
    p.time(20000); r.beginFrame(20000); p.add(1); r.endFrame();
    p.time(20016); r.beginFrame(20016);
    equal(r.count, 1, 'Resume skips the inactive interval');
    near(r.frames[0], 16, 'Only resumed gameplay counted');
    r.endFrame(); r.beginFrame(20050, { fpsLimit: 30 });
    equal(r.count, 0, 'Changed FPS cap resets window');
    equal(r.targetFps, 30, '30 FPS cap is a 30 FPS goal');
    r.endFrame(); r.beginFrame(40051, { fpsLimit: 30 });
    equal(r.excludedGaps, 1, 'Suspension gap explicitly counted, not blamed on GPU');
    r.setEnabled(false); r.beginFrame(50000); r.endFrame();
    equal(r.count, 0, 'Disabled mode records no frames');
    r.setEnabled(true); r.beginFrame(50016); r.endFrame();
    equal(r.count, 0, 'Re-enable starts fresh');
}

// 30 FPS intentionally selected must not warn; sustained poor FPS at 60 must warn,
// with a bounded incident rate and measured stage evidence.
{
    const p = profiler(), r = p.recorder;
    for (let i = 0; i < 150; i++) {
        p.time(100 + i * (1000 / 30));
        r.beginFrame(100 + i * (1000 / 30), { fpsLimit: 30 });
        r.beginStage('update'); p.add(2); r.endStage('update'); r.endFrame();
    }
    equal(p.incidents.length, 0, 'Requested 30 FPS never reported as a 60 FPS drop');
    r.reset('test');
    for (let i = 0; i < 200; i++) {
        p.time(10000 + i * 40); r.beginFrame(10000 + i * 40);
        r.beginStage('update'); r.beginStage('mesh'); p.add(25); r.endStage('mesh');
        p.add(1); r.endStage('update'); r.endFrame();
    }
    equal(p.incidents.length, 1, 'Continuous slowdown coalesces for ten seconds');
    ok(p.incidents[0].summary.suspects.some(s => s.kind === 'cpu' && s.evidence.stage === 'mesh'),
        'Measured meshing cost appears in evidence');
    equal(p.incidents[0].summary.stages[0].id, 'mesh', 'Most expensive stage first');
    ok(p.summaries.every(s => Number.isFinite(s.fps)), 'Every emitted FPS is finite');
}

// Sparse GPU evidence has a different scope than a CPU/frame spike.
{
    const sample = { targetFps: 60, cpu: { p95Ms: 2 }, stages: [], frame: { aboveBudget: 1 },
        gpu: { samples: 2, p95Ms: 22, status: 'ready' } };
    equal(performanceSuspects(sample)[0].kind, 'unattributed', 'Two GPU samples insufficient');
    sample.gpu.samples = 3;
    equal(performanceSuspects(sample)[0].certainty, 'sampled-window', 'GPU inference explicitly scoped');
}

// A single expensive frame among 144 cannot disappear behind a good p95.
{
    const p = profiler(), r = p.recorder;
    let at = 100;
    for (let i = 0; i < 150; i++) {
        p.time(at); r.beginFrame(at);
        r.beginStage('update'); r.beginStage('mesh');
        p.add(i === 50 ? 60 : 1); r.endStage('mesh'); r.endStage('update'); r.endFrame();
        at += i === 50 ? 70 : 7;
    }
    const snapshot = p.summaries.find(s => s.frame.maxMs === 70);
    ok(snapshot.cpu.p95Ms < 10, 'Rare hitch correctly has a low CPU p95');
    equal(snapshot.slowFrames[0].stages[0].id, 'mesh', 'Exact culprit stage retained for isolated hitch');
    equal(snapshot.slowFrames[0].cpuMs, 60, 'Isolated slow interval paired with its real CPU');
    equal(snapshot.suspects[0].certainty, 'same-frame-measured-cost', 'Isolated hitch still has measured evidence');
}

// Driver double implements availability separately from result access. Reading a
// not-ready result throws, catching any accidental CPU→GPU synchronization.
function fakeGpu(webgl2) {
    let disjoint = false, lost = false, current = null, ready = false, deletes = 0, reads = 0;
    const constants = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2, CURRENT_QUERY_EXT: 3,
        QUERY_RESULT_AVAILABLE_EXT: 4, QUERY_RESULT_EXT: 5 };
    const objects = [];
    const create = () => { const query = { ns: 7e6 }; objects.push(query); return query; };
    const read = (query, parameter) => {
        if (parameter === 4) return ready;
        if (!ready) throw new Error('Read before ready');
        reads++; return query.ns;
    };
    const ext = { ...constants, getQueryEXT: () => current, createQueryEXT: create,
        beginQueryEXT: (_, query) => { current = query; }, endQueryEXT: () => { current = null; },
        getQueryObjectEXT: read, deleteQueryEXT: () => { deletes++; } };
    const gl = { CURRENT_QUERY: 3, QUERY_RESULT_AVAILABLE: 4, QUERY_RESULT: 5,
        getExtension: name => name === (webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query') ? ext : null,
        isContextLost: () => lost, getParameter: () => disjoint,
        getQuery: () => current, createQuery: create,
        beginQuery: (_, query) => { current = query; }, endQuery: () => { current = null; },
        getQueryParameter: read, deleteQuery: () => { deletes++; } };
    return { renderer: { getContext: () => gl }, gl, ready: value => { ready = value; },
        disjoint: value => { disjoint = value; }, lost: value => { lost = value; },
        current: value => { current = value; }, counts: () => ({ reads, deletes, created: objects.length }) };
}
for (const webgl2 of [true, false]) {
    const fake = fakeGpu(webgl2), timer = new GpuTimer(), samples = [];
    equal(timer.begin(fake.renderer, 1, 100), false, 'Sparse sampling skips seven frames');
    equal(timer.begin(fake.renderer, 8, 108), true, 'Timer starts eligible frame'); timer.end();
    timer.poll(12, s => samples.push(s));
    equal(fake.counts().reads, 0, 'Pending query never read');
    fake.ready(true); timer.poll(16, s => samples.push(s));
    equal(samples[0], { frame: 8, at: 108, ms: 7, latencyFrames: 8 }, 'Result keeps originating frame/time');
    equal(fake.counts().deletes, 1, 'Completed query freed');
    fake.current({ external: true });
    equal(timer.begin(fake.renderer, 24, 124), false, 'Other profiler query not nested');
    fake.current(null); fake.ready(false);
    for (let frame = 32; frame <= 64; frame += 8) { timer.begin(fake.renderer, frame, frame); timer.end(); }
    equal(timer.pending.length, 4, 'Unresponsive GPU query queue bounded');
    fake.disjoint(true); timer.poll(68, s => samples.push(s));
    equal(timer.pending.length, 0, 'Disjoint invalidates pending query set');
    equal(timer.disjoint, 4, 'Invalid results counted');
    equal(samples.length, 1, 'Invalid results never emitted');
    fake.disjoint(false); timer.begin(fake.renderer, 72, 172); timer.end();
    fake.lost(true); timer.poll(76, () => assert.fail('Lost context emitted sample'));
    equal(timer.status, 'context-lost', 'Context loss explicit');
    fake.lost(false); fake.ready(true);
    equal(timer.begin(fake.renderer, 80, 180), true, 'Restored context reacquires extension'); timer.end();
    timer.poll(84, s => samples.push(s));
    equal(samples.length, 2, 'Measurements resume after restoration');
    timer.dispose(); equal(timer.pending.length, 0, 'Dispose frees all pending queries');
}
{
    const timer = new GpuTimer(), unsupported = { getContext: () => ({ getExtension: () => null }) };
    equal(timer.begin(unsupported, 8, 100), false, 'Unsupported timer is harmless');
    equal(timer.status, 'unsupported', 'Unavailable GPU data is explicit, not zero');
    const fake = fakeGpu(true), stalled = new GpuTimer({ maxAge: 4 });
    stalled.begin(fake.renderer, 8, 100); stalled.end(); stalled.poll(16, () => assert.fail());
    equal(stalled.expired, 1, 'Queries expire without blocking');
    equal(stalled.pending.length, 0, 'Expired GPU query freed');
}

// Existing HUD/benchmark must use the same previous-frame alignment.
{
    const p = new PerfMonitor();
    p.beginFrame(100); p.currentUpdate = 30; p.currentRender = 5; p.endFrame();
    p.beginFrame(150); p.currentUpdate = 1; p.currentRender = 1; p.endFrame();
    equal(p.updateMs[0], 30, 'HUD aligns old update with 50 ms interval');
    equal(p.renderMs[0], 5, 'HUD aligns old render submission');
    p.reset(); p.beginFrame(20000); p.endFrame();
    equal(p.count, 0, 'HUD pause reset does not count paused time');
}

console.log(`Logi wydajności: ${checks} sprawdzeń OK (CPU, FPS, pauza, limity, GPU WebGL1/2).`);
