// ------------------------------------------------------------
// KOŁYSANIE DRZEW (1.40.0, docs/kolysanie.md)
//
// - giętkość gatunków (tabela z docs/drewno.md, rozdział 3),
// - bajt wysokości w siatce chunka i wygięcie (te same stałe w JS
//   i w programie cieniującym),
// - siła wiatru z pogody,
// - podłączenie: siatka chunka, materiał terenu i liści, Game.
//
// Sam obraz sprawdza się w grze (zrzuty w docs/kolysanie.md).
//
// Uruchomienie: node tools/sprawdz_kolysania.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SW = await import('../src/blocks/treeSway.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const { TREE_SWAY_GLSL, plantWindUniforms } = await import('../src/rendering/PlantWind.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// ------------------------------------------------------------
// 1. Giętkość gatunków
// ------------------------------------------------------------
equal(Object.keys(SW.TREE_SWAY).sort(), [...TREE_NAMES].sort(), 'każde drzewo ma wpisaną giętkość');
const group = (names, value, label) => { for (const name of names) equal(SW.treeSway(name), value, `${name}: ${label}`); };
group(['coconut_palm', 'birch', 'aspen', 'rainbow_eucalyptus', 'spruce', 'fir', 'larch'], 1, 'kołysze się mocno');
group(['pine', 'linden', 'olcha', 'wierzba', 'maple', 'cherry', 'jacaranda', 'ginkgo'], 0.55, 'średnio');
group(['oak', 'beech', 'olive', 'acacia', 'cedar', 'araucaria'], 0.25, 'ledwo');
group(['baobab', 'sequoia', 'kapok', 'banyan'], 0, 'tylko liście - olbrzym stoi');
equal(SW.treeSway('nieznane'), 0.55, 'nieznany gatunek: średnio');
for (const name of TREE_NAMES) check(SW.treeSway(name) >= 0 && SW.treeSway(name) <= 1, `${name}: giętkość 0-1`);

// ------------------------------------------------------------
// 2. Bajt wysokości i wygięcie
// ------------------------------------------------------------
equal([SW.swayScale('birch'), SW.swayScale('sequoia')], [4, 0], 'mnożnik: brzoza ćwierć bloku na krok, sekwoja 0');
check(Math.abs(SW.swayScale('oak') - 2) < 1e-9, 'dąb: pierwiastek z 0,25 × 4 = 2');
equal([SW.swayCode(0, 4), SW.swayCode(-3, 4), SW.swayCode(1, 4), SW.swayCode(12, 4), SW.swayCode(100, 4), SW.swayCode(12, 0)], [0, 0, 4, 48, 255, 0], 'bajt: przy ziemi 0, rośnie z wysokością, kończy się na 255, olbrzym 0');
equal(SW.swayBend(0), 0, 'przy ziemi drzewo stoi');
check(Math.abs(SW.swayBend(SW.swayCode(12, SW.swayScale('birch'))) - 144 * SW.SWAY_BEND) < 1e-9, 'brzoza 12 m w pełnym wietrze: czubek ok. ćwierć bloku');
check(SW.swayBend(SW.swayCode(12, SW.swayScale('birch'))) > 0.2 && SW.swayBend(SW.swayCode(12, SW.swayScale('birch'))) < 0.3, 'ćwierć bloku to 0,2-0,3');
check(Math.abs(SW.swayBend(SW.swayCode(12, SW.swayScale('oak'))) / SW.swayBend(SW.swayCode(12, SW.swayScale('birch'))) - 0.25) < 0.01, 'dąb tej samej wysokości: cztery razy mniej');
let last = 0;
for (let height = 0; height <= 60; height++) {
    const bend = SW.swayBend(SW.swayCode(height, 4));
    check(bend >= last && bend <= SW.SWAY_MAX, `wysokość ${height}: wyżej - bardziej, najwyżej ${SW.SWAY_MAX}`);
    last = bend;
}
equal(SW.swayBend(255), SW.SWAY_MAX, 'bardzo wysokie drzewo: ograniczone');
check(SW.swayBend(48, 0.5) === SW.swayBend(48) / 2 && SW.swayBend(48, 0) === 0, 'słabszy wiatr - mniejsze wygięcie');
check(SW.swayBend(SW.swayCode(2, 4)) < 0.01, 'na wysokości oczu gracza pień prawie stoi (kolizja i celowanie się zgadzają)');
// Program cieniujący używa tych samych stałych.
check(TREE_SWAY_GLSL.includes(`${255 / SW.SWAY_STEPS}`) && TREE_SWAY_GLSL.includes(`${SW.SWAY_BEND}`) && TREE_SWAY_GLSL.includes(`min(${SW.SWAY_MAX},`), 'GLSL: te same stałe (63.75, 0.0016, 0.45)');
check(/if \(code <= 0\.0 \|\| uTreeWind\.z <= 0\.0\) return vec3\(0\.0\)/.test(TREE_SWAY_GLSL), 'GLSL: bez wysokości albo wiatru - bez ruchu');
check(/return vec3\(push\.x, 0\.0, push\.y\)/.test(TREE_SWAY_GLSL), 'GLSL: ruch tylko w poziomie');
// Podmuch nigdy nie odwraca kierunku: 0,5 ± 0,34 ± 0,16.
check(0.5 - 0.34 - 0.16 >= -1e-9 && /0\.5 \+ 0\.34 \* sin/.test(TREE_SWAY_GLSL) && /0\.16 \* sin/.test(TREE_SWAY_GLSL), 'drzewo wygina się z wiatrem, nie pod wiatr');

