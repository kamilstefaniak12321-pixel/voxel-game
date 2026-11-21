// ------------------------------------------------------------
// SPRAWDZENIE PNĄCZY (1.30.0, docs/pnacza.md)
//
// - bloki: podpory (kratka, tyczka, pergola) i kawałki pnączy - numery,
//   etapy, mocowania, zbiór, kształty z prześwitami,
// - sadzenie owocem: kratka i tyczka na ziemi, bok muru, ziemia przy
//   murze; odmowy (bez ziemi, bez podpory),
// - wspinanie: po murze w górę i w bok, kratka, tyczka, pergola (wejście
//   od dołu i rozchodzenie się pod daszkiem), wysokość gatunku, tłok,
// - zniszczone pnącze zostawia podporę,
// - pory roku, przedmioty, jedzenie, napar z chmielu.
//
// Uruchomienie: node tools/sprawdz_pnaczy.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const R = await import('../src/blocks/BlockRegistry.js');
const V = await import('../src/blocks/vines.js');
const G = await import('../src/game/VineGrowth.js');
const S = await import('../src/world/ShapeBoxes.js');
const F = await import('../src/blocks/fruitSeasons.js');
const PS = await import('../src/blocks/plantSeasons.js');
const I = await import('../src/items/ItemRegistry.js');
const FOODS = (await import('../src/items/foods.js')).FOODS;
const { GROUPS } = await import('../src/crafting/recipes.js');

// --- Bloki ------------------------------------------------------------------

const supports = ['vine_trellis', 'vine_trellis_z', 'garden_pole', 'pergola'];
check(supports.map((type) => R.getBlockId(type)).join() === '15600,15601,15602,15603', 'Podpory: numery 15600-15603');
for (const type of supports) {
    const definition = R.getBlockDefinition(type);
    check(definition.model === 'shape' && definition.cutout && definition.solid && !definition.opaque, `${type}: kształt z prześwitami`);
}
check(R.getBlockDefinition('vine_trellis_z').inventory === false && R.getBlockDefinition('vine_trellis_z').drops === 'vine_trellis', 'Kratka wzdłuż z: tylko w świecie, oddaje kratkę');

let pieces = 0;
for (const species of V.VINE_NAMES) {
    const vine = V.VINES[species];
    for (const stage of ['young', ...vine.stages]) for (const mount of V.VINE_MOUNTS) {
        const type = V.vineType(species, stage, mount);
        const id = R.getBlockId(type);
        pieces++;
        if (id !== V.vineId(species, stage, mount) || id < 15616 || id >= V.VINE_END_ID) check(false, `${type}: numer ${id}`);
        const info = V.vineInfoById(id);
        if (info.species !== species || info.stage !== stage || info.mount !== mount) check(false, `${type}: opis`);
    }
}
check(pieces === 4 * 8 + 4 * 8 + 4 * 8 + 5 * 8, `Kawałki pnączy: ${pieces} bloków (gatunek × etap × mocowanie)`);
check(R.getBlockDefinition('vine_grape_young_north').model === 'flat' && R.getBlockDefinition('vine_grape_young_north').flat.attach === 'north', 'Na murze: płaski obrazek');
check(R.getBlockDefinition('vine_hop_leaves_pole').model === 'shape' && R.getBlockDefinition('vine_hop_leaves_pole').vineSupportType === 'garden_pole', 'Na tyczce: kształt, pod spodem tyczka');
check(R.getGrowth('vine_grape_young_north').into === 'vine_grape_leaves_north' && R.getGrowth('vine_grape_leaves_north').into === 'vine_grape_unripe_north' &&
    R.getGrowth('vine_kiwi_leaves_roof').into === 'vine_kiwi_flower_roof' && !R.getGrowth('vine_kiwi_ripe_roof'), 'Etapy po kolei, dojrzałe czekają na zbiór');
for (const [species, item] of [['grape', 'grapes'], ['hop', 'hop_cone'], ['kiwi', 'kiwi'], ['passion_fruit', 'passion_fruit']]) {
    const harvest = R.getHarvest(V.vineType(species, 'ripe', 'trellis'));
    check(harvest.item === item && harvest.becomes === V.vineType(species, 'leaves', 'trellis'), `${species}: zbiór ${item}, zostają liście`);
    check(I.itemExists(item) && V.vineOfItem(item) === species, `${item}: przedmiot, sadzi ${species}`);
}

// Kształty: podpora sama, z liśćmi, owoce pod pergolą; kolizja tylko podpory.
const boxes = (type, purpose = 'render') => S.shapeBoxes(R.getBlockId(type), purpose);
check(boxes('vine_trellis').length === 1 && boxes('vine_grape_leaves_trellis').length === 3 && boxes('vine_grape_leaves_trellis').filter((box) => box[6] === 1).length === 2,
    'Kratka: płyta; z pnączem - liście z obu stron');
