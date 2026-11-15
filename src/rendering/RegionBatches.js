// ------------------------------------------------------------
// ŁĄCZENIE TERENU W WIĘKSZE KAWAŁKI (1.1.5) - mniej poleceń rysowania
//
// Każdy chunk rysuje się osobno: bloki, liście i woda to do trzech
// poleceń rysowania na chunk. Przy kilkuset widocznych chunkach samo
// wysyłanie poleceń zajmuje procesorowi więcej czasu niż cała reszta gry
// (pomiar Kamila: ok. 1000 poleceń, 11 ms z 13 ms klatki, a karta
// graficzna miała zapas). Tutaj sąsiednie chunki (REGION_SIZE x
// REGION_SIZE) są sklejane w jedną geometrię - jedno polecenie na
// materiał zamiast jednego na chunk.
//
// ZASADA: sklejanie jest pracą w tle i nigdy nie opóźnia tego, co widać.
//   - chunk, który właśnie powstał albo się zmienił (kopanie, stawianie,
//     doczytany sąsiad), rysuje się SAM, od razu, dokładnie jak dawniej;
//     z klejonej geometrii znika w tej samej klatce (zmiana zakresów
//     rysowania - bez wysyłania danych na kartę),
//   - gdy region jest spokojny przez FOLD_DELAY, jego chunki są sklejane
//     od nowa - najwyżej FOLDS_PER_FRAME regionów na klatkę, najbliższe
//     najpierw.
// Przy szybkim locie regiony ciągle się zmieniają, więc gra rysuje jak
// dawniej; gdy gracz stoi albo idzie, okolica skleja się w kilka sekund.
//
// Sklejana jest tylko geometria terenu chunka (chunk.mesh: bloki, liście,
// woda). Rośliny (chunk.plantMesh - animacje, zasięg widoczności) i cienie
// (World.shadowScene) zostają po staremu.
//
// Geometria chunka jest w jego współrzędnych lokalnych; sklejona - we
// współrzędnych regionu (wierzchołki przesunięte o położenie chunka
// w regionie). Shadery liczą pozycję w świecie przez modelMatrix, więc
// obraz jest ten sam co bez sklejania.
//
// Test: tools/sprawdz_laczenie_terenu.mjs.
// ------------------------------------------------------------
import * as THREE from 'three';
import { CHUNK_SIZE } from '../config.js';

// Ile chunków w boku regionu.
export const REGION_SIZE = 2;

// Ile sekund chunk musi być bez zmian, zanim region sklei się od nowa.
export const FOLD_DELAY = 0.6;

// Ile regionów najwyżej sklejamy w jednej klatce.
export const FOLDS_PER_FRAME = 1;

// Kolejność materiałów w sklejonej geometrii (indeksy z ChunkMesher.js:
// 0 - bloki, 1 - rośliny, 3 - liście i płaskie dekoracje, 2 - woda).
const MATERIAL_ORDER = [0, 1, 3, 2];

// Czym wypełnić atrybut, którego chunk nie ma (canopyTint - biały =
// bez zabarwienia; reszta zawsze jest).
const FILL = { canopyTint: 255 };

const regionKey = (rx, rz) => `${rx},${rz}`;

const corner = new THREE.Vector3();

export class RegionBatches {

    // scene - scena świata; materials - tablica materiałów mesha chunka.
    constructor(scene, materials) {

        this.scene = scene;
        this.materials = materials;

        // klucz regionu -> { rx, rz, chunks: Set, mesh, members: Map chunk -> ranges,
        //                    dirty, dirtyAt }
        this.regions = new Map();

        // chunk -> region (żeby znaleźć region także po usunięciu mesha).
        this.byChunk = new Map();

        this.clock = 0;
        this.enabled = true;

        this.stats = { folds: 0, lastFoldMs: 0, maxFoldMs: 0 };

    }

    regionOf(chunk, create = true) {

        let region = this.byChunk.get(chunk);

        if (region || !create) {
            return region ?? null;
        }

        const rx = Math.floor(chunk.cx / REGION_SIZE), rz = Math.floor(chunk.cz / REGION_SIZE);
        const key = regionKey(rx, rz);

        region = this.regions.get(key);

        if (!region) {
            region = { key, rx, rz, chunks: new Set(), mesh: null, members: new Map(), dirty: false, dirtyAt: 0 };
            this.regions.set(key, region);
        }

        region.chunks.add(chunk);
        this.byChunk.set(chunk, region);

        return region;

    }

