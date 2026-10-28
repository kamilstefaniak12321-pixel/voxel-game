import * as THREE from 'three';

import { blockAtlasTexture } from './TextureAtlas.js';

import { CHUNK_SIZE, CHUNK_HEIGHT, SHADOW_INDOOR_DARKNESS } from '../config.js';

import { isOpaqueId, isLeavesId } from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// CIENIE SŁOŃCA I KSIĘŻYCA
//
// Jak to działa (shadow mapping):
//   1. Raz na jakiś czas rysujemy świat "oczami słońca" - kamera
//      ortograficzna patrzy z kierunku słońca na teren wokół gracza
//      i zapisuje w teksturze (mapie cieni), jak daleko od słońca jest
//      najbliższy blok w każdym punkcie.
//   2. Rysując blok, sprawdzamy w mapie, czy między nim a słońcem coś
//      jest. Jest - blok jest w cieniu i nie dostaje światła słońca
//      (zostaje mu tylko światło z całego nieba).
//
// Cienie są PIKSELOWE (jak "Vibrant Visuals" w Minecrafcie): każdy
// piksel tekstury bloku (1/16 bloku) jest albo cały w cieniu, albo cały
// w słońcu - brzeg cienia idzie po pikselach tekstury, a nie
// rozmytą kreską. Bliska mapa ma dokładnie 16 punktów na blok.
//
// DWIE MAPY:
//   - bliska - 32 albo 64 bloki wokół gracza, 16 punktów na blok,
//     przerysowywana, gdy słońce przesunie się o kawałek, gracz odejdzie
//     od środka mapy albo zmienią się chunki w jej zasięgu,
//   - daleka (jakość "Dalekie") - 512 bloków wokół gracza, 2 punkty na
//     blok, razem z dalekim terenem: góry rzucają długie cienie na
//     doliny o wschodzie i zachodzie. Rysowana rzadko i po kawałku
//     (kilka klatek na jedną mapę, do drugiej tekstury), więc nie
//     przycina gry - gotowa podmienia poprzednią.
//
// Z włączonymi cieniami światło słońca nie słabnie razem ze światłem
// nieba z chunków - liczy się tylko to, czy promień słońca dochodzi.
// Dlatego przez okno do ciemnego pokoju wpada jasna plama słońca,
// a pod drzewem jest wyraźny cień.
//
// Model gracza ma własną, małą mapę rysowaną co klatkę (gracz rzuca
// cień, nawet w widoku z oczu).
//
// Liczby: SHADOW_QUALITY i stałe niżej, ustawienie "Cienie słońca".
// Opis: docs/niebo-i-swiatlo.md.
// ------------------------------------------------------------

// Jakość: rozmiar bliskiej mapy (piksele), jej zasięg od gracza (bloki)
// i czy jest daleka mapa. Bliska mapa ma zawsze 16 pikseli na blok,
// czyli tyle, ile tekstura bloku.

export const SHADOW_QUALITY = {
    1: { size: 1024, radius: 32, far: false },
    2: { size: 2048, radius: 64, far: false },
    3: { size: 2048, radius: 64, far: true }
};

// Klasyczne wygaszanie cieni słońca/księżyca przy horyzoncie oraz
// dodatkowego przyciemnienia wnętrz (y kierunku: 0 = horyzont, 1 = zenit).
// Atmosfera tłumi już wiązkę słońca, więc nie wygaszamy drugi raz jej
// przesłonięcia: nieprzezroczysty blok ma nadal zatrzymywać cały promień.

const FADE_LOW = 0.015;
const FADE_HIGH = 0.09;

// Przy niskim słońcu bliska mapa obejmuje bloki od tylu bloków pod do
// tylu nad graczem (dzięki temu jest gęstsza wzdłuż promieni). Wyżej
// i niżej cienie płynnie znikają.

const VERTICAL_RANGE = 32;

// Kiedy przerysować bliską mapę: słońce przesunęło się o tyle (radiany),
// gracz odszedł od środka mapy o taką część zasięgu, zmienił się chunk
// w zasięgu (najwyżej co tyle sekund).

const ANGLE_STEP = 0.0018;
const MOVE_SHARE = 0.25;
const CHUNK_REDRAW_SECONDS = 0.1;

// Daleka mapa: rozmiar, zasięg (bloki), zakres w pionie, kiedy ją
// przerysować (kąt słońca, droga gracza, zmienione chunki najwyżej co
// tyle sekund) i na ile klatek dzielimy rysowanie.

const FAR_SIZE = 2048;
const FAR_RADIUS = 512;
const FAR_VERTICAL_RANGE = 128;
const FAR_ANGLE_STEP = 0.004;
const FAR_MOVE = 48;
const FAR_CHUNK_REDRAW_SECONDS = 2;
const FAR_BUILD_STEPS = 4;

