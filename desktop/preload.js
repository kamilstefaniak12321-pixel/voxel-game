// ------------------------------------------------------------
// APLIKACJA NA KOMPUTER - most między oknem gry a aplikacją
//
// Gra (src/main.js) widzi tylko obiekt window.desktop (w przeglądarce
// go nie ma, więc tam nic się nie zmienia):
//
//   desktop.version            - wersja aplikacji (package.json)
//   desktop.onBeforeClose(fn)  - fn (może być async) wywoływana przed
//                                zamknięciem okna - np. zapis świata
//   desktop.onUpdate(fn)       - fn({ state, version, percent }) od razu
//                                (jeśli coś już wiadomo) i przy każdej
//                                zmianie stanu aktualizacji
//   desktop.installUpdate()    - zamknij grę i zainstaluj aktualizację
//   desktop.downloadUpdate()   - pobierz nową wersję (bez aktualizacji
//                                automatycznych - stan 'available')
//   desktop.setAutoUpdates(on) - ustawienie "Aktualizacje automatyczne"
// ------------------------------------------------------------

const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('desktop:info');

let beforeClose = null;

let updateListener = null;

let updateStatus = info.update;


// Okno chce się zamknąć: najpierw zapis gry, potem zgoda na zamknięcie.

ipcRenderer.on('desktop:close-request', async () => {

    try {
        await beforeClose?.();
    }
    catch (error) {
        console.error('Zapis przed zamknięciem:', error);
    }

    ipcRenderer.send('desktop:close-ready');

});


ipcRenderer.on('desktop:update', (event, status) => {

    updateStatus = status;

    updateListener?.(status);

});


contextBridge.exposeInMainWorld('desktop', {

    version: info.version,

    onBeforeClose(callback) {
        beforeClose = callback;
    },

    onUpdate(callback) {

        updateListener = callback;

        if (updateStatus) {
            callback(updateStatus);
        }

    },

    installUpdate() {
        ipcRenderer.send('desktop:install-update');
    },

    downloadUpdate() {
        ipcRenderer.send('desktop:download-update');
    },

    setAutoUpdates(on) {
        ipcRenderer.send('desktop:auto-updates', Boolean(on));
    }

});
