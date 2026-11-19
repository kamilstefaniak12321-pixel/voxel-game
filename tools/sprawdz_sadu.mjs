// ------------------------------------------------------------
// SPRAWDZENIE SADU (1.22.0) - opadłe owoce i zimowy rozwój roślin
//
// - bloki opadłych owoców: numery (stałe), każdy owocujący blok ma
//   swój (albo świadomie nie ma), sadzonka istnieje, rysunek jest,
// - po porze: niezebrane owoce spadają - pod krzew i drzewo, obok
//   rośliny przy ziemi; roślina zostaje pusta,
// - wiosna: czarnoziem pod opadłymi owocami, sadzonki, większy plon
//   (szanse: podstawowa, po zbiorach, na czarnoziemie; sufit),
//   rozrastanie roślin niskich (bez dyni i cukinii, bez tłoku),
// - kiedy: tylko chunki zmienione przez gracza, raz po dłuższej
//   nieobecności, nowy chunk zaczyna od dziś,
// - zbiór: premia do owoców, pamięć zbiorów, zapis i złe zapisy,
// - osiągnięcia, napis.
//
// Uruchomienie: node tools/sprawdz_sadu.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = () => [];
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const { Scene } = await import('three');
const R = await import('../src/blocks/BlockRegistry.js');
const { getBlockId, getBlockTypeById, getBlockDefinition, getHarvest, getDropType, blockExists, isPlantId, isReplaceableId } = R;
const FF = await import('../src/blocks/fallenFruit.js');
const P = await import('../src/blocks/plantSeasons.js');
const F = await import('../src/blocks/fruitSeasons.js');
const O = await import('../src/game/Orchard.js');
const { Orchard, seasonSerial, springBetween, MAX_LEVEL } = O;
const { SEASON_DAYS, YEAR_DAYS, seasonAt } = await import('../src/sky/Seasons.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { shrubType } = await import('../src/blocks/shrubs.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const manifest = textureManifest();
const root = new URL('../', import.meta.url);

let SPRING = 0;
while (seasonAt(SPRING).index !== 0 || seasonAt(SPRING).progress > 0.001) SPRING += 0.001;
SPRING += YEAR_DAYS;
const at = (season, part = 0.5) => SPRING + (season + part) * SEASON_DAYS;


// --- Bloki opadłych owoców ---------------------------------------------------------

// Numery nadane w 1.22.0 - nie wolno ich zmieniać.
const IDS = {
    fallen_bush_strawberry: 15200, fallen_bush_blackberry: 15201, fallen_bush_chili: 15202, fallen_bush_hazel: 15203, fallen_bush_blueberry: 15204,
    fallen_shrub_aronia: 15216, fallen_shrub_currant: 15220, fallen_shrub_currant_black: 15221, fallen_shrub_gooseberry: 15224,
    fallen_shrub_gooseberry_red: 15225, fallen_shrub_raspberry: 15228, fallen_shrub_raspberry_yellow: 15229, fallen_shrub_dog_rose: 15232,
    fallen_shrub_elderberry: 15236, fallen_shrub_sea_buckthorn: 15240, fallen_shrub_highbush_blueberry: 15244, fallen_shrub_bramble: 15248,
    fallen_shrub_hazel: 15252, fallen_low_cranberry: 15300, fallen_low_lingonberry: 15301, fallen_low_strawberry: 15302,
    fallen_low_wild_strawberry: 15303, fallen_low_zucchini: 15305, fallen_jablon: 15320, fallen_olive: 15321
};

{
    const fallen = Object.entries(R.BLOCK_TYPES).filter(([, definition]) => definition.id >= FF.FALLEN_FIRST_ID && definition.id < FF.FALLEN_END_ID);
    equal(Object.fromEntries(fallen.map(([type, definition]) => [type, definition.id])), IDS, 'Numery opadłych owoców');
    for (const [type, definition] of fallen) {
        check(definition.model === 'flat' && !definition.solid && isReplaceableId(definition.id) && !isPlantId(definition.id), `${type}: płaska warstwa`);
        check(itemExists(definition.fallen.item) && getDropType(type) === definition.fallen.item && blockExists(definition.fallen.sapling) && isPlantId(getBlockId(definition.fallen.sapling)), `${type}: owoc i sadzonka`);
        check(manifest.tiles[definition.textures.all] && definition.label.startsWith('Opadłe owoce'), `${type}: rysunek i nazwa`);
        check(R.getGrowth(definition.fallen.sapling), `${definition.fallen.sapling}: sadzonka rośnie`);
    }
    // Każdy blok z dojrzałymi owocami z kalendarza ma opadłe owoce (poza kwiatami lipy).
    for (const entry of F.fruitSeasonEntries()) {
        if (entry.stage !== 2) continue;
        const type = getBlockTypeById(entry.id), harvest = getHarvest(type);
        if (!harvest || type.includes('unripe') || type === 'linden_leaves_flowering') { check(FF.fallenFor(type) === null, `${type}: nie ma czego zrzucić`); continue; }
        const fallen = FF.fallenFor(type);
        check(fallen && getBlockDefinition(fallen).fallen.item === harvest.item, `${type}: opadają ${harvest.item}`);
    }
    check(FF.fallenFor('pumpkin') === null && FF.fallenFor('stone') === null && FF.fallenFor('low_pumpkin_flower') === null, 'Dynia i reszta nie mają opadłych owoców');
}


// --- Kalendarz rozliczeń ---------------------------------------------------------------

{
    check(seasonSerial(at(1)) === seasonSerial(at(0)) + 1 && seasonSerial(at(0) + YEAR_DAYS) === seasonSerial(at(0)) + 4 && seasonSerial(at(0)) % 4 === 0, 'Numer pory rośnie co porę, wiosna to wielokrotność 4');
    const s = seasonSerial(at(0));
    check(!springBetween(s, s + 3) && springBetween(s + 3, s + 4) && springBetween(s + 1, s + 9) && !springBetween(s, s), 'Wiosna między rozliczeniami');
}


// --- Świat ------------------------------------------------------------------------------

function setup({ days = at(3), saved = null } = {}) {
    const world = new World(new Scene(), 123, new Map(), 'classic');
    const chunk = new Chunk(0, 0);
    chunk.skyLight.fill(15);
    world.chunks.set('0,0', chunk);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setId(x, 9, z, getBlockId('dirt'));
    const notices = [], achieved = [];
    const game = { world, time: { days }, player: { pos: { x: 8, y: 10, z: 8 } }, onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]) };
    const orchard = new Orchard(game, saved);
    // Losowanie pod kontrolą: kolejne wartości z listy, potem 0,99.
    orchard.rolls = [];
    orchard.random = () => (orchard.rolls.length ? orchard.rolls.shift() : 0.99);
    const type = (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z));
    return { world, chunk, game, orchard, notices, achieved, type };
}

