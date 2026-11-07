// Real Three buffers/material hooks and WaterfallEffects lifecycle, without a
// GPU. Shader assembly checks here complement the separate WebGL smoke test.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { WaterfallRipples, createRippleProfile, RIPPLE_PERIOD, RIPPLE_MAX_EMITTERS,
    RIPPLE_MAX_TILES, RIPPLE_PATCHES_PER_EMITTER } = await import('../src/rendering/WaterfallRipples.js');
const { WaterfallEffects } = await import('../src/rendering/WaterfallEffects.js');
const { WATER_WAVE_GLSL } = await import('../src/rendering/WaterWave.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { waterMaterial, setShadowDefine } = await import('../src/rendering/BlockRenderData.js');
const { shadowUniforms } = await import('../src/rendering/Shadows.js');
const { waterfallLightingAt } = await import('../src/rendering/WaterfallLighting.js');
const { composeSurfaceRadiance } = await import('../src/rendering/SurfaceLighting.js');
const { plantWindUniforms } = await import('../src/rendering/PlantWind.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const { skyUniforms } = await import('../src/sky/skyShader.js');
const { lightingUniforms } = await import('../src/rendering/LightingDiagnostics.js');
const { PerfDiagnostics, PERF_STAGES } = await import('../src/diagnostics/PerfDiagnostics.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { CHUNK_SIZE:S, CHUNK_HEIGHT:H } = await import('../src/config.js');
const { getBlockId, getWaterLevel, fallingWaterId, waterIdForLevel } = await import('../src/blocks/BlockRegistry.js');

let checks = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const ok = (value,label) => { assert.ok(value,label); checks++; };
const near = (a,b,label,tolerance=1e-5) => { ok(Math.abs(a-b) <= tolerance,`${label}: ${a} != ${b}`); };
const key = (x,z) => `${x},${z}`;
const light = { sky:.7, local:[.3,.1,0], classicShade:.6 };

function fixture() {
    const chunks = new Map();
    const world = {
        chunks, reads:0, experiments:{bushyGrass:false}, getGrassDetail:()=>0,
        getChunk(cx,cz) { this.reads++; return chunks.get(key(cx,cz)) ?? null; },
        getBlockId(x,y,z) {
            if (y < 0 || y >= H) return 0;
            const cx=Math.floor(x/S),cz=Math.floor(z/S);
            return this.getChunk(cx,cz)?.getId(x-cx*S,y,z-cz*S) ?? 0;
        },
        getLight:()=>({sky:15,red:0,green:0,blue:0}), getFlow:()=>null,
        generateChunk() { throw new Error('Ripple rendering must not generate terrain'); }
    };
    function set(x,y,z,id) {
        const cx=Math.floor(x/S),cz=Math.floor(z/S),k=key(cx,cz);
        let chunk=chunks.get(k);
        if (!chunk) { chunk=new Chunk(cx,cz);chunk.skyLight.fill(15);chunks.set(k,chunk); }
        chunk.setId(x-cx*S,y,z-cz*S,typeof id==='number'?id:getBlockId(id));
        chunk.meshRevision++;
        return chunk;
    }
    function pool(x,z,fall=8,radius=6) {
        for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)set(x+dx,20,z+dz,'water');
        set(x,21,z,fallingWaterId(fall));
        return {x,y:21,z,fall,distance:Math.hypot(x,z),lighting:light};
    }
    return {world,chunks,set,pool};
}

function finish(ripples) {
    for(let n=0;n<200;n++) {
        ripples.update(0);
        ok(ripples.surface.stats().lastProcessed<=48,'one renderer update respects the discovery cell cap');
        if(!ripples.surface.stats().queued)return;
    }
    assert.fail('Ripple geometry discovery did not finish');
}

function activeVertices(ripples) {
    return [...new Set(ripples.geometry.index.array.subarray(0,ripples.geometry.drawRange.count))];
}

function shaderOf(material) {
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,
        fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    material.onBeforeCompile(shader,{capabilities:{isWebGL2:true}});
    return shader;
}

function expandIncludes(source) {
    return source.replace(/#include <(\w+)>/g,(_,name)=>{
        assert.equal(typeof THREE.ShaderChunk[name],'string',`Shader chunk ${name} exists`);
        return expandIncludes(THREE.ShaderChunk[name]);
    });
}

// The radial profile is one small repeating data texture with a quiet seam.
{
    const texture=createRippleProfile(),pixels=texture.image.data;
    eq([texture.image.width,texture.image.height,pixels.byteLength],[128,1,512],'profile has a fixed 512-byte footprint');
    eq(texture.wrapS,THREE.RepeatWrapping,'profile wraps instead of clamping a moving ring');
    eq([texture.magFilter,texture.minFilter,texture.generateMipmaps],[THREE.LinearFilter,THREE.LinearFilter,false],'profile filtering is explicit');
    for(let channel=0;channel<3;channel++)eq([pixels[channel],pixels[127*4+channel]],[0,0],'both ends meet without a seam');
    ok(Array.from({length:128},(_,i)=>pixels[i*4]).some(value=>value>250),'profile contains a visible crest');
    ok(Array.from({length:128},(_,i)=>pixels[i*4+1]).some(value=>value>250),'profile contains its trailing trough');
    ok(Array.from({length:128},(_,i)=>pixels[i*4+3]).every(value=>value===255),'alpha is controlled by the shader, not accidental texture data');
    texture.dispose();
}

// The actual mesh agrees with the receiving water on both sides of a chunk
// corner. Wave weights must match as well, or the overlay intersects the water.
{
    const f=fixture(),landing=f.pool(-1,-1,8,4);
    f.set(0,20,0,waterIdForLevel(6));f.set(1,20,0,waterIdForLevel(3));
    f.set(0,20,1,waterIdForLevel(7));f.set(1,20,1,waterIdForLevel(5));
    f.set(-3,20,-1,0); // dry hole must have no overlay
    f.set(-2,21,1,'stone'); // covered receiving water must have no overlay
    f.world.getLight=(x,y,z)=>x<0?{sky:0,red:0,green:0,blue:0}:{sky:0,red:255,green:128,blue:0};
    const scene=new THREE.Scene(),ripples=new WaterfallRipples(scene,f.world,{now:()=>0});
    try {
        ripples.setLandings([landing]);finish(ripples);
        ok(ripples.mesh.visible && scene.children.includes(ripples.mesh),'completed ripple mesh joins the real scene');
        ok(ripples.surface.entries[0].patches.some(p=>p.x<0)&&ripples.surface.entries[0].patches.some(p=>p.x>=0),'ripple crosses the negative chunk boundary');
        const tops=new Map();
        for(const chunk of f.chunks.values()) {
            const mesh=buildChunkGeometry(chunk,f.world,{terrain:true,plants:false});
            if(!mesh)continue;
            const group=mesh.groups.find(group=>group.materialIndex===2);
            if(group)for(let face=group.start/6;face<(group.start+group.count)/6;face++) {
                const at=face*4,{position,plantMotion,normal}=mesh.attributes;
                if(plantMotion.array[at*2+1]!==255)continue;
                const points=[];
                for(let corner=0;corner<4;corner++)points.push({
                    x:position.getX(at+corner)+chunk.cx*S,y:position.getY(at+corner),z:position.getZ(at+corner)+chunk.cz*S,
                    wave:plantMotion.array[(at+corner)*2]/255,
                    normal:[normal.getX(at+corner),normal.getY(at+corner),normal.getZ(at+corner)]
                });
                tops.set(key(Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.z))),points);
            }
            mesh.dispose();
        }
        const entry=ripples.surface.entries[0],slot=ripples.slots.get(entry.id).index;
        const {position,normal,rippleMeta,rippleLight}=ripples.geometry.attributes;
        ok(!entry.patches.some(p=>p.x===-3&&p.z===-1),'dry hole has no opacity-bearing triangles');
        ok(!entry.patches.some(p=>p.x===-2&&p.z===1),'covered water has no opacity-bearing triangles');
        for(let p=0;p<entry.patches.length;p++) {
            const patch=entry.patches[p],top=tops.get(key(patch.x,patch.z));
            ok(top,'every overlay quad has a real exposed receiving-water quad');
            for(let c=0;c<4;c++) {
                const at=(slot*RIPPLE_PATCHES_PER_EMITTER+p)*4+c;
                const match=top.find(v=>v.x===position.getX(at)&&v.z===position.getZ(at));
                ok(match,'overlay corner matches water world coordinates');
                near(position.getY(at)-match.y,.008,'overlay sits just above the exact water vertex');
                near(rippleMeta.getX(at),match.wave,'overlay and water have identical wave deformation weights');
                for(const [axis,getter] of ['getX','getY','getZ'].entries())near(normal[getter](at),match.normal[axis],
                    'overlay and water use the same geometric lighting/shadow normal');
                eq(rippleLight.getW(at),0,'a lit impact cannot give a shaded receiving patch fake sky access');
                if(patch.x<0)eq([rippleLight.getX(at),rippleLight.getY(at),rippleLight.getZ(at)],[0,0,0],
                    'dark receiving water keeps all local light channels at zero');
                else {
                    near(rippleLight.getX(at),1,'receiving red lamp keeps its full linear red channel');
                    near(rippleLight.getY(at),(128/255)**2.2,'receiving lamp is decoded exactly once');
                    eq(rippleLight.getZ(at),0,'a red/green lamp adds no blue light');
                }
            }
        }
        const dark=waterfallLightingAt(f.world,-1,21,0);
        eq(dark.emission,0,'ripple lighting never invents its own emission');
        eq(composeSurfaceRadiance({albedo:[.5,.6,.7],natural:[0,0,0],local:dark.local}),[0,0,0],
            'atmospheric surface remains dark without natural or local light');

        const shader=shaderOf(ripples.material),water=shaderOf(waterMaterial);
        eq(shader.uniforms.uTime,plantWindUniforms.uTime,'overlay uses the water clock by identity');
        eq(shader.uniforms.uWaveHeight,plantWindUniforms.uWaveHeight,'overlay shares water wave amplitude');
        eq(water.uniforms.uTime,shader.uniforms.uTime,'water and overlay have exactly one wave clock');
        ok(shader.vertexShader.includes(WATER_WAVE_GLSL)&&water.vertexShader.includes(WATER_WAVE_GLSL),'both shaders use the same wave function');
        eq(shader.uniforms.uUnderwater,viewUniforms.uUnderwater,'underwater visibility uses the shared camera state');
        eq(shader.uniforms.uAtmosphericLight,skyUniforms.uAtmosphericLight,'atmosphere switches without replacing the material');
        eq(shader.uniforms.uLightingDebug,lightingUniforms.uLightingDebug,'lighting diagnostics use the shared state');
        for(const [name,uniform] of Object.entries(shadowUniforms))eq(shader.uniforms[name],uniform,
            `${name}: ripple samples the same shadow state as receiving terrain`);
        for(const uniform of ['uRippleTime','uRippleAmount','uRippleProfile'])eq(shader.uniforms[uniform],ripples.material.uniforms[uniform],`${uniform} updates the compiled shader directly`);
        ok(/if\s*\(uUnderwater > 0\.5\) discard/.test(shader.fragmentShader),'surface ripples are explicitly hidden underwater');
        ok(/if\s*\(radial >= 1\.0\) discard/.test(shader.fragmentShader),'radial profile cannot shade beyond its radius');
        ok(shader.fragmentShader.includes('surfaceRadiance(')&&shader.fragmentShader.includes('applyBrightness('),'surface lighting and brightness are applied');
        ok(shader.fragmentShader.includes('sunShadowLight(vRipplePosition, normalize(vRippleNormal), rippleSky)'),
            'shadow lookup uses actual wave-displaced world coordinates and slope normals');
        ok(shader.vertexShader.includes('rippleWorld.y += rippleWave'),'shadow receiver follows animated water height');
        ok(shader.fragmentShader.includes('? rippleSun : rippleSky')&&shader.fragmentShader.includes('irradiance *= rippleAmbient'),
            'shadowed directional light and ambient access are applied separately');
        for(const [enabled,far] of [[true,false],[true,true],[false,false]]) {
            setShadowDefine([ripples.material],enabled,far);
            eq(Object.hasOwn(ripples.material.defines,'USE_SUN_SHADOWS'),enabled,'shadow setting reaches ripple shader defines');
            eq(Object.hasOwn(ripples.material.defines,'USE_FAR_SHADOWS'),enabled&&far,'far-shadow setting reaches ripple shader defines');
            const variant=shaderOf(ripples.material);
            ok(expandIncludes(variant.fragmentShader).includes('surfaceRadiance('),'all shadow variants preserve complete shader assembly');
        }
        for(const [stage,source] of [['vertex',shader.vertexShader],['fragment',shader.fragmentShader]]) {
            const expanded=expandIncludes(source);
            ok(!expanded.includes('#include <'),`${stage}: every real Three shader include resolves`);
            ok(!/\bundefined\b|\bNaN\b/.test(expanded),`${stage}: assembly introduces no invalid tokens`);
        }
        for(const uniform of ['uRippleTime','uRippleAmount','uRippleProfile','uAtmosphericLight','uUnderwater']) {
            eq((shader.fragmentShader.match(new RegExp(`uniform \\w+ ${uniform};`,'g'))??[]).length,1,`${uniform} has one declaration`);
        }
        eq(ripples.material.depthWrite,false,'transparent overlay does not hide other water with its depth buffer');
        eq(ripples.material.side,THREE.FrontSide,'overlay has no visible underside');
        eq(ripples.mesh.castShadow,false,'surface decal does not cast a solid shadow');

        const before={geometry:ripples.geometry,texture:ripples.texture,material:ripples.material,
            revision:ripples.geometryRevision,index:ripples.geometry.index.version,
            arrays:Object.fromEntries(Object.entries(ripples.geometry.attributes).map(([name,a])=>[name,a.array])),
            versions:Object.fromEntries(Object.entries(ripples.geometry.attributes).map(([name,a])=>[name,a.version]))};
        const phases=activeVertices(ripples).map(at=>ripples.geometry.attributes.rippleMeta.getY(at));
        for(let frame=0;frame<180;frame++)ripples.update(1/60);
        eq([ripples.geometry,ripples.texture,ripples.material],[before.geometry,before.texture,before.material],'animation reuses geometry, material and texture');
        eq([ripples.geometryRevision,ripples.geometry.index.version],[before.revision,before.index],'animation alone never rebuilds or uploads indices');
        for(const [name,attribute] of Object.entries(ripples.geometry.attributes)) {
            ok(attribute.array===before.arrays[name],`${name}: no animation allocation`);
            eq(attribute.version,before.versions[name],`${name}: no animation upload`);
        }
        near(ripples.material.uniforms.uRippleTime.value,.6,'animation wraps at the declared 2.4-second period');
        const phaseScale=Number(shader.fragmentShader.match(/uRippleTime \* ([\d.]+)/)[1]);
        near(phaseScale*RIPPLE_PERIOD,3,'loop wraps by exactly three complete texture cycles');
        ok(phases.every(phase=>phase>=0&&phase<1),'negative coordinates still produce valid stable phases');
        const atTime=ripples.material.uniforms.uRippleTime.value;
        for(const invalid of [NaN,Infinity,-10])ripples.update(invalid);
        eq(ripples.material.uniforms.uRippleTime.value,atTime,'invalid or negative frame duration cannot poison animation');

        f.set(0,20,0,'stone');ripples.update(0);finish(ripples);
        ok(!ripples.surface.entries[0].patches.some(p=>p.x===0&&p.z===0),'editing water into land removes its overlay');
        const refreshed=activeVertices(ripples).map(at=>ripples.geometry.attributes.rippleMeta.getY(at));
        ok(refreshed.every(phase=>phase===phases[0]),'geometry refresh does not restart or shift the rings');
    } finally { ripples.dispose(); }
}

