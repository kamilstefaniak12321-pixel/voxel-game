const { app, BrowserWindow, Menu, protocol, net, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { serveFile } = require('../../../desktop/serve-file.cjs');

const currentRoot = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const baselineIndex = args.indexOf('--baseline');
const baseline = baselineIndex >= 0;
const afterFlag = baseline ? args[baselineIndex + 1] : null;
const root = baseline ? path.resolve(afterFlag && !afterFlag.startsWith('--') ? afterFlag
    : path.join(currentRoot, '../voxel-grass-baseline')) : currentRoot;
const size = args.find(arg => arg.startsWith('--size='))?.slice(7) ?? '1920x1080';
if (!['1600x900', '1920x1080'].includes(size)) throw new Error('Dozwolony --size: 1600x900 albo 1920x1080');
const [width, height] = size.split('x').map(Number);
const uncapped = args.includes('--uncapped');
const proof = path.resolve(currentRoot, '../grass-concept-proof/native');
fs.mkdirSync(proof, { recursive: true });
const runId = `${baseline ? 'grass-baseline' : 'grass-candidate'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const profile = path.join(proof, `profile-${runId}`);
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
if (uncapped) {
    app.commandLine.appendSwitch('disable-frame-rate-limit');
    app.commandLine.appendSwitch('disable-gpu-vsync');
}
protocol.registerSchemesAsPrivileged([{ scheme: 'gra', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }]);

const baselineCommit = '2ac97b885f124c95b1866df1f141200021e0e4e2';
const hasGit = fs.existsSync(path.join(root, '.git'));
const commit = hasGit ? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim() : baselineCommit;
if (baseline && hasGit && (commit !== baselineCommit || execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', windowsHide: true }).trim())) throw new Error('Baza musi być czystym checkoutem 0.61.0 / 2ac97b8.');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
function sourceFingerprint(directory) {
    const hash = createHash('sha256');
    let files = 0;
    const visit = relative => {
        for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) visit(name);
            else if (entry.isFile()) { hash.update(name.replaceAll(path.sep, '/') + '\0'); hash.update(fs.readFileSync(path.join(directory, name))); files++; }
        }
    };
    visit('src');
    const sourceSha256 = hash.digest('hex');
    const assets = [];
    const inventory = relative => {
        for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
            const name = path.join(relative, entry.name);
            if (entry.isDirectory()) inventory(name);
            else if (entry.isFile()) assets.push(`${name.replaceAll(path.sep, '/')}\0${fs.statSync(path.join(directory, name)).size}`);
        }
    };
    inventory('assets');
    const git = gitArgs => execFileSync('git', gitArgs, { cwd: directory, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    const status = !hasGit ? '' : git(['status', '--porcelain', '--untracked-files=all']).toString('utf8');
    const diff = !hasGit ? Buffer.alloc(0) : git(['diff', '--no-ext-diff', '--binary', 'HEAD', '--', 'src', 'assets', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
    return { sourceSha256, sourceFiles: files, assetsInventorySha256: createHash('sha256').update(assets.sort().join('\n')).digest('hex'),
        assetsFiles: assets.length, dirty: status.trim().length > 0, status,
        trackedDiffSha256: createHash('sha256').update(diff).digest('hex'),
        changelogSha256: createHash('sha256').update(fs.readFileSync(path.join(directory, 'CHANGELOG.md'))).digest('hex') };
}
const manifest = { runId, baseline, commit, version, width, height, uncapped,
    fingerprint: sourceFingerprint(root),
    harnessSha256: ['index.html', 'qa.js', 'preload.cjs', 'native-launcher.cjs'].reduce((hash, name) =>
        hash.update(name + '\0').update(fs.readFileSync(path.join(__dirname, name))), createHash('sha256')).digest('hex'),
    electron: process.versions.electron, chromium: process.versions.chrome };
let win, serial = 0;
const trusted = event => event.senderFrame?.url.startsWith('gra://voxel-game/');
const safeName = value => String(value ?? 'scene').replace(/[^a-z0-9_-]/gi, '-').slice(0, 90);
const record = (name, data) => {
    const target = path.join(proof, `${runId}-${String(++serial).padStart(3, '0')}-${safeName(name)}.json`);
    fs.writeFileSync(target, JSON.stringify({ manifest, ...data }, null, 2));
    return target;
};

app.whenReady().then(async () => {
    protocol.handle('gra', request => {
        try {
            const url = new URL(request.url);
            if (url.hostname !== 'voxel-game') return new Response('Forbidden', { status: 403 });
            let file;
            if (url.pathname.startsWith('/__performance_qa__/')) {
                file = path.resolve(__dirname, '.' + decodeURIComponent(url.pathname.slice('/__performance_qa__'.length)));
                if (!file.startsWith(__dirname + path.sep)) return new Response('Forbidden', { status: 403 });
            } else {
                file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
                if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
            }
            if (/\.(?:js|mjs|css|html)$/.test(file)) return new Response(fs.readFileSync(file), {
                headers: { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8'
                    : file.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' }
            });
            return serveFile(request, file, (url, options) => net.fetch(url, options));
        } catch (error) {
            console.error(error.message);
            return new Response('Not found', { status: 404 });
        }
    });
    ipcMain.handle('performance-config', event => {
        if (trusted(event)) return manifest;
    });
    ipcMain.handle('performance-report', (event, data) => {
        if (!trusted(event)) throw new Error('Nieznana strona raportu');
        return record(data?.name ?? 'report', data?.report ?? {});
    });
    ipcMain.handle('performance-photo', async (event, data) => {
        if (!trusted(event)) throw new Error('Nieznana strona zdjęcia');
        const report = record(data?.name ?? 'photo', data?.report ?? {});
        const photo = report.replace(/\.json$/, '.png');
        fs.writeFileSync(photo, (await win.webContents.capturePage()).toPNG());
        return { report, photo };
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Próba', submenu: [
        { label: 'Odśwież', accelerator: 'Ctrl+R', role: 'reload' },
        { label: 'Panel pomiaru (F8)', accelerator: 'F8', click: () => win?.webContents.send('performance-toggle-panel') },
        { label: 'Zamknij próbę', accelerator: 'Ctrl+Shift+Q', click: () => app.quit() }
    ] }]));
    const display = screen.getPrimaryDisplay();
    const fullscreen = size === '1920x1080';
    if (fullscreen && (display.bounds.width !== width || display.bounds.height !== height)) {
        throw new Error('Pomiar 1920x1080 wymaga ekranu 1920x1080. Użyj --size=1600x900; launcher nie zmienia rozdzielczości systemu.');
    }
    win = new BrowserWindow({ width, height, useContentSize: true, resizable: false,
        fullscreen, autoHideMenuBar: true, backgroundColor: '#111111',
        title: `Voxel Game — trawa ${baseline ? '0.61.0 / stary eksperyment' : '0.62.0 / koncept Kamila'}`,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true,
            contextIsolation: true, nodeIntegration: false, devTools: false,
            zoomFactor: 1, backgroundThrottling: true } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const eventName of ['will-navigate', 'will-redirect']) win.webContents.on(eventName, (event, url) => {
        if (!url.startsWith('gra://voxel-game/')) event.preventDefault();
    });
    manifest.gpuFeatures = app.getGPUFeatureStatus();
    manifest.display = { bounds: display.bounds, scaleFactor: display.scaleFactor,
        displayFrequency: display.displayFrequency ?? null };
    await win.loadURL('gra://voxel-game/__performance_qa__/index.html');
    win.webContents.setZoomFactor(1);
    manifest.contentBounds = win.getContentBounds();
    record('launch', {});
    win.show(); win.focus();
    console.log(JSON.stringify({ ...manifest, proof }, null, 2));
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
