// ------------------------------------------------------------
// PACZKI TEKSTUR
//
// Gracz wczytuje własną paczkę tekstur (plik .zip - Ustawienia ->
// Tekstury albo /tekstury wczytaj). Tekstury mogą mieć dowolną
// rozdzielczość (np. 1254 x 1254) - gra skaluje je do rozdzielczości
// w grze (Ustawienia -> Tekstury -> Rozdzielczość): od 16 (jak
// oryginalne) do RESOLUTION_MAX pikseli na blok.
//
// Paczka (szablon z oryginalnymi teksturami: paczka-tekstur-szablon/,
// opis: docs/paczki-tekstur.md):
//   paczka.json           - { nazwa, autor, opis } (niekonieczny)
//   bloki/<kafelek>.png   - tekstura kafelka atlasu (TextureAtlas.js,
//                           ATLAS_TILES), np. bloki/grass_top.png;
//                           tekstury drzew z paczek drzew:
//                           bloki/jablon/liscie.png,
//   pekniecia.png         - pęknięcia kopanego bloku (10 etapów obok
//                           siebie),
//   niebo/ksiezyc.png     - tarcza księżyca.
// Czego w paczce nie ma - zostaje oryginalne.
//
// Zapis (IndexedDB "voxel-game-tekstury", osobno od światów):
//   paczka  "aktywna"  - oryginalne pliki paczki i opis,
//   kafelki "<T>"      - tekstury przeskalowane do T x T (PNG) - przy
//                        starcie gry wczytują się szybko, bez
//                        skalowania wielkich obrazków.
// Paczka zmienia się po ponownym uruchomieniu gry (atlas, ikonki
// i kolory dalekiego terenu liczą się raz, przy starcie).
// ------------------------------------------------------------

import {
    TEXTURE_PACK_TEMPLATE_URL
} from '../config.js';


const DB_NAME = 'voxel-game-tekstury';
const DB_VERSION = 1;

const PACK_STORE = 'paczka';
const TILE_STORE = 'kafelki';

const ACTIVE = 'aktywna';

const SETTINGS_KEY = 'voxel-game-settings';

// Rozdzielczości w grze (piksele na blok). Większe zajmują dużo pamięci
// karty graficznej: atlas 16 x 12 kafelków po 512 px to 8192 x 6144
// pikseli - ok. 270 MB z mipmapami; na telefonie najwyżej
// RESOLUTION_MAX_PHONE.
export const RESOLUTIONS = [16, 32, 64, 128, 256, 512];

export const RESOLUTION_MAX = 512;
export const RESOLUTION_MAX_PHONE = 256;

// Pliki paczki poza kafelkami atlasu.
export const PACK_EXTRAS = {
    cracks: 'pekniecia.png',
    moon: 'niebo/ksiezyc.png'
};

// Największy plik w paczce, który wczytujemy (bajty).
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;


// ------------------------------------------------------------
// Baza (IndexedDB)
// ------------------------------------------------------------

let dbPromise = null;

