// Prawdziwa gra (WebGL2): pięć drzew 0.83.0 obok postaci gracza 1,8 m,
// ich sadzonki 3D i krajobrazy pięciu nowych biomów w świecie seed 42.
export async function run() {
    const checks = [], errors = [], captures = [];
    const check = (condition, message) => { if (!condition) throw Error(message); checks.push(message); };
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    const { TREE_SPECIES } = await import('/src/blocks/trees.js');
    const { plantTree } = await import('/src/world/trees/plantTree.js');
    const { PlayerModel, createPose } = await import('/src/player/PlayerModel.js');
    const { getBlockDefinition } = await import('/src/blocks/BlockRegistry.js');
    const { PLANT_MODEL_ERRORS } = await import('/src/blocks/plantModels.js');
    const { applyPlantModelLevel } = await import('/src/rendering/PlantModelLevels.js');
    const { BIOMES } = await import('/src/world/terrain/Biomes.js');
    await atlasReady;
    check(PLANT_MODEL_ERRORS.length === 0, 'Modele roślin bez błędów');
    const names = ['maple', 'mugo', 'olive', 'rainbow_eucalyptus', 'sequoia'];
    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.info.autoReset = false;
    renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'WebGL2');
    const settings = new Settings();
    const quality = { viewDistance: 128, farTerrain: 0, loadBudget: 8, meteorites: false,
        lightShafts: false, bounceLight: false, showHand: false, shadows: 1, cloudCover: 0,
        lightingModel: 'world', lightingLook: 'natural', viewBobbing: false, volumeMusic: 0,
        leafModel: 'parts', fancyLeaves: true, plantWind: false, plantModels: 'detailed', fov: 70, renderScale: 100,
        fallingLeaves: false, windStreaks: false };
    for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    applyPlantModelLevel(settings.get('plantModels'));
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    let game = await Game.start(renderer, input, null, createWorldInfo('Drzewa 0.83.0', 42, 'flat', 'developer'), settings);
    game.resize(width, height);
    game.player.flying = true; game.time.speed = 0; game.time.days = .43;
    game.world.setDistanceLod(false);

    // --- Pięć drzew w rzędzie --------------------------------------------
    const specimens = [];
    const xs = { maple: -230, mugo: -205, olive: -188, rainbow_eucalyptus: -166, sequoia: -136 };
    for (const species of names) {
        const x = xs[species], z = -32;
        game.world.ensureColumnLoaded(x, z);
        const y = game.world.getGroundY(x, z);
        const shape = plantTree(game.world, x, y, z, species, 2024, species === 'sequoia' ? .8 : .7);
        check(!!shape, `${species}: dorosłe drzewo mieści się na ziemi`);
        check(shape.blocks.every(([dx, dy, dz, type]) => game.world.getBlock(x + dx, y + dy, z + dz) === type), `${species}: wszystkie bloki na miejscu`);
        const marker = new PlayerModel(); marker.setPose(createPose()); marker.setHeldBlock(null);
        marker.place(new THREE.Vector3(x + (species === 'sequoia' ? 5.5 : 3.5), y, z + 5.5), Math.PI * .85);
        game.scene.add(marker.object);
        specimens.push({ species, x, y, z, height: shape.top + 1, label: TREE_SPECIES[species].species[0] });
    }
    // Sadzonki przed rzędem.
    const ground = specimens[0].y;
    for (const [index, species] of names.entries()) {
        const x = -186 + index * 2, z = 6;
        game.world.ensureColumnLoaded(x, z);
        game.world.setBlock(x, game.world.getGroundY(x, z), z, `${species}_sapling`);
    }
    game.world.loadAround(-180, -20, 8);

    async function draw(eye, target, frames = 4) {
        game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]); game.player.yaw = 0; game.player.pitch = 0;
        game.update(0); game.world.updateMeshes();
        for (let frame = 0; frame < frames; frame++) {
            game.world.updateMeshes();
            game.camera.position.set(...eye); game.camera.lookAt(...target); game.render(); await pause();
        }
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, 'Bez błędów WebGL');
        check(!(renderer.info.programs ?? []).some(program => program.diagnostics?.runnable === false), 'Shadery skompilowane');
        check(errors.length === 0, `Bez błędów gry (${errors.join(' | ')})`);
    }

    // --- Biomy w świecie seed 42 --------------------------------------------
    let biomes = null;
    async function openRealistic() {
        await game.stop({ save: false });
        game = await Game.start(renderer, input, null, createWorldInfo('Biomy 0.83.0', 42, 'realistic', 'developer'), settings);
        game.resize(width, height);
        game.player.flying = true; game.time.speed = 0; game.time.days = .43;
        const generator = game.world.generator;
        biomes = {};
        const wanted = Object.fromEntries(names.map(name => [Object.entries(BIOMES).find(([, b]) => Object.entries(b.trees ?? {}).sort((a, c) => c[1] - a[1])[0]?.[0] === name)[0], name]));
        for (let z = -6000; z <= 6000 && Object.keys(biomes).length < 5; z += 48) for (let x = -6000; x <= 6000; x += 48) {
            const key = generator.biomes.classify(x, z, generator.compute(x, z, 0, {}));
            if (!wanted[key] || biomes[key]) continue;
            let inside = 0;
            for (const [dx, dz] of [[24, 0], [-24, 0], [0, 24], [0, -24]]) inside += generator.biomes.classify(x + dx, z + dz, generator.compute(x + dx, z + dz, 0, {})) === key;
            if (inside >= 3) biomes[key] = { x, z, species: wanted[key] };
        }
        check(Object.keys(biomes).length === 5, `Pięć nowych biomów w świecie (${Object.keys(biomes).join(', ')})`);
    }

    async function capture(name) {
        let eye, target, title, subtitle = 'Rzeczywiste bloki i model gracza 1,8 m w skali 1:1';
        if (name === 'porownanie') {
            eye = [-183, ground + 24, 44]; target = [-183, ground + 22, -32];
            title = 'Klon, kosodrzewina, oliwka, eukaliptus tęczowy i sekwoja';
        } else if (name === 'sadzonki') {
            eye = [-182, ground + 1.6, 11]; target = [-182, ground + .5, 6];
            title = 'Sadzonki pięciu nowych drzew (model szczegółowy)';
        } else if (name.startsWith('biom-')) {
            if (!biomes) await openRealistic();
            const key = name.slice(5), spot = biomes[key];
            game.world.loadAround(spot.x, spot.z, 6);
            for (let i = 0; i < 40; i++) { game.world.updateMeshes(); await pause(); }
            const y = game.world.getGroundY(spot.x, spot.z);
            // Kamera nad koronami (las klonowy, sekwoje) albo nad krzewami.
            const view = { maple: [46, 34, 6], mugo: [20, 9, 3], olive: [30, 16, 3], rainbow_eucalyptus: [34, 22, 26], sequoia: [70, 92, 40] }[spot.species];
            eye = [spot.x - view[0], y + view[1], spot.z + view[0]];
            target = [spot.x, y + view[2], spot.z];
            game.world.loadAround(eye[0], eye[2], 4);
            for (let i = 0; i < 20; i++) { game.world.updateMeshes(); await pause(); }
            title = `${BIOMES[key].name} (/biom znajdz ${BIOMES[key].words[0]})`;
            subtitle = BIOMES[key].about;
        } else {
            const specimen = specimens.find(tree => tree.species === name);
            const { x, y, z, height } = specimen;
            if (name === 'sequoia') { eye = [x + 6, y + 1.6, z + 12]; target = [x, y + 30, z]; subtitle = 'Z ziemi - oczy na 1,6 bloku'; }
            else { const d = Math.max(10, height * 1.25); eye = [x + d * .35, y + height * .45, z + d]; target = [x, y + height * .42, z]; }
            title = specimen.label;
        }
        document.querySelector('#qa-title').textContent = title;
        document.querySelector('#qa-command').textContent = subtitle;
        await draw(eye, target, name.startsWith('biom-') ? 12 : 4);
        captures.push({ name, eye, target, triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls });
    }

    return { capture, report: () => ({ checks, captures, specimens, biomes, errors }), stop: () => game.stop({ save: false }) };
}
