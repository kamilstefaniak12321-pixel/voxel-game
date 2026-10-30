// ------------------------------------------------------------
// PACZKI DRZEW - nowe gatunki drzew bez pisania kodu
//
// Każdy folder w assets/drzewa/ wymieniony w assets/drzewa/lista.json
// to jeden gatunek drzewa:
//   drzewo.json  - nazwy, bloki, odmiany liści (np. z owocami),
//                  przedmioty (owoce), kształt drzewa, gdzie rośnie,
//   *.png        - tekstury 16 x 16 pikseli,
//   *.txt        - kształt drzewa narysowany warstwami (opcjonalnie).
//
// Instrukcja krok po kroku: docs/drzewa-paczki.md. Nową paczkę zakłada
// python tools/nowe_drzewo.py <nazwa>, a sprawdza (i dopisuje do
// lista.json) node tools/drzewa.mjs - na GitHubie robi to też sama
// akcja .github/workflows/drzewa.yml.
//
// Ten moduł tylko wczytuje i sprawdza paczki - przy starcie gry, zanim
// powstanie lista bloków (await na najwyższym poziomie modułu, więc
// BlockRegistry.js i reszta czekają na wynik). Paczka z błędem jest
// pomijana, a gra działa dalej - błąd trafia do TREE_PACK_ERRORS (gra
// pokazuje go na czacie po wejściu do świata, /drzewa paczki wypisuje
// wszystkie).
//
// Z paczek korzystają: trees.js (bloki), ItemRegistry.js (przedmioty),
// TextureAtlas.js (tekstury w atlasie), TreeShapes.js (kształt),
// Forests.js (gdzie rośnie), recipes.js (przepisy), list.js
// (osiągnięcie), gameCommands.js (/drzewa).
// ------------------------------------------------------------

import { BIOMES, LAND_BIOMES, biomeByWord } from '../world/terrain/Biomes.js';

// Numery bloków: każda paczka zajmuje PACK_ID_SLOTS kolejnych numerów
// od swojego "pierwszeId":
//   +0 pień, +1 okorowany pień, +2 deski, +3 liście, +4 sadzonka,
//   +5 opadłe liście, +6 i +7 pierwsza odmiana liści (odmiana i jej
//   "odrastająca" wersja po zbiorze), +8 i +9 druga odmiana.
// Numer zapisuje się w świecie, więc raz użytego "pierwszeId" nie wolno
// już zmieniać. Zakresy (wszystkie: src/blocks/BlockRegistry.js):
//   100-239    - dawny zakres, wspólny z paczkami roślin (drzewa od dołu),
//   1000-4999  - od 0.30.0 (numery bloków 2-bajtowe), tylko drzewa.

export const TREE_ID_RANGES = [[100, 239], [1000, 4999]];

// Dawny zakres (100-239) - wspólny z paczkami roślin.
export const PACK_FIRST_ID = 100;

export const PACK_LAST_ID = 239;


// Czy numery od `first` do first + count - 1 mieszczą się w jednym
// z zakresów [[od, do], ...].

export function idsInRanges(first, count, ranges) {

    return Number.isInteger(first) && ranges.some(([from, to]) => first >= from && first + count - 1 <= to);

}


export function rangesText(ranges, count) {

    return ranges.map(([from, to]) => `${from}-${to - count + 1}`).join(' albo ');

}

export const PACK_ID_SLOTS = 10;

export const PACK_MAX_VARIANTS = 2;

export const PACK_MAX_ITEMS = 4;

export const PACK_SLOT = {
    log: 0,
    stripped: 1,
    planks: 2,
    leaves: 3,
    sapling: 4,
    litter: 5,
    variants: 6
};

// Kształt drzewa musi się zmieścić w tylu blokach od pnia w bok
// i w górę (TREE_REACH i TREE_MAX_HEIGHT w src/world/trees/TreeShapes.js).

export const PACK_REACH = 7;

export const PACK_MAX_HEIGHT = 28;

