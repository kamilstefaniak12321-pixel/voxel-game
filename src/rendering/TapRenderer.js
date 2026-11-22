// ------------------------------------------------------------
// OBRAZ NACIĘĆ W PNIACH (1.41.0, dary pnia - docs/dary-pnia.md)
//
// Stan: game/TreeTaps.js. Każde nacięcie w pobliżu gracza to jedna mała
// siatka na ścianie pnia:
//   - nacięcie w kształcie V: jasne drewno spod kory i ciemna szczelina
//     (zabliźnione - sama blizna),
//   - żywica: bursztynowy zaciek pod nacięciem, tym dłuższy, im jej więcej,
//   - sok bez kubka: mokra strużka; z kubkiem - gliniany kubek pod
//     nacięciem i sok w środku,
//   - kropla spadająca z nacięcia, póki sok płynie.
//
// Bez własnych tekstur: kafelki atlasu bloków (okorowane drewno gatunku,
// glina kubka, śnieg jako biel pod kolor soku) i kolor wierzchołków.
// Materiał taki sam jak karb ścinanego drzewa (ModelMaterial.js).
// ------------------------------------------------------------

import * as THREE from 'three';
import { TREE_SPECIES } from '../blocks/trees.js';
import { giftOf, seasonFlow } from '../blocks/treeGifts.js';
import { isHealed, TAP_FACES } from '../game/TreeTaps.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture, getAtlasUV } from './TextureAtlas.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';

// Z jak daleka widać nacięcia i z jak daleka kapią krople (bloki).
export const TAP_VIEW_RANGE = 40;
export const TAP_DROP_RANGE = 14;
// Co ile sekund odświeża się lista i światło.
const REFRESH_SECONDS = 0.5;

// Wymiary na ścianie pnia: u - w poprzek (0-1), v - wysokość (0-1).
const TIP = { u: 0.5, v: 0.56 }, ARM = { du: 0.23, dv: 0.18, height: 0.095 };
const CUP = { u0: 0.37, u1: 0.63, v0: 0.2, v1: 0.45, d0: 0.004, d1: 0.26 };
const CUP_TILES = { clay_cup: 'clay', white_clay_cup: 'white_clay', red_clay_cup: 'red_clay' };

const newLighting = () => ({ uModelSky: { value: 1 }, uModelBlock: { value: new THREE.Vector3() }, uModelSun: { value: 1 },
    uModelDistantShadows: { value: 1 }, uModelBounce: { value: new THREE.Vector3() } });