// Cień gracza (mała mapa wokół modelu, rysowana co klatkę).

const MODEL_MAP_SIZE = 256;
const MODEL_MAP_RADIUS = 1.6;

// Kamera cienia gracza stoi tyle bloków od niego (w stronę słońca)
// i widzi do MODEL_MAP_FAR - dalej cień gracza już nie sięga.

const MODEL_MAP_DISTANCE = 8;
const MODEL_MAP_FAR = 72;

// ------------------------------------------------------------
// Wspólne wartości dla shaderów bloków, modeli i dalekiego terenu.
// ------------------------------------------------------------

export const shadowUniforms = {

    // Bliska mapa (głębia widziana od słońca) i przejście świat -> mapa.
    uSunShadowMap: { value: null },
    uSunShadowMatrix: { value: new THREE.Matrix4() },

    // x - 1 / zakres głębi (bloki -> jednostki mapy),
    // y - siła przesłonięcia 0-1 (atmosfera: wiązka słabnie osobno),
    // z - rozmiar piksela mapy w blokach,
    // w - 1 = jest mapa cienia gracza.
    uSunShadowInfo: { value: new THREE.Vector4(1, 0, 1 / 16, 0) },

    // Kierunek DO światła, które rzuca cienie.
    uSunShadowDir: { value: new THREE.Vector3(0, 1, 0) },

    // Które światło kierunkowe sceny rzuca cienie: 0 - słońce,
    // 1 - księżyc (kolejność z Sky.attachLights).
    uSunShadowLight: { value: 0 },

    // Mapa cienia modelu gracza.
    uModelShadowMap: { value: null },
    uModelShadowMatrix: { value: new THREE.Matrix4() },

    // O ile mocniej słabnie światło otoczenia tam, gdzie mało światła
    // nieba (SHADOW_INDOOR_DARKNESS razy siła cieni) - wykładnik.
    uSunShadowAmbient: { value: 0 },

    // Daleka mapa: x - 1 / zakres głębi, y - rozmiar piksela (bloki),
    // z - 1 = mapa gotowa.
    uFarShadowMap: { value: null },
    uFarShadowMatrix: { value: new THREE.Matrix4() },
    uFarShadowInfo: { value: new THREE.Vector4(1, 0.5, 0, 0) }

};


// GLSL wspólny: uniformy światła i nachylenie ściany do promieni.

const COMMON_GLSL = `
    uniform vec4 uSunShadowInfo;
    uniform vec3 uSunShadowDir;
    uniform int uSunShadowLight;

    // Ściana ukośnie do promieni potrzebuje większego zapasu przy
    // porównaniu głębi (inaczej cieniowałaby sama siebie w paski).

    float shadowSlope(vec3 worldNormal) {

        float facing = clamp(dot(worldNormal, uSunShadowDir), 0.05, 1.0);

        return min(sqrt(1.0 - facing * facing) / facing, 8.0);

    }
`;


// GLSL dalekiej mapy (define USE_FAR_SHADOWS): 1 = słońce, 0 = cień;
// coverage - jak bardzo punkt jest w zasięgu mapy (0 - poza nią).

const FAR_GLSL = `
    #ifdef USE_FAR_SHADOWS

        uniform highp sampler2D uFarShadowMap;
        uniform mat4 uFarShadowMatrix;
        uniform vec4 uFarShadowInfo;

        float farShadowLookup(vec3 p, float slope, float extraBias, out float coverage) {

            coverage = 0.0;

            if (uFarShadowInfo.z < 0.5) {
                return 1.0;
            }

            vec3 s = (uFarShadowMatrix * vec4(p, 1.0)).xyz;

            vec2 fromCenter = abs(s.xy - 0.5) * 2.0;

            float edge = max(fromCenter.x, fromCenter.y);

            if (edge >= 1.0 || s.z <= 0.0 || s.z >= 1.0) {
                return 1.0;
            }

            coverage = 1.0 - smoothstep(0.9, 1.0, edge);

            float bias = (uFarShadowInfo.y * (0.6 + 0.8 * slope) + extraBias) * uFarShadowInfo.x;

            return step(s.z - bias, texture(uFarShadowMap, s.xy).r);

        }

    #endif
`;


// GLSL dla bloków: sunShadowLight(pozycja, normalna, światło nieba) -
// ile światła słońca (0-1) dostaje piksel ściany. Poza zasięgiem map -
// tyle, co światła nieba (jak bez cieni). Wymaga define USE_SUN_SHADOWS.
// Rośliny mają większy zapas (SUN_SHADOW_RECEIVER_BIAS, w blokach) -
// kołyszą się, a mapa cieni nie.

