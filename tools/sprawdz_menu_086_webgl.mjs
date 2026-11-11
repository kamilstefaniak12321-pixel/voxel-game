// Actual MenuBackdrop and Menu in an isolated browser profile.
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
const width = Number(process.env.VOXEL_QA_WIDTH ?? 1280), height = Number(process.env.VOXEL_QA_HEIGHT ?? 800);
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
    await walk('assets/textures');
    await walk('assets/models/rosliny');
    await walk('assets/models/campfire');
    return { sha256: hash.digest('hex'), files };
}
const source = await fingerprint();
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/menu-086');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-menu-086-'));
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
    '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
        if (pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!doctype html><html lang="pl"><meta charset="utf-8">
                <link rel="stylesheet" href="/assets/ui/themes/default/theme.css">
                <link rel="stylesheet" href="/src/ui/menu.css"><link rel="stylesheet" href="/src/ui/menu-scene.css">
                <link rel="stylesheet" href="/src/ui/achievements.css"><link rel="stylesheet" href="/src/ui/inventory-theme.css">
                <style>body{margin:0;overflow:hidden;background:#132a20}canvas{display:block}</style>
                <body><div id="menu"></div>
                <script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script>
                <script type="module">import {run} from '/tools/fixtures/menu-086.js';
                try{window.menuQA=await run();window.menuReady=true}catch(error){window.menuError=error.stack;console.error(error)}</script>`);
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
    const args = electron ? [resolve(root, 'tools/fixtures/menu-electron.cjs'), '--remote-debugging-port=0'] : [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--window-size=1280,800',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ];
    chrome = spawn(browser, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
        env: { ...process.env, VOXEL_MENU_QA_PROFILE: profile } });
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
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout ${method}`)); }, 300000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
        return response.result?.value;
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    const deadline = Date.now() + 300000;
    let status;
    do {
        status = await evaluate('({ready:!!window.menuReady,error:window.menuError})');
        assert.ok(!status.error, status.error);
        if (!status.ready) await pause(100);
    } while (!status.ready && Date.now() < deadline);
    assert.ok(status.ready, 'Actual game fixture finished loading');
    for (const name of ['home', 'river', 'forest', 'mountains']) {
        console.log(`Rendering menu ${name}...`);
        const data = await evaluate(`window.menuQA.capture(${JSON.stringify(name)})`);
        await writeFile(resolve(output, name + '-world.png'), Buffer.from(data, 'base64'));
        if (!electron || process.env.VOXEL_MENU_CAPTURE_UI === '1') {
            if (electron) await evaluate('window.menuQA.presentSnapshot()');
            const screenshot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
            await writeFile(resolve(output, name + '-ui.jpg'), Buffer.from(screenshot.data, 'base64'));
            if (electron) await evaluate('window.menuQA.removeSnapshot()');
        }
    }
    if (process.env.VOXEL_QA_PERF === '1') {
        assert.ok(electron, 'Performance samples require the native GPU host');
        assert.notEqual(process.env.VOXEL_MENU_CAPTURE_UI, '1', 'Performance samples must not include offscreen screenshot readback');
        for (const name of ['home', 'river', 'forest', 'mountains']) {
            console.log('Measuring menu ' + name + '...');
            await evaluate(`window.menuQA.measure(${JSON.stringify(name)})`);
        }
    }
    await evaluate('window.menuQA.finish()');
    const report = await evaluate('window.menuQA.report()');
    report.source = source;
    report.version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
    report.nativeElectron = !!electron;
    report.viewport = { width, height };
    report.uiCapture = electron ? (process.env.VOXEL_MENU_CAPTURE_UI === '1'
        ? 'Exact native canvas frame presented below unchanged actual menu DOM; hidden compositor omits WebGL layer'
        : 'Not captured') : 'Browser compositor';
    report.sourceAfter = await fingerprint();
    if (process.env.VOXEL_QA_ALLOW_CHANGES !== '1') assert.deepEqual(report.sourceAfter, source, 'Game source did not change during QA');
    assert.equal(exceptions.length, 0, 'No unhandled browser exceptions');
    assert.equal(report.errors.length, 0, 'No game/shader/console errors');
    await writeFile(resolve(output, 'render.json'), JSON.stringify(report, null, 2) + '\n');
    await evaluate('window.menuQA.stop()');
    console.log(`OK: menu 0.86 WebGL — ${report.checks.length} checks, ${report.captures.length} actual-menu views.`);
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs); socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) { const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    const checked = resolve(profile);
    assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && checked.split(sep).at(-1).startsWith('voxel-menu-086-'));
    await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
