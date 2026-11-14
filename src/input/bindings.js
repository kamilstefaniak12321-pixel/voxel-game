// ------------------------------------------------------------
// KLAWISZE DO USTAWIENIA PRZEZ GRACZA (0.99.0)
//
// Każda czynność (ACTIONS) ma domyślny klawisz albo przycisk myszy.
// Gracz może przypisać jej inny (Ustawienia → Gracz → Klawisze).
//
// Jak to działa - jedna warstwa tłumaczenia, bez zmian w grze:
// gra dalej pyta o DOMYŚLNE kody ('KeyW', 'Mouse0'...), a InputManager
// i okna (ekwipunek, klawisze okien) najpierw tłumaczą wciśnięty
// klawisz na kod czynności, do której jest przypisany:
//
//     gracz przypisał "Do przodu" do strzałki w górę
//     wciśnięcie ArrowUp  ->  logical('ArrowUp') = 'KeyW'  ->  gra idzie
//     wciśnięcie W        ->  logical('KeyW')    = null    ->  nic
//
// Kody: klawisze - event.code ('KeyW', 'Space', 'ArrowUp'...), mysz -
// 'Mouse0' (lewy), 'Mouse1' (środkowy), 'Mouse2' (prawy), 'Mouse3',
// 'Mouse4' (boczne). Klawisz może zastąpić przycisk myszy i odwrotnie.
//
// Zapis: ustawienie 'keys' (settings/Settings.js) - tylko czynności
// zmienione przez gracza, { czynność: kod }.
//
// Nowa czynność: wpis w ACTIONS (id, nazwa, domyślny kod, grupa) -
// ekran klawiszy, zapis i podpowiedzi biorą ją stąd. W grze używaj jej
// domyślnego kodu (input.isKeyDown z kodem z tej listy).
// Podpowiedź z nazwą klawisza: formatKeys('Naciśnij [eat].') -> 'Naciśnij F.'
// Gotowy napis z "LPM" / "PPM": plainKeys(tekst).
// ------------------------------------------------------------

export const ACTION_GROUPS = {
    move: 'Ruch',
    hands: 'Ręce',
    windows: 'Okna',
    hotbar: 'Pasek bloków'
};

export const ACTIONS = [
    { id: 'forward', label: 'Do przodu', code: 'KeyW', group: 'move' },
    { id: 'back', label: 'Do tyłu', code: 'KeyS', group: 'move' },
    { id: 'left', label: 'W lewo', code: 'KeyA', group: 'move' },
    { id: 'right', label: 'W prawo', code: 'KeyD', group: 'move' },
    { id: 'jump', label: 'Skok, płynięcie w górę', code: 'Space', group: 'move' },
    // Prawy Shift działa jak lewy, dopóki kucanie ma domyślny klawisz
    // (hint - nazwa w podpowiedziach, gdy działają oba).
    { id: 'crouch', label: 'Kucanie, nurkowanie', code: 'ShiftLeft', aliases: ['ShiftRight'], hint: 'Shift', group: 'move' },
    { id: 'sprint', label: 'Bieg', code: 'KeyR', group: 'move' },

    { id: 'break', label: 'Kopanie, niszczenie', code: 'Mouse0', group: 'hands' },
    { id: 'use', label: 'Stawianie, użycie, zbieranie', code: 'Mouse2', group: 'hands' },
    { id: 'pick', label: 'Weź blok na pasek', code: 'Mouse1', group: 'hands' },
    { id: 'eat', label: 'Zjedz, wypij', code: 'KeyF', group: 'hands' },
    { id: 'drop', label: 'Wyrzuć przedmiot', code: 'KeyQ', group: 'hands' },

    { id: 'inventory', label: 'Ekwipunek', code: 'KeyE', group: 'windows' },
    { id: 'status', label: 'Okno statusu', code: 'KeyC', group: 'windows' },
    { id: 'map', label: 'Mapa terenu', code: 'KeyM', group: 'windows' },
    { id: 'achievements', label: 'Księga osiągnięć', code: 'KeyL', group: 'windows' },
    { id: 'chat', label: 'Czat', code: 'KeyT', group: 'windows' },
    { id: 'command', label: 'Komenda (czat z /)', code: 'Slash', aliases: ['NumpadDivide'], group: 'windows' },
    { id: 'view', label: 'Widok: z oczu, zza pleców', code: 'F5', group: 'windows' },
    { id: 'debug', label: 'Napisy debugowania', code: 'F3', group: 'windows' },

    ...Array.from({ length: 9 }, (_, index) => ({
        id: `slot${index + 1}`, label: `Miejsce ${index + 1} na pasku`, code: `Digit${index + 1}`, group: 'hotbar'
    }))
];

