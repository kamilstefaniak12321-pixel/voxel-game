// Real Three geometries/material hooks. WebGL compilation and GPU timings are
// deliberately left to the browser smoke/benchmark job.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            import { Color } from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { WaterfallEffects, waterfallStrength, MIST_FALL, WATERFALL_RADIUS } = await import('../src/rendering/WaterfallEffects.js');
const { WaterfallFoam, createFoamPattern } = await import('../src/rendering/WaterfallFoam.js');
const { WaterfallMist, createMistPattern, MIST_MAX_INSTANCES, MIST_LOW_INSTANCES, MIST_MIN_FALL, MIST_FADE_RANGE } = await import('../src/rendering/WaterfallMist.js');
const { WaterfallRipples, RIPPLE_MAX_TILES, RIPPLE_PATCHES_PER_EMITTER } = await import('../src/rendering/WaterfallRipples.js');
const { WATER_WAVE_GLSL } = await import('../src/rendering/WaterWave.js');
const { plantWindUniforms } = await import('../src/rendering/PlantWind.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const { shadowUniforms } = await import('../src/rendering/Shadows.js');
const { skyUniforms } = await import('../src/sky/skyShader.js');
const { lightingUniforms } = await import('../src/rendering/LightingDiagnostics.js');
const { composeSurfaceRadiance, SURFACE_LIGHTING_GLSL } = await import('../src/rendering/SurfaceLighting.js');
const { waterEffectLightUniforms, WATER_EFFECT_DYNAMIC_LIGHT_GLSL } = await import('../src/rendering/WaterEffectDynamicLight.js');
const { waterfallLightingAt } = await import('../src/rendering/WaterfallLighting.js');
const { setShadowDefine } = await import('../src/rendering/BlockRenderData.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { CHUNK_SIZE:S, CHUNK_HEIGHT:H } = await import('../src/config.js');
const { getBlockId, fallingWaterId, waterIdForLevel } = await import('../src/blocks/BlockRegistry.js');

let checks = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const ok = (value,label) => { assert.ok(value,label); checks++; };
const near = (a,b,label,tolerance=1e-5) => ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);
const key = (x,z) => `${x},${z}`;
const light = { sky:.6, local:[.4,.2,0], classicShade:.5 };
const dark = { sky:0, local:[0,0,0], classicShade:0 };

function fixture() {
    const chunks = new Map(), landings = [];
    const world = { chunks, reads:0, lightReads:0, flowCalls:[],
        getChunk(cx,cz) { this.reads++; return chunks.get(key(cx,cz)) ?? null; },
        getBlockId(x,y,z) {
            if(y<0||y>=H)return 0;
            const cx=Math.floor(x/S),cz=Math.floor(z/S);
            return this.getChunk(cx,cz)?.getId(x-cx*S,y,z-cz*S)??0;
        },
        getLight(x) { this.lightReads++; return x<0?{sky:0,red:0,green:0,blue:0}:{sky:0,red:255,green:128,blue:0}; },
        getWaterFlow(x,y,z) { this.flowCalls.push([x,y,z]); return [.6,-.8]; },
        getFlow() { throw new Error('Available dynamic flow must be preferred'); },
        fluids:{forEachLanding(x,z,r,visit){for(const landing of landings)visit(landing.x,landing.y,landing.z,landing.fall);}},
        generateChunk() { throw new Error('Foam and mist must not generate terrain'); }
    };
    function set(x,y,z,id) {
        const cx=Math.floor(x/S),cz=Math.floor(z/S),k=key(cx,cz);
        let chunk=chunks.get(k);
        if(!chunk){chunk=new Chunk(cx,cz);chunks.set(k,chunk);}
        chunk.setId(x-cx*S,y,z-cz*S,typeof id==='number'?id:getBlockId(id));
        chunk.meshRevision++;
    }
    function pool(x,z,fall=10,radius=4) {
        for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)set(x+dx,20,z+dz,'water');
        set(x,21,z,fallingWaterId(fall));
        const landing={x,y:21,z,fall,surface:20.88,distance:Math.hypot(x,z),flowX:.6,flowZ:-.8,lighting:light};
        landings.push(landing);return landing;
    }
    return {world,landings,set,pool};
}

