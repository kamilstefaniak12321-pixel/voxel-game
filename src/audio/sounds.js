// ------------------------------------------------------------
// LISTA DŹWIĘKÓW
//
// Pliki są w assets/sounds/ (.ogg). Zrobił je tools/dzwieki.py, ale
// każdy można podmienić własnym nagraniem o tej samej nazwie.
//
// Pola dźwięku:
//   files    - pliki (przy każdym odtworzeniu gra losuje jeden),
//   volume   - głośność 0-1 (mnożona przez ustawienia głośności),
//   pitch    - [min, max]: losowa wysokość (1 = bez zmian), żeby
//              powtarzane kroki nie brzmiały identycznie,
//   category - 'blocks' (kroki, bloki, zbieranie owoców, pływanie),
//              'world' (otoczenie: fale, pod wodą, meteoryty) albo
//              'ui' (menu, ekwipunek) -
//              każda ma swój suwak głośności. Dźwięki 'ui' grają też
//              w menu i w pauzie (src/audio/ui.js), pozostałe tylko
//              w grze,
//   loop     - dźwięk grany w pętli (aż się go zatrzyma),
//   distance - jak cichnie z odległością (w blokach): do "ref"
//              pełna głośność, dalej coraz ciszej (rolloff - jak
//              szybko), za "max" już nie cichnie bardziej.
//
// Dźwięki bloków: <rodzaj>_<materiał>, np. step_grass (krok),
// place_stone (postawienie), break_sand (zniszczenie). Który
// materiał ma blok - pole "sound" w BlockRegistry.js.
// ------------------------------------------------------------

export const BLOCK_MATERIALS = ['grass', 'dirt', 'stone', 'sand', 'gravel', 'mud', 'plant', 'glass', 'wood', 'snow'];

// Rodzaj dźwięku bloku: ile wersji (plików) i jak głośno. Dźwięki
// bloków są miękkie i ciche (tło, nie mają zwracać uwagi) - kroków jest
// 6 wersji, żeby się nie powtarzały.
const BLOCK_KINDS = {
    step: { variants: 6, volume: 0.45 },
    place: { variants: 3, volume: 0.8 },
    break: { variants: 3, volume: 0.9 }
};

const BLOCK_DISTANCE = { ref: 4, max: 48, rolloff: 1 };


export const SOUNDS = {};


for (const material of BLOCK_MATERIALS) {

    for (const [kind, { variants, volume }] of Object.entries(BLOCK_KINDS)) {

        SOUNDS[`${kind}_${material}`] = {
            files: Array.from({ length: variants }, (_, i) => `blocks/${kind}_${material}_${i + 1}.ogg`),
            volume,
            pitch: [0.92, 1.08],
            category: 'blocks',
            distance: BLOCK_DISTANCE
        };

    }

}


// Zbieranie owoców z krzaka (PPM - game/Game.js).

SOUNDS.harvest = {
    files: ['blocks/harvest_1.ogg', 'blocks/harvest_2.ogg', 'blocks/harvest_3.ogg'],
    volume: 0.9,
    pitch: [0.9, 1.1],
    category: 'blocks',
    distance: BLOCK_DISTANCE
};


// Woda (game/Game.js - updateWaterSounds): plusk przy wpadnięciu,
// ruchy w wodzie, kroki w płytkiej wodzie, krople przy wychodzeniu.

const WATER_SOUNDS = {
    water_splash: { variants: 3, volume: 0.9 },
    water_swim: { variants: 4, volume: 0.6 },
    water_wade: { variants: 4, volume: 0.55 },
    water_exit: { variants: 2, volume: 0.6 }
};

for (const [name, { variants, volume }] of Object.entries(WATER_SOUNDS)) {

    SOUNDS[name] = {
        files: Array.from({ length: variants }, (_, i) => `water/${name}_${i + 1}.ogg`),
        volume,
        pitch: [0.9, 1.1],
        category: 'blocks',
        distance: BLOCK_DISTANCE
    };

}