export const SHADOW_GLSL = `
#ifdef USE_SUN_SHADOWS

    #ifndef SUN_SHADOW_RECEIVER_BIAS
        #define SUN_SHADOW_RECEIVER_BIAS 0.0
    #endif

    ${COMMON_GLSL}
    ${FAR_GLSL}

    uniform highp sampler2D uSunShadowMap;
    uniform mat4 uSunShadowMatrix;
    uniform highp sampler2D uModelShadowMap;
    uniform mat4 uModelShadowMatrix;
    uniform float uSunShadowAmbient;

    float sunShadowLight(vec3 worldPosition, vec3 worldNormal, float skyLight) {

        // Słońce i księżyc pod horyzontem - bez cieni (jak bez nich).

        if (uSunShadowInfo.y <= 0.0) {
            return skyLight;
        }

        // Środek piksela tekstury (1/16 bloku) na płaszczyźnie ściany,
        // odsunięty o pół piksela od ściany w stronę, w którą patrzy.

        vec3 pixel = (floor(worldPosition * 16.0) + 0.5) / 16.0;

        vec3 axis = step(vec3(0.5), abs(worldNormal));

        vec3 p = mix(pixel, worldPosition, axis) + worldNormal * (0.5 / 16.0);

        float slope = shadowSlope(worldNormal);

        float lit = 1.0;
        float coverage = 0.0;

        // Daleka mapa (dalej niż bliska i przy jej brzegu).

        #ifdef USE_FAR_SHADOWS
            lit = farShadowLookup(p, slope, SUN_SHADOW_RECEIVER_BIAS, coverage);
        #endif

        // Bliska mapa.

        vec3 s = (uSunShadowMatrix * vec4(p, 1.0)).xyz;

        vec2 fromCenter = abs(s.xy - 0.5) * 2.0;

        float edge = max(fromCenter.x, fromCenter.y);

        if (edge < 1.0 && s.z > 0.0 && s.z < 1.0) {

            // Przy brzegu bliskiej mapy płynne przejście w daleką
            // (albo w brak cieni).

            float nearWeight = 1.0 - smoothstep(0.85, 1.0, edge);

            float bias = (uSunShadowInfo.z * (0.35 + 0.6 * slope) + SUN_SHADOW_RECEIVER_BIAS) * uSunShadowInfo.x;

            float nearLit = step(s.z - bias, texture(uSunShadowMap, s.xy).r);

            // Cień gracza (model) - osobna mała mapa.

            if (uSunShadowInfo.w > 0.5 && nearLit > 0.5) {

                vec3 m = (uModelShadowMatrix * vec4(p, 1.0)).xyz;

                if (all(greaterThan(m, vec3(0.0))) && all(lessThan(m, vec3(1.0)))) {
                    nearLit = step(m.z - ${(0.06 / MODEL_MAP_FAR).toFixed(6)}, texture(uModelShadowMap, m.xy).r);
                }

            }

            lit = mix(lit, nearLit, nearWeight);
            coverage = max(coverage, nearWeight);

        }

        return mix(skyLight, lit, coverage * uSunShadowInfo.y);

    }

#endif
`;


// GLSL dla dalekiego terenu (FarTerrain.js): tylko daleka mapa.
// farTerrainSun(pozycja, normalna) - ile światła słońca (0-1).

export const FAR_TERRAIN_SHADOW_GLSL = `
#ifdef USE_FAR_SHADOWS

    ${COMMON_GLSL}
    ${FAR_GLSL}

    float farTerrainSun(vec3 worldPosition, vec3 worldNormal) {

        if (uSunShadowInfo.y <= 0.0) {
            return 1.0;
        }

        float coverage;

        float lit = farShadowLookup(worldPosition + worldNormal * 0.75, shadowSlope(worldNormal), 1.0, coverage);

        return mix(1.0, lit, coverage * uSunShadowInfo.y);

    }

#endif
`;


// Kawałek shadera oświetlenia (lights_fragment_begin): światło, które
// rzuca cienie, mnożymy przez sunLight, drugie światło kierunkowe - przez
// światło nieba (skyLight), światło otoczenia - przez ambientLight.
// Nazwy zmiennych ustawia ten, kto wstawia kod (bloki: blockSun,
// blockSky, blockAmbient).

export function shadowLightsChunk(sunLight, skyLight, ambientLight, condition = null) {

    const sunFactor = condition ? `(${condition} ? ${sunLight} : 1.0)` : sunLight;
    const skyFactor = condition ? `(${condition} ? ${skyLight} : 1.0)` : skyLight;
    const ambientFactor = condition ? `(${condition} ? ${ambientLight} : 1.0)` : ambientLight;

    const chunk = THREE.ShaderChunk.lights_fragment_begin
        .replace(
            'getDirectionalLightInfo( directionalLight, directLight );',
            `getDirectionalLightInfo( directionalLight, directLight );
            directLight.color *= ( UNROLLED_LOOP_INDEX == uSunShadowLight ) ? ${sunFactor} : ${skyFactor};`
        )
        .replace(
            'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );',
            `vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
            irradiance *= ${ambientFactor};`
        )
        .replace(
            'getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
            `getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * ${ambientFactor};`
        );

    return chunk;

}

