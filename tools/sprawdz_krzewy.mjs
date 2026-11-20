// ------------------------------------------------------------
// SPRAWDZENIE KRZEWÓW JAGODOWYCH (1.17.0)
//
// - katalog: 10 gatunków, numery 14300-14999 bez powtórzeń, nazwy,
//   etapy gałązki (po zbiorze -> kwiat -> niedojrzałe -> owoc), zbiór,
//   zrywanie kwiatów, sadzonki odmian,
// - przedmioty: owoce z ikonkami, wartości jedzenia, sadzenie,
// - tekstury: kafelki atlasu, zgodność z rysunkami Kamila (tools/wzorce),
// - sylwetki: cztery rozmiary, stałe dla ziarna, owoce tylko na
//   zewnątrz, pnie tylko u gatunków z pniem,
// - wstawianie: na płaskim, na stoku (kolumny po gruncie), nie niszczy
//   bloków, kawałki w sąsiednich chunkach pasują do siebie, sadzonka,
// - generacja: tylko gatunki biomu, kępy, powtarzalność, rokitnik na
//   piasku, nic na pustyni i w wodzie,
// - pory roku (paleta jesieni), osiągnięcia, komenda.
//
// Uruchomienie: node tools/sprawdz_krzewy.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest, readTextureRegion, decodeTexturePng } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const S = await import('../src/blocks/shrubs.js');
const { SHRUBS, SHRUB_NAMES, shrubType, nextShrubStage, shrubInfo } = S;
const R = await import('../src/blocks/BlockRegistry.js');
const { BLOCK_TYPES, getBlockId, getBlockTypeById, getBlockDefinition, isLeavesId, isSolidId, getGrowth, getHarvest, AIR_ID } = R;
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { FOODS } = await import('../src/items/foods.js');
const { buildShrub, SHRUB_REACH, SHRUB_MAX_HEIGHT } = await import('../src/world/shrubs/ShrubShapes.js');
const { Shrubs, stampShrub, plantShrub, biomeShrubs, SHRUB_GRID } = await import('../src/world/shrubs/Shrubs.js');
const { BIOMES } = await import('../src/world/terrain/Biomes.js');
const L = await import('../src/rendering/LeafSeasons.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { CHUNK_SIZE } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const root = new URL('../', import.meta.url);
const manifest = textureManifest();


// --- Katalog i bloki --------------------------------------------------------

check(SHRUB_NAMES.length === 10 && SHRUB_NAMES.join() === 'aronia,currant,gooseberry,raspberry,dog_rose,elderberry,sea_buckthorn,highbush_blueberry,bramble,hazel', 'Dziesięć gatunków w stałej kolejności');

const shrubTypes = Object.entries(BLOCK_TYPES).filter(([, definition]) => definition.shrub);
{
    const ids = shrubTypes.map(([, definition]) => definition.id);
    check(new Set(ids).size === ids.length && ids.every((id) => id >= S.SHRUB_FIRST_ID && id < S.SHRUB_END_ID), 'Numery krzewów 14300-14999 bez powtórzeń');
    const all = Object.values(BLOCK_TYPES).map((definition) => definition.id);
    check(new Set(all).size === all.length, 'Żaden numer bloku w grze się nie powtarza');
    const labels = shrubTypes.map(([, definition]) => definition.label);
    check(labels.every(Boolean), 'Każdy blok krzewu ma polską nazwę');
}

SHRUB_NAMES.forEach((species, index) => {

    const shrub = SHRUBS[species];
    check(shrub.firstId === S.SHRUB_FIRST_ID + index * S.SHRUB_ID_SLOTS, `${species}: 16 numerów od ${shrub.firstId}`);
    check(shrub.varieties.length >= 1 && shrub.varieties.length <= 2 && shrub.varieties[0].key === '', `${species}: jedna albo dwie odmiany`);

    const leaves = shrubType(species, 'leaves');
    check(getBlockId(leaves) === shrub.firstId && isLeavesId(getBlockId(leaves)) && isSolidId(getBlockId(leaves)), `${species}: liście to blok liści`);
    check(!getGrowth(leaves) && !getHarvest(leaves), `${species}: zwykłe liście nie rosną i nie dają owoców`);
    check(shrubInfo(leaves).species === species && shrubInfo(leaves).part === 'leaves', `${species}: shrubInfo liści`);

    if (shrub.stem) {
        const stem = getBlockDefinition(shrubType(species, 'stem'));
        check(stem.id === shrub.firstId + 1 && stem.drops === 'stick', `${species}: pęd / pień daje patyk`);
        check(stem.solid && (shrub.stem === 'canes') === (stem.model === 'leaves'), `${species}: pędy ażurowe, pień pełny`);
    }
    else check(!BLOCK_TYPES[`shrub_${species}_stem`], `${species}: bez bloku pnia`);

    shrub.varieties.forEach((variety, v) => {

        const type = (part) => shrubType(species, part, v);
        const base = shrub.firstId + 2 + v * 5;
        check(getBlockId(type('sapling')) === base && getBlockId(type('fruit')) === base + 1 && getBlockId(type('growing')) === base + 2, `${species}/${v}: numery odmiany`);

        const sapling = getBlockDefinition(type('sapling'));
        check(sapling.model === 'cross' && !sapling.solid && sapling.grows.shrub === species && sapling.grows.variety === v, `${species}/${v}: sadzonka wyrasta w krzew swojej odmiany`);

        const fruit = getBlockDefinition(type('fruit'));
        check(fruit.harvest.item === variety.item && fruit.harvest.becomes === type('growing') && fruit.harvest.count[0] >= 1 && fruit.drops === leaves, `${species}/${v}: zbiór daje ${variety.item}, gałązka zostaje`);
        check(ITEM_TYPES[variety.item] && FOODS[variety.item], `${species}/${v}: owoc ${variety.item} jest jadalnym przedmiotem`);
        check(!getGrowth(type('fruit')), `${species}/${v}: dojrzałe owoce czekają na zbiór`);

        // Życie gałązki: po zbiorze -> (kwiat) -> (niedojrzałe) -> owoc.
        const chain = ['growing'];
        while (nextShrubStage(species, chain.at(-1))) chain.push(nextShrubStage(species, chain.at(-1)));
        check(chain.at(-1) === 'fruit' && chain.includes('flower') === Boolean(shrub.flower) && chain.includes('unripe') === Boolean(shrub.unripe), `${species}: etapy ${chain.join(' -> ')}`);
        for (let i = 0; i < chain.length - 1; i++) {
            const growth = getGrowth(type(chain[i]));
            check(growth?.into === type(chain[i + 1]) && growth.seconds === S.SHRUB_STAGE_SECONDS, `${species}/${v}: ${chain[i]} rośnie w ${chain[i + 1]}`);
            check(isLeavesId(getBlockId(type(chain[i]))), `${species}/${v}: ${chain[i]} to liście`);
        }
        if (shrub.flowerItem) {
            const flower = getBlockDefinition(type('flower'));
            check(flower.harvest.item === shrub.flowerItem && flower.harvest.becomes === type('growing') && ITEM_TYPES[shrub.flowerItem], `${species}: zerwany kwiat daje ${shrub.flowerItem}, gałązka zaczyna od nowa`);
        }
        else if (shrub.flower) check(!getHarvest(type('flower')), `${species}: kwiatów się nie zrywa`);

        // Sadzenie: owoc nowego krzewu daje sadzonkę swojej odmiany.
        if (!['blueberry', 'blackberry', 'hazelnut'].includes(variety.item)) {
            check(ITEM_TYPES[variety.item].plants === type('sapling'), `${variety.item}: posadzony daje ${type('sapling')}`);
            check(ITEM_TYPES[variety.item].icon.startsWith('item_') && manifest.tiles[ITEM_TYPES[variety.item].icon], `${variety.item}: ikonka z paczki`);
        }

    });

    // Tekstury wszystkich bloków gatunku są w atlasie.
    for (const [type, definition] of shrubTypes.filter(([, d]) => d.shrub === species)) {
        for (const texture of Object.values(definition.textures)) {
            check(manifest.tiles[texture] && manifest.regions[texture]?.sheet === 'rosliny', `${type}: kafelek ${texture}`);
        }
    }

    check(L.leafPaletteIndex(`shrub_${species}`) === L.LEAF_PALETTES.findIndex((palette) => palette.key === shrub.palette), `${species}: paleta jesieni "${shrub.palette}"`);
    check(Object.keys(shrub.habitat).every((biome) => BIOMES[biome]) && Object.values(shrub.habitat).every((weight) => weight > 0), `${species}: biomy z listy biomów`);

});

// Stare owoce nie zmieniły sadzenia.
check(ITEM_TYPES.blueberry.plants === 'blueberry_sapling' && ITEM_TYPES.blackberry.plants === 'blackberry_sapling' && ITEM_TYPES.hazelnut.plants === 'hazel_sapling', 'Borówki, jeżyny i orzechy sadzi się po staremu');


// --- Tekstury: rysunki Kamila bez zmian -------------------------------------

{
    const source = (folder, name) => decodeTexturePng(readFileSync(new URL(`tools/wzorce/krzewy/${folder}/${name}.png`, root)));
    // Zielone piksele liści mogą być rozjaśnione (najwyżej o 25%, tym
    // samym mnożnikiem w całym gatunku); reszta - piksel w piksel z paczki.
    const same = (key, folder, name, leafy = true) => {
        const game = readTextureRegion(key).rgba, pack = source(folder, name).rgba;
        let gain = null;
        for (let i = 0; i < pack.length; i += 4) {
            const [r, g, b, a] = [pack[i], pack[i + 1], pack[i + 2], pack[i + 3]];
            if (game[i + 3] !== a) return false;
            const green = leafy && a === 255 && g > r && g > b;
            if (!green) {
                if (game[i] !== r || game[i + 1] !== g || game[i + 2] !== b) return false;
                continue;
            }
            const ratio = game[i + 1] / g;
            if (ratio < 0.999 || ratio > 1.26) return false;
            gain ??= ratio;
            if (Math.abs(ratio - gain) > 0.03) return false;
        }
        return true;
    };
    check(same('shrub_aronia_leaves', 'aronia', 'bush_leaves'), 'Aronia: liście z paczki');
    // Ikonki owoców od 1.28.0 rysuje tools/owoce_ikony.py (prośba Kamila) - nie z paczki.
    check(same('shrub_currant_fruit_black', 'currant', 'bush_leaves_fruit_black') && !same('item_blackcurrant', 'currant', 'item_blackcurrants', false), 'Porzeczka czarna z paczki (ikonka - nowa, 1.28.0)');
    check(same('shrub_elderberry_flower_top', 'elderberry', 'bush_leaves_flower_top') && same('shrub_hazel_flower', 'hazel', 'bush_leaves_catkins'), 'Bez i leszczyna z paczki');
    check(same('shrub_highbush_blueberry_fruit', 'blueberry', 'bush_leaves_fruit') && same('shrub_bramble_fruit', 'blackberry', 'bush_leaves_fruit'), 'Borówka wysoka i jeżyna z paczki');
    // Jasne gatunki zostają bez zmian, ciemne są jaśniejsze.
    check(readTextureRegion('shrub_currant_leaves').rgba.equals(source('currant', 'bush_leaves').rgba) && readTextureRegion('shrub_hazel_leaves').rgba.equals(source('hazel', 'bush_leaves').rgba), 'Porzeczka i leszczyna: liście piksel w piksel');
    check(!readTextureRegion('shrub_bramble_leaves').rgba.equals(source('blackberry', 'bush_leaves').rgba), 'Jeżyna: ciemne liście rozjaśnione');
    // Sadzonka narysowana z kolorów liści gatunku.
    for (const species of SHRUB_NAMES) {
        const sapling = readTextureRegion(`shrub_${species}_sapling`), leaves = readTextureRegion(`shrub_${species}_leaves`);
        const colors = new Set();
        for (let i = 0; i < leaves.rgba.length; i += 4) if (leaves.rgba[i + 3] === 255) colors.add(leaves.rgba.readUInt32BE(i));
        let drawn = 0, leafPixels = 0;
        for (let i = 0; i < sapling.rgba.length; i += 4) {
            if (sapling.rgba[i + 3] === 0) continue;
            drawn++;
            if (colors.has(sapling.rgba.readUInt32BE(i))) leafPixels++;
        }
        check(drawn > 40 && drawn < 120 && leafPixels > drawn * 0.6, `${species}: sadzonka z kolorów liści (${leafPixels}/${drawn})`);
    }
}


// --- Sylwetki ---------------------------------------------------------------

for (const species of SHRUB_NAMES) {
    const shrub = SHRUBS[species];
    for (let v = 0; v < shrub.varieties.length; v++) {
        let previous = 0;
        for (const size of [0.1, 0.4, 0.7, 1]) {
            for (const seed of [1, 77, 4242]) {
                const shape = buildShrub(species, v, seed, size);
                const again = buildShrub(species, v, seed, size);
                check(JSON.stringify(shape) === JSON.stringify(again), `${species} ${size}: to samo ziarno - ten sam krzew`);
                check(shape.blocks.length >= 1 && shape.top < SHRUB_MAX_HEIGHT && shape.reach <= SHRUB_REACH, `${species} ${size}: w granicach (${shape.blocks.length} bloków)`);
                check(shape.blocks.some(([dx, dy, dz]) => dx === 0 && dy === 0 && dz === 0), `${species} ${size}: blok w miejscu sadzonki`);
                const cells = new Set(shape.blocks.map(([dx, dy, dz]) => `${dx},${dy},${dz}`));
                check(cells.size === shape.blocks.length, `${species} ${size}: komórki się nie powtarzają`);
                for (const [dx, dy, dz, type] of shape.blocks) {
                    const info = shrubInfo(type);
                    check(info?.species === species && BLOCK_TYPES[type], `${species}: ${type} to blok tego krzewu`);
                    if (info.part === 'stem') check(Boolean(shrub.stem), `${species}: pień tylko u gatunku z pniem`);
                    if (!['leaves', 'stem'].includes(info.part)) {
                        check(info.variety === v, `${species}: owoce swojej odmiany`);
                        const outer = !cells.has(`${dx},${dy + 1},${dz}`) || !cells.has(`${dx + 1},${dy},${dz}`) || !cells.has(`${dx - 1},${dy},${dz}`) ||
                            !cells.has(`${dx},${dy},${dz + 1}`) || !cells.has(`${dx},${dy},${dz - 1}`);
                        check(outer, `${species}: owoce i kwiaty tylko na zewnątrz`);
                    }
                    if (!shape.rigid && dy > 0) check(cells.has(`${dx},${dy - 1},${dz}`), `${species} ${size}: kolumna bez dziur`);
                }
                if (seed === 1) {
                    if (size === 0.1) check(shape.blocks.length === 1, `${species}: najmniejszy to jeden blok`);
                    check(shape.blocks.length >= previous * 0.6, `${species}: większy rozmiar - nie mniejszy krzew`);
                    if (size === 1) check(shape.blocks.length >= 12, `${species}: stara kępa ma kilkanaście bloków (${shape.blocks.length})`);
                    previous = shape.blocks.length;
                }
            }
        }
    }
}
check(buildShrub('elderberry', 0, 5, 1).rigid && buildShrub('elderberry', 0, 5, 1).top >= 4, 'Stary bez to wysoki krzew z pniem');
check(!buildShrub('raspberry', 0, 5, 1).rigid && buildShrub('raspberry', 0, 5, 1).top <= 2, 'Malina to niski gąszcz');
check(buildShrub('aronia', 0, 5, 1).blocks.some(([, dy, , type]) => dy === 0 && type === 'shrub_aronia_stem'), 'Aronia stoi na pędach');
for (let seed = 0; seed < 60; seed++) for (const size of [0.3, 0.5, 0.7, 0.9, 1]) {
    const shape = buildShrub('aronia', 0, seed, size);
    const cells = new Map(shape.blocks.map(([dx, dy, dz, type]) => [`${dx},${dy},${dz}`, type]));
    for (const [dx, dy, dz, type] of shape.blocks) {
        if (type === 'shrub_aronia_stem') check(cells.has(`${dx},${dy + 1},${dz}`) && cells.get(`${dx},${dy + 1},${dz}`) !== 'shrub_aronia_stem', 'Aronia: nad każdym pędem są liście');
    }
    check(shape.blocks.filter(([, , , type]) => type !== 'shrub_aronia_stem').length >= shape.blocks.length / 2, 'Aronia: więcej liści niż pędów');
}
{
    let standards = 0;
    for (let seed = 0; seed < 200; seed++) {
        const shape = buildShrub('gooseberry', 0, seed, 0.7);
        if (shape.rigid) {
            standards++;
            check(shape.blocks.find(([dx, dy, dz]) => !dx && !dy && !dz)[3] === 'shrub_gooseberry_stem', 'Agrest pienny: pień na dole');
        }
    }
    check(standards > 20 && standards < 180, `Agrest bywa pienny (${standards}/200)`);
}


// --- Wstawianie -------------------------------------------------------------

const STONE = getBlockId('stone'), GRASS = getBlockId('grass');

function land(heightAt) {
    const blocks = new Map();
    const access = {
        blocks,
        get(x, y, z) {
            if (y < 0 || y > 200) return -1;
            const id = blocks.get(`${x},${y},${z}`);
            if (id !== undefined) return id;
            const h = heightAt(x, z);
            return y < h ? STONE : y === h ? GRASS : AIR_ID;
        },
        set(x, y, z, type) { blocks.set(`${x},${y},${z}`, getBlockId(type)); }
    };
    return access;
}

{
    // Płasko: grunt na y = 10, krzew od y = 11.
    const flat = land(() => 10);
    const shape = buildShrub('currant', 1, 9, 1);
    const placed = stampShrub(flat, { x: 0, y: 11, z: 0, species: 'currant', shape });
    check(placed === shape.blocks.length && flat.blocks.size === placed, 'Na płaskim staje cały krzew');
    check([...flat.blocks.keys()].every((key) => Number(key.split(',')[1]) >= 11), 'Krzew nie wchodzi w ziemię');
    check([...flat.blocks.values()].some((id) => getBlockTypeById(id) === 'shrub_currant_fruit_black'), 'Odmiana czarna ma czarne owoce');

    // Stok: każda kolumna na swoim gruncie.
    const slope = land((x) => 10 + Math.floor(x / 2));
    const wide = buildShrub('raspberry', 0, 3, 1);
    stampShrub(slope, { x: 0, y: 11, z: 0, species: 'raspberry', shape: wide });
    let onGround = 0, columns = new Set();
    for (const key of slope.blocks.keys()) {
        const [x, y, z] = key.split(',').map(Number);
        columns.add(`${x},${z}`);
        if (y === 11 + Math.floor(x / 2)) onGround++;
        check(y > 10 + Math.floor(x / 2), 'Na stoku: nad gruntem kolumny');
    }
    check(onGround === columns.size, `Na stoku każda kolumna zaczyna się na swoim gruncie (${onGround}/${columns.size})`);

    // Nie niszczy bloków: mur w zasięgu zostaje.
    const walled = land(() => 10);
    for (let y = 11; y <= 14; y++) walled.blocks.set(`1,${y},0`, STONE);
    stampShrub(walled, { x: 0, y: 11, z: 0, species: 'currant', shape });
    check([11, 12, 13, 14].every((y) => walled.blocks.get(`1,${y},0`) === STONE), 'Liście nie zastępują bloków');

    // Krzew z pniem na stoku: pień schodzi do ziemi.
    const hill = land((x) => (x < 0 ? 8 : 10));
    const elder = buildShrub('elderberry', 0, 11, 1);
    stampShrub(hill, { x: -1, y: 11, z: 0, species: 'elderberry', shape: elder });
    check(getBlockTypeById(hill.blocks.get('-1,9,0')) === 'shrub_elderberry_stem' && getBlockTypeById(hill.blocks.get('-1,10,0')) === 'shrub_elderberry_stem', 'Pień bzu schodzi po stoku do ziemi');

    // Kawałki z dwóch "chunków" razem dają ten sam krzew.
    const whole = land(() => 10), left = land(() => 10), right = land(() => 10);
    const big = buildShrub('bramble', 0, 21, 1);
    const half = (access, keep) => ({ get: (x, y, z) => (keep(x) ? access.get(x, y, z) : -1), set: access.set });
    stampShrub(whole, { x: 0, y: 11, z: 0, species: 'bramble', shape: big });
    stampShrub(half(left, (x) => x < 0), { x: 0, y: 11, z: 0, species: 'bramble', shape: big });
    stampShrub(half(right, (x) => x >= 0), { x: 0, y: 11, z: 0, species: 'bramble', shape: big });
    const joined = new Map([...left.blocks, ...right.blocks]);
    check(joined.size === whole.blocks.size && [...whole.blocks].every(([key, id]) => joined.get(key) === id), 'Dwa kawałki krzewu z sąsiednich chunków pasują do siebie');

    // Sadzonka w świecie.
    const blocks = new Map();
    const world = {
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y < 10 ? STONE : y === 10 ? GRASS : AIR_ID),
        setBlock(x, y, z, type) { blocks.set(`${x},${y},${z}`, getBlockId(type)); return true; }
    };
    blocks.set('4,11,4', getBlockId('shrub_gooseberry_sapling_red'));
    const grown = plantShrub(world, 4, 11, 4, 'gooseberry', 1, 5, 0.7);
    check(grown && getBlockTypeById(blocks.get('4,11,4')) !== 'shrub_gooseberry_sapling_red' && shrubInfo(getBlockTypeById(blocks.get('4,11,4'))).species === 'gooseberry', 'Sadzonka zamienia się w krzew');
    check([...blocks.values()].some((id) => getBlockTypeById(id) === 'shrub_gooseberry_fruit_red'), 'Krzew z sadzonki czerwonego agrestu ma czerwone owoce');
    blocks.set('20,11,20', STONE);
    check(plantShrub(world, 20, 11, 20, 'aronia', 0, 5, 0.7) === null && blocks.get('20,11,20') === STONE, 'W miejscu zajętym przez blok krzew nie wyrośnie');
    check(plantShrub(world, 0, 11, 0, 'unknown') === null, 'Nieznany gatunek - nic');

    // Wzrost przez PlantGrowth (grows.shrub).
    const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
    const growth = Object.create(PlantGrowth.prototype);
    growth.world = world; growth.grown = 0;
    let event = null;
    growth.onShrubGrown = (...args) => { event = args; };
    blocks.set('40,11,40', getBlockId('shrub_raspberry_sapling_yellow'));
    const chunk = { cx: 2, cz: 2 };
    const index = 11 * CHUNK_SIZE * CHUNK_SIZE + (40 - 32) * CHUNK_SIZE + (40 - 32);
    check(growth.grow(chunk, index, getGrowth('shrub_raspberry_sapling_yellow')) === true && growth.grown === 1 && event?.[0] === 'raspberry', 'PlantGrowth: sadzonka maliny wyrasta w krzew');
    check(shrubInfo(getBlockTypeById(blocks.get('40,11,40')))?.species === 'raspberry', 'W miejscu sadzonki stoi krzew maliny');
}


