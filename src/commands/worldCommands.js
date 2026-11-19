// ------------------------------------------------------------
// KOMENDY GRY - BLOKI I ŚWIAT (ROŚLINY, DRZEWA, WODA)
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { SEASONS, SEASON_NAMES, seasonAt } from '../sky/Seasons.js';
import { CommandError, simplify } from './CommandRegistry.js';
import {
    BLOCK_TYPES,
    getBlockLabel,
    FRUIT_BUSHES,
    bushStages,
    getBlockId,
    getBlockTypeById,
    isLiquidId,
    isSolidId
} from '../blocks/BlockRegistry.js';
import { waterUniforms } from '../rendering/BlockRenderData.js';
import { getItemLabel, ITEM_TYPES } from '../items/ItemRegistry.js';
import { itemUses } from '../items/uses.js';
import { STACK_SIZE } from '../game/Inventory.js';
import { BIOMES } from '../world/terrain/Biomes.js';
import { TREE_SPECIES, TREE_NAMES } from '../blocks/trees.js';
import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';
import {
    PLANT_PACK_ERRORS,
    PLANT_PACKS,
    plantStageType,
    getPlantPack,
    PLANT_PIXELS
} from '../blocks/plantPacks.js';
import { plantTree } from '../world/trees/plantTree.js';
import { SHRUBS, SHRUB_NAMES, shrubType, SHRUB_STAGE_SECONDS } from '../blocks/shrubs.js';
import { plantShrub } from '../world/shrubs/Shrubs.js';
import { POT_WATER, BOWL, COOK_SECONDS, DISHES, DISH_NAMES } from '../items/cooking.js';
import { fruitCalendar } from '../blocks/fruitSeasons.js';
import { seasonSerial } from '../game/Orchard.js';
import { soilInfo, WATER_REACH, WATER_GROWTH } from '../blocks/soil.js';
import { COLD_STATES, COLD_COMFORT } from '../game/Wellbeing.js';
import { isFieldBlock } from '../blocks/fertilizers.js';
import { spoilText, temperatureFactor, isPerishable, daysLeft, daysText, freshText } from '../items/spoilage.js';
import { newPot, cookPot } from '../game/CookingState.js';
import { newCampfire, addFirewood } from '../game/CampfireState.js';
import { LOW_PLANTS, LOW_PLANT_NAMES, SPHAGNUM, lowPlantType, lowPlantInfo, LOW_STAGE_SECONDS, LOW_PLANT_FIRST_ID, LOW_PLANT_END_ID } from '../blocks/lowPlants.js';
import { hedgehogHome, findLeafCell } from '../game/Hedgehogs.js';
import { HEDGEHOG_VARIANT_WEIGHTS } from '../world/animals/Hedgehog.js';
import { getTreeShowcase, undoTreeShowcase, startTreeShowcase } from '../world/trees/TreeShowcase.js';
import {
    isCreative,
    WATER_WAVE_HEIGHT,
    BUSH_GROWTH_SECONDS,
    TREE_GROWTH_SECONDS,
    CHUNK_HEIGHT,
    CHUNK_SIZE
} from '../config.js';
import {
    usageError,
    parseNumber,
    parseCoordinate,
    blockArgument,
    BLOCK_NAMES,
    itemArgument,
    decimal,
    treeName,
    durationText,
    riverBank
} from './commandHelpers.js';

const ITEM_NAMES = Object.keys(ITEM_TYPES);


// --- Krzaki owocowe (/krzaki) --------------------------------

// Krzaki liczone i rosnące "w okolicy" - do tylu bloków od gracza.

const BUSH_COMMAND_RADIUS = 64;


// ID bloku krzaka -> { type, stage }.

const BUSH_BY_ID = new Map(
    Object.keys(FRUIT_BUSHES).flatMap((species) =>
        bushStages(species).map((type, stage) => [getBlockId(type), { type, stage }])
    )
);


// Przegląda krzaki we wczytanych chunkach do `radius` bloków od `center`:
// visit(x, y, z, { type, stage }, odległość).

function forEachBush(world, center, radius, visit) {

    const layer = CHUNK_SIZE * CHUNK_SIZE;

    for (const chunk of world.chunks.values()) {

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        // Chunk w całości za daleko.

        const nearX = Math.max(baseX, Math.min(center.x, baseX + CHUNK_SIZE));
        const nearZ = Math.max(baseZ, Math.min(center.z, baseZ + CHUNK_SIZE));

        if (Math.hypot(nearX - center.x, nearZ - center.z) > radius) {
            continue;
        }

        const blocks = chunk.blocks;

        for (let i = chunk.solidBelow * layer; i < chunk.maxY * layer; i++) {

            const bush = BUSH_BY_ID.get(blocks[i]);

            if (!bush) {
                continue;
            }

            const x = baseX + (i % CHUNK_SIZE);
            const y = Math.floor(i / layer);
            const z = baseZ + Math.floor((i % layer) / CHUNK_SIZE);

            const distance = Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z);

            if (distance <= radius) {
                visit(x, y, z, bush, distance);
            }

        }

    }

}


// Ile krzaków w każdym etapie: [sadzonki, bez owoców, kilka, pełne].

function countBushes(world, center, radius) {

    const counts = [0, 0, 0, 0];

    forEachBush(world, center, radius, (x, y, z, bush) => counts[bush.stage]++);

    return counts;

}


// Najbliższy krzak spełniający warunek (we wczytanych chunkach).

function nearestBush(world, center, accept) {

    let best = null;

    forEachBush(world, center, Infinity, (x, y, z, bush, distance) => {

        if (accept(bush) && (!best || distance < best.distance)) {
            best = { x, y, z, type: bush.type, distance };
        }

    });

    return best;

}


// Kierunek po polsku (północ = -Z, wschód = +X - jak sąsiedzi
// chunków w Chunk.js).

function directionName(dx, dz) {

    const names = ['na wschód', 'na południowy wschód', 'na południe', 'na południowy zachód', 'na zachód', 'na północny zachód', 'na północ', 'na północny wschód'];

    const angle = Math.atan2(dz, dx);

    return names[(Math.round(angle / (Math.PI / 4)) + 8) % 8];

}


// Kierunek patrzenia gracza zaokrąglony do osi X albo Z (do przodu)
// i kierunek "w prawo" od niego.

function lookAxes(player) {

    const lookX = -Math.sin(player.yaw);
    const lookZ = -Math.cos(player.yaw);

    const [forwardX, forwardZ] = Math.abs(lookX) > Math.abs(lookZ) ? [Math.sign(lookX), 0] : [0, Math.sign(lookZ)];

    return { forwardX, forwardZ, rightX: -forwardZ, rightZ: forwardX };

}


// --- Woda (/woda) ---------------------------------------------

// Basen przed graczem: 7 bloków szerokości, 11 długości; pierwsze
// 3 rzędy płytkie (1 blok wody - brodzik), dalej 4 bloki głębokości.
// Ściany z wapienia równo z ziemią, dno z piasku.

const POOL_WIDTH = 7;
const POOL_LENGTH = 11;
const POOL_SHALLOW = 3;
const POOL_DEPTH = 4;

function buildPool(player, world) {

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);

    const ground = Math.floor(player.pos.y);

    const half = Math.floor(POOL_WIDTH / 2);

    let changed = 0;

    const set = (x, y, z, type) => {
        if (type === null ? world.clearBlock(x, y, z) : world.setBlock(x, y, z, type)) changed++;
    };


    // a - wzdłuż (od gracza), b - w poprzek; -1 i ostatni rząd to ściany.

    for (let a = -1; a <= POOL_LENGTH; a++) {

        for (let b = -half - 1; b <= half + 1; b++) {

            const x = Math.floor(player.pos.x) + forwardX * (a + 2) + rightX * b;
            const z = Math.floor(player.pos.z) + forwardZ * (a + 2) + rightZ * b;

            const wall = a < 0 || a >= POOL_LENGTH || Math.abs(b) > half;

            const depth = a < POOL_SHALLOW ? 1 : POOL_DEPTH;

            // Nad basenem pusto.

            for (let y = ground; y < ground + 4; y++) {
                set(x, y, z, null);
            }

            for (let y = ground - POOL_DEPTH - 1; y < ground; y++) {

                if (wall) {
                    set(x, y, z, 'limestone');
                }
                else if (y >= ground - depth) {
                    set(x, y, z, 'water');
                }
                else {
                    set(x, y, z, 'sand');
                }

            }

        }

    }

    return `Basen przed tobą (${changed} bloków): na początku brodzik (1 blok wody), dalej ${POOL_DEPTH} bloki głębokości. ` +
        'Pływanie: Spacja - w górę, Shift - w dół, Spacja przy brzegu - wyjście z wody.';

}


// Najbliższa powierzchnia wody we wczytanych chunkach: { x, y, z, distance } albo null.

function nearestWater(world, center) {

    const layer = CHUNK_SIZE * CHUNK_SIZE;

    let best = null;

    for (const chunk of world.chunks.values()) {

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        for (let lz = 0; lz < CHUNK_SIZE; lz++) {

            for (let lx = 0; lx < CHUNK_SIZE; lx++) {

                for (let y = chunk.maxY - 1; y >= 0; y--) {

                    const id = chunk.blocks[y * layer + lz * CHUNK_SIZE + lx];

                    if (id === 0) {
                        continue;
                    }

                    if (isLiquidId(id)) {

                        const x = baseX + lx;
                        const z = baseZ + lz;

                        const distance = Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z);

                        if (!best || distance < best.distance) {
                            best = { x, y, z, distance };
                        }

                    }

                    break;

                }

            }

        }

    }

    return best;

}


// Ogródek przed graczem: rzędy = gatunki, kolumny = etapy (od
// sadzonki do pełnego owoców), co 2 bloki, na trawie.

function plantBushGarden(player, world) {

    const species = Object.keys(FRUIT_BUSHES);

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);

    const startX = Math.floor(player.pos.x) + forwardX * 3 - rightX * 3;
    const startZ = Math.floor(player.pos.z) + forwardZ * 3 - rightZ * 3;

    const y = Math.floor(player.pos.y);


    species.forEach((name, row) => {

        bushStages(name).forEach((type, stage) => {

            const x = startX + rightX * stage * 2 + forwardX * row * 2;
            const z = startZ + rightZ * stage * 2 + forwardZ * row * 2;

            world.setBlock(x, y - 1, z, 'grass');
            world.setBlock(x, y, z, type);
            world.clearBlock(x, y + 1, z);

        });

    });

    return `Ogródek: ${species.length} ${species.length >= 5 ? 'rzędów' : 'rzędy'} krzaków (${species.map((name) => getBlockLabel(bushStages(name)[1]).toLowerCase()).join(', ')}), ` +
        'w każdym od lewej: sadzonka, bez owoców, kilka owoców, pełen owoców. PPM na owocach - zbiór.';

}


