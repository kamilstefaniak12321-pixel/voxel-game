const { app, BrowserWindow, Menu, protocol, net, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { serveFile } = require('../../../desktop/serve-file.cjs');

const root = path.resolve(__dirname, '../../..');
const proof = path.resolve(root, '../voxel-music-proof');
fs.mkdirSync(proof, { recursive: true });
const profile = path.join(proof, 'native-profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
// Te same uprawnienia protokołu co w desktop/main.js, bez zmiany autoplay.
protocol.registerSchemesAsPrivileged([{ scheme: 'gra', privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true
} }]);
let win;
app.whenReady().then(async () => {
    protocol.handle('gra', request => {
        const url = new URL(request.url);
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
        if (url.pathname === '/index.html') return new Response(
            fs.readFileSync(file, 'utf8').replace('./src/main.js', './docs/pomiary/muzyka-0.53.0/qa.js'),
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        return serveFile(request, file, (url, options) => net.fetch(url, options));
    });
    ipcMain.handle('music-report', (event, data) => {
        if (event.senderFrame.url.startsWith('gra://voxel-game/')) {
            fs.writeFileSync(path.join(proof, 'native.json'), JSON.stringify(data, null, 2));
        }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Próba', submenu: [
        { label: 'Odśwież', accelerator: 'Ctrl+R', role: 'reload' },
        { label: 'Zamknij próbę', accelerator: 'Ctrl+Shift+Q', click: () => app.quit() }
    ] }]));
    win = new BrowserWindow({ width: 1280, height: 760, autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true,
            contextIsolation: true, nodeIntegration: false, devTools: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith('gra://voxel-game/')) event.preventDefault();
    });
    await win.loadURL('gra://voxel-game/index.html?dotyk=1');
    win.show();
    win.focus();
    console.log('Music QA ready', process.versions.electron);
}).catch(error => { console.error(error); app.exit(1); });
app.on('window-all-closed', () => app.quit());
