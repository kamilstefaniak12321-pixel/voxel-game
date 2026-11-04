import { SURFACE_PROFILES } from './SurfaceProfiles.js';

// Immutable model attributes are compiled once, then copied into the existing
// chunk/material batch. No instancing shader or visual simplification: face and
// vertex order also stay intact for PlantAnimations' vertex ranges.
const LIMIT = 12 * 1024 * 1024;
const MAX_ENTRIES = 512;
const entries = new Map();
let bytes = 0;
const faceIds = new WeakMap();
let nextId = 0;

export function plantMeshTemplateStats() {
    return { entries: entries.size, bytes, limit: LIMIT, maxEntries: MAX_ENTRIES };
}

export function clearPlantMeshTemplates() {
    entries.clear();
    bytes = 0;
}

export function getPlantMeshTemplate(faces, uv, transform, faceUV) {
    let id = faceIds.get(faces);
    if (id === undefined) { id = nextId++; faceIds.set(faces, id); }
    const key = `${id}:${transform.cos}:${transform.sin}:${uv.uMin}:${uv.uMax}:${uv.vMin}:${uv.vMax}`;
    let result = entries.get(key);
    if (result) {
        entries.delete(key);
        entries.set(key, result);
        return result;
    }
    result = compile(faces, uv, transform, faceUV);
    while (entries.size && (bytes + result.bytes > LIMIT || entries.size >= MAX_ENTRIES)) {
        const oldest = entries.keys().next().value;
        bytes -= entries.get(oldest).bytes;
        entries.delete(oldest);
    }
    if (result.bytes <= LIMIT) {
        entries.set(key, result);
        bytes += result.bytes;
    }
    return result;
}

function compile(faces, uv, { cos, sin }, faceUV) {
    const count = faces.length * 4;
    const result = {
        count,
        // Doubles preserve the old expression's final Float32 rounding after
        // adding the local block offset (including Blockbench coordinates).
        positions: new Float64Array(count * 3),
        normal: new Float32Array(count * 3),
        uv: new Float32Array(count * 2),
        motion: new Uint8Array(count * 2),
        profile: new Uint8Array(count * 2),
        tint: new Uint8Array(count * 4),
        baseTint: new Uint8Array(count * 4),
        occlusion: new Uint8Array(count),
        shadeIndex: new Uint16Array(count),
        color: new Uint8Array(count * 4),
        atmosphere: new Uint8Array(count * 4),
        lightKey: null,
        tintKey: null,
        depthShade: null,
    };
    const shades = [], shadeMap = new Map();
    let vertexIndex = 0;
    for (const face of faces) {
        const { uMin, uMax, vMin, vMax } = face.texture ? faceUV(face.texture) : uv;
        const profile = face.surfaceProfile ?? SURFACE_PROFILES.matte;
        for (let i = 0; i < 4; i++, vertexIndex++) {
            const vertex = face.vertices[i], p = vertexIndex * 3, t = vertexIndex * 2, c = vertexIndex * 4;
            result.positions[p] = vertex[0];
            result.positions[p + 1] = vertex[1];
            result.positions[p + 2] = vertex[2];
            result.normal[p] = cos * face.normal[0] - sin * face.normal[2];
            result.normal[p + 1] = face.normal[1];
            result.normal[p + 2] = sin * face.normal[0] + cos * face.normal[2];
            result.uv[t] = face.uv ? uMin + face.uv[i][0] * (uMax - uMin) : (uMax + uMin) / 2;
            result.uv[t + 1] = face.uv ? vMax - face.uv[i][1] * (vMax - vMin) : (vMin + vMax) / 2;
            result.motion[t] = face.weights[i];
            result.motion[t + 1] = face.movement;
            result.profile[t] = profile[0];
            result.profile[t + 1] = profile[1];
            result.baseTint.set(face.color, c);
            result.baseTint[c + 3] = 128;
            const shade = .79 + Math.min(1, vertex[1] / .8) * .21;
            let shadeIndex = shadeMap.get(shade);
            if (shadeIndex === undefined) {
                shadeIndex = shades.length;
                shadeMap.set(shade, shadeIndex);
                shades.push(shade);
            }
            result.shadeIndex[vertexIndex] = shadeIndex;
        }
    }
    result.shades = Float64Array.from(shades);
    result.colorLookup = new Uint8Array(shades.length * 4);
    result.atmosphereLookup = new Uint8Array(shades.length * 4);
    result.colorWords = new Uint32Array(result.color.buffer);
    result.atmosphereWords = new Uint32Array(result.atmosphere.buffer);
    result.lookupColorWords = new Uint32Array(result.colorLookup.buffer);
    result.lookupAtmosphereWords = new Uint32Array(result.atmosphereLookup.buffer);
    // Views share buffers, so count each allocation once.
    result.bytes = [...new Set(Object.values(result).filter(ArrayBuffer.isView).map(a => a.buffer))]
        .reduce((sum, buffer) => sum + buffer.byteLength, 0);
    return result;
}

export function lightPlantMeshTemplate(template, sky, lampR, lampG, lampB, atmosphereSky, atmosphereScale, depthShade, climate) {
    const key = `${sky}:${lampR}:${lampG}:${lampB}:${atmosphereSky}:${atmosphereScale}:${depthShade}`;
    if (key !== template.lightKey) {
        const c = template.colorLookup, a = template.atmosphereLookup;
        for (let i = 0; i < template.shades.length; i++) {
            const shade = template.shades[i] * depthShade, offset = i * 4;
            c[offset] = lampR * shade * 255 + .5;
            c[offset + 1] = lampG * shade * 255 + .5;
            c[offset + 2] = lampB * shade * 255 + .5;
            c[offset + 3] = sky * shade * 255 + .5;
            a[offset] = lampR * atmosphereScale * shade * 255 + .5;
            a[offset + 1] = lampG * atmosphereScale * shade * 255 + .5;
            a[offset + 2] = lampB * atmosphereScale * shade * 255 + .5;
            a[offset + 3] = atmosphereSky * depthShade * 255 + .5;
        }
        for (let i = 0; i < template.count; i++) {
            const shade = template.shadeIndex[i];
            template.colorWords[i] = template.lookupColorWords[shade];
            template.atmosphereWords[i] = template.lookupAtmosphereWords[shade];
        }
        template.lightKey = key;
    }
    if (template.depthShade !== depthShade) {
        for (let i = 0; i < template.count; i++) {
            template.occlusion[i] = template.shades[template.shadeIndex[i]] * depthShade * 255 + .5;
        }
        template.depthShade = depthShade;
    }
    const tintKey = climate ? `${climate[0]}:${climate[1]}:${climate[2]}` : '';
    if (template.tintKey !== tintKey) {
        template.tint.set(template.baseTint);
        if (climate) for (let i = 0; i < template.count; i++) {
            for (let channel = 0; channel < 3; channel++) {
                const offset = i * 4 + channel;
                template.tint[offset] = Math.min(255, Math.round(template.baseTint[offset] * climate[channel] / 128));
            }
        }
        template.tintKey = tintKey;
    }
}