// ------------------------------------------------------------
// 3. Wiatr
// ------------------------------------------------------------
equal([SW.treeWindStrength(0), SW.treeWindStrength(undefined), SW.treeWindStrength(100)], [SW.CALM_SWAY, SW.CALM_SWAY, 1], 'cisza: drzewa ledwo oddychają; wichura: pełna siła');
check(SW.treeWindStrength(4) > SW.treeWindStrength(1) && SW.treeWindStrength(1) > SW.treeWindStrength(0), 'silniejszy wiatr - mocniejsze kołysanie');
equal(plantWindUniforms.uTreeWind.value.length, 4, 'uTreeWind: kierunek, siła, zapas');

// ------------------------------------------------------------
// 4. Podłączenie
// ------------------------------------------------------------
const mesher = read('src/rendering/ChunkMesher.js'), renderData = read('src/rendering/BlockRenderData.js'), game = read('src/game/Game.js');
check(mesher.includes('function swayColumn(lx, lz)') && mesher.includes('function swayBase(renderData, lx, y, lz)'), 'siatka chunka: ziemia i korona kolumny, podstawa kołysania');
check(mesher.includes('renderData.swayLog && !(swayLeafY[column] > y && swayLeafTree[column] === renderData.swayTree)'), 'pień kołysze się tylko pod własną koroną (ściana z pni stoi)');
check(mesher.includes('swayByte(y + corner[1] - leafSwayBase, renderData.sway)') && mesher.includes('swayByte(y + corner[1] - cubeSwayBase, renderData.sway)'), 'liście (części i szybkie) oraz pień niosą wysokość');
check(mesher.includes('swayChunk = chunk;') && mesher.includes('swayStamp = (swayStamp + 1) >>> 0 || 1;'), 'pamięć kolumn zeruje się z każdym chunkiem');
check(renderData.includes("sway: definition.tree && (definition.part === 'log' || definition.part === 'leaves') ? swayScale(definition.tree) : null"), 'dane bloku: tylko pień z korą i liście żywego drzewa');
check(renderData.includes('nested = false') && renderData.includes('if (!nested) {') && renderData.match(/blockMaterial\.onBeforeCompile\(shader, renderer, true\)/g).length === 3, 'materiał terenu kołysze pień; rośliny, liście i woda używają plantMotion po swojemu');
check(renderData.match(/treeSwayOffset\(\(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz, plantMotion\.x, uTime\)/g).length === 2, 'pień i liście: to samo wygięcie');
check(renderData.includes('if (plantMotion.y > 0.0) {') && renderData.includes('float leafAmount = 0.6 + 0.4 * fract(plantMotion.y * 7.31);'), 'drżenie części liści: z fazy (y), niezależnie od wysokości');
check(game.includes('treeWindStrength(wind.speed)') && game.includes("this.settings.get('plantWind') ? (this.treeWindOverride ?? treeWindStrength(wind.speed)) : 0"), 'Game: wiatr z pogody; ustawienie „kołysanie roślin" wyłącza też drzewa');
check(read('src/commands/worldCommands.js').includes("name: 'kolysanie'") && read('docs/komendy.md').includes('/kolysanie'), 'komenda /kolysanie i jej opis');
const docs = read('docs/kolysanie.md');
check(docs.includes('1.40.0') && docs.includes('Luki'), 'dokumentacja: docs/kolysanie.md');
check(JSON.parse(read('package.json')).scripts.test.includes('sprawdz_kolysania.mjs'), 'test w npm test');

console.log(`OK: kołysanie drzew - ${checks} sprawdzeń.`);
