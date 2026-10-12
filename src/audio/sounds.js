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
//   category - 'blocks' (kroki, bloki) albo 'world' (zjawiska:
//              meteoryty) - każda ma swój suwak głośności,
//   loop     - dźwięk grany w pętli (aż się go zatrzyma),
//   distance - jak cichnie z odległością (w blokach): do "ref"
//              pełna głośność, dalej coraz ciszej (rolloff - jak
//              szybko), za "max" już nie cichnie bardziej.
//
// Dźwięki bloków: <rodzaj>_<materiał>, np. step_grass (krok),
// place_stone (postawienie), break_sand (zniszczenie). Który
// materiał ma blok - pole "sound" w BlockRegistry.js.
// ------------------------------------------------------------

export const BLOCK_MATERIALS = ['grass', 'dirt', 'stone', 'sand', 'gravel', 'mud', 'plant', 'glass'];

// Rodzaj dźwięku bloku: ile wersji (plików) i jak głośno.
const BLOCK_KINDS = {
    step: { variants: 4, volume: 0.45 },
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
            pitch: [0.88, 1.12],
            category: 'blocks',
            distance: BLOCK_DISTANCE
        };

    }

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