{
    // Po porze: owoce spadają.
    const t = setup();
    const serial = seasonSerial(at(3));
    // Krzew maliny: liść z owocami 3 bloki nad ziemią, pod nim liście.
    t.world.setBlock(4, 12, 4, shrubType('raspberry', 'fruit'));
    t.world.setBlock(4, 11, 4, 'shrub_raspberry_leaves');
    t.world.setBlock(4, 10, 4, 'short_grass');
    // Poziomka przy ziemi, między dwiema pustymi komórkami.
    t.world.setBlock(8, 10, 8, 'low_wild_strawberry_fruit');
    // Jabłoń: owoce nad pniem (pień zatrzymuje - owoce nie mają gdzie spaść) i nad powietrzem.
    t.world.setBlock(12, 13, 12, 'jablon_leaves_jablka');
    t.world.setBlock(12, 12, 12, 'jablon_log');
    t.world.setBlock(13, 13, 12, 'jablon_leaves_jablka');
    // Żurawina zimuje - zimą zostaje.
    t.world.setBlock(2, 10, 12, 'low_cranberry_fruit');
    // Pusty krzak i dynia - bez zmian.
    t.world.setBlock(6, 10, 2, 'low_lingonberry_plant');
    t.world.setBlock(10, 10, 2, 'pumpkin');
    t.orchard.rolls = [0, 0];
    const result = t.orchard.settle(t.chunk, serial - 1, serial, at(3));
    equal([t.type(4, 12, 4), t.type(4, 10, 4)], [shrubType('raspberry', 'growing'), 'fallen_shrub_raspberry'], 'Malina: krzew pusty, owoce na ziemi pod nim (zamiast trawy)');
    check(t.type(8, 10, 8) === 'low_wild_strawberry_plant' && [[9, 8], [7, 8], [8, 9], [8, 7]].filter(([x, z]) => t.type(x, 10, z) === 'fallen_low_wild_strawberry').length === 1, 'Poziomka: owoce leżą obok rośliny');
    equal([t.type(12, 13, 12), t.type(13, 13, 12), t.type(13, 10, 12)], ['jablon_leaves_jablka_growing', 'jablon_leaves_jablka_growing', 'fallen_jablon'], 'Jabłka spadają pod koronę');
    check(t.type(12, 11, 12) === null || t.type(12, 11, 12) === undefined || t.world.getBlockId(12, 11, 12) === 0, 'Nad pniem owoce nie mają gdzie spaść');
    equal([t.type(2, 10, 12), t.type(6, 10, 2), t.type(10, 10, 2)], ['low_cranberry_fruit', 'low_lingonberry_plant', 'pumpkin'], 'Zimująca żurawina, pusta brusznica i dynia bez zmian');
    equal([result.fallen, result.grown, result.humus, result.saplings, result.spread], [3, 0, 0, 0, 0], 'Opadły trzy porcje, bez wiosennych skutków');

    // W swojej porze nic nie spada.
    const summer = setup({ days: at(1) });
    summer.world.setBlock(4, 10, 4, 'low_wild_strawberry_fruit');
    const s2 = seasonSerial(at(1));
    equal(summer.orchard.settle(summer.chunk, s2 - 1, s2, at(1)).fallen, 0, 'Latem poziomka trzyma owoce');
    check(summer.type(4, 10, 4) === 'low_wild_strawberry_fruit', 'Blok bez zmian');

    // Żurawina zrzuca owoce dopiero na wiosnę.
    const spring = setup({ days: at(0) });
    spring.world.setBlock(4, 10, 4, 'low_cranberry_fruit');
    const s3 = seasonSerial(at(0));
    spring.orchard.settle(spring.chunk, s3 - 1, s3, at(0));
    check(spring.type(4, 10, 4) === 'low_cranberry_plant', 'Wiosną zimujące owoce w końcu opadają');

    // Bez wolnej ziemi obok: roślina pusta, owoce przepadają.
    const tight = setup();
    tight.world.setBlock(4, 10, 4, 'low_wild_strawberry_fruit');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) tight.world.setBlock(4 + dx, 10, 4 + dz, 'stone');
    equal(tight.orchard.settle(tight.chunk, serial - 1, serial, at(3)).fallen, 0, 'Bez miejsca owoce przepadają');
    check(tight.type(4, 10, 4) === 'low_wild_strawberry_plant', 'Roślina i tak pusta');
}

