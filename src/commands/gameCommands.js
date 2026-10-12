import * as THREE from 'three';

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
    getBlockLabel
} from '../blocks/BlockRegistry.js';

import {
    ITEM_TYPES,
    itemExists,
    getItemLabel
} from '../items/ItemRegistry.js';

import { STACK_SIZE } from '../game/Inventory.js';

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
    SETTINGS_CHOICES
} from '../settings/Settings.js';

import { TEXTS } from '../ui/texts.js';

import { LANDFORMS, RELIEFS } from '../world/terrain/landforms.js';

import { terrainName } from '../world/terrain/generators.js';

import { MAP_LAYERS, MAP_SCALES } from '../ui/TerrainMap.js';

import { ROCK_INFO, blockNamePl, blockFromWord } from '../world/terrain/rocks.js';

import { chooseSkinFile, resetSkin, hasCustomSkin } from '../player/skin.js';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER,
    DAY_LENGTH_MINUTES,
    BUSH_GROWTH_SECONDS,
    UI_THEMES,
    POTATO_RENDER_SCALE,
    POTATO_VIEW_DISTANCE,
    POTATO_STAR_SHARE
} from '../config.js';

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


// Przedmioty (owoce) po polsku: maliny / malina, jezyny / jezyna,
// porzeczki / porzeczka, orzech_laskowy / orzech / orzechy.

