import assert from 'node:assert/strict';
import { Diagnostics } from '../src/diagnostics/Diagnostics.js';
import { sanitize, sanitizeText } from '../src/diagnostics/Sanitize.js';

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const memory = () => {
    const data = new Map();
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};
const clock = () => {
    let now = 100;
    return { now: () => now, advance: (delta) => { now += delta; }, wallClock: () => new Date(1700000000000 + now).toISOString() };
};
const create = async (options = {}) => {
    const time = clock();
    const diagnostics = new Diagnostics(time);
    await diagnostics.initialize({ version: '0.67.0', captureErrors: false, autoFlush: false, storage: null, ...options });
    return { diagnostics, time };
};

// Redaction must preserve actionable code location without exposing a local account or token.
const privateText = 'Error at file:///C:/Users/Alice/private/game/src/main.js:24:8 token=SECRET123 https://alice:secret@example.test/api?q=private#credential alice@example.test Bearer ABCDEF';
const redacted = sanitizeText(privateText);
check(!/Alice|SECRET123|q=private|credential|alice@|ABCDEF|alice:secret/.test(redacted), 'Credentials and private paths removed');
check(redacted.includes('main.js:24:8'), 'Basename/line retained for debugging');
check(!sanitizeText('/home/private-user/world/main.js:1').includes('private-user'), 'Linux user path removed');
check(!sanitizeText('C:\\Users\\Alice Smith\\Documents\\model.js').includes('Alice Smith'), 'Windows username with spaces removed');
check(!sanitizeText('github_pat_123456789secret').includes('123456789secret'), 'Known token patterns removed');
const circular = { fps: 60, token: 'secret', chatMessage: 'private chat', value: 1n };
circular.self = circular;
let getterCalls = 0;
Object.defineProperty(circular, 'dangerous', { enumerable: true, get() { getterCalls++; throw new Error('getter'); } });
const safe = sanitize(circular);
equal(getterCalls, 0, 'No getter executed during diagnostics');
equal(safe.self, '[cykl]', 'Cycles are bounded');
equal(safe.token, '[ukryte]', 'Sensitive key removed');
equal(safe.chatMessage, '[ukryte]', 'Chat contents removed');
equal(sanitize({ api_key: 'first-secret', apiKey: 'second-secret', username: 'Private User' }),
    { api_key: '[ukryte]', apiKey: '[ukryte]', username: '[ukryte]' }, 'API key variants and account names redacted in console objects');
equal(safe.fps, 60, 'Technical values retained');
equal(sanitize({ value: NaN }).value, null, 'Non-finite values remain JSON compatible');
check(JSON.stringify(sanitize({ message: 'x'.repeat(100000) })).length < 2000, 'Long strings bounded');

// Capture global failures, preserve console behavior, restore original hooks after disposal.
const target = new EventTarget();
const written = [];
const originalWarn = (...args) => written.push(args);
const output = { warn: originalWarn, error: (...args) => written.push(args) };
const capture = await create({ captureErrors: true, eventTarget: target, console: output });
output.warn('Texture missing', { path: 'C:\\Users\\Alice\\assets\\leaf.png' });
const event = new Event('error');
Object.assign(event, { error: new Error('broken shader'), filename: 'file:///C:/Users/Alice/src/Shader.js', lineno: 4 });
target.dispatchEvent(event);
const rejection = new Event('unhandledrejection');
Object.assign(rejection, { reason: new Error('failed save') });
target.dispatchEvent(rejection);
equal(written.length, 1, 'Console still receives original call');
check(capture.diagnostics.snapshot().events.some((entry) => entry.kind === 'runtime.error'), 'Runtime exception captured');
check(capture.diagnostics.snapshot().events.some((entry) => entry.kind === 'runtime.promise'), 'Unhandled rejection captured');
check(!JSON.stringify(capture.diagnostics.snapshot()).includes('Alice'), 'Captured stack and context sanitized');
await capture.diagnostics.dispose();
equal(output.warn, originalWarn, 'Console restored after disposal');

