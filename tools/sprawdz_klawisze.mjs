// ------------------------------------------------------------
// SPRAWDZENIE KLAWISZY DO USTAWIENIA PRZEZ GRACZA (0.99.0)
//
// - lista czynności (input/bindings.js): nazwy i domyślne klawisze bez
//   powtórzeń, każdy klawisz, o który pyta gra, jest na liście,
// - tłumaczenie: domyślnie nic się nie zmienia; po zmianie nowy klawisz
//   działa, stary - nie; zamiana przy zajętym klawiszu; powrót do
//   domyślnych; uszkodzony zapis,
// - InputManager: klawisz jako przycisk myszy i odwrotnie, powtarzanie,
//   oba Shifty, zmiana przypisań w trakcie gry,
// - klawisze okien (app/keys.js) i ekwipunek idą za przypisaniami,
// - ustawienia: zapis, "Przywróć domyślne" nie kasuje klawiszy,
//   napisy debugowania (F3) domyślnie wyłączone - także w starym zapisie,
// - nazwy klawiszy w podpowiedziach, ekran i teksty.
//
// Uruchomienie: node tools/sprawdz_klawisze.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// --- Udawane okno przeglądarki -------------------------------------------------

function makeTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(listener); },
        removeEventListener() {},
        fire(type, event = {}) {
            const sent = { prevented: false, stopped: false, preventDefault() { sent.prevented = true; }, stopImmediatePropagation() { sent.stopped = true; }, ...event };
            for (const listener of listeners.get(type) ?? []) { if (!sent.stopped) listener(sent); }
            return sent;
        }
    };
}

const canvas = makeTarget();
canvas.requestPointerLock = () => {};
globalThis.window = makeTarget();
globalThis.document = Object.assign(makeTarget(), { pointerLockElement: canvas });
const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };

const { ACTIONS, ACTION_GROUPS, RESERVED_CODES, Bindings, bindings, cleanBindings, bindable, keyLabel, keySentence,
    mouseCode, mouseButton, formatKeys, plainKeys } = await import('../src/input/bindings.js');
const { InputManager } = await import('../src/input/InputManager.js');
const { installGameKeys } = await import('../src/app/keys.js');
const { Settings, SETTINGS_DEFAULTS, SETTINGS_REVISION } = await import('../src/settings/Settings.js');
const { SETTINGS_TABS, COMMAND_ONLY_SETTINGS } = await import('../src/ui/settingsLayout.js');
const { TEXTS } = await import('../src/ui/texts.js');
const { TOUCH_SETTINGS } = await import('../src/config.js');

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- Lista czynności -----------------------------------------------------------

{
    check(ACTIONS.length >= 25, `Czynności do przypisania: ${ACTIONS.length}`);
    check(new Set(ACTIONS.map((action) => action.id)).size === ACTIONS.length, 'Nazwy czynności bez powtórzeń');
    const codes = ACTIONS.flatMap((action) => [action.code, ...(action.aliases ?? [])]);
    check(new Set(codes).size === codes.length, 'Domyślne klawisze bez powtórzeń');
    for (const action of ACTIONS) {
        check(/^[a-z0-9]+$/.test(action.id) && action.label.length >= 4 && action.label.length <= 30, `${action.id}: nazwa`);
        check(bindable(action.code) && action.group in ACTION_GROUPS, `${action.id}: klawisz i grupa`);
    }
    for (const group of Object.keys(ACTION_GROUPS)) check(ACTIONS.some((action) => action.group === group), `Grupa ${group} nie jest pusta`);

    // Każdy klawisz i przycisk, o który pyta gra, da się przypisać -
    // poza klawiszami testera ([ ] - czas) i dowolnym kodem z pętli.
    const asked = new Set();
    const walk = (folder) => {
        for (const entry of readdirSync(new URL(`../${folder}/`, import.meta.url), { withFileTypes: true })) {
            if (entry.isDirectory()) walk(`${folder}/${entry.name}`);
            else if (entry.name.endsWith('.js')) {
                const text = source(`${folder}/${entry.name}`);
                for (const [, code] of text.matchAll(/(?:isKeyDown|consumeKeyPress)\('([A-Za-z0-9]+)'\)/g)) asked.add(code);
                for (const [, button] of text.matchAll(/(?:isMouseDown|consumeMousePress)\((\d)\)/g)) asked.add(mouseCode(Number(button)));
            }
        }
    };
    walk('src');
    check(asked.size >= 12, `Gra pyta o ${asked.size} klawiszy i przycisków`);
    for (const code of asked) {
        if (['BracketLeft', 'BracketRight'].includes(code)) continue;
        check(codes.includes(code), `Klawisz ${code}, o który pyta gra, jest na liście czynności`);
    }
    for (const code of ['KeyE', 'KeyL', 'KeyC', 'KeyM', 'KeyT', 'Slash']) check(codes.includes(code), `Klawisz okna ${code} jest na liście`);
}


