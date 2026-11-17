// Odpowiedź dotyczy jednej próby, również po anulowaniu i ponownym zamknięciu.
function protectWindowClose(window, { ipcMain, dialog, timeoutMs, onCancel, onFinish }) {
    let request = 0;
    let pending = false;
    let finishing = false;
    let timer;
    let prompt;

    async function finish(saved) {
        if (finishing) return;
        finishing = true;
        clearTimeout(timer);
        prompt?.abort();
        try {
            await onFinish(saved);
        } catch {
            // Zapis świata jest rozstrzygnięty; dziennik aplikacji jest dodatkowy.
        } finally {
            if (!window.isDestroyed()) window.destroy();
        }
    }

    async function confirmDiscard(id, timedOut) {
        const controller = new AbortController();
        prompt?.abort();
        prompt = controller;
        const result = await dialog.showMessageBox(window, {
            type: 'warning', title: 'Zapis świata',
            message: timedOut ? 'Gra jeszcze nie potwierdziła zapisu świata.' : 'Nie udało się zapisać świata.',
            detail: 'Zamknięcie bez zapisu może usunąć ostatnie zmiany.',
            buttons: [timedOut ? 'Czekaj na zapis' : 'Wróć do gry', 'Zamknij bez zapisu'],
            defaultId: 0, cancelId: 0, signal: controller.signal
        }).catch(() => ({ response: 0 }));
        if (controller.signal.aborted || id !== request || finishing) return;
        prompt = null;
        if (result.response === 1) {
            await finish(false);
        } else if (timedOut) {
            // Następny X pozwala zdecydować ponownie; zapis nadal może się udać.
            timer = null;
        } else {
            pending = false;
            onCancel();
        }
    }

    function onReady(event, id, saved) {
        if (!pending || finishing || id !== request || event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame) return;
        clearTimeout(timer);
        if (saved === true) void finish(true);
        else void confirmDiscard(id, false);
    }

    ipcMain.on('desktop:close-ready', onReady);
    window.once('closed', () => {
        clearTimeout(timer);
        prompt?.abort();
        ipcMain.removeListener('desktop:close-ready', onReady);
    });
    window.on('close', event => {
        event.preventDefault();
        if (finishing || prompt) return;
        if (pending) {
            if (timer === null) void confirmDiscard(request, true);
            return;
        }
        pending = true;
        const id = ++request;
        timer = setTimeout(() => { void confirmDiscard(id, true); }, timeoutMs);
        window.webContents.send('desktop:close-request', id);
    });
}

module.exports = { protectWindowClose };