    // Chunk dostał nową geometrię terenu, zmienił ją albo stracił mesh.
    // Od tej chwili rysuje się sam (jeśli ma mesh), a region czeka na
    // spokojną chwilę.
    changed(chunk) {

        const region = this.regionOf(chunk, Boolean(chunk.mesh));

        if (!region) {
            return;
        }

        if (chunk.mesh) {
            chunk.mesh.visible = true;
        }

        if (region.members.delete(chunk)) {
            this.applyGroups(region);
        }

        if (!chunk.mesh) {
            region.chunks.delete(chunk);
            this.byChunk.delete(chunk);
        }

        region.dirty = true;
        region.dirtyAt = this.clock;

        if (region.chunks.size === 0) {
            this.removeRegion(region);
        }

    }

    // Czy ten chunk nadaje się do sklejenia.
    foldable(chunk) {
        const geometry = chunk.mesh?.geometry;
        return Boolean(geometry?.index && geometry.groups.length && !chunk.combinedGeometry);
    }

    // Zakresy rysowania sklejonej geometrii: dla każdego materiału ciągi
    // sąsiadujących zakresów chunków, które dalej są w regionie.
    applyGroups(region) {

        const geometry = region.mesh?.geometry;

        if (!geometry) {
            return;
        }

        geometry.clearGroups();

        for (const material of MATERIAL_ORDER) {

            let start = -1, count = 0;

            for (const entry of region.layout) {

                if (entry.material !== material) continue;

                if (region.members.has(entry.chunk)) {
                    if (start < 0) start = entry.start;
                    count += entry.count;
                }
                else if (start >= 0) {
                    geometry.addGroup(start, count, material);
                    start = -1; count = 0;
                }

            }

            if (start >= 0) geometry.addGroup(start, count, material);

        }

        region.mesh.visible = geometry.groups.length > 0;

    }

    // Co klatkę: dt - sekundy, centerCx/centerCz - chunk gracza.
    update(dt, centerCx, centerCz) {

        this.clock += dt;

        if (!this.enabled) {
            return;
        }

        let best = null, bestDistance = Infinity, folds = 0;

        while (folds < FOLDS_PER_FRAME) {

            best = null; bestDistance = Infinity;

            for (const region of this.regions.values()) {

                if (!region.dirty || this.clock - region.dirtyAt < FOLD_DELAY) continue;

                const dx = (region.rx + 0.5) * REGION_SIZE - centerCx - 0.5, dz = (region.rz + 0.5) * REGION_SIZE - centerCz - 0.5;
                const distance = dx * dx + dz * dz;

                if (distance < bestDistance) { best = region; bestDistance = distance; }

            }

            if (!best) break;

            this.fold(best);
            folds++;

        }

    }