// --- Tłumaczenie klawiszy ------------------------------------------------------

{
    const fresh = new Bindings();
    check(!fresh.changed && Object.keys(fresh.custom).length === 0, 'Na początku nic nie jest zmienione');
    for (const action of ACTIONS) check(fresh.logical(action.code) === action.code && fresh.codeOf(action.id) === action.code, `${action.id}: domyślnie bez zmian`);
    check(fresh.logical('ShiftRight') === 'ShiftLeft' && fresh.logical('NumpadDivide') === 'Slash', 'Prawy Shift i / z klawiatury numerycznej działają jak dotąd');
    check(fresh.logical('Escape') === 'Escape' && fresh.logical('BracketLeft') === 'BracketLeft' && fresh.logical('F8') === 'F8', 'Klawisze spoza listy przechodzą bez zmian');

    // Zmiana: nowy klawisz działa, stary nie.
    let result = fresh.assign('forward', 'ArrowUp');
    check(result.ok && result.swapped === null && fresh.changed, 'Przypisanie wolnego klawisza');
    check(fresh.logical('ArrowUp') === 'KeyW' && fresh.logical('KeyW') === null && fresh.codeOf('forward') === 'ArrowUp', 'Strzałka idzie do przodu, W już nie');
    check(JSON.stringify(fresh.custom) === '{"forward":"ArrowUp"}', 'W zapisie tylko zmieniona czynność');

    // Zajęty klawisz: czynności zamieniają się miejscami.
    result = fresh.assign('eat', 'KeyE');
    check(result.ok && result.swapped?.id === 'inventory' && fresh.codeOf('inventory') === 'KeyF' && fresh.codeOf('eat') === 'KeyE', 'Zajęty klawisz: zamiana z poprzednią czynnością');
    check(fresh.logical('KeyE') === 'KeyF' && fresh.logical('KeyF') === 'KeyE', 'Po zamianie oba klawisze działają - na odwrót');
    result = fresh.assign('back', 'ArrowUp');
    check(result.swapped?.id === 'forward' && fresh.codeOf('forward') === 'KeyS' && fresh.codeOf('back') === 'ArrowUp', 'Zamiana z czynnością, która już była zmieniona');
    const used = ACTIONS.map((action) => fresh.codeOf(action.id));
    check(new Set(used).size === used.length, 'Po zamianach żaden klawisz nie ma dwóch czynności');

    // Mysz i klawiatura na przemian.
    result = fresh.assign('break', 'KeyK');
    check(result.ok && fresh.logical('KeyK') === 'Mouse0' && fresh.logical('Mouse0') === null, 'Kopanie pod klawiszem zamiast myszy');
    result = fresh.assign('inventory', 'Mouse3');
    check(result.ok && fresh.logical('Mouse3') === 'KeyE', 'Ekwipunek pod bocznym przyciskiem myszy');
    result = fresh.assign('jump', 'Mouse0');
    check(result.ok && result.swapped === null && fresh.logical('Mouse0') === 'Space', 'Zwolniony lewy przycisk można dać innej czynności');

    // Kucanie zmienione: prawy Shift przestaje kucać (nie jest już "tym samym").
    fresh.assign('crouch', 'ControlLeft');
    check(fresh.logical('ControlLeft') === 'ShiftLeft' && fresh.logical('ShiftLeft') === null && fresh.logical('ShiftRight') === null, 'Zmienione kucanie: oba Shifty wolne');
    result = fresh.assign('sprint', 'ShiftRight');
    check(result.ok && fresh.logical('ShiftRight') === 'KeyR', 'Wolny prawy Shift można przypisać');

    // Zakazane i nieznane.
    for (const code of ['Escape', 'F8', 'F11', 'F12', 'MetaLeft', '', 'Unidentified']) check(!fresh.assign('eat', code).ok, `Klawisza "${code}" nie da się przypisać`);
    check(!fresh.assign('eat', 'ala ma kota').ok && !fresh.assign('eat', null).ok && !fresh.assign('latanie', 'KeyZ').ok, 'Błędny kod albo czynność - odmowa');
    check(fresh.assign('eat', fresh.codeOf('eat')).ok, 'Ten sam klawisz jeszcze raz - bez zmian');
    for (const code of RESERVED_CODES) check(!bindable(code), `Zastrzeżony: "${code}"`);

    // Jedna czynność z powrotem i wszystko z powrotem.
    const before = fresh.codeOf('forward');
    result = fresh.restore('forward');
    check(result.ok && fresh.codeOf('forward') === 'KeyW' && before !== 'KeyW', 'Jedna czynność wraca na domyślny klawisz');
    const afterRestore = ACTIONS.map((action) => fresh.codeOf(action.id));
    check(new Set(afterRestore).size === afterRestore.length, 'Po powrocie dalej bez powtórzeń');
    fresh.reset();
    check(!fresh.changed && ACTIONS.every((action) => fresh.logical(action.code) === action.code), '"Przywróć domyślne klawisze" przywraca wszystko');

    // Słuchacze (InputManager czyści wciśnięte klawisze).
    let calls = 0;
    fresh.listeners.add(() => calls++);
    fresh.assign('eat', 'KeyG');
    fresh.reset();
    check(calls === 2, 'Zmiana przypisań zawiadamia słuchaczy');
}

