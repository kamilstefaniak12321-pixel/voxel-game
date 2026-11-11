// ------------------------------------------------------------
// PIKSELOWE WODOSPADY (0.87.0)
//
// Koncept Kamila: bok spadającej wody to pikselowe smugi, nie przewijana
// tekstura tafli. U góry (przy krawędzi) woda jest ciemna, w pionowych
// smugach z jasnymi kreskami, niżej coraz więcej białej piany z turkusowymi
// kreskami, a po kilku blokach spadku - prawie sama piana. Na tafli pod
// wodospadem (WaterfallRipples.js) leży biała plama piany z kropkami.
//
// Wszystko liczy shader - bez nowych tekstur w atlasie:
// - minipiksele 16 na blok w świecie (jak tekstury bloków), krok ruchu
//   o cały piksel (ostre piksele, jak w animacji poklatkowej),
// - kolory z średniej tekstury wody (z paczką tekstur - jej odcień),
//   ciemniejsze i jaśniejsze stopnie + biel piany,
// - piana rośnie ze spadkiem (licznik spadku 1-16 z water.js, liczony
//   w sposób ciągły przez bloki, więc między blokami nie ma szwu).
// ------------------------------------------------------------

import * as THREE from 'three';

// Średni kolor tekstury wody (liniowy) - z niego kolory wodospadu i piany
// na tafli. Ustawia go BlockRenderData.js, gdy atlas policzy średnie.
export const waterfallColorUniforms = {
    uWaterAverage: { value: new THREE.Color(0.06, 0.2, 0.62) }
};

// Ile pikseli na sekundę płyną smugi (16 = blok na sekundę).
export const WATERFALL_PIXEL_SPEED = 24;

// Od ilu bloków spadku zaczyna się piana i kiedy jest jej już pełno.
export const WATERFALL_FOAM_START = 1.7;
export const WATERFALL_FOAM_FULL = 3.3;

// Stopnie koloru: mnożniki średniego koloru wody i domieszka bieli.
export const WATERFALL_SHADES = Object.freeze({
    deep: [0.55, 0.0],
    dark: [0.78, 0.02],
    mid: [1.0, 0.08],
    bright: [1.3, 0.2],
    light: [1.3, 0.5],
    pale: [1.0, 0.74],
    white: [1.0, 0.95]
});

const shade = ([scale, white]) => `mix(base * ${scale.toFixed(3)}, vec3(1.0), ${white.toFixed(3)})`;

