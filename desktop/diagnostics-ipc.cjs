const path = require('node:path');
const fs = require('node:fs/promises');
const { sanitizeReport, redactText } = require('./diagnostics-log.cjs');

function trustedSender(event, window) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents ||
        !event.senderFrame || event.senderFrame !== event.sender.mainFrame) return false;
    try {
        const url = new URL(event.senderFrame.url);
        return url.protocol === 'gra:' && url.hostname === 'voxel-game' && url.pathname === '/index.html';
    } catch { return false; }
}

function installDiagnosticsIpc({ ipcMain, getWindow, log, dialog, shell, io = fs }) {
    let exportBusy = false;
    const deny = () => ({ ok: false, error: 'Brak dostępu do diagnostyki.' });
    const handle = (channel, callback) => ipcMain.handle(channel, async (event, value) => {
        if (!trustedSender(event, getWindow())) return deny();
        try { return await callback(value); }
        catch { return { ok: false, error: 'Nie udało się wykonać operacji na logach.' }; }
    });

    handle('diagnostics:append', value => log.append(value));
    handle('diagnostics:previous', () => log.readPrevious());
    handle('diagnostics:flush', () => log.flush());
    handle('diagnostics:folder', async () => {
        await log.flush();
        const error = await shell.openPath(log.directory);
        return error ? { ok: false, error: 'Nie udało się otworzyć folderu logów.' } : { ok: true };
    });
    handle('diagnostics:export', async value => {
        if (exportBusy) return { ok: false, error: 'Zapisywanie raportu już trwa.' };
        if (!value || typeof value !== 'object' || typeof value.text !== 'string' ||
            !value.report || typeof value.report !== 'object' || Array.isArray(value.report)) {
            return { ok: false, error: 'Nieprawidłowy raport.' };
        }
        let input;
        try { input = JSON.stringify(value); } catch { return { ok: false, error: 'Nieprawidłowy raport.' }; }
        if (Buffer.byteLength(input) > 4 * 1024 * 1024 || value.text.length > 256 * 1024) {
            return { ok: false, error: 'Raport przekracza limit 4 MiB.' };
        }
        exportBusy = true;
        try {
            await log.flush();
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const selection = await dialog.showSaveDialog(getWindow(), {
                title: 'Zapisz raport diagnostyczny Voxel Game',
                defaultPath: `Voxel-Game-raport-${stamp}.json`,
                filters: [{ name: 'Raport JSON z podsumowaniem', extensions: ['json'] },
                    { name: 'Czytelne podsumowanie tekstowe', extensions: ['txt'] }]
            });
            if (selection.canceled || !selection.filePath) return { ok: false, cancelled: true };
            // The only export path comes from the native save dialog, never IPC.
            const native = log.nativeSnapshot();
            const nativeEvents = native.records.filter(record => record.type === 'event');
            const text = redactText(value.text, 256 * 1024) + '\n\nZDARZENIA PROCESU APLIKACJI\n' +
                (nativeEvents.length ? nativeEvents.map(record =>
                    `${record.at} [${record.level}] ${record.kind}: ${record.message}\n${JSON.stringify(record.data ?? {})}`
                ).join('\n') : 'Brak zdarzeń błędów procesu aplikacji.') + '\n';
            const contents = path.extname(selection.filePath).toLowerCase() === '.txt'
                ? text
                : JSON.stringify({ ...sanitizeReport(value.report),
                    native, readableSummary: text }, null, 2);
            await io.writeFile(selection.filePath, contents, 'utf8');
            return { ok: true, fileName: path.basename(selection.filePath) };
        } finally { exportBusy = false; }
    });
}

module.exports = { trustedSender, installDiagnosticsIpc };
