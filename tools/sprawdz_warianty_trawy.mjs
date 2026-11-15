// ------------------------------------------------------------
// SPRAWDZENIE WARIANTÓW TRAWY I KOLORU TRAWY (1.2.0)
//
// - wierzch bloku trawy z dodatkiem: co dziewiąty blok, losowo, zawsze
//   ten sam w tym samym miejscu; lista w grze = lista w generatorze
//   tekstur = kafelki w atlasie,
// - tekstury: tylko kwiatki i roślinki (bez ziemi, kamyków, grzybów),
//   dodatek nie dotyka brzegu, zielone części barwi klimat, płatki nie,
// - kolor trawy: wyraźnie inny w różnych biomach (klimat i las),
//   liczony z tych samych gładkich pól co dotąd,
// - koszt: wybór wariantu to kilka mnożeń na blok trawy.
//
// Uruchomienie: node tools/sprawdz_warianty_trawy.mjs
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
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer { update() {} dispose() {} } export const TABLE_ROTATION = {}; export function productSpot() { return { x: 0, z: 0 }; }' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

import { execFileSync } from 'node:child_process';
const V = await import('../src/rendering/SurfaceTextureVariants.js');
const B = await import('../src/world/terrain/Biomes.js');
const { WORLD_ATLAS_TILES, TEXTURE_REGIONS } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const root = new URL('../', import.meta.url).pathname;


// --- Lista wariantów ---------------------------------------------------------------------

