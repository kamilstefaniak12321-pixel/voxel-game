// Plans use the production tree shapes and packs. Placement/undo uses real
// World and Chunk edits; only rendering and light propagation are omitted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[], getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { World } = await import('../src/world/World.js');
const { TREE_NAMES, TREE_SPECIES } = await import('../src/blocks/trees.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { createTreeShowcasePlan, startTreeShowcase, getTreeShowcase, undoTreeShowcase, waitForTreeShowcase, disposeTreeShowcase } = await import('../src/world/trees/TreeShowcase.js');
const { getBlockId, blockExists } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE, CHUNK_HEIGHT, WORLD_BORDER } = await import('../src/config.js');

let checked = 0;
async function test(name, run) { await run(); checked++; console.log(`OK: ${name}`); }
const axes = { forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0 };
const options = (extra = {}) => ({ mode: 'forest', species: 'birch', count: 2, seed: 12345, origin: { x: 0, z: 0 }, axes, ...extra });
const flatWorld = (ground = 49) => Object.assign(Object.create(World.prototype), {
    chunks: new Map(), savedChunks: new Map(), dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
    generator: { generateChunk(chunk) {
        for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) chunk.setId(x, ground, z, getBlockId('grass'));
    } },
    light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
});
const baseOf = specimen => ({ x: specimen.dx, y: 50, z: specimen.dz });
const blocksIn = world => {
    const blocks = new Map();
    for (const chunk of world.chunks.values()) for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
            const type = world.getBlock(chunk.cx * CHUNK_SIZE + x, y, chunk.cz * CHUNK_SIZE + z);
            if (type && type !== 'grass') blocks.set(`${chunk.cx * CHUNK_SIZE + x},${y},${chunk.cz * CHUNK_SIZE + z}`, type);
        }
    }
    return blocks;
};

await test('porównanie zawiera każdy aktualnie wczytany gatunek, także paczki', () => {
    const plan = createTreeShowcasePlan({ mode: 'comparison', seed: 0 });
    assert.deepEqual(plan.specimens.map(tree => tree.species), TREE_NAMES);
    assert.equal(new Set(plan.specimens.map(tree => `${tree.dx},${tree.dz}`)).size, TREE_NAMES.length);
    for (const tree of plan.specimens) {
        assert.ok(tree.label.toLowerCase().includes(TREE_SPECIES[tree.species].short), tree.label);
        assert.ok(tree.shape.blocks.length > 0);
        assert.ok(tree.shape.blocks.every(([, , , type]) => blockExists(type)));
    }
});

await test('seed powtarza rzeczywisty las, inny seed zmienia układ i drzewa', () => {
    const input = { mode: 'forest', species: 'oak', count: 16, seed: 42 };
    const first = createTreeShowcasePlan(input);
    assert.deepEqual(createTreeShowcasePlan(input), first);
    const geometry = plan => plan.specimens.map(({ dx, dz, shape }) => ({ dx, dz, shape }));
    assert.notDeepEqual(geometry(createTreeShowcasePlan({ ...input, seed: 43 })), geometry(first));
    assert.equal(first.specimens.length, 16);
    assert.ok(first.specimens.every(tree => tree.species === 'oak'));
    assert.ok(new Set(first.specimens.map(tree => tree.size)).size > 4, 'las ma zróżnicowane rozmiary');
    for (const tree of first.specimens) assert.deepEqual(tree.shape, buildTree('oak', tree.seed, tree.size));
});

await test('galeria pokazuje wszystkie rozmiary szablonów i skrajne rozmiary proceduralne', () => {
    for (const species of TREE_NAMES) {
        const plan = createTreeShowcasePlan({ mode: 'variants', species, seed: 17 });
        const sizes = [...new Set(plan.specimens.map(tree => tree.size))];
        const pack = TREE_SPECIES[species].pack;
        if (pack?.shape.kind === 'szablon') {
            const n = pack.shape.templates.length;
            assert.deepEqual([...new Set(sizes.map(size => Math.min(n - 1, Math.floor(size * n))))].sort(), Array.from({ length: n }, (_, i) => i));
        } else {
            assert.equal(Math.min(...sizes), 0);
            assert.equal(Math.max(...sizes), 1);
            assert.ok(sizes.length >= 5);
        }
        assert.ok(plan.specimens.every(tree => tree.species === species));
        assert.ok(plan.specimens.every(tree => tree.shape.blocks.every(([, , , type]) => blockExists(type))));
    }
});