function finish(ripples, foam) {
    for(let n=0;n<300;n++) {
        ripples.update(0);foam?.update(0);
        if(!ripples.surface.stats().queued)return;
    }
    assert.fail('Bounded surface discovery did not settle');
}
function versions(geometry) {
    return [geometry.index?.version,...Object.values(geometry.attributes).map(attribute=>attribute.version)];
}
function shaderOf(material) {
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
    material.onBeforeCompile(shader,{capabilities:{isWebGL2:true}});return shader;
}
function expand(source) {
    return source.replace(/#include <(\w+)>/g,(_,name)=>{
        assert.equal(typeof THREE.ShaderChunk[name],'string',`Known shader chunk ${name}`);
        return expand(THREE.ShaderChunk[name]);
    });
}

// Original, deterministic procedural textures have a fixed memory footprint.
{
    const foam=createFoamPattern(),foamAgain=createFoamPattern(),mist=createMistPattern();
    eq(foam.image.data,foamAgain.image.data,'foam pattern is reproducible, independent of global random state');
    eq([foam.image.width,foam.image.height,foam.image.data.byteLength],[64,64,16384],'foam texture remains 16 KiB');
    eq([foam.wrapS,foam.wrapT],[THREE.RepeatWrapping,THREE.RepeatWrapping],'foam can drift without clamped edges');
    const broad=new Set(),fine=new Set();
    for(let p=0;p<64*64;p++){broad.add(foam.image.data[p*4]);fine.add(foam.image.data[p*4+1]);}
    ok(broad.size>100&&fine.size>100,'foam has irregular patterns at two different scales');
    eq([mist.image.width,mist.image.height,mist.image.data.byteLength],[32,32,4096],'mist texture remains 4 KiB');
    for(let i=0;i<32;i++)for(const p of [i,31*32+i,i*32,i*32+31])eq(mist.image.data[p*4+3],0,'all billboard edges are fully transparent');
    ok(mist.image.data[(16*32+16)*4+3]>150,'soft mist has visible density inside');
    ok(mist.image.data[(16*32+27)*4+3]<mist.image.data[(16*32+22)*4+3],'mist fades gradually towards its edge');
    for(const texture of [foam,mist])eq([texture.minFilter,texture.magFilter,texture.generateMipmaps],
        [THREE.LinearFilter,THREE.LinearFilter,false],'small effect textures use soft filtering without extra mip levels');
    foam.dispose();foamAgain.dispose();mist.dispose();
}