{
    // Wiosna: opadłe owoce.
    const serial = seasonSerial(at(0));
    const spring = (t) => t.orchard.settle(t.chunk, serial - 1, serial, at(0));

    let t = setup({ days: at(0) });
    t.world.setBlock(4, 10, 4, 'fallen_jablon');
    t.orchard.rolls = [0.1, 0.1];
    let result = spring(t);
    equal([t.type(4, 9, 4), t.type(4, 10, 4), result.humus, result.saplings], ['humus', 'jablon_sapling', 1, 1], 'Szczęśliwy los: czarnoziem i sadzonka jabłoni');

    t = setup({ days: at(0) });
    t.world.setBlock(4, 10, 4, 'fallen_shrub_raspberry');
    t.orchard.rolls = [0.9, 0.9];
    result = spring(t);
    check(t.type(4, 9, 4) === 'dirt' && t.world.getBlockId(4, 10, 4) === 0 && result.humus === 0 && result.saplings === 0, 'Pechowy los: owoce znikają bez śladu');

    t = setup({ days: at(0) });
    t.world.setBlock(4, 9, 4, 'stone');
    t.chunk.setId(4, 10, 4, getBlockId('fallen_jablon'));
    t.orchard.rolls = [0.1, 0.1];
    result = spring(t);
    check(t.type(4, 9, 4) === 'stone' && t.world.getBlockId(4, 10, 4) === 0 && result.saplings === 0, 'Na kamieniu ani czarnoziemu, ani sadzonki');

    // Rozkład: mniej więcej połowa czarnoziemu, ćwierć sadzonek.
    t = setup({ days: at(0) });
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) t.world.setBlock(x, 10, z, 'fallen_low_cranberry');
    let state = 7;
    t.orchard.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    result = spring(t);
    check(Math.abs(result.humus / 256 - O.HUMUS_CHANCE) < 0.1 && Math.abs(result.saplings / 256 - O.SAPLING_CHANCE) < 0.1, `256 warstw: czarnoziem ${result.humus}, sadzonki ${result.saplings}`);
    let left = 0;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (String(t.type(x, 10, z)).startsWith('fallen_')) left++;
    check(left === 0, 'Po wiośnie nie zostają żadne opadłe owoce');
}

