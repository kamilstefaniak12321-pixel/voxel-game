// Real Game at sequoia-height viewpoints, isolated from user saves.
export async function run() {
    const checks = [], errors = [], captures = [], performanceSamples = [];
    const check = (value, message) => { if (!value) throw Error(message); checks.push(message); };
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { viewUniforms } = await import('/src/rendering/viewUniforms.js');
    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.info.autoReset = false; renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    const settings = new Settings();
    const quality = { viewDistance: 800, farTerrain: 1024, farDetail: 2, loadBudget: 10,
        meteorites: false, lightShafts: false, bounceLight: false, showHand: false,
        shadows: 3, cloudCover: 0, lightingModel: 'world', lightingLook: 'natural',
        viewBobbing: false, volumeMusic: 0, leafModel: 'parts', fancyLeaves: true,
        plantWind: false, plantModels: 'semi', fov: 70, renderScale: 100,
        fallingLeaves: false, windStreaks: false, performanceLogs: false };
    for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const game = await Game.start(renderer, input, null, createWorldInfo('Kontrola lasu 0.86', 42, 'realistic', 'developer'), settings);
    game.resize(width, height); game.player.flying = true; game.time.speed = 0; game.time.days = .43;
    settings.onChange(key => game.applySettings(key));
    const eye = [4762, 132, -4750], target = [4810, 47, -4945];
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]);
    for (let frame = 0; frame < 720; frame++) {
        game.update(0);
        game.camera.position.set(...eye); game.camera.lookAt(...target);
        if (frame % 20 === 0) game.render();
        await pause();
    }
    check(game.world.chunks.size > 30, 'Actual forest chunks loaded');
    check(game.farTerrain.stats().shown > 0, 'Far terrain has visible geometry');
    check(game.farTerrain.stats().missing === 0, 'Far terrain finished loading');
    async function capture(name) {
        const currentEye = name.includes('side') ? [4762, 148, -4750] : eye;
        const currentTarget = name.includes('side') ? [4930, 48, -4790] : target;
        const prior = viewUniforms.uDistanceLodEnabled.value;
        game.update(0); game.camera.position.set(...currentEye); game.camera.lookAt(...currentTarget);
        if (name.endsWith('no-lod') || name === 'high-near-only') viewUniforms.uDistanceLodEnabled.value = 0;
        const farRender = game.farTerrain.render;
        const skyRender = game.sky.render;
        if (name.startsWith('high-mask')) game.sky.render = () => {
            const saved = renderer.getClearColor(new THREE.Color()).clone();
            renderer.setClearColor(0xff00ff); renderer.clear(); renderer.setClearColor(saved);
        };
        if (name === 'high-near-only') game.farTerrain.render = () => {};
        try {
            for (let i = 0; i < 4; i++) { game.render(); await pause(); }
            const gl = renderer.getContext();
            check(gl.getError() === gl.NO_ERROR, name + ': no WebGL error');
            check(!(renderer.info.programs ?? []).some(p => p.diagnostics?.runnable === false), name + ': shaders compiled');
            let uncoveredSkyPixels = null;
            if (name.startsWith('high-mask')) {
                const pixels = new Uint8Array(width * height * 4);
                gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                uncoveredSkyPixels = 0;
                // The lower half of both downward views contains terrain only.
                // readPixels starts at the bottom, unlike the PNG coordinates.
                for (let y = 0; y < height / 2; y++) for (let x = 0; x < width; x++) {
                    const at = (y * width + x) * 4;
                    if (pixels[at] > 220 && pixels[at + 1] < 40 && pixels[at + 2] > 220) uncoveredSkyPixels++;
                }
            }
            captures.push({ name, eye: currentEye, target: currentTarget, uncoveredSkyPixels,
                triangles: renderer.info.render.triangles,
                calls: renderer.info.render.calls, lod: viewUniforms.uDistanceLodEnabled.value,
                far: game.farTerrain.stats() });
        } finally {
            viewUniforms.uDistanceLodEnabled.value = prior;
            game.farTerrain.render = farRender;
            game.sky.render = skyRender;
        }
    }
    async function benchmark() {
        const gl = renderer.getContext();
        renderer.setSize(1920, 1080); game.resize(1920, 1080);
        for (const effects of [false, true]) {
            const effectSettings = { lightShafts: effects, bounceLight: effects, plantWind: effects,
                fallingLeaves: effects, windStreaks: effects };
            for (const [key, value] of Object.entries(effectSettings)) settings.set(key, value);
            const values = [];
            for (let frame = 0; frame < 360; frame++) {
                const start = performance.now();
                game.update(1 / 60); game.camera.position.set(...eye); game.camera.lookAt(...target);
                game.render(); gl.finish();
                if (frame >= 60) values.push(performance.now() - start);
                await pause();
            }
            const sorted = [...values].sort((a, b) => a - b);
            performanceSamples.push({ effects, frames: values.length, resolution: [1920, 1080],
                frameWorkMs: { mean: values.reduce((a, b) => a + b, 0) / values.length,
                    median: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)], max: sorted.at(-1) },
                method: 'Unpaced Game.update + render + gl.finish; loaded natural world, hidden native window',
                presentedFpsMeasured: false, quality: { ...quality, ...effectSettings }, eye, target,
                chunks: game.world.chunks.size, far: game.farTerrain.stats(),
                triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });
        }
        check(gl.getError() === gl.NO_ERROR, '1080p benchmark: no WebGL error');
        renderer.setSize(width, height); game.resize(width, height);
    }
    return { capture, benchmark,
        report() {
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, errors, captures, performanceSamples, resolution: [width, height], quality,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
        },
        async stop() { await game.stop({ save: false }); renderer.dispose(); console.error = originalError; }
    };
}
