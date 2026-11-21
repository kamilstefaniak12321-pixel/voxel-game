// ------------------------------------------------------------
// CHARAKTER DREWNA I OGNISKO Z TEMPERATURĄ (1.32.0, docs/drewno.md)
//
// - każde z 32 gatunków ma cechy (blocks/woodTraits.js) takie same jak
//   w tabeli w docs/drewno.md,
// - podpałka daje temperaturę, patyki-rozpałka ją podnoszą, polano
//   z wierzchu zajmuje się dopiero od dość gorącego ognia,
// - temperatura ognia dochodzi do żaru palącego się polana; od niej
//   zależy ciepło i szybkość gotowania,
// - polana palą się różnie długo, twarde zostawiają długi żar,
//   a polano na gorącym żarze zajmuje się samo,
// - prawdziwe Campfires: patyk, napisy, zdarzenia dla osiągnięć,
// - opisy przedmiotów, komenda /drewno, osiągnięcia, poradnik.
//
// Uruchomienie: node tools/sprawdz_drewna.mjs
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
        // Ognisko bez rysowania.
        if (url.endsWith('/src/rendering/CampfireRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class CampfireRenderer { constructor() {} update() {} dispose() {} }'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { WOOD_TRAITS, WOOD_RANGE, woodTraits } = await import('../src/blocks/woodTraits.js');
const S = await import('../src/game/CampfireState.js');
const { FIRE_WOODS, TINDERS, TINDER_TEMPS, newCampfire, addFirewood, addTinder, addKindling, updateCampfire, restoreCampfire,
    campfireDrops, canIgnite, catchesFromEmbers, startTemp, emberTemp, campfireTemp, fireWarmth, cookSpeed, burnSecondsLeft,
    logSeconds, woodIgnite, woodHeat, stackSeconds, emberSeconds, emberGlow, tinderTemp, fuelType,
    KINDLING, KINDLING_MAX, KINDLING_TEMP, EMBER_MAX_SECONDS, EMBER_HOT_SECONDS, EMBER_TEMP, EMBER_COLD_TEMP, EMBER_CATCH_SECONDS,
    EMBER_WARMTH, CAMPFIRE_IGNITE_SECONDS } = S;
const { Campfires } = await import('../src/game/Campfires.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { fireNotes } = await import('../src/items/woodNotes.js');
const { itemUses } = await import('../src/items/uses.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { FIRE_HEAT, fireHeat } = await import('../src/game/Warmth.js');
const { barkType } = await import('../src/items/bark.js');

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, tolerance = 1e-6) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual}, miało być ${expected})`);

const WOODS = Object.keys(FIRE_WOODS);


// --- Cechy gatunków ---------------------------------------------------------------------

{
    equal(Object.keys(WOOD_TRAITS).sort(), [...WOODS].sort(), 'Każde drewno z ogniska ma cechy (i nic ponad to)');
    check(WOODS.length === 32, `32 gatunki (${WOODS.length})`);
    for (const wood of WOODS) {
        const traits = WOOD_TRAITS[wood];
        check(Number.isInteger(traits.hardness) && traits.hardness >= 1 && traits.hardness <= 10, `${wood}: twardość 1-10`);
        check(traits.fresh > 0 && traits.fresh < 1, `${wood}: wilgotność świeżego 0-1`);
        check(traits.ignite >= 200 && traits.ignite <= 400 && traits.ignite % 5 === 0, `${wood}: zapłon 200-400°`);
        check(traits.heat >= 500 && traits.heat <= 1000 && traits.heat % 10 === 0, `${wood}: żar 500-1000°`);
        check(traits.burn >= 30 && traits.burn <= 180 && traits.burn % 5 === 0, `${wood}: polano 30-180 s`);
        check([0, 1, 2, 3].includes(traits.sparks) && [0, 1, 2, 3].includes(traits.smoke), `${wood}: iskry i dym 0-3`);
        check(typeof traits.note === 'string' && traits.note.length >= 8 && traits.note.length <= 60 && !traits.note.endsWith('.'), `${wood}: krótka uwaga`);
        // Żar każdego drewna zapala każde inne: ogień, który już płonie, nie gaśnie na trudnym polanie.
        check(traits.heat > WOOD_RANGE.ignite.max, `${wood}: żar wyższy niż najtrudniejszy zapłon`);
        check(itemExists(fuelType(wood)) && itemExists(barkType(wood)), `${wood}: polano i kora istnieją`);
    }
    equal(WOOD_RANGE, { hardness: { min: 1, max: 9 }, ignite: { min: 215, max: 380 }, heat: { min: 520, max: 960 }, burn: { min: 35, max: 165 } }, 'Przedziały cech');
    check(woodTraits('nie-ma-takiego') === WOOD_TRAITS.spruce, 'Nieznane drewno liczy się jak świerk');

    // Sens: iglaste łatwiej, liściaste goręcej i dłużej.
    const conifers = ['spruce', 'pine', 'fir', 'larch', 'mugo'], hardwoods = ['oak', 'beech', 'maple', 'jablon'];
    check(conifers.every((a) => hardwoods.every((b) => WOOD_TRAITS[a].ignite < WOOD_TRAITS[b].ignite && WOOD_TRAITS[a].heat < WOOD_TRAITS[b].heat && WOOD_TRAITS[a].burn < WOOD_TRAITS[b].burn)),
        'Iglaste: niższy zapłon, słabszy żar, krócej niż dąb, buk, klon i jabłoń');
    check(conifers.every((wood) => WOOD_TRAITS[wood].sparks >= 1) && hardwoods.every((wood) => WOOD_TRAITS[wood].sparks === 0) && WOOD_TRAITS.larch.sparks === 3 && WOOD_TRAITS.birch.sparks === 0, 'Iskry: iglaste strzelają (modrzew najmocniej), liściaste nie');
    check(WOOD_TRAITS.olcha.smoke === 3 && WOOD_TRAITS.pine.smoke === 2 && WOOD_TRAITS.pine.dark === true && WOOD_TRAITS.beech.smoke === 0 && WOOD_TRAITS.aspen.smoke === 0, 'Dym: olcha kopci, sosna dymi ciemno, buk i osika prawie nie');
    const by = (field) => [...WOODS].sort((a, b) => WOOD_TRAITS[a][field] - WOOD_TRAITS[b][field]);
    check(by('ignite')[0] === 'mugo' && by('ignite').at(-1) === 'baobab' && by('heat')[0] === 'baobab' && by('heat').at(-1) === 'olive' && by('burn').at(-1) === 'olive' && by('hardness').at(-1) === 'olive',
        'Skrajności: kosodrzewina najłatwiejsza, baobab najgorszy, oliwka najgorętsza i najtwardsza');
    check(WOOD_TRAITS.birch.fresh > WOOD_TRAITS.pine.fresh && WOOD_TRAITS.baobab.fresh > WOOD_TRAITS.birch.fresh && WOOD_TRAITS.olive.fresh < WOOD_TRAITS.pine.fresh, 'Świeża brzoza mokrzejsza od sosny, baobab najmokrzejszy, oliwka sucha');
}

// Tabela w docs/drewno.md mówi to samo co gra.
{
    const doc = read('docs/drewno.md');
    const FRESH = [['nasiąknięty', 0.95], ['bardzo mokre', 0.8], ['mokre', 0.6], ['średnie', 0.4], ['suche', 0.15]];
    const woodOf = (name) => WOODS.find((wood) => name.toLowerCase().startsWith(FIRE_WOODS[wood][0]) && (wood !== 'pine' || name.toLowerCase() === 'sosna'));
    let rows = 0;
    for (const line of doc.split('\n')) {
        const cells = line.split('|').map((cell) => cell.trim());
        if (cells.length < 8 || !/^\d+°$/.test(cells[4])) continue;
        const wood = woodOf(cells[1]);
        check(Boolean(wood), `docs/drewno.md: znane drzewo "${cells[1]}"`);
        const traits = WOOD_TRAITS[wood];
        const fresh = FRESH.find(([word]) => cells[3].startsWith(word))?.[1];
        equal([Number(cells[2]), fresh, parseInt(cells[4], 10), parseInt(cells[5], 10), parseInt(cells[6], 10)],
            [traits.hardness, traits.fresh, traits.ignite, traits.heat, traits.burn], `docs/drewno.md: ${cells[1]} jak w grze`);
        rows++;
    }
    check(rows === 32, `docs/drewno.md: tabela ma wszystkie gatunki (${rows})`);
}


// --- Podpałka, rozpałka i zapłon ---------------------------------------------------------

const stack = (top, rest = top) => {
    const fire = newCampfire(0, 60, 0);
    for (let i = 0; i < 5; i++) addFirewood(fire, rest);
    addFirewood(fire, top);
    return fire;
};
// Trzyma starter przez `seconds`; zwraca, po ilu sekundach ogień się zajął (albo null).
const hold = (fire, seconds = 20) => {
    for (let t = 0; t < seconds; t += 0.05) { updateCampfire(fire, 0.05, true); if (fire.phase === 'burning') return t + 0.05; }
    return null;
};

{
    check(Object.keys(TINDER_TEMPS).sort().join() === Object.keys(TINDERS).sort().join(), 'Każda podpałka ma temperaturę');
    equal([tinderTemp('short_grass'), tinderTemp('tall_grass'), tinderTemp('reed'), tinderTemp('straw')], [260, 260, 260, 260], 'Trawa i słoma: 260°');
    equal([tinderTemp('oak_bark'), tinderTemp('beech_bark'), tinderTemp('huba_huba'), tinderTemp('porostiglasty_galazki'), tinderTemp('kapok_fluff')], [280, 280, 280, 280, 280], 'Kora, huba, porost, puch: 280°');
    equal([tinderTemp('pine_bark'), tinderTemp('spruce_bark'), tinderTemp('mugo_bark'), tinderTemp('rainbow_eucalyptus_bark'), tinderTemp('fir_cone'), tinderTemp('larch_cone')], [300, 300, 300, 300, 300, 300], 'Kora żywiczna i szyszki: 300°');
    check(tinderTemp('birch_bark') === 330 && Math.max(...Object.values(TINDER_TEMPS)) === 330 && tinderTemp('stick') === 0 && tinderTemp('stone') === 0, 'Kora brzozowa najlepsza: 330°');

    // Co czym się zapali (bez rozpałki).
    const lights = (tinder, wood) => { const fire = stack(wood); addTinder(fire, tinder); return canIgnite(fire); };
    check(['spruce', 'pine', 'fir', 'larch', 'mugo', 'linden', 'rainbow_eucalyptus', 'kapok'].every((wood) => lights('short_grass', wood)), 'Trawa zapala łatwe drewno');
    check(['oak', 'beech', 'birch', 'maple', 'olive', 'baobab'].every((wood) => !lights('short_grass', wood)), 'Samego dębu, buka ani brzozy trawą się nie rozpali');
    check(lights('oak_bark', 'birch') && lights('oak_bark', 'olcha') && !lights('oak_bark', 'oak') && !lights('oak_bark', 'beech'), 'Kora zapala brzozę i olchę, dębu i buka nie');
    check(lights('pine_bark', 'beech') && lights('pine_bark', 'olive') && !lights('pine_bark', 'oak') && !lights('pine_bark', 'acacia'), 'Kora sosny zapala buk i oliwkę, dębu jeszcze nie');
    check(lights('birch_bark', 'oak') && lights('birch_bark', 'acacia') && lights('birch_bark', 'mangrove') && lights('birch_bark', 'sequoia') && !lights('birch_bark', 'baobab'), 'Kora brzozowa zapala dąb i akację, baobabu nie');
    // Każde drewno da się rozpalić: najwyżej dwa patyki do najsłabszej podpałki.
    for (const wood of WOODS) {
        const fire = stack(wood); addTinder(fire, 'short_grass');
        let sticks = 0;
        while (!canIgnite(fire) && addKindling(fire)) sticks++;
        check(canIgnite(fire) && sticks <= KINDLING_MAX, `${wood}: trawa i ${sticks} patyki wystarczą`);
        check(sticks === Math.max(0, Math.ceil((woodIgnite(wood) - 260) / KINDLING_TEMP)), `${wood}: patyków tyle, ile brakuje stopni`);
    }

    // Rozpałka: tylko do ułożonego, zimnego stosu; najwyżej dwa patyki.
    const fire = newCampfire(0, 60, 0);
    check(KINDLING === 'stick' && KINDLING_MAX === 2 && KINDLING_TEMP === 60 && itemExists(KINDLING), 'Rozpałka to patyk: +60°, najwyżej dwa');
    for (let i = 0; i < 5; i++) addFirewood(fire, 'oak');
    check(!addKindling(fire) && fire.kindling === 0, 'Patyk dopiero do sześciu polan');
    addFirewood(fire, 'oak');
    check(startTemp(fire) === 0 && !canIgnite(fire), 'Bez podpałki nie ma ognia');
    check(addKindling(fire) && fire.kindling === 1 && startTemp(fire) === 0, 'Sama rozpałka bez podpałki nic nie daje');
    check(addTinder(fire, 'oak_bark') && startTemp(fire) === 340 && canIgnite(fire), 'Kora i patyk: 340° - dąb się zajmie');
    check(addKindling(fire) && !addKindling(fire) && fire.kindling === 2 && startTemp(fire) === 400, 'Drugi patyk: 400°, trzeci się nie mieści');
    equal(campfireDrops(fire).sort((a, b) => a.type.localeCompare(b.type)), [{ type: 'oak_bark', count: 1 }, { type: 'oak_firewood', count: 6 }, { type: 'stick', count: 2 }], 'Rozebrany stos oddaje polana, podpałkę i patyki');
    const saved = restoreCampfire(JSON.parse(JSON.stringify(fire)));
    check(saved.kindling === 2 && saved.tinder === 'oak_bark' && canIgnite(saved), 'Rozpałka wraca z zapisu');
    check(restoreCampfire({ ...JSON.parse(JSON.stringify(fire)), kindling: 99 }).kindling === 2 && restoreCampfire({ ...JSON.parse(JSON.stringify(fire)), kindling: 'dużo' }).kindling === 0, 'Zły zapis rozpałki: w granicach');
    near(hold(fire), CAMPFIRE_IGNITE_SECONDS, 'Rozpalanie trwa tyle co dotąd', 0.11);
    check(fire.phase === 'burning' && fire.tinder === null && fire.kindling === 0, 'Ogień zużywa podpałkę i rozpałkę');
    check(!addKindling(fire), 'Do płonącego ogniska rozpałki się nie dokłada');
    equal(campfireDrops(fire), [], 'Z płonącego ogniska nic się nie odzyska');

    // Za słaba podpałka: trzymanie startera nic nie daje, nic nie przepada.
    const cold = stack('oak'); addTinder(cold, 'short_grass');
    check(hold(cold, 12) === null && cold.ignition === 0 && cold.tinder === 'short_grass' && cold.phase === 'unlit', 'Dąb i trawa: starter nic nie zdziała, podpałka zostaje');
    check(addKindling(cold) && canIgnite(cold) && hold(cold) !== null, 'Po dołożeniu patyka ten sam stos się zajmuje');

    // Etapami: łatwe polano na wierzchu rozpala twardy stos.
    const staged = stack('spruce', 'oak'); addTinder(staged, 'short_grass');
    check(canIgnite(staged) && hold(staged) !== null && staged.logs.at(-1).wood === 'spruce', 'Świerk na wierzchu dębowego stosu zajmuje się od trawy');
    updateCampfire(staged, logSeconds('spruce') + 1);
    check(staged.phase === 'burning' && staged.logs.length === 5 && staged.logs.at(-1).wood === 'oak' && staged.logs.at(-1).burn > 0, 'Od świerka zajmuje się dąb pod spodem');

    // Huba tli się dłużej: puszczone rozpalanie stygnie wolniej.
    const cooling = (tinder) => { const f = stack('spruce'); addTinder(f, tinder); f.ignition = 0.6; updateCampfire(f, 0.5, false); return 0.6 - f.ignition; };
    near(cooling('oak_bark'), 0.35, 'Puszczone rozpalanie stygnie', 1e-9);
    near(cooling('huba_huba'), 0.35 / 3, 'Huba tli się trzy razy dłużej', 1e-9);
}


// --- Temperatura ognia -------------------------------------------------------------------

{
    const fire = stack('oak'); addTinder(fire, 'birch_bark');
    check(campfireTemp(fire) === 0 && fireWarmth(fire) === 0, 'Zimny stos: nic nie grzeje');
    hold(fire);
    check(fire.temp >= 330 && fire.temp < 345, `Ogień zaczyna od temperatury podpałki (${fire.temp.toFixed(0)}°)`);
    check(fireWarmth(fire) < 2, 'Świeżo rozpalony prawie nie grzeje');
    const rising = [];
    for (let i = 0; i < 6; i++) { updateCampfire(fire, 10); rising.push(fire.temp); }
    check(rising.every((temp, i) => i === 0 || temp > rising[i - 1]) && rising[0] > 600 && rising.at(-1) > 915 && rising.at(-1) < 920, `Temperatura rośnie do żaru dębu (${rising.map((t) => Math.round(t)).join(', ')})`);
    near(fireWarmth(fire), (fire.temp - 300) / 25, 'Ciepło: (temperatura - 300) / 25');

    // Każde drewno dochodzi do swojego żaru.
    for (const wood of ['kapok', 'linden', 'pine', 'birch', 'oak', 'olive']) {
        const f = stack(wood); f.phase = 'burning'; f.temp = 300;
        updateCampfire(f, logSeconds(wood) * 2.5);
        check(Math.abs(f.temp - woodHeat(wood)) < 2, `${wood}: ogień ma ${woodHeat(wood)}° (${f.temp.toFixed(0)}°)`);
    }
    const warmth = (wood) => { const f = stack(wood); f.phase = 'burning'; f.temp = woodHeat(wood); return fireWarmth(f); };
    equal([warmth('linden'), warmth('pine'), warmth('birch'), warmth('oak'), warmth('olive'), warmth('baobab')].map((value) => Math.round(value)), [14, 18, 22, 25, 26, 9], 'Ciepło: lipa 14, sosna 18, brzoza 22, dąb 25, oliwka 26, baobab 9');
    near(FIRE_HEAT, 22, 'Punkt odniesienia w Warmth.js: 22°C');
    const fires = (wood) => { const f = stack(wood); f.phase = 'burning'; f.temp = woodHeat(wood); return new Map([['a', f]]); };
    check(fireHeat(fires('oak'), 0.5, 60.9, 0.5) > fireHeat(fires('spruce'), 0.5, 60.9, 0.5) && fireHeat(fires('oak'), 3.5, 60.9, 0.5) < fireHeat(fires('oak'), 0.5, 60.9, 0.5), 'Przy dębie cieplej niż przy świerku; dalej od ognia chłodniej');

    // Przejście między polanami: temperatura płynie, nie skacze.
    const mixed = stack('linden', 'oak'); mixed.phase = 'burning'; mixed.temp = woodHeat('linden');
    updateCampfire(mixed, logSeconds('linden') + 1);
    check(mixed.logs.length === 5 && mixed.temp > 650 && mixed.temp < 700, `Po lipie dąb dopiero się rozgrzewa (${mixed.temp.toFixed(0)}°)`);
    updateCampfire(mixed, 60);
    check(mixed.temp > 910, 'Po minucie dąb daje pełny żar');
    // Dołożone zimniejsze drewno studzi ogień.
    addFirewood(mixed, 'kapok'); updateCampfire(mixed, 30);
    check(mixed.temp < 640 && mixed.temp > 600, `Puchowiec na wierzchu studzi ognisko (${mixed.temp.toFixed(0)}°)`);

    // Długi skok czasu daje to samo, co wiele klatek.
    const a = stack('birch', 'oak'), b = stack('birch', 'oak');
    for (const f of [a, b]) { f.phase = 'burning'; f.temp = 330; }
    updateCampfire(a, 400);
    for (let i = 0; i < 4000; i++) updateCampfire(b, 0.1);
    check(a.logs.length === b.logs.length && Math.abs(a.logs.at(-1).burn - b.logs.at(-1).burn) < 1e-6 && Math.abs(a.temp - b.temp) < 0.5 && Math.abs(a.embers - b.embers) < 1e-6, 'Skok czasu i klatki: ten sam stos, temperatura i żar');

    // Zapis.
    const saved = restoreCampfire(JSON.parse(JSON.stringify(a)));
    check(saved.temp === a.temp && saved.phase === 'burning', 'Temperatura wraca z zapisu');
    const old = JSON.parse(JSON.stringify(a)); delete old.temp; delete old.kindling;
    check(restoreCampfire(old).temp === woodHeat('oak') && restoreCampfire(old).kindling === 0, 'Zapis sprzed 1.32.0: ogień od razu gorący');
    check(restoreCampfire({ ...old, temp: 1e9 }).temp === 1400 && restoreCampfire({ ...old, temp: -5 }).temp === 0, 'Zły zapis temperatury: w granicach');
    check(restoreCampfire({ x: 0, y: 60, z: 0, logs: [], temp: 800 }).temp === 0, 'Zimne ognisko nie ma temperatury');

    // Szybkość gotowania.
    equal([cookSpeed(800), cookSpeed(400), cookSpeed(200), cookSpeed(1000), cookSpeed(5000), cookSpeed(NaN)], [1, 0.5, 0.4, 1.25, 1.25, 0.4], 'Gotowanie: 800° - zwykła szybkość, granice 0,4 i 1,25');
    check(cookSpeed(woodHeat('oak')) > cookSpeed(woodHeat('birch')) && cookSpeed(woodHeat('birch')) > 1 && cookSpeed(woodHeat('spruce')) < 1, 'Nad dębem gotuje się szybciej niż nad brzozą, nad świerkiem wolniej');
}


// --- Czas palenia i żar ------------------------------------------------------------------

{
    equal([stackSeconds('kapok'), stackSeconds('spruce'), stackSeconds('pine'), stackSeconds('birch'), stackSeconds('oak'), stackSeconds('olive')], [210, 330, 360, 600, 900, 990], 'Pełny stos: puchowiec 3,5 min, świerk 5,5, brzoza 10, dąb 15, oliwka 16,5');
    for (const wood of ['kapok', 'spruce', 'oak']) {
        const fire = stack(wood); fire.phase = 'burning';
        near(burnSecondsLeft(fire), stackSeconds(wood), `${wood}: tyle zostało na starcie`);
        updateCampfire(fire, stackSeconds(wood) - 1);
        check(fire.phase === 'burning' && fire.logs.length === 1, `${wood}: pali się do końca czasu`);
        updateCampfire(fire, 1.5);
        check(fire.phase === 'collapsing', `${wood}: potem opada w żar`);
    }

    equal([emberSeconds('kapok'), emberSeconds('spruce'), emberSeconds('pine'), emberSeconds('birch'), emberSeconds('oak'), emberSeconds('olive')], [4, 10, 12, 33, 75, 91], 'Żar po polanie: świerk 10 s, brzoza 33 s, dąb 75 s');
    // Wypalony stos: polana spalone, stos opadł w żar (2,4 s).
    const burnt = (wood) => { const fire = stack(wood); fire.phase = 'burning'; updateCampfire(fire, stackSeconds(wood)); updateCampfire(fire, 2.4); updateCampfire(fire, 1e-9); return fire; };
    const spruce = burnt('spruce'), oak = burnt('oak'), olive = burnt('olive');
    check(spruce.phase === 'unlit' && spruce.logs.length === 0 && spruce.ash, 'Wypalone ognisko: popiół');
    near(spruce.embers, 60, 'Po stosie świerka żar na minutę');
    near(oak.embers, 450, 'Po stosie dębu żar na 7,5 minuty');
    near(olive.embers, 546, 'Po stosie oliwki żar na ponad 9 minut');
    // Długo podtrzymywane ognisko nie zbiera żaru bez końca.
    const long = stack('oak'); long.phase = 'burning';
    for (let i = 0; i < 12; i++) { updateCampfire(long, logSeconds('oak')); addFirewood(long, 'oak'); }
    check(long.embers === EMBER_MAX_SECONDS && EMBER_MAX_SECONDS === 600, 'Żaru jest najwyżej na 10 minut');
    updateCampfire(long, 30);
    check(long.embers === EMBER_MAX_SECONDS, 'Pod płonącym stosem żar nie gaśnie');

    // Żar stygnie i gaśnie.
    check(emberTemp(oak) === EMBER_TEMP && emberGlow(oak) === 1 && fireWarmth(oak) === EMBER_WARMTH && campfireTemp(oak) === EMBER_TEMP, 'Świeży żar: 500°, jasny, grzeje o kilka stopni');
    updateCampfire(oak, 450 - EMBER_HOT_SECONDS / 2);
    near(emberTemp(oak), (EMBER_TEMP + EMBER_COLD_TEMP) / 2, 'Dogasający żar stygnie');
    near(fireWarmth(oak), EMBER_WARMTH / 2, 'i grzeje słabiej');
    check(emberGlow(oak) > 0.6 && emberGlow(oak) < 0.7, 'Węgle ciemnieją');
    updateCampfire(oak, 100);
    check(oak.embers === 0 && emberTemp(oak) === 0 && fireWarmth(oak) === 0 && emberGlow(oak) === 0 && oak.ash, 'Po czasie zostaje zimny popiół');

    // Polano na gorącym żarze zajmuje się samo; trudne na dogasającym - nie.
    const hot = burnt('oak');
    check(addFirewood(hot, 'oak') && catchesFromEmbers(hot), 'Na gorącym żarze zajmie się nawet dąb');
    updateCampfire(hot, EMBER_CATCH_SECONDS / 2);
    check(hot.phase === 'unlit' && hot.ignition > 0.4 && hot.ignition < 0.6, 'Zajmuje się po chwili');
    updateCampfire(hot, EMBER_CATCH_SECONDS / 2 + 0.01);
    check(hot.phase === 'burning' && hot.logs.length === 1 && Math.abs(hot.temp - EMBER_TEMP) < 1 && hot.ignition === 0, 'Polano płonie, zaczyna od temperatury żaru');
    check(addFirewood(hot, 'oak') && hot.logs.length === 2, 'Do takiego ogniska dalej się dokłada');
    const weak = burnt('oak'); updateCampfire(weak, 450 - 20);
    check(weak.embers > 19 && weak.embers < 21 && emberTemp(weak) < woodIgnite('oak') && emberTemp(weak) > woodIgnite('pine'), `Dogasający żar ma ${Math.round(emberTemp(weak))}°`);
    addFirewood(weak, 'oak');
    check(!catchesFromEmbers(weak), 'Dąb na dogasającym żarze się nie zajmie');
    updateCampfire(weak, 10);
    check(weak.phase === 'unlit' && weak.ignition === 0, 'i leży zimny');
    const easy = burnt('oak'); updateCampfire(easy, 450 - 20); addFirewood(easy, 'pine');
    check(catchesFromEmbers(easy), 'Sosna zajmie się nawet od dogasającego żaru');
    updateCampfire(easy, EMBER_CATCH_SECONDS + 0.1);
    check(easy.phase === 'burning', 'i płonie');
    // Zimny popiół niczego nie zapala.
    const ash = burnt('spruce'); updateCampfire(ash, 100); addFirewood(ash, 'pine'); updateCampfire(ash, 30);
    check(ash.phase === 'unlit' && !catchesFromEmbers(ash), 'Na zimnym popiele polano leży');
    check(restoreCampfire({ x: 0, y: 60, z: 0, embers: 5000, ash: true }).embers === EMBER_MAX_SECONDS, 'Zły zapis żaru: w granicach');
}


// --- Prawdziwe Campfires: patyk, napisy, zdarzenia ---------------------------------------

{
    const campfire = getBlockId('campfire');
    const setup = (items, fire) => {
        const notices = [], sounds = [], achieved = [];
        const inventory = Inventory.load({}, 'adventure');
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        items.forEach((item, i) => inventory.set(i, item));
        inventory.selected = 0;
        const game = { mode: 'adventure', inventory, sounds: { play: (name) => sounds.push(name) }, swings: 0, swingArm() { this.swings++; },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
            playBlockSound: (kind, type) => sounds.push(`${kind}:${type}`), player: { pos: { x: 5, y: 60, z: 5 } },
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId: () => campfire },
            get selectedBlock() { return inventory.selectedItem?.type ?? null; },
            currentHit: { hit: true, block: { x: 0, y: 60, z: 0, type: 'campfire' } } };
        const fires = new Campfires(game, []);
        fires.fires.set('0,60,0', fire);
        const click = (slot) => { inventory.selected = slot; fires.noticeAt = -10; return fires.interact(game.currentHit, game.selectedBlock); };
        const run = (seconds, holding = false) => { for (let t = 0; t < seconds; t += 0.1) fires.update(0.1, holding); };
        return { game, fires, fire, inventory, notices, achieved, click, run, count: (type) => inventory.count(type) };
    };
    const kit = () => [{ type: 'oak_bark', count: 2 }, { type: 'stick', count: 5 }, { type: 'fire_starter', count: 1 }, null, { type: 'oak_firewood', count: 4 }, { type: 'pine_firewood', count: 4 }];

    // Dębowy stos: kora nie wystarcza, patyk pomaga.
    const t = setup(kit(), stack('oak'));
    t.click(3);
    check(/Dodaj podpałkę/.test(t.notices.at(-1)), 'Pusta ręka: brakuje podpałki');
    check(t.click(1) && t.count('stick') === 4 && t.fire.kindling === 1 && /Rozpałka z patyków 1\/2 \(\+60° do podpałki\)/.test(t.notices.at(-1)), 'Patyk przed podpałką: rozpałka czeka');
    t.fire.kindling = 0;
    check(t.click(0) && t.count('oak_bark') === 1 && t.fire.tinder === 'oak_bark', 'Kora trafia na stos');
    check(/Dąb zajmuje się od 320°, a podpałka daje 280°\. Dołóż patyk jako rozpałkę \(\+60°\) albo zacznij od łatwiejszego drewna na wierzchu\./.test(t.notices.at(-1)), `Za słaba podpałka: od razu wiadomo, co zrobić (${t.notices.at(-1)})`);
    t.click(3);
    check(/Dąb zajmuje się od 320°/.test(t.notices.at(-1)), 'Pusta ręka mówi to samo');
    t.click(2);
    check(/Dąb zajmuje się od 320°/.test(t.notices.at(-1)), 'Starter też');
    t.inventory.selected = 2; t.run(8, true);
    check(t.fire.phase === 'unlit' && t.fire.ignition === 0, 'Trzymanie startera nic nie daje');
    check(t.click(1) && t.count('stick') === 3 && t.fire.kindling === 1 && /Rozpałka z patyków 1\/2: 340° - wystarczy/.test(t.notices.at(-1)), 'Patyk: 340° - wystarczy');
    t.click(3);
    check(/Przytrzymaj PPM starterem ognia/.test(t.notices.at(-1)), 'Teraz można rozpalać');
    check(t.click(1) && t.fire.kindling === 2 && t.click(1) && t.fire.kindling === 2 && t.count('stick') === 2 && /Więcej patyków się nie zmieści \(2\/2\)/.test(t.notices.at(-1)), 'Trzeci patyk się nie mieści i nie znika');
    t.inventory.selected = 2; t.run(CAMPFIRE_IGNITE_SECONDS + 0.3, true);
    check(t.fire.phase === 'burning' && t.notices.includes('Ognisko rozpalone'), 'Ognisko rozpalone');
    equal(t.achieved.filter(([name]) => name === 'fireLit').map(([, data]) => [data.wood, data.embers, data.woods.length]), [['oak', false, 6]], 'Zdarzenie dla osiągnięć: rozpalony dąb');
    t.run(60);
    t.click(3);
    check(/^Ognisko płonie \(9[012]0°\) - opał 6\/6, jeszcze ok\. 1[34] min$/.test(t.notices.at(-1)), `Opis płonącego: temperatura, opał, czas (${t.notices.at(-1)})`);
    check(t.click(1) && t.count('stick') === 2 && /Ognisko płonie/.test(t.notices.at(-1)), 'Patyk na płonącym ognisku: tylko opis');

    // Niepełny stos: najpierw opał.
    const few = newCampfire(0, 60, 0); addFirewood(few, 'oak');
    const u = setup(kit(), few);
    check(u.click(1) && u.count('stick') === 5 && /Najpierw opał: 1\/6/.test(u.notices.at(-1)), 'Patyk do niepełnego stosu: najpierw opał');

    // Żar: łatwe polano zajmuje się samo, gracz dostaje napis i zdarzenie.
    const embers = newCampfire(0, 60, 0); embers.ash = true; embers.embers = 300;
    const e = setup(kit(), embers);
    e.click(3);
    check(/^Żar \(500°\) - dołóż polano, a zajmie się samo$/.test(e.notices.at(-1)), `Opis żaru (${e.notices.at(-1)})`);
    check(e.click(5) && e.count('pine_firewood') === 3 && /Polano zajmuje się od żaru: 0%/.test(e.notices.at(-1)), 'Sosna na żarze: zajmuje się');
    e.run(EMBER_CATCH_SECONDS + 0.3);
    check(e.fire.phase === 'burning' && e.notices.includes('Polano zajęło się od żaru'), 'Polano zajęło się od żaru');
    equal(e.achieved.filter(([name]) => name === 'fireLit').map(([, data]) => [data.wood, data.embers]), [['pine', true]], 'Zdarzenie: ogień od żaru');
    check(e.click(4) && e.fire.logs.length === 2 && /Dołożono opał: 2\/6/.test(e.notices.at(-1)), 'Dalej dokłada się jak do płonącego');

    // Dogasający żar i dąb.
    const dying = newCampfire(0, 60, 0); dying.ash = true; dying.embers = 20;
    const d = setup(kit(), dying);
    check(d.click(4) && /^Żar \(290°\) jest za słaby: dąb zajmuje się od 320°\. Opał 1\/6$/.test(d.notices.at(-1)), `Za słaby żar (${d.notices.at(-1)})`);
    d.run(6);
    check(d.fire.phase === 'unlit' && !d.achieved.some(([name]) => name === 'fireLit'), 'Dąb leży na dogasającym żarze');

    // Daleko od gracza: ogień od żaru bez napisu i bez zdarzenia.
    const far = newCampfire(0, 60, 0); far.ash = true; far.embers = 300; addFirewood(far, 'pine');
    const f = setup(kit(), far); f.game.player.pos.x = 40;
    f.run(EMBER_CATCH_SECONDS + 0.3);
    check(f.fire.phase === 'burning' && f.notices.length === 0 && f.achieved.length === 0, 'Daleko od gracza ogień zajmuje się po cichu');
}


// --- Opisy przedmiotów, osiągnięcia, komenda, poradnik -----------------------------------

{
    equal(fireNotes('oak_firewood'), ['Zapłon 320° · żar 920° · pali się 150 s', 'Pali się najdłużej, żar trzyma do rana'], 'Podpowiedź polana: zapłon, żar, czas');
    equal(fireNotes('birch_bark'), ['Podpałka: 330°'], 'Podpowiedź podpałki');
    equal(fireNotes('stick'), ['Rozpałka: +60° do podpałki'], 'Podpowiedź patyka');
    equal(fireNotes('stone'), [], 'Reszta bez dopisków');
    for (const wood of WOODS) check(fireNotes(fuelType(wood)).length === 2 && fireNotes(fuelType(wood))[0].includes(`${WOOD_TRAITS[wood].ignite}°`), `${wood}: polano ma opis`);
    check(itemUses('oak_firewood').includes('opał do ogniska: zapłon 320°, żar 920°, polano pali się 150 s'), 'Zastosowania polana: liczby');
    check(itemUses('stick').some((text) => text.startsWith('rozpałka do ogniska')), 'Zastosowania patyka: rozpałka');
    check(itemUses('birch_bark').some((text) => text.startsWith('podpałka 330° (1,5 raza szybsza od trawy)')) && itemUses('short_grass').includes('podpałka 260°'), 'Zastosowania podpałki: temperatura');
    const screen = read('src/ui/InventoryScreen.js');
    check(/fireNotes\(type\)\.map/.test(screen) && (screen.match(/\.\.\.this\.fireNote\(/g) ?? []).length === 2, 'Ekwipunek pokazuje opis drewna w podpowiedzi');

    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const hard = byId.hardwood_fire, glow = byId.fire_from_embers, forge = byId.forge_heat;
    check(hard && glow && forge && [hard, glow, forge].every((entry) => itemExists(entry.icon) && entry.task.length > 20 && entry.comment.length > 10), 'Trzy osiągnięcia: twarde drewno, żar, gorące ognisko');
    check(hard.on === 'fireLit' && hard.when({ wood: 'oak', embers: false }) && hard.when({ wood: 'beech', embers: false }) && !hard.when({ wood: 'spruce', embers: false }) && !hard.when({ wood: 'oak', embers: true }), 'Od patyka do polana: twarde drewno na wierzchu, nie od żaru');
    check(glow.on === 'fireLit' && glow.when({ wood: 'pine', embers: true }) && !glow.when({ wood: 'pine', embers: false }), 'Jeszcze się tli: tylko od żaru');
    const world = (fire, x = 1) => ({ player: { pos: { x, y: 60, z: 1 } }, campfires: { fires: new Map([['a', fire]]) } });
    const hotFire = (wood, seconds) => { const f = stack(wood); f.phase = 'burning'; f.temp = 330; updateCampfire(f, seconds); return f; };
    check(forge.check(world(hotFire('olive', 60))) && forge.check(world(hotFire('acacia', 60))) && forge.check(world(hotFire('mangrove', 80))), 'Gorąco jak w kuźni: oliwka, akacja i namorzyn');
    check(!forge.check(world(hotFire('oak', 300))) && !forge.check(world(hotFire('olive', 10))) && !forge.check(world(hotFire('olive', 60), 40)) && !forge.check({ player: null }), 'Dąb to za mało; świeży ogień i daleki też się nie liczą');

    const commands = read('src/commands/worldCommands.js'), commandsDoc = read('docs/komendy.md');
    check(/name: 'drewno'/.test(commands) && ['/drewno ognisko', '/drewno rzad', '/drewno zestaw'].every((text) => commands.includes(text) && commandsDoc.includes(text)), 'Komenda /drewno jest w grze i w opisie');
    const renderer = read('src/rendering/CampfireRenderer.js');
    check(/SMOKE_RATE\[wood\.smoke\]/.test(renderer) && /SPARK_RATE\[wood\.sparks\]/.test(renderer) && /emberGlow\(fire\)/.test(renderer) && /fire\.kindling/.test(renderer), 'Obraz: dym i iskry zależą od drewna, widać rozpałkę i żar');
    const sync = read('src/net/StateSync.js');
    check(/fire\.kindling \?\? 0/.test(sync), 'Gra ze znajomymi: rozpałka w podpisie ogniska');
    const docs = read('docs/ogniska.md');
    check(/1\.32\.0/.test(docs) && /rozpałk/.test(docs) && /żar/.test(docs), 'docs/ogniska.md opisuje temperaturę, rozpałkę i żar');
    check(getItemLabel('stick') === 'Patyk', 'Patyk');
}

console.log(`OK: charakter drewna i ognisko z temperaturą - ${checks} sprawdzeń (cechy 32 gatunków i tabela w opisie, podpałka i rozpałka, temperatura, czas palenia, żar, prawdziwe ognisko, opisy, osiągnięcia).`);
