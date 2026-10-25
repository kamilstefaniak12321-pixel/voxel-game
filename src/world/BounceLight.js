import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    BOUNCE_SIZE,
    BOUNCE_HEIGHT,
    BOUNCE_SPREAD,
    BOUNCE_MAX_REFLECT,
    BOUNCE_OUTDOOR
} from '../config.js';

import {
    BLOCK_TYPES,
    MAX_BLOCK_ID,
    isOpaqueId
} from '../blocks/BlockRegistry.js';

import {
    atlasAveragesReady,
    getAtlasAverage
} from '../rendering/TextureAtlas.js';

import { SunShadows } from '../rendering/Shadows.js';

// ------------------------------------------------------------
// ŚWIATŁO ODBITE ("wlewanie się" światła)
//
// Słońce, które wpadnie przez okno, nie zostaje tylko na podłodze:
// oświetlona podłoga sama świeci trochę dalej - w kolorze swojej
// tekstury - i rozjaśnia ściany, sufit i kąty pokoju. Jasny tynk
// odbija dużo światła (biały pokój jest jasny), ciemne deski mało
// (pokój jest mroczny), czerwona terakota zabarwia pokój na ciepło.
//
// Jak to działa - wokół gracza jest PUDEŁKO komórek (jak w dynamicznym
// świetle, DynamicLight.js):
//   1. Kopiujemy z chunków, które komórki są pełne (ściany), i jak
//      bardzo każda ściana odbija światło (kolor tekstury razy pole
//      bloku "reflect" w BlockRegistry.js).
//   2. ŹRÓDŁA: komórka powietrza przy ścianie, do której dochodzi
//      słońce (promień w stronę słońca - SunShadows.sunVisibility),
//      świeci tyle, ile odbija oświetlona ściana.
//   3. ROZLEWANIE: światło rozchodzi się po powietrzu (nie przez
//      ściany), słabnąc z odległością; przy jasnej ścianie wraca do
//      pokoju (kolejne odbicia), przy ciemnej przepada.
//   4. Wynik idzie na kartę graficzną jako tekstura 3D, a shader bloków
//      (BlockRenderData.js) dodaje to światło do ścian - mnożąc je przez
//      ich własny kolor.
//
// Liczenie jest rozłożone na wiele klatek (najwyżej kilka milisekund
// na klatkę), więc nie przycina gry. Liczy się od nowa, gdy słońce
// przesunie się o kawałek, gracz odejdzie od środka pudełka albo
// zmienią się bloki w pudełku. Kolor i siłę światła (pora dnia) dodaje
// shader, więc o zachodzie nic się nie przelicza.
//
// Liczby: BOUNCE_... w config.js. Opis: docs/niebo-i-swiatlo.md.
// ------------------------------------------------------------

// Wymiary pudełka (komórki): w poziomie i w pionie. Skrajne komórki to
// ramka (pochłania światło), więc pudełko ma o 2 więcej.

const NX = BOUNCE_SIZE + 2;
const NZ = BOUNCE_SIZE + 2;
const NY = BOUNCE_HEIGHT + 2;
const NXZ = NX * NZ;
const N3 = NX * NY * NZ;

// Ile milisekund na klatkę może zająć liczenie.

const FRAME_BUDGET_MS = 2.5;

// Słońce przesunęło się o tyle (radiany) - źródła od nowa.

const ANGLE_STEP = 0.025;

// Gracz odszedł o tyle bloków od środka pudełka - pudełko idzie za nim.

const MOVE_STEP = 8;

// Jak daleko w stronę słońca sprawdzamy, czy coś je zasłania (bloki).

const SUN_RAY = 80;

// Rozlewanie: nadrelaksacja (szybsze dochodzenie do wyniku), kiedy
// uznajemy, że światło się "ułożyło", i najwięcej kroków.

const OVERRELAX = 1.6;
const SETTLED = 0.0015;
const MIN_SWEEPS = 12;
const MAX_SWEEPS = 90;

// Sąsiedzi z boków (w indeksach komórek).

const SIDES = [1, -1, NX, -NX];

// Najjaśniejsze światło zapisywane w teksturze (wyżej - ucięte).
// Tekstura trzyma pierwiastek (więcej odcieni w półmroku).

