// ------------------------------------------------------------
// KOZŁY (1.38.0, docs/kozly.md)
//
// - blok kozła: numery, kształt, przepis,
// - odcinek leżącego pnia i kozły na końcach (game/Sawhorses.js):
//   cienki i gruby pień, pień skracany cięciem, przeszkody,
// - tempo cięcia i łupanie na opał,
// - belka kozła w poprzek pnia, podpowiedzi, osiągnięcia, komenda.
//
// Uruchomienie: node tools/sprawdz_kozlow.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId, getDropType, getBreakTime } = await import('../src/blocks/BlockRegistry.js');
const H = await import('../src/blocks/sawhorse.js');
const S = await import('../src/game/Sawhorses.js');
const { shapeBoxes } = await import('../src/world/ShapeBoxes.js');
const { shapeInfo } = await import('../src/blocks/woodShapes.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { choppedFresh } = await import('../src/items/moisture.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// ------------------------------------------------------------
// 1. Blok
// ------------------------------------------------------------
equal([getBlockId('sawhorse'), getBlockId('sawhorse_z')], [15510, 15511], 'numery kozła: 15510 (belka wzdłuż X), 15511 (wzdłuż Z)');
equal([H.sawhorseType('x'), H.sawhorseType('z')], ['sawhorse', 'sawhorse_z'], 'nazwa po osi belki');
check(H.isSawhorse('sawhorse') && H.isSawhorse('sawhorse_z') && !H.isSawhorse('oak_log_x') && !H.isSawhorse(null), 'co jest kozłem');
for (const type of ['sawhorse', 'sawhorse_z']) {
    const definition = getBlockDefinition(type);
    check(definition.model === 'shape' && isSolidId(definition.id) && definition.opaque === false, `${type}: kształt, nie pełny blok`);
    equal([getDropType(type), definition.pick], ['sawhorse', 'sawhorse'], `${type}: rozbity wraca jako kozioł`);
    check(getBreakTime(type, null) < getBreakTime('oak_log', null), `${type}: rozbija się szybko, także ręką`);
    equal(shapeInfo(definition.id).kind, 'sawhorse', `${type}: kształt kozła`);
}
check(getBlockDefinition('sawhorse_z').inventory === false && itemExists('sawhorse') && getItemLabel('sawhorse') === 'Kozioł', 'w ekwipunku jeden kozioł');
{
    const boxes = shapeBoxes(15510), turned = shapeBoxes(15511);
    equal(boxes.length, 9, 'belka i cztery nogi po dwa kawałki');
    const beam = boxes[0], beamZ = turned[0];
    check(beam[0] === 0 && beam[3] === 1 && beam[5] - beam[2] < 0.3 && beam[1] > 0.5, 'belka wzdłuż X, wysoko');
    check(beamZ[2] === 0 && beamZ[5] === 1 && beamZ[3] - beamZ[0] < 0.3, 'drugi kozioł: belka wzdłuż Z');
    check(boxes.slice(1).every((box) => box[4] <= beam[1] + 1e-9) && boxes.slice(1).some((box) => box[1] === 0), 'nogi pod belką, stoją na ziemi');
    check(boxes.every((box) => box.every((value, index) => index > 5 || (value >= 0 && value <= 1))), 'kształt mieści się w bloku');
    equal(shapeBoxes(15510, 'collision').length, 1, 'kolizja: jedno pudełko');
    check(shapeBoxes(15510, 'collision')[0][4] < 1 && shapeBoxes(15511, 'outline')[0][3] - shapeBoxes(15511, 'outline')[0][0] < 1, 'niższy i węższy niż blok');
}
const recipe = RECIPES.find((entry) => entry.id === 'sawhorse');
equal([recipe.result, recipe.ingredients], [['sawhorse', 1], ['konar', 'konar', 'konar']], 'przepis: 3 konary');

// ------------------------------------------------------------
// 2. Odcinek pnia i kozły
// ------------------------------------------------------------
const Y = 20;
function makeWorld() {
    const blocks = new Map();
    const world = {
        blocks,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y < Y ? getBlockId('grass') : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        set: (x, y, z, type) => blocks.set(`${x},${y},${z}`, type ? getBlockId(type) : 0)
    };
    return world;
}
// Pień wzdłuż X od x0 do x1 w rzędzie z.
const trunk = (world, x0, x1, z = 0, type = 'oak_log_x', y = Y) => { for (let x = x0; x <= x1; x++) world.set(x, y, z, type); };

check(S.lyingLog('oak_log_x') && S.lyingLog('oak_log_stripped_z') && !S.lyingLog('rotten_log_x') && !S.lyingLog('oak_log') && !S.lyingLog('sawhorse'), 'leżący pień: zdrowy albo okorowany, nie spróchniały');
{
    const world = makeWorld();
    trunk(world, 0, 4);
    equal(S.trunkSpan(world, 2, Y, 0), { axis: 'x', from: -2, to: 2, length: 5, sawhorses: [false, false] }, 'odcinek: pięć metrów, bez kozłów');
    check(S.trunkSpan(world, 2, Y + 1, 0) === null && S.trunkSpan(world, 9, Y, 0) === null, 'powietrze to nie pień');
    check(!S.onSawhorses(world, 2, Y, 0) && S.sawhorseSlow(world, { x: 2, y: Y, z: 0, type: 'oak_log_x' }) === S.NO_SAWHORSE_SLOW, 'na ziemi: 3 razy wolniej');
    world.set(-1, Y, 0, 'sawhorse_z');
    equal(S.trunkSpan(world, 2, Y, 0).sawhorses, [true, false], 'jeden kozioł: jeszcze nie');
    check(!S.onSawhorses(world, 0, Y, 0), 'jeden kozioł to za mało');
    world.set(5, Y, 0, 'sawhorse_z');
    for (let x = 0; x <= 4; x++) check(S.onSawhorses(world, x, Y, 0) && S.sawhorseSlow(world, { x, y: Y, z: 0, type: 'oak_log_x' }) === 1, `metr ${x}: na kozłach, zwykłe tempo`);
    // Cięcie skraca pień - kozłów nie trzeba przestawiać.
    world.set(0, Y, 0, null); world.set(1, Y, 0, null);
    check(S.onSawhorses(world, 2, Y, 0) && S.trunkSpan(world, 2, Y, 0).length === 3, 'po odcięciu dwóch metrów reszta dalej na kozłach');
    world.set(3, Y, 0, null);
    check(S.onSawhorses(world, 2, Y, 0) && S.onSawhorses(world, 4, Y, 0), 'dwa osobne kawałki między kozłami: oba na kozłach');
    // Przeszkoda między pniem a kozłem.
    world.set(1, Y, 0, 'stone');
    check(!S.onSawhorses(world, 2, Y, 0) && S.onSawhorses(world, 4, Y, 0) === false, 'skała między pniem a kozłem: nie liczy się');
    world.set(1, Y, 0, null);
    world.set(-1, Y, 0, null);
    check(!S.onSawhorses(world, 2, Y, 0), 'zabrany kozioł: znów na ziemi');
}
{
    // Kozioł o blok w bok i o blok wyżej / niżej też podpiera.
    for (const [dy, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1]]) {
        const world = makeWorld();
        trunk(world, 0, 2);
        world.set(-1, Y + dy, dz, 'sawhorse_z'); world.set(3, Y, 0, 'sawhorse');
        check(S.onSawhorses(world, 1, Y, 0), `kozioł przesunięty o (${dy}, ${dz}): liczy się`);
    }
    const far = makeWorld();
    trunk(far, 0, 2);
    far.set(-1, Y, 2, 'sawhorse_z'); far.set(3, Y, 0, 'sawhorse_z');
    check(!S.onSawhorses(far, 1, Y, 0), 'kozioł dwa bloki w bok: za daleko');
    // Gruby pień 2 × 2: jeden kozioł na koniec wystarcza wszystkim czterem rzędom.
    const thick = makeWorld();
    for (const [y, z] of [[Y, 0], [Y, 1], [Y + 1, 0], [Y + 1, 1]]) trunk(thick, 0, 3, z, 'oak_log_x', y);
    thick.set(-1, Y, 0, 'sawhorse_z'); thick.set(4, Y, 1, 'sawhorse_z');
    for (const [y, z] of [[Y, 0], [Y, 1], [Y + 1, 0], [Y + 1, 1]]) check(S.onSawhorses(thick, 2, y, z), `pień 2 × 2, rząd (${y - Y}, ${z}): na kozłach`);
    // Wzdłuż Z i okorowany; inna oś i spróchniały kawałek przerywają odcinek.
    const other = makeWorld();
    for (let z = 0; z <= 3; z++) other.set(0, Y, z, z === 1 ? 'birch_log_stripped_z' : 'birch_log_z');
    other.set(0, Y, -1, 'sawhorse'); other.set(0, Y, 4, 'sawhorse');
    equal(S.trunkSpan(other, 0, Y, 2), { axis: 'z', from: -2, to: 1, length: 4, sawhorses: [true, true] }, 'pień wzdłuż Z z okorowanym metrem');
    other.set(0, Y, 1, 'rotten_log_z');
    check(!S.onSawhorses(other, 0, Y, 0) && !S.onSawhorses(other, 0, Y, 2) && S.trunkSpan(other, 0, Y, 1) === null, 'spróchniały kawałek przerywa odcinek');
    other.set(0, Y, 1, 'birch_log_x');
    check(S.trunkSpan(other, 0, Y, 0).length === 1, 'pień leżący w poprzek to inny pień');
    // Bardzo długi pień: szukanie ma granicę.
    const long = makeWorld();
    trunk(long, 0, 60);
    long.set(-1, Y, 0, 'sawhorse_z'); long.set(61, Y, 0, 'sawhorse_z');
    check(S.trunkSpan(long, 30, Y, 0).length <= 2 * S.MAX_SPAN + 1 && !S.onSawhorses(long, 30, Y, 0), 'pień dłuższy niż zasięg: kozły za daleko');
}

