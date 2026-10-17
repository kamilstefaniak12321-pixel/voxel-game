import * as THREE from 'three';

import { SEA_LEVEL, CHUNK_HEIGHT } from '../config.js';

// ------------------------------------------------------------
// MAPA DO KULI ZIEMI (src/space/Globe.js)
//
// Kwadratowa mapa terenu widzianego z góry, policzona z generatora
// świata (generator.farSurface - to samo, czego używa daleki teren),
// ze środkiem tam, gdzie był gracz, gdy zaczęło się jej liczenie:
//   color  - kolor powierzchni (sRGB), a w kanale alfa: 1 = morze,
//   height - wysokość terenu (do cieniowania gór na kuli).
//
// Liczy się po kawałku co klatkę (z limitem czasu), od zgrubnej
// do dokładnej: najpierw co 16 tekseli (cała mapa po chwili, tylko
// rozmyta), potem co 8, 4, 2 i 1. Kula jest widoczna od pierwszego
// przebiegu.
//
// Gdy gracz odleci daleko od środka mapy, liczy się nowa (stara jest
// pokazywana, dopóki nowa nie ma pierwszego przebiegu).
// ------------------------------------------------------------

// Pierwszy (najgrubszy) krok w tekselach.
const FIRST_STEP = 16;


// Kolory zapasowe (liniowe), zanim daleki teren policzy średnie
// kolory tekstur.

const FALLBACK = {
    grass: new THREE.Color(0.1, 0.22, 0.05),
    side: new THREE.Color(0.16, 0.12, 0.06),
    stone: new THREE.Color(0.22, 0.22, 0.22),
    sand: new THREE.Color(0.62, 0.55, 0.33),
    water: new THREE.Color(0.066, 0.124, 0.315)
};


function smoothstep(edge0, edge1, x) {

    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}


// Liniowy kolor -> 0-255 (sRGB).

function toSrgb8(value) {

    const v = Math.min(1, Math.max(0, value));

    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

    return Math.round(s * 255);

}


export class GlobeMap {

    // size     - ile tekseli na bok (potęga dwójki),
    // halfSize - pół boku mapy w blokach.

    constructor(size, halfSize) {

        this.size = size;
        this.halfSize = halfSize;

        // Ile bloków na teksel.
        this.texel = 2 * halfSize / size;

        this.colorData = new Uint8Array(size * size * 4);
        this.heightData = new Uint8Array(size * size);

        this.colorTexture = new THREE.DataTexture(this.colorData, size, size, THREE.RGBAFormat);
        this.colorTexture.colorSpace = THREE.SRGBColorSpace;

        this.heightTexture = new THREE.DataTexture(this.heightData, size, size, THREE.RedFormat);

        for (const texture of [this.colorTexture, this.heightTexture]) {

            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.generateMipmaps = true;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

        }


        // Środek mapy w świecie (null = jeszcze nie liczona).

        this.center = null;

        // Postęp: obecny krok (w tekselach) i numer próbki w tym kroku.

        this.step = FIRST_STEP;
        this.index = 0;

        // Czy jest już coś do pokazania (pierwszy przebieg) i czy całość.

        this.ready = false;
        this.complete = false;

        this.dirty = false;

        this.color = new THREE.Color();

    }


    // Zaczyna liczyć mapę od nowa ze środkiem w (x, z).

    start(x, z) {

        this.center = { x: Math.round(x), z: Math.round(z) };

        this.step = FIRST_STEP;
        this.index = 0;

        this.ready = false;
        this.complete = false;

    }


    // Liczy kolejne próbki przez najwyżej budgetMs milisekund.
    // colors - kolory dalekiego terenu (FarTerrain.colors) albo null.

    build(generator, colors, budgetMs) {

        if (!this.center || this.complete) {
            return;
        }

        const deadline = performance.now() + budgetMs;

        const N = this.size;

        let done = 0;


        while (performance.now() < deadline || done < 16) {

            const step = this.step;

            // Na tym kroku: punkty co `step`, oprócz tych z kroku wcześniej
            // (co 2*step - już policzone).

            const perRow = N / step;

            if (this.index >= perRow * perRow) {

                if (step === FIRST_STEP) {
                    this.ready = true;
                }

                if (step === 1) {

                    this.complete = true;

                    break;

                }

                this.step = step / 2;
                this.index = 0;

                continue;

            }


            const i = (this.index % perRow) * step;
            const j = Math.floor(this.index / perRow) * step;

            this.index++;

            if (step < FIRST_STEP && i % (step * 2) === 0 && j % (step * 2) === 0) {
                continue;
            }

            this.sample(generator, colors, i, j, step);

            done++;

        }

        this.dirty = true;

    }