{
    // Wiosna: większy plon.
    const serial = seasonSerial(at(0));
    const grow = (rolls, { picked = false, humus = false, level = 0 } = {}) => {
        const t = setup({ days: at(0) });
        if (humus) t.world.setBlock(4, 9, 4, 'humus');
        t.world.setBlock(4, 10, 4, 'strawberry_bush');
        if (picked) t.orchard.harvested(4, 10, 4);
        if (level) t.orchard.levels.set('4,10,4', level);
        t.orchard.rolls = rolls;
        const result = t.orchard.settle(t.chunk, serial - 1, serial, at(0));
        return { level: t.orchard.level(4, 10, 4), result, t };
    };
    check(grow([O.GROW_CHANCE - 0.01]).level === 1 && grow([O.GROW_CHANCE + 0.01]).level === 0, 'Szansa podstawowa');
    check(grow([O.GROW_CHANCE + 0.2], { picked: true }).level === 1 && grow([O.GROW_CHANCE + O.GROW_PICKED + 0.01], { picked: true }).level === 0, 'Zbierane w zeszłym roku: większa szansa');
    check(grow([O.GROW_CHANCE + 0.2], { humus: true }).level === 1, 'Czarnoziem pod rośliną: większa szansa');
    check(grow([0.79], { picked: true, humus: true }).level === 1 && O.GROW_CHANCE + O.GROW_PICKED + O.GROW_HUMUS <= 0.85, 'Zadbana roślina na czarnoziemie - prawie pewne, ale nie pewne');
    check(grow([0], { level: 2 }).level === 3 && grow([0], { level: MAX_LEVEL }).level === MAX_LEVEL && MAX_LEVEL === 3, 'Sufit: najwyżej trzy owoce więcej');
    const after = grow([0.99], { picked: true });
    check(after.t.orchard.picked.size === 0, 'Pamięć zbiorów zeruje się co roku');
    // Roślina zniknęła: pamięć miejsca też.
    const gone = setup({ days: at(0) });
    gone.orchard.levels.set('4,10,4', 2);
    gone.orchard.levels.set('40,10,4', 2);
    gone.orchard.settle(gone.chunk, serial - 1, serial, at(0));
    check(gone.orchard.level(4, 10, 4) === 0 && gone.orchard.level(40, 10, 4) === 2, 'Pamięć pustego miejsca znika (tylko w rozliczanym chunku)');
    // Liść krzewu i drzewa też rośnie w plon.
    const leaf = setup({ days: at(0) });
    leaf.world.setBlock(4, 12, 4, shrubType('raspberry', 'growing'));
    leaf.world.setBlock(8, 12, 8, 'jablon_leaves_jablka_growing');
    leaf.orchard.rolls = [0, 0];
    check(leaf.orchard.settle(leaf.chunk, serial - 1, serial, at(0)).grown === 2, 'Gałązka krzewu i jabłoni też');
    // Zwykłe liście lipy (kwitną raz, nie odrastają) nie mają pamięci.
    const linden = setup({ days: at(0) });
    for (let x = 2; x < 8; x++) linden.world.setBlock(x, 12, 4, 'linden_leaves');
    linden.orchard.random = () => 0;
    check(linden.orchard.settle(linden.chunk, serial - 1, serial, at(0)).grown === 0 && linden.orchard.levels.size === 0, 'Liście lipy nie zapychają pamięci sadu');
    // Jesienią (bez wiosny po drodze) nic nie rośnie.
    const autumn = setup({ days: at(2) });
    autumn.world.setBlock(4, 10, 4, 'strawberry_bush');
    autumn.orchard.rolls = [0];
    const s2 = seasonSerial(at(2));
    check(autumn.orchard.settle(autumn.chunk, s2 - 1, s2, at(2)).grown === 0, 'Większy plon tylko po zimie');
}

