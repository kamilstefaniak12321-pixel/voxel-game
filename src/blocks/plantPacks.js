// ------------------------------------------------------------
// PACZKI ROŚLIN - nowe rośliny bez pisania kodu
//
// Każdy folder w assets/rosliny/ wymieniony w assets/rosliny/lista.json
// to jedna roślina:
//   roslina.json - nazwy, etapy wzrostu, przedmiot ze zbioru, gdzie rośnie,
//   *.png        - etapy wzrostu i przedmiot.
//
// Skala: 16 pikseli tekstury na blok (blok = 1 m, gracz = 1.8 m), więc
// rozmiar obrazka etapu to rozmiar rośliny w świecie: amarantus 26 x 32
// pikseli ma 1.6 bloku szerokości i 2 bloki wysokości. Roślina większa
// niż blok to te same skrzyżowane płaszczyzny co trawa, tylko większe
// (wystają nad swoją komórkę i trochę w bok). Przedmiot ma 16 x 16.
// Tekstury robi z dużego atlasu "pixel art" tools/rosliny_z_atlasu.py.
//
// Instrukcja i rozmiary roślin: docs/rosliny.md.
//
// Ten moduł tylko wczytuje i sprawdza paczki - przy starcie gry (await
// na najwyższym poziomie modułu). Paczka z błędem jest pomijana, a błąd
// trafia do PLANT_PACK_ERRORS (czat po wejściu do świata, /rosliny).
//
// Z paczek korzystają: BlockRegistry.js (bloki etapów), ItemRegistry.js
// (przedmiot), TextureAtlas.js (obrazki w atlasie), Biomes.js (gdzie
// rośnie), recipes.js (grupy składników), gameCommands.js (/rosliny).
// ------------------------------------------------------------

import { TREE_PACKS, PACK_ID_SLOTS, idsInRanges, rangesText } from './treePacks.js';
import { BIOMES, LAND_BIOMES, biomeByWord } from '../world/terrain/Biomes.js';

// Numery bloków: etapy zajmują kolejne numery od "pierwszeId". Zakresy
// (wszystkie: src/blocks/BlockRegistry.js):
//   5000-9999 - od 0.30.0 (numery bloków 2-bajtowe), tylko rośliny,
//   100-239   - dawny zakres, wspólny z paczkami drzew (rośliny od góry,
//               239 w dół - tam jest amarantus).
// Numer zapisuje się w świecie, więc raz użytego nie wolno zmieniać.

export const PLANT_ID_RANGES = [[5000, 9999], [100, 239]];

export const PLANT_MAX_STAGES = 4;

// Piksele tekstury na blok.
export const PLANT_PIXELS = 16;

// Największy obrazek etapu (piksele): 4 x 4 bloki.
export const PLANT_MAX_SIZE = 64;

// Grupy składników przepisów (GROUPS w src/crafting/recipes.js), do
// których może należeć przedmiot rośliny.
export const PLANT_GROUPS = ['red', 'green', 'blue', 'purple'];

const ITEM_CATEGORIES = ['owoce', 'rosliny', 'ozdoby'];

export const PLANT_PACK_ERRORS = [];


const BASE = new URL('../../assets/rosliny/', import.meta.url);

const NODE = BASE.protocol === 'file:';


async function readFile(relative, binary = false) {

    const url = new URL(relative, BASE);

    if (NODE) {
        const fs = await import('node:fs/promises');
        return binary ? new Uint8Array(await fs.readFile(url)) : fs.readFile(url, 'utf8');
    }

    const response = await fetch(url.href, { cache: 'no-cache' });

    if (!response.ok) {
        throw new Error(`brak pliku ${relative}`);
    }

    return binary ? new Uint8Array(await response.arrayBuffer()) : response.text();

}


export function plantFileUrl(pack, file) {

    return new URL(`${pack.folder}/${file}`, BASE).href;

}


// Nazwa kafelka atlasu, np. "rosliny/amarantus/etap3.png".

export function plantTile(pack, file) {

    return `rosliny/${pack.id}/${file}`;

}


// Rozmiar obrazka PNG z nagłówka (bajty 16-23).

