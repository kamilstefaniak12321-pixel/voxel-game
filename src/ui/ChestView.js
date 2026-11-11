import * as THREE from 'three';

import { createModelMaterial } from '../rendering/ModelMaterial.js';
import { blockAtlasTexture } from '../rendering/TextureAtlas.js';
import { createChestModel, chestLidAngle, CHEST_OPEN_SECONDS } from '../rendering/ChestRenderer.js';
import { chestCellCenter, chestCellAt, CHEST_INSIDE } from '../rendering/ChestGeometry.js';
import { CHEST_CELLS, CHEST_COLUMNS, CHEST_LAYERS, CHEST_ROWS, topLayer } from '../game/ChestState.js';

// ------------------------------------------------------------
// OKNO SKRZYNI W EKWIPUNKU (0.81.0, pomysł Kamila)
//
// W strefie rzemieślniczej zamiast siatki wytwarzania widać samą
// skrzynię: kamera patrzy na nią z przodu i z góry, wieko się otwiera,
// a na dnie, w 4 x 3 przegródkach, leżą przedmioty (ich ikonki, na
// skos do kamery). Klik w przegródkę kładzie / bierze jak w zwykłym
// miejscu ekwipunku - tylko z dwiema warstwami (ChestState.js): to, co
// leży na wierzchu, jest trochę wyżej i bliżej, spod niego wystaje
// to, co pod spodem.
//
// Rysuje wspólny renderer podglądu (InventoryScreen.js - jeden kontekst
// WebGL na postać i skrzynię): scenę do fragmentu płótna, potem kopia
// na płótno okna i liczby sztuk na wierzchu.
// ------------------------------------------------------------

export const CHEST_VIEW_WIDTH = 320;
export const CHEST_VIEW_HEIGHT = 160;

// Karta trochę mniejsza od przegródki (0,1875 x 0,25 bloku).
const CARD = 0.175;
// Wierzch leży trochę wyżej, bliżej i w bok - spod niego wystaje spód.
const LIFT = [0, 0.05];
const SHIFT = [[0.022, 0.035], [-0.02, -0.03]];

export class ChestView {

    constructor(icons) {

        this.icons = icons;

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'inv-chest-view';
        this.canvas.width = CHEST_VIEW_WIDTH;
        this.canvas.height = CHEST_VIEW_HEIGHT;

        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 2);
        sun.position.set(-2, 4, -5);
        this.scene.add(sun);

        // Z przodu i z góry, blisko - dno z przegródkami wypełnia okno
        // (0.82.2: wcześniej skrzynia zajmowała ok. 1/3 szerokości), za
        // nim otwarte wieko.
        this.camera = new THREE.PerspectiveCamera(37, CHEST_VIEW_WIDTH / CHEST_VIEW_HEIGHT, 0.05, 10);
        this.camera.position.set(0, 1.6, -0.56);
        this.camera.lookAt(0, 0.13, 0.16);

        this.material = createModelMaterial({ map: blockAtlasTexture });
        const { group, lid } = createChestModel(this.material);
        this.model = group;
        this.lid = lid;
        this.chestTexture = 'chest';
        this.scene.add(group);

