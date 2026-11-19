// ------------------------------------------------------------
// SPRAWDZENIE ZIEMI I OWOCÓW Z CHARAKTEREM (1.25.0)
//
// - mnożniki wzrostu: czarnoziem, ziemia kamienista, pola z nich,
//   pole z kompostem; woda w pobliżu,
// - nowe pola: bloki, tekstury, rozgrzebywanie, zarastanie w swoją
//   ziemię, sadzenie, nawożenie,
// - wzrost w prawdziwej pętli (PlantGrowth): szybciej / wolniej / przy
//   wodzie; sad liczy rozgrzebany czarnoziem jak czarnoziem,
// - owoce z działaniem: efekty słabsze od naparów, opis, zjedzenie,
// - płatki róży i kwiat czarnego bzu w naparach,
// - komenda, osiągnięcia, poradnik.
//
// Uruchomienie: node tools/sprawdz_ziemi.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const R = await import('../src/blocks/BlockRegistry.js');
const SOIL = await import('../src/blocks/soil.js');
const FE = await import('../src/blocks/fertilizers.js');
const { FOODS, TEAS, CUP } = await import('../src/items/foods.js');
const { EFFECTS, effectText } = await import('../src/items/effects.js');
const { itemUses } = await import('../src/items/uses.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { Wellbeing } = await import('../src/game/Wellbeing.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const manifest = textureManifest();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- Mnożniki ---------------------------------------------------------------------

{
    const { SOIL_GROWTH, SOIL_GROWTH_ID, soilGrowth, WATER_GROWTH, WATER_REACH } = SOIL;
    check(soilGrowth('humus') === 1.3 && soilGrowth('tilled_humus') === 1.3 && soilGrowth('coarse_dirt') === 0.7 && soilGrowth('tilled_coarse') === 0.7 &&
        soilGrowth('tilled_compost') === 1.5 && soilGrowth('tilled_dirt') === 1 && soilGrowth('dirt') === 1 && soilGrowth('grass') === 1 && soilGrowth('stone') === 1 &&
        soilGrowth(null) === 1 && soilGrowth('toString') === 1, 'Mnożniki ziemi');
    check(soilGrowth('tilled_compost') > soilGrowth('tilled_humus') && soilGrowth('tilled_humus') > 1 && soilGrowth('tilled_coarse') < 1, 'Kompost > czarnoziem > zwykła > kamienista');
    check(WATER_GROWTH === 1.25 && WATER_REACH === 3, 'Woda: o jedną czwartą szybciej, do 3 bloków');
    for (const type of Object.keys(SOIL_GROWTH)) check(R.getBlockDefinition(type)?.soil && SOIL_GROWTH_ID.get(R.getBlockId(type)) === SOIL_GROWTH[type], `${type}: ziemia z mnożnikiem po numerze`);
    check(SOIL_GROWTH_ID.size === Object.keys(SOIL_GROWTH).length, 'Numery bez powtórzeń');
    for (const [type, field] of Object.entries(FE.FIELDS)) check(FE.fieldStats(type).growth === soilGrowth(type) && field.growth === soilGrowth(type), `${type}: pole i ziemia zgodne`);
}


// --- Pola -----------------------------------------------------------------------------

{
    const humus = R.getBlockDefinition('tilled_humus'), coarse = R.getBlockDefinition('tilled_coarse');
    check(humus.id === 15401 && coarse.id === 15402, 'Numery bloków 15401 i 15402');
    check(R.getTill('humus') === 'tilled_humus' && R.getTill('coarse_dirt') === 'tilled_coarse' && R.getTill('grass') === 'tilled_dirt' && R.getTill('tilled_humus') === null, 'Rozgrzebywanie łopatą');
    check(R.getDropType('tilled_humus') === 'humus' && R.getDropType('tilled_coarse') === 'coarse_dirt', 'Wykopane pole oddaje swoją ziemię');
    check(R.getGrowth('tilled_humus').into === 'humus' && R.getGrowth('tilled_coarse').into === 'coarse_dirt' && R.getGrowth('tilled_humus').empty && R.getGrowth('tilled_coarse').empty &&
        R.isGrowingId(humus.id) && R.isGrowingId(coarse.id), 'Puste pole zarasta w swoją ziemię');
    for (const type of ['tilled_humus', 'tilled_coarse']) {
        const definition = R.getBlockDefinition(type);
        check(definition.soil && definition.solid && manifest.tiles[type] && manifest.regions[type] && definition.textures.top === type && manifest.tiles[definition.textures.side], `${type}: ziemia z własną teksturą z góry`);
        check(FE.isFieldBlock(type) && FE.FIELD_BLOCKS.includes(type), `${type}: to pole (da się sadzić)`);
    }
    check(R.getBlockSound('tilled_coarse') === 'gravel' && R.getBlockSound('tilled_humus') === 'dirt', 'Dźwięki');
    check(FE.fieldStats('tilled_humus').rich && !FE.fieldStats('tilled_coarse').rich && !FE.fieldStats('tilled_dirt').rich && FE.fieldStats('tilled_compost').rich, 'Żyzne pola (sad)');
    check(FE.canFertilize('tilled_dirt') && FE.canFertilize('tilled_coarse') && !FE.canFertilize('tilled_humus') && !FE.canFertilize('tilled_compost') && !FE.canFertilize('dirt') && !FE.canFertilize(undefined), 'Kompost: na zwykłe i kamieniste pole');
    const source = read('src/game/GameInteraction.js');
    check(/canFertilize\(type\) \? FERTILIZERS\[tool\.fertilizer\]\.field/.test(source) && /below === FIELD_BLOCK \|\| isFieldBlock\(below\)/.test(source), 'Gra: nawożenie i sadzenie na nowych polach');
    check(/fertile = new Set\(\[getBlockId\('humus'\), \.\.\.Object\.entries\(FIELDS\)\.filter\(\(\[, field\]\) => field\.rich\)/.test(read('src/game/Orchard.js')), 'Sad: żyzne pola z tabeli');
}


// --- Woda i wzrost w prawdziwej pętli ----------------------------------------------------

function makeWorld(soil, { water = null, plants = 400 } = {}) {
    // Jeden chunk 16 x 16: warstwa ziemi na y = 4, rośliny na y = 5.
    const SIZE = 16, LAYER = SIZE * SIZE;
    const blocks = new Uint16Array(LAYER * 16);
    const soilId = R.getBlockId(soil), plantId = R.getBlockId('low_strawberry_young');
    const chunk = { cx: 0, cz: 0, blocks, growing: new Set(), modified: true };
    for (let i = 0; i < LAYER; i++) blocks[4 * LAYER + i] = soilId;
    if (water) blocks[4 * LAYER + water[1] * SIZE + water[0]] = R.getBlockId('water');
    let placed = 0;
    for (let i = 0; i < LAYER && placed < plants; i++) {
        if (blocks[4 * LAYER + i] !== soilId) continue;
        blocks[5 * LAYER + i] = plantId; chunk.growing.add(5 * LAYER + i); placed++;
    }
    const world = {
        chunks: new Map([['0,0', chunk]]),
        getBlockId: (x, y, z) => (x < 0 || x >= SIZE || z < 0 || z >= SIZE || y < 0 || y >= 16 ? 0 : blocks[y * LAYER + z * SIZE + x])
    };
    return { world, chunk, placed };
}

{
    const { nearWater, soilInfo, isSoilId } = SOIL;
    const dry = makeWorld('tilled_dirt'), pond = makeWorld('tilled_dirt', { water: [8, 8] });
    check(!nearWater(dry.world, 8, 4, 8) && nearWater(pond.world, 8 + 3, 4, 8) && nearWater(pond.world, 5, 4, 5) && !nearWater(pond.world, 8 + 4, 4, 8) && !nearWater(pond.world, 4, 4, 8), 'Woda do 3 bloków w poziomie');
    check(nearWater(pond.world, 8, 5, 8) && !nearWater(pond.world, 8, 6, 8) && !nearWater(pond.world, 8, 3, 8), 'Woda na wysokości ziemi albo jeden blok niżej');
    check(isSoilId(R.getBlockId('tilled_humus')) && isSoilId(R.getBlockId('grass')) && !isSoilId(R.getBlockId('stone')) && !isSoilId(0), 'isSoilId');
    const info = soilInfo(makeWorld('tilled_compost', { water: [8, 8] }).world, 7, 4, 8);
    check(info.soil && info.type === 'tilled_compost' && info.water && Math.abs(info.total - 1.875) < 1e-9 && soilInfo(dry.world, 7, 4, 8).total === 1 && soilInfo(dry.world, 7, 9, 8).total === 1 && !soilInfo(dry.world, 7, 9, 8).soil, 'soilInfo: pole z kompostem przy wodzie ×1,875');

    // Ile roślin urośnie w jednym kroku, gdy los jest ustalony: kolejne
    // wartości 0..1 po równo, więc ułamek = szansa.
    const grownShare = (soil, options) => {
        const t = makeWorld(soil, options);
        const growth = new PlantGrowth(t.world);
        growth.days = null;
        let grown = 0;
        growth.grow = () => { grown++; return true; };
        const original = Math.random;
        let n = 0;
        const total = t.placed * 40;
        Math.random = () => ((n++ * 0.61803398875) % 1);
        try { for (let i = 0; i < 40; i++) growth.tick([t.chunk], true); } finally { Math.random = original; }
        return grown / total;
    };
    const base = grownShare('tilled_dirt');
    check(base > 0.001, `Zwykłe pole rośnie (${base.toFixed(4)} na krok)`);
    const ratio = (soil, options) => grownShare(soil, options) / base;
    const about = (value, expected, message) => check(Math.abs(value - expected) < expected * 0.12, `${message} (×${value.toFixed(2)}, oczekiwane ×${expected})`);
    about(ratio('tilled_humus'), 1.3, 'Rozgrzebany czarnoziem');
    about(ratio('tilled_coarse'), 0.7, 'Rozgrzebana ziemia kamienista');
    about(ratio('tilled_compost'), 1.5, 'Pole z kompostem');
    about(ratio('humus'), 1.3, 'Dzika roślina na czarnoziemie');
    about(ratio('coarse_dirt'), 0.7, 'Dzika roślina na ziemi kamienistej');
    about(ratio('grass'), 1, 'Trawa bez zmian');
    // Staw 1 x 1 na środku: 48 z 255 pól ma wodę w zasięgu.
    const wet = makeWorld('tilled_dirt', { water: [8, 8] });
    let inReach = 0;
    for (const index of wet.chunk.growing) { const x = index % 16, z = Math.floor((index % 256) / 16); if (Math.abs(x - 8) <= 3 && Math.abs(z - 8) <= 3) inReach++; }
    check(inReach === 48, `W zasięgu stawu 48 roślin (${inReach})`);
    about(ratio('tilled_dirt', { water: [8, 8] }), 1 + 0.25 * inReach / wet.placed, 'Pole ze stawem: rośliny przy wodzie rosną ×1,25');
    const source = read('src/game/PlantGrowth.js');
    check(/roll < chance \|\| \(roll < chance \* WATER_GROWTH && this\.wet\(chunk, index, below\)\)/.test(source), 'Wody szuka się tylko przy losie tuż ponad szansę (wydajność)');
}


// --- Owoce z działaniem ----------------------------------------------------------------------

{
    const traits = { rose_hip: 'mend', cranberry: 'mend', lingonberry: 'mend', aronia: 'tonic', sea_buckthorn_berry: 'tonic', blackcurrant: 'tonic', elderberry: 'tonic', chili_pepper: 'warm' };
    for (const [type, food] of Object.entries(FOODS)) {
        // (Napary i potrawy z garnka grzeją od 1.26.0 - sprawdz_zimna.mjs.)
        if (food.kind === 'drink' || type.startsWith('dish_')) continue;
        check(JSON.stringify(food.effects) === JSON.stringify(traits[type] ? [traits[type]] : []), `${type}: ${traits[type] ?? 'bez działania'}`);
    }
    for (const [type, effect] of Object.entries(traits)) {
        check(itemExists(type) && EFFECTS[effect] && itemUses(type).some((text) => text.includes(EFFECTS[effect].label)), `${type}: działanie w opisie przedmiotu`);
    }
    check(EFFECTS.mend.heal > 1 && EFFECTS.mend.heal < EFFECTS.heal.heal && EFFECTS.mend.hours < EFFECTS.heal.hours, 'Lekkie gojenie słabsze i krótsze od naparu leczniczego');
    check(EFFECTS.tonic.drain < 1 && EFFECTS.tonic.drain > EFFECTS.vigor.drain && EFFECTS.tonic.hours < EFFECTS.vigor.hours && EFFECTS.tonic.work === undefined, 'Pokrzepienie słabsze i krótsze od naparu wzmacniającego');
    check(EFFECTS.warm.work > 1 && EFFECTS.warm.work < EFFECTS.vigor.work, 'Rozgrzanie: trochę raźniejsza praca');
    for (const [name, effect] of Object.entries(EFFECTS)) check(effect.label.length > 3 && effect.text.length > 10 && effect.hours > 0 && effectText(name).startsWith(`${effect.label} - `), `${name}: nazwa, opis, czas`);
    check(effectText('nic') === '' && effectText('toString') === '', 'effectText: nieznany efekt');

    // Zjedzenie włącza efekt; napar tego samego rodzaju działa osobno.
    const wellbeing = Wellbeing.load(null, 1);
    wellbeing.data.energy = 40;
    const eaten = wellbeing.eat('rose_hip', 1);
    check(eaten.ok && eaten.effects.join() === 'mend' && wellbeing.hasEffect('mend') && wellbeing.effectFactor('heal') === 1.5, 'Dzika róża: lekkie gojenie');
    wellbeing.data.energy = 40;
    check(wellbeing.eat('aronia', 1).effects.join() === 'tonic' && wellbeing.effectFactor('drain') === 0.9, 'Aronia: pokrzepienie');
    wellbeing.data.energy = 40;
    check(wellbeing.eat('chili_pepper', 1).effects.join() === 'warm' && Math.abs(wellbeing.effectFactor('work') - 1.06) < 1e-9, 'Chili: rozgrzanie');
    wellbeing.data.energy = 40;
    check(wellbeing.eat('raspberry', 1).effects.length === 0, 'Malina: bez działania');
    const done = wellbeing.describe().effects.map((effect) => effect.label).sort().join();
    check(done === 'lekkie gojenie,pokrzepienie,rozgrzanie', `Okno statusu pokazuje działające owoce (${done})`);
    const source = read('src/game/GameInteraction.js');
    check(/for \(const effect of result\.effects\) \{\s+this\.onNotice\?\.\(`\$\{EFFECTS\[effect\]\.text\}/.test(source), 'Po zjedzeniu napis, co owoc daje');
}


// --- Napary z płatków róży i kwiatu czarnego bzu --------------------------------------------------

{
    check(findRecipe([CUP, 'rose_petals', 'rose_petals'])?.result[0] === TEAS.calm.brew && findRecipe([CUP, 'rose_petals', 'linden_flower'])?.result[0] === TEAS.calm.brew, 'Płatki róży: napar na sen');
    check(findRecipe([CUP, 'elderflower', 'elderflower'])?.result[0] === TEAS.heal.brew && findRecipe([CUP, 'elderflower', 'chamomile'])?.result[0] === TEAS.heal.brew, 'Kwiat czarnego bzu: napar leczniczy');
    check(findRecipe([CUP, 'rose_petals', 'elderflower']) === null, 'Zioła z różnych grup nie dają naparu');
    check(itemUses('rose_petals').join(' ').length > 10 && itemUses('elderflower').join(' ').length > 10, 'Opis zastosowania');
}


// --- Komenda, osiągnięcia, poradnik --------------------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.rich_field.on === 'tilled' && byId.rich_field.when({ into: 'tilled_humus' }) && !byId.rich_field.when({ into: 'tilled_dirt' }) && R.getBlockDefinition(byId.rich_field.icon), 'Osiągnięcie za rozgrzebany czarnoziem');
    check(byId.fruit_trait.on === 'ate' && byId.fruit_trait.when({ kind: 'snack', effects: ['mend'] }) && !byId.fruit_trait.when({ kind: 'snack', effects: [] }) &&
        !byId.fruit_trait.when({ kind: 'drink', effects: ['heal'] }) && !byId.fruit_trait.when({ kind: 'meal', effects: ['warmth'] }) && !byId.fruit_trait.when({ kind: 'snack' }) && itemExists(byId.fruit_trait.icon), 'Osiągnięcie za owoc z działaniem');
    const commands = read('src/commands/worldCommands.js');
    check(/name: 'ziemia'/.test(commands) && commands.includes('soilInfo(world, x, y, z)') && read('docs/komendy.md').includes('`/ziemia`'), 'Komenda /ziemia z opisem');
    const lines = (id) => GUIDE.find((chapter) => chapter.id === id).lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(lines('farming').includes('czarnoziemie') && lines('farming').includes('do 3 bloków') && lines('herbs').includes('chili rozgrzewa') && lines('herbs').includes('płatki róży') && lines('herbs').includes('kwiat czarnego bzu'), 'Poradnik: ziemia, woda, owoce z działaniem, nowe zioła');
    check(read('docs/ziemia.md').includes('1,25') && read('CHANGELOG.md').includes('## 1.25.0'), 'Dokumenty');
}

console.log(`OK: ziemia i owoce z charakterem - ${checks} sprawdzeń (mnożniki, pola, woda, wzrost w pętli, owoce z działaniem, napary, komenda, osiągnięcia).`);
