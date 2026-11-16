import * as THREE from 'three';
import { seasonAt, seasonWeights } from '../sky/Seasons.js';
import { GRASS_TINT_UNIT } from '../config.js';

// ------------------------------------------------------------
// LIŚCIE I PORY ROKU (1.10.0, prośba Kamila). Opis: docs/pory-roku.md.
//
// Blok liści się nie zmienia - zmienia się tylko kolor, który liczy
// shader bloków z jednej liczby: "fazy roku" (0 = początek wiosny,
// 1 = lata, 2 = jesieni, 3 = zimy; uLeafPhase). Dlatego zmiana pory nie
// przebudowuje żadnego chunka.
//
//   wiosna i lato  - liście jak w teksturze (zabarwione klimatem biomu),
//   jesień         - zielone piksele przechodzą w kolor gatunku (paleta);
//                    im dalej w jesień, tym mocniej,
//   zima           - liście szarzeją, a na wierzchu leży cienki śnieg,
//   przedwiośnie   - szarość schodzi w pierwszych dniach wiosny.
//
// Każde miejsce ma własne przesunięcie terminu (gładki szum po świecie),
// więc las nie zmienia się cały naraz, a korony mienią się kolorami.
//
// Siatka chunka podaje w atrybucie "tint" (ChunkMesher.writeLeafTint):
//   r g b - kolor liści z klimatu biomu (złagodzony kolor trawy),
//   a     - kod liścia: LEAF_CODE_FIRST + paleta * 8 + śnieg (0-3) * 2
//           + 1 dla opadłych liści; zwykłe bloki mają tu 0, 128 albo 255.
// ------------------------------------------------------------

// Palety: color - kolor jesieni (sRGB), change - ile liść zmienia się
// jesienią (0 - wcale), winter - ile szarzeje zimą.
//
// Palety z "light" są dla liści, których TEKSTURA jest już jesienna
// (czerwony klon i złoty miłorząb z paczek Kamila, złote odmiany modrzewia
// i osiki): jesienią widać samą teksturę, a wiosną i latem liść jest
// zielony - color to wtedy kolor lata, light - średnia jasność tekstury
// (liniowo), do której odnosi się jej rysunek. Zmieniają się wszystkie
// piksele, nie tylko zielone.
export const LEAF_PALETTES = [
    { key: 'iglaste', color: [70, 110, 60], change: 0, winter: 0.25 },
    { key: 'zimozielone', color: [70, 120, 50], change: 0, winter: 0 },
    { key: 'zolty', color: [228, 190, 54], change: 1, winter: 1 },
    { key: 'zloty', color: [230, 164, 40], change: 1, winter: 1 },
    { key: 'pomaranczowy', color: [224, 122, 38], change: 1, winter: 1 },
    { key: 'czerwony', color: [200, 58, 40], change: 1, winter: 1 },
    { key: 'miedziany', color: [182, 100, 44], change: 1, winter: 1 },
    { key: 'brazowy', color: [156, 106, 54], change: 1, winter: 1 },
    { key: 'rdzawy', color: [182, 90, 40], change: 1, winter: 1 },
    // Drzewa suchych stron: jesienią płowieją, zimą nie szarzeją.
    { key: 'plowy', color: [196, 170, 84], change: 0.55, winter: 0.2 },
    { key: 'klon', color: [62, 108, 40], change: 1, winter: 1, light: 0.22 },
    { key: 'milorzab', color: [88, 130, 50], change: 1, winter: 1, light: 0.6 },
    { key: 'zlota-odmiana', color: [100, 134, 56], change: 1, winter: 1, light: 0.38 }
];

export const LEAF_PALETTE_LIMIT = 14;
export const LEAF_CODE_FIRST = 8;