function openDb() {

    dbPromise ??= new Promise((resolve, reject) => {

        if (typeof indexedDB === 'undefined') {
            reject(new Error('Brak zapisu w przeglądarce (IndexedDB).'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {

            const db = request.result;

            if (!db.objectStoreNames.contains(PACK_STORE)) {
                db.createObjectStore(PACK_STORE);
            }

            if (!db.objectStoreNames.contains(TILE_STORE)) {
                db.createObjectStore(TILE_STORE);
            }

        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);

    });

    return dbPromise;

}


async function dbRequest(store, mode, run) {

    const db = await openDb();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(store, mode);

        const request = run(transaction.objectStore(store));

        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Zapis przerwany (brak miejsca?).'));

    });

}

const dbGet = (store, key) => dbRequest(store, 'readonly', (s) => s.get(key));
const dbPut = (store, key, value) => dbRequest(store, 'readwrite', (s) => s.put(value, key));
const dbClear = (store) => dbRequest(store, 'readwrite', (s) => s.clear());


// ------------------------------------------------------------
// Czytanie pliku .zip (bez bibliotek: katalog na końcu pliku,
// rozpakowanie - DecompressionStream przeglądarki)
// ------------------------------------------------------------

function u16(view, offset) {
    return view.getUint16(offset, true);
}

function u32(view, offset) {
    return view.getUint32(offset, true);
}


// Lista plików w zipie: [{ name, size, read() -> Promise<Blob> }].

export async function readZip(blob) {

    const tailSize = Math.min(blob.size, 65536 + 22);

    const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());

    let end = -1;

    for (let i = tailSize - 22; i >= 0; i--) {

        if (u32(tail, i) === 0x06054b50) {
            end = i;
            break;
        }

    }

    if (end < 0) {
        throw new Error('To nie jest plik .zip (albo jest uszkodzony).');
    }

    const count = u16(tail, end + 10);
    const directorySize = u32(tail, end + 12);
    const directoryOffset = u32(tail, end + 16);

    if (directoryOffset === 0xffffffff || count === 0xffff) {
        throw new Error('Zbyt duży plik .zip (ZIP64) - spakuj paczkę zwykłym zipem.');
    }

    const directory = new DataView(await blob.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer());

    const decoder = new TextDecoder('utf-8');

    const entries = [];

    let p = 0;

    for (let n = 0; n < count && p + 46 <= directory.byteLength; n++) {

        if (u32(directory, p) !== 0x02014b50) {
            throw new Error('Uszkodzony plik .zip (katalog plików).');
        }

        const method = u16(directory, p + 10);
        const compressedSize = u32(directory, p + 20);
        const size = u32(directory, p + 24);
        const nameLength = u16(directory, p + 28);
        const extraLength = u16(directory, p + 30);
        const commentLength = u16(directory, p + 32);
        const localOffset = u32(directory, p + 42);

        const name = decoder.decode(new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength)).replaceAll('\\', '/');

        p += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/')) {
            continue;
        }

        entries.push({

            name,
            size,

            async read() {

                if (size > MAX_ENTRY_BYTES) {
                    throw new Error(`${name}: za duży plik (${Math.round(size / 1048576)} MB)`);
                }

                const header = new DataView(await blob.slice(localOffset, localOffset + 30).arrayBuffer());

                if (u32(header, 0) !== 0x04034b50) {
                    throw new Error(`${name}: uszkodzony plik .zip`);
                }

                const start = localOffset + 30 + u16(header, 26) + u16(header, 28);

                const data = blob.slice(start, start + compressedSize);

                if (method === 0) {
                    return data;
                }

                if (method === 8) {

                    let stream;

                    try {
                        stream = new DecompressionStream('deflate-raw');
                    }
                    catch {
                        throw new Error('ta przeglądarka nie umie rozpakować pliku .zip - zaktualizuj ją (na telefonie: Android System WebView albo Chrome)');
                    }

                    return new Response(data.stream().pipeThrough(stream)).blob();

                }

                throw new Error(`${name}: nieobsługiwana kompresja (${method}) - spakuj paczkę zwykłym zipem`);

            }

        });

    }

    return entries;

}


// ------------------------------------------------------------
// Rozdzielczość
// ------------------------------------------------------------

let deviceMax = null;

// Największa rozdzielczość w grze na tym urządzeniu: limit pamięci
// (telefon mniej) i największa tekstura, jaką przyjmie karta graficzna
// (atlas ma 16 kafelków szerokości i rows wysokości).

export function maxResolution(rows = 16) {

    if (deviceMax === null) {

        let maxTexture = 4096;

        try {

            const gl = document.createElement('canvas').getContext('webgl2');

            maxTexture = gl?.getParameter(gl.MAX_TEXTURE_SIZE) ?? maxTexture;

            gl?.getExtension('WEBGL_lose_context')?.loseContext();

        }
        catch {
            // zostaje 4096
        }

        deviceMax = maxTexture;

    }

    const phone = Boolean(window.Capacitor?.isNativePlatform?.()) || Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);

    let max = phone ? RESOLUTION_MAX_PHONE : RESOLUTION_MAX;

    while (max > 16 && max * Math.max(16, rows) > deviceMax) {
        max /= 2;
    }

    return max;

}


// Ustawienie "Rozdzielczość tekstur" (0 = automatyczna).