export const BOUNCE_RANGE = 3;


// Wspólne wartości dla shaderów.

export const bounceUniforms = {
    uBounceLight: { value: null },
    uBounceOrigin: { value: new THREE.Vector3() },
    uBounceSize: { value: new THREE.Vector3(NX, NY, NZ) },

    // Kolor i siła światła odbitego (0 = wyłączone) - ustawia Game.
    uBounceColor: { value: new THREE.Color(0, 0, 0) },

    // O ile słabsze jest odbite światło pod gołym niebem (tam całe
    // niebo i tak świeci) - 0-1.
    uBounceOutdoor: { value: BOUNCE_OUTDOOR }
};


// GLSL: bounceLight(pozycja, normalna, światło nieba) - światło odbite
// (liniowe) w miejscu ściany. Wymaga WebGL2 (tekstura 3D).

export const BOUNCE_GLSL = `
    uniform highp sampler3D uBounceLight;
    uniform vec3 uBounceOrigin;
    uniform vec3 uBounceSize;
    uniform vec3 uBounceColor;
    uniform float uBounceOutdoor;

    vec3 bounceLight(vec3 worldPosition, vec3 worldNormal, float skyLight) {

        if (uBounceColor.r + uBounceColor.g + uBounceColor.b <= 0.0) {
            return vec3(0.0);
        }

        vec3 cell = (worldPosition + worldNormal * 0.5 - uBounceOrigin) / uBounceSize;

        if (any(lessThan(cell, vec3(0.0))) || any(greaterThan(cell, vec3(1.0)))) {
            return vec3(0.0);
        }

        // Przy brzegu pudełka płynnie znika.

        vec3 toEdge = min(cell, 1.0 - cell) * uBounceSize;

        float fade = smoothstep(1.0, 6.0, min(min(toEdge.x, toEdge.y), toEdge.z));

        vec3 encoded = texture(uBounceLight, cell.xzy).rgb;

        return encoded * encoded * ${BOUNCE_RANGE.toFixed(1)} * uBounceColor * fade * (1.0 - uBounceOutdoor * skyLight);

    }
`;

// ------------------------------------------------------------
// Ile światła odbija ściana bloku (kolor liniowy razy "reflect"):
// osobno góra, boki i spód. Liczone z tekstur, gdy atlas się wczyta.
// ------------------------------------------------------------

const REFLECT_TOP = new Float32Array((MAX_BLOCK_ID + 1) * 3).fill(0.35);
const REFLECT_SIDE = new Float32Array((MAX_BLOCK_ID + 1) * 3).fill(0.35);
const REFLECT_BOTTOM = new Float32Array((MAX_BLOCK_ID + 1) * 3).fill(0.35);


function fillReflect(table, id, tileName, reflect) {

    const color = tileName ? getAtlasAverage(tileName) : null;

    const r = color ? color.r : 0.35;
    const g = color ? color.g : 0.35;
    const b = color ? color.b : 0.35;

    table[id * 3] = Math.min(BOUNCE_MAX_REFLECT, r * reflect);
    table[id * 3 + 1] = Math.min(BOUNCE_MAX_REFLECT, g * reflect);
    table[id * 3 + 2] = Math.min(BOUNCE_MAX_REFLECT, b * reflect);

}


atlasAveragesReady.then(() => {

    for (const definition of Object.values(BLOCK_TYPES)) {

        const textures = definition.textures ?? {};

        const reflect = definition.reflect ?? 1;

        const side = textures.side ?? textures.all ?? null;

        fillReflect(REFLECT_TOP, definition.id, textures.top ?? side, reflect);
        fillReflect(REFLECT_SIDE, definition.id, side, reflect);
        fillReflect(REFLECT_BOTTOM, definition.id, textures.bottom ?? side, reflect);

    }

});


// Ile odbija dany blok (do /swiatlo i testów): [r, g, b] boku.

export function getReflect(id) {

    return [REFLECT_SIDE[id * 3], REFLECT_SIDE[id * 3 + 1], REFLECT_SIDE[id * 3 + 2]];

}

// ------------------------------------------------------------

export class BounceLight {

