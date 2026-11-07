// Aggregate alternating A/B pairs. Timing is reported, not a flaky CI gate;
// data preservation, bounded cache and comparable inputs are hard assertions.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'test-results/saved-streaming');
const reports = [];
for (let pair = 1; pair <= 3; pair++) for (const variant of ['baseline', 'candidate']) {
    const report = JSON.parse(await readFile(resolve(directory, `${variant}-${pair}/result.json`), 'utf8'));
    assert.equal(report.valid, true, `${variant}-${pair}: completed successfully`);
    assert.deepEqual(report.errors, [], 'No browser exceptions');
    assert.equal(report.samples.length, 1);
    assert.ok(report.integration?.checks?.length > 0, 'Real game save/restart smoke passed');
    reports.push({ variant, pair, ...report });
}
const first = reports[0];
for (const report of reports) {
    assert.deepEqual(report.harness, first.harness, 'Identical runner, fixture and generated data');
    assert.deepEqual(report.configuration, first.configuration, 'Identical record count and sample duration policy');
    assert.deepEqual(report.fixture, first.fixture, 'Identical persistent fixture');
    for (const key of ['platform', 'arch', 'node', 'cpu', 'logicalCpus']) {
        assert.equal(report.environment[key], first.environment[key], `Same ${key}`);
    }
    assert.equal(report.environment.browser.product, first.environment.browser.product, 'Same browser');
    const sample = report.samples[0];
    for (const world of [sample.terrain, sample.noise]) {
        assert.equal(world.checks.persistentEdit, true, 'Edits reach the real IndexedDB record');
        assert.equal(world.checks.fixtureRestored, true);
        assert.ok(world.checks.revisited > 0);
        if (report.variant === 'candidate') {
            assert.equal(world.atOpen.kind, 'compact');
            assert.ok(world.afterTraversal.decodedBytes <= world.afterTraversal.maxDecodedBytes);
            assert.ok(world.afterTraversal.decodedEntries <= world.afterTraversal.maxDecodedEntries);
        }
    }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const metrics = sample => ({
    openMs: sample.terrain.opening.elapsedMs,
    startupMaxGapMs: sample.terrain.opening.heartbeatMaxMs,
    retainedAtOpenMiB: sample.terrain.atOpen.retainedDataBytes / 1048576,
    retainedAfterTraversalMiB: sample.terrain.afterTraversal.retainedDataBytes / 1048576,
    decodedMiB: sample.terrain.afterTraversal.decodedBytes / 1048576,
    readP95Ms: sample.terrain.traversal.readP95Ms,
    readMaxMs: sample.terrain.traversal.readMaxMs,
    noiseRetainedMiB: sample.noise.afterTraversal.retainedDataBytes / 1048576,
});
const variants = {};
for (const variant of ['baseline', 'candidate']) {
    const selected = reports.filter(report => report.variant === variant);
    assert.equal(new Set(selected.map(report => report.source.sha256)).size, 1, 'Each variant has one source fingerprint');
    const samples = selected.map(report => metrics(report.samples[0]));
    variants[variant] = { source: selected[0].source, samples,
        median: Object.fromEntries(Object.keys(samples[0]).map(key => [key, median(samples.map(sample => sample[key]))])) };
}
const result = { valid: true, scope: first.scope, environment: first.environment,
    harness: first.harness, fixture: first.fixture, order: ['A/B', 'B/A', 'A/B'], variants,
    limitations: ['Typed-array payload bytes exclude Map/object overhead and GPU memory.',
        'All encoded snapshots still reside in RAM; only decoded arrays are bounded.',
        'This is a controlled saved-data workload, not gameplay FPS or a physical GPU benchmark.',
        'Opening performs compression; decode cost is included in traversal reads.'] };
await writeFile(resolve(directory, 'comparison.json'), JSON.stringify(result, null, 2));
console.log('SAVED_STREAMING_COMPARISON=' + JSON.stringify(result));