// Shared water mask crosses negative-coordinate chunk seams. Neither a dry
// hole nor a covered cell can receive foam even when inside the radial mask.
{
    const f=fixture(),landing=f.pool(-1,-1),scene=new THREE.Scene();
    f.set(-3,20,-1,0);f.set(-2,21,1,'stone');f.set(1,20,-1,waterIdForLevel(5));
    const ripples=new WaterfallRipples(scene,f.world),foam=new WaterfallFoam(scene,ripples.surface);
    ripples.setLandings([landing]);foam.setLandings([landing]);finish(ripples,foam);
    ok(foam.tiles>10,'real receiving surface produces a substantial connected foam mask');
    eq(foam.tiles,ripples.tiles,'foam reuses the exact connected patch selection');
    for(const entry of ripples.surface.entries) {
        ok(!entry.patches.some(p=>p.x===-3&&p.z===-1),'dry land has no foam geometry');
        ok(!entry.patches.some(p=>p.x===-2&&p.z===1),'water covered by stone has no foam geometry');
        const slot=foam.slots.get(entry.id).index,rippleSlot=ripples.slots.get(entry.id).index;
        const a=foam.geometry.attributes,r=ripples.geometry.attributes;
        for(let p=0;p<entry.patches.length;p++)for(let c=0;c<4;c++) {
            const at=(slot*RIPPLE_PATCHES_PER_EMITTER+p)*4+c,rt=(rippleSlot*RIPPLE_PATCHES_PER_EMITTER+p)*4+c;
            near(a.position.getX(at),r.position.getX(rt),'same X corner across chunk borders');
            near(a.position.getZ(at),r.position.getZ(rt),'same Z corner across chunk borders');
            near(a.position.getY(at)-r.position.getY(rt),.004,'foam sits 0.004 above ripples and follows the same slope');
            for(const getter of ['getX','getY','getZ'])near(a.normal[getter](at),r.normal[getter](rt),'same area-weighted water lighting normal');
            near(a.foamWave.getX(at),r.rippleMeta.getX(rt),'wave deformation weight matches the water');
            for(const getter of ['getX','getY','getZ','getW'])near(a.effectLight[getter](at),r.rippleLight[getter](rt),'per-patch light is borrowed without whitening shaded banks');
            near(a.foamFlow.getX(at),.6,'foam uses receiving-water X flow');near(a.foamFlow.getY(at),-.8,'foam uses receiving-water Z flow');
        }
    }
    const before=versions(foam.geometry),revision=foam.geometryRevision,sourceRevision=ripples.surface.revision;
    const reads=f.world.reads,lightReads=f.world.lightReads,texture=foam.texture,geometry=foam.geometry;
    for(let frame=0;frame<180;frame++)foam.update(1/60);
    eq([f.world.reads,f.world.lightReads],[reads,lightReads],'180 foam animation frames do not read terrain or lighting');
    eq(versions(foam.geometry),before,'animation uploads no vertex/index attributes');
    eq([foam.geometryRevision,ripples.surface.revision],[revision,sourceRevision],'animation cannot mutate discovery or geometry revisions');
    eq([foam.texture,foam.geometry],[texture,geometry],'animation reuses texture and buffers');
    near(foam.stats().time,3,'foam advances with elapsed time');
    foam.setTime(1.25);foam.update(0);near(foam.stats().time,1.25,'fixed phase is reproducible for screenshot/GPU tests');
    foam.update(NaN);foam.update(-1);near(foam.stats().time,1.25,'invalid time steps cannot poison shader state');
    foam.setAmount(0);eq(foam.stats().draws,0,'foam can be disabled independently');
    foam.setAmount(1);eq(foam.stats().draws,1,'re-enabling foam restores the cached mesh');
    const entry=ripples.surface.entries[0],patch=entry.patches.find(p=>p.x!==-1&&p.z!==-1);
    f.set(patch.x,patch.y,patch.z,'stone');finish(ripples,foam);
    ok(!ripples.surface.entries.some(e=>e.patches.some(p=>p.x===patch.x&&p.z===patch.z)),
        'removing receiving water invalidates the borrowed mask and removes foam');
    eq(foam.tiles,ripples.tiles,'foam follows invalidation and completed rebuilds without its own search');
    let disposed=0;for(const owned of [foam.geometry,foam.material,foam.texture])owned.addEventListener('dispose',()=>disposed++);
    foam.dispose();foam.dispose();eq(disposed,3,'each owned foam GPU resource is released exactly once');
    ok(ripples.surface.world===f.world,'disposing foam never disposes its borrowed surface');
    ripples.dispose();eq(scene.children.length,0,'foam and ripples leave no scene objects');
}

