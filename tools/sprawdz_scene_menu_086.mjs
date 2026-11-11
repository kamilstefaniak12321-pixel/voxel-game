// Keep the showcase tied to the actual generator: natural waterfalls,
// modern tree species and camera paths clear of solid blocks and foliage.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
    return next(url, url.endsWith('.js') && url.includes('/src/') ? { ...context, format: 'module' } : context);
} });
const { MENU_SCENE } = await import('../src/menu/menuScene.js');
const { MenuCamera } = await import('../src/menu/MenuCamera.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { CHUNK_SIZE } = await import('../src/config.js');
const { isSolidId, isLeavesId, getBlockTypeById } = await import('../src/blocks/BlockRegistry.js');
const generator = new RealisticGenerator(MENU_SCENE.seed), chunks = new Map();
let checks = 0, clearanceSamples = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function block(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), key = `${cx},${cz}`;
    if (!chunks.has(key)) {
        const chunk = new Chunk(cx, cz); generator.generateChunk(chunk); chunks.set(key, chunk);
    }
    return chunks.get(key).getId(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
}
const names = Object.keys(MENU_SCENE.views);
function clear(position, label) {
    clearanceSamples++;
    for (const dx of [-.4, 0, .4]) for (const dy of [-.6, 0, .6]) for (const dz of [-.4, 0, .4]) {
        const p = [position[0] + dx, position[1] + dy, position[2] + dz], id = block(...p);
        if (isSolidId(id) || isLeavesId(id)) throw Error(`${label}: camera clearance at ${p.map(v => v.toFixed(2))}, found ${getBlockTypeById(id)}`);
    }
}
for (const from of names) for (const to of names) {
    const camera = new MenuCamera(MENU_SCENE.views, from);
    camera.goTo(to);
    for (let frame = 0; frame < 120; frame++) {
        camera.update(1 / 30);
        clear(camera.position, `${from} → ${to}`);
    }
    camera.goTo(from); camera.update(.1); camera.goTo(to);
    for (let frame = 0; frame < 30; frame++) { camera.update(.1); clear(camera.position, `redirect ${from} → ${to}`); }
    check(true, `${from} → ${to} is clear, including reversal`);
}
let randomState = 7781, switches = 0;
const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296);
for (let run = 0; run < 80; run++) {
    const camera = new MenuCamera(MENU_SCENE.views); let nextSwitch = 0;
    for (let frame = 0; frame < 15 * 60; frame++) {
        if (frame >= nextSwitch) {
            camera.goTo(names[Math.floor(random() * names.length)]);
            nextSwitch = frame + Math.floor(5 + random() * 110); switches++;
        }
        camera.update(1 / 60);
        if (frame % 2 === 0) clear(camera.position, `interrupted run ${run}, frame ${frame}`);
    }
    check(true, `Interrupted route ${run} is clear`);
}
for (const fall of MENU_SCENE.waterfalls) {
    const found = generator.rivers.waterfalls(fall.x, fall.z, 16);
    check(found.some(item => item.x === fall.x && item.z === fall.z && item.top === fall.top && item.bottom === fall.bottom),
        `Natural waterfall ${fall.top} → ${fall.bottom} belongs to the unchanged generator`);
}
const species = new Set();
for (let gz = 34; gz <= 76; gz++) for (let gx = -208; gx <= -168; gx++) {
    const tree = generator.forests.treeAt(gx, gz); if (tree) species.add(tree.species);
}
check(species.has('ginkgo') && species.has('maple'), 'Warm forest contains natural ginkgo and maple');
check(species.has('oak') && species.has('beech') && species.has('birch'), 'Neutral forest contains diverse green species');
console.log(`OK: menu scenery — ${checks} route/generator/species checks, ${clearanceSamples} clearance samples, ${switches} interruptions, ${chunks.size} actual chunks.`);