        // Przedmioty: po karcie na przegródkę i warstwę.
        this.cards = [];
        this.textures = new Map();
        const geometry = new THREE.PlaneGeometry(CARD, CARD);
        for (let layer = 0; layer < CHEST_LAYERS; layer++) {
            for (let cell = 0; cell < CHEST_CELLS; cell++) {
                const material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35 });
                const card = new THREE.Mesh(geometry, material);
                const center = chestCellCenter(cell);
                card.position.set(center.x + SHIFT[layer][0], CHEST_INSIDE.floor + CARD * 0.42 + LIFT[layer], center.z + SHIFT[layer][1]);
                card.lookAt(new THREE.Vector3(0, 1.0, -0.42).add(card.position));
                card.userData = { cell, layer };
                card.visible = false;
                card.renderOrder = layer;
                this.cards.push(card);
                this.scene.add(card);
            }
        }

        // Przegródki: ciemne listewki na dnie (4 x 3).
        const divider = new THREE.MeshBasicMaterial({ color: 0x3a2414 });
        const span = CHEST_INSIDE.max - CHEST_INSIDE.min;
        const strip = 0.012;
        for (let i = 1; i < CHEST_COLUMNS; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(strip, span), divider);
            line.rotation.x = -Math.PI / 2;
            line.position.set(CHEST_INSIDE.max - i * span / CHEST_COLUMNS, CHEST_INSIDE.floor + 0.002, 0);
            this.scene.add(line);
        }
        for (let i = 1; i < CHEST_ROWS; i++) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(span, strip), divider);
            line.rotation.x = -Math.PI / 2;
            line.position.set(0, CHEST_INSIDE.floor + 0.002, CHEST_INSIDE.max - i * span / CHEST_ROWS);
            this.scene.add(line);
        }

        // Podświetlenie przegródki pod myszką (na dnie).
        const center = chestCellCenter(0);
        this.highlight = new THREE.Mesh(
            new THREE.PlaneGeometry(center.width * 0.92, center.depth * 0.92),
            new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.35, depthWrite: false })
        );
        this.highlight.rotation.x = -Math.PI / 2;
        this.highlight.visible = false;
        this.scene.add(this.highlight);

        this.raycaster = new THREE.Raycaster();
        this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(CHEST_INSIDE.floor + 0.04));

        this.chest = null;
        this.openedAt = 0;
        this.hoverCell = -1;
        this.counts = [];

    }


    // Nowa skrzynia: wieko od zera.

    // texture - kafelek skrzyni (z jakiego drewna, 0.89.0).
    show(chest, texture = 'chest') {

        if (texture !== this.chestTexture) {
            const { group, lid } = createChestModel(this.material, texture);
            this.scene.remove(this.model);
            this.scene.add(group);
            this.model = group;
            this.lid = lid;
            this.chestTexture = texture;
        }

        this.chest = chest;
        this.openedAt = performance.now();
        this.hoverCell = -1;
        this.sync();

    }


    texture(type) {

        if (!this.textures.has(type)) {
            const image = new Image();
            const texture = new THREE.Texture(image);
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            image.onload = () => { texture.needsUpdate = true; };
            image.src = this.icons.get(type) ?? '';
            this.textures.set(type, texture);
        }

        return this.textures.get(type);

    }


    // Karty według zawartości skrzyni.

    sync() {

        if (!this.chest) {
            return;
        }

        for (const card of this.cards) {
            const { cell, layer } = card.userData;
            const item = this.chest.layers[layer][cell];
            card.visible = Boolean(item);
            if (item && card.material.map !== this.texture(item.type)) {
                card.material.map = this.texture(item.type);
                card.material.needsUpdate = true;
            }
        }

    }


    // Przegródka pod punktem okna (px, py - piksele płótna okna) albo -1.

    cellAt(px, py) {

        const pointer = new THREE.Vector2(px / CHEST_VIEW_WIDTH * 2 - 1, -(py / CHEST_VIEW_HEIGHT * 2 - 1));

        this.raycaster.setFromCamera(pointer, this.camera);

        const hit = this.raycaster.intersectObjects(this.cards.filter((card) => card.visible), false)
            .sort((a, b) => b.object.userData.layer - a.object.userData.layer || a.distance - b.distance)[0];

        if (hit) {
            return hit.object.userData.cell;
        }

        const point = this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());

        return point ? chestCellAt(point.x, point.z) : -1;

    }


    // Przegródka pod kursorem myszy (zdarzenie w oknie) albo -1.

    cellAtEvent(event) {

        const rect = this.canvas.getBoundingClientRect();

        if (!rect.width || !rect.height) {
            return -1;
        }

        // Płótno jest wpasowane w okno (object-fit: contain).
        const scale = Math.min(rect.width / CHEST_VIEW_WIDTH, rect.height / CHEST_VIEW_HEIGHT);
        const left = rect.left + (rect.width - CHEST_VIEW_WIDTH * scale) / 2;
        const top = rect.top + (rect.height - CHEST_VIEW_HEIGHT * scale) / 2;

        return this.cellAt((event.clientX - left) / scale, (event.clientY - top) / scale);

    }


    // Punkt na ekranie nad przegródką (środek widocznej karty albo dna) -
    // do testów i podpowiedzi.

    cellClientPoint(cell) {

        const rect = this.canvas.getBoundingClientRect();
        const scale = Math.min(rect.width / CHEST_VIEW_WIDTH, rect.height / CHEST_VIEW_HEIGHT);
        const left = rect.left + (rect.width - CHEST_VIEW_WIDTH * scale) / 2;
        const top = rect.top + (rect.height - CHEST_VIEW_HEIGHT * scale) / 2;

        const layer = this.chest ? topLayer(this.chest, cell) : -1;
        const point = new THREE.Vector3();

        this.scene.updateMatrixWorld();

        if (layer >= 0) point.setFromMatrixPosition(this.cards[layer * CHEST_CELLS + cell].matrixWorld);
        else {
            const center = chestCellCenter(cell);
            point.set(center.x, CHEST_INSIDE.floor + 0.04, center.z);
        }

        point.project(this.camera);

        return {
            x: left + (point.x + 1) / 2 * CHEST_VIEW_WIDTH * scale,
            y: top + (1 - point.y) / 2 * CHEST_VIEW_HEIGHT * scale
        };

    }


    setHover(cell) {

        this.hoverCell = cell;

    }


    // Rysuje skrzynię rendererem podglądu (fragment jego płótna od
    // (x, y) od góry) i kopiuje na płótno okna.

    render(renderer, x, y) {

        if (!this.chest) {
            return;
        }

        const progress = (performance.now() - this.openedAt) / 1000 / CHEST_OPEN_SECONDS;

        this.lid.rotation.x = chestLidAngle(progress);

        // Karty pojawiają się, gdy wieko jest już w górze.
        const reveal = Math.max(0, Math.min(1, progress * 1.6 - 0.5));
        for (const card of this.cards) card.material.opacity = reveal;

        if (this.hoverCell >= 0) {
            const center = chestCellCenter(this.hoverCell);
            this.highlight.position.set(center.x, CHEST_INSIDE.floor + 0.003, center.z);
            this.highlight.visible = true;
        }
        else {
            this.highlight.visible = false;
        }

        const height = renderer.domElement.height;
        const glY = height - y - CHEST_VIEW_HEIGHT;

        renderer.setViewport(x, glY, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT);
        renderer.setScissor(x, glY, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT);
        renderer.setScissorTest(true);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT);
        ctx.drawImage(renderer.domElement, x, y, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT, 0, 0, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT);

        if (reveal > 0.5) this.drawCounts(ctx);

    }


    // Liczby sztuk przy widocznych stosach (jak w miejscach ekwipunku).

    drawCounts(ctx) {

        const font = getComputedStyle(this.canvas).fontFamily || 'monospace';

        // Liczby jak w miejscach ekwipunku: większe, z obrysem.
        ctx.font = `16px ${font}`;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        const corner = new THREE.Vector3();

        for (let cell = 0; cell < CHEST_CELLS; cell++) {

            const layer = topLayer(this.chest, cell);

            if (layer < 0) continue;

            const item = this.chest.layers[layer][cell];

            if (item.count <= 1) continue;

            const card = this.cards[layer * CHEST_CELLS + cell];

            corner.set(CARD / 2, -CARD / 2, 0).applyMatrix4(card.matrixWorld).project(this.camera);

            const px = (corner.x + 1) / 2 * CHEST_VIEW_WIDTH + 2;
            const py = (1 - corner.y) / 2 * CHEST_VIEW_HEIGHT + 2;

            ctx.strokeStyle = '#1a0f08';
            ctx.strokeText(String(item.count), px, py);
            ctx.fillStyle = '#fff4dc';
            ctx.fillText(String(item.count), px, py);

        }

    }


    dispose() {

        for (const texture of this.textures.values()) texture.dispose();
        this.material.dispose();

    }

}