function pngSize(data, file) {

    if (data.length < 24 || String.fromCharCode(data[1], data[2], data[3]) !== 'PNG') {
        fail(`${file} to nie jest obrazek PNG`);
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return [view.getUint32(16), view.getUint32(20)];

}

// ------------------------------------------------------------
// Sprawdzanie roslina.json
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

function png(file, what) {

    if (typeof file !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(file)) {
        fail(`"${what}": nazwa pliku .png z samych liter (bez polskich), cyfr, _ albo - (jest ${JSON.stringify(file)})`);
    }

    return file;

}


// ------------------------------------------------------------
// Model "kepka" (mała roślina z pikseli - src/rendering/TuftGeometry.js)
// ------------------------------------------------------------

export const TUFT_COLOR_NAMES = {
    lisc: 'leaf', liscJasny: 'leafLight', liscCiemny: 'leafDark', lodyga: 'stem',
    kwiat: 'flower', kwiatJasny: 'flowerLight', kwiatCiemny: 'flowerDark', pak: 'bud', srodek: 'center',
    korzen: 'root', korzenJasny: 'rootLight'
};

const TUFT_DEFAULT_COLORS = {
    lisc: '#7f8a55', liscJasny: '#a3ab78', liscCiemny: '#59603a', lodyga: '#6b6338',
    kwiat: '#ddbc79', kwiatJasny: '#ecd59a', kwiatCiemny: '#b08948', pak: '#b9b57e', srodek: '#e8c25a',
    korzen: '#8e3322', korzenJasny: '#c0573c'
};

function hexColor(value, what) {

    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        fail(`"${what}": kolor jak "#ddbc79" (jest ${JSON.stringify(value)})`);
    }

    return parseInt(value.slice(1), 16);

}