// ------------------------------------------------------------
// 3. Łupanie na opał
// ------------------------------------------------------------
{
    const world = makeWorld();
    trunk(world, 0, 3);
    const block = { x: 1, y: Y, z: 0, type: 'oak_log_x' };
    check(S.splitDrops(world, 'oak_log_x', block, 'axe', true) === null, 'bez kozłów nie da się łupać');
    world.set(-1, Y, 0, 'sawhorse_z'); world.set(4, Y, 0, 'sawhorse_z');
    const drops = S.splitDrops(world, 'oak_log_x', block, 'axe', true);
    equal(drops.map((drop) => [drop.type, drop.count]), [['oak_firewood', S.SPLIT_COUNT]], 'kucając na kozłach: 4 polana z metra');
    equal(drops[0].fresh, choppedFresh('oak_firewood'), 'świeżo porąbane - tak mokre, jak z siatki wytwarzania');
    equal(S.SPLIT_COUNT, RECIPES.find((entry) => entry.result[0] === 'oak_firewood').result[1], 'tyle samo polan, co z pnia w siatce');
    check(S.splitDrops(world, 'oak_log_x', block, 'axe', false) === null, 'bez kucania: zwykły pień');
    check(S.splitDrops(world, 'oak_log_x', block, null, true) === null && S.splitDrops(world, 'oak_log_x', block, 'pickaxe', true) === null, 'bez siekiery: nic');
    check(S.splitDrops(world, 'stone', { x: 9, y: Y - 1, z: 9, type: 'stone' }, 'axe', true) === null && S.splitDrops(world, 'oak_log_x', null, 'axe', true) === null, 'inne bloki: zwykły łup');
    world.set(2, Y, 0, 'spruce_log_stripped_x');
    equal(S.splitDrops(world, 'spruce_log_stripped_x', { x: 2, y: Y, z: 0 }, 'axe', true)[0].type, 'spruce_firewood', 'okorowany pień: polana gatunku');
    check(S.splitDrops(world, 'oak_log_x', block, 'axe', true)[0].fresh === undefined || S.splitDrops(world, 'oak_log_x', block, 'axe', true)[0].fresh < 1, 'dąb świeżo porąbany jest mokry');
}