// ------------------------------------------------------------
// Materiały do rysowania mapy cieni (tylko głębia).
//
// Kolejność jak grupy geometrii chunka (ChunkMesher.js, World.js):
//   0 - zwykłe bloki (pełne),
//   1 - rośliny (przezroczyste piksele przepuszczają światło - trawa
//       i kwiaty rzucają drobne, pikselowe cienie),
//   2 - woda (nie rzuca cienia - widać pod nią dno),
//   3 - liście i płaskie dekoracje (plamki słońca pod drzewem).
// ------------------------------------------------------------

const DEPTH_VERTEX = `
varying vec2 vUv;

void main() {

    vUv = uv;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}
`;

const solidDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: 'void main() {}',
    colorWrite: false
});

const cutoutDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;

        void main() {

            if (texture2D(map, vUv).a < 0.5) {
                discard;
            }

        }
    `,
    uniforms: { map: { value: blockAtlasTexture } },
    colorWrite: false,
    side: THREE.DoubleSide
});

const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });

export const SHADOW_CASTER_MATERIALS = [
    solidDepthMaterial,
    cutoutDepthMaterial,
    hiddenMaterial,
    cutoutDepthMaterial
];


// Szybkie liście (bez prześwitów) rzucają pełny cień.

export function setShadowFastLeaves(on) {

    SHADOW_CASTER_MATERIALS[3] = on ? solidDepthMaterial : cutoutDepthMaterial;

}


// Model gracza - pełne pudełka.

const modelDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: 'void main() {}',
    colorWrite: false,
    side: THREE.DoubleSide
});

const MODEL_LAYER = 2;


// Daleki teren do dalekiej mapy: w zasięgu chunków jest wycięty
// (tak jak w FarTerrain.js), żeby nie rzucał cienia drugi raz na
// prawdziwe chunki.

const farTerrainDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        varying vec2 vFarXZ;

        void main() {

            vFarXZ = (modelMatrix * vec4(position, 1.0)).xz;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

        }
    `,
    fragmentShader: `
        uniform vec2 uFarCenter;
        uniform float uFarInner;
        varying vec2 vFarXZ;

        void main() {

            if (length(vFarXZ - uFarCenter) < uFarInner) {
                discard;
            }

        }
    `,
    uniforms: {
        uFarCenter: { value: new THREE.Vector2() },
        uFarInner: { value: 0 }
    },
    colorWrite: false
});


// Z przestrzeni kamery (-1..1) do tekstury (0..1).

const TO_TEXTURE = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1
);


function smoothstep(a, b, x) {

    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);

}


function createTarget(size) {

    const target = new THREE.WebGLRenderTarget(size, size, {
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
        depthBuffer: true
    });

    target.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;

    return target;

}


function disposeTarget(target) {

    target?.dispose();
    target?.depthTexture?.dispose();

}

// ------------------------------------------------------------
// Kamera jednej mapy: patrzy z kierunku światła na gracza, przesunięta
// tak, żeby piksele mapy stały w miejscu (bez migotania brzegów cieni,
// gdy gracz chodzi).
// ------------------------------------------------------------

class ShadowView {

    // fitVertical - przy niskim słońcu mapa niższa (gęstsza wzdłuż
    // promieni), ale wtedy wysokie góry daleko w stronę słońca wypadają
    // poza nią - daleka mapa jest zawsze kwadratowa.

    constructor(radius, verticalRange, fitVertical = true) {

        this.radius = radius;
        this.verticalRange = verticalRange;
        this.fitVertical = fitVertical;
        this.size = 1;

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);

        this.matrix = new THREE.Matrix4();
        this.textureMatrix = new THREE.Matrix4();
        this.frustum = new THREE.Frustum();

        this.depthScale = 1;
        this.texel = 1;

