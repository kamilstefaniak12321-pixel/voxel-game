// Real Game, original texture atlas and production tree geometry. Isolated world.
export async function run() {
    const checks = [], errors = [], captures = [], commands = [], performanceSamples = [], saplingSamples = [];
    const benchmarkImages = {};
    const fixSamples = [], particleSamples = [], naturalSamples = [];
    let particleRenderedPixels = null;
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
    check(TREE_DEFINITIONS.length >= 12, 'All built-in tree definitions (twelve from 0.79.0 and later species) are available');
    check(PLANT_MODEL_ERRORS.length === 0, 'Plant quality models load without errors');
    const names = ['ginkgo', 'jacaranda'];
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
        leafModel: 'parts', fancyLeaves: true, plantWind: false, plantModels: 'semi', fov: 70, renderScale: 100, fallingLeaves: false, windStreaks: false };
    for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    applyPlantModelLevel(settings.get('plantModels'));
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Miłorząb i jakaranda 0.85.0', 42, 'flat', 'developer');
    let game = await Game.start(renderer, input, null, info, settings);
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
    check(specimens[0].height > specimens[1].height * 1.5, 'Mature ginkgo is substantially taller than jacaranda');
    game.world.loadAround(-182, -32, 9);
    game.player.pos.set(-182, specimens[0].y, 10); game.update(0); game.world.updateMeshes();
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
            eye = [-182, ground + 17, 25]; target = [-182, ground + 12, -32];
        } else {
            const species = names.find(id => name.startsWith(id + '-'));
            specimen = specimens.find(tree => tree.species === species);
            if (!specimen) throw Error(`Unknown view: ${name}`);
            const { x, y, z, height } = specimen;
            if (name.endsWith('-base')) {
                eye = [x + 5, y + 1.6, z + 10]; target = [x + 1, y + 4, z + 1];
            } else if (name.endsWith('-ground')) {
                eye = [x + 3, y + 1.6, z + (species === 'ginkgo' ? 11 : 9)];
                target = [x, y + Math.min(14, height * .56), z];
            } else {
                const distance = Math.max(height * 1.38, Math.max(specimen.crown.x, specimen.crown.z) * 1.65);
                eye = [x + distance * .3, y + height * .38, z + distance];
                target = [x, y + height * .45, z];
            }
        }
        document.querySelector('#qa-title').textContent = specimen ? specimen.label : 'Miłorząb i jakaranda — obok postać gracza 1,8 m';
        const eyeLevel = name.endsWith('-ground') || name.endsWith('-base');
        document.querySelector('#qa-command').textContent = eyeLevel ? 'Oczy na wysokości 1,6 bloku, pole widzenia 70°' : 'Rzeczywiste bloki i model gracza w skali 1:1';
        await draw(eye, target);
        captures.push({ name, eye, target, eyeHeightAboveGround: eyeLevel ? 1.6 : null,
            fov: game.camera.fov, actualPlayerModelHeight: 1.8, specimen,
            triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls });
    }
    async function finishChecks() {
        game.player.pos.set(-960, 18, 0); game.player.yaw = 0;
        const list = await command('/drzewa lista');
        for (const name of names) check(list.text.includes(TREE_SPECIES[name].species[0]), `${name}: listed by command`);
        for (const name of names) {
            game.player.pos.set(-960, 18, 0); game.player.yaw = 0;
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
        game.player.pos.set(-960, 18, 0); game.player.yaw = 0;
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
        document.querySelector('#qa-title').textContent = 'Sadzonki miłorzębu i jakarandy przy graczu 1,8 m';
        document.querySelector('#qa-command').textContent = 'Sprawdzone modele: prosty, półrealistyczny i szczegółowy; na kadrze szczegółowy';
        captures.push({ name: 'saplings-detailed', eye, target, actualPlayerModelHeight: 1.8,
            eyeHeightAboveGround: 1.6, fov: game.camera.fov });
        check(new Set(saplingSamples.map(sample => sample.vertices)).size > 1, 'Quality changes real sapling geometry');
    }
    async function benchmark() {
        const gl = renderer.getContext();
        renderer.setSize(1920, 1080); game.resize(1920, 1080);
        const benchmarkQuality = { ...quality, shadows: 3, lightShafts: true, bounceLight: true,
            fallingLeaves: true, windStreaks: true, plantWind: true };
        for (const [key, value] of Object.entries(benchmarkQuality)) settings.set(key, value);
        applyPlantModelLevel(benchmarkQuality.plantModels); game.world.remeshPlants();
        const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
        const benchOrigin = [-800, 18, 0];
        for (const species of ['pine', 'ginkgo', 'jacaranda']) {
            game.player.pos.set(...benchOrigin); game.player.yaw = 0;
            await command(`/drzewa las ${species} 36 12345`);
            const job = getTreeShowcase(game.world);
            check(job.placed.length === 36, `${species}: all 36 benchmark trees planted`);
            game.world.loadAround(-800, -60, 9);
            const eye = [-800, 29, 24], target = [-800, 26, -60];
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
        for (const [key, value] of Object.entries(quality)) settings.set(key, value);
    }
    async function captureFixes() {
        const { InventoryScreen } = await import('/src/ui/InventoryScreen.js');
        const { createBlockIcons } = await import('/src/ui/BlockIcons.js');
        const { awaitTorchTextures } = await import('/src/rendering/TorchMaterial.js');
        const { chestState } = await import('/src/game/ChestState.js');
        const icons = await createBlockIcons();
        const position = { x: -480, y: specimens[0].y, z: -5 };
        game.world.setBlock(position.x, position.y, position.z, 'chest');
        const chest = game.chests.ensure(position);
        chest.layers[0][0] = { type: 'ginkgo_planks', count: 5 };
        for (let slot = 0; slot < game.inventory.slots.length; slot++) game.inventory.slots[slot] = { type: 'stone', count: 64 };
        const screen = new InventoryScreen(icons, { close() { screen.close(); } });
        screen.open(game, chest);
        const before = JSON.stringify(chestState(chest)), version = game.chests.version;
        for (let repeat = 0; repeat < 5; repeat++) screen.clickChest(0, false, true);
        check(JSON.stringify(chestState(chest)) === before, 'Five Shift-clicks with full inventory preserve all five chest items');
        check(game.chests.version === version, 'Failed transfer does not mark chest dirty');
        check(!screen.cursor && !game.inventory.slots.some(slot => slot?.type === 'ginkgo_planks'), 'Failed transfer does not manufacture or move items');
        screen.update();
        fixSamples.push({ case: 'full-inventory', attempted: 5, chestCount: chest.layers[0][0].count, moved: 0, dirty: false });
        game.inventory.slots[0] = { type: 'ginkgo_planks', count: 62 };
        screen.clickChest(0, false, true);
        check(chest.layers[0][0].count === 3 && game.inventory.slots[0].count === 64, 'Partial transfer moves only the two available spaces');
        game.inventory.slots[1] = null; screen.clickChest(0, false, true);
        check(chest.layers[0][0] === null && game.inventory.slots[1].count === 3, 'Remaining three items transfer without loss');
        fixSamples.push({ case: 'partial-then-empty-slot', inventoryCount: 67, chestCount: 0 });
        screen.close(); screen.root.remove(); screen.cursorElement.remove(); screen.tooltip.remove();
        const positions = [];
        for (const [i, previous] of ['axe', 'stone', null].entries()) {
            const marker = new PlayerModel(); marker.setPose(createPose());
            marker.setHeldBlock(previous); marker.setHeldBlock('torch');
            positions.push(marker.heldTorch.position.toArray());
            marker.place(new THREE.Vector3(-484 + i * 2.5, position.y, -12), Math.PI);
            game.scene.add(marker.object); markers.push(marker);
        }
        check(positions.every(position => JSON.stringify(position) === JSON.stringify(positions[0])), 'Torch anchor is identical after axe, stone and empty hand');
        fixSamples.push({ case: 'torch-after-axe-stone-empty', positions });
        await awaitTorchTextures();
        document.querySelector('#qa-title').textContent = 'Pochodnia po siekierze, kamieniu i pustej ręce';
        document.querySelector('#qa-command').textContent = 'Trzy identyczne chwyty; pełny ekwipunek oraz częściowy transfer ze skrzyni sprawdzone';
        game.world.loadAround(-480, -12, 4);
        await draw([-481.5, position.y + 1.6, -7], [-481.5, position.y + 1, -12]);
        captures.push({ name: 'fixed-torch-grip', fixes: fixSamples });
    }
    async function captureParticles() {
        const { LEAF_SPRITES, leafSprites } = await import('/src/rendering/TreeParticles.js');
        const ground = specimens[0].y;
        game.world.loadAround(-182, 4, 3);
        // An explicit emission close to the camera makes the small sprites
        // reviewable. Production sizes, palettes, movement and material stay unchanged.
        game.treeParticles.leaves.count = 0;
        for (const [i, name] of names.entries()) {
            const id = getBlockId(name + '_leaves'), palette = game.treeParticles.palette(id, 'leaf');
            const expected = name === 'ginkgo' ? ['wachlarz'] : ['platek', 'waski'];
            const spriteNames = leafSprites(name).map(index => Object.keys(LEAF_SPRITES)[index]);
            check(JSON.stringify(spriteNames) === JSON.stringify(expected), `${name}: correct species-specific falling shape`);
            check(palette?.length > 0, `${name}: palette comes from loaded tree texture`);
            const average = palette.reduce((sum, color) => sum.map((v, index) => v + [color.r, color.g, color.b][index] / palette.length), [0, 0, 0]);
            check(name === 'ginkgo' ? average[0] > average[2] && average[1] > average[2] : average[2] > average[1], `${name}: golden/purple falling pixels`);
            const before = game.treeParticles.leaves.count;
            for (let sample = 0; sample < 20; sample++) game.treeParticles.leaf({ x: -183 + i * 2, y: ground + 3, z: 3, id });
            check(game.treeParticles.leaves.count === before + 20, `${name}: actual particle emitter accepts twenty leaves`);
            particleSamples.push({ species: name, sprites: spriteNames, averageLinearRGB: average, particles: 20, explicitCloseupEmission: true });
        }
        game.treeParticles.leaves.update(.3, game.world);
        check(game.treeParticles.leaves.mesh.count === 40, 'Both species share one instanced particle mesh');
        document.querySelector('#qa-title').textContent = 'Spadające liście miłorzębu i płatki jakarandy';
        document.querySelector('#qa-command').textContent = 'Kontrolowana emisja do podglądu — rzeczywiste rozmiary i kolory cząsteczek';
        await draw([-181.5, ground + 2.6, 7], [-181.5, ground + 2.6, 3.4]);
        // Inspect the framebuffer, not only the source palette: a bad lighting
        // sample could otherwise render perfectly valid leaf colors as black.
        const gl = renderer.getContext();
        const readPixels = () => {
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        const withLeaves = readPixels();
        game.treeParticles.leaves.mesh.visible = false; game.render();
        const withoutLeaves = readPixels();
        game.treeParticles.leaves.mesh.visible = true; game.render();
        const counts = { changed: 0, golden: 0, purple: 0, black: 0 };
        for (let i = 0; i < withLeaves.length; i += 4) {
            const [r, g, b] = withLeaves.subarray(i, i + 3);
            if (Math.abs(r - withoutLeaves[i]) + Math.abs(g - withoutLeaves[i + 1]) + Math.abs(b - withoutLeaves[i + 2]) < 24) continue;
            counts.changed++;
            if (r > 80 && g > 60 && r > b * 1.4 && g > b * 1.3) counts.golden++;
            if (b > 50 && r > 30 && b > g * 1.15) counts.purple++;
            if (r + g + b < 15) counts.black++;
        }
        check(counts.changed > 200, 'Falling leaves affect the actual framebuffer');
        check(counts.golden > 100, 'Actual falling ginkgo pixels render golden, not black');
        check(counts.purple > 100, 'Actual falling jacaranda pixels render purple, not black');
        check(counts.black < counts.changed * .1, 'Rendered falling leaves have valid non-black lighting');
        particleRenderedPixels = counts;
        captures.push({ name: 'falling-leaves', samples: particleSamples, renderedPixels: counts });
        game.treeParticles.leaves.count = 0; game.treeParticles.leaves.update(0, game.world);
    }
    async function captureNatural(name) {
        if (!naturalSamples.length) {
            await game.stop({ save: false });
            game = await Game.start(renderer, input, null, createWorldInfo('Naturalne drzewa 0.85.0', 42, 'realistic', 'developer'), settings);
            game.resize(width, height); game.player.flying = true; game.time.speed = 0; game.time.days = .43;
        }
        const spot = { ginkgo: [4762, 53, -4750, 1190, -1188], jacaranda: [1210, 51, -3247, 302, -812] }[name];
        const [x, y, z, gx, gz] = spot;
        const descriptor = game.world.generator.forests.treeAt(gx, gz);
        check(descriptor?.species === name, `${name}: natural source descriptor in actual Game`);
        game.world.loadAround(x, z, 5);
        check(game.world.getBlock(x, y, z) === name + '_log', `${name}: trunk present in naturally generated Game world`);
        for (let frame = 0; frame < 20; frame++) { game.world.updateMeshes(); await pause(); }
        const treeHeight = descriptor.shape.top + 1;
        // Above nearby crowns, without clearing any natural vegetation. The
        // previous low oblique camera could be inside a neighbouring canopy.
        const eye = [x + 18, y + treeHeight + 14, z + 20], target = [x, y + treeHeight * .65, z];
        document.querySelector('#qa-title').textContent = TREE_SPECIES[name].species[0] + ' w naturalnym świecie';
        document.querySelector('#qa-command').textContent = `Seed 42; ${x}, ${y}, ${z}`;
        await draw(eye, target);
        const gl = renderer.getContext(), pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let speciesColorPixels = 0;
        for (let py = height * .2; py < height * .8; py++) for (let px = width * .2; px < width * .8; px++) {
            const at = (py * width + px) * 4, r = pixels[at], g = pixels[at + 1], b = pixels[at + 2];
            if (name === 'ginkgo' ? r > 80 && g > 60 && r > b * 1.4 && g > b * 1.3 : b > 50 && r > 30 && b > g * 1.15) speciesColorPixels++;
        }
        check(speciesColorPixels > 500, `${name}: characteristic crown color visible in the natural biome view`);
        naturalSamples.push({ species: name, seed: 42, position: [x, y, z], height: treeHeight, eye, target, speciesColorPixels });
        captures.push({ name: name + '-natural', eye, target });
    }
    return {
        capture, finishChecks, captureSaplings, captureFixes, captureParticles, captureNatural, benchmark,
        benchmarkImage(name) { return benchmarkImages[name]; },
        report() {
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, errors, captures, commands, specimens, saplingSamples, performanceSamples, fixSamples, particleSamples, particleRenderedPixels, naturalSamples,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                resolution: [width, height], quality, syntheticWorld: true, originalPlayerModel: true,
                actualPlayerHeight: 1.8, eyeHeight: 1.6 };
        },
        async stop() { for (const marker of markers) marker.dispose(); await game.stop({ save: false }); renderer.dispose(); }
    };
}