{
    // Zapis: tylko poprawne wpisy.
    check(JSON.stringify(cleanBindings({ forward: 'ArrowUp', eat: 'KeyG' })) === '{"forward":"ArrowUp","eat":"KeyG"}', 'Poprawny zapis zostaje');
    check(Object.keys(cleanBindings({ forward: 'KeyW', eat: 'KeyF' })).length === 0, 'Domyślne klawisze znikają z zapisu');
    check(Object.keys(cleanBindings({ latanie: 'KeyZ', eat: 'Escape', jump: 17, back: '<script>', left: 'x'.repeat(40) })).length === 0, 'Nieznane czynności i złe kody odpadają');
    for (const broken of [null, undefined, 'tak', 7, [], () => {}]) check(Object.keys(cleanBindings(broken)).length === 0, `Uszkodzony zapis (${String(broken)}) - domyślne klawisze`);
    // Dwie czynności na jednym klawiszu: jedna wraca do domyślnego.
    const doubled = new Bindings({ eat: 'KeyG', sprint: 'KeyG', jump: 'KeyW' });
    const codes = ACTIONS.map((action) => doubled.codeOf(action.id));
    check(new Set(codes).size === codes.length, 'Zapis z dwiema czynnościami na jednym klawiszu jest naprawiany');
    check(doubled.codeOf('sprint') === 'KeyG' && doubled.codeOf('eat') === 'KeyF' && doubled.codeOf('forward') === 'KeyW' && doubled.codeOf('jump') === 'Space',
        'Naprawa: wygrywa czynność wcześniejsza na liście, domyślny właściciel klawisza zostaje');
    check(new Bindings({ forward: 'KeyX', jump: 'KeyW' }).codeOf('jump') === 'KeyW', 'Zwolniony klawisz innej czynności wolno zająć');
}


// --- Nazwy klawiszy ------------------------------------------------------------

