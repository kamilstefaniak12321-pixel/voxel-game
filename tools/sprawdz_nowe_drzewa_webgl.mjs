// Actual Game and chat CommandRegistry in an isolated browser profile.
// SwiftShader checks correctness and appearance; this is not an FPS benchmark.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const electron = process.env.VOXEL_QA_ELECTRON;
async function fingerprint() {
    const hash = createHash('sha256'); let files = 0;
    async function walk(relative) {
        const entries = await readdir(resolve(root, relative), { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            const name = relative + '/' + entry.name;
            if (entry.isDirectory()) await walk(name);
            else { hash.update(name + '\0').update(await readFile(resolve(root, name))); files++; }
        }
    }
    await walk('src');
    await walk('assets/drzewa');
    await walk('assets/models/rosliny');
    await walk('assets/models/campfire');
    return { sha256: hash.digest('hex'), files };
}
const source = await fingerprint();
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/new-trees');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-new-trees-'));
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
    '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
        if (pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!doctype html><html lang="pl"><meta charset="utf-8">
                <style>body{margin:0;overflow:hidden;background:#ddd}canvas{display:block}
                #qa-heading{position:fixed;top:12px;left:12px;right:12px;z-index:10000;padding:10px 14px;
                    background:#fffffff0;color:#20242a;font:16px system-ui;border:1px solid #bbb;border-radius:4px}
                #qa-command{font:13px monospace;color:#46566b;margin-top:5px}
                </style><body><div id="qa-heading"><span id="qa-title">Trzy nowe gatunki 0.79.0</span><div id="qa-command"></div></div>
                <script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script>
                <script type="module">import {run} from '/tools/fixtures/new-trees.js';
                try{window.treeQA=await run();window.treeReady=true}catch(error){window.treeError=error.stack;console.error(error)}</script>`);
            return;
        }
        const path = resolve(root, '.' + pathname);
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let chrome, socket, logs = '', startupError;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
    const browser = electron ?? process.env.CHROME_BIN ?? (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
    const args = electron ? [resolve(root, 'tools/fixtures/tree-showcase-electron.cjs'), '--remote-debugging-port=0'] : [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--window-size=1280,800',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ];
    chrome = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        env: { ...process.env, VOXEL_TREE_QA_PROFILE: profile } });
    chrome.on('error', error => startupError = error);
    chrome.stdout.on('data', data => logs += data); chrome.stderr.on('data', data => logs += data);
    let port; const startupDeadline = Date.now() + 20000;
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || Date.now() > startupDeadline) throw Error(`Chrome failed: ${logs}`);
        await pause(100);
    }
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl); await once(socket, 'open');
    let sequence = 0; const pending = new Map(), exceptions = [];
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data), request = pending.get(message.id);
        if (request) {
            pending.delete(message.id); clearTimeout(request.timer);
            message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            exceptions.push(message.params); logs += '\n' + JSON.stringify(message.params);
        }
    });
    socket.addEventListener('close', () => {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(Error('Browser connection closed')); }
        pending.clear();
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout ${method}`)); }, 120000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
        return response.result?.value;
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    const deadline = Date.now() + 120000;
    let status;
    do {
        status = await evaluate('({ready:!!window.treeReady,error:window.treeError})');
        assert.ok(!status.error, status.error);
        if (!status.ready) await pause(100);
    } while (!status.ready && Date.now() < deadline);
    assert.ok(status.ready, 'Actual game fixture finished loading');
    for (const name of ['comparison', 'acacia-whole', 'acacia-ground', 'bald_cypress-whole', 'bald_cypress-ground', 'bald_cypress-base', 'cherry-whole', 'cherry-ground']) {
        console.log(`Rendering ${name}...`);
        await evaluate(`window.treeQA.capture(${JSON.stringify(name)})`);
        // Hidden native windows do not always submit a desktop compositor
        // frame. Read the same preserved WebGL framebuffer directly instead.
        const image = electron
            ? { data: await evaluate('document.querySelector("canvas").toDataURL("image/png").split(",")[1]') }
            : await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(output, name + '.png'), Buffer.from(image.data, 'base64'));
    }
    await evaluate('window.treeQA.finishChecks()');
    await evaluate('window.treeQA.captureSaplings()');
    const saplings = electron
        ? { data: await evaluate('document.querySelector("canvas").toDataURL("image/png").split(",")[1]') }
        : await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, 'saplings-detailed.png'), Buffer.from(saplings.data, 'base64'));
    if (electron && process.env.VOXEL_TREE_BENCHMARK === '1') {
        console.log('Benchmarking pine and bald cypress forests...');
        await evaluate('window.treeQA.benchmark()');
        for (const species of ['pine', 'bald_cypress']) {
            const data = await evaluate(`window.treeQA.benchmarkImage(${JSON.stringify(species)})`);
            await writeFile(resolve(output, `benchmark-${species}.png`), Buffer.from(data, 'base64'));
        }
    }
    const report = await evaluate('window.treeQA.report()');
    report.source = source;
    report.version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
    report.nativeElectron = !!electron;
    assert.deepEqual(await fingerprint(), source, 'Game source did not change during QA');
    assert.equal(exceptions.length, 0, 'No unhandled browser exceptions');
    assert.equal(report.errors.length, 0, 'No game/shader/console errors');
    await writeFile(resolve(output, 'render.json'), JSON.stringify(report, null, 2) + '\n');
    await evaluate('window.treeQA.stop()');
    console.log(`OK: new trees WebGL — ${report.checks.length} checks, ${report.captures.length} actual-game views.`);
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs); socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) { const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const checked = resolve(profile);
    assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && checked.split(sep).at(-1).startsWith('voxel-new-trees-'));
    await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
