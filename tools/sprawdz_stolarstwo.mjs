// ------------------------------------------------------------
// SPRAWDZENIE STOLARSTWA (0.90.0)
//
// - bloki: 20 rodzajów desek x (schody, półblok, płot, furtka, stół),
//   numery 10300-10859 bez powtórzeń, nazwy, jeden przedmiot na wyrób,
// - kształty: schody w czterech kierunkach i do góry nogami, półbloki,
//   płot łączy się z płotem, furtką wzdłuż i pełnym blokiem,
// - kolizje gracza: na półblok i schody wchodzi się bez skoku, na pełny
//   blok nie; przez płot (1,5 bloku) nie da się przeskoczyć, przez
//   zamkniętą furtkę nie da się przejść, przez otwartą - tak,
// - stawianie: kierunek schodów od gracza, górna połowa, dwa półbloki
//   w jeden pełny,
// - stół stolarski: dwa bloki, deski na blat, wyroby (partia i Shift),
//   zabieranie desek, blokada rozbicia z deskami, druga część znika,
//   zapis i odczyt, przepis na stół.
//
// Uruchomienie: node tools/sprawdz_stolarstwo.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
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
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 36, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer {}' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { WOODS, woodName } = await import('../src/blocks/woods.js');
const W = await import('../src/blocks/woodShapes.js');
const { shapeBoxes, connectMask, rotateBox } = await import('../src/world/ShapeBoxes.js');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId, isOpaqueId, getDropType, getDropCount, AIR_ID } = await import('../src/blocks/BlockRegistry.js');
const { World } = await import('../src/world/World.js');
const { Player } = await import('../src/player/Player.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');
const { CarpenterTables, TABLE_PRODUCTS, TABLE_CAPACITY, restoreTable } = await import('../src/game/CarpenterTables.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { itemShapeFaces } = await import('../src/rendering/ShapeGeometry.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);
const STONE = getBlockId('stone');


// --- Bloki -----------------------------------------------------------------

check(WOODS.length === 20 && new Set(WOODS.map((w) => w.wood)).size === 20, '20 rodzajów desek');
check(WOODS.every(({ planks }) => getBlockId(planks) > 0), 'Każde drewno ma swoje deski');
const ids = [];
for (const { wood } of WOODS) {
    for (const kind of Object.keys(W.SHAPE_KINDS)) {
        const type = W.shapeBaseType(wood, kind);
        const definition = getBlockDefinition(type);
        check(definition && definition.inventory !== false, `${type}: przedmiot w ekwipunku`);
        check(/^[A-ZĆŁŚŻŹ]/.test(definition.label) && !/undefined/.test(definition.label), `${type}: nazwa "${definition.label}"`);
        check(itemShapeFaces(type)?.length > 0, `${type}: model (ikonka, dłoń)`);
    }
    for (let i = 0; i < W.SHAPES_PER_WOOD; i++) ids.push(W.SHAPE_FIRST_ID + WOODS.findIndex((w) => w.wood === wood) * W.SHAPES_PER_WOOD + i);
}
check(ids.every((id) => getBlockTypeById(id) && W.shapeInfo(id)), 'Każdy numer 10300-10859 to wyrób');
check(new Set(ids).size === 560 && Math.min(...ids) === 10300 && Math.max(...ids) === 10859, '560 numerów bez powtórzeń');
check(woodName('spruce', 'Schody', 'n') === 'Schody świerkowe' && woodName('acacia', 'Furtka', 'f') === 'Furtka z akacji'
    && getBlockDefinition('oak_carpenter_table').label === 'Stół stolarski dębowy', 'Nazwy po polsku');
check(getDropType('oak_slab_double') === 'oak_slab' && getDropCount('oak_slab_double') === 2, 'Podwójny półblok daje dwa półbloki');
check(isOpaqueId(getBlockId('oak_slab_double')) && !isOpaqueId(getBlockId('oak_slab')), 'Pełny blok z dwóch półbloków zasłania, półblok nie');
check(getDropType('oak_stairs_west_top') === 'oak_stairs' && getDropType('maple_fence_gate_east_open') === 'maple_fence_gate'
    && getDropType('olive_carpenter_table_south_b') === 'olive_carpenter_table', 'Każdy wariant daje swój przedmiot');