{
    const names = { KeyW: 'W', Digit7: '7', Space: 'Spacja', ShiftLeft: 'Lewy Shift', ArrowUp: '↑', Mouse0: 'LPM', Mouse2: 'PPM', Mouse1: 'ŚPM',
        Mouse3: 'Mysz 4', Numpad4: 'Num 4', Slash: '/', F5: 'F5', Tab: 'Tab', ControlLeft: 'Lewy Ctrl' };
    for (const [code, name] of Object.entries(names)) check(keyLabel(code) === name, `${code} -> ${name}`);
    check(keySentence('KeyF') === 'klawisz F' && keySentence('Mouse0') === 'lewy przycisk myszy' && keySentence('Mouse2') === 'prawy przycisk myszy', 'Nazwy do zdań');
    check(mouseCode(2) === 'Mouse2' && mouseButton('Mouse4') === 4 && mouseButton('KeyW') === null && mouseButton(null) === null, 'Kody przycisków myszy');
    for (const action of ACTIONS) check(keyLabel(action.code).length > 0 && keyLabel(action.code).length <= 18, `${action.id}: krótka nazwa klawisza`);

    const custom = new Bindings({ eat: 'KeyG', use: 'KeyZ' });
    check(new Bindings().format('Naciśnij [eat], przytrzymaj {break}, kucnij ([crouch]).') === 'Naciśnij F, przytrzymaj lewy przycisk myszy, kucnij (Shift).', 'Podpowiedź z domyślnymi klawiszami');
    check(custom.format('Naciśnij [eat], użyj: {use}.') === 'Naciśnij G, użyj: klawisz Z.', 'Podpowiedź ze zmienionymi klawiszami');
    check(custom.format('[nic] {nic} [ ] - czas') === '[nic] {nic} [ ] - czas', 'Nieznane nazwy w nawiasach zostają');
    check(new Bindings({ crouch: 'KeyZ' }).format('[crouch]') === 'Z', 'Zmienione kucanie pokazuje swój klawisz');
    // Gotowe napisy gry z "LPM" / "PPM".
    check(new Bindings().plain('Dokładaj polana PPM. LPM: zabierz.') === 'Dokładaj polana PPM. LPM: zabierz.', 'Domyślnie napisy bez zmian');
    check(custom.plain('Dokładaj polana PPM. LPM: zabierz.') === 'Dokładaj polana Z. LPM: zabierz.', 'Zmienione użycie: PPM -> klawisz gracza');
    check(new Bindings({ break: 'KeyK' }).plain('trzymaj LPM (nie XLPM ani LPMY)') === 'trzymaj K (nie XLPM ani LPMY)', 'Podmiana tylko całych skrótów');
}


// --- InputManager --------------------------------------------------------------

const input = new InputManager(canvas);
const key = (type, code, more = {}) => window.fire(type, { code, ...more });
const mouse = (type, button) => document.fire(type, { button });
const clear = () => { bindings.reset(); input.reset(); };

{
    clear();
    key('keydown', 'KeyW');
    check(input.isKeyDown('KeyW') && input.consumeKeyPress('KeyW') && !input.consumeKeyPress('KeyW'), 'Domyślnie: W wciśnięty, jedno wciśnięcie');
    key('keydown', 'KeyW', { repeat: true });
    check(!input.consumeKeyPress('KeyW'), 'Powtarzanie klawisza to nie nowe wciśnięcie');
    key('keyup', 'KeyW');
    check(!input.isKeyDown('KeyW'), 'Puszczony');
    mouse('mousedown', 0);
    check(input.isMouseDown(0) && input.consumeMousePress(0), 'Domyślnie: lewy przycisk myszy');
    mouse('mouseup', 0);
    check(!input.isMouseDown(0), 'Puszczony przycisk');

    // Oba Shifty to jedno kucanie.
    key('keydown', 'ShiftRight');
    check(input.isKeyDown('ShiftLeft'), 'Prawy Shift kuca');
    key('keydown', 'ShiftLeft');
    key('keyup', 'ShiftRight');
    check(input.isKeyDown('ShiftLeft'), 'Puszczenie jednego Shifta nie kończy kucania, gdy trzymany jest drugi');
    key('keyup', 'ShiftLeft');
    check(!input.isKeyDown('ShiftLeft'), 'Oba puszczone');
}

