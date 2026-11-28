// ------------------------------------------------------------
// DREWUTNIA - STOS POLAN (1.34.0, docs/drewno.md)
//
// - stan stosu (game/WoodpileState.js): 16 polan, wilgotność, zapis,
// - prawdziwe Woodpiles: układanie (kucnięcie + polano), dokładanie,
//   zdejmowanie, opis, rozbiórka,
// - schnięcie i deszcz (game/WoodDrying.js),
// - blok, celowanie, obraz (jedna siatka na stos), zapis, sieć,
// - komenda, osiągnięcie, poradnik.
//
// Uruchomienie: node tools/sprawdz_drewutni.mjs
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
        if (url.endsWith('/src/rendering/CampfireRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class CampfireRenderer { constructor() {} update() {} dispose() {} }'
        };
        // Stos bez rysowania (obraz sprawdzamy osobno, na samej geometrii).
        if (url.endsWith('/src/rendering/WoodpileRenderer.js') && !url.includes('?real')) return {
            format: 'module', shortCircuit: true,
            source: 'export class WoodpileRenderer { constructor() { this.updates = 0; } update() { this.updates++; } updateBounce() {} dispose() {} }'
        };
        if (url.endsWith('/src/rendering/ModelMaterial.js')) return {
            format: 'module', shortCircuit: true, source: 'export const createModelMaterial = (options) => ({ options, dispose() {} });'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const W = await import('../src/game/WoodpileState.js');
const { WOODPILE, WOODPILE_CAPACITY, WOODPILE_ROW, newWoodpile, restoreWoodpile, addLogs, takeLogs, topRun, woodpileDrops, pileWet, pileRoom, pileSign } = W;
const { Woodpiles } = await import('../src/game/Woodpiles.js');
const { WoodDrying } = await import('../src/game/WoodDrying.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { makeItem } = await import('../src/items/freshness.js');
const { wetOf, isWet, wetNotes } = await import('../src/items/moisture.js');
const { getBlockId, getBlockDefinition, isSolidId, isOpaqueId } = await import('../src/blocks/BlockRegistry.js');
const { cellBoxes, FULL_CELL } = await import('../src/interaction/BlockBounds.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { pileGeometry, logSlot } = await import('../src/rendering/WoodpileRenderer.js?real');

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, tolerance = 1e-9) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual}, miało być ${expected})`);


// --- Stan stosu --------------------------------------------------------------------------

{
    check(WOODPILE === 'woodpile' && WOODPILE_CAPACITY === 16 && WOODPILE_ROW === 4, 'Stos: 4 warstwy po 4 polana');
    const pile = newWoodpile(3, 60, -2, 'x');
    equal(pile, { x: 3, y: 60, z: -2, axis: 'x', logs: [] }, 'Nowy stos');
    check(newWoodpile(0, 60, 0).axis === 'z' && newWoodpile(0, 60, 0, 'ukos').axis === 'z', 'Kierunek: x albo z');
    check(addLogs(pile, 'oak', 3) === 3 && addLogs(pile, 'birch', 2, 0.8) === 2 && addLogs(pile, 'nic', 2) === 0 && addLogs(pile, 'oak', 0) === 0, 'Dokładanie polan');
    equal(pile.logs, [{ wood: 'oak' }, { wood: 'oak' }, { wood: 'oak' }, { wood: 'birch', wet: 0.8 }, { wood: 'birch', wet: 0.8 }], 'Suche polano bez pola, mokre z wilgotnością');
    check(pileRoom(pile) === 11 && addLogs(pile, 'pine', 99, 0.4) === 11 && pileRoom(pile) === 0 && addLogs(pile, 'pine', 1) === 0, 'Mieści 16 polan i ani jednego więcej');
    near(pileWet(pile), (2 * 0.8 + 11 * 0.4) / 16, 'Średnia wilgotność stosu');
    check(topRun(pile) === 11, 'Na wierzchu 11 sosnowych pod rząd');
    equal(takeLogs(pile, 1), { type: 'pine_firewood', count: 1, fresh: 0.6 }, 'Zdjęte polano niesie wilgotność');
    equal(takeLogs(pile, 99), { type: 'pine_firewood', count: 10, fresh: 0.6 }, 'Zdejmuje tylko ten gatunek, który leży na wierzchu');
    check(pile.logs.length === 5 && topRun(pile) === 2, 'Zostało pięć, na wierzchu dwie brzozy');
    equal(woodpileDrops(pile), [{ type: 'oak_firewood', count: 3 }, { type: 'birch_firewood', count: 2, fresh: 0.2 }], 'Rozebrany stos oddaje polana gatunkami');
    equal(takeLogs(pile, 2), { type: 'birch_firewood', count: 2, fresh: 0.2 }, 'Brzoza');
    equal(takeLogs(pile, 5), { type: 'oak_firewood', count: 3 }, 'Suchy dąb bez pola');
    check(takeLogs(pile, 1) === null && takeLogs(newWoodpile(0, 60, 0), 1) === null && topRun(pile) === 0 && pileWet(pile) === 0, 'Z pustego nic');
    equal(woodpileDrops(null), [], 'Bez stosu nic');

    // Mieszana wilgotność: średnia zdjętych.
    const mixed = newWoodpile(0, 60, 0);
    addLogs(mixed, 'oak', 1, 0.6); addLogs(mixed, 'oak', 1); addLogs(mixed, 'oak', 2, 0.3);
    equal(takeLogs(mixed, 4), { type: 'oak_firewood', count: 4, fresh: 0.7 }, 'Średnia wilgotność zdjętych polan');

    // Zapis.
    const saved = newWoodpile(5, 70, 5, 'x');
    addLogs(saved, 'oak', 2, 0.5); addLogs(saved, 'spruce', 1);
    equal(restoreWoodpile(JSON.parse(JSON.stringify(saved))), saved, 'Stos wraca z zapisu');
    check(restoreWoodpile(null) === null && restoreWoodpile({ x: 0, y: 9999, z: 0 }) === null && restoreWoodpile({ x: 0.5, y: 60, z: 0 }) === null, 'Zły zapis: bez stosu');
    equal(restoreWoodpile({ x: 0, y: 60, z: 0, axis: 7, logs: [{ wood: 'oak', wet: 9 }, { wood: 'kamień' }, null, { wood: 'pine', wet: 'tak' }, ...Array(30).fill({ wood: 'oak' })] }).logs.slice(0, 3),
        [{ wood: 'oak', wet: 1 }, { wood: 'pine' }, { wood: 'oak' }], 'Zły zapis: tylko poprawne polana');
    check(restoreWoodpile({ x: 0, y: 60, z: 0, logs: Array(40).fill({ wood: 'oak' }) }).logs.length <= WOODPILE_CAPACITY, 'Zły zapis: najwyżej 16 polan');

    // Podpis: gatunki, kierunek i wilgotność co ćwierć.
    const a = newWoodpile(0, 60, 0); addLogs(a, 'oak', 2, 0.6);
    const sign = pileSign(a);
    a.logs[0].wet = 0.58;
    check(pileSign(a) === sign, 'Drobna zmiana wilgotności nie zmienia podpisu');
    a.logs[0].wet = 0.3;
    check(pileSign(a) !== sign && pileSign(newWoodpile(0, 60, 0, 'x')) !== pileSign(newWoodpile(0, 60, 0, 'z')), 'Ćwierć wilgotności albo kierunek - nowy podpis');
}


// --- Blok i celowanie ----------------------------------------------------------------------

{
    const definition = getBlockDefinition(WOODPILE), id = getBlockId(WOODPILE);
    check(id === 10001 && definition.label === 'Stos drewna' && definition.model === 'structure' && definition.structure === 'woodpile', 'Blok stosu: numer 10001');
    check(definition.inventory === false && definition.creative === false && definition.drops === null && !itemExists(WOODPILE), 'Stosu nie ma w ekwipunku - układa się go polanami');
    check(isSolidId(id) && !isOpaqueId(id) && definition.flat.attach === 'down', 'Stały, przepuszcza światło, stoi na podłożu');
    const boxes = cellBoxes(null, id, 0, 60, 0);
    equal(boxes, [[0, 0, 0, 1, 1, 1]], 'Celownik: cały blok');
    check(boxes !== FULL_CELL, 'Osobne pudełko (to nie zwykły sześcian)');
    check(/\| 10000-10099 \|[^\n]*stos drewna 10001/.test(read('docs/numery-blokow.md')), 'Numer w docs/numery-blokow.md');
}


// --- Obraz: jedna siatka na stos --------------------------------------------------------------

{
    equal([logSlot(0), logSlot(3), logSlot(4), logSlot(15)], [[-0.375, 0.125], [0.375, 0.125], [-0.375, 0.375], [0.375, 0.875]], 'Polana: cztery w rzędzie, cztery warstwy');
    const pile = newWoodpile(0, 60, 0);
    addLogs(pile, 'oak', 15); addLogs(pile, 'birch', 1, 0.8);
    const geometry = pileGeometry(pile);
    const position = geometry.getAttribute('position'), color = geometry.getAttribute('color');
    check(position.count === 16 * 24 && geometry.index.count === 16 * 36 && geometry.getAttribute('uv').count === position.count && geometry.getAttribute('normal').count === position.count, 'Szesnaście polan w jednej geometrii');
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    check(Math.abs(box.min.x + 0.5) < 1e-6 && Math.abs(box.max.x - 0.5) < 1e-6 && Math.abs(box.min.y) < 1e-6 && Math.abs(box.max.y - 1) < 1e-6 && Math.abs(box.min.z + 0.5) < 1e-6 && Math.abs(box.max.z - 0.5) < 1e-6, 'Pełny stos wypełnia blok');
    check(color.getX(15 * 24) < color.getX(0) * 0.75, 'Mokre polano jest ciemniejsze');
    const turned = newWoodpile(0, 60, 0, 'x'); addLogs(turned, 'oak', 1);
    const one = newWoodpile(0, 60, 0); addLogs(one, 'oak', 1);
    const gx = pileGeometry(turned), gz = pileGeometry(one);
    gx.computeBoundingBox(); gz.computeBoundingBox();
    check(gz.boundingBox.max.z - gz.boundingBox.min.z > 0.99 && gz.boundingBox.max.x - gz.boundingBox.min.x < 0.26 && gx.boundingBox.max.x - gx.boundingBox.min.x > 0.99 && gx.boundingBox.max.z - gx.boundingBox.min.z < 0.26, 'Polana leżą wzdłuż wybranej osi');
    check(pileGeometry(newWoodpile(0, 60, 0)).getAttribute('position').count === 0, 'Pusty stos: pusta geometria');
    const source = read('src/rendering/WoodpileRenderer.js');
    check(/sign !== view\.sign/.test(source) && /vertexColors: true/.test(source) && /MAX_VISIBLE/.test(source) && /shaderPrototypes\(\)/.test(source), 'Geometria powstaje tylko po zmianie stosu; limit widocznych; wzór dla shaderów');
}


// --- Prawdziwe Woodpiles -----------------------------------------------------------------------

const pileId = getBlockId(WOODPILE), grass = getBlockId('grass'), water = getBlockId('water');
const setup = (items, { mode = 'adventure', yaw = 0 } = {}) => {
    const notices = [], sounds = [], achieved = [];
    const blocks = new Map();
    const inventory = Inventory.load({}, mode);
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    items.forEach((item, i) => inventory.set(i, item));
    inventory.selected = 0;
    const world = { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16),
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y < 60 ? grass : 0),
        getLight: () => ({ sky: 15 }) };
    const game = { mode, inventory, world, onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
        playBlockSound: (kind, type) => sounds.push(`${kind}:${type}`), player: { pos: { x: 0.5, y: 60, z: 3.5 }, yaw },
        placer: {
            targetOf: (hit) => ({ x: hit.block.x + hit.normal.x, y: hit.block.y + hit.normal.y, z: hit.block.z + hit.normal.z }),
            placeBlock(hit, type) { const t = this.targetOf(hit); if (blocks.has(`${t.x},${t.y},${t.z}`)) return false; blocks.set(`${t.x},${t.y},${t.z}`, getBlockId(type)); return true; }
        },
        get selectedBlock() { return inventory.selectedItem?.type ?? null; } };
    const piles = new Woodpiles(game, []);
    const ground = { hit: true, block: { x: 0, y: 59, z: 0, type: 'grass' }, normal: { x: 0, y: 1, z: 0 } };
    const onPile = { hit: true, block: { x: 0, y: 60, z: 0, type: WOODPILE }, normal: { x: 0, y: 1, z: 0 } };
    const click = (hit, slot, crouching = false) => { inventory.selected = slot; return piles.interact(hit, game.selectedBlock, crouching); };
    return { game, piles, inventory, notices, sounds, achieved, blocks, ground, onPile, click, count: (type) => inventory.count(type), pile: () => piles.get({ x: 0, y: 60, z: 0 }) };
};

{
    const t = setup([makeItem('oak_firewood', 20, 0.4), makeItem('birch_firewood', 6), null, makeItem('stone', 4)]);
    // Bez kucnięcia stos nie powstaje (polano zakłada wtedy ognisko).
    check(t.click(t.ground, 0, false) === false && t.piles.piles.size === 0 && t.count('oak_firewood') === 20, 'Bez kucnięcia: to nie stos');
    check(t.click(t.ground, 3, true) === false, 'Kamień ze stosem nie ma nic wspólnego');
    check(t.click(t.ground, 0, true) === true && t.blocks.get('0,60,0') === pileId && t.count('oak_firewood') === 19, 'Kucnięcie + polano w ziemię: stos');
    equal(t.pile(), { x: 0, y: 60, z: 0, axis: 'z', logs: [{ wood: 'oak', wet: 0.6 }] }, 'Pierwsze polano z wilgotnością');
    check(/Stos drewna 1\/16/.test(t.notices.at(-1)) && t.sounds.at(-1) === 'place:oak_log' && t.achieved.at(-1)[0] === 'woodpile' && t.achieved.at(-1)[1].full === false, 'Napis, dźwięk i zdarzenie');
    // Dokładanie: po jednym, z kucnięciem - ile się zmieści.
    check(t.click(t.onPile, 0) && t.pile().logs.length === 2 && t.count('oak_firewood') === 18, 'PPM polanem dokłada jedno');
    check(t.click(t.onPile, 1) && t.pile().logs.length === 3 && t.pile().logs[2].wet === undefined && t.count('birch_firewood') === 5, 'Suche polano innego gatunku');
    check(/^Stos drewna 3\/16: dąb 2, brzoza 1 - mokrych 2 z 3 - schnie$/.test(t.notices.at(-1)), `Opis po dołożeniu (${t.notices.at(-1)})`);
    check(t.click(t.onPile, 0, true) && t.pile().logs.length === 16 && t.count('oak_firewood') === 5, 'Z kucnięciem: tyle, ile się zmieści');
    check(t.achieved.at(-1)[1].full === true && t.achieved.at(-1)[1].count === 16, 'Pełny stos - zdarzenie');
    check(t.click(t.onPile, 0) && t.count('oak_firewood') === 5 && /Stos jest pełny - 16 polan/.test(t.notices.at(-1)), 'Do pełnego się nie dołoży');
    // Opis czymkolwiek innym; z kucnięciem blok staje obok.
    const told = t.notices.length;
    check(t.click(t.onPile, 3) === true && t.notices.length === told + 1 && /^Stos drewna 16\/16: dąb 15, brzoza 1 - mokrych 15 z 16 - schnie$/.test(t.notices.at(-1)), `Opis kamieniem (${t.notices.at(-1)})`);
    check(t.click(t.onPile, 3, true) === false, 'Kucnięcie z blokiem w ręce: blok staje obok');
    // Zdejmowanie pustą ręką.
    check(t.click(t.onPile, 2) && t.pile().logs.length === 15 && t.count('oak_firewood') === 6 && t.sounds.at(-1) === 'break:oak_log', 'Pusta ręka zdejmuje jedno polano');
    check(t.click(t.onPile, 2, true) && t.pile().logs.length === 3 && t.count('oak_firewood') === 18, 'Z kucnięciem: wszystkie dębowe z wierzchu');
    check(t.inventory.slots.filter((item) => item?.type === 'oak_firewood').every((item) => Math.abs(wetOf(item) - 0.6) < 1e-9), 'Zdjęte polana są dalej mokre');
    check(t.click(t.onPile, 2) && t.count('birch_firewood') === 6 && t.pile().logs.length === 2, 'Brzoza wraca sucha');
    t.click(t.onPile, 2, true);
    check(t.pile().logs.length === 0 && /Stos pusty/.test(t.notices.at(-1)), 'Pusty stos');
    check(t.click(t.onPile, 2) && /Pusty stos drewna/.test(t.notices.at(-1)), 'Z pustego nic się nie zdejmie');
    equal(t.piles.drops({ x: 0, y: 60, z: 0 }), [], 'Pusty stos nic nie oddaje');

    // Rozbiórka i sprzątanie po zniknięciu bloku.
    t.click(t.onPile, 0, true);
    equal(t.piles.drops({ x: 0, y: 60, z: 0 }), [{ type: 'oak_firewood', count: 16, fresh: 0.4 }], 'Rozbity stos oddaje wszystkie polana');
    const version = t.piles.version;
    t.piles.update(0.1);
    check(t.piles.piles.size === 1 && t.piles.renderer.updates === 1, 'Stos stoi, obraz się odświeża');
    t.blocks.delete('0,60,0');
    t.piles.update(0.1);
    check(t.piles.piles.size === 0 && t.piles.version === version + 1, 'Po zniknięciu bloku wpis znika');
    equal(t.piles.getState(), [], 'Zapis bez stosu');

    // Pełny ekwipunek.
    const cramped = setup([null]);
    cramped.click(cramped.ground, 0, true);
    const p = newWoodpile(0, 60, 0); addLogs(p, 'oak', 4); cramped.piles.piles.set('0,60,0', p); cramped.blocks.set('0,60,0', pileId);
    for (let i = 1; i < cramped.inventory.slots.length; i++) cramped.inventory.set(i, makeItem('stone', 64));
    cramped.inventory.set(0, makeItem('stone', 64));
    cramped.inventory.selected = 0;
    check(cramped.piles.interact(cramped.onPile, null, false) && p.logs.length === 4 && /Ekwipunek pełny/.test(cramped.notices.at(-1)), 'Pełny ekwipunek: polano zostaje na stosie');

    // Tryb twórczy nie zabiera polan; kierunek z patrzenia; woda i powietrze.
    const creative = setup([makeItem('spruce_firewood', 1)], { mode: 'creative', yaw: Math.PI / 2 });
    check(creative.click(creative.ground, 0, true) && creative.count('spruce_firewood') === 1 && creative.pile().axis === 'x', 'Tryb twórczy: polano zostaje w ręce; patrząc wzdłuż X - polana wzdłuż X');
    check(creative.click(creative.onPile, 0, true) && creative.pile().logs.length === 16, 'Tryb twórczy: kucnięcie dopełnia stos');
    const wet = setup([makeItem('oak_firewood', 4)]);
    wet.blocks.set('0,60,0', water);
    check(wet.click(wet.ground, 0, true) === true && wet.piles.piles.size === 0 && /suchym, stałym podłożu/.test(wet.notices.at(-1)) && wet.count('oak_firewood') === 4, 'W wodzie stosu się nie ułoży');
    const air = setup([makeItem('oak_firewood', 4)]);
    const side = { hit: true, block: { x: 0, y: 62, z: 0, type: 'stone' }, normal: { x: 1, y: 0, z: 0 } };
    check(air.click(side, 0, true) === true && air.piles.piles.size === 0 && /stałym podłożu/.test(air.notices.at(-1)), 'W powietrzu też nie');

    // Stos bez wpisu (stary zapis) - pusty, da się używać.
    const lost = setup([makeItem('oak_firewood', 2)]);
    lost.blocks.set('0,60,0', pileId);
    check(lost.click(lost.onPile, 0) && lost.pile().logs.length === 1, 'Blok stosu bez wpisu dostaje pusty wpis');

    // Zapis i odczyt przez konstruktor.
    const again = new Woodpiles(t.game, [{ x: 1, y: 60, z: 1, axis: 'x', logs: [{ wood: 'oak', wet: 0.5 }] }, { x: 0, y: -5, z: 0 }, null]);
    equal(again.getState(), [{ x: 1, y: 60, z: 1, axis: 'x', logs: [{ wood: 'oak', wet: 0.5 }] }], 'Stosy z zapisu (zły wpis pominięty)');
}


// --- Schnięcie i deszcz -------------------------------------------------------------------------

{
    // (1.43.1) Deszcz zatrzymuje dach - blok nad stosem (roof); słońce
    // dalej liczy się z jasności nieba (sky).
    const planks = getBlockId('oak_planks');
    const make = ({ rain = 0, sky = () => 15, roof = () => false, hour = 12, client = false } = {}) => {
        const notices = [], achieved = [];
        const inventory = Inventory.load({}, 'adventure');
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        const game = { inventory, time: { days: 100 + hour / 24 }, weather: { temperature: 15 }, rainNow: rain, player: { pos: { x: 0.5, y: 60, z: 0.5 } },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]), net: client ? { isClient: true } : null,
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getLight: (x, y, z) => ({ sky: sky(x, y, z) }),
                getBlockId: (x, y) => (roof(x) && y === 63 ? planks : 0) },
            campfires: { fires: new Map(), version: 0 }, chests: { chests: new Map(), version: 0 }, drops: { drops: new Map(), version: 0 },
            woodpiles: { piles: new Map(), version: 0 } };
        const add = (x, wet, count = 16, wood = 'oak') => { const pile = newWoodpile(x, 60, 0); addLogs(pile, wood, count, wet); game.woodpiles.piles.set(`${x},60,0`, pile); return pile; };
        return { game, drying: new WoodDrying(game), notices, achieved, add };
    };

    // Pod dachem: zwykłe tempo powietrza; w słońcu szybciej; daleko od gracza bez napisu.
    const t = make({ sky: (x) => (x === 2 ? 0 : 15) });
    const sunny = t.add(1, 0.6), roofed = t.add(2, 0.6), far = t.add(40, 0.6);
    t.game.inventory.add('oak_firewood', 16, 0, undefined, 0.4);
    t.drying.step(0.5);
    check(sunny.logs.every((log) => Math.abs(log.wet - (0.6 - 0.35 * 1.5 * 0.5)) < 1e-9), 'Stos na słońcu schnie półtora raza szybciej');
    check(roofed.logs.every((log) => Math.abs(log.wet - (0.6 - 0.35 * 0.5)) < 1e-9), 'Pod dachem - jak na powietrzu');
    near(wetOf(t.game.inventory.slots[0]), 0.6 - 0.35 * 0.3 * 0.5, 'W plecaku ponad trzy razy wolniej niż na stosie');
    check(t.game.woodpiles.version > 0, 'Zmiana o ćwierć wilgotności: zapis i sieć');
    t.drying.step(0.4);
    check(sunny.logs.every((log) => log.wet === undefined) && far.logs.every((log) => log.wet === undefined) && roofed.logs.every((log) => isWet(log.wet)), 'Stos na słońcu wysechł pierwszy');
    equal(t.notices, ['Drewno wyschło: stos (16 polan)'], 'Napis tylko o stosie obok gracza');
    equal(t.achieved, [['woodDried', { count: 16 }]], 'Zdarzenie dla osiągnięć');
    t.drying.step(0.5);
    check(roofed.logs.every((log) => log.wet === undefined) && t.notices.length === 2, 'Potem ten pod dachem');

    // Deszcz: pod gołym niebem moknie, pod dachem nie.
    const rainy = make({ rain: 1, sky: (x) => (x === 2 ? 0 : 15), roof: (x) => x >= 2 });
    const open = rainy.add(1, 0), covered = rainy.add(2, 0), dampCovered = rainy.add(3, 0.6), eaves = rainy.add(4, 0);
    rainy.game.world.getLight = (x) => ({ sky: x === 2 || x === 3 ? 0 : 15 });
    rainy.drying.step(0.1);
    check(open.logs.every((log) => Math.abs(log.wet - 0.3) < 1e-9) && covered.logs.every((log) => log.wet === undefined), 'Deszcz moczy stos pod gołym niebem, pod dachem nie');
    check(eaves.logs.every((log) => log.wet === undefined), 'Pod wąskim daszkiem (jasne niebo z boku) stos nie moknie');
    check(dampCovered.logs.every((log) => log.wet < 0.6), 'Pod dachem stos schnie nawet w deszcz');

    // Mieszany stos: napis dopiero, gdy wyschnie ostatnie polano.
    const mixed = make();
    const pile = mixed.add(1, 0.3, 8, 'pine'); addLogs(pile, 'birch', 8, 0.8);
    mixed.drying.step(0.4);
    check(pile.logs.slice(0, 8).every((log) => log.wet === undefined) && pile.logs.slice(8).every((log) => isWet(log.wet)) && mixed.notices.length === 0, 'Sosna już sucha, brzoza jeszcze nie - bez napisu');
    mixed.drying.step(1);
    check(pile.logs.every((log) => log.wet === undefined) && mixed.notices.length === 1, 'Cały stos suchy - napis');

    // Gość nie liczy stosów (robi to gospodarz).
    const guest = make({ client: true });
    const theirs = guest.add(1, 0.6);
    guest.drying.step(1);
    check(theirs.logs.every((log) => log.wet === 0.6), 'Gość: stosy liczy gospodarz');
}


// --- Zapis, sieć, gra, komenda, osiągnięcie, poradnik ---------------------------------------------

{
    const game = read('src/game/Game.js'), saver = read('src/storage/WorldSaver.js'), sync = read('src/net/StateSync.js'), interaction = read('src/game/GameInteraction.js');
    check(/this\.woodpiles = new Woodpiles\(this, worldInfo\.woodpiles\)/.test(game) && /this\.woodpiles\.update\(dt\)/.test(game) && /this\.woodpiles\.dispose\(\)/.test(game) && /this\.saver\.woodpiles = this\.woodpiles/.test(game), 'Gra: stosy tworzone, liczone, sprzątane i zapisywane');
    check((game.match(/woodpiles\??\.renderer\.updateBounce\(\)/g) ?? []).length === 2 && /this\.woodpiles\?\.renderer\?\.shaderPrototypes/.test(game), 'Gra: odbicie światła i wzór shaderów');
    check(/this\.worldInfo\.woodpiles = this\.woodpiles\.getState\(\)/.test(saver) && /savedWoodpileVersion !== \(this\.woodpiles\.version/.test(saver), 'Zapis świata ze stosami');
    check(/woodpiles: \{[\s\S]*?restore: restoreWoodpile,[\s\S]*?sign: pileSign/.test(sync), 'Gra ze znajomymi: stosy');
    check(/this\.woodpiles\.interact\(this\.currentHit, this\.selectedBlock, this\.player\.crouching\)/.test(interaction) && interaction.indexOf('this.woodpiles.interact') < interaction.indexOf('this.campfires.interact') &&
        /if \(type === 'woodpile'\) return this\.woodpiles\.drops\(position\);/.test(interaction), 'Stos przed ogniskiem; rozbiórka oddaje polana');

    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const full = byId.woodpile_full;
    check(full && full.on === 'woodpile' && full.when({ full: true }) && !full.when({ full: false }) && itemExists(full.icon), 'Osiągnięcie: pełny stos');
    const commands = read('src/commands/worldCommands.js'), commandsDoc = read('docs/komendy.md');
    check(commands.includes('/drewno stos [gatunek] [mokre]') && commandsDoc.includes('/drewno stos'), 'Komenda /drewno stos w grze i w opisie');
    const chapter = GUIDE.find((entry) => entry.id === 'fire');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(/Stos drewna: kucnij \(\[crouch\]\) i kliknij ziemię polanem/.test(text) && /mieści 16 polan/.test(text) && /pod dachem nie zmokną/.test(text) && /Ciemniejsze polana na stosie są jeszcze mokre/.test(text), 'Poradnik: stos drewna');
    equal(wetNotes(makeItem('oak_firewood', 1, 0.4))[1], 'Schnie: przy ognisku albo na stosie (kucnij i kliknij ziemię polanem)', 'Podpowiedź mokrego polana mówi, jak suszyć');
    const docs = read('docs/ogniska.md');
    check(/## Drewutnia \(1\.34\.0\)/.test(docs) && /16 polan/.test(docs) && /kucn/.test(docs), 'docs/ogniska.md opisuje drewutnię');
}

console.log(`OK: drewutnia - ${checks} sprawdzeń (stan stosu, blok i celowanie, obraz, prawdziwe stosy, schnięcie i deszcz, zapis, sieć, komenda, osiągnięcie, poradnik).`);
