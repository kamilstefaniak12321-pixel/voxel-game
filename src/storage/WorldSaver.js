// ------------------------------------------------------------
// AUTOZAPIS ŚWIATA
//
// Zapisuje świat:
//   - CHANGE_SAVE_DELAY sekund po zmianie bloków,
//   - co PLAYER_SAVE_INTERVAL sekund (pozycja gracza),
//   - gdy karta zostaje ukryta albo zamknięta.
//
// Zmienione bloki zapisujemy szybko, bo przy zamykaniu albo
// odświeżaniu strony przeglądarka nie zawsze zdąży dokończyć
// zapisu. Dzięki temu w najgorszym razie giną ostatnie 2 sekundy.
//
// Zapisywany jest stan gracza i tylko te chunki, które zmieniły
// się od poprzedniego zapisu.
//
// Naraz trwa najwyżej jeden zapis. Prośba o zapis w trakcie
// innego czeka na swoją kolej (wszystkie takie prośby łączą się
// w jeden kolejny zapis). Przy wyjściu ze świata flush() czeka
// na wszystko i mówi, czy świat naprawdę trafił do bazy.
// ------------------------------------------------------------

const CHANGE_SAVE_DELAY = 2;

const PLAYER_SAVE_INTERVAL = 10;

// Jak długo w HUD widać komunikat o zapisie (milisekundy).

const STATUS_DURATION = 2000;


export class WorldSaver {

    // storage   - WorldStorage albo null (zapis niedostępny)
    // worldInfo - dane świata (nazwa, seed, id...)

    // time      - czas świata (WorldTime) albo null

    constructor(storage, worldInfo, world, player, time = null) {

        this.storage = storage;
        this.worldInfo = worldInfo;

        this.world = world;
        this.player = player;
        this.time = time;


        // Czas od ostatniego zapisu i od pierwszej niezapisanej zmiany.

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        // Trwający zapis i zapis czekający na swoją kolej
        // (Promise z wynikiem true/false albo null).

        this.saving = null;
        this.queued = null;

        this.stopped = false;


        this.statusText = '';
        this.statusUntil = 0;

    }


    // Prośba o zapis. Zwraca Promise z wynikiem (true = udało się)
    // zapisu, który obejmuje stan świata z chwili wywołania.

    save() {

        if (!this.storage || this.stopped) {
            return Promise.resolve(false);
        }


        if (!this.saving) {

            this.saving = this.write().finally(() => {
                this.saving = null;
            });

            return this.saving;

        }


        // Zapis już trwa - kolejny zrobimy zaraz po nim.
        // Kilka próśb w tym czasie = jeden kolejny zapis.

        if (!this.queued) {

            this.queued = this.saving.then(() => {

                this.queued = null;

                return this.save();

            });

        }

        return this.queued;

    }


    // Kończy wszystkie zapisy przed wyjściem ze świata: czeka na
    // trwający i zaplanowany zapis, a potem zapisuje to, co jeszcze
    // zostało (zawsze z aktualną pozycją gracza).
    //
    // Zwraca true, jeśli świat jest w całości w bazie. Przy błędzie
    // zwraca false (bez ponawiania w kółko) - niezapisane chunki
    // zostają na liście, więc można spróbować jeszcze raz.
    //
    // Bez dostępnego zapisu (storage = null) gra świadomie działa
    // bez zapisu, więc nie ma na co czekać - zwraca true.

    async flush() {

        if (!this.storage) {
            return true;
        }


        await (this.queued ?? this.saving);

        return this.save();

    }


    // Jeden zapis do bazy.

    async write() {

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        // Jeśli gracz zmieni coś w trakcie zapisu, ten chunk znowu
        // trafi na listę i zapisze się przy następnej okazji.

        const chunks = this.world.takeUnsavedChunks();


        this.worldInfo.player = this.player.getState();
        this.worldInfo.lastPlayed = Date.now();

        if (this.time) {
            this.worldInfo.time = this.time.getState();
        }


        try {

            await this.storage.saveWorldAndChunks(
                this.worldInfo,
                chunks
            );


            if (chunks.length > 0) {
                this.showStatus('Świat zapisany');
            }

            return true;

        }

        catch (error) {

            // Nie udało się - te chunki spróbujemy zapisać następnym razem.

            this.world.markUnsaved(chunks);

            console.error('Nie udało się zapisać świata:', error);

            this.showStatus('Błąd zapisu świata!');

            return false;

        }

    }


    // Wywoływane co klatkę z pętli gry.

    update(dt) {

        this.timeSinceSave += dt;


        if (this.world.hasUnsavedChanges()) {

            this.timeSinceChange += dt;

        }


        if (
            this.timeSinceChange >= CHANGE_SAVE_DELAY ||
            this.timeSinceSave >= PLAYER_SAVE_INTERVAL
        ) {

            this.save();

        }

    }


    // Zapis przy ukryciu karty (inna karta, minimalizacja)
    // i przy zamykaniu strony.

    saveOnExit() {

        this.onVisibilityChange = () => {

            if (document.visibilityState === 'hidden') {
                this.save();
            }

        };

        this.onPageHide = () => {
            this.save();
        };


        document.addEventListener('visibilitychange', this.onVisibilityChange);

        window.addEventListener('pagehide', this.onPageHide);

    }


    // Wyłącza dalsze zapisy (przy wyjściu ze świata, po flush()).

    stop() {

        this.stopped = true;


        if (this.onVisibilityChange) {

            document.removeEventListener('visibilitychange', this.onVisibilityChange);

            window.removeEventListener('pagehide', this.onPageHide);

        }

    }

    // --------------------------------------------------------
    // Komunikat w HUD
    // --------------------------------------------------------

    showStatus(text) {

        this.statusText = text;
        this.statusUntil = performance.now() + STATUS_DURATION;

    }


    getStatus() {

        if (performance.now() < this.statusUntil) {
            return this.statusText;
        }

        return '';

    }

}
