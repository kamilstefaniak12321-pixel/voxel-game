// Rozgrzebana ziemia i serce (0.95.0): blok pola, zasady sadzenia
// w rejestrze, zarastanie pustego pola, rysunek serca.
// Uruchomienie:
//     node tools/sprawdz_uprawe.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null,getTileMask=()=>null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const R = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES, getPlacedBlock, getTool } = await import('../src/items/ItemRegistry.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { CHUNK_SIZE } = await import('../src/config.js');
const { HEART_COLORS, HEART_WIDTH, HEART_HEIGHT, drawHeart } = await import('../src/ui/HeartIcon.js');
const { STATES } = await import('../src/game/Wellbeing.js');

let checks = 0;
const ok = (value, text) => { checks++; assert.ok(value, text); };
const equal = (a, b, text) => { checks++; assert.deepEqual(a, b, text); };

// --- Blok ---------------------------------------------------------------------
{
    const field = R.getBlockDefinition(R.FIELD_BLOCK);
    equal(R.FIELD_BLOCK, 'tilled_dirt', 'nazwa pola');
    equal(field.id, 256, 'numer bloku (zapisy)');
    equal(field.label, 'Rozgrzebana ziemia', 'polska nazwa');
    ok(field.solid && field.soil, 'pełny blok, na którym rosną rośliny');
    equal(R.getDropType('tilled_dirt'), 'dirt', 'wykopana daje zwykłą ziemię');
    equal(field.textures, { top: 'tilled_dirt', side: 'dirt', bottom: 'dirt' }, 'bruzdy tylko z góry');
    equal(R.getBlockSound('tilled_dirt'), 'dirt', 'kopie się jak ziemię');
    const atlas = JSON.parse(readFileSync(new URL('../assets/textures/atlas.json', import.meta.url), 'utf8'));
    ok(atlas.regions.tilled_dirt && atlas.tiles.tilled_dirt, 'tekstura w atlasie');
    const taken = Object.entries(atlas.tiles).filter(([name, t]) => name !== 'tilled_dirt' &&
        t.x <= atlas.tiles.tilled_dirt.x && atlas.tiles.tilled_dirt.x < t.x + (t.w ?? 1) &&
        t.y <= atlas.tiles.tilled_dirt.y && atlas.tiles.tilled_dirt.y < t.y + (t.h ?? 1));
    equal(taken.map(([name]) => name), [], 'kafelek atlasu nie nachodzi na inny');
}

// --- Rozgrzebywanie ---------------------------------------------------------------
{
    equal(R.getTill('grass'), 'tilled_dirt', 'trawa -> pole');
    equal(R.getTill('dirt'), 'tilled_dirt', 'ziemia -> pole');
    for (const type of ['tilled_dirt', 'stone', 'sand', 'mud', 'oak_log', 'nic_takiego']) {
        equal(R.getTill(type), null, `${type}: łopata nic nie robi`);
    }
    equal(getTool('shovel'), 'shovel', 'łopata jest narzędziem');
}

// --- Sadzenie: każda sadzonka z owocu i nasiona rośnie na polu ------------------------
{
    const fieldId = R.getBlockId('tilled_dirt');
    const seeds = Object.entries(ITEM_TYPES).filter(([, item]) => item.plants);
    ok(seeds.length >= 16, `owoce i nasiona (${seeds.length})`);
    for (const [name, item] of seeds) {
        equal(getPlacedBlock(name), item.plants, `${name}: sadzonka`);
        ok(R.canPlantStay(R.getBlockId(item.plants), fieldId), `${name}: sadzonka trzyma się pola`);
        ok(R.canGrowOn(R.getBlockId(item.plants), fieldId), `${name}: rośnie na polu`);
    }
    // Kod gry: sadzenie tylko na polu, inaczej jedzenie albo podpowiedź.
    const game = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
    ok(game.includes('!this.canPlantAt(this.currentHit, block)'), 'owoc sprawdza, czy stoi na polu');
    ok(game.includes('=== FIELD_BLOCK'), 'pole to rozgrzebana ziemia');
    ok(game.includes("'Najpierw rozgrzeb ziemię łopatą'"), 'podpowiedź dla nasion');
}

