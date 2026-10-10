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
// ------------------------------------------------------------

const CHANGE_SAVE_DELAY = 2;

const PLAYER_SAVE_INTERVAL = 10;

// Jak długo w HUD widać komunikat o zapisie (milisekundy).

const STATUS_DURATION = 2000;


export class WorldSaver {

    // storage   - WorldStorage albo null (zapis niedostępny)
    // worldInfo - dane świata (nazwa, seed, id...)

    constructor(storage, worldInfo, world, player) {

        this.storage = storage;
        this.worldInfo = worldInfo;

        this.world = world;
        this.player = player;


        // Czas od ostatniego zapisu i od pierwszej niezapisanej zmiany.

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        this.saving = false;
        this.saveAgain = false;

        this.stopped = false;


        this.statusText = '';
        this.statusUntil = 0;

    }


    // Zapisuje świat. Zwraca true, jeśli zapis się udał.

    async save() {

        if (!this.storage || this.stopped) {
            return false;
        }


        // Zapis już trwa - zrobimy kolejny zaraz po nim.

        if (this.saving) {

            this.saveAgain = true;

            return false;

        }


        this.saving = true;

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        // Jeśli gracz zmieni coś w trakcie zapisu, ten chunk znowu
        // trafi na listę i zapisze się przy następnej okazji.

        const chunks = this.world.takeUnsavedChunks();


        this.worldInfo.player = this.player.getState();
        this.worldInfo.lastPlayed = Date.now();


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

        finally {

            this.saving = false;


            if (this.saveAgain) {

                this.saveAgain = false;

                this.save();

            }

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


    // Wyłącza dalsze zapisy (np. przy wyjściu ze świata).

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
