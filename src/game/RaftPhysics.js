import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { getWaterLevel, isSolidId } from '../blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { RAFT_THICKNESS } from '../rendering/RaftModel.js';

export const RAFT_CAPS = Object.freeze({ stored: 32, active: 8, range: 48, step: 1/60, substeps: 6 });
const EPS = .001, HALF_X = .5, HALF_Z = 1;
const SAMPLES = [[0,0],[-.36,-.8],[.36,-.8],[-.36,.8],[.36,.8]];

export class RaftBody {
    constructor(world, { id, x, y, z, yaw = 0, vx = 0, vy = 0, vz = 0 }) {
        this.world = world; this.id = id;
        this.pos = new THREE.Vector3(x,y,z); this.vel = new THREE.Vector3(vx,vy,vz);
        this.yaw = yaw; this.water = null; this.grounded = false; this.blocked = false;
        this.waiting = false; this.steps = 0;
    }
    state() { return { id:this.id, x:this.pos.x, y:this.pos.y, z:this.pos.z, yaw:this.yaw,
        vx:this.vel.x, vy:this.vel.y, vz:this.vel.z }; }
    extents(yaw = this.yaw) {
        return [Math.abs(Math.cos(yaw))*.5 + Math.abs(Math.sin(yaw)),
            Math.abs(Math.sin(yaw))*.5 + Math.abs(Math.cos(yaw))];
    }
    loaded(x = this.pos.x, z = this.pos.z, margin = .25, yaw = this.yaw) {
        const [hx,hz] = this.extents(yaw);
        for (const xx of [x-hx-margin,x+hx+margin]) for (const zz of [z-hz-margin,z+hz+margin]) {
            if (!this.world.getChunk(Math.floor(xx/CHUNK_SIZE),Math.floor(zz/CHUNK_SIZE))) return false;
        }
        return true;
    }
    // SAT for a yawed rectangle and a unit block (no oversized AABB at turns).
    overlaps(x,z,yaw = this.yaw, px = this.pos.x,pz = this.pos.z) {
        const c=Math.cos(yaw),s=Math.sin(yaw),dx=x+.5-px,dz=z+.5-pz;
        const [hx,hz]=this.extents(yaw),projection=.5*(Math.abs(c)+Math.abs(s));
        return Math.abs(dx)<hx+.5-EPS && Math.abs(dz)<hz+.5-EPS &&
            Math.abs(dx*c-dz*s)<HALF_X+projection-EPS && Math.abs(dx*s+dz*c)<HALF_Z+projection-EPS;
    }
    collides(x=this.pos.x,y=this.pos.y,z=this.pos.z,yaw=this.yaw,rider=null) {
        if (Math.abs(x)>WORLD_BORDER-1.2 || Math.abs(z)>WORLD_BORDER-1.2 || y<RAFT_THICKNESS) return true;
        const [hx,hz]=this.extents(yaw);
        for(let bx=Math.floor(x-hx+EPS);bx<=Math.floor(x+hx-EPS);bx++)
            for(let bz=Math.floor(z-hz+EPS);bz<=Math.floor(z+hz-EPS);bz++) {
                if(!this.overlaps(bx,bz,yaw,x,z))continue;
                for(let by=Math.floor(y-RAFT_THICKNESS+EPS);by<=Math.floor(y-EPS);by++)
                    if(isSolidId(this.world.getBlockId(bx,by,bz)))return true;
            }
        if(rider) {
            const h=rider.width/2;
            for(let bx=Math.floor(x-h);bx<=Math.floor(x+h);bx++)
                for(let bz=Math.floor(z-h);bz<=Math.floor(z+h);bz++)
                    for(let by=Math.floor(y+EPS);by<=Math.floor(y+EPS+rider.height);by++)
                        if(isSolidId(this.world.getBlockId(bx,by,bz)))return true;
        }
        return false;
    }
    sampleWater() {
        const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
        let best=null,center=null;
        for(let i=0;i<SAMPLES.length;i++) {
            const [sx,sz]=SAMPLES[i],x=this.pos.x+sx*c+sz*s,z=this.pos.z-sx*s+sz*c;
            const bx=Math.floor(x),bz=Math.floor(z);
            for(let y=Math.min(CHUNK_HEIGHT-1,Math.floor(this.pos.y+.35));y>=Math.floor(this.pos.y-.7);y--) {
                const id=this.world.getBlockId(bx,y,bz),level=getWaterLevel(id);
                if(isSolidId(id))break;
                if(level<0 || level===8)continue; // A vertical falling column does not hold a raft up.
                const above=this.world.getBlockId(bx,y+1,bz);
                if(getWaterLevel(above)>=0 || isSolidId(above))continue;
                const surface=y+waterSurfaceHeight(this.world,bx,y,bz,x-bx,z-bz);
                if(surface<this.pos.y-.55 || surface>this.pos.y+.35)continue;
                const sample={surface,x:bx,y,z:bz};
                if(i===0)center=sample;
                if(!best || surface>best.surface)best=sample;
                break;
            }
        }
        // One authoritative current, not an average of opposed cells at a lip.
        const water=center??best;
        if(water)water.flow=this.world.getWaterFlow(water.x,water.y,water.z);
        return water;
    }
    move(axis,delta,rider) {
        if(!delta)return false;
        const old=this.pos[axis];this.pos[axis]=old+delta;
        if(!this.loaded()) { this.pos[axis]=old;this.waiting=true;return true; }
        if(!this.collides(undefined,undefined,undefined,undefined,rider))return false;
        // Sweep in <=0.18 block substeps, then bisect contact. Never tunnel a bank.
        let lo=0,hi=1;
        for(let i=0;i<9;i++) {
            const t=(lo+hi)*.5;this.pos[axis]=old+delta*t;
            if(this.collides(undefined,undefined,undefined,undefined,rider))hi=t;else lo=t;
        }
        this.pos[axis]=old+delta*lo;
        return true;
    }
    update(dt, input=null, rider=null) {
        this.steps=0;this.waiting=!this.loaded();if(this.waiting)return;
        const step=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));
        const count=Math.min(RAFT_CAPS.substeps,Math.ceil(step/RAFT_CAPS.step));
        if(!count)return;
        const h=step/count;
        for(let i=0;i<count;i++) {
            this.steps++;this.water=this.sampleWater();
            const w=this.water;
            let ax=0,az=0;
            if(input && rider) {
                const forward=Number(input.isKeyDown('KeyW'))-Number(input.isKeyDown('KeyS'));
                const right=Number(input.isKeyDown('KeyD'))-Number(input.isKeyDown('KeyA'));
                const len=Math.hypot(forward,right)||1,c=Math.cos(rider.yaw),s=Math.sin(rider.yaw);
                ax=(right*c-forward*s)/len;az=(-forward*c-right*s)/len;
                if(ax || az) {
                    const target=Math.atan2(-ax,-az),turn=Math.atan2(Math.sin(target-this.yaw),Math.cos(target-this.yaw));
                    const yaw=this.yaw+Math.max(-2*h,Math.min(2*h,turn));
                    if(this.loaded(this.pos.x,this.pos.z,.25,yaw) && !this.collides(undefined,undefined,undefined,yaw,rider))this.yaw=yaw;
                }
            }
            if(w) {
                const decay=Math.exp(-3*h),fx=w.flow?.[0]??0,fz=w.flow?.[1]??0;
                this.vel.x=this.vel.x*decay+(ax*3+fx)*(1-decay);
                this.vel.z=this.vel.z*decay+(az*3+fz)*(1-decay);
                const target=w.surface+.08;
                this.vel.y += (38*(target-this.pos.y)-10*this.vel.y)*h;
                this.vel.y=Math.max(-6,Math.min(4,this.vel.y));
            } else {
                this.vel.y=Math.max(-16,this.vel.y-18*h);
                const decay=Math.exp(-(this.grounded?8:.15)*h);
                this.vel.x*=decay;this.vel.z*=decay;
            }
            const distance=Math.max(Math.abs(this.vel.x*h),Math.abs(this.vel.y*h),Math.abs(this.vel.z*h));
            const sweeps=Math.max(1,Math.ceil(distance/.18)), part=h/sweeps;
            this.grounded=this.blocked=false;
            for(let j=0;j<sweeps;j++) {
                // Float up a small change of water height before moving into its lip.
                if(this.vel.y>0 && this.move('y',this.vel.y*part,rider))this.vel.y=0;
                if(this.move('x',this.vel.x*part,rider)){this.vel.x=0;this.blocked=true;}
                if(this.move('z',this.vel.z*part,rider)){this.vel.z=0;this.blocked=true;}
                if(this.vel.y<0 && this.move('y',this.vel.y*part,rider)){this.vel.y=0;this.grounded=true;}
            }
        }
    }
}
