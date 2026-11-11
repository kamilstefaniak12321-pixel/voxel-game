import * as THREE from 'three';
import {WorldOutput} from '../../src/rendering/WorldOutput.js';
import {LightShafts} from '../../src/rendering/LightShafts.js';
import {shadowUniforms} from '../../src/rendering/Shadows.js';
import {viewUniforms,chunkMaskUniforms,chunkMaskData,CHUNK_MASK_GLSL} from '../../src/rendering/viewUniforms.js';

export async function run() {
    const checks=[];
    const check=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
    const canvas=document.createElement('canvas'); document.body.append(canvas);
    const context=canvas.getContext('webgl2',{antialias:true});
    const renderer=new THREE.WebGLRenderer({canvas,context,antialias:true});
    renderer.setSize(128,96); renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
    renderer.autoClear=false; renderer.info.autoReset=false;
    const owned=[],own=x=>(owned.push(x),x);
    const output=new WorldOutput(renderer),shafts=new LightShafts(renderer);
    const camera=new THREE.PerspectiveCamera(60,128/96,.1,1000);
    camera.position.set(0,0,8);camera.updateMatrixWorld();
    const scene=new THREE.Scene(),shadowScene=new THREE.Scene();
    const opaque=own(new THREE.MeshBasicMaterial({color:0x555555}));
    const back=new THREE.Mesh(own(new THREE.PlaneGeometry(30,30)),opaque);
    back.position.z=-4;scene.add(back);
    // Alpha-cutout foliage, with both solid leaves and a transparent gap.
    const cutout=own(new THREE.DataTexture(new Uint8Array([
        20,120,30,255,20,120,30,0,20,120,30,0,20,120,30,255
    ]),2,2));cutout.needsUpdate=true;
    const plant=new THREE.Mesh(own(new THREE.PlaneGeometry(4,6)),own(new THREE.MeshBasicMaterial({
        map:cutout,alphaTest:.5,side:THREE.DoubleSide})));
    plant.position.x=-2;scene.add(plant);
    // Same depth-writing contract as the game's translucent water material.
    const water=new THREE.Mesh(own(new THREE.PlaneGeometry(3,6)),own(new THREE.MeshBasicMaterial({
        color:0x2266aa,transparent:true,opacity:.4,depthWrite:true,side:THREE.DoubleSide})));
    water.position.set(1.5,0,2);scene.add(water);
    for(const source of [back,plant]) {
        const caster=source.clone();caster.material=own(new THREE.MeshDepthMaterial({
            map:source.material.map,alphaTest:source.material.alphaTest,colorWrite:false,side:THREE.DoubleSide}));
        caster.userData.chunk={cx:0,cz:0,maxY:32};shadowScene.add(caster);
    }
    const readTarget=own(new THREE.WebGLRenderTarget(128,96,{depthBuffer:false}));
    const quadGeometry=own(new THREE.PlaneGeometry(2,2)),quadScene=new THREE.Scene(),quadCamera=new THREE.Camera();
    const vertex='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    const depthRead=own(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:vertex,
        uniforms:{depth:{value:null},inverseProjection:{value:camera.projectionMatrixInverse}},
        fragmentShader:`uniform highp sampler2D depth;uniform mat4 inverseProjection;varying vec2 vUv;
        void main(){vec4 p=inverseProjection*vec4(vUv*2.0-1.0,texture2D(depth,vUv).r*2.0-1.0,1.0);
        gl_FragColor=vec4(vec3(-p.z/p.w/20.0),1.0);}`}));
    const quad=new THREE.Mesh(quadGeometry,depthRead);quadScene.add(quad);
    const read=()=>{const data=new Uint8Array(128*96*4);renderer.readRenderTargetPixels(readTarget,0,0,128,96,data);return data;};
    let calls=[];const render=renderer.render.bind(renderer);
    renderer.render=(drawScene,drawCamera)=>{calls.push(drawScene);return render(drawScene,drawCamera);};
    let depthBands,blendCounts;
    try {
        output.begin(true,{bypassTone:true});renderer.render(scene,camera);
        const target=output.target;
        check(target.samples===Math.min(4,renderer.capabilities.maxSamples)&&target.samples>0,'Main output preserves MSAA');
        check(target.depthTexture?.isDepthTexture,'Main output owns a depth texture');
        depthRead.uniforms.depth.value=target.depthTexture;
        renderer.setRenderTarget(readTarget);renderer.clear();renderer.render(quadScene,quadCamera);
        const depth=read();depthBands={water:0,leaf:0,gapOrBackground:0};
        for(let i=0;i<depth.length;i+=4){
            const value=depth[i];
            if(Math.abs(value-76.5)<=2)depthBands.water++;
            if(Math.abs(value-102)<=2)depthBands.leaf++;
            if(Math.abs(value-153)<=2)depthBands.gapOrBackground++;
        }
        check(Object.values(depthBands).every(n=>n>100),'Resolved depth contains water surface, foliage and cutout gaps');
        shadowUniforms.uSunShadowMap.value=target.depthTexture;
        shadowUniforms.uSunShadowMatrix.value.identity();
        shadowUniforms.uFarShadowInfo.value.z=shadowUniforms.uDistantShadowInfo.value.z=0;
        renderer.setRenderTarget(target);calls=[];
        shafts.render(camera,{shadowScene},{},new THREE.Color(.1,.08,.05),.0012,.12,128);
        check(shafts.lastDepthSource==='main'&&shafts.lastDepthDraws===0,'Light shafts reuse main depth');
        check(calls.length===4&&!calls.includes(shadowScene),'Shared depth removes the extra world geometry pass');
        check(shafts.march.uniforms.uProjectionInverse.value===camera.projectionMatrixInverse,'Shared depth uses its actual projection');
        check(shafts.depthTarget===null,'Shared path allocates no fallback depth target');
        output.end();
        check(context.getError()===context.NO_ERROR,'MSAA depth sampling and composition have no framebuffer errors');

        renderer.setRenderTarget(readTarget);renderer.clear();calls=[];
        shafts.render(camera,{shadowScene},{},new THREE.Color(.1,.08,.05),.0012,.12,128);
        check(shafts.lastDepthSource==='fallback'&&calls.includes(shadowScene)&&calls.length===5,'Legacy output retains its depth-pass fallback');
        check(context.getError()===context.NO_ERROR,'Fallback depth sampling has no framebuffer errors');

        // Complementary near/far masks cover every pixel through the overlap.
        chunkMaskData.fill(255);chunkMaskUniforms.uChunkMask.value.needsUpdate=true;
        chunkMaskUniforms.uChunkMaskOrigin.value.set(-64,-64);
        viewUniforms.uDistanceLodEnabled.value=1;viewUniforms.uDistanceLodStart.value=144;
        viewUniforms.uDistanceLodEnd.value=192;viewUniforms.uDistanceLodCenter.value.set(0,0);
        const uniforms={...viewUniforms,...chunkMaskUniforms,point:{value:new THREE.Vector2()},farPoint:{value:new THREE.Vector2()},near:{value:1}};
        const blendMaterial=own(new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:vertex,
            uniforms,fragmentShader:`${CHUNK_MASK_GLSL}
            uniform vec2 point;uniform vec2 farPoint;uniform float near;
            void main(){float weight=effectiveNearLodWeight(point);float noise=distanceLodNoise();
            if(near>0.5?noise>=weight:(chunkMeshed(farPoint)&&noise<effectiveFarLodHideWeight(farPoint)))discard;
            gl_FragColor=near>0.5?vec4(1,0,0,1):vec4(0,0,1,1);}`}));
        quad.material=blendMaterial;
        const blend=(distance,nearPresent=true,farDistance=distance)=>{
            uniforms.point.value.set(distance,0);uniforms.farPoint.value.set(farDistance,0);renderer.setRenderTarget(readTarget);renderer.clear();
            uniforms.near.value=0;renderer.render(quadScene,quadCamera);
            if(nearPresent){uniforms.near.value=1;renderer.render(quadScene,quadCamera);}
            const pixels=read();let red=0,blue=0,empty=0;
            for(let i=0;i<pixels.length;i+=4){if(pixels[i]===255)red++;else if(pixels[i+2]===255)blue++;else empty++;}
            return {red,blue,empty};
        };
        blendCounts=[144,156,168,180,192].map(distance=>({distance,...blend(distance)}));
        check(blendCounts.every(x=>x.empty===0),'Near/far overlap has no missing pixels');
        check(blendCounts[0].blue===0&&blendCounts.at(-1).red===0&&blendCounts.every((x,i)=>!i||x.red<blendCounts[i-1].red),
            'Near details decrease gradually and far details fill their pixels');
        for(const [nearDistance,farDistance] of [[156,132],[168,144],[180,156],[192,160]]) {
            const result=blend(nearDistance,true,farDistance);
            check(result.empty===0,`Different projected crown depths ${nearDistance}/${farDistance} have no sky holes`);
        }
        chunkMaskData.fill(128);chunkMaskUniforms.uChunkMask.value.needsUpdate=true;
        check(blend(180).blue===0,'Pending far replacement retains every detailed pixel');
        chunkMaskData.fill(0);chunkMaskUniforms.uChunkMask.value.needsUpdate=true;
        check(blend(168,false).blue===128*96,'Missing near mesh leaves the far representation intact');
        check(context.getError()===context.NO_ERROR,'Transition shaders compile and render without GL errors');

        // The live coverage texture must also remain legal when a second
        // renderer uses WebGL1. An inactive branch still binds its sampler.
        const fallbackCanvas=document.createElement('canvas'),gl1=fallbackCanvas.getContext('webgl');
        check(!!gl1,'WebGL1 fallback context is available');
        const fallback=new THREE.WebGLRenderer({canvas:fallbackCanvas,context:gl1});
        const fallbackTarget=new THREE.WebGLRenderTarget(16,16,{depthBuffer:false});
        try {
            fallback.autoClear=false;fallback.setSize(16,16);fallback.setRenderTarget(fallbackTarget);
            chunkMaskData.fill(255);chunkMaskUniforms.uChunkMask.value.needsUpdate=true;
            uniforms.point.value.set(168,0);uniforms.farPoint.value.set(144,0);fallback.clear();
            uniforms.near.value=0;fallback.render(quadScene,quadCamera);
            uniforms.near.value=1;fallback.render(quadScene,quadCamera);
            const bytes=new Uint8Array(16*16*4);fallback.readRenderTargetPixels(fallbackTarget,0,0,16,16,bytes);
            let red=0,blue=0;
            for(let i=0;i<bytes.length;i+=4){if(bytes[i]===255)red++;if(bytes[i+2]===255)blue++;}
            check(gl1.getError()===gl1.NO_ERROR&&red>0&&blue>0&&red+blue===256,
                'WebGL1 uses the same ready transition without invalid texture formats or holes');
            chunkMaskData.fill(128);chunkMaskUniforms.uChunkMask.value.needsUpdate=true;
            fallback.clear();uniforms.near.value=0;fallback.render(quadScene,quadCamera);
            uniforms.near.value=1;fallback.render(quadScene,quadCamera);
            fallback.readRenderTargetPixels(fallbackTarget,0,0,16,16,bytes);
            check(gl1.getError()===gl1.NO_ERROR&&bytes.every((value,i)=>value===(i%4===0||i%4===3?255:0)),
                'WebGL1 mask updates preserve pending detailed coverage');
        } finally {fallbackTarget.dispose();fallback.dispose();fallback.forceContextLoss();}
        return {checks,depthBands,blendCounts,samples:target.samples,avoidedDepthPasses:shafts.avoidedDepthPasses};
    } finally {
        renderer.render=render;viewUniforms.uDistanceLodEnabled.value=0;
        shafts.dispose();output.dispose();for(const object of owned)object.dispose();renderer.dispose();
    }
}