await test('galeria gwarantuje zwykłe i specjalne stany liści oraz żywicy', () => {
    const cases = [['pine', 'pine_log_resin'], ['linden', 'linden_leaves_flowering'], ['jablon', 'jablon_leaves_jablka']];
    for (const [species, special] of cases) {
        const plan = createTreeShowcasePlan({ mode: 'variants', species, seed: 1 });
        assert.ok(plan.specimens.some(tree => tree.shape.blocks.some(cell => cell[3] === special)), special);
        assert.ok(plan.specimens.some(tree => tree.shape.blocks.every(cell => cell[3] !== special)), `${species}: zwykły`);
    }
    const apple = createTreeShowcasePlan({ mode: 'variants', species: 'jablon', seed: 1 });
    assert.ok(apple.specimens.some(tree => tree.shape.blocks.some(cell => cell[3] === 'jablon_leaves_jablka_growing')));
});

await test('limity i błędne dane odrzucane przed generacją', () => {
    for (const count of [0, -1, 37, 1.5, Infinity, NaN]) assert.throws(() => createTreeShowcasePlan({ mode: 'forest', species: 'pine', count, seed: 0 }));
    for (const seed of [-1, 2 ** 32, 0.5, Infinity, NaN]) assert.throws(() => createTreeShowcasePlan({ mode: 'forest', species: 'pine', count: 1, seed }));
    for (const species of ['unknown', 'constructor', '__proto__']) assert.throws(() => createTreeShowcasePlan({ mode: 'variants', species, seed: 0 }));
    assert.throws(() => createTreeShowcasePlan({ mode: 'unknown', seed: 0 }));
    for (const seed of [0, 2 ** 32 - 1]) assert.equal(createTreeShowcasePlan({ mode: 'forest', species: 'pine', count: 36, seed }).specimens.length, 36);
});

await test('naturalna sosna ma żywicę; seed nadal kontroluje jeden, dwa lub brak wycieków', () => {
    const resin = seed => buildTree('pine', seed, 0.5).blocks.filter(cell => cell[3] === 'pine_log_resin');
    assert.equal(resin(0).length, 1);
    assert.equal(resin(1).length, 0);
    assert.equal(resin(4).length, 2);
    for (const seed of [0, 1, 4]) {
        const shape = buildTree('pine', seed, 0.5);
        assert.deepEqual(buildTree('pine', seed, 0.5), shape);
        assert.ok(shape.blocks.some(cell => cell[3] === 'pine_log'));
        assert.ok(shape.blocks.some(cell => cell[3] === 'pine_log_upper'));
        assert.ok(resin(seed).every(([x, y, z]) => x === 0 && z === 0 && y >= 1 && y <= 5));
    }
});

await test('pełne drzewa trafiają do prawdziwego świata; cofnięcie przywraca rośliny', async () => {
    const world = flatWorld(), input = options(), plan = createTreeShowcasePlan(input);
    const first = baseOf(plan.specimens[0]);
    world.setBlock(first.x, first.y, first.z, 'short_grass');
    const before = blocksIn(world);
    const job = startTreeShowcase(world, input);
    assert.equal(getTreeShowcase(world), job);
    await job.promise;
    assert.equal(job.placed.length, 2);
    for (const tree of plan.specimens) for (const [x, y, z, type] of tree.shape.blocks) {
        assert.equal(world.getBlock(tree.dx + x, 50 + y, tree.dz + z), type);
    }
    const result = await undoTreeShowcase(world);
    assert.ok(result.restored > 0);
    assert.equal(result.skipped, 0);
    assert.deepEqual(blocksIn(world), before);
});

