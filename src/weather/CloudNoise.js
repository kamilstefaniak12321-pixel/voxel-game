import * as THREE from 'three';

// ------------------------------------------------------------
// SZUM CHMUR (1.11.0)
//
// Jedna mała tekstura (256 x 256), z której shadery biorą kształt
// chmur. Brzegi pasują do siebie, więc powtarza się bez szwów. Każdy
// kanał to inny, niezależny wzór:
//   R - kłęby (chmury niskie),
//   G - duże plamy (grupy chmur, chmury średnie),
//   B - smugi wzdłuż osi x (chmury pierzaste),
//   A - drobna nierówność (wierzchołki kłębów).
// Wartości każdego kanału są wyrównane: każda jasność występuje tak
// samo często. Dzięki temu "pokrycie 40%" z mapy pogody daje naprawdę
// około 40% nieba w chmurach.
//
// Tekstura jest zawsze taka sama (nie zależy od świata) - o tym, gdzie
// są chmury, decyduje mapa pogody (Weather.js), szum daje tylko kształt.
// ------------------------------------------------------------

export const CLOUD_NOISE_SIZE = 256;


function random(seed) {

    let a = seed >>> 0;

    return () => {

        a = (a + 0x6D2B79F5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    };

}


// Gładki szum na kracie periodX x periodZ oczek, zawinięty na brzegach;
// dodaje się do `out` z wagą `weight`.

function addLattice(out, size, periodX, periodZ, weight, next) {

    const lattice = new Float32Array(periodX * periodZ);

    for (let i = 0; i < lattice.length; i++) {
        lattice[i] = next();
    }

    for (let z = 0; z < size; z++) {

        const gz = z / size * periodZ;
        const z0 = Math.floor(gz);
        const fz = gz - z0;
        const uz = fz * fz * (3 - 2 * fz);
        const rowA = (z0 % periodZ) * periodX;
        const rowB = ((z0 + 1) % periodZ) * periodX;

        for (let x = 0; x < size; x++) {

            const gx = x / size * periodX;
            const x0 = Math.floor(gx);
            const fx = gx - x0;
            const ux = fx * fx * (3 - 2 * fx);
            const xa = x0 % periodX;
            const xb = (x0 + 1) % periodX;

            const top = lattice[rowA + xa] + (lattice[rowA + xb] - lattice[rowA + xa]) * ux;
            const bottom = lattice[rowB + xa] + (lattice[rowB + xb] - lattice[rowB + xa]) * ux;

            out[z * size + x] += weight * (top + (bottom - top) * uz);

        }

    }

}


// Zamienia wartości na 0-255 według kolejności (wyrównanie).

function equalize(values, target, channel) {

    const order = new Uint32Array(values.length);

    for (let i = 0; i < order.length; i++) {
        order[i] = i;
    }

    order.sort((a, b) => values[a] - values[b]);

    for (let rank = 0; rank < order.length; rank++) {
        target[order[rank] * 4 + channel] = Math.min(255, Math.floor(rank / order.length * 256));
    }

}


// Dane tekstury (RGBA, 0-255). Osobno od tekstury - do testów.

export function cloudNoiseData(size = CLOUD_NOISE_SIZE) {

    const data = new Uint8Array(size * size * 4);

    // Kanał: kolejne oktawy [oczka x, oczka z, waga].
    const channels = [
        [[8, 8, 1], [16, 16, 0.5], [32, 32, 0.25], [64, 64, 0.12]],
        [[6, 6, 1], [12, 12, 0.5], [24, 24, 0.25], [48, 48, 0.12]],
        [[3, 24, 1], [6, 48, 0.5], [12, 96, 0.25]],
        [[32, 32, 1], [64, 64, 0.5], [128, 128, 0.25]]
    ];

    channels.forEach((octaves, channel) => {

        const values = new Float32Array(size * size);
        const next = random(0x9e3779b9 + channel * 7919);

        for (const [periodX, periodZ, weight] of octaves) {
            addLattice(values, size, periodX, periodZ, weight, next);
        }

        equalize(values, data, channel);

    });

    return data;

}


let shared = null;

// Wspólna tekstura szumu (powstaje przy pierwszym użyciu).

export function cloudNoiseTexture() {

    if (shared) {
        return shared;
    }

    shared = new THREE.DataTexture(cloudNoiseData(), CLOUD_NOISE_SIZE, CLOUD_NOISE_SIZE, THREE.RGBAFormat);
    shared.wrapS = shared.wrapT = THREE.RepeatWrapping;
    shared.magFilter = THREE.LinearFilter;
    shared.minFilter = THREE.LinearMipmapLinearFilter;
    shared.generateMipmaps = true;
    shared.needsUpdate = true;

    return shared;

}
