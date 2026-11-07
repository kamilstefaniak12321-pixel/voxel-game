import * as THREE from 'three';

import { getWaterLevel } from '../blocks/BlockRegistry.js';

import { CubeParticles } from './CubeParticles.js';
import { WaterfallRipples } from './WaterfallRipples.js';
import { WaterfallFoam } from './WaterfallFoam.js';
import { WaterfallMist, MIST_MIN_FALL } from './WaterfallMist.js';
import { effectAmount } from './WaterfallEffectMaterial.js';

import { waterfallLightingAt } from './WaterfallLighting.js';

// ------------------------------------------------------------
// ROZBRYZG POD WODOSPADEM (0.73.0)
//
// Spadająca woda liczy, ile bloków już spada (src/blocks/water.js -
// 1 pod krawędzią, +1 co blok, najwyżej 16). Symulacja wody zapamiętuje
// dół każdego strumienia (WaterSimulation.landing) - tu, przy graczu,
// z tych miejsc lecą:
//   - krople w górę i na boki - im wyższy spadek, tym wyżej i więcej,
//   - płaska piana na tafli, z teksturą przesuwaną nurtem - im wyższy
//     spadek, tym większa i bardziej widoczna plama,
//   - mgiełka - tylko pod wysokim wodospadem (od MIST_FALL bloków).
// Krople zachowują sześciany. Piana wykorzystuje gotową maskę tafli
// fal, a mgiełka miękkie billboardy. Każda warstwa ma jedno rysowanie,
// twardy limit i wspólne z wodą oświetlenie/cienie.
// ------------------------------------------------------------

// Jak daleko od gracza (w poziomie) wodospady chlapią.
export const WATERFALL_RADIUS = 40;

// Najwięcej dołów wodospadów naraz (najbliższe).
const MAX_LANDINGS = 64;

// Co ile sekund szukamy dołów wodospadów przy graczu.
const REFRESH = 0.3;

// Od jakiego spadku jest mgiełka.
export const MIST_FALL = MIST_MIN_FALL;

// Ile cząsteczek na sekundę z jednego dołu (spadek 1 i za każdy blok).
export const SPLASH_RATE = [3, 1.6];

const DROP_COLORS = [new THREE.Color(0.92, 0.97, 1.0), new THREE.Color(0.7, 0.84, 0.95), new THREE.Color(0.55, 0.72, 0.9)];


function random(min, max) {

    return min + Math.random() * (max - min);

}


// Stawka i wysokość zachowanych sześciennych kropli.

export function waterfallStrength(fall) {

    const f = Math.max(1, Math.min(16, fall));

    return {
        splash: SPLASH_RATE[0] + SPLASH_RATE[1] * (f - 1),
        rise: Math.min(6.5, 2 + f * 0.3)
    };

}


export class WaterfallEffects {

    constructor(scene, world) {

        this.world = world;

        this.particles = new CubeParticles(scene, { capacity: 1600, surfaceLighting: true });
        this.ripples = new WaterfallRipples(scene, world);
        this.foam = new WaterfallFoam(scene, this.ripples.surface);
        this.mist = new WaterfallMist(scene);
        this.materials = [this.ripples.material, this.foam.material, this.mist.material];

        this.landings = [];
        this.refresh = 0;
        this.amount = 1;
        this.landingRevision = 0;
        this.disposed = false;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

    }


    // amount - mnożnik ilości (tryb ziemniaka mniej, 0 - wcale).

    setAmount(amount) {

        if (this.disposed) return;
        this.amount = effectAmount(amount);
        this.ripples.setLandings(this.landings, this.amount);
        this.foam.setAmount(this.amount);
        this.mist.setAmount(this.amount);
        this.refresh = 0;

    }


    // Doły wodospadów przy graczu: miejsce, spadek, gdzie jest tafla,
    // w którą stronę płynie piana i światło.