const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((action) => [action.id, action]));

// Kody, których nie da się przypisać: Escape (pauza - tak chce
// przeglądarka), F8 (zgłoszenie problemu), klawisze systemu i przeglądarki.
export const RESERVED_CODES = ['Escape', 'F8', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight',
    'ContextMenu', 'PrintScreen', 'Unidentified', ''];

export function mouseCode(button) {
    return `Mouse${button}`;
}

// Numer przycisku myszy z kodu ('Mouse2' -> 2) albo null, gdy to klawisz.
export function mouseButton(code) {
    const match = /^Mouse(\d)$/.exec(code ?? '');
    return match ? Number(match[1]) : null;
}

export function bindable(code) {
    return typeof code === 'string' && code.length > 0 && code.length <= 24 && /^[A-Za-z0-9]+$/.test(code) && !RESERVED_CODES.includes(code);
}

// Poprawny zapis { czynność: kod }: tylko znane czynności, dozwolone
// kody, różne od domyślnych, bez dwóch czynności na jednym kodzie.
export function cleanBindings(value) {
    const clean = {};
    if (!value || typeof value !== 'object') return clean;
    for (const action of ACTIONS) {
        const code = value[action.id];
        if (bindable(code) && code !== action.code) clean[action.id] = code;
    }
    // Dwie czynności na jednym kodzie (uszkodzony zapis): późniejsza
    // wraca do domyślnego klawisza - i tak do skutku.
    for (let round = 0; round < ACTIONS.length; round++) {
        const owners = new Map();
        let dropped = false;
        for (const action of ACTIONS) {
            const code = clean[action.id] ?? action.code;
            if (!owners.has(code)) { owners.set(code, action.id); continue; }
            const loser = action.id in clean ? action.id : owners.get(code);
            delete clean[loser];
            dropped = true;
            break;
        }
        if (!dropped) break;
    }
    return clean;
}

const KEY_LABELS = {
    Space: 'Spacja', ShiftLeft: 'Lewy Shift', ShiftRight: 'Prawy Shift', ControlLeft: 'Lewy Ctrl', ControlRight: 'Prawy Ctrl',
    AltLeft: 'Lewy Alt', AltRight: 'Prawy Alt', Tab: 'Tab', CapsLock: 'Caps Lock', Enter: 'Enter', Backspace: 'Backspace',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Slash: '/', Backslash: '\\', Comma: ',', Period: '.', Semicolon: ';', Quote: '\'', Backquote: '`',
    BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', IntlBackslash: '\\',
    Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
    NumpadEnter: 'Num Enter', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num ,',
    // Mysz: lewy, środkowy, prawy przycisk; boczne - jak w innych grach.
    Mouse0: 'LPM', Mouse1: 'ŚPM', Mouse2: 'PPM', Mouse3: 'Mysz 4', Mouse4: 'Mysz 5'
};

// Dłuższe nazwy do zdań w samouczku ("przytrzymaj lewy przycisk myszy").
const LONG_LABELS = {
    Mouse0: 'lewy przycisk myszy', Mouse1: 'środkowy przycisk myszy', Mouse2: 'prawy przycisk myszy',
    Mouse3: 'boczny przycisk myszy (4)', Mouse4: 'boczny przycisk myszy (5)'
};

// Nazwa klawisza albo przycisku dla gracza: 'KeyW' -> 'W', 'Mouse0' -> 'LPM'.
export function keyLabel(code) {
    if (Object.hasOwn(KEY_LABELS, code)) return KEY_LABELS[code];
    const match = /^(?:Key|Digit)(.)$/.exec(code) ?? /^Numpad(\d)$/.exec(code);
    if (match) return code.startsWith('Numpad') ? `Num ${match[1]}` : match[1];
    return code;
}

// To samo do zdania: 'klawisz W', 'lewy przycisk myszy'.
export function keySentence(code) {
    return LONG_LABELS[code] ?? `klawisz ${keyLabel(code)}`;
}

export class Bindings {

    constructor(saved = null) {
        this.listeners = new Set();
        this.load(saved);
    }

