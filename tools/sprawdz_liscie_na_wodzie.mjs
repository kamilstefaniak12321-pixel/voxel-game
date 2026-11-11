// ------------------------------------------------------------
// SPRAWDZENIE LIŚCI NA WODZIE (0.88.0)
//
// - liść spadający na wodę zostaje na tafli (nie tonie na dno), płasko,
//   tuż nad falującą powierzchnią, i pływa jeszcze przez chwilę,
// - na rzece płynie z nurtem (prawie z jego prędkością), na stawie tylko
//   powoli krąży,
// - przy brzegu staje (nie wchodzi na ląd),
// - z krawędzi wodospadu spada razem z wodą i dalej pływa w sadzawce,
// - liść na suchej ziemi leży jak dotąd, owoce nie pływają.
//
// Uruchomienie: node tools/sprawdz_liscie_na_wodzie.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 35, ATLAS_TILE_SIZE = 16, ATLAS_TILES = {};
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { CubeParticles, PARTICLE_LAYOUT: L } = await import('../src/rendering/CubeParticles.js');
const { leafWater, LEAF_FLOAT_SECONDS, LEAF_DRIFT } = await import('../src/rendering/FloatingLeaves.js');
const { WATER_SOURCE_ID, fallingWaterId, waterIdForLevel } = await import('../src/blocks/water.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { WATER_SURFACE } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const STONE = getBlockId('stone');
check(STONE > 0, 'Kamień w rejestrze');

// Świat z mapy bloków: dno y = 9, woda y = 10 (źródła), nurt na rzece.
function makeWorld({ flow = null } = {}) {
    const blocks = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const world = {
        set(x, y, z, id) { blocks.set(key(x, y, z), id); },
        getBlockId(x, y, z) { return blocks.get(key(x, y, z)) ?? 0; },
        isSolid(x, y, z) { return world.getBlockId(x, y, z) === STONE; },
        getWaterFlow(x, y, z) { return flow ? flow(x, y, z) : (world.getBlockId(x, y, z) === WATER_SOURCE_ID ? [0, 0] : null); }
    };
    return world;
}

const scene = new THREE.Scene();
function leaves() {
    const particles = new CubeParticles(scene, { capacity: 50, surfaceLighting: true, flat: 0.05, water: leafWater, sprites: [['h'.repeat(6)].concat(Array(5).fill('hhhhhh'))] });
    return particles;
}
function drop(particles, x, y, z, floats = true) {
    particles.emit({ position: new THREE.Vector3(x, y, z), velocity: new THREE.Vector3(0, -0.2, 0), life: 12, size: 0.23,
        fade: 0.12, colors: new THREE.Color(0.2, 0.5, 0.1), gravity: 0.9, drag: 2.2, spin: 1.6, collide: true, floats });
}
const field = (particles, name, index = 0) => particles.data[index * L.STRIDE + L[name]];
function run(particles, world, seconds, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) particles.update(step, world);
}

// --- Staw: liść zostaje na tafli -------------------------------------------

{
    const world = makeWorld();
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) { world.set(x, 9, z, STONE); world.set(x, 10, z, WATER_SOURCE_ID); }
    const particles = leaves();
    drop(particles, 0.5, 13, 0.5);
    drop(particles, 0.5, 13, 0.5, false);
    run(particles, world, 8);
    check(particles.count === 2, 'Oba liście jeszcze są');
    const y = field(particles, 'PY'), sunk = field(particles, 'PY', 1);
    check(field(particles, 'RESTING') === 2, 'Liść na wodzie pływa (nie leży na dnie)');
    check(Math.abs(y - (10 + WATER_SURFACE)) < 0.08, `Na tafli (y ${y.toFixed(3)} ≈ ${(10 + WATER_SURFACE).toFixed(3)})`);
    check(field(particles, 'RESTING', 1) === 1 && Math.abs(sunk - 10) < 0.05, 'Bez pływania (np. owoc) - opada na dno jak dotąd');
    const life = field(particles, 'LIFE') - field(particles, 'AGE');
    check(life > LEAF_FLOAT_SECONDS[0] - 8 - 0.5 && field(particles, 'LIFE') > 12, `Pływa dłużej niż leciałby (zostało ${life.toFixed(1)} s)`);
    const x0 = field(particles, 'PX'), z0 = field(particles, 'PZ');
    run(particles, world, 4);
    const moved = Math.hypot(field(particles, 'PX') - x0, field(particles, 'PZ') - z0);
    check(moved < 0.6, `Na stawie tylko powoli krąży (${moved.toFixed(2)} bloku w 4 s)`);
    // Fala: wysokość zmienia się w czasie (jak tafla w shaderze).
    const heights = [];
    for (let i = 0; i < 20; i++) { (await import('../src/rendering/PlantWind.js')).plantWindUniforms.uTime.value = i * 0.3; run(particles, world, 1 / 30); heights.push(field(particles, 'PY')); }
    check(Math.max(...heights) - Math.min(...heights) > 0.02, 'Kołysze się z falami tafli');
    run(particles, world, LEAF_FLOAT_SECONDS[1] + 2);
    check(particles.count === 0, 'Po chwili liść znika pod wodą');
}

