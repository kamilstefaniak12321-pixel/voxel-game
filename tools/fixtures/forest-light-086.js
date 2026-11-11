// Real Game + generated mature forest. No user saves, no mocked renderer.
export async function run() {
    const checks = [], errors = [], captures = [];
    const check = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { isLeavesId, isOpaqueId } = await import('/src/blocks/BlockRegistry.js');
    const { Chunk } = await import('/src/world/Chunk.js');
    const { LightEngine: BaselineLight } = await import('/src/world/BaselineLight.js');
    const { lightingUniforms } = await import('/src/rendering/LightingDiagnostics.js');
    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.info.autoReset = false; renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    const settings = new Settings();
    const quality = { viewDistance: 128, farTerrain: 1024, farDetail: 2, loadBudget: 12,
        meteorites: false, lightShafts: false, bounceLight: false, showHand: false, shadows: 3,
        cloudCover: 0, lightingModel: 'world', lightingLook: 'natural', viewBobbing: false,
        volumeMusic: 0, leafModel: 'parts', fancyLeaves: true, plantWind: false,
        fallingLeaves: false, windStreaks: false, performanceLogs: false };
    for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const game = await Game.start(renderer, input, null, createWorldInfo('Transmisja lasu QA', 42, 'realistic', 'developer'), settings);
    game.resize(width, height); game.player.flying = true; game.time.speed = 0; game.time.days = .43;
    settings.onChange(key => game.applySettings(key));
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    game.player.pos.set(4762, 60, -4750);
    for (let frame = 0; frame < 500; frame++) { game.update(0); if (frame % 30 === 0) game.render(); await pause(); }
    // Choose the same natural location in A/B using the real 0.85 transport.
    // A dense overhead crown alone is insufficient: a nearby clearing can
    // already supply enough lateral light, masking the original defect.
    const priorChunks = new Map();
    const priorWorld = { getChunk: (x, z) => priorChunks.get(`${x},${z}`) };
    for (let cz = -301; cz <= -293; cz++) for (let cx = 293; cx <= 301; cx++) {
        const original = game.world.getChunk(cx, cz);
        if (!original) continue;
        const chunk = new Chunk(cx, cz); chunk.blocks = original.blocks; chunk.maxY = original.maxY;
        priorChunks.set(`${cx},${cz}`, chunk);
    }
    for (const chunk of priorChunks.values()) {
        chunk.west = priorWorld.getChunk(chunk.cx - 1, chunk.cz) ?? null; chunk.east = priorWorld.getChunk(chunk.cx + 1, chunk.cz) ?? null;
        chunk.north = priorWorld.getChunk(chunk.cx, chunk.cz - 1) ?? null; chunk.south = priorWorld.getChunk(chunk.cx, chunk.cz + 1) ?? null;
    }
    const priorLight = new BaselineLight(priorWorld);
    for (const chunk of priorChunks.values()) priorLight.initChunk(chunk);
    let candidate = null;
    for (let z = -4780; z <= -4720; z++) for (let x = 4732; x <= 4792; x++) {
        let layers = 0, lowestLeaf = 128;
        for (let y = 110; y > 20; y--) {
            const id = game.world.getBlockId(x, y, z);
            if (isLeavesId(id)) { layers++; lowestLeaf = y; }
            else if (isOpaqueId(id)) {
                if (layers >= 3 && lowestLeaf > y + 8 && y < 65 && !game.world.getBlockId(x, y + 1, z)) {
                    const baselineSky = priorLight.getLight(x, y + 2, z).sky;
                    const predictedSky = Math.round(15 * (.72 * .9 ** (layers - 1)) ** (1 / 2.64));
                    const score = predictedSky - baselineSky + (lowestLeaf - y) * .001;
                    if (!candidate || score > candidate.score) candidate = { x, y, z, layers, lowestLeaf, baselineSky, predictedSky, score };
                }
                break;
            }
        }
    }
    priorChunks.clear();
    check(candidate, 'Found genuine generated forest with tall multi-layer crown');
    const eye = [candidate.x + .5, candidate.y + 2.6, candidate.z + .5];
    const target = [eye[0] + 12, eye[1] - .8, eye[2] - 20];
    game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]);
    let cave = false;
    async function capture(name) {
        if (name === 'cave' && !cave) {
            const cx = Math.floor(eye[0]), cy = Math.floor(eye[1]), cz = Math.floor(eye[2]);
            for (let y = cy - 2; y <= cy + 3; y++) for (let z = cz - 4; z <= cz + 4; z++) for (let x = cx - 4; x <= cx + 4; x++) {
                const chunk = game.world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
                if (!chunk) continue;
                const solid = y === cy - 2 || y === cy + 3 || x === cx - 4 || x === cx + 4 || z === cz - 4 || z === cz + 4;
                game.world.setBlock(x, y, z, solid ? 'stone' : null);
            }
            for (let frame = 0; frame < 120; frame++) { game.update(0); await pause(); }
            cave = true;
        }
        settings.set('leafTransmission', !name.includes('tint-off'));
        game.time.days = name === 'night' ? .95 : .43;
        game.update(0); game.camera.position.set(...eye); game.camera.lookAt(...target);
        if (name === 'sources-off') {
            lightingUniforms.uLightingComponents.value.set(0, 0, 0, 0);
            lightingUniforms.uLightingLocal.value.set(0, 0);
        } else {
            lightingUniforms.uLightingComponents.value.set(1, 1, 1, 1);
            lightingUniforms.uLightingLocal.value.set(1, 1);
        }
        for (let frame = 0; frame < 6; frame++) { game.render(); await pause(); }
        const gl = renderer.getContext(), pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const sum = [0, 0, 0]; let count = 0;
        for (let y = 100; y < 300; y++) for (let x = 320; x < 960; x++) {
            const at = (y * width + x) * 4; count++;
            for (let c = 0; c < 3; c++) sum[c] += pixels[at + c];
        }
        const light = { ...game.world.light.getLight(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2])) };
        if (name === 'cave') check(light.sky === 0, 'Enclosed cave blocks filtered skylight');
        else check(light.sky < 15, name + ': under-canopy SKY is filtered (baseline may be zero)');
        check(gl.getError() === gl.NO_ERROR, name + ': no WebGL error');
        check(!(renderer.info.programs ?? []).some(p => p.diagnostics?.runnable === false), name + ': shaders compiled');
        const lowerCenterRgb = sum.map(value => value / count);
        const day = captures.find(capture => capture.name === 'day-tint-on');
        if (day && ['sources-off', 'night', 'cave'].includes(name))
            check(lowerCenterRgb.reduce((a, b) => a + b, 0) < day.lowerCenterRgb.reduce((a, b) => a + b, 0) * .6,
                name + ': no daylight emission from foliage filter');
        captures.push({ name, eye, target, candidate, light, lowerCenterRgb,
            triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
    }
    return { capture,
        report() {
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, errors, captures, resolution: [width, height], quality,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
        },
        async stop() { await game.stop({ save: false }); renderer.dispose(); console.error = originalError; }
    };
}
