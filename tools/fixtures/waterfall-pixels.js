// Prawdziwa gra (WebGL2): scena "wodospady" z trybu programisty i pikselowe
// wodospady 0.87.0. Kolory czytane z ekranu w punktach świata (rzut kamery).
export async function run() {
    const checks = [], errors = [], measures = {};
    const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { atlasReady, atlasAveragesReady } = await import('/src/rendering/TextureAtlas.js');
    const { findScene } = await import('/src/dev/scenes.js');
    const { isFallingWaterId, waterFallDistance } = await import('/src/blocks/BlockRegistry.js');
    await atlasReady; await atlasAveragesReady;

    const width = 960, height = 720, FLOOR = 16;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'WebGL2');
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 32, farTerrain: 0, loadBudget: 1, shadows: 0,
        lightShafts: false, bounceLight: false, meteorites: false, showHand: false, viewBobbing: false,
        volumeMaster: 0, volumeMusic: 0, cloudCover: 0, fov: 60, renderScale: 100, lightingLook: 'baseline' })) settings.set(key, value);
    const input = new Proxy({ consumeMouseDelta: () => ({ x: 0, y: 0 }), consumeKeyPress: () => false, isKeyDown: () => false },
        { get: (target, name) => target[name] ?? (() => 0) });
    const info = createWorldInfo('Wodospady 0.87.0', 731, 'flat', 'developer');
    info.player = { x: .5, y: 40, z: -8.5, yaw: Math.PI, pitch: -.2, flying: true };
    const game = await Game.start(renderer, input, null, info, settings);
    game.resize(width, height);
    game.time.speed = 0; game.time.days = .5;
    game.update(1 / 60);
    const world = game.world;
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    for (let cz = -1; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) world.generateChunk(cx, cz);
    findScene('wodospady').build({ game, world, player: game.player }, { x: 0, y: FLOOR, z: 0 });
    game.player.pos.set(.5, 38, 8.5); game.player.flying = true;
    let quiet = 0;
    for (let i = 0; i < 6000 && quiet < 3; i++) {
        world.fluids.update(.12, .6, 64); world.updateMeshes(performance.now() + .6);
        const stats = world.fluids.stats(); quiet = stats.pending === 0 && stats.scans === 0 ? quiet + 1 : 0;
        if (i % 16 === 0) await pause();
    }
    check(quiet >= 3, 'Woda w scenie się ustaliła');
    world.updateMeshes(Infinity);
    // Wodospad 8 bloków: kolumna x -1..1, przed skałą (z = 13), od FLOOR+1 do FLOOR+8.
    const falls = [];
    for (let y = FLOOR + 1; y <= FLOOR + 8; y++) falls.push(waterFallDistance(world.getBlockId(0, y, 13)));
    check(falls.every((fall, i) => isFallingWaterId(world.getBlockId(0, FLOOR + 1 + i, 13)) && fall >= 1), `Spadająca woda w kolumnie (${falls.join(',')})`);
    game.waterfalls.refresh = 0;
    for (let i = 0; i < 1000; i++) {
        game.waterfalls.update(1 / 60, game.player, game.camera); game.updateWaterSurfaceEffects(1 / 60);
        if (game.waterfalls.ripples.stats().queued === 0 && i > 20) break;
        if (i % 16 === 0) await pause();
    }
    check(game.waterfalls.ripples.surface.entries.some(entry => Math.abs(entry.x - .5) < 1.6 && entry.fall === 8), 'Dół wodospadu 8 bloków znaleziony (piana na tafli)');

    const gl = renderer.getContext();
    const pixels = new Uint8Array(width * height * 4);
    async function draw(eye, target, seconds = 0) {
        const frames = Math.max(3, Math.round(seconds * 20));
        for (let frame = 0; frame < frames; frame++) {
            game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]);
            game.update(seconds > 0 ? seconds / frames : 1 / 60);
            game.scene.fog.near = 200; game.scene.fog.far = 400;
            game.camera.position.set(...eye); game.camera.lookAt(...target); game.camera.updateMatrixWorld();
            game.render(); await pause();
        }
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        check(gl.getError() === gl.NO_ERROR, 'Bez błędów WebGL');
        check(!(renderer.info.programs ?? []).some(program => program.diagnostics?.runnable === false), 'Shadery skompilowane');
        return pixels.slice();
    }
    const point = new THREE.Vector3();
    function colorAt(image, x, y, z) {
        point.set(x, y, z).project(game.camera);
        const sx = Math.floor((point.x + 1) / 2 * width), sy = Math.floor((point.y + 1) / 2 * height);
        if (sx < 0 || sy < 0 || sx >= width || sy >= height || point.z > 1) return null;
        const at = (sy * width + sx) * 4;
        return [image[at] / 255, image[at + 1] / 255, image[at + 2] / 255];
    }
    // Próbki w środkach minipikseli (16 na blok) prostokąta na boku / tafli.
    function samples(image, x0, x1, y0, y1, z, flat = false, offset = .5) {
        const out = [];
        for (let a = Math.ceil(x0 * 16); a < x1 * 16; a++) for (let b = Math.ceil(y0 * 16); b < y1 * 16; b++) {
            const u = (a + offset) / 16, v = (b + offset) / 16;
            const color = flat ? colorAt(image, u, z, v) : colorAt(image, u, v, z);
            if (color) out.push(color);
        }
        return out;
    }
    const luma = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
    const mean = list => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);

    async function measure() {
        const eye = [.5, FLOOR + 4.6, 4.5], target = [.5, FLOOR + 3.8, 13];
        const first = await draw(eye, target);
        // Kolumna: górny blok (tuż pod krawędzią) i dwa dolne bloki.
        const top = samples(first, -.9, 1.9, FLOOR + 8.05, FLOOR + 8.95, 13);
        const bottom = samples(first, -.9, 1.9, FLOOR + 1.1, FLOOR + 2.9, 13);
        check(top.length > 300 && bottom.length > 600, `Kolumna w kadrze (${top.length}/${bottom.length} próbek)`);
        const topLuma = mean(top.map(luma)), bottomLuma = mean(bottom.map(luma));
        // Piana = wyraźnie jaśniej niż ciemna woda u góry (jasność zależy od
        // pory dnia i strony świata, więc próg względny).
        const foamLevel = Math.max(.25, topLuma * 1.9);
        const bright = list => list.filter(color => luma(color) > foamLevel).length / list.length;
        const blue = list => list.filter(([r, g, b]) => b > r + .08 && luma([r, g, b]) < foamLevel).length / list.length;
        measures.foamLevel = foamLevel;
        Object.assign(measures, { topLuma, bottomLuma, topBright: bright(top), bottomBright: bright(bottom), bottomBlue: blue(bottom) });
        check(bottomLuma > topLuma + .12, `Niżej więcej piany (jasność ${topLuma.toFixed(2)} → ${bottomLuma.toFixed(2)})`);
        check(bright(top) < .25, `Góra - ciemna woda w smugach (${(bright(top) * 100).toFixed(0)}% jasnych)`);
        check(bright(bottom) > .35 && bright(bottom) < .92, `Dół - piana z kreskami (${(bright(bottom) * 100).toFixed(0)}% jasnych)`);
        check(blue(bottom) > .08, `W pianie turkusowe/niebieskie kreski (${(blue(bottom) * 100).toFixed(0)}%)`);
        // Ostre minipiksele: dwa punkty w tym samym minipikselu - ten sam kolor.
        const a = samples(first, -.9, 1.9, FLOOR + 1.1, FLOOR + 6.9, 13, false, .3);
        const b = samples(first, -.9, 1.9, FLOOR + 1.1, FLOOR + 6.9, 13, false, .7);
        const same = a.filter((color, i) => b[i] && color.every((value, k) => Math.abs(value - b[i][k]) < 3 / 255)).length / a.length;
        measures.crisp = same;
        check(same > .8, `Ostre minipiksele 16 na blok (${(same * 100).toFixed(0)}% zgodnych)`);
        // Ruch: po pół sekundy smugi są gdzie indziej, skała nie.
        const later = await draw(eye, target, .5);
        const moved = mean(samples(later, -.9, 1.9, FLOOR + 1.1, FLOOR + 6.9, 13, false, .3)
            .map((color, i) => Math.abs(luma(color) - luma(a[i] ?? color))));
        const rockBefore = samples(first, 2.05, 2.95, FLOOR + 2, FLOOR + 6, 14), rockAfter = samples(later, 2.05, 2.95, FLOOR + 2, FLOOR + 6, 14);
        const rockMoved = mean(rockAfter.map((color, i) => Math.abs(luma(color) - luma(rockBefore[i] ?? color))));
        Object.assign(measures, { moved, rockMoved });
        check(moved > .04 && rockMoved < .02, `Woda płynie w dół, skała stoi (${moved.toFixed(3)} / ${rockMoved.toFixed(3)})`);
        // Piana na tafli przed wodospadem; dalej w sadzawce zwykła woda.
        const pool = await draw([.5, FLOOR + 6, 6.5], [.5, FLOOR + .5, 12]);
        const surface = FLOOR + .875;
        const near = samples(pool, -.4, 1.4, 12.05, 12.9, surface, true), far = samples(pool, -1.9, 2.9, 7.2, 8.8, surface, true);
        // Piana jest biała (mało nasycona), woda - niebieska.
        const white = list => list.filter(color => {
            const high = Math.max(...color), low = Math.min(...color);
            return high > .25 && (high - low) / high < .3;
        }).length / list.length;
        Object.assign(measures, { poolFoam: white(near), poolFar: white(far) });
        check(near.length > 100 && far.length > 100, 'Tafla w kadrze');
        check(white(near) > .3, `Biała piana pod wodospadem (${(white(near) * 100).toFixed(0)}% białych)`);
        check(white(far) < .1, `Dalej w sadzawce bez plamy piany (${(white(far) * 100).toFixed(0)}% białych)`);
        check(errors.length === 0, `Bez błędów gry (${errors.join(' | ')})`);
        return measures;
    }
    return { measure, check, checks, errors, measures, draw, samples, luma, mean, FLOOR,
        report: () => ({ checks, measures, errors }), stop: () => game.stop({ save: false }) };
}
