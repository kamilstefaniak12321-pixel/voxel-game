// ------------------------------------------------------------
// SPRAWDZENIE FASOLI I GROCHU (1.31.0, docs/pnacza.md)
//
// - podpory: siatka, chrust, wigwam z tyczek - numery, kształty, obrazek
//   wigwamu 2 x 3 bloki, brak kolizji tego, co stoi na ziemi,
// - gatunki: własne mocowania i numery, etapy (fasola z suchymi strąkami),
//   zbiór według podpory, suche strąki kończą roślinę,
// - sianie: nasionami (sucha fasola, groch), tylko na podporę swojego
//   gatunku albo na polu; inne pnącza nie wchodzą na siatkę i wigwam,
// - wspinanie: fasola po tyczkach do 3 bloków, groch po siatce do 2,
//   wigwam i rośliny na ziemi nigdzie się nie pną,
// - jednoroczność: zimą giną (zostaje podpora), latem ostatni etap czeka,
// - pory roku, jedzenie, psucie, przepisy, osiągnięcia, dzikie plamy,
//   komenda, tekstury, dokumentacja.
//
// Uruchomienie: node tools/sprawdz_fasoli.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const { CHUNK_SIZE } = await import('../src/config.js');
const R = await import('../src/blocks/BlockRegistry.js');
const V = await import('../src/blocks/vines.js');
const G = await import('../src/game/VineGrowth.js');
const S = await import('../src/world/ShapeBoxes.js');
const F = await import('../src/blocks/fruitSeasons.js');
const PS = await import('../src/blocks/plantSeasons.js');
const I = await import('../src/items/ItemRegistry.js');
const { seasonAt } = await import('../src/sky/Seasons.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { shapeInfo } = await import('../src/blocks/woodShapes.js');
const FOODS = (await import('../src/items/foods.js')).FOODS;
const { ingredientKind } = await import('../src/items/cooking.js');
const { spoilKind } = await import('../src/items/spoilage.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');

// --- Podpory -------------------------------------------------------------------

check(['pea_net', 'pea_net_z', 'pea_brush', 'bean_wigwam'].map((type) => R.getBlockId(type)).join() === '15604,15605,15606,15607', 'Podpory: numery 15604-15607');
const boxes = (type, purpose = 'render') => S.shapeBoxes(R.getBlockId(type), purpose);
check(JSON.stringify(boxes('pea_net')) === JSON.stringify(boxes('vine_trellis')) && JSON.stringify(boxes('pea_net_z')) === JSON.stringify(boxes('vine_trellis_z')),
    'Siatka: kształt kratki, w dwie strony');
check(R.getBlockDefinition('pea_net').textures.all === 'pea_net' && R.getBlockDefinition('pea_net_z').drops === 'pea_net', 'Siatka: własna tekstura; obrócona oddaje siatkę');
check(boxes('pea_brush').length === 2 && boxes('vine_pea_leaves_brush').length === 6 && boxes('pea_brush', 'collision').length === 1, 'Chrust: dwie skrzyżowane płyty; z grochem liście z czterech stron');

const wigwam = R.getBlockDefinition('bean_wigwam');
check(wigwam.model === 'shape' && wigwam.cutout && wigwam.solid === false && wigwam.needsGround && wigwam.modelIcon === 'item_bean_wigwam', 'Wigwam: bez kolizji, stoi na ziemi, płaska ikonka');
check(boxes('bean_wigwam').length === 2 && boxes('bean_wigwam')[0][0] === -0.5 && boxes('bean_wigwam')[0][3] === 1.5 && boxes('bean_wigwam')[0][4] === 3 &&
    boxes('bean_wigwam', 'collision').length === 0, 'Wigwam: dwie płyty 2 × 3 bloki, bez kolizji');
check(shapeInfo(R.getBlockId('bean_wigwam')).sprite.width === 2 && shapeInfo(R.getBlockId('vine_bean_ripe_wigwam')).sprite.height === 3, 'Wigwam: obrazek rozciągnięty na płyty');
check(JSON.stringify(boxes('vine_bean_ripe_wigwam')) === JSON.stringify(boxes('bean_wigwam')) && R.getBlockDefinition('vine_bean_ripe_wigwam').textures.all === 'bean_wigwam_ripe',
    'Wigwam z fasolą: te same płyty, obrazek etapu');
for (const key of ['bean_wigwam', 'bean_wigwam_young', 'bean_wigwam_leaves', 'bean_wigwam_flower', 'bean_wigwam_ripe', 'bean_wigwam_dry']) {
    const region = readTextureRegion(key);
    check(region.width === 32 && region.height === 48, `${key}: obrazek 32 × 48`);
}
{
    // Na każdym obrazku z liśćmi jest więcej pikseli niż na gołym wigwamie.
    const filled = (key) => { const { rgba } = readTextureRegion(key); let n = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) n++; return n; };
    check(filled('bean_wigwam_leaves') > filled('bean_wigwam') * 2 && filled('bean_wigwam_young') > filled('bean_wigwam'), 'Wigwam: tyczki, siewki, liście');
}

