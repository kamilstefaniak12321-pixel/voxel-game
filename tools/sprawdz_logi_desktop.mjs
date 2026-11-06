import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createDiagnosticsLog, sanitize, redactText, validateBatch } = require('../desktop/diagnostics-log.cjs');
const { trustedSender, installDiagnosticsIpc } = require('../desktop/diagnostics-ipc.cjs');
import { Diagnostics } from '../src/diagnostics/Diagnostics.js';
import { PerfDiagnostics, PERF_STAGES } from '../src/diagnostics/PerfDiagnostics.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'voxel-diagnostics-'));
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
let date = 1760000000000;
const make = (directory, options = {}) => createDiagnosticsLog({ directory, version: 'test', now: () => new Date(date++), ...options });
const batch = (...records) => ({ sessionId: 'renderer-test', records });
const event = (i, data = {}) => ({ type: 'event', id: i, at: i, level: 'error', kind: 'test', message: `error ${i}`, data });
try {
    check(!validateBatch({ sessionId: '../escape', records: [] }), 'renderer cannot use a path as session id');
    check(!validateBatch(batch(...Array.from({ length: 33 }, (_, i) => event(i)))), 'batch count bounded');
    check(!validateBatch(batch(event(1, { big: 'x'.repeat(100 * 1024) }))), 'batch bytes bounded');
    check(!validateBatch(batch({ type: 'execute', path: '../file' })), 'record type validated');
    const cycle = { token: 'secret', a: 1 }; cycle.self = cycle;
    const cleaned = sanitize(cycle);
    eq(cleaned.token, '[ukryte]', 'secret field redacted');
    eq(cleaned.self, '[cykl]', 'cycles bounded');
    const redacted = redactText('C:\\Users\\PrivateName\\project\\a.js https://u:pass@site/x?token=secret Bearer abcd email@site.com');
    check(!/PrivateName|secret|abcd|u:pass|email@/.test(redacted), 'text paths, credentials, query and email redacted');
    check(!redactText('C:\\Users\\Alice Smith\\project\\a.js Basic YWJjZGVm github_pat_123456789secret').match(/Alice|Smith|YWJjZGVm|123456789secret/),
        'multiword username and native token patterns redacted');

    const journal = path.join(root, 'journal');
    const first = make(journal);
    const writes = Array.from({ length: 40 }, (_, i) => first.append(batch(event(i))));
    check((await Promise.all(writes)).every(result => result.ok), 'concurrent writes accepted');
    await first.flush();
    const firstFiles = await fs.readdir(journal);
    const saved = (await fs.readFile(path.join(journal, firstFiles[0]), 'utf8')).trim().split('\n').map(JSON.parse);
    eq(saved.filter(r => r.kind === 'test').map(r => r.id), Array.from({ length: 40 }, (_, i) => i), 'append order preserved');
    eq(saved[1].sessionId, 'renderer-test', 'renderer identity preserved without controlling filename');
    await first.event('error', 'desktop.renderer-gone', 'GPU error', { reason: 'crashed' });
    eq(first.nativeSnapshot().records.at(-1).data.reason, 'crashed', 'current native crash context available to exports');
    first.fatal(new Error('fatal C:\\Users\\PrivateName\\game'), 'unhandledRejection');
    // Simulate a killed append. Recovery must retain all complete records.
    await fs.appendFile(path.join(journal, firstFiles[0]), '{"type":"event"');
    const second = make(journal);
    const previous = await second.readPrevious();
    eq(previous.sessionId, first.sessionId, 'previous session selected before new startup');
    eq(previous.cleanExit, false, 'interrupted session marked unclean');
    check(previous.truncated, 'partial final line reported');
    eq(previous.records.filter(r => r.kind === 'test').length, 40, 'complete events recovered from partial file');
    const fatal = previous.records.find(r => r.kind === 'desktop.fatal');
    eq(fatal.data.origin, 'unhandledRejection', 'fatal rejection origin retained');
    check(!JSON.stringify(previous).includes('PrivateName'), 'recovered data remains sanitized');
    await second.close();
    const third = make(journal);
    eq((await third.readPrevious()).cleanExit, true, 'normal session closure recognized');
    await third.close(false);
    const fourth = make(journal);
    eq((await fourth.readPrevious()).cleanExit, false, 'save timeout is not a clean closure');
    await fourth.close();

    const rotations = path.join(root, 'rotation');
    await fs.mkdir(rotations);
    await fs.writeFile(path.join(rotations, 'leave-me.txt'), 'preserve');
    const rotating = make(rotations, { maxFileBytes: 2400, maxFiles: 3, maxSessions: 2 });
    for (let i = 0; i < 24; i++) check((await rotating.append(batch(event(i, { text: 'x'.repeat(900) })))).ok, 'rotation write');
    await rotating.flush();
    const names = (await fs.readdir(rotations)).filter(name => name.endsWith('.jsonl'));
    eq(names.length, 3, 'file count bounded across rotations');
    for (const name of names) check((await fs.stat(path.join(rotations, name))).size <= 2400, 'rotated file size bounded');
    eq(await fs.readFile(path.join(rotations, 'leave-me.txt'), 'utf8'), 'preserve', 'retention ignores unrelated files');
    await rotating.close();
    for (let i = 0; i < 5; i++) await make(rotations, { maxFiles: 3, maxSessions: 2 }).close();
    const sessionFiles = (await fs.readdir(rotations)).filter(name => name.endsWith('.jsonl'));
    check(new Set(sessionFiles.map(name => name.slice(0, -12))).size <= 2, 'session retention bounded');

    const failInit = make(path.join(root, 'failure'), { io: { ...fs, mkdir: async () => { throw new Error('disk unavailable'); } } });
    eq((await failInit.append(batch(event(1)))).ok, false, 'directory failure does not throw');
    eq(failInit.status().pendingBytes, 0, 'failed initialization releases queue budget');
    eq((await failInit.flush()).ok, false, 'persistence failure visible to renderer');
    const failWrite = make(path.join(root, 'write-failure'), { io: { ...fs, appendFile: async () => { throw new Error('ENOSPC'); } } });
    eq((await failWrite.append(batch(event(1)))).ok, false, 'full disk does not crash app');
    eq(failWrite.status().pendingBytes, 0, 'failed append releases queue budget');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const held = make(path.join(root, 'held'), { maxQueueBytes: 900, io: { ...fs,
        appendFile: async (...args) => { await gate; return fs.appendFile(...args); } } });
    const pending = held.append(batch(event(1, { text: 'x'.repeat(500) })));
    eq((await held.append(batch(event(2, { text: 'x'.repeat(500) })))).ok, false, 'queue is bounded while disk stalls');
    release();
    check((await pending).ok, 'accepted record survives queue overload');
    await held.close();

    const handlers = new Map();
    const frame = { url: 'gra://voxel-game/index.html' };
    const contents = { mainFrame: frame };
    const window = { webContents: contents, isDestroyed: () => false };
    const sender = { sender: contents, senderFrame: frame };
    check(trustedSender(sender, window), 'game main frame allowed');
    check(!trustedSender({ ...sender, senderFrame: { url: frame.url } }, window), 'subframe rejected');
    frame.url = 'https://external.example/index.html';
    check(!trustedSender(sender, window), 'external navigation rejected');
    frame.url = 'gra://voxel-game/index.html';
    let dialogCalls = 0;
    let cancelled = false;
    const exportPath = path.join(root, 'export.json');
    let openedPath;
    installDiagnosticsIpc({ ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => window, log: fourth,
        dialog: { showSaveDialog: async () => { dialogCalls++; return { canceled: cancelled, filePath: exportPath }; } },
        shell: { openPath: async value => { openedPath = value; return ''; } } });
    eq((await handlers.get('diagnostics:append')({ ...sender, sender: {} }, batch(event(1)))).ok, false, 'IPC validates sender');
    const exported = await handlers.get('diagnostics:export')(sender, {
        report: { version: 'test', events: Array.from({ length: 300 }, (_, i) => event(i)), secret: 'nope' },
        text: 'Raport: C:\\Users\\PrivateName\\log', path: '../escape'
    });
    check(exported.ok, 'report exported through selected native path');
    const exportedData = JSON.parse(await fs.readFile(exportPath, 'utf8'));
    eq(exportedData.events.length, 300, 'export retains bounded event history');
    eq(exportedData.secret, '[ukryte]', 'export performs defense in depth redaction');
    check(exportedData.native.records.length > 0, 'export includes native process events');
    check(!exportedData.readableSummary.includes('PrivateName'), 'readable summary redacted');
    eq(exported.fileName, 'export.json', 'result returns basename, not private path');
    const huge = await handlers.get('diagnostics:export')(sender, { report: { huge: 'x'.repeat(5 * 1024 * 1024) }, text: '' });
    eq(huge.ok, false, 'oversized export rejected');
    eq(dialogCalls, 1, 'invalid export never opens dialog');
    cancelled = true;
    check((await handlers.get('diagnostics:export')(sender, { report: {}, text: '' })).cancelled, 'cancel is explicit');
    check((await handlers.get('diagnostics:folder')(sender)).ok, 'folder can be opened');
    eq(openedPath, fourth.directory, 'folder target cannot be supplied through IPC');

    // Exercise real profiler/core shapes, not a shallow handcrafted record. All
    // 16 CPU stages, slow-frame evidence and sampled GPU data must survive the
    // complete current + previous session export path.
    const integratedLog = make(path.join(root, 'integrated'));
    let tick = 100;
    const integrated = new Diagnostics({ now: () => tick });
    await integrated.initialize({ version: '0.67.0', captureErrors: false, autoFlush: false, storage: null,
        bridge: { readPrevious: () => integratedLog.readPrevious(), append: value => integratedLog.append(value) } });
    const gpuTimer = { generation: 0, clear() {}, begin() {}, end() {}, dispose() {},
        poll(frameId, callback) { callback({ at: tick - 60, ms: 24, latencyFrames: 2 }); },
        info: () => ({ status: 'available', supported: true, disjoint: 0 }) };
    const profiler = new PerfDiagnostics({ now: () => tick, gpuTimer,
        onSummary: value => integrated.recordPerformance(value),
        onIncident: value => integrated.record('warn', value.kind, value.message, { trigger: value.trigger, summary: value.summary }) });
    const game = { world: { chunks: new Map([['a', 1]]), dirtyChunks: new Set(['a']), loadQueue: ['b'], meshVersion: 2,
        generation: { getStats: () => ({ workers: 2, pending: 7, ready: 4, received: 39 }) } },
        farTerrain: { shown: new Set(['a']), wanted: ['b'], tiles: new Map([['a', 1]]) },
        shadows: { stats: () => ({ enabled: true, cascades: 2, updateMs: 1.5 }) },
        bounce: { stats: () => ({ enabled: true, ready: true, pending: { geometry: 2, sources: 1, probes: 3 },
            lastFrame: { time: 2, samples: 7 }, memoryBytes: 234567, updates: 97 }) } };
    const renderer = { info: { memory: { geometries: 900, textures: 32 }, render: { calls: 120, triangles: 1000000 } } };
    for (let i = 0; i <= 20; i++) {
        tick = 100 + i * 60;
        profiler.beginFrame(tick);
        for (const [id] of PERF_STAGES) { profiler.beginStage(id); tick += 2; profiler.endStage(id); }
        profiler.endFrame({ game, renderer });
    }
    const actual = profiler.snapshot();
    eq(actual.stages.length, PERF_STAGES.length, 'fixture produces every measured CPU stage');
    check(actual.gpu.samples >= 3 && actual.suspects.some(item => item.kind === 'gpu'), 'fixture produces sampled GPU suspect');
    for (let i = 0; i < 180; i++) {
        tick += 1000;
        integrated.recordPerformance({ ...actual, at: tick });
        if (i % 20 === 0) await integrated.flush();
    }
    await integrated.flush();
    const current = integrated.snapshot();
    eq(current.performance.length, 180, 'core retains full three-minute sample buffer');
    eq(current.performance.at(-1).gpu.p95Ms, 24, 'core preserves GPU after all CPU stages');
    eq(current.events.find(item => item.kind === 'performance.drop').data.summary.slowFrames[0].stages.length, 5,
        'core preserves stage evidence for incident');
    integratedLog.fatal(new Error('simulated diagnostic failure'), 'uncaughtException');
    const recoveredLog = make(path.join(root, 'integrated'));
    const recovered = await recoveredLog.readPrevious();
    const recoveredPerformance = recovered.records.findLast(record => record.type === 'performance');
    eq(recoveredPerformance.gpu.p95Ms, 24, 'journal recovery retains GPU');
    eq(recoveredPerformance.stages.length, PERF_STAGES.length, 'journal recovery retains all CPU stages');
    current.previous = recovered;
    cancelled = false;
    check((await handlers.get('diagnostics:export')(sender, { report: current, text: integrated.reportText(current) })).ok,
        'complete report accepted by native export');
    const final = JSON.parse(await fs.readFile(exportPath, 'utf8'));
    eq(final.performance.length, 180, 'native export retains all current samples');
    eq(final.performance.at(-1).gpu.p95Ms, 24, 'last current sample keeps GPU');
    eq(final.performance.at(-1).suspects.at(-1).kind, 'gpu', 'last current sample keeps GPU evidence');
    eq(final.events.find(item => item.kind === 'performance.drop').data.summary.slowFrames[0].stages.length, 5,
        'nested incident stage evidence survives export envelope');
    eq(final.previous.records.findLast(record => record.type === 'performance').gpu.p95Ms, 24,
        'previous session GPU survives export envelope');
    eq(final.previous.records.findLast(record => record.type === 'performance').slowFrames[0].stages.length, 5,
        'previous session slow-frame stages survive export envelope');
    await integrated.dispose();
    await recoveredLog.close();
    profiler.dispose();
    console.log(`Logi desktop: ${checks} sprawdzeń — OK`);
} finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unsafe temp cleanup');
    await fs.rm(root, { recursive: true, force: true });
}