// Capacity and lifetime are independent of how many impacts the caller finds.
{
    const f=fixture(),landings=Array.from({length:16},(_,n)=>f.pool(n*16+8,8,16,6));
    const scene=new THREE.Scene(),ripples=new WaterfallRipples(scene,f.world,{now:()=>0});
    const disposed={geometry:0,material:0,texture:0};
    for(const name of Object.keys(disposed))ripples[name].addEventListener('dispose',()=>disposed[name]++);
    ripples.setLandings(landings);finish(ripples);
    eq(ripples.surface.entries.length,RIPPLE_MAX_EMITTERS,'high detail caps the emitter count');
    ok(ripples.stats().tiles<=RIPPLE_MAX_TILES,'draw count never exceeds reserved tile capacity');
    eq(ripples.stats().draws,1,'all emitters use one draw');
    eq(ripples.geometry.getAttribute('position').count,RIPPLE_MAX_TILES*4,'vertex allocation is fixed at construction');
    eq(ripples.geometry.index.array.length,RIPPLE_MAX_TILES*6,'index allocation is fixed at construction');
    ok(activeVertices(ripples).every(index=>index>=0&&index<RIPPLE_MAX_TILES*4),'every submitted index lies inside all attribute buffers');
    eq(ripples.stats().triangles,ripples.geometry.drawRange.count/3,'diagnostic triangles match the actual draw range');
    ripples.setLandings(landings,.35);finish(ripples);
    eq(ripples.surface.entries.length,4,'low detail releases surplus emitters');
    eq(ripples.slots.size,4,'low detail releases surplus GPU slots');
    near(ripples.material.uniforms.uRippleAmount.value,.75,'low detail applies its lower opacity');
    ripples.setLandings(landings,0);ripples.update(0);
    eq([ripples.geometry.drawRange.count,ripples.slots.size,ripples.mesh.visible],[0,0,false],'disabled effect draws no old slots');
    ripples.setLandings(landings);finish(ripples);
    const uniformsTime=ripples.material.uniforms.uRippleTime.value,revision=ripples.geometryRevision;
    ripples.dispose();ripples.dispose();ripples.setLandings(landings);ripples.update(1);
    eq(disposed,{geometry:1,material:1,texture:1},'dispose releases all GPU objects exactly once');
    eq(scene.children.length,0,'dispose detaches the overlay from its scene');
    eq([ripples.slots.size,ripples.surface.entries.length,ripples.surface.jobs.length],[0,0,0],'dispose releases emitter/patch/job references');
    eq(ripples.surface.world,null,'dispose releases its world reference');
    eq(ripples.surface.lightingAt,null,'dispose releases the lighting callback which captured the world');
    eq([ripples.material.uniforms.uRippleTime.value,ripples.geometryRevision],[uniformsTime,revision],'disposed effect cannot animate or resurrect');
}