    // Wczytuje zapis (ustawienie 'keys') i buduje tabelę tłumaczenia.
    load(saved) {
        this.custom = cleanBindings(saved);
        this.table = new Map();
        // Kody, które po zmianie nie robią nic (stary klawisz czynności).
        this.dead = new Set();
        for (const action of ACTIONS) {
            const code = this.custom[action.id] ?? action.code;
            this.table.set(code, action.code);
            if (code === action.code) {
                for (const alias of action.aliases ?? []) if (!this.table.has(alias)) this.table.set(alias, action.code);
            }
            else {
                this.dead.add(action.code);
                for (const alias of action.aliases ?? []) this.dead.add(alias);
            }
        }
        for (const listener of this.listeners) listener();
    }

    // Kod, który gracz przypisał czynności ('forward' -> 'KeyW').
    codeOf(id) {
        const action = ACTION_BY_ID[id];
        return action ? this.custom[id] ?? action.code : null;
    }

    // Wciśnięty klawisz albo przycisk -> kod, o który pyta gra; null -
    // ten klawisz nic teraz nie robi. Nieprzypisane klawisze (Escape,
    // [ ], F8...) przechodzą bez zmian.
    logical(code) {
        const mapped = this.table.get(code);
        if (mapped !== undefined) return mapped;
        return this.dead.has(code) ? null : code;
    }

    // Czynność przypisana do kodu (do ekranu ustawień) albo null.
    actionAt(code) {
        return ACTIONS.find((action) => this.codeOf(action.id) === code) ?? null;
    }

    get changed() { return Object.keys(this.custom).length > 0; }

    // Przypisuje czynności nowy kod. Gdy kod jest zajęty, czynności
    // zamieniają się klawiszami (żadna nie zostaje bez klawisza).
    // Zwraca { ok, swapped: czynność | null, reason }; zapis do
    // przekazania ustawieniom jest w this.custom.
    assign(id, code) {
        const action = ACTION_BY_ID[id];
        if (!action) return { ok: false, swapped: null, reason: 'Nieznana czynność' };
        if (!bindable(code)) return { ok: false, swapped: null, reason: 'Tego klawisza nie da się przypisać' };
        const previous = this.codeOf(id);
        if (previous === code) return { ok: true, swapped: null, reason: null };
        const other = this.actionAt(code);
        const next = { ...this.custom, [id]: code };
        if (other) next[other.id] = previous;
        // Wpisy równe domyślnym znikają z zapisu.
        for (const entry of ACTIONS) if (next[entry.id] === entry.code) delete next[entry.id];
        this.load(next);
        return { ok: true, swapped: other, reason: null };
    }

    // Jedna czynność z powrotem na domyślny klawisz (z zamianą, gdy zajęty).
    restore(id) {
        const action = ACTION_BY_ID[id];
        return action ? this.assign(id, action.code) : { ok: false, swapped: null, reason: 'Nieznana czynność' };
    }

    reset() {
        this.load({});
    }

    // Krótka nazwa klawisza czynności do podpowiedzi: 'F', 'LPM',
    // 'Shift' (domyślne kucanie - działają oba Shifty).
    label(id) {
        const action = ACTION_BY_ID[id];
        if (!action) return '';
        const code = this.codeOf(id);
        return code === action.code && action.hint ? action.hint : keyLabel(code);
    }

    // Tekst z nazwami klawiszy: '{eat}' -> 'klawisz F', '{break}' ->
    // 'lewy przycisk myszy'; '[eat]' -> krótko: 'F', 'LPM'.
    format(text) {
        return String(text)
            .replace(/\{([a-z0-9]+)\}/g, (whole, id) => (ACTION_BY_ID[id] ? keySentence(this.codeOf(id)) : whole))
            .replace(/\[([a-z0-9]+)\]/g, (whole, id) => (ACTION_BY_ID[id] ? this.label(id) : whole));
    }

    // Gotowe napisy gry mówią "LPM" i "PPM" (kopanie i użycie). Gdy gracz
    // przypisał te czynności inaczej, podmieniamy skróty na jego klawisze
    // ('Dokładaj polana PPM' -> 'Dokładaj polana G').
    plain(text) {
        if (!('break' in this.custom) && !('use' in this.custom)) return text;
        return String(text)
            .replace(/(?<![\p{L}\d])LPM(?![\p{L}\d])/gu, () => this.label('break'))
            .replace(/(?<![\p{L}\d])PPM(?![\p{L}\d])/gu, () => this.label('use'));
    }
}

// Jedne przypisania na całą grę (main.js wczytuje je z ustawień).
export const bindings = new Bindings();

export function formatKeys(text) {
    return bindings.format(text);
}

export function plainKeys(text) {
    return bindings.plain(text);
}
