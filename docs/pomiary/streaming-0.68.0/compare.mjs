// node compare.mjs <baseline/result.json> <candidate/result.json>
// Read-only reducer; never invents a GPU percentile from window percentiles.
import { readFileSync } from 'node:fs';

const paths = process.argv.slice(2);
if (paths.length !== 2) throw new Error('Expected baseline/result.json and candidate/result.json');
const [baseline, candidate] = paths.map(file => JSON.parse(readFileSync(file, 'utf8')));
const pct = (oldValue, newValue) => Number.isFinite(oldValue) && oldValue !== 0 && Number.isFinite(newValue)
    ? 100 * (newValue-oldValue) / oldValue : null;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function phaseRow(report, phase) {
    const gpuWindows = phase.diagnostics.filter(summary => summary.gpu?.samples > 0);
    const gpuSamples = gpuWindows.reduce((sum,summary) => sum+summary.gpu.samples,0);
    const samples = report.samples.filter(sample => sample.phase === phase.name);
    const calls = samples.map(sample => sample.resources.render.calls);
    const triangles = samples.map(sample => sample.resources.render.triangles);
    const avg = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
    return { name: phase.name, durationMs: phase.durationMs,
        fps: phase.frame.averageFps, frameP95Ms: phase.frame.p95Ms, frameP99Ms: phase.frame.p99Ms,
        frameMaxMs: phase.frame.maxMs, cpuMeanMs: phase.cpu.meanMs, cpuP95Ms: phase.cpu.p95Ms,
        updateMeanMs: phase.updateCpu.meanMs, renderMeanMs: phase.renderCpu.meanMs,
        gpuSamples, gpuMeanMs: gpuSamples ? gpuWindows.reduce((sum,s) => sum+s.gpu.meanMs*s.gpu.samples,0)/gpuSamples : null,
        drawSnapshots: calls.length, meanCalls: avg(calls), meanTriangles: avg(triangles),
        beforeChunks: phase.before?.chunks, afterChunks: phase.after?.chunks,
        afterDirty: phase.after?.dirty, afterDirtyPlants: phase.after?.dirtyPlants,
        afterHeapMiB: phase.after?.heapMiB, afterGeometry: phase.after?.geometry,
        generationApplied: (phase.after?.generation?.applied ?? 0)-(phase.before?.generation?.applied ?? 0) };
}
function reduced(report) {
    return { run: report.manifest.runId, commit: report.manifest.commit, version: report.manifest.version,
        sourceSha256: report.manifest.sourceSha256, harnessSha256: report.manifest.harnessSha256,
        reason: report.reason, valid: report.valid, verificationWarnings: report.verificationWarnings ?? [],
        focusLostMs: report.focusLostMs, hiddenMs: report.hiddenMs, errors: report.errors,
        phases: report.phases.map(phase => phaseRow(report,phase)) };
}
const oldHeld = baseline.phases.find(phase => phase.name === 'held-stationary');
const newHeld = candidate.phases.find(phase => phase.name === 'held-stationary');
const drained = resource => resource && resource.dirty === 0 && !(resource.dirtyPlants ?? 0) && !(resource.meshJobs?.length);
const checks = {
    sameHarness: baseline.manifest.harnessSha256 === candidate.manifest.harnessSha256,
    sameResolution: baseline.manifest.width === candidate.manifest.width && baseline.manifest.height === candidate.manifest.height,
    sameSettings: same(baseline.settings,candidate.settings),
    sameGpu: baseline.device?.renderer === candidate.device?.renderer,
    sameSeed: baseline.seed === candidate.seed,
    bothHeldSamples: !!oldHeld && !!newHeld,
    sameHeldChunkSet: !!oldHeld && !!newHeld && same(oldHeld.before?.chunkSet?.keys,newHeld.before?.chunkSet?.keys),
    heldQueuesDrained: !!oldHeld && !!newHeld && [oldHeld.before,oldHeld.after,newHeld.before,newHeld.after].every(drained),
    heldChunkSetStable: !!oldHeld && !!newHeld && [oldHeld,newHeld].every(phase => same(phase.before?.chunkSet?.keys,phase.after?.chunkSet?.keys)),
    noErrors: !baseline.errors.length && !candidate.errors.length,
    noLostFocus: baseline.focusLostMs === 0 && candidate.focusLostMs === 0 && baseline.hiddenMs === 0 && candidate.hiddenMs === 0
};
const result = { checks, matchedRenderingComparisonValid: Object.values(checks).every(Boolean),
    baseline: reduced(baseline), candidate: reduced(candidate) };
if (oldHeld && newHeld && result.matchedRenderingComparisonValid) {
    const oldRow = phaseRow(baseline, oldHeld), newRow = phaseRow(candidate, newHeld);
    result.heldChangesPercent = Object.fromEntries(['fps','frameP95Ms','cpuMeanMs','gpuMeanMs','meanCalls','afterHeapMiB']
        .map(key => [key, pct(oldRow[key],newRow[key])]));
    result.heldChangesPercent.geometryBytes = pct(oldRow.afterGeometry?.bytes,newRow.afterGeometry?.bytes);
}
result.notes = ['Positive FPS change is faster; negative time, call, or memory change is less work.',
    'Held sample isolates the same bounded loaded terrain; full800 distance remained selected.',
    'Unheld streaming phases may draw different amounts of completed world and are not pure rendering A/B.',
    'GPU mean is weighted by actual samples. No global GPU p95 is inferred from window percentiles.'];
process.stdout.write(JSON.stringify(result, null, 2)+'\n');
