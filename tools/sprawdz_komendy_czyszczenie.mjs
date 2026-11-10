// Prawdziwe komendy oraz World: czyszczenie komórki usuwa także wodę,
// podczas gdy zbieranie i utrata podpory nadal zostawiają ciecz.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const url = path => new URL(`../${path}`, import.meta.url).href;
const commandUrl = url('src/commands/gameCommands.js');
const worldUrl = url('src/world/World.js');
const meteorUrl = url('src/game/Meteorites.js');
const realImports = new Map([
    [commandUrl, new Set(['./CommandRegistry.js', '../blocks/BlockRegistry.js', '../items/ItemRegistry.js',
        '../blocks/trees.js', '../blocks/treeCatalog.js', '../audio/sounds.js', '../world/terrain/rocks.js', '../config.js'])],
    [worldUrl, new Set(['../blocks/BlockRegistry.js', '../config.js', './Chunk.js', './Light.js'])],
    [meteorUrl, new Set(['three', '../blocks/BlockRegistry.js', '../config.js'])]
]);
const stubs = new Map();
for (const [parent, allowed] of realImports) {
    for (const [, bindings, specifier] of readFileSync(new URL(parent), 'utf8').matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
        if (allowed.has(specifier)) continue;
        const names = bindings.trim().startsWith('{')
            ? bindings.slice(bindings.indexOf('{')+1, bindings.lastIndexOf('}')).split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)
            : [];
        stubs.set(`${parent}|${specifier}`, `data:text/javascript,${encodeURIComponent(names.map(name => `export const ${name}=undefined;`).join('\n'))}`);
    }
}
registerHooks({
    resolve(specifier, context, next) {
        const stub = stubs.get(`${context.parentURL}|${specifier}`);
        return stub ? {url:stub,shortCircuit:true} : next(specifier === 'three' ? url('lib/three/three.module.js') : specifier, context);
    },
    load(path, context, next) {
        return next(path, path.endsWith('.js') && path.includes('/src/') ? {...context,format:'module'} : context);
    }
});
const { GAME_COMMANDS } = await import(commandUrl);
const { World } = await import(worldUrl);
const { BlockBreaker } = await import('../src/interaction/BlockBreaker.js');
const { Meteorites } = await import(meteorUrl);

function fixture() {
    const world = Object.assign(Object.create(World.prototype), {
        chunks:new Map(),savedChunks:new Map(),dirtyChunks:new Set(),unsavedChunks:new Set(),version:0,
        generator:{generateChunk(){}},light:{initChunk(){},blockChanged(){},takeChangedChunks(){}}
    });
    const vector = (x,y,z) => ({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});}});
    const player = {pos:vector(.5,50,.5),vel:vector(0,0,0),yaw:0,updateCamera(){}};
    const set = (x,y,z,type) => world.setBlock(x,y,z,type);
    const plant = (x=0,y=50,z=0,type='water_lily') => {set(x,y-1,z,'sand');set(x,y,z,type);};
    const run = (name,args) => GAME_COMMANDS.find(command => command.name === name).run(args,{
        world,player,game:{plantGrowth:{},settings:{get:()=>true}},time:{days:0},
        sky:{refresh(){},celestial:{sunHeight:.42,sunDirection:{x:1,z:0}}}
    });
    return {world,player,set,plant,run};
}
let checked=0;
function test(name,run){run();checked++;console.log(`OK: ${name}`);}

