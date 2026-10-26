// ------------------------------------------------------------
// APLIKACJA NA KOMPUTER (Electron) - proces główny
//
// Otwiera okno z grą. Pliki gry (index.html, src/, assets/, lib/)
// są wczytywane przez własny adres gra://voxel-game/ - dla gry to
// zwykła strona, więc działa tak samo jak w przeglądarce (moduły,
// zapis światów w IndexedDB, ustawienia w localStorage). Zapisy
// leżą w folderze aplikacji (Windows: %APPDATA%\Voxel Game) i
// zostają po aktualizacjach.
//
// Aktualizacje: przy starcie aplikacja sprawdza wydania na GitHubie
// (package.json -> build.publish), sama pobiera nową wersję w tle
// i instaluje ją przy zamknięciu gry albo od razu, gdy gracz kliknie
// "Zainstaluj teraz" w menu. Z ustawieniem "Aktualizacje automatyczne:
// Wył." (gra zapisuje je w pliku aktualizacje.json w folderze aplikacji)
// tylko sprawdza - pobiera po kliknięciu "Pobierz". Opis:
// docs/aplikacja.md.
//
// Klawisze: F11 - pełny ekran, F12 - narzędzia programisty.
// ------------------------------------------------------------

const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');

const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');


// Folder z plikami gry (w zbudowanej aplikacji - wnętrze app.asar).

const GAME_ROOT = path.join(__dirname, '..');

const SCHEME = 'gra';
const START_URL = `${SCHEME}://voxel-game/index.html`;

// Ile najwyżej czekamy na zapis świata przy zamykaniu okna.
const CLOSE_TIMEOUT_MS = 8000;


// Własny adres musi być zarejestrowany przed startem aplikacji:
// "standard" i "secure" - jak https (moduły, IndexedDB, localStorage).

protocol.registerSchemesAsPrivileged([
    {
        scheme: SCHEME,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            stream: true
        }
    }
]);


// Tylko jedno okno gry naraz (dwie kopie pisałyby do tych samych
// zapisów). Drugie uruchomienie pokazuje okno, które już działa.

if (!app.requestSingleInstanceLock()) {
    app.exit(0);
}


let mainWindow = null;

// Stan aktualizacji wysyłany do gry (menu pokazuje go na ekranie
// tytułowym): null albo { state, version, percent, message }.
let updateStatus = null;

// Zainstalować pobraną aktualizację po zamknięciu okna?
let installOnClose = false;


// Ustawienie "Aktualizacje automatyczne" (zapisane przez grę - setAutoUpdates).

function updateSettingsFile() {
    return path.join(app.getPath('userData'), 'aktualizacje.json');
}

function readAutoUpdates() {

    try {
        return JSON.parse(fs.readFileSync(updateSettingsFile(), 'utf8')).automatyczne !== false;
    }
    catch {
        return true;
    }

}


// ------------------------------------------------------------
// Pliki gry pod adresem gra://voxel-game/...
// ------------------------------------------------------------

function serveGameFiles() {

    protocol.handle(SCHEME, (request) => {

        const url = new URL(request.url);

        const relative = decodeURIComponent(url.pathname);

        const file = path.normalize(path.join(GAME_ROOT, relative === '/' ? 'index.html' : relative));


        // Nic spoza folderu gry.

        if (!file.startsWith(GAME_ROOT + path.sep)) {
            return new Response('Brak dostępu', { status: 403 });
        }

        return net.fetch(pathToFileURL(file).toString());

    });

}


// ------------------------------------------------------------
// Okno
// ------------------------------------------------------------