// Group repeated failures and bound unrelated floods without allocating unbounded histories.
const { diagnostics: bounded, time } = await create();
for (let i = 0; i < 2000; i++) bounded.error('renderer.failure', new Error('same failure'));
equal(bounded.snapshot().events.filter((entry) => entry.kind === 'renderer.failure').length, 1, 'Repeated error is one entry');
equal(bounded.status().errors, 2000, 'Repeat count remains visible');
equal(bounded.status().totalErrorOccurrences, 2000, 'Monotonic error total includes grouped repeats');
for (let i = 0; i < 4000; i++) bounded.error(`unique.${i}`, new Error(`failure ${i}`));
check(bounded.status().events <= 60, 'Error storm rate capped');
check(bounded.status().dropped > 3900, 'Suppression is explicit');
equal(bounded.status().totalErrorOccurrences, 6000, 'Rate-limited error occurrences still advance notification counter');
for (let batch = 0; batch < 9; batch++) {
    time.advance(11000);
    for (let i = 0; i < 59; i++) bounded.breadcrumb(`next.${batch}.${i}`, 'Next action');
}
equal(bounded.status().events, 300, 'Event ring bounded');
equal(bounded.status().errors, 0, 'Older error entries can be evicted from retained history');
equal(bounded.status().totalErrorOccurrences, 6000, 'Eviction cannot decrease session error total');
bounded.error('after.eviction', new Error('New failure after history rolled over'));
equal(bounded.status().totalErrorOccurrences, 6001, 'New failure after eviction advances notification counter');
equal(bounded.snapshot().totals.errorOccurrences, 6001, 'Export preserves monotonic count including rate-limited errors');
check(bounded.status().pending <= 160, 'Pending writes bounded even without storage');
for (let i = 0; i < 400; i++) bounded.recordPerformance({ fps: 60, durationMs: 1000, frames: 60, frame: { maxMs: 17, p95Ms: 16.7 }, cpu: { meanMs: 4 } });
equal(bounded.status().samples, 180, 'Performance history bounded at three minutes');
await bounded.dispose();

// Browser restart retains previous error and context, not just the new session.
const storage = memory();
const first = await create({ storage });
first.diagnostics.setContextProvider(() => ({ state: 'playing', seed: 2138286349, position: { x: 188, y: 132, z: -252 } }));
first.diagnostics.breadcrumb('world.loaded', 'Wczytano świat.');
first.diagnostics.recordPerformance({ fps: 48, durationMs: 1000, frames: 48, frame: { p95Ms: 30, maxMs: 60, above33ms: 4 },
    cpu: { meanMs: 20 }, gpu: { status: 'unsupported', samples: 0 },
    stages: [{ id: 'generation', label: 'Generacja terenu', meanMs: 10, maxMs: 40 }],
    slowFrames: [{ frameMs: 60, cpuMs: 50, stages: [{ id: 'generation', label: 'Generacja terenu', ms: 40 }] },
        { frameMs: 45, cpuMs: 35, stages: [{ id: 'generation', label: 'Generacja terenu', ms: 25 }] }],
    suspects: [{ kind: 'cpu', message: 'Wysoki czas CPU', evidence: { generationMs: 10 } }] });
first.diagnostics.record('warn', 'user.problem', 'Zaznaczony problem', { summary: first.diagnostics.status().latestPerformance });
first.diagnostics.error('world.save', new Error('No space'));
await first.diagnostics.flush();
const second = await create({ storage });
check(second.diagnostics.status().previousAvailable, 'Previous session found after restart');
check(JSON.stringify(second.diagnostics.snapshot().previous).includes('No space'), 'Previous failure retained');
const currentReport = first.diagnostics.reportText();
check(currentReport.includes('Generacja terenu') && currentReport.includes('No space'), 'Report contains costliest stage and errors');
check(currentReport.includes('unsupported'), 'Unsupported GPU remains explicit');
check(currentReport.includes('podejrzeniami'), 'Report labels diagnosis as evidence, not certain cause');
check(currentReport.includes('65.00 ms CPU w 2 obserwacjach'), 'Slow-frame report ranks measured cost in those exact frames');
check(currentReport.includes('najwyżej 3 najwolniejsze klatki'), 'Slow-frame sample limitation stated');
check(currentReport.includes('Wolna klatka 60.0 ms: CPU 50.0 ms'), 'Marked-problem report exposes exact-frame evidence readably');
check(!currentReport.includes('Szczegóły: {"summary"'), 'Plain text report does not dump a whole JSON summary');
check(JSON.stringify(first.diagnostics.snapshot()).includes('2138286349'), 'Reproduction context retained');
first.diagnostics.setVersion('0.67.1');
equal(first.diagnostics.snapshot().session.version, '0.67.1', 'Async version resolution supported');

// Local storage limits should hold for a long complex session.
for (let i = 0; i < 300; i++) first.diagnostics.recordPerformance({ fps: 50, durationMs: 1000, frames: 50,
    resources: { description: 'x'.repeat(1500), extra: 'y'.repeat(1500) }, stages: Array.from({ length: 20 }, (_, id) => ({ id, label: 'stage', meanMs: 1 })) });
await first.diagnostics.flush();
check([...storage.data.values()].reduce((sum, value) => sum + value.length * 2, 0) <= 256 * 1024, 'Current + previous storage <=256 KiB');
await first.diagnostics.dispose(); await second.diagnostics.dispose();