check(boxes('vine_trellis_z')[0][0] > 0.4 && boxes('vine_trellis')[0][2] > 0.4, 'Kratka wzdłuż z - obrócona');
check(JSON.stringify(boxes('vine_grape_leaves_trellis', 'collision')) === JSON.stringify(boxes('vine_trellis', 'collision')), 'Pnącze nie zmienia kolizji kratki');
check(boxes('vine_kiwi_ripe_roof').some((box) => box[6] === 2) && !boxes('vine_kiwi_leaves_roof').some((box) => box[6] === 2) &&
    !boxes('vine_grape_ripe_roof').some((box) => box[6] === 2), 'Pergola: kiwi i marakuja wiszą pod daszkiem, winogrona nie');
check(R.getBlockDefinition('vine_kiwi_ripe_roof').shapeTextures.join() === 'vine_kiwi_ripe,vine_kiwi_hang', 'Tekstury liści i wiszących owoców');

// --- Świat na niby -------------------------------------------------------------

function world() {
    const cells = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    return {
        cells,
        getBlockId: (x, y, z) => cells.get(key(x, y, z)) ?? 0,
        getBlock(x, y, z) { const id = cells.get(key(x, y, z)); return id ? R.getBlockTypeById(id) : null; },
        setBlock(x, y, z, type) { if (type) cells.set(key(x, y, z), R.getBlockId(type)); else cells.delete(key(x, y, z)); return true; },
        type(x, y, z) { return this.getBlock(x, y, z); },
        fill(x0, y0, z0, x1, y1, z1, type) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, type); return this; }
    };
}
const hit = (x, y, z, normal = { x: 0, y: 0, z: 0 }) => ({ hit: true, block: { x, y, z }, normal });
const ground = () => world().fill(-8, 0, -8, 8, 0, 8, 'grass');

// --- Sadzenie -----------------------------------------------------------------

{
    const w = ground();
    w.setBlock(0, 1, 0, 'vine_trellis');
    check(G.vinePlanting(w, hit(0, 1, 0), 'grape')?.type === 'vine_grape_young_trellis', 'Kratka na ziemi: winorośl zarasta kratkę');
    w.setBlock(2, 1, 0, 'garden_pole');
    check(G.vinePlanting(w, hit(2, 1, 0), 'hop')?.type === 'vine_hop_young_pole', 'Tyczka na ziemi: chmiel');
    w.setBlock(0, 3, 4, 'vine_trellis');
    check(G.vinePlanting(w, hit(0, 3, 4), 'grape') === null, 'Kratka w powietrzu - nie');
    w.setBlock(4, 3, 0, 'pergola');
    check(G.vinePlanting(w, hit(4, 3, 0), 'kiwi') === null, 'Pergola - pnącze dochodzi do niej samo');
    // Mur (kamień) z boku: pnącze przed nim, nad ziemią.
    w.fill(-5, 1, -5, -5, 4, -5, 'stone');
    const side = G.vinePlanting(w, hit(-5, 1, -5, { x: 0, y: 0, z: 1 }), 'kiwi');
    check(side && side.x === -5 && side.z === -4 && side.type === 'vine_kiwi_young_north', 'Bok muru: płaskie pnącze przed nim (oparte o mur)');
    check(G.vinePlanting(w, hit(-5, 2, -5, { x: 0, y: 0, z: 1 }), 'kiwi') === null, 'Bok muru nad powietrzem - nie (korzeń w ziemi)');
    const floor = G.vinePlanting(w, hit(-4, 0, -5, { x: 0, y: 1, z: 0 }), 'passion_fruit');
    check(floor && floor.y === 1 && floor.type === 'vine_passion_fruit_young_west', 'Ziemia przy murze: pnącze na murze obok');
    check(G.vinePlanting(w, hit(3, 0, 3, { x: 0, y: 1, z: 0 }), 'grape') === null, 'Ziemia bez muru - nie');
    check(G.vinePlanting(w, hit(-5, 1, -5, { x: 0, y: 1, z: 0 }), 'grape') === null, 'Wierzch muru - nie');
}

// --- Wspinanie ------------------------------------------------------------------

const always = (w, x, y, z, times = 40) => { let grown = 0; for (let i = 0; i < times; i++) if (G.climbVine(w, x, y, z)) grown++; return grown; };