    constructor() {

        // Róg pudełka w świecie (ramka ma współrzędne origin - 1).

        this.origin = new THREE.Vector3(Infinity, 0, 0);

        // Bloki w pudełku: ID (0 = powietrze albo nieprzezroczyste
        // nie-ściany), czy komórka to ściana, światło nieba.

        this.ids = new Uint8Array(N3);
        this.solid = new Uint8Array(N3);
        this.sky = new Uint8Array(N3);

        // Odbicie od ścian wokół komórki (średnia z sześciu stron, RGB).

        this.walls = new Float32Array(N3 * 3);

        // Źródła (gotowe i liczone) i światło (RGB).

        this.sources = new Float32Array(N3 * 3);
        this.nextSources = new Float32Array(N3 * 3);
        this.light = new Float32Array(N3 * 3);

        // Tekstura 3D: pierwiastek światła, RGBA.

        this.data = new Uint8Array(N3 * 4);

        this.texture = new THREE.Data3DTexture(this.data, NX, NZ, NY);

        this.texture.format = THREE.RGBAFormat;
        this.texture.type = THREE.UnsignedByteType;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.unpackAlignment = 1;
        this.texture.needsUpdate = true;

        bounceUniforms.uBounceLight.value = this.texture;


        // Stan liczenia.
        //   blocksDirty  - trzeba skopiować bloki,
        //   sourceJob    - liczenie źródeł w toku: { cells, next } albo null,
        //   sweeps       - ile kroków rozlewania od ostatnich źródeł,
        //   settled      - światło się ułożyło (nic do roboty).

        this.blocksDirty = true;
        this.sourcesDirty = true;
        this.copyJob = null;
        this.sourceJob = null;
        this.sweeps = 0;
        this.sweepCursor = 0;
        this.sweepChange = 0;
        this.lastWrite = 0;
        this.settled = true;

        this.direction = new THREE.Vector3(0, 1, 0);
        this.sourceDirection = new THREE.Vector3(0, -1, 0);
        this.sourceLight = null;

        this.enabled = false;

        // Liczniki (debug, /swiatlo).
        this.updates = 0;
        this.lastSourceCount = 0;

    }


    // Zmienił się mesh chunka (World.onMeshChanged) - jeśli leży
    // w pudełku, bloki trzeba skopiować od nowa.

    markChunk(chunk) {

        const minX = chunk.cx * CHUNK_SIZE;
        const minZ = chunk.cz * CHUNK_SIZE;

        if (
            minX <= this.origin.x + NX && minX + CHUNK_SIZE >= this.origin.x - 1 &&
            minZ <= this.origin.z + NZ && minZ + CHUNK_SIZE >= this.origin.z - 1
        ) {
            this.blocksDirty = true;
        }

    }


    // Co klatkę.
    //   world     - World,
    //   center    - gdzie jest gracz,
    //   direction - kierunek do światła (słońca albo księżyca),
    //   light     - 'sun' / 'moon',
    //   enabled   - czy liczyć (ustawienie i siła światła).

    update(world, center, direction, light, enabled) {

        this.enabled = enabled;

        if (!enabled) {
            return;
        }

        const start = performance.now();

        // Pudełko idzie za graczem (co MOVE_STEP bloków).

        const ox = Math.floor(center.x) - (NX >> 1);
        const oy = Math.max(-1, Math.min(CHUNK_HEIGHT - NY + 1, Math.floor(center.y) - (NY >> 1)));
        const oz = Math.floor(center.z) - (NZ >> 1);

        if (
            !Number.isFinite(this.origin.x) ||
            Math.abs(ox - this.origin.x) >= MOVE_STEP ||
            Math.abs(oy - this.origin.y) >= MOVE_STEP ||
            Math.abs(oz - this.origin.z) >= MOVE_STEP
        ) {
            this.moveTo(ox, oy, oz);
        }


        // Słońce się przesunęło - źródła od nowa.

        this.direction.copy(direction);

        if (direction.dot(this.sourceDirection) < Math.cos(ANGLE_STEP) || light !== this.sourceLight) {
            this.sourcesDirty = true;
        }


        // Kolejne kroki - ile się zmieści w budżecie klatki (każdy krok
        // jest podzielony na kawałki, więc żadna klatka nie trwa długo).

        const inBudget = () => performance.now() - start < FRAME_BUDGET_MS;

        if (this.blocksDirty) {

            this.copyJob = { z: 0, cell: 0 };

            this.blocksDirty = false;
            this.sourceJob = null;

        }

        if (this.copyJob) {

            this.continueCopy(world, inBudget);

            if (this.copyJob) {
                return;
            }

            this.sourcesDirty = true;

        }

        if (this.sourcesDirty && !this.sourceJob) {

            this.startSources(light);

            this.sourcesDirty = false;

        }

        if (this.sourceJob && inBudget()) {
            this.continueSources(world, inBudget);
        }

        let changed = false;

        while (!this.settled && inBudget()) {

            this.sweep(inBudget);

            changed = true;

        }

        // Tekstura - najwyżej kilka razy na sekundę (i na koniec).

        if (changed && (this.settled || start - this.lastWrite > 120)) {

            this.writeTexture();

            this.lastWrite = start;

        }

    }


