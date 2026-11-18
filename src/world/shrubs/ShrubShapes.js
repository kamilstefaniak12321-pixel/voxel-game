// ------------------------------------------------------------
// SYLWETKI KRZEWÓW JAGODOWYCH (1.17.0)
//
// buildShrub(gatunek, odmiana, ziarno, rozmiar 0-1) układa krzew z bloków,
// tak jak warianty na podglądach z paczki Kamila:
//   rozmiar do 0,2   - a) pojedynczy blok,
//   do 0,5           - b) mały krzak (kilka bloków),
//   do 0,85          - c) dojrzały krzew (model główny),
//   wyżej            - d) stara, rozłożysta kępa.
//
// Rodzaje sylwetek (pole shape.kind gatunku - blocks/shrubs.js):
//   mound    - kopuła (porzeczka, agrest, borówka wysoka); agrest bywa
//              "pienny" - kula liści na krótkim pniu (shape.standard),
//   thicket  - niski, szeroki gąszcz o nierównym brzegu (malina, jeżyna),
//   arching  - szeroka kopuła z opadającymi brzegami (dzika róża),
//   upright  - prosty krzew na pędach (aronia): dołem pędy, wyżej liście,
//   tree     - wysoki krzew z pniem i koroną (bez, rokitnik, leszczyna;
//              shape.multi - kilka pni z jednej karpy).
//
// Wynik: { blocks: [[dx, dy, dz, typ]], rigid, reach, top }.
//   rigid false - każda kolumna stoi na swoim gruncie (dy liczone od
//                 ziemi w tej kolumnie - krzew układa się na stoku),
//   rigid true  - krzew z pniem: dy od podstawy pnia, pnie schodzą do ziemi.
// Zewnętrzne bloki liści niosą owoce, kwiaty albo niedojrzałe owoce
// (losowo), wewnętrzne są zwykłymi liśćmi.
// ------------------------------------------------------------

import { SHRUBS, shrubType } from '../../blocks/shrubs.js';

// Największy zasięg krzewu od środka (bloki) i największa wysokość.
export const SHRUB_REACH = 4;
export const SHRUB_MAX_HEIGHT = 8;

