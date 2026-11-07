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

    diagnostic(level, kind, message, data) {
        try { this.onDiagnostic?.(level, kind, message, data); }
        catch { /* Awaria logowania nigdy nie zmienia wyniku zapisu świata. */ }
    }

    // storage   - WorldStorage albo null (zapis niedostępny)
    // worldInfo - dane świata (nazwa, seed, id...)

    // time      - czas świata (WorldTime) albo null

    constructor(storage, worldInfo, world, player, time = null, campfires = null, rafts = null, chests = null) {

        this.storage = storage;
        this.worldInfo = worldInfo;

        this.world = world;
        this.player = player;
        this.time = time;
        this.campfires = campfires;
        this.rafts = rafts;
        this.chests = chests;
        this.savedRaftVersion = -1;
        this.savedChestVersion = -1;
        this.savedFireVersion = -1;


        // Czas od ostatniego zapisu i od pierwszej niezapisanej zmiany.

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        // Trwający zapis i zapis czekający na swoją kolej
        // (Promise z wynikiem true/false albo null).

        this.saving = null;
        this.queued = null;
        this.queuedImmediate = false;
        this.activeBatches = new Set();

        this.stopped = false;


        this.statusText = '';
        this.statusUntil = 0;

    }


    // Prośba o zapis. Zwraca Promise z wynikiem (true = udało się)
    // zapisu, który obejmuje stan świata z chwili wywołania.

    save({ immediate = false } = {}) {

        if (!this.storage || this.stopped) {
            return Promise.resolve(false);
        }


        const interrupted = immediate && this.storage.interruptBackgroundSave?.();
        if (interrupted) {
            for (const chunks of this.activeBatches) this.world.markUnsaved(chunks);
        }

        if (!this.saving || interrupted) {

            const writing = this.write({ immediate }).finally(() => {
                if (this.saving === writing) this.saving = null;
            });
            this.saving = writing;

            return this.saving;

        }


        // Zapis już trwa - kolejny zrobimy zaraz po nim.
        // Kilka próśb w tym czasie = jeden kolejny zapis.

        this.queuedImmediate ||= immediate;
        if (!this.queued) {

            this.queued = this.saving.then(() => {

                this.queued = null;
                const nextImmediate = this.queuedImmediate;
                this.queuedImmediate = false;
                return this.save({ immediate: nextImmediate });

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

    latestChunks(chunks) {
        const latest = new Map();
        for (const chunk of chunks) {
            const key = `${chunk.cx},${chunk.cz}`;
            const current = this.world.getChunk?.(chunk.cx, chunk.cz);
            // The live chunk already contains the latest edits. Decoding its
            // older snapshot would only add autosave work and cache pressure.
            const saved = current ? undefined : this.world.savedChunks?.get(key);
            // W czasie zapisu A mógł zostać usunięty z widoku i wczytany
            // jako B. Ponowienie A nie może nadpisać nowszych edycji B.
            latest.set(key, current ?? (saved && saved !== chunk.blocks
                ? { cx: chunk.cx, cz: chunk.cz, blocks: saved, modified: true } : chunk));
        }
        return [...latest.values()];
    }

    async write({ immediate = false } = {}) {

        const diagnosticStart = performance.now();

        this.timeSinceSave = 0;
        this.timeSinceChange = 0;


        // Jeśli gracz zmieni coś w trakcie zapisu, ten chunk znowu
        // trafi na listę i zapisze się przy następnej okazji.

        const chunks = this.latestChunks(this.world.takeUnsavedChunks());
        this.activeBatches.add(chunks);


        const raftVersion = this.rafts?.version ?? 0;
        if (this.rafts) this.worldInfo.rafts = this.rafts.getState();
        const fireVersion = this.campfires?.version ?? 0;
        if (this.campfires) this.worldInfo.campfires = this.campfires.getState();
        const chestVersion = this.chests?.version ?? 0;
        if (this.chests) this.worldInfo.chests = this.chests.getState();
        this.worldInfo.player = this.player.getState();
        this.worldInfo.lastPlayed = Date.now();

        if (this.time) {
            this.worldInfo.time = this.time.getState();
        }


        try {

            await this.storage.saveWorldAndChunks(
                this.worldInfo,
                chunks,
                { immediate }
            );


            this.savedFireVersion = fireVersion;
            this.savedRaftVersion = raftVersion;
            this.savedChestVersion = chestVersion;
            this.diagnostic('info', 'world.saved', 'Zakończono zapis świata.', {
                chunks: chunks.length, immediate, wallMs: performance.now() - diagnosticStart
            });
            if (chunks.length > 0) {
                this.showStatus('Świat zapisany');
            }

            return true;

        }

        catch (error) {

            // Wyjście przejęło cały pakiet do natychmiastowej transakcji.
            if (error?.code === 'BACKGROUND_SAVE_INTERRUPTED') return false;

            // Nie udało się - te chunki spróbujemy zapisać następnym razem.

            this.world.markUnsaved(this.latestChunks(chunks));

            if (this.onDiagnostic) this.diagnostic('error', 'world.save.failed', 'Nie udało się zapisać świata.', {
                error, chunks: chunks.length, immediate, wallMs: performance.now() - diagnosticStart
            });
            else console.error('Nie udało się zapisać świata:', error);

            this.showStatus('Błąd zapisu świata!');

            return false;

        }
        finally {
            this.lastWriteMs = performance.now() - diagnosticStart;
            this.activeBatches.delete(chunks);
        }

    }


    // Wywoływane co klatkę z pętli gry.

    update(dt) {

        this.timeSinceSave += dt;


        if (this.world.hasUnsavedChanges() || (this.campfires && this.savedFireVersion !== this.campfires.version) || (this.rafts && this.savedRaftVersion !== this.rafts.version) || (this.chests && this.savedChestVersion !== this.chests.version)) {

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
                this.save({ immediate: true });
            }

        };

        this.onPageHide = () => {
            this.save({ immediate: true });
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
