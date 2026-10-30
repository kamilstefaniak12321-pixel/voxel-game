// ------------------------------------------------------------
// DRZEWA Z PACZEK - porządki i sprawdzanie (assets/drzewa/)
//
//   node tools/drzewa.mjs
//       dopisuje nowe foldery z assets/drzewa/ do lista.json (i usuwa
//       z niej foldery, których już nie ma), nadaje wolne "pierwszeId"
//       nowym drzewom, które go nie mają albo mają zajęte, i sprawdza
//       wszystkie paczki - tak samo jak gra przy starcie, a do tego
//       buduje z każdej kilka drzew na próbę.
//
//   node tools/drzewa.mjs --sprawdz
//       tylko sprawdza (niczego nie zapisuje).
//
//   node tools/drzewa.mjs pokaz <drzewo> [rozmiar 0-100] [seed]
//       rysuje w konsoli warstwy jednego drzewa (od dołu do góry), tak
//       jak wyrośnie w grze.
//
// Kończy się kodem 1, gdy któraś paczka ma błąd - akcja na GitHubie
// (.github/workflows/drzewa.yml) świeci wtedy na czerwono, a błędy widać
// na stronie przebiegu. Instrukcja: docs/drzewa-paczki.md.
// ------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DIR = path.join(ROOT, 'assets', 'drzewa');

const LIST = path.join(DIR, 'lista.json');

const src = (file) => new URL(`../src/${file}`, import.meta.url).href;

const args = process.argv.slice(2);

// Bez ostrzeżeń Node o modułach (pliki gry są modułami bez "type" w
// package.json) - tylko wynik sprawdzania.
process.removeAllListeners('warning');

const GITHUB = Boolean(process.env.GITHUB_ACTIONS);


// Te same liczby co w src/blocks/treePacks.js (moduł wczytuje paczki od
// razu przy imporcie, więc najpierw porządkujemy listę, a dopiero potem
// go wczytujemy).

const RANGES = [[100, 239], [1000, 4999]];
const SLOTS = 10;


function readJson(file) {

    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }

}


// Foldery z plikiem drzewo.json.

function packFolders() {

    if (!existsSync(DIR)) {
        return [];
    }

    return readdirSync(DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(path.join(DIR, entry.name, 'drzewo.json')))
        .map((entry) => entry.name)
        .sort();

}


// Nowa lista: foldery z lista.json (w tej samej kolejności), które
// jeszcze są, a na końcu nowe (alfabetycznie).

function buildList() {

    const folders = packFolders();

    const old = readJson(LIST);

    const kept = Array.isArray(old) ? old.filter((name, i) => folders.includes(name) && old.indexOf(name) === i) : [];

    const added = folders.filter((name) => !kept.includes(name));

    const removed = Array.isArray(old) ? old.filter((name) => !folders.includes(name)) : [];

    return { list: [...kept, ...added], added, removed, old: Array.isArray(old) ? old : null };

}


// Numery bloków paczek roślin: [[pierwszy, ostatni], ...].

function plantRanges() {

    const dir = path.join(DIR, '..', 'rosliny');

    const list = readJson(path.join(dir, 'lista.json'));

    if (!Array.isArray(list)) {
        return [];
    }

    return list.map((folder) => readJson(path.join(dir, String(folder), 'roslina.json')))
        .filter((json) => json && Number.isInteger(json.pierwszeId) && Array.isArray(json.etapy))
        .map((json) => [json.pierwszeId, json.pierwszeId + json.etapy.length - 1]);

}


// Wolne "pierwszeId" dla nowych drzew (najmniejsza wolna dziesiątka).

