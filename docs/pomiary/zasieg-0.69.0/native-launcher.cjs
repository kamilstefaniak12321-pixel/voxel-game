// Local, isolated game test. Serves an identical harness against either checkout.
// No installed saves, settings, update service or arbitrary code command channel.
const { app, BrowserWindow, Menu, protocol, net, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const currentRoot = path.resolve(__dirname, '../../..');
const { serveFile } = require(path.join(currentRoot, 'desktop/serve-file.cjs'));
const args = process.argv.slice(2);
const baselineIndex = args.indexOf('--baseline');
const baseline = baselineIndex >= 0;
const root = baseline ? path.resolve(args[baselineIndex + 1]) : currentRoot;
const scenario = args.includes('--quick') ? 'quick' : 'report';
const size = args.find(arg => arg.startsWith('--size='))?.slice(7) ?? '1920x1080';
if (!['1600x900', '1920x1080', '1920x1057'].includes(size)) throw new Error('Unsupported size');
const [width, height] = size.split('x').map(Number);
const proof = path.resolve(currentRoot, '../distance-proof');
const runId = `${baseline ? 'baseline' : 'candidate'}-${scenario}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const runDir = path.join(proof, runId);
const profile = path.join(runDir, 'profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
protocol.registerSchemesAsPrivileged([{ scheme: 'gra', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }]);
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', windowsHide: true });
const hash = createHash('sha256');
let sourceFiles = 0;
function fingerprint(relative) {
    for (const item of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
        const name = path.join(relative, item.name);
        if (item.isDirectory()) fingerprint(name);
        else { hash.update(name.replaceAll(path.sep, '/') + '\0'); hash.update(fs.readFileSync(path.join(root, name))); sourceFiles++; }
    }
}
fingerprint('src');
hash.update(fs.readFileSync(path.join(root, 'lib/three/three.module.js')));
const manifest = { runId, baseline, scenario, width, height,
    version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    commit: git('rev-parse', 'HEAD').trim(), dirty: !!git('status', '--porcelain').trim(),
    sourceSha256: hash.digest('hex'), sourceFiles,
    harnessSha256: ['index.html', 'qa.js', 'preload.cjs', 'native-launcher.cjs'].reduce((h, name) =>
        h.update(name + '\0').update(fs.readFileSync(path.join(__dirname, name))), createHash('sha256')).digest('hex'),
    electron: process.versions.electron, chromium: process.versions.chrome };
let win;
const safeName = value => String(value ?? 'result').replace(/[^a-z0-9_-]/gi, '-').slice(0, 90);
const record = (name, data) => {
    const target = path.join(runDir, safeName(name) + '.json');
    fs.writeFileSync(target, JSON.stringify({ manifest, ...data }, null, 2));
    return target;
};
const trusted = event => event.sender === win?.webContents && event.senderFrame?.url === 'gra://voxel-game/__distance_qa__/index.html';
app.whenReady().then(async () => {
    protocol.handle('gra', request => {
        try {
            const url = new URL(request.url);
            if (url.hostname !== 'voxel-game') return new Response('Forbidden', { status: 403 });
            const harness = url.pathname.startsWith('/__distance_qa__/');
            const base = harness ? __dirname : root;
            const relative = harness ? url.pathname.slice('/__distance_qa__'.length) : url.pathname;
            const file = path.resolve(base, '.' + decodeURIComponent(relative));
            if (!file.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
            if (/\.(?:js|mjs|css|html)$/.test(file)) return new Response(fs.readFileSync(file), {
                headers: { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8'
                    : file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' }
            });
            return serveFile(request, file, (url, options) => net.fetch(url, options));
        } catch { return new Response('Not found', { status: 404 }); }
    });
    ipcMain.handle('distance-config', event => { if (trusted(event)) return manifest; });
    ipcMain.handle('distance-report', (event, data) => {
        if (!trusted(event)) throw new Error('Untrusted report');
        return record(data?.name, data?.report ?? {});
    });
    ipcMain.handle('distance-photo', async (event, data) => {
        if (!trusted(event)) throw new Error('Untrusted photo');
        const file = path.join(runDir, safeName(data?.name) + '.png');
        fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG()); return file;
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Próba', submenu: [
        { label: 'Panel (F8)', accelerator: 'F8', click: () => win?.webContents.send('distance-toggle') },
        { label: 'Zamknij próbę', accelerator: 'Ctrl+Shift+Q', click: () => app.quit() }
    ] }]));
    const display = screen.getPrimaryDisplay();
    const fullscreen = width === display.bounds.width && height === display.bounds.height;
    win = new BrowserWindow({ width, height, useContentSize: true, fullscreen, resizable: false,
        autoHideMenuBar: true, backgroundColor: '#111111', title: `Voxel Game — zasięg ${baseline ? 'baza' : 'kandydat'}`,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true,
            contextIsolation: true, nodeIntegration: false, devTools: false, zoomFactor: 1,
            backgroundThrottling: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Module parse/import failures occur before qa.js can register its own
    // listeners. Keep their native console evidence instead of a blank window.
    const browserErrors = [];
    win.webContents.on('console-message', details => {
        if (details.level !== 'error') return;
        browserErrors.push({ message: details.message, source: details.sourceId, line: details.lineNumber });
        record('browser-errors', { errors: browserErrors });
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url, mainFrame) =>
        record('load-error', { errorCode, errorDescription, url, mainFrame }));
    win.webContents.on('render-process-gone', (_event, details) => record('renderer-gone', { details }));
    for (const name of ['will-navigate', 'will-redirect']) win.webContents.on(name, (event, url) => {
        if (!url.startsWith('gra://voxel-game/')) event.preventDefault();
    });
    manifest.gpuFeatures = app.getGPUFeatureStatus();
    manifest.display = { bounds: display.bounds, scaleFactor: display.scaleFactor,
        displayFrequency: display.displayFrequency ?? null };
    await win.loadURL('gra://voxel-game/__distance_qa__/index.html');
    win.webContents.setZoomFactor(1);
    manifest.contentBounds = win.getContentBounds();
    record('launch', {});
    fs.writeFileSync(path.join(proof, 'latest-run.json'), JSON.stringify({ runId, runDir }, null, 2));
    win.show(); win.focus();
    console.log(JSON.stringify({ runId, runDir, scenario, baseline }));
    let lastCommand = null, busy = false;
    setInterval(async () => {
        if (busy || win.isDestroyed()) return;
        let command;
        try { command = JSON.parse(fs.readFileSync(path.join(runDir, 'command.json'), 'utf8')); } catch { return; }
        if (!/^[a-z0-9_-]{1,80}$/i.test(command.id ?? '') || command.id === lastCommand) return;
        lastCommand = command.id; busy = true;
        try {
            if (command.action === 'exit') { app.exit(0); return; }
            if (command.action === 'status') record(`command-${command.id}`, await win.webContents.executeJavaScript('window.distanceQA?.status() ?? {ready:false}'));
            else if (command.action === 'shot') fs.writeFileSync(path.join(runDir, `shot-${command.id}.png`), (await win.webContents.capturePage()).toPNG());
        } finally { busy = false; }
    }, 500).unref();
}).catch(error => { record('startup-error', { error: error.stack }); app.exit(1); });
app.on('window-all-closed', () => app.quit());
