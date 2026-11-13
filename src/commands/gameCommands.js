import * as THREE from 'three';
import { STATES, CONDITION_MIN, CONDITION_MAX } from '../game/Wellbeing.js';
import { LIGHTING_VIEWS, setLightingView, setLightingComponent, resetLightingDiagnostics } from '../rendering/LightingDiagnostics.js';

import {
    CommandError,
    simplify
} from './CommandRegistry.js';

import {
    BLOCK_TYPES,
    FRUIT_BUSHES,
    blockExists,
    bushStages,
    getBlockDefinition,
    getBlockId,
    getBlockTypeById,
    getBlockLabel,
    getBlockSound,
    getBreakTime,
    getBestTool,
    isLiquidId
} from '../blocks/BlockRegistry.js';

import { waterUniforms } from '../rendering/BlockRenderData.js';

import {
    ITEM_TYPES,
    itemExists,
    getItemLabel
} from '../items/ItemRegistry.js';

import { STACK_SIZE } from '../game/Inventory.js';

import {
    RECIPE_LIST,
    craftFromInventory,
    getRecipe,
    recipeText,
    recipesFor,
    recipesUsing,
    maxCrafts,
    stockOf
} from '../crafting/Crafting.js';

import { CATEGORIES, getCategory } from '../items/categories.js';

import { FLIGHT_SECONDS } from '../game/Meteorites.js';

import { SOUNDS, BLOCK_MATERIALS } from '../audio/sounds.js';

import {
    describeLight
} from '../world/Light.js';

import {
    findEclipses,
    nextNewMoonCycle,
    newMoonDays,
    sunCoverage,
    SUN_RADIUS,
    MOON_RADIUS
} from '../sky/Celestial.js';

import {
    SETTINGS_DEFAULTS,
    SETTINGS_RANGES,
    SETTINGS_CHOICES,
    GRAPHICS_PRESETS,
    graphicsPreset
} from '../settings/Settings.js';

import { TEXTS } from '../ui/texts.js';

import { SCENES, SCENE_TIMES, findScene, buildScene } from '../dev/scenes.js';

import { compareVersions, megabytes } from '../app/AndroidUpdates.js';

import {
    resolutionChoices,
    resolutionName,
    chooseTexturePack,
    setTextureResolution,
    resetTexturePack,
    openTemplate,
    describeTextures
} from '../app/textures.js';

import { getPackInfo } from '../rendering/TexturePacks.js';

import { LANDFORMS, RELIEFS } from '../world/terrain/landforms.js';

import { terrainName } from '../world/terrain/generators.js';

import { MAP_LAYERS, MAP_SCALES } from '../ui/TerrainMap.js';

import { ROCK_INFO, blockNamePl, blockFromWord } from '../world/terrain/rocks.js';

import { BIOMES, BIOME_KEYS, LAND_BIOMES, biomeByWord } from '../world/terrain/Biomes.js';

import { chooseSkinFile, resetSkin, hasCustomSkin } from '../player/skin.js';

import { TREE_SPECIES, TREE_NAMES } from '../blocks/trees.js';

import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';

import { PLANT_PACKS, PLANT_PACK_ERRORS, PLANT_PIXELS, plantStageType, getPlantPack } from '../blocks/plantPacks.js';

import { plantTree } from '../world/trees/plantTree.js';
import { startTreeShowcase, getTreeShowcase, undoTreeShowcase } from '../world/trees/TreeShowcase.js';

import { LOD_LEGEND } from '../world/FarTerrain.js';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER,
    DAY_LENGTH_MINUTES,
    BUSH_GROWTH_SECONDS,
    TREE_GROWTH_SECONDS,
    WATER_WAVE_HEIGHT,
    UI_THEMES,
    POTATO_RENDER_SCALE,
    POTATO_VIEW_DISTANCE,
    POTATO_STAR_SHARE,
    SPACE_FULL,
    SPACE_MAX_ALTITUDE,
    SKYFALL_START,
    CREATIVE_REPEAT_SECONDS,
    isCreative
} from '../config.js';

import { skyfallSpeed } from '../player/Player.js';

import { ACHIEVEMENTS, TIERS, TIER_ORDER } from '../achievements/list.js';

import { findAchievement } from '../achievements/AchievementBook.js';

// ------------------------------------------------------------
// KOMENDY GRY
//
// Każda nowa rzecz w grze powinna dostać tu komendę, którą da
// się ją szybko sprawdzić (patrz docs/komendy.md). Opis budowy
// komendy jest w CommandRegistry.js.
// ------------------------------------------------------------

// --- Pomocnicze ---------------------------------------------

function usageError(command) {

    return new CommandError(`Użycie: ${command.usage}`);

}


function parseNumber(text, what = 'liczba') {

    const value = Number(String(text ?? '').replace(',', '.'));

    if (text === undefined || !Number.isFinite(value)) {
        throw new CommandError(`To nie jest ${what}: "${text ?? ''}"`);
    }

    return value;

}


// Współrzędna: liczba albo ~ / ~5 / ~-3 (względem gracza).

function parseCoordinate(text, current) {

    if (text === undefined) {
        throw new CommandError('Brakuje współrzędnej');
    }

    if (text.startsWith('~')) {
        return current + (text.length > 1 ? parseNumber(text.slice(1), 'współrzędna') : 0);
    }

    return parseNumber(text, 'współrzędna');

}


// Kolory do wpisania nazwą (albo #rrggbb).

const COLOR_NAMES = {
    czerwony: '#ff3020',
    krwawy: '#c41a10',
    pomaranczowy: '#ff8a20',
    zloty: '#ffc040',
    zolty: '#ffe040',
    zielony: '#40ff60',
    turkusowy: '#30e0d0',
    niebieski: '#3a70ff',
    fioletowy: '#a050ff',
    rozowy: '#ff70c0',
    bialy: '#ffffff'
};

const DEFAULT_WORDS = ['domyslny', 'default', 'zwykly'];


// Zwraca THREE.Color albo null (= domyślny kolor).

function parseColor(text) {

    if (text === undefined) {
        throw new CommandError('Podaj kolor, np. czerwony albo #ff3020');
    }

    const name = simplify(text);

    if (DEFAULT_WORDS.includes(name)) {
        return null;
    }

    const hex = COLOR_NAMES[name] ?? text;

    if (!/^#?[0-9a-f]{6}$/i.test(hex)) {

        throw new CommandError(
            `Nieznany kolor "${text}". Wpisz #rrggbb albo: ` +
            `${Object.keys(COLOR_NAMES).join(', ')}, domyslny`
        );

    }

    return new THREE.Color(hex.startsWith('#') ? hex : `#${hex}`);

}


function colorName(color) {

    return color ? `#${color.getHexString()}` : 'domyślny';

}


// Pory dnia do wpisania nazwą (ułamek doby).

const TIME_NAMES = {
    polnoc: 0,
    wschod: 0.255,
    rano: 7 / 24,
    poludnie: 0.5,
    popoludnie: 15 / 24,
    zachod: 0.745,
    wieczor: 20 / 24,
    noc: 22 / 24
};


// "18:30", "18", "rano" -> ułamek doby

function parseClock(text) {

    if (text === undefined) {
        throw new CommandError('Podaj godzinę, np. 18:30, albo porę: ' + Object.keys(TIME_NAMES).join(', '));
    }

    const name = simplify(text);

    if (name in TIME_NAMES) {
        return TIME_NAMES[name];
    }

    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(text);

    if (!match || Number(match[1]) > 23 || Number(match[2] ?? 0) > 59) {
        throw new CommandError(`Nie rozumiem godziny "${text}" (np. 18:30)`);
    }

    return (Number(match[1]) * 60 + Number(match[2] ?? 0)) / (24 * 60);

}


// "2" (godziny), "-1.5", "30m" -> godziny

function parseHours(text) {

    if (text !== undefined && /m$/i.test(text)) {
        return parseNumber(text.slice(0, -1), 'liczba minut') / 60;
    }

    return parseNumber(text, 'liczba godzin');

}


// Godzina z ułamka doby, np. 0.75 -> "18:00".

function clockText(fraction) {

    const minutes = Math.round((((fraction % 1) + 1) % 1) * 24 * 60) % (24 * 60);

    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

}


// Fazy księżyca do wpisania (kolejność jak w Celestial.MOON_PHASE_NAMES).

const PHASE_WORDS = [
    'now',
    'sierp',
    'kwadra',
    'garb',
    'pelnia',
    'ubywajacy-garb',
    'ostatnia-kwadra',
    'ubywajacy-sierp'
];


// Polskie nazwy bloków (label) bez ogonków, spacje -> _:
// mak, chaber, paproc, czarnoziem, krotka_trawa, sciolka_lesna...

const LABEL_WORDS = new Map(
    Object.keys(BLOCK_TYPES).map((type) => [simplify(getBlockLabel(type)).replace(/\s+/g, '_'), type])
);


// Przedmioty (owoce) po polsku: truskawki / truskawka, jezyny / jezyna,
// papryczki_chili / chili / papryczka, orzech_laskowy / orzech / orzechy.

const ITEM_WORDS = new Map([
    ...Object.keys(ITEM_TYPES).map((type) => [simplify(getItemLabel(type)).replace(/\s+/g, '_'), type]),
    ['truskawka', 'strawberry'],
    ['jezyna', 'blackberry'],
    ['chili', 'chili_pepper'],
    ['papryczka', 'chili_pepper'],
    ['papryczki', 'chili_pepper'],
    ['orzech', 'hazelnut'],
    ['orzechy', 'hazelnut']
]);


function blockArgument(text) {

    const word = simplify(text ?? '');

    if (['powietrze', 'air', 'nic'].includes(word)) {
        return null;
    }

    // Polskie nazwy też działają: granit, wapien, piaskowiec, trawa,
    // mak, paproc...

    const name = blockFromWord(word) ?? LABEL_WORDS.get(word) ?? word;

    if (!blockExists(name)) {
        throw new CommandError(`Nie ma bloku "${text ?? ''}". Lista: /bloki`);
    }

    return name;

}


const BLOCK_NAMES = Object.keys(BLOCK_TYPES);


// KOPANIE (/kopanie): czas w sekundach po polsku ("2,2 s").

function seconds(time) {

    return `${String(Math.round(time * 100) / 100).replace('.', ',')} s`;

}


// Nazwy grup bloków (materiał dźwięku) w liście czasów kopania. Skały
// (i bloki z własną twardością) - każda swoją nazwą.

const MINING_GROUPS = {
    grass: 'trawa',
    dirt: 'ziemia',
    sand: 'piasek',
    gravel: 'żwir',
    mud: 'błoto i glina',
    glass: 'lampy',
    wood: 'drewno (pnie i deski)',
    plant: 'rośliny'
};


// Narzędzie w narzędniku ("kilofem 0,73 s").

const TOOL_WITH = {
    axe: 'siekierą',
    pickaxe: 'kilofem',
    shovel: 'łopatą'
};


function miningList() {

    const groups = new Map();

    for (const type of BLOCK_NAMES) {

        if (isLiquidId(getBlockId(type))) {
            continue;
        }

        const definition = getBlockDefinition(type);

        const time = getBreakTime(type);

        const material = getBlockSound(type);

        const name =
            definition.model === 'leaves' ? 'liście' :
            definition.hardness === undefined && MINING_GROUPS[material] ? MINING_GROUPS[material] :
            getBlockLabel(type).toLowerCase();

        if (!groups.has(time)) {
            groups.set(time, new Set());
        }

        const tool = getBestTool(type);

        groups.get(time).add(name + (tool && time > 0 ? ` - ${TOOL_WITH[tool]} ${seconds(getBreakTime(type, tool))}` : ''));

    }

    return 'Kopanie w trybie przygody (trzymany LPM):\n' + [...groups.keys()]
        .sort((a, b) => a - b)
        .map((time) => `${time > 0 ? seconds(time) : 'od razu'}: ${[...groups.get(time)].join(', ')}`)
        .join('\n');

}


function miningText(type, game) {

    const time = getBreakTime(type);

    const label = getBlockLabel(type);

    if (time <= 0) {
        return `${label}: znika od razu - wystarczy kliknąć.`;
    }

    let text = `${label}: kopanie ${seconds(time)}`;

    const tool = getBestTool(type);

    if (tool) {
        text += ` (${TOOL_WITH[tool]} ${seconds(getBreakTime(type, tool))})`;
    }

    return text + '. ' + (
        game.mode === 'adventure'
            ? 'Trzymaj LPM - blok pęka i po tym czasie znika (puszczony LPM - od nowa).'
            : `W trybie kreatywnym bloki znikają od razu (trzymany LPM - kolejny co ${seconds(CREATIVE_REPEAT_SECONDS)}).`
    );

}

const ITEM_NAMES = Object.keys(ITEM_TYPES);


// Blok albo przedmiot (do ekwipunku: /daj).

function itemArgument(text) {

    const word = simplify(text ?? '');

    const item = ITEM_WORDS.get(word) ?? word;

    if (itemExists(item)) {
        return item;
    }

    if (!word) {
        return null;
    }

    try {
        return blockArgument(text);
    }
    catch {
        throw new CommandError(`Nie ma bloku ani przedmiotu "${text}". Lista: /bloki`);
    }

}


const ON_WORDS = ['wl', 'on', 'tak', '1', 'true'];

// /aktualizacja.
const UPDATE_WORDS = ['sprawdz', 'pobierz', 'instaluj', 'wroc'];

// /tekstury.
const TEXTURE_WORDS = ['wczytaj', 'rozdzielczosc', 'oryginalne', 'szablon', 'lista'];
const OFF_WORDS = ['wyl', 'off', 'nie', '0', 'false'];


// Ile prawdziwych sekund trwa `hours` godzin gry (przy obecnej
// prędkości czasu; Infinity, gdy czas stoi).

function realSeconds(hours, time) {

    return time.speed > 0
        ? hours / 24 * DAY_LENGTH_MINUTES * 60 / time.speed
        : Infinity;

}


// Liczba z jednym miejscem po przecinku (po polsku: 1,5).

function decimal(value) {

    return value.toFixed(1).replace('.', ',');

}


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


function treeName(species) {

    return TREE_SPECIES[species].short;

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


function durationText(seconds) {

    if (!Number.isFinite(seconds)) {
        return 'czas stoi';
    }

    if (seconds < 90) {
        return `${Math.round(seconds)} s`;
    }

    if (seconds < 90 * 60) {
        return `${Math.round(seconds / 60)} min`;
    }

    return `${decimal(seconds / 3600)} h`;

}


// Opis zaćmienia z listy findEclipses (Celestial.js).

function eclipseText(eclipse) {

    const day = Math.floor(eclipse.days) + 1;

    const kind = eclipse.total ? 'PEŁNE' : `częściowe (${Math.round(eclipse.coverage * 100)}%)`;

    return `dzień ${day}, ${clockText(eclipse.days)} - ${kind}` +
        `${eclipse.visible ? '' : ' (słońce pod horyzontem - nie widać)'}`;

}


// Szerokość księżyca (stopnie), przy której zaćmienie zasłania
// `coverage` tarczy słońca (0-1).

function latitudeForCoverage(coverage) {

    if (coverage >= 1) {
        return 0;
    }

    let low = MOON_RADIUS - SUN_RADIUS;
    let high = SUN_RADIUS + MOON_RADIUS;

    for (let i = 0; i < 40; i++) {

        const middle = (low + high) / 2;

        if (sunCoverage(middle) > coverage) {
            low = middle;
        }
        else {
            high = middle;
        }

    }

    return (low + high) / 2;

}


// Formy terenu do wpisania w /teren znajdz (bez polskich znaków).
// Część słów to pasy wysokości (niziny, wyżyny, góry, morze).

const LANDFORM_WORDS = {
    morze: { relief: 'sea' },
    wybrzeze: { landform: 'coast' },
    plaza: { landform: 'coast' },
    nizina: { relief: 'lowland' },
    wyzyna: { relief: 'upland' },
    gory: { relief: 'mountains' },
    zbocze: { landform: 'mountains' },
    grzbiet: { landform: 'ridge' },
    turnia: { landform: 'crag' },
    wzgorze: { landform: 'hill' },
    pagorek: { landform: 'hillock' },
    dolina: { landform: 'valley' },
    kotlina: { landform: 'basin' },
    zleb: { landform: 'gully' },
    depresja: { landform: 'depression' },
    rownina: { landform: 'plain' },
    rownia: { landform: 'flat' },
    plaskowyz: { landform: 'plateau' },
    rzeka: { landform: 'river' },
    jezioro: { landform: 'lake' }
};

const SURFACE_NAMES = {
    grass: 'ziemia (trawa, ściółka, mech...)',
    riverbed: 'dno rzeki albo jeziora',
    rock: 'skała',
    sand: 'piasek',
    seabed: 'dno morza (piasek)',
    water: 'woda'
};


// Opis miejsca z generatora (do /teren).

function terrainText(world, x, z) {

    const generator = world.generator;

    const info = generator.describe(x, z);

    const sea = generator.seaLevel;

    const fields = Object.entries(info.fields)
        .map(([name, value]) => `${name} ${value.toFixed(2)}`)
        .join(', ');

    return `Teren: ${terrainName(world.terrain)} | ${x}, ${z} | wysokość ${info.height}` +
        `${sea !== null ? ` (${info.height - sea >= 0 ? '+' : ''}${info.height - sea} nad morzem)` : ''} | ` +
        `${RELIEFS[info.relief] ?? info.relief} | forma: ${LANDFORMS[info.landform]?.name ?? info.landform} | ` +
        `powierzchnia: ${SURFACE_NAMES[info.surface] ?? info.surface}` +
        (BIOMES[info.biome] ? ` | biom: ${BIOMES[info.biome].name} (/biom)` : '') +
        (info.rock ? ` | skała pod spodem: ${blockNamePl(info.rock)} (/skaly)` : '') +
        (info.forest?.species
            ? ` | las: ${Math.round(info.forest.density * 100)}% kratek z drzewem, przeważa ${treeName(info.forest.species)} (/drzewa)`
            : '') +
        (fields ? `\nPola: ${fields}` : '');

}


// Kolumna bloków (x, z) z generatora jako tekst: od góry, kolejne
// bloki tej samej skały razem - np. "trawa 1, ziemia 3, wapień 8 (y 50-57)".

function columnText(generator, x, z) {

    const { blocks, top } = generator.columnBlocks(x, z);

    const runs = [];

    for (let y = top; y >= 0; y--) {

        const type = getBlockTypeById(blocks[y]);

        const last = runs[runs.length - 1];

        if (last && last.type === type) {
            last.bottom = y;
        }
        else {
            runs.push({ type, top: y, bottom: y });
        }

    }


    const lepidolite = runs.filter((run) => run.type === 'lepidolite');

    const text = runs.map(({ type, top: from, bottom }) =>
        `${blockNamePl(type)} ${from - bottom + 1} (y ${bottom === from ? from : `${bottom}-${from}`})`
    ).join(', ');

    return `Kolumna ${x}, ${z} od góry: ${text}` +
        (lepidolite.length > 0
            ? ` | Lepidolit: ${lepidolite.reduce((sum, run) => sum + run.top - run.bottom + 1, 0)} bl.`
            : ' | Lepidolitu tu nie ma (/skaly zyla - najbliższa żyła).');

}


// Punkty na pierścieniach coraz dalej od (x0, z0), co `step` bloków.
// test(x, z) zwraca wynik albo null - pierwszy wynik kończy szukanie.

function searchRings(x0, z0, maxRadius, step, test) {

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            const result = test(x, z);

            if (result) {
                return { x, z, distance: radius, ...result };
            }

        }

    }

    return null;

}


