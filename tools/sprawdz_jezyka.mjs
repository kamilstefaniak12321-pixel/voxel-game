// ------------------------------------------------------------
// SPRAWDZENIE JEŻYKA (1.18.0) - pierwszego zwierzęcia w grze
//
// - model z pliku Kamila (6 części, wymiary, UV, kości) i tekstury
//   czterech wariantów (brązowy piksel w piksel z rysunku),
// - zachowanie: sen w dzień w domu, żer nocą blisko domu, powrót
//   o świcie, sen zimowy, kulka przed biegnącym człowiekiem i po
//   trąceniu (bez krzywdy), spokój przy skradającym się, podchodzenie
//   do jagód i jedzenie z ręki, zaufanie po karmieniu,
// - teren: próg jednego bloku, woda, urwisko, liście krzewów,
// - pozy: chód, węszenie, kulka,
// - domy w dzikich krzewach (stałe dla ziarna), pojawianie się
//   i znikanie, kliknięcia gracza,
// - liście krzewów: do przejścia, gracz w nich zwalnia,
// - osiągnięcia, dźwięki, jedzenie.
//
// Uruchomienie: node tools/sprawdz_jezyka.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest, readTextureRegion, decodeTexturePng } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        // Atlas rysuje się na płótnie przeglądarki - tu wystarczy atrapa.
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = new Promise(() => {}), atlasAveragesReady = Promise.resolve();
                export const averages = new Map();
                export const getAtlasAverage = (name) => averages.get(name) ?? null, getTileColors = () => [], getTileMask = () => null;
                export const loadPackImage = async () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 36, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const THREE = await import('three');
