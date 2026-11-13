// ------------------------------------------------------------
// KOMENDY GRY - CZAS, NIEBO, KSIĘŻYC
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import * as THREE from 'three';
import { simplify, CommandError } from './CommandRegistry.js';
import { FLIGHT_SECONDS } from '../game/Meteorites.js';
import { SOUNDS, BLOCK_MATERIALS } from '../audio/sounds.js';
import {
    findEclipses,
    nextNewMoonCycle,
    newMoonDays,
    MOON_RADIUS,
    SUN_RADIUS,
    sunCoverage
} from '../sky/Celestial.js';
import { DAY_LENGTH_MINUTES } from '../config.js';
import {
    usageError,
    parseNumber,
    COLOR_NAMES,
    parseColor,
    decimal,
    durationText
} from './commandHelpers.js';

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


// Ile prawdziwych sekund trwa `hours` godzin gry (przy obecnej
// prędkości czasu; Infinity, gdy czas stoi).

function realSeconds(hours, time) {

    return time.speed > 0
        ? hours / 24 * DAY_LENGTH_MINUTES * 60 / time.speed
        : Infinity;

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

export const SKY_COMMANDS = [

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
    }

];
