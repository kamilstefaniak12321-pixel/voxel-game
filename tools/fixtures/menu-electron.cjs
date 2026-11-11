// Private, hidden host. Offscreen mode is only for DOM screenshots; use the
// normal window compositor for timing to avoid CPU readback in the measurement.
const { app, BrowserWindow } = require('electron');
const profile = process.env.VOXEL_MENU_QA_PROFILE;
if (!profile) throw new Error('Run through sprawdz_menu_086_webgl.mjs');
app.setPath('userData', profile); app.setPath('sessionData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
let window;
app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 1280, height: 800, useContentSize: true, show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false,
            backgroundThrottling: false, offscreen: process.env.VOXEL_MENU_CAPTURE_UI === '1' } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