Object.assign(SOUNDS, {

    // Pod wodą - pętla (gdy kamera jest pod wodą; reszta dźwięków
    // gry jest wtedy przytłumiona - SoundManager.setUnderwater).
    water_underwater: {
        files: ['water/water_underwater.ogg'],
        volume: 0.7,
        category: 'world',
        loop: true
    },

    // Fale przy brzegu - pętla, z miejsca, gdzie jest woda (tym
    // głośniej, im więcej wody dookoła).
    water_waves: {
        files: ['water/water_waves.ogg'],
        volume: 0.8,
        category: 'world',
        loop: true,
        distance: { ref: 6, max: 64, rolloff: 1 }
    }

});


// Menu i ekwipunek (src/audio/ui.js) - bez miejsca w świecie.

const UI_SOUNDS = {
    ui_click: { volume: 0.8, pitch: [0.97, 1.03] },     // przycisk
    ui_slider: { volume: 0.7 },                          // krok suwaka
    ui_open: { volume: 0.8, pitch: [0.95, 1.05] },      // otwarcie ekwipunku
    ui_close: { volume: 0.8, pitch: [0.95, 1.05] },     // zamknięcie
    item_pick: { volume: 0.8, pitch: [0.95, 1.05] },    // wzięcie stosu
    item_place: { volume: 0.8, pitch: [0.95, 1.05] },   // odłożenie
    item_trash: { volume: 0.8, pitch: [0.95, 1.05] },   // kosz
    item_craft: { volume: 0.8, pitch: [0.97, 1.03] },   // wzięcie wyrobu (crafting)
    ui_error: { volume: 0.8 },                           // błąd (np. komendy)

    // Zdobyte osiągnięcie (src/achievements/) - im rzadsze, tym
    // bogatsza melodyjka.
    achievement_common: { volume: 0.9 },
    achievement_rare: { volume: 0.9 },
    achievement_epic: { volume: 0.9 },
    achievement_legendary: { volume: 1 }
};

for (const [name, sound] of Object.entries(UI_SOUNDS)) {

    SOUNDS[name] = {
        files: [`ui/${name}.ogg`],
        category: 'ui',
        ...sound
    };

}


// Meteoryt (game/Meteorites.js).

Object.assign(SOUNDS, {

    // Huk lecącej kuli ognia - pętla, coraz głośniejsza i wyższa.
    meteor_flight: {
        files: ['meteor/meteor_flight.ogg'],
        volume: 1,
        category: 'world',
        loop: true,
        distance: { ref: 40, max: 4000, rolloff: 1 }
    },

    // Uderzenie - słychać je później niż widać błysk (dźwięk leci
    // 343 bloki na sekundę).
    meteor_impact: {
        files: ['meteor/meteor_impact.ogg'],
        volume: 1,
        category: 'world',
        distance: { ref: 35, max: 4000, rolloff: 0.7 }
    },

    // Spadające odłamki zaraz po uderzeniu.
    meteor_debris: {
        files: ['meteor/meteor_debris.ogg'],
        volume: 0.8,
        category: 'world',
        distance: { ref: 10, max: 300, rolloff: 1 }
    },

    // Trzaskający żar w kraterze - pętla, cichnie z czasem.
    fire_crackle: {
        files: ['meteor/fire_crackle.ogg'],
        volume: 0.9,
        category: 'world',
        loop: true,
        distance: { ref: 10, max: 160, rolloff: 1 }
    }

});


// Kosmos - sekret (src/space/).

Object.assign(SOUNDS, {

    // W kosmosie - cichy pomruk (pętla, tym głośniej, im wyżej).
    space_ambient: {
        files: ['space/space_ambient.ogg'],
        volume: 0.6,
        category: 'world',
        loop: true
    },

    // Pęd powietrza przy spadaniu z kosmosu (pętla, głośniej przy
    // większej prędkości; razem z rykiem ognia - meteor_flight).
    skyfall_wind: {
        files: ['space/skyfall_wind.ogg'],
        volume: 0.8,
        category: 'world',
        loop: true
    },

    // Zapłon przy wejściu w atmosferę.
    skyfall_ignite: {
        files: ['space/skyfall_ignite.ogg'],
        volume: 0.9,
        category: 'world'
    }

});