const R = await import('../src/blocks/BlockRegistry.js');
const { getBlockId, isSolidId, isPassableId, AIR_ID } = R;
const { ITEM_TYPES, itemExists } = await import('../src/items/ItemRegistry.js');
const { getFood } = await import('../src/items/foods.js');
const { SHRUB_NAMES, shrubType } = await import('../src/blocks/shrubs.js');
const M = await import('../src/world/animals/Hedgehog.js');
const { Hedgehog, HEDGEHOG, HEDGEHOG_FOODS, hedgehogVariant, hedgehogNight, HEDGEHOG_VARIANT_WEIGHTS } = M;
const { HEDGEHOG_PARTS, HEDGEHOG_VARIANTS } = await import('../src/rendering/HedgehogModelData.js');
const { hedgehogPose, HEDGEHOG_STRIDE } = await import('../src/rendering/HedgehogRenderer.js');
const G = await import('../src/game/Hedgehogs.js');
const { Hedgehogs, hedgehogHome, findLeafCell } = G;
const { buildShrub } = await import('../src/world/shrubs/ShrubShapes.js');
const { World } = await import('../src/world/World.js');
const { Player } = await import('../src/player/Player.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { BUSH_SPEED_FACTOR } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);
const root = new URL('../', import.meta.url);
const manifest = textureManifest();
const PX = 1 / 16;


// --- Model ------------------------------------------------------------------

{
    check(Object.keys(HEDGEHOG_PARTS).join() === 'body,nose,legFrontRight,legBackRight,legBackLeft,legFrontLeft', 'Sześć części modelu Kamila');
    const bounds = (part) => {
        const p = HEDGEHOG_PARTS[part].positions, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
        return { min, max, size: max.map((value, k) => value - min[k]) };
    };
    const body = bounds('body'), nose = bounds('nose');
    check(body.size.map((v) => Math.round(v * 16)).join() === '5,5,8', 'Korpus 5 x 5 x 8 px');
    check(nose.size.map((v) => Math.round(v * 16)).join() === '3,1,1' && nose.min[2] >= body.max[2] - 1e-6, 'Pyszczek 3 x 1 x 1 px z przodu (+z)');
    for (const leg of ['legFrontRight', 'legBackRight', 'legBackLeft', 'legFrontLeft']) {
        const b = bounds(leg);
        check(b.size.map((v) => Math.round(v * 16)).join() === '1,2,1' && Math.abs(b.min[1]) < 1e-6, `${leg}: łapka 1 x 2 x 1 px stoi na ziemi`);
    }
    check(bounds('legFrontRight').min[2] > 0 && bounds('legBackRight').max[2] < 0, 'Przednie łapki z przodu, tylne z tyłu');
    for (const [name, part] of Object.entries(HEDGEHOG_PARTS)) {
        check(part.positions.length === 24 * 3 && part.uvs.length === 24 * 2 && part.indices.length === 36, `${name}: 6 ścian`);
        check(part.uvs.every((value) => value >= 0 && value <= 1), `${name}: UV w kafelku`);
        // Ściany patrzą na zewnątrz.
        const center = [0, 1, 2].map((k) => (bounds(name).min[k] + bounds(name).max[k]) / 2);
        let outward = true;
        for (let i = 0; i < part.indices.length; i += 3) {
            const p = [0, 1, 2].map((j) => new THREE.Vector3().fromArray(part.positions, part.indices[i + j] * 3));
            const normal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
            const middle = p[0].clone().add(p[1]).add(p[2]).divideScalar(3).sub(new THREE.Vector3(...center));
            outward &&= normal.dot(middle) > 0;
        }
        check(outward, `${name}: ściany na zewnątrz`);
    }
    near(HEDGEHOG_PARTS.body.pivot[1], 2 * PX, 'Kość korpusu na wysokości 2 px');
    near(HEDGEHOG_PARTS.nose.pivot[2], 4 * PX, 'Kość pyszczka z przodu korpusu');
    check(HEDGEHOG.size[2] >= body.size[2] && HEDGEHOG.size[1] >= body.max[1], 'Pudełko do celowania obejmuje model');
}


// --- Tekstury wariantów -------------------------------------------------------

{
    check(HEDGEHOG_VARIANTS.join() === 'brown,dark,sandy,albino' && HEDGEHOG_VARIANT_WEIGHTS.map(([name]) => name).join() === HEDGEHOG_VARIANTS.join(), 'Cztery warianty');
    const source = decodeTexturePng(readFileSync(new URL('tools/wzorce/jezyk/jezyk.png', root)));
    const lum = (image) => {
        let sum = 0;
        for (let i = 0; i < image.rgba.length; i += 4) sum += 0.299 * image.rgba[i] + 0.587 * image.rgba[i + 1] + 0.114 * image.rgba[i + 2];
        return sum / (image.rgba.length / 4);
    };
    const tex = Object.fromEntries(HEDGEHOG_VARIANTS.map((name) => [name, readTextureRegion(`mob_hedgehog_${name}`)]));
    for (const name of HEDGEHOG_VARIANTS) check(manifest.tiles[`mob_hedgehog_${name}`] && tex[name].width === 16 && tex[name].height === 16, `${name}: kafelek 16 x 16`);
    check(tex.brown.rgba.equals(source.rgba), 'Brązowy: rysunek Kamila piksel w piksel');
    check(lum(tex.dark) < lum(tex.brown) - 25 && lum(tex.sandy) > lum(tex.brown) + 15 && lum(tex.albino) > lum(tex.sandy) + 25, 'Ciemny < brązowy < piaskowy < albinos');
    // Oczy: tam, gdzie w rysunku są ciemne piksele; u albinosa czerwone.
    let eyes = 0, red = 0, same = 0;
    for (let i = 0; i < source.rgba.length; i += 4) {
        if (Math.max(source.rgba[i], source.rgba[i + 1], source.rgba[i + 2]) >= 60) continue;
        eyes++;
        if (tex.albino.rgba[i] > 120 && tex.albino.rgba[i + 1] < 80) red++;
        if (tex.dark.rgba[i] === source.rgba[i] && tex.sandy.rgba[i + 2] === source.rgba[i + 2]) same++;
    }
    check(eyes >= 3 && red === eyes && same === eyes, `Oczy i nos zostają (albinos - czerwone): ${eyes} pikseli`);
}

{
    let total = 0;
    for (const [, weight] of HEDGEHOG_VARIANT_WEIGHTS) total += weight;
    near(total, 1, 'Wagi wariantów sumują się do 1');
    check(hedgehogVariant(0) === 'brown' && hedgehogVariant(0.6) === 'dark' && hedgehogVariant(0.9) === 'sandy' && hedgehogVariant(0.99) === 'albino', 'Losowanie wariantu');
    check(hedgehogNight(0.9) && hedgehogNight(0.1) && !hedgehogNight(0.5) && !hedgehogNight(0.3) && !hedgehogNight(0.7), 'Noc jeża: od zmierzchu do świtu');
    check(!hedgehogNight(0.78, 0.03) && hedgehogNight(0.81, 0.03), 'Śpioch wstaje później');
}


// --- Zachowanie ---------------------------------------------------------------

const STONE = getBlockId('stone'), WATER = getBlockId('water');
const LEAF = getBlockId(shrubType('raspberry', 'leaves'));

function land(heightAt = () => 9, extra = new Map()) {
    return {
        extra,
        getBlockId(x, y, z) {
            const special = extra.get(`${x},${y},${z}`);
            if (special !== undefined) return special;
            return y <= heightAt(x, z) ? STONE : AIR_ID;
        }
    };
}

function randomFrom(seed) {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

function hedgehog(world, options = {}) {
    return new Hedgehog(world, { id: 1, home: { x: 0, y: 10, z: 0 }, random: randomFrom(options.seed ?? 7), ...options });
}

const run = (h, seconds, env, each = null) => {
    for (let t = 0; t < seconds; t += 0.05) { h.update(0.05, env); each?.(h); }
};
const NIGHT = { timeOfDay: 0.9, winter: false, players: [] };
const DAY = { timeOfDay: 0.5, winter: false, players: [] };

{
    const h = hedgehog(land());
    run(h, 30, DAY);
    check(h.state === 'sleep' && h.curl === 1 && h.x === 0.5 && h.z === 0.5 && !h.awake, 'W dzień śpi zwinięty w domu');

    const seen = new Set();
    let far = 0, lowest = Infinity;
    run(h, 240, NIGHT, () => { seen.add(h.state); far = Math.max(far, Math.hypot(h.x - 0.5, h.z - 0.5)); lowest = Math.min(lowest, h.y); });
    check(seen.has('walk') && seen.has('sniff') && seen.has('idle') && !seen.has('sleep') && !seen.has('curl'), `Nocą żeruje: ${[...seen].join(', ')}`);
    check(far > 2.5 && far <= HEDGEHOG.range + 1, `Trzyma się domu (najdalej ${far.toFixed(1)} z ${HEDGEHOG.range})`);
    check(lowest === 10 && h.y === 10 && h.curl === 0, 'Chodzi po ziemi, rozwinięty');
    check(h.events.includes('wake'), 'Zdarzenie pobudki');

    run(h, 90, DAY);
    check(h.state === 'sleep' && h.atHome && h.x === 0.5 && h.z === 0.5, 'O świcie wraca do domu i zasypia');

    // Zima: sen zimowy, nawet w nocy.
    const winter = hedgehog(land());
    run(winter, 60, { ...NIGHT, winter: true });
    check(winter.state === 'sleep' && winter.hibernating, 'Zimą śpi także w nocy');
    run(winter, 5, NIGHT);
    check(winter.awake && !winter.hibernating, 'Wiosną budzi się o zmierzchu');
    // Zima zastaje go na żerze: wraca i zasypia.
    run(winter, 40, NIGHT);
    run(winter, 90, { ...NIGHT, winter: true });
    check(winter.state === 'sleep' && winter.atHome, 'Gdy przychodzi zima, wraca do domu');
}

{
    // Człowiek.
    const world = land();
    const awake = () => { const h = hedgehog(world); h.enter('idle', 1); h.curl = 0; h.events.length = 0; return h; };
    const person = (h, dx, speed, food = false) => ({ ...NIGHT, players: [{ id: 'p', x: h.x + dx, y: h.y, z: h.z, speed, food }] });

    let h = awake();
    run(h, 0.5, person(h, 2.5, 5));
    check(h.state === 'curl' && h.events.includes('curl'), 'Biegnący człowiek 2,5 bloku obok: kulka');
    run(h, 1, person(h, 2.5, 5));
    check(h.curl === 1, 'Zwija się w ułamku sekundy');
    run(h, 10, person(h, 2.5, 5));
    check(h.state === 'curl', 'Póki ktoś biega obok, zostaje kulką');
    run(h, HEDGEHOG.curlMin + HEDGEHOG.calm + 0.5, NIGHT);
    check(h.state !== 'curl' && h.awake, 'Po chwili spokoju się rozwija');

    h = awake();
    run(h, 3, person(h, 2.5, 1.2));
    check(h.state === 'watch' && h.curl === 0, 'Skradający się człowiek: przystaje i patrzy, nie zwija się');
    const facing = Math.atan2(2.5, 0);
    check(Math.abs(Math.sin(h.yaw - facing)) < 0.2, 'Patrzy na człowieka');
    run(h, 1, person(h, 0.6, 1.2));
    check(h.state === 'curl', 'Na wyciągnięcie ręki nie znosi żadnego ruchu');

    h = awake();
    run(h, 3, person(h, 6, 5));
    check(h.state !== 'curl', 'Biegnący daleko (6 bloków) go nie płoszy');

    // Trącenie: kulka, żadnej krzywdy.
    h = awake();
    h.hit();
    check(h.state === 'curl' && h.timer === HEDGEHOG.hitCurl && !('health' in h) && !('dead' in h), 'Trącony zwija się - nie ma zdrowia ani śmierci');
    run(h, HEDGEHOG.hitCurl + HEDGEHOG.calm + 1, NIGHT);
    check(h.awake && h.state !== 'curl', 'Po trąceniu wraca do swoich spraw');

    // Jedzenie z ręki.
    h = awake();
    const feeder = { id: 'p', x: h.x + 5, y: h.y, z: h.z, speed: 0, food: true };
    const env = { ...NIGHT, players: [feeder] };
    let approached = false;
    run(h, 12, env, () => { approached ||= h.state === 'approach'; });
    const gap = Math.hypot(feeder.x - h.x, feeder.z - h.z);
    check(approached && h.state === 'beg' && gap <= HEDGEHOG.feedDistance + 0.05 && gap > 0.5, `Czuje jagody: podchodzi i czeka przy ręce (${gap.toFixed(2)} bloku)`);
    check(h.canEat('raspberry') && h.canEat('blueberry') && !h.canEat('stone') && !h.canEat('bread'), 'Je jagody, nie kamienie');
    h.feed();
    check(h.state === 'eat' && h.fed === 1 && h.trust === HEDGEHOG.trust && h.events.includes('eat') && !h.canEat('raspberry'), 'Je z ręki');
    run(h, HEDGEHOG.eat + 0.2, env);
    check(h.state !== 'eat', 'Zjadł');
    // Zaufanie: biegnący karmiciel już go nie płoszy.
    run(h, 2, { ...NIGHT, players: [{ ...feeder, x: h.x + 2, speed: 6, food: false }] });
    check(h.state !== 'curl', 'Po karmieniu ufa - nie zwija się przed biegnącym');
    h.hit();
    check(h.trust === 0 && h.state === 'curl', 'Trącenie kończy zaufanie');
    // Z jagodami, ale biegiem - nie podchodzi.
    h = awake();
    run(h, 1, { ...NIGHT, players: [{ id: 'p', x: h.x + 3, y: h.y, z: h.z, speed: 6, food: true }] });
    check(h.state === 'curl', 'Jagody w ręce biegnącego nie pomagają');
    const asleep = hedgehog(world);
    check(!asleep.canEat('raspberry'), 'Śpiącego się nie karmi');
    for (const item of HEDGEHOG_FOODS) check(itemExists(item) && getFood(item), `${item}: jedzenie jeżyka jest jadalnym przedmiotem`);
}


// --- Teren --------------------------------------------------------------------

{
    const walker = (world, x = 0.5, z = 0.5) => { const h = hedgehog(world, { x, y: 10, z }); h.enter('idle', 1); h.curl = 0; h.yaw = Math.PI / 2; return h; };
    const walk = (h, seconds) => { let ok = true; for (let t = 0; t < seconds; t += 0.05) { ok = h.step(HEDGEHOG.walk, 0.05) && ok; h.settle(0.05); } return ok; };

    let h = walker(land((x) => (x >= 2 ? 10 : 9)));
    check(walk(h, 4) && h.x > 2 && h.y === 11, 'Wchodzi na próg jednego bloku');
    h = walker(land((x) => (x >= 2 ? 11 : 9)));
    walk(h, 5);
    check(h.x < 2 && h.y === 10, 'Dwóch bloków nie pokona');
    h = walker(land((x) => (x >= 2 ? 7 : 9)));
    check(walk(h, 4) && h.x > 2 && h.y === 8, 'Schodzi dwa bloki w dół');
    h = walker(land((x) => (x >= 2 ? 3 : 9)));
    walk(h, 5);
    check(h.x < 2 && h.y === 10, 'Nad urwiskiem zawraca');
    const pond = new Map();
    for (let z = -3; z <= 3; z++) pond.set(`2,9,${z}`, WATER);
    h = walker(land(() => 9, pond));
    walk(h, 5);
    check(h.x < 2, 'Do wody nie wchodzi');
    const hedge = new Map();
    for (let z = -3; z <= 3; z++) for (let y = 10; y <= 11; y++) hedge.set(`2,${y},${z}`, LEAF);
    h = walker(land(() => 9, hedge));
    check(walk(h, 5) && h.x > 3 && h.y === 10, 'Przez liście krzewu przechodzi jak przez powietrze');
    const wall = new Map();
    for (let z = -3; z <= 3; z++) for (let y = 10; y <= 11; y++) wall.set(`2,${y},${z}`, STONE);
    h = walker(land(() => 9, wall));
    walk(h, 5);
    check(h.x < 2, 'Przez mur nie przejdzie');

    // Nocne żerowanie na pagórkach i przy stawie: nigdy w wodzie ani w skale.
    const pondWorld = new Map();
    for (let x = 3; x <= 6; x++) for (let z = -6; z <= 6; z++) pondWorld.set(`${x},9,${z}`, WATER);
    const rough = land((x, z) => 9 + ((x * 7 + z * 13) % 5 === 0 ? 1 : 0), pondWorld);
    for (const seed of [1, 2, 3, 4]) {
        const roamer = hedgehog(rough, { seed, home: { x: 0, y: 10 + (0 % 5 === 0 ? 1 : 0), z: 0 } });
        let bad = 0, far = 0;
        run(roamer, 200, NIGHT, () => {
            // (Na próg wspina się płynnie, więc patrzymy na grunt, do którego zmierza.)
            const cx = Math.floor(roamer.x), cz = Math.floor(roamer.z), ground = roamer.ground ?? Math.floor(roamer.y);
            if (rough.getBlockId(cx, ground, cz) !== AIR_ID || rough.getBlockId(cx, ground - 1, cz) !== STONE || Math.abs(roamer.y - ground) > 1) bad++;
            far = Math.max(far, Math.hypot(roamer.x - 0.5, roamer.z - 0.5));
        });
        check(bad === 0 && far > 1.5, `Żer na nierównym terenie przy wodzie (ziarno ${seed}): zawsze na lądzie, odszedł na ${far.toFixed(1)}`);
        run(roamer, 120, DAY);
        check(roamer.state === 'sleep' && roamer.atHome, `Ziarno ${seed}: wraca do domu`);
    }
}


// --- Pozy ---------------------------------------------------------------------

{
    const h = hedgehog(land());
    h.state = 'walk'; h.curl = 0; h.moving = true;
    h.stride = HEDGEHOG_STRIDE / 4;
    let pose = hedgehogPose(h);
    near(Math.abs(pose.legs[0].rotX), 25 * Math.PI / 180, 'Chód: łapka wychyla się o 25 stopni');
    check(Math.sign(pose.legs[0].rotX) === -Math.sign(pose.legs[1].rotX) && Math.sign(pose.legs[0].rotX) === Math.sign(pose.legs[2].rotX) && Math.sign(pose.legs[1].rotX) === Math.sign(pose.legs[3].rotX), 'Łapki pracują na przemian po przekątnej');
    near(pose.body.y, 0.08 * PX, 'Korpus podskakuje o 0,08 px');
    h.stride = HEDGEHOG_STRIDE;
    near(hedgehogPose(h).legs[0].rotX, 0, 'Po pełnym cyklu łapki wracają');
    h.moving = false; h.state = 'sniff'; h.clock = 0.1125;
    pose = hedgehogPose(h);
    check(pose.body.rotX < 0 && pose.nose.z > 0.07 * PX && pose.nose.y > 0.04 * PX, 'Węszenie: przód w górę, pyszczek krąży do przodu');
    h.state = 'sleep'; h.curl = 1; h.clock = 0;
    pose = hedgehogPose(h);
    check(pose.legs.every((leg) => leg.scaleY < 0.1) && pose.nose.scale < 0.2 && pose.body.y < -1.5 * PX && pose.body.rotX === 0, 'Kulka: łapki i pyszczek schowane, korpus na ziemi');
    h.clock = 3.4 / 4;
    check(hedgehogPose(h).body.scaleY > pose.body.scaleY + 0.02, 'Śpiący oddycha');
}


// --- Liście krzewów: do przejścia ------------------------------------------------

{
    for (const species of SHRUB_NAMES) {
        const id = getBlockId(shrubType(species, 'leaves')), fruit = getBlockId(shrubType(species, 'fruit', 0));
        check(isSolidId(id) && isPassableId(id) && isPassableId(fruit), `${species}: liście i owoce do przejścia (dalej "stałe" dla reszty gry)`);
    }
    check(!isPassableId(getBlockId('shrub_elderberry_stem')) && isPassableId(getBlockId('shrub_aronia_stem')), 'Pień bzu twardy, pędy aronii do przejścia');
    check(!isPassableId(STONE) && !isPassableId(getBlockId('oak_leaves')) && !isPassableId(AIR_ID), 'Liście drzew i zwykłe bloki bez zmian');
    const world = { getBlockId: (x) => (x === 1 ? LEAF : x === 2 ? STONE : AIR_ID) };
    check(World.prototype.collisionBoxes.call(world, 1, 0, 0) === null && World.prototype.collisionBoxes.call(world, 2, 0, 0) !== null && World.prototype.collisionBoxes.call(world, 0, 0, 0) === null, 'Kolizja gracza: liście krzewu puste, kamień pełny');
    // Gracz w liściach: cały, do połowy, wcale.
    const body = (leafCells) => {
        const fake = { pos: { x: 0.5, y: 10, z: 0.5 }, height: 1.8, world: { getBlockId: (x, y) => (leafCells.includes(y) ? LEAF : AIR_ID) } };
        return Player.prototype.updateBush.call(fake);
    };
    near(body([10, 11]), 1, 'Gracz cały w krzewie');
    near(body([10]), 1 / 1.8, 'Gracz po pas w krzewie', 1e-9);
    near(body([]), 0, 'Gracz poza krzewem');
    check(BUSH_SPEED_FACTOR > 0.2 && BUSH_SPEED_FACTOR < 0.7, 'W krzewie gracz wyraźnie zwalnia, ale idzie');
}


// --- Domy i gospodarz ----------------------------------------------------------

{
    let homes = 0, total = 0;
    const variants = new Set();
    for (let seed = 1; seed <= 4000; seed++) {
        const shrub = { seed: Math.imul(seed, 2654435761) >>> 0, shape: buildShrub('raspberry', 0, seed, 0.7) };
        total++;
        const home = hedgehogHome(shrub);
        if (!home) continue;
        homes++;
        variants.add(home.variant);
        check(JSON.stringify(hedgehogHome(shrub)) === JSON.stringify(home), 'Ten sam krzew - ten sam jeżyk');
        check(shrub.shape.blocks.some(([dx, dy, dz]) => dx === home.dx && dz === home.dz && dy === 0), 'Dom w kolumnie krzewu przy ziemi');
        if (homes > 400) break;
    }
    check(homes / total > 0.2 && homes / total < 0.4, `Jeżyk mieszka w co trzecim krzewie (${homes}/${total})`);
    check(variants.has('brown') && variants.has('dark') && variants.has('sandy'), 'Różne kolory');
    check(hedgehogHome({ seed: 5, shape: buildShrub('raspberry', 0, 5, 0.1) }) === null, 'W pojedynczym bloku nikt nie mieszka');

    const cells = new Map([['3,10,3', LEAF], ['3,11,3', LEAF]]);
    const world = land(() => 9, cells);
    check(JSON.stringify(findLeafCell(world, 3, 10, 3)) === '{"x":3,"y":10,"z":3}' && findLeafCell(world, 4, 10, 3) === null, 'Dom to najniższy blok liści kolumny');
}

{
    // Gospodarz jeżyków na sztucznym świecie z "generatorem" krzewów.
    const cells = new Map();
    const world = land(() => 9, cells);
    const shrubList = [];
    for (let i = 0; i < 40; i++) {
        const seed = Math.imul(i + 1, 2654435761) >>> 0;
        const shrub = { x: i * 12 - 60, y: 10, z: 5, seed, species: 'raspberry', variety: 0, size: 0.7, shape: buildShrub('raspberry', 0, seed, 0.7) };
        for (const [dx, dy, dz] of shrub.shape.blocks) cells.set(`${shrub.x + dx},${10 + dy},${shrub.z + dz}`, LEAF);
        shrubList.push(shrub);
    }
    world.generator = { shrubs: { forEachShrub: (x0, z0, x1, z1, callback) => { for (const shrub of shrubList) if (shrub.x >= x0 && shrub.x <= x1 && shrub.z >= z0 && shrub.z <= z1) callback(shrub); } } };
    const events = [], removed = [];
    const game = {
        world, player: { pos: new THREE.Vector3(0.5, 10, 0.5) }, time: { days: 10.5 }, selectedBlock: null, mode: 'adventure',
        achieve: (name, data) => events.push([name, data]),
        inventory: { remove: (type, count) => removed.push([type, count]) },
        camera: { position: new THREE.Vector3(), getWorldDirection: (out) => out.set(1, 0, 0) }
    };
    const hedgehogs = new Hedgehogs(game);
    hedgehogs.update(0.05);
    const expected = shrubList.filter((shrub) => hedgehogHome(shrub) && Math.abs(shrub.x) < 40).length;
    check(expected >= 1 && hedgehogs.list.length === Math.min(expected, 10), `Przy graczu pojawiają się lokatorzy krzewów (${hedgehogs.list.length})`);
    check(hedgehogs.list.every((h) => h.state === 'sleep' && isPassableId(world.getBlockId(h.home.x, h.home.y, h.home.z)) && h.y === h.home.y), 'W dzień śpią w liściach swojego krzewu');
    const count = hedgehogs.list.length;
    for (let i = 0; i < 100; i++) hedgehogs.update(0.05);
    check(hedgehogs.list.length === count, 'Kolejne przeszukania niczego nie dublują');

    // Noc: wychodzą.
    game.time.days = 10.9;
    for (let i = 0; i < 20 * 40; i++) hedgehogs.update(0.05);
    check(hedgehogs.list.some((h) => h.awake) && hedgehogs.stats().count === count, 'Nocą żerują');

    // Kliknięcia: stawiamy jeżyka przed kamerą.
    const target = hedgehogs.list[0];
    target.x = 2.5; target.y = 10; target.z = 0.5; target.enter('idle', 5); target.curl = 0;
    game.camera.position.set(0.5, 10.2, 0.5);
    check(hedgehogs.hit(game.camera, null)?.hedgehog === target, 'Celownik trafia w jeżyka');
    check(hedgehogs.hit(game.camera, { hit: true, distance: 1 }) === null, 'Blok bliżej niż jeżyk go zasłania');
    game.selectedBlock = 'raspberry';
    check(hedgehogs.interact({ breakPressed: false, placePressed: true, terrainHit: null }) === true && target.state === 'eat', 'PPM z malinami: je');
    check(removed.length === 1 && removed[0].join() === 'raspberry,1' && events.some(([name, data]) => name === 'hedgehogFed' && data.item === 'raspberry'), 'Malina znika z ekwipunku, osiągnięcie dostaje zdarzenie');
    check(hedgehogs.interact({ breakPressed: true, placePressed: false, terrainHit: null }) === true && target.state === 'curl', 'LPM: zwija się w kulkę');
    check(hedgehogs.list.includes(target), 'Po uderzeniu dalej żyje');
    game.selectedBlock = 'stone';
    target.enter('idle', 5);
    check(hedgehogs.interact({ breakPressed: false, placePressed: true, terrainHit: null }) === true && target.state === 'idle' && removed.length === 1, 'PPM z kamieniem: nic, ale blok nie staje w jeżyku');
    check(hedgehogs.interact({ breakPressed: false, placePressed: false, terrainHit: null }) === false, 'Bez kliknięcia - nic');
    game.camera.getWorldDirection = (out) => out.set(-1, 0, 0);
    check(hedgehogs.interact({ breakPressed: true, placePressed: false, terrainHit: null }) === false, 'Kliknięcie obok jeżyka idzie do świata');
    for (let i = 0; i < 5; i++) hedgehogs.update(0.05);
    check(events.some(([name]) => name === 'hedgehogMet'), 'Spotkanie z bliska - zdarzenie');

    // Dom wycięty i gracz daleko: lokator znika; gracz daleko - wszyscy znikają.
    const loner = hedgehogs.list.find((h) => h !== target);
    if (loner) {
        for (const key of [...cells.keys()]) if (key.startsWith(`${loner.home.x},`) && key.endsWith(`,${loner.home.z}`)) cells.delete(key);
    }
    game.player.pos.set(500, 10, 500);
    for (let i = 0; i < 60; i++) hedgehogs.update(0.05);
    check(hedgehogs.list.length === 0, 'Gdy gracz odejdzie, jeżyki znikają');
    game.player.pos.set(0.5, 10, 0.5);
    for (let i = 0; i < 60; i++) hedgehogs.update(0.05);
    check(hedgehogs.list.length >= 1 && (!loner || !hedgehogs.list.some((h) => h.home.x === loner.home.x && h.home.z === loner.home.z)), 'Po powrocie wracają - prócz tego, któremu wycięto krzew');
    hedgehogs.dispose();
    check(hedgehogs.list.length === 0, 'Sprzątanie');
}


// --- Osiągnięcia i dźwięki ------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    for (const id of ['hedgehog_met', 'hedgehog_fed', 'hedgehog_albino']) check(byId[id] && ITEM_TYPES[byId[id].icon], `Osiągnięcie ${id}`);
    check(byId.hedgehog_albino.when({ variant: 'albino' }) && !byId.hedgehog_albino.when({ variant: 'brown' }), 'Albinos tylko za albinosa');
    check(!ACHIEVEMENTS.some((entry) => /zabij|upoluj|mięs/i.test(`${entry.title} ${entry.task}`) && /jeż/i.test(entry.task)), 'Żadne osiągnięcie nie nagradza krzywdy jeżyka');
    for (const name of ['hedgehog_sniff', 'hedgehog_eat', 'hedgehog_curl']) {
        check(SOUNDS[name]?.files.length === 2 && SOUNDS[name].distance.max <= 16, `${name}: cichy dźwięk w świecie`);
        for (const file of SOUNDS[name].files) {
            const url = new URL(`assets/sounds/${file}`, root);
            check(existsSync(url) && readFileSync(url).subarray(0, 4).toString() === 'OggS', `${file} istnieje`);
        }
    }
}

console.log(`OK: jeżyk - ${checks} sprawdzeń (model i warianty, zachowanie dzień / noc / zima, człowiek, karmienie, teren, pozy, domy w krzewach, liście do przejścia).`);
