import * as THREE from 'three';

import {
    CommandError,
    simplify
} from './CommandRegistry.js';

import {
    BLOCK_TYPES,
    blockExists,
    getBlockDefinition
} from '../blocks/BlockRegistry.js';

import {
    describeLight
} from '../world/Light.js';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER
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


function blockArgument(text) {

    const name = simplify(text ?? '');

    if (['powietrze', 'air', 'nic'].includes(name)) {
        return null;
    }

    if (!blockExists(name)) {
        throw new CommandError(`Nie ma bloku "${text ?? ''}". Lista: /bloki`);
    }

    return name;

}


const BLOCK_NAMES = Object.keys(BLOCK_TYPES);

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

        run(args, { sky }) {

            const [action, value] = args;


            if (!action) {

                const state = sky.state;
                const height = Math.asin(Math.max(-1, Math.min(1, sky.celestial.sunHeight))) * 180 / Math.PI;

                return `Słońce: ${height.toFixed(0)}° nad horyzontem | ` +
                    `łuna zachodu: ${Math.round(state.sunset * 100)}% | ` +
                    `kolor łuny: ${colorName(sky.variant.sunsetColor)} | ` +
                    `gwiazdy: ${Math.round(state.starVisibility * 100)}%`;

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
    // BLOKI I ŚWIAT
    // ========================================================

    {
        name: 'daj',
        aliases: ['give'],
        usage: '/daj <blok>',
        description: 'Wkłada blok do wybranego miejsca na pasku.',

        run(args, { game }) {

            const type = blockArgument(args[0]);

            if (!type) {
                throw new CommandError('Podaj blok, np. /daj lamp_red');
            }

            game.hotbar.slots[game.hotbar.selected] = type;

            return `Na pasku: ${getBlockDefinition(type).name}.`;

        },

        complete(args) {
            return args.length === 1 ? BLOCK_NAMES : [];
        }
    },


    {
        name: 'bloki',
        aliases: ['blocks'],
        usage: '/bloki',
        description: 'Lista wszystkich bloków.',

        run() {

            return 'Bloki: ' + BLOCK_NAMES
                .map((type) => {
                    const definition = BLOCK_TYPES[type];
                    return definition.light ? `${type} (świeci ${definition.light})` : type;
                })
                .join(', ');

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
        usage: '/swiatlo',
        description: 'Światło przy głowie gracza i przy wskazanym bloku.',

        run(args, { game, world }) {

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
        usage: '/demo swiatlo',
        description: 'Buduje scenę do sprawdzenia nowości (np. pokój z kolorowymi lampami).',

        run(args, ctx) {

            if (simplify(args[0] ?? '') !== 'swiatlo') {
                throw usageError(this);
            }

            return buildLightDemo(ctx);

        },

        complete(args) {
            return args.length === 1 ? ['swiatlo'] : [];
        }
    }

];

// ------------------------------------------------------------
// /demo swiatlo - zamknięty pokój z kolorowymi lampami przed
// graczem. Gracz trafia do środka.
// ------------------------------------------------------------

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
