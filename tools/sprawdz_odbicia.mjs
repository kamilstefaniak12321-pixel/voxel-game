import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Realny solver/registry, kontrolowany liniowy atlas bez DOM/WebGL.
const atlas = `data:text/javascript,${encodeURIComponent(`
    export const atlasAveragesReady = Promise.resolve();
    export function getAtlasAverage(tile) {
        const rgb = tile === 'dirt' ? [.35,.12,.035] : tile === 'sand' ? [.7,.6,.3] : [.3,.3,.3];
        return {r:rgb[0],g:rgb[1],b:rgb[2]};
    }
    export function getTileColors(tile) {
        return tile === 'grass_side' ? [{r:.4,g:.1,b:.04},{r:.08,g:.5,b:.04}] : [];
    }
`)}`;
const registryUrl = new URL('../src/blocks/BlockRegistry.js', import.meta.url).href;
const highRegistry = `data:text/javascript,${encodeURIComponent(`
    export * from ${JSON.stringify(registryUrl)};
    import {isOpaqueId as originalOpaque} from ${JSON.stringify(registryUrl)};
    export const isOpaqueId = id => id === 65000 || originalOpaque(id);
`)}`;
registerHooks({
    resolve(specifier, context, next) {
        if (specifier.endsWith('/TextureAtlas.js')) return { url: atlas, shortCircuit: true };
        if (specifier.endsWith('/BlockRegistry.js') && context.parentURL.endsWith('/BounceLight.js')) {
            return { url: highRegistry, shortCircuit: true };
        }
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/') || url.includes('/assets/models/'))
            ? { ...context, format: 'module' } : context);
    }
});
const { BounceLight, bounceUniforms, getReflect } = await import('../src/world/BounceLight.js');
const { CHUNK_SIZE: S, CHUNK_HEIGHT: H } = await import('../src/config.js');
await Promise.resolve();
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const options = { enabled: true, sunDirection: [0,1,0], moonDirection: [0,-1,0],
    sun: [1,1,1], moon: [0,0,0], sky: [0,0,0], ground: [0,0,0], strength: .18, saturation: 1 };
const center = { x: 0, y: 19, z: 0 };
function fixture(blockAt, skyAt = () => 15, known = () => true, tint = null) {
    const chunks = new Map();
    return {
        getChunk(cx, cz) {
            if (!known(cx, cz)) return null;
            const key = `${cx},${cz}`;
            if (!chunks.has(key)) {
                const chunk = { cx, cz, blocks: new Uint16Array(S * S * H), skyLight: new Uint8Array(S * S * H) };
                if (tint) chunk.tint = Uint8Array.from({length:(S+1)*(S+1)*3},(_,i)=>tint[i%3]);
                for (let y = 0; y < H; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
                    const index = (y * S + z) * S + x, wx = cx * S + x, wz = cz * S + z;
                    chunk.blocks[index] = blockAt(wx, y, wz);
                    chunk.skyLight[index] = skyAt(wx, y, wz);
                }
                chunks.set(key, chunk);
            }
            return chunks.get(key);
        },
        set(x, y, z, id) {
            const cx = Math.floor(x / S), cz = Math.floor(z / S), chunk = this.getChunk(cx, cz);
            chunk.blocks[(y * S + z - cz * S) * S + x - cx * S] = id;
            return chunk;
        }
    };
}
const flush = (bounce, world, settings = options) => {
    bounce.update(world, center, settings);
    assert.equal(bounce.stats().ready, true, JSON.stringify(bounce.stats()));
};
const full = () => new BounceLight({ budgetMs: Infinity, maxWork: Infinity });

// Kolor materiału i siła energii; nie ma relaksacji ani narastania.
const world = fixture((x,y,z) => y === 16 ? 2 : 0);
const bounce = full();
flush(bounce, world);
const earth = bounce.sample(.5,17.5,.5), initial = bounce.stats();
assert.ok(earth[0] > earth[1] && earth[1] > earth[2] && earth[0] > .005, JSON.stringify({earth,initial,surface:[...bounce.surfaces.values()].slice(0,2)}));
for (let i = 0; i < 30; i++) flush(bounce, world);
assert.deepEqual(bounce.sample(.5,17.5,.5), earth);
assert.equal(bounce.stats().lastFrame.work, 0);
assert.equal(bounce.stats().updates, initial.updates);

