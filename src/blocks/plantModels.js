import { PLANT_PACKS, plantStageType, parseTuftModel } from './plantPacks.js';
import { PLANE_FLOWERS, PLANE_LEAF_LAYOUTS } from '../rendering/PlaneModelGeometry.js';

// ------------------------------------------------------------
// POZIOMY MODELI ROŚLIN (Ustawienia -> Modele -> Modele roślin)
//
// Roślina może mieć trzy wersje wyglądu, każdą z własną teksturą
// w siatce 16 x 16:
//   'simple'   - Proste: obrazek na skrzyżowanych płaszczyznach (jak
//                pokrzywa, koniczyna),
//   'semi'     - Półrealistyczne: model z małych płaskich kart - liście,
//                płatki i kwiaty pod różnymi kątami
//                (src/rendering/PlaneModelGeometry.js),
//   'detailed' - Szczegółowe: model z pikseli ("kepka" - TuftGeometry.js).
// Gracz wybiera jeden poziom dla wszystkich roślin. Gdy roślina nie ma
// wybranej wersji, dostaje najbliższą, którą ma (najpierw prostszą).
//
// Opisy: assets/models/rosliny/<roślina>/model.json (lista.json -
// kolejność), tekstury - tools/modele_roslin.py. Bloki ani zapisy
// światów się nie zmieniają - tylko wygląd (BlockRenderData,
// PlantModelLevels.js). Opis: docs/modele-roslin.md.
// ------------------------------------------------------------

export const PLANT_MODEL_LEVELS = ['simple', 'semi', 'detailed'];

export const PLANT_MODEL_ERRORS = [];

const BASE = new URL('../../assets/models/rosliny/', import.meta.url);

const NODE = BASE.protocol === 'file:';

async function readText(relative) {

    const url = new URL(relative, BASE);

    if (NODE) {
        const fs = await import('node:fs/promises');
        return fs.readFile(url, 'utf8');
    }

    const response = await fetch(url.href, { cache: 'no-cache' });

    if (!response.ok) {
        throw new Error(`brak pliku ${relative}`);
    }

    return response.text();

}

function fail(message) {
    throw new Error(message);
}

function pixels(value, what, min, max) {

    if (value === undefined) return undefined;

    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail(`"${what}": liczba od ${min} do ${max} (jest ${JSON.stringify(value)})`);
    }

    return value;

}


// "polrealistyczny" - kształt z płaszczyzn (PlaneModelGeometry.js).

function parseSemi(spec, what) {

    if (spec === null || typeof spec !== 'object') {
        fail(`"${what}": { "lodygi", "liscie", "kwiat" } albo null`);
    }

    const stems = spec.lodygi ?? null;
    const leaves = spec.liscie ?? null;
    const flower = spec.kwiat ?? null;

    if (!stems && !leaves) {
        fail(`"${what}": potrzebne "lodygi" albo "liscie"`);
    }

    if (flower && !PLANE_FLOWERS.includes(flower.rodzaj)) {
        fail(`"${what}.kwiat.rodzaj": ${PLANE_FLOWERS.join(', ')}`);
    }

    if (flower && !stems && !(flower.rodzaj === 'owoce' && leaves?.uklad === 'kopula')) {
        fail(`"${what}.kwiat": kwiat potrzebuje "lodygi" (owoce - liści w kopułce)`);
    }

    if (leaves?.uklad !== undefined && !PLANE_LEAF_LAYOUTS.includes(leaves.uklad)) {
        fail(`"${what}.liscie.uklad": ${PLANE_LEAF_LAYOUTS.join(', ')}`);
    }

    return {
        lodygi: stems && {
            ile: pixels(stems.ile ?? 1, `${what}.lodygi.ile`, 1, 12),
            wysokosc: pixels(stems.wysokosc ?? 8, `${what}.lodygi.wysokosc`, 2, 32),
            promien: pixels(stems.promien ?? 2, `${what}.lodygi.promien`, 0, 8),
            pochylenie: pixels(stems.pochylenie ?? 6, `${what}.lodygi.pochylenie`, 0, 45)
        },
        liscie: leaves && {
            uklad: leaves.uklad ?? 'wokol',
            ile: pixels(leaves.ile ?? 4, `${what}.liscie.ile`, 0, 24),
            dlugosc: pixels(leaves.dlugosc ?? 6, `${what}.liscie.dlugosc`, 2, 24),
            promien: pixels(leaves.promien ?? 4, `${what}.liscie.promien`, 0, 12),
            kopula: pixels(leaves.kopula ?? 8, `${what}.liscie.kopula`, 2, 28),
            pien: leaves.pien === true,
            wysokosc: pixels(leaves.wysokosc ?? 0, `${what}.liscie.wysokosc`, 0, 12),
            nachylenie: pixels(leaves.nachylenie ?? 50, `${what}.liscie.nachylenie`, 0, 85)
        },
        kwiat: flower && {
            rodzaj: flower.rodzaj,
            rozmiar: pixels(flower.rozmiar ?? 6, `${what}.kwiat.rozmiar`, 2, 12),
            ile: pixels(flower.ile ?? 4, `${what}.kwiat.ile`, 1, 16)
        }
    };

}