{
    // Klawisz zamiast myszy i mysz zamiast klawisza.
    clear();
    bindings.load({ forward: 'ArrowUp', break: 'KeyK', eat: 'Mouse3', inventory: 'Mouse4' });
    key('keydown', 'ArrowUp');
    check(input.isKeyDown('KeyW') && input.consumeKeyPress('KeyW'), 'Strzałka w górę idzie do przodu');
    key('keyup', 'ArrowUp');
    key('keydown', 'KeyW');
    check(!input.isKeyDown('KeyW') && !input.consumeKeyPress('KeyW'), 'W po zmianie nic nie robi');
    key('keyup', 'KeyW');

    key('keydown', 'KeyK');
    check(input.isMouseDown(0) && input.consumeMousePress(0), 'Klawisz K kopie jak lewy przycisk');
    key('keydown', 'KeyK', { repeat: true });
    check(!input.consumeMousePress(0) && input.isMouseDown(0), 'Trzymany K - dalej kopie, bez nowego kliknięcia');
    key('keyup', 'KeyK');
    check(!input.isMouseDown(0), 'Puszczony K - koniec kopania');
    mouse('mousedown', 0);
    check(!input.isMouseDown(0) && !input.consumeMousePress(0), 'Lewy przycisk po zmianie nic nie robi');
    mouse('mouseup', 0);

    const pressed = [];
    input.onMouseKey = (code) => pressed.push(code);
    const side = mouse('mousedown', 3);
    check(input.consumeKeyPress('KeyF') && side.prevented, 'Boczny przycisk myszy je (i nie cofa strony)');
    check(pressed.join() === 'KeyF', 'Przycisk myszy z czynnością klawisza zgłasza ją oknom');
    mouse('mouseup', 3);
    mouse('mousedown', 4);
    check(pressed.join() === 'KeyF,KeyE', 'Ekwipunek pod bocznym przyciskiem');
    mouse('mouseup', 4);
    mouse('mousedown', 2);
    check(pressed.length === 2 && input.isMouseDown(2), 'Zwykły prawy przycisk nie udaje klawisza');
    mouse('mouseup', 2);
    input.onMouseKey = null;

    // Zmiana przypisań w trakcie trzymania: nic nie zostaje "wciśnięte".
    key('keydown', 'ArrowUp');
    bindings.load({});
    check(!input.isKeyDown('KeyW') && !input.isKeyDown('ArrowUp'), 'Zmiana klawiszy puszcza wszystko');
    key('keydown', 'ArrowUp');
    check(input.isKeyDown('ArrowUp') && !input.isKeyDown('KeyW'), 'Po powrocie do domyślnych strzałka jest zwykłą strzałką');
    key('keyup', 'ArrowUp');

    // Klawisz przeglądarki przypisany do gry nie przewija strony.
    bindings.load({ jump: 'Tab' });
    check(key('keydown', 'Tab').prevented && input.consumeKeyPress('Space'), 'Tab przypisany do skoku nie zmienia pola na stronie');
    key('keyup', 'Tab');

    // Wyłączone sterowanie (otwarty ekwipunek): nic nie dochodzi.
    input.enabled = false;
    key('keydown', 'Tab');
    check(!input.isKeyDown('Space'), 'Przy otwartym oknie klawisze nie trafiają do gry');
    input.enabled = true;
    key('keyup', 'Tab');
    clear();
}


// --- Klawisze okien (app/keys.js) ----------------------------------------------