        this.up = new THREE.Vector3();
        this.right = new THREE.Vector3();

    }


    // focus - miejsce gracza, direction - kierunek do światła,
    // reach - jak daleko w stronę światła mogą być bloki rzucające cień.

    place(focus, direction, reach) {

        const camera = this.camera;
        const radius = this.radius;
        const range = this.verticalRange;

        // "Do góry" kamery: pion świata (przy słońcu w zenicie - północ).

        this.up.set(0, 1, 0);

        if (Math.abs(direction.y) > 0.995) {
            this.up.set(0, 0, -1);
        }

        // Wzdłuż promieni (przy niskim słońcu) mapa nie musi być tak
        // wysoka - teren wokół gracza jest płaski względem promieni.

        const height = this.fitVertical ? Math.min(
            radius,
            radius * Math.abs(direction.y) + range * Math.sqrt(Math.max(0, 1 - direction.y * direction.y)) + 4
        ) : radius;

        // Kamera nad najwyższymi blokami (z zapasem), ale nie dalej niż
        // sięga teren (dalej i tak nic nie rzuca cienia).

        const above = (CHUNK_HEIGHT + 8 - (focus.y - range)) / Math.max(0.02, direction.y);

        const distance = Math.max(radius + 16, Math.min(above, reach));

        camera.left = -radius;
        camera.right = radius;
        camera.top = height;
        camera.bottom = -height;
        camera.near = 1;
        camera.far = distance + radius * 2 + range * 2 + 64;

        camera.updateProjectionMatrix();

        camera.up.copy(this.up);
        camera.position.copy(focus).addScaledVector(direction, distance);
        camera.lookAt(focus);
        camera.updateMatrixWorld();


        // Przesunięcie do siatki pikseli mapy (w osiach kamery).

        this.right.setFromMatrixColumn(camera.matrixWorld, 0);
        this.up.setFromMatrixColumn(camera.matrixWorld, 1);

        const texelX = (2 * radius) / this.size;
        const texelY = (2 * height) / this.size;

        const x = camera.position.dot(this.right);
        const y = camera.position.dot(this.up);

        camera.position
            .addScaledVector(this.right, Math.round(x / texelX) * texelX - x)
            .addScaledVector(this.up, Math.round(y / texelY) * texelY - y);

        camera.updateMatrixWorld();


        this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

        this.frustum.setFromProjectionMatrix(this.matrix);

        this.textureMatrix.multiplyMatrices(TO_TEXTURE, this.matrix);

        this.depthScale = 1 / (camera.far - camera.near);

        this.texel = texelX;

    }

}

// ------------------------------------------------------------

export class SunShadows {

    constructor(renderer) {

        this.renderer = renderer;

        // Cienie potrzebują WebGL2 (tekstury głębi, pozycja w świecie
        // w shaderze bloków).

        this.supported = renderer.capabilities.isWebGL2;

        // 0 = wyłączone, 1 / 2 / 3 - SHADOW_QUALITY.
        this.quality = 0;

        this.near = new ShadowView(64, VERTICAL_RANGE);
        this.far = new ShadowView(FAR_RADIUS, FAR_VERTICAL_RANGE);

        this.far.size = FAR_SIZE;

        this.target = null;
        this.modelTarget = null;

        // Daleka mapa: gotowa (w shaderach) i rysowana po kawałku.
        this.farTarget = null;
        this.farBackTarget = null;

        this.modelCamera = new THREE.OrthographicCamera(
            -MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, -MODEL_MAP_RADIUS, 0.1, MODEL_MAP_FAR
        );

        this.modelCamera.layers.set(MODEL_LAYER);

        // Światło, które teraz rzuca cienie.
        //   direction - kierunek DO światła,
        //   light     - 'sun' albo 'moon',
        //   strength  - siła przesłonięcia światła kierunkowego 0-1,
        //   ambientStrength - płynne dodatkowe przyciemnienie wnętrz.

        this.direction = new THREE.Vector3(0, 1, 0);
        this.light = 'sun';
        this.strength = 0;
        this.ambientStrength = 0;

        // Stan bliskiej mapy: kierunek i środek z ostatniego rysowania.

        this.drawnDirection = new THREE.Vector3();
        this.drawnLight = null;
        this.center = new THREE.Vector3();
        this.valid = false;
        this.changed = false;
        this.sinceDraw = 0;

        // Stan dalekiej mapy.

        this.farDirection = new THREE.Vector3();
        this.farLight = null;
        this.farCenter = new THREE.Vector3();
        this.farValid = false;
        this.farChanged = false;
        this.sinceFar = 0;
        this.farNeeded = false;

        // Rysowanie dalekiej mapy w toku: kolejne paczki chunków
        // (null - nie trwa).
        this.farBuild = null;

        // Liczniki przerysowań (debug, /cienie).
        this.draws = 0;
        this.farDraws = 0;

        this.box = new THREE.Box3();
        this.matrix = new THREE.Matrix4();
        this.modelCenter = new THREE.Vector3();

    }


    // Czy cienie są teraz włączone (ustawienie i karta graficzna).

    get enabled() {

        return this.quality > 0;

    }


    // Czy cienie są teraz widoczne (włączone, słońce albo księżyc nad
    // horyzontem, mapa narysowana).

    get active() {

        return this.enabled && this.valid && this.strength > 0;

    }


    // Czy jest daleka mapa (jakość "Dalekie").

    get hasFar() {

        return SHADOW_QUALITY[this.quality]?.far === true;

    }


    get radius() {

        return SHADOW_QUALITY[this.quality]?.radius ?? 0;

    }


    get size() {

        return SHADOW_QUALITY[this.quality]?.size ?? 0;

    }