export const PACK_SHAPES = ['szablon', 'kula', 'stozek', 'parasol', 'kolumna'];

// Gatunki gry (do "podobnyDo" - jak drzewo wygląda z daleka).

export const BASE_SPECIES_WORDS = {
    swierk: 'spruce', spruce: 'spruce',
    sosna: 'pine', pine: 'pine',
    buk: 'beech', beech: 'beech',
    lipa: 'linden', linden: 'linden',
    dab: 'oak', oak: 'oak',
    brzoza: 'birch', birch: 'birch'
};

// Nazwy zajęte przez gatunki i bloki gry - paczka nie może się tak
// nazywać, bo jej bloki (<nazwa>_log...) mogłyby udawać bloki gry.

const RESERVED = new Set([
    ...Object.keys(BASE_SPECIES_WORDS),
    'lamp', 'short', 'tall', 'strawberry', 'blackberry', 'chili', 'hazel', 'hazelnut',
    'coarse', 'forest', 'water', 'grass', 'dirt', 'stone', 'sand', 'gravel', 'mud', 'clay',
    'humus', 'granite', 'limestone', 'sandstone', 'slate', 'basalt', 'meteorite', 'lepidolite',
    'axe', 'pickaxe', 'shovel', 'stick', 'resin', 'acorn', 'beechnuts', 'bush', 'tree', 'leaves',
    'fern', 'clover', 'nettle', 'plantain', 'poppy', 'cornflower', 'chamomile', 'dandelion',
    'blueberry', 'snow', 'moss', 'reed', 'heather', 'crocus', 'dune'
]);

// Przedmioty paczki nazywają się <paczka>_<klucz> - te klucze zderzyłyby
// się z nazwami bloków paczki.

const BLOCK_SUFFIXES = new Set(['log', 'log_stripped', 'planks', 'leaves', 'sapling', 'leaf_litter']);

// Kategorie przedmiotów (CATEGORIES w src/items/categories.js).

const ITEM_CATEGORIES = ['owoce', 'narzedzia', 'rosliny', 'ozdoby', 'swiatlo', 'drewno', 'teren', 'skaly'];

// Znaki zajęte w szablonach kształtu (odmiany liści wybierają inne).

const TEMPLATE_CHARS = new Set(['.', ' ', '@', 'P', 'L', 'l']);


export const TREE_PACK_ERRORS = [];


const BASE = new URL('../../assets/drzewa/', import.meta.url);

const NODE = BASE.protocol === 'file:';


async function readText(relative) {

    const url = new URL(relative, BASE);

    if (NODE) {
        const { readFile } = await import('node:fs/promises');
        return readFile(url, 'utf8');
    }

    const response = await fetch(url.href, { cache: 'no-cache' });

    if (!response.ok) {
        throw new Error(`brak pliku ${relative}`);
    }

    return response.text();

}


// Adres pliku z paczki (tekstura do wczytania).

export function packFileUrl(pack, file) {

    return new URL(`${pack.folder}/${file}`, BASE).href;

}


// Nazwa kafelka atlasu dla tekstury z paczki, np. "jablon/liscie.png".

export function packTile(pack, file) {

    return `${pack.id}/${file}`;

}

// ------------------------------------------------------------
// Sprawdzanie drzewo.json
// ------------------------------------------------------------

class PackError extends Error {}


function fail(message) {

    throw new PackError(message);

}


function text(value, what) {

    if (typeof value !== 'string' || value.trim() === '') {
        fail(`brak tekstu "${what}"`);
    }

    return value.trim();

}


function number(value, what, min, max) {

    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail(`"${what}": liczba od ${min} do ${max} (jest ${JSON.stringify(value)})`);
    }

    return value;

}


function range(value, what, min, max) {

    if (!Array.isArray(value) || value.length !== 2) {
        fail(`"${what}": dwie liczby w nawiasie - [od, do]`);
    }

    const [a, b] = value.map((v, i) => number(v, `${what}[${i}]`, min, max));

    if (a > b) {
        fail(`"${what}": pierwsza liczba jest większa niż druga`);
    }

    return [a, b];

}