for (const { wood, planks } of WOODS) {
    const recipe = findRecipe([planks, planks, 'stick', 'stick']);
    check(recipe?.result[0] === `${wood}_carpenter_table`, `${wood}: przepis na stół (2 deski, 2 patyki)`);
}


// --- Kształty ----------------------------------------------------------------

const volume = (boxes) => boxes.reduce((sum, b) => sum + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0);
const stairs = (facing, half = 'bottom') => W.shapeId('oak', 'stairs', { facing, half });
check(['north', 'east', 'south', 'west'].every((facing) => Math.abs(volume(shapeBoxes(stairs(facing))) - 0.75) < 1e-9), 'Schody: 3/4 bloku w każdym kierunku');
const back = (facing) => shapeBoxes(stairs(facing))[1];
check(back('north')[2] === 0 && back('north')[5] === .5 && back('south')[2] === .5 && back('east')[0] === .5 && back('west')[3] === .5, 'Wyższy stopień z tyłu (w stronę kierunku)');
check(shapeBoxes(stairs('north', 'top'))[0][1] === .5 && shapeBoxes(stairs('north', 'top'))[1][1] === 0, 'Górne schody - do góry nogami');
check(rotateBox([0, 0, 0, 1, 1, .5], 'east').join() === [.5, 0, 0, 1, 1, 1].join(), 'Obrót pudełka na wschód');
const fence = W.shapeId('oak', 'fence');
const map = new Map();
const getId = (x, y, z) => map.get(`${x},${y},${z}`) ?? AIR_ID;
map.set('0,0,0', fence); map.set('1,0,0', fence); map.set('-1,0,0', STONE);
map.set('0,0,1', W.shapeId('oak', 'gate', { facing: 'north' }));        // furtka wzdłuż x - nie z tej strony
map.set('0,0,-1', W.shapeId('oak', 'gate', { facing: 'east' }));        // furtka wzdłuż z - tak
check(connectMask(getId, 0, 0, 0) === (1 | 2 | 8), `Płot: z płotem, kamieniem i furtką wzdłuż (maska ${connectMask(getId, 0, 0, 0)})`);
check(shapeBoxes(fence, 'collision', 0).every((box) => box[4] === 1.5), 'Płot: kolizja 1,5 bloku');
check(shapeBoxes(W.shapeId('oak', 'gate', { open: true }), 'collision').length === 0, 'Otwarta furtka - bez kolizji');
check(volume(shapeBoxes(W.shapeId('oak', 'table'), 'collision')) === 1, 'Stół - pełna kolizja');


// --- Kolizje gracza ------------------------------------------------------------

function makeWorld() {
    const blocks = new Map();
    const world = {
        blocks,
        set(x, y, z, id) { blocks.set(`${x},${y},${z}`, typeof id === 'string' ? getBlockId(id) : id); },
        getBlockId(x, y, z) { return blocks.get(`${x},${y},${z}`) ?? (y < 0 ? STONE : AIR_ID); },
        isSolid(x, y, z) { return isSolidId(this.getBlockId(x, y, z)); },
        collisionBoxes: World.prototype.collisionBoxes,
        spawnPoint: { x: 0, z: 0 },
        getGroundY: () => 0,
        ensureColumnLoaded() {}
    };
    return world;
}

function walk(world, from, velocity, seconds) {
    const player = new Player(world, new THREE.PerspectiveCamera());
    player.pos.set(...from);
    player.onGround = true;
    for (let t = 0; t < seconds; t += 1 / 60) {
        player.vel.x = velocity[0]; player.vel.z = velocity[2];
        player.vel.y = (player.vel.y ?? 0) - 20 / 60;
        player.resolveMovement(1 / 60);
    }
    return player;
}

