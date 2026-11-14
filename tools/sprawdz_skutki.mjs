// Skutki zamiast śmierci (0.97.0): stłuczona noga po upadku, oddech
// i utrata przytomności pod wodą (pobudka na brzegu), pieczenie nad
// ogniskiem. Logika z prawdziwych plików gry, bez grafiki.
// Uruchomienie:
//     node tools/sprawdz_skutki.mjs

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

const { Wellbeing, STATES, LIMP_SPEED, LIMP_MAX, BREATH_SECONDS, MEAL_ENERGY } = await import('../src/game/Wellbeing.js');
const { Blackout, findShore, FADE_SECONDS, NO_INPUT } = await import('../src/game/Blackout.js');
const { FOODS, ROASTS, ROAST_SECONDS, getRoast, getFood } = await import('../src/items/foods.js');
const { itemExists, getItemLabel, getPlacedBlock } = await import('../src/items/ItemRegistry.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { Campfires } = await import('../src/game/Campfires.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { GRAVITY } = await import('../src/config.js');

let checks = 0;
const ok = (value, text) => { checks++; assert.ok(value, text); };
const equal = (a, b, text) => { checks++; assert.deepEqual(a, b, text); };
const fresh = (saved, days = 0) => Wellbeing.load(saved, days, () => 0.5);
const speedFrom = (height) => Math.sqrt(2 * -GRAVITY * height);

// --- Upadek i utykanie ---------------------------------------------------------
{
    const w = fresh();
    equal(w.fall(speedFrom(3)), 0, 'skok z 3 bloków nic nie robi');
    equal(w.fall(speedFrom(6)), 0, 'z 6 bloków jeszcze nic');
    ok(!w.limping && w.effects === STATES.good, 'zdrowy: zwykłe skutki stanu');
    ok(w.fall(speedFrom(8)) > 0, 'z 8 bloków noga stłuczona');
    ok(w.limping, 'gracz utyka');
    ok(w.effects.walk < 1 && !w.effects.canSprint && w.effects.sprint === 0, 'utykanie: wolniej i bez biegu');
    equal(w.effects.work, STATES.good.work, 'ręce pracują jak dotąd');
    ok(Math.abs(LIMP_SPEED - speedFrom(7)) < 0.2, 'próg to ok. 7 bloków');
    const low = fresh(), high = fresh(), top = fresh();
    low.fall(speedFrom(8)); high.fall(speedFrom(20)); top.fall(speedFrom(200));
    ok(high.data.limp > low.data.limp, 'wyższy upadek - dłuższe utykanie');
    equal(top.data.limp, LIMP_MAX, 'czas utykania ma górną granicę');
    // Drugi, mniejszy upadek nie skraca.
    const before = high.data.limp;
    equal(high.fall(speedFrom(8)), 0, 'mniejszy upadek nie dokłada');
    equal(high.data.limp, before, 'ani nie skraca');
    // Gojenie: w ruchu wolniej, w spoczynku i po jedzeniu szybciej.
    const walk = fresh({ limp: 100 }), rest = fresh({ limp: 100 }), fed = fresh({ limp: 100, fullness: 400 });
    for (let i = 0; i < 20; i++) { walk.update(1, { moving: true }, 0); rest.update(1, {}, 0); fed.update(1, {}, 0); }
    ok(walk.data.limp === 80 && rest.data.limp < walk.data.limp && fed.data.limp < rest.data.limp, 'odpoczynek i jedzenie goją szybciej');
    const heal = fresh({ limp: 1 });
    const events = heal.update(2, {}, 0);
    ok(events.some((e) => e.type === 'healed') && !heal.limping, 'noga się goi i gra o tym mówi');
    equal(heal.update(1, {}, 0).filter((e) => e.type === 'healed').length, 0, 'tylko raz');
    // Zapis i tryb kreatywny.
    equal(fresh(JSON.parse(JSON.stringify(low.data))).data.limp, low.data.limp, 'utykanie jest w zapisie');
    equal(fresh({ limp: -5 }).data.limp, 0, 'zepsuty zapis: zdrowa noga');
    equal(fresh({ limp: 1e9 }).data.limp, LIMP_MAX, 'zepsuty zapis: w granicach');
    const off = fresh({ limp: 50 }); off.active = false;
    ok(!off.limping && off.effects === STATES.good && off.fall(speedFrom(50)) === 0, 'kreatywny: nie utyka i nie tłucze nogi');
    ok(low.describe().limp && fresh().describe().limp === null, 'opis nogi w oknie statusu');
    // Utykanie łączy się ze stanem (wyczerpany utyka jeszcze wolniej).
    const worn = fresh({ energy: 1, limp: 100 });
    ok(worn.effects.walk < STATES.exhausted.walk && worn.effects.dim === STATES.exhausted.dim, 'utykanie nakłada się na wyczerpanie');
}

// --- Oddech ------------------------------------------------------------------------
{
    const w = fresh();
    equal(w.breath, 1, 'pełne płuca na start');
    w.update(BREATH_SECONDS / 2, { underwater: true }, 0);
    ok(Math.abs(w.breath - 0.5) < 1e-9, 'pod wodą oddechu ubywa');
    w.update(1, {}, 0);
    ok(w.breath > 0.5, 'na powietrzu wraca');
    w.update(60, {}, 0);
    equal(w.breath, 1, 'do pełna');
    let drown = 0;
    for (let t = 0; t < BREATH_SECONDS + 10; t += 0.5) drown += w.update(0.5, { underwater: true }, 0).filter((e) => e.type === 'drown').length;
    equal(drown, 1, 'brak oddechu: jedno zdarzenie utonięcia');
    equal(w.breath, 0, 'oddech na zerze');
    w.data.energy = 80; w.data.fullness = 300;
    w.blackout();
    ok(w.breath === 1 && !w.drowned, 'po pobudce płuca pełne');
    equal(w.state, 'exhausted', 'i wyczerpanie');
    equal(w.data.fullness, 0, 'pusty żołądek');
    const tired = fresh({ energy: 2 }); tired.blackout();
    equal(tired.energy, 2, 'utonięcie nie dodaje energii');
    const off = fresh(); off.active = false;
    off.update(999, { underwater: true }, 0);
    equal(off.breath, 1, 'kreatywny: oddech nie ubywa');
}

// --- Brzeg -------------------------------------------------------------------------
function lake({ radius = 20, shore = true, size = 96 } = {}) {
    // Płaski ląd (y = 10) z okrągłym jeziorem o głębokości 6 w środku (0, 0).
    const stone = getBlockId('stone'), grass = getBlockId('grass'), water = getBlockId('water');
    return {
        getBlockId(x, y, z) {
            if (Math.abs(x) > size || Math.abs(z) > size) return 0;      // niewczytane
            const inLake = Math.hypot(x, z) < radius || !shore;
            if (y < 4) return stone;
            if (inLake) return y <= 10 ? water : 0;
            return y < 10 ? stone : y === 10 ? grass : 0;
        }
    };
}
{
    const world = lake();
    const spot = findShore(world, 0.5, 6, 0.5);
    ok(spot, 'brzeg znaleziony');
    const distance = Math.hypot(spot.x, spot.z);
    ok(distance >= 20 && distance < 26, `na samym brzegu jeziora (${distance.toFixed(1)})`);
    equal(spot.y, 11, 'stopy na trawie');
    equal(world.getBlockId(Math.floor(spot.x), 10, Math.floor(spot.z)), getBlockId('grass'), 'pod stopami ląd');
    equal(world.getBlockId(Math.floor(spot.x), 11, Math.floor(spot.z)), 0, 'i wolne miejsce');
    // Mała sadzawka: brzeg jest tuż obok, ale gracz budzi się kawałek dalej.
    const pond = findShore(lake({ radius: 3 }), 0.5, 8, 0.5);
    ok(Math.hypot(pond.x, pond.z) >= 10, 'nie budzi się w tym samym miejscu');
    // Otwarte morze: nie ma gdzie.
    equal(findShore(lake({ shore: false }), 0.5, 6, 0.5), null, 'bez lądu: brak brzegu');
    // Ląd pod niskim stropem: gracz budzi się na wierzchu, nie w szczelinie.
    const cave = lake();
    const roofed = { getBlockId: (x, y, z) => (y === 12 && Math.hypot(x, z) >= 20 ? getBlockId('stone') : cave.getBlockId(x, y, z)) };
    equal(findShore(roofed, 0.5, 6, 0.5).y, 13, 'niski strop: pobudka na wierzchu');
}

// --- Utrata przytomności w grze --------------------------------------------------------
{
    const messages = [], achieved = [];
    const vector = (x, y, z) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
    const makeGame = (world, net = null) => {
        const game = { world, net, player: { pos: vector(0.5, 6, 0.5), vel: vector(1, -3, 2) }, wellbeing: fresh({ energy: 90 }),
            time: { hours: 0, addHours(h) { this.hours += h; } }, mined: 0, stopMining() { this.mined++; },
            achieve: (name) => achieved.push(name), onMessage: (text) => messages.push(text) };
        game.blackout = new Blackout(game);
        return game;
    };
    const game = makeGame(lake());
    equal(game.blackout.update(0.1), false, 'przytomny: nic się nie dzieje');
    game.blackout.start();
    ok(game.blackout.active && game.blackout.phase === 'out' && game.mined === 1, 'obraz gaśnie, kopanie przerwane');
    game.blackout.start();
    equal(game.mined, 1, 'drugi raz naraz się nie zaczyna');
    equal(game.blackout.update(FADE_SECONDS / 2), true, 'w trakcie gaśnięcia gracz nie steruje');
    equal(game.player.pos.x, 0.5, 'jeszcze na miejscu');
    equal(game.blackout.update(FADE_SECONDS), true, 'pobudka');
    equal(game.blackout.phase, 'in', 'obraz wraca');
    ok(Math.hypot(game.player.pos.x, game.player.pos.z) >= 20 && game.player.pos.y === 11, 'gracz jest na brzegu');
    equal([game.player.vel.x, game.player.vel.y, game.player.vel.z], [0, 0, 0], 'stoi w miejscu');
    equal(game.wellbeing.state, 'exhausted', 'wyczerpany');
    equal(game.time.hours, 2, 'minęły dwie godziny');
    ok(messages.at(-1).includes('brzegu') && achieved.includes('blackout'), 'komunikat i zdarzenie');
    game.blackout.update(FADE_SECONDS + 0.1);
    ok(!game.blackout.active, 'koniec');
    // Gra ze znajomymi: czas należy do gospodarza.
    const guest = makeGame(lake(), {});
    guest.blackout.start(); guest.blackout.update(FADE_SECONDS + 0.1);
    equal(guest.time.hours, 0, 'w grze ze znajomymi czas nie przeskakuje');
    // Otwarte morze: wynurzenie zamiast brzegu.
    const sea = makeGame(lake({ shore: false }));
    sea.blackout.start(); sea.blackout.update(FADE_SECONDS + 0.1);
    ok(sea.player.pos.y > 10 && sea.player.pos.x === 0.5, 'bez lądu: wynurzenie w tym samym miejscu');
    equal(sea.wellbeing.breath, 1, 'z pełnym oddechem');
    ok(typeof NO_INPUT.isKeyDown === 'function' && !NO_INPUT.isKeyDown('KeyW') && NO_INPUT.consumeMouseDelta().x === 0, 'puste wejście');
}

// --- Pieczenie: lista ------------------------------------------------------------------
{
    equal(Object.keys(ROASTS).length, 4, 'cztery rzeczy do pieczenia');
    for (const [raw, roasted] of Object.entries(ROASTS)) {
        ok(itemExists(raw) && itemExists(roasted) && getItemLabel(roasted), `${raw} -> ${roasted}: przedmioty istnieją`);
        ok(getFood(raw) && getFood(roasted), `${raw}: surowe i pieczone da się zjeść`);
        ok(FOODS[roasted].energy > FOODS[raw].energy * 1.5, `${roasted}: daje wyraźnie więcej niż surowe`);
        ok(FOODS[roasted].energy >= MEAL_ENERGY && FOODS[roasted].kind === 'meal', `${roasted}: jedna sztuka to posiłek`);
        equal(getPlacedBlock(roasted), null, `${roasted}: nie da się posadzić`);
        equal(getRoast(roasted), null, `${roasted}: nie piecze się drugi raz`);
        const w = fresh({ energy: 20 });
        ok(w.eat(roasted, 0.3).meal, `${roasted}: zalicza posiłek`);
    }
    equal(getRoast('strawberry'), null, 'truskawek się nie piecze');
    const atlas = JSON.parse(readFileSync(new URL('../assets/textures/atlas.json', import.meta.url), 'utf8'));
    const cells = new Map();
    for (const [name, t] of Object.entries(atlas.tiles)) {
        for (let dx = 0; dx < (t.w ?? 1); dx++) for (let dy = 0; dy < (t.h ?? 1); dy++) {
            const key = `${t.x + dx},${t.y + dy}`;
            ok(!cells.has(key) || !name.startsWith('roasted_') && !cells.get(key).startsWith('roasted_'), `kafelek ${key} nie jest zajęty dwa razy`);
            cells.set(key, name);
        }
    }
    for (const roasted of Object.values(ROASTS)) ok(atlas.regions[roasted] && atlas.tiles[roasted], `${roasted}: ikonka w atlasie`);
}

// --- Pieczenie nad ogniskiem (prawdziwe Campfires) ----------------------------------------
{
    const campfire = getBlockId('campfire');
    const setup = (phase, { mode = 'adventure', item = { type: 'jablon_jablko', count: 3 } } = {}) => {
        const notices = [], sounds = [], achieved = [];
        const inventory = Inventory.load({}, mode);
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        inventory.set(0, item); inventory.selected = 0;
        const game = { mode, inventory, sounds: { play: (name) => sounds.push(name) }, swings: 0, swingArm() { this.swings++; },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId: () => campfire },
            get selectedBlock() { return inventory.selectedItem?.type ?? null; },
            currentHit: { hit: true, block: { x: 4, y: 10, z: 4, type: 'campfire' } } };
        const fires = new Campfires(game, []);
        fires.fires.set('4,10,4', { x: 4, y: 10, z: 4, logs: Array.from({ length: 6 }, () => ({ wood: 'oak', burn: 0.2 })),
            tinder: null, phase, ignition: 0, collapse: 0, embers: 0, ash: false });
        return { game, fires, inventory, notices, sounds, achieved };
    };
    const hold = (f, seconds, holding = true) => { for (let t = 0; t < seconds; t += 0.1) f.fires.updateRoast(0.1, holding, f.game.currentHit); };
    const count = (f, type) => f.inventory.slots.filter((s) => s?.type === type).reduce((n, s) => n + s.count, 0);

    const f = setup('burning');
    hold(f, ROAST_SECONDS - 0.5);
    equal([count(f, 'jablon_jablko'), count(f, 'roasted_apple')], [3, 0], 'za krótko: jeszcze surowe');
    ok(f.notices.some((n) => n.startsWith('Pieczenie:')) && f.sounds.includes('sizzle') && f.game.swings > 0, 'postęp, skwierczenie, ruch ręki');
    hold(f, 0.7);
    equal([count(f, 'jablon_jablko'), count(f, 'roasted_apple')], [2, 1], 'po czasie: jedno jabłko upieczone');
    ok(f.notices.at(-1).includes('Pieczone jabłko') && f.achieved[0][0] === 'roasted', 'komunikat i zdarzenie');
    hold(f, ROAST_SECONDS * 2 + 0.3);
    equal([count(f, 'jablon_jablko'), count(f, 'roasted_apple')], [0, 3], 'trzymany PPM piecze kolejne');
    // Puszczenie PPM przerywa i zaczyna od nowa.
    const g = setup('burning');
    hold(g, ROAST_SECONDS - 0.5); hold(g, 0.2, false); hold(g, ROAST_SECONDS - 0.5);
    equal(count(g, 'roasted_apple'), 0, 'przerwane pieczenie zaczyna się od nowa');
    // Zimne ognisko nie piecze; żar - tak.
    const cold = setup('unlit'); hold(cold, ROAST_SECONDS + 1);
    equal(count(cold, 'roasted_apple'), 0, 'zimne ognisko nie piecze');
    cold.fires.interact(cold.game.currentHit, 'jablon_jablko');
    ok(cold.notices.at(-1).includes('musi płonąć'), 'podpowiedź przy zimnym ognisku');
    const embers = setup('collapsing'); hold(embers, ROAST_SECONDS + 0.2);
    equal(count(embers, 'roasted_apple'), 1, 'na żarze też się piecze');
    // Truskawki, patrzenie obok, tryb kreatywny, pełny ekwipunek.
    const berry = setup('burning', { item: { type: 'strawberry', count: 2 } }); hold(berry, ROAST_SECONDS + 1);
    equal(count(berry, 'strawberry'), 2, 'truskawek się nie piecze');
    const away = setup('burning'); away.game.currentHit = { hit: true, block: { x: 9, y: 10, z: 9, type: 'grass' } }; hold(away, ROAST_SECONDS + 1);
    equal(count(away, 'roasted_apple'), 0, 'trzeba celować w ognisko');
    const creative = setup('burning', { mode: 'creative', item: { type: 'hazelnut', count: 1 } }); hold(creative, ROAST_SECONDS + 0.2);
    equal([count(creative, 'hazelnut'), count(creative, 'roasted_hazelnut')], [1, 1], 'kreatywny: surowe nie znika');
    const full = setup('burning', { item: { type: 'acorn', count: 5 } });
    for (let i = 1; i < full.inventory.slots.length; i++) full.inventory.set(i, { type: 'stone', count: 64 });
    hold(full, ROAST_SECONDS + 0.2);
    equal([count(full, 'acorn'), count(full, 'roasted_acorn')], [5, 0], 'pełny ekwipunek: surowe zostaje');
    ok(full.notices.at(-1) === 'Ekwipunek pełny', 'i gra o tym mówi');
}

console.log(`OK: skutki zamiast śmierci - ${checks} sprawdzeń.`);