    // Przesuwa pudełko: światło w części wspólnej zostaje (płynnie),
    // reszta liczy się od nowa.

    moveTo(ox, oy, oz) {

        const dx = ox - this.origin.x;
        const dy = oy - this.origin.y;
        const dz = oz - this.origin.z;

        const light = this.light;

        if (Number.isFinite(this.origin.x) && Math.abs(dx) < NX && Math.abs(dy) < NY && Math.abs(dz) < NZ) {

            // Bufor pomocniczy: tablica ścian (i tak liczy się od nowa
            // po przesunięciu) - bez nowej tablicy przy każdym kroku.

            const moved = this.walls;

            moved.fill(0);

            for (let y = 0; y < NY; y++) {

                const sy = y + dy;

                if (sy < 0 || sy >= NY) continue;

                for (let z = 0; z < NZ; z++) {

                    const sz = z + dz;

                    if (sz < 0 || sz >= NZ) continue;

                    for (let x = 0; x < NX; x++) {

                        const sx = x + dx;

                        if (sx < 0 || sx >= NX) continue;

                        const to = ((y * NZ + z) * NX + x) * 3;
                        const from = ((sy * NZ + sz) * NX + sx) * 3;

                        moved[to] = light[from];
                        moved[to + 1] = light[from + 1];
                        moved[to + 2] = light[from + 2];

                    }

                }

            }

            light.set(moved);

        }
        else {

            light.fill(0);

        }

        this.origin.set(ox, oy, oz);

        bounceUniforms.uBounceOrigin.value.set(ox, oy, oz);

        this.blocksDirty = true;

        this.writeTexture();

    }


    // 1. Bloki z chunków: ściany, ich odbicie, światło nieba - po
    // kawałku: najpierw rzędy z (kopia bloków), potem odbicie ścian.

    continueCopy(world, inBudget) {

        const job = this.copyJob;

        while (job.z < NZ) {

            this.copyRow(world, job.z++);

            if (!inBudget()) {
                return;
            }

        }

        while (job.cell < N3) {

            const end = Math.min(N3, job.cell + 4096);

            this.computeWalls(job.cell, end);

            job.cell = end;

            if (!inBudget()) {
                return;
            }

        }

        this.copyJob = null;

    }


    copyRow(world, z) {

        const { ids, solid, sky } = this;

        const ox = this.origin.x;
        const oy = this.origin.y;
        const oz = this.origin.z;

        const wz = oz + z;

        const cz = Math.floor(wz / CHUNK_SIZE);

        for (let x = 0; x < NX; x++) {

            const wx = ox + x;

            const border = x === 0 || z === 0 || x === NX - 1 || z === NZ - 1;

            const cx = Math.floor(wx / CHUNK_SIZE);

            const chunk = world.getChunk(cx, cz);

            const column = (wz - cz * CHUNK_SIZE) * CHUNK_SIZE + (wx - cx * CHUNK_SIZE);

            for (let y = 0; y < NY; y++) {

                const i = (y * NZ + z) * NX + x;

                const wy = oy + y;

                let id = 0;
                let light = 15;

                if (wy < 0) {
                    light = 0;
                }
                else if (chunk && wy < CHUNK_HEIGHT) {

                    const index = wy * CHUNK_SIZE * CHUNK_SIZE + column;

                    id = chunk.blocks[index];
                    light = chunk.skyLight[index];

                }

                const wall = wy < 0 || isOpaqueId(id);

                ids[i] = wall ? id : 0;
                solid[i] = wall || border || y === 0 || y === NY - 1 ? 1 : 0;
                sky[i] = light;

            }

        }

    }