// --- Krzewy jagodowe (/krzewy, 1.17.0) ---------------------------

// Rozmiary z galerii: a) jeden blok, b) mały, c) dojrzały, d) stara kępa.
const SHRUB_GALLERY_SIZES = [0.1, 0.4, 0.7, 1];

// Krzew po słowie: nazwa z katalogu albo polska nazwa (bez ogonków).
function shrubByWord(word) {

    const key = simplify(word ?? '');

    return SHRUB_NAMES.find((name) => simplify(name) === key || simplify(SHRUBS[name].label) === key ||
        simplify(SHRUBS[name].label).split(' ')[0] === key) ?? null;

}

// Kawałek trawy pod krzew i wolne miejsce nad nim.
function shrubPlot(world, x, y, z, radius) {

    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        world.setBlock(x + dx, y - 1, z + dz, 'grass');
        for (let dy = 0; dy < 8; dy++) world.clearBlock(x + dx, y + dy, z + dz);
    }

}

// Galeria: każdy gatunek i odmiana w rzędzie, od lewej cztery rozmiary.
function plantShrubGallery(player, world) {

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);
    const y = Math.floor(player.pos.y);
    const startX = Math.floor(player.pos.x) + forwardX * 6;
    const startZ = Math.floor(player.pos.z) + forwardZ * 6;
    const SPACING = 9;

    let row = 0;

    for (const species of SHRUB_NAMES) {
        SHRUBS[species].varieties.forEach((variety, v) => {
            SHRUB_GALLERY_SIZES.forEach((size, column) => {
                const x = startX + rightX * (column - 1.5) * SPACING + forwardX * row * SPACING;
                const z = startZ + rightZ * (column - 1.5) * SPACING + forwardZ * row * SPACING;
                shrubPlot(world, Math.round(x), y, Math.round(z), 4);
                plantShrub(world, Math.round(x), y, Math.round(z), species, v, 1000 + row * 7 + column, size);
            });
            row++;
        });
    }

    return `Galeria krzewów: ${row} rzędów (${SHRUB_NAMES.map((name) => SHRUBS[name].label.toLowerCase()).join(', ')}; odmiany w osobnych rzędach), ` +
        'w każdym od lewej: jeden blok, mały krzak, dojrzały krzew, stara kępa. PPM na owocach - zbiór.';

}

// Najbliższy dziki krzew z generatora (także w niewczytanym terenie).
function nearestWildShrub(world, pos, species, radius = 256) {

    let best = null;

    world.generator?.shrubs?.forEachShrub(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, (shrub) => {
        if (species && shrub.species !== species) return;
        const distance = Math.hypot(shrub.x + 0.5 - pos.x, shrub.z + 0.5 - pos.z);
        if (!best || distance < best.distance) best = { ...shrub, distance };
    });

    return best;

}


// --- Rośliny niskie (/niskie, 1.19.0) ----------------------------

function lowPlantByWord(word) {

    const key = simplify(word ?? '');

    return LOW_PLANT_NAMES.find((name) => simplify(name) === key || simplify(LOW_PLANTS[name].label) === key ||
        simplify(LOW_PLANTS[name].label).split(' ').some((part) => part === key) || simplify(LOW_PLANTS[name].of) === key) ?? null;

}

// Galeria: każda roślina w rzędzie, od lewej kolejne etapy (kępki 3 x 2);
// przy dyni młoda i dojrzała dynia, w ostatnim rzędzie torfowce i chrobotek.
function plantLowGallery(player, world) {

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);
    const y = Math.floor(player.pos.y);
    const startX = Math.floor(player.pos.x) + forwardX * 4;
    const startZ = Math.floor(player.pos.z) + forwardZ * 4;

    const patch = (row, column, type) => {
        for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
            const x = startX + rightX * (column * 4 - 10 + a) + forwardX * (row * 4 + b);
            const z = startZ + rightZ * (column * 4 - 10 + a) + forwardZ * (row * 4 + b);
            world.setBlock(x, y - 1, z, 'grass');
            for (let dy = 0; dy < 3; dy++) world.clearBlock(x, y + dy, z);
            world.setBlock(x, y, z, type);
        }
    };

    let row = 0;

    for (const species of LOW_PLANT_NAMES) {
        const plant = LOW_PLANTS[species];
        const types = ['young', ...plant.stages].map((part) => lowPlantType(species, part));
        if (plant.fruitBlock) types.push('pumpkin_young', 'pumpkin');
        types.forEach((type, column) => patch(row, column, type));
        row++;
    }

    [...SPHAGNUM, 'reindeer_lichen'].forEach((type, column) => patch(row, column, type));

    return `Galeria roślin niskich: ${row + 1} rzędów (${LOW_PLANT_NAMES.map((name) => LOW_PLANTS[name].label.toLowerCase()).join(', ')}; ` +
        'ostatni: torfowce i chrobotek), w każdym od lewej kolejne etapy - od sadzonki po owoce. PPM na owocach - zbiór.';

}

// Najbliższa roślina niska (we wczytanych chunkach): { x, y, z, type, distance }.
function nearestLowPlant(world, center, species) {

    const layer = CHUNK_SIZE * CHUNK_SIZE;
    let best = null;

    for (const chunk of world.chunks.values()) {

        const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;

        for (let i = chunk.solidBelow * layer; i < chunk.maxY * layer; i++) {

            const id = chunk.blocks[i];

            if (id < LOW_PLANT_FIRST_ID || id >= LOW_PLANT_END_ID) continue;

            const type = getBlockTypeById(id);
            const info = lowPlantInfo(type);

            if (species ? info?.species !== species : !info) continue;

            const x = baseX + (i % CHUNK_SIZE), z = baseZ + Math.floor((i % layer) / CHUNK_SIZE);
            const distance = Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z);

            if (!best || distance < best.distance) best = { x, y: Math.floor(i / layer), z, type, distance };

        }

    }

    return best;

}


// --- Rośliny z paczek roślin (/rosliny) -------------------------

// Roślina po słowie: nazwa folderu albo polska nazwa (bez ogonków).

function plantPackByWord(word) {

    const key = simplify(word ?? '');

    return getPlantPack(key) ?? PLANT_PACKS.find((pack) => simplify(pack.label) === key) ?? null;

}


// Biomy rośliny: najpierw główne, poboczne z dopiskiem "rzadziej".

function plantBiomesText(pack) {

    const weight = (key) => pack.where.weights?.[key] ?? 1;

    return [...pack.where.biomes]
        .sort((a, b) => weight(b) - weight(a))
        .map((key) => BIOMES[key].name.toLowerCase() + (weight(key) < 1 ? ` (rzadziej)` : ''))
        .join(', ');

}


// Rozmiar w blokach: "1.6 x 2".

function blocksSize(pixels) {

    return decimal(pixels / PLANT_PIXELS);

}


// Ogródek: każda roślina w osobnym rzędzie, od lewej kolejne etapy
// (co 2 bloki - duże rośliny się nie zasłaniają).

function plantPackGarden(player, world, packs) {

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);

    const startX = Math.floor(player.pos.x) + forwardX * 3 - rightX * 2;
    const startZ = Math.floor(player.pos.z) + forwardZ * 3 - rightZ * 2;

    const y = Math.floor(player.pos.y);

    packs.forEach((pack, row) => {

        pack.stages.forEach((stage, index) => {

            const x = startX + rightX * index * 3 + forwardX * row * 3;
            const z = startZ + rightZ * index * 3 + forwardZ * row * 3;

            world.setBlock(x, y - 1, z, 'grass');
            world.setBlock(x, y, z, plantStageType(pack, index));

            for (let k = 1; k <= Math.ceil(stage.height / PLANT_PIXELS); k++) {
                world.clearBlock(x, y + k, z);
            }

        });

    });

    return `Ogródek: ${packs.map((pack) => pack.label.toLowerCase()).join(', ')} - w rzędzie od lewej kolejne etapy wzrostu. ` +
        'PPM na ostatnim etapie - zbiór, /krzaki rosnij - rosną od razu.';

}


// Najbliższa roślina z paczki (dowolny etap) we wczytanych chunkach.

function nearestPlantPack(world, center, pack) {

    const first = pack.firstId;
    const last = pack.firstId + pack.stages.length - 1;
    const layer = CHUNK_SIZE * CHUNK_SIZE;

    let best = null;

    for (const chunk of world.chunks.values()) {

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        for (let i = chunk.solidBelow * layer; i < chunk.maxY * layer; i++) {

            const id = chunk.blocks[i];

            if (id < first || id > last) {
                continue;
            }

            const x = baseX + (i % CHUNK_SIZE);
            const y = Math.floor(i / layer);
            const z = baseZ + Math.floor((i % layer) / CHUNK_SIZE);

            const distance = Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z);

            if (!best || distance < best.distance) {
                best = { x, y, z, distance, stage: id - first };
            }

        }

    }

    return best;

}


// --- Drzewa (/drzewa) ------------------------------------------

// Słowa gatunków (po polsku bez ogonków i po angielsku) -> gatunek.

const TREE_WORDS = {
    swierk: 'spruce', spruce: 'spruce',
    sosna: 'pine', pine: 'pine',
    buk: 'beech', beech: 'beech',
    lipa: 'linden', linden: 'linden',
    dab: 'oak', oak: 'oak',
    brzoza: 'birch', birch: 'birch'
};

// Wszystkie drzewa: stały identyfikator oraz krótka nazwa gatunku.

for (const pack of TREE_DEFINITIONS) {
    TREE_WORDS[pack.id] = pack.id;
    TREE_WORDS[simplify(pack.short)] ??= pack.id;
}

const TREE_COMMAND_RADIUS = 64;

const TREE_FIND_RADIUS = 1500;


function treeSpecies(word) {

    const species = TREE_WORDS[simplify(word ?? '')];

    if (!species) {
        throw new CommandError(`Podaj gatunek drzewa: ${TREE_NAMES.map((name) => simplify(TREE_SPECIES[name].short)).join(', ')}.`);
    }

    return species;

}