// Warstwy są rozłączne: księżyc i niebo nie używają energii słońca.
flush(bounce,world,{...options,sun:[0,0,0],moon:[1,1,1],moonDirection:[0,1,0]});
bounce.sample(.5,17.5,.5).forEach((value,c)=>close(value,earth[c]));
flush(bounce,world,{...options,sun:[0,0,0],sky:[1,1,1]});
bounce.sample(.5,17.5,.5).forEach((value,c)=>close(value,earth[c]));
flush(bounce,world,{...options,sky:[1,1,1]});
bounce.sample(.5,17.5,.5).forEach((value,c)=>close(value,earth[c]*2));
flush(bounce,world,{...options,sun:[0,0,0],ground:[1,1,1]});
assert.deepEqual(bounce.sample(.5,17.5,.5),[0,0,0],'górna ściana nie otrzymuje dolnej półkuli');
assert.ok(Math.max(...earth) <= .18 * .9, 'zachowanie limitu energii');
flush(bounce,world,options);
flush(bounce, world, { ...options, sun: [2,2,2] });
bounce.sample(.5,17.5,.5).forEach((value, c) => close(value, earth[c] * 2));
assert.equal(bounce.stats().lastFrame.work, 0, 'moc źródła nie przebudowuje cache');
flush(bounce, world, { ...options, saturation: 0 });
const gray = bounce.sample(.5,17.5,.5);
close(gray[0], gray[1]); close(gray[1], gray[2]);
close(gray[0], earth[0] * .2126 + earth[1] * .7152 + earth[2] * .0722);
assert.equal(bounce.stats().lastFrame.work, 0);

// Zgaszenie działa od razu również przy zerowym budżecie CPU.
bounce.update(world, center, { ...options, sun: [0,0,0], budgetMs: 0 });
assert.deepEqual(bounce.sample(.5,17.5,.5), [0,0,0]);
assert.deepEqual(bounceUniforms.uBounceSun.value.toArray(), [0,0,0]);
flush(bounce, world);
for (let x = -8; x < 8; x++) for (let z = -8; z < 8; z++) world.set(x,16,z,11);
for (const cx of [-1,0]) for (const cz of [-1,0]) bounce.markChunk(world.getChunk(cx,cz));
assert.deepEqual(bounce.sample(.5,17.5,.5), [0,0,0], 'edycja usuwa stare odbicie przed przeliczeniem');
flush(bounce, world);
const sand = bounce.sample(.5,17.5,.5);
assert.ok(sand[0] > earth[0] && sand[1] / sand[0] > earth[1] / earth[0]);
const remote = bounce.stats().invalidations;
bounce.markChunk({cx:100,cz:100});
assert.equal(bounce.stats().invalidations, remote, 'odległa edycja nie przebudowuje lokalnego cache');

// Dwa przylegające pokoje: lewy otwarty do słońca, prawy zamknięty.
const rooms = fixture((x,y,z) => {
    if (y === 16) return 11;
    if (x >= 0 && x <= 6 && z >= -6 && z <= 6 && y >= 17 && y <= 22
        && (x === 0 || x === 6 || z === -6 || z === 6 || y === 22)) return 3;
    return 0;
}, (x,y,z) => x > 0 && x < 6 && z > -6 && z < 6 && y > 16 && y < 22 ? 0 : 15);
const roomBounce = full(); flush(roomBounce, rooms);
assert.ok(roomBounce.sample(-2.5,17.5,.5)[0] > .01);
assert.deepEqual(roomBounce.sample(2.5,17.5,.5), [0,0,0], 'odbicie nie przechodzi przez zamkniętą ścianę');
for (let x = 1; x < 6; x++) for (let z = -5; z < 6; z++) rooms.set(x,22,z,0);
for (const cz of [-1,0]) roomBounce.markChunk(rooms.getChunk(0,cz));
flush(roomBounce, rooms);
assert.ok(roomBounce.sample(2.5,17.5,.5)[0] > .005, 'otwarcie dachu wpuszcza źródło');
for (let x = 1; x < 6; x++) for (let z = -5; z < 6; z++) rooms.set(x,22,z,3);
for (const cz of [-1,0]) roomBounce.markChunk(rooms.getChunk(0,cz));
assert.deepEqual(roomBounce.sample(2.5,17.5,.5), [0,0,0]);
flush(roomBounce, rooms);
assert.deepEqual(roomBounce.sample(2.5,17.5,.5), [0,0,0], 'nowy dach nie zachowuje starej energii');