// sRGB -> liniowe 0-255 (jak COLORS w src/rendering/RiverPlantGeometry.js).
function linearColor(hex) {

    return [16, 8, 0].map((shift) => {
        const value = ((hex >> shift) & 255) / 255;
        return Math.round((value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * 255);
    });

}

function pixelRange(value, fallback, what, min, max) {

    const range = value ?? fallback;

    if (!Array.isArray(range) || range.length !== 2 || range.some((n) => !Number.isInteger(n) || n < min || n > max) || range[0] > range[1]) {
        fail(`"${what}": [od, do] - liczby całkowite ${min}-${max}`);
    }

    return range;

}

// packColors - "kolory" całej paczki (wspólne dla etapów), etap może
// je zmienić własnymi "kolory".
function parseTuft(model, what, seedText, packColors) {

    if (model === null || typeof model !== 'object' || model.rodzaj !== 'kepka') {
        fail(`"${what}": { "rodzaj": "kepka", ... } (docs/rosliny.md)`);
    }

    const leaves = model.liscie ?? {};
    const stems = model.lodygi ?? {};
    const flower = model.kwiaty ?? null;

    if (flower !== null && (typeof flower !== 'object' || !FLOWER_SIZES[flower.rodzaj])) {
        fail(`"${what}.kwiaty": null albo { "rodzaj": ${Object.keys(FLOWER_SIZES).map((kind) => `"${kind}"`).join(' | ')}, "rozmiar": ... }`);
    }

    const layout = leaves.uklad ?? 'rozeta';

    if (!['rozeta', 'kepa', 'krzak', 'krzew', 'dywan', 'nalot', 'huba', 'brak'].includes(layout)) {
        fail(`"${what}.liscie.uklad": "rozeta" (przy ziemi), "kepa" (stojące liście), "krzak" (kopułka liści), "krzew" (gałęzie z liśćmi, cały blok i więcej), "dywan" (płoży się, łączy z sąsiadami), "nalot" (porost na ścianach), "huba" (półki na pniu) albo "brak"`);
    }

    if (layout === 'nalot' && !['listki', 'galazki', 'kropki'].includes(leaves.wzor)) {
        fail(`"${what}.liscie.wzor": "listki", "galazki" albo "kropki" (porost)`);
    }

    const stemLeaves = stems.liscie;

    if (stemLeaves !== undefined && (stemLeaves === null || typeof stemLeaves !== 'object')) {
        fail(`"${what}.lodygi.liscie": { "co": 1-6, "dlugosc": [od, do] } albo { "okolek": 2-5, "dlugosc": [od, do] }`);
    }

    if (stems.rozchylone !== undefined && typeof stems.rozchylone !== 'boolean') {
        fail(`"${what}.lodygi.rozchylone": true albo false`);
    }

    if (stems.rozgalezione !== undefined && typeof stems.rozgalezione !== 'boolean') {
        fail(`"${what}.lodygi.rozgalezione": true albo false (jedna łodyga ze środka, reszta odchodzi od niej)`);
    }

    if (stemLeaves?.luk !== undefined && typeof stemLeaves.luk !== 'boolean') {
        fail(`"${what}.lodygi.liscie.luk": true albo false (długie liście wygięte w łuk)`);
    }

    const shrub = layout === 'krzew';

    const colors = {};

    for (const [name, key] of Object.entries(TUFT_COLOR_NAMES)) {
        const own = model.kolory?.[name];
        colors[key] = linearColor(hexColor(own ?? packColors?.[name] ?? TUFT_DEFAULT_COLORS[name], own === undefined && packColors?.[name] !== undefined ? `kolory.${name}` : `${what}.kolory.${name}`));
    }

    let seed = 0;

    for (const char of seedText) {
        seed = (Math.imul(seed, 31) + char.charCodeAt(0)) | 0;
    }

    const tuft = {
        leaves: {
            layout,
            count: pixelRange(leaves.ile, [4, 6], `${what}.liscie.ile`, 0, layout === 'kepa' ? 32 : shrub ? 60 : 12),
            length: pixelRange(leaves.dlugosc, [2, 4], `${what}.liscie.dlugosc`, 1, layout === 'kepa' ? 12 : 7),
            radius: leaves.promien === undefined ? 2 : number(leaves.promien, `${what}.liscie.promien`, 0, layout === 'dywan' || layout === 'nalot' ? 8 : shrub ? 12 : 5),
            // Krzew: wysokość gałęzi (korony) w pikselach - do 2 bloków.
            height: shrub ? pixelRange(leaves.wysokosc, [12, 14], `${what}.liscie.wysokosc`, 4, 32) : null,
            pattern: layout === 'nalot' ? leaves.wzor : null,
            edge: leaves.brzeg === undefined ? 2 : number(leaves.brzeg, `${what}.liscie.brzeg`, 1, 4)
        },
        stems: {
            count: pixelRange(stems.ile, [0, 0], `${what}.lodygi.ile`, 0, 12),
            height: pixelRange(stems.wysokosc, [4, 6], `${what}.lodygi.wysokosc`, 1, 24),
            radius: stems.promien === undefined ? 3 : number(stems.promien, `${what}.lodygi.promien`, 0, 6),
            spread: stems.rozchylone === true,
            branching: stems.rozgalezione === true,
            leaves: stemLeaves ? {
                every: stemLeaves.co === undefined ? 2 : number(stemLeaves.co, `${what}.lodygi.liscie.co`, 1, 6),
                length: pixelRange(stemLeaves.dlugosc, [2, 3], `${what}.lodygi.liscie.dlugosc`, 1, stemLeaves.luk ? 12 : 5),
                whorl: stemLeaves.okolek === undefined ? 0 : number(stemLeaves.okolek, `${what}.lodygi.liscie.okolek`, 2, 5),
                opposite: stemLeaves.naprzeciw === true,
                arch: stemLeaves.luk === true
            } : null
        },
        flower: flower && flowerSizes(flower, `${what}.kwiaty`),
        // Czerwone korzenie przy ziemi (marzanna): ile korzeni.
        roots: model.korzenie === undefined ? 0 : number(model.korzenie, `${what}.korzenie`, 0, 8),
        colors,
        seed
    };

    // Dywan (barwinek) łączy się z takimi samymi sąsiadami (ChunkMesher).
    // Porost (nalot) i huba przylegają do ścian - ChunkMesher daje im
    // maskę ścian obok (litych bloków), roślina trzyma się każdej ściany
    // (porost) albo boku pnia (huba).
    if (layout === 'nalot') {
        tuft.coating = true;
    }

    if (layout === 'huba') {
        tuft.bracket = true;
    }

    if (layout === 'dywan') {
        tuft.carpet = true;
        if (tuft.flower && !tuft.flower.count) {
            tuft.flower.count = [2, 3];
        }
        if (tuft.flower && !['gwiazdka', 'pak'].includes(tuft.flower.kind)) {
            fail(`"${what}.kwiaty": na dywanie tylko "gwiazdka" albo "pak"`);
        }
    }

    tuft.height = tuftPixels(tuft);

    // Wystaje poza komórkę (w bok albo w górę) - ChunkMesher daje maskę
    // litych bloków obok (część w nich jest ucinana), model bez obrotu.
    if (tuftWidth(tuft) > PLANT_PIXELS || tuft.height > PLANT_PIXELS) {
        tuft.wide = true;
    }

    return tuft;

}

// Kępka spoza paczki (szczegółowy poziom modelu - src/blocks/plantModels.js):
// to samo sprawdzenie i ten sam wynik co dla etapu paczki; błąd - zwykły
// Error z opisem.
export function parseTuftModel(model, what, seedText, colors = {}) {

    try {
        return parseTuft(model, what, seedText, colors);
    }
    catch (error) {
        throw new Error(error.message);
    }

}

// Rozmiar kępki w pikselach (jak obrazek etapu) - z kształtu w
// src/rendering/TuftGeometry.js: rozeta (liście do "dlugosc" pikseli od
// środka, stojące o 1 wyższe, środek 2) albo kępa (liście do "dlugosc"
// wysokości, w promieniu, odchylone o 3), łodygi z kwiatami (kłos ma
// kwiatki o 1 z boku).

const FLOWER_HEIGHT = { baldach: () => 2, klos: (size) => size, pak: (size) => size, pompon: (size) => size + 2, talerz: (size) => (size > 1 ? 4 : 3), dzwonek: () => 1, warstwy: (size) => size + 1, oset: (size) => size + 2, gwiazdka: () => 1, torebka: (size) => (size > 1 ? 3 : 1), straczki: () => 3, grono: () => 3, kwiatki: () => 3 };
const FLOWER_SIDE = { baldach: (size) => size, klos: (size) => (size >= 3 ? 1 : 0), pak: (size) => size - 1, pompon: (size) => size, talerz: (size) => size, dzwonek: () => 3, warstwy: (size) => size, oset: (size) => size + 1, gwiazdka: (size) => size, torebka: (size) => size - 1, straczki: () => 2, grono: () => 1, kwiatki: () => 3 };

// Kwiaty: rodzaj -> [domyślny rozmiar, najmniejszy, największy];
// "rozmiar" to liczba albo [od, do] (każda łodyga losuje).
const FLOWER_SIZES = { baldach: [1, 1, 2], klos: [3, 1, 6], pak: [1, 1, 2], pompon: [1, 1, 2], talerz: [1, 1, 2], dzwonek: [2, 1, 2], warstwy: [1, 1, 2], oset: [1, 1, 2], gwiazdka: [1, 1, 2], torebka: [2, 1, 2], straczki: [3, 1, 5], grono: [1, 1, 2], kwiatki: [1, 1, 2] };

function flowerSizes(flower, what) {

    const [fallback, min, max] = FLOWER_SIZES[flower.rodzaj];
    const sizes = Array.isArray(flower.rozmiar)
        ? pixelRange(flower.rozmiar, null, `${what}.rozmiar`, min, max)
        : [flower.rozmiar === undefined ? fallback : number(flower.rozmiar, `${what}.rozmiar`, min, max)];

    if (flower.okolki !== undefined && (typeof flower.okolki !== 'boolean' || flower.rodzaj !== 'klos')) {
        fail(`"${what}.okolki": true albo false (tylko kłos)`);
    }

    const result = { kind: flower.rodzaj, sizes: [sizes[0], sizes[sizes.length - 1]], size: sizes[sizes.length - 1] };

    // Ile kwiatów na dywanie (barwinek) - kwiaty leżą na liściach, nie
    // na łodygach.
    if (flower.ile !== undefined) {
        result.count = pixelRange(flower.ile, null, `${what}.ile`, 0, 16);
    }

    if (flower.okolki) {
        result.whorls = true;
    }

    return result;

}

function tuftPixels(tuft) {

    // Dywan: liście na 1-2 pikselach, kwiaty i pąki na trzecim.
    if (tuft.leaves.layout === 'dywan') {
        return tuft.flower ? 3 : 2;
    }

    // Porost i huba: na ścianach całej komórki.
    if (tuft.leaves.layout === 'nalot' || tuft.leaves.layout === 'huba') {
        return 16;
    }

    // Krzew: gałęzie do "wysokosc", nad końcami liść w górę (2) i grono.
    if (tuft.leaves.layout === 'krzew') {
        return tuft.leaves.height[1] + (tuft.flower ? 3 + FLOWER_HEIGHT[tuft.flower.kind](tuft.flower.size) : 3);
    }

    const flower = tuft.flower ? FLOWER_HEIGHT[tuft.flower.kind](tuft.flower.size) : 0;
    const leaves = { kepa: tuft.leaves.length[1], rozeta: tuft.leaves.length[1] + 1, krzak: tuft.leaves.length[1] + 1, brak: 0 }[tuft.leaves.layout];

    return Math.max(leaves, 2, tuft.stems.count[1] > 0 ? tuft.stems.height[1] + flower : 0);

}

function tuftWidth(tuft) {

    // Dywan, porost, huba: cała komórka.
    if (['dywan', 'nalot', 'huba'].includes(tuft.leaves.layout)) {
        return 16;
    }

    // Krzew: zasięg gałęzi i liść na ich końcu.
    if (tuft.leaves.layout === 'krzew') {
        return 2 * (tuft.leaves.radius + tuft.leaves.length[1] + 2);
    }

    const flower = tuft.flower ? (tuft.flower.whorls ? 1 : FLOWER_SIDE[tuft.flower.kind](tuft.flower.size)) : 0;
    const leaves = { kepa: tuft.leaves.radius + 3 + 1, rozeta: tuft.leaves.length[1] + 1, krzak: tuft.leaves.radius + tuft.leaves.edge + 1, brak: 0 }[tuft.leaves.layout];
    const stemLeaf = tuft.stems.leaves ? tuft.stems.leaves.length[1] : 0;

    return 2 * Math.max(leaves, 4, tuft.stems.count[1] > 0 ? tuft.stems.radius + Math.max(flower, stemLeaf) + 1 : 0);

}


async function validatePack(folder) {

    if (typeof folder !== 'string' || !/^[a-z][a-z0-9]{1,23}$/.test(folder)) {
        fail('zła nazwa folderu - same małe litery (bez polskich) i cyfry, np. amarantus');
    }

    let json;

    try {
        json = JSON.parse(await readFile(`${folder}/roslina.json`));
    }
    catch (error) {
        fail(error instanceof SyntaxError
            ? `roslina.json ma błąd zapisu (${error.message}) - sprawdź przecinki, cudzysłowy i nawiasy`
            : 'brak pliku roslina.json w folderze');
    }

    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        fail('roslina.json: ma być obiekt { ... }');
    }

    if (json.wlaczone === false) {
        return null;
    }

    const pack = {
        id: folder,
        folder,
        label: text(json.nazwa, 'nazwa'),
        name: typeof json.nazwaAngielska === 'string' && json.nazwaAngielska.trim()
            ? json.nazwaAngielska.trim()
            : folder[0].toUpperCase() + folder.slice(1),
        about: typeof json.opis === 'string' ? json.opis.trim() : '',
        firstId: 0,
        stages: [],
        growthSeconds: json.czasWzrostu === undefined ? null : number(json.czasWzrostu, 'czasWzrostu', 5, 36000),
        item: null,
        harvest: null,
        ground: null,
        where: null,
        files: []
    };


    // Etapy wzrostu: obrazek, nazwa, ile płaszczyzn.

    if (!Array.isArray(json.etapy) || json.etapy.length === 0 || json.etapy.length > PLANT_MAX_STAGES) {
        fail(`"etapy": lista od 1 do ${PLANT_MAX_STAGES} etapów wzrostu [ { "plik": "etap1.png", "nazwa": "..." }, ... ]`);
    }

    for (const [index, stage] of json.etapy.entries()) {

        const what = `etapy[${index}]`;

        if (stage === null || typeof stage !== 'object') {
            fail(`"${what}": ma być { "plik": ..., "nazwa": ... }`);
        }

        // Etap z obrazkiem (skrzyżowane płaszczyzny w rozmiarze obrazka)
        // albo mała roślina jako model z pikseli ("model": { "rodzaj":
        // "kepka", ... } - src/rendering/TuftGeometry.js), bez obrazka.

        const tuft = stage.model === undefined ? null : parseTuft(stage.model, `${what}.model`, `${folder}:${index}`, json.kolory);

        pack.stages.push({
            file: tuft ? null : png(stage.plik, `${what}.plik`),
            label: text(stage.nazwa, `${what}.nazwa`),
            planes: stage.plaszczyzny === undefined ? 2 : number(stage.plaszczyzny, `${what}.plaszczyzny`, 2, 4),
            tuft,
            width: tuft ? tuftWidth(tuft) : 0,
            height: tuft ? tuftPixels(tuft) : 0
        });

    }


    // Numery bloków.

    if (json.pierwszeId === undefined) {
        fail('brak "pierwszeId" - wolny numer z zakresu 5000-9999 (docs/rosliny.md)');
    }

    const firstId = json.pierwszeId;

    if (!idsInRanges(firstId, pack.stages.length, PLANT_ID_RANGES)) {
        fail(`"pierwszeId": liczba całkowita ${rangesText(PLANT_ID_RANGES, pack.stages.length)} (jest ${JSON.stringify(firstId)}; etapy zajmują kolejne numery)`);
    }

    pack.firstId = firstId;

    const tree = TREE_PACKS.find((other) =>
        firstId <= other.firstId + PACK_ID_SLOTS - 1 && other.firstId <= firstId + pack.stages.length - 1);

    if (tree) {
        fail(`numery ${firstId}-${firstId + pack.stages.length - 1} zachodzą na numery drzewa "${tree.id}" (${tree.firstId}-${tree.firstId + PACK_ID_SLOTS - 1})`);
    }


    // Przedmiot ze zbioru (opcjonalny): owoc, wiecha, bukiet...

    if (json.przedmiot !== undefined) {

        const item = json.przedmiot;

        if (item === null || typeof item !== 'object') {
            fail('"przedmiot": ma być { "klucz": ..., "plik": ..., "nazwa": ... }');
        }

        if (typeof item.klucz !== 'string' || !/^[a-z][a-z0-9]{0,23}$/.test(item.klucz)) {
            fail('"przedmiot.klucz": małe litery (bez polskich) i cyfry, np. wiecha');
        }

        const category = item.kategoria ?? 'rosliny';

        if (!ITEM_CATEGORIES.includes(category)) {
            fail(`"przedmiot.kategoria": jedna z ${ITEM_CATEGORIES.join(', ')}`);
        }

        const groups = item.grupy ?? [];

        if (!Array.isArray(groups) || groups.some((group) => !PLANT_GROUPS.includes(group))) {
            fail(`"przedmiot.grupy": lista grup składników (${PLANT_GROUPS.join(', ')}), np. ["red"]`);
        }

        pack.item = {
            type: `${folder}_${item.klucz}`,
            file: png(item.plik, 'przedmiot.plik'),
            label: text(item.nazwa, 'przedmiot.nazwa'),
            name: typeof item.nazwaAngielska === 'string' && item.nazwaAngielska.trim() ? item.nazwaAngielska.trim() : text(item.nazwa, 'przedmiot.nazwa'),
            category,
            groups
        };

    }


    // Zbiór (PPM na ostatnim etapie): ile przedmiotów i do którego etapu
    // roślina wraca.

    if (json.zbior !== undefined) {

        if (!pack.item) {
            fail('"zbior" bez "przedmiot" - co ma się zbierać?');
        }

        const harvest = json.zbior;

        const count = harvest.ile ?? [1, 1];

        if (!Array.isArray(count) || count.length !== 2 || count.some((n) => !Number.isInteger(n) || n < 1 || n > 16) || count[0] > count[1]) {
            fail('"zbior.ile": [najmniej, najwięcej], liczby 1-16');
        }

        const back = harvest.wraca ?? 1;

        if (!Number.isInteger(back) || back < 1 || back >= pack.stages.length) {
            fail(`"zbior.wraca": numer etapu od 1 do ${pack.stages.length - 1}, do którego roślina wraca po zbiorze`);
        }

        pack.harvest = { count, back: back - 1 };

    }


    // Na czym rośnie oprócz ziemi.

    if (json.podloze !== undefined) {

        if (!Array.isArray(json.podloze) || json.podloze.some((type) => typeof type !== 'string')) {
            fail('"podloze": lista bloków (poza ziemią), np. ["sand"]');
        }

        pack.ground = json.podloze;

    }


    // Gdzie rośnie w świecie (teren realistyczny): biomy, plamy.

    if (json.gdzieRosnie !== undefined) {

        const where = json.gdzieRosnie;

        // "biomy": lista (wszędzie tak samo często) albo { biom: waga } -
        // waga 1 to główny biom rośliny, mniej - rośnie tam rzadziej
        // (mniej plam), np. { "hala": 1, "laka": 0.3 }.

        const list = Array.isArray(where.biomy)
            ? where.biomy.map((word) => [word, 1])
            : where.biomy !== null && typeof where.biomy === 'object' ? Object.entries(where.biomy) : [];

        if (list.length === 0) {
            fail(`"gdzieRosnie.biomy": lista biomów albo { "biom": waga } - do wyboru: ${LAND_BIOMES.map((key) => BIOMES[key].words[0]).join(', ')}`);
        }

        const weights = {};

        const biomes = list.map(([word, weight]) => {

            const key = biomeByWord(word);

            if (!key || BIOMES[key].water) {
                fail(`"gdzieRosnie.biomy": nieznany biom "${word}" - do wyboru: ${LAND_BIOMES.map((k) => BIOMES[k].words[0]).join(', ')}`);
            }

            weights[key] = number(weight, `gdzieRosnie.biomy.${word}`, 0.05, 1);

            return key;

        });

        const stages = where.etapy ?? pack.stages.map((_, i) => i === pack.stages.length - 1 ? 0.6 : 0.4 / Math.max(1, pack.stages.length - 1));

        if (!Array.isArray(stages) || stages.length !== pack.stages.length || stages.some((n) => typeof n !== 'number' || n < 0)) {
            fail(`"gdzieRosnie.etapy": ${pack.stages.length} liczb - jak często który etap (np. [0.2, 0.3, 0.5])`);
        }

        const sum = stages.reduce((a, b) => a + b, 0);

        if (sum <= 0) {
            fail('"gdzieRosnie.etapy": choć jeden etap musi mieć więcej niż 0');
        }

        // plamy - jaka część biomu jest w plamach z tą rośliną (0-1),
        // gestosc - jak gęsto rośnie w plamie (0-1). Jak "patches"
        // w src/world/terrain/Biomes.js.
        // "na": gdzie rośnie - "ziemia" (domyślnie, z piaskiem przy
        // "podloze": ["sand"]), "kamien" (na wierzchu skał), "pnie" (na
        // bokach pni drzew - porosty, huby).
        const on = where.na ?? ['ziemia'];

        if (!Array.isArray(on) || on.length === 0 || on.some((surface) => !['ziemia', 'kamien', 'pnie'].includes(surface))) {
            fail('"gdzieRosnie.na": lista z "ziemia", "kamien", "pnie"');
        }

        pack.where = {
            biomes,
            weights,
            on,
            cover: where.plamy === undefined ? 0.04 : number(where.plamy, 'gdzieRosnie.plamy', 0.001, 0.9),
            density: where.gestosc === undefined ? 0.12 : number(where.gestosc, 'gdzieRosnie.gestosc', 0, 1),
            stages: stages.map((n) => n / sum)
        };

    }


    // Obrazki: rozmiary z nagłówków PNG (rozmiar obrazka = rozmiar rośliny).

    for (const [index, stage] of pack.stages.entries()) {

        if (stage.tuft) {
            continue;
        }

        let data;

        try {
            data = await readFile(`${folder}/${stage.file}`, true);
        }
        catch {
            fail(`brak obrazka ${stage.file}`);
        }

        const [width, height] = pngSize(data, stage.file);

        if (width < 1 || height < 1 || width > PLANT_MAX_SIZE || height > PLANT_MAX_SIZE) {
            fail(`etapy[${index}]: ${stage.file} ma ${width} x ${height} pikseli - najwyżej ${PLANT_MAX_SIZE} x ${PLANT_MAX_SIZE} (${PLANT_MAX_SIZE / PLANT_PIXELS} x ${PLANT_MAX_SIZE / PLANT_PIXELS} bloki)`);
        }

        stage.width = width;
        stage.height = height;

    }

    if (pack.item) {

        let data;

        try {
            data = await readFile(`${folder}/${pack.item.file}`, true);
        }
        catch {
            fail(`brak obrazka ${pack.item.file}`);
        }

        const [width, height] = pngSize(data, pack.item.file);

        if (width !== 16 || height !== 16) {
            fail(`${pack.item.file}: przedmiot ma mieć 16 x 16 pikseli (ma ${width} x ${height})`);
        }

    }

    pack.files = [...new Set([...pack.stages.filter((stage) => stage.file).map((stage) => stage.file), ...(pack.item ? [pack.item.file] : [])])];

    return pack;

}


