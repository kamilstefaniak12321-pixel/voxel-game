// Assemble public, compact evidence after both native runs have finished.
// This file is outside the measured harness fingerprint and does not run the game.
// node prepare-evidence.mjs <baseline-directory> <candidate-directory> <output.json>
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [baselineArgument, candidateArgument, outputArgument, ...unexpected] = process.argv.slice(2);
if (!baselineArgument || !candidateArgument || !outputArgument || unexpected.length) {
    throw new Error('Expected baseline-directory candidate-directory output.json');
}
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const workspace = resolve(root, '..');
const directories = [baselineArgument, candidateArgument].map(value => resolve(value));
const reports = directories.map(directory => JSON.parse(readFileSync(join(directory, 'result.json'), 'utf8')));
if (reports.some(report => report.finished !== true)) throw new Error('Both native runs must have final reports');
if (!reports[0].manifest.baseline || reports[1].manifest.baseline) throw new Error('Expected baseline first, candidate second');
const comparison = JSON.parse(execFileSync(process.execPath,
    [join(here, 'compare.mjs'), ...directories.map(directory => join(directory, 'result.json'))],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 2 ** 24 }));

function fingerprint(file) {
    const buffer = readFileSync(file);
    return { bytes: buffer.byteLength, sha256: createHash('sha256').update(buffer).digest('hex') };
}
// Use exactly the launcher's source fingerprint, without version metadata or docs.
function runtimeFingerprint(directory) {
    const hash = createHash('sha256');
    let files = 0;
    function visit(relative) {
        for (const item of readdirSync(join(directory, relative), { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))) {
            const name = relative + '/' + item.name;
            if (item.isDirectory()) visit(name);
            else { hash.update(name + '\0'); hash.update(readFileSync(join(directory, name))); files++; }
        }
    }
    visit('src');
    hash.update(readFileSync(join(directory, 'lib/three/three.module.js')));
    return { sourceFiles: files, sourceSha256: hash.digest('hex') };
}
function nativeEvidence(report, directory) {
    const failures = ['browser-errors.json', 'startup-error.json', 'load-error.json', 'renderer-gone.json']
        .filter(name => existsSync(join(directory, name))).map(name => ({ file: name, ...fingerprint(join(directory, name)) }));
    return {
        runId: report.manifest.runId,
        version: report.manifest.version,
        commit: report.manifest.commit,
        dirty: report.manifest.dirty,
        sourceFiles: report.manifest.sourceFiles,
        sourceSha256: report.manifest.sourceSha256,
        harnessSha256: report.manifest.harnessSha256,
        electron: report.manifest.electron,
        chromium: report.manifest.chromium,
        device: report.device,
        report: fingerprint(join(directory, 'result.json')),
        screenshots: readdirSync(directory).filter(name => name.endsWith('.png')).sort()
            .map(name => ({ file: name, ...fingerprint(join(directory, name)) })),
        nativeFailureFiles: failures,
        reason: report.reason,
        valid: report.valid,
        finished: report.finished,
        steadyStateMeasured: report.steadyStateMeasured,
        finalReadiness: report.phases.at(-1)?.afterReady,
        finalResources: report.finalResources,
        verificationWarnings: report.verificationWarnings,
        errors: report.errors,
        focusLostMs: report.focusLostMs,
        hiddenMs: report.hiddenMs
    };
}
const validationFiles = [
    ['npm-test', join(workspace, 'distance-tests-final-0.69.0.log')],
    ['lighting-webgl', join(workspace, 'distance-lighting-webgl-fixed-0.69.0.log')],
    ['plant-split-webgl', join(workspace, 'distance-split-webgl-0.69.0.log')],
    ['menu', join(workspace, 'distance-menu-tests.log')],
    ['depth-and-transition-pixels', join(root, 'test-results/depth-reuse/render.json')],
    ['plant-split-pixels', join(root, 'test-results/streaming/render.json')]
];
const validation = validationFiles.filter(([, file]) => existsSync(file)).map(([name, file]) => {
    const entry = { name, ...fingerprint(file), modifiedAt: statSync(file).mtime.toISOString() };
    // Keep synthetic numerical browser-test evidence, never the full console log.
    if (file.endsWith('.json')) entry.result = JSON.parse(readFileSync(file, 'utf8'));
    return entry;
});
const native = reports.map((report, index) => nativeEvidence(report, directories[index]));
const currentRuntime = runtimeFingerprint(root);
const evidence = {
    schema: 1,
    createdAt: new Date().toISOString(),
    scope: 'Whole distance policies 0.68.0 versus 0.69.0, same visual settings and timed camera path; not identical geometry.',
    settings: reports[1].settings,
    method: reports[1].method,
    comparison,
    native,
    currentRuntime,
    validation,
    acceptance: {
        matchingComparison: comparison.policyComparisonValid,
        bothValid: native.every(run => run.valid),
        noNativeFailureFiles: native.every(run => run.nativeFailureFiles.length === 0),
        candidateReadySteadyState: reports[1].steadyStateMeasured,
        candidateMatchesCurrentRuntime: currentRuntime.sourceSha256 === reports[1].manifest.sourceSha256,
        visualReview: 'Manual observations and limitations are recorded separately in WYNIKI.md.'
    },
    caveats: [
        'The fixed stationary phase can still be streaming; its before/after readiness is part of the evidence.',
        'Guarded or timed-out runs must not be described as complete-distance steady state.',
        'Geometry bytes count unique CPU typed-array buffers of near and cached far meshes, not VRAM or every auxiliary allocation.',
        'Recorded CPU and GPU times overlap and must not be added together.',
        'Log fingerprints identify the coordinator-verified validation files; this script does not infer process exit status from console text.',
        'Screenshot hashes establish provenance; appearance still requires an explicit visual review.',
        'Raw frame arrays and isolated browser profiles remain outside the public compact evidence.'
    ]
};
writeFileSync(resolve(outputArgument), JSON.stringify(evidence, null, 2) + '\n');
process.stdout.write(JSON.stringify({ output: resolve(outputArgument), acceptance: evidence.acceptance }, null, 2) + '\n');
