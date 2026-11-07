import * as THREE from 'three';
import { CHUNK_HEIGHT, WORLD_BORDER, PLAYER_REACH, SHADOW_INDOOR_DARKNESS } from '../config.js';
import { getWaterLevel, getBlockId } from '../blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { lightToBrightness, COLOR_LEVEL } from '../world/Light.js';
import { blockAtlasTexture, getAtlasUV } from '../rendering/TextureAtlas.js';
import { atmosphericLightToBrightness } from '../rendering/LightPolicy.js';
import { createModelMaterial } from '../rendering/ModelMaterial.js';
import { RAFT_MODEL, RAFT_THICKNESS } from '../rendering/RaftModel.js';
import { RaftBody, RAFT_CAPS } from './RaftPhysics.js';

function geometry() {
    const position=[],normal=[],uv=[],profile=[],index=[],tile=getAtlasUV('oak_planks',0);
    for(const face of RAFT_MODEL.faces) {
        const base=position.length/3;
        for(let i=0;i<4;i++) {
            position.push(...face.vertices[i]);normal.push(...face.normal);profile.push(...face.surfaceProfile);
            uv.push(tile.uMin+face.uv[i][0]*(tile.uMax-tile.uMin),tile.vMax-face.uv[i][1]*(tile.vMax-tile.vMin));
        }
        index.push(base,base+2,base+1,base+2,base+3,base+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.setAttribute('surfaceProfile',new THREE.Uint8BufferAttribute(profile,2));g.setIndex(index);g.computeBoundingSphere();return g;
}

export class Rafts {
    constructor(game,state=null) {
        this.game=game;this.bodies=[];this.views=new Map();this.mounted=null;this.version=0;this.nextId=1;
        this.geometry=null;this.disposed=false;this.lastSteps=0;this.lastMs=0;
        this.notice='';this.noticeUntil=0;this.direction=new THREE.Vector3();this.ray=new THREE.Ray();
        this.lastAnchor=new THREE.Vector3();this.clock=0;this.exitHeld=false;
        this.hitPoint=new THREE.Vector3();
        this.hitBox=new THREE.Box3(new THREE.Vector3(-.5,-RAFT_THICKNESS,-1),new THREE.Vector3(.5,0,1));
        const ids=new Set();
        if(state?.schema===1 && Array.isArray(state.rafts))for(const s of state.rafts.slice(0,RAFT_CAPS.stored)) {
            if(![s?.x,s?.y,s?.z,s?.yaw,s?.vx,s?.vy,s?.vz].every(Number.isFinite) ||
                !Number.isSafeInteger(s.id) || s.id<1 || s.id>1e9 || ids.has(s.id) ||
                Math.abs(s.x)>WORLD_BORDER-2 || Math.abs(s.z)>WORLD_BORDER-2 || s.y<RAFT_THICKNESS || s.y>CHUNK_HEIGHT+2)continue;
            ids.add(s.id);this.nextId=Math.max(this.nextId,s.id+1);
            const b=new RaftBody(game.world,{...s,vx:Math.max(-8,Math.min(8,s.vx)),vy:Math.max(-16,Math.min(4,s.vy)),vz:Math.max(-8,Math.min(8,s.vz)),yaw:s.yaw%(Math.PI*2)});
            this.bodies.push(b);
        }
        const restored=this.bodies.find(b=>b.id===state?.mounted);
        if(restored && restored.loaded() && restored.pos.distanceTo(game.player.pos)<.5 && !restored.collides(undefined,undefined,undefined,undefined,game.player))this.mount(restored);
    }
    say(text) { this.notice=text;this.noticeUntil=this.clock+3; }
    get hint() { return this.clock<this.noticeUntil ? this.notice : this.mounted ? 'Tratwa • WASD / joystick: płyń • Shift / W dół: wysiądź' : ''; }
    getState() { return {schema:1,mounted:this.mounted?.id??null,rafts:this.bodies.map(b=>b.state())}; }
    spawn(x,y,z,yaw=0) {
        if(![x,y,z,yaw].every(Number.isFinite) || y<RAFT_THICKNESS || y>CHUNK_HEIGHT+2 || Math.abs(x)>WORLD_BORDER-2 || Math.abs(z)>WORLD_BORDER-2)return null;
        if(this.bodies.length>=RAFT_CAPS.stored){this.say('Limit 32 tratw w świecie. Zabierz nieużywaną tratwę.');return null;}
        const b=new RaftBody(this.game.world,{id:this.nextId,x,y,z,yaw});
        if(!b.loaded() || b.collides() || this.bodies.some(other=>Math.abs(other.pos.y-y)<.4 && Math.hypot(other.pos.x-x,other.pos.z-z)<2)) {
            this.say('Potrzeba wolnego miejsca na tratwę 2×1.');return null;
        }
        this.nextId++;this.bodies.push(b);this.version++;return b;
    }
    place(hit) {
        if(!hit?.hit)return false;
        const {x,y,z}=hit.block,level=getWaterLevel(getBlockId(hit.block.type));
        if(level<0 || level===8){this.say('Wyceluj w spokojną taflę wody.');return false;}
        const surface=y+waterSurfaceHeight(this.game.world,x,y,z,.5,.5);
        const body=this.spawn(x+.5,surface+.08,z+.5,this.game.player.yaw);
        if(!body)return false;
        if(this.game.mode==='adventure')this.game.inventory.take(this.game.inventory.selected,1);
        this.say('PPM / Postaw na tratwie: wsiądź. LPM / Kop: zabierz.');return true;
    }
    mount(body) {
        const p=this.game.player;
        if(!body.loaded() || body.collides(undefined,undefined,undefined,undefined,{width:p.width,height:1.8})){this.say('Brak miejsca dla pasażera.');return false;}
        this.mounted=body;this.notice='';this.noticeUntil=0;this.version++;p.flying=false;p.height=1.8;p.eyeHeight=1.6;p.crouching=false;p.sprinting=false;p.skyfall=false;
        p.sprintLatched=false;p.lastJumpPress=p.lastForwardPress=-Infinity;
        this.anchor();return true;
    }
    anchor() {
        const b=this.mounted,p=this.game.player;
        p.pos.set(b.pos.x,b.pos.y+.003,b.pos.z);this.lastAnchor.copy(p.pos);p.vel.copy(b.vel);
        p.onGround=false;p.touchingWall=b.blocked;p.swimming=false;p.crouching=false;p.sprinting=false;
        p.submerged=p.buoyantSubmerged=0;p.waterCellY=null;p.current=b.water?.flow??null;
        p.splash=0;p.leftWater=false;p.landed=0;p.skyfallImpact=null;p.skyfallSplash=0;
        p.updateCamera();
    }
    dismount() {
        if(!this.mounted)return false;
        const b=this.mounted,p=this.game.player,old=p.pos.clone(),[hx,hz]=b.extents();
        // Land beside the deck, including the bank above it; no teleport through a wall.
        for(const [dx,dz] of [[hx+.45,0],[-hx-.45,0],[0,hz+.45],[0,-hz-.45]]) {
            for(const rise of [0,1]) {
                const target=old.clone().add(new THREE.Vector3(dx,rise,dz));
                if(!b.loaded(target.x,target.z,0))continue;
                const n=Math.ceil(old.distanceTo(target)/.15);let clear=true;
                for(let i=1;i<=n;i++) {
                    // Raise first when stepping onto a bank.
                    const at=old.clone().add(new THREE.Vector3(0,rise,0)).lerp(target,i/n);
                    if(p.collidesAt(at)){clear=false;break;}
                }
                if(rise && p.collidesAt(old.clone().add(new THREE.Vector3(0,rise,0))))clear=false;
                if(!clear)continue;
                p.pos.copy(target);p.vel.copy(b.vel);p.vel.y=Math.max(0,p.vel.y);
                this.mounted=null;this.version++;p.updateWater();p.updateCamera();this.say('Wysiadłeś z tratwy.');return true;
            }
        }
        this.say('Brak wolnego miejsca obok tratwy.');return false;
    }
    hit(camera,terrainHit) {
        camera.getWorldDirection(this.direction);const limit=Math.min(PLAYER_REACH,terrainHit?.hit?terrainHit.distance:PLAYER_REACH);
        let result=null;
        for(const b of this.bodies) {
            if(b===this.mounted || !b.loaded())continue;
            const c=Math.cos(b.yaw),s=Math.sin(b.yaw),p=camera.position;
            const dx=p.x-b.pos.x,dz=p.z-b.pos.z;
            this.ray.origin.set(dx*c-dz*s,p.y-b.pos.y,dx*s+dz*c);
            this.ray.direction.set(this.direction.x*c-this.direction.z*s,this.direction.y,this.direction.x*s+this.direction.z*c);
            const point=this.ray.intersectBox(this.hitBox,this.hitPoint);
            if(!point)continue;
            const distance=point.distanceTo(this.ray.origin);
            if(distance<=limit && (!result||distance<result.distance))result={body:b,distance};
        }
        return result;
    }
    interact({breakPressed,placePressed,terrainHit}) {
        if(!breakPressed && !placePressed)return false;
        if(this.mounted)return breakPressed||placePressed; // Do not mine the bottom from a moving deck.
        const hit=this.hit(this.game.camera,terrainHit);
        if(hit && breakPressed) {
            const inventory=this.game.inventory;
            if(this.game.mode==='adventure' && !inventory.canAdd('raft')){this.say('Brak miejsca w ekwipunku.');return true;}
            if(this.game.mode==='adventure')inventory.add('raft');
            this.bodies.splice(this.bodies.indexOf(hit.body),1);this.removeView(hit.body.id);this.version++;return true;
        }
        if(hit && placePressed){this.mount(hit.body);return true;}
        if(placePressed && !breakPressed && this.game.selectedBlock==='raft') {
            this.place(this.game.raycast.castFromCamera(this.game.camera,true));return true;
        }
        return false;
    }
    update(dt,input) {
        if(this.disposed)return false;
        const start=performance.now(),p=this.game.player;this.clock+=Math.max(0,dt);this.lastSteps=0;
        if(this.bodies.length===0){this.lastMs=performance.now()-start;return false;}
        if(this.mounted && (p.flying || p.pos.distanceToSquared(this.lastAnchor)>.25)) {this.mounted=null;this.version++;}
        const riding=Boolean(this.mounted);
        const exitDown=input.isKeyDown('ShiftLeft')||input.isKeyDown('ShiftRight');
        if(riding) {
            p.clock+=dt;p.updateLook(input);
            // Walking's double-tap edges must not remain queued until dismount.
            input.consumeKeyPress?.('Space');input.consumeKeyPress?.('KeyW');
            if(exitDown && !this.exitHeld)this.dismount();
        }
        this.exitHeld=exitDown;
        const active=this.bodies.filter(b=>b===this.mounted||b.pos.distanceToSquared(p.pos)<RAFT_CAPS.range**2)
            .sort((a,b)=>Number(b===this.mounted)-Number(a===this.mounted)||a.pos.distanceToSquared(p.pos)-b.pos.distanceToSquared(p.pos))
            .slice(0,RAFT_CAPS.active);
        const visible=new Set();
        for(const b of active) {
            if(!b.loaded())continue;
            b.update(dt,b===this.mounted?input:null,b===this.mounted?p:null);this.lastSteps+=b.steps;
            this.updateView(b);visible.add(b.id);
        }
        for(const [id] of this.views)if(!visible.has(id))this.removeView(id);
        if(this.mounted)this.anchor();
        this.lastMs=performance.now()-start;
        // A dismount frame has already consumed look input and advanced the clock.
        return riding;
    }
    updateView(b) {
        let view=this.views.get(b.id);
        if(!view) {
            this.geometry??=geometry();
            const lighting={uModelSky:{value:1},uModelBlock:{value:new THREE.Vector3()},uModelSun:{value:1},
                uModelAmbient:{value:1},uModelDistantShadows:{value:1},uModelBounce:{value:new THREE.Vector3()}};
            const material=createModelMaterial({map:blockAtlasTexture,lighting});
            const mesh=new THREE.Mesh(this.geometry,material);mesh.name='Tratwa';
            this.game.scene.add(mesh);view={mesh,lighting,lightTime:0};this.views.set(b.id,view);
        }
        view.mesh.position.copy(b.pos);view.mesh.rotation.y=b.yaw;
        if(this.clock>=view.lightTime) {
            view.lightTime=this.clock+.2;
            const light=this.game.world.getLight(Math.floor(b.pos.x),Math.floor(b.pos.y+.2),Math.floor(b.pos.z));
            const brightness=this.game.sky?.atmosphere?atmosphericLightToBrightness:lightToBrightness;
            const sky=brightness(light.sky),strongest=Math.max(light.red,light.green,light.blue);
            const lamp=strongest>0?brightness(COLOR_LEVEL[strongest])/strongest:0;
            view.lighting.uModelSky.value=sky;view.lighting.uModelBlock.value.set(light.red*lamp,light.green*lamp,light.blue*lamp);
            view.lighting.uModelSun.value=sky**2.2;
            view.lighting.uModelAmbient.value=sky**(2.2+SHADOW_INDOOR_DARKNESS*(this.game.shadows?.ambientStrength??0));
        }
    }
    removeView(id) {const view=this.views.get(id);if(view){view.mesh.removeFromParent();view.mesh.material.dispose();this.views.delete(id);}}
    stats() {return {stored:this.bodies.length,active:this.views.size,mounted:this.mounted?.id??null,lastSteps:this.lastSteps,lastMs:this.lastMs,caps:RAFT_CAPS};}
    dispose() {if(this.disposed)return;this.disposed=true;for(const [id] of this.views)this.removeView(id);this.geometry?.dispose();this.bodies.length=0;this.mounted=null;}
}