    get farRadius() {

        return this.hasFar ? FAR_RADIUS : 0;

    }


    // Zgodność ze starszym kodem: kamera bliskiej mapy.

    get camera() {

        return this.near.camera;

    }


    // quality: 0 (wyłączone), 1, 2, 3.

    setQuality(quality) {

        const wanted = this.supported && SHADOW_QUALITY[quality] ? quality : 0;

        if (wanted === this.quality) {
            return;
        }

        const had = SHADOW_QUALITY[this.quality];

        this.quality = wanted;

        const settings = SHADOW_QUALITY[wanted];


        // Bliska mapa i cień gracza.

        if (!settings || settings.size !== had?.size) {

            disposeTarget(this.target);
            this.target = settings ? createTarget(settings.size) : null;

        }

        if (!settings || !had) {

            disposeTarget(this.modelTarget);
            this.modelTarget = settings ? createTarget(MODEL_MAP_SIZE) : null;

        }

        if (settings) {

            this.near.radius = settings.radius;
            this.near.size = settings.size;

        }


        // Daleka mapa.

        if (!settings?.far) {

            disposeTarget(this.farTarget);
            disposeTarget(this.farBackTarget);

            this.farTarget = null;
            this.farBackTarget = null;

        }
        else if (!this.farTarget) {

            this.farTarget = createTarget(FAR_SIZE);
            this.farBackTarget = createTarget(FAR_SIZE);

        }


        // Mapy trafiają do shaderów dopiero po pierwszym narysowaniu
        // (tekstura głębi użyta wcześniej jako zwykła tekstura zostawała
        // w pamięci karty po wyjściu ze świata).

        shadowUniforms.uSunShadowMap.value = null;
        shadowUniforms.uModelShadowMap.value = null;
        shadowUniforms.uFarShadowMap.value = null;

        this.valid = false;
        this.farValid = false;
        this.farBuild = null;

        this.syncUniforms();

    }


    // Zmienił się mesh chunka (World.onMeshChanged) - jeśli jest
    // w zasięgu mapy, trzeba ją przerysować.

    markChunk(chunk) {

        if (this.valid && this.near.frustum.intersectsBox(chunkBox(this.box, chunk))) {
            this.changed = true;
        }

        if (this.farValid && this.far.frustum.intersectsBox(chunkBox(this.box, chunk))) {
            this.farChanged = true;
        }

    }


    // Co klatkę (po Sky.update): które światło rzuca cienie, jak mocno,
    // czy trzeba przerysować mapy. focus - miejsce gracza.

    update(dt, sky, focus) {

        this.sinceDraw += dt;
        this.sinceFar += dt;

        const state = sky.state;
        const celestial = sky.celestial;

        // Rzuca cienie mocniejsze z dwóch świateł - w dzień słońce,
        // w księżycową noc księżyc.

        const sun = state.sunLightIntensity >= state.moonLightIntensity;

        this.light = sun ? 'sun' : 'moon';

        this.direction.copy(sun ? celestial.sunDirection : celestial.moonDirection).normalize();

        // W kosmosie (nad światem) cieni nie ma.

        const spaceStrength = 1 - smoothstep(0.2, 0.6, sky.space);
        this.ambientStrength = smoothstep(FADE_LOW, FADE_HIGH, this.direction.y) * spaceStrength;

        // SolarAtmosphere osłabia energię źródła i wygasza tarczę na
        // horyzoncie. Mieszanie mapy cienia z dostępem do nieba także tutaj
        // wpuszczałoby bezpośrednie światło przez zasłaniające je bloki.
        // Osobne ambientStrength zachowuje płynne doświetlenie wnętrz.
        this.strength = sun && sky.atmosphere
            ? (this.direction.y > 0 && state.sunLightIntensity > 0 ? spaceStrength : 0)
            : this.ambientStrength;


        this.syncUniforms();


        if (!this.enabled || this.strength <= 0) {

            this.needsDraw = false;
            this.farNeeded = false;

            return false;

        }


        // Czy przerysować bliską mapę.

        const radius = this.radius;

        const moved =
            Math.hypot(focus.x - this.center.x, focus.z - this.center.z) > radius * MOVE_SHARE ||
            Math.abs(focus.y - this.center.y) > VERTICAL_RANGE * MOVE_SHARE;

        const turned =
            this.direction.dot(this.drawnDirection) < Math.cos(ANGLE_STEP) ||
            this.light !== this.drawnLight;

        this.needsDraw =
            !this.valid || moved || turned ||
            (this.changed && this.sinceDraw >= CHUNK_REDRAW_SECONDS);


        // Czy przerysować daleką mapę.

        if (this.hasFar) {

            const farMoved =
                Math.hypot(focus.x - this.farCenter.x, focus.z - this.farCenter.z) > FAR_MOVE ||
                Math.abs(focus.y - this.farCenter.y) > FAR_VERTICAL_RANGE * 0.25;

            const farTurned =
                this.direction.dot(this.farDirection) < Math.cos(FAR_ANGLE_STEP) ||
                this.light !== this.farLight;

            this.farNeeded =
                !this.farValid || farMoved || farTurned ||
                (this.farChanged && this.sinceFar >= FAR_CHUNK_REDRAW_SECONDS);

        }

        return this.needsDraw;

    }