// --- Gatunki ---------------------------------------------------------------------

check(V.vineMounts('bean').join() === 'ground,pole,trellis,trellis_z,wigwam' && V.vineMounts('pea').join() === 'ground,net,net_z,brush,trellis,trellis_z' &&
    V.vineMounts('grape') === V.VINE_MOUNTS, 'Mocowania: fasola i groch mają własne');
check(V.VINES.bean.annual && V.VINES.pea.annual && !V.VINES.grape.annual, 'Fasola i groch są jednoroczne');
check(V.vineId('bean', 'young', 'ground') === 15872 && V.vineId('pea', 'ripe', 'trellis_z') === 15936 + 4 * 8 + 5 && V.vineId('bean', 'dry', 'wigwam') === 15872 + 5 * 8 + 4,
    'Numery: 64 na gatunek, 8 na etap');
for (const species of ['bean', 'pea']) {
    for (const stage of ['young', ...V.VINES[species].stages]) for (const mount of V.vineMounts(species)) {
        const type = V.vineType(species, stage, mount);
        const definition = R.getBlockDefinition(type);
        if (R.getBlockId(type) !== V.vineId(species, stage, mount) || definition.id >= V.VINE_END_ID) check(false, `${type}: numer`);
        if (!definition.grows?.annual) check(false, `${type}: każdy etap jest na liście rosnących (zimą ginie)`);
        if (definition.model !== 'shape' || !definition.cutout) check(false, `${type}: kształt z prześwitami`);
    }
}
check(R.getGrowth('vine_bean_young_pole').into === 'vine_bean_leaves_pole' && R.getGrowth('vine_bean_flower_pole').into === 'vine_bean_ripe_pole' &&
    R.getGrowth('vine_bean_ripe_pole').into === 'vine_bean_dry_pole' && R.getGrowth('vine_bean_ripe_pole').seconds === V.VINE_DRY_SECONDS, 'Fasola: siewki → liście → kwiaty → strąki → suche strąki');
check(R.getGrowth('vine_bean_dry_pole').rest && R.getGrowth('vine_pea_ripe_net').rest && !R.blockExists('vine_pea_dry_net'), 'Ostatni etap czeka; groch nie ma suchych strąków');
check(R.getBlockDefinition('vine_bean_ripe_ground').solid === false && R.getBlockDefinition('vine_bean_ripe_ground').needsGround && boxes('vine_pea_ripe_ground', 'collision').length === 0,
    'Na ziemi: bez kolizji, potrzebuje ziemi');

// Zbiór: strąki zostawiają liście; suche strąki kończą roślinę.
const harvest = (type) => R.getHarvest(type);
check(harvest('vine_bean_ripe_pole').item === 'bean_pod' && harvest('vine_bean_ripe_pole').becomes === 'vine_bean_leaves_pole', 'Strąki fasoli: zostają liście');
check(harvest('vine_bean_ripe_wigwam').count.join() === '4,6' && harvest('vine_bean_ripe_ground').count.join() === '1,1' && harvest('vine_bean_ripe_pole').count.join() === '1,2',
    'Fasola: wigwam daje najwięcej, na ziemi najmniej');
