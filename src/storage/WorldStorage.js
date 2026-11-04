// ------------------------------------------------------------
// ZAPIS ŚWIATÓW W PRZEGLĄDARCE (IndexedDB)
//
// IndexedDB to baza danych wbudowana w przeglądarkę. Dane zostają
// po zamknięciu karty i po restarcie komputera, ale są przypisane
// do adresu, pod którym otwierasz grę (np. http://localhost:5500).
// Inny adres albo port = inne (puste) zapisy.
//
// Baza ma dwie "tabele":
//
//   worlds - jeden wpis na świat: nazwa, seed, stan gracza...
//   chunks - tylko chunki ZMIENIONE przez gracza. Reszta świata
//            i tak powstaje z seeda zawsze tak samo.
// ------------------------------------------------------------

import { DEFAULT_TERRAIN, DEFAULT_GAME_MODE } from '../config.js';
import { StorageWorker } from './StorageWorker.js';

const DB_NAME = 'voxel-game';

// Zwiększ, gdy zmienisz układ tabel (wtedy odpali się onupgradeneeded).
const DB_VERSION = 1;

// Wersja formatu zapisu świata - na wypadek przyszłych zmian.
// 2 (0.30.0): chunk może mieć numery bloków 2-bajtowe (packChunkBlocks).
const WORLD_FORMAT_VERSION = 2;

// ------------------------------------------------------------
// IndexedDB działa na zdarzeniach (onsuccess / onerror).
// Te dwie funkcje zamieniają je na Promise, żeby można było
// pisać po prostu "await".
// ------------------------------------------------------------

function requestToPromise(request) {

    return new Promise((resolve, reject) => {

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);

    });

}


function transactionToPromise(transaction) {

    return new Promise((resolve, reject) => {

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);

    });

}

// ------------------------------------------------------------
// Dane nowego świata (jeszcze niezapisane w bazie).
// ------------------------------------------------------------

export function createWorldInfo(name, seed, terrain = DEFAULT_TERRAIN, gameMode = DEFAULT_GAME_MODE) {

    const now = Date.now();

    return {

        // Unikalny identyfikator świata.
        id: now.toString(36) + Math.random().toString(36).slice(2, 8),

        name,
        seed,

        created: now,
        lastPlayed: now,

        // Pozycja i obrót gracza (null = nowy świat, start na środku).
        player: null,

        // Typ terenu ('realistic', 'classic' - src/world/terrain/generators.js).
        // Światy bez tego pola są klasyczne.
        terrain,

        // Tryb gry ('adventure', 'creative', 'developer'). Światy bez tego
        // pola są kreatywne. (Dawne pole "experiments" - trawa kępiasta
        // - od 0.55.0 jest w ustawieniach: Eksperymenty.)
        gameMode,

        // Ekwipunek z paskiem bloków (game/Inventory.js) - powstaje w grze.
        inventory: null,

        formatVersion: WORLD_FORMAT_VERSION

    };

}


// Losowy seed dla nowego świata.

export function randomSeed() {

    return Math.floor(Math.random() * 2147483647);

}


// Seed z tekstu wpisanego przez gracza:
// puste = losowy, same cyfry = liczba, reszta = tekst.

export function seedFromText(text) {

    const trimmed = String(text ?? '').trim();


    if (trimmed === '') {
        return randomSeed();
    }

    if (/^-?\d+$/.test(trimmed)) {
        return Number(trimmed);
    }

    return trimmed;

}

// ------------------------------------------------------------

// Bloki chunka do zapisu (kopia). Chunk w grze ma numery 2-bajtowe
// (Uint16Array, do 65535). Gdy wszystkie numery mieszczą się w bajcie
// (do 255 - wszystkie bloki sprzed 0.30.0), zapisujemy 1 bajt na blok,
// jak dawniej: zapis jest o połowę mniejszy, a stary format zostaje
// czytelny. Chunk z blokiem o większym numerze - 2 bajty na blok.

export function packChunkBlocks(blocks) {

    for (let i = 0; i < blocks.length; i++) {

        if (blocks[i] > 255) {
            return Uint16Array.from(blocks);
        }

    }

    return Uint8Array.from(blocks);

}


export class WorldStorage {

    constructor(db, { background = false, workerFactory } = {}) {

        this.db = db;
        this.workerFactory = workerFactory;
        this.background = background && (workerFactory || typeof Worker !== 'undefined')
            ? new StorageWorker(db.name, workerFactory) : null;

    }


    // Otwiera bazę. Rzuca błąd, gdy przeglądarka nie pozwala
    // na zapis (np. niektóre tryby prywatne).

    static async open() {

        if (!window.indexedDB) {
            throw new Error('Ta przeglądarka nie obsługuje IndexedDB.');
        }


        const request = indexedDB.open(DB_NAME, DB_VERSION);


        // Przy pierwszym uruchomieniu (albo po zmianie DB_VERSION)
        // tworzymy tabele.

        request.onupgradeneeded = () => {

            const db = request.result;


            if (!db.objectStoreNames.contains('worlds')) {

                db.createObjectStore('worlds', {
                    keyPath: 'id'
                });

            }


            if (!db.objectStoreNames.contains('chunks')) {

                // Kluczem chunka jest trójka: świat + pozycja chunka.

                const chunks = db.createObjectStore('chunks', {
                    keyPath: ['worldId', 'cx', 'cz']
                });

                // Indeks pozwala szybko pobrać wszystkie chunki świata.

                chunks.createIndex('worldId', 'worldId');

            }

        };


        const db = await requestToPromise(request);

        return new WorldStorage(db, { background: true });

    }