await test('dziennik obejmuje roślinę automatycznie usuniętą pod niską koroną', async () => {
    let input, target;
    for (let seed = 0; seed < 20 && !target; seed++) {
        input = options({ mode: 'variants', species: 'spruce', seed });
        for (const tree of createTreeShowcasePlan(input).specimens) {
            const block = tree.shape.blocks.find(([x, y, z, type]) => y === 1 && type === 'spruce_leaves' &&
                !tree.shape.blocks.some(cell => cell[0] === x && cell[1] === 0 && cell[2] === z));
            if (block) { target = { x: tree.dx + block[0], y: 50, z: tree.dz + block[2] }; break; }
        }
    }
    assert.ok(target, 'przypadek korony nad rośliną');
    const world = flatWorld();
    world.setBlock(target.x, target.y, target.z, 'purple_loosestrife');
    const before = blocksIn(world);
    const job = startTreeShowcase(world, input);
    await job.promise;
    assert.equal(world.getBlock(target.x, target.y, target.z), null);
    assert.ok(job.journal.some(cell => cell.x === target.x && cell.y === target.y && cell.z === target.z));
    assert.equal(Object.hasOwn(world, 'setBlock'), false, 'tymczasowy obserwator nie zostaje w świecie');
    await undoTreeShowcase(world);
    assert.deepEqual(blocksIn(world), before);
    assert.equal(Object.hasOwn(world, 'setBlock'), false);
});

await test('las omija wodę i zachowuje ją również przy cofnięciu', async () => {
    const world = flatWorld(), input = options(), plan = createTreeShowcasePlan(input);
    const first = baseOf(plan.specimens[0]);
    world.setBlock(first.x, first.y, first.z, 'water');
    const job = startTreeShowcase(world, input);
    await job.promise;
    assert.equal(job.skipped.length, 1);
    assert.equal(job.placed.length, 1);
    assert.equal(world.getBlock(first.x, first.y, first.z), 'water');
    await undoTreeShowcase(world);
    assert.deepEqual([...blocksIn(world).values()], ['water']);
});

await test('cofnięcie zachowuje późniejsze zmiany gracza', async () => {
    const world = flatWorld(), input = options({ count: 1 }), plan = createTreeShowcasePlan(input);
    await startTreeShowcase(world, input).promise;
    const tree = plan.specimens[0], first = baseOf(tree);
    world.setBlock(first.x, first.y, first.z, 'stone');
    const result = await undoTreeShowcase(world);
    assert.ok(result.skipped >= 1);
    assert.equal(world.getBlock(first.x, first.y, first.z), 'stone');
    assert.equal(blocksIn(world).size, 1);
});

await test('dziennik pomija niezależne zmiany gracza podczas sadzenia', async () => {
    const world = flatWorld(), input = options({ count: 1 }), plan = createTreeShowcasePlan(input);
    const outside = { x: plan.specimens[0].dx + 8, y: 49, z: plan.specimens[0].dz + 8 };
    let injected = false;
    world.setBlock = function (...args) {
        const result = World.prototype.setBlock.apply(this, args);
        if (!injected && String(args[3]).includes('_log')) {
            injected = true;
            queueMicrotask(() => World.prototype.setBlock.call(this, outside.x, outside.y, outside.z, 'stone'));
        }
        return result;
    };
    const job = startTreeShowcase(world, input);
    await job.promise;
    assert.equal(injected, true);
    assert.ok(!job.journal.some(cell => cell.x === outside.x && cell.y === outside.y && cell.z === outside.z));
    await undoTreeShowcase(world);
    assert.equal(world.getBlock(outside.x, outside.y, outside.z), 'stone');
});

await test('cofnięcie wczytuje oddalony pokaz z zapisanych chunków', async () => {
    const world = flatWorld();
    const job = startTreeShowcase(world, options());
    await job.promise;
    for (const chunk of world.chunks.values()) world.savedChunks.set(world.chunkKey(chunk.cx, chunk.cz), chunk.blocks.slice());
    world.chunks.clear();
    const result = await undoTreeShowcase(world);
    assert.ok(result.restored > 0);
    assert.equal(result.skipped, 0);
    assert.equal(blocksIn(world).size, 0);
});