check(harvest('vine_bean_dry_pole').item === 'beans' && harvest('vine_bean_dry_pole').becomes === 'garden_pole' && harvest('vine_bean_dry_wigwam').becomes === 'bean_wigwam' &&
    harvest('vine_bean_dry_ground').becomes === null && harvest('vine_bean_dry_wigwam').count.join() === '6,9', 'Sucha fasola: zostaje sama podpora (na ziemi - nic)');
check(harvest('vine_pea_ripe_net').item === 'pea_pod' && harvest('vine_pea_ripe_net').count.join() === '2,3' && harvest('vine_pea_ripe_ground').count.join() === '1,1', 'Groch: na podporze 2-3 strąki, na ziemi 1');
check(V.vineOfItem('beans') === 'bean' && V.vineOfItem('peas') === 'pea' && V.vineOfItem('bean_pod') === null && V.vineOfItem('pea_pod') === null && V.vineOfItem('grapes') === 'grape',
    'Sieje się nasionami: suchą fasolą i grochem (strąkami nie)');

// --- Świat na niby ----------------------------------------------------------------

function world() {
    const cells = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    return {
        cells,
        getBlockId: (x, y, z) => cells.get(key(x, y, z)) ?? 0,
        getBlock(x, y, z) { const id = cells.get(key(x, y, z)); return id ? R.getBlockTypeById(id) : null; },
        setBlock(x, y, z, type) { if (type) cells.set(key(x, y, z), R.getBlockId(type)); else cells.delete(key(x, y, z)); return true; },
        fill(x0, y0, z0, x1, y1, z1, type) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.setBlock(x, y, z, type); return this; }
    };
}
const hit = (x, y, z, normal = { x: 0, y: 0, z: 0 }) => ({ hit: true, block: { x, y, z }, normal });
const up = { x: 0, y: 1, z: 0 };
const ground = () => world().fill(-8, 0, -8, 8, 0, 8, 'grass');

// --- Sianie ---------------------------------------------------------------------

{
    const w = ground();
    w.setBlock(0, 1, 0, 'garden_pole'); w.setBlock(2, 1, 0, 'bean_wigwam'); w.setBlock(4, 1, 0, 'pea_net'); w.setBlock(6, 1, 0, 'pea_brush');
    w.setBlock(-2, 1, 0, 'vine_trellis'); w.setBlock(-4, 1, 0, 'pea_net_z');
    check(G.vinePlanting(w, hit(0, 1, 0), 'bean')?.type === 'vine_bean_young_pole', 'Fasola w tyczkę');
    check(G.vinePlanting(w, hit(2, 1, 0), 'bean')?.type === 'vine_bean_young_wigwam', 'Fasola w wigwam');
    check(G.vinePlanting(w, hit(-2, 1, 0), 'bean')?.type === 'vine_bean_young_trellis' && G.vinePlanting(w, hit(-2, 1, 0), 'pea')?.type === 'vine_pea_young_trellis', 'Fasola i groch w kratkę');
    check(G.vinePlanting(w, hit(4, 1, 0), 'pea')?.type === 'vine_pea_young_net' && G.vinePlanting(w, hit(-4, 1, 0), 'pea')?.type === 'vine_pea_young_net_z' &&
        G.vinePlanting(w, hit(6, 1, 0), 'pea')?.type === 'vine_pea_young_brush', 'Groch w siatkę i chrust');
    check(G.vinePlanting(w, hit(4, 1, 0), 'bean') === null && G.vinePlanting(w, hit(6, 1, 0), 'bean') === null, 'Fasola nie wejdzie na siatkę ani chrust');
    check(G.vinePlanting(w, hit(0, 1, 0), 'pea') === null && G.vinePlanting(w, hit(2, 1, 0), 'pea') === null, 'Groch nie wejdzie na tyczkę ani wigwam');
    check(G.vinePlanting(w, hit(4, 1, 0), 'grape') === null && G.vinePlanting(w, hit(2, 1, 0), 'hop') === null && G.vinePlanting(w, hit(6, 1, 0), 'kiwi') === null,
        'Winorośl, chmiel i kiwi nie wchodzą na siatkę, wigwam ani chrust');
    // Bez podpory: tylko na polu (rozgrzebanej ziemi), nie na trawie.
    w.setBlock(-6, 0, 3, 'tilled_dirt'); w.setBlock(-5, 0, 3, 'tilled_compost');
    check(G.vinePlanting(w, hit(-6, 0, 3, up), 'bean')?.type === 'vine_bean_young_ground' && G.vinePlanting(w, hit(-5, 0, 3, up), 'pea')?.type === 'vine_pea_young_ground', 'Bez podpory: na polu płożą się po ziemi');
    check(G.vinePlanting(w, hit(3, 0, 3, up), 'bean') === null && G.vinePlanting(w, hit(3, 0, 3, up), 'pea') === null, 'Na trawie - nie');
    check(G.vinePlanting(w, hit(-6, 0, 3, up), 'grape') === null, 'Winorośl bez muru się nie płoży');
    // Mur: fasola i groch nie rosną na ścianie.
    w.fill(-8, 1, -8, -8, 3, -8, 'stone');
    check(G.vinePlanting(w, hit(-8, 1, -8, { x: 0, y: 0, z: 1 }), 'bean') === null && G.vinePlanting(w, hit(-8, 1, -8, { x: 0, y: 0, z: 1 }), 'grape')?.type === 'vine_grape_young_north',
        'Na murze: winorośl tak, fasola nie');
    w.setBlock(0, 5, 5, 'garden_pole');
    check(G.vinePlanting(w, hit(0, 5, 5), 'bean') === null, 'Tyczka w powietrzu - nie');
}

