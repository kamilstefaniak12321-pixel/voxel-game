// ------------------------------------------------------------
// SEKTORY TERENU (1.10.3) - mniej przeglądania sceny co klatkę
//
// Przy zasięgu 800 w scenie jest ponad 17 tysięcy obiektów terenu (mesh
// chunka, mesh roślin, sklejone regiony). Silnik co klatkę robił z każdym
// dwie rzeczy, choć teren stoi w miejscu:
//   - przeliczał mu macierz położenia (scena wymusza to u wszystkich
//     potomków, także tych z wyłączonym przeliczaniem),
//   - odwiedzał go przy wybieraniu tego, co jest w kadrze - także
//     w przebiegu cienia postaci, który rysuje tę samą scenę.
// Pomiar (tools/sprawdz_sektory_terenu.mjs, 17 651 obiektów): 2,9 ms na
// klatkę przed, 0,55 ms po.
//
// Teraz obiekty terenu wiszą pod jednym korzeniem, w grupach-sektorach
// (TERRAIN_SECTOR x TERRAIN_SECTOR chunków):
//   - macierze liczone raz, przy wstawieniu (położenie chunka się nie
//     zmienia); korzeń nie puszcza dalej przeliczania co klatkę,
//   - cull(camera) raz na klatkę chowa sektory poza kadrem - silnik nie
//     wchodzi wtedy do środka. Obraz jest ten sam: obiekty z ukrytego
//     sektora i tak odpadłyby przy sprawdzaniu pojedynczo.
//
// Sektor bez wywołania cull() jest widoczny (żywe tło menu, testy,
// podglądy) - brak cullingu to tylko brak oszczędności.
// ------------------------------------------------------------
import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';

// Bok sektora w chunkach. 4 = 64 bloki: przy zasięgu 800 około 530
// sektorów (530 tanich testów pudełka zamiast 17 tysięcy odwiedzin),
// a region sklejonego terenu (2 x 2 chunki) zawsze mieści się w jednym.
export const TERRAIN_SECTOR = 4;

// Zapas wokół sektora (bloki): geometria chunka może wystawać poza jego
// kolumnę - kołysanie roślin, wysokie rośliny-krzyże przy krawędzi (kula
// ograniczająca z ChunkMesher.js dolicza najwyżej wysokość takiej rośliny).
// 8 bloków to kilka razy więcej niż największa z nich.
const MARGIN = 8;

const frustum = new THREE.Frustum();
const projection = new THREE.Matrix4();

export class TerrainSectors {

    constructor(scene) {

        this.scene = scene;

        this.root = new THREE.Group();
        this.root.name = 'teren';
        this.root.matrixAutoUpdate = false;

        // Wszystko pod korzeniem ma macierze policzone przy wstawieniu.
        // Sama flaga matrixWorldAutoUpdate nie wystarcza: scena przelicza
        // własną macierz co klatkę i wymusza to u wszystkich potomków.
        this.root.updateMatrixWorld = () => {};

        scene.add(this.root);

        // 'sx,sz' -> THREE.Group z userData.box (zasięg sektora w świecie).
        this.sectors = new Map();

        // Liczby z ostatniego cull() - do /wydajnosc.
        this.visible = 0;
        this.culled = false;

    }

    sector(cx, cz) {

        const sx = Math.floor(cx / TERRAIN_SECTOR), sz = Math.floor(cz / TERRAIN_SECTOR);
        const key = `${sx},${sz}`;

        let group = this.sectors.get(key);

        if (!group) {

            const size = TERRAIN_SECTOR * CHUNK_SIZE;

            group = new THREE.Group();
            group.name = `sektor ${key}`;
            group.matrixAutoUpdate = false;
            group.userData.key = key;
            group.userData.box = new THREE.Box3(
                new THREE.Vector3(sx * size - MARGIN, -MARGIN, sz * size - MARGIN),
                new THREE.Vector3((sx + 1) * size + MARGIN, CHUNK_HEIGHT + MARGIN, (sz + 1) * size + MARGIN)
            );

            this.sectors.set(key, group);
            this.root.add(group);

        }

        return group;

    }

    // Wstawia obiekt terenu chunka (cx, cz) - mesh ma już ustawione
    // position; od tej chwili nie wolno go przesuwać bez place().
    add(mesh, cx, cz) {

        this.place(mesh);
        this.sector(cx, cz).add(mesh);

    }

    // Liczy macierze obiektu raz (sektor i korzeń stoją w zerze).
    place(mesh) {

        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.matrixWorld.copy(mesh.matrix);
        mesh.matrixWorldNeedsUpdate = false;

    }

    remove(mesh) {

        const group = mesh?.parent;

        if (!group) {
            return;
        }

        group.remove(mesh);

        if (group.children.length === 0 && this.sectors.get(group.userData.key) === group) {
            this.sectors.delete(group.userData.key);
            this.root.remove(group);
        }

    }

    // Raz na klatkę, przed rysowaniem sceny tą kamerą: sektory poza kadrem
    // znikają w całości. Zwraca liczbę widocznych.
    cull(camera) {

        camera.updateMatrixWorld();

        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projection);

        let visible = 0;

        for (const group of this.sectors.values()) {

            const inside = frustum.intersectsBox(group.userData.box);

            group.visible = inside;

            if (inside) visible++;

        }

        this.visible = visible;
        this.culled = true;

        return visible;

    }

    // Wszystko widoczne (kamera inna niż ta z cull(): zrzuty, podglądy).
    showAll() {

        for (const group of this.sectors.values()) group.visible = true;

        this.visible = this.sectors.size;
        this.culled = false;

    }

    stats() {

        let objects = 0;

        for (const group of this.sectors.values()) objects += group.children.length;

        return { sectors: this.sectors.size, visible: this.culled ? this.visible : this.sectors.size, objects };

    }

    dispose() {

        this.scene.remove(this.root);
        this.root.clear();
        this.sectors.clear();

    }

}
