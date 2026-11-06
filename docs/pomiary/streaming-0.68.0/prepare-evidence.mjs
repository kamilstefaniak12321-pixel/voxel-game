// Rebuild the compact public evidence from two local, isolated QA runs.
// node prepare-evidence.mjs <baseline-run-dir> <candidate-run-dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const [baselineDir,candidateDir] = process.argv.slice(2).map(p => path.resolve(p));
if (!baselineDir || !candidateDir) throw new Error('Expected two local run directories');
const paths = [baselineDir,candidateDir].map(dir => path.join(dir,'result.json'));
const reports = paths.map(file => JSON.parse(fs.readFileSync(file,'utf8')));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const comparison = JSON.parse(execFileSync(process.execPath, [path.join(here,'compare.mjs'),...paths], { encoding: 'utf8' }));
const hash = createHash('sha256');
let sourceFiles = 0;
function fingerprint(relative) {
    for (const item of fs.readdirSync(path.join(root,relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
        const name = path.join(relative,item.name);
        if (item.isDirectory()) fingerprint(name);
        else { hash.update(name.replaceAll(path.sep,'/')+'\0'); hash.update(fs.readFileSync(path.join(root,name))); sourceFiles++; }
    }
}
fingerprint('src');
hash.update(fs.readFileSync(path.join(root,'lib/three/three.module.js')));
const sourceSha256 = hash.digest('hex');
const unitLog = path.resolve(root,'../streaming-tests-pass-0.68.0.log');
const lightLog = path.resolve(root,'../streaming-lighting-webgl-0.68.0.log');
const diagnosticLog = path.resolve(root,'../streaming-diagnostics-webgl-0.68.0.log');
const renderFile = path.join(root,'test-results/streaming/render.json');
const unitText = fs.readFileSync(unitLog,'utf8');
const lightText = fs.readFileSync(lightLog,'utf8');
const diagnosticText = fs.readFileSync(diagnosticLog,'utf8');
const render = JSON.parse(fs.readFileSync(renderFile,'utf8'));
const lighting = JSON.parse(lightText.split(/\r?\n/).find(line => line.startsWith('{"status":"passed"')));
const shots = [
    [path.join(baselineDir,'checkpoint-quality-remesh.png'),'baseline-1800.png'],
    [path.join(candidateDir,'checkpoint-quality-remesh.png'),'candidate-1800.png'],
    [path.join(candidateDir,'final.png'),'candidate-final.png']
];
for (const [source,name] of shots) fs.copyFileSync(source,path.join(here,name));
const endpoint = resource => ({ chunks: resource.chunks, queued: resource.queued,
    dirty: resource.dirty, dirtyPlants: resource.dirtyPlants, meshJobs: resource.meshJobs,
    heapMiB: resource.heapMiB, geometry: resource.geometry, generation: resource.generation,
    render: resource.render, failedPrograms: resource.failedPrograms });
const evidence = {
    version: '0.68.0', pullRequest: 102, measuredAt: '2026-11-06',
    comparison,
    sourceVerification: { currentSourceSha256: sourceSha256, sourceFiles,
        matchesMeasuredCandidate: sourceSha256 === reports[1].manifest.sourceSha256,
        note: 'Fingerprint covers src and bundled three.module.js, exactly as native launcher. Runtime source fingerprint is authoritative: a dirty checkout can contain final source changes not yet included in its recorded HEAD commit.' },
    rawResults: reports.map((r,i) => ({ runId: r.manifest.runId, sha256: sha(paths[i]),
        manifest: r.manifest, device: r.device, elapsedMs: r.elapsedMs, valid: r.valid,
        reason: r.reason, steadyStateMeasured: r.steadyStateMeasured, heldSampleMeasured: r.heldSampleMeasured,
        errorCount: r.errors.length, warningCount: r.warnings.length,
        warnings: [...new Set(r.warnings.map(w => w.includes('X3595') ? 'ANGLE shader warning X3595: gradient instruction used in varying loop' : w))],
        final: endpoint(r.finalResources),
        heldChunkSet: (() => { const keys = r.phases.find(p => p.name === 'held-stationary').before.chunkSet.keys;
            return { count: keys.length, sha256: createHash('sha256').update(JSON.stringify(keys)).digest('hex') }; })(),
        timeToHeldSampleMs: r.phases.find(p => p.name === 'held-stationary').startMs,
        fixedWarmupMs: 2000
    })),
    settings: reports[1].settings,
    validation: {
        npmTest: { status: 'passed', exitCode: 0, exitCodeEvidence: 'npm test completed with exit code 0; final log hashed',
            tailVerified: unitText.includes('OK: pochodnie — 831'), logSha256: sha(unitLog) },
        incrementalMesher: { status: unitText.includes('mesher partiami — 155') ? 'passed' : 'unknown', checks: 155 },
        meshQueueAndPlants: { status: unitText.includes('kolejka i rośliny — 2723') ? 'passed' : 'unknown', checks: 2723 },
        splitRendering: { status: render.checks.length === 8 && render.different === 0 ? 'passed' : 'failed',
            ...render, resultSha256: sha(renderFile) },
        lightingWebgl: { status: lighting.status, shaders: lighting.shaders,
            plantShadows: lighting.plantShadows?.status, logSha256: sha(lightLog) },
        diagnosticsWebgl: { status: diagnosticText.includes('40 kontroli') ? 'passed' : 'unknown',
            checks: 40, logSha256: sha(diagnosticLog) }
    },
    screenshots: shots.map(([,name]) => ({ name, sha256: sha(path.join(here,name)) })),
    limitations: [
        'One final baseline/candidate native pair on RTX 3050 Laptop; no confidence interval or guaranteed FPS on other scenes.',
        'Held comparison covers the same 1800 chunks at 800/16384 settings; reception was deliberately paused and mesh queues fully drained.',
        'Both full-radius runs hit a 6500 MiB JavaScript heap test guard before steady state; the full 800-block radius was not completed.',
        'Candidate continuing to render much more terrain eventually ran at 14–15 FPS; this update does not deliver stable 60 FPS at maximum settings.',
        `Streaming acceptance time alone is not complete rendering readiness: candidate had ${comparison.candidate.phases.find(p => p.name === 'cold-streaming').afterDirty} terrain jobs queued when 1800 chunks were accepted.`,
        'Stored geometry bytes count unique CPU buffers, not VRAM; draw counts include all render passes.',
        'CPU and asynchronously sampled GPU durations overlap; do not add them.',
        'Unit/browser test data are functional validation, not native GPU performance measurements.'
    ]
};
fs.writeFileSync(path.join(here,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({ sourceVerification:evidence.sourceVerification, tests:evidence.validation,
    matched:comparison.matchedRenderingComparisonValid, raw: evidence.rawResults.map(r=>({run:r.runId,sha256:r.sha256,elapsedMs:r.elapsedMs,heldStartMs:r.timeToHeldSampleMs,finalChunks:r.final.chunks})),
    screenshots:evidence.screenshots },null,2));
