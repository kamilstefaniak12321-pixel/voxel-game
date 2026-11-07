import * as THREE from 'three';

import { getWaterLevel } from '../blocks/BlockRegistry.js';

import { CubeParticles } from './CubeParticles.js';
import { WaterfallRipples } from './WaterfallRipples.js';

import { waterfallLightingAt } from './WaterfallLighting.js';

// ------------------------------------------------------------
// ROZBRYZG POD WODOSPADEM (0.73.0)
//
// Spadająca woda liczy, ile bloków już spada (src/blocks/water.js -
// 1 pod krawędzią, +1 co blok, najwyżej 16). Symulacja wody zapamiętuje
// dół każdego strumienia (WaterSimulation.landing) - tu, przy graczu,
// z tych miejsc lecą:
//   - krople w górę i na boki - im wyższy spadek, tym wyżej i więcej,
//   - piana na tafli, niesiona nurtem (albo na boki) - im wyższy spadek,
//     tym jej więcej i dłużej płynie, więc sięga dalej w dół rzeki,
//   - mgiełka - tylko pod wysokim wodospadem (od MIST_FALL bloków).
// Cząsteczki to małe sześciany (CubeParticles.js, jedno rysowanie),
// oświetlone jak teren w miejscu wodospadu.
// ------------------------------------------------------------

// Jak daleko od gracza (w poziomie) wodospady chlapią.
export const WATERFALL_RADIUS = 40;

// Najwięcej dołów wodospadów naraz (najbliższe).
const MAX_LANDINGS = 64;

// Co ile sekund szukamy dołów wodospadów przy graczu.
const REFRESH = 0.3;

// Od jakiego spadku jest mgiełka.
export const MIST_FALL = 6;

// Ile cząsteczek na sekundę z jednego dołu (spadek 1 i za każdy blok).
export const SPLASH_RATE = [3, 1.6];
export const FOAM_RATE = [2, 0.9];
const MIST_RATE = 0.5;

const DROP_COLORS = [new THREE.Color(0.92, 0.97, 1.0), new THREE.Color(0.7, 0.84, 0.95), new THREE.Color(0.55, 0.72, 0.9)];
const FOAM_COLORS = [new THREE.Color(1, 1, 1), new THREE.Color(0.93, 0.97, 1), new THREE.Color(0.8, 0.9, 0.97)];
const MIST_COLORS = [new THREE.Color(0.95, 0.97, 1), new THREE.Color(0.9, 0.94, 0.98), new THREE.Color(0.85, 0.9, 0.95)];


function random(min, max) {

    return min + Math.random() * (max - min);

}


// Ile piany i jak długo płynie przy danym spadku - też do testów.

export function waterfallStrength(fall) {

    const f = Math.max(1, Math.min(16, fall));

    return {
        splash: SPLASH_RATE[0] + SPLASH_RATE[1] * (f - 1),
        foam: FOAM_RATE[0] + FOAM_RATE[1] * (f - 1),
        mist: f >= MIST_FALL ? MIST_RATE * f : 0,
        // Prędkość kropli w górę (bloki/s) i jak długo płynie piana (s).
        rise: Math.min(6.5, 2 + f * 0.3),
        foamLife: 0.9 + f * 0.3,
        foamSpeed: 0.7 + f * 0.07
    };

}


export class WaterfallEffects {

    constructor(scene, world) {

        this.world = world;

        this.particles = new CubeParticles(scene, { capacity: 1600, surfaceLighting: true });
        this.ripples = new WaterfallRipples(scene, world);

        this.landings = [];
        this.refresh = 0;
        this.amount = 1;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

    }


    // amount - mnożnik ilości (tryb ziemniaka mniej, 0 - wcale).

    setAmount(amount) {

        this.amount = Math.max(0, amount);
        this.ripples.setLandings(this.landings, this.amount);
        this.refresh = 0;

    }


    // Doły wodospadów przy graczu: miejsce, spadek, gdzie jest tafla,
    // w którą stronę płynie piana i światło.