function treeCatalogText() {

    return [
        `Gatunki drzew (${TREE_NAMES.length}):`,
        ...TREE_NAMES.map((name) => `${simplify(TREE_SPECIES[name].short)} — ${TREE_SPECIES[name].species[0]}`),
        'Losowy las: /drzewa las sosna 16. Warianty: /drzewa warianty sosna. Wszystkie gatunki: /drzewa porownanie.',
        'Na końcu możesz podać seed, np. /drzewa las sosna 16 12345. Te same parametry odtwarzają ten sam zestaw.',
        'Warianty pokazują dostępne szablony, rozmiary i stany specjalne. Kształty proceduralne mają wiele losowych odmian.'
    ].join('\n');

}


function treeShowcaseInteger(value, label, min, max, fallback) {

    if (value === undefined) return fallback;
    const number = parseNumber(value, label);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new CommandError(`${label}: liczba całkowita od ${min} do ${max}.`);
    }
    return number;

}


function treeShowcaseText(job) {

    if (!job) return 'Nie ma jeszcze pokazu drzew w tej sesji. Zacznij od /drzewa lista.';
    if (job.phase === 'failed') return `Pokaz przerwany: ${job.error}. Ukończoną część możesz usunąć przez /drzewa cofnij.`;
    if (job.phase !== 'complete') {
        const phase = { preparing: 'sprawdzanie miejsca', planting: 'sadzenie drzew', undoing: 'cofanie zmian' }[job.phase] ?? 'praca w toku';
        return `Pokaz drzew: ${phase}. Poczekaj na wynik na czacie.`;
    }
    return [
        `Pokaz drzew gotowy: ${job.placed.length} drzew, seed ${job.plan.seed}` +
            (job.skipped.length ? `, pominięto ${job.skipped.length} zajętych miejsc.` : '.'),
        ...job.placed.map((tree, index) => `${index + 1}. ${tree.label} — ${tree.x} ${tree.y} ${tree.z}`),
        'Pozycje: /drzewa ostatnie. Cofnięcie ostatniego pokazu w tej sesji: /drzewa cofnij.'
    ].join('\n');

}


function runTreeShowcase(args, { world, player, chat }) {

    const word = simplify(args[0]);
    if (word === 'ostatnie') {
        if (args.length !== 1) throw new CommandError('Użycie: /drzewa ostatnie');
        return treeShowcaseText(getTreeShowcase(world));
    }
    if (word === 'cofnij') {
        if (args.length !== 1) throw new CommandError('Użycie: /drzewa cofnij');
        undoTreeShowcase(world)
            .then(({ restored, skipped }) => chat?.print(
                `Cofnięto pokaz drzew: ${restored} bloków.` +
                (skipped ? ` Zachowano ${skipped} bloków zmienionych później.` : ''), 'success'))
            .catch((error) => chat?.print(error.message, 'error'));
        return 'Cofanie ostatniego pokazu drzew…';
    }

    const mode = { las: 'forest', warianty: 'variants', porownanie: 'comparison' }[word];
    const expected = mode === 'forest' ? 4 : mode === 'variants' ? 3 : 2;
    if (args.length > expected) throw new CommandError(`Za dużo argumentów. Pomoc: /pomoc drzewa.`);
    const species = mode === 'comparison' ? undefined : treeSpecies(args[1]);
    const count = mode === 'forest' ? treeShowcaseInteger(args[2], 'Liczba drzew', 1, 36, 16) : undefined;
    const seed = treeShowcaseInteger(args[expected - 1], 'Seed', 0, 4294967295, (Math.random() * 4294967296) >>> 0);
    const axes = lookAxes(player);
    let job;
    try {
        job = startTreeShowcase(world, {
            mode, species, count, seed,
            origin: { x: Math.floor(player.pos.x) + axes.forwardX * 12, z: Math.floor(player.pos.z) + axes.forwardZ * 12 },
            axes
        });
    } catch (error) {
        throw new CommandError(error.message);
    }
    job.promise.then((result) => chat?.print(treeShowcaseText(result), 'success'))
        .catch((error) => chat?.print(error.message, 'error'));
    return `Przygotowuję ${mode === 'forest' ? 'las' : mode === 'variants' ? 'warianty drzewa' : 'porównanie gatunków'} przed tobą (seed ${seed}). Wynik pojawi się na czacie.`;

}


// Ziemia w kolumnie (x, z) - wysokość, na której stoi podstawa pnia.

function groundAt(world, x, z) {

    world.ensureColumnLoaded(x, z);

    return world.getGroundY(x, z);

}


// Drzewo gatunku `species` posadzone `ahead` bloków przed graczem
// (albo w podanym miejscu). size 0-1. Pod pniem trawa.

function growTreeAt(world, species, x, z, size, force) {

    const y = groundAt(world, x, z);

    if (y < 1 || y >= CHUNK_HEIGHT - 4) {
        return null;
    }

    if (world.getBlock(x, y - 1, z) !== 'grass' && force) {
        world.setBlock(x, y - 1, z, 'grass');
    }

    const seed = (Math.random() * 4294967296) >>> 0;

    const shape = plantTree(world, x, y, z, species, seed, size, force);

    return shape ? { x, y, z, shape } : null;

}


// Aleja: wszystkie gatunki w rzędzie przed graczem (co 12 bloków).

function plantTreeAlley(player, world) {

    const { forwardX, forwardZ, rightX, rightZ } = lookAxes(player);

    const spacing = 12;

    const ahead = 9;

    const baseX = Math.floor(player.pos.x) + forwardX * ahead;
    const baseZ = Math.floor(player.pos.z) + forwardZ * ahead;

    const planted = [];

    TREE_NAMES.forEach((species, i) => {

        const offset = Math.round((i - (TREE_NAMES.length - 1) / 2) * spacing);

        const x = baseX + rightX * offset;
        const z = baseZ + rightZ * offset;

        if (growTreeAt(world, species, x, z, 0.75, true)) {
            planted.push(treeName(species));
        }

    });

    return `Aleja drzew przed tobą (od lewej): ${planted.join(', ')}. ` +
        'Bloki i dodatki każdego gatunku: ekwipunek (E) albo /daj, np. /daj pine_log_resin. Siekiera (/daj axe) - PPM na pniu okorowuje.';

}


// Najbliższe drzewo gatunku z generatora terenu (kratki siatki lasów
// pierścieniami coraz dalej od gracza). Zwraca { x, y, z, distance }
// albo null.

function findTree(world, species, x0, z0, radius) {

    const forests = world.generator.forests;

    if (!forests) {
        return null;
    }

    const G = forests.grid;

    const gx0 = Math.floor(x0 / G);
    const gz0 = Math.floor(z0 / G);

    let best = null;

    const check = (gx, gz) => {

        const tree = forests.treeAt(gx, gz);

        if (!tree || tree.species !== species) {
            return;
        }

        const distance = Math.hypot(tree.x - x0, tree.z - z0);

        if (!best || distance < best.distance) {
            best = { x: tree.x, y: tree.y, z: tree.z, distance };
        }

    };


    for (let r = 0; r <= Math.ceil(radius / G); r++) {

        if (r === 0) {
            check(gx0, gz0);
        }

        for (let i = -r; i <= r && r > 0; i++) {

            check(gx0 + i, gz0 - r);
            check(gx0 + i, gz0 + r);

            if (i > -r && i < r) {
                check(gx0 - r, gz0 + i);
                check(gx0 + r, gz0 + i);
            }

        }

        // Cały następny pierścień jest dalej niż najlepsze znalezione.

        if (best && (r - 1) * G > best.distance) {
            break;
        }

    }

    return best;

}


// Drzewa z generatora w promieniu (bez sprawdzania, czy ktoś je ściął).

function countTrees(world, x, z, radius) {

    const counts = {};

    world.generator.forests?.forEachTree(x - radius, z - radius, x + radius, z + radius, (tree) => {

        if (Math.hypot(tree.x - x, tree.z - z) <= radius) {
            counts[tree.species] = (counts[tree.species] ?? 0) + 1;
        }

    });

    return counts;

}