{
    // Wiosna: rozrastanie.
    const serial = seasonSerial(at(0));
    const make = (species, rolls, prepare = () => {}) => {
        const t = setup({ days: at(0) });
        t.world.setBlock(8, 10, 8, `low_${species}_plant`);
        prepare(t);
        t.orchard.rolls = rolls;
        const result = t.orchard.settle(t.chunk, serial - 1, serial, at(0));
        let young = 0;
        for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) if (t.type(x, 10, z) === `low_${species}_young`) young++;
        return { result, young, t };
    };
    for (const species of ['cranberry', 'lingonberry', 'strawberry', 'wild_strawberry']) {
        const spread = make(species, [0.99, O.SPREAD_CHANCE - 0.01, 0]);
        check(spread.result.spread === 1 && spread.young === 1, `${species}: rozrasta się na miejsce obok`);
    }
    check(make('cranberry', [0.99, O.SPREAD_CHANCE + 0.01]).young === 0, 'Bez szczęścia - nie');
    check(make('pumpkin', [0.99, 0, 0]).young === 0 && make('zucchini', [0.99, 0, 0]).young === 0, 'Dynia i cukinia się nie rozrastają');
    // Tłok liczy się z ośmiu sąsiadów (sprawdzane wprost - sąsiadki też by się rozrastały).
    const crowd = setup({ days: at(0) });
    crowd.world.setBlock(8, 10, 8, 'low_cranberry_plant');
    crowd.orchard.random = () => 0;
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]]) crowd.chunk.setId(8 + dx, 10, 8 + dz, getBlockId('low_cranberry_plant'));
    const copy = setup({ days: at(0) });
    copy.world.setBlock(8, 10, 8, 'low_cranberry_plant');
    copy.orchard.random = () => 0;
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) copy.chunk.setId(8 + dx, 10, 8 + dz, getBlockId('low_cranberry_plant'));
    check(crowd.orchard.spread(8, 10, 8, 'cranberry') === true && copy.orchard.spread(8, 10, 8, 'cranberry') === false, 'W tłoku (4 sąsiadki z ośmiu) roślina się nie rozrasta');
    const walled = make('cranberry', [0.99, 0, 0], (t) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) t.world.setBlock(8 + dx, 10, 8 + dz, 'stone'); });
    check(walled.young === 0 && walled.result.spread === 0, 'Bez wolnej ziemi obok - nie');
    const rich = make('cranberry', [0.99, O.SPREAD_CHANCE + 0.1, 0], (t) => t.world.setBlock(8, 9, 8, 'humus'));
    check(rich.young === 1, 'Na czarnoziemie rozrasta się chętniej');
}

{
    // Kiedy chunk się rozlicza.
    const t = setup({ days: at(2) });
    t.world.setBlock(4, 10, 4, 'low_wild_strawberry_fruit');
    check(t.chunk.modified, 'Chunk zmieniony przez gracza');
    const tick = (seconds = 0.6) => t.orchard.update(seconds);
    tick();
    equal([...t.orchard.chunks], [['0,0', seasonSerial(at(2))]], 'Nowy chunk: zaczyna od dziś, bez rozliczania wstecz');
    check(t.type(4, 10, 4) === 'low_wild_strawberry_fruit', 'Nic się nie stało');
    tick(); tick();
    check(t.type(4, 10, 4) === 'low_wild_strawberry_fruit', 'W tej samej porze nic się nie dzieje');
    t.game.time.days = at(3);
    tick();
    check(t.type(4, 10, 4) === 'low_wild_strawberry_plant' && t.orchard.chunks.get('0,0') === seasonSerial(at(3)), 'Nowa pora: rozliczenie (owoce opadły)');
    tick(); tick(); tick();
    check(t.notices.some((text) => /opadły na ziemię \(1\)/.test(text)), 'Napis o opadłych owocach');
    // Długa nieobecność: dwa lata naraz = jedno wiosenne rozliczenie.
    t.orchard.random = () => 0;
    t.game.time.days = at(1) + 2 * YEAR_DAYS;
    const before = t.orchard.version;
    tick();
    check(t.orchard.level(4, 10, 4) === 1 && t.orchard.version > before, 'Po dwóch latach: jeden poziom, nie dwa');
    tick(); tick(); tick();
    check(t.notices.some((text) => /^Po zimie: .*więcej owoców/.test(text)) && t.achieved.some(([name, data]) => name === 'orchard' && data.grown >= 1), 'Wiosenny napis i zdarzenie dla osiągnięć');
    // Nietknięty chunk: nic.
    const wild = setup({ days: at(2) });
    wild.chunk.setId(4, 10, 4, getBlockId('low_wild_strawberry_fruit'));
    wild.chunk.modified = false;
    wild.orchard.update(0.6);
    wild.game.time.days = at(3);
    wild.orchard.update(0.6);
    check(wild.orchard.chunks.size === 0 && getBlockTypeById(wild.world.getBlockId(4, 10, 4)) === 'low_wild_strawberry_fruit', 'Nietknięty chunk się nie rozlicza');
    // Gra ze znajomymi: rozlicza tylko ten, kto pilnuje chunka.
    const guest = setup({ days: at(2) });
    guest.world.setBlock(4, 10, 4, 'low_wild_strawberry_fruit');
    guest.game.plantGrowth = { shouldTick: () => false };
    guest.orchard.update(0.6);
    check(guest.orchard.chunks.size === 0, 'Cudzego chunka się nie rozlicza');
    // Daleko od gracza: bez napisu.
    const far = setup({ days: at(2) });
    far.world.setBlock(4, 10, 4, 'low_wild_strawberry_fruit');
    far.game.player.pos.x = 500;
    far.orchard.update(0.6);
    far.game.time.days = at(3);
    for (let i = 0; i < 5; i++) far.orchard.update(0.6);
    check(far.type(4, 10, 4) === 'low_wild_strawberry_plant' && far.notices.length === 0, 'Z daleka rozlicza się po cichu');
}

