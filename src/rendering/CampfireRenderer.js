import * as THREE from 'three';
import { CAMPFIRE_LOGS } from './CampfireGeometry.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture, getAtlasUV } from './TextureAtlas.js';
import { CampfireLight } from './CampfireLight.js';
import { fireIntensity } from '../game/CampfireState.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';

const VIEW_RANGE = 72, MAX_VISIBLE = 32, PARTICLES = 96;
const smooth = t => t * t * (3 - 2 * t);

function logGeometry(index, wood) {
    const data = CAMPFIRE_LOGS[index], uv = getAtlasUV(`campfire_${wood}`, 0);
    const positions = [], normals = [], uvs = [], indices = [];
    for (const face of data.faces) {
        const base = positions.length / 3;
        face.vertices.forEach((p, i) => {
            positions.push(...p); normals.push(...face.normal);
            uvs.push(uv.uMin + face.uv[i][0] * (uv.uMax - uv.uMin), uv.vMax - face.uv[i][1] * (uv.vMax - uv.vMin));
        });
        indices.push(base, base+2, base+1, base+2, base+3, base+1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    return geometry;
}

function charMaterial(wood, lighting) {
    const material = createModelMaterial({map: blockAtlasTexture});
    const base = material.onBeforeCompile;
    const uv = getAtlasUV(`campfire_${wood}`, 0);
    const uniforms = {uChar: {value: 0}, uHeat: {value: 0}, uCoalTime: {value: 0},
        uCharOffset: {value: (uv.vMax - uv.vMin) * .5} };
    material.userData.char = uniforms;
    material.onBeforeCompile = (shader, renderer) => {
        base(shader, renderer);
        Object.assign(shader.uniforms, uniforms, lighting);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
            uniform float uChar; uniform float uHeat; uniform float uCoalTime; uniform float uCharOffset;`)
            .replace('#include <map_fragment>', `
                vec4 freshWood = texture2D(map, vMapUv);
                vec4 burntWood = texture2D(map, vMapUv - vec2(0.0, uCharOffset));
                diffuseColor *= mix(freshWood, burntWood * vec4(.5,.5,.5,1.0), uChar);
            `)
            .replace('outgoingLight = applyBrightness(outgoingLight, modelTexel);', `
                vec2 pixel = floor(vMapUv * vec2(textureSize(map, 0)));
                float crack = step(.89, fract(sin(dot(pixel, vec2(12.9898,78.233))) * 43758.5453));
                // Emission is local light: apply it after the moon's desaturation.
                outgoingLight += vec3(1.0,.15,.012) * crack * uHeat * smoothstep(.12,.6,uChar)
                    * (.65 + .2 * sin(uCoalTime * 2.0 + pixel.x));
                outgoingLight = applyBrightness(outgoingLight, modelTexel);
            `);
    };
    material.customProgramCacheKey = () => 'campfire-log-v1';
    return material;
}

export class CampfireRenderer {
    constructor(game) {
        this.game = game; this.views = new Map(); this.geometry = new Map(); this.time = 0;
        this.light = new CampfireLight(game.renderer);
        this.flameTime = { value: 0 };
        this.fireTexture = new THREE.TextureLoader().load(new URL('../../assets/models/campfire/plomienie.png', import.meta.url).href);
        this.fireTexture.magFilter = this.fireTexture.minFilter = THREE.NearestFilter;
        this.fireTexture.generateMipmaps = false; this.fireTexture.colorSpace = THREE.SRGBColorSpace;
        // Approved flame silhouette occupies the top-left 16 x 20 pixels.
        this.flameGeometry = new THREE.PlaneGeometry(1, 1.25, 1, 10);
        this.flameGeometry.translate(0, .625, 0);
        const uv = this.flameGeometry.attributes.uv;
        for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*.5, .375 + uv.getY(i)*.625);
        this.flameMaterial = new THREE.MeshBasicMaterial({map:this.fireTexture, alphaTest:.5, side:THREE.DoubleSide, toneMapped:false});
        this.flameMaterial.onBeforeCompile = shader => {
            shader.uniforms.uFlameTime = this.flameTime;
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uFlameTime;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
                    float h = max(position.y, 0.0);
                    transformed.x += floor(sin(h * 6.0 - uFlameTime * 6.0 + modelMatrix[3].x) * h * 2.0) / 32.0;
                    transformed.y *= .93 + .07 * sin(uFlameTime * 8.0 + position.x * 5.0 + modelMatrix[3].z);
                `);
        };
        this.flameMaterial.customProgramCacheKey = () => 'campfire-flame-v1';
        this.ashGeometry = new THREE.CylinderGeometry(.43, .48, .055, 8);
        this.ashMaterial = new THREE.MeshLambertMaterial({color:0x615a51, flatShading:true});
        this.coalGeometry = new THREE.BoxGeometry(1/8, 1/16, 3/16);
        this.tinderGeometry = new THREE.BoxGeometry(.36, .035, .3);
        this.tinderMaterial = new THREE.MeshLambertMaterial({color:0x8c854b});
        this.createParticles();
    }

    createParticles() {
        this.particles = Array.from({length:PARTICLES}, () => ({life:0}));
        const geometry = this.particleGeometry = new THREE.BufferGeometry();
        this.particlePosition = new Float32Array(PARTICLES*3);
        this.particleColor = new Float32Array(PARTICLES*4);
        this.particleSize = new Float32Array(PARTICLES);
        geometry.setAttribute('position',new THREE.BufferAttribute(this.particlePosition,3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleColor',new THREE.BufferAttribute(this.particleColor,4).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleSize',new THREE.BufferAttribute(this.particleSize,1).setUsage(THREE.DynamicDrawUsage));
        this.particleMaterial = new THREE.ShaderMaterial({transparent:true,depthWrite:false,
            uniforms:{uPixelScale:{value:700}},
            vertexShader:`attribute vec4 particleColor; attribute float particleSize; varying vec4 vColor;
                uniform float uPixelScale; void main(){ vColor=particleColor; vec4 p=modelViewMatrix*vec4(position,1.0);
                gl_Position=projectionMatrix*p; gl_PointSize=clamp(particleSize*uPixelScale/max(.1,-p.z),1.0,90.0); }`,
            fragmentShader:`varying vec4 vColor; void main(){
                vec2 p=abs(gl_PointCoord-.5); if(max(p.x,p.y)>.48 || (p.x>.31 && p.y>.31)) discard;
                gl_FragColor=vColor; }`});
        this.points = new THREE.Points(geometry,this.particleMaterial); this.points.frustumCulled=false;
        this.game.scene.add(this.points);
    }

    createView(key, fire) {
        const group = new THREE.Group(); group.position.set(fire.x+.5,fire.y,fire.z+.5);
        const flames = new THREE.Group(); flames.position.y=.12;
        for(let i=0;i<4;i++) {
            const mesh = new THREE.Mesh(this.flameGeometry,this.flameMaterial);
            mesh.rotation.y = [0,Math.PI/2,Math.PI/4,-Math.PI/4][i];
            if(i>1) mesh.scale.set(.85,.6,.85);
            flames.add(mesh);
        }
        const ash = new THREE.Mesh(this.ashGeometry,this.ashMaterial); ash.position.y=.028;
        const coalMaterial = new THREE.MeshLambertMaterial({color:0x231d19,emissive:0xff3406});
        const coals = new THREE.Group();
        for(let i=0;i<9;i++) {
            const coal = new THREE.Mesh(this.coalGeometry,coalMaterial);
            const angle=i*2.4; coal.position.set(Math.sin(angle)*.26,.06,Math.cos(angle)*.26);
            coal.rotation.y=angle; coals.add(coal);
        }
        const tinder = new THREE.Mesh(this.tinderGeometry,this.tinderMaterial); tinder.position.y=.27;
        group.add(flames,ash,coals,tinder); this.game.scene.add(group);
        const lighting = {uModelSky:{value:1},uModelBlock:{value:new THREE.Vector3()},uModelSun:{value:1},
            uModelDistantShadows:{value:1},uModelBounce:{value:new THREE.Vector3()}};
        const view = {group,flames,ash,coals,coalMaterial,tinder,logs:[],lighting,smoke:0,spark:0,created:this.time};
        this.views.set(key,view); return view;
    }

    syncView(view, fire, dt, clock) {
        while(view.logs.length>fire.logs.length) {
            const log=view.logs.pop(); log.mesh.removeFromParent(); log.mesh.material.dispose();
        }
        fire.logs.forEach((log,i)=>{
            if(view.logs[i]?.wood!==log.wood) {
                if(view.logs[i]) { view.logs[i].mesh.removeFromParent(); view.logs[i].mesh.material.dispose(); }
                const key=`${i}:${log.wood}`;
                if(!this.geometry.has(key)) this.geometry.set(key,logGeometry(i,log.wood));
                const mesh=new THREE.Mesh(this.geometry.get(key),charMaterial(log.wood,view.lighting));
                view.group.add(mesh); view.logs[i]={mesh,wood:log.wood,placed:clock};
            }
            const entry=view.logs[i], data=CAMPFIRE_LOGS[i], c=smooth(fire.collapse);
            const mesh=entry.mesh, drop=1-smooth(Math.min(1,(clock-entry.placed)/.32));
            mesh.position.set(data.position[0]*(1+c*.12),data.position[1]*(1-c*.82)+drop*.12,data.position[2]*(1+c*.12));
            mesh.rotation.set(c*(i%2 ? .12:-.12),data.rotation+c*(i-2.5)*.025,0);
            mesh.scale.set(1,1-c*.75,1);
            mesh.material.userData.char.uChar.value=smooth(Math.min(1,log.burn*1.2));
            mesh.material.userData.char.uHeat.value=fireIntensity(fire)*1.4+(fire.phase==='collapsing'?.45:0);
            mesh.material.userData.char.uCoalTime.value=clock;
        });
        const intensity=fireIntensity(fire);
        view.flames.visible=intensity>.008;
        view.flames.scale.set(.6+.4*intensity,Math.max(.01,intensity),.6+.4*intensity);
        const ember=fire.embers/90;
        view.ash.visible=fire.ash || fire.phase==='collapsing';
        view.coals.visible=view.ash.visible;
        view.coalMaterial.emissiveIntensity=ember*(.42+.06*Math.sin(clock*2)) + (fire.phase==='collapsing'?.6*fire.collapse:0);
        view.tinder.visible=Boolean(fire.tinder);
        const light=this.game.world.getLight(fire.x,fire.y+1,fire.z);
        view.lighting.uModelSky.value=atmosphericLightToBrightness(light.sky);
        if(intensity>.02) {
            view.smoke+=dt*2.2*intensity; view.spark+=dt;
            if(view.smoke>=1) { view.smoke%=1; this.emit(fire,false); }
            if(view.spark>1.4 && Math.random()<dt*.65) { view.spark=0; this.emit(fire,true); }
        }
    }

    emit(fire,spark) {
        const particle=this.particles.find(p=>p.life<=0); if(!particle) return;
        Object.assign(particle,{x:fire.x+.5+(Math.random()-.5)*.25,y:fire.y+.65,z:fire.z+.5+(Math.random()-.5)*.25,
            vx:(Math.random()-.5)*(spark?.7:.15),vz:(Math.random()-.5)*(spark?.7:.15),vy:spark?1.1:.42,
            life:spark?1.8:3.8,max:spark?1.8:3.8,spark,seed:Math.random()*6});
    }

    update(dt, fires, clock) {
        this.time=clock; this.flameTime.value=clock;
        const camera=this.game.camera.position;
        const selected=[...fires.entries()].map(([key,fire])=>({key,fire,d:(fire.x-camera.x)**2+(fire.y-camera.y)**2+(fire.z-camera.z)**2}))
            .filter(p=>p.d<VIEW_RANGE*VIEW_RANGE && this.game.world.getChunk(this.game.world.toChunkCoord(p.fire.x),this.game.world.toChunkCoord(p.fire.z)))
            .sort((a,b)=>a.d-b.d).slice(0,MAX_VISIBLE);
        const keys=new Set(selected.map(p=>p.key));
        for(const [key,view] of this.views) if(!keys.has(key)) this.removeView(key,view);
        const sources=[];
        for(const {key,fire,d} of selected) {
            const view=this.views.get(key) ?? this.createView(key,fire); this.syncView(view,fire,dt,clock);
            const power=fireIntensity(fire)+(fire.phase==='collapsing'?fire.collapse:fire.embers/90)*.055;
            if(power>.002 && d<32*32) sources.push({key,position:new THREE.Vector3(fire.x+.5,fire.y+.85,fire.z+.5),power});
        }
        this.light.update(this.game.settings.get('dynamicLight') ? sources : [],clock);
        this.particles.forEach((p,i)=>{
            p.life-=dt;
            if(p.life>0) {
                const age=1-p.life/p.max;
                p.x+=(p.vx+Math.sin(clock+p.seed)*.08)*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
                this.particlePosition.set([p.x,p.y,p.z],i*3);
                this.particleSize[i]=p.spark?.028:.15+age*.46;
                this.particleColor.set(p.spark?[1,.42,.06,Math.sin(age*Math.PI)]:[.35,.34,.32,Math.sin(age*Math.PI)*.14],i*4);
            } else { this.particleColor[i*4+3]=0; this.particleSize[i]=0; }
        });
        this.particleMaterial.uniforms.uPixelScale.value=this.game.renderer.domElement.height;
        for(const attribute of Object.values(this.particleGeometry.attributes)) attribute.needsUpdate=true;
    }

    removeView(key,view) { view.group.removeFromParent(); view.logs.forEach(log=>log.mesh.material.dispose()); view.coalMaterial.dispose(); this.views.delete(key); }
    renderShadows() { this.light.render(this.game.world,this.time); }
    dispose() {
        for(const [key,view] of this.views) this.removeView(key,view);
        this.geometry.forEach(g=>g.dispose()); this.light.dispose(); this.points.removeFromParent();
        for(const resource of [this.fireTexture,this.flameGeometry,this.flameMaterial,this.ashGeometry,this.ashMaterial,
            this.coalGeometry,this.tinderGeometry,this.tinderMaterial,this.particleGeometry,this.particleMaterial]) resource.dispose();
    }
}