// Gatunek -> paleta. Iglaki i drzewa tropików zostają zielone; modrzew
// i cypryśnik to iglaki, które zrzucają igły.
const SPECIES_PALETTE = {
    spruce: 'iglaste', pine: 'iglaste', mugo: 'iglaste', sequoia: 'iglaste', fir: 'iglaste',
    araucaria: 'iglaste', cedar: 'iglaste', bristlecone: 'iglaste',
    olive: 'zimozielone', rainbow_eucalyptus: 'zimozielone', jacaranda: 'zimozielone', coconut_palm: 'zimozielone',
    mangrove: 'zimozielone', kapok: 'zimozielone', joshua_tree: 'zimozielone', banyan: 'zimozielone', dragon_tree: 'zimozielone',
    birch: 'zolty', linden: 'zolty', wierzba: 'zolty', ginkgo: 'milorzab', aspen: 'zolty',
    larch: 'zloty', olcha: 'brazowy', oak: 'brazowy',
    jablon: 'pomaranczowy', cherry: 'pomaranczowy', maple: 'klon', beech: 'miedziany', bald_cypress: 'rdzawy',
    acacia: 'plowy', baobab: 'plowy'
};

// Opadłe liście gatunków z jesienną teksturą: zwykła paleta jesieni.
const LITTER_PALETTE = { maple: 'czerwony', ginkgo: 'zolty' };

const paletteIndex = new Map(LEAF_PALETTES.map((palette, index) => [palette.key, index]));

// autumn - blok liści ze stale jesienną teksturą u gatunku, który zwykle
// ma zielone liście (złota odmiana modrzewia i osiki - pole "autumn"
// odmiany w katalogu drzew).
export function leafPaletteIndex(species, litter = false, autumn = false) {
    const key = SPECIES_PALETTE[species] ?? 'zolty';
    if (litter) return paletteIndex.get(LITTER_PALETTE[species] ?? key);
    return paletteIndex.get(autumn && !LEAF_PALETTES[paletteIndex.get(key)].light ? 'zlota-odmiana' : key);
}

// Kod liścia w atrybucie tint (bez śniegu - dopisuje go siatka chunka).
export function leafCode(species, litter = false, autumn = false) {
    return LEAF_CODE_FIRST + leafPaletteIndex(species, litter, autumn) * 8 + (litter ? 1 : 0);
}


// Kolor liści z klimatu: złagodzony kolor trawy (bajt chunk.tint ->
// bajt atrybutu). Na sawannie liście płowieją, w mokrych biomach
// ciemnieją - słabiej niż trawa.
export const LEAF_TINT_SOFTNESS = 0.35;
export const LEAF_TINT_BYTES = Uint8Array.from({ length: 256 }, (_, byte) =>
    Math.min(255, Math.round((byte / GRASS_TINT_UNIT) ** LEAF_TINT_SOFTNESS * GRASS_TINT_UNIT)));


const linear = (value) => (value / 255) ** 2.2;
const toLinear = (color) => new THREE.Vector3(linear(color[0]), linear(color[1]), linear(color[2]));

// Jasność przeciętnego piksela liści (liniowo) - do niej odnosi się
// rysunek tekstury, gdy zmienia się jej barwa.
export const LEAF_LUMINANCE = 0.13;
// Opadłe liście mają w teksturach bardzo różną jasność (olcha 0,07,
// osika 0,5) - ich rysunek odnosi się do tej jasności, a pierwiastek
// zbliża ciemne do jasnych.
export const LITTER_LUMINANCE = 0.26;
// Zima: szarobrązowe liście; opadłe liście poza jesienią: zbrązowiałe.
const GREY = [134, 124, 112], LITTER_BROWN = [128, 92, 56], SNOW = [238, 242, 248];
// Terminy w fazie roku (pora = 1): jesień narasta od 2,0 do 2,6, szarość
// od 2,8 do 3,2, wiosną schodzi do 0,35. Największy śnieg: połowa pikseli
// wierzchu (cienka warstwa - liść spod niej prześwituje).
export const LEAF_TIMES = { turn: [2.0, 2.6], grey: [2.8, 3.2], fade: 0.35, bud: 0.4, shift: 0.3, snow: 0.5 };

const pad = (list, make) => Array.from({ length: LEAF_PALETTE_LIMIT }, (_, i) => make(list[Math.min(i, list.length - 1)]));