{
    const world = makeWorld();
    world.set(0, 0, 3, W.shapeId('oak', 'slab'));
    for (let z = 4; z < 8; z++) world.set(0, 0, z, W.shapeId('oak', 'slab', { half: 'double' }));
    const player = walk(world, [0.5, 0, 0.5], [0, 0, 4], 1.4);
    check(player.pos.z > 5 && player.pos.z < 8 && Math.abs(player.pos.y - 1) < 0.02, `Półblok, potem pełny - wchodzi bez skoku po pół bloku (y ${player.pos.y.toFixed(2)}, z ${player.pos.z.toFixed(2)})`);
}
{
    const world = makeWorld();
    for (let i = 0; i < 4; i++) {
        world.set(0, i, 3 + i, W.shapeId('oak', 'stairs', { facing: 'south' }));
        for (let k = 0; k < i; k++) world.set(0, k, 3 + i, 'oak_planks');
    }
    // Ściana za ostatnim stopniem - gracz zostaje na górze.
    for (let k = 0; k < 7; k++) world.set(0, k, 7, 'stone');
    const player = walk(world, [0.5, 0, 0.5], [0, 0, 4], 3);
    check(Math.abs(player.pos.y - 4) < 0.02 && player.pos.z > 6, `Schody - w górę bez skakania (y ${player.pos.y.toFixed(2)})`);
}
{
    const world = makeWorld();
    world.set(0, 0, 3, 'oak_planks');
    const player = walk(world, [0.5, 0, 0.5], [0, 0, 4], 1.5);
    check(player.pos.z < 3 && player.pos.y < 0.01, 'Pełny blok - bez skoku się nie wejdzie');
}
{
    const world = makeWorld();
    for (let x = -2; x <= 2; x++) world.set(x, 0, 3, fence);
    const player = new Player(world, new THREE.PerspectiveCamera());
    player.pos.set(0.5, 0, 2);
    player.onGround = true;
    // Skok (wyżej niż 1,25 bloku) i do przodu.
    player.vel.y = 8;
    let best = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
        player.vel.z = 4; player.vel.y -= 25 / 60;
        player.resolveMovement(1 / 60);
        best = Math.max(best, player.pos.y);
    }
    check(best > 1.2 && player.pos.z + 0.3 <= 3 + 6 / 16 + 1e-3, `Płot - nie da się przeskoczyć (skok ${best.toFixed(2)}, z ${player.pos.z.toFixed(2)})`);
    world.set(0, 0, 3, W.shapeId('oak', 'gate', { facing: 'north' }));
    const blocked = walk(world, [0.5, 0, 1.5], [0, 0, 4], 1);
    check(blocked.pos.z + 0.3 <= 3 + 6 / 16 + 1e-3, 'Zamknięta furtka zatrzymuje');
    world.set(0, 0, 3, W.shapeId('oak', 'gate', { facing: 'north', open: true }));
    const through = walk(world, [0.5, 0, 1.5], [0, 0, 4], 1);
    check(through.pos.z > 4, 'Przez otwartą furtkę się przechodzi');
}
{
    const world = makeWorld();
    world.set(0, 2, 0, W.shapeId('oak', 'slab', { half: 'top' }));
    const player = walk(world, [0.5, 0, 0.5], [0, 0, 0], 0.2);
    player.pos.y = 0;
    check(!player.collidesAt(new THREE.Vector3(0.5, 0.2, 0.5)) && player.collidesAt(new THREE.Vector3(0.5, 0.8, 0.5)), 'Górny półblok - kolizja tylko w górnej połowie');
}


// --- Stawianie ---------------------------------------------------------------