// Najbliższe miejsce z formą terenu (szukanie coraz dalej).

function findLandform(generator, x0, z0, target, maxRadius) {

    // Rzeki są wąskie - szukamy ich w sieci rzek, nie co kilka bloków.

    if ((target.landform === 'river' || target.landform === 'lake') && generator.rivers) {

        const found = target.landform === 'river'
            ? generator.rivers.nearest(x0, z0, maxRadius)
            : generator.rivers.nearestLake(x0, z0, maxRadius);

        if (!found) {
            return null;
        }

        const spot = target.landform === 'river' ? found : riverBank(generator, found.x, found.z);

        return { x: spot.x, z: spot.z, info: generator.describe(found.x, found.z), distance: Math.round(found.distance) };

    }

    const step = 12;

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            const info = generator.describe(x, z);

            if (
                (target.landform && info.landform === target.landform) ||
                (target.relief && info.relief === target.relief)
            ) {
                return { x, z, info, distance: radius };
            }

        }

    }

    return null;

}


// Najbliższe miejsce z biomem `target` (klucz z BIOMES) - kawałek w głębi
// biomu (sąsiednie punkty o kilkanaście bloków też w nim), nie na samej
// granicy: { x, z, distance } albo null.

function findBiome(generator, x0, z0, target, maxRadius) {

    const sample = {};

    const inside = (x, z) => generator.biomes.classify(x, z, generator.compute(x, z, 0, sample)) === target;

    const step = 16;

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            if (!inside(x, z)) {
                continue;
            }

            // Woda - wystarczy jedna kolumna (rzeki są wąskie).

            if (BIOMES[target].water) {
                return { x, z, distance: radius };
            }

            let around = 0;

            for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
                around += inside(x + dx, z + dz) ? 1 : 0;
            }

            if (around >= 3) {
                return { x, z, distance: radius };
            }

        }

    }

    return null;

}


// Suche miejsce przy wodzie (x, z) - do teleportu nad rzekę albo
// jezioro: najbliższa kolumna bez wody (szukamy coraz dalej).

function riverBank(generator, x, z) {

    for (let radius = 0; radius <= 96; radius += 2) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / 2);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const bx = Math.round(x + Math.cos(angle) * radius);
            const bz = Math.round(z + Math.sin(angle) * radius);

            const sample = generator.compute(bx, bz, 0, {});

            if (sample.water <= sample.height && !sample.ocean) {
                return { x: bx, z: bz };
            }

        }

    }

    return { x, z };

}


// Widoki kamery (/kamera) i podgląd animacji (/animacja).

const CAMERA_WORDS = {
    oczy: 'first', 'z-oczu': 'first', first: 'first', '1': 'first',
    tyl: 'back', back: 'back', '2': 'back',
    przod: 'front', front: 'front', '3': 'front'
};

const CAMERA_NAMES = {
    first: 'z oczu',
    back: 'zza pleców',
    front: 'z przodu'
};

const ANIMATION_WORDS = {
    stanie: 'idle',
    chodzenie: 'walk',
    bieg: 'run',
    kucanie: 'crouch',
    skradanie: 'sneak',
    skok: 'jump',
    machanie: 'swing',
    latanie: 'fly',
    plywanie: 'swim',
    'plywanie-w-miejscu': 'tread'
};

const ANIMATION_WORDS_PL = Object.fromEntries(
    Object.entries(ANIMATION_WORDS).map(([word, mode]) => [mode, word])
);


// Materiały dźwięków bloków (/dzwiek pokaz): polska nazwa.

const MATERIAL_NAMES = {
    grass: 'trawa',
    dirt: 'ziemia',
    stone: 'kamień',
    sand: 'piasek',
    gravel: 'żwir',
    mud: 'błoto',
    plant: 'rośliny',
    glass: 'szkło (lampy)',
    wood: 'drewno (pnie, deski)'
};

// Słowo z komendy -> materiał (po polsku albo nazwa z sounds.js).

const MATERIAL_WORDS = {
    trawa: 'grass',
    ziemia: 'dirt',
    kamien: 'stone',
    piasek: 'sand',
    zwir: 'gravel',
    bloto: 'mud',
    rosliny: 'plant',
    szklo: 'glass',
    drewno: 'wood',
    ...Object.fromEntries(BLOCK_MATERIALS.map((name) => [name, name]))
};


// Ustawienia do wpisania w /ustaw (polska nazwa -> klucz w Settings).

export const SETTING_WORDS = {
    ziemniak: 'potato',
    imie: 'playerName',
    serwer: 'netServer',
    zasieg: 'viewDistance',
    'daleki-teren': 'farTerrain',
    'szczegoly-terenu': 'farDetail',
    'daleki-teren-szczegoly': 'farDetail',
    pole: 'fov',
    jasnosc: 'brightness',
    rozdzielczosc: 'renderScale',
    fps: 'fpsLimit',
    cienie: 'ambientOcclusion',
    'cienie-slonca': 'shadows',
    promienie: 'lightShafts',
    'swiatlo-odbite': 'bounceLight',
    'model-swiatla': 'lightingModel',
    odbicia: 'surfaceBounce',
    'swiatlo-materialow': 'lightingMaterials',
    atmosfera: 'atmosphereLook',
    'przeswiecanie-lisci': 'leafTransmission',
    'sila-odbicia': 'bounceStrength',
    'nasycenie-odbicia': 'bounceSaturation',
    'trawa-kepiasta': 'bushyGrass',
    liscie: 'fancyLeaves',
    'dynamiczne-swiatlo': 'dynamicLight',
    wczytywanie: 'loadBudget',
    czulosc: 'mouseSensitivity',
    'odwroc-mysz': 'invertMouse',
    motyw: 'theme',
    interfejs: 'hudScale',
    debug: 'showDebug',
    'licznik-fps': 'showFps',
    meteoryty: 'meteorites',
    glosnosc: 'volumeMaster',
    'glosnosc-bloki': 'volumeBlocks',
    'glosnosc-zjawiska': 'volumeWorld',
    'glosnosc-otoczenie': 'volumeWorld',
    'glosnosc-menu': 'volumeUi',
    'warstwa-skorki': 'skinOverlay',
    reka: 'showHand',
    kolysanie: 'viewBobbing',
    zgiecia: 'jointStyle',
    kamera: 'cameraDistance',
    'modele-roslin': 'plantModels',
    wiatr: 'plantWind',
    'animacje-roslin': 'plantAnimations',
    'model-lisci': 'leafModel',
    'spadajace-liscie': 'fallingLeaves',
    'smugi-wiatru': 'windStreaks'
};


// Jakość cieni słońca: słowo -> wartość ustawienia "shadows".

// Szczegóły dalekiego terenu (/horyzont szczegoly, /ustaw szczegoly-terenu).

const FAR_DETAIL_WORDS = {
    niskie: 1,
    nisko: 1,
    srednie: 2,
    wysokie: 3,
    wysoko: 3
};


const SHADOW_WORDS = {
    wyl: 0,
    off: 0,
    nie: 0,
    zwykle: 1,
    dokladne: 2,
    dalekie: 3,
    daleko: 3,
    wl: 3,
    on: 3,
    tak: 3
};


function settingWord(key) {

    return Object.keys(SETTING_WORDS).find((word) => SETTING_WORDS[word] === key) ?? key;

}


function settingText(key, value) {

    return key === 'theme' ? TEXTS.theme(UI_THEMES[value]) : TEXTS[key](value);

}


// Zamienia wpisany tekst na wartość ustawienia (albo rzuca błąd).

function parseSettingValue(key, text) {

    if (text === undefined) {
        throw new CommandError(`Podaj wartość, np. /ustaw ${settingWord(key)} ${SETTINGS_DEFAULTS[key]}`);
    }

    const word = simplify(text);


    // Gra wieloosobowa: imię i adres serwera połączeń jak wpisane
    // ("-" - domyślne).

    if (key === 'playerName' || key === 'netServer') {
        return text === '-' ? '' : text;
    }

    if (key === 'playerId') {
        throw new CommandError('Identyfikator gracza ustawia gra.');
    }


    if (key === 'theme') {

        const theme = Object.keys(UI_THEMES).find(
            (name) => simplify(name) === word || simplify(UI_THEMES[name]) === word
        );

        if (!theme) {
            throw new CommandError(`Motywy: ${Object.keys(UI_THEMES).join(', ')}`);
        }

        return theme;

    }


    if (typeof SETTINGS_DEFAULTS[key] === 'boolean') {

        if (ON_WORDS.includes(word)) return true;
        if (OFF_WORDS.includes(word)) return false;

        throw new CommandError('Wpisz wl albo wyl');

    }


    if (key === 'leafModel') {

        if (['czesci', 'czesciowe', '8', 'parts'].includes(word)) return 'parts';
        if (['bloki', 'blok', 'szesciany', 'cube'].includes(word)) return 'cube';

        throw new CommandError('Wpisz czesci albo bloki');

    }


    if (key === 'plantModels') {

        const value = { proste: 'simple', prosty: 'simple', polrealistyczne: 'semi', polrealistyczny: 'semi',
            szczegolowe: 'detailed', szczegolowy: 'detailed' }[word] ?? word;

        if (!SETTINGS_CHOICES.plantModels.includes(value)) {
            throw new CommandError('Wpisz proste, polrealistyczne albo szczegolowe');
        }

        return value;

    }


    if (key === 'jointStyle') {

        if (['gladkie', 'smooth'].includes(word)) return 'smooth';
        if (['klocki', 'bloki', 'blocks'].includes(word)) return 'blocks';

        throw new CommandError('Wpisz gladkie albo klocki');

    }


    if (key === 'shadows') {

        const value = SHADOW_WORDS[word] ?? Number(word);

        if (![0, 1, 2, 3].includes(value)) {
            throw new CommandError('Wpisz wyl, zwykle, dokladne albo dalekie (0, 1, 2, 3)');
        }

        return value;

    }


    if (key === 'farDetail') {

        const value = FAR_DETAIL_WORDS[word] ?? Number(word);

        if (![1, 2, 3].includes(value)) {
            throw new CommandError('Wpisz niskie, srednie albo wysokie (1, 2, 3)');
        }

        return value;

    }


    if (key in SETTINGS_CHOICES) {

        const value = ['bez-limitu', 'brak', 'wyl'].includes(word) ? 0 : Number(word);

        if (!SETTINGS_CHOICES[key].includes(value)) {
            throw new CommandError(`Do wyboru: ${SETTINGS_CHOICES[key].join(', ')} (0 = bez limitu)`);
        }

        return value;

    }


    if (key in SETTINGS_RANGES) {

        const { min, max } = SETTINGS_RANGES[key];

        const value = OFF_WORDS.includes(word) && min === 0 ? 0 : parseNumber(text);

        if (value < min || value > max) {
            throw new CommandError(`Zakres: od ${min} do ${max}`);
        }

        return value;

    }


    throw new CommandError('Tego ustawienia nie da się zmienić komendą.');

}

// ------------------------------------------------------------