export function savedResolution() {

    try {
        return Number(JSON.parse(localStorage.getItem(SETTINGS_KEY))?.textureResolution) || 0;
    }
    catch {
        return 0;
    }

}


// Rozdzielczość w grze dla paczki o teksturach source x source:
// automatyczna - najbliższa potęga dwójki w górę (np. 20 -> 32,
// 1254 -> 2048), najwyżej maxResolution().

export function gameResolution(source, setting = savedResolution(), rows = 16) {

    const max = maxResolution(rows);

    if (setting > 0) {
        return Math.max(16, Math.min(setting, max));
    }

    let size = 16;

    while (size < source && size < max) {
        size *= 2;
    }

    return size;

}


// ------------------------------------------------------------
// Wczytanie paczki
// ------------------------------------------------------------

// Plik .zip -> zapisana paczka (oryginalne pliki). tileNames - nazwy
// kafelków atlasu (ATLAS_TILES). Zwraca opis paczki.

export async function importTexturePack(file, tileNames, onProgress) {

    const entries = await readZip(file);

    // Paczka spakowana razem z folderem (moja-paczka/bloki/...) - folder
    // pomijamy.

    const prefix = commonPrefix(entries.map((entry) => entry.name));

    const names = new Set(tileNames);

    const files = {};
    const extras = {};
    const unknown = [];

    let meta = {};

    const sizes = new Map();

    let done = 0;

    for (const entry of entries) {

        const path = entry.name.slice(prefix.length);

        onProgress?.(++done, entries.length);

        if (path.toLowerCase() === 'paczka.json') {

            try {
                meta = JSON.parse(await (await entry.read()).text()) ?? {};
            }
            catch {
                unknown.push(`${path} (zły JSON)`);
            }

            continue;

        }

        if (!path.toLowerCase().endsWith('.png')) {

            if (!/(^|\/)(readme|czytaj|opis|licencja|license)[^/]*$/i.test(path) && !path.startsWith('__MACOSX/')) {
                unknown.push(path);
            }

            continue;

        }

        const extra = Object.entries(PACK_EXTRAS).find(([, name]) => name === path)?.[0];

        const tile = tileOfPath(path, names);

        if (!tile && !extra) {

            if (!path.startsWith('__MACOSX/')) {
                unknown.push(path);
            }

            continue;

        }

        const blob = new Blob([await entry.read()], { type: 'image/png' });

        if (extra) {
            extras[extra] = blob;
            continue;
        }

        // Rozmiar (do rozdzielczości paczki) - z nagłówka PNG.

        const size = await pngSize(blob);

        if (!size) {
            unknown.push(`${path} (to nie jest PNG)`);
            continue;
        }

        files[tile] = blob;

        const side = Math.min(size.width, size.height);

        sizes.set(side, (sizes.get(side) ?? 0) + 1);

    }


    if (Object.keys(files).length === 0 && Object.keys(extras).length === 0) {
        throw new Error('W paczce nie ma żadnej tekstury gry (bloki/<nazwa>.png - patrz szablon paczki).');
    }

    // Rozdzielczość paczki - najczęstszy rozmiar tekstur.

    const source = [...sizes.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 16;

    const pack = {
        name: String(meta.nazwa ?? meta.name ?? file.name?.replace(/\.zip$/i, '') ?? 'Paczka').slice(0, 60),
        author: String(meta.autor ?? meta.author ?? '').slice(0, 60),
        description: String(meta.opis ?? meta.description ?? '').slice(0, 200),
        source,
        files,
        extras,
        unknown,
        missing: tileNames.filter((name) => !files[name]),
        stamp: Date.now()
    };

    await dbClear(TILE_STORE);

    await dbPut(PACK_STORE, ACTIVE, pack);

    return pack;

}


// Wspólny folder wszystkich plików (np. "moja-paczka/") albo "".

function commonPrefix(paths) {

    const files = paths.filter((path) => !path.startsWith('__MACOSX/'));

    if (files.length === 0 || files.some((path) => !path.includes('/'))) {
        return '';
    }

    const first = files[0].slice(0, files[0].indexOf('/') + 1);

    if (first === 'bloki/' || first === 'niebo/') {
        return '';
    }

    return files.every((path) => path.startsWith(first)) ? first : '';

}


// "bloki/grass_top.png" -> "grass_top"; "bloki/jablon/liscie.png" ->
// "jablon/liscie.png" (kafelek z paczki drzewa). Wielkość liter nie ma
// znaczenia.

function tileOfPath(path, names) {

    const match = /^bloki\/(.+)$/i.exec(path);

    if (!match) {
        return null;
    }

    const file = match[1];

    for (const candidate of [file, file.replace(/\.png$/i, '')]) {

        if (names.has(candidate)) {
            return candidate;
        }

        const lower = candidate.toLowerCase();

        for (const name of names) {

            if (name.toLowerCase() === lower) {
                return name;
            }

        }

    }

    return null;

}


// Szerokość i wysokość z nagłówka PNG (bez dekodowania obrazka).

async function pngSize(blob) {

    const head = new DataView(await blob.slice(0, 24).arrayBuffer());

    if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47 || head.getUint32(12) !== 0x49484452) {
        return null;
    }

    return { width: head.getUint32(16), height: head.getUint32(20) };

}


