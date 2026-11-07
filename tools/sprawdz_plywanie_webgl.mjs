// Real Game/Player swimming and current integration in an isolated Chrome.
// CPU timings describe this controlled test; SwiftShader is not a GPU FPS test.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/river-swimming');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(output, 'voxel-swimming-'));
const result = { scope: 'Real Game.update/Player/World swimming, controlled currents and natural river; CPU timings are not gameplay FPS',
    started: new Date().toISOString(), stage: 'chrome-startup', errors: [], screenshots: [] };
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        response.setHeader('Cache-Control', 'no-store');
        if (pathname === '/') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#123}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script><script type="module">import {createRiverSwimmingQA} from "/tools/fixtures/river-swimming-benchmark.js"; window.swimmingQA = await createRiverSwimmingQA();</script>');
            return;
        }
        const file = resolve(root, '.' + pathname);
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
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
        '--no-first-run', '--disable-background-networking', '--window-size=720,480',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    chrome.on('error', error => startupError = error);
    chrome.stdout.on('data', data => logs += data); chrome.stderr.on('data', data => logs += data);
    let port;
    const deadline = Date.now() + 20000;
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || chrome.signalCode || Date.now() > deadline) throw new Error(`Chrome failed before test: ${logs}`);
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
            result.errors.push(error); logs += '\n' + error;
        } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            const error = message.params.args.map(value => value.value ?? value.description ?? value.type).join(' ');
            result.errors.push(error); logs += '\n' + error;
        }
    });
    const call = (method, params = {}, timeout = 120000) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
        return value.result?.value;
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
    result.browser = await call('Browser.getVersion');
    result.stage = 'game-startup';
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    const until = Date.now() + 90000;
    while (!await evaluate('Boolean(window.swimmingQA)')) {
        if (result.errors.length) throw new Error(result.errors.join('\n'));
        if (Date.now() > until) throw new Error('Swimming Game fixture did not initialize');
        await pause(100);
    }
    result.stage = 'controlled-scene';
    result.scene = await evaluate('swimmingQA.initialize()');
    result.stage = 'controlled-swimming';
    result.controlled = await evaluate('swimmingQA.controlled()');
    console.log(`OK: real Game controlled swimming — ${result.controlled.checks.length} checks.`);
    const capture = async name => {
        const metadata = await evaluate(`swimmingQA.view(${JSON.stringify(name)})`);
        const image = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(output, `${name}.png`), Buffer.from(image.data, 'base64'));
        result.screenshots.push({ ...metadata, name: `${name}.png` });
    };
    await capture('controlled-eye'); await capture('controlled-overview');
    result.stage = 'natural-swimming';
    result.natural = await evaluate('swimmingQA.natural()');
    console.log(`OK: real Game natural river — ${result.natural.checks.length} checks.`);
    await capture('natural-eye'); await capture('natural-overview');
    await evaluate('swimmingQA.dispose()');
    assert.deepEqual(result.errors, [], 'No JavaScript or WebGL console errors');
    result.valid = true; result.stage = 'complete';
    console.log(`OK: swimming — 30/60/120Hz, diving, collisions and natural waterfall; ${result.screenshots.length} rendered views.`);
    console.log('RIVER_SWIMMING_RESULT=' + JSON.stringify({ valid: true,
        controlledChecks: result.controlled.checks.length, naturalChecks: result.natural.checks.length,
        drift: result.controlled.drift.map(value => ({ rate: value.rate, end: value.end, cpu: value.cpu })),
        natural: { end: result.natural.result.end, cpu: result.natural.result.cpu },
        details: 'Complete trajectories and setup timings are saved in result.json' }));
} catch (error) {
    result.valid = false; result.errors.push(error.stack ?? String(error));
    throw error;
} finally {
    result.finished = new Date().toISOString();
    await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
    await writeFile(resolve(output, 'chrome.log'), logs);
    socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) {
        const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited;
    }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.ok(profile.startsWith(output + sep) && profile.split(sep).at(-1).startsWith('voxel-swimming-'));
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
