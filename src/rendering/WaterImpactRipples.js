import { WaterfallRipples } from './WaterfallRipples.js';
import { getWaterLevel, isSolidId } from '../blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { CHUNK_SIZE } from '../config.js';

export const WATER_IMPACT_CAPS = Object.freeze({ emitters: 12, potatoEmitters: 4,
    playerInterval: .42, rainLifetime: 1.2, playerLifetime: 1.8 });

// Short impulses use the same triangle mask, lighting and GPU profile as
// waterfall rings. Together the two renderers have at most 24 fields (8 low).
// Their discovery work shares the waterfall renderer's 48-cell frame budget.
export class WaterImpactRipples {
    constructor(scene, world) {
        this.world = world;
        this.ripples = new WaterfallRipples(scene, world, { transient: true });
        this.ripples.mesh.name = 'Player and rain water rings';
        this.material = this.ripples.material;
        this.records = [];
        this.nextId = 1;
        this.amount = 1;
        this.dirty = false;
        this.lastPlayerClock = -1;
        this.playerTimer = 0;
        this.previous = null;
        this.emitted = { player: 0, rain: 0 };
        this.disposed = false;
    }

    get clock() { return this.material.uniforms.uRippleClock.value; }
    get limit() { return this.amount <= 0 ? 0 : this.amount <= .35 ? 4 : 12; }

    setAmount(amount) {
        if (this.disposed) return;
        this.amount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
        if (this.records.length > this.limit) {
            this.records.sort((a, b) => Number(b.kind === 'player') - Number(a.kind === 'player'));
            this.records.length = this.limit;
        }
        this.dirty = true;
        this.publish();
        if (!this.limit) this.ripples.update(0, 0);
    }

    add(x, y, z, kind = 'player', strength = .5) {
        if (this.disposed || !this.limit || ![x, y, z, strength].every(Number.isFinite)) return false;
        if (kind !== 'player' && kind !== 'rain') return false;
        const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
        if (!this.world.getChunk(Math.floor(bx / CHUNK_SIZE), Math.floor(bz / CHUNK_SIZE))) return false;
        const level = getWaterLevel(this.world.getBlockId(bx, by, bz));
        const above = this.world.getBlockId(bx, by + 1, bz);
        if (level < 0 || level === 8 || getWaterLevel(above) >= 0 || isSolidId(above)) return false;
        // Reserve space for the player even in rain; drops never displace a
        // player's ring. No unbounded queue builds up when the pool is full.
        const rainLimit = this.limit - (this.limit > 4 ? 2 : 1);
        if (kind === 'rain' && (this.records.length >= this.limit ||
            this.records.filter(item => item.kind === 'rain').length >= rainLimit)) return false;
        if (this.records.length >= this.limit) {
            const rain = this.records.findIndex(item => item.kind === 'rain');
            if (rain < 0) return false;
            this.records.splice(rain, 1);
        }
        const power = Math.max(0, Math.min(1, strength));
        this.records.push({ key: `impact:${this.nextId++}`, x, y: by, z, kind,
            fall: 1, radius: kind === 'rain' ? .55 + .2 * power : 1.2 + 1.0 * power,
            opacity: kind === 'rain' ? .55 : .35 + .25 * power,
            birth: this.clock, lifetime: kind === 'rain' ? WATER_IMPACT_CAPS.rainLifetime : WATER_IMPACT_CAPS.playerLifetime });
        this.emitted[kind]++;
        this.dirty = true;
        return true;
    }

    playerSurface(player) {
        const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
        // Normal wakes query only 2–3 body cells. A fast entry can carry the
        // whole collider below the surface in one step: allow six extra cells
        // on that single splash, never an unbounded scan up a waterfall.
        const top = player.pos.y + player.height + (player.splash > 0 ? 6 : 0);
        for (let y = Math.floor(player.pos.y); y < top; y++) {
            const id = this.world.getBlockId(x, y, z);
            if (isSolidId(id)) return null;
            const level = getWaterLevel(id);
            if (level < 0 || level === 8) continue;
            const above = this.world.getBlockId(x, y + 1, z);
            if (getWaterLevel(above) >= 0 || isSolidId(above)) continue;
            const height = y + waterSurfaceHeight(this.world, x, y, z, player.pos.x - x, player.pos.z - z);
            if (height > player.pos.y && height < top) return y;
        }
        return null;
    }

    update(dt, player, cellBudget = 48) {
        if (this.disposed) return;
        const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
        const end = this.clock + step;
        for (let i = this.records.length - 1; i >= 0; i--) {
            if (end < this.records[i].birth + this.records[i].lifetime) continue;
            this.records.splice(i, 1); this.dirty = true;
        }
        this.playerTimer = Math.max(0, this.playerTimer - step);
        if (player && player.clock !== this.lastPlayerClock) {
            this.lastPlayerClock = player.clock;
            const moved = this.previous ? Math.hypot(player.pos.x - this.previous.x, player.pos.z - this.previous.z) : 0;
            if (this.limit && !player.flying && player.submerged > .1 &&
                (player.splash > 0 || moved > .15 * step && this.playerTimer <= 0)) {
                const y = this.playerSurface(player);
                if (y !== null && this.add(player.pos.x, y, player.pos.z, 'player',
                    player.splash > 0 ? Math.min(1, player.splash / 12) : .25)) this.playerTimer = WATER_IMPACT_CAPS.playerInterval;
            }
            this.previous ??= { x: player.pos.x, z: player.pos.z };
            this.previous.x = player.pos.x; this.previous.z = player.pos.z;
        }
        if (this.dirty) this.publish();
        this.ripples.update(step, cellBudget);
    }

    publish() {
        this.ripples.setLandings(this.records, this.amount);
        this.dirty = false;
    }

    stats() {
        return { ...this.ripples.stats(), active: this.records.length,
            player: this.records.filter(item => item.kind === 'player').length,
            rain: this.records.filter(item => item.kind === 'rain').length,
            emitted: { ...this.emitted }, limit: this.limit };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.records.length = 0;
        this.ripples.dispose();
        this.previous = this.world = null;
    }
}