function assignIds(list, added, write) {

    const used = [];

    const changes = [];

    // Numery zajęte przez paczki roślin (assets/rosliny/ - od góry zakresu).
    const plants = plantRanges();

    const overlaps = (id) => used.some((other) => Math.abs(other - id) < SLOTS) ||
        plants.some(([first, last]) => id <= last && first <= id + SLOTS - 1);

    const valid = (id) => Number.isInteger(id) && RANGES.some(([from, to]) => id >= from && id + SLOTS - 1 <= to);

    for (const folder of list) {

        const file = path.join(DIR, folder, 'drzewo.json');

        const json = readJson(file);

        if (!json) {
            continue;
        }

        const id = json.pierwszeId;

        if (valid(id) && !overlaps(id)) {
            used.push(id);
            continue;
        }

        // Drzewo, które już było na liście, zachowuje numer (zmiana
        // zepsułaby zapisane światy) - błąd zgłosi sprawdzanie.

        if (!added.includes(folder) && id !== undefined) {
            continue;
        }

        // Najmniejsza wolna dziesiątka: najpierw dawny zakres (100-239),
        // potem nowy (1000-4999).
        let free = null;

        for (const [from, to] of RANGES) {
            for (let id = from; id + SLOTS - 1 <= to && free === null; id += SLOTS) {
                if (!overlaps(id)) {
                    free = id;
                }
            }
        }

        if (free === null) {
            continue;
        }

        used.push(free);

        changes.push(`${folder}: pierwszeId ${id === undefined ? '(brak)' : id} -> ${free}`);

        if (write) {

            const text = readFileSync(file, 'utf8');

            const newline = text.includes('\r\n') ? '\r\n' : '\n';

            const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '    ';

            const updated = /"pierwszeId"\s*:\s*[^,\r\n}]*/.test(text)
                ? text.replace(/"pierwszeId"\s*:\s*[^,\r\n}]*/, `"pierwszeId": ${free}`)
                : text.replace('{', `{${newline}${indent}"pierwszeId": ${free},`);

            writeFileSync(file, updated);

        }

    }

    return changes;

}

// ------------------------------------------------------------
// pokaz <drzewo>
// ------------------------------------------------------------

async function show() {

    const species = args[1];

    const size = args[2] === undefined ? 0.6 : Number(args[2]) / 100;

    const seed = args[3] === undefined ? 12345 : Number(args[3]);

    const { TREE_SPECIES } = await import(src('blocks/trees.js'));

    const { buildTree } = await import(src('world/trees/TreeShapes.js'));

    if (!species || !Object.hasOwn(TREE_SPECIES, species)) {
        console.log(`Podaj drzewo: ${Object.keys(TREE_SPECIES).join(', ')}`);
        process.exit(1);
    }

    const tree = buildTree(species, seed, size);

    const pack = TREE_SPECIES[species].pack;

    const chars = new Map([[`${species}_log`, 'P'], [`${species}_leaves`, 'L']]);

    for (const variant of pack?.variants ?? []) {
        chars.set(`${species}_leaves_${variant.key}`, variant.char ?? variant.key[0].toUpperCase());
    }

    let reach = 1;

    for (const [x, , z] of tree.blocks) {
        reach = Math.max(reach, Math.abs(x), Math.abs(z));
    }

    console.log(`${TREE_SPECIES[species].species[0]} - rozmiar ${Math.round(size * 100)}, seed ${seed}: ` +
        `${tree.top + 1} bloków wysokości, ${tree.blocks.length} bloków, opadłe liście: ${tree.litter.length}`);
    console.log('P - pień, L - liście, inne litery - odmiany liści, @ - podstawa pnia. Od dołu do góry:\n');

    for (let y = 0; y <= tree.top; y++) {

        const grid = Array.from({ length: reach * 2 + 1 }, () => Array(reach * 2 + 1).fill('.'));

        for (const [x, by, z, type] of tree.blocks) {

            if (by === y) {
                grid[z + reach][x + reach] = x === 0 && y === 0 && z === 0 ? '@' : chars.get(type) ?? '?';
            }

        }

        console.log(`warstwa ${y + 1}`);
        console.log(grid.map((row) => row.join('')).join('\n'));
        console.log('');

    }

}

// ------------------------------------------------------------
// Porządki i sprawdzanie
// ------------------------------------------------------------

