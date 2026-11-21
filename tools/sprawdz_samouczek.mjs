// ------------------------------------------------------------
// SPRAWDZENIE SAMOUCZKA I PORADNIKA (0.99.0)
//
// - kroki samouczka: nazwy bez powtórzeń, krótkie teksty, wersje na
//   telefon, liczby w tekstach zgodne z grą (czasy, przepisy),
// - przebieg: pytanie tylko w nowym świecie w trybie przygody, start,
//   zaliczanie kroków zdarzeniami i ekwipunkiem, "Zrobione!" przed
//   następnym krokiem, kroki zrobione wcześniej, czekanie na wieczór,
// - pomijanie: krok, cały samouczek, "nie pytaj więcej" (ustawienie),
//   powtórka od pierwszego kroku,
// - zapis ze światem (worldInfo.tutorial) i uszkodzone dane,
// - koniec: wiadomość i zdarzenie do osiągnięcia,
// - poradnik: rozdziały, liczby zgodne z grą, ustawienie i zakładka.
//
// Uruchomienie: node tools/sprawdz_samouczek.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const { Tutorial, TUTORIAL_STEPS, TUTORIAL_DONE_SECONDS, TUTORIAL_QUICK_SECONDS, TUTORIAL_WALK_BLOCKS } = await import('../src/game/Tutorial.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { ACTIONS, Bindings, formatKeys } = await import('../src/input/bindings.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { SETTINGS_DEFAULTS } = await import('../src/settings/Settings.js');
const { SETTINGS_TABS } = await import('../src/ui/settingsLayout.js');
const { TEXTS } = await import('../src/ui/texts.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { CAMPFIRE_IGNITE_SECONDS, CAMPFIRE_CAPACITY, TINDERS, TINDER_TEMPS, KINDLING_TEMP, KINDLING_MAX, stackSeconds, woodIgnite, woodHeat, WARMTH_FROM, WARMTH_DEGREES } = await import('../src/game/CampfireState.js');
const { ROAST_SECONDS } = await import('../src/items/foods.js');
const { EFFECTS } = await import('../src/items/effects.js');
const { NIGHT_FROM, NIGHT_UNTIL } = await import('../src/game/Wellbeing.js');
const { WAKE_HOUR } = await import('../src/game/Sleep.js');
const { BENCH_PRODUCTS } = await import('../src/crafting/carpentry.js');
const { TOOL_SPEED } = await import('../src/config.js');
const { DRY_SECONDS } = await import('../src/items/clay.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Kroki ---------------------------------------------------------------------

{
    check(TUTORIAL_STEPS.length >= 8 && TUTORIAL_STEPS.length <= 12, `Samouczek ma rozsądną długość (${TUTORIAL_STEPS.length} kroków)`);
    check(new Set(TUTORIAL_STEPS.map((step) => step.id)).size === TUTORIAL_STEPS.length, 'Kroki: nazwy bez powtórzeń');
    for (const step of TUTORIAL_STEPS) {
        check(step.title.length >= 4 && step.title.length <= 28, `${step.id}: krótki nagłówek`);
        for (const text of [step.text, step.touch, step.hint].filter(Boolean)) {
            check(text.length <= 260 && /[.!]$/.test(text), `${step.id}: tekst krótki i zakończony kropką (${text.length} znaków)`);
        }
        check(typeof step.done === 'function', `${step.id}: warunek zaliczenia`);
        // Tekst na komputer mówi o klawiszach albo myszy - telefon potrzebuje własnego.
        if (/klawisz|myszy|Shift|naciśnij|Naciśnij|[[{][a-z0-9]+[\]}]/.test(step.text)) check(Boolean(step.touch) && !/klawisz|myszy|Shift|[[{][a-z0-9]+[\]}]/.test(step.touch), `${step.id}: osobny tekst na telefon`);
        // Klawisze nazwą czynności ([eat], {break}) - każda nazwa istnieje,
        // a gotowy tekst nie ma już nawiasów.
        for (const [, id] of step.text.matchAll(/[[{]([a-z0-9]+)[\]}]/g)) check(ACTIONS.some((action) => action.id === id), `${step.id}: czynność ${id}`);
        check(!/[[\]{}]/.test(formatKeys(step.text)) && formatKeys(step.text).length <= 280, `${step.id}: tekst z klawiszami`);
        // Litery klawiszy na sztywno (naciśnij F) nie poszłyby za zmianą klawiszy.
        check(!/(naciśnij|Naciśnij|klawiszem|klawisz) [A-Z]\b|\(Shift\)|przycisk(iem)? myszy/.test(step.text), `${step.id}: klawisze tylko nazwą czynności`);
    }
    const text = (id) => TUTORIAL_STEPS.find((step) => step.id === id);
    check(text('fire').text.includes(`${CAMPFIRE_IGNITE_SECONDS} sekund`) && text('campfire').text.includes(`${CAMPFIRE_CAPACITY} polan`), 'Ognisko: liczby jak w grze');
    check(text('sleep').text.includes(`${NIGHT_FROM}:00`), 'Sen: godzina nocy jak w grze');
    check(TINDERS.oak_bark === 1 && TINDERS.birch_bark === 1.5 && /korę/.test(text('fire').text), 'Kora jest podpałką (krok o rozpalaniu)');
    // Domyślne klawisze w tekstach - jak dotąd.
    check(/klawiszami W, A, S, D, skok to Spacja/.test(formatKeys(text('move').text)), 'Ruch: W, A, S, D i Spacja');
    check(/przytrzymaj lewy przycisk myszy, aż/.test(formatKeys(text('wood').text)), 'Drewno: lewy przycisk myszy');
    check(/ekwipunek \(E\)/.test(formatKeys(text('planks').text)) && /naciśnij F\./.test(formatKeys(text('eat').text)) && /Naciśnij C,/.test(formatKeys(text('status').text)), 'Ekwipunek E, jedzenie F, status C');
    check(/kucnij \(Shift\)/.test(formatKeys(text('sleep').text)) && /przytrzymaj PPM przez 5 sekund/.test(formatKeys(text('fire').text)) && /pień siekierą \(PPM\)/.test(formatKeys(text('fire').text)), 'Kucanie Shift, rozpalanie PPM');
    // Po zmianie klawiszy teksty idą za nimi.
    {
        const custom = new Bindings({ eat: 'KeyG', break: 'KeyK', use: 'Mouse3', crouch: 'ControlLeft', forward: 'ArrowUp' });
        check(/naciśnij G\./.test(custom.format(text('eat').text)) && /zbierasz kliknięciem \(Mysz 4\)/.test(custom.format(text('eat').text)), 'Zmienione: jedzenie pod G, zbieranie bocznym przyciskiem');
        check(/przytrzymaj klawisz K, aż/.test(custom.format(text('wood').text)), 'Zmienione: kopanie klawiszem K');
        check(/kucnij \(Lewy Ctrl\)/.test(custom.format(text('sleep').text)) && /klawiszami ↑, A, S, D/.test(custom.format(text('move').text)), 'Zmienione: kucanie i ruch');
    }
    // Przepisy, o których mówi samouczek.
    check(findRecipe(['oak_log'])?.result.join() === 'oak_planks,4', 'Pień -> 4 deski');
    check(findRecipe(['oak_planks', null, 'birch_planks', null])?.result.join() === 'stick,4', 'Dwie deski jedna nad drugą -> 4 patyki');
    check(findRecipe(['stone', 'granite', 'stone', 'stick'])?.result[0] === 'axe', 'Siekiera: dwie skały, pod nimi skała i patyk');
    check(findRecipe(['stick', 'stick'])?.result[0] === 'fire_starter', 'Starter ognia z dwóch patyków');
    check(findRecipe(['oak_log', 'axe'])?.result.join() === 'oak_firewood,4', 'Pień + siekiera -> 4 polana');
    check(findRecipe(['short_grass', 'tall_grass'])?.result[0] === 'straw' && findRecipe(['straw', 'straw', 'straw', 'straw'])?.result[0] === 'straw_bedding', 'Słoma i pościel jak w radzie');
}


// --- Przebieg ---------------------------------------------------------------------

function makeGame({ mode = 'adventure', net = null, days = 0.3, touch = false, tutorial = undefined } = {}) {
    const messages = [], achieved = [];
    const game = {
        mode, net, touchMode: touch,
        worldInfo: { tutorial },
        inventory: Inventory.load({}, mode),
        player: { pos: { x: 0, y: 0, z: 0 } },
        time: { days },
        campfires: { fires: new Map() },
        onMessage: (text) => messages.push(text),
        achieve(name, data) { achieved.push(name); game.tutorial.event(name, data); },
        messages, achieved
    };
    game.tutorial = new Tutorial(game, tutorial ?? null);
    return game;
}
// Mija czas gry; gracz idzie "speed" bloków na sekundę.
function run(game, seconds, speed = 0, dt = 0.05) {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
        game.player.pos.x += speed * dt;
        game.tutorial.update(dt);
    }
}
const current = (game) => game.tutorial.view()?.id ?? null;
// Zalicza bieżący krok (po spełnieniu warunku): "Zrobione!" i następny.
const settle = (game) => run(game, TUTORIAL_DONE_SECONDS + 0.6);

{
    // Kiedy pytać o samouczek.
    const fresh = makeGame();
    check(fresh.tutorial.shouldOffer(true, true), 'Nowy świat w trybie przygody - pytanie o samouczek');
    check(!fresh.tutorial.shouldOffer(false, true), 'Ustawienie wyłączone - bez pytania');
    check(!fresh.tutorial.shouldOffer(true, false), 'Stary świat - bez pytania');
    check(!makeGame({ mode: 'creative' }).tutorial.shouldOffer(true, true) && !makeGame({ mode: 'developer' }).tutorial.shouldOffer(true, true), 'Tryb kreatywny i programisty - bez samouczka');
    check(!makeGame({ net: { isHost: false } }).tutorial.shouldOffer(true, true) && makeGame({ net: { isHost: true } }).tutorial.shouldOffer(true, true), 'Gość w grze ze znajomymi - bez samouczka; gospodarz - tak');
    check(!makeGame({ tutorial: { step: 2, done: false } }).tutorial.shouldOffer(true, true), 'Świat, w którym już pytano - bez pytania');
    check(fresh.tutorial.view() === null && !fresh.tutorial.active, 'Przed odpowiedzią nic się nie pokazuje');
    run(fresh, 5, 4);
    check(fresh.tutorial.view() === null && fresh.worldInfo.tutorial === undefined, 'Bez startu samouczek nie rusza i niczego nie zapisuje');
    check(makeGame({ mode: 'creative' }).tutorial.start() === false, 'W trybie kreatywnym nie da się go zacząć');
}

{
    const game = makeGame();
    const { tutorial, inventory } = game;
    let changes = 0;
    tutorial.onChange = () => changes++;
    check(tutorial.start() && tutorial.active && current(game) === 'move', 'Start: pierwszy krok');
    check(game.worldInfo.tutorial.step === 0 && game.worldInfo.tutorial.done === false && changes === 1, 'Stan trafia do zapisu świata');
    const view = tutorial.view();
    check(view.index === 1 && view.total === TUTORIAL_STEPS.length && view.title === TUTORIAL_STEPS[0].title && view.text === formatKeys(TUTORIAL_STEPS[0].text) && /W, A, S, D/.test(view.text) && !view.completed, 'Karta: numer kroku, nagłówek, tekst');

    // 1. Ruch: trzeba naprawdę przejść kawałek; teleport się nie liczy.
    run(game, 1, 2);
    check(current(game) === 'move' && !tutorial.view().completed, 'Dwa bloki to za mało');
    game.player.pos.x += 500;
    run(game, 0.5);
    check(!tutorial.view().completed, 'Teleport nie zalicza chodzenia');
    let walking = 0;
    while (!tutorial.view().completed && walking < 10) { run(game, 0.05, 4); walking += 0.05; }
    check(tutorial.view().completed && current(game) === 'move' && walking < TUTORIAL_WALK_BLOCKS / 4 + 0.5, 'Po przejściu kilku bloków: "Zrobione!"');
    run(game, TUTORIAL_DONE_SECONDS - 0.6);
    check(current(game) === 'move', '"Zrobione!" zostaje na ekranie chwilę');
    run(game, 0.8);
    check(current(game) === 'wood' && game.worldInfo.tutorial.step === 1, 'Potem następny krok (zapisany)');

    // 2. Drewno: zdarzenie z gry (rozbity pień).
    game.achieve('blockBroken', { type: 'stone' });
    run(game, 0.6);
    check(!tutorial.view().completed, 'Rozbity kamień to nie drewno');
    game.achieve('blockBroken', { type: 'birch_log' });
    settle(game);
    check(current(game) === 'planks', 'Rozbity pień zalicza krok');

    // 3-4. Deski i patyki: zdarzenie wytworzenia albo rzecz w ekwipunku.
    game.achieve('crafted', { type: 'spruce_planks', count: 4 });
    settle(game);
    check(current(game) === 'sticks', 'Wytworzone deski');
    inventory.add('stick', 4);
    settle(game);
    check(current(game) === 'axe', 'Patyki w ekwipunku też się liczą');

    // 5. Siekiera (dowolna skała).
    inventory.add('pickaxe', 1);
    run(game, 0.6);
    check(!tutorial.view().completed, 'Kilof to nie siekiera');
    game.achieve('crafted', { type: 'axe_granite', count: 1 });
    settle(game);
    check(current(game) === 'eat', 'Granitowa siekiera zalicza krok');

    // 6-7. Jedzenie i okno statusu.
    game.achieve('ate', { type: 'strawberry', meal: false });
    settle(game);
    check(current(game) === 'status', 'Zjedzona przekąska');
    tutorial.event('statusOpened');
    settle(game);
    check(current(game) === 'campfire', 'Otwarte okno statusu');

    // 8-9. Ognisko: sześć polan, potem ogień.
    const fire = { logs: ['oak', 'oak', 'oak'], phase: 'unlit' };
    game.campfires.fires.set('0,0,0', fire);
    run(game, 0.6);
    check(!tutorial.view().completed, 'Trzy polana to za mało');
    fire.logs.push('oak', 'oak', 'oak');
    settle(game);
    check(current(game) === 'fire', 'Sześć polan - ognisko ułożone');
    run(game, 0.6);
    check(!tutorial.view().completed, 'Nierozpalone ognisko');
    fire.phase = 'burning';
    run(game, 0.6);
    fire.phase = 'unlit'; fire.logs = [];                                 // wypaliło się
    settle(game);
    check(current(game) === 'sleep', 'Ognisko, które płonęło, zalicza krok (także gdy już zgasło)');

    // 10. Sen: w dzień krok czeka i mówi dlaczego.
    check(/wieczora/.test(tutorial.view().wait ?? ''), 'W dzień: "poczekaj do wieczora"');
    // Z zegarem świata karta mówi, która jest godzina (pełna - bez ciągłego przerysowywania).
    game.time.formatClock = () => '14:37';
    check(/^Jest po 14:00 - poczekaj do wieczora\./.test(tutorial.view().wait), 'W dzień: godzina na karcie');
    game.time.formatClock = () => '07:05';
    check(/^Jest po 7:00 /.test(tutorial.view().wait), 'Godzina bez zera na początku');
    game.time.days = 0.85;
    run(game, 0.3);
    check(tutorial.view().wait === null, 'Nocą podpowiedź o czekaniu znika');
    game.achieve('slept', { place: 'ground', hours: 0.1, early: true });
    run(game, 0.6);
    check(!tutorial.view().completed, 'Wstanie po chwili to nie przespana noc');
    game.achieve('slept', { place: 'ground', hours: 9, early: false });
    run(game, 0.6);
    check(tutorial.view().completed, 'Przespana noc');
    settle(game);
    check(tutorial.view() === null && !tutorial.active && tutorial.finished, 'Koniec: karta znika');
    check(game.worldInfo.tutorial.done === true && game.worldInfo.tutorial.skipped === false, 'Ukończenie zapisane');
    check(/Samouczek ukończony/.test(game.messages.at(-1)) && /Poradnik/.test(game.messages.at(-1)), 'Wiadomość na koniec wskazuje poradnik');
    check(game.achieved.at(-1) === 'tutorialDone', 'Zdarzenie do osiągnięcia');
    run(game, 3, 4);
    check(game.messages.length === 1 && game.achieved.filter((name) => name === 'tutorialDone').length === 1, 'Koniec zgłasza się tylko raz');
}

{
    // Kroki zrobione wcześniej (gracz, który gra po swojemu) zaliczają się szybko.
    const game = makeGame();
    game.tutorial.start();
    game.achieve('ate', { type: 'acorn' });                               // zjadł, zanim samouczek o to poprosił
    game.inventory.add('oak_log', 3);
    game.inventory.add('axe', 1);
    run(game, 4, 4);
    let seconds = 0;
    while (current(game) !== 'status' && seconds < 30) { run(game, 0.25); seconds += 0.25; }
    check(current(game) === 'status', 'Gracz z siekierą i po posiłku przeskakuje do okna statusu');
    check(seconds <= 5 * (TUTORIAL_QUICK_SECONDS + 0.6), `Gotowe kroki migają krótko (${seconds} s na pięć kroków)`);

    // Pomijanie kroku i wyłączenie.
    check(game.tutorial.skipStep() && current(game) === 'campfire', '"Pomiń krok" przechodzi dalej');
    game.tutorial.stop();
    check(!game.tutorial.active && game.tutorial.view() === null && game.worldInfo.tutorial.done && game.worldInfo.tutorial.skipped && !game.tutorial.finished,
        '"Wyłącz samouczek": karta znika, stan zapisany jako pominięty');
    check(game.tutorial.skipStep() === false, 'Wyłączonego nie da się przewijać');
    check(game.achieved.includes('tutorialDone') === false, 'Wyłączenie to nie ukończenie');

    // Powtórka z ustawień: od pierwszego kroku, wcześniejsze zdarzenia się nie liczą.
    check(game.tutorial.start() && current(game) === 'move' && game.worldInfo.tutorial.step === 0 && !game.worldInfo.tutorial.done, 'Powtórka zaczyna od pierwszego kroku');
    run(game, 4, 4);
    run(game, 12);
    check(current(game) === 'eat', 'Powtórka: rzeczy w ekwipunku się liczą, dawny posiłek już nie');

    // Ostatni krok pominięty: też koniec (bez "pominięty").
    for (let index = 0; index < TUTORIAL_STEPS.length; index++) game.tutorial.skipStep();
    check(game.tutorial.finished && game.achieved.at(-1) === 'tutorialDone', 'Pominięcie ostatniego kroku kończy samouczek');
}

{
    // "Pomiń - znam grę" na pytanie: nic nie rusza, a pytanie nie wraca.
    const game = makeGame();
    game.tutorial.stop();
    check(game.worldInfo.tutorial.done && game.worldInfo.tutorial.skipped && !game.tutorial.shouldOffer(true, true), 'Pominięty na starcie - bez kolejnego pytania');
    run(game, 3, 4);
    check(game.tutorial.view() === null, 'Pominięty - karta się nie pokazuje');

    // Zapis i odczyt.
    const saved = makeGame({ tutorial: { step: 5, done: false, skipped: false } });
    check(saved.tutorial.active && current(saved) === 'eat', 'Po wczytaniu świata samouczek wraca w tym samym kroku');
    check(makeGame({ tutorial: { step: 99 } }).tutorial.active === false, 'Numer kroku spoza listy - skończony');
    check(current(makeGame({ tutorial: { step: -4 } })) === 'move' && current(makeGame({ tutorial: { step: 'trzy' } })) === 'move', 'Uszkodzony numer kroku - od początku');
    check(makeGame({ tutorial: 'tak' }).tutorial.state === null && makeGame({ tutorial: null }).tutorial.state === null, 'Brak stanu - jeszcze nie pytano');
    check(makeGame({ tutorial: { step: 3, done: true, skipped: true } }).tutorial.view() === null, 'Zapisany jako pominięty - cisza');

    // Telefon: własne teksty.
    const phone = makeGame({ touch: true });
    phone.tutorial.start();
    check(phone.tutorial.view().text === TUTORIAL_STEPS[0].touch && /joystick/.test(phone.tutorial.view().text), 'Telefon: tekst o dotyku');
    const noTouchText = TUTORIAL_STEPS.findIndex((step) => !step.touch);
    for (let index = 0; index < noTouchText; index++) phone.tutorial.skipStep();
    check(phone.tutorial.view().text === TUTORIAL_STEPS[noTouchText].text && !/[[\]{}]/.test(TUTORIAL_STEPS[noTouchText].text), 'Krok bez wersji na telefon pokazuje zwykły tekst (bez klawiszy)');

    // Zmiana trybu gry na kreatywny chowa samouczek, powrót go przywraca.
    const switched = makeGame();
    switched.tutorial.start();
    switched.mode = 'creative';
    check(switched.tutorial.view() === null && !switched.tutorial.active, 'W trybie kreatywnym samouczek milczy');
    switched.mode = 'adventure';
    check(current(switched) === 'move', 'Po powrocie do przygody jest tam, gdzie był');
}


// --- Ustawienie, zakładka, teksty, osiągnięcie ------------------------------------------

{
    check(SETTINGS_DEFAULTS.tutorial === true, 'Ustawienie "samouczek" domyślnie włączone');
    check(SETTINGS_TABS.guide?.includes('tutorial') && TEXTS.settingsTabs.guide === 'Poradnik', 'Zakładka Poradnik z ustawieniem samouczka');
    check(typeof TEXTS.tutorial === 'function' && /Tak/.test(TEXTS.tutorial(true)) && /Nie/.test(TEXTS.tutorial(false)), 'Napis ustawienia');
    for (const key of ['tutorialRestart', 'tutorialOfferTitle', 'tutorialOfferText', 'tutorialOfferStart', 'tutorialOfferSkip', 'tutorialOfferNever', 'tutorialSkipStep', 'tutorialStop', 'guideIntro']) {
        check(typeof TEXTS[key] === 'string' && TEXTS[key].length > 3, `Tekst ${key}`);
    }
    check(TEXTS.tutorialPauseNote(3, 10, 'Zrób deski') === 'Samouczek - krok 3 z 10: Zrób deski', 'Pauza: który krok');
    const achievement = ACHIEVEMENTS.find((entry) => entry.id === 'tutorial_done');
    check(achievement?.on === 'tutorialDone' && achievement.tier === 'common', 'Osiągnięcie za ukończenie samouczka');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    check(/<div id="tutorial" hidden><\/div>/.test(html), 'Miejsce na kartę samouczka w index.html');
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    check(/shouldOffer\(settings\.get\('tutorial'\), newWorld\)/.test(main) && /menu\.showTutorialOffer\(\)/.test(main), 'Nowy świat zaczyna się pytaniem o samouczek');
    check(/settings\.set\('tutorial', false\)/.test(main), '"Nie pytaj w nowych światach" wyłącza ustawienie');
}


// --- Poradnik -------------------------------------------------------------------------------

{
    check(GUIDE.length >= 8 && new Set(GUIDE.map((chapter) => chapter.id)).size === GUIDE.length, `Poradnik: ${GUIDE.length} rozdziałów, nazwy bez powtórzeń`);
    for (const chapter of GUIDE) {
        check(chapter.title.length >= 4 && chapter.lines.length >= 3 && chapter.lines.length <= 19, `${chapter.id}: nagłówek i kilka punktów`);
        for (const line of [...chapter.lines, ...(chapter.touch ?? [])]) {
            const text = typeof line === 'string' ? line : line.text;
            check(text.length >= 8 && text.length <= 190, `${chapter.id}: krótki punkt (${text.length} znaków)`);
            if (typeof line !== 'string' && line.keys !== undefined) check(formatKeys(line.keys).length > 0 && formatKeys(line.keys).length <= 14, `${chapter.id}: klawisz "${line.keys}"`);
            if (typeof line !== 'string' && line.keys === undefined) check(typeof line.touch === 'string' && !/[[\]]/.test(line.touch) && line.touch.length <= 190, `${chapter.id}: wersja punktu na telefon`);
            for (const part of [text, typeof line === 'string' ? '' : line.keys ?? '']) {
                for (const [, id] of part.matchAll(/\[([a-z0-9]+)\]/g)) check(ACTIONS.some((action) => action.id === id), `${chapter.id}: czynność ${id}`);
                check(!/[[\]]/.test(formatKeys(part)), `${chapter.id}: klawisze podstawione`);
            }
        }
    }
    const chapter = (id) => GUIDE.find((entry) => entry.id === id).lines.map((line) => formatKeys(typeof line === 'string' ? line : `${line.keys ?? ''} ${line.text}`)).join('\n');
    // Sterowanie: każda czynność, którą da się przypisać (poza paskiem), jest w poradniku.
    const controls = GUIDE[0].lines.map((line) => (typeof line === 'string' ? line : `${line.keys} ${line.text}`)).join('\n');
    for (const action of ACTIONS.filter((entry) => entry.group !== 'hotbar' && !['pick', 'command'].includes(entry.id))) {
        check(controls.includes(`[${action.id}]`), `Sterowanie: ${action.label}`);
    }
    check(/W A S D/.test(chapter('controls')) && /Ustawienia → Gracz → Klawisze/.test(chapter('controls')), 'Sterowanie: domyślne klawisze i droga do ich zmiany');
    check(GUIDE[0].id === 'controls' && GUIDE[0].touch?.length >= 6, 'Pierwszy rozdział: sterowanie, z wersją na telefon');
    // Liczby w poradniku zgodne z grą.
    check(chapter('fire').includes(`${CAMPFIRE_CAPACITY} polan`) && chapter('fire').includes(`${CAMPFIRE_IGNITE_SECONDS} sekund`) && chapter('fire').includes(`${ROAST_SECONDS} sekundy`), 'Ognisko: polana, rozpalanie, pieczenie');
    check(TINDERS.huba_huba === 2 && /dwa razy szybciej/.test(chapter('fire')), 'Ognisko: huba');
    // Charakter drewna (1.32.0): liczby w poradniku są takie jak w grze.
    const minutes = (wood) => String(stackSeconds(wood) / 60).replace('.', ',');
    check(chapter('fire').includes(`świerka starcza na ${minutes('spruce')} minuty`) && chapter('fire').includes(`brzozy na ${minutes('birch')} minut`) && chapter('fire').includes(`dębu na ${minutes('oak')} minut`), 'Ognisko: czas palenia stosu świerka, brzozy i dębu');
    check(chapter('fire').includes(`trawa i słoma ${TINDER_TEMPS.short_grass}°`) && chapter('fire').includes(`kora ${TINDER_TEMPS.oak_bark}°`) && chapter('fire').includes(`kora sosny i świerka ${TINDER_TEMPS.pine_bark}°`) && chapter('fire').includes(`kora brzozy ${TINDER_TEMPS.birch_bark}°`), 'Ognisko: temperatury podpałek');
    check(['pine', 'spruce', 'birch', 'beech', 'oak'].every((wood) => chapter('fire').includes(`${woodIgnite(wood)}°`)) && chapter('fire').includes(`dodaje ${KINDLING_TEMP}°`) && KINDLING_MAX === 2 && /mieszczą się dwa/.test(chapter('fire')), 'Ognisko: zapłon drewna i rozpałka');
    const warmth = (wood) => Math.round((woodHeat(wood) - WARMTH_FROM) / WARMTH_DEGREES);
    check(chapter('fire').includes(`z lipy jest o ${warmth('linden')}°C cieplej, z sosny o ${warmth('pine')}, z brzozy o ${warmth('birch')}, z dębu o ${warmth('oak')}`), 'Ognisko: ciepło zależy od drewna');
    const fireStep = TUTORIAL_STEPS.find((step) => step.id === 'fire');
    check(/rozpałki - dołóż patyk/.test(fireStep.text) && /rozpałki - dołóż patyk/.test(fireStep.touch), 'Samouczek: twarde drewno potrzebuje rozpałki');
    check(chapter('sleep').includes(`${NIGHT_FROM}:00 do ${NIGHT_UNTIL}:00`) && chapter('sleep').includes(`${WAKE_HOUR}:00`) && chapter('sleep').includes(`${BENCH_PRODUCTS.bed.planks} desek`), 'Sen: godziny i stelaż');
    check(chapter('herbs').includes(`${EFFECTS.heal.heal} razy szybciej`), 'Napary: gojenie');
    check(TOOL_SPEED === 3 && /trzy razy/.test(chapter('crafting')) && /trzy razy/.test(chapter('first-day')), 'Narzędzia: trzy razy szybciej');
    check(findRecipe(['oak_planks', 'oak_planks', 'oak_planks', 'oak_planks'])?.result[0] === 'chest' && findRecipe(['oak_planks', 'oak_planks', 'stick', 'stick'])?.result[0] === 'oak_carpenter_table', 'Skrzynia i stół stolarski jak w poradniku');
    check(findRecipe(['stone', 'stone', null, 'stick'])?.result[0] === 'pickaxe' && findRecipe(['stone', null, 'stick', null])?.result[0] === 'shovel', 'Kilof i łopata jak w poradniku');
    check(findRecipe(['stick', 'resin'])?.result.join() === 'torch,4' && findRecipe(['oak_planks', 'oak_planks'])?.result[0] === 'raft', 'Pochodnia i tratwa jak w poradniku');
    check(findRecipe(['clay', 'clay'])?.result.join() === 'wet_clay_cup,2' && findRecipe(['clay'])?.result.join() === 'wet_clay_brick,2' && /2 mokre kubki/.test(chapter('herbs')), 'Mokry kubek i cegły jak w poradniku');
    check(chapter('clay').includes(`${DRY_SECONDS / 60} minutach`) && findRecipe(['clay_brick', 'clay_brick', 'clay_brick', 'clay_brick'])?.result[0] === 'clay_bricks', 'Suszenie i cegły jak w poradniku');
}

console.log(`OK: samouczek i poradnik - ${checks} sprawdzeń (${TUTORIAL_STEPS.length} kroków, pytanie, pomijanie, powtórka, zapis, ${GUIDE.length} rozdziałów poradnika).`);