    // Wartości dla shaderów (siła cieni dopiero z narysowaną mapą).

    syncUniforms() {

        const u = shadowUniforms;

        const strength = this.active ? this.strength : 0;

        u.uSunShadowLight.value = this.light === 'sun' ? 0 : 1;
        u.uSunShadowDir.value.copy(this.direction);
        u.uSunShadowInfo.value.y = strength;
        u.uSunShadowInfo.value.w = strength > 0 ? 1 : 0;
        u.uSunShadowAmbient.value = SHADOW_INDOOR_DARKNESS * (this.active ? this.ambientStrength : 0);
        u.uFarShadowInfo.value.z = this.hasFar && this.farValid && strength > 0 ? 1 : 0;

    }


    // Rysuje mapy cieni (przed światem, w Game.render).
    //   world        - World (chunki w world.shadowScene),
    //   focus        - miejsce gracza (oczy),
    //   model        - PlayerModel albo null (cień gracza),
    //   scene        - scena świata (z modelem gracza),
    //   loadedRadius - zasięg wczytanych chunków (bloki),
    //   farTerrain   - FarTerrain albo null (daleka mapa).

    render(world, focus, model, scene, loadedRadius, farTerrain = null) {

        if (!this.enabled || this.strength <= 0) {
            return;
        }

        const renderer = this.renderer;

        const previous = renderer.getRenderTarget();


        if (this.needsDraw) {

            this.center.copy(focus);
            this.drawnDirection.copy(this.direction);
            this.drawnLight = this.light;

            const near = this.near;

            near.place(focus, this.direction, loadedRadius + near.radius);

            // Tylko chunki w zasięgu kamery słońca.

            for (const caster of world.shadowScene.children) {
                caster.visible = near.frustum.intersectsBox(chunkBox(this.box, caster.userData.chunk));
            }

            renderer.setRenderTarget(this.target);
            renderer.clear();
            renderer.render(world.shadowScene, near.camera);

            const u = shadowUniforms;

            u.uSunShadowMatrix.value.copy(near.textureMatrix);
            u.uSunShadowInfo.value.x = near.depthScale;
            u.uSunShadowInfo.value.z = near.texel;
            u.uSunShadowMap.value = this.target.depthTexture;

            this.valid = true;
            this.changed = false;
            this.needsDraw = false;
            this.sinceDraw = 0;
            this.draws++;

            this.syncUniforms();

        }


        // Daleka mapa - kawałek na klatkę.

        if (this.hasFar && (this.farBuild || this.farNeeded)) {
            this.buildFar(world, focus, loadedRadius, farTerrain);
        }


        // Cień gracza - co klatkę (model ciągle się rusza).

        if (model) {
            this.renderModel(model, scene);
        }

        renderer.setRenderTarget(previous);

    }


    // Daleka mapa: pierwsza klatka - kamera i lista chunków, kolejne -
    // po paczce chunków do drugiej tekstury, ostatnia - daleki teren
    // i zamiana tekstur.

    buildFar(world, focus, loadedRadius, farTerrain) {

        const renderer = this.renderer;
        const far = this.far;

        if (!this.farBuild) {

            this.farCenter.copy(focus);
            this.farDirection.copy(this.direction);
            this.farLight = this.light;
            this.farChanged = false;
            this.sinceFar = 0;
            this.farNeeded = false;

            const terrainActive = farTerrain?.active === true;

            const reach = terrainActive ? farTerrain.outer + 64 : loadedRadius + FAR_RADIUS;

            far.place(focus, this.direction, reach);

            const casters = world.shadowScene.children.filter((caster) =>
                far.frustum.intersectsBox(chunkBox(this.box, caster.userData.chunk))
            );

            const perStep = Math.ceil(casters.length / FAR_BUILD_STEPS);

            this.farBuild = {
                step: 0,
                batches: Array.from({ length: FAR_BUILD_STEPS }, (_, i) => casters.slice(i * perStep, (i + 1) * perStep)),
                terrain: terrainActive ? farTerrain : null,
                center: new THREE.Vector2(focus.x, focus.z)
            };

        }


        const build = this.farBuild;

        renderer.setRenderTarget(this.farBackTarget);

        if (build.step === 0) {
            renderer.clear();
        }

        const batch = new Set(build.batches[build.step]);

        if (batch.size > 0) {

            for (const caster of world.shadowScene.children) {
                caster.visible = batch.has(caster);
            }

            renderer.render(world.shadowScene, far.camera);

        }

        build.step++;

        if (build.step < FAR_BUILD_STEPS) {
            return;
        }


        // Ostatnia paczka: daleki teren (góry za zasięgiem chunków).

        if (build.terrain) {

            const scene = build.terrain.scene;

            const material = farTerrainDepthMaterial.uniforms;

            material.uFarCenter.value.copy(build.center);
            material.uFarInner.value = build.terrain.inner;

            const override = scene.overrideMaterial;

            scene.overrideMaterial = farTerrainDepthMaterial;

            renderer.render(scene, far.camera);

            scene.overrideMaterial = override;

        }


        // Gotowe - zamiana tekstur.

        [this.farTarget, this.farBackTarget] = [this.farBackTarget, this.farTarget];

        const u = shadowUniforms;

        u.uFarShadowMatrix.value.copy(far.textureMatrix);
        u.uFarShadowInfo.value.x = far.depthScale;
        u.uFarShadowInfo.value.y = far.texel;
        u.uFarShadowMap.value = this.farTarget.depthTexture;

        this.farValid = true;
        this.farBuild = null;
        this.farDraws++;

        this.syncUniforms();

    }