export const leafSeasonUniforms = {
    uLeafAutumn: { value: pad(LEAF_PALETTES, (palette) => toLinear(palette.color)) },
    // (zmiana jesienią, szarość zimą, jasność jesiennej tekstury albo 0).
    uLeafRule: { value: pad(LEAF_PALETTES, (palette) => new THREE.Vector3(palette.change, palette.winter, palette.light ?? 0)) },
    uLeafGrey: { value: toLinear(GREY) },
    uLitterBrown: { value: toLinear(LITTER_BROWN) },
    uLeafSnowColor: { value: toLinear(SNOW) },
    // Faza roku 0-4, siła pór (0 - świat bez pór roku) i śnieg 0-1.
    uLeafPhase: { value: 1.5 },
    uLeafSeason: { value: 0 },
    uLeafSnow: { value: 0 }
};

// Faza roku z czasu gry (doby): numer pory + jej postęp.
export function leafPhase(days) {
    const season = seasonAt(days);
    return season.index + season.progress;
}

// Śnieg na liściach 0-1: zimą, z łagodnym początkiem i końcem.
export function leafSnow(days) {
    return seasonWeights(days, 2)[3];
}

// Ustawia porę dla wszystkich liści (co klatkę - Game.updateSeason);
// days === null: świat bez pór roku - liście jak dawniej.
export function setLeafSeason(days) {
    const on = days !== null && days !== undefined;
    leafSeasonUniforms.uLeafSeason.value = on ? 1 : 0;
    leafSeasonUniforms.uLeafPhase.value = on ? leafPhase(days) : 1.5;
    leafSeasonUniforms.uLeafSnow.value = on ? leafSnow(days) : 0;
}


const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

// Ile jesieni (turn) i szarości (grey) w fazie roku - ten sam rachunek
// co w shaderze.
export function leafStage(phase) {
    const p = ((phase % 4) + 4) % 4;
    // Przedwiośnie: spod szarości wychodzi od razu zieleń, nie jesień -
    // kolor jesieni znika pod szarością w pierwszych dniach wiosny.
    return {
        turn: Math.max(smooth(LEAF_TIMES.turn[0], LEAF_TIMES.turn[1], p), 1 - smooth(0, LEAF_TIMES.fade * LEAF_TIMES.bud, p)),
        grey: Math.max(smooth(LEAF_TIMES.grey[0], LEAF_TIMES.grey[1], p), 1 - smooth(0, LEAF_TIMES.fade, p))
    };
}

// Faza roku skokami - dla dalekiego terenu, który ma kolory koron
// zapisane w siatkach i przebudowuje je tylko przy zmianie tej liczby
// (FarTerrain.setLeafSeason): po cztery kroki na jesień, szarzenie
// i przedwiośnie, czyli kilkanaście przebudów na rok gry.
export function leafSeasonStep(days) {
    const p = leafPhase(days), { turn, grey, fade } = LEAF_TIMES;
    const snap = (from, to, low, high) => {
        const step = Math.round((p - from) / (to - from) * 4);
        return step <= 0 ? low : step >= 4 ? high : from + (to - from) * step / 4;
    };
    if (p < fade) return snap(0, fade, 3.5, 1.5);
    if (p < turn[0]) return 1.5;
    if (p < turn[1]) return snap(turn[0], turn[1], 1.5, turn[1]);
    if (p < grey[0]) return turn[1];
    if (p < grey[1]) return snap(grey[0], grey[1], turn[1], 3.5);
    return 3.5;
}

