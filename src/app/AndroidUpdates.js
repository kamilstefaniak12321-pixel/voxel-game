// ------------------------------------------------------------
// AKTUALIZACJE APLIKACJI NA TELEFON (Android)
//
// Jak w aplikacji na komputer: gra sama sprawdza wydania na GitHubie
// (przy starcie i co CHECK_INTERVAL_MS) i pobiera nową wersję w tle.
// Dwa rodzaje (android-latest.json w wydaniu, AktualizacjePlugin.java):
//
//   - nowa wersja GRY (pliki gry, kilka MB) - pobiera się sama i włącza
//     przy następnym uruchomieniu albo od razu ("Uruchom ponownie
//     teraz" na ekranie tytułowym). Nic nie trzeba instalować.
//   - nowa wersja APLIKACJI (.apk) - gdy zmieniła się część na telefon
//     (kod Javy, Capacitor...): przez Wi-Fi pobiera się sama, na danych
//     komórkowych - po stuknięciu "Pobierz"; instaluje się po stuknięciu
//     "Zainstaluj" (Android pyta o zgodę).
//
// Stan dla menu (Menu.setUpdateStatus): null albo
//   { state, kind, version, percent, size, message }
//   state: 'downloading' | 'ready' | 'available' | 'error'
//   kind:  'web' (pliki gry) | 'apk' (aplikacja).
//
// Wtyczka wołana bez @capacitor/core: window.Capacitor.nativePromise.
// Opis: docs/telefon.md.
// ------------------------------------------------------------

const PLUGIN = 'Aktualizacje';

const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;


// Porównanie wersji "1.2.3": < 0, 0, > 0.

export function compareVersions(a, b) {

    const pa = String(a).split('.').map((part) => parseInt(part, 10) || 0);
    const pb = String(b).split('.').map((part) => parseInt(part, 10) || 0);

    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {

        const difference = (pa[i] ?? 0) - (pb[i] ?? 0);

        if (difference !== 0) {
            return difference;
        }

    }

    return 0;

}


export class AndroidUpdates {

    // Czy aplikacja ma wtyczkę aktualizacji (od wersji 0.19.0).

    static available() {
        return Boolean(window.Capacitor?.isPluginAvailable?.(PLUGIN));
    }


    // onVersion(version) - wersja działającej gry (raz, na starcie).
    // onStatus(status) - przy każdej zmianie stanu.
    // beforeRestart() - async, przed wczytaniem nowej wersji (zapis świata).

    constructor({ onVersion, onStatus, beforeRestart }) {

        this.onVersion = onVersion;
        this.onStatus = onStatus;
        this.beforeRestart = beforeRestart;

        this.status = null;

        // Wersja działających plików gry (wersja.json), aplikacji (.apk)
        // i stan z wtyczki (info).
        this.version = null;
        this.info = null;

        // Ostatnio sprawdzone wydanie (android-latest.json) i kiedy.
        this.latest = null;
        this.checkedAt = null;
        this.lastError = null;

        this.checking = null;

    }


    call(method, options = {}) {
        return window.Capacitor.nativePromise(PLUGIN, method, options);
    }


    // Start: wersja, potwierdzenie, że gra wystartowała (pliki na próbę
    // są dobre), pierwsze sprawdzenie.

    async start() {

        try {

            const response = await fetch('wersja.json', { cache: 'no-store' });

            this.version = (await response.json()).version;

        }
        catch {
            this.version = null;
        }

        await this.call('gotowe');

        this.info = await this.call('info');

        this.version = this.version ?? this.info.apk;

        this.onVersion?.(this.version);

        if (this.info.wylaczone) {
            return;
        }

        window.Capacitor.addListener(PLUGIN, 'postep', (data) => {

            if (this.status?.state === 'downloading' && data?.version === this.status.version) {
                this.setStatus({ ...this.status, percent: data.percent });
            }

        });

        this.check().catch(() => {});

        setInterval(() => this.check().catch(() => {}), CHECK_INTERVAL_MS);

    }


    setStatus(status) {

        this.status = status;

        this.onStatus?.(status);

    }


    // Sprawdza wydania i - jeśli jest nowsza wersja - pobiera ją (pliki
    // gry zawsze, aplikację przez Wi-Fi). Zwraca opis wyniku (tekst).

    check() {

        this.checking ??= this.runCheck().finally(() => {
            this.checking = null;
        });

        return this.checking;

    }