{
    const opened = [];
    let state = 'playing';
    const actions = Object.fromEntries(['inventory', 'achievements', 'status', 'map', 'pause', 'markProblem'].map((name) => [name, () => opened.push(name)]));
    actions.chat = (text) => opened.push(`chat:${text}`);
    installGameKeys({ getState: () => state, getGame: () => ({}), isTouch: () => false, actions, input });

    key('keydown', 'KeyE'); key('keydown', 'KeyL'); key('keydown', 'KeyC'); key('keydown', 'KeyM'); key('keydown', 'KeyT'); key('keydown', 'Slash'); key('keydown', 'NumpadDivide');
    check(opened.join() === 'inventory,achievements,status,map,chat:,chat:/,chat:/', 'Domyślne klawisze okien');
    for (const code of ['KeyE', 'KeyL', 'KeyC', 'KeyM', 'KeyT', 'Slash', 'NumpadDivide']) key('keyup', code);

    opened.length = 0;
    bindings.load({ inventory: 'Tab', status: 'KeyI', chat: 'Enter', map: 'Mouse4' });
    key('keydown', 'KeyE'); key('keydown', 'KeyC'); key('keydown', 'KeyT');
    check(opened.length === 0, 'Stare klawisze okien po zmianie milczą');
    const tab = key('keydown', 'Tab');
    key('keydown', 'KeyI'); key('keydown', 'Enter');
    check(opened.join() === 'inventory,status,chat:' && tab.prevented, 'Nowe klawisze otwierają okna');
    mouse('mousedown', 4);
    check(opened.at(-1) === 'map', 'Mapa pod bocznym przyciskiem myszy');
    mouse('mouseup', 4);
    state = 'paused';
    opened.length = 0;
    key('keydown', 'Tab', { repeat: false });
    mouse('mousedown', 4);
    check(opened.length === 0, 'W pauzie klawisze okien nie działają');
    mouse('mouseup', 4);
    state = 'playing';

    // F3 i F5 nie uruchamiają szukania i odświeżania - także przypisane inaczej.
    bindings.load({ debug: 'KeyB', view: 'KeyV' });
    check(key('keydown', 'F3').prevented && key('keydown', 'F5').prevented, 'F3 i F5 dalej zablokowane dla przeglądarki');
    key('keydown', 'KeyB');
    check(input.consumeKeyPress('F3') && !input.consumeKeyPress('F5'), 'Debug pod nowym klawiszem');
    clear();
}

{
    // Ekwipunek zamyka się swoim klawiszem i zamienia miejsca cyframi z przypisań.
    const inventory = source('src/ui/InventoryScreen.js');
    check(/const code = bindings\.logical\(event\.code\);/.test(inventory) && /code === 'KeyE'/.test(inventory) && /\.exec\(code \?\? ''\)/.test(inventory), 'Ekwipunek czyta klawisze przez przypisania');
    check(!/event\.code === 'Key[A-Z]'/.test(inventory) && !/event\.code === 'Key[A-Z]'/.test(source('src/app/keys.js')), 'Okna nie porównują klawiszy na sztywno');
}


// --- Ustawienia ----------------------------------------------------------------

{
    store.clear();
    const settings = new Settings();
    check(SETTINGS_DEFAULTS.showDebug === false && settings.get('showDebug') === false, 'Napisy debugowania (F3) domyślnie wyłączone');
    check(TOUCH_SETTINGS.showDebug === false, 'Na telefonie też');
    check(JSON.stringify(settings.get('keys')) === '{}', 'Klawisze domyślnie bez zmian');

    const seen = [];
    settings.onChange((name, value) => seen.push([name, value]));
    settings.set('keys', { forward: 'ArrowUp', eat: 'Escape', latanie: 'KeyZ', jump: 'Space' });
    check(JSON.stringify(settings.get('keys')) === '{"forward":"ArrowUp"}' && seen.at(-1)[0] === 'keys', 'Zapis klawiszy: tylko poprawne i zmienione');
    check(JSON.stringify(new Settings().get('keys')) === '{"forward":"ArrowUp"}', 'Klawisze zostają po ponownym uruchomieniu');

    // "Przywróć domyślne" w ustawieniach nie rusza klawiszy (mają własny przycisk).
    settings.set('fov', 100);
    settings.reset();
    check(settings.get('fov') === SETTINGS_DEFAULTS.fov && JSON.stringify(settings.get('keys')) === '{"forward":"ArrowUp"}', 'Przywracanie ustawień nie kasuje klawiszy');
    settings.set('keys', {});
    check(JSON.stringify(new Settings().get('keys')) === '{}', 'Powrót do domyślnych klawiszy się zapisuje');

    // Uszkodzony zapis klawiszy niczego nie psuje.
    const saved = JSON.parse(store.get('voxel-game-settings'));
    for (const broken of ['tak', 5, null, ['KeyW'], { forward: { code: 'KeyZ' } }]) {
        store.set('voxel-game-settings', JSON.stringify({ ...saved, keys: broken }));
        check(JSON.stringify(new Settings().get('keys')) === '{}', `Uszkodzone klawisze w zapisie (${JSON.stringify(broken)})`);
    }

    // Stary zapis (sprzed 0.99.0) z włączonym debugiem: wyłącza się raz.
    check(SETTINGS_REVISION >= 3, 'Numer wersji ustawień podniesiony');
    store.set('voxel-game-settings', JSON.stringify({ ...saved, revision: 2, showDebug: true, showFps: true, fov: 95 }));
    const upgraded = new Settings();
    check(upgraded.get('showDebug') === false && upgraded.get('showFps') === true && upgraded.get('fov') === 95, 'Stary zapis: debug wyłączony, reszta bez zmian');
    upgraded.set('showDebug', true);
    check(new Settings().get('showDebug') === true, 'Włączony przez gracza po aktualizacji zostaje włączony');
}