// --- Rzeka: z nurtem, przy brzegu staje --------------------------------------

{
    const speed = 1.6;
    const world = makeWorld({ flow: (x, y, z) => world.getBlockId(x, y, z) === WATER_SOURCE_ID ? [speed, 0] : null });
    // Rzeka x -10..-1, z 0..2, a od x = 0 brzeg (kamień nad wodą).
    for (let x = -10; x <= 12; x++) for (let z = -1; z <= 3; z++) {
        world.set(x, 9, z, STONE);
        if (x <= -1 && z >= 0 && z <= 2) world.set(x, 10, z, WATER_SOURCE_ID); else world.set(x, 10, z, STONE);
    }
    const particles = leaves();
    drop(particles, -8.5, 11.4, 1.5);
    run(particles, world, 2.5);
    check(field(particles, 'RESTING') === 2, 'Liść na rzece pływa');
    const x0 = field(particles, 'PX');
    run(particles, world, 2);
    const velocity = (field(particles, 'PX') - x0) / 2;
    check(velocity > speed * LEAF_DRIFT * 0.8 && velocity < speed * 1.05, `Płynie z nurtem (${velocity.toFixed(2)} z ${speed} bloku/s)`);
    check(Math.abs(field(particles, 'PZ') - 1.5) < 0.4, 'W poprzek nurtu prawie stoi');
    run(particles, world, 6);
    const x = field(particles, 'PX');
    check(x < 0 && x > -1, `Przy brzegu staje (x ${x.toFixed(2)})`);
    check(field(particles, 'RESTING') === 2, 'Przy brzegu dalej pływa');
}

// --- Krawędź wodospadu: spada z wodą i pływa w sadzawce ----------------------

{
    const world = makeWorld({ flow: (x, y, z) => {
        const id = world.getBlockId(x, y, z);
        if (y === 14 && id === WATER_SOURCE_ID) return [2, 0];
        if (y === 10 && id === WATER_SOURCE_ID) return [1.2, 0];
        return null;
    } });
    // Górna rzeka x -6..2 (woda y = 14, skała pod spodem), od x = 3 spada
    // kolumna spadającej wody (y 11..14) do sadzawki (y = 10) x 3..12.
    for (let z = -1; z <= 3; z++) {
        for (let x = -6; x <= 2; x++) { for (let y = 9; y <= 13; y++) world.set(x, y, z, STONE); if (z >= 0 && z <= 2) world.set(x, 14, z, WATER_SOURCE_ID); }
        for (let x = 3; x <= 12; x++) { world.set(x, 9, z, STONE); world.set(x, 10, z, z >= 0 && z <= 2 ? WATER_SOURCE_ID : STONE); }
        if (z >= 0 && z <= 2) for (let y = 11; y <= 14; y++) world.set(3, y, z, fallingWaterId(15 - y));
    }
    check(world.getBlockId(3, 14, 1) !== WATER_SOURCE_ID && world.getBlockId(3, 11, 1) !== 0, 'Kolumna spadającej wody');
    const particles = leaves();
    drop(particles, -4.5, 16, 1.5);
    let fell = false, lowest = Infinity;
    for (let t = 0; t < 12; t += 1 / 30) {
        particles.update(1 / 30, world);
        if (particles.count === 0) break;
        const y = field(particles, 'PY');
        lowest = Math.min(lowest, y);
        if (y < 14 && field(particles, 'RESTING') === 0) fell = true;
    }
    check(particles.count === 1, 'Liść przetrwał spływ');
    check(fell, 'Z krawędzi spada razem z wodą');
    const y = field(particles, 'PY'), x = field(particles, 'PX');
    check(field(particles, 'RESTING') === 2 && Math.abs(y - (10 + WATER_SURFACE)) < 0.2, `W sadzawce znów pływa (y ${y.toFixed(2)})`);
    check(x > 3, `Odpłynął spod wodospadu (x ${x.toFixed(2)})`);
    check(lowest > 9.9, 'Nie przebił dna');
}

// --- Płynąca (niższa) woda i woda pod wodą -------------------------------------

{
    const world = makeWorld();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { world.set(x, 9, z, STONE); world.set(x, 10, z, waterIdForLevel(4)); }
    const particles = leaves();
    drop(particles, 0.5, 12, 0.5);
    run(particles, world, 6);
    const y = field(particles, 'PY');
    check(field(particles, 'RESTING') === 2 && y < 10 + WATER_SURFACE - 0.2 && y > 10.3, `Na płytszej, płynącej wodzie - na jej tafli (y ${y.toFixed(2)})`);
}

console.log(`OK: liście na wodzie - ${checks} sprawdzeń (pływanie, fale, nurt rzeki, brzeg, wodospad, czas).`);
