const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const port = process.argv.includes('--baseline') ? 63517 : 63516;
const target = `http://127.0.0.1:${port}/?dotyk=1`;
const allowedOrigin = new URL(target).origin;

// Osobny profil: bez ustawień i zapisów gry z normalnej aplikacji.
const userData = path.join(__dirname, 'voxel-fruit-bush-proof', 'native-user-data');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
app.setPath('sessionData', userData);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Zachowujemy domyślny VSync. Bez disable-frame-rate-limit,
// disable-gpu-vsync, zdalnego debugowania ani zmian ekranu systemu.

let window = null;
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => { window?.show(); window?.focus(); });
    app.whenReady().then(async () => {
        const display = screen.getPrimaryDisplay();
        if (display.bounds.width !== 1920 || display.bounds.height !== 1080) {
            throw new Error(`Ekran przy DPR 1 ma ${display.bounds.width}×${display.bounds.height}; pomiar wymaga 1920×1080. Nie zmieniam rozdzielczości systemu.`);
        }
        Menu.setApplicationMenu(Menu.buildFromTemplate([{
            label: 'Pomiar', submenu: [
                { label: 'Odśwież stronę', accelerator: 'CmdOrCtrl+R', click: () => window?.webContents.reload() },
                { label: 'Zamknij pomiar', accelerator: 'CmdOrCtrl+Shift+Q', click: () => app.quit() }
            ]
        }]));
        window = new BrowserWindow({
            x: display.bounds.x, y: display.bounds.y,
            width: 1920, height: 1080,
            fullscreen: true,
            autoHideMenuBar: true,
            backgroundColor: '#000000',
            title: 'Voxel Game — lokalny pomiar Electron',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                devTools: false,
                zoomFactor: 1,
                backgroundThrottling: true
            }
        });
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        const restrictNavigation = (event, url) => {
            if (new URL(url).origin !== allowedOrigin) event.preventDefault();
        };
        window.webContents.on('will-navigate', restrictNavigation);
        window.webContents.on('will-redirect', restrictNavigation);
        window.on('closed', () => { window = null; });
        await window.loadURL(target);
        window.webContents.setZoomFactor(1);
        console.log(JSON.stringify({
            url: target,
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            display: { bounds: display.bounds, scaleFactor: display.scaleFactor,
                displayFrequency: display.displayFrequency ?? null },
            contentBounds: window.getContentBounds(),
            fullscreen: window.isFullScreen(),
            zoomFactor: window.webContents.getZoomFactor(),
            gpu: app.getGPUFeatureStatus()
        }, null, 2));
    }).catch(error => {
        console.error(error);
        app.exit(1);
    });
}
app.on('window-all-closed', () => app.quit());