const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Geometria jednego nacięcia.
//   days - doba gry (czy sok płynie); null - jak w porze, gdy płynie.
export function tapGeometry(tap, days = null) {
    const gift = giftOf(tap.species);
    const [dx, dz] = TAP_FACES[tap.face];
    const tx = dz, tz = -dx;
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    // Punkt (u, v, d): w poprzek ściany, wysokość, odstęp od ściany.
    const point = (u, v, d) => [tap.x + 0.5 + dx * (0.5 + d) + tx * (u - 0.5), tap.y + v, tap.z + 0.5 + dz * (0.5 + d) + tz * (u - 0.5)];
    // Czworokąt: cztery rogi (u, v, d) przeciwnie do ruchu wskazówek zegara.
    const quad = (corners, normal, tile, color) => {
        const uv = getAtlasUV(tile), base = positions.length / 3;
        corners.forEach(([u, v, d], index) => {
            positions.push(...point(u, v, d));
            normals.push(...normal);
            // Środek kafelka (bez krawędzi sąsiednich kafelków).
            uvs.push(uv.uMin + (0.3 + 0.4 * [0, 1, 1, 0][index]) * (uv.uMax - uv.uMin), uv.vMin + (0.3 + 0.4 * [0, 0, 1, 1][index]) * (uv.vMax - uv.vMin));
            colors.push(...color);
        });
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const out = [dx, 0, dz], side = [tx, 0, tz], back = [-tx, 0, -tz];
    const flat = (u0, u1, v0, v1, d, tile, color) => quad([[u0, v0, d], [u1, v0, d], [u1, v1, d], [u0, v1, d]], out, tile, color);

    const healed = isHealed(tap);
    const wood = TREE_SPECIES[tap.species]?.textures?.strippedSide ?? 'snow';
    // Dwa ramiona V: jasne drewno i ciemna szczelina (blizna - bez szczeliny).
    for (const way of [-1, 1]) {
        const ua = way < 0 ? TIP.u - ARM.du : TIP.u, ub = way < 0 ? TIP.u : TIP.u + ARM.du;
        const va = way < 0 ? TIP.v + ARM.dv : TIP.v, vb = way < 0 ? TIP.v : TIP.v + ARM.dv;
        for (const [part, shade, d] of [[1, healed ? 0.62 : 1.05, 0.006], [0.42, healed ? 0.5 : 0.22, 0.011]]) {
            const h = ARM.height * part / 2;
            quad([[ua, va - h, d], [ub, vb - h, d], [ub, vb + h, d], [ua, va + h, d]], out, wood, [shade, shade, shade]);
        }
    }
    if (!gift) return build(positions, normals, uvs, colors, indices);

    const color = rgb(gift.color);
    const flowing = !healed && (days === null || seasonFlow(gift, days) > 0);
    if (!gift.vessel) {
        // Żywica: zaciek pod nacięciem i kropla na końcu.
        if (tap.amount > 0.05 || flowing) {
            const length = 0.05 + 0.09 * Math.min(gift.max, tap.amount);
            flat(0.465, 0.535, TIP.v - length, TIP.v + 0.01, 0.014, 'snow', color);
            if (tap.amount >= 1) {
                // Kropla na końcu zacieku i jasny błysk na niej.
                const size = 0.04 + 0.014 * Math.floor(tap.amount), low = TIP.v - length - size * 1.4;
                flat(0.5 - size, 0.5 + size, low, low + size * 1.8, 0.018, 'snow', color);
                flat(0.5 - size * 0.6, 0.5 - size * 0.1, low + size * 0.9, low + size * 1.4, 0.021, 'snow', color.map((c) => Math.min(1, c * 1.35 + 0.12)));
            }
        }
    }
    else {
        // Mokra strużka pod nacięciem.
        if (flowing) flat(0.485, 0.515, tap.cup ? CUP.v1 : 0.04, TIP.v, 0.013, 'snow', color.map((c) => c * 0.8));
        if (tap.cup) {
            const tile = CUP_TILES[tap.cup] ?? 'clay', light = [1, 1, 1], dim = [0.82, 0.82, 0.82];
            const { u0, u1, v0, v1, d0, d1 } = CUP;
            // Kubek zwęża się ku dołowi; pod brzegiem jaśniejszy pasek.
            const b0 = u0 + 0.035, b1 = u1 - 0.035, band = v1 - 0.05;
            quad([[b0, v0, d1], [b1, v0, d1], [u1, band, d1], [u0, band, d1]], out, tile, [0.92, 0.92, 0.92]);
            quad([[u0, band, d1], [u1, band, d1], [u1, v1, d1], [u0, v1, d1]], out, tile, [1.15, 1.12, 1.08]);
            quad([[b1, v0, d1], [b1, v0, d0], [u1, v1, d0], [u1, v1, d1]], side, tile, dim);
            quad([[b0, v0, d0], [b0, v0, d1], [u0, v1, d1], [u0, v1, d0]], back, tile, dim);
            quad([[b0, v0, d0], [b1, v0, d0], [b1, v0, d1], [b0, v0, d1]], [0, -1, 0], tile, [0.6, 0.6, 0.6]);
            // Brzeg kubka i to, co w środku (pusty - ciemne dno).
            quad([[u0, v1, d1], [u1, v1, d1], [u1, v1, d0], [u0, v1, d0]], [0, 1, 0], tile, [0.9, 0.9, 0.9]);
            const rim = 0.04, level = v1 + 0.002;
            const inside = tap.amount > 0.04 ? color : [0.3, 0.26, 0.24];
            quad([[u0 + rim, level, d1 - rim], [u1 - rim, level, d1 - rim], [u1 - rim, level, d0 + rim], [u0 + rim, level, d0 + rim]], [0, 1, 0],
                tap.amount > 0.04 ? 'snow' : tile, inside);
        }
    }
    return build(positions, normals, uvs, colors, indices);
}

function build(positions, normals, uvs, colors, indices) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

// Kropla: mały prostopadłościan w kolorze soku (biały kafelek atlasu).
function dropGeometry(color) {
    const geometry = new THREE.BoxGeometry(0.035, 0.05, 0.035);
    const uv = getAtlasUV('snow'), count = geometry.getAttribute('position').count, [r, g, b] = rgb(color);
    const uvs = [], colors = [];
    for (let i = 0; i < count; i++) { uvs.push((uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2); colors.push(r, g, b); }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}

// Skąd i dokąd leci kropla: wysokości nad dołem bloku.
export function dropPath(tap) {
    return { from: TIP.v - 0.02, to: tap.cup ? CUP.v1 + 0.02 : -0.4 };
}

const viewSign = (tap, flowing) => `${tap.face}:${Math.round(tap.amount * 8)}:${tap.cup ?? ''}:${isHealed(tap) ? 1 : 0}:${flowing ? 1 : 0}`;

export class TapRenderer {

    constructor(game, taps) {
        this.game = game;
        this.taps = taps;
        this.views = new Map();
        this.wait = 0;
        this.clock = 0;
    }

    light(lighting, x, y, z) {
        const game = this.game;
        const light = game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
        lighting.uModelSky.value = atmosphericLightToBrightness(light.sky);
        const natural = game.sky?.lightingLook === 'natural';
        lighting.uModelSun.value = natural ? lighting.uModelSky.value ** 2.2 : 1;
        lighting.uModelBlock.value.set(natural ? light.red / 255 : 0, natural ? light.green / 255 : 0, natural ? light.blue / 255 : 0);
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        view.group.removeFromParent();
        view.mesh.geometry.dispose();
        view.drop.geometry.dispose();
        view.material.dispose();
        this.views.delete(key);
    }

    refresh() {
        const game = this.game, player = game.player?.pos, days = game.time?.days ?? 0;
        const near = new Set();
        if (player) {
            for (const [key, tap] of this.taps.taps) {
                const distance = Math.hypot(tap.x + 0.5 - player.x, tap.y + 0.5 - player.y, tap.z + 0.5 - player.z);
                if (distance > TAP_VIEW_RANGE) continue;
                near.add(key);
                const gift = giftOf(tap.species);
                const flowing = Boolean(gift) && !isHealed(tap) && seasonFlow(gift, days) > 0;
                let view = this.views.get(key);
                if (!view) {
                    const lighting = newLighting();
                    const material = createModelMaterial({ map: blockAtlasTexture, lighting, vertexColors: true });
                    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
                    const drop = new THREE.Mesh(dropGeometry(gift?.color ?? 0xffffff), material);
                    drop.visible = false;
                    const group = new THREE.Group();
                    group.add(mesh, drop);
                    game.scene.add(group);
                    view = { group, mesh, drop, material, lighting, sign: '', phase: (tap.x * 0.37 + tap.z * 0.61 + tap.y * 0.13) % 1 };
                    this.views.set(key, view);
                }
                const sign = viewSign(tap, flowing);
                if (view.sign !== sign) {
                    view.mesh.geometry.dispose();
                    view.mesh.geometry = tapGeometry(tap, days);
                    view.sign = sign;
                }
                // Kropla: tylko sok, który płynie, i tylko z bliska.
                view.dropping = flowing && gift.vessel && distance <= TAP_DROP_RANGE && !(tap.cup && tap.amount >= 1);
                if (view.dropping) {
                    const [dx, dz] = TAP_FACES[tap.face];
                    view.path = dropPath(tap);
                    view.drop.position.set(tap.x + 0.5 + dx * 0.53, tap.y + view.path.from, tap.z + 0.5 + dz * 0.53);
                    view.base = tap.y;
                }
                else view.drop.visible = false;
                const [fx, fz] = TAP_FACES[tap.face];
                this.light(view.lighting, tap.x + 0.5 + fx, tap.y + 0.5, tap.z + 0.5 + fz);
            }
        }
        for (const key of [...this.views.keys()]) if (!near.has(key)) this.removeView(key);
    }

    update(dt) {
        if (this.taps.taps.size === 0 && this.views.size === 0) return;
        this.clock += dt;
        this.wait -= dt;
        if (this.wait <= 0) { this.wait = REFRESH_SECONDS; this.refresh(); }
        // Krople: przyspieszają jak spadająca kropla, potem chwila przerwy.
        for (const view of this.views.values()) {
            if (!view.dropping) continue;
            const turn = (this.clock * 0.55 + view.phase) % 1;
            const fall = Math.min(1, turn / 0.45);
            view.drop.visible = turn < 0.45;
            view.drop.position.y = view.base + view.path.from + (view.path.to - view.path.from) * fall * fall;
        }
    }

    dispose() {
        for (const key of [...this.views.keys()]) this.removeView(key);
    }

}