// Growing fallback history must not trigger quadratic full-history JSON work.
// Count serialized characters instead of asserting machine-dependent timings.
const efficientStore = memory();
const efficient = await create({ storage: efficientStore });
for (let i = 0; i < 180; i++) efficient.diagnostics.recordPerformance({
    fps: 60, frames: 60, durationMs: 1000,
    resources: { detailA: 'x'.repeat(1500), detailB: 'y'.repeat(1500), detailC: 'z'.repeat(1500) }
});
const rawHistoryChars = JSON.stringify(efficient.diagnostics.snapshot()).length;
const originalStringify = JSON.stringify;
let serializedChars = 0;
JSON.stringify = function (...args) {
    const result = originalStringify.apply(JSON, args);
    if (typeof result === 'string') serializedChars += result.length;
    return result;
};
try {
    await efficient.diagnostics.flush();
    check(serializedChars < rawHistoryChars + 4 * 65536, 'First bounded fallback flush serializes only linear history plus final tail');
    serializedChars = 0;
    await efficient.diagnostics.flush();
    check(serializedChars < 3 * 65536, 'Unchanged fallback flush reuses record sizes instead of serializing full history');
} finally { JSON.stringify = originalStringify; }
check([...efficientStore.data.values()].every(value => value.length <= 65536), 'Efficient tail selection preserves storage cap');
efficient.diagnostics.setContextProvider(() => Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, 'x'.repeat(1500)])));
await efficient.diagnostics.flush();
check([...efficientStore.data.values()].every(value => value.length <= 65536), 'Oversized context cannot defeat local storage cap');
const retainedLocal = JSON.parse(efficientStore.getItem('voxel-diagnostics-current-v1'));
equal(retainedLocal.session.context.truncated, true, 'Oversized local context truncation is explicit');
await efficient.diagnostics.dispose();

