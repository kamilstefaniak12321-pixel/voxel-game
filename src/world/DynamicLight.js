import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    LIGHT_CURVE
} from '../config.js';

import {
    isOpaqueId
} from '../blocks/BlockRegistry.js';

import {
    MAX_LIGHT,
    COLOR_DECAY,
    COLOR_LEVEL,
    colorEmission
} from './Light.js';

// ------------------------------------------------------------
// DYNAMICZNE ŚWIATŁO
//
// Światło, które się porusza: lampa trzymana w ręce, lecący
// meteoryt, błysk uderzenia, kula światła z /demo kula.
//
// Nie zmienia meshy chunków (to byłoby za wolne co klatkę).
// Zamiast tego wokół gracza jest PUDEŁKO 32 x 32 x 32 komórek.
// Gdy któreś źródło przejdzie do innego bloku, w pudełku liczymy
// rozlewanie światła - tak samo jak w Light.js, więc światło nie
// przechodzi przez ściany - i wysyłamy wynik na kartę graficzną
// jako teksturę 3D. Shader bloków (BlockRenderData.js) odczytuje
// z niej światło w miejscu każdej ściany.
//
// Źródło światła to obiekt:
//   { position: THREE.Vector3, color: [r, g, b] (0-1), strength: 0-15 }
// Źródła podaje co klatkę Game (lampa w ręce, meteoryty, kule).
// ------------------------------------------------------------

export const VOLUME_SIZE = 32;

const N = VOLUME_SIZE;
const N2 = N * N;
const N3 = N * N * N;


// Wspólne wartości dla shadera bloków.

export const dynamicLightUniforms = {
    uDynamicLight: { value: null },
    uDynamicOrigin: { value: new THREE.Vector3() },
    uDynamicSize: { value: N },
    uDynamicEnabled: { value: 0 }
};


// Wartość kanału (0-255) -> jasność 0-1 (jak lampy, bez minimum).

const BRIGHTNESS = new Float32Array(256);

for (let v = 1; v < 256; v++) {
    BRIGHTNESS[v] = (COLOR_LEVEL[v] / MAX_LIGHT) ** LIGHT_CURVE;
}


export class DynamicLight {

    constructor() {

        // Lewy dolny róg pudełka w świecie (w blokach).

        this.origin = new THREE.Vector3(Infinity, 0, 0);


        // Które komórki zasłaniają światło (kopia bloków świata).

        this.opaque = new Uint8Array(N3);

        // Światło R, G, B w pudełku.

        this.channels = [new Uint8Array(N3), new Uint8Array(N3), new Uint8Array(N3)];

        // Kolejka rozlewania (indeksy komórek). Komórka może trafić
        // do niej kilka razy (gdy inne źródło da jej więcej światła).

        this.queue = new Int32Array(N3 * 4);


        // Tekstura 3D dla karty graficznej: kolor światła RGBA.

        this.data = new Uint8Array(N3 * 4);

        this.texture = new THREE.Data3DTexture(this.data, N, N, N);

        this.texture.format = THREE.RGBAFormat;
        this.texture.type = THREE.UnsignedByteType;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.unpackAlignment = 1;
        this.texture.needsUpdate = true;

        dynamicLightUniforms.uDynamicLight.value = this.texture;


        // Czego dotyczyło ostatnie liczenie (żeby nie liczyć
        // tego samego co klatkę).

        this.lastSources = '';
        this.lastWorldVersion = -1;
        this.lastChunks = '';

    }


    // center  - gdzie jest gracz (środek pudełka)
    // sources - lista źródeł światła

    update(world, center, sources) {

        const ox = Math.floor(center.x) - N / 2;
        const oy = Math.floor(center.y) - N / 2;
        const oz = Math.floor(center.z) - N / 2;


        // Źródła w pudełku, zapisane jako tekst - jeśli nic się nie
        // zmieniło (te same bloki, kolory i siły), nie liczymy.

        const inside = [];

        for (const source of sources) {

            if (!source || source.strength <= 0) {
                continue;
            }

            const x = Math.floor(source.position.x) - ox;
            const y = Math.floor(source.position.y) - oy;
            const z = Math.floor(source.position.z) - oz;

            if (x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N) {
                inside.push({ x, y, z, source });
            }

        }


        dynamicLightUniforms.uDynamicEnabled.value = inside.length > 0 ? 1 : 0;

        if (inside.length === 0) {

            this.lastSources = '';

            return;

        }


        const key =
            `${ox},${oy},${oz}|` +
            inside.map(({ x, y, z, source }) =>
                `${x},${y},${z},${Math.round(source.strength)},${source.color.join(',')}`
            ).join('|');

        const moved = ox !== this.origin.x || oy !== this.origin.y || oz !== this.origin.z;


        // Które chunki pod pudełkiem są wczytane (gdy dojdzie nowy,
        // ściany w pudełku mogły się zmienić).

        let chunks = '';

        for (let cz = Math.floor(oz / CHUNK_SIZE); cz <= Math.floor((oz + N - 1) / CHUNK_SIZE); cz++) {

            for (let cx = Math.floor(ox / CHUNK_SIZE); cx <= Math.floor((ox + N - 1) / CHUNK_SIZE); cx++) {
                chunks += world.getChunk(cx, cz) ? '1' : '0';
            }

        }

        const blocksChanged =
            world.version !== this.lastWorldVersion ||
            chunks !== this.lastChunks;


        if (key === this.lastSources && !blocksChanged) {
            return;
        }


        if (moved || blocksChanged) {

            this.origin.set(ox, oy, oz);

            this.copyBlocks(world);

            this.lastWorldVersion = world.version;
            this.lastChunks = chunks;

        }

        this.lastSources = key;


        this.compute(inside);

        this.writeTexture();

        dynamicLightUniforms.uDynamicOrigin.value.copy(this.origin);

    }