// --- Wspinanie --------------------------------------------------------------------

const growAll = (w, rounds = 30) => {
    for (let round = 0; round < rounds; round++) for (const [key, id] of [...w.cells]) {
        if (!V.vineInfoById(id)) continue;
        const [x, y, z] = key.split(',').map(Number);
        G.climbVine(w, x, y, z);
    }
};
const pieces = (w, species) => [...w.cells].filter(([, id]) => V.vineInfoById(id)?.species === species).map(([key]) => key.split(',').map(Number));

{
    // Fasola: tyczki 5 wysokie - wejdzie na 3.
    const w = ground().fill(0, 1, 0, 0, 5, 0, 'garden_pole');
    w.setBlock(0, 1, 0, 'vine_bean_leaves_pole');
    growAll(w);
    check(pieces(w, 'bean').length === 3 && Math.max(...pieces(w, 'bean').map(([, y]) => y)) === 3 && w.getBlock(0, 4, 0) === 'garden_pole', 'Fasola po tyczce: do 3 bloków');
    // Pergola nad tyczką - fasola na nią nie wchodzi.
    const p = ground().fill(0, 1, 0, 0, 2, 0, 'garden_pole');
    p.setBlock(0, 3, 0, 'pergola'); p.setBlock(0, 1, 0, 'vine_bean_leaves_pole');
    growAll(p);
    check(p.getBlock(0, 3, 0) === 'pergola' && pieces(p, 'bean').length === 2, 'Fasola nie wchodzi na pergolę');
}

