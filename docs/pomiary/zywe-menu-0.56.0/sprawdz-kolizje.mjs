// Uruchom z katalogu głównego repozytorium (Node.js 24):
// node docs/pomiary/zywe-menu-0.56.0/sprawdz-kolizje.mjs
// Wyłącznie CPU: rzeczywisty generator i MenuCamera, bez WebGL i zapisów.
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const { RealisticGenerator } = await import('../../../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../../../src/world/Chunk.js');
const { CHUNK_SIZE } = await import('../../../src/config.js');
const { getBlockTypeById } = await import('../../../src/blocks/BlockRegistry.js');
const { MENU_SCENE } = await import('../../../src/menu/menuScene.js');
const { MenuCamera } = await import('../../../src/menu/MenuCamera.js');

if (MENU_SCENE.terrain !== 'realistic') {
    throw new Error('Dostosuj skrypt do generatora aktualnej scenerii.');
}
const generator = new RealisticGenerator(MENU_SCENE.seed);
const chunks = new Map();
const radius = 0.5, drift = 0.18;

function block(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
        chunk = new Chunk(cx, cz);
        generator.generateChunk(chunk);
        chunks.set(key, chunk);
    }
    return getBlockTypeById(chunk.getId(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE));
}

// Konserwatywne pudełko kamery: także drobne rośliny traktujemy jako kolizję.
function occupancy(position) {
    const hits = [];
    for (let x = Math.floor(position[0] - radius); x <= Math.floor(position[0] + radius); x++) {
        for (let y = Math.floor(position[1] - radius - drift); y <= Math.floor(position[1] + radius + drift); y++) {
            for (let z = Math.floor(position[2] - radius); z <= Math.floor(position[2] + radius); z++) {
                const type = block(x, y, z);
                if (type && type !== 'air') hits.push({ position: [x, y, z], type });
            }
        }
    }
    return hits;
}

const entries = Object.entries(MENU_SCENE.views);
const points = entries.map(([view, spec]) => ({ view, position: spec.position, hits: occupancy(spec.position) }));
const routes = [];
for (let a = 0; a < entries.length; a++) {
    for (let b = a + 1; b < entries.length; b++) {
        const [from, source] = entries[a], [to, destination] = entries[b];
        const p = source.position, q = destination.position;
        const steps = Math.max(1, Math.ceil(Math.hypot(...p.map((value, k) => q[k] - value)) * 3));
        let collision = null;
        for (let i = 0; i <= steps; i++) {
            const position = p.map((value, k) => value + (q[k] - value) * i / steps);
            const hits = occupancy(position);
            if (hits.length) { collision = { fraction: i / steps, position, hits }; break; }
        }
        routes.push({ from, to, samples: steps + 1, collision });
    }
}

let randomState = 7781;
const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
};
const names = entries.map(([name]) => name);
const collisions = [];
let switches = 0;
for (let run = 0; run < 80; run++) {
    const camera = new MenuCamera(MENU_SCENE.views);
    let nextSwitch = 0;
    for (let frame = 0; frame < 60 * 15; frame++) {
        if (frame >= nextSwitch) {
            camera.goTo(names[Math.floor(random() * names.length)]);
            nextSwitch = frame + Math.floor(5 + random() * 110);
            switches++;
        }
        camera.update(1 / 60);
        if (frame % 2 === 0) {
            const hits = occupancy(camera.position);
            if (hits.length) {
                collisions.push({ run, frame, view: camera.view, position: [...camera.position], hits });
                break;
            }
        }
    }
}

const result = {
    scene: MENU_SCENE,
    method: { radius, verticalDrift: drift, routeMaxStep: 1 / 3,
        randomSeed: 7781, runs: 80, secondsPerRun: 15, simulationFps: 60, collisionCheckEveryFrames: 2 },
    points, routes, interrupted: { switches, collisionRuns: collisions.length, collisions }
};
writeFileSync(new URL('kolizje-kamer.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
const passed = points.every(point => !point.hits.length)
    && routes.every(route => !route.collision) && collisions.length === 0;
console.log(JSON.stringify({ passed, points: points.length, routes: routes.length,
    switches, collisionRuns: collisions.length }, null, 2));
if (!passed) process.exitCode = 1;