// --- Generacja ---------------------------------------------------------------

function fakeGenerator(biome, { height = () => 64, ocean = false, surface = 'grass' } = {}) {
    return {
        compute(x, z, _detail, out) { out.height = height(x, z); out.ocean = ocean; out.water = 0; out.riverGap = 99; return out; },
        biomes: { classify: () => biome },
        surfaceKind: () => surface
    };
}

function census(biome, options, span = 700) {
    const shrubs = new Shrubs(fakeGenerator(biome, options), 12345);
    const found = [];
    shrubs.forEachShrub(-span, -span, span, span, (shrub) => found.push(shrub));
    return found;
}

{
    const forest = census('deciduous');
    const species = new Set(forest.map((shrub) => shrub.species));
    const allowed = new Set(biomeShrubs('deciduous').list.map(([name]) => name));
    check(forest.length > 150 && forest.length < 6000, `Las liściasty: krzewy rosną, ale nie wszędzie (${forest.length} na ${(1400 * 1400 / 1e6).toFixed(1)} km²)`);
    check([...species].every((name) => allowed.has(name)) && species.size >= 5, `Las: tylko gatunki lasu (${[...species].join(', ')})`);
    check(!species.has('sea_buckthorn') && !species.has('aronia'), 'W lesie nie ma rokitnika ani aronii');
    check(forest.every((shrub) => shrub.y === 65 && shrub.shape.blocks.length >= 1 && shrub.variety < SHRUBS[shrub.species].varieties.length), 'Krzew stoi na gruncie, odmiana z katalogu');
    check(new Set(forest.filter((shrub) => shrub.species === 'currant').map((shrub) => shrub.variety)).size === 2, 'Rosną obie odmiany porzeczki');

    // Kępy: krzewy trzymają się zarośli - w wielu kratkach chunków nie ma żadnego.
    const cells = new Map();
    for (const shrub of forest) {
        const key = `${Math.floor(shrub.x / 64)},${Math.floor(shrub.z / 64)}`;
        cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    const total = Math.ceil(1400 / 64) ** 2;
    check(cells.size < total * 0.9 && Math.max(...cells.values()) >= 6, `Zarośla: ${cells.size}/${total} pól z krzewami, najgęstsze ${Math.max(...cells.values())}`);

    // W jednej kępie zwykle jeden gatunek.
    let same = 0, pairs = 0;
    const byPatch = new Map();
    for (const shrub of forest) {
        const key = `${Math.floor(shrub.x / 22)},${Math.floor(shrub.z / 22)}`;
        (byPatch.get(key) ?? byPatch.set(key, []).get(key)).push(shrub.species);
    }
    for (const list of byPatch.values()) for (let i = 1; i < list.length; i++) { pairs++; if (list[i] === list[0]) same++; }
    check(pairs > 30 && same / pairs > 0.5, `W kępie zwykle jeden gatunek (${same}/${pairs})`);

    // Powtarzalność i zależność od ziarna.
    const again = census('deciduous');
    check(JSON.stringify(again.map(({ x, z, species: s, size }) => [x, z, s, size])) === JSON.stringify(forest.map(({ x, z, species: s, size }) => [x, z, s, size])), 'To samo ziarno - te same krzewy');
    const other = new Shrubs(fakeGenerator('deciduous'), 999);
    let first = null;
    other.forEachShrub(-200, -200, 200, 200, (shrub) => { first ??= shrub; });
    check(first && !forest.some((shrub) => shrub.x === first.x && shrub.z === first.z && shrub.seed === first.seed), 'Inne ziarno - inne krzewy');

    // Plaża: rokitnik na piasku; trawiaste gatunki na piasku nie rosną.
    const beach = census('beach', { surface: 'sand' });
    check(beach.length > 30 && beach.every((shrub) => shrub.species === 'sea_buckthorn'), `Plaża: sam rokitnik (${beach.length})`);
    check(census('meadow', { surface: 'sand' }, 300).length === 0, 'Na piasku łąki nic nie rośnie');
    check(census('desert', {}, 300).length === 0 && census('sea', {}, 300).length === 0, 'Pustynia i morze bez krzewów');
    check(census('deciduous', { ocean: true }, 300).length === 0, 'W wodzie krzewy nie rosną');
    check(census('deciduous', { height: (x) => x * 3 }, 300).length === 0, 'Na stromym zboczu krzewy nie rosną');

    // Każdy gatunek ma gdzie rosnąć.
    const wild = new Set();
    for (const biome of Object.keys(BIOMES)) for (const [name] of biomeShrubs(biome).list) wild.add(name);
    check(wild.size === SHRUB_NAMES.length, 'Każdy gatunek rośnie dziko w jakimś biomie');

    // Wstawianie do chunka: bloki tylko w jego granicach.
    const shrubs = new Shrubs(fakeGenerator('deciduous'), 12345);
    let filled = 0;
    for (let cx = -3; cx < 3 && filled < 3; cx++) for (let cz = -3; cz < 3 && filled < 3; cz++) {
        const cells = new Map();
        const chunk = {
            cx, cz,
            getId: (lx, y, lz) => cells.get(`${lx},${y},${lz}`) ?? (y < 64 ? STONE : y === 64 ? GRASS : AIR_ID),
            setId(lx, y, lz, id) {
                check(lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && id >= S.SHRUB_FIRST_ID && id < S.SHRUB_END_ID, 'Chunk dostaje tylko swoje bloki krzewów');
                cells.set(`${lx},${y},${lz}`, id);
            }
        };
        shrubs.placeShrubs(chunk);
        if (cells.size) filled++;
    }
    check(filled === 3, 'Chunki z krzewami dostają bloki');
    check(SHRUB_GRID >= SHRUB_REACH + 2, 'Siatka rzadsza niż zasięg krzewu');
}


// --- Osiągnięcia --------------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    for (const id of ['shrub_fruit', 'shrub_flowers', 'shrub_planted', 'shrub_garden']) {
        check(byId[id] && ITEM_TYPES[byId[id].icon], `Osiągnięcie ${id} z ikonką przedmiotu`);
    }
    check(byId.shrub_fruit.when({ type: 'shrub_raspberry_fruit_yellow', item: 'yellow_raspberry' }) && !byId.shrub_fruit.when({ type: 'blueberry_bush_full', item: 'blueberry' })
        && !byId.shrub_fruit.when({ type: 'shrub_dog_rose_flower', item: 'rose_petals' }), 'Prosto z krzewu: tylko owoce krzewów');
    check(byId.shrub_flowers.when({ item: 'elderflower' }) && !byId.shrub_flowers.when({ item: 'elderberry' }), 'Zapach czerwca: kwiaty');
    check(byId.shrub_planted.when({ type: 'shrub_currant_sapling_black' }) && !byId.shrub_planted.when({ type: 'oak_sapling' }), 'Własny krzew: sadzonka krzewu');
    check(byId.shrub_garden.goal.count === 10, 'Jagodowy ogród: dziesięć owoców');
}

console.log(`OK: krzewy jagodowe - ${checks} sprawdzeń (10 gatunków, bloki i etapy, tekstury, sylwetki, wstawianie, generacja, osiągnięcia).`);