const names = V.GRASS_TOP_VARIANTS.map(([name]) => name);
check(V.GRASS_VARIANT_ONE_IN === 9, 'Wariant trafia się raz na 9 bloków');
check(names.length === 42 && new Set(names).size === names.length, `42 różne warianty (jest ${names.length})`);
check(V.GRASS_TOP_VARIANTS.every(([, weight]) => Number.isInteger(weight) && weight >= 1 && weight <= 20), 'Wagi to małe liczby całkowite');
check(V.GRASS_TOP_TEXTURES.length === 43 && V.GRASS_TOP_TEXTURES[0] === 'grass_top', 'Lista tekstur: zwykły wierzch i 42 warianty');
for (const texture of V.GRASS_TOP_TEXTURES) {
    check(WORLD_ATLAS_TILES[texture] && TEXTURE_REGIONS[texture], `${texture}: kafelek w atlasie`);
}
check(!names.some((name) => /grzyb|muchomor|kamyk|ziemia|patyk|lisc|las|jagod|nasion/.test(name)), 'Same kwiatki i roślinki: bez grzybów, ziemi, kamyków, patyków i liści');
// Generator tekstur rysuje dokładnie te same warianty z tymi samymi wagami.
{
    const python = source('tools/tekstury_trawy.py');
    const drawn = [...python.matchAll(/^ \('(\w+)',\s+'[^']*',\s+\[.*\], (\d+)\),$/gm)].map((match) => [match[1], Number(match[2])]);
    check(JSON.stringify(drawn) === JSON.stringify(V.GRASS_TOP_VARIANTS), 'Lista w grze = lista w tools/tekstury_trawy.py (nazwy, kolejność, wagi)');
}


// --- Losowanie -----------------------------------------------------------------------------

{
    const counts = new Array(43).fill(0);
    let total = 0;
    for (let z = -220; z < 220; z++) for (let x = -220; x < 220; x++) { counts[V.grassTopVariant(x, 64 + ((x * 7 + z * 3) & 15), z)]++; total++; }
    const variants = total - counts[0];
    check(Math.abs(variants / total - 1 / 9) < 0.004, `Wariant na ${(total / variants).toFixed(2)} bloku z 9`);
    check(counts.slice(1).every((count) => count > 0), 'Każdy wariant się trafia');
    const weightSum = V.GRASS_TOP_VARIANTS.reduce((sum, [, weight]) => sum + weight, 0);
    let worst = 0;
    V.GRASS_TOP_VARIANTS.forEach(([name, weight], index) => { worst = Math.max(worst, Math.abs(counts[index + 1] / variants - weight / weightSum) / (weight / weightSum)); });
    check(worst < 0.25, `Częstość wariantów zgodna z wagami (największe odchylenie ${(worst * 100).toFixed(0)}%)`);
    check(counts[names.indexOf('trawa_kepki') + 1] > counts[names.indexOf('maki') + 1] * 4, 'Kępki trawy częściej niż maki');
    // Stałe: to samo miejsce = ten sam wariant.
    check([[5, 70, -3], [-1000, 12, 999], [0, 0, 0], [123456, 200, -654321]].every(([x, y, z]) => V.grassTopVariant(x, y, z) === V.grassTopVariant(x, y, z) && Number.isInteger(V.grassTopVariant(x, y, z))), 'To samo miejsce = ten sam wariant');
    // Bez wzoru: w wierszach, kolumnach i po przekątnej podobnie często.
    for (const [label, at] of [['wiersz', (i) => [i, 64, 7]], ['kolumna', (i) => [-3, 64, i]], ['przekątna', (i) => [i, 64, i]], ['słupek', (i) => [9, i, 9]], ['ujemna strona', (i) => [-i - 1, 64, -2 * i - 5]]]) {
        let hits = 0;
        for (let i = 0; i < 9000; i++) if (V.grassTopVariant(...at(i))) hits++;
        check(hits > 800 && hits < 1200, `Losowo także: ${label} (${hits} na 9000)`);
    }
    // Sąsiedzi nie zależą od siebie: dwa warianty obok siebie mniej więcej raz na 81.
    let pairs = 0;
    for (let z = 0; z < 300; z++) for (let x = 0; x < 300; x++) if (V.grassTopVariant(x, 64, z) && V.grassTopVariant(x + 1, 64, z)) pairs++;
    check(pairs > 800 && pairs < 1450, `Warianty nie zbijają się w pary ani nie unikają (${pairs} par na 90 000; losowo ok. 1100)`);
}


// --- Tekstury ------------------------------------------------------------------------------

{
    const dump = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools')
from atlasy import read_texture
names = json.loads(sys.argv[1])
print(json.dumps({n: [list(p) for p in read_texture(n).convert('RGBA').getdata()] for n in names}))
`, JSON.stringify(V.GRASS_TOP_TEXTURES)], { cwd: root, maxBuffer: 1 << 26 }).toString();
    const pixels = JSON.parse(dump);
    const key = (p) => p.slice(0, 3).join();
    const grass = new Set(pixels.grass_top.map(key));
    check(grass.size >= 4 && grass.size <= 8 && pixels.grass_top.length === 256, 'Zwykły wierzch: 16 x 16, kilka odcieni zieleni');
    // Maska koloru klimatu z shadera (BlockRenderData.js): zielone piksele.
    const mask = (p) => { const d = (p[1] - Math.max(p[0], p[2])) / 255; return Math.min(1, Math.max(0, (d - 0.01) / 0.06)); };
    check(/smoothstep\(0\.01, 0\.07, diffuseColor\.g - max\(diffuseColor\.r, diffuseColor\.b\)\)/.test(source('src/rendering/BlockRenderData.js')), 'Shader barwi tylko zielone piksele (maska jak w tym teście)');
    const seen = new Set();
    let flowers = 0;
    for (const [name, data] of Object.entries(pixels)) {
        if (name === 'grass_top') continue;
        check(data.length === 256 && data.every((p) => p[3] === 255), `${name}: 16 x 16, bez przezroczystości`);
        let extra = 0, border = 0, colorful = 0;
        data.forEach((p, i) => {
            if (grass.has(key(p))) return;
            extra++;
            const x = i % 16, y = Math.floor(i / 16);
            if (x === 0 || y === 0 || x === 15 || y === 15) border++;
            const m = mask(p);
            // Każdy piksel dodatku jest albo wyraźnie zielony (barwi go klimat),
            // albo wyraźnie nie (płatek zostaje w swoim kolorze) - bez półcieni.
            if (m > 0 && m < 1) border += 1000;
            if (m === 0) colorful++;
            // Bez ziemi (brązy) i kamyków (szarości).
            const [r, g, b] = p, brown = r > g * 1.6 && g > b * 2 && r < 190, gray = Math.abs(r - g) < 14 && Math.abs(g - b) < 22 && r < 190;
            if (brown || gray) border += 100000;
        });
        check(extra >= 3 && extra <= 70, `${name}: dodatek jest widoczny, ale nie zakrywa trawy (${extra} pikseli)`);
        check(border === 0, `${name}: brzeg bloku to sama trawa; kolory albo zielone, albo kwiatowe; bez ziemi i kamyków`);
        if (colorful) flowers++;
        seen.add(data.map(key).join(';'));
    }
    check(seen.size === 42, 'Każdy wariant wygląda inaczej');
    check(flowers >= 22 && flowers <= 34, `Warianty z kolorowymi kwiatami: ${flowers}, reszta to sama zieleń`);
    // Kolory płatków z roślin gry: klimat ich nie zmienia; zielenie - zmienia.
    for (const [label, color] of [['żółty mlecz', [246, 204, 32]], ['biała stokrotka', [232, 232, 222]], ['czerwony mak', [213, 41, 31]], ['niebieski chaber', [74, 112, 222]], ['różowa koniczyna', [216, 128, 192]], ['fiołek', [162, 116, 218]]]) check(mask(color) === 0, `${label}: klimat nie zmienia koloru`);
    for (const [label, color] of [['koniczyna', [59, 133, 29]], ['jasne źdźbło', [142, 222, 74]], ['mech', [112, 157, 61]], ['trawa', [106, 190, 48]]]) check(mask(color) === 1, `${label}: barwi się z klimatem jak trawa`);
}


// --- Podpięcie do rysowania ---------------------------------------------------------------

{
    const render = source('src/rendering/BlockRenderData.js'), mesher = source('src/rendering/ChunkMesher.js');
    check(/name === 'grass'\s*\? grassTopVariants\(definition\)/.test(render), 'Blok trawy ma zestawy tekstur wierzchu');
    check(/faceName === 'top' \? createRotatedUVs\(texture\) : shared\[index\]/.test(render), 'Warianty różnią się tylko wierzchem; boki i spód wspólne');
    check(/const textureVariant = id === GRASS_ID\s*\? grassTopVariant\(baseX \+ lx, y, baseZ \+ lz\)/.test(mesher), 'Mesher wybiera wariant z miejsca bloku w świecie');
    check((mesher.match(/grassTopVariant\(/g) ?? []).length === 1, 'Jedno miejsce wyboru - żadnej dodatkowej geometrii');
    check(/name\.startsWith\('grass_top_'\) \? pack\.tiles\.get\('grass_top'\)/.test(source('src/rendering/TextureAtlas.js')), 'Paczka tekstur z własną trawą: warianty dostają jej trawę');
}


// --- Kolor trawy ---------------------------------------------------------------------------

{
    const tint = (t, h, above = 8, forest = null) => B.grassTint(t, h, above, [0, 0, 0], forest);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const T = B.GRASS_TINT;
    // Typowe miejsca (średni klimat biomów w świecie - pomiar w docs/trawa.md).
    const meadow = tint(-0.19, -0.02, 10, -0.28), deciduous = tint(0.07, -0.06, 5, 0.32), spruce = tint(-0.69, 0.13, 25, 0.31);
    const olive = tint(0.56, -0.31, 7, 0.01), birch = tint(-0.25, 0.3, 3, 0.27), alpine = tint(-0.7, -0.04, 38, -0.34), pine = tint(-0.08, -0.5, 12, 0.35);
    const pairs = { 'łąka / las liściasty': [meadow, deciduous], 'łąka / świerczyna': [meadow, spruce], 'las liściasty / świerczyna': [deciduous, spruce], 'łąka / gaj oliwny': [meadow, olive], 'las liściasty / brzezina': [deciduous, birch], 'bór sosnowy / świerczyna': [pine, spruce], 'hala / świerczyna': [alpine, spruce] };
    for (const [label, [a, b]] of Object.entries(pairs)) check(distance(a, b) > 0.15, `${label}: wyraźnie inna trawa (${distance(a, b).toFixed(2)})`);
    // Kierunki: ciepło i sucho - żółciej; chłodno i wilgotno - sinawo; las - ciemniej.
    check(olive[0] > 1.15 && olive[2] < 0.7, 'Gaj oliwny: żółtozielona');
    check(spruce[0] < 0.7 && spruce[2] > 1.0, 'Świerczyna: ciemna, sinawa');
    check(meadow[1] > deciduous[1] + 0.1 && meadow[0] + meadow[1] + meadow[2] > deciduous[0] + deciduous[1] + deciduous[2] + 0.3, 'Łąka jaśniejsza niż las');
    // Las: płynnie, monotonicznie, bez skoku na skraju.
    let previous = tint(0, 0, 8, -1), monotone = true, jump = 0;
    for (let f = -1; f <= 1.0001; f += 0.01) { const now = tint(0, 0, 8, f); if (now[1] > previous[1] + 1e-9) monotone = false; jump = Math.max(jump, distance(now, previous)); previous = now; }
    check(monotone && jump < 0.02, `Im gęstszy las, tym ciemniejsza trawa - płynnie (największy krok ${jump.toFixed(3)})`);
    check(distance(tint(0, 0, 8, -1), tint(0, 0, 8, T.forest[0])) < 1e-9 && distance(tint(0, 0, 8, 1), tint(0, 0, 8, T.forest[1])) < 1e-9, 'Poza zakresem pola lasów kolor się nie zmienia');
    // Klimat: płynnie.
    jump = 0; previous = tint(-1.5, Math.sin(-4.5) * 0.6, 8, 0);
    for (let t = -1.5; t <= 1.5; t += 0.01) { const now = tint(t, Math.sin(t * 3) * 0.6, 8, 0); jump = Math.max(jump, distance(now, previous)); previous = now; }
    check(jump < 0.03, `Kolor zmienia się płynnie z klimatem (największy krok ${jump.toFixed(3)})`);
    // Granice atrybutu (0..2) i zdrowy zakres.
    let lowest = 9, highest = 0;
    for (let t = -2; t <= 2; t += 0.25) for (let h = -2; h <= 2; h += 0.25) for (const above of [0, 30, 45, 80]) for (const forest of [null, -1, 0, 1]) for (const value of tint(t, h, above, forest)) { lowest = Math.min(lowest, value); highest = Math.max(highest, value); }
    check(lowest >= T.min && highest <= T.max && T.min >= 0.4 && T.max <= 1.6 && Math.round(highest * 127.5) <= 255, `Mnożnik zawsze w ${T.min}-${T.max} (mieści się w bajcie)`);
    // Bez pola lasów (daleki teren) - sam klimat, bez przyciemnienia.
    check(distance(tint(-0.2, 0, 8), [1, 1, 1]) < 0.02, 'Bez pola lasów: w umiarkowanym klimacie kolor tekstury');
    // Góry: blado.
    check(tint(-0.9, 0, 60, 0)[2] < tint(-0.9, 0, 10, 0)[2], 'Wysoko w górach trawa blednie');
    const biomes = source('src/world/terrain/Biomes.js');
    check(/grassTint\(fields\[0\] - Math\.max\(0, above\) \/ 60, fields\[1\], above, color, fields\[2\]\)/.test(biomes), 'Kolor w chunku liczony z tych samych pól co dotąd (plus pole lasów) - bez liczenia terenu');
    check((biomes.slice(biomes.indexOf('tintGrid('), biomes.indexOf('fieldsAt(x, z, exact')).match(/this\.fieldsAt\(/g) ?? []).length === 1, 'Jedno odczytanie pól na róg chunka - jak przed zmianą');
}


// --- Koszt ---------------------------------------------------------------------------------

{
    // Wybór wariantu dla wszystkich bloków trawy pełnego zasięgu
    // (ok. 700 chunków x 256 kolumn) - ma się zmieścić w kilku milisekundach.
    const count = 700 * 256;
    let sum = 0;
    for (let i = 0; i < count; i++) sum += V.grassTopVariant(i & 1023, 60, i >> 10);   // rozgrzewka
    const started = performance.now();
    for (let round = 0; round < 5; round++) for (let i = 0; i < count; i++) sum += V.grassTopVariant((i & 1023) - 500, 60 + round, (i >> 10) - 300);
    const ms = (performance.now() - started) / 5;
    check(sum > 0 && ms < 25, `Wybór wariantu dla ${count} bloków trawy: ${ms.toFixed(1)} ms (${(ms / count * 1e6).toFixed(0)} ns na blok)`);
    console.log(`  koszt: ${ms.toFixed(2)} ms na ${count} bloków trawy (${(ms / count * 1e6).toFixed(0)} ns na blok)`);
}

console.log(`OK: warianty trawy i kolor trawy - ${checks} sprawdzeń`);