// Adversarial input cannot exceed the allocation or index capacity. Independent
// low-detail/off controls also work if the borrowed surface stays at full detail.
{
    const patch={x:0,y:20,z:0,heights:[.875,.875,.875,.875],waves:[255,255,255,255],lighting:dark};
    const surface={revision:1,entries:Array.from({length:100},(_,id)=>({id,key:`${id},20,0`,x:id+.5,z:.5,y:20,
        radius:6,opacity:.44,lighting:light,revision:1,patches:Array.from({length:300},()=>patch)}))};
    const scene=new THREE.Scene(),foam=new WaterfallFoam(scene,surface);
    foam.update(0);eq(foam.tiles,RIPPLE_MAX_TILES,'full foam is capped at 12 × 169 patches');
    ok(Math.max(...foam.geometry.index.array)<foam.geometry.attributes.position.count,'all foam indices remain inside allocated storage');
    eq(foam.geometry.attributes.effectLight.getX(0),0,'patch darkness takes priority over a bright impact');
    foam.setAmount(0);foam.setAmount(.3);eq(foam.tiles,4*169,'off-to-low does not accidentally retain the full-detail mask');
    foam.setAmount(1);eq(foam.tiles,RIPPLE_MAX_TILES,'full detail can be restored without source mutation');
    foam.setAmount(0);const before=versions(foam.geometry),revision=foam.geometryRevision;
    surface.entries=[];surface.revision++;foam.update(0);
    eq([versions(foam.geometry),foam.geometryRevision],[before,revision],'disabled foam skips source rebuilds as well as GPU drawing');
    foam.setAmount(1);foam.update(0);
    eq([foam.stats().tiles,foam.stats().draws,foam.geometry.drawRange.count],[0,0,0],'empty discovery hides and clears active geometry');
    foam.dispose();
}

// Replace the obsolete cube-foam lifetime/rate assertions with the actual
// surface radius/opacity and billboard data consumed by the new renderers.
{
    const f=fixture(),landing=f.pool(0,0),scene=new THREE.Scene();
    const ripples=new WaterfallRipples(scene,f.world),foam=new WaterfallFoam(scene,ripples.surface),mist=new WaterfallMist(scene);
    let previous=null;
    for(let fall=1;fall<=16;fall++) {
        landing.fall=fall;ripples.setLandings([landing]);finish(ripples,foam);mist.setLandings([landing]);
        const entry=ripples.surface.entries[0],at=foam.slots.get(entry.id).index*RIPPLE_PATCHES_PER_EMITTER*4;
        const radius=foam.geometry.attributes.foamParams.getZ(at),opacity=foam.geometry.attributes.foamParams.getW(at);
        if(previous){ok(radius>previous.radius,'higher impact spreads actual flat foam farther');ok(opacity>previous.opacity,'higher impact increases actual foam coverage');}
        eq(mist.geometry.instanceCount>0,fall>=MIST_FALL,'actual mist starts only at the agreed fall threshold');
        if(fall>=MIST_FALL) {
            const density=mist.geometry.attributes.mistParams.getW(0);
            if(previous?.mist){ok(mist.geometry.instanceCount>=previous.mist,'higher fall cannot reduce its own mist layers');ok(density>previous.density,'higher fall increases actual mist density');}
            previous={radius,opacity,mist:mist.geometry.instanceCount,density};
        }else previous={radius,opacity,mist:0};
    }
    foam.dispose();mist.dispose();ripples.dispose();
}

