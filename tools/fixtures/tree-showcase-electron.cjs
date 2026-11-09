// Optional native GPU host for the same isolated actual-game QA fixture.
// VOXEL_QA_ELECTRON selects its executable in the parent runner.
const { app, BrowserWindow } = require('electron');
const profile = process.env.VOXEL_TREE_QA_PROFILE;
if (!profile) throw new Error('Run through sprawdz_pokaz_drzew_webgl.mjs');
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
let window;
app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1280, height: 800, useContentSize: true, show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
            backgroundThrottling: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