    renderModel(model, scene) {

        const renderer = this.renderer;
        const camera = this.modelCamera;
        const object = model.object;

        object.updateMatrixWorld(true);

        const center = this.box.setFromObject(object).getCenter(this.modelCenter);

        camera.quaternion.copy(this.near.camera.quaternion);
        camera.position.copy(center).addScaledVector(this.direction, MODEL_MAP_DISTANCE);
        camera.updateMatrixWorld();

        this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

        shadowUniforms.uModelShadowMatrix.value.multiplyMatrices(TO_TEXTURE, this.matrix);


        // W widoku z oczu modelu nie widać, ale cień rzuca.

        const visible = object.visible;

        object.visible = true;

        object.traverse((child) => child.layers.enable(MODEL_LAYER));

        const override = scene.overrideMaterial;
        const autoUpdate = scene.matrixWorldAutoUpdate;

        scene.overrideMaterial = modelDepthMaterial;
        scene.matrixWorldAutoUpdate = false;

        renderer.setRenderTarget(this.modelTarget);
        renderer.clear();
        renderer.render(scene, camera);

        shadowUniforms.uModelShadowMap.value = this.modelTarget.depthTexture;

        scene.overrideMaterial = override;
        scene.matrixWorldAutoUpdate = autoUpdate;

        object.visible = visible;

    }

    // --------------------------------------------------------
    // Czy słońce dochodzi do punktu (dla modelu gracza, ręki,
    // osiągnięć, światła odbitego) - promień przez bloki w stronę
    // światła: 1 = pełne słońce, 0 = cień. Liście przepuszczają trochę.
    // --------------------------------------------------------

    static sunVisibility(world, x, y, z, direction, maxDistance = 96) {

        if (direction.y <= 0) {
            return 0;
        }

        let ix = Math.floor(x);
        let iy = Math.floor(y);
        let iz = Math.floor(z);

        const stepX = Math.sign(direction.x);
        const stepY = 1;
        const stepZ = Math.sign(direction.z);

        const deltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
        const deltaY = Math.abs(1 / direction.y);
        const deltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;

        let maxX = stepX > 0 ? (ix + 1 - x) * deltaX : stepX < 0 ? (x - ix) * deltaX : Infinity;
        let maxY = (iy + 1 - y) * deltaY;
        let maxZ = stepZ > 0 ? (iz + 1 - z) * deltaZ : stepZ < 0 ? (z - iz) * deltaZ : Infinity;

        let light = 1;

        let travelled = 0;

        while (travelled < maxDistance && iy < CHUNK_HEIGHT) {

            if (maxX < maxY && maxX < maxZ) {
                ix += stepX;
                travelled = maxX;
                maxX += deltaX;
            }
            else if (maxY < maxZ) {
                iy += stepY;
                travelled = maxY;
                maxY += deltaY;
            }
            else {
                iz += stepZ;
                travelled = maxZ;
                maxZ += deltaZ;
            }

            const id = world.getBlockId(ix, iy, iz);

            if (isLeavesId(id)) {

                light *= 0.55;

                if (light < 0.05) {
                    return 0;
                }

            }
            else if (isOpaqueId(id)) {
                return 0;
            }

        }

        return light;

    }


    dispose() {

        this.setQuality(0);

    }

}


// Pudełko chunka: od dołu świata do najwyższego bloku.

function chunkBox(box, chunk) {

    box.min.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    box.max.set(chunk.cx * CHUNK_SIZE + CHUNK_SIZE, Math.min(chunk.maxY, CHUNK_HEIGHT) + 2, chunk.cz * CHUNK_SIZE + CHUNK_SIZE);

    return box;

}
