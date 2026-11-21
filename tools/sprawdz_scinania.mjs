// ------------------------------------------------------------
// ŚCINANIE DRZEW (1.36.0, docs/scinanie.md)
//
// - bloki leżących pni (blocks/lyingLogs.js): numery, kora, łup,
// - rozpoznanie drzewa z samych bloków (game/TreeScan.js): wszystkie
//   gatunki, pniak, konar, podpory, las tego samego gatunku, ściana
//   z pni,
// - liczba ciosów i stron, plan ułożenia pnia (płasko, przeszkoda,
//   uskok, cztery kierunki),
// - prawdziwe Felling: ciosy, karb, strony, upadek, leżący pień,
//   przedmioty, utrata przytomności, wyjście z gry w trakcie upadku,
// - obraz (jedna bryła, karb), komenda, osiągnięcia, poradnik.
//
// Uruchomienie: node tools/sprawdz_scinania.mjs
// ------------------------------------------------------------
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
        // Felling bez rysowania (obraz sprawdzamy osobno, na samej geometrii).
        if (url.endsWith('/src/rendering/FallingTreeRenderer.js') && !url.includes('?real')) return {
            format: 'module', shortCircuit: true,
            source: `export class FallingTreeRenderer { constructor() { this.trees = new Map(); this.notches = new Map(); this.synced = 0; }
                add(id, logs, leaves, origin) { this.trees.set(id, { logs: logs.length, leaves: leaves.length, origin, poses: 0 }); }
                setPose(id, origin, rx, rz) { const t = this.trees.get(id); t.poses++; t.pose = { origin, rx, rz }; }
                remove(id) { this.trees.delete(id); } syncNotches(notches) { this.synced++; this.notches = new Map(notches); } dispose() { this.disposed = true; } }`
        };
        if (url.endsWith('/src/rendering/ModelMaterial.js')) return {
            format: 'module', shortCircuit: true, source: 'export const createModelMaterial = (options) => ({ options, dispose() {} });'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId, getDropType, BLOCK_TYPES } = await import('../src/blocks/BlockRegistry.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const L = await import('../src/blocks/lyingLogs.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const T = await import('../src/game/TreeScan.js');
const F = await import('../src/game/Felling.js');
const { Blackout, CUT_SECONDS, FADE_SECONDS } = await import('../src/game/Blackout.js');
const { woodTraits } = await import('../src/blocks/woodTraits.js');
const { itemExists, getTool } = await import('../src/items/ItemRegistry.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const R = await import('../src/rendering/FallingTreeRenderer.js?real');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// ------------------------------------------------------------
// Świat do prób: płaska ziemia do wysokości GROUND, reszta z mapy.
// ------------------------------------------------------------
const GROUND = 10, BASE = GROUND + 1;
const DIRT = getBlockId('dirt');
function makeWorld() {
    const blocks = new Map();
    const world = {
        blocks, changes: 0,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? DIRT : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        // Jak prawdziwy świat: nieznana nazwa bloku (np. 'air') nic nie zmienia.
        setBlock(x, y, z, type) {
            const id = getBlockId(type);
            if (!(id > 0) || world.getBlockId(x, y, z) === id) return false;
            blocks.set(`${x},${y},${z}`, id); world.changes++;
            return true;
        },
        clearBlock(x, y, z) {
            if (world.getBlockId(x, y, z) === 0) return false;
            blocks.set(`${x},${y},${z}`, 0); world.changes++;
            return true;
        },
        getLight: () => ({ sky: 15, red: 0, green: 0, blue: 0 })
    };
    return world;
}
// Drzewo gatunku w (x, BASE, z): zwraca kształt.
function plant(world, species, x = 0, z = 0, seed = 1234, size = 0.5) {
    const shape = buildTree(species, seed, size);
    for (const [dx, dy, dz, type] of shape.blocks) {
        // Jak generator: liście nie zastępują kłód ani cudzych liści.
        const old = world.getBlockId(x + dx, BASE + dy, z + dz), leaf = getBlockDefinition(type).part !== 'log';
        if (old === 0 || (!leaf && !T.logSpecies(old))) world.setBlock(x + dx, BASE + dy, z + dz, type);
    }
    return shape;
}
const isLog = (id) => T.logSpecies(id) !== null;
const count = (world, test) => [...world.blocks.values()].filter(test).length;
const leafOf = (species) => (id) => { const d = getBlockDefinition(getBlockTypeById(id)); return d?.tree === species && (d.part === 'leaves' || d.part === 'roots'); };

// ------------------------------------------------------------
// 1. Bloki leżących pni
// ------------------------------------------------------------
equal([...L.LYING_WOODS].sort(), [...TREE_NAMES].sort(), 'każde drzewo ma leżący pień');
equal(getBlockId('spruce_log_x'), 16100, 'świerk wzdłuż X: 16100');
equal(getBlockId('spruce_log_z'), 16101, 'świerk wzdłuż Z: 16101');
equal(getBlockId('oak_log_x'), 16108, 'dąb wzdłuż X: 16108');
equal(getBlockId('bristlecone_log_z'), 16163, 'ostatni numer: sosna oścista wzdłuż Z');
const lyingIds = new Set();
for (const wood of L.LYING_WOODS) {
    for (const axis of L.LYING_AXES) {
        const type = L.lyingLogType(wood, axis), definition = getBlockDefinition(type);
        check(definition && definition.id >= 16100 && definition.id <= 16299 && !lyingIds.has(definition.id), `${type}: własny numer w zakresie 16100-16299`);
        lyingIds.add(definition.id);
        check(isSolidId(definition.id) && definition.lying === axis && definition.tree === wood, `${type}: pełny blok, leży wzdłuż ${axis}`);
        check(definition.part !== 'log' && T.logSpecies(definition.id) === null, `${type}: nie jest kłodą żywego drzewa`);
        equal(getDropType(type), `${wood}_log`, `${type}: wykopany daje zwykły pień`);
        check(definition.inventory === false && definition.creative === false && definition.pick === `${wood}_log`, `${type}: nie ma go w ekwipunku`);
        const ends = axis === 'x' ? ['right', 'left'] : ['front', 'back'];
        const log = getBlockDefinition(`${wood}_log`);
        for (const face of ['right', 'left', 'top', 'bottom', 'front', 'back']) {
            equal(definition.textures[face], ends.includes(face) ? log.textures.top : log.textures.side, `${type}: ściana ${face}`);
        }
        equal(L.lyingLogInfo(type), { wood, axis }, `${type}: gatunek i oś po nazwie`);
    }
}
equal(lyingIds.size, 64, '64 bloki leżących pni');
check(L.lyingLogInfo('oak_log') === null, 'stojący pień to nie leżący');
equal(L.LYING_TURNS, { x: [0, 0, 1, 1, 1, 1], z: [1, 1, 0, 0, 0, 0] }, 'kora obrócona wzdłuż pnia');
const mesher = read('src/rendering/ChunkMesher.js'), renderData = read('src/rendering/BlockRenderData.js');
check(mesher.includes('renderData.turn[faceIndex]') && mesher.includes('renderData.barkFaces[faceIndex]'), 'siatka chunka: stały obrót ścian i kora na ścianach wzdłuż pnia');
check(renderData.includes('LYING_TURNS[definition.lying]') && renderData.includes('barkSheet(definition.lying ?'), 'dane ścian: obrót i arkusz kory leżącego pnia');

// ------------------------------------------------------------
// 2. Ciosy
// ------------------------------------------------------------
const chops = (species, width = 1) => T.chopsNeeded(woodTraits(species).hardness, width);
equal([chops('spruce'), chops('pine'), chops('birch'), chops('oak'), chops('oak', 2), chops('olive', 2)], [3, 5, 8, 11, 21, 27], 'ciosy jak w projekcie (docs/drewno.md)');
equal([T.sidesNeeded(1), T.sidesNeeded(2), T.sidesNeeded(3), T.sidesNeeded(4)], [1, 2, 4, 4], 'z ilu stron: 1, 2, 4, 4');
equal(T.sideLimit(7, 2), 11, 'dąb 2 × 2: z jednej strony najwyżej 11 z 21');
check(T.sideLimit(7, 1) === 11 && T.sideLimit(2, 4) === Math.ceil(chops('sequoia', 4) / 4), 'limit strony: cienki pień - wszystko, olbrzym - ćwierć');
check(chops('kapok') >= 2 && chops('baobab') >= 2, 'najmiększe drewno: przynajmniej 2 ciosy');
for (const species of TREE_NAMES) check(chops(species, 2) > chops(species, 1) && chops(species, 4) > chops(species, 3), `${species}: grubszy pień - więcej ciosów`);
equal([T.fallDirection(1, 0.2), T.fallDirection(-1, 0.9), T.fallDirection(0.3, 1), T.fallDirection(0.3, -1)], ['east', 'west', 'south', 'north'], 'kierunek upadku: najbliższa strona świata');

// ------------------------------------------------------------
// 3. Rozpoznanie drzewa - wszystkie gatunki
// ------------------------------------------------------------
check(T.scanTree(makeWorld(), 0, BASE, 0) === null, 'powietrze to nie drzewo');
for (const species of TREE_NAMES) {
    for (const size of [0.2, 0.9]) {
        const world = makeWorld();
        plant(world, species, 0, 0, 1234, size);
        let y = BASE;
        while (!isLog(world.getBlockId(0, y, 0)) && y < BASE + 12) y++;
        check(isLog(world.getBlockId(0, y, 0)), `${species} ${size}: pień w podstawie`);
        const logs = count(world, isLog);
        const scan = T.scanTree(world, 0, y + 1, 0) ?? T.scanTree(world, 0, y, 0);
        check(scan && scan.species === species && scan.living, `${species} ${size}: żywe drzewo`);
        if (T.NO_FELLING[species]) {
            check(scan.blocked === T.NO_FELLING[species] && scan.falling.length === 0, `${species}: nie pada (${scan.blocked})`);
            continue;
        }
        check(!scan.prop && scan.trunk && scan.falling.length > 0 && scan.cut.length >= 1, `${species} ${size}: cięcie głównego pnia`);
        check(scan.falling.length < logs && scan.cut.every((cell) => !scan.falling.some((f) => f.x === cell.x && f.y === cell.y && f.z === cell.z)), `${species} ${size}: przekrój zostaje jako pniak`);
        check(scan.falling.every((cell) => isLog(world.getBlockId(cell.x, cell.y, cell.z))), `${species} ${size}: spadają same kłody`);
        check(scan.top >= 1 && scan.width >= 1 && scan.width === Math.max(1, Math.round(Math.sqrt(scan.cut.length))), `${species} ${size}: wysokość i grubość`);
        // Ta sama nazwa cięcia z każdej kłody przekroju.
        for (const cell of scan.cut) equal(T.scanTree(world, cell.x, cell.y, cell.z).key, scan.key, `${species} ${size}: jedno cięcie, jedna nazwa`);
        const leaves = T.fallingLeaves(world, species, scan.falling, scan.stump);
        const allLeaves = count(world, leafOf(species));
        check(scan.stump.length >= scan.cut.length && scan.stump.length + scan.falling.length <= logs, `${species} ${size}: pniak + spadające = drzewo`);
        check(leaves.length > 0 && leaves.length <= allLeaves, `${species} ${size}: liście spadają z kłodami (${leaves.length} z ${allLeaves})`);
        check(new Set(leaves.map((leaf) => `${leaf.x},${leaf.y},${leaf.z}`)).size === leaves.length, `${species} ${size}: każdy liść raz`);
        for (const direction of Object.keys(T.FALL_DIRECTIONS)) {
            const plan = T.fellPlan(world, scan, direction);
            const stem = plan.stem.reduce((sum, value) => sum + value, 0);
            equal(stem + plan.branches, scan.falling.length, `${species} ${size} ${direction}: pień + konary = wszystkie kłody`);
            const loose = plan.loose.reduce((sum, piece) => sum + piece.count, 0);
            check(plan.blocks.length + loose >= stem * 0.5 && plan.blocks.every((block) => block.type === L.lyingLogType(species, T.FALL_DIRECTIONS[direction].axis)), `${species} ${size} ${direction}: leżący pień z bloków gatunku`);
            check(plan.blocks.every((block) => T.trunkCanReplace(world.getBlockId(block.x, block.y, block.z))), `${species} ${size} ${direction}: pień nie wchodzi w nic stałego`);
            check(new Set(plan.blocks.map((block) => `${block.x},${block.y},${block.z}`)).size === plan.blocks.length, `${species} ${size} ${direction}: bez powtórzeń`);
        }
    }
}

// Cienki pień na płaskim: tyle bloków, ile metrów pnia, jeden za drugim.
{
    const world = makeWorld();
    plant(world, 'spruce');
    const scan = T.scanTree(world, 0, BASE, 0);
    equal(T.fallingLeaves(world, 'spruce', scan.falling, scan.stump).length, count(world, leafOf('spruce')), 'samotny świerk: spada cała korona, nic nie wisi nad pniakiem');
    equal([scan.width, scan.cut.length, scan.trunk], [1, 1, true], 'świerk: pień 1 blok');
    const plan = T.fellPlan(world, scan, 'east');
    equal(plan.blocks.length, plan.stem.length, 'świerk: metr pnia - jeden blok');
    equal(plan.blocks.map((block) => [block.x, block.y, block.z]), plan.stem.map((_, i) => [i + 1, BASE, 0]), 'świerk na wschód: bloki od pniaka w linii, na ziemi');
    equal([plan.loose.length, plan.pieces, plan.length, plan.axis], [0, 1, plan.stem.length, 'x'], 'świerk: jeden odcinek, nic luzem');
    const west = T.fellPlan(world, scan, 'west'), south = T.fellPlan(world, scan, 'south'), north = T.fellPlan(world, scan, 'north');
    equal([west.blocks[0].x, south.blocks[0].z, north.blocks[0].z, south.axis], [-1, 1, -1, 'z'], 'cztery kierunki');

    // Przeszkoda: skała w linii upadku - ten metr spada jako kłody.
    const blocked = makeWorld();
    plant(blocked, 'spruce');
    for (let h = 0; h < 4; h++) blocked.setBlock(3, BASE + h, 0, 'stone');
    const hitPlan = T.fellPlan(blocked, T.scanTree(blocked, 0, BASE, 0), 'east');
    check(hitPlan.loose.length === 1 && hitPlan.loose[0].count === 1 && hitPlan.pieces === 2, 'skała w linii: pień pęka na dwa odcinki, metr luzem');
    check(!hitPlan.blocks.some((block) => block.x === 3), 'skała zostaje');
    equal(hitPlan.blocks.length + 1, hitPlan.stem.length, 'reszta pnia leży');

    // Uskok: stopień w dół o 2 - pień układa się niżej (pęka).
    const step = makeWorld();
    plant(step, 'spruce');
    for (let x = 4; x < 30; x++) for (let y = GROUND - 1; y <= GROUND; y++) step.blocks.set(`${x},${y},0`, 0);
    const stepPlan = T.fellPlan(step, T.scanTree(step, 0, BASE, 0), 'east');
    check(stepPlan.pieces === 2 && stepPlan.blocks.find((block) => block.x === 5).y === BASE - 2, 'uskok: dalsza część pnia leży niżej');
    // Urwisko: głębiej niż 3 - spada luzem.
    const cliff = makeWorld();
    plant(cliff, 'spruce');
    for (let x = 4; x < 30; x++) for (let y = 0; y <= GROUND; y++) cliff.blocks.set(`${x},${y},0`, 0);
    const cliffPlan = T.fellPlan(cliff, T.scanTree(cliff, 0, BASE, 0), 'east');
    check(cliffPlan.blocks.length === 3 && cliffPlan.loose.reduce((sum, piece) => sum + piece.count, 0) === cliffPlan.stem.length - 3, 'urwisko: reszta pnia spada jako kłody');

    // Cięcie wyżej: pniak wyższy, spada mniej.
    const high = T.scanTree(world, 0, BASE + 3, 0);
    check(high.trunk && high.falling.length === scan.falling.length - 3 && high.key !== scan.key, 'cięcie wyżej: spada to, co nad nim');
    // Sam czubek: spada jako konar.
    const top = T.scanTree(world, 0, BASE + scan.top, 0);
    check(!top.trunk && top.falling.length === 1, 'czubek pnia: nic nad nim - spada sam');
}

// Gruby pień: przekrój 2 × 2, leżący pień 2 × 2.
{
    const world = makeWorld();
    plant(world, 'oak', 0, 0, 7, 0.9);
    const scan = T.scanTree(world, 0, BASE + 1, 0);
    equal([scan.width, scan.cut.length], [2, 4], 'duży dąb: pień 2 × 2');
    const plan = T.fellPlan(world, scan, 'east');
    const first = plan.blocks.filter((block) => block.x === plan.blocks[0].x);
    equal(first.length, 4, 'leżący pień dębu: 2 × 2 na metr');
    check(new Set(first.map((block) => block.y)).size === 2 && new Set(first.map((block) => block.z)).size === 2, 'dwa bloki w poprzek i dwa w górę');
    check(plan.branches > 0, 'dąb ma konary');
}

// Konar: cios w gałąź odcina tylko ją.
{
    const world = makeWorld();
    plant(world, 'oak', 0, 0, 7, 0.9);
    const trunk = T.scanTree(world, 0, BASE + 1, 0);
    const logs = trunk.falling;
    const columns = new Set(trunk.cut.map((cell) => `${cell.x},${cell.z}`));
    const branch = logs.find((cell) => !columns.has(`${cell.x},${cell.z}`) && !isLog(world.getBlockId(cell.x, cell.y + 1, cell.z)) && !isLog(world.getBlockId(cell.x, cell.y - 1, cell.z)));
    check(branch, 'dąb: jest kłoda konara');
    const scan = T.scanTree(world, branch.x, branch.y, branch.z);
    check(scan.living && !scan.trunk && scan.cut.length === 1 && scan.falling.length >= 1 && scan.falling.length < logs.length / 2, `konar: spada sam (${scan.falling.length} kłód)`);
    check(scan.falling.some((cell) => cell.x === branch.x && cell.y === branch.y && cell.z === branch.z), 'konar spada razem z uderzoną kłodą');
    const leaves = T.fallingLeaves(world, 'oak', scan.falling);
    check(leaves.length < count(world, leafOf('oak')) / 2, 'z konarem spada tylko część korony');
}

// Las: dwa świerki obok siebie - sąsiad zostaje cały.
{
    const world = makeWorld();
    plant(world, 'spruce', 0, 0, 3, 0.6);
    const alone = T.fallingLeaves(world, 'spruce', T.scanTree(world, 0, BASE, 0).falling).length;
    const total = count(world, leafOf('spruce'));
    const shape = plant(world, 'spruce', 4, 0, 9, 0.6);
    const scan = T.scanTree(world, 0, BASE, 0);
    check(scan.falling.every((cell) => cell.x === 0 && cell.z === 0), 'ścinany świerk: tylko jego pień');
    const leaves = T.fallingLeaves(world, 'spruce', scan.falling);
    const other = T.scanTree(world, 4, BASE, 0);
    const otherLeaves = T.fallingLeaves(world, 'spruce', other.falling);
    check(leaves.length <= alone && leaves.length > alone * 0.5, `liście pierwszego: większość jego korony (${leaves.length} z ${alone})`);
    const keys = new Set(leaves.map((leaf) => `${leaf.x},${leaf.y},${leaf.z}`));
    check(!otherLeaves.some((leaf) => keys.has(`${leaf.x},${leaf.y},${leaf.z}`)), 'żaden liść nie należy do obu drzew');
    check(leaves.length + otherLeaves.length <= count(world, leafOf('spruce')) && total > 0 && shape.blocks.length > 0, 'razem nie więcej liści, niż jest');
    // Liście bliżej sąsiada zostają przy nim.
    check(leaves.every((leaf) => Math.abs(leaf.x - 0) <= Math.abs(leaf.x - 4) + 1), 'liście przy sąsiednim pniu zostają');
}

// Ściana z pni, słup, pień w powietrzu, pień bez korony.
{
    const world = makeWorld();
    for (let y = BASE; y < BASE + 6; y++) world.setBlock(0, y, 0, 'oak_log');
    const pillar = T.scanTree(world, 0, BASE + 1, 0);
    check(pillar && !pillar.living && pillar.falling.length === 0, 'słup z pni bez liści: nie jest drzewem');
    for (let x = 5; x < 9; x++) for (let y = BASE; y < BASE + 3; y++) world.setBlock(x, y, 5, 'spruce_log');
    check(!T.scanTree(world, 6, BASE + 1, 5).living, 'ściana z pni: nie jest drzewem');
    const floating = makeWorld();
    const shape = buildTree('birch', 5, 0.5);
    for (const [dx, dy, dz, type] of shape.blocks) floating.setBlock(dx, BASE + 3 + dy, dz, type);
    let y = BASE + 3;
    while (!isLog(floating.getBlockId(0, y, 0))) y++;
    check(!T.scanTree(floating, 0, y + 1, 0).living, 'drzewo w powietrzu (bez korzenia w ziemi): kopie się po staremu');
    check(T.scanTree(world, 0, BASE, 0).species === 'oak' && T.logSpecies(getBlockId('oak_planks')) === null && T.logSpecies(getBlockId('oak_log_stripped')) === null, 'kłoda to pień z korą, nie deski ani okorowany');
}

// Banian: cięcie głównego pnia kładzie całość, podpora to nie pień.
{
    const world = makeWorld();
    plant(world, 'banyan', 0, 0, 1234, 0.9);
    const logs = count(world, isLog);
    let y = BASE;
    while (!isLog(world.getBlockId(0, y, 0))) y++;
    const scan = T.scanTree(world, 0, y + 1, 0);
    check(scan.trunk && scan.falling.length > logs * 0.5, `banian: z głównym pniem pada większość kłód (${scan.falling.length} z ${logs})`);
    const leaves = T.fallingLeaves(world, 'banyan', scan.falling, scan.stump);
    check(leaves.length > count(world, leafOf('banyan')) * 0.8, 'banian: korona pada razem z nim');
    // Podpora: kłoda stojąca na ziemi daleko od pnia.
    const cutColumns = new Set(scan.cut.map((cell) => `${cell.x},${cell.z}`));
    let prop = null;
    for (const [key, id] of world.blocks) {
        const [x, py, z] = key.split(',').map(Number);
        if (isLog(id) && py === BASE && !cutColumns.has(`${x},${z}`) && Math.max(Math.abs(x), Math.abs(z)) > 5) { prop = { x, y: py, z }; break; }
    }
    if (prop) check(T.scanTree(world, prop.x, prop.y, prop.z).prop === true, 'banian: podpora to nie główny pień');
    checks++;
}

// ------------------------------------------------------------
// 4. Korona, czas upadku
// ------------------------------------------------------------
equal(F.crownDrops(0, 0), { konar: 0, stick: 0 }, 'bez gałęzi i liści - nic');
equal(F.crownDrops(9, 48), { konar: 3, stick: 7 }, '9 kłód gałęzi i 48 liści: 3 konary, 7 patyków');
check(F.crownDrops(500, 5000).stick === 24, 'patyków najwyżej 24');
check(F.fallSeconds(3) === 2 && F.fallSeconds(200) === 4 && F.fallSeconds(20) > 2 && F.fallSeconds(20) < 4, 'upadek trwa 2-4 s, wysokie drzewo dłużej');
check(itemExists('konar') && RECIPES.some((recipe) => recipe.id === 'stick_from_konar' && recipe.result[0] === 'stick' && recipe.result[1] === 3), 'konar: przedmiot i przepis na 3 patyki');

// ------------------------------------------------------------
// 5. Prawdziwe Felling
// ------------------------------------------------------------
function makeGame(world, { mode = 'adventure', item = 'axe', yaw = -Math.PI / 2 } = {}) {
    const game = {
        world, mode, selectedBlock: item, notices: [], events: [], spawned: [], sounds: { played: [], play(name, options) { this.played.push([name, options]); } },
        player: { pos: { x: -1.5, y: BASE, z: 0.5 }, yaw, pitch: 0, eyeHeight: 1.6 },
        wellbeing: { effects: { work: 1 }, spent: 0, spend(amount) { this.spent += amount; } },
        drops: { spawn: (type, n, position) => { game.spawned.push({ type, count: n, ...position }); return {}; } },
        debris: { chipped: 0, bursts: 0, chips() { this.chipped++; }, burst() { this.bursts++; } },
        blackout: { started: null, start(spot) { this.started = spot; } },
        swings: 0, swingArm() { this.swings++; }, playBlockSound() {},
        onNotice: (text) => game.notices.push(text),
        achieve: (name, data) => game.events.push([name, data]),
        time: { days: 100 }, sky: { lightingLook: 'natural' }, scene: { add() {} }
    };
    game.felling = new F.Felling(game);
    // Próby nie zależą od szybkości maszyny (budżet klatki sprawdzamy osobno).
    game.felling.removeBudgetMs = Infinity;
    return game;
}
const hitOf = (world, x, y, z, normal = { x: -1, y: 0, z: 0 }) => ({ hit: true, block: { x, y, z, type: world.getBlock(x, y, z) }, normal });
const spawnedOf = (game, type) => game.spawned.filter((drop) => drop.type === type).reduce((sum, drop) => sum + drop.count, 0);

{
    const world = makeWorld();
    plant(world, 'spruce');
    const logs = count(world, isLog), leavesBefore = count(world, leafOf('spruce'));
    // yaw -π/2: gracz patrzy na wschód (+x), stoi na zachód od pnia.
    const game = makeGame(world);
    const felling = game.felling;
    equal(felling.lookDirection(), 'east', 'gracz patrzy na wschód');
    const hit = hitOf(world, 0, BASE + 1, 0);
    check(!felling.chop(hit, false, false), 'bez kliknięcia: nic');
    check(felling.chop(hit, true, false) && felling.notches.size === 1, 'pierwszy cios: karb');
    const notch = [...felling.notches.values()][0];
    equal([notch.total, notch.needed, notch.hits.west, notch.species, notch.y], [1, 3, 1, 'spruce', BASE + 1], 'karb: 1 z 3, od zachodu (ściana, w którą bije)');
    check(Math.abs(notch.sides.west - 1 / 3) < 1e-9 && notch.version === 1, 'głębokość karbu dla obrazu');
    check(game.wellbeing.spent === F.CHOP_ENERGY && game.swings === 1 && game.debris.chipped === 2, 'cios: energia, zamach, wióry');
    check(felling.chop(hit, false, true) && notch.total === 1, 'trzymany LPM przed końcem zamachu: jeszcze nie');
    felling.update(F.CHOP_SECONDS / 2);
    felling.chop(hit, false, true);
    equal(notch.total, 1, 'pół zamachu: dalej czeka');
    felling.update(F.CHOP_SECONDS / 2 + 0.01);
    felling.chop(hit, false, true);
    equal(notch.total, 2, 'po 0,6 s: drugi cios');
    check(felling.renderer.synced > 0 && felling.renderer.notches.size === 1, 'karb trafia do obrazu');
    equal(world.changes, world.blocks.size, 'ciosy nie zmieniają świata');
    const before = world.blocks.size;
    felling.update(1);
    check(felling.chop(hit, false, true) && felling.notches.size === 0 && felling.falls.length === 1, 'trzeci cios: drzewo pada, karb znika');
    const fall = felling.falls[0];
    equal([fall.direction, fall.trunk, fall.scan.falling.length], ['east', true, logs - 2], 'pada na wschód; pniak: dwa bloki (ziemia i cięcie)');
    check(count(world, isLog) === 2 && count(world, leafOf('spruce')) < leavesBefore * 0.1, 'bloki drzewa zniknęły ze świata od razu');
    check(world.blocks.size === before && felling.renderer.trees.size === 1, 'jedna bryła zamiast bloków');
    equal(fall.origin, { x: 1, y: BASE + 2, z: 0.5 }, 'oś obrotu: krawędź pniaka po stronie upadku');
    check(game.events.filter(([name]) => name === 'treeChopped').length === 3, 'trzy ciosy zgłoszone');
    // Przechył, potem upadek.
    felling.update(F.LEAN_SECONDS / 2);
    const lean = felling.renderer.trees.get(fall.id).pose;
    check(lean.rz < 0 && lean.rz > -F.LEAN_ANGLE && lean.rx === 0, 'najpierw lekki przechył na wschód (obrót wokół Z)');
    felling.update(F.LEAN_SECONDS / 2 + fall.seconds / 2);
    const mid = felling.renderer.trees.get(fall.id).pose;
    check(mid.rz < lean.rz && mid.rz > -Math.PI / 2 && felling.falls.length === 1, 'potem pada coraz szybciej');
    check(game.spawned.length === 0 && world.getBlock(1, BASE, 0) !== 'spruce_log_x', 'przed upadkiem nic nie leży');
    felling.update(fall.seconds);
    check(felling.falls.length === 0 && felling.renderer.trees.size === 0, 'po upadku bryła znika');
    for (let i = 1; i <= fall.plan.stem.length; i++) equal(world.getBlock(i, BASE, 0), 'spruce_log_x', `leżący pień: metr ${i}`);
    equal(world.getBlock(0, BASE, 0), 'spruce_log', 'pniak stoi');
    equal(world.getBlock(0, BASE + 1, 0), 'spruce_log', 'pniak: blok z karbem zostaje');
    const felled = game.events.find(([name]) => name === 'treeFelled')[1];
    equal([felled.species, felled.width, felled.crushed, felled.length, felled.pieces], ['spruce', 1, false, fall.plan.stem.length, 1], 'zdarzenie treeFelled');
    check(spawnedOf(game, 'stick') === F.crownDrops(fall.plan.branches, fall.leaves).stick && spawnedOf(game, 'stick') > 0, 'z korony patyki');
    check(game.spawned.every((drop) => itemExists(drop.type)), 'spadają tylko prawdziwe przedmioty');
    check(felling.shake > 0 && game.debris.bursts > 0 && game.sounds.played.length >= 4, 'huk, wstrząs, chmura liści');
    check(game.blackout.started === null, 'gracz stał z boku - nic mu nie jest');
    felling.update(5);
    equal(felling.shake, 0, 'wstrząs gaśnie');
}

// Gruby pień: z jednej strony tylko połowa.
{
    const world = makeWorld();
    plant(world, 'oak', 0, 0, 7, 0.9);
    const game = makeGame(world);
    const felling = game.felling;
    const west = hitOf(world, 0, BASE + 1, 0, { x: -1, y: 0, z: 0 });
    for (let i = 0; i < 14; i++) { felling.cooldown = 0; felling.chop(west, true, false); }
    const notch = [...felling.notches.values()][0];
    equal([notch.total, notch.hits.west, notch.limit, notch.needed, notch.width], [11, 11, 11, 21, 2], 'dąb 2 × 2: z zachodu 11 ciosów i koniec');
    check(game.notices.length >= 1 && game.notices[0].includes('obejdź'), 'podpowiedź: obejdź drzewo');
    // Druga kłoda przekroju, ta sama strona - ten sam karb.
    felling.cooldown = 0;
    felling.chop(hitOf(world, 0, BASE + 1, 1, { x: -1, y: 0, z: 0 }), true, false);
    equal([felling.notches.size, notch.total], [1, 11], 'sąsiednia kłoda pnia: ten sam karb, ta sama strona');
    // Z drugiej strony.
    game.player.yaw = Math.PI / 2;
    equal(felling.lookDirection(), 'west', 'gracz obszedł drzewo: patrzy na zachód');
    const east = hitOf(world, 1, BASE + 1, 0, { x: 1, y: 0, z: 0 });
    for (let i = 0; i < 9; i++) { felling.cooldown = 0; felling.chop(east, true, false); }
    equal([notch.total, felling.falls.length], [20, 0], '20 z 21: jeszcze stoi');
    felling.cooldown = 0; felling.chop(east, true, false);
    check(felling.falls.length === 1 && felling.falls[0].direction === 'west', 'ostatni cios: pada od gracza, na zachód');
    felling.finishAll();
    const felled = game.events.find(([name]) => name === 'treeFelled')[1];
    check(felled.width === 2 && world.getBlock(-1, BASE, 0) === 'oak_log_x' && world.getBlock(-1, BASE + 1, 1) === 'oak_log_x', 'leżący pień dębu 2 × 2 na zachód od pniaka');
    check(spawnedOf(game, 'konar') >= 1, 'z korony dębu konary');
    check(felling.falls.length === 0, 'finishAll: wszystko wylądowało');
}

// Konar spada pionowo i daje konary.
{
    const world = makeWorld();
    plant(world, 'oak', 0, 0, 7, 0.9);
    const trunk = T.scanTree(world, 0, BASE + 1, 0);
    const columns = new Set(trunk.cut.map((cell) => `${cell.x},${cell.z}`));
    const branch = trunk.falling.find((cell) => !columns.has(`${cell.x},${cell.z}`) && !isLog(world.getBlockId(cell.x, cell.y + 1, cell.z)) && !isLog(world.getBlockId(cell.x, cell.y - 1, cell.z)));
    const game = makeGame(world);
    const felling = game.felling;
    const logs = count(world, isLog);
    const hit = hitOf(world, branch.x, branch.y, branch.z, { x: 0, y: -1, z: 0 });
    let guard = 0;
    while (felling.falls.length === 0 && guard++ < 20) { felling.cooldown = 0; felling.chop(hit, true, false); }
    check(guard === Math.max(1, Math.round(chops('oak') / 2)), `konar: połowa ciosów pnia (${guard})`);
    const fall = felling.falls[0];
    check(!fall.trunk && fall.drop > 0 && count(world, isLog) === logs - fall.scan.falling.length, 'konar zniknął z drzewa, reszta stoi');
    felling.update(0.05);
    const pose = felling.renderer.trees.get(fall.id).pose;
    check(pose.rx === 0 && pose.rz === 0 && pose.origin.y < fall.origin.y, 'spada pionowo, bez obrotu');
    felling.update(5);
    check(felling.falls.length === 0 && spawnedOf(game, 'konar') >= 1 && game.events.some(([name]) => name === 'branchCut'), 'po upadku: konar jako przedmiot');
    check(!game.events.some(([name]) => name === 'treeFelled') && T.scanTree(world, 0, BASE + 1, 0).living, 'drzewo stoi dalej');
}

// Kiedy cios nie działa: kreatywny, bez siekiery, słup, krzew, baobab.
{
    const world = makeWorld();
    plant(world, 'spruce');
    const hit = hitOf(world, 0, BASE + 1, 0);
    check(!makeGame(world, { mode: 'creative' }).felling.chop(hit, true, false), 'tryb twórczy: pień znika od razu, jak dotąd');
    check(!makeGame(world, { item: null }).felling.chop(hit, true, false), 'goła ręka: kopanie po staremu');
    check(!makeGame(world, { item: 'pickaxe' }).felling.chop(hit, true, false), 'kilof: kopanie po staremu');
    check(getTool('axe') === 'axe', 'siekiera to narzędzie axe');
    const pillar = makeWorld();
    for (let y = BASE; y < BASE + 5; y++) pillar.setBlock(0, y, 0, 'oak_log');
    check(!makeGame(pillar).felling.chop(hitOf(pillar, 0, BASE + 1, 0), true, false), 'słup z pni: kopie się jak blok');
    for (const species of Object.keys(T.NO_FELLING)) {
        const other = makeWorld();
        plant(other, species);
        let y = BASE;
        while (!isLog(other.getBlockId(0, y, 0)) && y < BASE + 12) y++;
        const game = makeGame(other);
        check(!game.felling.chop(hitOf(other, 0, y, 0), true, false) && game.felling.notches.size === 0, `${species}: nie pada - kopie się po staremu`);
    }
    check(!makeGame(world).felling.chop(hitOf(world, 1, GROUND, 0), true, false), 'ziemia: to nie pień');
}

// Olbrzym: bloki znikają przez kilka klatek, bryła czeka.
{
    const world = makeWorld();
    plant(world, 'sequoia', 0, 0, 5, 0.9);
    const game = makeGame(world);
    const felling = game.felling;
    felling.removeBudgetMs = -1;
    let y = BASE;
    while (!isLog(world.getBlockId(0, y, 0))) y++;
    const scan = T.scanTree(world, 0, y + 1, 0);
    check(scan.width >= 4 && scan.falling.length > 500, `sekwoja: olbrzym (${scan.falling.length} kłód, pień ${scan.width})`);
    const fall = felling.fell(scan, 'east');
    const all = scan.falling.length + fall.leaves;
    equal(fall.pending.length, all - 16, 'pierwsza klatka: tylko część bloków (budżet czasu)');
    check(felling.chop(hitOf(world, 0, y + 1, 0), true, false) && felling.notches.size === 0, 'w tym czasie siekiera czeka');
    felling.update(0.5);
    check(fall.time === 0 && fall.pending.length === all - 32, 'bryła stoi, dopóki bloki znikają');
    felling.removeBudgetMs = Infinity;
    felling.update(0.5);
    check(fall.pending.length === 0 && fall.time === 0.5, 'potem zaczyna padać');
    // Po upadku pień układa się też przez kilka klatek - bryła leży do końca.
    felling.removeBudgetMs = -1;
    felling.update(F.LEAN_SECONDS + fall.seconds);
    felling.update(1);
    check(fall.placing.length > 0 && felling.falls.length === 1 && felling.renderer.trees.size === 1, 'olbrzym po upadku: bloki pnia układają się partiami, bryła jeszcze leży');
    equal(game.events.filter(([name]) => name === 'treeFelled').length, 1, 'huk i zdarzenie od razu, raz');
    felling.removeBudgetMs = Infinity;
    felling.update(0.1);
    check(felling.falls.length === 0 && felling.renderer.trees.size === 0 && count(world, (id) => getBlockDefinition(getBlockTypeById(id))?.lying === 'x') === fall.plan.blocks.length, 'potem leży cały, bryła znika');
    felling.removeBudgetMs = -1;
    const other = makeGame(world);
    plant(world, 'spruce', 0, 60);
    other.felling.removeBudgetMs = -1;
    other.felling.fell(T.scanTree(world, 0, BASE, 60), 'east');
    other.felling.finishAll();
    check(count(world, (id) => T.logSpecies(id) === 'spruce') === 1 && world.getBlock(1, BASE, 60) === 'spruce_log_x', 'wyjście z gry w trakcie znikania: nic nie zostaje w powietrzu');
}

// Karb znika po dłuższej przerwie.
{
    const world = makeWorld();
    plant(world, 'oak', 0, 0, 7, 0.2);
    const game = makeGame(world);
    game.felling.chop(hitOf(world, 0, BASE + 1, 0), true, false);
    game.felling.update(F.NOTCH_SECONDS - 1);
    equal(game.felling.notches.size, 1, 'karb trzyma się kilka minut');
    game.felling.update(2);
    check(game.felling.notches.size === 0 && game.felling.renderer.notches.size === 0, 'potem znika (także z obrazu)');
}

// Gracz pod padającym pniem: skupienie, potem ciemność i pobudka obok.
{
    const world = makeWorld();
    plant(world, 'spruce');
    const game = makeGame(world);
    const felling = game.felling;
    const scan = T.scanTree(world, 0, BASE + 1, 0);
    const fall = felling.fell(scan, 'east');
    game.player.pos = { x: 4.5, y: BASE, z: 0.5 };
    check(felling.playerUnder(fall), 'gracz stoi w linii upadku');
    felling.update(F.LEAN_SECONDS + fall.seconds - F.FOCUS_SECONDS - 0.2);
    check(felling.focus === null, 'do ostatniej chwili nic');
    felling.update(0.3);
    check(felling.focus && felling.focus.y > BASE && felling.focusing, 'tuż przed uderzeniem: widok skupia się na drzewie');
    felling.update(1);
    const spot = game.blackout.started;
    check(spot && Math.abs(spot.z - 0.5) >= 1 && Math.abs(spot.x - 4.5) < 0.6 && spot.y === BASE, `ciemność i pobudka obok pnia (${JSON.stringify(spot)})`);
    check(world.getBlock(Math.floor(spot.x), spot.y, Math.floor(spot.z)) === null || T.trunkCanReplace(world.getBlockId(Math.floor(spot.x), spot.y, Math.floor(spot.z))), 'miejsce pobudki jest wolne');
    check(game.events.find(([name]) => name === 'treeFelled')[1].crushed === true, 'zdarzenie: przygnieciony');
    // Z boku - nic.
    const aside = makeGame(makeWorld());
    plant(aside.world, 'spruce');
    const other = aside.felling.fell(T.scanTree(aside.world, 0, BASE + 1, 0), 'east');
    aside.player.pos = { x: 4.5, y: BASE, z: 2.5 };
    check(!aside.felling.playerUnder(other), 'dwa bloki w bok: bezpiecznie');
    aside.player.pos = { x: -3, y: BASE, z: 0.5 };
    check(!aside.felling.playerUnder(other), 'za pniakiem: bezpiecznie');
    aside.felling.dispose();
    check(aside.felling.falls.length === 0 && aside.world.getBlock(2, BASE, 0) === 'spruce_log_x' && aside.felling.renderer.disposed, 'wyjście z gry w trakcie upadku: drzewo ląduje, nic nie przepada');
}

// Utrata przytomności pod drzewem (Blackout).
{
    const messages = [], events = [];
    const game = {
        player: { pos: { x: 1, y: 2, z: 3, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, vel: { set() {} } },
        world: { getBlockId: () => 0 }, wellbeing: { blacked: 0, blackout() { this.blacked++; } },
        time: { hours: 0, addHours(h) { this.hours += h; } }, advanced: 0, advanceWorld(seconds) { this.advanced += seconds; },
        achieve: (name, data) => events.push([name, data]), onMessage: (text) => messages.push(text)
    };
    const blackout = new Blackout(game);
    blackout.start({ x: 10.5, y: 20, z: 30.5 });
    check(blackout.active && blackout.abrupt && blackout.phase === 'out' && blackout.left === CUT_SECONDS, 'pod drzewem: ciemność od razu (bez ściemniania)');
    blackout.update(CUT_SECONDS + 0.01);
    equal([game.player.pos.x, game.player.pos.y, game.player.pos.z], [10.5, 20, 30.5], 'pobudka w podanym miejscu, nie na brzegu');
    check(blackout.phase === 'in' && !blackout.abrupt && blackout.left === FADE_SECONDS, 'potem obraz wraca powoli');
    check(game.wellbeing.blacked === 1 && game.time.hours === 2 && game.advanced > 0, 'wyczerpanie i dwie godziny jak przy wodzie');
    check(messages[0].includes('drzewo') && events[0][1].tree === true, 'komunikat o drzewie');
    const css = read('src/ui/hud.css'), panel = read('src/ui/StatusPanel.js');
    check(css.includes('#blackout.cut { transition: none; }') && panel.includes("classList.toggle('cut'"), 'ekran: klasa cut wyłącza ściemnianie');
    const water = new Blackout(game);
    water.start();
    check(!water.abrupt && water.left === FADE_SECONDS, 'pod wodą: po staremu, powoli');
}

// ------------------------------------------------------------
// 6. Obraz
// ------------------------------------------------------------
{
    const world = makeWorld();
    plant(world, 'spruce');
    const scan = T.scanTree(world, 0, BASE + 1, 0);
    const leaves = T.fallingLeaves(world, 'spruce', scan.falling);
    const geometry = R.treeGeometry(scan.falling, leaves, { x: 1, y: BASE + 2, z: 0.5 }, 100);
    const logFaces = geometry.logs.index.count / 6, leafFaces = geometry.leaves.index.count / 6;
    // Pień n kłód jedna na drugiej: 4 boki każda + góra i dół = 4n + 2 (bez ścian w środku).
    equal(logFaces, scan.falling.length * 4 + 2, 'bryła pnia: bez ścian między kłodami');
    check(leafFaces > leaves.length * 5 && leafFaces < leaves.length * 6, 'bryła korony: liście z prześwitami mają też ściany w głębi, bez tych przy kłodach');
    check(geometry.logs.attributes.position.count === logFaces * 4 && geometry.logs.attributes.uv && geometry.logs.attributes.color && geometry.logs.attributes.normal, 'pozycje, normalne, UV, kolory');
    const ys = geometry.logs.attributes.position.array.filter((_, index) => index % 3 === 1);
    check(Math.min(...ys) === 0 && Math.max(...ys) === scan.falling.length, 'bryła liczona od osi obrotu (dół spadającej części)');
    equal(R.leafTint(getBlockId('spruce_leaves'), null), [1, 1, 1], 'bez pory roku: kolory tekstury');

    const notch = { species: 'oak', y: BASE + 1, cells: [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 1, z: 1 }], sides: { west: 0.5, east: 0, south: 0, north: 0 } };
    const cut = R.notchGeometry(notch);
    // Dwie kłody od zachodu × trzy pasy (kora-drewno-szczelina).
    equal(cut.index.count / 6, 2 * 3, 'karb 2 × 2 od zachodu: tylko zewnętrzne ściany tej strony');
    const xs = cut.attributes.position.array.filter((_, index) => index % 3 === 0);
    check(Math.max(...xs) < 0 && Math.min(...xs) > -0.05, 'karb tuż przed ścianą pnia');
    const shallow = R.notchGeometry({ ...notch, sides: { west: 0.1 } }), deep = R.notchGeometry({ ...notch, sides: { west: 1 } });
    const height = (g) => { const y = g.attributes.position.array.filter((_, index) => index % 3 === 1); return Math.max(...y) - Math.min(...y); };
    check(height(deep) > height(shallow) * 2 && height(deep) < 0.7, 'karb rośnie z ciosami');
    equal(R.notchGeometry({ ...notch, sides: {} }).index.count, 0, 'bez ciosów - bez karbu');
}

// ------------------------------------------------------------
// 7. Gra: podłączenie, komenda, osiągnięcia, poradnik, dokumentacja
// ------------------------------------------------------------
const gameSource = read('src/game/Game.js'), interaction = read('src/game/GameInteraction.js'), saver = read('src/storage/WorldSaver.js');
check(gameSource.includes('new Felling(this)') && gameSource.includes('this.felling.update(dt)') && gameSource.includes('this.felling.dispose()'), 'Game: tworzy, odświeża i sprząta ścinanie');
check(gameSource.includes('this.felling?.shake') && gameSource.includes('this.felling.focus'), 'Game: wstrząs i skupienie widoku');
check(gameSource.includes('this.felling.finishAll()') && saver.includes('this.beforeExitSave?.()'), 'wyjście z gry: drzewo ląduje przed zapisem');
check(interaction.includes('this.felling?.chop(hit, pressed, held)'), 'LPM siekierą idzie najpierw do ścinania');
const commands = read('src/commands/worldCommands.js'), commandDocs = read('docs/komendy.md');
check(commands.includes("name: 'scinanie'") && commandDocs.includes('/scinanie'), 'komenda /scinanie i jej opis');
for (const id of ['first_felling', 'thick_trunk', 'eight_trees', 'under_tree']) check(ACHIEVEMENTS.some((achievement) => achievement.id === id), `osiągnięcie ${id}`);
const byId = (id) => ACHIEVEMENTS.find((achievement) => achievement.id === id);
check(byId('thick_trunk').when({ width: 2 }) && !byId('thick_trunk').when({ width: 1 }), 'gruby pień: od 2 × 2');
check(byId('under_tree').when({ crushed: true }) && !byId('under_tree').when({ crushed: false }) && byId('under_tree').secret, 'pod drzewem: sekret');
check(byId('blackout').when({ tree: false, shore: true }) && !byId('blackout').when({ tree: true }), 'utrata przytomności pod wodą nie liczy drzewa');
const chapter = GUIDE.find((entry) => entry.id === 'felling');
check(chapter && chapter.lines.length >= 6 && chapter.lines.every((line) => (line.text ?? line).length <= 190 && (!line.touch || line.touch.length <= 190)), 'poradnik: rozdział o ścinaniu, linie do 190 znaków');
const docs = read('docs/scinanie.md'), numbers = read('docs/numery-blokow.md');
check(docs.includes('1.36.0') && docs.includes('Luki') && numbers.includes('16100-16299'), 'dokumentacja: docs/scinanie.md i numery bloków');
check(Object.values(BLOCK_TYPES).filter((definition) => definition.lying).length === 64, 'w rejestrze 64 leżące pnie');
check(JSON.parse(read('package.json')).scripts.test.includes('sprawdz_scinania.mjs'), 'test w npm test');

console.log(`OK: ścinanie drzew - ${checks} sprawdzeń.`);