export const GAME_COMMANDS = [

    {
        name: 'logi',
        aliases: ['diagnostyka'],
        usage: '/logi [problem]',
        description: 'Otwiera raport błędów i wydajności; problem zaznacza bieżący moment (także F8).',
        run(args, { diagnostics, openDiagnostics, markProblem }) {
            if (args.length > 1 || (args.length && simplify(args[0]) !== 'problem')) throw usageError(this);
            if (!diagnostics) throw new CommandError('Diagnostyka jest niedostępna w tej sesji.');
            if (args.length) {
                markProblem();
                return 'Zaznaczono problem. Raport: Pauza → Diagnostyka i logi.';
            }
            openDiagnostics();
            return 'Raport diagnostyczny został otwarty.';
        },
        complete(args) { return args.length === 1 ? ['problem'] : []; }
    },

    // ========================================================
    // OGÓLNE
    // ========================================================

    {
        name: 'pomoc',
        aliases: ['help', '?'],
        usage: '/pomoc [komenda]',
        description: 'Lista komend albo opis jednej komendy.',

        run(args, { commands }) {

            if (args[0]) {

                const command = commands.find(args[0].replace(/^\//, ''));

                if (!command) {
                    throw new CommandError(`Nie ma komendy "${args[0]}"`);
                }

                const aliases = command.aliases?.length ? ` (też: /${command.aliases.join(', /')})` : '';

                return `/${command.name}${aliases} - ${command.description}\nUżycie: ${command.usage}`;

            }

            return 'Komendy (szczegóły: /pomoc <komenda>, Tab podpowiada):\n' +
                commands.visible
                    .map((command) => `/${command.name} - ${command.description}`)
                    .join('\n');

        },

        complete(args, { commands }) {
            return args.length === 1 ? commands.visible.map((command) => command.name) : [];
        }
    },


    {
        name: 'wyczysc',
        aliases: ['clear'],
        usage: '/wyczysc',
        description: 'Czyści czat.',

        run(args, { chat }) {
            chat.clear();
        }
    },

    // ========================================================
    // CZAS, NIEBO, KSIĘŻYC
    // ========================================================

    {
        name: 'czas',
        aliases: ['time'],
        usage: '/czas | /czas ustaw <18:30 | rano | poludnie | zachod | noc...> | /czas dodaj <godziny | 30m> | /czas predkosc <x> | /czas dzien <numer>',
        description: 'Pokazuje i zmienia czas świata.',

        run(args, { time, sky }) {

            const [action, value] = args;

            const summary = () =>
                `Dzień ${time.dayNumber}, ${time.formatClock()}` +
                ` | czas płynie x${time.speed}` +
                ` | księżyc: ${sky.celestial.moonPhaseName}`;


            if (!action) {
                return summary();
            }


            switch (simplify(action)) {

                case 'ustaw':
                case 'set': {

                    // (+ odrobina, żeby zaokrąglenia nie dawały np. 21:59 zamiast 22:00)

                    time.days = Math.floor(time.days) + parseClock(value) + 1e-7;

                    return `Ustawiono ${time.formatClock()}.`;

                }

                case 'dodaj':
                case 'add': {

                    time.addHours(parseHours(value));

                    return summary();

                }

                case 'predkosc':
                case 'speed': {

                    const speed = parseNumber(value, 'prędkość');

                    if (speed < 0 || speed > 3600) {
                        throw new CommandError('Prędkość czasu: od 0 (stoi) do 3600');
                    }

                    time.speed = speed;

                    return speed === 0
                        ? 'Czas stoi. Powrót: /czas predkosc 1'
                        : `Czas płynie x${speed} (doba trwa ${(20 / speed).toFixed(2)} min).`;

                }

                case 'dzien':
                case 'day': {

                    const day = parseNumber(value, 'numer dnia');

                    if (!Number.isInteger(day) || day < 1) {
                        throw new CommandError('Numer dnia: 1, 2, 3...');
                    }

                    time.days = day - 1 + time.timeOfDay;

                    return summary();

                }

                default:
                    throw usageError(this);

            }

        },

        complete(args) {

            if (args.length === 1) {
                return ['ustaw', 'dodaj', 'predkosc', 'dzien'];
            }

            if (args.length === 2 && simplify(args[0]) === 'ustaw') {
                return Object.keys(TIME_NAMES);
            }

            return [];

        }
    },


    {
        name: 'ksiezyc',
        aliases: ['moon'],
        usage: '/ksiezyc | /ksiezyc faza <now | sierp | kwadra | garb | pelnia | ubywajacy-garb | ostatnia-kwadra | ubywajacy-sierp> | /ksiezyc kolor <czerwony | #rrggbb | domyslny>',
        description: 'Faza i kolor księżyca (kolor zabarwia też światło nocą).',

        run(args, { time, sky }) {

            const [action, value] = args;

            const celestial = sky.celestial;


            if (!action) {

                sky.refresh(time.days);

                return `Księżyc: ${celestial.moonPhaseName}, ` +
                    `oświetlony w ${Math.round(celestial.moonIllumination * 100)}%, ` +
                    `${celestial.moonHeight > 0 ? 'nad horyzontem' : 'pod horyzontem'}, ` +
                    `kolor: ${colorName(sky.variant.moonColor)}`;

            }


            switch (simplify(action)) {

                case 'faza':
                case 'phase': {

                    const word = simplify(value ?? '');

                    let target = PHASE_WORDS.indexOf(word);

                    if (target === -1 && /^[0-7]$/.test(word)) {
                        target = Number(word);
                    }

                    if (target === -1) {
                        throw new CommandError(`Nieznana faza "${value ?? ''}". Do wyboru: ${PHASE_WORDS.join(', ')}`);
                    }


                    // Przesuwamy czas o pełne doby (godzina zostaje),
                    // aż księżyc będzie w tej fazie.

                    const startDays = time.days;

                    for (let day = 0; day < 16; day++) {

                        celestial.update(startDays + day);

                        if (Math.round(celestial.moonPhase * 8) % 8 === target) {

                            time.days = startDays + day;

                            // Księżyc jest najwyżej, gdy jest o "fazę" za słońcem.

                            const highest = clockText(0.5 + celestial.moonPhase);

                            return `Księżyc: ${celestial.moonPhaseName} ` +
                                `(dzień ${time.dayNumber}). Najwyżej na niebie około ${highest} - ` +
                                `/czas ustaw ${highest}`;

                        }

                    }

                    throw new CommandError('Nie udało się znaleźć tej fazy.');

                }

                case 'kolor':
                case 'color': {

                    sky.variant.moonColor = parseColor(value);

                    return `Kolor księżyca: ${colorName(sky.variant.moonColor)}. ` +
                        'Nocą światło na świecie lekko się zabarwi.';

                }

                default:
                    throw usageError(this);

            }

        },

        complete(args) {

            if (args.length === 1) return ['faza', 'kolor'];

            const action = simplify(args[0]);

            if (action === 'faza') return PHASE_WORDS;
            if (action === 'kolor') return [...Object.keys(COLOR_NAMES), 'domyslny'];

            return [];

        }
    },


    {
        name: 'niebo',
        aliases: ['sky'],
        usage: '/niebo | /niebo zachod <czerwony | #rrggbb | domyslny>',
        description: 'Wygląd nieba: kolor łuny wschodu i zachodu (zabarwia też światło).',

        run(args, { sky, time }) {

            const [action, value] = args;


            if (!action) {

                sky.refresh(time.days);

                const state = sky.state;
                const height = Math.asin(Math.max(-1, Math.min(1, sky.celestial.sunHeight))) * 180 / Math.PI;

                return `Słońce: ${height.toFixed(0)}° nad horyzontem | ` +
                    `łuna zachodu: ${Math.round(state.sunset * 100)}% | ` +
                    `kolor łuny: ${colorName(sky.variant.sunsetColor)}\n` +
                    `Gwiazdy: widać ${Math.round(state.starVisibility * (1 - state.starLimit) * 100)}% | ` +
                    `Droga Mleczna: ${Math.round(state.galaxyVisibility * 100)}% | ` +
                    `spadające gwiazdy: ${state.meteorsPerMinute.toFixed(1)}/min` +
                    `${state.meteorShower ? ' (deszcz meteorów!)' : ''}` +
                    `${state.eclipse > 0 ? `\nZaćmienie słońca: zasłonięte ${Math.round(state.eclipse * 100)}%` : ''}`;

            }


            if (['zachod', 'wschod', 'luna'].includes(simplify(action))) {

                sky.variant.sunsetColor = parseColor(value);

                return `Kolor łuny wschodu/zachodu: ${colorName(sky.variant.sunsetColor)}. ` +
                    'Zobacz: /czas ustaw zachod';

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['zachod'];
            if (args.length === 2) return [...Object.keys(COLOR_NAMES), 'domyslny'];

            return [];

        }
    },

    {
        name: 'zacmienie',
        aliases: ['eclipse'],
        usage: '/zacmienie | /zacmienie lista [ile] | /zacmienie nastepne | /zacmienie pokaz [pelne | czesciowe | <procent>] | /zacmienie auto',
        description: 'Zaćmienia słońca: kiedy następne, lista, przeskok do następnego albo wymuszone zaćmienie.',

        run(args, { sky, time }) {

            const [action, value] = args;

            const override = sky.variant.eclipse;


            if (!action) {

                sky.refresh(time.days);

                const now = sky.state.eclipse;

                const [next] = findEclipses(time.days, 1, override);

                const current = now > 0
                    ? (now >= 1
                        ? 'Teraz: PEŁNE ZAĆMIENIE! '
                        : `Teraz: zasłonięte ${Math.round(now * 100)}% słońca. `)
                    : '';

                if (!next) {
                    return current + 'Brak zaćmień w najbliższym czasie.';
                }

                const hours = (next.days - time.days) * 24;

                const when = hours > 0
                    ? `, za ${hours < 10 ? decimal(hours) : Math.round(hours)} h gry (${durationText(realSeconds(hours, time))})`
                    : '';

                return current +
                    `${now > 0 && hours < 6 ? 'To zaćmienie' : 'Następne zaćmienie'}: ${eclipseText(next)}${when}. ` +
                    'Przeskok do następnego: /zacmienie nastepne' +
                    (override ? ' | wymuszone komendą - powrót: /zacmienie auto' : '');

            }


            switch (simplify(action)) {

                case 'lista':
                case 'list': {

                    const count = value === undefined ? 5 : parseNumber(value, 'liczba');

                    if (count < 1 || count > 20) {
                        throw new CommandError('Ile: od 1 do 20');
                    }

                    return 'Najbliższe zaćmienia słońca:\n' +
                        findEclipses(time.days, Math.floor(count), override)
                            .map((eclipse) => '- ' + eclipseText(eclipse))
                            .join('\n');

                }

                case 'nastepne':
                case 'next': {

                    const [next] = findEclipses(time.days + 0.1, 1, override);

                    if (!next) {
                        throw new CommandError('Brak zaćmień w najbliższym czasie.');
                    }

                    time.days = next.days - 1.5 / 24;

                    return `Przeskok do zaćmienia: ${eclipseText(next)}. Największe zakrycie za 1,5 h gry ` +
                        `(${durationText(realSeconds(1.5, time))}). Szybciej: /czas predkosc 10`;

                }

                case 'pokaz':
                case 'show': {

                    const word = simplify(value ?? 'pelne');

                    let coverage;

                    if (['pelne', 'calkowite', 'total'].includes(word)) {
                        coverage = 1;
                    }
                    else if (['czesciowe', 'partial'].includes(word)) {
                        coverage = 0.7;
                    }
                    else {

                        const percent = parseNumber(value, 'procent');

                        if (percent < 5 || percent > 100) {
                            throw new CommandError('Procent zasłonięcia: od 5 do 100');
                        }

                        coverage = percent / 100;

                    }


                    const cycle = nextNewMoonCycle(time.days);

                    sky.variant.eclipse = {
                        cycle,
                        latitude: latitudeForCoverage(coverage)
                    };

                    const peak = newMoonDays(cycle);

                    time.days = peak - 1.5 / 24;

                    return `Zaćmienie ${coverage >= 1 ? 'PEŁNE' : `częściowe (${Math.round(coverage * 100)}%)`} - ` +
                        `największe o ${clockText(peak)} dnia ${Math.floor(peak) + 1}, ` +
                        `za 1,5 h gry (${durationText(realSeconds(1.5, time))}). ` +
                        'Szybciej: /czas predkosc 10. Powrót do zwykłych zaćmień: /zacmienie auto';

                }

                case 'auto':
                case 'wyl': {

                    sky.variant.eclipse = null;

                    return 'Zaćmienia znowu same wybierają nowie (mniej więcej co trzeci).';

                }

                default:
                    throw usageError(this);

            }

        },

        complete(args) {

            if (args.length === 1) return ['lista', 'nastepne', 'pokaz', 'auto'];
            if (args.length === 2 && simplify(args[0]) === 'pokaz') return ['pelne', 'czesciowe', '50', '90'];

            return [];

        }
    },

    {
        name: 'meteory',
        aliases: ['meteors'],
        usage: '/meteory | /meteory deszcz <wl | wyl | auto> | /meteory pokaz [ile]',
        description: 'Spadające gwiazdy na niebie: częstość, deszcz meteorów, pokaz.',

        run(args, { sky, time }) {

            const [action, value] = args;


            if (!action) {

                sky.refresh(time.days);

                const state = sky.state;

                const shower =
                    sky.variant.meteorShower === null
                        ? (state.meteorShower ? 'tak (ta noc)' : 'nie')
                        : (sky.variant.meteorShower ? 'tak (wymuszony)' : 'nie (wyłączony)');

                return `Spadające gwiazdy: ${state.meteorsPerMinute.toFixed(1)} na minutę ` +
                    '(najwięcej w ciemne noce przy nowiu, w dzień wcale) | ' +
                    `deszcz meteorów: ${shower}`;

            }


            switch (simplify(action)) {

                case 'deszcz':
                case 'shower': {

                    const mode = simplify(value ?? '');

                    if (['wl', 'on', 'tak'].includes(mode)) sky.variant.meteorShower = true;
                    else if (['wyl', 'off', 'nie'].includes(mode)) sky.variant.meteorShower = false;
                    else if (mode === 'auto') sky.variant.meteorShower = null;
                    else throw usageError(this);

                    return mode === 'auto'
                        ? 'Deszcz meteorów: sam wybiera noce (mniej więcej co siódma).'
                        : `Deszcz meteorów: ${sky.variant.meteorShower ? 'włączony' : 'wyłączony'}. Widać go w nocy.`;

                }

                case 'pokaz':
                case 'show': {

                    const count = value === undefined ? 8 : parseNumber(value, 'liczba');

                    if (count < 1 || count > 30) {
                        throw new CommandError('Ile: od 1 do 30');
                    }

                    sky.shootingStars.burst = Math.floor(count);

                    return `${Math.floor(count)} spadających gwiazd (widać je w nocy).`;

                }

                default:
                    throw usageError(this);

            }

        },

        complete(args) {

            if (args.length === 1) return ['deszcz', 'pokaz'];
            if (args.length === 2 && simplify(args[0]) === 'deszcz') return ['wl', 'wyl', 'auto'];

            return [];

        }
    },


    {
        name: 'meteor',
        aliases: ['meteorite'],
        usage: '/meteor | /meteor tu | /meteor pokaz | /meteor tempo <0.05-2>',
        description: 'Zrzuca meteoryt w pobliżu ("tu" - tam, gdzie patrzysz; "pokaz" - przed tobą, nadlatuje z naprzeciwka). Tempo 0.25 = cztery razy wolniej.',

        run(args, { game, player, world }) {

            const word = simplify(args[0] ?? '');

            const meteorites = game.meteorites;


            if (word === 'tempo') {

                if (args[1] === undefined) {
                    return `Tempo meteorytów: x${meteorites.timeScale}. Zmiana: /meteor tempo 0.25 (wolniej) albo 1 (normalnie).`;
                }

                const value = parseNumber(args[1], 'tempo');

                if (value < 0.05 || value > 2) {
                    throw new CommandError('Tempo: od 0.05 do 2 (1 = normalnie).');
                }

                meteorites.timeScale = value;

                return `Tempo meteorytów: x${value}.`;

            }


            let landing = null;

            if (word === 'tu') {

                const hit = game.currentHit;

                let x, z;

                if (hit && hit.hit) {
                    x = hit.block.x;
                    z = hit.block.z;
                }
                else {
                    x = Math.floor(player.pos.x - Math.sin(player.yaw) * 15);
                    z = Math.floor(player.pos.z - Math.cos(player.yaw) * 15);
                }

                world.ensureColumnLoaded(x, z);

                landing = new THREE.Vector3(x, world.getSurfaceY(x, z), z);

            }
            else if (word === 'pokaz') {

                // 30 bloków przed graczem (w poziomie).

                const x = Math.floor(player.pos.x - Math.sin(player.yaw) * 30);
                const z = Math.floor(player.pos.z - Math.cos(player.yaw) * 30);

                world.ensureColumnLoaded(x, z);

                landing = new THREE.Vector3(x, world.getSurfaceY(x, z), z);

            }
            else if (word) {

                throw usageError(this);

            }


            // Z komendy meteoryt nadlatuje zza miejsca upadku (patrząc
            // od gracza) - lekko z boku, żeby było widać cały przelot.

            const target = landing ?? meteorites.findLandingSpot();

            if (!target) {
                throw new CommandError('Brak miejsca: w pobliżu są tylko chunki zmienione przez gracza. Spróbuj /meteor tu');
            }

            const away = new THREE.Vector3(target.x + 0.5 - player.pos.x, 0, target.z + 0.5 - player.pos.z);

            if (away.lengthSq() < 1) {
                away.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
            }

            away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35));

            const meteor = meteorites.spawn(target, { from: away });

            const { x, z } = meteor.landing;

            const seconds = Math.round(FLIGHT_SECONDS / meteorites.timeScale);

            return `Meteoryt leci! Spadnie na ${x}, ${z} za ~${seconds} s - patrz w tamtą stronę (nadlatuje zza tego miejsca).`;

        },

        complete(args) {
            return args.length === 1 ? ['tu', 'pokaz', 'tempo'] : args.length === 2 && simplify(args[0]) === 'tempo' ? ['0.25', '0.5', '1'] : [];
        }
    },

    {
        name: 'dzwiek',
        aliases: ['sound', 'dzwieki'],
        usage: '/dzwiek | /dzwiek lista | /dzwiek <nazwa> | /dzwiek pokaz [materiał] | /dzwiek menu',
        description: 'Dźwięk: stan i głośność, lista dźwięków, odtworzenie jednego, pokaz dźwięków bloków (krok, postawienie, zniszczenie), pokaz dźwięków menu i ekwipunku.',

        run(args, { game }) {

            const sounds = game.sounds;

            if (!sounds) {
                throw new CommandError('Dźwięk jest niedostępny.');
            }

            const word = simplify(args[0] ?? '');

            const settings = game.settings;


            if (!word) {

                return `Dźwięk: ${sounds.running ? 'gra' : 'wstrzymany (kliknij w grę)'} | wczytane pliki: ${sounds.loadedCount} z ${sounds.fileCount} | ` +
                    `głośność ${settings.get('volumeMaster')}%, bloki ${settings.get('volumeBlocks')}%, otoczenie ${settings.get('volumeWorld')}%, menu ${settings.get('volumeUi')}% ` +
                    '(Ustawienia -> Dźwięk albo /ustaw glosnosc 80). Dalej: /dzwiek lista, /dzwiek pokaz, /dzwiek menu';

            }


            if (word === 'lista') {
                return `Dźwięki (${Object.keys(SOUNDS).length}): ${Object.keys(SOUNDS).join(', ')}`;
            }


            if (!sounds.running) {
                throw new CommandError('Dźwięk jest jeszcze wstrzymany - kliknij w grę i spróbuj jeszcze raz.');
            }


            if (word === 'pokaz') {

                const material = args[1] === undefined ? null : MATERIAL_WORDS[simplify(args[1])];

                if (args[1] !== undefined && !material) {
                    throw new CommandError(`Nie ma materiału "${args[1]}". Do wyboru: ${Object.keys(MATERIAL_WORDS).filter((w) => !BLOCK_MATERIALS.includes(w)).join(', ')}`);
                }

                const list = material ? [material] : BLOCK_MATERIALS;


                // Każdy materiał: trzy kroki, postawienie, zniszczenie.

                list.forEach((name, i) => {

                    const start = i * 2.6;

                    for (const [kind, at] of [['step', 0], ['step', 0.45], ['step', 0.9], ['place', 1.4], ['break', 1.9]]) {
                        sounds.play(`${kind}_${name}`, { volume: kind === 'step' ? 0.6 : 1, delay: start + at });
                    }

                });

                return `Pokaz dźwięków (krok x3, postawienie, zniszczenie): ${list.map((name) => MATERIAL_NAMES[name]).join(', ')}.`;

            }


            if (word === 'menu') {

                // Po kolei: przycisk, "Wróć", suwak w prawo, ekwipunek
                // (otwarcie, wzięcie, odłożenie, kosz, zamknięcie), błąd
                // i zbieranie owoców.

                const show = [
                    ['ui_click', 0],
                    ['ui_click', 0.45, { pitch: 0.82 }],
                    ...Array.from({ length: 10 }, (_, i) => ['ui_slider', 1 + i * 0.07, { pitch: 0.8 + 0.05 * i }]),
                    ['ui_open', 2.1],
                    ['item_pick', 2.7],
                    ['item_place', 3.15],
                    ['item_pick', 3.6],
                    ['item_trash', 4.0],
                    ['ui_close', 4.7],
                    ['ui_error', 5.4],
                    ['harvest', 6.2]
                ];

                for (const [name, at, options] of show) {
                    sounds.play(name, { ...options, delay: at });
                }

                return 'Pokaz dźwięków menu: przycisk, "Wróć", suwak, ekwipunek (otwarcie, wzięcie, odłożenie, kosz, zamknięcie), błąd, zbieranie owoców.';

            }


            const name = Object.keys(SOUNDS).find((key) => simplify(key) === word);

            if (!name) {
                throw new CommandError(`Nie ma dźwięku "${args[0]}". Lista: /dzwiek lista`);
            }

            if (!sounds.play(name)) {
                throw new CommandError(`Nie udało się zagrać "${name}" (plik się nie wczytał albo gra za dużo dźwięków naraz).`);
            }

            return `Gra: ${name}.`;

        },

        complete(args) {

            if (args.length === 1) {
                return ['lista', 'pokaz', 'menu', ...Object.keys(SOUNDS)];
            }

            return args.length === 2 && simplify(args[0]) === 'pokaz'
                ? Object.keys(MATERIAL_WORDS).filter((w) => !BLOCK_MATERIALS.includes(w))
                : [];

        }
    },

    // ========================================================
    // GRACZ
    // ========================================================

    {
        name: 'tp',
        aliases: ['teleport'],
        usage: '/tp <x> <z> | /tp <x> <y> <z> | /tp spawn   (~ = względem gracza, np. /tp ~100 ~ ~)',
        description: 'Przenosi gracza.',

        run(args, { player, world }) {

            if (args.length === 1 && simplify(args[0]) === 'spawn') {

                player.spawn();

                return 'Przeniesiono na start.';

            }


            if (args.length !== 2 && args.length !== 3) {
                throw usageError(this);
            }


            const pos = player.pos;

            const x = parseCoordinate(args[0], pos.x);
            const z = parseCoordinate(args[args.length - 1], pos.z);

            if (Math.abs(x) > WORLD_BORDER || Math.abs(z) > WORLD_BORDER) {
                throw new CommandError(`Za granicą świata (±${WORLD_BORDER}).`);
            }


            world.ensureColumnLoaded(x, z);

            const y =
                args.length === 3
                    ? parseCoordinate(args[1], pos.y)
                    : world.getSurfaceY(Math.floor(x), Math.floor(z));


            pos.set(x, y, z);

            player.vel.set(0, 0, 0);

            player.skyfall = false;

            player.updateCamera();

            return `Przeniesiono na ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}.`;

        },

        complete(args) {
            return args.length === 1 ? ['spawn', '~'] : ['~'];
        }
    },


    {
        name: 'pozycja',
        aliases: ['pos'],
        usage: '/pozycja',
        description: 'Pozycja gracza i chunk.',

        run(args, { player }) {

            const p = player.pos;

            return `Pozycja: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} | ` +
                `chunk: ${Math.floor(p.x / CHUNK_SIZE)}, ${Math.floor(p.z / CHUNK_SIZE)}`;

        }
    },


    {
        name: 'tryb',
        aliases: ['gamemode', 'gm'],
        usage: '/tryb [przygoda | kreatywny | programista]',
        description: 'Tryb gry: przygoda (zbierasz i zużywasz bloki), kreatywny (bloki bez końca, latanie - 2 x Spacja) albo programista (jak kreatywny + sceny testowe: /scena).',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                return `Tryb gry: ${TEXTS.gameModes[game.mode]}. Zmiana: /tryb przygoda, /tryb kreatywny albo /tryb programista.`;
            }

            const mode =
                ['przygoda', 'adventure', 'survival', 'p', '0'].includes(word) ? 'adventure' :
                ['kreatywny', 'creative', 'k', '1'].includes(word) ? 'creative' :
                ['programista', 'developer', 'dev', '3'].includes(word) ? 'developer' :
                null;

            if (!mode) {
                throw usageError(this);
            }

            game.setMode(mode);

            return mode === 'developer'
                ? 'Tryb programisty: jak kreatywny, a do tego sceny testowe (Esc - Sceny testowe albo /scena lista).'
                : mode === 'creative'
                ? 'Tryb kreatywny: bloki się nie zużywają, E - wszystkie bloki, dwa razy Spacja - latanie.'
                : 'Tryb przygody: kopanie trwa (trzymaj LPM - /kopanie), zniszczone bloki trafiają do ekwipunku, stawianie je zużywa.';

        },

        complete(args) {
            return args.length === 1 ? ['przygoda', 'kreatywny', 'programista'] : [];
        }
    },


    {
        name: 'przepisy',
        aliases: ['recipes', 'crafting', 'przepis'],
        usage: '/przepisy [blok | przedmiot | lista | moge]',
        description: 'Przepisy wytwarzania (siatka 2 x 2 w ekwipunku, E): jak zrobić rzecz i do czego się przydaje. lista - wszystkie, moge - te, na które masz składniki.',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (!word || word === 'lista' || word === 'list') {

                const lines = RECIPE_LIST.map((recipe) => `${CATEGORIES[getCategory(recipe.result[0])].label}: ${recipeText(recipe)}`);

                return `Przepisy (${RECIPE_LIST.length}) - siatka 2 x 2 w ekwipunku (E), księga przepisów: przycisk 📖.\n` + lines.join('\n');

            }

            if (word === 'moge' || word === 'mozliwe') {

                const stock = stockOf(game.inventory);

                const ready = RECIPE_LIST
                    .map((recipe) => ({ recipe, times: maxCrafts(recipe, stock) }))
                    .filter(({ times }) => times > 0);

                return ready.length === 0
                    ? 'Nie masz składników na żaden przepis. Zacznij od pnia drzewa (deski) - /przepisy lista.'
                    : 'Możesz zrobić:\n' + ready.map(({ recipe, times }) => `${recipeText(recipe)} - ${times} raz${times === 1 ? '' : 'y'}`).join('\n');

            }

            const type = itemArgument(args[0]);

            const made = recipesFor(type);

            const uses = recipesUsing(type);

            const lines = [];

            lines.push(made.length > 0
                ? made.map((recipe) => `Jak zrobić - ${recipeText(recipe)}`).join('\n')
                : `${getItemLabel(type)}: nie robi się tego z przepisu (zbierasz albo wykopujesz).`);

            if (uses.length > 0) {
                lines.push(`Przydaje się do: ${uses.map((recipe) => getItemLabel(recipe.result[0])).join(', ')}.`);
            }

            return lines.join('\n');

        },

        complete(args) {
            return args.length === 1 ? ['lista', 'moge', ...RECIPE_LIST.map((recipe) => recipe.result[0])] : [];
        }
    },


    {
        name: 'wytworz',
        aliases: ['craft', 'zrob'],
        usage: '/wytworz <przepis> [ile razy]',
        description: 'Wytwarza od razu ze składników z ekwipunku (jak siatka 2 x 2 - do testów i na skróty). Przepisy: /przepisy lista.',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                throw usageError(this);
            }

            // Nazwa przepisu albo tego, co powstaje (też po polsku).

            let recipe = getRecipe(word);

            if (!recipe) {

                const type = itemArgument(args[0]);

                recipe = recipesFor(type)[0] ?? null;

                if (!recipe) {
                    throw new CommandError(`${getItemLabel(type)} nie ma przepisu. Lista: /przepisy lista`);
                }

            }

            const times = args[1] === undefined ? 1 : Math.floor(parseNumber(args[1], 'ile razy'));

            if (times < 1 || times > STACK_SIZE) {
                throw new CommandError(`Ile razy: od 1 do ${STACK_SIZE}`);
            }

            let craftedResult = null;
            const done = craftFromInventory(game.inventory, recipe, times, result => { craftedResult = result; });

            if (done === 0) {
                throw new CommandError(`Brakuje składników (albo miejsca w ekwipunku). ${recipeText(recipe)}`);
            }

            const { type, count } = craftedResult;

            game.achieve?.('crafted', { type, count: count * done, recipe: recipe.id });

            return `Wytworzono: ${count * done} x ${getItemLabel(type)}${done < times ? ` (składników starczyło na ${done} z ${times})` : ''}.`;

        },

        complete(args) {
            return args.length === 1 ? RECIPE_LIST.map((recipe) => recipe.id) : args.length === 2 ? ['1', '4', '16'] : [];
        }
    },


    {
        name: 'kopanie',
        aliases: ['mining', 'kop'],
        usage: '/kopanie [blok | lista]',
        description: 'Ile trwa kopanie bloku w trybie przygody - bloku, na który patrzysz, albo podanego (np. /kopanie granit). lista - wszystkie czasy.',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (word === 'lista' || word === 'list') {
                return miningList();
            }

            if (!word) {

                const hit = game.currentHit;

                if (!hit?.hit) {
                    return 'Spójrz na blok albo podaj jego nazwę, np. /kopanie granit. Wszystkie czasy: /kopanie lista';
                }

                return miningText(hit.block.type, game);

            }

            const type = blockArgument(args[0]);

            if (!type) {
                throw new CommandError('Powietrza się nie kopie :) Podaj blok, np. /kopanie granit');
            }

            return miningText(type, game);

        },

        complete(args) {
            return args.length === 1 ? ['lista', ...BLOCK_NAMES] : [];
        }
    },


    {
        name: 'ekwipunek',
        aliases: ['inventory', 'eq'],
        usage: '/ekwipunek | /ekwipunek wyczysc | /ekwipunek wyglad [drewniany | jasny]',
        description: 'Co jest w ekwipunku (E - okno ekwipunku); wyczyszczenie ekwipunku; wygląd okna ekwipunku.',

        run(args, { game }) {

            const inventory = game.inventory;

            const word = simplify(args[0] ?? '');


            if (['wyczysc', 'clear'].includes(word)) {

                inventory.clear();

                return 'Ekwipunek wyczyszczony.';

            }


            // Wygląd okna (to samo co Ustawienia - Inne - Ekwipunek: drewniany / jasny).
            // Bez słowa - przełącza na drugi.

            if (['wyglad', 'styl', 'style'].includes(word)) {

                const settings = game.settings;

                const names = { drewniany: 'wood', drewno: 'wood', wood: 'wood', jasny: 'light', light: 'light' };

                const value = args[1] === undefined
                    ? (settings.get('inventoryStyle') === 'wood' ? 'light' : 'wood')
                    : names[simplify(args[1])];

                if (!value) {
                    throw usageError(this);
                }

                settings.set('inventoryStyle', value);

                return `Wygląd ekwipunku: ${value === 'wood' ? 'drewniany' : 'jasny'} (E - otwórz ekwipunek).`;

            }

            if (word) {
                throw usageError(this);
            }


            const totals = new Map();

            for (const item of inventory.slots) {

                if (item) {
                    totals.set(item.type, (totals.get(item.type) ?? 0) + item.count);
                }

            }

            const used = inventory.slots.filter(Boolean).length;

            return totals.size === 0
                ? 'Ekwipunek jest pusty.'
                : `Ekwipunek (${used} z ${inventory.slots.length} miejsc): ` +
                  [...totals].map(([type, count]) => `${getItemLabel(type)} ${count}`).join(', ');

        },

        complete(args) {
            if (args.length === 2 && simplify(args[0]) === 'wyglad') {
                return ['drewniany', 'jasny'];
            }
            return args.length === 1 ? ['wyczysc', 'wyglad'] : [];
        }
    },


    {
        name: 'latanie',
        aliases: ['fly'],
        usage: '/latanie',
        description: 'Włącza/wyłącza latanie (Spacja - w górę, Shift - w dół).',

        run(args, { player }) {

            player.flying = !player.flying;

            player.vel.set(0, 0, 0);

            return player.flying
                ? 'Latanie włączone: Spacja - w górę, Shift - w dół.'
                : 'Latanie wyłączone.';

        }
    },


    {
        name: 'predkosc',
        aliases: ['speed'],
        usage: '/predkosc <0.1 - 20>   (1 = normalnie)',
        description: 'Prędkość chodzenia i latania.',

        run(args, { player }) {

            if (!args[0]) {
                return `Prędkość: x${player.speedMultiplier}`;
            }

            const speed = parseNumber(args[0], 'prędkość');

            if (speed < 0.1 || speed > 20) {
                throw new CommandError('Prędkość: od 0.1 do 20');
            }

            player.speedMultiplier = speed;

            return `Prędkość: x${speed}`;

        }
    },

    // ========================================================
    // ENERGIA I SAMOPOCZUCIE (docs/energia.md)
    // ========================================================

    {
        name: 'energia',
        aliases: ['energy', 'samopoczucie'],
        usage: '/energia | /energia <0 - 130> | /energia kondycja <60 - 130>',
        description: 'Energia i kondycja gracza (tryb przygody): podgląd w liczbach albo ustawienie - do testów.',

        run(args, { game }) {

            const wellbeing = game.wellbeing, data = wellbeing.data;

            if (args[0] === 'kondycja') {

                const value = parseNumber(args[1], 'kondycja');

                if (value < CONDITION_MIN || value > CONDITION_MAX) {
                    throw new CommandError(`Kondycja: od ${CONDITION_MIN} do ${CONDITION_MAX}`);
                }

                data.condition = value;
                data.energy = Math.min(data.energy, value);

            }
            else if (args[0]) {

                const value = parseNumber(args[0], 'energia');

                if (value < 0 || value > CONDITION_MAX) {
                    throw new CommandError(`Energia: od 0 do ${CONDITION_MAX}`);
                }

                data.energy = Math.min(value, data.condition);
                data.fullness = 0;

            }

            const text = `Energia: ${data.energy.toFixed(1)} z ${data.condition}, stan: ` +
                `${STATES[wellbeing.state].label.toLowerCase()}, posiłki dzisiaj: ${data.mealsToday}`;

            return wellbeing.active ? text : `${text}. W tym trybie gry energia jest wyłączona.`;

        },

        complete(args) {
            return args.length <= 1 ? ['kondycja'] : [];
        }
    },

    // ========================================================
    // MODEL GRACZA I ANIMACJE (docs/gracz.md)
    // ========================================================

    {
        name: 'kamera',
        aliases: ['camera', 'widok'],
        usage: '/kamera [oczy | tyl | przod]   (bez nazwy - następny widok, jak F5)',
        description: 'Widok kamery: z oczu gracza, zza pleców albo z przodu (model gracza).',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                game.cycleCameraMode();
            }
            else {

                const mode = CAMERA_WORDS[word];

                if (!mode) {
                    throw new CommandError('Widoki: oczy, tyl, przod');
                }

                game.setCameraMode(mode);

            }

            return `Kamera: ${CAMERA_NAMES[game.cameraMode]}. Odległość: /ustaw kamera <2-8>.`;

        },

        complete(args) {
            return args.length === 1 ? ['oczy', 'tyl', 'przod'] : [];
        }
    },


    {
        name: 'animacja',
        aliases: ['animation', 'anim'],
        usage: '/animacja <stanie | chodzenie | bieg | kucanie | skradanie | skok | machanie | latanie | plywanie | plywanie-w-miejscu> | /animacja wyl',
        description: 'Podgląd animacji modelu gracza w miejscu (kamera z przodu). Wolniej: /model tempo 0.25.',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            const animator = game.animator;


            if (!word) {

                return animator.preview
                    ? `Podgląd animacji: ${ANIMATION_WORDS_PL[animator.preview.mode]}. Koniec: /animacja wyl`
                    : `Podgląd wyłączony. Animacje: ${Object.keys(ANIMATION_WORDS).join(', ')}`;

            }


            if (OFF_WORDS.includes(word)) {

                animator.preview = null;

                return 'Podgląd animacji wyłączony - model znowu rusza się razem z graczem.';

            }


            const mode = ANIMATION_WORDS[word];

            if (!mode) {
                throw new CommandError(`Animacje: ${Object.keys(ANIMATION_WORDS).join(', ')}`);
            }

            animator.preview = { mode, time: 0 };


            // Z oczu modelu nie widać - przełączamy na kamerę z przodu.

            if (game.cameraMode === 'first') {
                game.setCameraMode('front');
            }

            return `Podgląd: ${ANIMATION_WORDS_PL[mode]} (kamera: ${CAMERA_NAMES[game.cameraMode]}). ` +
                'Wolniej: /model tempo 0.25 | koniec: /animacja wyl';

        },

        complete(args) {
            return args.length === 1 ? [...Object.keys(ANIMATION_WORDS), 'wyl'] : [];
        }
    },


    {
        name: 'model',
        aliases: [],
        usage: '/model | /model gladki | /model klocki | /model warstwa <wl | wyl> | /model tempo <0.05-2>',
        description: 'Model gracza: zgięcia rąk i nóg (gładkie / osobne klocki), druga warstwa skórki, tempo animacji.',

        run(args, { game }) {

            const settings = game.settings;

            const word = simplify(args[0] ?? '');


            if (!word) {

                return `Model: zgięcia ${settings.get('jointStyle') === 'blocks' ? 'klocki' : 'gładkie'}, ` +
                    `druga warstwa skórki ${settings.get('skinOverlay') ? 'wł.' : 'wył.'}, ` +
                    `tempo animacji x${game.animator.timeScale}, skórka ${hasCustomSkin() ? 'własna' : 'domyślna'}. ` +
                    '11 stawów: miednica, talia, szyja, 2 barki, 2 łokcie, 2 biodra, 2 kolana.';

            }


            if (['gladki', 'gladkie', 'smooth'].includes(word)) {

                settings.set('jointStyle', 'smooth');

                return 'Zgięcia gładkie: ręka, noga i tułów zginają się w środku bez szpar.';

            }


            if (['klocki', 'bloki', 'blocks'].includes(word)) {

                settings.set('jointStyle', 'blocks');

                return 'Zgięcia z klocków: każda połowa ręki, nogi i tułowia to osobny, sztywny klocek.';

            }


            if (word === 'warstwa') {

                const value = simplify(args[1] ?? '');

                const on = ON_WORDS.includes(value) ? true : OFF_WORDS.includes(value) ? false : !settings.get('skinOverlay');

                settings.set('skinOverlay', on);

                return `Druga warstwa skórki: ${on ? 'wł.' : 'wył.'}`;

            }


            if (word === 'tempo') {

                const value = parseNumber(args[1], 'tempo');

                if (value < 0.05 || value > 2) {
                    throw new CommandError('Tempo: od 0.05 do 2 (1 = normalnie)');
                }

                game.animator.timeScale = value;

                return `Tempo animacji: x${value}${value < 1 ? ' (zwolnione)' : ''}.`;

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['gladki', 'klocki', 'warstwa', 'tempo'];
            if (args.length === 2 && simplify(args[0]) === 'warstwa') return ['wl', 'wyl'];
            if (args.length === 2 && simplify(args[0]) === 'tempo') return ['0.25', '0.5', '1'];

            return [];

        }
    },


    {
        name: 'skorka',
        aliases: ['skin'],
        usage: '/skorka | /skorka plik | /skorka domyslna',
        description: 'Skórka gracza: wczytanie własnej (PNG 64 x 64, układ jak w Minecrafcie) albo powrót do domyślnej.',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');


            if (!word) {
                return `Skórka: ${hasCustomSkin() ? 'własna' : 'domyślna'}. Własna: /skorka plik (PNG 64 x 64). Szablon: docs/gracz.md.`;
            }


            if (['plik', 'wczytaj', 'file'].includes(word)) {

                chooseSkinFile((message) => game.onMessage?.(message));

                return 'Wybierz plik PNG ze skórką (64 x 64)...';

            }


            if (['domyslna', 'reset', 'default'].includes(word)) {

                resetSkin().then(() => game.onMessage?.('Wrócono do domyślnej skórki.'));

                return 'Wczytywanie domyślnej skórki...';

            }


            throw usageError(this);

        },

        complete(args) {
            return args.length === 1 ? ['plik', 'domyslna'] : [];
        }
    },


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
        name: 'pogoda',
        aliases: ['weather'],
        usage: '/pogoda | /pogoda deszcz [0-100] | /pogoda sucho',
        description: 'Lokalny deszcz i kręgi kropel na odkrytej wodzie, na czas bieżącej sesji.',
        run(args, { game }) {
            const rain = game?.rain;
            if (!rain) throw new CommandError('Deszcz jest dostępny po wejściu do świata.');
            if (!args.length) return rain.intensity > 0
                ? `Deszcz: ${Math.round(rain.intensity * 100)}%.` : 'Brak deszczu. Włącz: /pogoda deszcz.';
            const word = simplify(args[0]);
            if (word === 'sucho' && args.length === 1) {
                rain.setIntensity(0); return 'Deszcz ustał.';
            }
            if (word !== 'deszcz' || args.length > 2) throw usageError(this);
            const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'natężenie deszczu');
            if (amount < 0 || amount > 100) throw new CommandError('Natężenie deszczu: od 0 do 100.');
            rain.setIntensity(amount / 100);
            return amount > 0 ? `Deszcz: ${amount}%.` : 'Deszcz ustał.';
        },
        complete(args) { return args.length === 1 ? ['deszcz', 'sucho'] : []; }
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
        description: 'Rośliny z paczek roślin (assets/rosliny/): lista z rozmiarami, opis rośliny, ogródek ze wszystkimi etapami przed tobą, najbliższa roślina we wczytanym terenie, błędy paczek.',

        run(args, { player, world }) {

            const word = simplify(args[0] ?? '');


            if (['bledy', 'errors'].includes(word)) {

                return PLANT_PACK_ERRORS.length === 0
                    ? `Paczki roślin bez błędów (${PLANT_PACKS.length}).`
                    : `Błędy paczek roślin:\n${PLANT_PACK_ERRORS.map((error) => `- ${error}`).join('\n')}`;

            }


            if (['ogrod', 'garden', 'pokaz'].includes(word)) {

                const pack = args[1] === undefined ? null : plantPackByWord(args[1]);

                if (args[1] !== undefined && !pack) {
                    throw new CommandError(`Nie ma rośliny "${args[1]}" - lista: /rosliny.`);
                }

                if (PLANT_PACKS.length === 0) {
                    throw new CommandError('Nie ma paczek roślin (assets/rosliny/lista.json).');
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

                return `${pack.label} (${pack.folder}): ${pack.about || 'roślina z paczki roślin'}.\n` +
                    stages.join('\n') +
                    `\nRośnie: etap średnio co ${pack.growthSeconds ?? BUSH_GROWTH_SECONDS} s (wyższy etap tylko z wolnym miejscem nad sobą).` +
                    (pack.item ? `\nPrzedmiot: ${pack.item.label} (/daj ${pack.item.type})` +
                        (pack.harvest ? ` - PPM na ostatnim etapie: ${pack.harvest.count[0]}-${pack.harvest.count[1]} szt., roślina wraca do etapu ${pack.harvest.back + 1}` : '') : '') +
                    (pack.where ? `\nGdzie rośnie: ${plantBiomesText(pack)} (/rosliny znajdz ${pack.id})` : '') +
                    `\nNumery bloków: ${pack.firstId}-${pack.firstId + pack.stages.length - 1}.`;

            }


            if (PLANT_PACKS.length === 0) {
                return 'Nie ma paczek roślin (assets/rosliny/lista.json, instrukcja: docs/rosliny.md).';
            }

            return `Rośliny z paczek (${PLANT_PACKS.length}): ` +
                PLANT_PACKS.map((pack) => {
                    const top = pack.stages[pack.stages.length - 1];
                    return `${pack.label} (${pack.id}, do ${blocksSize(top.height)} bloku wysokości)`;
                }).join(', ') +
                '. Opis: /rosliny <roslina>, ogródek: /rosliny ogrod' +
                (PLANT_PACK_ERRORS.length > 0 ? `. Błędy paczek: ${PLANT_PACK_ERRORS.length} (/rosliny bledy).` : '.');

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
    },

    // ========================================================
    // ŚWIATŁO
    // ========================================================

    {
        name: 'swiatlo',
        aliases: ['light'],
        usage: '/swiatlo | /swiatlo paleta <naturalna | poprzednia> | /swiatlo widok <full | albedo | normals | sunVisibility | skyAccess | ao | sun | moon | sky | bounce | local | emission | grayscale | transmission | specular> | /swiatlo zrodlo <sun | moon | sky | bounce | local | emission | transmission | specular> <wl | wyl> | /swiatlo chmury <0–100> | /swiatlo reset | /swiatlo model <atmosfera | klasyczne> | /swiatlo dynamiczne <wl | wyl> | /swiatlo odbite <wl | wyl>',
        description: 'Pomiar źródeł, odbić i materiałów; paleta, diagnostyka liści oraz światło dynamiczne.',

        run(args, { game, world }) {

            const action = simplify(args[0] ?? '');
            if (action === 'paleta') {
                const choice = { naturalna: 'natural', natural: 'natural', poprzednia: 'baseline', baseline: 'baseline' }[simplify(args[1] ?? '')];
                if (args.length !== 2 || !choice) throw usageError(this);
                game.settings.set('lightingLook', choice);
                return TEXTS.lightingLook(choice);
            }
            if (action === 'widok') {
                const name = LIGHTING_VIEWS.find(view => simplify(view) === simplify(args[1] ?? ''));
                if (args.length !== 2 || !name) throw usageError(this);
                setLightingView(name);
                return `Widok światła: ${name}. Powrót: /swiatlo reset.`;
            }
            if (action === 'zrodlo') {
                const source = simplify(args[1] ?? '');
                const value = simplify(args[2] ?? '');
                if (args.length !== 3 || !['sun', 'moon', 'sky', 'bounce', 'local', 'emission', 'transmission', 'specular'].includes(source)
                    || ![...ON_WORDS, ...OFF_WORDS].includes(value)) throw usageError(this);
                const enabled = ON_WORDS.includes(value);
                setLightingComponent(source, enabled);
                return `Źródło ${source}: ${enabled ? 'włączone' : 'wyłączone'} (diagnostyka powierzchni).`;
            }
            if (action === 'chmury') {
                const value = Number(args[1]);
                if (args.length !== 2 || !Number.isFinite(value) || value < 0 || value > 100) throw usageError(this);
                game.settings.set('cloudCover', value);
                return `${TEXTS.cloudCover(game.settings.get('cloudCover'))}. Profil oświetlenia, bez symulacji pogody.`;
            }
            if (action === 'reset') {
                if (args.length !== 1) throw usageError(this);
                resetLightingDiagnostics();
                return 'Pełny obraz i wszystkie źródła światła przywrócone.';
            }

            if (simplify(args[0] ?? '') === 'model') {
                const choices = { swiat: 'world', atmosfera: 'world', domyslny: 'world', klasyczne: 'classic', klasyczny: 'classic' };
                const choice = choices[simplify(args[1] ?? '')];
                if (args.length !== 2 || !choice) throw usageError(this);
                // Te modele są odniesieniem sprzed naturalnej palety.
                // Jawna komenda ma rzeczywiście przełączyć wygląd świata.
                game.settings.set('lightingLook', 'baseline');
                game.settings.set('lightingModel', choice);
                return `${TEXTS.lightingModel(choice)}; ${TEXTS.lightingLook('baseline')}. Powrót: /swiatlo paleta naturalna.`;
            }

            if (args[0] !== undefined && simplify(args[0]) === 'odbite') {

                const mode = simplify(args[1] ?? '');
                const key = game.settings.get('lightingLook') === 'natural' ? 'surfaceBounce' : 'bounceLight';

                const on =
                    ON_WORDS.includes(mode) ? true :
                    OFF_WORDS.includes(mode) ? false :
                    !game.settings.get(key);

                game.settings.set(key, on);

                return `${TEXTS[key](on)}${on && (game.settings.get('potato') || game.settings.get('lightingMaterials') === 'basic')
                    ? ' (włącz Standardowe światło materiałów w zaawansowanych ustawieniach obrazu)' : ''}`;

            }

            if (args[0] !== undefined) {

                if (simplify(args[0]) !== 'dynamiczne') {
                    throw usageError(this);
                }

                const mode = simplify(args[1] ?? '');

                const on =
                    ['wl', 'on', 'tak'].includes(mode) ? true :
                    ['wyl', 'off', 'nie'].includes(mode) ? false :
                    !game.settings.get('dynamicLight');

                game.settings.set('dynamicLight', on);

                return `Dynamiczne światło (lampa w ręce, meteoryty, kule): ${on ? 'włączone' : 'wyłączone'}.`;

            }

            const camera = game.camera.position;

            let text = 'Przy głowie: ' + describeLight(world.getLight(
                Math.floor(camera.x), Math.floor(camera.y), Math.floor(camera.z)
            ));

            text += ` | ${TEXTS.lightingLook(game.settings.get('lightingLook'))} | model: ${game.sky.atmosphere ? 'atmosferyczny' : 'klasyczny'}`;
            if (game.sky.atmosphere) {
                const sample = game.sky.atmosphere;
                text += ` | wysokość Słońca: ${sample.altitude.toFixed(1)}°` +
                    ` | widoczna tarcza: ${(sample.discVisibility * 100).toFixed(1)}%` +
                    ` | kierunek wiązki: ${(Math.asin(sample.lightHeight) * 180 / Math.PI).toFixed(1)}°` +
                    ` | droga w atmosferze: x${sample.airMass.toFixed(1)}` +
                    ` | bezpośrednie RGB: ${sample.direct.map(v => v.toFixed(2)).join(' / ')}`;
            }

            // Końcowe liniowe odbicie wraz z aktualną energią źródeł.

            if (game.bounce?.enabled) {

                const bounce = game.bounce.sample(camera.x, camera.y, camera.z);

                text += `, odbite od ścian: ${bounce.map((value) => value.toFixed(2)).join(' / ')} (R / G / B)`;

            }


            const hit = game.currentHit;

            if (hit && hit.hit) {

                const x = hit.block.x + hit.normal.x;
                const y = hit.block.y + hit.normal.y;
                const z = hit.block.z + hit.normal.z;

                text += ` | przy wskazanej ścianie: ${describeLight(world.getLight(x, y, z))}`;

            }

            return text;

        },

        complete(args) {
            if (args.length === 1) return ['paleta', 'widok', 'zrodlo', 'chmury', 'reset', 'model', 'dynamiczne', 'odbite'];
            if (args.length === 2 && simplify(args[0]) === 'paleta') return ['naturalna', 'poprzednia'];
            if (args.length === 2 && simplify(args[0]) === 'widok') return LIGHTING_VIEWS;
            if (args.length === 2 && simplify(args[0]) === 'zrodlo') return ['sun', 'moon', 'sky', 'bounce', 'local', 'emission', 'transmission', 'specular'];
            if (args.length === 2 && simplify(args[0]) === 'model') return ['atmosfera', 'klasyczne'];
            if (args.length === 2) return ['wl', 'wyl'];
            return [];
        }
    },


    {
        name: 'cienie',
        aliases: ['shadows'],
        usage: '/cienie | /cienie <wyl | zwykle | dokladne | dalekie> | /cienie promienie <wl | wyl>',
        description: 'Cienie słońca i księżyca (pikselowe) i promienie światła w powietrzu: stan i włączanie.',

        run(args, { game }) {

            const settings = game.settings;

            const word = simplify(args[0] ?? '');


            if (word === 'promienie') {

                const mode = simplify(args[1] ?? '');

                const on =
                    ON_WORDS.includes(mode) ? true :
                    OFF_WORDS.includes(mode) ? false :
                    !settings.get('lightShafts');

                settings.set('lightShafts', on);

                return `${TEXTS.lightShafts(on)}${on && settings.get('shadows') === 0 ? ' (działają tylko z cieniami słońca: /cienie dokladne)' : ''}`;

            }


            if (word !== '') {

                const value = SHADOW_WORDS[word] ?? Number(word);

                if (![0, 1, 2, 3].includes(value)) {
                    throw usageError(this);
                }

                settings.set('shadows', value);

            }


            const shadows = game.shadows;

            const quality = settings.get('shadows');

            let text = `${TEXTS.shadows(quality)}, ${TEXTS.lightShafts(settings.get('lightShafts')).replace(/\.$/, '')}.`;

            if (!shadows.supported) {
                return `${text} Ta przeglądarka nie ma WebGL2 - cienie nie zadziałają.`;
            }

            if (settings.get('potato')) {
                return `${text} W trybie ziemniaka cieni nie ma (/ziemniak wyl).`;
            }

            if (!shadows.enabled) {
                return text;
            }

            const degrees = Math.round(Math.asin(Math.max(-1, Math.min(1, shadows.direction.y))) * 180 / Math.PI);

            text += ` Cienie rzuca ${shadows.light === 'sun' ? 'słońce' : 'księżyc'} (${degrees}° nad horyzontem, ` +
                `siła ${Math.round(shadows.strength * 100)}%), mapa ${shadows.size} x ${shadows.size} - ${shadows.radius} bloki wokół gracza, ` +
                `przerysowana ${shadows.draws} ${shadows.draws === 1 ? 'raz' : 'razy'}` +
                (shadows.hasFar ? `; daleka mapa: ${shadows.farRadius} bloków wokół gracza (z dalekim terenem), przerysowana ${shadows.farDraws} ${shadows.farDraws === 1 ? 'raz' : 'razy'}` : '') +
                `. Słońce na graczu: ${Math.round(game.sunVisibility * 100)}%.`;

            if (shadows.strength === 0) {
                text += ' Teraz słońce i księżyc są za nisko (albo nie świecą) - cieni nie widać.';
            }

            return text;

        },

        complete(args) {

            if (args.length === 1) return ['wyl', 'zwykle', 'dokladne', 'dalekie', 'promienie'];
            if (args.length === 2 && simplify(args[0]) === 'promienie') return ['wl', 'wyl'];

            return [];

        }
    },


    {
        name: 'demo',
        aliases: [],
        usage: '/demo swiatlo | /demo okno | /demo dom | /demo kula [kolor | usun] | /demo skaly',
        description: 'Sceny do sprawdzania nowości: pokój z kolorowymi lampami, ciemny pokój z oknami od strony słońca ' +
            '(snopy światła i cienie), dom z pokoi z różnego budulca (światło odbite), krążąca kula dynamicznego światła, ' +
            'odkrywka (wykop do dna świata - widać warstwy skał).',

        run(args, ctx) {

            const what = simplify(args[0] ?? '');


            if (what === 'swiatlo') {
                return buildLightDemo(ctx);
            }


            if (['okno', 'okna', 'slonce'].includes(what)) {
                return buildWindowDemo(ctx);
            }


            if (['dom', 'pokoje', 'budulec'].includes(what)) {
                return buildHouseDemo(ctx);
            }


            if (['skaly', 'odkrywka'].includes(what)) {
                return buildRockDemo(ctx);
            }


            if (what === 'kula') {

                if (simplify(args[1] ?? '') === 'usun') {

                    ctx.game.removeOrbs();

                    return 'Usunięto kule światła.';

                }

                const color = args[1] === undefined ? new THREE.Color('#9fd0ff') : parseColor(args[1]);

                if (!color) {
                    throw new CommandError('Podaj kolor kuli, np. /demo kula zielony');
                }

                const srgb = {};

                color.getRGB(srgb, THREE.SRGBColorSpace);

                ctx.game.addOrb([srgb.r, srgb.g, srgb.b]);

                return 'Kula światła krąży przed tobą przez minutę (światło nie przechodzi przez ściany). ' +
                    (ctx.game.settings.get('dynamicLight') ? '' : 'Uwaga: dynamiczne światło jest wyłączone (/swiatlo dynamiczne wl).');

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['swiatlo', 'okno', 'dom', 'kula', 'skaly'];
            if (args.length === 2 && simplify(args[0]) === 'kula') return [...Object.keys(COLOR_NAMES), 'usun'];

            return [];

        }
    },

    // ========================================================
    // SCENY TESTOWE (tryb programisty - src/dev/scenes.js)
    // ========================================================

    {
        name: 'scena',
        aliases: ['scene', 'sceny'],
        usage: '/scena lista | /scena <nazwa> | /scena czas <swit | poludnie | zachod | noc | stop | start>',
        description: 'Tryb programisty: gotowe sceny do testów (światło, lampy, okno, dom, basen, rośliny, krzaki, drzewa, skały) - ' +
            'na placu testowym zawsze w tym samym miejscu; pora dnia jednym słowem i zatrzymanie czasu.',

        run(args, ctx) {

            const { game, time } = ctx;

            const word = simplify(args[0] ?? '');


            if (word === 'czas') {

                const what = simplify(args[1] ?? '');

                const times = { swit: 'dawn', poludnie: 'noon', zachod: 'dusk', noc: 'night' };

                if (what in times) {
                    setSceneTime(time, times[what]);
                    return `Pora dnia: ${TEXTS.sceneTimes[times[what]]}${time.speed === 0 ? ' (czas stoi)' : ''}.`;
                }

                if (['stop', 'start'].includes(what)) {
                    time.speed = what === 'stop' ? 0 : 1;
                    return TEXTS.sceneFreeze(time.speed === 0) + '.';
                }

                throw usageError(this);

            }


            if (!word || word === 'lista') {

                return 'Sceny testowe (/scena <nazwa>):\n' +
                    SCENES.map((scene) => `${scene.id} - ${scene.name}: ${scene.description}`).join('\n');

            }


            if (game.mode !== 'developer') {
                throw new CommandError('Sceny testowe są w trybie programisty: /tryb programista.');
            }

            const scene = findScene(word);

            if (!scene) {
                throw new CommandError(`Nie ma sceny "${args[0]}". Do wyboru: ${SCENES.map((s) => s.id).join(', ')}`);
            }

            const text = buildScene(scene, ctx, (name, commandArgs) =>
                GAME_COMMANDS.find((command) => command.name === name).run(commandArgs, ctx));

            return `${TEXTS.sceneBuilt(scene.name)} ${text}`.trim();

        },

        complete(args) {

            if (args.length === 1) return ['lista', 'czas', ...SCENES.map((scene) => scene.id)];
            if (args.length === 2 && simplify(args[0]) === 'czas') return ['swit', 'poludnie', 'zachod', 'noc', 'stop', 'start'];

            return [];

        }
    },

    // ========================================================
    // TEREN (generator terenu - docs/generator-terenu.md)
    // ========================================================

    {
        name: 'teren',
        aliases: ['terrain'],
        usage: '/teren [x z] | /teren znajdz <forma> [promien] [tp] | /teren formy',
        description: 'Teren w miejscu gracza (albo x z): wysokość, niziny/wyżyny/góry, forma terenu, pola generatora. Szukanie form.',

        run(args, { world, player }) {

            const [action] = args;


            if (!action) {
                return terrainText(world, Math.floor(player.pos.x), Math.floor(player.pos.z));
            }


            const word = simplify(action);


            if (word === 'formy') {

                return 'Formy terenu (/teren znajdz <forma>): ' +
                    Object.keys(LANDFORM_WORDS).join(', ');

            }


            if (['znajdz', 'find'].includes(word)) {

                const target = LANDFORM_WORDS[simplify(args[1] ?? '')];

                if (!target) {
                    throw new CommandError(`Podaj formę terenu: ${Object.keys(LANDFORM_WORDS).join(', ')}`);
                }

                const teleport = args.slice(2).some((arg) => simplify(arg) === 'tp');

                const radiusArg = args.slice(2).find((arg) => simplify(arg) !== 'tp');

                const radius = radiusArg === undefined ? 1500 : parseNumber(radiusArg, 'promień');

                if (radius < 16 || radius > 4000) {
                    throw new CommandError('Promień: od 16 do 4000 bloków');
                }


                const found = findLandform(
                    world.generator,
                    Math.floor(player.pos.x),
                    Math.floor(player.pos.z),
                    target,
                    radius
                );

                if (!found) {
                    throw new CommandError(`Nie ma "${args[1]}" w promieniu ${radius} bloków. Spróbuj większy promień.`);
                }


                const { x, z, info, distance } = found;

                const what = target.landform
                    ? LANDFORMS[info.landform].name
                    : RELIEFS[info.relief];

                if (teleport) {

                    world.ensureColumnLoaded(x, z);

                    player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.updateCamera();

                    return `Przeniesiono: ${what} na ${x}, ${z} (${distance} bloków stąd).`;

                }

                return `Najbliżej: ${what} na ${x}, ${z} (ok. ${distance} bloków stąd, wysokość ${info.height}). ` +
                    `Przeniesienie: /tp ${x} ${z} albo /teren znajdz ${simplify(args[1])} tp`;

            }


            if (args.length === 2) {

                const x = Math.floor(parseCoordinate(args[0], player.pos.x));
                const z = Math.floor(parseCoordinate(args[1], player.pos.z));

                return terrainText(world, x, z);

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['znajdz', 'formy', '~'];
            if (args.length === 2 && simplify(args[0]) === 'znajdz') return Object.keys(LANDFORM_WORDS);
            if (args.length >= 3 && simplify(args[0]) === 'znajdz') return ['tp', '500', '3000'];

            return [];

        }
    },


    {
        name: 'biom',
        aliases: ['biome', 'biomy'],
        usage: '/biom | /biom lista | /biom znajdz <biom> [promien] [tp]',
        description: 'Biom w miejscu gracza (łąka, las liściasty, hala, mokradła...): co tam rośnie, klimat. Lista biomów i szukanie najbliższego.',

        run(args, { world, player, game }) {

            const generator = world.generator;

            if (!generator.biomes) {
                throw new CommandError('Teren klasyczny nie ma biomów - są w terenie realistycznym (nowy świat: Teren - Realistyczny).');
            }

            const visited = new Set(game?.achievements?.data?.progress?.biomes ?? []);

            const [action] = args;


            if (!action) {

                const x = Math.floor(player.pos.x);
                const z = Math.floor(player.pos.z);

                const key = generator.biomeAt(x, z);

                const info = generator.biomes.info;

                const biome = BIOMES[key];

                return `Biom: ${biome.name} (${x}, ${z}) - ${biome.about}. ` +
                    `Temperatura ${info.temperature.toFixed(2)}, wilgotność ${info.humidity.toFixed(2)}, wysokość ${info.above >= 0 ? '+' : ''}${info.above} nad morzem. ` +
                    `Odwiedzone: ${LAND_BIOMES.filter((k) => visited.has(k)).length} z ${LAND_BIOMES.length} (/biom lista, /mapa biomy).`;

            }


            const word = simplify(action);


            if (['lista', 'list'].includes(word)) {

                return 'Biomy (✔ - odwiedzone; /biom znajdz <słowo>): ' +
                    BIOME_KEYS.map((key) => `${!BIOMES[key].water && visited.has(key) ? '✔ ' : ''}${BIOMES[key].name} (${BIOMES[key].words[0]})`).join(', ');

            }


            if (['znajdz', 'find'].includes(word)) {

                const target = biomeByWord(simplify(args[1] ?? ''));

                if (!target) {
                    throw new CommandError(`Podaj biom: ${BIOME_KEYS.map((key) => BIOMES[key].words[0]).join(', ')}`);
                }

                const teleport = args.slice(2).some((arg) => simplify(arg) === 'tp');

                const radiusArg = args.slice(2).find((arg) => simplify(arg) !== 'tp');

                const radius = radiusArg === undefined ? 3000 : parseNumber(radiusArg, 'promień');

                if (radius < 16 || radius > 8000) {
                    throw new CommandError('Promień: od 16 do 8000 bloków');
                }

                const found = findBiome(generator, Math.floor(player.pos.x), Math.floor(player.pos.z), target, radius);

                if (!found) {
                    throw new CommandError(`Nie ma biomu "${BIOMES[target].name}" w promieniu ${radius} bloków. Spróbuj większy promień.`);
                }

                const { x, z, distance } = found;

                if (teleport) {

                    world.ensureColumnLoaded(x, z);

                    player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.updateCamera();

                    return `Przeniesiono: ${BIOMES[target].name} na ${x}, ${z} (${distance} bloków stąd).`;

                }

                return `Najbliżej: ${BIOMES[target].name} na ${x}, ${z} (ok. ${distance} bloków stąd). ` +
                    `Przeniesienie: /tp ${x} ${z} albo /biom znajdz ${BIOMES[target].words[0]} tp`;

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['lista', 'znajdz'];
            if (args.length === 2 && simplify(args[0]) === 'znajdz') return BIOME_KEYS.map((key) => BIOMES[key].words[0]);
            if (args.length >= 3 && simplify(args[0]) === 'znajdz') return ['tp', '1000', '6000'];

            return [];

        }
    },


    {
        name: 'skaly',
        aliases: ['rocks', 'geologia'],
        usage: '/skaly | /skaly statystyki [promien] | /skaly znajdz <skala> [promien] [tp] | /skaly zyla [promien] [tp] | /skaly przekroj',
        description: 'Skały pod ziemią: kolumna pod graczem, udział skał w okolicy, szukanie odsłoniętych skał i żył lepidolitu, przekrój.',

        run(args, { world, player, game, map }) {

            const generator = world.generator;

            if (!generator.columnBlocks) {
                throw new CommandError('Ten typ terenu nie ma opisu skał.');
            }


            const px = Math.floor(player.pos.x);
            const pz = Math.floor(player.pos.z);

            const action = simplify(args[0] ?? '');


            if (!action) {
                return columnText(generator, px, pz);
            }


            const flags = args.slice(1).map(simplify);

            const teleport = flags.includes('tp');

            const radiusOf = (fallback, max) => {

                const text = args.slice(1).find((arg) => /^\d+$/.test(arg));

                const radius = text === undefined ? fallback : Number(text);

                if (radius < 16 || radius > max) {
                    throw new CommandError(`Promień: od 16 do ${max} bloków`);
                }

                return radius;

            };

            const moveTo = (x, z) => {

                world.ensureColumnLoaded(x, z);

                player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                player.vel.set(0, 0, 0);
                player.updateCamera();

            };


            if (['statystyki', 'stat', 'stats'].includes(action)) {

                const radius = radiusOf(128, 1024);

                const step = Math.max(1, Math.ceil(radius / 20));

                const counts = {};

                let columns = 0;
                let rock = 0;
                let exposed = 0;

                const buffer = new Uint16Array(CHUNK_HEIGHT);

                for (let dz = -radius; dz <= radius; dz += step) {

                    for (let dx = -radius; dx <= radius; dx += step) {

                        if (dx * dx + dz * dz > radius * radius) {
                            continue;
                        }

                        const { blocks, height } = generator.columnBlocks(px + dx, pz + dz, buffer);

                        columns++;

                        for (let y = 0; y <= height; y++) {

                            const type = getBlockTypeById(blocks[y]);

                            if (type in ROCK_INFO) {
                                counts[type] = (counts[type] ?? 0) + 1;
                                rock++;
                            }

                        }

                        if (getBlockTypeById(blocks[height]) === 'lepidolite') {
                            exposed++;
                        }

                    }

                }


                const shares = Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => `${blockNamePl(type)} ${(100 * count / rock).toFixed(type === 'lepidolite' ? 2 : 1)}%`)
                    .join(', ');

                return `Skały w promieniu ${radius} bl. (${columns} kolumn co ${step} bl.): ${shares || 'brak'}. ` +
                    `Lepidolit na wierzchu: ${exposed} kolumn.`;

            }


            if (['znajdz', 'find'].includes(action)) {

                const target = blockFromWord(flags[0] ?? '');

                if (!target || !(target in ROCK_INFO)) {
                    throw new CommandError(`Podaj skałę: ${Object.values(ROCK_INFO).map((info) => info.word).join(', ')}`);
                }


                // Odsłonięte skały zajmują duże plamy - wystarczy rzadka
                // siatka. Lepidolit wychodzi na wierzch w małych miejscach,
                // więc szukamy gęsto (i bliżej).

                const lepidolite = target === 'lepidolite';

                const radius = radiusOf(lepidolite ? 256 : 1500, lepidolite ? 512 : 4000);

                const found = searchRings(px, pz, radius, lepidolite ? 2 : 12, (x, z) =>
                    generator.surfaceBlock(x, z) === target ? {} : null
                );

                if (!found) {

                    throw new CommandError(
                        `Nie ma odsłoniętego: ${blockNamePl(target)} w promieniu ${radius} bl.` +
                        (lepidolite ? ' Lepidolit rzadko wychodzi na wierzch - pod ziemią szukaj: /skaly zyla' : '')
                    );

                }

                if (teleport) {

                    moveTo(found.x, found.z);

                    return `Przeniesiono: ${blockNamePl(target)} na wierzchu, ${found.x}, ${found.z} (${found.distance} bl. stąd).`;

                }

                return `Najbliżej: ${blockNamePl(target)} na wierzchu, ${found.x}, ${found.z} (ok. ${found.distance} bl. stąd). ` +
                    `Przeniesienie: /skaly znajdz ${flags[0]} tp`;

            }


            if (['zyla', 'zyly', 'vein'].includes(action)) {

                const radius = radiusOf(192, 512);

                const buffer = new Uint16Array(CHUNK_HEIGHT);

                const lepidoliteId = getBlockDefinition('lepidolite').id;

                const found = searchRings(px, pz, radius, 4, (x, z) => {

                    const { blocks, height } = generator.columnBlocks(x, z, buffer);

                    for (let y = height; y >= 0; y--) {

                        if (blocks[y] === lepidoliteId) {
                            return { y, height };
                        }

                    }

                    return null;

                });

                if (!found) {
                    throw new CommandError(`Nie ma żyły lepidolitu w promieniu ${radius} bl. Spróbuj większy promień albo inne miejsce (żyły są w granicie - pod górami płycej).`);
                }

                const depth = found.height - found.y;

                if (teleport) {

                    moveTo(found.x, found.z);

                    return `Przeniesiono nad żyłę lepidolitu: ${found.x}, ${found.z} - żyła ${depth} bl. pod tobą (y ${found.y}).`;

                }

                return `Najbliższa żyła lepidolitu: ${found.x}, ${found.z}, y ${found.y} (${depth} bl. pod powierzchnią, ` +
                    `ok. ${found.distance} bl. stąd). Przeniesienie: /skaly zyla tp`;

            }


            if (['przekroj', 'section'].includes(action)) {

                if (!map) {
                    throw new CommandError('Mapa jest niedostępna.');
                }

                map.open(generator, player.pos.x, player.pos.z, 'przekroj', 1, player.yaw);

                return 'Przekrój terenu w kierunku patrzenia (to samo co /mapa przekroj). Zamknięcie: M albo /mapa wyl.';

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['statystyki', 'znajdz', 'zyla', 'przekroj'];

            const action = simplify(args[0]);

            if (action === 'znajdz' && args.length === 2) return Object.values(ROCK_INFO).map((info) => info.word);
            if (action === 'znajdz' && args.length >= 3) return ['tp', '500', '3000'];
            if (action === 'zyla') return ['tp', '256', '512'];
            if (action === 'statystyki' && args.length === 2) return ['64', '128', '512'];

            return [];

        }
    },


    {
        name: 'mapa',
        aliases: ['map'],
        usage: '/mapa [warstwa] [skala] | /mapa wyl   (skala = bloki na punkt: 1, 2, 4, 8, 16, 32)',
        description: 'Mapa terenu z góry: wysokość, formy terenu, niziny/wyżyny/góry, skały, pola generatora; ' +
            'przekrój pionowy w kierunku patrzenia (/mapa przekroj). Klawisz M.',

        run(args, { game, player, map }) {

            if (!map) {
                throw new CommandError('Mapa jest niedostępna.');
            }


            if (args.length === 0 && map.isOpen) {

                map.close();

                return 'Mapa zamknięta.';

            }

            if (OFF_WORDS.includes(simplify(args[0] ?? ''))) {

                map.close();

                return 'Mapa zamknięta.';

            }


            let layer = map.layer;
            let scale = null;

            for (const arg of args) {

                const word = simplify(arg);

                if (word in MAP_LAYERS) {
                    layer = word;
                }
                else if (MAP_SCALES.includes(Number(word))) {
                    scale = Number(word);
                }
                else {
                    throw new CommandError(`Warstwy: ${Object.keys(MAP_LAYERS).join(', ')}. Skale: ${MAP_SCALES.join(', ')}`);
                }

            }


            // Bez podanej skali: przekrój z bliska (1 blok na punkt),
            // a po przekroju zwykła mapa wraca do 8.

            if (scale === null) {

                scale =
                    layer === 'przekroj' ? 1 :
                    map.layer === 'przekroj' ? 8 :
                    map.scale;

            }


            map.open(game.world.generator, player.pos.x, player.pos.z, layer, scale, player.yaw);

            return `Mapa: ${MAP_LAYERS[layer]}, 1 punkt = ${scale} bl. ` +
                (layer === 'przekroj'
                    ? 'Przy otwartym czacie wskaż punkt myszą - pokaże wysokość i skałę.'
                    : 'Przy otwartym czacie wskaż punkt myszą - pokaże współrzędne i formę terenu.');

        },

        complete(args) {
            return args.length <= 2 ? [...Object.keys(MAP_LAYERS), ...MAP_SCALES.map(String), 'wyl'] : [];
        }
    },

    // ========================================================
    // DALEKI TEREN, USTAWIENIA, WYDAJNOŚĆ
    // ========================================================

    {
        name: 'horyzont',
        aliases: ['daleki-teren', 'horizon'],
        usage: '/horyzont | /horyzont <bloki | wyl> | /horyzont szczegoly <niskie | srednie | wysokie> | /horyzont lod | /horyzont odswiez',
        description: 'Daleki teren za zasięgiem widzenia: zasięg, kafelki, kolorowanie dokładności.',

        run(args, { game }) {

            const far = game.farTerrain;

            const [action] = args;


            if (!action) {

                const stats = far.stats();

                if (!stats.active) {

                    return `Daleki teren wyłączony (zasięg widzenia ${game.viewDistance}, ` +
                        `daleki teren ${game.settings.get('farTerrain') || 'wył.'}). Włącz: /horyzont 1024`;

                }

                return `Daleki teren: od ${far.inner} do ${far.outer} bloków | ` +
                    `${TEXTS.farDetail(game.settings.get('farDetail'))}${game.settings.get('potato') ? ' (tryb ziemniaka - mniej)' : ''} | ` +
                    `kafelków: ${stats.shown} widocznych` +
                    `${stats.missing ? `, ${stats.missing} w budowie` : ''}, ${stats.cached} w pamięci | ` +
                    `${Math.round(stats.triangles / 1000)} tys. trójkątów | ` +
                    `kafelki liczą: ${stats.workers ? `osobne wątki (${stats.workers})` : 'gra (bez osobnych wątków)'} | ` +
                    `kolorowanie dokładności: ${far.debugLod ? 'wł.' : 'wył.'} (/horyzont lod)`;

            }


            const word = simplify(action);


            if (word === 'lod') {

                far.setDebugLod(!far.debugLod);

                return far.debugLod
                    ? `Kafelki pokolorowane według wielkości kratki: ${LOD_LEGEND}.`
                    : 'Kolorowanie dokładności wyłączone.';

            }


            if (['odswiez', 'refresh'].includes(word)) {

                far.rebuildAll();

                return 'Daleki teren buduje się od nowa.';

            }


            if (['szczegoly', 'detail'].includes(word)) {

                game.settings.set('farDetail', parseSettingValue('farDetail', args[1]));

                return `${TEXTS.farDetail(game.settings.get('farDetail'))} - im wyższe, tym drobniejsze kratki ` +
                    '(i więcej trójkątów: wysokie ~2x więcej niż średnie, niskie ~4x mniej).';

            }


            const value = parseSettingValue('farTerrain', action);

            if (value > 0 && value < SETTINGS_RANGES.farTerrain.step) {
                throw new CommandError(`Daleki teren: od ${SETTINGS_RANGES.farTerrain.step} do ${SETTINGS_RANGES.farTerrain.max} bloków (albo wyl)`);
            }

            game.settings.set('farTerrain', value);

            return settingText('farTerrain', game.settings.get('farTerrain')) +
                (far.active || value === 0 ? '' : ' (musi sięgać dalej niż zasięg widzenia)');

        },

        complete(args) {
            if (args.length === 2 && simplify(args[0]) === 'szczegoly') {
                return ['niskie', 'srednie', 'wysokie'];
            }

            return args.length === 1 ? ['1024', '2048', '4096', '8192', '16384', 'wyl', 'szczegoly', 'lod', 'odswiez'] : [];
        }
    },


    {
        name: 'ziemniak',
        aliases: ['potato'],
        usage: '/ziemniak [wl | wyl]',
        description: 'Tryb ziemniaka: wszystko działa, ale prościej i szybciej (słaby komputer, brak karty graficznej).',

        run(args, { game }) {

            const settings = game.settings;

            const word = simplify(args[0] ?? '');

            const on =
                ON_WORDS.includes(word) ? true :
                OFF_WORDS.includes(word) ? false :
                args[0] === undefined ? !settings.get('potato') :
                null;

            if (on === null) {
                throw usageError(this);
            }


            settings.set('potato', on);

            if (!on) {
                return 'Tryb ziemniaka wyłączony - wracają zwykłe ustawienia. ' +
                    'Wygładzanie krawędzi wróci po odświeżeniu strony (F5).';
            }

            return 'Tryb ziemniaka włączony: ' +
                `rozdzielczość najwyżej ${POTATO_RENDER_SCALE}%, ` +
                `zasięg widzenia najwyżej ${POTATO_VIEW_DISTANCE} bloków, ` +
                'rzadsza siatka dalekiego terenu, bez Drogi Mlecznej, ' +
                `${Math.round(POTATO_STAR_SHARE * 100)}% gwiazd, mgła liczona w rogach ścian. ` +
                'Wygładzanie krawędzi wyłączy się po odświeżeniu strony (F5). ' +
                'Twoje ustawienia zostają - wyłączysz: /ziemniak wyl';

        },

        complete(args) {
            return args.length === 1 ? ['wl', 'wyl'] : [];
        }
    },


    {
        name: 'dotyk',
        aliases: ['touch', 'telefon'],
        usage: '/dotyk [wl | wyl]',
        description: 'Sterowanie dotykowe (telefon, tablet): czy jest włączone, ekran i rozdzielczość; wl / wyl - przełącza (zapis świata i odświeżenie strony).',

        run(args, { game, touch }) {

            const word = simplify(args[0] ?? '');

            if (args[0] === undefined) {

                const canvas = game.renderer.domElement;

                const reason = touch.forced
                    ? 'wymuszone adresem z ?dotyk'
                    : touch.app
                        ? 'aplikacja na telefon'
                        : touch.detected
                            ? 'wykryty ekran dotykowy'
                            : touch.enabled
                                ? 'włączone po dotknięciu ekranu'
                                : 'jest mysz albo nie ma ekranu dotykowego';

                return `Sterowanie dotykowe: ${touch.enabled ? 'włączone' : 'wyłączone'} (${reason}). ` +
                    `Ekran ${window.innerWidth}×${window.innerHeight} punktów, ` +
                    `${(window.devicePixelRatio || 1).toFixed(2)} piksela na punkt - ` +
                    `gra rysuje ${canvas.width}×${canvas.height} pikseli. ` +
                    `Przełączysz: /dotyk ${touch.enabled ? 'wyl' : 'wl'}`;

            }

            const on =
                ON_WORDS.includes(word) ? true :
                OFF_WORDS.includes(word) ? false :
                null;

            if (on === null) {
                throw usageError(this);
            }

            if (on === touch.enabled) {
                return `Sterowanie dotykowe już jest ${on ? 'włączone' : 'wyłączone'}.`;
            }

            touch.reload(on);

            return `Zapisuję świat i odświeżam stronę ${on ? 'ze sterowaniem dotykowym' : 'bez sterowania dotykowego'}...`;

        },

        complete(args) {
            return args.length === 1 ? ['wl', 'wyl'] : [];
        }
    },


    {
        name: 'tekstury',
        aliases: ['paczka', 'textures'],
        usage: '/tekstury [wczytaj | rozdzielczosc <auto | 16 | 32 | 64 | 128 | 256 | 512> | oryginalne | szablon | lista]',
        description: 'Paczka tekstur: stan; wczytaj - wybierz plik .zip; rozdzielczosc - piksele na blok w grze; oryginalne - bez paczki; szablon - pobierz szablon paczki; lista - brakujące i pominięte pliki paczki (docs/paczki-tekstur.md).',

        run(args, { game, chat, reload }) {

            const settings = game.settings;

            const word = simplify(args[0] ?? '');

            const status = (text, error = false) => chat.print(text, error ? 'error' : 'hint');

            if (word === '') {

                describeTextures(settings).then((text) => chat.print(text, 'success'));

                return 'Sprawdzam paczkę tekstur...';

            }

            if (word === 'wczytaj') {

                chooseTexturePack(settings, status, reload);

                return 'Wybierz plik .zip z paczką tekstur (szablon: /tekstury szablon).';

            }

            if (word === 'rozdzielczosc') {

                const choices = resolutionChoices();

                const value = simplify(args[1] ?? '');

                if (!value) {
                    return `Rozdzielczość tekstur: ${resolutionName(settings.get('textureResolution'))}. Do wyboru na tym urządzeniu: ${choices.map(resolutionName).join(', ')}.`;
                }

                const size = value === 'auto' || value === 'automatyczna' ? 0 : parseInt(value, 10);

                if (!choices.includes(size)) {
                    throw new CommandError(`Do wyboru na tym urządzeniu: auto, ${choices.filter(Boolean).join(', ')}.`);
                }

                setTextureResolution(settings, size, status, reload);

                return `Rozdzielczość tekstur: ${resolutionName(size)}...`;

            }

            if (word === 'oryginalne' || word === 'domyslne' || word === 'usun') {

                resetTexturePack(status, reload);

                return 'Oryginalne tekstury...';

            }

            if (word === 'szablon') {
                return `Szablon paczki (oryginalne tekstury, opis w środku): ${openTemplate()}`;
            }

            if (word === 'lista') {

                getPackInfo().then((info) => {

                    if (!info) {
                        chat.print('Nie ma paczki tekstur.', 'error');
                        return;
                    }

                    const missing = info.missing.length
                        ? `Bez tekstury w paczce (zostają oryginalne, ${info.missing.length}): ${info.missing.join(', ')}.`
                        : 'Paczka ma wszystkie tekstury.';

                    const unknown = info.unknown.length
                        ? ` Pominięte pliki (${info.unknown.length}): ${info.unknown.join(', ')}.`
                        : '';

                    chat.print(missing + unknown, 'success');

                });

                return `Pliki paczki...`;

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) {
                return TEXTURE_WORDS;
            }

            if (args.length === 2 && simplify(args[0]) === 'rozdzielczosc') {
                return ['auto', ...resolutionChoices().filter(Boolean).map(String)];
            }

            return [];

        }
    },


    {
        name: 'aktualizacja',
        aliases: ['aktualizacje', 'update', 'wersja'],
        usage: '/aktualizacja [sprawdz | pobierz | instaluj | wroc]',
        description: 'Wersja gry i aktualizacje aplikacji (komputer, telefon): stan; sprawdz - sprawdź wydania teraz; pobierz - pobierz nową aplikację (telefon); instaluj - nowa wersja od razu; wroc - wersja wbudowana w aplikację (telefon).',

        run(args, { updates, chat }) {

            const word = simplify(args[0] ?? '');

            if (args[0] !== undefined && !UPDATE_WORDS.includes(word)) {
                throw usageError(this);
            }


            // Przeglądarka.

            if (!updates) {

                if (args[0] === undefined) {
                    return 'Gra w przeglądarce - działa ta wersja, którą podaje strona (odświeżenie strony = najnowsza). ' +
                        'Same aktualizują się aplikacje: na komputer (docs/aplikacja.md) i na telefon (docs/telefon.md).';
                }

                throw new CommandError('Aktualizacje są tylko w aplikacji na komputer i na telefon.');

            }


            // Aplikacja na komputer (electron-updater - sprawdza przy starcie).

            if (updates.platform === 'desktop') {

                const status = updates.status();

                if (word === 'instaluj') {

                    if (status?.state !== 'ready') {
                        throw new CommandError('Nie ma pobranej aktualizacji. Aplikacja sprawdza wydania przy każdym uruchomieniu i sama pobiera nową wersję.');
                    }

                    updates.install();

                    return 'Zapisuję świat, zamykam grę i instaluję nową wersję...';

                }

                if (word === 'pobierz') {

                    if (status?.state !== 'available') {
                        throw new CommandError('Nie ma nic do pobrania (z aktualizacjami automatycznymi nowa wersja pobiera się sama).');
                    }

                    updates.download();

                    return `Pobieram wersję ${status.version}...`;

                }

                if (word !== '') {
                    throw new CommandError('Aplikacja na komputer sprawdza aktualizacje przy każdym uruchomieniu (gotową - /aktualizacja instaluj).');
                }

                const state =
                    status?.state === 'downloading' ? `pobieram wersję ${status.version}... ${status.percent ?? 0}%` :
                    status?.state === 'ready' ? `nowa wersja ${status.version} gotowa - zainstaluje się po zamknięciu gry (od razu: /aktualizacja instaluj)` :
                    status?.state === 'error' ? 'nie udało się pobrać aktualizacji (spróbuje przy następnym uruchomieniu)' :
                    status?.state === 'available' ? `jest nowa wersja ${status.version} - aktualizacje automatyczne są wyłączone (/aktualizacja pobierz)` :
                    'nowszej wersji nie ma (sprawdzane przy uruchomieniu)';

                return `Aplikacja na komputer, wersja ${updates.version}: ${state}.`;

            }


            // Aplikacja na telefon (src/app/AndroidUpdates.js).

            const updater = updates.updater;

            const info = updater.info;

            if (info?.wylaczone) {
                return `Wersja testowa aplikacji (${updater.version}) się nie aktualizuje - nowe testowe .apk są w GitHub Actions (docs/telefon.md).`;
            }

            const downloaded = info?.apk && updater.version && compareVersions(updater.version, info.apk) > 0;

            if (word === '') {

                const checked = updater.checkedAt
                    ? `sprawdzone ${Math.round((Date.now() - updater.checkedAt) / 60000)} min temu`
                    : updater.lastError ? `nie udało się sprawdzić: ${updater.lastError}` : 'jeszcze nie sprawdzone';

                const app = downloaded
                    ? `gra ${updater.version} (pobrana), aplikacja ${info.apk}`
                    : `wersja ${updater.version}`;

                return `Aplikacja na telefon, ${app}. ${updater.describe()} (${checked}). Dalej: /aktualizacja sprawdz | pobierz | instaluj | wroc`;

            }

            if (word === 'sprawdz') {

                updater.check()
                    .then((text) => chat.print(text, 'success'))
                    .catch((error) => chat.print(`Nie udało się sprawdzić wydań: ${error?.message ?? error}`, 'error'));

                return 'Sprawdzam wydania na GitHubie...';

            }

            if (word === 'pobierz') {

                const status = updater.status;

                if (status?.state !== 'available') {
                    throw new CommandError(`Nie ma nic do pobrania. ${updater.describe()}`);
                }

                updater.download();

                return status.kind === 'web'
                    ? `Pobieram nową wersję gry ${status.version} (${megabytes(status.size)} MB)...`
                    : `Pobieram aplikację ${status.version} (${megabytes(status.size)} MB)...`;

            }

            if (word === 'instaluj') {

                const status = updater.status;

                if (status?.state !== 'ready') {
                    throw new CommandError(`Nie ma gotowej aktualizacji. ${updater.describe()}`);
                }

                updater.install().catch((error) => chat.print(`Nie udało się: ${error?.message ?? error}`, 'error'));

                return status.kind === 'web'
                    ? `Zapisuję świat i uruchamiam wersję ${status.version}...`
                    : 'Otwieram instalację aplikacji (Android zapyta o zgodę)...';

            }

            // wroc

            if (!downloaded) {
                throw new CommandError(`Gra już działa na plikach wbudowanych w aplikację (${updater.version}).`);
            }

            updater.revert().catch((error) => chat.print(`Nie udało się: ${error?.message ?? error}`, 'error'));

            return `Zapisuję świat i wracam do wersji ${info.apk} wbudowanej w aplikację (pobrana ${updater.version} nie będzie już pobierana)...`;

        },

        complete(args) {
            return args.length === 1 ? UPDATE_WORDS : [];
        }
    },


    {
        name: 'ustaw',
        aliases: ['ustawienia', 'settings'],
        usage: '/ustaw | /ustaw <ustawienie> <wartość> | /ustaw domyslne   (np. /ustaw zasieg 256)',
        description: 'Ustawienia gry z czatu (to samo co w menu ustawień).',

        run(args, { game }) {

            const settings = game.settings;

            const [name, value] = args;


            if (!name) {

                return 'Ustawienia (/ustaw <nazwa> <wartość>):\n' +
                    Object.keys(SETTINGS_DEFAULTS)
                        .map((key) => `${settingWord(key)}: ${settingText(key, settings.get(key))}`)
                        .join('\n');

            }


            if (['domyslne', 'reset'].includes(simplify(name))) {

                settings.reset();

                return 'Przywrócono domyślne ustawienia.';

            }


            // Jakość grafiki - kilka ustawień obrazu naraz (Settings.js).

            if (['jakosc', 'grafika'].includes(simplify(name))) {

                const words = { niska: 'low', srednia: 'medium', wysoka: 'high', najwyzsza: 'ultra' };

                if (value === undefined) {
                    return TEXTS.graphicsPreset(graphicsPreset(settings));
                }

                const preset = words[simplify(value)];

                if (!preset) {
                    throw new CommandError('Jakość: niska, srednia, wysoka albo najwyzsza.');
                }

                for (const [setting, presetValue] of Object.entries(GRAPHICS_PRESETS[preset])) {
                    settings.set(setting, presetValue);
                }

                return TEXTS.graphicsPreset(preset);

            }


            const key = SETTING_WORDS[simplify(name)] ?? Object.keys(SETTINGS_DEFAULTS).find(
                (setting) => simplify(setting) === simplify(name)
            );

            if (!key) {
                throw new CommandError(`Nie ma ustawienia "${name}". Do wyboru: ${Object.keys(SETTING_WORDS).join(', ')}`);
            }


            if (value === undefined) {
                return settingText(key, settings.get(key));
            }


            settings.set(key, parseSettingValue(key, value));

            return settingText(key, settings.get(key));

        },

        complete(args) {

            if (args.length === 1) {
                return [...Object.keys(SETTING_WORDS), 'jakosc', 'domyslne'];
            }

            if (args.length === 2 && simplify(args[0]) === 'jakosc') {
                return ['niska', 'srednia', 'wysoka', 'najwyzsza'];
            }

            const key = SETTING_WORDS[simplify(args[0])];

            if (args.length === 2 && key) {

                if (typeof SETTINGS_DEFAULTS[key] === 'boolean') return ['wl', 'wyl'];
                if (key === 'jointStyle') return ['gladkie', 'klocki'];
                if (key === 'plantModels') return ['proste', 'polrealistyczne', 'szczegolowe'];
                if (key === 'leafModel') return ['czesci', 'bloki'];
                if (key in SETTINGS_CHOICES) return SETTINGS_CHOICES[key].map(String);
                if (key === 'theme') return Object.keys(UI_THEMES);

                const { min, max } = SETTINGS_RANGES[key];

                return [String(min), String(SETTINGS_DEFAULTS[key]), String(max)];

            }

            return [];

        }
    },


    {
        name: 'wydajnosc',
        aliases: ['perf', 'fps'],
        usage: '/wydajnosc | /wydajnosc test [sekundy]',
        description: 'Klatki na sekundę, czasy klatki, rysowanie, chunki, pamięć; test z obrotem kamery.',

        run(args, { game, world }) {

            if (args[0] !== undefined) {

                if (!['test', 'benchmark'].includes(simplify(args[0]))) {
                    throw usageError(this);
                }

                const seconds = args[1] === undefined ? 10 : parseNumber(args[1], 'liczba sekund');

                if (seconds < 3 || seconds > 60) {
                    throw new CommandError('Czas testu: od 3 do 60 sekund');
                }

                game.startBenchmark(seconds);

                return `Test wydajności: ${seconds} s - kamera obróci się raz dookoła, nie ruszaj myszą. ` +
                    'Wynik pojawi się na czacie.';

            }


            const summary = game.perf?.summary(2);

            const info = game.renderer.info;

            const far = game.farTerrain.stats();


            let meshed = 0;

            for (const chunk of world.chunks.values()) {

                if (chunk.mesh) {
                    meshed++;
                }

            }


            // Bloki, światło i pionowe źródła światła nieba chunków —
            // buforów TypedArray nie obejmuje zwykła "pamięć JS".

            let chunkBytes = 0;

            for (const chunk of world.chunks.values()) {
                chunkBytes += chunk.blocks.byteLength + chunk.blocks.length * 4 + (chunk.skySources?.byteLength ?? 0);
            }

            const savedMemory = world.savedChunks.stats?.();
            if (savedMemory) {
                // Counting memory must never decode every saved chunk.
                chunkBytes += savedMemory.encodedBytes + savedMemory.summaryBytes + savedMemory.decodedBytes;
            } else {
                for (const blocks of world.savedChunks.values()) chunkBytes += blocks.byteLength;
            }

            const memory =
                ` | chunki w pamięci: ~${Math.round(chunkBytes / 1048576)} MB` +
                (performance.memory
                    ? `, pamięć JS: ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB`
                    : '');

            const canvas = game.renderer.domElement;


            return (summary
                ? `${summary.fps.toFixed(0)} FPS (ostatnie 2 s) | klatka średnio ${summary.frameMs.toFixed(1)} ms, ` +
                  `najdłuższa ${summary.worstMs.toFixed(1)} ms | najwolniejsze 1%: ${summary.low1.toFixed(0)} FPS\n` +
                  `Na klatkę: gra ${summary.updateMs.toFixed(2)} ms, rysowanie ${summary.renderMs.toFixed(2)} ms\n`
                : 'Brak pomiaru klatek.\n') +
                `Rysowanie: ${info.render.calls} wywołań, ${Math.round(info.render.triangles / 1000)} tys. trójkątów | ` +
                `na karcie: ${info.memory.geometries} geometrii, ${info.memory.textures} tekstur\n` +
                `Chunki: ${world.chunks.size} wczytanych, ${meshed} z meshem, ${world.loadQueue.length} w kolejce, ` +
                `${world.dirtyChunks.size} do przebudowy | ` +
                `daleki teren: ${far.active ? `${far.shown} kafelków, ${Math.round(far.triangles / 1000)} tys. trójkątów` : 'wył.'}\n` +
                `Ekran: ${canvas.width} x ${canvas.height} px | zasięg ${game.viewDistance}, ` +
                `daleki teren ${game.settings.get('farTerrain') || 'wył.'}` +
                `${game.settings.get('potato') ? ', TRYB ZIEMNIAKA' : ''}${memory}\n` +
                'Test: /wydajnosc test';

        },

        complete(args) {
            return args.length === 1 ? ['test'] : [];
        }
    },


    // ========================================================
    // OSIĄGNIĘCIA (src/achievements/)
    // ========================================================

    {
        name: 'osiagniecia',
        aliases: ['achievements', 'osiagniecie'],
        usage: '/osiagniecia [ksiega | pokaz <ranga|id> | daj <id> | zabierz <id|wszystkie>]   (rangi: zwykle, rzadkie, bardzo-rzadkie, legendarne)',
        description: 'Osiągnięcia: lista, księga (L), test powiadomienia, przyznanie i zabranie (do testów).',

        run(args, { game }) {

            const book = game.achievements;

            if (!book) {
                throw new CommandError('Księga osiągnięć jest niedostępna.');
            }

            const action = simplify(args[0] ?? 'lista');

            const target = args[1] === undefined ? '' : simplify(args[1]);


            if (action === 'lista') {

                const summary = book.summary();

                const lines = TIER_ORDER.map((tier) => {

                    const names = ACHIEVEMENTS
                        .filter((achievement) => achievement.tier === tier)
                        .map((achievement) => {

                            const got = book.has(achievement.id);

                            const name = !got && achievement.secret ? '???' : achievement.title;

                            return `${got ? '✔' : '·'} ${name}${got || achievement.secret ? '' : ` (${achievement.id})`}`;

                        });

                    return `${TIERS[tier].name}: ${names.join(', ')}`;

                });

                return `Osiągnięcia: ${summary.unlocked} z ${summary.total}, punkty ${summary.points} z ${summary.maxPoints}\n` +
                    lines.join('\n') + '\nKsięga: L albo /osiagniecia ksiega';

            }


            if (action === 'ksiega') {

                game.onOpenAchievements?.();

                return 'Księga osiągnięć otwarta.';

            }


            if (action === 'pokaz') {

                const tier = TIER_WORDS[target] ?? (TIERS[target] ? target : null);

                const achievement =
                    tier ? ACHIEVEMENTS.find((a) => a.tier === tier) : findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Podaj rangę (${Object.keys(TIER_WORDS).join(', ')}) albo id osiągnięcia.`);
                }

                book.notify(achievement);

                return `Pokaz powiadomienia: ${achievement.title} (bez zdobywania).`;

            }


            if (action === 'daj') {

                const achievement = findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Nie ma osiągnięcia "${args[1] ?? ''}". Lista: /osiagniecia`);
                }

                if (!book.unlock(achievement.id, { command: true })) {
                    return `Już masz: ${achievement.title}.`;
                }

                return '';

            }


            if (action === 'zabierz') {

                if (target === 'wszystkie') {

                    book.reset();

                    return 'Wszystkie osiągnięcia i postęp wyzerowane.';

                }

                const achievement = findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Nie ma osiągnięcia "${args[1] ?? ''}". Lista: /osiagniecia`);
                }

                return book.revoke(achievement.id)
                    ? `Zabrano: ${achievement.title}.`
                    : `Nie masz jeszcze: ${achievement.title}.`;

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) {
                return ['lista', 'ksiega', 'pokaz', 'daj', 'zabierz'];
            }

            const action = simplify(args[0]);

            if (args.length === 2 && action === 'pokaz') {
                return [...Object.keys(TIER_WORDS), ...ACHIEVEMENTS.map((achievement) => achievement.id)];
            }

            if (args.length === 2 && (action === 'daj' || action === 'zabierz')) {
                return [...ACHIEVEMENTS.map((achievement) => achievement.id), ...(action === 'zabierz' ? ['wszystkie'] : [])];
            }

            return [];

        }
    },


    // ========================================================
    // SEKRET (ukryta - nie ma jej na liście /pomoc)
    // ========================================================

    {
        name: 'kosmos',
        aliases: ['space'],
        hidden: true,
        usage: '/kosmos [lec|spadaj|status] [wysokość]',
        description: 'Sekret: przenosi w kosmos (czarne niebo, planety, kula Ziemi). ' +
            '"spadaj" - od razu w dół jak meteoryt (krater przy lądowaniu).',

        run(args, { game, player }) {

            const action = simplify(args[0] ?? 'lec');

            const space = game.spaceView;


            if (action === 'status') {

                const map = space.globe.map;

                return `Wysokość ${Math.round(player.pos.y)} | kosmos ${Math.round(space.space * 100)}%, ` +
                    `kula ${Math.round(space.curve * 100)}%, mapa kuli ${Math.round(map.progress * 100)}%\n` +
                    (player.skyfall
                        ? `Spadasz: ${Math.round(game.skyfall.speed)} bloków/s, ogień ${Math.round(game.skyfall.heat * 100)}%`
                        : player.flying ? 'Lecisz (Spacja - w górę, Shift - w dół, wysoko coraz szybciej).' : 'Nie spadasz.');

            }

            if (action !== 'lec' && action !== 'spadaj') {
                throw usageError(this);
            }


            const height = args[1] === undefined ? 6000 : parseNumber(args[1], 'wysokość');

            if (height < SKYFALL_START || height > SPACE_MAX_ALTITUDE) {
                throw new CommandError(`Wysokość: od ${SKYFALL_START} do ${SPACE_MAX_ALTITUDE}`);
            }


            player.pos.y = height;

            player.vel.set(0, 0, 0);

            player.flying = action === 'lec';

            player.skyfall = false;

            player.updateCamera();


            if (action === 'spadaj') {

                const seconds = fallSeconds(height);

                return `Spadasz z wysokości ${Math.round(height)} - jak meteoryt! ` +
                    `Ziemia za ~${Math.round(seconds)} s.`;

            }

            return `Jesteś na wysokości ${Math.round(height)}` +
                `${height < SPACE_FULL ? ' (kosmos zaczyna się wyżej - Spacja w górę)' : ''}. ` +
                'Wyłącz latanie (dwa razy Spacja albo /latanie), żeby wrócić jak meteoryt.';

        },

        complete(args) {
            return args.length === 1 ? ['lec', 'spadaj', 'status'] : [];
        }
    }

];


// Rangi osiągnięć po polsku (/osiagniecia pokaz).

const TIER_WORDS = {
    zwykle: 'common',
    rzadkie: 'rare',
    'bardzo-rzadkie': 'epic',
    legendarne: 'legendary'
};


// Ile mniej więcej trwa spadanie z kosmosu z wysokości height
// (krok co 1/20 s, jak Player.updateSkyfall - do poziomu morza).

function fallSeconds(height) {

    let y = height;
    let speed = 0;
    let time = 0;

    const dt = 0.05;

    while (y > 70 && time < 600) {

        const terminal = skyfallSpeed(y);

        speed = Math.min(speed + (30 + terminal * 0.5) * dt, terminal);

        y -= speed * dt;

        time += dt;

    }

    return time;

}

// ------------------------------------------------------------
// /demo swiatlo - zamknięty pokój z kolorowymi lampami przed
// graczem. Gracz trafia do środka.
// ------------------------------------------------------------

// Odkrywka: przed graczem (w stronę, w którą patrzy) długi wykop aż
// do y = 1. Patrząc wzdłuż niego widać na ścianach warstwy skał
// (granit, piaskowiec, wapień...) i czasem żyłę lepidolitu.

function buildRockDemo({ player, world }) {

    const p = player.pos;

    // Kierunek do przodu, wyrównany do osi X albo Z (proste ściany).

    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);

    const alongX = Math.abs(forwardX) >= Math.abs(forwardZ);

    const ax = alongX ? Math.sign(forwardX) : 0;
    const az = alongX ? 0 : Math.sign(forwardZ);

    const sx = az !== 0 ? 1 : 0;    // w poprzek
    const sz = ax !== 0 ? 1 : 0;

    const startX = Math.floor(p.x);
    const startZ = Math.floor(p.z);


    // Najwyższy teren w miejscu wykopu - tyle trzeba usunąć.

    const HALF = 4;

    let top = 1;

    for (let a = 3; a < 31; a++) {

        for (let s = -HALF; s <= HALF; s++) {

            const x = startX + ax * a + sx * s;
            const z = startZ + az * a + sz * s;

            world.ensureColumnLoaded(x, z);

            top = Math.max(top, world.getSurfaceY(x, z));

        }

    }


    // Długość tak, żeby zmieścić się w ~16 tys. bloków (w górach krótszy).

    const length = Math.max(8, Math.min(28, Math.floor(16384 / ((2 * HALF + 1) * top))));

    let changed = 0;

    for (let y = top; y >= 1; y--) {

        for (let a = 3; a < 3 + length; a++) {

            for (let s = -HALF; s <= HALF; s++) {

                if (world.clearBlock(startX + ax * a + sx * s, y, startZ + az * a + sz * s)) {
                    changed++;
                }

            }

        }

    }


    // Patrzymy wzdłuż wykopu, w dół.

    player.pitch = -0.6;
    player.updateCamera();

    return `Odkrywka przed tobą: ${2 * HALF + 1} x ${length} bloków, od y ${top} do 1 (${changed} bloków). ` +
        'Na ścianach widać warstwy skał. Uwaga: to zmienia świat (zapisze się).';

}


// /demo okno - ciemny pokój (kamień, podłoga z desek) z oknami od
// strony słońca i wąską szczeliną. Przez okna wpadają snopy światła,
// na podłodze leżą plamy słońca (cienie słońca i promienie - Shadows.js,
// LightShafts.js). Gdy słońce jest za wysoko, za nisko albo jest noc,
// zegar przestawia się na popołudnie. Gracz trafia do środka.

// Miejsce na budowlę oświetloną słońcem (dla /demo okno i /demo dom):
// pora dnia z niskim słońcem (gdy trzeba - zegar na popołudnie), osie
// (u - w stronę słońca, v - w poprzek), podłoga na najwyższym terenie
// pod budowlą (z kamiennym fundamentem), a przed nią pusto aż do 24
// bloków (drzewa i wzgórza nie zasłaniają słońca).
//   halfU, halfV - połowa budowli wzdłuż u i v (bloki)

function sunSite({ player, world, sky, time }, halfU, halfV) {

    let note = '';

    sky.refresh(time.days);

    const height = sky.celestial.sunHeight;

    if (height < 0.3 || height > 0.6) {

        // Popołudnie tego samego (albo następnego) dnia: słońce mniej
        // więcej 20-25 stopni nad horyzontem.

        let day = Math.floor(time.days);

        let best = null;

        for (let hour = 12; hour <= 20; hour += 0.125) {

            sky.refresh(day + hour / 24);

            const h = sky.celestial.sunHeight;

            if (h > 0.15 && (best === null || Math.abs(h - 0.42) < Math.abs(best.h - 0.42))) {
                best = { hour, h };
            }

        }

        if (best) {

            if (day + best.hour / 24 < time.days) {
                day++;
            }

            time.days = day + best.hour / 24 + 1e-7;

            note = ` Ustawiono godzinę ${time.formatClock()} - słońce nisko, długie snopy światła.`;

        }

        sky.refresh(time.days);

    }


    // Ściana z oknami - od strony słońca (wzdłuż osi X albo Z).

    const sun = sky.celestial.sunDirection;

    const alongX = Math.abs(sun.x) >= Math.abs(sun.z);

    const ux = alongX ? (Math.sign(sun.x) || 1) : 0;     // "u" - w stronę słońca
    const uz = alongX ? 0 : (Math.sign(sun.z) || 1);

    const vx = uz;                                        // "v" - w poprzek
    const vz = ux;


    // Budowla przed graczem (w stronę, w którą patrzy).

    const p = player.pos;

    const reach = Math.max(halfU, halfV) + 5;

    const centerX = Math.floor(p.x - Math.sin(player.yaw) * reach);
    const centerZ = Math.floor(p.z - Math.cos(player.yaw) * reach);

    const at = (u, v) => [centerX + ux * u + vx * v, centerZ + uz * u + vz * v];

    let floor = 1;

    for (let u = -halfU; u <= halfU; u++) {

        for (let v = -halfV; v <= halfV; v++) {

            const [x, z] = at(u, v);

            world.ensureColumnLoaded(x, z);

            floor = Math.max(floor, world.getSurfaceY(x, z));

        }

    }

    floor = Math.min(CHUNK_HEIGHT - 24, floor);

    const put = (u, y, v, type) => {

        const [x, z] = at(u, v);

        if (type === null) world.clearBlock(x, floor + y, z);
        else world.setBlock(x, floor + y, z, type);

    };


    // Przed oknami pusto.

    for (let u = halfU + 1; u <= halfU + 24; u++) {

        for (let v = -halfV - 3; v <= halfV + 3; v++) {

            const [x, z] = at(u, v);

            world.ensureColumnLoaded(x, z);

            for (let y = 1; y <= 20; y++) {
                put(u, y, v, null);
            }

        }

    }


    // Fundament.

    for (let u = -halfU; u <= halfU; u++) {

        for (let v = -halfV; v <= halfV; v++) {

            const [x, z] = at(u, v);

            for (let y = floor - 1; y > 0 && !world.isSolid(x, y, z); y--) {
                world.setBlock(x, y, z, 'stone');
            }

        }

    }


    // Gracz w punkcie (u, v) budowli, patrzy na (lookU, lookV).

    const place = (u, v, lookU, lookV, pitch = -0.18) => {

        p.set(
            centerX + ux * u + vx * v + 0.5,
            floor + 1,
            centerZ + uz * u + vz * v + 0.5
        );

        const lookX = ux * (lookU - u) + vx * (lookV - v);
        const lookZ = uz * (lookU - u) + vz * (lookV - v);

        player.yaw = Math.atan2(-lookX, -lookZ);
        player.pitch = pitch;

        player.vel.set(0, 0, 0);

        player.updateCamera();

    };

    return { put, place, floor, note };

}


// /demo okno - ciemny pokój (kamień, podłoga z desek) z oknami od
// strony słońca i wąską szczeliną. Przez okna wpadają snopy światła,
// na podłodze leżą plamy słońca (cienie słońca i promienie - Shadows.js,
// LightShafts.js). Gracz trafia do środka.

function buildWindowDemo(ctx) {

    const SIZE = 5;

    const { put, place, note } = sunSite(ctx, SIZE, SIZE);


    // Ściany, podłoga i dach. Wnętrze: 9 x 5 x 9 bloków.

    for (let u = -SIZE; u <= SIZE; u++) {

        for (let v = -SIZE; v <= SIZE; v++) {

            for (let y = 0; y <= 6; y++) {

                const wall = Math.abs(u) === SIZE || Math.abs(v) === SIZE || y === 6;

                put(u, y, v, y === 0 ? 'oak_planks' : wall ? 'stone' : null);

            }

        }

    }


    // Okna od strony słońca i wąska szczelina (jak drzwi) między nimi.

    for (const v of [-3, -2, 2, 3]) {

        put(SIZE, 2, v, null);
        put(SIZE, 3, v, null);

    }

    for (let y = 1; y <= 4; y++) {
        put(SIZE, y, 0, null);
    }

    // Gracz w głębi pokoju, patrzy w stronę okien (trochę z boku,
    // żeby snopy było widać).

    place(-SIZE + 1.5, 3.5, SIZE - 1, -1.5);

    return 'Zbudowano ciemny pokój z oknami od strony słońca - jesteś w środku.' + note + shadowsNote(ctx.game);

}


// /demo dom - cztery pokoje obok siebie, każdy z innego budulca
// (biały tynk, terakota, polerowany kamień, ciemne deski), każdy
// z oknem od strony słońca, połączone przejściami. Widać, jak budulec
// zmienia światło odbite (BounceLight.js): biały pokój jest jasny,
// z ciemnych desek - mroczny, z terakoty - ciepły.

const HOUSE_ROOMS = [
    ['lime_plaster', 'tynk wapienny'],
    ['terracotta', 'terakota'],
    ['polished_stone', 'polerowany kamień'],
    ['dark_planks', 'ciemne deski']
];

function buildHouseDemo(ctx) {

    const HALF_U = 4;           // pokój 7 x 7 wewnątrz (ściany co 8 bloków)
    const ROOM = 8;

    const halfV = (HOUSE_ROOMS.length * ROOM) / 2;

    const { put, place, note } = sunSite(ctx, HALF_U, halfV);

    HOUSE_ROOMS.forEach(([material], room) => {

        const v0 = -halfV + room * ROOM;

        for (let u = -HALF_U; u <= HALF_U; u++) {

            for (let v = v0; v <= v0 + ROOM; v++) {

                for (let y = 0; y <= 5; y++) {

                    const wall = Math.abs(u) === HALF_U || v === v0 || v === v0 + ROOM || y === 0 || y === 5;

                    // Ściany między pokojami stawia pokój po lewej (ten
                    // po prawej ich nie nadpisuje).

                    if (v === v0 && room > 0) {
                        continue;
                    }

                    put(u, y, v, wall ? material : null);

                }

            }

        }


        // Okno 2 x 2 od strony słońca.

        for (const v of [v0 + 3, v0 + 4]) {

            put(HALF_U, 2, v, null);
            put(HALF_U, 3, v, null);

        }


        // Przejście do następnego pokoju (2 bloki wysokości).

        if (room < HOUSE_ROOMS.length - 1) {

            put(-1, 1, v0 + ROOM, null);
            put(-1, 2, v0 + ROOM, null);

        }

    });


    // Gracz w pierwszym (białym) pokoju, w głębi, patrzy na okno.

    place(-HALF_U + 1.5, -halfV + 6.5, HALF_U - 1, -halfV + 3.5);

    return `Zbudowano dom z czterech pokoi: ${HOUSE_ROOMS.map(([, name]) => name).join(', ')} - każdy z oknem od strony słońca, ` +
        'przejścia między nimi są w ścianach. Jesteś w białym pokoju - porównaj, jak jasne są pozostałe.' + note +
        shadowsNote(ctx.game);

}


function shadowsNote(game) {

    if (game.settings.get('shadows') === 0 || game.settings.get('potato')) {
        return ' Cienie słońca są wyłączone (/cienie dalekie). Odbicia otoczenia mają osobne ustawienie.';
    }

    const natural = game.settings.get('lightingLook') === 'natural';
    if (!game.settings.get(natural ? 'surfaceBounce' : 'bounceLight')) {
        return ' Odbicia otoczenia są wyłączone — włącz: /swiatlo odbite wl.';
    }

    return '';

}


function buildLightDemo({ player, world }) {

    const p = player.pos;

    // Pokój 15 x 7 x 11 (z ścianami), kilka bloków przed graczem
    // (w stronę, w którą patrzy).

    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);

    const centerX = Math.floor(p.x + forwardX * 10);
    const centerZ = Math.floor(p.z + forwardZ * 10);

    const floor = Math.max(1, Math.min(CHUNK_HEIGHT - 8, Math.floor(p.y)));


    for (let x = -7; x <= 7; x++) {

        for (let y = 0; y <= 6; y++) {

            for (let z = -5; z <= 5; z++) {

                const wall = Math.abs(x) === 7 || Math.abs(z) === 5 || y === 0 || y === 6;

                if (wall) world.setBlock(centerX + x, floor + y, centerZ + z, 'stone');
                else world.clearBlock(centerX + x, floor + y, centerZ + z);

            }

        }

    }


    // Lampy: czerwona i niebieska naprzeciw siebie (fiolet pośrodku),
    // zielona i fioletowa na drugiej osi, zwykła w rogu, filar na
    // środku rzuca kolorowe cienie.

    const put = (x, y, z, type) => world.setBlock(centerX + x, floor + y, centerZ + z, type);

    put(-7, 3, 0, 'lamp_red');
    put(7, 3, 0, 'lamp_blue');
    put(0, 3, -5, 'lamp_green');
    put(0, 3, 5, 'lamp_purple');
    put(-6, 1, -4, 'lamp');

    for (let y = 1; y <= 5; y++) {
        put(0, y, 0, 'lepidolite');
    }


    p.set(centerX + 0.5 + 4, floor + 1, centerZ + 0.5 + 3);

    player.vel.set(0, 0, 0);

    player.updateCamera();

    return 'Zbudowano pokój z lampami: czerwona i niebieska (pośrodku fiolet), ' +
        'zielona, fioletowa i zwykła. Jesteś w środku.';

}


// Pora dnia ze scen (SCENE_TIMES) - tego samego dnia.

export function setSceneTime(time, name) {

    time.days = Math.floor(time.days) + SCENE_TIMES[name] + 1e-7;

}
