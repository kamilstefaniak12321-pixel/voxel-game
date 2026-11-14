// ------------------------------------------------------------
// PAMIĘĆ STARTU (1.1.4) - gotowe rzeczy między uruchomieniami
//
// Część pracy przy starcie daje za każdym razem ten sam wynik, dopóki
// nie zmieni się wersja gry: np. ok. 600 ikonek bloków i przedmiotów
// (ui/BlockIcons.js). Tutaj wynik zostaje w pamięci przeglądarki
// aplikacji (IndexedDB) i następny start bierze go gotowy.
//
// Bezpieczeństwo wyniku:
//   - pamięć działa TYLKO w zbudowanej aplikacji (paczka plików gry,
//     tools/pakiet.mjs): tam kod jest zamrożony i ma swój odcisk
//     (BUILD_ID - wersja + skrót wszystkich plików gry). Przy pracy nad
//     grą i w testach BUILD_ID nie ma, więc nic się nie zapamiętuje -
//     zmiana w kodzie jest widoczna od razu;
//   - każdy wpis ma klucz: odcisk gry i wszystko, od czego zależy wynik
//     (np. skrót obrazka tekstur). Inny klucz = wpis nieważny;
//   - brak pamięci, błąd odczytu, uszkodzony wpis = liczymy od nowa.
//     Pamięć startu nigdy nie jest potrzebna do działania gry.
//
// To osobna baza (voxel-game-start-cache) - nie dotyka światów,
// ustawień ani paczek tekstur. Można ją skasować bez żadnej straty.
//
// Nowa rzecz do zapamiętania: readStartCache(nazwa, klucz) przed
// liczeniem, writeStartCache(nazwa, klucz, wynik) po. Klucz musi
// obejmować wszystko, co wpływa na wynik.
// ------------------------------------------------------------

// Odcisk zbudowanej gry (wstawia go tools/pakiet.mjs na początku plików
// paczki) albo null przy pracy nad grą.
export const BUILD_ID = typeof globalThis.__VR_BUILD === 'string' && globalThis.__VR_BUILD ? globalThis.__VR_BUILD : null;

const DB_NAME = 'voxel-game-start-cache';
const STORE = 'wpisy';

let dbPromise = null;

function openDb() {

    dbPromise ??= new Promise((resolve, reject) => {

        if (typeof indexedDB === 'undefined') {
            reject(new Error('Brak IndexedDB'));
            return;
        }

        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Baza zajęta'));

    });

    // Nieudane otwarcie nie blokuje następnej próby.
    dbPromise.catch(() => { dbPromise = null; });

    return dbPromise;

}

function run(mode, work) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Błąd zapisu'));
    }));
}

// Zapamiętany wynik albo null (brak, inny klucz, błąd).
export async function readStartCache(name, key) {

    if (!BUILD_ID || !key) {
        return null;
    }

    try {
        const entry = await run('readonly', (store) => store.get(name));
        return entry && entry.key === `${BUILD_ID}|${key}` ? entry.value : null;
    }
    catch {
        return null;
    }

}

// Zapamiętuje wynik (jeden wpis na nazwę - stary jest zastępowany).
// Zwraca true, gdy się udało.
export async function writeStartCache(name, key, value) {

    if (!BUILD_ID || !key) {
        return false;
    }

    try {
        await run('readwrite', (store) => store.put({ key: `${BUILD_ID}|${key}`, value, savedAt: Date.now() }, name));
        return true;
    }
    catch {
        return false;
    }

}