test('pełne czyszczenie usuwa komórkę raz, zbieranie nadal zachowuje wodę',()=>{
    for(const type of ['water_milfoil','water_lily','duckweed','cattail_water']){
        const f=fixture();f.plant(0,50,0,type);
        const before=f.world.version;
        assert.equal(f.world.clearBlock(0,50,0),true);
        assert.equal(f.world.getBlock(0,50,0),null);
        assert.equal(f.world.version,before+1);
        assert.equal(f.world.clearBlock(0,50,0),false);
        f.plant(0,50,0,type);
        new BlockBreaker(f.world).breakBlock({hit:true,block:{x:0,y:50,z:0}});
        assert.equal(f.world.getBlock(0,50,0),'water');
    }
});
test('wyczyszczenie samego dna nie usuwa wody sąsiedniej rośliny',()=>{
    const f=fixture();f.plant(0,50,0,'water_milfoil');
    f.world.clearBlock(0,49,0);
    assert.equal(f.world.getBlock(0,49,0),null);
    assert.equal(f.world.getBlock(0,50,0),'water');
});
test('/wypelnij powietrze usuwa wodne rośliny oraz poprawnie liczy zmiany',()=>{
    const f=fixture();f.plant();
    const args=['0','50','0','0','50','0','powietrze'];
    assert.equal(f.run('wypelnij',args),'Zmieniono 1 bloków.');
    assert.equal(f.world.getBlock(0,50,0),null);
    assert.equal(f.run('wypelnij',args),'Zmieniono 0 bloków.');
    f.run('wypelnij',[...args.slice(0,6),'stone']);
    assert.equal(f.world.getBlock(0,50,0),'stone');
});
test('/woda basen zostawia powietrze nad zaplanowaną taflą',()=>{
    const f=fixture();f.plant(0,50,-2);
    f.run('woda',['basen']);
    assert.equal(f.world.getBlock(0,50,-2),null);
    assert.equal(f.world.getBlock(0,49,-2),'water');
});
test('/demo skaly opróżnia wykop także z roślin wodnych',()=>{
    const f=fixture();f.plant(0,50,-3);
    f.run('demo',['skaly']);
    for(let y=1;y<=51;y++)assert.equal(f.world.getBlock(0,y,-3),null);
});
test('/demo swiatlo nie zostawia wiszącej wody we wnętrzu',()=>{
    const f=fixture();f.plant(1,52,-10);
    f.run('demo',['swiatlo']);
    assert.equal(f.world.getBlock(1,52,-10),null);
    assert.equal(f.world.getBlock(1,50,-10),'stone');
});
test('/krzaki ogrod opróżnia miejsce nad sadzonkami',()=>{
    const f=fixture();f.plant(-3,51,-3);
    f.run('krzaki',['ogrod']);
    assert.equal(f.world.getBlock(-3,51,-3),null);
    assert.equal(f.world.getBlock(-3,50,-3),'strawberry_sapling');
});
test('/demo okno usuwa wodę w roślinach przed oknami',()=>{
    const f=fixture();f.plant(6,6,-10);
    f.run('demo',['okno']);
    assert.equal(f.world.getBlock(6,6,-10),null);
});
test('misa krateru usuwa całą wodę, samo spalenie rośliny obok ją zostawia',()=>{
    const f=fixture();f.plant(0,50,0);f.set(1,50,0,'water');f.plant(6,50,0);
    const random=Math.random;
    Math.random=()=>1;
    try { Meteorites.prototype.carveCrater.call({game:{world:f.world}},0,50,0); }
    finally { Math.random=random; }
    assert.equal(f.world.getBlock(0,50,0),null);
    assert.equal(f.world.getBlock(1,50,0),null);
    assert.equal(f.world.getBlock(6,50,0),'water');
});

test('/pogoda steruje rzeczywistym przełącznikiem deszczu i odrzuca błędne natężenie',()=>{
    const command=GAME_COMMANDS.find(item=>item.name==='pogoda');
    const rain={intensity:0,setIntensity(value){this.intensity=value;}};
    const run=args=>command.run(args,{game:{rain}});
    assert.match(run([]),/Brak deszczu/);assert.equal(rain.intensity,0);
    run(['deszcz']);assert.equal(rain.intensity,1);
    run(['deszcz','40']);assert.equal(rain.intensity,.4);
    for(const args of [['deszcz','-1'],['deszcz','101'],['deszcz','abc'],['sucho','extra']]){
        assert.throws(()=>run(args));assert.equal(rain.intensity,.4);
    }
    run(['sucho']);assert.equal(rain.intensity,0);
    assert.throws(()=>command.run(['deszcz'],{}));
});
console.log(`Sprawdzonych przypadków komend: ${checked}.`);