// Nowe ID nie może zawinąć do przypadkowego bloku 8-bitowego.
const highId = 65000; // przyszła pełna bryła z legalnego zakresu rejestru
const seen = new Set(), highWorld = fixture((x,y,z) => y === 16 ? highId : 0);
const high = new BounceLight({ budgetMs: Infinity, maxWork: Infinity,
    reflectance: id => { seen.add(id); return [.1,.2,.7]; } });
flush(high, highWorld);
assert.deepEqual([...seen], [highId]);
assert.ok(high.sample(.5,17.5,.5)[2] > high.sample(.5,17.5,.5)[0]);
flush(high,highWorld,{...options,quality:'high'});
assert.equal(high.stats().rays,26,'wysoki profil dodaje kierunki, nie tylko czas CPU');
assert.ok(Math.max(...high.sample(.5,17.5,.5)) <= .18*.9);

// Maska biomu zmienia zieloną część tekstury; ziemia zachowuje albedo.
const tintedWorld=fixture((x,y,z)=>x===2&&y>=16&&y<=20&&Math.abs(z)<3?1:y===16?2:0,
    ()=>15,()=>true,[64,128,128]);
const tinted=full(); flush(tinted,tintedWorld);
const side=[...tinted.surfaces.values()].find(surface=>surface.x===2&&surface.y===18&&surface.face===1);
assert.ok(side,'widoczny bok trawy');
close(side.reflect[0],.4/2+.08/2*(64/127.5));
close(side.reflect[1],.1/2+.5/2*(128/127.5));
close(side.reflect[2],.04/2+.04/2*(128/127.5));

// Świat podczas wczytywania jest bezpiecznie ciemny, bez wyjątków.
const absent = full(); flush(absent, {getChunk:()=>null});
assert.deepEqual(absent.sample(.5,17.5,.5), [0,0,0]);
const limited = new BounceLight({ budgetMs:Infinity, maxWork:7 });
limited.update(world,center,options);
assert.equal(limited.stats().lastFrame.work,7);
assert.equal(limited.stats().ready,false);
limited.update(world,center,{...options,enabled:false});
assert.deepEqual(limited.sample(.5,17.5,.5),[0,0,0]);
assert.equal(limited.stats().lastFrame.work,0);
let clock=0;
const timed=new BounceLight({budgetMs:.6,maxWork:Infinity,now:()=>clock+=.05});
timed.update(world,center,options);
assert.ok(timed.stats().lastFrame.work>0&&timed.stats().lastFrame.work<12,'deadline przerywa zadanie');
assert.ok(timed.stats().lastFrame.milliseconds<=.7,'mały narzut granicy porcji');
const batchBefore=bounce.stats(), textureVersion=bounce.texture.version;
for(let i=0;i<100;i++) bounce.markChunk(world.getChunk(0,0));
assert.equal(bounce.texture.version,textureVersion,'markChunk nie uploaduje tekstury per mesh');
assert.equal(bounce.stats().cache.surfaces,batchBefore.cache.surfaces,'markChunk nie skanuje/usuwa powierzchni');
assert.equal(bounce.stats().invalidations,batchBefore.invalidations,'invalidacja czeka w kolejce budżetowej');
assert.equal(bounce.stats().pending.invalidation,true);
assert.deepEqual(bounce.sample(.5,17.5,.5),[0,0,0],'master blokuje stare światło przed skanem');
flush(bounce,world);
assert.equal(bounce.stats().invalidations,batchBefore.invalidations+1,'100 powiadomień to jedna paczka invalidacji');
assert.ok(bounce.sample(.5,17.5,.5)[0]>.01);
bounce.bind(); assert.equal(bounceUniforms.uBounceLight.value,bounce.texture);
high.bind(); assert.equal(bounceUniforms.uBounceLight.value,high.texture);
bounce.dispose(); assert.equal(bounceUniforms.uBounceLight.value,high.texture,'dispose innej sceny nie zeruje aktywnej');
for (const item of [high,roomBounce,absent,limited,tinted,timed]) item.dispose();
assert.ok(getReflect(2)[0] > getReflect(2)[1]);
console.log(JSON.stringify({status:'passed',earth,sand,sourceCache:initial.cache,memoryBytes:initial.memoryBytes,highId}));
