// Actual Game/Inventory/Hand rendering in an isolated synthetic world.
// Pixel checks concern authored textures and composition, never FPS.
export async function run() {
    const checks = [], errors = [];
    const check = (ok, message) => { if (!ok) throw Error(message); checks.push(message); };
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    addEventListener('error', e => errors.push(e.message));
    addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { atlasReady, ATLAS_TILES, ATLAS_COLUMNS, ATLAS_ROWS } = await import('/src/rendering/TextureAtlas.js');
    const { PINE_BARK_TEXTURES, drawPineBarkTextures } = await import('/src/rendering/WoodAtlasTextures.js');
    const { STONE_TOOL_TEXTURES, drawStoneToolTextures } = await import('/src/rendering/StoneToolTextures.js');
    const { STONE_TOOL_MATERIALS, STONE_TOOL_KINDS, stoneToolType } = await import('/src/items/stoneTools.js');
    const { createBlockIcons } = await import('/src/ui/BlockIcons.js');
    const { InventoryScreen } = await import('/src/ui/InventoryScreen.js');
    const { Hotbar } = await import('/src/ui/Hotbar.js');
    const { getBlockId } = await import('/src/blocks/BlockRegistry.js');
    const ready = await atlasReady;
    check(ready.iconTileSize === 16, 'Default atlas retains authored 16-pixel tiles');
    const atlas = document.createElement('canvas');
    atlas.width = ATLAS_COLUMNS * 16; atlas.height = ATLAS_ROWS * 16;
    const atlasContext = atlas.getContext('2d', { willReadFrequently: true });
    atlasContext.drawImage(ready.iconImage, 0, 0);
    const sample = (name, context = atlasContext, tiles = ATLAS_TILES, size = 16) => {
        const tile = tiles[name]; check(!!tile, `Atlas has ${name}`);
        return context.getImageData(tile.x * size, tile.y * size, size, size).data;
    };
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    const opaque = a => a.every((v, i) => i % 4 !== 3 || v === 255);
    const binary = a => a.every((v, i) => i % 4 !== 3 || v === 0 || v === 255);
    const base = sample('pine_log_upper_side');
    for (const spec of PINE_BARK_TEXTURES) {
        const overlay = sample(spec.overlay), result = sample(spec.name);
        check(opaque(result), `${spec.name} is opaque without extra cutout geometry`);
        check(result.every((v, i) => v === (overlay[(i & ~3) + 3] ? overlay[i] : base[i])),
            `${spec.name} is the exact authored overlay over orange bark`);
    }
    const moss = ['moss_carpet', 'moss_carpet_2', 'moss_carpet_3'].map(name => sample(name));
    check(moss.every(binary), 'All moss variants preserve binary pixel alpha');
    check(moss.every((tile, i) => moss.every((other, j) => i === j || !same(tile, other))), 'Three authored moss patterns are distinct');
    for (const spec of STONE_TOOL_TEXTURES) {
        const source = sample(spec.sourceTexture), result = sample(spec.name);
        check(!same(source, result), `${spec.name} changes the stone head`);
        check(result.every((v, i) => i % 4 !== 3 || v === source[i]), `${spec.name} preserves every alpha pixel`);
        let warmPixels = 0;
        for (let i = 0; i < source.length; i += 4) {
            if (source[i + 3] && source[i] > source[i + 1] + 3) {
                warmPixels++;
                if (!same(source.slice(i, i + 4), result.slice(i, i + 4))) throw Error(`${spec.name} recoloured a wooden handle pixel`);
            }
        }
        check(warmPixels > 0, `${spec.name} keeps its authored warm handle and binding`);
    }
    const sourceImage = new Image(); sourceImage.src = '/assets/textures/blocks/terrain.png'; await sourceImage.decode();
    const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = sourceCanvas.height = 256;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true }); sourceContext.drawImage(sourceImage, 0, 0);
    check(same(sample('stick'), sourceContext.getImageData(0, 144, 16, 16).data), 'Stick uses the exact updated atlas tile at 0,9');

    // The same composition helpers also receive high-resolution pack tiles.
    // Test a 32-pixel sheet and explicit user-painted target overrides.
    const names = [...new Set(['pine_log_upper_side', ...PINE_BARK_TEXTURES.flatMap(s => [s.overlay, s.name]),
        ...STONE_TOOL_TEXTURES.flatMap(s => [s.sourceTexture, s.materialTexture, s.name])])];
    const packTiles = Object.fromEntries(names.map((name, i) => [name, { x: i % 8, y: Math.floor(i / 8) }]));
    const pack = document.createElement('canvas'); pack.width = 8 * 32; pack.height = Math.ceil(names.length / 8) * 32;
    const packContext = pack.getContext('2d', { willReadFrequently: true }); packContext.imageSmoothingEnabled = false;
    for (const name of names) {
        const a = ATLAS_TILES[name], p = packTiles[name];
        packContext.drawImage(atlas, a.x * 16, a.y * 16, 16, 16, p.x * 32, p.y * 32, 32, 32);
    }
    const overrides = new Set([PINE_BARK_TEXTURES[0].name, STONE_TOOL_TEXTURES[0].name]);
    const painted = new Map();
    for (const name of overrides) {
        const p = packTiles[name]; packContext.fillStyle = '#f40b91'; packContext.fillRect(p.x * 32, p.y * 32, 32, 32);
        painted.set(name, sample(name, packContext, packTiles, 32));
    }
    drawPineBarkTextures(packContext, packTiles, 32, overrides);
    drawStoneToolTextures(packContext, packTiles, 32, overrides);
    for (const name of overrides) check(same(painted.get(name), sample(name, packContext, packTiles, 32)), `${name} preserves explicit 32px pack override`);
    check(opaque(sample(PINE_BARK_TEXTURES[1].name, packContext, packTiles, 32)), '32px generated bark remains opaque');
    for (const spec of STONE_TOOL_TEXTURES.slice(1)) {
        const source = sample(spec.sourceTexture, packContext, packTiles, 32), result = sample(spec.name, packContext, packTiles, 32);
        check(result.every((v, i) => i % 4 !== 3 || v === source[i]), `${spec.name} keeps the 32px silhouette`);
    }

    const width = 1280, height = 800;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height); document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'Game uses a real WebGL2 context');
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 48, farTerrain: 0, loadBudget: 8, meteorites: false,
        lightShafts: false, bounceLight: false, showHand: false, shadows: 0, cloudCover: 0,
        lightingModel: 'world', lightingLook: 'natural', viewBobbing: false, inventoryStyle: 'light', musicVolume: 0 })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Próba tekstur 0.70.0', 42, 'flat', 'developer');
    const game = await Game.start(renderer, input, null, info, settings);
    game.camera.aspect = width / height; game.camera.updateProjectionMatrix(); game.hand.resize(width / height);
    settings.onChange(key => game.applySettings(key));
    game.player.flying = true; game.time.speed = 0; game.time.days = .5;
    game.world.loadAround(0, 0, 3);
    const place = (x, y, z, type) => check(game.world.setBlock(x, y, z, type), `Placed ${type} at ${x},${y},${z}`);
    const woods = ['spruce', 'pine', 'beech', 'linden', 'oak', 'birch'];
    const planks = [...woods.map(wood => `${wood}_planks`), 'dark_planks'];
    planks.forEach((type, i) => {
        const x0 = -14 + i * 4;
        for (let x = x0; x < x0 + 3; x++) {
            for (let y = 17; y < 20; y++) place(x, y, 0, type);
            for (let z = 1; z < 5; z++) place(x, 16, z, type);
        }
        if (i < woods.length) place(x0 + 1, 17, 5, `${woods[i]}_log`);
    });
    for (let y = 17; y < 25; y++) place(0, y, -12, y < 21 ? 'pine_log' : 'pine_log_upper');
    for (let z = -28; z <= -20; z++) for (let x = -4; x <= 7; x++) place(x, 17, z, 'moss_carpet');
    game.world.updateMeshes();
    const icons = await createBlockIcons();
    const toolTypes = STONE_TOOL_KINDS.flatMap(tool => STONE_TOOL_MATERIALS.map(material => stoneToolType(tool, material.stone)));
    for (const [index, type] of [...toolTypes, 'stick'].entries()) game.inventory.set(index, { type, count: 1 });
    game.inventory.selected = 0;
    const hotbar = new Hotbar(document.querySelector('#hotbar'), icons);
    hotbar.update(game.inventory.slots.slice(0, 9), 0);
    const inventory = new InventoryScreen(icons, { close() { inventory.close(); } });
    inventory.tab = 'inventory'; inventory.book.open = false;
    document.documentElement.dataset.invStyle = 'light';
    const heading = document.querySelector('#qa-heading');
    const yieldBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
    const frame = (eye, target) => {
        game.player.pos.set(eye[0], eye[1] - 1.6, eye[2]); game.update(0);
        game.camera.position.set(...eye); game.camera.lookAt(...target); game.render();
    };
    const views = {
        wood: { eye: [0, 25, 22], target: [0, 18, 0], label: 'Deski — świerk · sosna · buk · lipa · dąb · brzoza · ciemne' },
        pine: { eye: [4.5, 22, -4.5], target: [.5, 21, -11.5], label: 'Sosna — trzy nakładki na tym samym pomarańczowym bloku' },
        moss: { eye: [2, 25, -13], target: [2, 17, -24], label: 'Mech — trzy autorskie wzory z trwałym doborem w świecie' },
        tools: { eye: [0, 22, 17], target: [0, 18, 0], label: 'Narzędzia w ekwipunku — kamień, granit, wapień, piaskowiec, łupek, bazalt' },
        'tools-hand': { eye: [0, 21, 17], target: [0, 18, 0], label: 'Narzędzie w ręce — głowica z granitu, autorski trzonek' }
    };
    const captures = [];
    async function capture(name) {
        const view = views[name]; if (!view) throw Error(`Unknown view ${name}`);
        inventory.close(); settings.set('showHand', name === 'tools-hand'); heading.textContent = view.label;
        if (name === 'tools-hand') { game.inventory.selected = 1; game.hand.setHeld(toolTypes[1]); game.hand.show(toolTypes[1]); }
        for (let i = 0; i < 5; i++) { frame(view.eye, view.target); await yieldBrowser(); }
        if (name === 'tools') {
            inventory.open(game); inventory.update();
            await Promise.all([...inventory.root.querySelectorAll('img')].filter(img => img.src).map(img => img.decode()));
            await new Promise(resolve => setTimeout(resolve, 500)); inventory.update();
            check(inventory.root.querySelectorAll('[data-kind="slot"] img[src]').length >= toolTypes.length,
                'Real inventory displays all eighteen stone tools');
        }
        if (name === 'tools-hand') {
            check(game.hand.shown === toolTypes[1] && game.hand.held.geometry.attributes.uv.count > 0,
                'Real first-person hand uses the material-specific tool geometry');
        }
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, `${name}: no WebGL error`);
        check(!(renderer.info.programs ?? []).some(program => program.diagnostics?.runnable === false), `${name}: all shaders runnable`);
        check(errors.length === 0, `${name}: no startup/render/console errors`);
        captures.push({ name, renderer: gl.getParameter(gl.RENDERER), drawCalls: renderer.info.render.calls });
        return { name, checks: checks.length };
    }
    return {
        capture,
        report: () => ({ checks, errors, captures, renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
            resolution: [width, height], syntheticWorld: true, hardwarePerformanceMeasurement: false }),
        exportTiles() {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
            const context = canvas.getContext('2d'); context.imageSmoothingEnabled = false;
            return Object.entries(ATLAS_TILES).filter(([, tile]) => (tile.w ?? 1) === 1 && (tile.h ?? 1) === 1)
                .map(([name, tile]) => {
                    context.clearRect(0, 0, 16, 16); context.drawImage(atlas, tile.x * 16, tile.y * 16, 16, 16, 0, 0, 16, 16);
                    return { name, path: name.endsWith('.png') ? name : name + '.png', png: canvas.toDataURL('image/png').split(',')[1] };
                });
        },
        async stop() { inventory.close(); await game.stop({ save: false }); renderer.dispose(); }
    };
}