    // Odbicie od ścian wokół komórek powietrza [from, to): średnia
    // z sześciu stron (pusta strona - 0).

    computeWalls(from, to) {

        const { ids, solid, walls } = this;

        for (let i = from; i < to; i++) {

            const o = i * 3;

            if (solid[i]) {

                walls[o] = walls[o + 1] = walls[o + 2] = 0;

                continue;

            }

            let r = 0;
            let g = 0;
            let b = 0;

            // Ściana pod komórką odbija górą, nad - spodem, z boków - bokiem.

            let n = i - NXZ;

            if (ids[n]) {
                const t = ids[n] * 3;
                r += REFLECT_TOP[t]; g += REFLECT_TOP[t + 1]; b += REFLECT_TOP[t + 2];
            }

            n = i + NXZ;

            if (ids[n]) {
                const t = ids[n] * 3;
                r += REFLECT_BOTTOM[t]; g += REFLECT_BOTTOM[t + 1]; b += REFLECT_BOTTOM[t + 2];
            }

            for (const d of SIDES) {

                n = i + d;

                if (ids[n]) {
                    const t = ids[n] * 3;
                    r += REFLECT_SIDE[t]; g += REFLECT_SIDE[t + 1]; b += REFLECT_SIDE[t + 2];
                }

            }

            walls[o] = r / 6;
            walls[o + 1] = g / 6;
            walls[o + 2] = b / 6;

        }

    }


    // 2. Źródła: komórki przy ścianach zwróconych do światła, do których
    // dochodzi słońce - po kawałku: najpierw szukanie komórek, potem
    // promienie w stronę słońca.

    startSources(light) {

        const d = this.direction;

        this.sourceDirection.copy(d);
        this.sourceLight = light;

        // Ściany, które mogą być oświetlone: pod komórką (gdy światło
        // z góry) i z boków zwróconych do światła.

        const faces = [];

        if (d.y > 0) faces.push([-NXZ, d.y, REFLECT_TOP]);
        if (d.x > 0) faces.push([-1, d.x, REFLECT_SIDE]);
        if (d.x < 0) faces.push([1, -d.x, REFLECT_SIDE]);
        if (d.z > 0) faces.push([-NX, d.z, REFLECT_SIDE]);
        if (d.z < 0) faces.push([NX, -d.z, REFLECT_SIDE]);

        this.nextSources.fill(0);

        this.sourceJob = { cells: [], faces, scan: d.y > 0 ? 0 : N3, next: 0 };

    }


    continueSources(world, inBudget) {

        const job = this.sourceJob;

        const { ids, solid, sky, nextSources } = this;


        // Szukanie komórek przy ścianach.

        while (job.scan < N3) {

            const end = Math.min(N3, job.scan + 8192);

            for (let i = job.scan; i < end; i++) {

                if (solid[i] || sky[i] === 0) {
                    continue;
                }

                for (const [offset] of job.faces) {

                    if (ids[i + offset]) {

                        job.cells.push(i);

                        break;

                    }

                }

            }

            job.scan = end;

            if (!inBudget()) {
                return;
            }

        }


        // Promienie w stronę słońca.

        const d = this.direction;

        const ox = this.origin.x;
        const oy = this.origin.y;
        const oz = this.origin.z;

        while (job.next < job.cells.length) {

            const i = job.cells[job.next++];

            const x = i % NX;
            const z = Math.floor(i / NX) % NZ;
            const y = Math.floor(i / NXZ);

            const visible = SunShadows.sunVisibility(world, ox + x + 0.5, oy + y + 0.5, oz + z + 0.5, d, SUN_RAY);

            if (visible > 0) {

                let r = 0;
                let g = 0;
                let b = 0;

                for (const [offset, facing, table] of job.faces) {

                    const id = ids[i + offset];

                    if (id) {
                        const t = id * 3;
                        r += table[t] * facing;
                        g += table[t + 1] * facing;
                        b += table[t + 2] * facing;
                    }

                }

                nextSources[i * 3] = r * visible;
                nextSources[i * 3 + 1] = g * visible;
                nextSources[i * 3 + 2] = b * visible;

            }

            if ((job.next & 63) === 0 && !inBudget()) {
                return;
            }

        }


        // Gotowe - nowe źródła, światło rozlewa się od nowa (od tego, co
        // było, więc zmiana jest płynna).

        [this.sources, this.nextSources] = [this.nextSources, this.sources];

        this.lastSourceCount = job.cells.length;

        this.sourceJob = null;

        this.sweeps = 0;
        this.sweepCursor = 0;
        this.sweepChange = 0;
        this.settled = false;

    }