// Tall waterfalls receive a bounded, soft instanced mist; short falls receive
// none. Settled simulation and camera rotation update uniforms only.
{
    const scene=new THREE.Scene(),mist=new WaterfallMist(scene);
    const make=(x,fall=16)=>({x,y:21,z:0,fall,surface:20.875,distance:Math.abs(x),flowX:.6,flowZ:-.8,lighting:dark});
    mist.setLandings([make(0,MIST_MIN_FALL-1)]);eq(mist.stats().instances,0,'short waterfalls produce no mist');
    mist.setLandings([make(0,MIST_MIN_FALL)]);eq(mist.stats().instances,1,'threshold waterfall produces one soft wisp');
    const landings=Array.from({length:100},(_,x)=>make(x));mist.setLandings(landings);
    eq([mist.stats().instances,mist.stats().draws,mist.stats().triangles],[MIST_MAX_INSTANCES,1,64],
        '100 waterfall candidates still use one draw and at most 32 billboards');
    ok(mist.geometry.isInstancedBufferGeometry,'one instanced quad is reused for all wisps');
    eq(mist.geometry.attributes.position.count,4,'billboards do not duplicate a cube mesh');
    for(let i=0;i<mist.geometry.instanceCount;i++)eq(Array.from(mist.geometry.attributes.effectLight.array.subarray(i*4,i*4+4)),[0,0,0,0],
        'unlit mist has zero natural and RGB light');
    const before=versions(mist.geometry),revision=mist.bufferRevision,pattern=mist.texture;
    const camera=new THREE.PerspectiveCamera();camera.rotation.set(.3,.8,-.2);camera.updateMatrixWorld();
    for(let frame=0;frame<180;frame++)mist.update(1/60,camera);
    mist.setLandings(landings);
    eq([versions(mist.geometry),mist.bufferRevision],[before,revision],'180 animation frames and identical refresh do not upload instance data');
    eq(mist.texture,pattern,'mist animation never allocates another texture');
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
    near(mist.material.uniforms.uMistRight.value.distanceTo(right),0,'billboard horizontal axis follows the camera');
    near(mist.material.uniforms.uMistUp.value.distanceTo(up),0,'billboard vertical axis follows the camera');
    mist.setTime(2.5);mist.update(0,camera);near(mist.stats().time,2.5,'mist phase can be fixed independently');
    mist.update(Infinity);mist.update(-1);near(mist.stats().time,2.5,'invalid dt leaves the mist phase finite');
    mist.setAmount(.3);eq([mist.stats().instances,mist.stats().maxInstances],[MIST_LOW_INSTANCES,MIST_LOW_INSTANCES],'low detail caps mist at 8');
    mist.setAmount(0);eq([mist.stats().instances,mist.stats().draws],[0,0],'mist disables immediately');
    mist.setAmount(1);eq(mist.stats().instances,MIST_MAX_INSTANCES,'mist can restore full detail from its bounded landing snapshot');
    let disposed=0;for(const owned of [mist.geometry,mist.material,mist.texture])owned.addEventListener('dispose',()=>disposed++);
    mist.dispose();mist.dispose();eq(disposed,3,'mist releases exactly its three owned GPU resources');
    eq(scene.children.length,0,'mist disposal removes its scene object');
}