// Kolor liścia gatunku w danej fazie roku (liniowy THREE.Color -> out):
// to samo co shader, dla spadających liści i testów. Zmienia tylko
// zielone piksele (litter: wszystkie; whole: też wszystkie - dla średniego
// koloru całej korony w dalekim terenie).
export function seasonLeafColor(color, species, phase, out = new THREE.Color(), litter = false, whole = false, autumn = false) {
    const index = leafPaletteIndex(species, litter, autumn), palette = LEAF_PALETTES[index];
    const { turn, grey } = leafStage(phase);
    const texture = !litter && Boolean(palette.light);
    const green = color.g - Math.max(color.r, color.b);
    const mask = litter || whole || texture ? 1 : smooth(0.01, 0.07, green);
    const light = 0.3 * color.r + 0.59 * color.g + 0.11 * color.b;
    const lum = litter ? Math.min(1.5, Math.max(0.55, Math.sqrt(light / LITTER_LUMINANCE)))
        : Math.min(1.9, Math.max(0.35, light / (texture ? palette.light : LEAF_LUMINANCE)));
    const tone = leafSeasonUniforms.uLeafAutumn.value[index];
    const greyColor = leafSeasonUniforms.uLeafGrey.value, brown = leafSeasonUniforms.uLitterBrown.value;
    const channel = (value, k) => {
        const paint = tone.getComponent(k) * lum;
        // Lato: tekstura (opadłe liście - brąz; jesienna tekstura - zieleń).
        let base = litter ? brown.getComponent(k) * lum : texture ? paint : value;
        // Jesień: kolor palety (jesienna tekstura - ona sama).
        base += ((texture ? value : paint) - base) * turn * (litter ? 1 : palette.change);
        base += (greyColor.getComponent(k) * lum - base) * grey * (litter ? 1 : palette.winter);
        return value + (base - value) * mask;
    };
    return out.setRGB(channel(color.r, 0), channel(color.g, 1), channel(color.b, 2));
}


// --- Shader bloków (BlockRenderData.js) ----------------------------------------

export const LEAF_HASH_GLSL = `
    float leafHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }`;

export const LEAF_VERTEX_PARS_GLSL = `
    #ifdef LEAF_SEASONS
        varying vec4 vLeaf;
        varying vec4 vLeafColor;
        uniform vec3 uLeafAutumn[${LEAF_PALETTE_LIMIT}];
        uniform vec3 uLeafRule[${LEAF_PALETTE_LIMIT}];
        ${LEAF_HASH_GLSL}
        // Przesunięcie terminu: gładki szum po świecie (ok. 9 bloków).
        float leafShift(vec2 p) {
            p *= 0.11;
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return (mix(mix(leafHash(i), leafHash(i + vec2(1.0, 0.0)), f.x),
                mix(leafHash(i + vec2(0.0, 1.0)), leafHash(i + vec2(1.0, 1.0)), f.x), f.y) - 0.5) * ${LEAF_TIMES.shift.toFixed(2)};
        }
    #endif`;

// Po obliczeniu vTint; "transformed" i "normal" to dane wierzchołka.
export const LEAF_VERTEX_GLSL = `
    #ifdef LEAF_SEASONS
        float leafCode = floor(tint.a * 255.0 + 0.5);
        if (leafCode >= ${LEAF_CODE_FIRST}.0 && leafCode < 127.0) {
            float leafBits = leafCode - ${LEAF_CODE_FIRST}.0;
            int leafPalette = int(floor(leafBits / 8.0));
            vec3 leafWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
            // x: 1 + szarość zimą (+ 4 - jesienna tekstura), y: śnieg (tylko
            // ściany do góry), z: przesunięcie terminu, w: opadłe liście.
            // Kolor: paleta i zmiana jesienią (jesienna tekstura: jej jasność).
            vec3 leafRule = uLeafRule[leafPalette];
            vLeaf = vec4(1.0 + leafRule.y + (leafRule.z > 0.0 ? 4.0 : 0.0), mod(floor(leafBits / 2.0), 4.0) / 3.0 * max(normal.y, 0.0),
                leafShift(leafWorld.xz), mod(leafBits, 2.0));
            vLeafColor = vec4(uLeafAutumn[leafPalette], leafRule.z > 0.0 ? leafRule.z : leafRule.x);
        }
        else {
            vLeaf = vec4(0.0);
            vLeafColor = vec4(0.0);
        }
    #endif`;