// --- Ekran, teksty, połączenie z grą ---------------------------------------------

{
    check(SETTINGS_TABS.player.includes('keys') && !COMMAND_ONLY_SETTINGS.includes('keys'), 'Klawisze w zakładce Gracz');
    check(TEXTS.keys({}) === 'Klawisze: domyślne' && TEXTS.keys({ eat: 'KeyG' }) === 'Klawisze: zmienione (1)' && TEXTS.keys(undefined) === 'Klawisze: domyślne', 'Napis przycisku');
    for (const name of ['keysTitle', 'keysIntro', 'keysPress', 'keysReset', 'keysResetDone', 'keysNote', 'keysChangeTitle']) check(typeof TEXTS[name] === 'string' && TEXTS[name].length > 3, `Tekst ${name}`);
    check(/Esc/.test(TEXTS.keysCapture('Skok')) && /Skok/.test(TEXTS.keysCapture('Skok')) && /Ekwipunek/.test(TEXTS.keysSwapped('Ekwipunek', 'F')) && /W/.test(TEXTS.keysRestoreTitle('W')), 'Teksty z nazwami');
    check(formatKeys(TEXTS.chatHint).startsWith('E - ekwipunek, C - samopoczucie') && !/[[\]]/.test(formatKeys(TEXTS.chatHint)), 'Podpowiedź na czacie z klawiszami');
    check(formatKeys(TEXTS.achievementsHint) === 'W grze: klawisz L', 'Podpowiedź księgi osiągnięć');
    check(plainKeys('PPM') === 'PPM', 'Domyślnie PPM to PPM');

    const main = source('src/main.js');
    check(/bindings\.load\(settings\.get\('keys'\)\)/.test(main) && /key === 'keys' \|\| key === null/.test(main), 'Gra wczytuje klawisze z ustawień i po każdej zmianie');
    check(/installGameKeys\(\{[^}]*\binput,/.test(main), 'Klawisze okien dostają InputManager (przyciski myszy)');
    check(/hotbar\.showName\(plainKeys\(text\)\)/.test(main), 'Napisy gry z LPM / PPM idą za przypisaniami');
    const menu = source('src/ui/Menu.js');
    check(/showKeys\(returnTo = 'title', notice = ''\)/.test(menu) && /current\.assign\(action\.id, code\)/.test(menu) && /settings\.set\('keys', \{ \.\.\.current\.custom \}\)/.test(menu), 'Ekran klawiszy przypisuje i zapisuje');
    check(/key === 'keys' && this\.handlers\.touchMode\?\.\(\)/.test(menu), 'Na telefonie przycisku klawiszy nie ma');
    check(/\.keys-row/.test(source('src/ui/menu.css')), 'Wygląd ekranu klawiszy');
    // Okno statusu: pora dnia (zegar był tylko w napisach F3) i klawisze z przypisań.
    const status = source('src/ui/StatusPanel.js');
    check(/\['Pora', /.test(status) && /formatKeys\('\[status\] - zamknij'\)/.test(status), 'Okno statusu: pora dnia i swoje klawisze');
}

console.log(`OK: klawisze - ${checks} sprawdzeń (${ACTIONS.length} czynności, zamiana, mysz i klawiatura, zapis, napisy F3 domyślnie wyłączone).`);