    // 3. Rozlewanie (nadrelaksacja Gaussa-Seidla, na zmianę w przód
    // i w tył - po kawałku, ile się zmieści w klatce): światło komórki =
    // źródło + część średniej z sąsiadów + to, co odbiją ściany wokół.

    sweep(inBudget) {

        const { solid, walls, sources, light } = this;

        const a = BOUNCE_SPREAD / 6;

        const forward = this.sweeps % 2 === 0;

        let change = this.sweepChange;

        while (this.sweepCursor < N3) {

            const end = Math.min(N3, this.sweepCursor + 4096);

            for (let k = this.sweepCursor; k < end; k++) {

                const i = forward ? k : N3 - 1 - k;

                if (solid[i]) {
                    continue;
                }

                const o = i * 3;

                const xm = o - 3;
                const xp = o + 3;
                const zm = o - NX * 3;
                const zp = o + NX * 3;
                const ym = o - NXZ * 3;
                const yp = o + NXZ * 3;

                for (let c = 0; c < 3; c++) {

                    const neighbours =
                        light[xm + c] + light[xp + c] +
                        light[zm + c] + light[zp + c] +
                        light[ym + c] + light[yp + c];

                    const target = sources[o + c] + a * neighbours + BOUNCE_SPREAD * walls[o + c] * light[o + c];

                    const value = light[o + c] + OVERRELAX * (target - light[o + c]);

                    const next = value > 0 ? value : 0;

                    const delta = next - light[o + c];

                    if (delta > change) change = delta;
                    else if (-delta > change) change = -delta;

                    light[o + c] = next;

                }

            }

            this.sweepCursor = end;

            if (!inBudget()) {

                this.sweepChange = change;

                return;

            }

        }


        // Cały krok gotowy.

        this.sweepCursor = 0;
        this.sweepChange = 0;

        this.sweeps++;

        if ((change < SETTLED && this.sweeps >= MIN_SWEEPS) || this.sweeps >= MAX_SWEEPS) {
            this.settled = true;
        }

    }


    // 4. Tekstura dla karty graficznej (pierwiastek - więcej odcieni
    // w półmroku).

    writeTexture() {

        const { light, data } = this;

        const scale = 1 / BOUNCE_RANGE;

        for (let i = 0; i < N3; i++) {

            const o = i * 3;
            const t = i * 4;

            data[t] = Math.min(255, Math.sqrt(light[o] * scale) * 255 + 0.5);
            data[t + 1] = Math.min(255, Math.sqrt(light[o + 1] * scale) * 255 + 0.5);
            data[t + 2] = Math.min(255, Math.sqrt(light[o + 2] * scale) * 255 + 0.5);
            data[t + 3] = 255;

        }

        this.texture.needsUpdate = true;

        this.updates++;

    }


    // Światło odbite w miejscu (x, y, z) - [r, g, b] (bez koloru słońca).

    sample(x, y, z) {

        const lx = Math.floor(x) - this.origin.x;
        const ly = Math.floor(y) - this.origin.y;
        const lz = Math.floor(z) - this.origin.z;

        if (lx < 1 || ly < 1 || lz < 1 || lx >= NX - 1 || ly >= NY - 1 || lz >= NZ - 1) {
            return [0, 0, 0];
        }

        const o = ((ly * NZ + lz) * NX + lx) * 3;

        return [this.light[o], this.light[o + 1], this.light[o + 2]];

    }


    dispose() {

        this.texture.dispose();

        bounceUniforms.uBounceColor.value.setRGB(0, 0, 0);

    }

}