function generator(seed) {
    let state = (seed >>> 0) || 0x9e3779b9;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const lerp = (a, b, t) => a + (b - a) * t;

// Wysokość kolumny (dx, dz) kopuły o promieniu R i wysokości H.
function domeHeight(kind, dx, dz, R, H, random) {
    const d = Math.hypot(dx, dz) / Math.max(R, 0.5);
    if (kind === 'thicket') {
        // Płaski gąszcz: środek pełnej wysokości, brzeg postrzępiony.
        if (d > 1.15) return 0;
        const edge = d > 0.7 ? random() : 1;
        if (d > 1 && edge < 0.55) return 0;
        return Math.max(1, Math.round(H - (d > 0.55 ? 1 : 0) - (edge < 0.3 ? 1 : 0)));
    }
    if (d > 1.05) return 0;
    const curve = kind === 'arching' ? 1 - d ** 3 : Math.sqrt(Math.max(0, 1 - d * d));
    const height = H * curve + (random() - 0.5) * 0.7;
    return d <= 1 ? Math.max(1, Math.round(height)) : height > 0.9 ? 1 : 0;
}

export function buildShrub(species, variety = 0, seed = 1, size = 0.5) {

    const shrub = SHRUBS[species];
    const shape = shrub.shape;
    const random = generator(seed);
    const s = Math.min(1, Math.max(0, size));

    const leaves = shrubType(species, 'leaves');
    const fruit = shrubType(species, 'fruit', variety);
    const flower = shrub.flower ? shrubType(species, 'flower', variety) : null;
    const unripe = shrub.unripe ? shrubType(species, 'unripe', variety) : null;
    const stem = shrub.stem ? shrubType(species, 'stem') : null;

    // Komórki: klucz "dx,dy,dz" -> 'L' (liście) albo 'S' (pęd / pień).
    const cells = new Map();
    const put = (dx, dy, dz, kind) => {
        if (dy < 0 || dy >= SHRUB_MAX_HEIGHT || Math.abs(dx) > SHRUB_REACH || Math.abs(dz) > SHRUB_REACH) return;
        const key = `${dx},${dy},${dz}`;
        if (kind === 'S' || !cells.has(key)) cells.set(key, kind);
    };

    let rigid = false;

    if (s < 0.2) {
        // a) Pojedynczy blok.
        put(0, 0, 0, 'L');
    }
    else {

        const t = (s - 0.2) / 0.8;
        const H = Math.max(1, Math.round(lerp(shape.height[0], shape.height[1], t)));
        const R = lerp(shape.radius[0], shape.radius[1], t);
        const span = Math.ceil(R);
        const tall = shape.kind === 'tree' && H >= 3;
        const standard = shape.standard && s >= 0.5 && s < 0.85 && random() < shape.standard * 3;

        if (tall) {

            // Pień (albo kilka pni z jednej karpy) i korona nad nim.
            rigid = true;
            const trunk = Math.max(1, H - Math.max(2, Math.round(H * 0.55)));
            const trunks = shape.multi && H >= 4 ? [[0, 0], [random() < 0.5 ? 1 : -1, 0], [0, random() < 0.5 ? 1 : -1]].slice(0, 2 + (random() < 0.5 ? 1 : 0)) : [[0, 0]];
            for (const [tx, tz] of trunks) {
                const height = trunk + (tx || tz ? -Math.round(random()) : 0);
                for (let y = 0; y < Math.max(1, height); y++) put(tx, y, tz, 'S');
            }
            const crown = H - trunk;
            for (let dx = -span; dx <= span; dx++) for (let dz = -span; dz <= span; dz++) {
                const d = Math.hypot(dx, dz) / R;
                if (d > 1.05) continue;
                // Korona: soczewka - najgrubsza w środku, cienka na brzegu.
                const thick = crown * Math.sqrt(Math.max(0, 1 - d * d)) + (random() - 0.5) * 0.8;
                const up = Math.max(d <= 0.75 ? 1 : 0, Math.round(thick));
                const droop = d > 0.6 && random() < 0.4 ? 1 : 0;
                for (let k = 0; k < up; k++) put(dx, trunk + k - droop, dz, 'L');
            }

        }
        else if (standard) {

            // Forma pienna: kula liści na krótkim pniu.
            rigid = true;
            put(0, 0, 0, 'S');
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
                if (dx && dz && random() < 0.5) continue;
                put(dx, 1, dz, 'L');
            }
            put(0, 2, 0, 'L');

        }
        else {

            const kind = shape.kind === 'tree' ? 'mound' : shape.kind;
            for (let dx = -span; dx <= span; dx++) for (let dz = -span; dz <= span; dz++) {
                const height = dx === 0 && dz === 0
                    ? Math.max(1, H)
                    : domeHeight(kind, dx, dz, R, H, random);
                for (let y = 0; y < height; y++) {
                    // Aronia: w środku dojrzałego krzewu dołem widać pędy.
                    const legs = shape.legs && H >= 2 && y < shape.legs && Math.hypot(dx, dz) <= R * 0.75;
                    put(dx, y, dz, legs ? 'S' : 'L');
                }
            }

        }

    }

    // Typy bloków: zewnętrzne liście z owocami / kwiatami.
    const blocks = [];
    let top = 0, reach = 0;
    const has = (dx, dy, dz) => cells.has(`${dx},${dy},${dz}`);

    for (const [key, kind] of cells) {
        const [dx, dy, dz] = key.split(',').map(Number);
        top = Math.max(top, dy);
        reach = Math.max(reach, Math.abs(dx), Math.abs(dz));
        if (kind === 'S') {
            blocks.push([dx, dy, dz, stem ?? leaves]);
            continue;
        }
        const outer = !has(dx, dy + 1, dz) || !has(dx + 1, dy, dz) || !has(dx - 1, dy, dz) || !has(dx, dy, dz + 1) || !has(dx, dy, dz - 1);
        let type = leaves;
        if (outer) {
            const roll = random();
            const single = cells.size === 1;
            if (roll < (single ? 0.75 : shape.fruit)) type = fruit;
            else if (flower && roll < shape.fruit + 0.14) type = flower;
            else if (unripe && roll < shape.fruit + 0.26) type = unripe;
        }
        blocks.push([dx, dy, dz, type]);
    }

    // Stała kolejność (ta sama w każdym chunku): od dołu, pnie przed liśćmi.
    blocks.sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);

    return { blocks, rigid, reach, top };

}