    // Wszystkie zapisane światy, od ostatnio granego.

    async listWorlds() {

        const transaction =
            this.db.transaction('worlds', 'readonly');

        const worlds = await requestToPromise(
            transaction.objectStore('worlds').getAll()
        );

        return worlds.sort(
            (a, b) => b.lastPlayed - a.lastPlayed
        );

    }


    // Zapisuje (albo nadpisuje) dane świata.

    async saveWorld(worldInfo) {

        const transaction =
            this.db.transaction('worlds', 'readwrite');

        transaction.objectStore('worlds').put(worldInfo);

        await transactionToPromise(transaction);

    }


    // Wczytuje zapisane chunki świata.
    // Zwraca Map: "cx,cz" -> Uint8Array albo Uint16Array z blokami
    // (Chunk.loadBlocks przyjmuje oba).

    async loadChunks(worldId) {

        const transaction =
            this.db.transaction('chunks', 'readonly');

        const index = transaction.objectStore('chunks').index('worldId');
        const chunks = new Map();

        // Kursor nie tworzy dodatkowej tablicy wszystkich rekordów świata
        // i oddaje sterowanie między odczytami. Mapa pozostaje dostępna
        // synchronicznie dla komend, odradzania i dalekiego terenu.
        if (typeof index.openCursor === 'function') {
            await new Promise((resolve, reject) => {
                const request = index.openCursor(worldId);
                request.onerror = () => reject(request.error);
                transaction.onabort = () => reject(transaction.error || new Error('Przerwany odczyt świata.'));
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) return resolve();
                    const record = cursor.value;
                    chunks.set(`${record.cx},${record.cz}`, record.blocks);
                    cursor.continue();
                };
            });
            return chunks;
        }

        // Porty bazy w narzędziach mogą nie udostępniać kursora.
        const records = await requestToPromise(index.getAll(worldId));

        for (const record of records) {

            chunks.set(
                `${record.cx},${record.cz}`,
                record.blocks
            );

        }

        return chunks;

    }


    // Usuwa świat razem ze wszystkimi jego chunkami.

    async deleteWorld(worldId) {

        const transaction =
            this.db.transaction(['worlds', 'chunks'], 'readwrite');


        transaction.objectStore('worlds').delete(worldId);


        // Wszystkie chunki tego świata: klucze od [id, -∞, -∞] do [id, +∞, +∞].

        transaction.objectStore('chunks').delete(
            IDBKeyRange.bound(
                [worldId, -Infinity, -Infinity],
                [worldId, Infinity, Infinity]
            )
        );


        await transactionToPromise(transaction);

    }


    // Zapisuje dane świata i podane chunki w JEDNEJ transakcji:
    // zapisze się albo wszystko, albo nic (świat nigdy nie zostaje
    // zapisany "w połowie").

    async saveWorldAndChunks(worldInfo, chunks, { immediate = false } = {}) {

        if (!immediate && this.background?.interrupted) {
            this.background = new StorageWorker(this.db.name, this.workerFactory);
        }
        // Przy zamykaniu strony transakcję uruchamiamy od razu.
        if (!immediate && chunks.length >= 16 && this.background && !this.background.disabled) {
            return this.background.write(worldInfo, chunks);
        }

        const transaction =
            this.db.transaction(['worlds', 'chunks'], 'readwrite');


        transaction.objectStore('worlds').put(worldInfo);


        const chunkStore = transaction.objectStore('chunks');

        for (const chunk of chunks) {

            chunkStore.put({

                worldId: worldInfo.id,

                cx: chunk.cx,
                cz: chunk.cz,

                // Kopia, żeby zmiany w trakcie zapisu nie mieszały się
                // z tym, co właśnie trafia do bazy (1 albo 2 bajty
                // na blok - packChunkBlocks niżej).
                blocks: packChunkBlocks(chunk.blocks)

            });

        }


        // Zatwierdzamy od razu, bez czekania - ważne, gdy zapis
        // odpala się przy zamykaniu strony.

        const done = transactionToPromise(transaction);

        transaction.commit?.();

        await done;

    }

    interruptBackgroundSave() {
        if (!this.background?.pending.size) return false;
        const error = new Error('Zapis w tle zastąpiony natychmiastowym zapisem przy wyjściu.');
        error.code = 'BACKGROUND_SAVE_INTERRUPTED';
        // Istniejąca transakcja workera jest przed nową lokalną transakcją
        // w kolejce IndexedDB. Zatrzymany worker nie utworzy późniejszej,
        // która mogłaby nadpisać najnowszą migawkę starszym stanem.
        this.background.interrupted = true;
        this.background.stop(error);
        return true;
    }

}