// --- Zarastanie pustego pola -----------------------------------------------------------
{
    const growth = R.getGrowth('tilled_dirt');
    ok(growth && growth.into === 'dirt' && growth.empty && growth.seconds >= 300, 'puste pole zarasta w ziemię');
    ok(R.isGrowingId(R.getBlockId('tilled_dirt')), 'pole jest na liście rosnących');

    const blocks = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const world = {
        chunks: new Map(),
        getBlockId: (x, y, z) => blocks.get(key(x, y, z)) ?? 0,
        setBlock(x, y, z, type) { blocks.set(key(x, y, z), type === null ? 0 : R.getBlockId(type)); return true; }
    };
    const chunk = { cx: 0, cz: 0 };
    const index = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    const growing = new PlantGrowth(world);
    world.setBlock(1, 5, 1, 'tilled_dirt');
    world.setBlock(2, 5, 1, 'tilled_dirt');
    world.setBlock(2, 6, 1, 'strawberry_sapling');
    ok(growing.grow(chunk, index(1, 5, 1), growth), 'puste pole zarosło');
    equal(world.getBlockId(1, 5, 1), R.getBlockId('dirt'), 'i jest zwykłą ziemią');
    equal(growing.grow(chunk, index(2, 5, 1), growth), false, 'pole z sadzonką nie zarasta');
    equal(world.getBlockId(2, 5, 1), R.getBlockId('tilled_dirt'), 'i zostaje polem');
}

// --- Serce -------------------------------------------------------------------------------
{
    equal(Object.keys(HEART_COLORS).sort(), Object.keys(STATES).sort(), 'serce ma kolor dla każdego stanu');
    const fills = new Set(Object.values(HEART_COLORS).map((c) => c.fill));
    equal(fills.size, Object.keys(STATES).length, 'każdy stan ma inny kolor');
    ok(HEART_COLORS.exhausted.crack, 'wyczerpane serce jest pęknięte');

    // Rysunek na udawanym canvasie: zapisujemy piksele.
    const paint = (state, white = false) => {
        const pixels = new Map();
        const context = { fillStyle: '', clearRect() { pixels.clear(); }, fillRect(x, y) { pixels.set(`${x},${y}`, this.fillStyle); } };
        const canvas = { width: 0, height: 0, getContext: () => context };
        drawHeart(canvas, state, white);
        return { pixels, canvas };
    };
    for (const state of Object.keys(STATES)) {
        const { pixels, canvas } = paint(state);
        equal([canvas.width, canvas.height], [HEART_WIDTH, HEART_HEIGHT], `${state}: rozmiar`);
        const colors = new Set(pixels.values());
        ok(colors.has(HEART_COLORS[state].fill) && colors.has(HEART_COLORS[state].outline) &&
            colors.has(HEART_COLORS[state].shade) && colors.has(HEART_COLORS[state].shine), `${state}: wypełnienie, cień, połysk, obrys`);
        ok([...pixels.keys()].every((k) => { const [x, y] = k.split(',').map(Number); return x >= 0 && y >= 0 && x < HEART_WIDTH && y < HEART_HEIGHT; }),
            `${state}: mieści się w obrazku`);
        // Symetria kształtu (obrys + wnętrze) względem środka.
        ok([...pixels.keys()].every((k) => { const [x, y] = k.split(',').map(Number); return pixels.has(`${HEART_WIDTH - 1 - x},${y}`); }),
            `${state}: symetryczne`);
    }
    equal(paint('good').pixels.size, paint('exhausted').pixels.size, 'ten sam kształt w każdym stanie');
    const flash = new Set(paint('good', true).pixels.values());
    equal([...flash].sort(), ['#ffffff', HEART_COLORS.good.outline].sort(), 'błysk: białe z obrysem');
    ok([...paint('exhausted').pixels.values()].includes(HEART_COLORS.exhausted.crack), 'pęknięcie narysowane');
}

console.log(`OK: uprawa i serce - ${checks} sprawdzeń.`);