// ------------------------------------------------------------
// 4. Belka kozła, podpowiedzi
// ------------------------------------------------------------
{
    const world = makeWorld();
    trunk(world, 0, 3);
    equal([S.sawhorseAxisAt(world, -1, Y, 0), S.sawhorseAxisAt(world, 4, Y, 0)], ['z', 'z'], 'przy końcu pnia wzdłuż X: belka wzdłuż Z (w poprzek)');
    check(S.sawhorseAxisAt(world, 1, Y, 1) === null && S.sawhorseAxisAt(world, 9, Y, 9) === null, 'obok boku pnia albo w polu: decyduje spojrzenie');
    for (let z = 5; z <= 7; z++) world.set(8, Y, z, 'oak_log_z');
    equal(S.sawhorseAxisAt(world, 8, Y, 4), 'x', 'przy końcu pnia wzdłuż Z: belka wzdłuż X');
    equal(S.sawhorseAxisAt(world, -1, Y + 1, 0), 'z', 'kozioł o blok wyżej (stok): też w poprzek');

    const notices = [], events = [];
    const game = { world, mode: 'adventure', player: { crouching: false }, onNotice: (text) => notices.push(text), achieve: (name, data) => events.push([name, data]) };
    const sawhorses = new S.Sawhorses(game);
    const block = { x: 1, y: Y, z: 0, type: 'oak_log_x' };
    equal(sawhorses.slow(block), 3, 'gra: bez kozłów 3 razy wolniej');
    check(notices.length === 1 && /kozioł/.test(notices[0]) && /3 konary/.test(notices[0]), 'podpowiedź, dlaczego wolno i z czego kozioł');
    sawhorses.slow(block);
    equal(notices.length, 1, 'podpowiedź nie powtarza się co klatkę');
    equal(sawhorses.slow({ x: 5, y: Y - 1, z: 5, type: 'grass' }), 1, 'zwykłe bloki bez zmian');
    game.mode = 'creative';
    equal(sawhorses.slow(block), 1, 'tryb twórczy: bez spowolnienia');
    game.mode = 'adventure';
    world.set(-1, Y, 0, 'sawhorse_z');
    sawhorses.placed({ x: -1, y: Y, z: 0 });
    check(/drugi/.test(notices.at(-1)) && events.length === 0, 'pierwszy kozioł: postaw drugi');
    world.set(4, Y, 0, 'sawhorse_z');
    sawhorses.placed({ x: 4, y: Y, z: 0 });
    check(/na kozłach \(4 m\)/.test(notices.at(-1)), 'drugi kozioł: pień leży na kozłach');
    equal(events, [['sawhorsesReady', { length: 4 }]], 'zdarzenie dla osiągnięcia');
    equal(sawhorses.slow(block), 1, 'gra: na kozłach zwykłe tempo');
    sawhorses.placed({ x: 20, y: Y, z: 20 });
    check(/na końcu leżącego pnia/.test(notices.at(-1)), 'kozioł w polu: podpowiedź, gdzie go stawiać');
    check(sawhorses.drops('oak_log_x', block, 'axe') === null, 'bez kucania: zwykły łup');
    game.player.crouching = true;
    equal(sawhorses.drops('oak_log_x', block, 'axe')[0].type, 'oak_firewood', 'kucając: polana');
    equal(events.at(-1), ['trunkSplit', { type: 'oak_log_x', count: 4 }], 'zdarzenie łupania');
}