{
    // Groch: siatki 3 × 3 - do 2 bloków, przy ziemi nie idzie w bok.
    const w = ground().fill(0, 1, 0, 2, 3, 0, 'pea_net');
    w.setBlock(0, 1, 0, 'vine_pea_leaves_net');
    growAll(w, 40);
    const found = pieces(w, 'pea');
    check(found.every(([, y]) => y <= 2) && found.some(([, y]) => y === 2), `Groch po siatce: do 2 bloków (${found.length} kawałków)`);
    check(w.getBlock(1, 1, 0) === 'pea_net' && w.getBlock(2, 1, 0) === 'pea_net', 'Przy ziemi groch nie przechodzi na siatkę obok - każdą trzeba obsiać');
    check(w.getBlock(1, 2, 0) === 'vine_pea_young_net', 'Wyżej przechodzi na siatkę obok');
    // Siatka w drugą stronę i chrust.
    const n = ground().fill(0, 1, 0, 1, 2, 0, 'pea_net');
    check(G.climbMount(n, 0, 2, 0, 'net_z', true, 'pea') === null && G.climbMount(n, 1, 2, 0, 'net', false, 'pea') === 'net' && G.climbMount(n, 1, 2, 0, 'net', false, 'grape') === null,
        'Siatka: tylko ustawiona tak samo i tylko groch');
    const b = ground().fill(0, 1, 0, 0, 3, 0, 'pea_brush');
    b.setBlock(1, 1, 0, 'pea_brush'); b.setBlock(0, 1, 0, 'vine_pea_leaves_brush');
    growAll(b);
    check(pieces(b, 'pea').length === 2 && b.getBlock(0, 2, 0) === 'vine_pea_young_brush' && b.getBlock(1, 1, 0) === 'pea_brush', 'Chrust: tylko w górę, do 2 bloków');
}

{
    // Wigwam i rośliny na ziemi nigdzie się nie pną.
    const w = ground();
    w.setBlock(0, 1, 0, 'vine_bean_leaves_wigwam'); w.setBlock(1, 1, 0, 'bean_wigwam'); w.setBlock(0, 2, 0, 'garden_pole');
    w.setBlock(4, 1, 0, 'vine_pea_leaves_ground'); w.setBlock(5, 1, 0, 'pea_net'); w.setBlock(4, 2, 0, 'pea_net');
    growAll(w, 20);
    check(pieces(w, 'bean').length === 1 && pieces(w, 'pea').length === 1, 'Wigwam i groch na ziemi zostają jednym blokiem');
    check(G.climbMount(w, 1, 1, 0, 'pole', false, 'bean') === null, 'Na wigwam się nie wchodzi - sieje się go osobno');
}

// --- Jednoroczność: zima ------------------------------------------------------------

const dayOf = (season) => { for (let days = 0; days < 400; days += 0.25) { const at = seasonAt(days); if (at.index === season && at.progress > 0.4 && at.progress < 0.6) return days; } throw new Error('brak pory'); };

{
    const blocks = new Map();
    const index = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    const chunk = { cx: 0, cz: 0, modified: true, growing: new Set(), get blocks() { return new Proxy({}, { get: (_, i) => blocks.get(Number(i)) ?? 0 }); } };
    const w = {
        chunks: new Map([['0,0', chunk]]),
        getBlockId: (x, y, z) => blocks.get(index(x, y, z)) ?? 0,
        getBlock: (x, y, z) => { const id = blocks.get(index(x, y, z)) ?? 0; return id ? R.getBlockTypeById(id) : null; },
        setBlock(x, y, z, type) {
            blocks.set(index(x, y, z), type === null ? 0 : R.getBlockId(type));
            if (type !== null && R.getGrowth(type)) chunk.growing.add(index(x, y, z)); else chunk.growing.delete(index(x, y, z));
            return true;
        }
    };
    const plant = () => {
        blocks.clear(); chunk.growing.clear();
        for (let x = 0; x < 10; x++) w.setBlock(x, 4, 2, 'tilled_dirt');
        w.setBlock(0, 5, 2, 'vine_bean_dry_pole'); w.setBlock(1, 5, 2, 'vine_bean_ripe_wigwam'); w.setBlock(2, 5, 2, 'vine_bean_leaves_ground');
        w.setBlock(3, 5, 2, 'vine_pea_ripe_net'); w.setBlock(4, 5, 2, 'vine_pea_young_brush'); w.setBlock(5, 5, 2, 'vine_pea_flower_ground');
        w.setBlock(6, 5, 2, 'vine_grape_leaves_pole'); w.setBlock(7, 5, 2, 'vine_pea_ripe_trellis_z');
    };
    const row = () => Array.from({ length: 8 }, (_, x) => w.getBlock(x, 5, 2));
    const growth = new PlantGrowth(w);
    const realRandom = Math.random;
    let state = 311;
    Math.random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;

    // Zima: wszystko jednoroczne ginie, zostają podpory; winorośl stoi.
    plant();
    growth.days = dayOf(3);
    for (let i = 0; i < 1200; i++) growth.tick();
    check(row().join() === 'garden_pole,bean_wigwam,,pea_net,pea_brush,,vine_grape_leaves_pole,vine_trellis_z', `Zima: fasola i groch giną, zostają podpory (${row().join()})`);
    check(growth.withered === 7, `Zginęło 7 kawałków (${growth.withered})`);

    // Lato: ostatni etap czeka (groch ze strąkami, sucha fasola), nic nie ginie.
    plant();
    growth.days = dayOf(1);
    for (let i = 0; i < 300; i++) growth.tick();
    check(w.getBlock(0, 5, 2) === 'vine_bean_dry_pole' && w.getBlock(3, 5, 2) === 'vine_pea_ripe_net' && w.getBlock(7, 5, 2) === 'vine_pea_ripe_trellis_z', 'Lato: ostatni etap czeka na zbiór');
    check(row().every((type) => type && type.startsWith('vine_')), 'Latem nic nie ginie');
    // Strąki fasoli zostawione na pędach wysychają.
    for (let i = 0; i < 6000; i++) growth.tick();
    check(w.getBlock(1, 5, 2) === 'vine_bean_dry_wigwam', `Strąki fasoli wysychają (${w.getBlock(1, 5, 2)})`);
    // /krzaki rosnij nie rusza ostatniego etapu.
    plant();
    growth.growAround(0, 2, 30, 1);
    check(w.getBlock(0, 5, 2) === 'vine_bean_dry_pole' && w.getBlock(3, 5, 2) === 'vine_pea_ripe_net', '/krzaki rosnij: ostatni etap zostaje');
    Math.random = realRandom;
}

