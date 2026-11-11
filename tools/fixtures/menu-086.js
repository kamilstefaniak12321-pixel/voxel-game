export async function run() {
    const checks = [], captures = [], errors = [];
    const check = (value, message) => { if (!value) throw Error(message); checks.push(message); };
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    const THREE = await import('three');
    const { MenuBackdrop } = await import('/src/menu/MenuBackdrop.js');
    const { MENU_SCENE } = await import('/src/menu/menuScene.js');
    const { Menu } = await import('/src/ui/Menu.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    const { applyPlantModelLevel } = await import('/src/rendering/PlantModelLevels.js');
    await atlasReady;
    const settings = new Settings();
    for (const [key, value] of Object.entries({ shadows: 2, cloudCover: 10, lightShafts: true,
        bounceLight: true, volumeMusic: 0, fallingLeaves: true, windStreaks: true, plantWind: true,
        lightingModel: 'world', lightingLook: 'natural', menuMotion: 'full', renderScale: 100,
        leafModel: 'parts', fancyLeaves: true, plantModels: 'semi' })) settings.set(key, value);
    applyPlantModelLevel('semi');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(innerWidth, innerHeight); renderer.info.autoReset = false;
    document.body.prepend(renderer.domElement);
    const backdrop = new MenuBackdrop(renderer, settings);
    const menu = new Menu(document.querySelector('#menu'), 'Voxel Game', {
        onSceneView: name => backdrop.setView(name), openWorldList: () => menu.showWorlds([])
    }, settings, {});
    menu.showTitle(); await backdrop.start();
    const start = performance.now();
    while (!backdrop.world?.ready && performance.now() - start < 240000) {
        backdrop.update(1 / 60); await pause();
        if (backdrop.failed) throw Error('Menu backdrop failed during loading');
    }
    check(backdrop.world?.ready, 'Complete real menu world finishes loading');
    const warmupMs = performance.now() - start;
    const scene = backdrop.world, generated = scene.world.chunks.size;
    const naturalFalls = scene.world.generator.rivers.waterfalls(-752, 208, 32);
    for (const fall of MENU_SCENE.waterfalls) {
        check(naturalFalls.some(found => found.x === fall.x && found.z === fall.z && found.top === fall.top && found.bottom === fall.bottom),
            `Natural waterfall ${fall.top} to ${fall.bottom} exists at advertised coordinates`);
    }
    const endpoints = {}, performanceSamples = {};
    async function frame(dt = 1 / 60) { backdrop.update(dt); await pause(); }
    async function settle(seconds = 4) { for (let i = 0; i < seconds * 15; i++) await frame(1 / 15); }
    async function capture(name) {
        const method = { home: 'showTitle', river: 'showWorlds', forest: 'showSettings', mountains: 'showAchievements' }[name];
        if (name === 'river') menu[method]([]); else menu[method]();
        await settle();
        check(backdrop.view === name, `${name}: actual menu navigation selects camera`);
        check(scene.world.chunks.size === generated && scene.world.loadQueue.length === 0, `${name}: transition reuses preloaded terrain`);
        const target = MENU_SCENE.views[name].position;
        check(backdrop.rig.position.every((v, i) => Math.abs(v - target[i]) < .025), `${name}: smooth camera reaches intended position`);
        check(renderer.getContext().getError() === 0, `${name}: no WebGL error`);
        check(!(renderer.info.programs ?? []).some(p => p.diagnostics?.runnable === false), `${name}: effects shaders compile`);
        const stats = scene.stats();
        if (name === 'river') {
            const fall = MENU_SCENE.waterfalls.at(-1);
            const screen = new THREE.Vector3(fall.x, (fall.top + fall.bottom) / 2, fall.z).project(backdrop.camera);
            const panel = document.querySelector('.menu-scene-panel').getBoundingClientRect();
            check(screen.z > -1 && screen.z < 1 && Math.abs(screen.y) < .85,
                'Waterfall is inside the river camera view');
            check((screen.x + 1) * renderer.domElement.clientWidth / 2 > panel.right + 20 && screen.x < .95,
                'World selection panel leaves the waterfall visible');
        }
        captures.push({ name, position: backdrop.camera.position.toArray(), target: MENU_SCENE.views[name].target,
            triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, effects: stats.effects });
        endpoints[name] = stats;
        return renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    async function finish() {
        menu.showWorlds([]); await settle(2);
        menu.showTitle(); await settle(4);
        check(backdrop.rig.position.every((v, i) => Math.abs(v - MENU_SCENE.views.home.position[i]) < .025), 'Back returns to original warm forest without a camera jump');
        check(Object.values(endpoints).some(s => s.effects.leaves > 0), 'Real natural leaf emission runs in menu');
        check(Object.values(endpoints).some(s => s.effects.wind > 0), 'Real wind streaks run in menu');
        check(Object.values(endpoints).some(s => s.effects.waterfalls.ripples.emitters > 0 || s.effects.waterfalls.drops > 0), 'Real simulated waterfall produces visible effects');
        settings.set('fallingLeaves', false); settings.set('windStreaks', false); backdrop.applySettings();
        await settle(.2);
        check(scene.effects.stats().leaves === 0 && scene.effects.stats().wind === 0,
            'Menu respects disabled leaf and wind effects without retaining particles');
        settings.set('fallingLeaves', true); settings.set('windStreaks', true); backdrop.applySettings();
        await settle(2);
        check(scene.effects.stats().leaves > 0, 'Leaf effects resume after changing settings');
        const old = scene.effects;
        backdrop.stop();
        check(old.disposed && old.waterfalls.disposed && old.wetRocks.disposed, 'Leaving menu disposes particles, waterfalls and wet rocks');
        check(backdrop.world === null && !backdrop.active, 'No menu world coexists with gameplay');
    }
    async function measure(name, seconds = 6) {
        backdrop.setView(name); await settle(2);
        // Hidden Chromium windows throttle RAF to 1 Hz. Measure completed
        // production frames instead; this is rendering cost, not presented FPS.
        const gl = renderer.getContext(), times = [], submit = [], gpu = [], pendingQueries = [];
        const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        function readQueries() {
            for (let i = pendingQueries.length - 1; i >= 0; i--) {
                const query = pendingQueries[i];
                if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
                if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
                gl.deleteQuery(query); pendingQueries.splice(i, 1);
            }
        }
        const samples = seconds * 30;
        for (let i = 0; i < samples + 30; i++) {
            const query = timer ? gl.createQuery() : null;
            gl.finish();
            if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
            const begin = performance.now();
            backdrop.update(1 / 60);
            if (query) gl.endQuery(timer.TIME_ELAPSED_EXT);
            const submitted = performance.now();
            gl.finish();
            const finished = performance.now();
            await pause();
            if (i >= 30) {
                times.push(finished - begin); submit.push(submitted - begin);
                if (query) pendingQueries.push(query);
            } else if (query) gl.deleteQuery(query);
            readQueries();
        }
        for (let i = 0; pendingQueries.length && i < 60; i++) { await pause(); readQueries(); }
        for (const query of pendingQueries) gl.deleteQuery(query);
        const summary = values => {
            const sorted = [...values].sort((a, b) => a - b), percentile = p => sorted[Math.floor((sorted.length - 1) * p)] ?? null;
            return { samples: values.length, medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1) ?? null };
        };
        return performanceSamples[name] = { method: 'completed frames with gl.finish; no presentation/RAF timing',
            completed: summary(times), submitted: summary(submit), gpu: summary(gpu), over16_67Ms: times.filter(value => value > 1000 / 60).length,
            triangles: renderer.info.render.triangles, calls: renderer.info.render.calls };
    }
    let snapshot;
    async function presentSnapshot() {
        // Electron's hidden compositor can omit the WebGL layer from DOM
        // capture. Present the exact, unmodified native frame at its canvas
        // rectangle, underneath the actual menu DOM, only for the screenshot.
        const rect = renderer.domElement.getBoundingClientRect();
        snapshot = new Image(); snapshot.src = renderer.domElement.toDataURL('image/png');
        Object.assign(snapshot.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
            width: rect.width + 'px', height: rect.height + 'px', zIndex: '0', pointerEvents: 'none' });
        document.body.append(snapshot); await snapshot.decode();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    function removeSnapshot() { snapshot?.remove(); snapshot = null; }
    return { capture, finish, measure, presentSnapshot, removeSnapshot,
        report() { const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, captures, errors, warmupMs, sceneId: MENU_SCENE.id, seed: MENU_SCENE.seed,
                naturalFalls, endpoints, performanceSamples, renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) }; },
        stop() { removeSnapshot(); backdrop.dispose(); renderer.dispose(); console.error = originalError; } };
}