async function check() {

    const write = !args.includes('--sprawdz');

    const { list, added, removed, old } = buildList();

    const changes = assignIds(list, added, write);

    const listChanged = JSON.stringify(old) !== JSON.stringify(list);

    if (write && listChanged) {
        writeFileSync(LIST, `${JSON.stringify(list, null, 4)}\n`);
    }


    // Gra przy starcie: paczki, bloki, przedmioty, kategorie, przepisy.

    process.env.DRZEWA_LISTA = JSON.stringify(list);

    const errors = [];

    let packs = [];

    // Błędy paczek wypisujemy niżej sami (bez ostrzeżeń z modułu gry).

    const warn = console.warn;

    console.warn = () => {};

    try {

        const P = await import(src('blocks/treePacks.js'));

        await import(src('blocks/BlockRegistry.js'));
        await import(src('items/ItemRegistry.js'));
        await import(src('items/categories.js'));
        await import(src('crafting/Crafting.js'));
        await import(src('achievements/list.js'));

        packs = P.TREE_PACKS;

        errors.push(...P.TREE_PACK_ERRORS);

    }
    catch (error) {
        errors.push(`Gra nie wystartowałaby: ${error.message}`);
    }

    console.warn = warn;


    // Kilka drzew z każdej paczki na próbę (małe, średnie, duże).

    const report = [];

    if (packs.length > 0) {

        const { buildTree } = await import(src('world/trees/TreeShapes.js'));

        for (const pack of packs) {

            try {

                const trees = [0, 0.5, 1].flatMap((size) => [1, 2, 3].map((seed) => buildTree(pack.id, seed * 7919, size)));

                const heights = trees.map((tree) => tree.top + 1);

                const counts = trees.map((tree) => tree.blocks.length);

                report.push({
                    pack,
                    heights: [Math.min(...heights), Math.max(...heights)],
                    blocks: [Math.min(...counts), Math.max(...counts)]
                });

            }
            catch (error) {
                errors.push(`Drzewo "${pack.id}": nie da się zbudować drzewa (${error.message})`);
            }

        }

    }


    // Wynik.

    console.log(`Paczki drzew (assets/drzewa/): ${list.length} na liście, wczytane: ${packs.length}, błędy: ${errors.length}`);

    for (const name of added) {
        console.log(`  + nowe na liście: ${name}`);
    }

    for (const name of removed) {
        console.log(`  - usunięte z listy (nie ma folderu): ${name}`);
    }

    for (const change of changes) {
        console.log(`  * ${change}`);
    }

    if (!write && (listChanged || changes.length > 0)) {
        console.log('  (--sprawdz: nic nie zapisano - bez --sprawdz te zmiany trafią do plików)');
    }

    for (const { pack, heights, blocks } of report) {

        console.log(`  ${pack.folder}: ${pack.species[0]}, bloki ${pack.firstId}-${pack.firstId + SLOTS - 1}, ` +
            `kształt ${pack.shape.kind}, wysokość ${heights[0]}-${heights[1]}, bloków w drzewie ${blocks[0]}-${blocks[1]}, ` +
            `w lesie: ${pack.climate.chance > 0 ? `${Math.round(pack.climate.chance * 100)}%` : 'nie'}`);

    }

    for (const error of errors) {

        console.log(`  BŁĄD: ${error}`);

        if (GITHUB) {

            const folder = /Drzewo "([^"]+)"/.exec(error)?.[1];

            console.log(`::error${folder ? ` file=assets/drzewa/${folder}/drzewo.json` : ''}::${error}`);

        }

    }


    // Podsumowanie na stronie przebiegu akcji.

    if (process.env.GITHUB_STEP_SUMMARY) {

        const lines = [
            '## Paczki drzew',
            '',
            '| Folder | Drzewo | Bloki | Kształt | Wysokość | W lesie |',
            '|---|---|---|---|---|---|',
            ...report.map(({ pack, heights }) =>
                `| ${pack.folder} | ${pack.species[0]} | ${pack.firstId}-${pack.firstId + SLOTS - 1} | ${pack.shape.kind} | ${heights[0]}-${heights[1]} | ${pack.climate.chance > 0 ? `${Math.round(pack.climate.chance * 100)}%` : 'nie'} |`),
            '',
            ...added.map((name) => `- Nowe na liście: **${name}**`),
            ...changes.map((change) => `- Numery bloków: ${change}`),
            ...errors.map((error) => `- :x: ${error}`),
            ''
        ];

        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);

    }

    process.exit(errors.length > 0 ? 1 : 0);

}


if (args[0] === 'pokaz') {
    await show();
}
else {
    await check();
}