    findLandings(x, z) {

        const fluids = this.world.fluids;

        const found = this.landings;

        const previous = new Map(found.map((landing) => [landing.key, landing]));

        found.length = 0;

        if (!fluids?.forEachLanding) {
            this.ripples.setLandings(found, this.amount);
            return;
        }

        fluids.forEachLanding(x, z, WATERFALL_RADIUS, (lx, ly, lz, fall) => {

            const key = `${lx},${ly},${lz}`;

            const old = previous.get(key);

            const below = this.world.getBlockId(lx, ly - 1, lz);

            // Na tafli źródła - piana tuż pod jej wierzchem; na dnie -
            // na rozlanej cienkiej wodzie.
            const surface = getWaterLevel(below) === 0 ? ly - 0.12 : ly + 0.2;

            const flow = this.world.getFlow?.(lx, lz) ?? this.world.getFlow?.(lx, lz + 1) ?? null;

            found.push({
                key, x: lx, y: ly, z: lz, fall, surface,
                flowX: flow ? flow[0] : 0, flowZ: flow ? flow[1] : 0,
                distance: Math.hypot(lx + 0.5 - x, lz + 0.5 - z),
                lighting: this.lightingAt(lx, ly, lz),
                splash: old?.splash ?? Math.random(),
                foam: old?.foam ?? Math.random(),
                mist: old?.mist ?? Math.random()
            });

        });

        if (found.length > MAX_LANDINGS) {
            found.sort((a, b) => a.distance - b.distance);
            found.length = MAX_LANDINGS;
        }

        this.ripples.setLandings(found, this.amount);

    }


    lightingAt(x, y, z) {
        return waterfallLightingAt(this.world, x, y, z);
    }


    update(dt, player) {

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
        this.particles.update(dt, null);

    }


    emitFrom(landing, dt) {

        const strength = waterfallStrength(landing.fall);

        // Dalsze wodospady chlapią mniej (z daleka i tak nie widać).
        const near = 1 - 0.6 * Math.min(1, landing.distance / WATERFALL_RADIUS);

        const scale = this.amount * near;

        landing.splash += strength.splash * scale * dt;
        landing.foam += strength.foam * scale * dt;
        landing.mist += strength.mist * scale * dt;

        for (; landing.splash >= 1; landing.splash--) {
            this.drop(landing, strength);
        }

        for (; landing.foam >= 1; landing.foam--) {
            this.foam(landing, strength);
        }

        for (; landing.mist >= 1; landing.mist--) {
            this.mist(landing);
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


    foam(landing, strength) {

        // Z nurtem rzeki, a gdzie nurtu nie ma - na boki od wodospadu.

        const flowing = Math.hypot(landing.flowX, landing.flowZ) > 0.05;

        const angle = flowing
            ? Math.atan2(landing.flowZ, landing.flowX) + random(-0.5, 0.5)
            : Math.random() * Math.PI * 2;

        const speed = strength.foamSpeed * random(0.7, 1.2);

        this.position.set(landing.x + 0.5 + random(-0.6, 0.6), landing.surface, landing.z + 0.5 + random(-0.6, 0.6));

        this.velocity.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);

        this.particles.emit({
            position: this.position,
            velocity: this.velocity,
            life: strength.foamLife * random(0.7, 1.2),
            size: random(0.12, 0.22),
            sizeEnd: 0.06,
            fade: 0.4,
            colors: FOAM_COLORS,
            lighting: landing.lighting,
            drag: 0.25,
            spin: 1
        });

    }


    mist(landing) {

        this.position.set(landing.x + random(-0.3, 1.3), landing.surface + random(0, 0.6), landing.z + random(-0.3, 1.3));

        this.velocity.set(random(-0.4, 0.4), random(0.3, 0.8), random(-0.4, 0.4));

        this.particles.emit({
            position: this.position,
            velocity: this.velocity,
            life: random(1.0, 1.8),
            size: random(0.18, 0.3),
            sizeEnd: 0.4,
            fade: 0.5,
            colors: MIST_COLORS,
            lighting: landing.lighting,
            lift: 0.4,
            drag: 1.2,
            spin: 1
        });

    }


    get count() {

        return this.particles.count;

    }


    dispose() {

        this.particles.dispose();
        this.ripples.dispose();

    }

}