// ------------------------------------------------------------
// Paczka w grze
// ------------------------------------------------------------

// Zapisana paczka (bez plików - sam opis) albo null.

export async function getPackInfo() {

    try {

        const pack = await dbGet(PACK_STORE, ACTIVE);

        if (!pack) {
            return null;
        }

        return {
            name: pack.name,
            author: pack.author,
            description: pack.description,
            source: pack.source,
            tiles: Object.keys(pack.files).length,
            extras: Object.keys(pack.extras ?? {}),
            missing: pack.missing ?? [],
            unknown: pack.unknown ?? [],
            stamp: pack.stamp
        };

    }
    catch {
        return null;
    }

}


export async function removeTexturePack() {

    await dbClear(TILE_STORE);
    await dbClear(PACK_STORE);

}


// Tekstury paczki przeskalowane do size x size - z zapisu albo
// policzone teraz (i zapisane). Zwraca { size, tiles: Map nazwa -> Blob
// (PNG size x size), extras: { cracks, moon } (Bloby), pack } albo null
// (bez paczki).

export async function loadPackTiles(size, onProgress) {

    const pack = await dbGet(PACK_STORE, ACTIVE);

    if (!pack) {
        return null;
    }

    let cached = await dbGet(TILE_STORE, String(size));

    if (!cached || cached.stamp !== pack.stamp) {
        cached = await scaleTiles(pack, size, onProgress);
    }

    return { size, tiles: new Map(Object.entries(cached.tiles)), extras: pack.extras ?? {}, pack };

}


// ------------------------------------------------------------
// Bezpieczny start
//
// Duża paczka to duży atlas - gdyby karta graficzna (albo pamięć)
// go nie udźwignęła, strona by padła przy każdym starcie. Przed
// zbudowaniem atlasu zapisujemy, z jaką rozdzielczością próbujemy;
// po udanym starcie (startSucceeded) - kasujemy. Jeśli zapis został
// (poprzedni start się nie udał), ta próba ma rozdzielczość o połowę
// mniejszą, a poniżej 16 - bez paczki - i tak zostaje, dopóki gracz sam
// nie zmieni rozdzielczości albo paczki (reducedResolution(true)).
// ------------------------------------------------------------

const START_KEY = 'voxel-game-tekstury-start';
const REDUCED_KEY = 'voxel-game-tekstury-zmniejszone';

export function safeResolution(size) {

    let failed = 0;

    try {
        failed = Number(localStorage.getItem(START_KEY)) || 0;
    }
    catch {
        // bez zapisu - bez ochrony
    }

    let result = size;

    // Wiadomo już, że ta rozdzielczość nie działa (aż gracz sam ją zmieni).

    const reduced = reducedResolution();

    if (reduced && result >= reduced.failed) {
        result = reduced.used;
    }

    if (failed > 0 && result >= failed) {

        result = failed / 2 >= 16 ? failed / 2 : 0;

        try {
            localStorage.setItem(REDUCED_KEY, `${failed}:${result}`);
        }
        catch {
            // nic
        }

        console.warn(`Paczka tekstur: poprzedni start z teksturami ${failed} x ${failed} się nie udał - teraz ${result || 'bez paczki'}.`);

    }

    try {

        if (result > 0) {
            localStorage.setItem(START_KEY, String(result));
        }
        else {
            localStorage.removeItem(START_KEY);
        }

    }
    catch {
        // nic
    }

    return result;

}


