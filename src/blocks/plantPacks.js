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

        pack.stages.push({
            file: png(stage.plik, `${what}.plik`),
            label: text(stage.nazwa, `${what}.nazwa`),
            planes: stage.plaszczyzny === undefined ? 2 : number(stage.plaszczyzny, `${what}.plaszczyzny`, 2, 4),
            width: 0,
            height: 0
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

        if (!Array.isArray(where.biomy) || where.biomy.length === 0) {
            fail(`"gdzieRosnie.biomy": lista biomów - do wyboru: ${LAND_BIOMES.map((key) => BIOMES[key].words[0]).join(', ')}`);
        }

        const biomes = where.biomy.map((word) => {

            const key = biomeByWord(word);

            if (!key || BIOMES[key].water) {
                fail(`"gdzieRosnie.biomy": nieznany biom "${word}" - do wyboru: ${LAND_BIOMES.map((k) => BIOMES[k].words[0]).join(', ')}`);
            }

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
        pack.where = {
            biomes,
            cover: where.plamy === undefined ? 0.04 : number(where.plamy, 'gdzieRosnie.plamy', 0.001, 0.9),
            density: where.gestosc === undefined ? 0.12 : number(where.gestosc, 'gdzieRosnie.gestosc', 0, 1),
            stages: stages.map((n) => n / sum)
        };

    }


    // Obrazki: rozmiary z nagłówków PNG (rozmiar obrazka = rozmiar rośliny).

    for (const [index, stage] of pack.stages.entries()) {

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

    pack.files = [...new Set([...pack.stages.map((stage) => stage.file), ...(pack.item ? [pack.item.file] : [])])];

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

    for (const stage of pack.stages) {
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