    findLandings(x, z) {

        if (this.disposed) return;
        const fluids = this.world.fluids;

        const found = this.landings;

        const previous = new Map(found.map((landing) => [landing.key, landing]));

        found.length = 0;
        this.landingRevision++;

        if (!fluids?.forEachLanding) {
            this.ripples.setLandings(found, this.amount);
            this.foam.setLandings(found);
            this.mist.setLandings(found);
            return;
        }

        fluids.forEachLanding(x, z, WATERFALL_RADIUS, (lx, ly, lz, fall) => {

            const key = `${lx},${ly},${lz}`;

            const old = previous.get(key);

            const below = this.world.getBlockId(lx, ly - 1, lz);

            // Punkt startu kropli i mgiełki. Piana ma osobno dokładne
            // wysokości maski tafli, wspólne z siatką wody i falami.
            const surface = getWaterLevel(below) === 0 ? ly - 0.12 : ly + 0.2;

            const receivingY = getWaterLevel(below) >= 0 ? ly - 1 : ly;
            const flow = this.world.getWaterFlow?.(lx, receivingY, lz)
                ?? this.world.getFlow?.(lx, lz) ?? this.world.getFlow?.(lx, lz + 1) ?? null;

            found.push({
                key, x: lx, y: ly, z: lz, fall, surface,
                flowX: flow ? flow[0] : 0, flowZ: flow ? flow[1] : 0,
                distance: Math.hypot(lx + 0.5 - x, lz + 0.5 - z),
                lighting: this.lightingAt(lx, ly, lz),
                splash: old?.splash ?? Math.random()
            });

        });

        if (found.length > MAX_LANDINGS) {
            found.sort((a, b) => a.distance - b.distance);
            found.length = MAX_LANDINGS;
        }

        this.ripples.setLandings(found, this.amount);
        this.foam.setLandings(found);
        this.mist.setLandings(found);

    }


    lightingAt(x, y, z) {
        return waterfallLightingAt(this.world, x, y, z);
    }


    update(dt, player, camera = null) {

        if (this.disposed) return;
        dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        if (player && this.amount > 0) {

            this.refresh -= dt;

            if (this.refresh <= 0) {
                this.refresh = REFRESH;
                this.findLandings(player.pos.x, player.pos.z);
            }

            for (const landing of this.landings) {
                this.emitFrom(landing, Math.min(dt, 0.1));
            }

        }

        this.ripples.update(dt);
        this.foam.update(dt);
        this.mist.update(dt, camera ?? player?.camera);
        this.particles.update(dt, null);

    }


    emitFrom(landing, dt) {

        const strength = waterfallStrength(landing.fall);

        // Dalsze wodospady chlapią mniej (z daleka i tak nie widać).
        const near = 1 - 0.6 * Math.min(1, landing.distance / WATERFALL_RADIUS);

        const scale = this.amount * near;

        landing.splash += strength.splash * scale * dt;

        for (; landing.splash >= 1; landing.splash--) {
            this.drop(landing, strength);
        }

    }


    drop(landing, strength) {

        const angle = Math.random() * Math.PI * 2;

        const out = random(0.6, 1.6) + landing.fall * 0.06;

        this.position.set(landing.x + random(0.1, 0.9), landing.surface + 0.05, landing.z + random(0.1, 0.9));

        this.velocity.set(Math.cos(angle) * out, strength.rise * random(0.6, 1.1), Math.sin(angle) * out);

        this.particles.emit({
            position: this.position,
            velocity: this.velocity,
            life: random(0.45, 0.8),
            size: random(0.07, 0.13),
            sizeEnd: 0.05,
            fade: 0.3,
            colors: DROP_COLORS,
            lighting: landing.lighting,
            gravity: 15,
            drag: 0.6,
            spin: 4
        });

    }


    get count() {

        return this.particles.count;

    }


    stats() {
        return { drops: this.count, landingRevision: this.landingRevision,
            ripples: this.ripples.stats(), foam: this.foam.stats(), mist: this.mist.stats() };
    }


    dispose() {

        if (this.disposed) return;
        this.disposed = true;
        this.particles.dispose();
        this.foam.dispose();
        this.mist.dispose();
        this.ripples.dispose();
        this.landings.length = 0;
        this.world = null;

    }

}
