// Read-only comparison of complete distance policies, not equal chunk sets.
// node compare.mjs <baseline/result.json> <candidate/result.json>
import { readFileSync } from 'node:fs';
const paths = process.argv.slice(2);
if (paths.length !== 2) throw new Error('Expected baseline/result.json and candidate/result.json');
const [baseline, candidate] = paths.map(file => JSON.parse(readFileSync(file, 'utf8')));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const pct = (before, after) => Number.isFinite(before) && before !== 0 && Number.isFinite(after) ? 100 * (after - before) / before : null;
function row(report, phase) {
    const gpuWindows = phase.diagnostics.filter(summary => summary.gpu?.samples > 0);
    const gpuSamples = gpuWindows.reduce((n, summary) => n + summary.gpu.samples, 0);
    const samples = report.samples.filter(sample => sample.phase === phase.name);
    return { name: phase.name, timedPerformance: phase.timedPerformance, durationMs: phase.durationMs,
        fps: phase.frame.averageFps, frameP95Ms: phase.frame.p95Ms, frameP99Ms: phase.frame.p99Ms,
        frameMaxMs: phase.frame.maxMs, cpuMeanMs: phase.cpu.meanMs, cpuP95Ms: phase.cpu.p95Ms,
        updateMeanMs: phase.updateCpu.meanMs, renderMeanMs: phase.renderCpu.meanMs,
        gpuSamples, gpuMeanMs: gpuSamples ? gpuWindows.reduce((n, s) => n + s.gpu.meanMs * s.gpu.samples, 0) / gpuSamples : null,
        meanCalls: avg(samples.map(s => s.resources.render.calls)), meanTriangles: avg(samples.map(s => s.resources.render.triangles)),
        readyAtStart: phase.beforeReady, readyAtEnd: phase.afterReady,
        readyThroughoutSample: samples.length > 0 && samples.every(s => s.ready.all),
        beforeChunks: phase.before?.chunks, afterChunks: phase.after?.chunks,
        afterHeapMiB: phase.after?.heapMiB, afterGeometry: phase.after?.geometry,
        afterFar: phase.after?.far, afterLod: phase.after?.lod, afterDepth: phase.after?.depth,
        generationApplied: (phase.after?.generation?.applied ?? 0) - (phase.before?.generation?.applied ?? 0) };
}
function reduced(report) {
    return { run: report.manifest.runId, commit: report.manifest.commit, version: report.manifest.version,
        sourceSha256: report.manifest.sourceSha256, harnessSha256: report.manifest.harnessSha256,
        reason: report.reason, valid: report.valid, verificationWarnings: report.verificationWarnings ?? [],
        focusLostMs: report.focusLostMs, hiddenMs: report.hiddenMs, errors: report.errors,
        steadyStateMeasured: report.steadyStateMeasured,
        phases: report.phases.filter(p => p.timedPerformance).map(p => row(report, p)),
        checkpoints: report.checkpoints.filter(p => p.phase === 'fixed-half-load').map(p => ({ atMs: p.atMs, ready: p.ready, resources: p.resources })) };
}
const oldFixed = baseline.phases.find(p => p.name === 'fixed-stationary');
const newFixed = candidate.phases.find(p => p.name === 'fixed-stationary');
const checks = {
    sameHarness: baseline.manifest.harnessSha256 === candidate.manifest.harnessSha256,
    sameResolution: same(baseline.device.drawingBuffer, candidate.device.drawingBuffer),
    sameSettings: same(baseline.settings, candidate.settings), sameTiming: same(baseline.method.timing, candidate.method.timing),
    sameGpu: baseline.device.renderer === candidate.device.renderer, sameSeed: baseline.seed === candidate.seed,
    bothFixedSamples: !!oldFixed && !!newFixed,
    sameFixedCamera: !!oldFixed && !!newFixed && same(oldFixed.before.camera, newFixed.before.camera),
    completeFixedSamples: !!oldFixed && !!newFixed && [oldFixed, newFixed].every(p => p.durationMs >= baseline.method.timing.fixed),
    noErrors: !baseline.errors.length && !candidate.errors.length,
    noFocusLoss: !baseline.focusLostMs && !candidate.focusLostMs && !baseline.hiddenMs && !candidate.hiddenMs
};
const result = { checks, policyComparisonValid: Object.values(checks).every(Boolean),
    baseline: reduced(baseline), candidate: reduced(candidate) };
if (result.policyComparisonValid) {
    const before = row(baseline, oldFixed), after = row(candidate, newFixed);
    result.fixedPolicyChangesPercent = Object.fromEntries(['fps', 'frameP95Ms', 'cpuMeanMs', 'gpuMeanMs', 'meanCalls', 'afterHeapMiB']
        .map(key => [key, pct(before[key], after[key])]));
    result.fixedPolicyChangesPercent.geometryBytes = pct(before.afterGeometry.bytes, after.afterGeometry.bytes);
}
result.notes = ['This is a comparison of full distance policies at identical visual settings and time windows, not identical geometry.',
    'A fixed sample can still be streaming; ready fields say which version had completed its near and far world.',
    'Only steadyStateMeasured plus drained queues certifies completed candidate distance coverage.',
    'GPU means are sample-weighted. CPU and GPU overlap; do not add their times.',
    'CPU geometry bytes include near and cached far buffers; these are not VRAM.',
    'Visual-only phases are excluded from performance comparisons.'];
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
