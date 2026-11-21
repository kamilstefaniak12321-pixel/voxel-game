// ------------------------------------------------------------
// DREWUTNIA - OBRAZ STOSÓW POLAN (1.34.0)
//
// Każdy widoczny stos to JEDNA siatka: polana (model polana z ogniska,
// tekstura gatunku) sklejone w jedną geometrię - jedno rysowanie na
// stos. Geometria powstaje od nowa tylko wtedy, gdy zmieni się
// zawartość stosu (pileSign). Mokre polana są ciemniejsze (kolor
// wierzchołków).
//
// Widać najwyżej MAX_VISIBLE stosów w promieniu VIEW_RANGE; limit
// obrazu nie wpływa na zapis ani schnięcie.
// ------------------------------------------------------------
import * as THREE from 'three';
import { CAMPFIRE_LOGS } from './CampfireGeometry.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture, getAtlasUV } from './TextureAtlas.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { warmupObject } from './ShaderWarmup.js';
import { WOODPILE_ROW, pileSign } from '../game/WoodpileState.js';
import { wetFactor } from '../items/moisture.js';

const VIEW_RANGE = 64, MAX_VISIBLE = 48;
// Polano: 4 x 4 x 16 pikseli (pierwsze polano ogniska, wzdłuż osi Z).
const LOG = CAMPFIRE_LOGS[0];
const THICK = 0.25;
// O tyle ciemniejsze jest w pełni mokre polano.
const WET_SHADE = 0.38;

// Miejsce polana numer `index` w stosie: [w poprzek, wysokość].
export function logSlot(index) {
    return [(index % WOODPILE_ROW - (WOODPILE_ROW - 1) / 2) * THICK, (Math.floor(index / WOODPILE_ROW) + 0.5) * THICK];
}

// Geometria całego stosu (środek podstawy bloku w zerze).
export function pileGeometry(pile) {
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    const alongX = pile.axis === 'x';
    pile.logs.forEach((log, index) => {
        const uv = getAtlasUV(`campfire_${log.wood}`, 0);
        const [side, height] = logSlot(index);
        // Drobna różnica odcienia, żeby polana jednego gatunku się nie zlewały.
        const shade = (1 - WET_SHADE * wetFactor(log.wet ?? 0)) * (0.94 + 0.06 * ((index * 7) % 5) / 4);
        for (const face of LOG.faces) {
            const base = positions.length / 3;
            face.vertices.forEach((p, i) => {
                const x = p[0] + side, y = p[1] + height, z = p[2];
                // Stos wzdłuż X: obrót o ćwierć wokół pionu.
                if (alongX) { positions.push(z, y, -x); normals.push(face.normal[2], face.normal[1], -face.normal[0]); }
                else { positions.push(x, y, z); normals.push(...face.normal); }
                uvs.push(uv.uMin + face.uv[i][0] * (uv.uMax - uv.uMin), uv.vMax - face.uv[i][1] * (uv.vMax - uv.vMin));
                colors.push(shade, shade, shade);
            });
            indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

const newLighting = () => ({ uModelSky: { value: 1 }, uModelBlock: { value: new THREE.Vector3() }, uModelSun: { value: 1 },
    uModelDistantShadows: { value: 1 }, uModelBounce: { value: new THREE.Vector3() } });

export class WoodpileRenderer {

    constructor(game) {
        this.game = game;
        this.views = new Map();
    }

    createView(key, pile) {
        const lighting = newLighting();
        const material = createModelMaterial({ map: blockAtlasTexture, lighting, vertexColors: true });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.position.set(pile.x + 0.5, pile.y, pile.z + 0.5);
        this.game.scene.add(mesh);
        const view = { mesh, material, lighting, sign: null };
        this.views.set(key, view);
        return view;
    }

    syncView(view, pile) {
        const sign = pileSign(pile);
        if (sign !== view.sign) {
            view.mesh.geometry.dispose();
            view.mesh.geometry = pileGeometry(pile);
            view.mesh.visible = pile.logs.length > 0;
            view.sign = sign;
        }
        const game = this.game;
        const light = game.world.getLight(pile.x, pile.y, pile.z);
        view.lighting.uModelSky.value = atmosphericLightToBrightness(light.sky);
        const natural = game.sky.lightingLook === 'natural';
        view.lighting.uModelSun.value = natural ? view.lighting.uModelSky.value ** 2.2 : 1;
        view.lighting.uModelBlock.value.set(natural ? light.red / 255 : 0, natural ? light.green / 255 : 0, natural ? light.blue / 255 : 0);
    }

    update(dt, piles) {
        if (piles.size === 0 && this.views.size === 0) return;
        const camera = this.game.camera.position, world = this.game.world;
        const selected = [];
        for (const [key, pile] of piles) {
            const d = (pile.x - camera.x) ** 2 + (pile.y - camera.y) ** 2 + (pile.z - camera.z) ** 2;
            if (d < VIEW_RANGE * VIEW_RANGE && world.getChunk(world.toChunkCoord(pile.x), world.toChunkCoord(pile.z))) selected.push({ key, pile, d });
        }
        if (selected.length > MAX_VISIBLE) selected.sort((a, b) => a.d - b.d).length = MAX_VISIBLE;
        const keys = new Set(selected.map((entry) => entry.key));
        for (const [key, view] of this.views) if (!keys.has(key)) this.removeView(key, view);
        for (const { key, pile } of selected) this.syncView(this.views.get(key) ?? this.createView(key, pile), pile);
    }

    // Odbicie światła z miejsca stosu (jak ognisko).
    updateBounce() {
        for (const view of this.views.values()) {
            if (!this.game.bounce.enabled) { view.lighting.uModelBounce.value.set(0, 0, 0); continue; }
            const p = view.mesh.position;
            const color = this.game.bounce.sample(p.x, p.y + 0.5, p.z);
            view.lighting.uModelBounce.value.set(color[0], color[1], color[2]);
        }
    }

    removeView(key, view) {
        view.mesh.removeFromParent(); view.mesh.geometry.dispose(); view.material.dispose();
        this.views.delete(key);
    }

    // Wzór dla programu cieniującego (rendering/ShaderWarmup.js) - pierwszy
    // stos nie zatrzymuje gry.
    shaderPrototypes() {
        if (!this.prototypes) {
            this.prototypes = [warmupObject(createModelMaterial({ map: blockAtlasTexture, lighting: newLighting(), vertexColors: true }),
                { position: 3, normal: 3, uv: 2, color: 3 })];
        }
        return this.prototypes;
    }

    dispose() {
        if (this.prototypes) { for (const object of this.prototypes) { object.material.dispose(); object.geometry.dispose(); } this.prototypes = null; }
        for (const [key, view] of this.views) this.removeView(key, view);
    }

}
