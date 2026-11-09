// Real production Game, meshes, tree shapes and command parser. No user saves.
export async function run() {
    const checks = [], errors = [], commandsRun = [], captures = [];
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
    const { Chunk } = await import('/src/world/Chunk.js');
    const { getBlockDefinition, getBlockTypeById } = await import('/src/blocks/BlockRegistry.js');
    const { CHUNK_SIZE } = await import('/src/config.js');
    const { getTreeShowcase } = await import('/src/world/trees/TreeShowcase.js');
    await atlasReady;
    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'Actual game uses WebGL2');
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 320, farTerrain: 0, loadBudget: 8, meteorites: false,
        lightShafts: false, bounceLight: false, showHand: false, shadows: 0, cloudCover: 0,
        lightingModel: 'world', lightingLook: 'natural', viewBobbing: false, volumeMusic: 0,
        leafModel: 'parts', fancyLeaves: true, plantWind: false })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Próba komend drzew', 42, 'flat', 'developer');
    const game = await Game.start(renderer, input, null, info, settings);
    game.camera.aspect = width / height; game.camera.updateProjectionMatrix();
    settings.onChange(key => game.applySettings(key));
    game.player.flying = true; game.time.speed = 0; game.time.days = .45;
    // The grass area west of the test plaza avoids its concrete floor and the
    // built-in terrain terraces. Each new command starts at this same location.
    const origin = [-160.5, 18, .5];
    game.player.pos.set(...origin); game.player.yaw = 0; game.player.pitch = 0;
    game.world.loadAround(origin[0], origin[2], 3);
    game.world.setDistanceLod(false);
    const registry = new CommandRegistry();
    for (const command of GAME_COMMANDS) registry.register(command);
    const chatMessages = [];
    const context = { game, world: game.world, player: game.player, sky: game.sky, time: game.time,
        commands: registry, chat: { print(text, kind) { chatMessages.push({ text, kind }); } } };
    async function command(line, expected = true) {
        const start = performance.now(), chatStart = chatMessages.length;
        const result = registry.execute(line.replace(/^\//, ''), context);
        check(result.ok === expected, `${line}: ${expected ? 'success' : 'rejected'} (${result.text})`);
        if (expected && /^\/drzewa (las|warianty|porownanie|cofnij)(?: |$)/.test(line)) {
            while (chatMessages.length === chatStart && performance.now() - start < 90000) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            check(chatMessages.length > chatStart, `${line}: asynchronous command finishes`);
            check(chatMessages.at(-1).kind !== 'error', `${line}: ${chatMessages.at(-1).text}`);
        }
        commandsRun.push({ line, ok: result.ok, text: result.text, messages: chatMessages.slice(chatStart),
            milliseconds: +(performance.now() - start).toFixed(2) });
        return result;
    }
    const pristine = new Map();
    function originalChunk(chunk) {
        const key = `${chunk.cx},${chunk.cz}`;
        if (!pristine.has(key)) {
            const clean = new Chunk(chunk.cx, chunk.cz); game.world.generator.generateChunk(clean);
            pristine.set(key, clean.blocks);
        }
        return pristine.get(key);
    }
    function changes() {
        let count = 0, hash = 2166136261;
        const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
        const species = {}, types = {};
        for (const chunk of [...game.world.chunks.values()].sort((a, b) => a.cx - b.cx || a.cz - b.cz)) {
            const baseline = originalChunk(chunk), data = chunk.blocks;
            for (let index = 0; index < data.length; index++) {
                if (data[index] === baseline[index]) continue;
                const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
                const z = chunk.cz * CHUNK_SIZE + Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
                const x = chunk.cx * CHUNK_SIZE + index % CHUNK_SIZE;
                count++;
                for (const value of [x, y, z, data[index]]) hash = Math.imul(hash ^ value, 16777619) >>> 0;
                bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
                bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
                bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
                const type = getBlockTypeById(data[index]), definition = getBlockDefinition(type);
                types[type ?? 'air'] = (types[type ?? 'air'] ?? 0) + 1;
                if (definition?.tree) species[definition.tree] = (species[definition.tree] ?? 0) + 1;
            }
        }
        return { count, hash, bounds, species, types };
    }
    async function reset() {
        if (changes().count) {
            await command('/drzewa cofnij');
            check(changes().count === 0, 'Undo restores every loaded block to the original generated world');
        }
        game.player.pos.set(...origin); game.player.yaw = 0; game.player.pitch = 0;
    }
    const list = await command('/drzewa lista');
    for (const name of TREE_NAMES) check(list.text.toLowerCase().includes(TREE_SPECIES[name].short.toLowerCase()), `List includes ${name}`);
    const suggestions = registry.complete('drzewa ', context);
    for (const mode of ['lista', 'las', 'warianty', 'porownanie', 'cofnij']) check(suggestions.includes(`drzewa ${mode}`), `Tab completes ${mode}`);
    for (const line of ['/drzewa las sosna 0', '/drzewa las sosna 37', '/drzewa las nieistnieje',
        '/drzewa las sosna 4 -1', '/drzewa las sosna 4 4294967296']) {
        await command(line, false);
        check(changes().count === 0, `${line} leaves the world unchanged`);
    }
    const scenes = {
        comparison: { command: '/drzewa porownanie 12345', label: `Wszystkie gatunki — ${TREE_NAMES.map(name => TREE_SPECIES[name].short).join(', ')}` },
        'pine-forest': { command: '/drzewa las sosna 16 12345', label: 'Losowy las sosnowy — 16 drzew, stały seed 12345' },
        'apple-variants': { command: '/drzewa warianty jablon 12345', label: 'Jabłoń — trzy szablony, zwykłe liście, owoce i stan po zbiorze' },
        'linden-variants': { command: '/drzewa warianty lipa 12345', label: 'Lipa — rozmiary oraz liście zwykłe i kwitnące' }
    };
    let pineForest;
    const yieldBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
    async function capture(name) {
        const scene = scenes[name]; if (!scene) throw Error(`Unknown scene: ${name}`);
        await reset(); await command(scene.command);
        const state = changes();
        check(state.count > 0, `${name}: command creates real blocks`);
        if (name === 'comparison') check(TREE_NAMES.every(species => state.species[species]), 'Comparison contains all registered tree species');
        if (name === 'pine-forest') {
            check(Object.keys(state.species).join() === 'pine', 'Pine forest contains only pine trees'); pineForest = state;
        }
        if (name === 'apple-variants') check(state.types.jablon_leaves > 0 && state.types.jablon_leaves_jablka > 0 && state.types.jablon_leaves_jablka_growing > 0, 'Apple showcase includes ordinary, fruiting and regrowing leaves');
        if (name === 'linden-variants') check(state.types.linden_leaves > 0 && state.types.linden_leaves_flowering > 0, 'Linden showcase includes ordinary and flowering leaves');
        document.querySelector('#qa-title').textContent = scene.label;
        document.querySelector('#qa-command').textContent = scene.command;
        const b = state.bounds, center = [(b.minX + b.maxX) / 2, b.minY + (b.maxY - b.minY) * .3, (b.minZ + b.maxZ) / 2];
        const extent = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 30);
        const eye = name === 'comparison'
            ? [center[0], b.maxY + extent * .07, center[2] + extent * .5]
            : [center[0] + extent * .16, b.maxY + extent * .33, center[2] + extent * .95];
        // Generate neighbours for the actual chunk mesher, including edge trees.
        for (let cx = Math.floor(b.minX / CHUNK_SIZE) - 1; cx <= Math.floor(b.maxX / CHUNK_SIZE) + 1; cx++) {
            for (let cz = Math.floor(b.minZ / CHUNK_SIZE) - 1; cz <= Math.floor(b.maxZ / CHUNK_SIZE) + 1; cz++) {
                game.world.ensureColumnLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE);
            }
        }
        // A full surrounding patch keeps the isolated fixture's chunk boundary
        // out of the picture. This is real terrain, not a backdrop mesh.
        game.world.loadAround(center[0], center[2], 10);
        game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]); game.update(0);
        game.world.updateMeshes();
        for (let frame = 0; frame < 4; frame++) {
            game.camera.position.set(...eye); game.camera.lookAt(...center); game.render(); await yieldBrowser();
        }
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, `${name}: no WebGL error`);
        check(!(renderer.info.programs ?? []).some(program => program.diagnostics?.runnable === false), `${name}: shaders compiled`);
        check(errors.length === 0, `${name}: no runtime/console errors`);
        captures.push({ name, command: scene.command, changes: state, drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles, eye, target: center,
            specimens: getTreeShowcase(game.world)?.placed.map(({ species, label, x, y, z }) => ({ species, label, x, y, z })) });
        return { name, checks: checks.length };
    }
    return {
        capture,
        async finishChecks() {
            await reset(); await command('/drzewa las sosna 16 12345');
            const replay = changes();
            check(replay.hash === pineForest.hash && replay.count === pineForest.count, 'Same seed reproduces the exact same placed forest after undo');
            await reset(); await command('/drzewa las sosna 16 12346');
            check(changes().hash !== pineForest.hash, 'Different seed changes the actual forest');
            await reset(); await command('/drzewa las sosna 36 12345');
            check(getTreeShowcase(game.world).placed.length === 36, 'Maximum forest creates all 36 trees in the real game');
            await reset();
        },
        report() {
            const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { checks, errors, commands: commandsRun, captures,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                resolution: [width, height], syntheticWorld: true, hardwarePerformanceMeasurement: false,
                leafModel: settings.get('leafModel'), species: TREE_NAMES.map(id => ({ id, name: TREE_SPECIES[id].species[0] })) };
        },
        async stop() { await game.stop({ save: false }); renderer.dispose(); }
    };
}