// ------------------------------------------------------------
// 5. Gra
// ------------------------------------------------------------
const interaction = read('src/game/GameInteraction.js'), placer = read('src/interaction/BlockPlacer.js'), gameSource = read('src/game/Game.js');
check(interaction.includes('this.sawhorses?.slow(hit.block)') && interaction.includes('this.sawhorses?.drops(type, position, tool)') && interaction.includes('this.sawhorses?.placed(target)'), 'kopanie: tempo, łup i podpowiedź po postawieniu');
check(placer.includes('sawhorseAxisAt(this.world') && placer.includes('sawhorseType(axis)'), 'stawianie: belka w poprzek pnia');
check(gameSource.includes('new Sawhorses(this)'), 'Game tworzy kozły');
for (const id of ['sawhorses_ready', 'split_on_sawhorses']) check(ACHIEVEMENTS.some((achievement) => achievement.id === id), `osiągnięcie ${id}`);
const chapter = GUIDE.find((entry) => entry.id === 'felling');
check(chapter.lines.filter((line) => /[Kk]ozi?[oł]/.test(line.text ?? line)).length >= 2 && chapter.lines.length <= 19 && chapter.lines.every((line) => (line.text ?? line).length <= 190), 'poradnik: kozły w rozdziale o ścinaniu');
check(read('src/commands/worldCommands.js').includes("name: 'kozly'") && read('docs/komendy.md').includes('/kozly'), 'komenda /kozly i jej opis');
const docs = read('docs/kozly.md'), numbers = read('docs/numery-blokow.md');
check(docs.includes('1.38.0') && docs.includes('Luki') && numbers.includes('kozioł 15510'), 'dokumentacja: docs/kozly.md i numery bloków');
check(JSON.parse(read('package.json')).scripts.test.includes('sprawdz_kozlow.mjs'), 'test w npm test');

console.log(`OK: kozły - ${checks} sprawdzeń.`);