// A disk/IPC failure must immediately use bounded local fallback and never recurse via console.
const fallbackStore = memory();
const fallback = await create({ storage: fallbackStore, bridge: { readPrevious: async () => null, append: async () => ({ ok: false, error: 'Disk full' }) } });
fallback.diagnostics.error('test.failure', new Error('original error'));
check(await fallback.diagnostics.flush(), 'Failed disk write falls back to browser storage');
equal(fallback.diagnostics.status().storage.state, 'browser-fallback', 'Storage degradation visible');
check([...fallbackStore.data.values()].some((text) => text.includes('original error')), 'Original error survives disk failure');
const denied = await create({ storage: { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota'); } } });
denied.diagnostics.error('still.alive', new Error('Game keeps working'));
equal(await denied.diagnostics.flush(), false, 'Quota failure reported, not thrown into game');
check(denied.diagnostics.status().lastError === 'Game keeps working', 'Logger remains usable after storage failure');
await fallback.diagnostics.dispose(); await denied.diagnostics.dispose();

// A hanging bridge cannot block persistence forever.
const timed = await create({ storage: memory(), ioTimeoutMs: 5, bridge: { readPrevious: () => new Promise(() => {}) } });
check(timed.diagnostics.status().storage.state !== 'desktop', 'Hanging bridge read timed out');
timed.diagnostics.error('timeout.test', new Error('Retained after timeout'));
check(await timed.diagnostics.flush(), 'Timeout still allows local fallback');
await timed.diagnostics.dispose();

// A duplicate arriving while a batch is in flight must not be dropped as already flushed.
const calls = [];
let release;
let gate = true;
const concurrent = await create({ bridge: { readPrevious: async () => null, append: async (batch) => {
    calls.push(batch);
    if (gate) await new Promise((resolve) => { release = resolve; });
    return { ok: true };
} } });
concurrent.diagnostics.error('concurrent', new Error('repeat'));
const flight = concurrent.diagnostics.flush();
await new Promise((resolve) => setTimeout(resolve, 0));
// Same origin/stack, not merely the same text from a different failing function.
const originalFailure = calls[0].records.find((record) => record.kind === 'concurrent').data.error;
concurrent.diagnostics.record('error', 'concurrent', 'repeat', { error: originalFailure, details: null });
gate = false; release();
await flight;
await concurrent.diagnostics.flush();
const last = calls.flatMap((batch) => batch.records).filter((record) => record.kind === 'concurrent').at(-1);
equal(last.count, 2, 'Updated duplicate persisted after in-flight append');
check(calls.every((batch) => batch.records.length <= 32 && Buffer.byteLength(JSON.stringify(batch)) < 96 * 1024), 'IPC batches bounded');
equal(concurrent.diagnostics.status().pending, 0, 'Successful batches drain queue');
concurrent.diagnostics.error('same.message', new Error('Repeated text'));
concurrent.diagnostics.error('same.message', new Error('Repeated text'));
equal(concurrent.diagnostics.snapshot().events.filter((entry) => entry.kind === 'same.message').length, 2, 'Same message from different source stacks is not merged');
await concurrent.diagnostics.dispose();

// Closing during an earlier IPC flush must await the final session/end batch,
// not merely that earlier promise. Two controlled gates reproduce the race.
const gates = [];
const closing = await create({ bridge: { readPrevious: async () => null, append: async () => {
    await new Promise(resolve => gates.push(resolve));
    return { ok: true };
} } });
const earlierFlush = closing.diagnostics.flush();
await new Promise(resolve => setTimeout(resolve, 0));
let closeDone = false;
const close = closing.diagnostics.dispose().then(result => { closeDone = true; return result; });
gates.shift()();
await new Promise(resolve => setTimeout(resolve, 0));
check(!closeDone && gates.length === 1, 'Dispose waits for the follow-up final-record batch');
gates.shift()();
equal(await close, true, 'Dispose confirms all final records were persisted');
await earlierFlush;
equal(closing.diagnostics.status().pending, 0, 'No final record remains after successful dispose');

// A stuck disk cannot make renderer shutdown wait without an overall deadline.
const hungClose = await create({ ioTimeoutMs: 1000, disposeTimeoutMs: 10, bridge: {
    readPrevious: async () => null, append: () => new Promise(() => {})
} });
const startedClose = performance.now();
equal(await hungClose.diagnostics.dispose(), false, 'Dispose explicitly reports an incomplete drain');
check(performance.now() - startedClose < 500, 'Overall dispose deadline bounds waiting independently of IPC');
equal(hungClose.diagnostics.snapshot().session.cleanShutdown, false, 'Timed-out drain does not claim clean renderer shutdown');

// Subscriber failures cannot break logging; status snapshots are coalesced.
const subscribed = await create();
let notifications = 0;
subscribed.diagnostics.subscribe(() => { notifications++; throw new Error('UI failure'); });
subscribed.diagnostics.error('one', 'first');
subscribed.diagnostics.error('two', 'second');
await Promise.resolve();
equal(notifications, 1, 'Subscriptions coalesced and isolated');
equal(subscribed.diagnostics.status().errors, 2, 'UI failure does not affect original errors');
subscribed.diagnostics.record('warn', 'odd.stack', 'Malformed stack property', { stack: 123 });
check(subscribed.diagnostics.recentEvents(1)[0].kind === 'odd.stack', 'Malformed stack cannot break recording');
equal(subscribed.diagnostics.recentEvents(1).length, 1, 'UI obtains bounded event tail without cloning full session');
await subscribed.diagnostics.dispose();

// Two deliberate marks and generic-message breadcrumbs must preserve their own
// context, rather than being swallowed by an earlier menu mark or setting change.
const markers = await create();
markers.diagnostics.record('warn', 'user.problem', 'Gracz zaznaczył moment problemu.', { summary: null });
markers.time.advance(100);
markers.diagnostics.record('warn', 'user.problem', 'Gracz zaznaczył moment problemu.', { summary: { fps: 24 } });
markers.diagnostics.breadcrumb('settings.changed', 'Zmieniono ustawienie gry.', { key: 'shadows', value: 3 });
markers.diagnostics.breadcrumb('settings.changed', 'Zmieniono ustawienie gry.', { key: 'viewDistance', value: 128 });
markers.diagnostics.breadcrumb('app.state', 'Zmiana stanu gry.', { from: 'playing', to: 'paused' });
markers.diagnostics.breadcrumb('app.state', 'Zmiana stanu gry.', { from: 'paused', to: 'playing' });
const markerEvents = markers.diagnostics.snapshot().events;
equal(markerEvents.filter(entry => entry.kind === 'user.problem').length, 2, 'Separate F8/manual marks remain separate');
equal(markerEvents.filter(entry => entry.kind === 'user.problem').at(-1).data.summary.fps, 24, 'Later mark retains measured problem context');
equal(markerEvents.filter(entry => entry.kind === 'settings.changed').map(entry => entry.data.key), ['shadows', 'viewDistance'], 'Distinct setting changes with same message remain visible');
equal(markerEvents.filter(entry => entry.kind === 'app.state').map(entry => entry.data.to), ['paused', 'playing'], 'State transitions retain their real sequence');
await markers.diagnostics.dispose();
console.log(`PASS diagnostyka: ${checks} sprawdzeń błędów, prywatności, limitów, zapisu i raportów.`);
