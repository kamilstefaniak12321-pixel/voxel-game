// CPU/IndexedDB benchmark in a disposable browser profile. This is not an FPS
// measurement of a physical GPU. Serve unchanged baseline/candidate sources
// through the same harness with --root; the fixture is never added to the app.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch, cpus } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';

const argument = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? fallback : process.argv[index + 1];
};
const sourceRoot = resolve(argument('--root', fileURLToPath(new URL('../', import.meta.url))));
const output = resolve(argument('--output', 'test-results/saved-streaming'));
const chunkCount = Number(argument('--chunks', '4096'));
const repeats = Number(argument('--samples', '3'));
assert.ok(Number.isInteger(chunkCount) && chunkCount >= 32 && chunkCount <= 16384);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 10);
await mkdir(output, { recursive: true });
const fixture = await readFile(new URL('./fixtures/saved-streaming-benchmark.js', import.meta.url), 'utf8');
const fixtureData = await readFile(new URL('./fixtures/saved-streaming-data.mjs', import.meta.url), 'utf8');
const self = await readFile(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
async function hashSources(directory) {
    const hash = createHash('sha256');
    async function visit(current) {
        for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = resolve(current, entry.name);
            if (entry.isDirectory()) await visit(file);
            else { hash.update(file.slice(directory.length)); hash.update(await readFile(file)); }
        }
    }
    await visit(directory);
    return hash.digest('hex');
}
function git(...args) {
    try { return execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8' }).trim(); }
    catch { return null; }
}
const report = {
    scope: 'Real Chromium IndexedDB, saved-world opening and retained CPU data; no GPU/FPS claim',
    started: new Date().toISOString(),
    source: { commit: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')), sha256: await hashSources(resolve(sourceRoot, 'src')) },
    harness: { runnerSha256: digest(self), fixtureSha256: digest(fixture), dataSha256: digest(fixtureData) },
    environment: { platform: platform(), arch: arch(), node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
    configuration: { chunkCount, repeats },
    samples: [], errors: []
};
const profile = await mkdtemp(resolve(output, 'voxel-saved-streaming-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        response.setHeader('Cache-Control', 'no-store');
        if (pathname === '/') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><meta charset="utf-8"><title>Saved world benchmark</title><script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script><script type="module">import * as fixture from "/__benchmark_fixture__.js"; window.fixture = fixture;</script>');
            return;
        }
        if (pathname === '/__benchmark_fixture__.js') {
            response.setHeader('Content-Type', 'text/javascript'); response.end(fixture); return;
        }
        if (pathname === '/__benchmark_data__.mjs') {
            response.setHeader('Content-Type', 'text/javascript'); response.end(fixtureData); return;
        }
        const file = resolve(sourceRoot, '.' + pathname);
        if (!file.startsWith(sourceRoot + sep)) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket, logs = '', startupError;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    chrome = spawn(process.env.CHROME_BIN ?? (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--enable-precise-memory-info',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    chrome.on('error', error => startupError = error);
    chrome.stdout.on('data', data => logs += data); chrome.stderr.on('data', data => logs += data);
    let port;
    const deadline = Date.now() + 20000;
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || Date.now() > deadline) throw new Error(`Chrome failed: ${logs}`);
        await pause(100);
    }
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data), request = pending.get(message.id);
        if (request) {
            pending.delete(message.id); clearTimeout(request.timer);
            message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            const error = message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text;
            report.errors.push(error); logs += '\n' + error;
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            const error = message.params.args.map(value => value.value ?? value.description ?? value.type).join(' ');
            report.errors.push(error); logs += '\n' + error;
        }
    });
    const call = (method, params = {}, timeoutMs = 180000) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        return result.result?.value;
    };
    async function reload() {
        await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
        const until = Date.now() + 30000;
        while (!await evaluate('Boolean(window.fixture)')) {
            if (Date.now() > until) throw new Error('Fixture imports timed out');
            await pause(50);
        }
    }
    await call('Runtime.enable'); await call('Page.enable');
    report.environment.browser = await call('Browser.getVersion');
    await reload();
    report.fixture = await evaluate(`fixture.seed(${chunkCount})`);
    // Navigation discards all seeding ArrayBuffers before either implementation
    // is measured. Every measured open starts with a fresh JavaScript context.
    for (let sample = 0; sample < repeats; sample++) {
        await reload();
        await call('HeapProfiler.collectGarbage');
        const before = await call('Runtime.getHeapUsage');
        const result = await evaluate(`fixture.measure(${chunkCount}, ${sample})`);
        await call('HeapProfiler.collectGarbage');
        const after = await call('Runtime.getHeapUsage');
        report.samples.push({ ...result, heap: { before, after } });
        await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ sample, ...result.summary }));
    }
    await reload();
    report.integration = await evaluate('fixture.gameSmoke()');
    console.log(`OK: saved-world Game lifecycle — ${report.integration.checks.length} checks.`);
    assert.equal(report.errors.length, 0, 'No unexpected browser exceptions');
    report.valid = true;
} catch (error) {
    report.valid = false; report.errors.push(error.stack ?? String(error));
    throw error;
} finally {
    report.finished = new Date().toISOString();
    await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
    await writeFile(resolve(output, 'chrome.log'), logs);
    socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) {
        const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited;
    }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.ok(profile.startsWith(output + sep) && profile.split(sep).at(-1).startsWith('voxel-saved-streaming-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