{
    const world = makeWorld();
    world.setBlock = (x, y, z, type) => { world.set(x, y, z, type); return true; };
    world.getBlock = (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)) ?? null;
    world.attachedPlantSupported = () => true;
    world.set(0, 0, 0, 'stone');
    const player = { yaw: Math.PI, intersectsBlock: () => false };   // patrzy na +z (południe)
    const placer = new BlockPlacer(world, player);
    const hitTop = { hit: true, block: { x: 0, y: 0, z: 0, type: 'stone' }, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 1, z: .5 } };
    check(placer.placeBlock(hitTop, 'oak_stairs') === getBlockTypeById(W.shapeId('oak', 'stairs', { facing: 'south' })), 'Schody: tył tam, gdzie patrzy gracz');
    const hitSideHigh = { hit: true, block: { x: 0, y: 0, z: 0, type: 'stone' }, normal: { x: 1, y: 0, z: 0 }, point: { x: 1, y: .8, z: .5 } };
    check(placer.placeBlock(hitSideHigh, 'oak_slab') === 'oak_slab_top', 'Półblok - górna połowa ściany: górny');
    world.set(1, 0, 0, AIR_ID);
    const hitSideLow = { ...hitSideHigh, point: { x: 1, y: .2, z: .5 } };
    check(placer.placeBlock(hitSideLow, 'oak_slab') === 'oak_slab', 'Półblok - dolna połowa: dolny');
    const onSlab = { hit: true, block: { x: 1, y: 0, z: 0, type: 'oak_slab' }, normal: { x: 0, y: 1, z: 0 }, point: { x: 1.5, y: .5, z: .5 } };
    check(placer.placeBlock(onSlab, 'oak_slab') === 'oak_slab_double' && world.getBlockId(1, 0, 0) === getBlockId('oak_slab_double'), 'Drugi półblok na pierwszy - pełny blok');
    world.set(2, 0, 0, 'birch_slab');
    const otherWood = { hit: true, block: { x: 2, y: 0, z: 0, type: 'birch_slab' }, normal: { x: 0, y: 1, z: 0 }, point: { x: 2.5, y: .5, z: .5 } };
    check(placer.placeBlock(otherWood, 'oak_slab') === 'oak_slab' && world.getBlockId(2, 1, 0) === getBlockId('oak_slab'), 'Inne drewno - zwykły półblok obok');
    world.set(0, 1, 0, AIR_ID);
    check(placer.placeBlock(hitTop, 'oak_fence_gate') === getBlockTypeById(W.shapeId('oak', 'gate', { facing: 'south' })), 'Furtka - w poprzek kierunku patrzenia');
}


// --- Stół stolarski ----------------------------------------------------------

function tableGame(mode = 'adventure') {
    const world = makeWorld();
    world.setBlock = (x, y, z, type) => { world.set(x, y, z, type ?? AIR_ID); return true; };
    world.getChunk = () => ({});
    world.toChunkCoord = (v) => Math.floor(v / 16);
    const notices = [];
    const inventory = Inventory.load({}, mode);
    const game = { world, inventory, mode, player: { yaw: Math.PI }, onNotice: (text) => notices.push(text), notices,
        playBlockSound() {}, achieve() {} };
    game.tables = new CarpenterTables(game, []);
    return game;
}