function parseSimple(id, value, what) {

    if (value === null || value === undefined) return null;

    if (typeof value === 'string') {
        return { texture: textureName(id, png(value, what)), file: value, size: 16 };
    }

    if (typeof value === 'object' && typeof value.kafelek === 'string') {
        return { texture: value.kafelek, file: null, size: pixels(value.rozmiar ?? 16, `${what}.rozmiar`, 4, 48) };
    }

    if (typeof value === 'object' && typeof value.plik === 'string') {
        return { texture: textureName(id, png(value.plik, `${what}.plik`)), file: value.plik, size: pixels(value.rozmiar ?? 16, `${what}.rozmiar`, 4, 48) };
    }

    fail(`"${what}": "plik.png", { "plik", "rozmiar" }, { "kafelek" } albo null`);

}


function textureName(id, file) {
    return `models/rosliny/${id}/${file.replace(/\.png$/, '')}`;
}

function png(file, what) {

    if (typeof file !== 'string' || !/^[a-z0-9_-]+\.png$/.test(file)) {
        fail(`"${what}": nazwa pliku .png (małe litery, cyfry, _ albo -)`);
    }

    return file;

}


// Jedna roślina: { id, name, stages: [{ type, simple, semi, detailed }] }
//   simple   - { texture, file, size } albo null (null - obrazek bloku
//              z atlasu, jeśli blok go ma); "prosty" w model.json:
//              "plik.png", { "plik": "plik.png", "rozmiar": 30 } (ile
//              pikseli rośliny mieści obrazek 16 x 16) albo
//              { "kafelek": "nazwa" } (kafelek atlasu, np. krzaka),
//   semi     - { spec, texture } albo null,
//   detailed - { tuft } albo null (null - dotychczasowy model bloku, jeśli
//              blok go ma: paczki, krzaki owocowe, rośliny nad wodą).

async function loadModel(id) {

    const json = JSON.parse(await readText(`${id}/model.json`));

    const name = typeof json.nazwa === 'string' ? json.nazwa : id;

    const pack = json.paczka ? PLANT_PACKS.find((p) => p.id === json.paczka) : null;

    if (json.paczka && !pack) {
        fail(`"paczka": nie ma paczki roślin "${json.paczka}"`);
    }

    const types = pack
        ? pack.stages.map((_, index) => plantStageType(pack, index))
        : json.bloki;

    if (!Array.isArray(types) || types.length === 0) {
        fail('"bloki": lista nazw bloków albo "paczka"');
    }

    if (!Array.isArray(json.etapy) || json.etapy.length !== types.length) {
        fail(`"etapy": tyle co bloków (${types.length})`);
    }

    const sheet = 'polrealistyczny.png';

    if (json.kolory !== undefined && (json.kolory === null || typeof json.kolory !== 'object')) {
        fail('"kolory": { "lisc": "#...", ... } (wspólne dla szczegółowych etapów)');
    }

    const stages = json.etapy.map((stage, index) => {

        const what = `etapy[${index}]`;

        return {
            type: types[index],
            simple: parseSimple(id, stage.prosty, `${what}.prosty`),
            semi: stage.polrealistyczny ? { spec: parseSemi(stage.polrealistyczny, `${what}.polrealistyczny`), texture: textureName(id, sheet), file: sheet } : null,
            detailed: stage.szczegolowy
                ? { tuft: parseTuftModel(stage.szczegolowy, `${what}.szczegolowy`, `modele:${id}:${index}`, json.kolory ?? {}) }
                : null
        };

    });

    return { id, name, folder: id, stages };

}


async function loadModels() {

    let list;

    try {
        list = JSON.parse(await readText('lista.json'));
    }
    catch (error) {
        PLANT_MODEL_ERRORS.push(`Modele roślin: ${error.message}`);
        return [];
    }

    const models = [];

    for (const id of list) {

        try {
            models.push(await loadModel(id));
        }
        catch (error) {
            PLANT_MODEL_ERRORS.push(`Model rośliny "${id}": ${error.message}`);
        }

    }

    return models;

}


export const PLANT_MODELS = await loadModels();


// Tekstury do atlasu: nazwa kafelka -> adres pliku (16 x 16).

export const PLANT_MODEL_TEXTURES = {};

for (const model of PLANT_MODELS) {

    for (const stage of model.stages) {

        for (const level of [stage.simple, stage.semi]) {
            if (level?.file) {
                PLANT_MODEL_TEXTURES[level.texture] = new URL(`${model.folder}/${level.file}`, BASE).href;
            }
        }

    }

}


// Który poziom dostaje etap rośliny przy wybranym poziomie: wybrany, a gdy
// go nie ma - najbliższy (przy równej odległości - prostszy).
// block - co blok ma sam: { sprite (obrazek z atlasu), model (model bloku) }.

export function resolvePlantModel(stage, level, block = {}) {

    const has = {
        simple: Boolean(stage.simple) || Boolean(block.sprite),
        semi: Boolean(stage.semi),
        detailed: Boolean(stage.detailed) || Boolean(block.model)
    };

    const wanted = Math.max(0, PLANT_MODEL_LEVELS.indexOf(level));

    for (const distance of [0, 1, 2]) {
        for (const index of [wanted - distance, wanted + distance]) {
            const name = PLANT_MODEL_LEVELS[index];
            if (name && has[name]) return name;
        }
    }

    return 'simple';

}
