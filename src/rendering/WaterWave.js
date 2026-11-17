import { SEA_LEVEL, WATER_SURFACE } from '../config.js';

// Shared deformation for water and decals touching its surface. The same
// corner weights and diagonal keep an overlay attached even to shallow flow.
//
// SZTORM (1.15.0): gdy nad otwartym morzem mocno wieje, po tafli morza idą
// dodatkowe, długie fale z wiatrem (seaSwell). Dotyczy tylko wody na
// poziomie morza - jeziora i rzeki wyżej zostają spokojne - i tylko
// w pobliżu kamery (dalej tafla łączy się z płaską wodą dalekiego terenu).
// Ten sam rachunek jest po stronie gry (seaSwell niżej): tratwa i liście
// na wodzie unoszą się razem z falą.

// Wysokość tafli morza (y świata).
export const SEA_SURFACE = SEA_LEVEL + WATER_SURFACE;

// Fale sztormowe: największa wysokość (bloki, przy stanie morza 1), dwie
// fale - liczba falowa (rad/blok) i prędkość fazy (rad/s) - wygięcie
// grzbietów w poprzek wiatru, skos drugiej fali i tolerancja wysokości,
// w której woda liczy się jako tafla morza.
export const SEA_WAVE = Object.freeze({
    height: 0.3, k1: 0.42, w1: 1.9, k2: 0.9, w2: 2.8, bend: 0.13, skew: 0.31, level: 0.6
});

// Stan fal po stronie gry (ustawia Game co klatkę razem z uSeaWave):
// amp - wysokość (bloki), dx, dz - kierunek wiatru, radius - zasięg,
// cx, cz - kamera.
export const seaWave = { amp: 0, dx: 1, dz: 0, radius: 64, cx: 0, cz: 0 };

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Kształt fali sztormowej w (x, z): -1..1 (grzbiet dodatni).
export function seaCrest(x, z, time, dx = seaWave.dx, dz = seaWave.dz) {
    const along = x * dx + z * dz;
    const across = z * dx - x * dz;
    return 0.6 * Math.sin(along * SEA_WAVE.k1 - time * SEA_WAVE.w1 + 0.8 * Math.sin(across * SEA_WAVE.bend))
        + 0.4 * Math.sin(along * SEA_WAVE.k2 - time * SEA_WAVE.w2 + across * SEA_WAVE.skew);
}

// O ile fala sztormowa podnosi taflę w (x, y, z) - y to wysokość tafli
// bez fal. Poza morzem i w spokojną pogodę 0.
export function seaSwell(x, y, z, time) {
    if (seaWave.amp <= 0 || Math.abs(y - SEA_SURFACE) > SEA_WAVE.level) return 0;
    const fade = 1 - smooth(seaWave.radius * 0.6, seaWave.radius * 0.92, Math.hypot(x - seaWave.cx, z - seaWave.cz));
    return seaWave.amp * fade * seaCrest(x, z, time);
}

export const SEA_CREST_GLSL = /* glsl */ `
    float seaCrest(vec2 xz, float time, vec2 wind) {
        float along = dot(xz, wind);
        float across = dot(xz, vec2(-wind.y, wind.x));
        return 0.6 * sin(along * ${SEA_WAVE.k1.toFixed(3)} - time * ${SEA_WAVE.w1.toFixed(3)} + 0.8 * sin(across * ${SEA_WAVE.bend.toFixed(3)}))
            + 0.4 * sin(along * ${SEA_WAVE.k2.toFixed(3)} - time * ${SEA_WAVE.w2.toFixed(3)} + across * ${SEA_WAVE.skew.toFixed(3)});
    }
`;

// Jedna plama piany obejmuje kilka krótkich, osobno gasnących grzbietów.
// W dali zostaje ich średnie pokrycie w tej samej plamie, bez migotania.
export const SEA_FOAM_GLSL = /* glsl */ `
    float seaFoamAt(sampler2D noiseMap, vec2 xz, vec2 wind, float time, float storm, float crest, float range) {
        float coarse = smoothstep(70.0, 220.0, range);
        float lod = max(0.0, log2(max(1.0, range / 210.0)));
        vec4 patchNoise = textureLod(noiseMap, (xz - wind * time * 1.3) / 128.0, lod);
        float patchCover = smoothstep(0.24, 0.73, patchNoise.g);
        float crestTip = smoothstep(0.82 - 0.46 * storm, 0.98 - 0.23 * storm, crest);
        float flecks = smoothstep(0.28, 0.74, patchNoise.a + 0.22 * (patchNoise.r - 0.5));
        float distant = 0.24 * smoothstep(0.32, 0.81, patchNoise.r);
        float foam = patchCover * mix(crestTip * flecks, distant, coarse);
        float closeDetail = 1.0 - smoothstep(22.0, 62.0, range);
        if (closeDetail > 0.0) {
            // Drobne przerwy rozrywają sam czubek grzbietu. Przy kamerze
            // ich krawędzie układają się na siatce 1/8 bloku.
            vec2 footprint = mix(xz, (floor(xz * 8.0) + 0.5) / 8.0, closeDetail) - wind * time * 1.3;
            vec2 grain = vec2(dot(footprint, wind) * 1.5, dot(footprint, vec2(-wind.y, wind.x)) * 0.65);
            float edge = textureLod(noiseMap, grain / 30.0, 0.0).a;
            float tip = smoothstep(0.87 - 0.39 * storm, 0.96 - 0.39 * storm, crest + 0.24 * (edge - 0.5));
            float fragments = smoothstep(0.39, 0.50, edge + 0.36 * (patchNoise.a - 0.5));
            float cover = smoothstep(0.34, 0.50, patchNoise.g);
            foam = mix(foam, tip * cover * fragments, closeDetail);
        }
        return storm * foam;
    }
`;

export const WATER_WAVE_GLSL = /* glsl */ `
    float waterWave(vec2 xz, float time) {
        return sin(xz.x * 0.9 + time * 1.3) * 0.5
            + sin(xz.y * 1.3 - time * 1.05) * 0.35
            + sin((xz.x + xz.y) * 0.45 + time * 0.7) * 0.15;
    }

    // x - wysokość fal sztormowych (bloki; 0 - brak), yz - kierunek wiatru,
    // w - zasięg od kamery (bloki).
    uniform vec4 uSeaWave;

    ${SEA_CREST_GLSL}

    float seaSwell(vec3 world, float time) {
        if (uSeaWave.x <= 0.0 || abs(world.y - ${SEA_SURFACE.toFixed(3)}) > ${SEA_WAVE.level.toFixed(2)}) return 0.0;
        float fade = 1.0 - smoothstep(uSeaWave.w * 0.6, uSeaWave.w * 0.92, distance(world.xz, cameraPosition.xz));
        return uSeaWave.x * fade * seaCrest(world.xz, time, uSeaWave.yz);
    }
`;