{
    const game = tableGame();
    const { tables, world, inventory } = game;
    // Gracz patrzy na +z (południe): przód stołu na północ, część B na zachód (-x).
    const placed = tables.place({ x: 0, y: 0, z: 0 }, 'oak', Math.PI, { intersectsBlock: () => false });
    check(placed === getBlockTypeById(W.shapeId('oak', 'table', { facing: 'north', part: 'a' })), 'Stół: część A przodem do gracza');
    check(W.shapeInfo(world.getBlockId(-1, 0, 0))?.part === 'b', 'Część B po prawej gracza');
    world.set(5, 0, 0, 'stone'); world.set(4, 0, 0, 'stone');
    check(tables.place({ x: 4, y: 0, z: 1 }, 'oak', Math.PI, { intersectsBlock: () => false }) !== false, 'Wolne miejsce - stoi');
    check(tables.place({ x: 5, y: 0, z: 0 }, 'oak', Math.PI, { intersectsBlock: () => false }) === false, 'Zajęte miejsce - nie stawia');

    inventory.set(0, { type: 'spruce_planks', count: 20 });
    inventory.selected = 0;
    const hitA = { hit: true, block: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 1, z: .5 } };
    check(tables.interact(hitA, 'spruce_planks') && tables.state({ x: 0, y: 0, z: 0 }).count === 20 && !inventory.get(0), 'Deski z ręki na blat');
    check(!tables.canBreak({ x: -1, y: 0, z: 0 }) && !tables.canBreak({ x: 0, y: 0, z: 0 }), 'Z deskami na blacie stołu nie da się rozbić');

    // Część B (x -1): w układzie stołu przodem na północ lewa kolumna to większe x.
    const hitB = (fx, fz) => ({ hit: true, block: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, point: { x: -1 + fx, y: 1, z: fz } });
    check(tables.productUnder({ x: 0, y: 0, z: 0, facing: 'north' }, hitB(.75, .25)) === 0, 'Przód, lewa - schody');
    check(tables.productUnder({ x: 0, y: 0, z: 0, facing: 'north' }, hitB(.25, .25)) === 1, 'Przód, prawa - półblok');
    check(tables.productUnder({ x: 0, y: 0, z: 0, facing: 'north' }, hitB(.75, .75)) === 2, 'Tył, lewa - płot');
    check(tables.productUnder({ x: 0, y: 0, z: 0, facing: 'north' }, hitB(.25, .75)) === 3, 'Tył, prawa - furtka');

    tables.interact(hitB(.75, .25), null);
    check(inventory.count('spruce_stairs') === 2 && tables.state({ x: 0, y: 0, z: 0 }).count === 17, 'Schody: 3 deski -> 2 schody');
    tables.interact(hitB(.25, .25), null, true);
    check(inventory.count('spruce_slab') === 34 && tables.state({ x: 0, y: 0, z: 0 }).count === 0, 'Shift: wszystkie deski na półbloki (17 -> 34)');
    check(tables.canBreak({ x: 0, y: 0, z: 0 }), 'Pusty stół - można rozbić');

    inventory.set(1, { type: 'birch_planks', count: 2 });
    inventory.selected = 1;
    tables.interact(hitA, 'birch_planks');
    tables.interact(hitB(.25, .75), null);
    check(inventory.count('birch_fence_gate') === 0 && /potrzeba 4/.test(game.notices.at(-1)), 'Za mało desek - nic, napis ile trzeba');
    inventory.set(2, { type: 'spruce_planks', count: 5 });
    inventory.selected = 2;
    tables.interact(hitA, 'spruce_planks');
    check(tables.state({ x: 0, y: 0, z: 0 }).planks === 'birch_planks' && /leżą już/.test(game.notices.at(-1)), 'Jeden rodzaj desek naraz');
    tables.interact(hitA, null);
    check(inventory.count('birch_planks') === 2 && tables.state({ x: 0, y: 0, z: 0 }).count === 0, 'Pusta ręka - deski wracają');

    // Zapis.
    tables.state({ x: 0, y: 0, z: 0 }, true);
    Object.assign(tables.state({ x: 0, y: 0, z: 0 }), { planks: 'oak_planks', count: 12 });
    const saved = JSON.parse(JSON.stringify(tables.getState()));
    const again = new CarpenterTables(game, saved);
    check(again.state({ x: 0, y: 0, z: 0 })?.count === 12 && again.state({ x: 0, y: 0, z: 0 }).planks === 'oak_planks', 'Deski na stole w zapisie');
    check(restoreTable({ x: 1, y: 2, z: 3, planks: 'nope', count: 5 }).count === 0 && restoreTable({ x: 1.5 }) === null && restoreTable({ x: 0, y: 0, z: 0, planks: 'oak_planks', count: 999 }).count === TABLE_CAPACITY, 'Uszkodzony zapis - poprawiony');

    // Rozbicie części B - znika A (stół daje się raz).
    Object.assign(tables.state({ x: 0, y: 0, z: 0 }), { planks: null, count: 0 });
    const infoB = W.shapeInfo(world.getBlockId(-1, 0, 0));
    world.set(-1, 0, 0, AIR_ID);
    tables.broken({ x: -1, y: 0, z: 0 }, infoB);
    check(world.getBlockId(0, 0, 0) === AIR_ID, 'Po rozbiciu jednej części znika druga');
}
check(TABLE_PRODUCTS.map((p) => p.kind).join() === 'stairs,slab,fence,gate', 'Cztery wyroby na stole');
{
    // Stół w każdym kierunku: część B zawsze po prawej gracza, A znajduje B.
    for (const [yaw, look] of [[0, 'north'], [Math.PI / 2, 'west'], [Math.PI, 'south'], [-Math.PI / 2, 'east']]) {
        const game = tableGame();
        game.tables.place({ x: 0, y: 0, z: 0 }, 'pine', yaw, { intersectsBlock: () => false });
        const [dx, dz] = W.FACING_VECTOR[W.rightOf(look)];
        const b = W.shapeInfo(game.world.getBlockId(dx, 0, dz));
        check(b?.part === 'b' && game.tables.tableAt({ x: dx, y: 0, z: dz })?.x === 0 && game.tables.tableAt({ x: dx, y: 0, z: dz })?.z === 0, `Stół (patrzy ${look}): części razem`);
    }
}

console.log(`OK: stolarstwo - ${checks} sprawdzeń (bloki, kształty, kolizje, stawianie, stół stolarski).`);