{
    // Zbiór, zapis.
    const t = setup();
    t.orchard.levels.set('1,10,2', 2);
    t.orchard.harvested(1, 10, 2);
    t.orchard.harvested(1, 10, 2);
    t.orchard.chunks.set('0,0', 77);
    const state = structuredClone(t.orchard.getState());
    equal(state, { levels: { '1,10,2': 2 }, picked: ['1,10,2'], chunks: { '0,0': 77 } }, 'Zapis');
    const back = new Orchard(t.game, state);
    check(back.level(1, 10, 2) === 2 && back.level(9, 9, 9) === 0 && back.picked.has('1,10,2') && back.chunks.get('0,0') === 77, 'Odczyt');
    const bad = new Orchard(t.game, { levels: { '1,10,2': 99, 'x': 2, '3,10,4': 0, '5,10,6': 1.5, '__proto__': 3 }, picked: ['a', '1,2,3', 7], chunks: { '0,0': 'jutro', '1,-1': 5 } });
    equal([[...bad.levels], [...bad.picked], [...bad.chunks]], [[['1,10,2', MAX_LEVEL]], ['1,2,3'], [['1,-1', 5]]], 'Zły zapis: tylko poprawne wartości, poziom najwyżej 3');
    check(new Orchard(t.game, null).levels.size === 0 && new Orchard(t.game, 'sad').levels.size === 0, 'Brak zapisu: pusta pamięć');
    back.forget(1, 10, 2);
    check(back.level(1, 10, 2) === 0 && !back.picked.has('1,10,2'), 'Zapomniane miejsce');

    const source = readFileSync(new URL('src/game/GameInteraction.js', root), 'utf8');
    check(/const bonus = this\.orchard\?\.level\(x, y, z\) \?\? 0;/.test(source) && /canAdd\(harvest\.item, harvest\.count\[1\] \+ bonus\)/.test(source) &&
        /if \(bonus > 0\) this\.inventory\.add\(harvest\.item, bonus\);/.test(source) && /this\.orchard\?\.harvested\(x, y, z\);/.test(source), 'Zbiór: premia do owoców i pamięć zbiorów');
    const saver = readFileSync(new URL('src/storage/WorldSaver.js', root), 'utf8');
    check(/this\.worldInfo\.orchard = this\.orchard\.getState\(\)/.test(saver) && /savedOrchardVersion !== \(this\.orchard\.version \?\? 0\)/.test(saver), 'Pamięć sadu zapisuje się ze światem');
    const game = readFileSync(new URL('src/game/Game.js', root), 'utf8');
    check(/new Orchard\(this, worldInfo\.orchard\)/.test(game) && /this\.orchard\.update\(dt\)/.test(game) && /this\.saver\.orchard = this\.orchard/.test(game), 'Sad podłączony do gry');
}

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.orchard_grown.when({ grown: 1, saplings: 0 }) && !byId.orchard_grown.when({ grown: 0, saplings: 3 }) && itemExists(byId.orchard_grown.icon), 'Osiągnięcie: większy plon');
    check(byId.orchard_sapling.when({ grown: 0, saplings: 1 }) && !byId.orchard_sapling.when({ grown: 5, saplings: 0 }) && itemExists(byId.orchard_sapling.icon), 'Osiągnięcie: samosiejka');
}

console.log(`OK: sad - ${checks} sprawdzeń (opadłe owoce, czarnoziem i sadzonki, większy plon, rozrastanie, kalendarz rozliczeń, zapis, zbiór).`);