// Existing effect discovery, setting changes, diagnostics and teardown all
// reach the new renderer through their real integration paths.
{
    const f=fixture(),landing=f.pool(8,8,6,3),scene=new THREE.Scene();
    let active=true;
    f.world.fluids={forEachLanding(x,z,radius,visit){if(active)visit(landing.x,landing.y,landing.z,landing.fall);}};
    const effect=new WaterfallEffects(scene,f.world),player={pos:new THREE.Vector3(8.5,23,8.5)};
    effect.ripples.surface.now=()=>0;
    try {
        effect.update(0,player);finish(effect.ripples);
        ok(effect.ripples.mesh.visible,'WaterfallEffects publishes real landing data to the renderer');
        eq(effect.lightingAt(8,21,8),waterfallLightingAt(f.world,8,21,8),'particles and ripples share one light decoding policy');
        const diagnostics=new PerfDiagnostics();diagnostics.lastGame={world:f.world,waterfalls:effect};
        const revision=effect.ripples.geometryRevision;
        eq(diagnostics.resources().waterfallRipples.triangles,effect.ripples.geometry.drawRange.count/3,'diagnostics exposes actual waterfall geometry');
        eq(effect.ripples.geometryRevision,revision,'reading diagnostics never rebuilds ripples');
        ok(PERF_STAGES.some(([name])=>name==='waterfalls'),'waterfall work has its own profiling stage');
        effect.setAmount(0);effect.update(0,player);
        eq(effect.ripples.mesh.visible,false,'WaterfallEffects disabling removes surface ripples');
        effect.setAmount(1);effect.update(0,player);finish(effect.ripples);
        ok(effect.ripples.mesh.visible,'reenabling restores current landings');
        active=false;effect.refresh=0;effect.update(0,player);
        eq(effect.ripples.mesh.visible,false,'the next discovery removes drained waterfall rings');
        active=true;effect.refresh=0;effect.update(0,player);finish(effect.ripples);
        ok(effect.ripples.mesh.visible,'valid impacts can return after draining');
        delete f.world.fluids;effect.refresh=0;effect.update(0,player);
        eq(effect.ripples.mesh.visible,false,'losing the landing provider clears old surface rings');
    } finally { effect.dispose(); }
    eq(scene.children.length,0,'effect teardown removes both particle and ripple meshes');
}

console.log(`OK: renderowanie fal — ${checks} sprawdzeń siatki, shaderów, pętli, limitów, braku aktualizacji GPU i cyklu życia.`);