export const WORLD_COMMANDS = [

    // ========================================================
    // BLOKI I ŚWIAT
    // ========================================================

    {
        name: 'daj',
        aliases: ['give'],
        usage: '/daj <blok albo przedmiot> [ilość]',
        description: 'Blok albo przedmiot (np. truskawki) do ekwipunku. Bez ilości w trybie kreatywnym - do wybranego miejsca na pasku, w przygodzie - stos 64.',

        run(args, { game }) {

            const type = itemArgument(args[0]);

            if (!type) {
                throw new CommandError('Podaj blok albo przedmiot, np. /daj lamp_red albo /daj truskawki');
            }

            const inventory = game.inventory;


            if (args[1] === undefined && isCreative(game.mode)) {

                inventory.set(inventory.selected, { type, count: 1 });

                return `Na pasku: ${getItemLabel(type)}.`;

            }


            const count = args[1] === undefined ? STACK_SIZE : Math.floor(parseNumber(args[1], 'ilość'));

            if (count < 1 || count > STACK_SIZE * 36) {
                throw new CommandError(`Ilość: od 1 do ${STACK_SIZE * 36}`);
            }

            const left = inventory.add(type, count);

            return `Do ekwipunku: ${count - left} x ${getItemLabel(type)}` +
                (left > 0 ? ` (${left} się nie zmieściło - ekwipunek pełny).` : '.');

        },

        complete(args) {
            return args.length === 1 ? [...BLOCK_NAMES, ...ITEM_NAMES] : args.length === 2 ? ['1', '16', '64'] : [];
        }
    },


    {
        name: 'bloki',
        aliases: ['blocks', 'przedmioty'],
        usage: '/bloki',
        description: 'Lista wszystkich bloków i przedmiotów.',

        run() {

            return 'Bloki: ' + BLOCK_NAMES
                .map((type) => {
                    const definition = BLOCK_TYPES[type];
                    const name = `${type} (${getBlockLabel(type)}${definition.light ? `, świeci ${definition.light}` : ''})`;
                    return name;
                })
                .join(', ') +
                '\nPrzedmioty: ' + ITEM_NAMES.map((type) => `${type} (${getItemLabel(type)})`).join(', ');

        }
    },


    {
        name: 'rzeka',
        aliases: ['rzeki', 'river', 'nurt'],
        usage: '/rzeka | /rzeka znajdz [tp] | /rzeka jezioro [tp] | /rzeka wodospad [tp] | /rzeka nurt <0-3> | /rzeka statystyki',
        description: 'Rzeki i jeziora: nurt tam, gdzie jesteś, i dokąd płynie woda; najbliższa rzeka, jezioro albo wodospad (z teleportem); siła nurtu (0 - nie niesie); liczby sieci rzek.',

        run(args, { game, player, world }) {

            const rivers = world.generator.rivers;

            if (!rivers) {
                throw new CommandError('Rzeki są tylko w terenie realistycznym.');
            }

            const word = simplify(args[0] ?? '');

            const teleport = args.slice(1).some((arg) => simplify(arg) === 'tp');

            const px = Math.floor(player.pos.x);
            const pz = Math.floor(player.pos.z);


            if (['znajdz', 'find', 'jezioro', 'lake'].includes(word)) {

                const lake = ['jezioro', 'lake'].includes(word);

                const found = lake ? rivers.nearestLake(px, pz, 3000) : rivers.nearest(px, pz, 1500);

                if (!found) {
                    return lake ? 'W promieniu 3000 bloków nie ma jeziora.' : 'W promieniu 1500 bloków nie ma rzeki.';
                }

                const what = lake ? 'jezioro' : 'rzeka';

                const spot = riverBank(world.generator, found.x, found.z);

                if (teleport) {

                    world.ensureColumnLoaded(spot.x, spot.z);

                    player.pos.set(spot.x + 0.5, world.getSurfaceY(spot.x, spot.z), spot.z + 0.5);
                    player.vel.set(0, 0, 0);

                    // Twarzą do wody.

                    player.yaw = Math.atan2(-(found.x - spot.x), -(found.z - spot.z));
                    player.updateCamera();

                    return `Przeniesiono nad ${lake ? 'jezioro' : 'rzekę'} (${spot.x} ${spot.z}).`;

                }

                return `Najbliższa ${what}: ${Math.round(found.distance)} bloków ${directionName(found.x - player.pos.x, found.z - player.pos.z)} ` +
                    `(${found.x} ${found.z}, woda na wysokości ${found.level}` +
                    `${lake ? `, ${found.cells * 256} m², ${found.outlet ? 'wypływa z niego rzeka' : 'bez odpływu'}` : `, szerokość ok. ${Math.round(found.width)}`}). ` +
                    `Teleport: /rzeka ${lake ? 'jezioro' : 'znajdz'} tp`;

            }


            if (['wodospad', 'wodospady', 'waterfall'].includes(word)) {

                const falls = rivers.waterfalls(px, pz, 1024)
                    .map((fall) => ({ ...fall, distance: Math.hypot(fall.x - player.pos.x, fall.z - player.pos.z) }))
                    .sort((a, b) => a.distance - b.distance);

                if (falls.length === 0) {
                    return 'W promieniu 1024 bloków nie ma wodospadu (rzeka spada tylko tam, gdzie teren opada o 5 bloków i więcej). Plac testowy: /scena wodospady.';
                }

                const fall = falls[0];

                if (teleport) {

                    // Przed wodospadem, w dół rzeki, na brzegu sadzawki - z widokiem
                    // na spadającą wodę.

                    const x = Math.floor(fall.x + fall.dirX * (fall.width + 8) - fall.dirZ * (fall.width + 4));
                    const z = Math.floor(fall.z + fall.dirZ * (fall.width + 8) + fall.dirX * (fall.width + 4));

                    world.ensureColumnLoaded(x, z);

                    player.pos.set(x + 0.5, Math.max(world.getSurfaceY(x, z), fall.bottom + 2), z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.yaw = Math.atan2(-(fall.x - x), -(fall.z - z));
                    player.pitch = 0.1;
                    player.updateCamera();

                    return `Przeniesiono pod wodospad: ${fall.top - fall.bottom} bloków (${Math.round(fall.x)} ${Math.round(fall.z)}).`;

                }

                return `Najbliższy wodospad: ${Math.round(fall.distance)} bloków ${directionName(fall.x - player.pos.x, fall.z - player.pos.z)} ` +
                    `(${Math.round(fall.x)} ${Math.round(fall.z)}), spada ${fall.top - fall.bottom} bloków z ${fall.top} do ${fall.bottom}; ` +
                    `w promieniu 1024 bloków: ${falls.length}. Teleport: /rzeka wodospad tp`;

            }


            if (word === 'nurt') {

                if (args[1] === undefined) {
                    return `Nurt niesie gracza x${decimal(player.riverPush)}. Zmiana: /rzeka nurt 0 (nie niesie) do 3.`;
                }

                const value = parseNumber(args[1], 'siła nurtu');

                if (value < 0 || value > 3) {
                    throw new CommandError('Siła nurtu: od 0 (nie niesie) do 3 (1 = zwykła).');
                }

                player.riverPush = value;

                return `Nurt niesie gracza x${decimal(value)}.`;

            }


            if (['statystyki', 'stats'].includes(word)) {

                const stats = rivers.stats();

                return `Sieć rzek (policzona dotąd): ${stats.rivers} rzek z ${stats.sources} sprawdzonych źródeł, ` +
                    `${stats.runs} odcinków, ${stats.lakes} jezior, ${stats.cells} kratek spływu, ${stats.zones} obszarów.`;

            }


            if (word) {
                throw usageError(this);
            }


            // Gdzie jesteś: nurt, dokąd płynie woda.

            const flow = world.getFlow(px, pz);

            const sample = world.generator.compute(px, pz, 0, {});

            const way = rivers.downstream(px, pz);

            const target = way.end === 'sea' ? 'do morza' : 'do jeziora bez odpływu';

            const route = `woda stąd płynie ${target} (ok. ${Math.round(way.length)} bloków` +
                `${way.lakes ? `, przez ${way.lakes} ${way.lakes === 1 ? 'jezioro' : 'jeziora'}` : ''})`;

            if (sample.lake) {
                return `Jezioro (tafla na wysokości ${sample.water}) - ${route}.`;
            }

            if (flow && sample.water > sample.height) {

                const speed = Math.hypot(flow[0], flow[1]);

                return `Rzeka: nurt ${decimal(speed)} bloku/s na ${directionName(flow[0], flow[1])}` +
                    `${player.current ? ' - niesie cię' : ''}; ${route}.`;

            }

            const near = rivers.nearest(px, pz, 600);

            return (near
                ? `Najbliższa rzeka: ${Math.round(near.distance)} bloków ${directionName(near.x - player.pos.x, near.z - player.pos.z)}. `
                : 'W promieniu 600 bloków nie ma rzeki. ') +
                `Deszcz stąd spłynąłby ${target} (ok. ${Math.round(way.length)} bloków). Dalej: /rzeka znajdz tp, /rzeka jezioro, /mapa.`;

        },

        complete(args) {
            return args.length === 1 ? ['znajdz', 'jezioro', 'wodospad', 'nurt', 'statystyki'] : args.length === 2 && ['znajdz', 'jezioro', 'wodospad'].includes(simplify(args[0])) ? ['tp'] : [];
        }
    },


    {
        name: 'woda',
        aliases: ['water', 'plywanie'],
        usage: '/woda | /woda basen | /woda znajdz | /woda fale <0-3>',
        description: 'Woda: czy jesteś w wodzie (jak głęboko, czy pod wodą), basen do pływania przed tobą, najbliższa woda (morze) i komenda /tp, wysokość fal (0 - płaska woda, 1 - zwykłe).',

        run(args, { game, player, world }) {

            const word = simplify(args[0] ?? '');


            if (word === 'fale') {

                if (args[1] === undefined) {
                    return `Fale: x${decimal(waterUniforms.uWaveHeight.value / WATER_WAVE_HEIGHT)}. Zmiana: /woda fale 0 (płaska woda) do 3.`;
                }

                const value = parseNumber(args[1], 'wysokość fal');

                if (value < 0 || value > 3) {
                    throw new CommandError('Fale: od 0 (płaska woda) do 3 (1 = zwykłe).');
                }

                waterUniforms.uWaveHeight.value = WATER_WAVE_HEIGHT * value;

                return `Fale: x${value}${value === 0 ? ' - woda płaska' : ''}.`;

            }


            if (['basen', 'pool'].includes(word)) {
                return buildPool(player, world);
            }


            if (['znajdz', 'find'].includes(word)) {

                const found = nearestWater(world, player.pos);

                if (!found) {
                    return 'We wczytanych chunkach nie ma wody. Basen: /woda basen. Morze: /mapa (niebieskie) i /tp.';
                }

                const { x, y, z, distance } = found;

                return `Najbliższa woda: ${Math.round(distance)} bloków ${directionName(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z)} ` +
                    `(${x} ${y} ${z}). Teleport nad wodę: /tp ${x} ${y + 2} ${z}`;

            }


            if (word) {
                throw usageError(this);
            }


            const water = player.submerged;

            const state = water <= 0
                ? 'nie jesteś w wodzie'
                : `w wodzie ${Math.round(water * 100)}% ciała` +
                  (player.swimming ? ', pływasz' : player.onGround ? ', stoisz na dnie' : '') +
                  (game.water.underwater ? ', oczy pod wodą' : '');

            return `Woda: ${state}. Woda dookoła: ${game.water.nearbyWater} kolumn (płynącej: ${game.water.flowingWater ?? 0} - szum strumienia, reszta - fale). ` +
                'Pływanie: Spacja - w górę, Shift - w dół, Spacja przy brzegu - wyjście. Dalej: /woda basen, /woda znajdz, /woda fale.';

        },

        complete(args) {
            return args.length === 1 ? ['basen', 'znajdz', 'fale'] : args.length === 2 && simplify(args[0]) === 'fale' ? ['0', '1', '2'] : [];
        }
    },


    {
        name: 'jez',
        aliases: ['jezyk', 'hedgehog'],
        usage: '/jez | /jez dodaj [brown|dark|sandy|albino] | /jez znajdz',
        description: 'Jeżyki: ile jest w pobliżu i co robią, nowy jeżyk przed tobą albo najbliższy krzew, w którym mieszka jeżyk.',

        run(args, { game, player, world }) {

            const hedgehogs = game?.hedgehogs;

            if (!hedgehogs) {
                throw new CommandError('W tym świecie nie ma jeżyków.');
            }

            const word = simplify(args[0] ?? '');
            const variants = HEDGEHOG_VARIANT_WEIGHTS.map(([name]) => name);

            if (!word) {
                const stats = hedgehogs.stats();
                const states = Object.entries(stats.states).map(([state, count]) => `${state}: ${count}`).join(', ');
                return `Jeżyki w pobliżu: ${stats.count} (najwyżej ${stats.limit})${states ? ` - ${states}` : ''}. ` +
                    'W dzień śpią w krzewach jagodowych, żerują od zmierzchu do świtu, zimą śpią. ' +
                    `Warianty: ${variants.join(', ')}. Nowy: /jez dodaj, najbliższy dom: /jez znajdz, noc: /time night.`;
            }

            if (['dodaj', 'add', 'nowy'].includes(word)) {

                const variant = args[1] === undefined ? variants[Math.floor(Math.random() * 3)] : simplify(args[1]);

                if (!variants.includes(variant)) {
                    throw new CommandError(`Warianty: ${variants.join(', ')}.`);
                }

                const { forwardX, forwardZ } = lookAxes(player);
                const x = Math.floor(player.pos.x) + forwardX * 3, z = Math.floor(player.pos.z) + forwardZ * 3;
                const y = Math.floor(player.pos.y);

                // Dom: liście krzewu w pobliżu albo miejsce, w którym stanął.
                let home = null;

                for (let r = 0; r <= 6 && !home; r++) {
                    for (let dx = -r; dx <= r && !home; dx++) for (let dz = -r; dz <= r && !home; dz++) {
                        if (Math.max(Math.abs(dx), Math.abs(dz)) === r) home = findLeafCell(world, x + dx, y, z + dz);
                    }
                }

                const hedgehog = hedgehogs.add(home ?? { x, y, z }, { variant, x: x + 0.5, y, z: z + 0.5 });

                // Od razu na nogach (także w dzień - do pierwszego powrotu do domu).
                hedgehog.enter('idle', 1);
                hedgehog.curl = 0;

                return `Jeżyk (${variant}) przed tobą. ${home ? 'Zamieszkał w krzewie obok.' : 'Krzewu w pobliżu nie ma - śpi tam, gdzie stanął.'} ` +
                    'LPM - zwija się w kulkę, PPM z jagodami w ręce - je. W dzień wróci spać; noc: /time night.';

            }

            if (['znajdz', 'find'].includes(word)) {

                const shrubs = world.generator?.shrubs;

                if (!shrubs) {
                    return 'W tym świecie krzewy nie rosną dziko, więc jeżyki nie mają domów. Spróbuj /jez dodaj.';
                }

                let best = null;

                shrubs.forEachShrub(player.pos.x - 256, player.pos.z - 256, player.pos.x + 256, player.pos.z + 256, (shrub) => {
                    const home = hedgehogHome(shrub);
                    if (!home) return;
                    const distance = Math.hypot(shrub.x + 0.5 - player.pos.x, shrub.z + 0.5 - player.pos.z);
                    if (!best || distance < best.distance) best = { shrub, home, distance };
                });

                if (!best) {
                    return 'W promieniu 256 bloków żaden krzew nie ma jeżyka.';
                }

                return `Najbliższy jeżyk (${best.home.variant}) mieszka w krzewie "${SHRUBS[best.shrub.species].label.toLowerCase()}", ` +
                    `${Math.round(best.distance)} bloków stąd. /tp ${best.shrub.x} ${best.shrub.y + 3} ${best.shrub.z}`;

            }

            throw new CommandError('Użycie: /jez | /jez dodaj [wariant] | /jez znajdz.');

        }

    },


    {
        name: 'zimno',
        aliases: ['cold', 'chlod', 'mroz'],
        usage: '/zimno | /zimno ustaw <0-100> | /zimno zamarznij | /zimno odmroz',
        description: 'Zimno i zamarzanie (1.26.0): odczuwalna temperatura tu, gdzie stoisz (powietrze, schronienie, wiatr, woda, ogień, jedzenie) i wychłodzenie; "ustaw" zmienia wychłodzenie, "zamarznij" od razu zamienia w bryłę lodu, "odmroz" ją roztapia.',

        run(args, { game }) {

            const wellbeing = game.wellbeing, warmth = game.warmth, freeze = game.freeze;
            const word = simplify(args[0] ?? '');

            if (!wellbeing.active) throw new CommandError('Zimno działa tylko w trybie przygody');

            if (!word) {
                const p = warmth.update(0, true);
                const n = (value) => `${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}`.replace('.', ',');
                return `Odczuwalnie ${Math.round(p.felt)}°C: powietrze ${n(p.air)}, schronienie ${n(p.shelter)}, wiatr ${n(p.wind)}, ` +
                    `woda ${n(p.water)}, ogień i pochodnie ${n(p.heat)}, jedzenie ${n(p.food)}. ` +
                    `Wychłodzenie ${Math.round(wellbeing.chill)} z 100 (${COLD_STATES[wellbeing.coldState].label})` +
                    `${p.felt >= COLD_COMFORT ? ' - tu się rozgrzewasz' : p.felt < 0 ? ' - tu można zamarznąć' : ' - tu marzniesz, ale nie zamarzniesz'}.` +
                    `${freeze.active ? ` W bryle lodu (${freeze.phase}).` : ''}`;
            }

            if (word === 'ustaw') {
                const value = parseNumber(args[1], 'wychłodzenie');
                if (value < 0 || value > 99) throw new CommandError('Wychłodzenie: od 0 do 99 (100 to zamarznięcie - /zimno zamarznij)');
                wellbeing.data.chill = value;
                return `Wychłodzenie: ${value} (${COLD_STATES[wellbeing.coldState].label}).`;
            }

            if (word === 'zamarznij') {
                if (freeze.active) throw new CommandError('Już jesteś w bryle lodu');
                wellbeing.data.chill = 100;
                if (!freeze.start()) throw new CommandError('Teraz nie da się zamarznąć');
                return 'Zamarzasz…';
            }

            if (word === 'odmroz') {
                if (!freeze.active) throw new CommandError('Nie jesteś w bryle lodu');
                if (freeze.phase !== 'thaw') freeze.thaw(false);
                return 'Lód topnieje.';
            }

            throw new CommandError('Użycie: /zimno | /zimno ustaw <0-100> | /zimno zamarznij | /zimno odmroz');

        }
    },

    {
        name: 'psucie',
        aliases: ['spoilage', 'psuje'],
        usage: '/psucie | /psucie tempo <mnożnik> | /psucie dni <ile> | /psucie swiezosc <procent>',
        description: 'Psucie się jedzenia (1.23.0): temperatura i tempo tu, gdzie stoisz, i świeżość stosu w ręce; "tempo" przyspiesza albo wyłącza psucie (0), "dni" od razu starzeje jedzenie tak, jakby minęło tyle dób gry, "swiezosc" ustawia świeżość stosu w ręce.',

        run(args, { game }) {

            const spoilage = game.spoilage;
            const word = simplify(args[0] ?? '');
            const temperature = spoilage.temperature();

            if (!word) {
                const held = game.inventory.selectedItem;
                const left = (type, place) => daysText(daysLeft(type, 1, temperature, place));
                return `Psucie: ${spoilage.active ? 'włączone' : 'wyłączone (tylko tryb przygody)'}, tempo ×${spoilage.speed}, ` +
                    `temperatura ${Math.round(temperature)}°C (mnożnik ×${temperatureFactor(temperature).toFixed(2).replace('.', ',')}). ` +
                    `Świeże maliny poleżą tutaj: ${left('raspberry', 'pack')} w plecaku, ${left('raspberry', 'chest')} w skrzyni, ${left('raspberry', 'cellar')} w piwniczce. ` +
                    (held && spoilText(held.type) ? `W ręce: ${getItemLabel(held.type)} - ${isPerishable(held.type) ? `${freshText(held, temperature)} (świeżość ${Math.round((held.fresh ?? 1) * 100)}%)` : spoilText(held.type)}. ` : '') +
                    `Zepsuło się od wejścia do świata: ${spoilage.spoiled}.`;
            }

            if (word === 'tempo') {
                const speed = parseNumber(args[1], 'mnożnik');
                if (speed < 0 || speed > 1000) throw new CommandError('Mnożnik: od 0 (wyłączone) do 1000');
                spoilage.speed = speed;
                return `Tempo psucia: ×${speed}${speed === 0 ? ' (jedzenie się nie psuje)' : ''}. Nie zapisuje się ze światem.`;
            }

            if (word === 'dni') {
                const days = parseNumber(args[1], 'liczba dób');
                if (days <= 0 || days > 64) throw new CommandError('Liczba dób: od 0 do 64');
                const before = spoilage.spoiled;
                spoilage.step(days);
                return `Minęło ${days} dób: zepsuło się ${spoilage.spoiled - before} sztuk (plecak, skrzynie i przedmioty na ziemi).`;
            }

            if (word === 'swiezosc') {
                const percent = parseNumber(args[1], 'świeżość w procentach');
                if (percent < 1 || percent > 100) throw new CommandError('Świeżość: od 1 do 100 (procent)');
                const held = game.inventory.selectedItem;
                if (!held || !isPerishable(held.type)) throw new CommandError('Weź do ręki jedzenie, które się psuje');
                held.fresh = percent / 100;
                return `${getItemLabel(held.type)} w ręce: świeżość ${percent}% - ${freshText(held, temperature)}.`;
            }

            throw new CommandError('Użycie: /psucie | /psucie tempo <mnożnik> | /psucie dni <ile> | /psucie swiezosc <procent>');

        }
    },

    {
        name: 'ziemia',
        aliases: ['soil', 'gleba'],
        usage: '/ziemia',
        description: 'Ziemia z charakterem (1.25.0): jak szybko rosną rośliny na ziemi pod celownikiem (albo pod nogami) - rodzaj ziemi, woda w pobliżu i łączny mnożnik.',

        run(args, { game, player, world }) {

            const hit = game.currentHit?.hit ? game.currentHit.block : null;
            let x = hit ? hit.x : Math.floor(player.pos.x), y = hit ? hit.y : Math.floor(player.pos.y) - 1, z = hit ? hit.z : Math.floor(player.pos.z);

            // Bez celu: pierwszy blok pod nogami (do 6 bloków w dół).
            if (!hit) for (let down = 0; down < 6 && world.getBlockId(x, y, z) === 0; down++) y--;

            // Celownik na roślinie: liczy się ziemia pod nią.
            if (!soilInfo(world, x, y, z).soil && soilInfo(world, x, y - 1, z).soil) y--;

            const info = soilInfo(world, x, y, z);
            const label = BLOCK_TYPES[info.type]?.label ?? info.type ?? 'powietrze';
            const number = (value) => String(Math.round(value * 100) / 100).replace('.', ',');

            if (!info.soil) {
                return `${label} (${x} ${y} ${z}) to nie ziemia - rośliny tu nie rosną. Wyceluj w ziemię albo roślinę.`;
            }

            return `${label} (${x} ${y} ${z}): wzrost ×${number(info.growth)}` +
                `${info.growth > 1 ? ' (żyzna)' : info.growth < 1 ? ' (jałowa)' : ''}, woda do ${WATER_REACH} bloków: ${info.water ? `jest (×${number(WATER_GROWTH)})` : 'brak'}. ` +
                `Razem rośliny rosną tu ×${number(info.total)}.${isFieldBlock(info.type) ? ' To pole - można sadzić.' : ''}`;

        }
    },

    {
        name: 'sad',
        aliases: ['orchard', 'rozwoj'],
        usage: '/sad | /sad wiosna | /sad opadnij',
        description: 'Opadłe owoce i zimowy rozwój roślin (1.22.0): stan pamięci sadu; "wiosna" rozlicza od razu chunki wokół ciebie tak, jakby minęła zima; "opadnij" - jakby minęła pora owocowania.',

        run(args, { game, player, world }) {

            const orchard = game.orchard;
            const word = simplify(args[0] ?? '');

            if (!word) {
                const levels = [...orchard.levels.values()];
                const hit = game.currentHit?.hit ? game.currentHit.block : null;
                return `Sad: ${levels.length} roślin z większym plonem (najwięcej +${Math.max(0, ...levels)}), zbierano w tym roku z ${orchard.picked.size}, ` +
                    `rozliczanych chunków: ${orchard.chunks.size}.` +
                    (hit ? ` Pod celownikiem: +${orchard.level(hit.x, hit.y, hit.z)} owoców przy zbiorze.` : '') +
                    ' Rozliczenie na próbę: /sad wiosna, /sad opadnij.';
            }

            if (!['wiosna', 'spring', 'opadnij', 'fall'].includes(word)) {
                throw new CommandError('Użycie: /sad | /sad wiosna | /sad opadnij');
            }

            const spring = ['wiosna', 'spring'].includes(word);
            const serial = seasonSerial(game.time.days);
            const total = { fallen: 0, humus: 0, saplings: 0, grown: 0, spread: 0 };
            let chunks = 0;

            for (const chunk of world.chunks.values()) {
                // (Jak w grze: tylko chunki zmienione przez gracza.)
                if (!chunk.modified || Math.hypot(chunk.cx * CHUNK_SIZE + 8 - player.pos.x, chunk.cz * CHUNK_SIZE + 8 - player.pos.z) > 40) continue;
                // "wiosna": od zeszłej zimy do tej wiosny; "opadnij": tak, jakby
                // była pora, w której nic nie owocuje (zima bez zimujących owoców
                // liczy się u roślin osobno - Orchard.settle).
                const result = spring ? orchard.settle(chunk, Math.floor(serial / 4) * 4 - 1, Math.floor(serial / 4) * 4, game.time.days)
                    : orchard.settle(chunk, serial - 1, serial, game.time.days);
                for (const name of Object.keys(total)) total[name] += result[name];
                chunks++;
            }

            orchard.version++;

            return `Rozliczono ${chunks} zmienionych chunków: opadło ${total.fallen}, czarnoziem ${total.humus}, sadzonki ${total.saplings}, ` +
                `większy plon ${total.grown}, rozrosło się ${total.spread}.` + (spring ? '' : ' (Spadają tylko owoce roślin, których pora już minęła.)');

        }
    },

    {
        name: 'kalendarz',
        aliases: ['owocowanie', 'calendar'],
        usage: '/kalendarz',
        description: 'Kalendarz owocowania (1.21.0): co kwitnie i owocuje teraz, a co w kolejnych porach roku.',

        run(args, { game }) {

            const now = seasonAt(game.time.days);
            const names = ['wiosna', 'lato', 'jesień', 'zima'];
            const list = (index) => fruitCalendar().filter(([, seasons]) => seasons.includes(index)).map(([label]) => label.toLowerCase());
            const line = (index) => `${names[index]}: ${list(index).join(', ') || 'nic nie owocuje'}`;

            return `Jest ${now.name}, dzień ${now.day} z ${now.days}. Teraz owocuje: ${list(now.index).join(', ') || 'nic - rośliny śpią'}. ` +
                `Cały rok - ${[0, 1, 2, 3].map(line).join('; ')}. ` +
                'Poza swoją porą roślina wygląda jak bez owoców i nie rośnie; zimą nie rośnie nic. Palma kokosowa, baobab, figowiec i szyszki - cały rok.';

        }
    },

    {
        name: 'garnek',
        aliases: ['gotowanie', 'pot'],
        usage: '/garnek | /garnek ognisko | /garnek gotuj',
        description: 'Gotowanie (1.20.0): zestaw do ekwipunku (garnek z wodą, miski, składniki, opał), płonące ognisko z garnkiem przed tobą albo dogotowanie potraw w garnkach obok.',

        run(args, { game, player, world }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                const kit = [[POT_WATER, 1], [BOWL, 3], ['pumpkin_slice', 4], ['zucchini', 4], ['hazelnut', 4], ['raspberry', 4],
                    ['oak_firewood', 6], ['oak_bark', 1], ['fire_starter', 1]];
                for (const [type, count] of kit) game.inventory.add(type, count);
                return 'Zestaw do gotowania w ekwipunku. Postaw garnek z wodą na ognisku (PPM), wrzuć 2-3 składniki, po ' +
                    `${COOK_SECONDS} s nad ogniem nabierz potrawę miską. Potrawy: ` +
                    DISH_NAMES.map((dish) => `${DISHES[dish].label} (${DISHES[dish].hint})`).join(', ') + '.';
            }

            if (['ognisko', 'fire'].includes(word)) {

                const { forwardX, forwardZ } = lookAxes(player);
                const x = Math.floor(player.pos.x) + forwardX * 2, z = Math.floor(player.pos.z) + forwardZ * 2;
                const y = Math.floor(player.pos.y);

                if (!isSolidId(world.getBlockId(x, y - 1, z)) || world.getBlockId(x, y, z) !== 0) {
                    throw new CommandError('Dwa bloki przed tobą musi być wolne miejsce na stałym gruncie.');
                }

                world.setBlock(x, y, z, 'campfire');
                const fire = newCampfire(x, y, z);
                for (let i = 0; i < 6; i++) addFirewood(fire, 'oak');
                fire.phase = 'burning';
                fire.pot = newPot();
                game.campfires.fires.set(`${x},${y},${z}`, fire);
                game.campfires.version++;

                return 'Płonące ognisko z garnkiem wody. Wrzuć składniki (PPM z jedzeniem w ręce).';

            }

            if (['gotuj', 'cook'].includes(word)) {

                let done = 0;

                for (const fire of game.campfires.fires.values()) {
                    if (!fire.pot || Math.hypot(fire.x - player.pos.x, fire.z - player.pos.z) > 16) continue;
                    const dish = cookPot(fire.pot, COOK_SECONDS);
                    if (dish) { game.campfires.cooked(fire, dish); done++; }
                }

                return done > 0 ? `Dogotowano: ${done}.` : 'W pobliżu nie ma garnka z co najmniej dwoma składnikami.';

            }

            throw new CommandError('Użycie: /garnek | /garnek ognisko | /garnek gotuj');

        }
    },

    {
        name: 'niskie',
        aliases: ['lowplants', 'runo'],
        usage: '/niskie | /niskie galeria | /niskie znajdz [roślina]',
        description: 'Rośliny niskie (żurawina, brusznica, truskawki, poziomka, dynia, cukinia): lista, galeria etapów albo najbliższa dzika roślina.',

        run(args, { player, world }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                return `Rośliny niskie (${LOW_PLANT_NAMES.length}): ` + LOW_PLANT_NAMES.map((name) => {
                    const plant = LOW_PLANTS[name];
                    const biomes = Object.keys(plant.habitat ?? {}).map((key) => BIOMES[key].name.toLowerCase()).join(', ');
                    return `${name} - ${plant.label} (${biomes})`;
                }).join('; ') + `. Etap trwa średnio ${LOW_STAGE_SECONDS} s (szybciej: /krzaki tempo). ` +
                    'Galeria: /niskie galeria, najbliższa dzika: /niskie znajdz.';
            }

            if (['galeria', 'gallery', 'pokaz', 'ogrod'].includes(word)) {
                return plantLowGallery(player, world);
            }

            if (['znajdz', 'find'].includes(word)) {

                const species = args[1] === undefined ? null : lowPlantByWord(args[1]);

                if (args[1] !== undefined && !species) {
                    throw new CommandError(`Nie znam rośliny "${args[1]}". Lista: /niskie.`);
                }

                const found = nearestLowPlant(world, player.pos, species);

                if (!found) {
                    return `We wczytanym terenie nie rośnie ${species ? LOW_PLANTS[species].label.toLowerCase() : 'żadna roślina niska'}` +
                        `${species ? ` (szukaj w biomach: ${Object.keys(LOW_PLANTS[species].habitat ?? {}).map((key) => BIOMES[key].name.toLowerCase()).join(', ')}; /biom znajdz)` : ''}.`;
                }

                return `Najbliżej: ${getBlockLabel(found.type).toLowerCase()}, ${Math.round(found.distance)} bloków stąd. ` +
                    `/tp ${found.x} ${found.y + 2} ${found.z}`;

            }

            throw new CommandError('Użycie: /niskie | /niskie galeria | /niskie znajdz [roślina]');

        }
    },

    {
        name: 'krzewy',
        aliases: ['shrubs'],
        usage: '/krzewy | /krzewy galeria | /krzewy <gatunek> [rozmiar 0-100] [odmiana] | /krzewy znajdz [gatunek]',
        description: 'Krzewy jagodowe: lista gatunków, galeria wszystkich rozmiarów, jeden krzew przed tobą albo najbliższy dziki krzew.',

        run(args, { player, world }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                return `Krzewy jagodowe (${SHRUB_NAMES.length}): ` + SHRUB_NAMES.map((name) => {
                    const shrub = SHRUBS[name];
                    return `${name} - ${shrub.label}${shrub.varieties.length > 1 ? ` (${shrub.varieties.length} odmiany)` : ''}`;
                }).join(', ') + `. Gałązka po zbiorze kwitnie i owocuje od nowa (etap średnio co ${SHRUB_STAGE_SECONDS} s; szybciej: /krzaki tempo). ` +
                    'Galeria: /krzewy galeria, najbliższy dziki: /krzewy znajdz.';
            }

            if (['galeria', 'gallery', 'pokaz', 'ogrod'].includes(word)) {
                return plantShrubGallery(player, world);
            }

            if (['znajdz', 'find'].includes(word)) {

                const species = args[1] === undefined ? null : shrubByWord(args[1]);

                if (args[1] !== undefined && !species) {
                    throw new CommandError(`Nie znam krzewu "${args[1]}". Lista: /krzewy.`);
                }

                if (!world.generator?.shrubs) {
                    return 'W tym świecie krzewy nie rosną dziko. Galeria do obejrzenia: /krzewy galeria.';
                }

                const found = nearestWildShrub(world, player.pos, species);

                if (!found) {
                    return `W promieniu 256 bloków nie rośnie ${species ? SHRUBS[species].label.toLowerCase() : 'żaden krzew jagodowy'}.`;
                }

                const variety = SHRUBS[found.species].varieties[found.variety];

                return `Najbliższy krzew: ${getBlockLabel(shrubType(found.species, 'fruit', found.variety)).toLowerCase()} ` +
                    `(${variety.of}), ${Math.round(found.distance)} bloków stąd. /tp ${found.x} ${found.y + 3} ${found.z}`;

            }

            const species = shrubByWord(args[0]);

            if (!species) {
                throw new CommandError(`Nie znam krzewu "${args[0]}". Lista: /krzewy.`);
            }

            const percent = args[1] === undefined ? 70 : parseNumber(args[1], 'rozmiar');

            if (percent < 0 || percent > 100) {
                throw new CommandError('Rozmiar: od 0 (jeden blok) do 100 (stara kępa).');
            }

            const variety = args[2] === undefined ? 0 : Math.floor(parseNumber(args[2], 'odmiana')) - 1;

            if (variety < 0 || variety >= SHRUBS[species].varieties.length) {
                throw new CommandError(`Odmiana: od 1 do ${SHRUBS[species].varieties.length}.`);
            }

            const { forwardX, forwardZ } = lookAxes(player);
            const x = Math.floor(player.pos.x) + forwardX * 5, z = Math.floor(player.pos.z) + forwardZ * 5;
            const y = Math.floor(player.pos.y);

            shrubPlot(world, x, y, z, 4);

            const shape = plantShrub(world, x, y, z, species, variety, (Math.random() * 4294967296) >>> 0, percent / 100);

            return shape
                ? `${SHRUBS[species].label}: ${shape.blocks.length} bloków, wysokość ${shape.top + 1}, przed tobą.`
                : 'Nie udało się postawić krzewu.';

        }

    },


    {
        name: 'krzaki',
        aliases: ['bushes', 'owoce'],
        usage: '/krzaki | /krzaki rosnij [etapy] | /krzaki tempo <0-500> | /krzaki ogrod | /krzaki znajdz',
        description: 'Krzaki owocowe: ile ich jest w okolicy, wzrost od razu (rosnij) albo szybciej (tempo 60 = minuta w sekundę), ogródek ze wszystkimi gatunkami i etapami przed tobą, najbliższy dziki krzak z owocami.',

        run(args, { game, player, world }) {

            const word = simplify(args[0] ?? '');

            const growth = game.plantGrowth;


            if (word === 'tempo') {

                if (args[1] === undefined) {
                    return `Tempo wzrostu krzaków: x${growth.speed}. Zmiana: /krzaki tempo 60 (szybko) albo 1 (normalnie).`;
                }

                const value = parseNumber(args[1], 'tempo');

                if (value < 0 || value > 500) {
                    throw new CommandError('Tempo: od 0 (nie rosną) do 500 (1 = normalnie).');
                }

                growth.speed = value;

                return `Tempo wzrostu krzaków: x${value}` +
                    (value > 0 ? ` - etap średnio co ${decimal(BUSH_GROWTH_SECONDS / value)} s.` : ' - nie rosną.');

            }


            if (['rosnij', 'grow'].includes(word)) {

                const stages = args[1] === undefined ? 1 : Math.floor(parseNumber(args[1], 'liczba etapów'));

                if (stages < 1 || stages > 3) {
                    throw new CommandError('Etapy: od 1 do 3 (3 = od sadzonki do pełnego owoców).');
                }

                const count = growth.growAround(player.pos.x, player.pos.z, BUSH_COMMAND_RADIUS, stages);

                return count > 0
                    ? `Urosło: ${count} (krzaki do ${BUSH_COMMAND_RADIUS} bloków od ciebie).`
                    : `W promieniu ${BUSH_COMMAND_RADIUS} bloków nie ma rosnących krzaków.`;

            }


            if (['ogrod', 'garden', 'pokaz'].includes(word)) {
                return plantBushGarden(player, world);
            }


            if (['znajdz', 'find'].includes(word)) {

                const found = nearestBush(world, player.pos, (bush) => bush.stage >= 2);

                if (!found) {
                    return 'We wczytanych chunkach nie ma krzaków z owocami. Ogródek do obejrzenia: /krzaki ogrod.';
                }

                const { x, y, z, type, distance } = found;

                return `Najbliższy: ${getBlockLabel(type)} - ${Math.round(distance)} bloków ` +
                    `${directionName(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z)} (${x} ${y} ${z}). ` +
                    `Teleport: /tp ${x} ${y + 1} ${z}`;

            }


            if (word) {
                throw usageError(this);
            }


            // Ile krzaków w okolicy, w jakim etapie.

            const counts = countBushes(world, player.pos, BUSH_COMMAND_RADIUS);

            const total = counts.reduce((sum, value) => sum + value, 0);

            return `Krzaki do ${BUSH_COMMAND_RADIUS} bloków od ciebie: ${total}` +
                (total > 0 ? ` (sadzonki ${counts[0]}, bez owoców ${counts[1]}, kilka owoców ${counts[2]}, pełne owoców ${counts[3]})` : '') +
                `. Teraz rośnie: ${growth.countGrowing(true)} (posadzone i te, z których zbierałeś - dzikie czekają). ` +
                `Tempo wzrostu: x${growth.speed} (etap średnio co ${BUSH_GROWTH_SECONDS} s). ` +
                'Zbieranie: PPM na krzaku z owocami. Sadzenie: PPM owocem na ziemi.';

        },

        complete(args) {
            return args.length === 1 ? ['rosnij', 'tempo', 'ogrod', 'znajdz'] : args.length === 2 && simplify(args[0]) === 'tempo' ? ['1', '10', '60'] : [];
        }
    },


    {
        name: 'rosliny',
        aliases: ['roslina', 'plants'],
        usage: '/rosliny | /rosliny <roslina> | /rosliny ogrod [roslina] | /rosliny znajdz <roslina> | /rosliny bledy',
        description: 'Kwiaty, zioła, porosty i huby (rosną etapami, dają plony): lista z rozmiarami, opis rośliny z zastosowaniem plonu, ogródek ze wszystkimi etapami przed tobą, najbliższa roślina we wczytanym terenie, błędy w plikach roślin (assets/rosliny/).',

        run(args, { player, world }) {

            const word = simplify(args[0] ?? '');


            if (['bledy', 'errors'].includes(word)) {

                return PLANT_PACK_ERRORS.length === 0
                    ? `Pliki roślin bez błędów (${PLANT_PACKS.length}).`
                    : `Błędy w plikach roślin:\n${PLANT_PACK_ERRORS.map((error) => `- ${error}`).join('\n')}`;

            }


            if (['ogrod', 'garden', 'pokaz'].includes(word)) {

                const pack = args[1] === undefined ? null : plantPackByWord(args[1]);

                if (args[1] !== undefined && !pack) {
                    throw new CommandError(`Nie ma rośliny "${args[1]}" - lista: /rosliny.`);
                }

                if (PLANT_PACKS.length === 0) {
                    throw new CommandError('Nie ma roślin (assets/rosliny/lista.json).');
                }

                return plantPackGarden(player, world, pack ? [pack] : PLANT_PACKS);

            }


            if (['znajdz', 'find'].includes(word)) {

                const pack = plantPackByWord(args[1]);

                if (!pack) {
                    throw new CommandError(`Podaj roślinę: /rosliny znajdz ${PLANT_PACKS[0]?.id ?? '<roslina>'}.`);
                }

                const found = nearestPlantPack(world, player.pos, pack);

                if (!found) {
                    return `We wczytanym terenie nie ma: ${pack.label.toLowerCase()}. Rośnie w biomach: ${pack.where ? plantBiomesText(pack) : 'nigdzie sama (tylko posadzona)'}.`;
                }

                const { x, y, z, distance, stage } = found;

                return `Najbliższy: ${pack.stages[stage].label} - ${Math.round(distance)} bloków ` +
                    `${directionName(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z)} (${x} ${y} ${z}). Teleport: /tp ${x} ${y + 1} ${z}`;

            }


            if (word) {

                const pack = plantPackByWord(word);

                if (!pack) {
                    throw usageError(this);
                }

                const stages = pack.stages.map((stage, index) =>
                    `${index + 1}. ${stage.label} - ${blocksSize(stage.width)} x ${blocksSize(stage.height)} bloku (${stage.width} x ${stage.height} px${stage.tuft ? ', kępka z pikseli' : ''}, /daj ${plantStageType(pack, index)})`);

                return `${pack.label} (${pack.folder}): ${pack.about || 'roślina'}.\n` +
                    stages.join('\n') +
                    `\nRośnie: etap średnio co ${pack.growthSeconds ?? BUSH_GROWTH_SECONDS} s (wyższy etap tylko z wolnym miejscem nad sobą).` +
                    (pack.seasons ? `\nPora roku: pąki i kwiaty widać w porach: ${pack.seasons.map((index) => SEASON_NAMES[SEASONS[index]]).join(', ')} (wtedy rośnie ${pack.seasonBoost} x szybciej); poza nimi same liście i odpoczynek (/pora).` : '\nPora roku: wygląda i rośnie tak samo cały rok.') +
                    (pack.closesAtNight ? '\nNa noc zamyka kwiaty (widać pąki); zbiór za dnia.' : '') +
                    (pack.pricks ? '\nKłuje: wejście w roślinę z pąkami albo kwiatami na chwilę spowalnia.' : '') +
                    (pack.item ? `\nPrzedmiot: ${pack.item.label} (/daj ${pack.item.type})` +
                        (pack.harvest ? ` - PPM na ostatnim etapie: ${pack.harvest.count[0]}-${pack.harvest.count[1]} szt., roślina wraca do etapu ${pack.harvest.back + 1}` : '') +
                        `\nDo czego: ${itemUses(pack.item.type).join('; ') || 'na razie do niczego'}` : '') +
                    (pack.where ? `\nGdzie rośnie: ${plantBiomesText(pack)} (/rosliny znajdz ${pack.id})` : '') +
                    `\nNumery bloków: ${pack.firstId}-${pack.firstId + pack.stages.length - 1}.`;

            }


            if (PLANT_PACKS.length === 0) {
                return 'Nie ma roślin (assets/rosliny/lista.json, instrukcja: docs/rosliny.md).';
            }

            return `Kwiaty, zioła, porosty i huby (${PLANT_PACKS.length}): ` +
                PLANT_PACKS.map((pack) => {
                    const top = pack.stages[pack.stages.length - 1];
                    return `${pack.label} (${pack.id}, do ${blocksSize(top.height)} bloku wysokości)`;
                }).join(', ') +
                '. Opis: /rosliny <roslina>, ogródek: /rosliny ogrod' +
                (PLANT_PACK_ERRORS.length > 0 ? `. Błędy w plikach roślin: ${PLANT_PACK_ERRORS.length} (/rosliny bledy).` : '.');

        },

        complete(args) {

            const names = PLANT_PACKS.map((pack) => pack.id);

            if (args.length === 1) {
                return ['ogrod', 'znajdz', 'bledy', ...names];
            }

            return args.length === 2 && ['ogrod', 'znajdz'].includes(simplify(args[0])) ? names : [];

        }
    },


    {
        name: 'drzewa',
        aliases: ['drzewo', 'trees', 'tree', 'las'],
        usage: '/drzewa lista | /drzewa las <gatunek> [liczba 1-36] [seed] | /drzewa warianty <gatunek> [seed] | /drzewa porownanie [seed] | /drzewa ostatnie | /drzewa cofnij | /drzewa posadz <gatunek> [rozmiar 0-100] | /drzewa aleja | /drzewa znajdz <gatunek> [tp] | /drzewa rosnij | /drzewa tempo <0-500>',
        description: 'Lista gatunków, losowy las jednego gatunku (domyślnie 16 drzew), pokaz rozmiarów i stanów specjalnych, wszystkie gatunki obok siebie. Pokazy sadzą na wolnej ziemi przed graczem; nie wycinają istniejących drzew ani budowli. Najwygodniej oglądać na płaskiej trawie obok placu testowego. Seed odtwarza zestaw, ostatnie przypomina pozycje, cofnij usuwa ostatni pokaz w tej sesji. Pozostałe opcje: pojedyncze drzewo, aleja, wyszukiwanie, wzrost.',

        run(args, { game, player, world, chat }) {

            const word = simplify(args[0] ?? '');

            const growth = game.plantGrowth;

            if (word === 'lista') {
                if (args.length !== 1) throw new CommandError('Użycie: /drzewa lista');
                return treeCatalogText();
            }

            if (['las', 'warianty', 'porownanie', 'ostatnie', 'cofnij'].includes(word)) {
                return runTreeShowcase(args, { world, player, chat });
            }


            if (['posadz', 'plant', 'wyhoduj', 'postaw'].includes(word) || TREE_WORDS[word]) {

                const species = treeSpecies(TREE_WORDS[word] ? args[0] : args[1]);

                const sizeArg = TREE_WORDS[word] ? args[1] : args[2];

                const size = sizeArg === undefined ? 0.4 + Math.random() * 0.5 : parseNumber(sizeArg, 'rozmiar') / 100;

                if (size < 0 || size > 1) {
                    throw new CommandError('Rozmiar: od 0 (małe) do 100 (duże).');
                }

                const { forwardX, forwardZ } = lookAxes(player);

                const x = Math.floor(player.pos.x) + forwardX * 5;
                const z = Math.floor(player.pos.z) + forwardZ * 5;

                const tree = growTreeAt(world, species, x, z, size, true);

                if (!tree) {
                    throw new CommandError('Tu drzewo się nie zmieści (za wysoko albo pod wodą?).');
                }

                return `Wyrosło: ${TREE_SPECIES[species].species[0].toLowerCase()} (${tree.shape.top + 1} bloków wysokości) na ${x} ${tree.y} ${z}.`;

            }


            if (['aleja', 'pokaz', 'alley', 'ogrod'].includes(word)) {
                return plantTreeAlley(player, world);
            }


            // Compatibility alias for the former diagnostic command.
            if (['paczki', 'paczka', 'packs'].includes(word)) {
                return treeCatalogText();
            }


            if (['znajdz', 'find'].includes(word)) {

                const species = treeSpecies(args[1]);

                if (!world.generator.forests) {
                    throw new CommandError('Lasy rosną tylko w terenie realistycznym (sadzonki rosną wszędzie).');
                }

                const teleport = args.slice(2).some((arg) => simplify(arg) === 'tp');

                const found = findTree(world, species, Math.floor(player.pos.x), Math.floor(player.pos.z), TREE_FIND_RADIUS);

                if (!found) {
                    throw new CommandError(`W promieniu ${TREE_FIND_RADIUS} bloków nie ma drzewa: ${TREE_SPECIES[species].short}.`);
                }

                const { x, y, z, distance } = found;

                if (teleport) {

                    // Obok pnia, na ziemi.

                    const sx = x + 2;

                    const sy = groundAt(world, sx, z);

                    player.pos.set(sx + 0.5, sy, z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.updateCamera();

                    return `Przeniesiono pod drzewo: ${TREE_SPECIES[species].species[0].toLowerCase()} na ${x} ${y} ${z}.`;

                }

                return `Najbliższe drzewo (${TREE_SPECIES[species].short}): ${Math.round(distance)} bloków ` +
                    `${directionName(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z)} (pień na ${x} ${y} ${z}). ` +
                    `Przeniesienie: /drzewa znajdz ${simplify(args[1])} tp`;

            }


            if (['rosnij', 'grow'].includes(word)) {

                const count = growth.growAround(player.pos.x, player.pos.z, TREE_COMMAND_RADIUS, 1);

                return count > 0
                    ? `Urosło: ${count} (sadzonki i krzaki do ${TREE_COMMAND_RADIUS} bloków od ciebie; sadzonka bez miejsca nad sobą czeka).`
                    : `W promieniu ${TREE_COMMAND_RADIUS} bloków nie ma sadzonek (albo nad żadną nie ma miejsca na drzewo).`;

            }


            if (word === 'tempo') {

                if (args[1] === undefined) {
                    return `Tempo wzrostu roślin: x${growth.speed}. Zmiana: /drzewa tempo 60 (szybko) albo 1 (normalnie).`;
                }

                const value = parseNumber(args[1], 'tempo');

                if (value < 0 || value > 500) {
                    throw new CommandError('Tempo: od 0 (nie rosną) do 500 (1 = normalnie).');
                }

                growth.speed = value;

                return `Tempo wzrostu roślin (sadzonki i krzaki): x${value}` +
                    (value > 0 ? ` - sadzonka wyrasta średnio po ${durationText(TREE_GROWTH_SECONDS / value)}.` : ' - nie rosną.');

            }


            if (word) {
                throw usageError(this);
            }


            // Co rośnie w okolicy.

            const x = Math.floor(player.pos.x);
            const z = Math.floor(player.pos.z);

            const species = TREE_NAMES.map(treeName).join(', ');

            if (!world.generator.forests) {

                return `Drzewa: ${species}. W terenie klasycznym nie ma lasów - posadź drzewo (/drzewa posadz <gatunek>) ` +
                    `albo sadzonkę (wyrośnie średnio po ${durationText(TREE_GROWTH_SECONDS)}).`;

            }

            const counts = countTrees(world, x, z, TREE_COMMAND_RADIUS);

            const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

            const here = world.generator.describe(x, z).forest;

            return `Drzewa do ${TREE_COMMAND_RADIUS} bloków od ciebie: ${total}` +
                (total > 0 ? ` (${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${treeName(name)} ${count}`).join(', ')})` : '') +
                `. Tutaj: ${here.species ? `las ${Math.round(here.density * 100)}% (przeważa ${treeName(here.species)})` : 'brak lasu'}. ` +
                `Gatunki: ${species} - /drzewa znajdz <gatunek>, /mapa lasy. ` +
                `Sadzonka wyrasta średnio po ${durationText(TREE_GROWTH_SECONDS / Math.max(growth.speed, 0.001))}; ` +
                'szyszki, orzeszki, żołędzie i kwiat lipy też można posadzić.';

        },

        complete(args) {

            const species = TREE_NAMES.map((name) => simplify(TREE_SPECIES[name].short));

            if (args.length === 1) return ['lista', 'las', 'warianty', 'porownanie', 'ostatnie', 'cofnij', 'posadz', 'aleja', 'znajdz', 'rosnij', 'tempo', ...species];
            if (args.length === 2 && ['las', 'warianty', 'posadz', 'znajdz'].includes(simplify(args[0]))) return species;
            if (args.length === 3 && simplify(args[0]) === 'las') return ['9', '16', '25', '36'];
            if ((args.length === 4 && simplify(args[0]) === 'las') ||
                (args.length === 3 && simplify(args[0]) === 'warianty') ||
                (args.length === 2 && simplify(args[0]) === 'porownanie')) return ['12345'];
            if (args.length === 3 && simplify(args[0]) === 'znajdz') return ['tp'];
            if (args.length === 3 && simplify(args[0]) === 'posadz') return ['20', '60', '100'];
            if (args.length === 2 && simplify(args[0]) === 'tempo') return ['1', '10', '60'];

            return [];

        }
    },


    {
        name: 'wypelnij',
        aliases: ['fill'],
        usage: '/wypelnij <x1> <y1> <z1> <x2> <y2> <z2> <blok | powietrze>   (~ = względem gracza)',
        description: 'Wypełnia prostopadłościan blokami (do 16384 bloków).',

        run(args, { player, world }) {

            if (args.length !== 7) {
                throw usageError(this);
            }

            const p = player.pos;

            const [x1, y1, z1, x2, y2, z2] = args.slice(0, 6).map((text, i) =>
                Math.floor(parseCoordinate(text, [p.x, p.y, p.z][i % 3]))
            );

            const type = blockArgument(args[6]);


            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            const minY = Math.max(0, Math.min(y1, y2)), maxY = Math.min(CHUNK_HEIGHT - 1, Math.max(y1, y2));
            const minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);

            const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);

            if (volume > 16384) {
                throw new CommandError(`Za dużo bloków: ${volume} (najwyżej 16384).`);
            }


            // Bloki stawiamy od dołu, a usuwamy od góry - tak światło
            // nieba przelicza się najszybciej.

            let changed = 0;

            for (let i = 0; i <= maxY - minY; i++) {

                const y = type ? minY + i : maxY - i;

                for (let x = minX; x <= maxX; x++) {

                    for (let z = minZ; z <= maxZ; z++) {

                        if (type === null ? world.clearBlock(x, y, z) : world.setBlock(x, y, z, type)) {
                            changed++;
                        }

                    }

                }

            }

            return `Zmieniono ${changed} bloków.`;

        },

        complete(args) {
            return args.length === 7 ? [...BLOCK_NAMES, 'powietrze'] : ['~'];
        }
    }

];
