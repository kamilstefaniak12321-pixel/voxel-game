import { PLANT_PACKS } from './plantPacks.js';
import { SEASON_DAYS, YEAR_DAYS, yearPosition, seasonAt } from '../sky/Seasons.js';

// ------------------------------------------------------------
// KWIATY I PORY ROKU (1.4.0) - pomysł Kamila. Opis: docs/pory-roku.md.
//
// Roślina z paczki z polem "pory" (assets/rosliny/<roślina>/roslina.json)
// rośnie w świecie cały rok, ale pąki i kwiaty pokazuje tylko w swoich
// porach. Poza nimi widać ją jako pierwszy etap - same liście.
//
// Blok się NIE zmienia (w zapisie i w świecie dalej jest np. "zawilec
// kwitnie") - zmienia się to, co gra pokazuje i na co pozwala:
//   shownPlantId   - jaki etap widać teraz w danym miejscu (rysowanie,
//                    celownik, nazwa, zbiór),
//   plantGrowthFactor - tempo wzrostu: w porze szybciej (wzrostWPorze),
//                    poza porą roślina odpoczywa (nie rośnie),
//   nextPlantChange - kiedy wygląd zmieni się następnym razem (żeby
//                    przebudować chunk dokładnie wtedy, a nie co chwilę).
//
// Żeby łąka nie zmieniała się cała w jednej chwili, każda roślina ma
// własny termin (z jej miejsca w świecie): budzi się w ciągu pierwszych
// WAKE_DAYS pory, przez BUD_DAYS pokazuje pąki, potem kwitnie; zasypia
// w ciągu ostatnich SLEEP_DAYS swojej ostatniej pory.
// ------------------------------------------------------------

export const WAKE_DAYS = 1.5;
export const BUD_DAYS = 0.5;
export const SLEEP_DAYS = 1.5;

const mod = (value, size) => ((value % size) + size) % size;

// Ciągłe okresy z listy pór (np. [1, 2] - jeden okres lato-jesień;
// [0, 3] - jeden okres zima-wiosna przez koniec roku).
function runsOf(seasons) {

    const has = (index) => seasons.includes(mod(index, 4));
    const runs = [];

    for (const season of seasons) {

        if (has(season - 1)) continue;

        let length = 1;

        while (length < 4 && has(season + length)) length++;

        runs.push({ start: season * SEASON_DAYS, length: length * SEASON_DAYS });

    }

    return runs;

}

// id bloku -> { firstId, stage, last, runs, boost, seasons } (tylko
// rośliny z porami); SEASONAL[id] = 1 dla szybkiego sprawdzenia.
const INFO = new Map();

let maxId = 0;

for (const pack of PLANT_PACKS) {

    if (!pack.seasons) continue;

    const runs = runsOf(pack.seasons);

    pack.stages.forEach((_, stage) => {
        INFO.set(pack.firstId + stage, { pack: pack.id, firstId: pack.firstId, stage, last: pack.stages.length - 1, runs, boost: pack.seasonBoost, seasons: pack.seasons });
        maxId = Math.max(maxId, pack.firstId + stage);
    });

}

export const SEASONAL = new Uint8Array(maxId + 1);

for (const id of INFO.keys()) SEASONAL[id] = 1;

export const isSeasonalPlant = (id) => id <= maxId && SEASONAL[id] === 1;

export const plantSeasonInfo = (id) => INFO.get(id) ?? null;


// Dwa losy rośliny z jej miejsca (0..1): kiedy się budzi i kiedy zasypia.

function place(x, y, z, salt) {
    let h = Math.imul(x, 1274126177) ^ Math.imul(y, 362437) ^ Math.imul(z, 2654435761) ^ Math.imul(salt, 974711);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Terminy rośliny w okresie (doby od początku okresu): pobudka, koniec
// pąków, zaśnięcie.
function terms(run, x, y, z, out) {
    const spread = Math.min(WAKE_DAYS, run.length / 4);
    out[0] = place(x, y, z, 1) * spread;
    out[1] = out[0] + BUD_DAYS;
    out[2] = run.length - place(x, y, z, 2) * Math.min(SLEEP_DAYS, run.length / 4);
    return out;
}

const scratch = [0, 0, 0];


// Najwyższy etap, jaki roślina teraz pokazuje: 0 - same liście,
// 1 - pąki (tuż po pobudce), info.last - wszystko.

export function plantSeasonLevel(info, x, y, z, days) {

    const position = yearPosition(days);

    for (const run of info.runs) {

        const inside = mod(position - run.start, YEAR_DAYS);

        if (inside >= run.length) continue;

        const [wake, buds, sleep] = terms(run, x, y, z, scratch);

        if (inside < wake || inside >= sleep) return 0;

        return inside < buds ? 1 : info.last;

    }

    return 0;

}


// Numer bloku, który widać w miejscu (x, y, z) w chwili `days` -
// ten sam albo niższy etap tej samej rośliny.

export function shownPlantId(id, x, y, z, days) {

    const info = INFO.get(id);

    if (!info || info.stage === 0) return id;

    const level = plantSeasonLevel(info, x, y, z, days);

    return level >= info.stage ? id : info.firstId + level;

}


// Czas gry (doby) najbliższej zmiany wyglądu tej rośliny po `days`
// (Infinity - nigdy: pierwszy etap wygląda zawsze tak samo).

export function nextPlantChange(id, x, y, z, days) {

    const info = INFO.get(id);

    if (!info || info.stage === 0) return Infinity;

    const position = yearPosition(days);

    let next = Infinity;

    for (const run of info.runs) {

        const begin = days - mod(position - run.start, YEAR_DAYS);
        const [wake, buds, sleep] = terms(run, x, y, z, scratch);

        for (const year of [0, YEAR_DAYS]) {
            for (const term of [wake, buds, sleep]) {
                const time = begin + year + term;
                if (time > days + 1e-9 && time < next) next = time;
            }
        }

    }

    return next;

}


// Tempo wzrostu rośliny w chwili `days`: w jej porze `boost` razy
// szybciej, poza porą 0 (odpoczywa). Roślina bez pór: 1.

export function plantGrowthFactor(id, days) {

    const info = INFO.get(id);

    if (!info) return 1;

    return info.seasons.includes(seasonAt(days).index) ? info.boost : 0;

}