// --- Pory roku ------------------------------------------------------------------

check(F.VINE_SEASONS.bean.join() === '1,2' && F.VINE_SEASONS.pea.join() === '0,1', 'Groch: wiosna i lato; fasola: lato i jesień');
const info = PS.plantSeasonInfo(R.getBlockId('vine_bean_dry_wigwam'));
check(info && info.stage === 2 && info.shown[0] === R.getBlockId('vine_bean_leaves_wigwam') && info.shown[1] === R.getBlockId('vine_bean_flower_wigwam'), 'Poza porą widać liście, pierwszy znak pory - kwiaty');
check(PS.plantSeasonInfo(R.getBlockId('vine_pea_ripe_ground'))?.seasons.join() === '0,1' && F.fruitCalendar().some(([label]) => label === 'Groch') && F.fruitCalendar().some(([label]) => label === 'Fasola'), 'Kalendarz: groch i fasola');
check(PS.plantGrowthFactor(R.getBlockId('vine_pea_leaves_net'), dayOf(0)) > 0 && PS.plantGrowthFactor(R.getBlockId('vine_bean_leaves_pole'), dayOf(0)) === 0 &&
    PS.plantGrowthFactor(R.getBlockId('vine_bean_leaves_pole'), dayOf(1)) > 0 && PS.plantGrowthFactor(R.getBlockId('vine_pea_leaves_net'), dayOf(2)) === 0,
    'Wiosną kwitnie groch, fasola czeka do lata; jesienią groch już nie');

// --- Przedmioty, jedzenie, przepisy ------------------------------------------------

for (const item of ['bean_pod', 'beans', 'pea_pod', 'peas']) {
    check(I.itemExists(item) && FOODS[item] && ingredientKind(item) === 'vegetable', `${item}: przedmiot, jedzenie, warzywo do garnka`);
    check(readTextureRegion(`item_${item}`).width === 16, `${item}: ikonka`);
}
check(spoilKind('beans') === null && spoilKind('peas') === null && spoilKind('bean_pod') === 'firm' && spoilKind('pea_pod') === 'firm', 'Nasiona się nie psują, strąki - jak twarde warzywa');
const recipe = (id) => RECIPES.find((entry) => entry.id === id);
check(recipe('pea_net').result.join() === 'pea_net,2' && recipe('pea_brush').result.join() === 'pea_brush,3' && recipe('bean_wigwam').ingredients.join() === 'garden_pole,garden_pole,garden_pole,rope',
    'Przepisy: siatka, chrust, wigwam (3 tyczki i sznur)');
