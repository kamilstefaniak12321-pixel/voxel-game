// ------------------------------------------------------------
// KOMENDY GRY - GRACZ, ENERGIA, MODEL I ANIMACJE
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { CONDITION_MIN, CONDITION_MAX, LIMP_MAX, STATES, REST_STATES } from '../game/Wellbeing.js';
import { EFFECTS } from '../items/effects.js';
import { simplify, CommandError } from './CommandRegistry.js';
import {
    isLiquidId,
    getBlockId,
    getBlockDefinition,
    getBreakTime,
    getBlockSound,
    getBlockLabel,
    getBestTool
} from '../blocks/BlockRegistry.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { STACK_SIZE } from '../game/Inventory.js';
import {
    RECIPE_LIST,
    recipeText,
    stockOf,
    maxCrafts,
    recipesFor,
    recipesUsing,
    getRecipe,
    craftFromInventory
} from '../crafting/Crafting.js';
import { CATEGORIES, getCategory } from '../items/categories.js';
import { TEXTS } from '../ui/texts.js';
import { hasCustomSkin, chooseSkinFile, resetSkin } from '../player/skin.js';
import { WORLD_BORDER, CHUNK_SIZE, CREATIVE_REPEAT_SECONDS } from '../config.js';
import {
    usageError,
    parseNumber,
    parseCoordinate,
    blockArgument,
    BLOCK_NAMES,
    seconds,
    itemArgument,
    ON_WORDS,
    OFF_WORDS
} from './commandHelpers.js';

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

export const PLAYER_COMMANDS = [

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
        usage: '/energia | /energia <0 - 130> | /energia kondycja <60 - 130> | /energia sen <0 - 100> | /energia noga <sekundy> | /energia efekt <nazwa | brak> | /energia utoniecie',
        description: 'Energia i kondycja gracza (tryb przygody): podgląd w liczbach albo ustawienie - do testów.',

        run(args, { game }) {

            const wellbeing = game.wellbeing, data = wellbeing.data;

            if (args[0] === 'noga') {

                // Stłuczona noga na tyle sekund (0 - zdrowa) - do testów.

                const value = parseNumber(args[1], 'sekundy');

                if (value < 0 || value > LIMP_MAX) {
                    throw new CommandError(`Noga: od 0 do ${LIMP_MAX} sekund`);
                }

                data.limp = value;

                return value > 0 ? `Noga stłuczona na ${value} s - utykasz.` : 'Noga zdrowa.';

            }

            if (args[0] === 'utoniecie') {

                // Utrata przytomności i pobudka na brzegu - do testów.

                if (!wellbeing.active) {
                    throw new CommandError('W tym trybie gry nie da się utonąć.');
                }

                game.blackout.start();

                return 'Tracisz przytomność...';

            }

            if (args[0] === 'efekt') {

                // Efekt naparu bez picia (items/effects.js) - do testów.

                if (!wellbeing.active) {
                    throw new CommandError('W tym trybie gry efekty nie działają.');
                }

                const name = simplify(args[1] ?? '');

                if (['brak', 'zadne', 'none'].includes(name)) {
                    data.effects = {};
                    return 'Efekty wyłączone.';
                }

                const effect = Object.keys(EFFECTS).find((type) => type === name || simplify(EFFECTS[type].label) === name);

                if (!effect) {
                    throw new CommandError(`Efekty: ${Object.entries(EFFECTS).map(([type, entry]) => `${type} (${entry.label})`).join(', ')} albo brak`);
                }

                wellbeing.addEffect(effect, game.time.days);

                return `Działa: ${EFFECTS[effect].label} (${EFFECTS[effect].hours} godz. gry). ${EFFECTS[effect].text}.`;

            }

            if (args[0] === 'sen') {

                // Wyspanie (0 - niewyspany, 100 - wypoczęty) - do testów.

                const value = parseNumber(args[1], 'wyspanie');

                if (value < 0 || value > 100) {
                    throw new CommandError('Wyspanie: od 0 do 100');
                }

                data.rest = value;

            }
            else if (args[0] === 'kondycja') {

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
                `${STATES[wellbeing.state].label.toLowerCase()}, posiłki dzisiaj: ${data.mealsToday}, ` +
                `wyspanie: ${data.rest.toFixed(1)} (${REST_STATES[wellbeing.restState].label})` +
                (wellbeing.activeEffects().length ? `, działa: ${wellbeing.activeEffects().map((type) => EFFECTS[type].label).join(', ')}` : '');

            return wellbeing.active ? text : `${text}. W tym trybie gry energia jest wyłączona.`;

        },

        complete(args) {
            return args.length <= 1 ? ['kondycja', 'sen', 'noga', 'efekt', 'utoniecie']
                : args.length === 2 && args[0] === 'efekt' ? [...Object.keys(EFFECTS), 'brak'] : [];
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
    }

];
