// Runs the real desktop entry, bridge, bootstrap and game with isolated saves.
// Commands are a fixed QA vocabulary, never arbitrary JavaScript or file paths.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const proof = path.resolve(root, '../diagnostics-proof/native');
const profile = path.join(proof, 'profile');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const write = (name, data) => fs.writeFileSync(path.join(proof, name), JSON.stringify(data, null, 2));
let win, busy = false, ready = false, lastCommand = null;
app.on('browser-window-created', (_event, window) => {
    win = window;
    win.webContents.on('did-finish-load', async () => {
        ready = false;
        try {
            const state = await win.webContents.executeJavaScript("import('/docs/pomiary/logi-0.67.0/native-qa.js').then(m=>m.setup())");
            ready = true;
            write('ready.json', state);
        } catch (error) { write('startup-error.json', { message: error.message }); }
    });
});
setInterval(async () => {
    if (!win || win.isDestroyed() || busy || !ready) return;
    let command;
    try { command = JSON.parse(fs.readFileSync(path.join(proof, 'command.json'), 'utf8')); } catch { return; }
    if (!command.id || command.id === lastCommand) return;
    lastCommand = command.id;
    busy = true;
    try {
        let result;
        switch (command.action) {
            case 'status': result = await win.webContents.executeJavaScript('window.diagnosticsQA.status()'); break;
            case 'benchmark': result = await win.webContents.executeJavaScript('window.diagnosticsQA.benchmark()'); break;
            case 'spike': result = await win.webContents.executeJavaScript('window.diagnosticsQA.spike()'); break;
            case 'errors': result = await win.webContents.executeJavaScript('window.diagnosticsQA.errors()'); break;
            case 'shot': {
                const shot = await win.webContents.capturePage();
                fs.writeFileSync(path.join(proof, 'native-panel.png'), shot.toPNG());
                result = { ok: true }; break;
            }
            case 'crash': win.webContents.forcefullyCrashRenderer(); result = { requested: true }; break;
            case 'exit': app.exit(0); return;
            default: throw new Error('Unknown QA command');
        }
        write(`result-${command.id}.json`, result);
    } catch (error) { write(`result-${command.id}.json`, { error: error.message }); }
    finally { busy = false; }
}, 500).unref();
require(path.join(root, 'desktop/main.js'));
