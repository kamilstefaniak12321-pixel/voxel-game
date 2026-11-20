import * as THREE from 'three';
import { getAtlasUV, getTileMask } from './TextureAtlas.js';
import { SURFACE_PROFILES } from './SurfaceProfiles.js';

// ------------------------------------------------------------
// GRUBE PRZEDMIOTY W RĘCE (0.84.0, pomysł Kamila)
//
// Przedmiot (narzędzie, patyk, szyszka...) nie jest kartką bez grubości:
// obrazek 16 x 16 jest "wytłoczony" na grubość jednego piksela. Przód
// i tył to cały obrazek (przezroczyste piksele odpada alphaTest), a każdy
// widoczny piksel na brzegu ma ściankę boczną w swoim kolorze - jak
// przedmioty w Minecrafcie. Kształt brzegów z atlasu (getTileMask).
//
// Układ: x - w prawo na obrazku, y - w górę, z - grubość; środek
// obrazka w (0, 0, 0), obrazek ma rozmiar 1 x 1.
// (Przeniesione z player/PlayerModel.js w 1.27.0 - leżą też na stole
// krawieckim, rendering/SewingTableRenderer.js.)
// ------------------------------------------------------------

export const ITEM_THICKNESS = 1 / 16;

export function buildExtrudedItemGeometry(textureName, profile = SURFACE_PROFILES.matte) {

    // Zwykły margines kafelka (jak płaski obrazek) - bez prześwitów
    // sąsiednich kafelków atlasu na brzegach.
    const uv = getAtlasUV(textureName);
    const mask = getTileMask(textureName);
    const positions = [], normals = [], uvs = [], indices = [], profiles = [];
    const half = ITEM_THICKNESS / 2;

    // Ścianka: środek, normalna, połowy rozmiarów wzdłuż dwóch osi;
    // cornerUv(róg) - UV rogu z jego położenia.
    const quad = (center, normal, a, b, cornerUv) => {
        const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0) [a, b] = [b, a];
        const base = positions.length / 3;
        for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const corner = [center[0] + a[0] * i + b[0] * j, center[1] + a[1] * i + b[1] * j, center[2] + a[2] * i + b[2] * j];
            positions.push(...corner);
            normals.push(...normal);
            uvs.push(...cornerUv(corner));
            profiles.push(...profile);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // Przód i tył: cały obrazek (UV z położenia - z tyłu odbity, jak
    // prawdziwy przedmiot oglądany od drugiej strony).
    for (const side of [1, -1]) {
        quad([0, 0, half * side], [0, 0, side], [0.5, 0, 0], [0, 0.5, 0],
            ([x, y]) => [x > 0 ? uv.uMax : uv.uMin, y > 0 ? uv.vMax : uv.vMin]);
    }

    // Boki: brzeg każdego widocznego piksela, w kolorze tego piksela.
    if (mask) {
        const N = 16, size = 1 / N;
        const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x] === 1;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (!at(x, y)) continue;
                const texel = [uv.uMin + (x + 0.5) / N * (uv.uMax - uv.uMin), uv.vMax - (y + 0.5) / N * (uv.vMax - uv.vMin)];
                const cx = (x + 0.5) * size - 0.5, cy = 0.5 - (y + 0.5) * size;
                const flatUv = () => texel;
                if (!at(x - 1, y)) quad([cx - size / 2, cy, 0], [-1, 0, 0], [0, size / 2, 0], [0, 0, half], flatUv);
                if (!at(x + 1, y)) quad([cx + size / 2, cy, 0], [1, 0, 0], [0, size / 2, 0], [0, 0, half], flatUv);
                if (!at(x, y - 1)) quad([cx, cy + size / 2, 0], [0, 1, 0], [size / 2, 0, 0], [0, 0, half], flatUv);
                if (!at(x, y + 1)) quad([cx, cy - size / 2, 0], [0, -1, 0], [size / 2, 0, 0], [0, 0, half], flatUv);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(profiles, 2));
    geometry.setIndex(indices);
    geometry.userData.extruded = true;
    return geometry;

}