await test('odrzucony nowy pokaz zachowuje możliwość cofnięcia poprzedniego', async () => {
    const world = flatWorld(), input = options({ count: 1 });
    const previous = startTreeShowcase(world, input);
    await previous.promise;
    await assert.rejects(async () => { await startTreeShowcase(world, input).promise; });
    assert.equal(getTreeShowcase(world), previous);
    await undoTreeShowcase(world);
    assert.equal(blocksIn(world).size, 0);
});

await test('galeria przy kolizji niczego nie nadpisuje, las pomija zajęte drzewo', async () => {
    const world = flatWorld(), input = options({ mode: 'comparison' }), plan = createTreeShowcasePlan(input);
    const first = baseOf(plan.specimens[0]);
    world.setBlock(first.x, first.y, first.z, 'oak_log');
    const before = blocksIn(world), revision = world.version;
    await assert.rejects(async () => { await startTreeShowcase(world, input).promise; });
    assert.equal(world.version, revision);
    assert.deepEqual(blocksIn(world), before);
    const forest = options(), forestPlan = createTreeShowcasePlan(forest), tree = baseOf(forestPlan.specimens[0]);
    world.setBlock(tree.x, tree.y, tree.z, 'oak_log');
    const job = startTreeShowcase(world, forest);
    await job.promise;
    assert.equal(world.getBlock(tree.x, tree.y, tree.z), 'oak_log');
    assert.ok(job.skipped.length >= 1);
    assert.ok(job.placed.length < 2);
});

await test('granice świata i limit wysokości nie zostawiają uciętych drzew', async () => {
    for (const [world, input] of [
        [flatWorld(CHUNK_HEIGHT - 3), options({ mode: 'comparison' })],
        [flatWorld(), options({ mode: 'comparison', origin: { x: WORLD_BORDER - 1, z: 0 } })],
        [flatWorld(), options({ mode: 'comparison', origin: { x: -WORLD_BORDER, z: 0 } })]
    ]) {
        await assert.rejects(async () => { await startTreeShowcase(world, input).promise; });
        assert.equal(world.version, 0);
        assert.equal(blocksIn(world).size, 0);
    }
});

await test('jedna operacja naraz; opuszczenie świata zatrzymuje pracę', async () => {
    const world = flatWorld(), input = options();
    const job = startTreeShowcase(world, input);
    assert.throws(() => startTreeShowcase(world, input));
    await assert.rejects(async () => { await undoTreeShowcase(world); });
    await job.promise;
    await undoTreeShowcase(world);
    const revision = world.version;
    await assert.rejects(async () => { await startTreeShowcase(world, input, { isActive: () => false }).promise; });
    assert.equal(world.version, revision);
});

await test('oczekiwanie przed zapisem kończy pracę; dispose blokuje dalsze zapisy', async () => {
    const world = flatWorld();
    const job = startTreeShowcase(world, options());
    await waitForTreeShowcase(world);
    assert.equal(job.phase, 'complete');
    assert.equal(job.placed.length, 2);
    const other = flatWorld(), pending = startTreeShowcase(other, options());
    disposeTreeShowcase(other);
    const version = other.version;
    await assert.rejects(pending.promise);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(other.version, version);
    assert.throws(() => startTreeShowcase(other, options()));
});

await test('dispose w trakcie sadzenia zatrzymuje zapis przy najbliższej granicy pracy', async () => {
    const world = flatWorld();
    let disposedAt = null;
    world.setBlock = function (...args) {
        const result = World.prototype.setBlock.apply(this, args);
        if (disposedAt === null) {
            disposedAt = this.version;
            queueMicrotask(() => disposeTreeShowcase(this));
        }
        return result;
    };
    const job = startTreeShowcase(world, options());
    await assert.rejects(job.promise);
    assert.ok(disposedAt > 0);
    const version = world.version;
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(world.version, version);
    assert.equal(job.phase, 'failed');
});

// Commands stay real. Unrelated audio/sky/UI helpers are stubbed so this
// remains a Node regression test, independent of the renderer and browser.
const commandUrl = new URL('../src/commands/gameCommands.js', import.meta.url).href;
const allowed = new Set(['./CommandRegistry.js', '../blocks/BlockRegistry.js', '../items/ItemRegistry.js',
    '../blocks/trees.js', '../blocks/treePacks.js', '../config.js', '../world/trees/TreeShowcase.js',
    '../audio/sounds.js', '../world/terrain/rocks.js']);