    // Kopiuje z chunków świata, które komórki pudełka zasłaniają.

    copyBlocks(world) {

        const opaque = this.opaque;

        const ox = this.origin.x;
        const oy = this.origin.y;
        const oz = this.origin.z;


        for (let z = 0; z < N; z++) {

            for (let x = 0; x < N; x++) {

                const wx = ox + x;
                const wz = oz + z;

                const cx = Math.floor(wx / CHUNK_SIZE);
                const cz = Math.floor(wz / CHUNK_SIZE);

                const chunk = world.getChunk(cx, cz);

                const column = (wz - cz * CHUNK_SIZE) * CHUNK_SIZE + (wx - cx * CHUNK_SIZE);


                for (let y = 0; y < N; y++) {

                    const wy = oy + y;

                    let blocked = 0;

                    if (wy < 0) {
                        blocked = 1;
                    }
                    else if (chunk && wy < CHUNK_HEIGHT) {
                        blocked = isOpaqueId(chunk.blocks[wy * CHUNK_SIZE * CHUNK_SIZE + column]) ? 1 : 0;
                    }

                    opaque[(y * N + z) * N + x] = blocked;

                }

            }

        }

    }


    // Rozlewanie światła ze źródeł - każdy kolor osobno.

    compute(inside) {

        const opaque = this.opaque;
        const queue = this.queue;


        for (let c = 0; c < 3; c++) {

            const light = this.channels[c];

            light.fill(0);

            let head = 0;
            let tail = 0;


            for (const { x, y, z, source } of inside) {

                const value = colorEmission(source.strength, source.color)[c];

                const i = (y * N + z) * N + x;

                if (value > light[i]) {

                    light[i] = value;

                    queue[tail++] = i;

                }

            }


            while (head < tail) {

                const i = queue[head++];

                const next = COLOR_DECAY[light[i]];

                if (next === 0) {
                    continue;
                }


                const x = i % N;
                const z = Math.floor(i / N) % N;
                const y = Math.floor(i / N2);


                // Sześciu sąsiadów (poza pudełkiem światła nie liczymy).

                if (x > 0) tail = spreadTo(i - 1, next, light, opaque, queue, tail);
                if (x < N - 1) tail = spreadTo(i + 1, next, light, opaque, queue, tail);
                if (z > 0) tail = spreadTo(i - N, next, light, opaque, queue, tail);
                if (z < N - 1) tail = spreadTo(i + N, next, light, opaque, queue, tail);
                if (y > 0) tail = spreadTo(i - N2, next, light, opaque, queue, tail);
                if (y < N - 1) tail = spreadTo(i + N2, next, light, opaque, queue, tail);

            }

        }

    }


    // Kanały -> kolor jasności w teksturze (jasność z najmocniejszego
    // kanału, kolor z proporcji - jak w ChunkMesher.js).

    writeTexture() {

        const [red, green, blue] = this.channels;

        const data = this.data;


        for (let i = 0; i < N3; i++) {

            const r = red[i];
            const g = green[i];
            const b = blue[i];

            const strongest = r > g ? (r > b ? r : b) : (g > b ? g : b);

            const o = i * 4;

            if (strongest === 0) {

                data[o] = data[o + 1] = data[o + 2] = 0;

                continue;

            }


            const scale = BRIGHTNESS[strongest] * 255 / strongest;

            data[o] = r * scale + 0.5;
            data[o + 1] = g * scale + 0.5;
            data[o + 2] = b * scale + 0.5;
            data[o + 3] = 255;

        }


        this.texture.needsUpdate = true;

    }


    dispose() {

        this.texture.dispose();

        dynamicLightUniforms.uDynamicEnabled.value = 0;

    }

}


function spreadTo(index, value, light, opaque, queue, tail) {

    if (opaque[index] || light[index] >= value || tail >= queue.length) {
        return tail;
    }

    light[index] = value;

    queue[tail] = index;

    return tail + 1;

}
