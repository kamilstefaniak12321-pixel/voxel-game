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

import { DEFAULT_TERRAIN } from '../config.js';

const DB_NAME = 'voxel-game';

// Zwiększ, gdy zmienisz układ tabel (wtedy odpali się onupgradeneeded).
const DB_VERSION = 1;

// Wersja formatu zapisu świata - na wypadek przyszłych zmian.
const WORLD_FORMAT_VERSION = 1;

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

export function createWorldInfo(name, seed, terrain = DEFAULT_TERRAIN) {

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

export class WorldStorage {

    constructor(db) {

        this.db = db;

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

        return new WorldStorage(db);

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
    // Zwraca Map: "cx,cz" -> Uint8Array z blokami.

    async loadChunks(worldId) {

        const transaction =
            this.db.transaction('chunks', 'readonly');

        const records = await requestToPromise(
            transaction
                .objectStore('chunks')
                .index('worldId')
                .getAll(worldId)
        );


        const chunks = new Map();

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

    async saveWorldAndChunks(worldInfo, chunks) {

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
                // z tym, co właśnie trafia do bazy.
                blocks: chunk.blocks.slice()

            });

        }


        // Zatwierdzamy od razu, bez czekania - ważne, gdy zapis
        // odpala się przy zamykaniu strony.

        const done = transactionToPromise(transaction);

        transaction.commit?.();

        await done;

    }

}