    // Skleja region od nowa z jego obecnych chunków.
    fold(region) {

        const started = performance.now();

        region.dirty = false;

        const chunks = [...region.chunks].filter((chunk) => this.foldable(chunk))
            .sort((a, b) => a.cz - b.cz || a.cx - b.cx);

        // Jeden chunk nie ma z czym się skleić - rysuje się sam.
        if (chunks.length < 2) {
            this.releaseMesh(region);
            for (const chunk of region.chunks) if (chunk.mesh) chunk.mesh.visible = true;
            return;
        }

        const originX = region.rx * REGION_SIZE * CHUNK_SIZE, originZ = region.rz * REGION_SIZE * CHUNK_SIZE;

        let vertexCount = 0, indexCount = 0;
        const names = new Map();

        for (const chunk of chunks) {
            const geometry = chunk.mesh.geometry;
            vertexCount += geometry.attributes.position.count;
            for (const group of geometry.groups) indexCount += group.count;
            for (const [name, attribute] of Object.entries(geometry.attributes)) {
                if (!names.has(name)) names.set(name, attribute);
            }
        }

        const merged = new THREE.BufferGeometry();

        // Atrybuty: kopie jedna za drugą; pozycja przesunięta do regionu.
        for (const [name, sample] of names) {

            const array = new sample.array.constructor(vertexCount * sample.itemSize);
            let offset = 0;

            for (const chunk of chunks) {

                const geometry = chunk.mesh.geometry;
                const attribute = geometry.attributes[name];
                const length = geometry.attributes.position.count * sample.itemSize;

                if (attribute) array.set(attribute.array.subarray(0, length), offset);
                else array.fill(FILL[name] ?? 0, offset, offset + length);

                if (name === 'position') {
                    const dx = chunk.cx * CHUNK_SIZE - originX, dz = chunk.cz * CHUNK_SIZE - originZ;
                    if (dx !== 0 || dz !== 0) {
                        for (let i = offset; i < offset + length; i += 3) { array[i] += dx; array[i + 2] += dz; }
                    }
                }

                offset += length;

            }

            const attribute = new THREE.BufferAttribute(array, sample.itemSize, sample.normalized);
            // Dane są już na karcie - kopia w pamięci gry nie jest potrzebna
            // (przy zmianie region skleja się od nowa z geometrii chunków).
            attribute.onUpload(releaseArray);
            merged.setAttribute(name, attribute);

        }

        // Indeksy: materiał po materiale, w każdym chunk po chunku.
        const index = new (vertexCount > 65535 ? Uint32Array : Uint16Array)(indexCount);
        const layout = [];
        const bases = new Map();

        let base = 0;
        for (const chunk of chunks) { bases.set(chunk, base); base += chunk.mesh.geometry.attributes.position.count; }

        let cursor = 0;

        for (const material of MATERIAL_ORDER) {

            for (const chunk of chunks) {

                const geometry = chunk.mesh.geometry, source = geometry.index.array, shift = bases.get(chunk);

                for (const group of geometry.groups) {

                    if (group.materialIndex !== material || group.count <= 0) continue;

                    for (let i = 0; i < group.count; i++) index[cursor + i] = source[group.start + i] + shift;

                    layout.push({ chunk, material, start: cursor, count: group.count });
                    cursor += group.count;

                }

            }

        }

        const indexAttribute = new THREE.BufferAttribute(index, 1);
        indexAttribute.onUpload(releaseArray);
        merged.setIndex(indexAttribute);

        // Kula regionu. Kula chunka (ChunkMesher.js) to jego słupek
        // CHUNK_SIZE x wysokość x CHUNK_SIZE plus zapas na wystające rośliny
        // i falowanie. Region dostaje pudełko z tych słupków (z tym samym
        // zapasem) i kulę wokół niego - ciaśniejszą niż kula z kul, więc
        // karta dostaje mniej trójkątów spoza kadru.
        const box = new THREE.Box3();
        const half = CHUNK_SIZE / 2;

        for (const chunk of chunks) {
            const sphere = chunk.mesh.geometry.boundingSphere;
            const height = sphere.center.y * 2;
            const margin = Math.max(0, sphere.radius - Math.sqrt(half * half * 2 + sphere.center.y * sphere.center.y));
            const x = chunk.cx * CHUNK_SIZE - originX, z = chunk.cz * CHUNK_SIZE - originZ;
            box.expandByPoint(corner.set(x - margin, -margin, z - margin));
            box.expandByPoint(corner.set(x + CHUNK_SIZE + margin, height + margin, z + CHUNK_SIZE + margin));
        }

        merged.boundingSphere = box.getBoundingSphere(new THREE.Sphere());

        this.releaseMesh(region);

        const mesh = new THREE.Mesh(merged, this.materials);
        mesh.position.set(originX, 0, originZ);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.name = 'region-terenu';
        this.scene.add(mesh);
        mesh.updateMatrixWorld();

        region.mesh = mesh;
        region.layout = layout;
        region.members = new Map(chunks.map((chunk) => [chunk, true]));

        this.applyGroups(region);

        // Sklejone chunki nie rysują się już osobno (ich geometria zostaje:
        // korzystają z niej cienie i z niej powstaje następne sklejenie).
        for (const chunk of region.chunks) {
            if (chunk.mesh) chunk.mesh.visible = !region.members.has(chunk);
        }

        const ms = performance.now() - started;
        this.stats.folds++;
        this.stats.lastFoldMs = ms;
        this.stats.maxFoldMs = Math.max(this.stats.maxFoldMs, ms);

    }

    releaseMesh(region) {

        if (!region.mesh) {
            return;
        }

        this.scene.remove(region.mesh);
        region.mesh.geometry.dispose();
        region.mesh = null;
        region.layout = [];
        region.members = new Map();

    }

    removeRegion(region) {
        this.releaseMesh(region);
        this.regions.delete(region.key);
    }

    // Włącza albo wyłącza sklejanie (ustawienie gry). Wyłączone: wszystko
    // rysuje się osobno, jak przed 1.1.5.
    setEnabled(enabled) {

        enabled = Boolean(enabled);

        if (enabled === this.enabled) {
            return;
        }

        this.enabled = enabled;

        for (const region of this.regions.values()) {
            if (!enabled) {
                this.releaseMesh(region);
                for (const chunk of region.chunks) if (chunk.mesh) chunk.mesh.visible = true;
            }
            region.dirty = true;
            region.dirtyAt = this.clock - FOLD_DELAY;
        }

    }

    getStats() {

        let merged = 0, members = 0, solo = 0, waiting = 0;

        for (const region of this.regions.values()) {
            if (region.mesh) merged++;
            members += region.members.size;
            for (const chunk of region.chunks) if (chunk.mesh && !region.members.has(chunk)) solo++;
            if (region.dirty) waiting++;
        }

        return { enabled: this.enabled, regions: this.regions.size, merged, members, solo, waiting, ...this.stats };

    }

    dispose() {

        for (const region of [...this.regions.values()]) {
            for (const chunk of region.chunks) if (chunk.mesh) chunk.mesh.visible = true;
            this.removeRegion(region);
        }

        this.byChunk.clear();

    }

}

function releaseArray() {
    this.array = null;
}