const ITEM_WORDS = new Map([
    ...Object.keys(ITEM_TYPES).map((type) => [simplify(getItemLabel(type)).replace(/\s+/g, '_'), type]),
    ['malina', 'raspberry'],
    ['jezyna', 'blackberry'],
    ['porzeczka', 'currants'],
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


// Ogródek przed graczem: rzędy = gatunki, kolumny = etapy (od
// sadzonki do pełnego owoców), co 2 bloki, na trawie.

function plantBushGarden(player, world) {

    const species = Object.keys(FRUIT_BUSHES);

    // Kierunek patrzenia zaokrąglony do osi X albo Z.

    const lookX = -Math.sin(player.yaw);
    const lookZ = -Math.cos(player.yaw);

    const [forwardX, forwardZ] = Math.abs(lookX) > Math.abs(lookZ) ? [Math.sign(lookX), 0] : [0, Math.sign(lookZ)];

    // "W prawo" od kierunku patrzenia.

    const rightX = -forwardZ;
    const rightZ = forwardX;

    const startX = Math.floor(player.pos.x) + forwardX * 3 - rightX * 3;
    const startZ = Math.floor(player.pos.z) + forwardZ * 3 - rightZ * 3;

    const y = Math.floor(player.pos.y);


    species.forEach((name, row) => {

        bushStages(name).forEach((type, stage) => {

            const x = startX + rightX * stage * 2 + forwardX * row * 2;
            const z = startZ + rightZ * stage * 2 + forwardZ * row * 2;

            world.setBlock(x, y - 1, z, 'grass');
            world.setBlock(x, y, z, type);
            world.setBlock(x, y + 1, z, null);

        });

    });

    return `Ogródek: ${species.length} rzędy krzaków (${species.map((name) => getBlockLabel(bushStages(name)[1]).toLowerCase()).join(', ')}), ` +
        'w każdym od lewej: sadzonka, bez owoców, kilka owoców, pełen owoców. PPM na owocach - zbiór.';

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
    wawoz: { landform: 'ravine' },
    zleb: { landform: 'gully' },
    depresja: { landform: 'depression' },
    rownina: { landform: 'plain' },
    rownia: { landform: 'flat' },
    plaskowyz: { landform: 'plateau' }
};

const SURFACE_NAMES = {
    grass: 'trawa',
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
        (info.rock ? ` | skała pod spodem: ${blockNamePl(info.rock)} (/skaly)` : '') +
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
    latanie: 'fly'
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
    glass: 'szkło (lampy)'
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
    ...Object.fromEntries(BLOCK_MATERIALS.map((name) => [name, name]))
};


// Ustawienia do wpisania w /ustaw (polska nazwa -> klucz w Settings).

const SETTING_WORDS = {
    ziemniak: 'potato',
    zasieg: 'viewDistance',
    'daleki-teren': 'farTerrain',
    pole: 'fov',
    jasnosc: 'brightness',
    rozdzielczosc: 'renderScale',
    fps: 'fpsLimit',
    cienie: 'ambientOcclusion',
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
    'glosnosc-menu': 'volumeUi',
    'warstwa-skorki': 'skinOverlay',
    zgiecia: 'jointStyle',
    kamera: 'cameraDistance'
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


    if (key === 'jointStyle') {

        if (['gladkie', 'smooth'].includes(word)) return 'smooth';
        if (['klocki', 'bloki', 'blocks'].includes(word)) return 'blocks';

        throw new CommandError('Wpisz gladkie albo klocki');

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
                commands.commands
                    .map((command) => `/${command.name} - ${command.description}`)
                    .join('\n');

        },

        complete(args, { commands }) {
            return args.length === 1 ? commands.commands.map((command) => command.name) : [];
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
                    `głośność ${settings.get('volumeMaster')}%, bloki ${settings.get('volumeBlocks')}%, zjawiska ${settings.get('volumeWorld')}%, menu ${settings.get('volumeUi')}% ` +
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
        usage: '/tryb [przygoda | kreatywny]',
        description: 'Tryb gry: przygoda (zbierasz i zużywasz bloki) albo kreatywny (bloki bez końca, latanie - 2 x Spacja).',

        run(args, { game }) {

            const word = simplify(args[0] ?? '');

            if (!word) {
                return `Tryb gry: ${TEXTS.gameModes[game.mode]}. Zmiana: /tryb przygoda albo /tryb kreatywny.`;
            }

            const mode =
                ['przygoda', 'adventure', 'survival', 'p', '0'].includes(word) ? 'adventure' :
                ['kreatywny', 'creative', 'k', '1'].includes(word) ? 'creative' :
                null;

            if (!mode) {
                throw usageError(this);
            }

            game.setMode(mode);

            return mode === 'creative'
                ? 'Tryb kreatywny: bloki się nie zużywają, E - wszystkie bloki, dwa razy Spacja - latanie.'
                : 'Tryb przygody: zniszczone bloki trafiają do ekwipunku, stawianie je zużywa.';

        },

        complete(args) {
            return args.length === 1 ? ['przygoda', 'kreatywny'] : [];
        }
    },


    {
        name: 'ekwipunek',
        aliases: ['inventory', 'eq'],
        usage: '/ekwipunek | /ekwipunek wyczysc',
        description: 'Co jest w ekwipunku (E - okno ekwipunku); wyczyszczenie ekwipunku.',

        run(args, { game }) {

            const inventory = game.inventory;

            const word = simplify(args[0] ?? '');


            if (['wyczysc', 'clear'].includes(word)) {

                inventory.clear();

                return 'Ekwipunek wyczyszczony.';

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
            return args.length === 1 ? ['wyczysc'] : [];
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
        usage: '/animacja <stanie | chodzenie | bieg | kucanie | skradanie | skok | machanie | latanie> | /animacja wyl',
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
        description: 'Blok albo przedmiot (np. maliny) do ekwipunku. Bez ilości w trybie kreatywnym - do wybranego miejsca na pasku, w przygodzie - stos 64.',

        run(args, { game }) {

            const type = itemArgument(args[0]);

            if (!type) {
                throw new CommandError('Podaj blok albo przedmiot, np. /daj lamp_red albo /daj maliny');
            }

            const inventory = game.inventory;


            if (args[1] === undefined && game.mode === 'creative') {

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

                        if (world.setBlock(x, y, z, type)) {
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
        usage: '/swiatlo | /swiatlo dynamiczne <wl | wyl>',
        description: 'Światło przy głowie i wskazanym bloku; włączanie dynamicznego światła.',

        run(args, { game, world }) {

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


            const hit = game.currentHit;

            if (hit && hit.hit) {

                const x = hit.block.x + hit.normal.x;
                const y = hit.block.y + hit.normal.y;
                const z = hit.block.z + hit.normal.z;

                text += ` | przy wskazanej ścianie: ${describeLight(world.getLight(x, y, z))}`;

            }

            return text;

        }
    },


    {
        name: 'demo',
        aliases: [],
        usage: '/demo swiatlo | /demo kula [kolor | usun] | /demo skaly',
        description: 'Sceny do sprawdzania nowości: pokój z kolorowymi lampami, krążąca kula dynamicznego światła, ' +
            'odkrywka (wykop do dna świata - widać warstwy skał).',

        run(args, ctx) {

            const what = simplify(args[0] ?? '');


            if (what === 'swiatlo') {
                return buildLightDemo(ctx);
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

            if (args.length === 1) return ['swiatlo', 'kula', 'skaly'];
            if (args.length === 2 && simplify(args[0]) === 'kula') return [...Object.keys(COLOR_NAMES), 'usun'];

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

                const buffer = new Uint8Array(CHUNK_HEIGHT);

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

                const buffer = new Uint8Array(CHUNK_HEIGHT);

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
        usage: '/horyzont | /horyzont <bloki | wyl> | /horyzont lod | /horyzont odswiez',
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
                    `kafelków: ${stats.shown} widocznych` +
                    `${stats.missing ? `, ${stats.missing} w budowie` : ''}, ${stats.cached} w pamięci | ` +
                    `${Math.round(stats.triangles / 1000)} tys. trójkątów | ` +
                    `kolorowanie dokładności: ${far.debugLod ? 'wł.' : 'wył.'} (/horyzont lod)`;

            }


            const word = simplify(action);


            if (word === 'lod') {

                far.setDebugLod(!far.debugLod);

                return far.debugLod
                    ? 'Kafelki pokolorowane według dokładności: czerwone - kratka 4 bloki, niebieskie - 8, żółte - 16, zielone - 32, fioletowe - 64.'
                    : 'Kolorowanie dokładności wyłączone.';

            }


            if (['odswiez', 'refresh'].includes(word)) {

                far.rebuildAll();

                return 'Daleki teren buduje się od nowa.';

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
            return args.length === 1 ? ['512', '1024', '2048', '4096', 'wyl', 'lod', 'odswiez'] : [];
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
                return [...Object.keys(SETTING_WORDS), 'domyslne'];
            }

            const key = SETTING_WORDS[simplify(args[0])];

            if (args.length === 2 && key) {

                if (typeof SETTINGS_DEFAULTS[key] === 'boolean') return ['wl', 'wyl'];
                if (key === 'jointStyle') return ['gladkie', 'klocki'];
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


            // Bloki i światło chunków (5 bajtów na komórkę) - tego nie ma
            // w "pamięci JS" przeglądarki.

            let chunkBytes = 0;

            for (const chunk of world.chunks.values()) {
                chunkBytes += chunk.blocks.length * 5;
            }

            for (const blocks of world.savedChunks.values()) {
                chunkBytes += blocks.length;
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
    }

];

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

                if (world.setBlock(startX + ax * a + sx * s, y, startZ + az * a + sz * s, null)) {
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

                world.setBlock(centerX + x, floor + y, centerZ + z, wall ? 'stone' : null);

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