    async runCheck() {

        this.info = await this.call('info');

        if (this.info.wylaczone) {
            return 'Wersja testowa aplikacji się nie aktualizuje (nowe są w GitHub Actions).';
        }

        let latest;

        try {

            latest = await this.call('sprawdz');

            this.lastError = null;

        }
        catch (error) {

            this.lastError = error?.message ?? String(error);

            throw error;

        }

        this.latest = latest;
        this.checkedAt = Date.now();


        if (!latest?.version || compareVersions(latest.version, this.version) <= 0) {
            return `Masz najnowszą wersję (${this.version}).`;
        }

        if (latest.version === this.info.zla) {
            return `Wersja ${latest.version} nie uruchomiła się na tym telefonie - gra zostaje przy ${this.version}.`;
        }


        // Te same pliki na telefon - wystarczą nowe pliki gry.

        if (latest.www && latest.native === this.info.native) {

            if (this.info.gotowa === latest.version) {
                this.setStatus({ state: 'ready', kind: 'web', version: latest.version });
            }
            else if (this.status?.state !== 'downloading') {
                await this.downloadWeb(latest);
            }

            return this.describe();

        }


        // Nowa aplikacja (.apk).

        if (latest.apk) {

            if (this.info.pobranaApk === latest.version) {
                this.setStatus({ state: 'ready', kind: 'apk', version: latest.version });
            }
            else if (!this.info.platne) {
                await this.download();
            }
            else if (this.status?.state !== 'downloading') {
                this.setStatus({ state: 'available', kind: 'apk', version: latest.version, size: latest.apk.size });
            }

        }

        return this.describe();

    }


    async downloadWeb(latest) {

        this.setStatus({ state: 'downloading', kind: 'web', version: latest.version, percent: 0 });

        try {

            await this.call('pobierzGre', { version: latest.version, ...latest.www });

            this.info.gotowa = latest.version;

            this.setStatus({ state: 'ready', kind: 'web', version: latest.version });

        }
        catch (error) {
            this.setStatus({ state: 'error', kind: 'web', version: latest.version, message: error?.message ?? String(error) });
        }

    }


    // Pobranie aplikacji (.apk) - samo przez Wi-Fi, albo "Pobierz".

    async download() {

        const latest = this.latest;

        if (!latest?.apk || this.status?.state === 'downloading') {
            return;
        }

        this.setStatus({ state: 'downloading', kind: 'apk', version: latest.version, percent: 0, size: latest.apk.size });

        try {

            await this.call('pobierzApk', { version: latest.version, ...latest.apk });

            this.info.pobranaApk = latest.version;

            this.setStatus({ state: 'ready', kind: 'apk', version: latest.version });

        }
        catch (error) {
            this.setStatus({ state: 'error', kind: 'apk', version: latest.version, message: error?.message ?? String(error) });
        }

    }


    // Gotowa aktualizacja: pliki gry - zapis świata i od razu nowa
    // wersja; aplikacja - instalacja (Android pyta o zgodę).

    async install() {

        const status = this.status;

        if (status?.state !== 'ready') {
            return false;
        }

        if (status.kind === 'web') {

            await this.beforeRestart?.();

            await this.call('uruchomTeraz');

            return true;

        }

        const result = await this.call('zainstalujApk', { file: this.latest?.apk?.file ?? `Voxel-Game-${status.version}-android.apk` });

        if (!result.zgoda) {
            this.setStatus({ ...status, message: 'permission' });
        }

        return true;

    }


    // Powrót do plików gry wbudowanych w aplikację.

    async revert() {

        await this.beforeRestart?.();

        await this.call('wroc');

    }


    // Opis stanu (/aktualizacja).

    describe() {

        const status = this.status;

        const version = status?.version;

        if (status?.state === 'downloading') {
            return `Pobieram ${status.kind === 'apk' ? 'aplikację' : 'nową wersję gry'} ${version}... ${status.percent ?? 0}%`;
        }

        if (status?.state === 'ready') {

            return status.kind === 'apk'
                ? `Pobrana nowa aplikacja ${version} - /aktualizacja instaluj (Android zapyta o zgodę).`
                : `Nowa wersja gry ${version} pobrana - włączy się przy następnym uruchomieniu (albo od razu: /aktualizacja instaluj).`;

        }

        if (status?.state === 'available') {
            return `Jest nowa aplikacja ${version} (${megabytes(status.size)} MB) - na danych komórkowych nie pobiera się sama: /aktualizacja pobierz.`;
        }

        if (status?.state === 'error') {
            return `Aktualizacja ${version}: ${status.message}`;
        }

        return `Masz najnowszą wersję (${this.version}).`;

    }

}


export function megabytes(bytes) {
    return bytes > 0 ? (bytes / 1048576).toFixed(1).replace('.', ',') : '?';
}