const stubs = new Map();
for (const [, bindings, specifier] of readFileSync(new URL(commandUrl), 'utf8').matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
    if (allowed.has(specifier)) continue;
    const names = bindings.trim().startsWith('{')
        ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}')).split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        : [];
    stubs.set(specifier, `data:text/javascript,${encodeURIComponent(names.map(name => `export const ${name}=undefined;`).join('\n'))}`);
}
registerHooks({ resolve(specifier, context, next) {
    const stub = context.parentURL === commandUrl ? stubs.get(specifier) : null;
    return stub ? { url: stub, shortCircuit: true } : next(specifier, context);
} });
const { GAME_COMMANDS } = await import(commandUrl);
const { CommandRegistry } = await import('../src/commands/CommandRegistry.js');
const registry = new CommandRegistry();
registry.register(GAME_COMMANDS.find(command => command.name === 'drzewa'));
const commandContext = () => {
    const printed = [];
    return { world: flatWorld(), player: { pos: { x: 0, y: 50, z: 0 }, yaw: 0 }, game: { plantGrowth: {} }, chat: { print: (...message) => printed.push(message) }, printed };
};

await test('lista i Tab pokazują wszystkie gatunki oraz nowe tryby', () => {
    const ctx = commandContext(), result = registry.execute('drzewa lista', ctx);
    assert.equal(result.ok, true);
    for (const species of TREE_NAMES) assert.ok(result.text.includes(TREE_SPECIES[species].species[0]));
    const modes = registry.complete('drzewa ', ctx);
    for (const mode of ['lista', 'las', 'warianty', 'porownanie', 'ostatnie', 'cofnij']) assert.ok(modes.includes(`drzewa ${mode}`));
    for (const mode of ['las', 'warianty']) {
        const completions = registry.complete(`drzewa ${mode} `, ctx);
        assert.equal(completions.length, TREE_NAMES.length);
        assert.ok(completions.includes(`drzewa ${mode} jablon`));
        assert.ok(completions.includes(`drzewa ${mode} dab`));
    }
    assert.equal(getTreeShowcase(ctx.world), null);
});

await test('błędne argumenty komendy nie uruchamiają pracy ani nie modyfikują świata', () => {
    for (const line of [
        'drzewa las', 'drzewa las unknown', 'drzewa las sosna 0', 'drzewa las sosna 37', 'drzewa las sosna 2.5',
        'drzewa las sosna 1 -1', 'drzewa las sosna 1 4294967296', 'drzewa las sosna 1 0.5', 'drzewa las sosna 1 abc',
        'drzewa las sosna 1 42 extra', 'drzewa warianty sosna 0 extra', 'drzewa porownanie 0 extra',
        'drzewa lista extra', 'drzewa ostatnie extra', 'drzewa cofnij extra'
    ]) {
        const ctx = commandContext();
        assert.equal(registry.execute(line, ctx).ok, false, line);
        assert.equal(getTreeShowcase(ctx.world), null, line);
        assert.equal(ctx.world.version, 0, line);
    }
});

await test('aliasy komendy, polskie litery i seed zero działają przez rejestr czatu', async () => {
    for (const [line, species] of [['drzewo las dąb 1 0', 'oak'], ['trees las świerk 1 0', 'spruce'], ['drzewa las jabłoń 1 0', 'jablon']]) {
        const ctx = commandContext(), result = registry.execute(line, ctx);
        assert.equal(result.ok, true, result.text);
        const job = getTreeShowcase(ctx.world);
        assert.equal(job.plan.seed, 0);
        assert.equal(job.plan.specimens[0].species, species);
        await job.promise;
        assert.ok(ctx.printed.some(([text]) => text.includes('gotowy')));
        assert.match(registry.execute('drzewa ostatnie', ctx).text, /seed 0/);
        assert.equal(registry.execute('drzewa cofnij', ctx).ok, true);
        await waitForTreeShowcase(ctx.world);
        assert.equal(blocksIn(ctx.world).size, 0);
    }
});

console.log(`Sprawdzonych przypadków pokazu drzew: ${checked}.`);