// Assemble actual Lambert shader hooks and every Three include under all
// shadow settings. This is a structural test, not a claim of GPU compilation.
{
    const scene=new THREE.Scene(),foam=new WaterfallFoam(scene,{revision:0,entries:[]}),mist=new WaterfallMist(scene);
    for(const layer of [foam,mist])for(const [enabled,far] of [[false,false],[true,false],[true,true]]) {
        setShadowDefine([layer.material],enabled,far);
        const shader=shaderOf(layer.material);
        eq(Object.hasOwn(layer.material.defines,'USE_SUN_SHADOWS'),enabled,'shadow setting reaches new layer');
        eq(Object.hasOwn(layer.material.defines,'USE_FAR_SHADOWS'),enabled&&far,'far-shadow setting reaches new layer');
        for(const [name,uniform] of Object.entries(shadowUniforms))eq(shader.uniforms[name],uniform,`${name}: shared shadow state`);
        for(const [name,uniform] of Object.entries(waterEffectLightUniforms))eq(shader.uniforms[name],uniform,
            `${name}: shared held-lamp and analytic-light state, without a second CPU light field`);
        eq(shader.uniforms.uUnderwater,viewUniforms.uUnderwater,'underwater state stays synchronized');
        eq(shader.uniforms.uAtmosphericLight,skyUniforms.uAtmosphericLight,'atmospheric lighting mode stays synchronized');
        eq(shader.uniforms.uLightingDebug,lightingUniforms.uLightingDebug,'debug lighting works for new layers');
        ok(shader.fragmentShader.includes('if (uUnderwater > 0.5 || uEffectAmount <= 0.0) discard;'),'effect is hidden underwater and when disabled');
        ok(shader.fragmentShader.includes('sunShadowLight(vEffectWorld, normalize(vEffectNormal), effectSky)'),
            'shadows sample actual animated world positions and water-style normals');
        ok(shader.fragmentShader.includes('waterEffectLocalLight(vEffectLight.rgb, vEffectWorld, normalize(vEffectNormal), 1.0), vec3(0.0), vec3(0.0)'),
            'full voxel RGB combines with the shared held lamp before composition, without invented bounce or emission');
        ok(!shader.fragmentShader.includes('vEffectLight.rgb * uAtmosphericLight'),
            'classic mode must not erase voxel lamp colour before composition');
        ok(shader.fragmentShader.includes(WATER_EFFECT_DYNAMIC_LIGHT_GLSL)
            && shader.fragmentShader.indexOf(SURFACE_LIGHTING_GLSL)<shader.fragmentShader.indexOf(WATER_EFFECT_DYNAMIC_LIGHT_GLSL),
            'shared dynamic-light functions follow their surface-lighting dependencies');
        const surfaceAt=shader.fragmentShader.indexOf('outgoingLight = surfaceRadiance(');
        const analyticAt=shader.fragmentShader.indexOf('outgoingLight += waterEffectAnalyticRadiance(diffuseColor.rgb, vEffectWorld, normalize(vEffectNormal));');
        const brightnessAt=shader.fragmentShader.indexOf('outgoingLight = applyBrightness(');
        ok(surfaceAt>=0&&analyticAt>surfaceAt&&brightnessAt>analyticAt,
            'analytic lights add their radiance after surface composition and before user brightness');
        ok(shader.fragmentShader.includes('applyBrightness('),'brightness settings affect both new materials');
        eq(layer.material.blending,THREE.NormalBlending,'mist and foam use ordinary alpha blending, never additive glow');
        eq([layer.material.depthWrite,layer.material.transparent,layer.mesh.castShadow],[false,true,false],'transparent effects do not write solid shadows or occluders');
        for(const source of [shader.vertexShader,shader.fragmentShader]) {
            const expanded=expand(source);ok(!expanded.includes('#include <'),'all actual Three shader includes resolve');
            ok(!/\bundefined\b|\bNaN\b/.test(expanded),'shader assembly introduces no invalid values');
        }
    }
    const foamShader=shaderOf(foam.material),mistShader=shaderOf(mist.material);
    eq(foamShader.uniforms.uTime,plantWindUniforms.uTime,'foam shares the exact water-wave clock');
    eq(foamShader.uniforms.uWaveHeight,plantWindUniforms.uWaveHeight,'foam shares water-wave amplitude');
    ok(foamShader.vertexShader.includes(WATER_WAVE_GLSL),'foam uses the exact water wave function');
    ok(foamShader.fragmentShader.includes('if (radial >= 1.0) discard;'),'foam cannot spread beyond its impact radius');
    ok(mistShader.vertexShader.includes('uMistRight * position.x + uMistUp * position.y'),'GPU constructs camera-facing mist quads');
    ok(mistShader.fragmentShader.includes('smoothstep(0.20, 0.85'),'mist fades out close to the camera');
    ok(mistShader.fragmentShader.includes('float mistDistance = length(vEffectWorld - cameraPosition);'),
        'distance fading uses the actual camera and animated fragment, never a stale landing distance');
    ok(mistShader.fragmentShader.includes('float farFade = 1.0 - smoothstep(24.0, 38.0, mistDistance);')
        && mistShader.fragmentShader.includes('vMistOpacity * nearFade * farFade;'),
        'far fade smoothly reaches zero before landing discovery removes the waterfall');
    ok(MIST_FADE_RANGE[1]<WATERFALL_RADIUS,'mist is already transparent before the 40-block landing cutoff');
    const fadeAt=distance=>{
        const t=Math.max(0,Math.min(1,(distance-MIST_FADE_RANGE[0])/(MIST_FADE_RANGE[1]-MIST_FADE_RANGE[0])));
        return 1-t*t*(3-2*t);
    };
    eq([fadeAt(0),fadeAt(24),fadeAt(31),fadeAt(38),fadeAt(40)],[1,1,.5,0,0],
        'mist fades continuously from full opacity to zero before the selection boundary');
    ok(fadeAt(37.99)<.00001,'approaching the cutoff produces no visible opacity step');
    eq(composeSurfaceRadiance({albedo:[.85,.9,.9],natural:[0,0,0],local:[0,0,0]}),[0,0,0],
        'shared lighting policy leaves completely unlit mist and foam black');
    const redLamp=waterfallLightingAt({getLight:()=>({sky:0,red:255,green:0,blue:0})},0,20,0);
    for(const layer of [foam,mist])for(const atmosphere of [false,true]) {
        const albedo=layer.material.color.toArray();
        const radiance=composeSurfaceRadiance({albedo,natural:[0,0,0],local:redLamp.local,atmosphere});
        eq(radiance,[albedo[0],0,0],`${layer.material.name}: red lamp retains its colour and brightness in ${atmosphere?'atmospheric':'classic'} mode`);
    }
    foam.dispose();mist.dispose();
}