function createWindow() {

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 760,
        minWidth: 800,
        minHeight: 500,
        backgroundColor: '#000000',
        title: 'Voxel Game',
        icon: path.join(__dirname, 'icon.png'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            backgroundThrottling: false
        }
    });


    mainWindow.once('ready-to-show', () => mainWindow.show());


    // Linki do stron (np. w opisach) otwierają się w przeglądarce.

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {

        if (url.startsWith('https://')) {
            shell.openExternal(url);
        }

        return { action: 'deny' };

    });


    // F11 - pełny ekran, F12 - narzędzia programisty. Pozostałe klawisze
    // (też F3, F5) trafiają do gry - aplikacja nie ma menu, więc F5 nie
    // odświeża strony.

    mainWindow.webContents.on('before-input-event', (event, input) => {

        if (input.type !== 'keyDown' || input.isAutoRepeat) {
            return;
        }

        if (input.key === 'F11') {

            mainWindow.setFullScreen(!mainWindow.isFullScreen());

            event.preventDefault();

        }
        else if (input.key === 'F12') {

            mainWindow.webContents.toggleDevTools();

            event.preventDefault();

        }

    });


    // Zamykanie: najpierw gra zapisuje świat (preload.js -> main.js gry),
    // dopiero potem okno znika. Gdyby gra nie odpowiedziała - po
    // CLOSE_TIMEOUT_MS i tak zamykamy.

    let closing = false;

    mainWindow.on('close', (event) => {

        if (closing) {
            return;
        }

        event.preventDefault();

        closing = true;

        const window = mainWindow;

        const timer = setTimeout(() => window.destroy(), CLOSE_TIMEOUT_MS);

        ipcMain.once('desktop:close-ready', () => {

            clearTimeout(timer);

            window.destroy();

        });

        window.webContents.send('desktop:close-request');

    });


    mainWindow.on('closed', () => {
        mainWindow = null;
    });


    mainWindow.loadURL(START_URL);

}


// ------------------------------------------------------------
// Aktualizacje (electron-updater, wydania na GitHubie)
// ------------------------------------------------------------

function setUpdateStatus(status) {

    updateStatus = status;

    mainWindow?.webContents.send('desktop:update', updateStatus);

}


function startUpdater() {

    // Uruchomienie ze źródeł (npm start) - nie ma czego aktualizować.

    if (!app.isPackaged) {
        return;
    }


    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = readAutoUpdates();
    autoUpdater.autoInstallOnAppQuit = true;


    // Bez aktualizacji automatycznych: "jest nowa wersja" (gra pokazuje
    // przycisk Pobierz).

    autoUpdater.on('update-available', (info) => {

        setUpdateStatus(autoUpdater.autoDownload
            ? { state: 'downloading', version: info.version, percent: 0 }
            : { state: 'available', version: info.version });

    });


    ipcMain.on('desktop:download-update', () => {

        if (updateStatus?.state !== 'available') {
            return;
        }

        setUpdateStatus({ state: 'downloading', version: updateStatus.version, percent: 0 });

        autoUpdater.downloadUpdate().catch(() => {});

    });


    ipcMain.on('desktop:auto-updates', (event, on) => {

        autoUpdater.autoDownload = Boolean(on);

        try {
            fs.writeFileSync(updateSettingsFile(), JSON.stringify({ automatyczne: Boolean(on) }));
        }
        catch (error) {
            console.warn('Aktualizacje - zapis ustawienia:', error);
        }

    });

    autoUpdater.on('download-progress', (progress) => {
        setUpdateStatus({ ...updateStatus, state: 'downloading', percent: Math.round(progress.percent) });
    });

    autoUpdater.on('update-downloaded', (info) => {
        setUpdateStatus({ state: 'ready', version: info.version });
    });

    autoUpdater.on('error', (error) => {

        // Brak internetu albo wydań to nie problem - gra działa dalej.

        console.warn('Aktualizacja:', error?.message ?? error);

        if (updateStatus?.state === 'downloading') {
            setUpdateStatus({ state: 'error', version: updateStatus.version, message: String(error?.message ?? error) });
        }

    });


    // "Zainstaluj teraz" w menu gry: zamykamy okno (z zapisem świata),
    // a po zamknięciu uruchamiamy instalator nowej wersji.

    ipcMain.on('desktop:install-update', () => {

        if (updateStatus?.state !== 'ready') {
            return;
        }

        installOnClose = true;

        mainWindow?.close();

    });

    app.on('window-all-closed', () => {

        if (installOnClose) {
            autoUpdater.quitAndInstall(true, true);
        }

    });


    autoUpdater.checkForUpdates().catch(() => {});

}


// ------------------------------------------------------------
// Dane dla gry (preload.js)
// ------------------------------------------------------------

ipcMain.on('desktop:info', (event) => {

    event.returnValue = {
        version: app.getVersion(),
        packaged: app.isPackaged,
        update: updateStatus
    };

});


// ------------------------------------------------------------

app.on('second-instance', () => {

    if (mainWindow) {

        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }

        mainWindow.focus();

    }

});


app.whenReady().then(() => {

    Menu.setApplicationMenu(null);

    serveGameFiles();

    createWindow();

    startUpdater();

});


app.on('window-all-closed', () => {

    if (!installOnClose) {
        app.quit();
    }

});