// Funkcje GLSL (fragment shader). waterfallPixel zwraca kolor (rgb)
// i ilość piany (a) w punkcie boku spadającej wody.
export const WATERFALL_PIXEL_GLSL = /* glsl */ `
    float waterfallHash(vec2 p) {
        vec3 p3 = fract(vec3(mod(p.xyx, 4096.0)) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }

    // plane - współrzędne boku w blokach (poziomo, pionowo), depth - ile
    // bloków woda już spada w tym miejscu (ciągle), base - kolor wody.
    vec4 waterfallPixel(vec2 plane, float depth, float time, vec3 base) {

        vec2 pixel = floor(plane * 16.0);
        float column = pixel.x;
        float row = pixel.y + floor(time * ${WATERFALL_PIXEL_SPEED.toFixed(1)});

        // Każda kolumna pikseli ma swoje smugi (3-8 px) i przesunięcie.
        float seed = waterfallHash(vec2(column, 7.0));
        float streak = 4.0 + floor(seed * 8.0);
        float run = row + seed * 97.0;
        float segment = floor(run / streak);
        float inSegment = run - segment * streak;
        float pick = waterfallHash(vec2(column, segment));

        vec3 water = pick < 0.18 ? ${shade(WATERFALL_SHADES.deep)}
            : pick < 0.5 ? ${shade(WATERFALL_SHADES.dark)}
            : pick < 0.82 ? ${shade(WATERFALL_SHADES.mid)}
            : ${shade(WATERFALL_SHADES.bright)};

        // Krótkie jasne kreski na ciemnej wodzie (początek smugi).
        if (inSegment < 2.0 && waterfallHash(vec2(column + 0.5, segment)) > 0.86) {
            water = ${shade(WATERFALL_SHADES.light)};
        }

        // Piana: biel i blady turkus, a w niej turkusowe kreski 2-5 px.
        float foamSeed = waterfallHash(vec2(column, 19.0));
        float foamLength = 2.0 + floor(foamSeed * 4.0);
        float foamSegment = floor((row + foamSeed * 61.0) / foamLength);
        float foamPick = waterfallHash(vec2(column * 1.31 + 5.0, foamSegment));

        vec3 foam = foamPick < 0.22 ? ${shade(WATERFALL_SHADES.mid)}
            : foamPick < 0.4 ? ${shade(WATERFALL_SHADES.bright)}
            : foamPick < 0.55 ? ${shade(WATERFALL_SHADES.pale)}
            : ${shade(WATERFALL_SHADES.white)};

        // Przejście: kawałki smug po kolei zamieniają się w pianę.
        float amount = smoothstep(${WATERFALL_FOAM_START.toFixed(2)}, ${WATERFALL_FOAM_FULL.toFixed(2)}, depth);
        float turn = waterfallHash(vec2(column * 0.73 + 11.0, foamSegment));
        float isFoam = step(turn, amount * 1.08 - 0.04);

        return vec4(mix(water, foam, isFoam), amount);

    }
`;

// Średni kolor (jak z daleka) - żeby drobne piksele nie migotały.
export const WATERFALL_AVERAGE_GLSL = /* glsl */ `
    vec3 waterfallAverage(float depth, vec3 base) {
        float amount = smoothstep(${WATERFALL_FOAM_START.toFixed(2)}, ${WATERFALL_FOAM_FULL.toFixed(2)}, depth);
        vec3 water = ${shade(WATERFALL_SHADES.dark)};
        vec3 foam = mix(${shade(WATERFALL_SHADES.white)}, ${shade(WATERFALL_SHADES.mid)}, 0.35);
        return mix(water, foam, amount);
    }
`;

// Plama piany na tafli pod wodospadem (WaterfallRipples.js): biel z małymi
// turkusowymi kropkami 2 x 2 px, które odpływają od środka. Zwraca kolor
// (rgb) i krycie (a; 0 - poza pianą). center - środek uderzenia,
// radius - promień plamy w blokach.
export const WATERFALL_POOL_FOAM_GLSL = /* glsl */ `
    vec4 waterfallPoolFoam(vec2 world, vec2 center, float radius, float time, vec3 base) {

        vec2 pixel = floor(world * 16.0);
        vec2 offset = (pixel + 0.5) / 16.0 - center;
        float dist = length(offset);

        // Postrzępiony brzeg: każdy piksel ma trochę inną granicę.
        float edge = radius * (0.82 + 0.3 * waterfallHash(pixel * 0.5 + 3.0));
        if (dist > edge) return vec4(0.0);

        // Kropki odpływają od środka po pół piksela na klatkę.
        vec2 drift = sign(offset) * floor(time * 6.0);
        vec2 cell = floor((pixel - drift) / 2.0);
        float pick = waterfallHash(cell + 17.0);
        float rim = smoothstep(0.45, 1.0, dist / max(radius, 0.001));

        vec3 color = pick < 0.16 + 0.22 * rim ? ${shade(WATERFALL_SHADES.mid)}
            : pick < 0.26 + 0.24 * rim ? ${shade(WATERFALL_SHADES.light)}
            : pick < 0.4 ? ${shade(WATERFALL_SHADES.pale)}
            : ${shade(WATERFALL_SHADES.white)};

        return vec4(color, 0.96 - 0.3 * rim);

    }
`;