    // Jedna próbka: kolor i wysokość w tekselu (i, j), wpisane
    // w kwadrat step x step (dokładniejsze kroki go potem nadpiszą).

    sample(generator, colors, i, j, step) {

        const N = this.size;

        const x = this.center.x + (i + step * 0.5 - N / 2) * this.texel;
        const z = this.center.z + (j + step * 0.5 - N / 2) * this.texel;

        const surface = generator.farSurface(x, z, this.texel * step);

        const palette = colors ?? FALLBACK;

        const color = this.color;

        let water = 0;
        let height = Math.min(CHUNK_HEIGHT, surface.top);


        if (surface.kind === 'water') {

            // Płytko - jaśniej i bardziej turkusowo, głęboko - ciemno.

            water = 255;

            const depth = surface.floor !== undefined ? SEA_LEVEL + 1 - surface.floor : 20;

            const deep = smoothstep(2, 36, depth);

            color.copy(palette.water ?? FALLBACK.water);

            color.setRGB(
                color.r * (1.15 - 0.55 * deep) + 0.02 * (1 - deep),
                color.g * (1.6 - 0.9 * deep) + 0.05 * (1 - deep),
                color.b * (1.25 - 0.45 * deep)
            );

            height = SEA_LEVEL + 1;

        }
        else if (surface.kind === 'sand') {
            color.copy(palette.sand ?? FALLBACK.sand);
        }
        else if (surface.kind === 'grass') {

            // Wyżej trawa przechodzi w ziemię (jak zbocza na dalekim terenie).

            color.copy(palette.grass_top ?? palette.grass ?? FALLBACK.grass)
                .lerp(palette.grass_side ?? FALLBACK.side, 0.35 * smoothstep(SEA_LEVEL + 25, SEA_LEVEL + 60, height));

        }
        else {
            color.copy(palette[surface.kind] ?? palette.stone ?? FALLBACK.stone);
        }


        const r = toSrgb8(color.r);
        const g = toSrgb8(color.g);
        const b = toSrgb8(color.b);

        const h = Math.max(0, Math.min(255, Math.round(height * 2)));

        for (let dj = 0; dj < step; dj++) {

            for (let di = 0; di < step; di++) {

                const k = (j + dj) * N + (i + di);

                this.colorData[k * 4] = r;
                this.colorData[k * 4 + 1] = g;
                this.colorData[k * 4 + 2] = b;
                this.colorData[k * 4 + 3] = water;

                this.heightData[k] = h;

            }

        }

    }


    // Wysyła policzone kawałki do karty graficznej (Globe robi to
    // co kilka klatek - wysyłanie całej mapy trochę trwa).

    upload() {

        if (!this.dirty) {
            return;
        }

        this.dirty = false;

        this.colorTexture.needsUpdate = true;
        this.heightTexture.needsUpdate = true;

    }


    // Postęp 0-1 (do /kosmos).

    get progress() {

        if (!this.center) {
            return 0;
        }

        if (this.complete) {
            return 1;
        }

        const N = this.size;

        let doneSamples = 0;

        for (let step = FIRST_STEP; step > this.step; step /= 2) {
            doneSamples += (N / step) ** 2;
        }

        doneSamples += this.index;

        let total = 0;

        for (let step = FIRST_STEP; step >= 1; step /= 2) {
            total += (N / step) ** 2;
        }

        return doneSamples / total;

    }


    dispose() {

        this.colorTexture.dispose();
        this.heightTexture.dispose();

    }

}


// Para map: daleka (cała kula) i bliska (środek, dwa razy dokładniej -
// tam, gdzie kula zaczyna się zaraz za dalekim terenem). Liczone
// w kolejności: daleka zgrubnie, bliska cała, daleka do końca.

export class GlobeMapPair {

    constructor(size, halfSize) {

        this.far = new GlobeMap(size, halfSize);
        this.near = new GlobeMap(size, halfSize / 2);

        this.size = size;

    }


    get center() {

        return this.far.center;

    }


    start(x, z) {

        this.far.start(x, z);
        this.near.start(x, z);

    }


    build(generator, colors, budgetMs) {

        const map = !this.far.ready ? this.far : !this.near.complete ? this.near : this.far;

        map.build(generator, colors, budgetMs);

    }


    get ready() {

        return this.far.ready && this.near.ready;

    }

    get complete() {

        return this.far.complete && this.near.complete;

    }

    get dirty() {

        return this.far.dirty || this.near.dirty;

    }

    get progress() {

        return (this.far.progress + this.near.progress) / 2;

    }


    upload() {

        this.far.upload();
        this.near.upload();

    }


    dispose() {

        this.far.dispose();
        this.near.dispose();

    }

}