function png(file, what) {

    if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(file)) {
        fail(`"${what}": nazwa pliku .png z samych liter (bez polskich), cyfr, _ albo - (np. pien_bok.png), jest ${JSON.stringify(file)}`);
    }

    return file;

}


function key(value, what) {

    if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(value)) {
        fail(`"${what}": małe litery (bez polskich), cyfry i _, na początku litera (jest ${JSON.stringify(value)})`);
    }

    return value;

}


// Szablon kształtu (plik .txt): warstwy od dołu, oddzielone pustą
// linią, '#' na początku linii - komentarz. Zwraca komórki [x, y, z,
// znak] względem '@' (podstawa pnia, tam stoi sadzonka).

export function parseTemplate(source, allowed, what) {

    const layers = [];

    let current = [];

    for (const raw of source.replace(/\r/g, '').split('\n')) {

        const line = raw.replace(/\s+$/, '');

        if (line.trimStart().startsWith('#')) {
            continue;
        }

        if (line.trim() === '') {

            if (current.length > 0) {
                layers.push(current);
                current = [];
            }

            continue;

        }

        current.push(line);

    }

    if (current.length > 0) {
        layers.push(current);
    }

    if (layers.length === 0) {
        fail(`${what}: pusty szablon (brak warstw)`);
    }

    if (layers.length > PACK_MAX_HEIGHT + 1) {
        fail(`${what}: ${layers.length} warstw - najwyżej ${PACK_MAX_HEIGHT + 1}`);
    }


    // Środek: '@' w pierwszej (najniższej) warstwie.

    let origin = null;

    layers[0].forEach((row, z) => {

        const x = row.indexOf('@');

        if (x === -1) {
            return;
        }

        if (origin || row.indexOf('@', x + 1) !== -1) {
            fail(`${what}: w pierwszej (najniższej) warstwie ma być dokładnie jedno @`);
        }

        origin = { x, z };

    });

    if (!origin) {
        fail(`${what}: brak @ w pierwszej (najniższej) warstwie - @ to podstawa pnia, w tym miejscu stoi sadzonka`);
    }


    const cells = [];

    layers.forEach((rows, y) => {

        rows.forEach((row, z) => {

            [...row].forEach((char, x) => {

                if (char === '.' || char === ' ') {
                    return;
                }

                const where = `warstwa ${y + 1}, wiersz ${z + 1}, kolumna ${x + 1}`;

                if (char === '@' && y > 0) {
                    fail(`${what}: @ może być tylko w pierwszej warstwie (${where})`);
                }

                if (!allowed.has(char)) {
                    fail(`${what}: nieznany znak "${char}" (${where}) - znaki: P pień, L liście, l liście nie zawsze, . puste, @ podstawa pnia i znaki odmian liści`);
                }

                const dx = x - origin.x;
                const dz = z - origin.z;

                if (Math.abs(dx) > PACK_REACH || Math.abs(dz) > PACK_REACH) {
                    fail(`${what}: drzewo sięga za daleko - najwyżej ${PACK_REACH} kratek od @ w każdą stronę (${where})`);
                }

                cells.push([dx, y, dz, char]);

            });

        });

    });

    return cells;

}