// Full system integration: one current/landing refresh, no duplicate cube
// foam/mist, optional camera, independent controls, and clean empty/dispose.
{
    const f=fixture();f.pool(0,0,10);const scene=new THREE.Scene(),effects=new WaterfallEffects(scene,f.world);
    effects.findLandings(.5,.5);eq(effects.landingRevision,1,'landing revision marks a refresh for the other consumers');
    eq(f.world.flowCalls,[[0,20,0]],'flow is sampled at receiving-water height, not in the falling column');
    eq(effects.materials,[effects.ripples.material,effects.foam.material,effects.mist.material],
        'Game can update every water-effect shadow material together');
    finish(effects.ripples,effects.foam);
    eq(effects.stats().foam.draws,1,'full integration builds foam from the already-discovered water');
    ok(effects.stats().mist.instances>0,'full integration builds mist under a tall waterfall');
    const emissions=[];effects.particles.emit=particle=>{emissions.push(particle);return true;};
    const landing=effects.landings[0];landing.splash=0;effects.emitFrom(landing,1);
    eq(emissions.length,Math.floor(waterfallStrength(10).splash),'emission rate now counts only retained cube droplets');
    ok(emissions.every(p=>p.gravity===15&&p.spin===4),'no legacy cube foam or cube mist is emitted');
    const camera=new THREE.PerspectiveCamera();camera.rotation.y=.4;camera.updateMatrixWorld();
    effects.update(0,null,camera);
    near(effects.mist.material.uniforms.uMistRight.value.x,Math.cos(.4),'optional camera reaches the billboard renderer');
    effects.setAmount(0);eq([effects.foam.stats().draws,effects.mist.stats().draws],[0,0],'system amount disables both new layers');
    effects.setAmount(1);effects.findLandings(.5,.5);finish(effects.ripples,effects.foam);
    eq(effects.foam.stats().draws,1,'system can restore a previously disabled surface layer');
    const revision=effects.landingRevision;f.world.fluids=null;effects.findLandings(.5,.5);effects.update(0,null);
    eq(effects.landingRevision,revision+1,'empty refresh still notifies consumers');
    eq([effects.landings.length,effects.foam.stats().draws,effects.mist.stats().draws],[0,0,0],'losing the simulation clears both new layers');
    effects.dispose();effects.dispose();eq(scene.children.length,0,'whole waterfall system disposes idempotently');
    eq(MIST_FALL,MIST_MIN_FALL,'legacy strength API and new mist use one threshold');
}

console.log(`Piana i mgiełka: PASS ${checks} sprawdzeń (maski, fale, oświetlenie, limity, bufory, składanie shaderów, integracja).`);