{
    // Mur 5 wysoki, 3 szeroki; winorośl (do 5 bloków) przy środku.
    const w = ground().fill(-1, 1, 0, 1, 5, 0, 'stone');
    w.setBlock(0, 1, 1, 'vine_grape_leaves_north');
    // Wszystkie kawałki rosną wiele razy - pnącze zarasta mur.
    for (let round = 0; round < 30; round++) {
        for (const [key, id] of [...w.cells]) {
            if (!V.vineInfoById(id)) continue;
            const [x, y, z] = key.split(',').map(Number);
            G.climbVine(w, x, y, z);
        }
    }
    const vines = [...w.cells].filter(([, id]) => V.vineInfoById(id));
    const positions = vines.map(([key]) => key.split(',').map(Number));
    check(vines.length >= 10 && vines.length <= 15, `Mur 3 × 5 zarośnięty (${vines.length} kawałków)`);
    check(positions.every(([x, y, z]) => z === 1 && x >= -1 && x <= 1 && y >= 1 && y <= 5), 'Tylko przed murem, nie obok ani nad nim');
    check(vines.every(([, id]) => V.vineInfoById(id).mount === 'north'), 'Wszystkie oparte o mur');
}

{
    // Wysoki mur - pnącze staje na swojej wysokości (chmiel 6).
    const w = ground().fill(0, 1, 0, 0, 12, 0, 'stone');
    w.setBlock(0, 1, 1, 'vine_hop_leaves_north');
    for (let round = 0; round < 40; round++) for (const [key, id] of [...w.cells]) {
        if (!V.vineInfoById(id)) continue;
        const [x, y, z] = key.split(',').map(Number);
        G.climbVine(w, x, y, z);
    }
    const top = Math.max(...[...w.cells].filter(([, id]) => V.vineInfoById(id)).map(([key]) => Number(key.split(',')[1])));
    check(top === 6, `Chmiel na murze kończy się na 6 blokach (${top})`);
}

{
    // Tłok: długi mur - jedno pnącze nie zarasta go całego.
    const w = ground().fill(-8, 1, 0, 8, 3, 0, 'stone');
    w.setBlock(0, 1, 1, 'vine_grape_leaves_north');
    for (let round = 0; round < 80; round++) for (const [key, id] of [...w.cells]) {
        if (!V.vineInfoById(id)) continue;
        const [x, y, z] = key.split(',').map(Number);
        G.climbVine(w, x, y, z);
    }
    const count = [...w.cells].filter(([, id]) => V.vineInfoById(id)).length;
    const xs = [...w.cells].filter(([, id]) => V.vineInfoById(id)).map(([key]) => Number(key.split(',')[0]));
    check(count <= V.VINE_CROWD && count >= 8 && Math.max(...xs.map(Math.abs)) <= V.VINE_REACH, `Długi mur: pnącze zatrzymuje się przy korzeniu (${count} kawałków, do ${Math.max(...xs.map(Math.abs))} bloków w bok)`);
}

{
    // Kratki obok siebie i nad sobą; tyczka; pergola nad kratką.
    const w = ground();
    w.fill(0, 1, 0, 2, 2, 0, 'vine_trellis');
    w.setBlock(0, 1, 0, 'vine_passion_fruit_leaves_trellis');
    check(always(w, 0, 1, 0) >= 1 && w.type(0, 2, 0) === 'vine_passion_fruit_young_trellis' || w.type(1, 1, 0) === 'vine_passion_fruit_young_trellis', 'Kratka: pnącze przechodzi na kratkę obok');
    w.setBlock(5, 1, 5, 'vine_trellis_z');
    w.setBlock(5, 1, 4, 'vine_grape_leaves_trellis');
    check(G.climbMount(w, 5, 1, 5, 'trellis', false) === null && G.climbMount(w, 5, 1, 5, 'trellis_z', false) === 'trellis_z', 'Kratka w drugą stronę - nie przechodzi');

    w.fill(-4, 1, -4, -4, 3, -4, 'garden_pole');
    w.setBlock(-4, 4, -4, 'pergola');
    w.setBlock(-3, 4, -4, 'pergola');
    w.setBlock(-4, 1, -4, 'vine_kiwi_leaves_pole');
    for (let i = 0; i < 6; i++) for (const y of [1, 2, 3, 4]) if (V.vineInfoById(w.getBlockId(-4, y, -4))) G.climbVine(w, -4, y, -4);
    check(w.type(-4, 3, -4) === 'vine_kiwi_young_pole', 'Tyczka: kiwi pnie się w górę');
    check(w.type(-4, 4, -4) === 'vine_kiwi_young_roof', 'Z tyczki na pergolę (daszek)');
    for (let i = 0; i < 10; i++) G.climbVine(w, -4, 4, -4);
    check(w.type(-3, 4, -4) === 'vine_kiwi_young_roof', 'Pod daszkiem rozchodzi się na pergolę obok');
    check(G.climbMount(w, -4, 2, -4, 'roof', false) === null, 'Z daszku nie schodzi w dół po tyczce');
}