export function startSucceeded() {

    try {
        localStorage.removeItem(START_KEY);
    }
    catch {
        // nic
    }

}


// "512:256" - poprzedni start z 512 się nie udał, gra działa z 256 (0 - bez
// paczki); null - nie było problemu. clear - zapomnij.

export function reducedResolution(clear = false) {

    try {

        const text = localStorage.getItem(REDUCED_KEY);

        if (clear) {
            localStorage.removeItem(REDUCED_KEY);
        }

        if (!text) {
            return null;
        }

        const [failed, used] = text.split(':').map(Number);

        return { failed, used };

    }
    catch {
        return null;
    }

}


// Wszystkie tekstury paczki do size x size (PNG) i zapis.

async function scaleTiles(pack, size, onProgress) {

    // Płótna w zwykłej pamięci (willReadFrequently - bez karty
    // graficznej): przy wielkich obrazkach karta (zwłaszcza w telefonie)
    // mogłaby nie dać rady i zgubić obraz gry.

    const canvas = new OffscreenCanvas(size, size);

    const context = canvas.getContext('2d', { willReadFrequently: true });

    const tiles = {};

    const names = Object.keys(pack.files);

    let done = 0;

    for (const name of names) {

        onProgress?.(++done, names.length);

        try {

            const image = await createImageBitmap(pack.files[name]);

            // Kwadrat z góry obrazka (tekstury animowane - pasek klatek -
            // mają pierwszą klatkę u góry).

            const side = Math.min(image.width, image.height);

            context.clearRect(0, 0, size, size);

            // Zmniejszanie - gładko; powiększanie (np. 16 -> 64) - piksele
            // zostają ostre.

            context.imageSmoothingEnabled = side > size;
            context.imageSmoothingQuality = 'high';

            if (side > size * 2) {

                // Duże zmniejszenie po kawałku (po 2 razy) - ładniej niż
                // od razu z 1254 do 64.

                let source = image;
                let current = side;

                while (current / 2 >= size * 2 && current / 2 >= 1) {

                    const half = Math.floor(current / 2);

                    const step = new OffscreenCanvas(half, half);

                    const stepContext = step.getContext('2d', { willReadFrequently: true });

                    stepContext.imageSmoothingQuality = 'high';
                    stepContext.drawImage(source, 0, 0, current, current, 0, 0, half, half);

                    release(source);

                    source = step;
                    current = half;

                }

                context.drawImage(source, 0, 0, current, current, 0, 0, size, size);

                release(source);

            }
            else {
                context.drawImage(image, 0, 0, side, side, 0, 0, size, size);
            }

            image.close();

            tiles[name] = await canvas.convertToBlob({ type: 'image/png' });

        }
        catch (error) {
            console.warn(`Paczka tekstur: ${name}:`, error);
        }

    }

    const cached = { size, stamp: pack.stamp, tiles };

    try {
        await dbPut(TILE_STORE, String(size), cached);
    }
    catch (error) {
        console.warn('Paczka tekstur - nie udało się zapisać przeskalowanych tekstur:', error);
    }

    return cached;

}


// Zwolnienie pamięci płótna albo obrazka (od razu, bez czekania na
// sprzątanie pamięci przeglądarki).

function release(image) {

    if (image instanceof OffscreenCanvas) {
        image.width = 0;
        image.height = 0;
    }
    else {
        image.close?.();
    }

}


// Gra zgubiła obraz (karta graficzna) z atlasem size x size - przy
// następnym starcie (i aż gracz sam zmieni rozdzielczość) o połowę mniej.

export function markTextureFailure(size) {

    try {
        localStorage.setItem(REDUCED_KEY, `${size}:${size / 2 >= 16 ? size / 2 : 0}`);
        localStorage.removeItem(START_KEY);
    }
    catch {
        // nic
    }

}


// Szablon paczki (oryginalne tekstury) - w każdym wydaniu gry.

export function templateUrl() {
    return TEXTURE_PACK_TEMPLATE_URL;
}