async function loadPacks() {

    let list;

    // Testy w Node mogą podać listę same (tools/sprawdz_rosliny.mjs).
    const override = NODE ? globalThis.process?.env?.ROSLINY_LISTA : undefined;

    try {
        list = JSON.parse(override ?? await readFile('lista.json'));
    }
    catch (error) {

        if (error instanceof SyntaxError) {
            PLANT_PACK_ERRORS.push(`assets/rosliny/lista.json ma błąd zapisu (${error.message})`);
        }

        return [];

    }

    if (!Array.isArray(list)) {
        PLANT_PACK_ERRORS.push('assets/rosliny/lista.json: ma być lista nazw folderów, np. ["amarantus"]');
        return [];
    }

    const packs = [];

    for (const folder of list) {

        try {

            const pack = await validatePack(folder);

            if (!pack) {
                continue;
            }

            const last = pack.firstId + pack.stages.length - 1;

            const clash = packs.find((other) =>
                other.id === pack.id ||
                (pack.firstId <= other.firstId + other.stages.length - 1 && other.firstId <= last));

            if (clash) {
                fail(clash.id === pack.id
                    ? 'ten folder jest na liście dwa razy'
                    : `numery ${pack.firstId}-${last} zachodzą na numery rośliny "${clash.id}"`);
            }

            packs.push(pack);

        }
        catch (error) {

            const message = `Roślina "${folder}": ${error.message}`;

            PLANT_PACK_ERRORS.push(message);

            if (!(error instanceof PackError)) {
                console.error(error);
            }

            console.warn(message);

        }

    }

    return packs;

}


export const PLANT_PACKS = await loadPacks();


// Nazwy bloków etapów: <roslina>_etap1, <roslina>_etap2...

export function plantStageType(pack, stage) {

    return `${pack.id}_etap${stage + 1}`;

}


// Obrazki do atlasu: nazwa kafelka -> { pack, file, url, width, height }
// (width, height w pikselach; w atlasie zajmują całe kafelki 16 x 16,
// obrazek stoi na dole, na środku).

export const PLANT_TEXTURES = {};

for (const pack of PLANT_PACKS) {

    for (const stage of pack.stages.filter((stage) => stage.file)) {
        PLANT_TEXTURES[plantTile(pack, stage.file)] = {
            pack: pack.id, file: stage.file, url: plantFileUrl(pack, stage.file),
            width: stage.width, height: stage.height
        };
    }

    if (pack.item) {
        PLANT_TEXTURES[plantTile(pack, pack.item.file)] = {
            pack: pack.id, file: pack.item.file, url: plantFileUrl(pack, pack.item.file),
            width: 16, height: 16
        };
    }

}


export function getPlantPack(id) {

    return PLANT_PACKS.find((pack) => pack.id === id) ?? null;

}