async function validatePack(folder) {

    if (typeof folder !== 'string' || !/^[a-z][a-z0-9]{1,23}$/.test(folder)) {
        fail(`zła nazwa folderu - same małe litery (bez polskich) i cyfry, bez spacji i _, np. jablon`);
    }

    let json;

    try {
        json = JSON.parse(await readText(`${folder}/drzewo.json`));
    }
    catch (error) {
        fail(error instanceof SyntaxError
            ? `drzewo.json ma błąd zapisu (${error.message}) - sprawdź przecinki, cudzysłowy i nawiasy`
            : `brak pliku drzewo.json w folderze`);
    }

    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        fail('drzewo.json: ma być obiekt { ... }');
    }

    if (json.wlaczone === false) {
        return null;
    }

    const id = json.id ?? folder;

    if (id !== folder) {
        fail(`"id" (${id}) musi być takie samo jak nazwa folderu (${folder})`);
    }

    if (RESERVED.has(id)) {
        fail(`nazwa "${id}" jest zajęta przez gatunek albo blok gry - zmień nazwę folderu`);
    }

    if (json.pierwszeId === undefined) {
        fail('brak "pierwszeId" - uruchom node tools/drzewa.mjs (nada wolny numer)');
    }

    const firstId = json.pierwszeId;

    if (!idsInRanges(firstId, PACK_ID_SLOTS, TREE_ID_RANGES)) {
        fail(`"pierwszeId": liczba całkowita ${rangesText(TREE_ID_RANGES, PACK_ID_SLOTS)} - drzewo zajmuje ${PACK_ID_SLOTS} numerów (jest ${JSON.stringify(firstId)}; node tools/drzewa.mjs nada wolny)`);
    }

    const similar = BASE_SPECIES_WORDS[String(json.podobnyDo ?? 'buk').toLowerCase()];

    if (!similar) {
        fail(`"podobnyDo": jeden z gatunków gry - swierk, sosna, buk, lipa, dab, brzoza (jest ${JSON.stringify(json.podobnyDo)})`);
    }


    const textures = new Set();

    const use = (file, what) => {
        textures.add(png(file, what));
        return file;
    };

    const pack = {
        id,
        folder,
        firstId,
        name: typeof json.nazwaAngielska === 'string' && json.nazwaAngielska.trim()
            ? json.nazwaAngielska.trim()
            : id[0].toUpperCase() + id.slice(1),
        species: [text(json.gatunek, 'gatunek'), text(json.gatunekDopelniacz, 'gatunekDopelniacz')],
        short: text(json.krotko, 'krotko'),
        labels: {},
        textures: {},
        variants: [],
        items: {},
        loot: [],
        bark: null,
        growthSeconds: json.czasWzrostu === undefined || json.czasWzrostu === null
            ? null
            : number(json.czasWzrostu, 'czasWzrostu', 5, 36000),
        shape: null,
        climate: null,
        recipes: [],
        similar
    };


    // Bloki.

    const blocks = json.bloki;

    if (!blocks || typeof blocks !== 'object') {
        fail('brak "bloki"');
    }

    for (const part of ['pien', 'okorowany']) {

        const block = blocks[part] ?? fail(`brak bloku "${part}" w "bloki"`);

        pack.labels[part] = text(block.nazwa, `bloki.${part}.nazwa`);
        pack.textures[`${part}_bok`] = use(block.bok, `bloki.${part}.bok`);
        pack.textures[`${part}_gora`] = use(block.gora, `bloki.${part}.gora`);

    }

    for (const part of ['deski', 'liscie', 'sadzonka']) {

        const block = blocks[part] ?? fail(`brak bloku "${part}" w "bloki"`);

        pack.labels[part] = text(block.nazwa, `bloki.${part}.nazwa`);
        pack.textures[part] = use(block.tekstura, `bloki.${part}.tekstura`);

    }

    if (blocks.opadleLiscie) {

        pack.labels.opadleLiscie = text(blocks.opadleLiscie.nazwa, 'bloki.opadleLiscie.nazwa');
        pack.textures.opadleLiscie = use(blocks.opadleLiscie.tekstura, 'bloki.opadleLiscie.tekstura');

    }


    // Przedmioty (np. owoce): w grze nazywają się <paczka>_<klucz>.

    const items = json.przedmioty ?? {};

    if (typeof items !== 'object' || Array.isArray(items) || Object.keys(items).length > PACK_MAX_ITEMS) {
        fail(`"przedmioty": { "klucz": { ... } }, najwyżej ${PACK_MAX_ITEMS}`);
    }

    for (const [itemKey, item] of Object.entries(items)) {

        key(itemKey, `przedmioty: nazwa ${itemKey}`);

        if (BLOCK_SUFFIXES.has(itemKey) || itemKey.startsWith('leaves_')) {
            fail(`przedmioty: nazwa "${itemKey}" jest zajęta przez blok drzewa - wybierz inną (np. owoc, jablko)`);
        }

        if (item?.kategoria !== undefined && !ITEM_CATEGORIES.includes(item.kategoria)) {
            fail(`przedmioty.${itemKey}.kategoria: jedna z ${ITEM_CATEGORIES.join(', ')}`);
        }

        pack.items[itemKey] = {
            type: `${id}_${itemKey}`,
            label: text(item?.nazwa, `przedmioty.${itemKey}.nazwa`),
            texture: use(item.tekstura, `przedmioty.${itemKey}.tekstura`),
            plants: item.sadzi === true,
            category: item.kategoria
        };

    }

    // Odwołanie do rzeczy z paczki: "sadzonka", "liscie" albo przedmiot.

    const ref = (name, what) => {

        if (name === 'sadzonka') return `${id}_sapling`;
        if (name === 'liscie') return `${id}_leaves`;
        if (typeof name === 'string' && Object.hasOwn(pack.items, name)) return pack.items[name].type;

        fail(`"${what}": ${JSON.stringify(name)} - może być "sadzonka", "liscie" albo przedmiot z "przedmioty"`);

    };


    // Odmiany liści (np. z owocami, kwitnące).

    const variants = json.odmianyLisci ?? [];

    if (!Array.isArray(variants) || variants.length > PACK_MAX_VARIANTS) {
        fail(`"odmianyLisci": lista [ ... ], najwyżej ${PACK_MAX_VARIANTS} odmiany`);
    }

    const chars = new Set();

    variants.forEach((variant, i) => {

        const where = `odmianyLisci[${i}]`;

        const variantKey = key(variant?.id, `${where}.id`);

        if (pack.variants.some((other) => other.key === variantKey)) {
            fail(`${where}: dwie odmiany mają to samo "id": ${variantKey}`);
        }

        const char = variant.znak ?? null;

        if (char !== null && (typeof char !== 'string' || char.length !== 1 || TEMPLATE_CHARS.has(char) || chars.has(char))) {
            fail(`${where}.znak: jeden znak, inny niż . @ P L l i znaki innych odmian (np. J)`);
        }

        if (char !== null) {
            chars.add(char);
        }

        const harvest = variant.zbior
            ? {
                item: ref(variant.zbior.przedmiot, `${where}.zbior.przedmiot`),
                count: variant.zbior.ile === undefined ? [1, 1] : range(variant.zbior.ile, `${where}.zbior.ile`, 1, 64)
            }
            : null;

        const regrow = variant.odrasta === undefined || variant.odrasta === null
            ? null
            : number(variant.odrasta, `${where}.odrasta`, 10, 36000);

        if (regrow && !harvest) {
            fail(`${where}: "odrasta" działa tylko razem z "zbior" (odrasta po zebraniu)`);
        }

        pack.variants.push({
            key: variantKey,
            label: text(variant.nazwa, `${where}.nazwa`),
            afterLabel: variant.nazwaPoZbiorze === undefined ? null : text(variant.nazwaPoZbiorze, `${where}.nazwaPoZbiorze`),
            texture: use(variant.tekstura, `${where}.tekstura`),
            char,
            share: variant.udzial === undefined ? 0 : number(variant.udzial, `${where}.udzial`, 0, 1),
            harvest,
            regrow
        });

    });


    // Łupy z liści (przygoda) i kora z okorowania siekierą.

    const loot = json.lupy ?? [['sadzonka', 0.05]];

    if (!Array.isArray(loot)) {
        fail('"lupy": lista [["co", szansa], ...]');
    }

    loot.forEach((entry, i) => {

        if (!Array.isArray(entry) || entry.length !== 2) {
            fail(`lupy[${i}]: ["co", szansa od 0 do 1], np. ["sadzonka", 0.05]`);
        }

        pack.loot.push([ref(entry[0], `lupy[${i}]`), number(entry[1], `lupy[${i}] - szansa`, 0, 1)]);

    });

    if (json.kora !== undefined && json.kora !== null) {
        pack.bark = ref(json.kora, 'kora');
    }


    // Kształt.

    const shape = json.ksztalt;

    if (!shape || !PACK_SHAPES.includes(shape.rodzaj)) {
        fail(`"ksztalt.rodzaj": jeden z: ${PACK_SHAPES.join(', ')}`);
    }

    pack.shape = {
        kind: shape.rodzaj,
        litter: shape.opadleLiscie === undefined ? 0 : number(shape.opadleLiscie, 'ksztalt.opadleLiscie', 0, 1),
        templates: []
    };

    if (pack.shape.litter > 0 && !pack.textures.opadleLiscie) {
        fail('"ksztalt.opadleLiscie" potrzebuje bloku "opadleLiscie" w "bloki"');
    }

    if (shape.rodzaj === 'szablon') {

        const files = shape.pliki;

        if (!Array.isArray(files) || files.length === 0 || files.length > 8) {
            fail('"ksztalt.pliki": lista od 1 do 8 plików .txt z warstwami drzewa (od najmniejszego drzewa do największego)');
        }

        const allowed = new Set([...TEMPLATE_CHARS, ...chars]);

        for (const file of files) {

            if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.txt$/.test(file)) {
                fail(`"ksztalt.pliki": nazwa pliku .txt (jest ${JSON.stringify(file)})`);
            }

            let source;

            try {
                source = await readText(`${folder}/${file}`);
            }
            catch {
                fail(`brak pliku kształtu ${file}`);
            }

            pack.shape.templates.push(parseTemplate(source, allowed, file));

        }

    }
    else {

        pack.shape.trunk = range(shape.wysokoscPnia ?? [4, 6], 'ksztalt.wysokoscPnia', 1, 24);
        pack.shape.radius = range(shape.promienKorony ?? [2, 3], 'ksztalt.promienKorony', 0.5, PACK_REACH);
        pack.shape.crown = range(shape.wysokoscKorony ?? [3, 5], 'ksztalt.wysokoscKorony', 1, 20);
        pack.shape.density = shape.gestosc === undefined ? 0.6 : number(shape.gestosc, 'ksztalt.gestosc', 0, 1);

        if (pack.shape.trunk[1] + pack.shape.crown[1] > PACK_MAX_HEIGHT) {
            fail(`"ksztalt": pień + korona razem najwyżej ${PACK_MAX_HEIGHT} bloków`);
        }

    }


    // Gdzie rośnie w świecie (teren realistyczny).

    const where = json.gdzieRosnie ?? {};

    pack.climate = {
        chance: where.czestosc === undefined ? 0 : number(where.czestosc, 'gdzieRosnie.czestosc', 0, 1),
        temperature: where.temperatura === undefined ? [-3, 3] : range(where.temperatura, 'gdzieRosnie.temperatura', -3, 3),
        humidity: where.wilgotnosc === undefined ? [-3, 3] : range(where.wilgotnosc, 'gdzieRosnie.wilgotnosc', -3, 3),
        height: where.wysokosc === undefined ? [-128, 128] : range(where.wysokosc, 'gdzieRosnie.wysokosc', -128, 128),
        biomes: null
    };

    // Biomy (src/world/terrain/Biomes.js), w których rośnie - bez tego
    // pola we wszystkich (gdzie pasuje klimat i rośnie las).

    if (where.biomy !== undefined) {

        if (!Array.isArray(where.biomy) || where.biomy.length === 0) {
            fail(`"gdzieRosnie.biomy": lista biomów, np. ["mokradla", "laka"] - do wyboru: ${LAND_BIOMES.map((key) => BIOMES[key].words[0]).join(', ')}`);
        }

        pack.climate.biomes = new Set(where.biomy.map((word) => {

            const key = biomeByWord(word);

            if (!key || BIOMES[key].water) {
                fail(`"gdzieRosnie.biomy": nieznany biom "${word}" - do wyboru: ${LAND_BIOMES.map((k) => BIOMES[k].words[0]).join(', ')}`);
            }

            return key;

        }));

    }


    // Przepisy (sprawdza je dopiero recipes.js - tam są wszystkie nazwy).

    if (json.przepisy !== undefined && !Array.isArray(json.przepisy)) {
        fail('"przepisy": lista [ { ... }, ... ]');
    }

    pack.recipes = json.przepisy ?? [];


    pack.files = [...textures];


    // W Node (narzędzia, testy) od razu sprawdzamy pliki tekstur;
    // w grze zrobi to atlas przy wczytywaniu.

    if (NODE) {

        const { readFile } = await import('node:fs/promises');

        for (const file of pack.files) {

            let data;

            try {
                data = await readFile(new URL(`${folder}/${file}`, BASE));
            }
            catch {
                fail(`brak pliku tekstury ${file}`);
            }

            // Nagłówek PNG: szerokość i wysokość w bajtach 16-23.

            if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') {
                fail(`${file} to nie jest obrazek PNG`);
            }

            const width = data.readUInt32BE(16);
            const height = data.readUInt32BE(20);

            if (width !== 16 || height !== 16) {
                fail(`${file}: tekstura musi mieć 16 x 16 pikseli (ma ${width} x ${height})`);
            }

        }

    }

    return pack;

}


