// ------------------------------------------------------------
// KOMENDY GRY - DALEKI TEREN, USTAWIENIA, WYDAJNOŚĆ
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { simplify, CommandError } from './CommandRegistry.js';
import {
    SETTINGS_RANGES,
    SETTINGS_DEFAULTS,
    graphicsPreset,
    GRAPHICS_PRESETS,
    SETTINGS_CHOICES
} from '../settings/Settings.js';
import { TEXTS } from '../ui/texts.js';
import { compareVersions, megabytes } from '../app/AndroidUpdates.js';
import {
    describeTextures,
    chooseTexturePack,
    resolutionChoices,
    resolutionName,
    setTextureResolution,
    resetTexturePack,
    openTemplate
} from '../app/textures.js';
import { getPackInfo } from '../rendering/TexturePacks.js';
import { LOD_LEGEND } from '../world/FarTerrain.js';
import { POTATO_RENDER_SCALE, POTATO_VIEW_DISTANCE, POTATO_STAR_SHARE, UI_THEMES } from '../config.js';
import { usageError, parseNumber, ON_WORDS, OFF_WORDS, SHADOW_WORDS } from './commandHelpers.js';

// /aktualizacja.
const UPDATE_WORDS = ['sprawdz', 'pobierz', 'instaluj', 'wroc'];

// /tekstury.
const TEXTURE_WORDS = ['wczytaj', 'rozdzielczosc', 'oryginalne', 'szablon', 'lista'];


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

export const SETTINGS_COMMANDS = [

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
    }

];
