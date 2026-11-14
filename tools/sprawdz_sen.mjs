// ------------------------------------------------------------
// SPRAWDZENIE NOCY I SNU (0.98.0)
//
// - bloki: łóżka 20 rodzajów drewna (numery 11820-12459: kierunek x część
//   x pościel), posłania (12460-12475), nazwy, łup (stelaż i pościel
//   osobno), przedmioty i przepisy (słoma, pościel słomiana i lniana),
// - kształty: stelaż bez materaca, pościelone łóżko z materacem i poduszką
//   w osobnej teksturze, posłanie płaskie i bez kolizji, modele ikon,
// - stawianie: dwa bloki (nogi przy graczu, wezgłowie dalej), potrzebne
//   podłoże i miejsce; rozbicie jednej części zabiera drugą,
// - ścielenie: pościel z ręki na stelaż, miejsce do spania,
// - potrójny warsztat: trzy stoły w rzędzie, stelaż z 8 desek na trzecim,
// - wyspanie (Wellbeing): ubywa na jawie (nocą szybciej), stany, sen na
//   ziemi / posłaniu / w łóżku, premia za wygodę, zapis,
// - sen (Sleep): tylko nocą, przeskok do 6:00 dla jednego gracza,
//   wcześniejsza pobudka, gra ze znajomymi (wszyscy śpią albo czas płynie),
//   flaga "śpi" w stanie gracza.
//
// Uruchomienie: node tools/sprawdz_sen.mjs
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
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer {}; export const TABLE_ROTATION = {};' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const { WOODS } = await import('../src/blocks/woods.js');
const W = await import('../src/blocks/woodShapes.js');
const { BEDDINGS, MAT_FIRST_ID, beddingOf, beddingItem, matId } = await import('../src/blocks/bedding.js');
const { shapeBoxes, BED_TOP, MAT_TOP } = await import('../src/world/ShapeBoxes.js');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId, isOpaqueId, getDropType, AIR_ID } = await import('../src/blocks/BlockRegistry.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { CarpenterTables, BENCH_PRODUCTS } = await import('../src/game/CarpenterTables.js');
const { Beds } = await import('../src/game/Beds.js');
const { Sleep, nextWake, WAKE_HOUR, SLEEP_FADE_SECONDS } = await import('../src/game/Sleep.js');
const { Wellbeing, isNight, REST_START, REST_STATES, SLEEP_PLACES, COMFORT, NIGHT_FROM, NIGHT_UNTIL } = await import('../src/game/Wellbeing.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { itemShapeFaces } = await import('../src/rendering/ShapeGeometry.js');
const { packPlayer, unpackPlayer } = await import('../src/net/protocol.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);
const STONE = getBlockId('stone');
const FACINGS = ['north', 'east', 'south', 'west'];
const volume = (boxes) => boxes.reduce((sum, b) => sum + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0);


// --- Bloki -----------------------------------------------------------------

{
    const ids = new Set();
    WOODS.forEach(({ wood }, index) => {
        const item = W.shapeBaseType(wood, 'bed');
        const definition = getBlockDefinition(item);
        check(item === `${wood}_bed` && definition?.inventory !== false, `${item}: przedmiot (sam stelaż)`);
        check(/^Łóżko .+ \(stelaż\)$/.test(definition.label), `${item}: nazwa "${definition.label}"`);
        check(itemShapeFaces(item)?.length > 0, `${item}: model (ikonka, dłoń)`);
        for (const facing of FACINGS) for (const part of W.BED_PARTS) for (const bedding of W.BED_BEDDINGS) {
            const id = W.shapeId(wood, 'bed', { facing, part, bedding });
            const info = W.shapeInfo(id);
            ids.add(id);
            check(id >= W.BED_FIRST_ID + index * W.BEDS_PER_WOOD && id < W.BED_FIRST_ID + (index + 1) * W.BEDS_PER_WOOD, `${wood}: numer łóżka w swoim zakresie`);
            check(info?.kind === 'bed' && info.wood === wood && info.facing === facing && info.part === part && (info.bedding ?? null) === bedding,
                `${wood} ${facing} ${part} ${bedding}: opis kształtu`);
            const type = getBlockTypeById(id);
            check(getDropType(type) === item, `${type}: daje stelaż`);
            const loot = getBlockDefinition(type).loot ?? [];
            check(bedding ? loot.length === 1 && loot[0][0] === beddingItem(bedding) && loot[0][1] === 1 : loot.length === 0,
                `${type}: pościel wypada osobno tylko z pościelonego`);
            check(!isOpaqueId(id) && isSolidId(id), `${type}: nie zasłania, ale zatrzymuje`);
        }
    });
    check(ids.size === 20 * 4 * 2 * 3 && Math.min(...ids) === 11820 && Math.max(...ids) < 12460, 'Łóżka: 480 numerów w zakresie 11820-12459');
    check(W.BED_BEDDING_SLOTS === 4 && W.BED_BEDDINGS.length <= W.BED_BEDDING_SLOTS, 'Miejsce na czwartą pościel');
    check(getBlockDefinition('oak_bed_north_head_linen').label === 'Łóżko dębowe (pościelone)', 'Nazwa pościelonego łóżka');

    const mats = new Set();
    for (const bedding of Object.keys(BEDDINGS)) {
        const item = beddingItem(bedding);
        check(beddingOf(item) === bedding && getBlockDefinition(item)?.inventory !== false, `${item}: przedmiot`);
        check(itemShapeFaces(item)?.length > 0, `${item}: model (ikonka, dłoń)`);
        for (const facing of FACINGS) for (const part of W.BED_PARTS) {
            const id = matId(bedding, facing, part), info = W.shapeInfo(id);
            mats.add(id);
            check(info?.kind === 'mat' && info.facing === facing && info.part === part && info.bedding === bedding, `Posłanie ${bedding} ${facing} ${part}`);
            check(getDropType(getBlockTypeById(id)) === item, `Posłanie ${bedding}: daje pościel`);
        }
    }
    check(mats.size === 16 && Math.min(...mats) === MAT_FIRST_ID && Math.max(...mats) === 12475, 'Posłania: numery 12460-12475');
    check(beddingOf('oak_planks') === null && beddingOf(null) === null && beddingOf('silk_bedding') === null, 'Pościelą jest tylko pościel');
    check(BEDDINGS.linen.comfort > BEDDINGS.straw.comfort && Object.values(BEDDINGS).every((b) => Object.hasOwn(COMFORT, b.comfort)), 'Len wygodniejszy od słomy');

    check(itemExists('straw') && getItemLabel('straw') === 'Słoma', 'Słoma jest przedmiotem');
    check(findRecipe(['short_grass', 'tall_grass'])?.result[0] === 'straw', 'Słoma z dwóch traw');
    check(findRecipe(['straw', 'straw', 'straw', 'straw'])?.result[0] === 'straw_bedding', 'Słomiana pościel z czterech wiązek słomy');
    check(findRecipe(['len_wiazka', 'len_wiazka', 'len_wiazka', 'len_wiazka'])?.result[0] === 'linen_bedding', 'Lniana pościel z czterech wiązek lnu');
}


// --- Kształty ----------------------------------------------------------------

{
    const frame = (part, facing = 'north') => shapeBoxes(W.shapeId('oak', 'bed', { facing, part }));
    const made = (part, bedding = 'straw', facing = 'north') => shapeBoxes(W.shapeId('oak', 'bed', { facing, part, bedding }));
    const top = (boxes) => Math.max(...boxes.map((b) => b[4]));
    check(top(frame('head')) > top(frame('foot')) && top(frame('head')) >= 14 / 16, 'Wezgłowie wyższe od szczytu w nogach');
    check(frame('foot').every((b) => !b[6]) && frame('head').every((b) => !b[6]), 'Stelaż: samo drewno');
    const bedding = made('head').filter((b) => b[6] === 1);
    check(bedding.length === 2 && made('foot').filter((b) => b[6] === 1).length === 1, 'Pościelone: materac w obu częściach, poduszka przy wezgłowiu');
    check(made('head').length === frame('head').length + 2, 'Pościel dokłada pudełka, stelaż zostaje ten sam');
    near(Math.max(...bedding.map((b) => b[4])), 12 / 16, 'Poduszka sięga 12 px');
    near(Math.max(...made('foot').filter((b) => b[6] === 1).map((b) => b[4])), BED_TOP, 'Materac na wysokości miejsca do spania');
    check(getBlockDefinition('oak_bed_north_head_straw').shapeTextures?.[0] === 'bedding_straw'
        && getBlockDefinition('oak_bed_north_head_linen').shapeTextures?.[0] === 'bedding_linen', 'Pościel ma własną teksturę');
    for (const facing of FACINGS) {
        const boxes = [...frame('head', facing), ...frame('foot', facing)];
        check(boxes.every((b) => b.slice(0, 6).every((v) => v >= -1e-9 && v <= 1 + 1e-9)), `Stelaż ${facing}: w granicach bloku`);
    }
    // Wezgłowie stoi po stronie kierunku łóżka (na północ: z bliżej 0).
    const headboard = (facing) => frame('head', facing).reduce((a, b) => (b[4] > a[4] ? b : a));
    check(headboard('north')[5] <= .25 && headboard('south')[2] >= .75 && headboard('east')[0] >= .75 && headboard('west')[3] <= .25, 'Wezgłowie po stronie kierunku');
    const collision = shapeBoxes(W.shapeId('oak', 'bed', { part: 'foot', bedding: 'linen' }), 'collision');
    near(volume(collision), .5, 'Kolizja łóżka: pół bloku (wchodzi się bez skoku)');
    // Celowanie: bryła bez szpary pod stelażem (promień nie przelatuje pod łóżkiem).
    const outline = shapeBoxes(W.shapeId('oak', 'bed', { part: 'foot' }), 'outline');
    check(outline.some((b) => b[1] === 0 && b[0] === 0 && b[3] === 1 && b[2] === 0 && b[5] === 1) && top(outline) === top(frame('foot')), 'Obrys łóżka: pełna skrzynia i szczyt');
    const mat = shapeBoxes(matId('straw', 'north', 'foot'));
    near(top(mat), MAT_TOP, 'Posłanie: 2 px grubości');
    check(shapeBoxes(matId('straw', 'north', 'head')).length === 2, 'Posłanie: przy głowie zgrubienie (poduszka)');
    check(shapeBoxes(matId('linen', 'east', 'foot'), 'collision').length === 0, 'Posłanie nie zatrzymuje');
}


// --- Stawianie, ścielenie, rozbijanie --------------------------------------------

function makeGame(mode = 'adventure') {
    const blocks = new Map();
    const world = {
        blocks,
        set(x, y, z, id) { blocks.set(`${x},${y},${z}`, typeof id === 'string' ? getBlockId(id) : id); },
        getBlockId(x, y, z) { return blocks.get(`${x},${y},${z}`) ?? (y < 0 ? STONE : AIR_ID); },
        isSolid(x, y, z) { return isSolidId(this.getBlockId(x, y, z)); },
        setBlock(x, y, z, type) { this.set(x, y, z, type ?? AIR_ID); return true; },
        getChunk: () => ({}),
        toChunkCoord: (v) => Math.floor(v / 16)
    };
    const notices = [], achieved = [];
    const game = { world, mode, inventory: Inventory.load({}, mode), player: { yaw: Math.PI },
        onNotice: (text) => notices.push(text), notices, playBlockSound() {}, achieve: (name, detail) => achieved.push([name, detail]), achieved };
    game.beds = new Beds(game);
    game.tables = new CarpenterTables(game, []);
    return game;
}
const free = { intersectsBlock: () => false };
const hitTop = (x, z, y = 0) => ({ hit: true, block: { x, y, z }, normal: { x: 0, y: 1, z: 0 }, point: { x: x + .5, y: y + 1, z: z + .5 } });

{
    const game = makeGame();
    const { beds, world, inventory } = game;
    // Gracz patrzy na południe (+z): nogi przy nim, wezgłowie blok dalej.
    const placed = beds.placeBed({ x: 0, y: 0, z: 0 }, 'birch', Math.PI, free);
    check(placed === 'birch_bed_south_foot', `Stelaż: nogi w klikniętym bloku (${placed})`);
    check(getBlockTypeById(world.getBlockId(0, 0, 1)) === 'birch_bed_south_head', 'Wezgłowie dalej, w stronę patrzenia');
    for (const [yaw, facing] of [[0, 'north'], [Math.PI / 2, 'west'], [-Math.PI / 2, 'east']]) {
        const other = makeGame();
        other.beds.placeBed({ x: 0, y: 0, z: 0 }, 'oak', yaw, free);
        const [dx, dz] = W.FACING_VECTOR[facing];
        const head = W.shapeInfo(other.world.getBlockId(dx, 0, dz));
        check(head?.part === 'head' && head.facing === facing, `Stelaż (patrzy ${facing}): wezgłowie z przodu`);
        const whole = other.beds.whole({ x: dx, y: 0, z: dz });
        check(whole.foot.x === 0 && whole.foot.z === 0 && whole.head.x === dx && whole.head.z === dz, `Stelaż (${facing}): obie części razem`);
    }
    check(beds.placeBed({ x: 0, y: 0, z: -1 }, 'oak', Math.PI, free) === false, 'Zajęte miejsce na wezgłowie - nie stawia');
    check(beds.placeBed({ x: 5, y: 3, z: 0 }, 'oak', Math.PI, free) === false, 'W powietrzu - nie stawia');
    world.set(8, -1, 1, AIR_ID);
    check(beds.placeBed({ x: 8, y: 0, z: 0 }, 'oak', Math.PI, free) === false && world.getBlockId(8, 0, 0) === AIR_ID, 'Dziura pod wezgłowiem - nie stawia żadnej części');
    check(beds.placeBed({ x: 3, y: 0, z: 0 }, 'oak', Math.PI, { intersectsBlock: (x, y, z) => x === 3 && z === 1 }) === false, 'Gracz w miejscu łóżka - nie stawia');
    world.set(6, 0, 0, 'short_grass');
    check(beds.placeBed({ x: 6, y: 0, z: 0 }, 'oak', Math.PI, free) !== false, 'Trawa nie przeszkadza');

    // Sam stelaż: bez pościeli tylko podpowiedź.
    game.sleep = { start(spot) { game.spot = spot; return true; } };
    check(beds.interact(hitTop(0, 1), null) && /pościel/.test(game.notices.at(-1)) && !game.spot, 'PPM na stelażu - podpowiedź, bez snu');
    check(beds.interact(hitTop(0, 0), 'oak_planks') && !game.spot && W.shapeInfo(world.getBlockId(0, 0, 0)).bedding === null, 'Deski to nie pościel');
    inventory.set(0, { type: 'linen_bedding', count: 2 });
    inventory.selected = 0;
    check(beds.interact(hitTop(0, 1), 'linen_bedding'), 'PPM pościelą na stelażu');
    check(getBlockTypeById(world.getBlockId(0, 0, 0)) === 'birch_bed_south_foot_linen'
        && getBlockTypeById(world.getBlockId(0, 0, 1)) === 'birch_bed_south_head_linen', 'Obie części pościelone, kierunek i drewno zostają');
    check(inventory.get(0).count === 1, 'Pościel ubywa z ręki');
    check(game.achieved.at(-1)[0] === 'bedMade' && game.achieved.at(-1)[1].bedding === 'linen', 'Zdarzenie: łóżko pościelone');
    check(beds.interact(hitTop(0, 0), 'linen_bedding') && inventory.get(0).count === 1, 'Pościelonego nie ścieli się drugi raz');
    const spot = game.spot;
    check(spot?.place === 'bed' && spot.comfort === 2, 'PPM na pościelonym łóżku - sen w łóżku, wygoda lnu');
    near(spot.y, BED_TOP, 'Gracz leży na materacu');
    check(spot.x === .5 && spot.z > 0 && spot.z < .5, `Stopy przy nogach łóżka (z ${spot.z})`);
    // Patrzy w stronę (-sin, -cos): głowa ma wypaść nad wezgłowiem (+z), więc stopy patrzą na -z.
    near(-Math.cos(spot.yaw), -1, 'Leży głową do wezgłowia');
    {
        const creative = makeGame('creative');
        creative.beds.placeBed({ x: 0, y: 0, z: 0 }, 'oak', 0, free);
        creative.inventory.set(0, { type: 'straw_bedding', count: 1 });
        creative.inventory.selected = 0;
        creative.beds.interact(hitTop(0, 0), 'straw_bedding');
        check(creative.inventory.get(0)?.count === 1 && W.shapeInfo(creative.world.getBlockId(0, 0, -1)).bedding === 'straw', 'Tryb kreatywny: pościel nie ubywa');
    }

    // Rozbicie jednej części zabiera drugą (łup daje rozbita: stelaż + pościel).
    const info = W.shapeInfo(world.getBlockId(0, 0, 1));
    world.setBlock(0, 0, 1, null);
    beds.broken({ x: 0, y: 0, z: 1 }, info);
    check(world.getBlockId(0, 0, 0) === AIR_ID, 'Rozbite wezgłowie - znikają też nogi');
    beds.placeBed({ x: 0, y: 0, z: 0 }, 'oak', Math.PI, free);
    beds.placeBed({ x: 0, y: 0, z: 2 }, 'oak', Math.PI, free);          // drugie łóżko tuż za pierwszym
    const footInfo = W.shapeInfo(world.getBlockId(0, 0, 2));
    world.setBlock(0, 0, 2, null);
    beds.broken({ x: 0, y: 0, z: 2 }, footInfo);
    check(world.getBlockId(0, 0, 3) === AIR_ID && world.getBlockId(0, 0, 1) !== AIR_ID && world.getBlockId(0, 0, 0) !== AIR_ID,
        'Rozbite nogi - znika tylko własne wezgłowie, sąsiednie łóżko stoi');

    // Posłanie na ziemi.
    const mat = beds.placeMat({ x: 4, y: 0, z: 4 }, 'straw', Math.PI, free);
    check(mat === 'straw_bedding_south_foot' && getBlockTypeById(world.getBlockId(4, 0, 5)) === 'straw_bedding_south_head', 'Posłanie: dwa bloki, głowa dalej');
    game.spot = null;
    check(beds.interact(hitTop(4, 5), null) && game.spot?.place === 'mat' && game.spot.comfort === 0, 'PPM na posłaniu - sen na posłaniu (bez premii)');
    near(game.spot.y, MAT_TOP, 'Gracz leży na posłaniu');
    const matInfo = W.shapeInfo(world.getBlockId(4, 0, 4));
    world.setBlock(4, 0, 4, null);
    beds.broken({ x: 4, y: 0, z: 4 }, matInfo);
    check(world.getBlockId(4, 0, 5) === AIR_ID, 'Zwinięte posłanie znika całe');
    check(beds.interact(hitTop(9, 9), null) === false && beds.interact(null, null) === false, 'Zwykły blok - to nie łóżko');
}


// --- Potrójny warsztat -----------------------------------------------------------

{
    const game = makeGame();
    const { tables, inventory } = game;
    // Trzy stoły jeden za drugim: A (0,z), B (-1,z) dla z = 0, 1, 2.
    for (const z of [0, 1, 2]) tables.place({ x: 0, y: 0, z }, 'oak', Math.PI, free);
    const table = (z) => tables.tableAt({ x: 0, y: 0, z });
    check(tables.row(table(1)).map((t) => t.z).sort().join() === '0,1,2' && tables.row(table(2)).length === 3, 'Trzy stoły w rzędzie');
    check(tables.bench(table(0)) === null, 'Puste stoły - bez układu');
    inventory.set(0, { type: 'maple_planks', count: 20 });
    inventory.selected = 0;
    tables.interact(hitTop(0, 0), 'maple_planks', true);
    const bench = tables.bench(table(2));
    check(bench?.primary.z === 0 && bench.planks.z === 0, 'Deski na skrajnym stole - potrójny warsztat');
    check(bench.trapdoor.x === 0 && bench.trapdoor.z === 1 && bench.door.map((c) => `${c.x},${c.z}`).join(' ') === '-1,0 -1,1', 'Drzwi i klapa jak w podwójnym');
    check(bench.bed.map((c) => `${c.x},${c.z}`).sort().join(' ') === '-1,2 0,2', 'Stelaż łóżka na trzecim stole');
    check(BENCH_PRODUCTS.bed.kind === 'bed' && BENCH_PRODUCTS.bed.planks === 8 && BENCH_PRODUCTS.bed.count === 1, 'Stelaż: 8 desek -> 1');
    tables.interact(hitTop(-1, 2), null);
    check(inventory.count('maple_bed') === 1 && tables.state(table(0)).count === 12, 'PPM na trzecim stole - stelaż z desek (20 -> 12)');
    tables.interact(hitTop(0, 2), null);
    check(inventory.count('maple_bed') === 2 && tables.state(table(0)).count === 4, 'Drugi blok trzeciego stołu - też stelaż (12 -> 4)');
    tables.interact(hitTop(0, 2), null);
    check(inventory.count('maple_bed') === 2 && /potrzeba 8/.test(game.notices.at(-1)), 'Za mało desek na trzeci stelaż');
    tables.interact(hitTop(0, 1), null);
    check(inventory.count('maple_trapdoor') === 1 && tables.state(table(0)).count === 1, 'Klapa dalej działa (4 -> 1)');
    {
        // Deski na środkowym stole: drzwi po jednej stronie, łóżko po drugiej.
        const other = makeGame();
        for (const z of [0, 1, 2]) other.tables.place({ x: 0, y: 0, z }, 'oak', Math.PI, free);
        other.inventory.set(0, { type: 'oak_planks', count: 8 });
        other.inventory.selected = 0;
        other.tables.interact(hitTop(0, 1), 'oak_planks', true);
        const layout = other.tables.bench(other.tables.tableAt({ x: 0, y: 0, z: 0 }));
        check(layout?.planks.z === 1 && layout.bed.every((c) => c.z !== layout.trapdoor.z && c.z !== 1), 'Deski na środku - łóżko na stole naprzeciw klapy');
        other.tables.interact({ ...hitTop(layout.bed[0].x, layout.bed[0].z) }, null);
        check(other.inventory.count('oak_bed') === 1, 'Stelaż z desek ze środkowego stołu');
    }
    {
        // Dwa stoły: bez łóżka.
        const two = makeGame();
        for (const z of [0, 1]) two.tables.place({ x: 0, y: 0, z }, 'oak', Math.PI, free);
        two.inventory.set(0, { type: 'oak_planks', count: 8 });
        two.inventory.selected = 0;
        two.tables.interact(hitTop(0, 0), 'oak_planks', true);
        check(two.tables.bench(two.tables.tableAt({ x: 0, y: 0, z: 0 }))?.bed === null, 'Dwa stoły - sam podwójny warsztat, bez łóżka');
    }
}


// --- Wyspanie (Wellbeing) -------------------------------------------------------

const DAY = 1200, HOUR = 50;
const fresh = (saved, days = 0) => Wellbeing.load(saved, days, () => 0.5);
function run(w, seconds, activity, clock, dt = 0.5) {
    const events = [];
    for (let t = 0; t < seconds; t += dt) {
        clock.days += dt / DAY;
        events.push(...w.update(dt, activity, clock.days));
    }
    return events;
}

{
    check(isNight(19 / 24) && isNight(0.99) && isNight(1.1) && !isNight(5 / 24 + 1e-6) && !isNight(0.5) && !isNight(18.9 / 24), `Noc: ${NIGHT_FROM}:00-${NIGHT_UNTIL}:00`);
    const w = fresh({ energy: 100, condition: 100 }, 6 / 24);
    check(w.rest === REST_START && w.restState === 'rested', 'Nowy gracz jest wypoczęty');
    const clock = { days: 6 / 24 };
    run(w, 13 * HOUR, {}, clock);                                        // 6:00 -> 19:00
    near(w.rest, REST_START - 13 * 60 / 16, 'Dzień na nogach: 60 punktów na 16 godzin', 0.2);
    const before = w.rest;
    run(w, 2 * HOUR, {}, clock);                                         // 19:00 -> 21:00
    near(before - w.rest, 2 * 60 / 16 * 1.6, 'Nocą wyspanie ubywa szybciej', 0.2);
    const asleep = w.rest;
    run(w, 2 * HOUR, { sleeping: true }, clock);
    check(w.rest === asleep, 'We śnie wyspanie nie ubywa');

    // Stany i ich skutki.
    const tired = fresh({ energy: 100, condition: 100, rest: 36 }, 0.3);
    const events = run(tired, 60, {}, { days: 0.3 });
    check(events.some((e) => e.type === 'rest' && e.from === 'ok' && e.to === 'sleepy') && tired.restState === 'sleepy', 'Zdarzenie: gracz robi się senny');
    check(tired.effects.sprint < 1 && tired.effects.work < 1 && tired.effects.dim === 0, 'Senny: wolniejszy bieg i praca');
    const worn = fresh({ energy: 100, condition: 100, rest: 5 }, 0.3);
    check(worn.restState === 'worn' && worn.effects.sprint <= .6 && worn.effects.dim > 0, 'Niewyspany: dużo wolniej i ciemniej w oczach');
    check(worn.describe().rest === REST_STATES.worn.label, 'Opis stanu: wyspanie');
    worn.active = false;
    check(worn.effects.sprint === 1 && worn.effects.dim === 0, 'Tryb kreatywny: bez skutków');

    // Sen: im wygodniej, tym lepiej.
    const sleepIn = (place, comfort, hours = 9, rest = 20) => {
        const s = fresh({ energy: 80, condition: 100, rest }, 0.9);
        return [s, s.sleep(hours, place, comfort, 1.25)];
    };
    const [ground, onGround] = sleepIn('ground', 0);
    const [, onMat] = sleepIn('mat', 0);
    const [bed, inBed] = sleepIn('bed', 2);
    check(onGround.rest === SLEEP_PLACES.ground.cap && onGround.state === 'ok' && onGround.comfort === 0, `Goła ziemia: najwyżej ${SLEEP_PLACES.ground.cap} - "w normie"`);
    check(onMat.rest === SLEEP_PLACES.mat.cap && onMat.state === 'rested' && onMat.comfort === 0, 'Posłanie: wypoczęty, bez premii');
    check(inBed.rest === 100 && inBed.comfort === 2 && bed.describe().comfort === COMFORT[2].label, 'Łóżko z lnem: pełne wyspanie i premia');
    check(onGround.rest < onMat.rest && onMat.rest < inBed.rest, 'Ziemia < posłanie < łóżko');
    near(ground.energy, 80 - 9 * 0.6, 'Sen zużywa mało energii');
    check(bed.effects.work > 1 && sleepIn('bed', 1)[0].effects.work > 1 && sleepIn('bed', 1)[0].effects.work < bed.effects.work, 'Premia za wygodę: szybsza praca (len > słoma)');
    check(sleepIn('bed', 2, 3)[1].comfort === 0, 'Drzemka poniżej 4 godzin - bez premii');
    check(sleepIn('mat', 2)[1].comfort === 0 && sleepIn('ground', 2)[1].comfort === 0, 'Premia tylko w łóżku');
    const [short, nap] = sleepIn('bed', 1, 2, 20);
    near(nap.rest, 20 + 2 * 14, 'Krótki sen: 14 punktów na godzinę w łóżku');
    check(sleepIn('ground', 0, 9, 75)[1].rest === 75, 'Sen na ziemi nie zabiera wyspania wypoczętemu');
    check(short.sleep(0, 'bed', 2).rest === nap.rest, 'Zero godzin - nic się nie zmienia');

    // Premia mija po ok. pół doby; wolniejsze zużycie energii.
    const plain = fresh({ energy: 80, condition: 100, rest: 100 }, 1.25), cosy = fresh({ energy: 80, condition: 100, rest: 100, comfort: 2, comfortUntil: 1.85 }, 1.25);
    run(plain, 4 * HOUR, {}, { days: 1.25 });
    const cosyClock = { days: 1.25 };
    run(cosy, 4 * HOUR, {}, cosyClock);
    check(cosy.energy > plain.energy, 'Po wygodnej nocy energia schodzi wolniej');
    run(cosy, 12 * HOUR, {}, cosyClock);
    check(cosy.data.comfort === 0 && cosy.describe().comfort === null, 'Premia za wygodę mija w ciągu dnia');

    // Zapis i odczyt, uszkodzone pola.
    const saved = JSON.parse(JSON.stringify(bed.data));
    const loaded = fresh(saved, 1.25);
    check(loaded.rest === 100 && loaded.data.comfort === 2 && loaded.data.comfortUntil === bed.data.comfortUntil, 'Wyspanie i premia zapisują się');
    const broken = fresh({ rest: 'dużo', comfort: 7, comfortUntil: 'jutro' }, 0);
    check(broken.rest === REST_START && broken.data.comfort === 0 && broken.data.comfortUntil === 0, 'Uszkodzony zapis - wartości początkowe');
    check(fresh({ rest: 500 }).rest === 100 && fresh({ rest: -4 }).rest === 0, 'Wyspanie w granicach 0-100');
}


// --- Sen (Sleep) ------------------------------------------------------------------

function sleepGame(days, { rest = 20, net = null } = {}) {
    const notices = [], messages = [], signals = [], achieved = [];
    const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    const game = {
        time: { days }, net,
        player: { pos: vector(), vel: vector(), yaw: 1, pitch: .4, swimming: false, flying: false },
        wellbeing: fresh({ energy: 80, condition: 100, rest }, days),
        blackout: { active: false },
        onNotice: (text) => notices.push(text), onMessage: (text) => messages.push(text), onWellbeing: (signal) => signals.push(signal),
        achieve: (name, detail) => achieved.push([name, detail]), stopMining() { game.stopped = true; },
        notices, messages, signals, achieved
    };
    game.sleep = new Sleep(game);
    return game;
}
const quiet = { isKeyDown: () => false, consumeMousePress: () => false };
// Krok gry: czas płynie tak jak w grze (1200 s na dobę).
function tick(game, seconds, input = quiet, dt = 0.1) {
    let frozen = false;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
        game.time.days += dt / DAY;
        frozen = game.sleep.update(dt, input);
    }
    return frozen;
}

{
    near(nextWake(0.9), 1 + WAKE_HOUR / 24, 'Wieczorem: pobudka następnego dnia o 6:00');
    near(nextWake(2.1), 2 + WAKE_HOUR / 24, 'Po północy: pobudka tego samego dnia');

    const day = sleepGame(0.5);
    check(day.sleep.start({ place: 'ground', comfort: 0 }) === false && /nocą/.test(day.notices.at(-1)) && !day.sleep.active, 'W dzień nie da się zasnąć');
    const swim = sleepGame(0.9);
    swim.player.swimming = true;
    check(swim.sleep.startOnGround() === false && !swim.sleep.active, 'W wodzie nie da się zasnąć');
    const out = sleepGame(0.9);
    out.blackout.active = true;
    check(out.sleep.startOnGround() === false, 'Nieprzytomny nie kładzie się spać');

    // Jeden gracz, łóżko z lnem, 21:36 -> 6:00.
    const game = sleepGame(0.9);
    const spot = { place: 'bed', comfort: 2, x: 3.5, y: 10 / 16, z: 7.2, yaw: Math.PI };
    check(game.sleep.start(spot) && game.sleep.lying && !game.sleep.asleep && game.stopped, 'Gracz kładzie się (obraz gaśnie)');
    check(game.player.pos.x === 3.5 && game.player.pos.z === 7.2 && game.player.yaw === Math.PI && game.player.pitch === 0, 'Gracz przeniesiony na łóżko');
    check(/w łóżku/.test(game.notices.at(-1)), 'Komunikat: gdzie się kładzie');
    check(game.sleep.start(spot) === false, 'Drugi raz się nie kładzie');
    check(tick(game, SLEEP_FADE_SECONDS) && game.sleep.asleep, 'Po zgaśnięciu obrazu śpi');
    check(tick(game, 0.5) && game.time.days < 1, 'Chwila snu przed przeskokiem nocy');
    check(tick(game, 0.6) && !game.sleep.lying && game.sleep.active, 'Noc przeskoczyła - pobudka (obraz wraca)');
    near(game.time.days, 1 + WAKE_HOUR / 24, 'Jest 6:00 następnego dnia');
    check(game.wellbeing.rest === 100 && game.wellbeing.data.comfort === 2, 'Wyspany, z premią za wygodę');
    check(/wypoczęty/.test(game.messages.at(-1)) && /doda ci dziś sił/.test(game.messages.at(-1)), `Wiadomość po pobudce: "${game.messages.at(-1)}"`);
    check(game.signals.at(-1).type === 'woke' && game.signals.at(-1).comfort === 2, 'Sygnał dla serduszka');
    const slept = game.achieved.at(-1);
    check(slept[0] === 'slept' && slept[1].place === 'bed' && slept[1].hours > 8 && !slept[1].early, 'Zdarzenie: przespana noc');
    check(tick(game, SLEEP_FADE_SECONDS) === false && !game.sleep.active, 'Po pobudce gracz znów steruje');

    check(game.player.lying === false, 'Gracz już nie leży');
    {
        const stopped = sleepGame(0.9);
        stopped.sleep.startOnGround();
        check(stopped.player.lying === true, 'Leżący gracz: oczy nad posłaniem');
        const rest = stopped.wellbeing.rest;
        stopped.sleep.cancel();
        check(!stopped.sleep.active && stopped.player.lying === false && stopped.wellbeing.rest === rest, 'Przerwany sen (utrata przytomności) - bez wyspania');
    }

    // Goła ziemia: gracz zostaje, gdzie stał, rada na rano.
    const ground = sleepGame(0.95);
    ground.player.pos.set(1, 2, 3);
    ground.sleep.startOnGround();
    check(ground.player.pos.x === 1 && ground.player.pos.y === 2 && ground.player.yaw === 1 && ground.player.pitch === 0, 'Na ziemi: bez przenoszenia');
    {
        // Ściana za plecami (gracz patrzy na -z, głowa wypadłaby na +z): obrót w wolną stronę.
        const wall = sleepGame(0.95);
        wall.player.pos.set(0.5, 0, 0.5); wall.player.yaw = 0;
        const solid = new Set(['0,0,1']);
        wall.world = { isSolid: (x, y, z) => solid.has(`${x},${y},${z}`) };
        near(wall.sleep.groundYaw(), Math.PI / 2, 'Ściana za plecami - gracz kładzie się bokiem');
        solid.add('1,0,0'); solid.add('-1,0,0');
        near(wall.sleep.groundYaw(), Math.PI, 'Ściany z trzech stron - głową w jedyną wolną');
        solid.add('0,0,-1');
        check(wall.sleep.groundYaw() === 0, 'Ciasna nora - kładzie się, jak stoi');
    }
    tick(ground, SLEEP_FADE_SECONDS + 1.2);
    check(ground.wellbeing.rest === SLEEP_PLACES.ground.cap && /posłanie ze słomy/.test(ground.messages.at(-1)), 'Na ziemi: słabe wyspanie i rada');

    // Wcześniejsza pobudka: ruch przed przeskokiem (gość w sieci - noc nie przeskakuje).
    const guest = sleepGame(0.9, { net: { isHost: false, players: { players: new Map() } } });
    guest.sleep.start({ place: 'mat', comfort: 0 });
    check(guest.sleep.canSkip() === false, 'Gość nie przesuwa czasu');
    tick(guest, SLEEP_FADE_SECONDS + 3);
    check(guest.sleep.asleep && guest.time.days < 0.91 && guest.sleep.waiting, 'Gość śpi, czas płynie zwyczajnie');
    const before = guest.wellbeing.rest;
    tick(guest, 0.1, { isKeyDown: (code) => code === 'KeyW', consumeMousePress: () => false });
    check(!guest.sleep.lying && guest.wellbeing.rest - before < 2 && /zanim zdążyłeś zasnąć/.test(guest.notices.at(-1)), 'Ruch budzi; po chwili snu prawie nic nie przybywa');
    check(guest.achieved.at(-1)[1].early === true, 'Zdarzenie zna wcześniejszą pobudkę');
    {
        // Gość przesypia noc: budzi się, gdy gospodarz przestawi czas na rano.
        const waiting = sleepGame(0.9, { net: { isHost: false, players: { players: new Map() } } });
        waiting.sleep.start({ place: 'bed', comfort: 1 });
        tick(waiting, SLEEP_FADE_SECONDS + 2);
        waiting.time.days = 1.25;                                        // czas od gospodarza
        tick(waiting, 0.1);
        check(!waiting.sleep.lying && waiting.wellbeing.rest === 100 && waiting.wellbeing.data.comfort === 1, 'Gość budzi się rano razem z gospodarzem');
        const click = sleepGame(0.9, { net: { isHost: false, players: { players: new Map() } } });
        click.sleep.start({ place: 'mat', comfort: 0 });
        tick(click, SLEEP_FADE_SECONDS + 0.5);
        tick(click, 0.1, { isKeyDown: () => false, consumeMousePress: () => true });
        check(click.sleep.asleep, 'Pierwsza sekunda snu: kliknięcie jeszcze nie budzi');
        tick(click, 0.6);
        check(click.sleep.asleep, 'Kliknięcie sprzed zaśnięcia przepada');
        tick(click, 0.1, { isKeyDown: () => false, consumeMousePress: (button) => button === 0 });
        check(!click.sleep.lying, 'Kliknięcie budzi');
        // Kucanie trzymane od położenia się nie budzi; puszczone i wciśnięte znowu - tak.
        const crouch = sleepGame(0.9, { net: { isHost: false, players: { players: new Map() } } });
        const holding = { isKeyDown: (code) => code === 'ShiftLeft', consumeMousePress: () => false };
        crouch.sleep.startOnGround();
        tick(crouch, SLEEP_FADE_SECONDS + 2, holding);
        check(crouch.sleep.asleep, 'Trzymane kucanie nie budzi');
        tick(crouch, 0.2);
        tick(crouch, 0.1, holding);
        check(!crouch.sleep.lying, 'Puszczone i wciśnięte znowu - budzi');
    }

    // Gospodarz: noc przeskakuje dopiero, gdy śpią wszyscy.
    const players = new Map([['a', { state: { sleeping: false } }], ['b', { state: { sleeping: true } }]]);
    let announced = 0;
    const host = sleepGame(0.9, { net: { isHost: true, players: { players }, timeChanged() { announced++; } } });
    host.sleep.start({ place: 'bed', comfort: 1 });
    tick(host, SLEEP_FADE_SECONDS + 3);
    check(host.sleep.asleep && host.time.days < 0.91 && announced === 0 && host.sleep.waiting, 'Gospodarz czeka, aż zasną wszyscy');
    players.get('a').state.sleeping = true;
    tick(host, 0.1);
    check(!host.sleep.lying && Math.abs(host.time.days - (1 + WAKE_HOUR / 24)) < 1e-9 && announced === 1, 'Wszyscy śpią - noc przeskakuje i goście dostają nowy czas');
    const alone = sleepGame(0.9, { net: { isHost: true, players: { players: new Map() } } });
    check(alone.sleep.canSkip(), 'Gospodarz bez gości - jak jeden gracz');

    // Świt bez przeskoku (czas dopłynął do 5:00).
    const dawn = sleepGame(4.9 / 24, { net: { isHost: false, players: { players: new Map() } } });
    dawn.sleep.start({ place: 'mat', comfort: 0 });
    tick(dawn, 0.2 * HOUR);
    check(!dawn.sleep.lying && dawn.time.days >= 5 / 24, 'O świcie gracz budzi się sam');

    // Tryb kreatywny: sen przesuwa noc, ale bez wiadomości o samopoczuciu.
    const creative = sleepGame(0.9);
    creative.wellbeing.active = false;
    creative.sleep.startOnGround();
    tick(creative, SLEEP_FADE_SECONDS + 1.2);
    check(creative.time.days > 1.2 && creative.messages.length === 0, 'Tryb kreatywny: noc przeskakuje bez komunikatów');
}


// --- Sieć: flaga "śpi" -----------------------------------------------------------

{
    const player = { pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, yaw: .5, pitch: 0, onGround: true };
    const awake = unpackPlayer(packPlayer(player, 'stick', 0)), asleep = unpackPlayer(packPlayer(player, 'stick', 0, true));
    check(awake.sleeping === false && asleep.sleeping === true, 'Stan gracza w sieci niesie flagę "śpi"');
    check(asleep.onGround === awake.onGround && asleep.held === 'stick', 'Pozostałe pola bez zmian');
}

console.log(`OK: noc i sen - ${checks} sprawdzeń (łóżka, pościel, posłania, potrójny warsztat, wyspanie, sen, sieć).`);