// Wszystkie paczki z lista.json (w tej kolejności). Numery bloków
// paczek nie mogą na siebie zachodzić.

async function loadPacks() {

    let list;

    // Narzędzia w Node mogą podać listę same (tools/drzewa.mjs --sprawdz
    // sprawdza paczki, zanim trafią do lista.json).

    const override = NODE ? globalThis.process?.env?.DRZEWA_LISTA : undefined;

    try {
        list = JSON.parse(override ?? await readText('lista.json'));
    }
    catch (error) {

        if (error instanceof SyntaxError) {
            TREE_PACK_ERRORS.push(`assets/drzewa/lista.json ma błąd zapisu (${error.message})`);
        }

        return [];

    }

    if (!Array.isArray(list)) {
        TREE_PACK_ERRORS.push('assets/drzewa/lista.json: ma być lista nazw folderów, np. ["jablon"]');
        return [];
    }

    const packs = [];

    for (const folder of list) {

        try {

            const pack = await validatePack(folder);

            if (!pack) {
                continue;
            }

            const clash = packs.find((other) =>
                other.id === pack.id ||
                Math.abs(other.firstId - pack.firstId) < PACK_ID_SLOTS
            );

            if (clash) {
                fail(clash.id === pack.id
                    ? 'ten folder jest na liście dwa razy'
                    : `"pierwszeId" ${pack.firstId} zachodzi na numery drzewa "${clash.id}" (${clash.firstId}-${clash.firstId + PACK_ID_SLOTS - 1}) - każde drzewo zajmuje ${PACK_ID_SLOTS} numerów (node tools/drzewa.mjs nada wolny)`);
            }

            packs.push(pack);

        }

        catch (error) {

            const message = `Drzewo "${folder}": ${error.message}`;

            TREE_PACK_ERRORS.push(message);

            if (!(error instanceof PackError)) {
                console.error(error);
            }

            console.warn(message);

        }

    }

    return packs;

}


export const TREE_PACKS = await loadPacks();


// Wszystkie tekstury z paczek: nazwa kafelka -> { pack, file, url }
// (TextureAtlas.js dokłada je do atlasu, wiki - do ikonek).

export const PACK_TEXTURES = {};

for (const pack of TREE_PACKS) {

    for (const file of pack.files) {
        PACK_TEXTURES[packTile(pack, file)] = { pack: pack.folder, file, url: packFileUrl(pack, file) };
    }

}


// Paczka po nazwie gatunku (albo null - gatunek gry).

export function getTreePack(species) {

    return TREE_PACKS.find((pack) => pack.id === species) ?? null;

}
