// ------------------------------------------------------------
// SZUM (Perlin noise)
//
// Szum to "gładka losowość": punkty leżące blisko siebie dostają
// podobne wartości, więc z szumu wychodzą łagodne wzgórza, a nie
// losowe pojedyncze słupki.
//
// Ten sam seed zawsze daje dokładnie ten sam szum,
// czyli ten sam świat.
// ------------------------------------------------------------

// Zamienia seed (liczbę albo tekst) na liczbę całkowitą.

export function seedToNumber(seed) {

    if (typeof seed === 'number') {
        return Math.floor(seed) >>> 0;
    }


    const text = String(seed);

    let h = 2166136261;

    for (let i = 0; i < text.length; i++) {

        h = Math.imul(
            h ^ text.charCodeAt(i),
            16777619
        );

    }

    return h >>> 0;

}


// Generator liczb pseudolosowych 0..1 startujący od seeda.

function createRandom(seed) {

    let a = seed >>> 0;

    return () => {

        a = (a + 0x6D2B79F5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    };

}


// Wygładzenie przejścia między punktami siatki.

function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}


function lerp(a, b, t) {
    return a + (b - a) * t;
}


// Kierunek "pochylenia" w rogu siatki (2D i 3D).

function grad2(hash, x, y) {

    switch (hash & 7) {
        case 0: return x + y;
        case 1: return x - y;
        case 2: return -x + y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
    }

}


function grad3(hash, x, y, z) {

    const h = hash & 15;

    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);

    return (
        ((h & 1) === 0 ? u : -u) +
        ((h & 2) === 0 ? v : -v)
    );

}

// ------------------------------------------------------------

export class Noise {

    constructor(seed) {

        const random =
            createRandom(
                seedToNumber(seed)
            );


        // Tablica liczb 0-255 potasowana według seeda.

        const table = new Uint8Array(256);

        for (let i = 0; i < 256; i++) {
            table[i] = i;
        }

        for (let i = 255; i > 0; i--) {

            const j = Math.floor(random() * (i + 1));

            const temp = table[i];
            table[i] = table[j];
            table[j] = temp;

        }


        // Podwojona, żeby nie trzeba było zawijać indeksów.

        this.perm = new Uint8Array(512);

        for (let i = 0; i < 512; i++) {
            this.perm[i] = table[i & 255];
        }

    }


    // Szum 2D. Zwraca wartość mniej więcej od -1 do 1.

    noise2D(x, y) {

        const perm = this.perm;

        const floorX = Math.floor(x);
        const floorY = Math.floor(y);

        const X = floorX & 255;
        const Y = floorY & 255;

        x -= floorX;
        y -= floorY;

        const u = fade(x);
        const v = fade(y);

        const a = perm[X] + Y;
        const b = perm[X + 1] + Y;


        return lerp(

            lerp(
                grad2(perm[a], x, y),
                grad2(perm[b], x - 1, y),
                u
            ),

            lerp(
                grad2(perm[a + 1], x, y - 1),
                grad2(perm[b + 1], x - 1, y - 1),
                u
            ),

            v

        );

    }


    // Szum 3D. Zwraca wartość mniej więcej od -1 do 1.

    noise3D(x, y, z) {

        const perm = this.perm;

        const floorX = Math.floor(x);
        const floorY = Math.floor(y);
        const floorZ = Math.floor(z);

        const X = floorX & 255;
        const Y = floorY & 255;
        const Z = floorZ & 255;

        x -= floorX;
        y -= floorY;
        z -= floorZ;

        const u = fade(x);
        const v = fade(y);
        const w = fade(z);

        const a = perm[X] + Y;
        const aa = perm[a] + Z;
        const ab = perm[a + 1] + Z;

        const b = perm[X + 1] + Y;
        const ba = perm[b] + Z;
        const bb = perm[b + 1] + Z;


        return lerp(

            lerp(
                lerp(
                    grad3(perm[aa], x, y, z),
                    grad3(perm[ba], x - 1, y, z),
                    u
                ),
                lerp(
                    grad3(perm[ab], x, y - 1, z),
                    grad3(perm[bb], x - 1, y - 1, z),
                    u
                ),
                v
            ),

            lerp(
                lerp(
                    grad3(perm[aa + 1], x, y, z - 1),
                    grad3(perm[ba + 1], x - 1, y, z - 1),
                    u
                ),
                lerp(
                    grad3(perm[ab + 1], x, y - 1, z - 1),
                    grad3(perm[bb + 1], x - 1, y - 1, z - 1),
                    u
                ),
                v
            ),

            w

        );

    }


    // Kilka warstw szumu 2D nałożonych na siebie ("oktawy"):
    // każda kolejna jest 2x drobniejsza i 2x słabsza.
    // Pierwsza daje duże kształty, następne dodają szczegóły.
    // Zwraca wartość mniej więcej od -1 do 1.
    //
    // used - ile pierwszych oktaw naprawdę policzyć (domyślnie
    // wszystkie). Mniej = ten sam kształt bez drobnych szczegółów
    // (dla dalekiego terenu, oglądanego z daleka).

    fractal2D(x, y, octaves, used = octaves) {

        let sum = 0;
        let amplitude = 1;
        let frequency = 1;
        let total = 0;


        for (let i = 0; i < octaves; i++) {

            // Przesunięcie (i * 31.7) sprawia, że warstwy nie
            // zerują się wszystkie w tych samych punktach.

            if (i < used) {

                sum +=
                    this.noise2D(
                        x * frequency + i * 31.7,
                        y * frequency + i * 31.7
                    ) * amplitude;

            }

            total += amplitude;

            amplitude *= 0.5;
            frequency *= 2;

        }


        return sum / total;

    }

}