{
    // Kratka na tyczce nie przyjmie pnącza z tyczki; mur nie z kratki.
    const w = ground();
    w.setBlock(0, 2, 0, 'vine_trellis');
    check(G.climbMount(w, 0, 2, 0, 'pole', true) === null, 'Z tyczki tylko na tyczkę albo pergolę');
    check(G.climbMount(w, 3, 2, 3, 'trellis', true) === null, 'Z kratki nie w powietrze');
}

// --- Zniszczenie -------------------------------------------------------------

check(G.vineLeftover('vine_grape_ripe_trellis_z') === 'vine_trellis_z' && G.vineLeftover('vine_hop_young_pole') === 'garden_pole' &&
    G.vineLeftover('vine_kiwi_ripe_roof') === 'pergola' && G.vineLeftover('vine_grape_ripe_north') === null && G.vineLeftover('stone') === null,
    'Zniszczone pnącze: zostaje podpora (z muru - nic)');

// --- Pory roku, jedzenie, napar --------------------------------------------------

const entry = PS.plantSeasonInfo(R.getBlockId('vine_grape_ripe_west'));
check(entry && entry.stage === 2 && entry.seasons.join() === '1,2' && entry.shown[0] === R.getBlockId('vine_grape_leaves_west'), 'Winogrona: lato i jesień, poza porą - liście');
check(PS.plantSeasonInfo(R.getBlockId('vine_kiwi_flower_roof'))?.stage === 1, 'Kiwi: kwiaty - pierwszy znak pory');
check(F.fruitCalendar().some(([label]) => label === 'Marakuja'), 'Kalendarz: marakuja');
check(FOODS.grapes && FOODS.kiwi && FOODS.passion_fruit && !FOODS.hop_cone, 'Winogrona, kiwi, marakuja - jedzenie; chmiel - nie');
check(GROUPS.herbs_calm.types.includes('hop_cone'), 'Szyszki chmielu: napar na sen');

// --- Przepisy, osiągnięcia, komenda, dzikie pnącza ----------------------------------

const { RECIPES } = await import('../src/crafting/recipes.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
for (const type of ['vine_trellis', 'garden_pole', 'pergola']) check(RECIPES.some((recipe) => recipe.result[0] === type), `${type}: przepis`);
const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
check(byId.vine_planted.when({ vine: 'grape' }) && !byId.vine_planted.when({ type: 'shrub_raspberry_sapling' }), 'Osiągnięcie: Na podporze');
check(byId.grape_harvest.when({ item: 'grapes', type: 'vine_grape_ripe_north' }), 'Osiągnięcie: Winobranie');
check(byId.hop_garden.when({ item: 'hop_cone', type: 'vine_hop_ripe_pole' }) && !byId.hop_garden.when({ item: 'hop_cone', type: 'vine_hop_ripe_north' }), 'Osiągnięcie: Chmielnik - z tyczki');
check(byId.under_pergola.when({ item: 'kiwi', type: 'vine_kiwi_ripe_roof' }) && !byId.under_pergola.when({ item: 'kiwi', type: 'vine_kiwi_ripe_trellis' }), 'Osiągnięcie: Pod pergolą');
const commands = read('src/commands/worldCommands.js');
check(commands.includes("name: 'pnacza'") && commands.includes('vineGallery(player, world)') && read('docs/komendy.md').includes('/pnacza galeria'), 'Komenda /pnacza (galeria, daj, znajdz) w komendy.md');
const generator = read('src/world/terrain/RealisticGenerator.js');
check(generator.includes('this.decorateVines(chunk') && /const WILD_VINES = \{/.test(generator), 'Dzikie pnącza na pniach');
const { BIOMES } = await import('../src/world/terrain/Biomes.js');
for (const key of ['deciduous', 'beech', 'birch', 'maple_forest', 'olive_grove', 'savanna', 'rainforest', 'eucalyptus_forest', 'mangrove']) check(BIOMES[key], `Biom ${key} istnieje`);

// --- Kod i dokumentacja -----------------------------------------------------------

check(read('src/rendering/ChunkMesher.js').includes('cutoutShapes.push(lx, y, lz, id)'), 'Kształty z prześwitami rysowane z roślinami');
check(read('src/interaction/BlockBreaker.js').includes('vineLeftover('), 'Zniszczenie zostawia podporę');
check(read('src/game/PlantGrowth.js').includes('climbVine(this.world, x, y, z)'), 'Wzrost: wspinanie');
check(read('docs/pnacza.md').includes('po podporze') && read('docs/pnacza.md').includes('## Czego nie ma (luki)') && !read('docs/pnacza.md').includes('w budowie'), 'docs/pnacza.md: zasady i luki');
check(read('docs/ziola.md').includes('szyszki chmielu') && read('docs/numery-blokow.md').includes('15600-15999'), 'Zioła i numery bloków');

console.log(`OK: pnącza - ${checks} sprawdzeń (bloki, kształty, sadzenie, wspinanie po murze, kratce, tyczce i pergoli, pory roku).`);
