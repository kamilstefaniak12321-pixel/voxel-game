// Real Game, original texture atlas and production tree geometry. Isolated world.
export async function run() {
    const checks = [], errors = [], captures = [], commands = [], performanceSamples = [], saplingSamples = [];
    const benchmarkImages = {};
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
    const { GAME_COMMANDS } = await import('/src/commands/gameCommands.js');
    const { CommandRegistry } = await import('/src/commands/CommandRegistry.js');
    const { TREE_NAMES, TREE_SPECIES } = await import('/src/blocks/trees.js');
    const { TREE_DEFINITIONS } = await import('/src/blocks/treeCatalog.js');
    const { plantTree } = await import('/src/world/trees/plantTree.js');
    const { getTreeShowcase, waitForTreeShowcase } = await import('/src/world/trees/TreeShowcase.js');
    const { PlayerModel, createPose, MODEL_PIXEL } = await import('/src/player/PlayerModel.js');
    const { getBlockDefinition, getBlockId } = await import('/src/blocks/BlockRegistry.js');
    const { PLANT_MODELS, PLANT_MODEL_ERRORS, resolvePlantModel } = await import('/src/blocks/plantModels.js');
    const { applyPlantModelLevel } = await import('/src/rendering/PlantModelLevels.js');
    const { blockRenderData } = await import('/src/rendering/BlockRenderData.js');
    await atlasReady;
    check(TREE_DEFINITIONS.length === 12, 'All twelve built-in tree definitions are available');
    check(PLANT_MODEL_ERRORS.length === 0, 'Plant quality models load without errors');
    const names = ['acacia', 'bald_cypress', 'cherry'];
    for (const name of names) check(TREE_NAMES.includes(name), `Registered species: ${name}`);
    check(MODEL_PIXEL * 32 === 1.8, 'Actual player model is 1.8 blocks tall');
    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.info.autoReset = false; // Game.render resets once, before all world/post-processing passes.
    renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'Actual Game uses WebGL2');
    const settings = new Settings();
    const quality = { viewDistance: 160, farTerrain: 0, loadBudget: 8, meteorites: false,
        lightShafts: false, bounceLight: false, showHand: false, shadows: 1, cloudCover: 0,
        lightingModel: 'world', lightingLook: 'natural', viewBobbing: false, volumeMusic: 0,
        leafModel: 'parts', fancyLeaves: true, plantWind: false, plantModels: 'semi', fov: 70, renderScale: 100 };
    for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    applyPlantModelLevel(settings.get('plantModels'));
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Skala nowych drzew 0.79.0', 42, 'flat', 'developer');
    const game = await Game.start(renderer, input, null, info, settings);
    game.resize(width, height);
    settings.onChange(key => game.applySettings(key));
    game.player.flying = true; game.time.speed = 0; game.time.days = .43;
    game.world.setDistanceLod(false);
    const registry = new CommandRegistry();
    for (const command of GAME_COMMANDS) registry.register(command);
    const messages = [];
    const context = { game, world: game.world, player: game.player, sky: game.sky, time: game.time,
        commands: registry, chat: { print(text, kind) { messages.push({ text, kind }); } } };
    const pause = () => new Promise(resolve => setTimeout(resolve, 0));
    async function command(line) {
        const start = performance.now(), initial = messages.length;
        const result = registry.execute(line.replace(/^\//, ''), context);
        check(result.ok, `${line}: accepted by real command parser (${result.text})`);
        await waitForTreeShowcase(game.world);
        if (/^\/drzewa (las|warianty|porownanie|cofnij)(?: |$)/.test(line)) {
            check(messages.length > initial, `${line}: background operation reports completion`);
            check(messages.at(-1).kind !== 'error', `${line}: ${messages.at(-1).text}`);
        }
        commands.push({ line, milliseconds: +(performance.now() - start).toFixed(2), text: result.text });
        return result;
    }
    const specimens = [];
    const markers = [];
    for (let index = 0; index < names.length; index++) {
        const species = names[index], x = -200 + index * 36, z = -32;
        game.world.ensureColumnLoaded(x, z);
        const y = game.world.getGroundY(x, z);
        const shape = plantTree(game.world, x, y, z, species, 12345, .75);
        check(!!shape, `${species}: adult tree fits on real ground`);
        check(shape.blocks.every(([dx, dy, dz, type]) => game.world.getBlock(x + dx, y + dy, z + dz) === type), `${species}: every generated block is present across chunk borders`);
        const foliage = shape.blocks.filter(block => getBlockDefinition(block[3])?.part === 'leaves');
        const xs = foliage.map(cell => cell[0]), zs = foliage.map(cell => cell[2]);
        const crown = { x: Math.max(...xs) - Math.min(...xs) + 1, z: Math.max(...zs) - Math.min(...zs) + 1 };
        const marker = new PlayerModel(); marker.setPose(createPose());
        marker.place(new THREE.Vector3(x + 3.5, y, z + 4.5), Math.PI * .85); marker.setHeldBlock(null);
        game.scene.add(marker.object); markers.push(marker);
        specimens.push({ species, x, y, z, height: shape.top + 1, crown, blocks: shape.blocks.length, label: TREE_SPECIES[species].species[0] });
    }
    const cypress = specimens.find(tree => tree.species === 'bald_cypress');
    check(cypress.height >= 28, 'Adult bald cypress exceeds the old 28-block tree ceiling');
    check(cypress.height > 2 * specimens.find(tree => tree.species === 'cherry').height, 'Bald cypress visibly dwarfs the ornamental cherry');
    game.world.loadAround(-164, -32, 9);
    game.player.pos.set(-164, specimens[0].y, 10); game.update(0); game.world.updateMeshes();
    async function draw(eye, target) {
        game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]); game.player.yaw = 0; game.player.pitch = 0;
        game.update(0); game.world.updateMeshes();
        for (let frame = 0; frame < 4; frame++) {
            game.camera.position.set(...eye); game.camera.lookAt(...target); game.render(); await pause();
        }
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, 'No WebGL error after rendering');
        check(!(renderer.info.programs ?? []).some(program => program.diagnostics?.runnable === false), 'All active shaders compiled');
        check(errors.length === 0, 'No game or console errors');
    }
    async function capture(name) {
        let eye, target, specimen = null;
        if (name === 'comparison') {
            const ground = specimens[0].y;
            eye = [-164, ground + 18, 30]; target = [-164, ground + 14, -32];
        } else {
            const species = names.find(id => name.startsWith(id + '-'));
            specimen = specimens.find(tree => tree.species === species);
            if (!specimen) throw Error(`Unknown view: ${name}`);
            const { x, y, z, height } = specimen;
            if (name.endsWith('-base')) {
                eye = [x + 5, y + 1.6, z + 10]; target = [x + 1, y + 4, z + 1];
            } else if (name.endsWith('-ground')) {
                eye = [x + 3, y + 1.6, z + (species === 'bald_cypress' ? 11 : 9)];
                target = [x, y + Math.min(14, height * .56), z];
            } else {
                const distance = Math.max(height * 1.38, Math.max(specimen.crown.x, specimen.crown.z) * 1.65);
                eye = [x + distance * .3, y + height * .38, z + distance];
                target = [x, y + height * .45, z];
            }
        }
        document.querySelector('#qa-title').textContent = specimen ? specimen.label : 'Akacja, cypryśnik i wiśnia — obok postać gracza 1,8 m';
        const eyeLevel = name.endsWith('-ground') || name.endsWith('-base');
        document.querySelector('#qa-command').textContent = eyeLevel ? 'Oczy na wysokości 1,6 bloku, pole widzenia 70°' : 'Rzeczywiste bloki i model gracza w skali 1:1';
        await draw(eye, target);
        captures.push({ name, eye, target, eyeHeightAboveGround: eyeLevel ? 1.6 : null,
            fov: game.camera.fov, actualPlayerModelHeight: 1.8, specimen,
            triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls });
    }
    async function finishChecks() {
        game.player.pos.set(-480, 18, 0); game.player.yaw = 0;
        const list = await command('/drzewa lista');
        for (const name of names) check(list.text.includes(TREE_SPECIES[name].species[0]), `${name}: listed by command`);
        for (const name of names) {
            game.player.pos.set(-480, 18, 0); game.player.yaw = 0;
            await command(`/drzewa warianty ${name} 12345`);
            const job = getTreeShowcase(game.world);
            check(job.placed.length >= 5, `${name}: all size and texture variant specimens placed`);
            for (const tree of job.placed) {
                check(tree.shape.blocks.every(([dx, dy, dz, type]) => game.world.getBlockId(tree.x + dx, tree.y + dy, tree.z + dz) === getBlockId(type)), `${tree.label}: full generated geometry present`);
            }
            const journal = [...job.journal];
            await command('/drzewa cofnij');
            check(journal.every(cell => game.world.getBlockId(cell.x, cell.y, cell.z) === cell.before), `${name}: undo restores original blocks`);
        }
        game.player.pos.set(-480, 18, 0); game.player.yaw = 0;
        await command('/drzewa porownanie 12345');
        check(getTreeShowcase(game.world).placed.length === TREE_NAMES.length, 'Comparison includes every old and new tree species');
        await command('/drzewa cofnij');
    }
    async function captureSaplings() {
        const positions = names.map((species, index) => ({ species, x: -482 + index * 2, z: -8 }));
        for (const point of positions) {
            game.world.ensureColumnLoaded(point.x, point.z);
            point.y = game.world.getGroundY(point.x, point.z);
            game.world.setBlock(point.x, point.y, point.z, point.species + '_sapling');
        }
        const y = positions[0].y;
        const marker = new PlayerModel(); marker.setPose(createPose()); marker.setHeldBlock(null);
        marker.place(new THREE.Vector3(-476, y, -8), Math.PI); game.scene.add(marker.object); markers.push(marker);
        game.world.loadAround(-480, -8, 3);
        const eye = [-480, y + 1.6, -2], target = [-480, y + .6, -8];
        for (const level of ['simple', 'semi', 'detailed']) {
            settings.set('plantModels', level); applyPlantModelLevel(level); game.world.remeshPlants();
            for (const point of positions) {
                const type = point.species + '_sapling';
                const stage = PLANT_MODELS.flatMap(model => model.stages).find(stage => stage.type === type);
                check(!!stage, `${type}: has dedicated plant quality model`);
                check(resolvePlantModel(stage, level, { sprite: true }) === level, `${type}: uses requested ${level} quality`);
                const data = blockRenderData[getBlockId(type)];
                check(level === 'simple' ? !!data.cross : !!data.riverPlant, `${type}: active renderer data for ${level}`);
            }
            await draw(eye, target);
            let vertices = 0;
            for (const chunk of game.world.chunks.values()) {
                if (Math.abs(chunk.cx * 16 + 480) <= 24 && Math.abs(chunk.cz * 16 + 8) <= 24) {
                    vertices += chunk.plantMesh?.geometry?.attributes?.position?.count ?? 0;
                }
            }
            check(vertices > 0, `${level}: actual scene generates sapling mesh vertices`);
            saplingSamples.push({ level, vertices, positions, drawCalls: renderer.info.render.calls,
                triangles: renderer.info.render.triangles });
        }
        document.querySelector('#qa-title').textContent = 'Sadzonki akacji, cypryśnika i wiśni przy graczu 1,8 m';
        document.querySelector('#qa-command').textContent = 'Sprawdzone modele: prosty, półrealistyczny i szczegółowy; na kadrze szczegółowy';
        captures.push({ name: 'saplings-detailed', eye, target, actualPlayerModelHeight: 1.8,
            eyeHeightAboveGround: 1.6, fov: game.camera.fov });
        check(new Set(saplingSamples.map(sample => sample.vertices)).size > 1, 'Quality changes real sapling geometry');
    }
    async function benchmark() {
        const gl = renderer.getContext();
        renderer.setSize(1920, 1080); game.resize(1920, 1080);
        const benchmarkQuality = { ...quality, shadows: 3, lightShafts: true, bounceLight: true };
        for (const [key, value] of Object.entries(benchmarkQuality)) settings.set(key, value);
        applyPlantModelLevel(benchmarkQuality.plantModels); game.world.remeshPlants();
        const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
        const benchOrigin = [-800, 18, 0];
        for (const species of ['pine', 'bald_cypress']) {
            game.player.pos.set(...benchOrigin); game.player.yaw = 0;
            await command(`/drzewa las ${species} 36 12345`);
            const job = getTreeShowcase(game.world);
            check(job.placed.length === 36, `${species}: all 36 benchmark trees planted`);
            game.world.loadAround(-800, -60, 9);
            const eye = [-800, 29, 24], target = [-800, 28, -60];
            await draw(eye, target);
            const frame = () => {
                game.update(1 / 60); game.camera.position.set(...eye); game.camera.lookAt(...target); game.render(); gl.finish();
            };
            for (let index = 0; index < 40; index++) { frame(); await pause(); }
            const work = [];
            for (let index = 0; index < 180; index++) {
                // A hidden native window may not receive requestAnimationFrame.
                // Measure submitted CPU+GPU work directly, without presenting it
                // as desktop FPS or mixing in background-window scheduling.
                await pause();
                const start = performance.now();
                frame(); work.push(performance.now() - start);
            }
            performanceSamples.push({ species, count: 36, resolution: [1920, 1080], frames: work.length,
                frameWorkMs: { mean: work.reduce((a, b) => a + b, 0) / work.length, median: percentile(work, .5), p95: percentile(work, .95), max: Math.max(...work) },
                triangles: renderer.info.render.triangles, calls: renderer.info.render.calls,
                eye, target, quality: benchmarkQuality, warmed: true, presentedFpsMeasured: false,
                method: 'Unpaced Game.update + render + gl.finish; preloaded flat world, hidden native window' });
            check(renderer.info.render.triangles > 10000, `${species}: benchmark renders actual forest geometry`);
            benchmarkImages[species] = renderer.domElement.toDataURL('image/png').split(',')[1];
            await command('/drzewa cofnij');
        }
        renderer.setSize(width, height); game.resize(width, height);
    }
    return {
        capture, finishChecks, captureSaplings, benchmark,
        benchmarkImage(name) { return benchmarkImages[name]; },
        report() {
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, errors, captures, commands, specimens, saplingSamples, performanceSamples,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                resolution: [width, height], quality, syntheticWorld: true, originalPlayerModel: true,
                actualPlayerHeight: 1.8, eyeHeight: 1.6 };
        },
        async stop() { for (const marker of markers) marker.dispose(); await game.stop({ save: false }); renderer.dispose(); }
    };
}