export const LEAF_FRAGMENT_PARS_GLSL = `
    #ifdef LEAF_SEASONS
        varying vec4 vLeaf;
        varying vec4 vLeafColor;
        uniform vec3 uLeafGrey;
        uniform vec3 uLitterBrown;
        uniform vec3 uLeafSnowColor;
        uniform float uLeafPhase;
        uniform float uLeafSeason;
        uniform float uLeafSnow;
        ${LEAF_HASH_GLSL}
    #endif`;

// Po zabarwieniu klimatem; tintMask - zielone piksele tekstury.
export const LEAF_FRAGMENT_GLSL = `
    #ifdef LEAF_SEASONS
        if (vLeaf.x > 0.5 && uLeafSeason > 0.0) {
            float leafPhase = mod(uLeafPhase + vLeaf.z + 4.0, 4.0);
            // Przedwiośnie: spod szarości wychodzi od razu zieleń (jesień
            // znika pod nią szybciej).
            float leafTurn = max(smoothstep(${LEAF_TIMES.turn[0].toFixed(2)}, ${LEAF_TIMES.turn[1].toFixed(2)}, leafPhase),
                1.0 - smoothstep(0.0, ${(LEAF_TIMES.fade * LEAF_TIMES.bud).toFixed(3)}, leafPhase));
            float leafGrey = max(smoothstep(${LEAF_TIMES.grey[0].toFixed(2)}, ${LEAF_TIMES.grey[1].toFixed(2)}, leafPhase),
                1.0 - smoothstep(0.0, ${LEAF_TIMES.fade.toFixed(2)}, leafPhase));
            // Jesienna tekstura (klon, miłorząb, złote odmiany): latem zieleń
            // palety, jesienią sama tekstura; zmieniają się wszystkie piksele.
            float leafTexture = step(3.0, vLeaf.x);
            float leafWinter = vLeaf.x - 1.0 - 4.0 * leafTexture;
            float leafChange = mix(vLeafColor.a, 1.0, leafTexture);
            float leafLight = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            float leafLum = vLeaf.w > 0.5 ? clamp(sqrt(leafLight / ${LITTER_LUMINANCE.toFixed(2)}), 0.55, 1.5)
                : clamp(leafLight / mix(${LEAF_LUMINANCE.toFixed(2)}, vLeafColor.a, leafTexture), 0.35, 1.9);
            vec3 leafPaint = vLeafColor.rgb * leafLum;
            // Lato: tekstura; opadłe liście - zbrązowiałe; jesienna tekstura -
            // zieleń (z kolorem klimatu biomu, którego czerwony piksel nie dostał).
            vec3 leafColor = mix(diffuseColor.rgb, uLitterBrown * leafLum, vLeaf.w);
            leafColor = mix(leafColor, leafPaint * vTint.rgb, leafTexture);
            leafColor = mix(leafColor, mix(leafPaint, diffuseColor.rgb, leafTexture), leafTurn * mix(leafChange, 1.0, vLeaf.w));
            leafColor = mix(leafColor, uLeafGrey * leafLum, leafGrey * mix(leafWinter, 1.0, vLeaf.w));
            diffuseColor.rgb = mix(diffuseColor.rgb, leafColor, mix(tintMask, 1.0, max(vLeaf.w, leafTexture)) * uLeafSeason);
            // Zimą cienki śnieg na wierzchu - piksel po pikselu.
            float leafSnowCover = uLeafSnow * vLeaf.y * ${LEAF_TIMES.snow.toFixed(2)};
            if (leafSnowCover > 0.0) {
                vec3 leafWorld = vSkyDirection + cameraPosition;
                // Płaty po kilka pikseli z postrzępionym brzegiem, nie "sól".
                float leafFlake = mix(leafHash(floor(leafWorld.xz * 16.0 + 0.01)), leafHash(floor(leafWorld.xz * 4.0 + 0.01) + 7.0), 0.55);
                diffuseColor.rgb = mix(diffuseColor.rgb, uLeafSnowColor, step(leafFlake, leafSnowCover) * 0.9);
            }
        }
    #endif`;