check(recipe('peas').ingredients.join() === 'pea_pod' && recipe('peas').result.join() === 'peas,2', 'Łuskanie: strąk → 2 grochy');
{
    // Żaden przepis podpór nie powtarza składników innego.
    const same = RECIPES.filter((entry) => entry.ingredients && [...entry.ingredients].sort().join() === [...recipe('pea_brush').ingredients].sort().join());
    check(same.length === 1, 'Chrust: przepis nie koliduje z innym');
}

// --- Osiągnięcia, dzikie rośliny, komenda ------------------------------------------

const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
check(byId.bean_wigwam.when({ vine: 'bean', type: 'vine_bean_young_wigwam' }) && !byId.bean_wigwam.when({ vine: 'bean', type: 'vine_bean_young_pole' }), 'Osiągnięcie: Wigwam');
check(byId.green_peas.when({ item: 'pea_pod', type: 'vine_pea_ripe_net' }) && !byId.green_peas.when({ item: 'pea_pod', type: 'vine_pea_ripe_ground' }), 'Osiągnięcie: Zielony groszek - z podpory');
check(byId.seeds_for_next_year.when({ item: 'beans', type: 'vine_bean_dry_pole' }) && !byId.seeds_for_next_year.when({ item: 'bean_pod' }), 'Osiągnięcie: Na przyszły rok');
check(byId.vine_planted.when({ vine: 'pea' }), 'Na podporze: liczy się też fasola i groch');

{
    const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
    const { BIOME_KEYS } = await import('../src/world/terrain/Biomes.js');
    const generator = new RealisticGenerator('fasola-1');
    const wild = (key, species) => (generator.biomeData[BIOME_KEYS.indexOf(key)].plants?.patches ?? []).some((patch) => patch.ids?.every((id) => V.vineInfoById(id)?.species === species && V.vineInfoById(id).mount === 'ground'));
    check(wild('meadow', 'pea') && wild('olive_grove', 'pea') && wild('savanna', 'bean') && wild('rainforest', 'bean'), 'Dziko: groch na łące i w gaju oliwnym, fasola na sawannie i w lesie deszczowym');
    check(!wild('spruce', 'pea') && !wild('desert', 'bean'), 'W świerczynie i na półpustyni - nie');
}

const commands = read('src/commands/worldCommands.js');
check(commands.includes('function beanGarden(player, world)') && commands.includes("['pea_net', 8], ['pea_brush', 8], ['bean_wigwam', 4]") && read('docs/komendy.md').includes('/pnacza grzadka'), 'Komenda /pnacza grzadka i daj');

// --- Kod i dokumentacja -----------------------------------------------------------

check(read('src/world/World.js').includes('?.needsGround) this.setBlock(x, y + 1, z, null)'), 'Bez ziemi pod spodem roślina i wigwam znikają');
check(read('src/interaction/BlockPlacer.js').includes("blockType === 'vine_trellis' || blockType === 'pea_net'") && read('src/interaction/BlockPlacer.js').includes("blockType === 'bean_wigwam'"),
    'Stawianie: siatka przodem do gracza, wigwam na ziemi z miejscem w górę');
check(read('src/rendering/ChunkMesher.js').includes('info.sprite ?'), 'Obrazek większy niż blok na pudełkach kształtu');
check(read('docs/pnacza.md').includes('## Fasola i groch (1.31.0)') && read('docs/pnacza.md').includes('jednoroczne'), 'docs/pnacza.md: fasola i groch');
check(read('docs/numery-blokow.md').includes('15604-15607'), 'docs/numery-blokow.md: nowe podpory');

console.log(`OK: fasola i groch - ${checks} sprawdzeń (podpory, wigwam, mocowania i numery, sianie, wspinanie, zima, pory roku, jedzenie, przepisy, osiągnięcia, dzikie plamy).`);
