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
// rozmytą kreską. Mapa ma dokładnie 16 punktów na blok.
//
// Z włączonymi cieniami światło słońca nie słabnie razem ze światłem
// nieba z chunków - liczy się tylko to, czy promień słońca dochodzi.
// Dlatego przez okno do ciemnego pokoju wpada jasna plama słońca,
// a pod drzewem jest wyraźny cień.
//
// Mapa nie jest rysowana co klatkę - tylko gdy słońce przesunie się
// o kawałek, gracz odejdzie dalej od środka mapy albo zmienią się
// chunki w jej zasięgu. Model gracza ma własną, małą mapę rysowaną
// co klatkę (gracz rzuca cień, nawet w widoku z oczu).
//
// Liczby: SHADOW_QUALITY niżej, ustawienie "Cienie słońca".
// Opis: docs/niebo-i-swiatlo.md.
// ------------------------------------------------------------

// Jakość: rozmiar mapy (piksele) i zasięg cieni od gracza (bloki).
// Mapa ma zawsze 16 pikseli na blok, czyli tyle, ile tekstura bloku.

export const SHADOW_QUALITY = {
    1: { size: 1024, radius: 32 },
    2: { size: 2048, radius: 64 }
};

// Słońce tuż nad horyzontem prawie nie świeci, a jego promienie idą
// niemal poziomo - cienie pojawiają się (i znikają) płynnie, gdy jest
// między tymi wysokościami (y kierunku: 0 = horyzont, 1 = zenit).

const FADE_LOW = 0.015;
const FADE_HIGH = 0.09;

// Przy niskim słońcu mapa obejmuje bloki od tylu bloków pod do tylu
// nad graczem (dzięki temu jest gęstsza wzdłuż promieni). Wyżej
// i niżej cienie płynnie znikają.

const VERTICAL_RANGE = 32;

// Kiedy przerysować mapę: słońce przesunęło się o tyle (radiany),
// gracz odszedł od środka mapy o taką część zasięgu, zmienił się
// chunk w zasięgu (najwyżej co tyle sekund).

const ANGLE_STEP = 0.0018;
const MOVE_SHARE = 0.25;
const CHUNK_REDRAW_SECONDS = 0.1;

// Cień gracza (mała mapa wokół modelu, rysowana co klatkę).

const MODEL_MAP_SIZE = 256;
const MODEL_MAP_RADIUS = 1.6;

// Kamera cienia gracza stoi tyle bloków od niego (w stronę słońca)
// i widzi do MODEL_MAP_FAR - dalej cień gracza już nie sięga.

const MODEL_MAP_DISTANCE = 8;
const MODEL_MAP_FAR = 72;

// ------------------------------------------------------------
// Wspólne wartości dla shaderów bloków i modeli.
// ------------------------------------------------------------

export const shadowUniforms = {

    // Mapa cieni (głębia widziana od słońca) i przejście świat -> mapa.
    uSunShadowMap: { value: null },
    uSunShadowMatrix: { value: new THREE.Matrix4() },

    // x - 1 / zakres głębi (bloki -> jednostki mapy),
    // y - siła cieni 0-1 (słońce przy horyzoncie - słabnie),
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
    uSunShadowAmbient: { value: 0 }

};


// GLSL: sunShadowLight(pozycja, normalna, światło nieba) - ile światła
// słońca (0-1) dostaje piksel ściany. Poza zasięgiem mapy - tyle, co
// światła nieba (jak bez cieni). Wymaga define USE_SUN_SHADOWS.

export const SHADOW_GLSL = `
#ifdef USE_SUN_SHADOWS

    uniform highp sampler2D uSunShadowMap;
    uniform mat4 uSunShadowMatrix;
    uniform vec4 uSunShadowInfo;
    uniform vec3 uSunShadowDir;
    uniform int uSunShadowLight;
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

        vec3 s = (uSunShadowMatrix * vec4(p, 1.0)).xyz;

        vec2 fromCenter = abs(s.xy - 0.5) * 2.0;

        float edge = max(fromCenter.x, fromCenter.y);

        if (edge >= 1.0 || s.z <= 0.0 || s.z >= 1.0) {
            return skyLight;
        }

        // Przy brzegu mapy cienie płynnie znikają.

        float coverage = (1.0 - smoothstep(0.85, 1.0, edge)) * uSunShadowInfo.y;

        // Ściana ukośnie do promieni potrzebuje większego zapasu
        // (inaczej cieniowałaby sama siebie w paski).

        float facing = clamp(dot(worldNormal, uSunShadowDir), 0.05, 1.0);

        float slope = min(sqrt(1.0 - facing * facing) / facing, 8.0);

        float bias = uSunShadowInfo.z * (0.35 + 0.6 * slope) * uSunShadowInfo.x;

        float lit = step(s.z - bias, texture(uSunShadowMap, s.xy).r);

        // Cień gracza (model) - osobna mała mapa.

        if (uSunShadowInfo.w > 0.5 && lit > 0.5) {

            vec3 m = (uModelShadowMatrix * vec4(p, 1.0)).xyz;

            if (all(greaterThan(m, vec3(0.0))) && all(lessThan(m, vec3(1.0)))) {
                lit = step(m.z - ${(0.06 / MODEL_MAP_FAR).toFixed(6)}, texture(uModelShadowMap, m.xy).r);
            }

        }

        return mix(skyLight, lit, coverage);

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
        );

    return chunk;

}

// ------------------------------------------------------------
// Materiały do rysowania mapy cieni (tylko głębia).
//
// Kolejność jak grupy geometrii chunka (ChunkMesher.js, World.js):
//   0 - zwykłe bloki (pełne),
//   1 - rośliny (nie rzucają cienia - kołyszą się na wietrze),
//   2 - woda (nie rzuca cienia - widać pod nią dno),
//   3 - liście i płaskie dekoracje (przezroczyste piksele przepuszczają
//       światło - pod drzewem są plamki słońca).
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
    hiddenMaterial,
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

// ------------------------------------------------------------

export class SunShadows {

    constructor(renderer) {

        this.renderer = renderer;

        // Cienie potrzebują WebGL2 (tekstury głębi, pozycja w świecie
        // w shaderze bloków).

        this.supported = renderer.capabilities.isWebGL2;

        // 0 = wyłączone, 1 / 2 - SHADOW_QUALITY.
        this.quality = 0;

        this.target = null;
        this.modelTarget = null;

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
        this.modelCamera = new THREE.OrthographicCamera(
            -MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, -MODEL_MAP_RADIUS, 0.1, MODEL_MAP_FAR
        );

        this.modelCamera.layers.set(MODEL_LAYER);

        this.modelScene = null;

        // Światło, które teraz rzuca cienie.
        //   direction - kierunek DO światła,
        //   light     - 'sun' albo 'moon',
        //   strength  - siła cieni 0-1 (przy horyzoncie słabnie).

        this.direction = new THREE.Vector3(0, 1, 0);
        this.light = 'sun';
        this.strength = 0;

        // Stan mapy: kierunek i środek z ostatniego rysowania.

        this.drawnDirection = new THREE.Vector3();
        this.drawnLight = null;
        this.center = new THREE.Vector3();
        this.valid = false;
        this.changed = false;
        this.sinceDraw = 0;

        // Licznik przerysowań (debug, /cienie).
        this.draws = 0;

        this.frustum = new THREE.Frustum();
        this.box = new THREE.Box3();
        this.matrix = new THREE.Matrix4();

        this.up = new THREE.Vector3();
        this.right = new THREE.Vector3();
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


    get radius() {

        return SHADOW_QUALITY[this.quality]?.radius ?? 0;

    }


    get size() {

        return SHADOW_QUALITY[this.quality]?.size ?? 0;

    }


    // quality: 0 (wyłączone), 1, 2.

    setQuality(quality) {

        const wanted = this.supported && SHADOW_QUALITY[quality] ? quality : 0;

        if (wanted === this.quality) {
            return;
        }

        this.quality = wanted;

        this.target?.dispose();
        this.target?.depthTexture?.dispose();
        this.target = null;

        this.modelTarget?.dispose();
        this.modelTarget?.depthTexture?.dispose();
        this.modelTarget = null;

        if (wanted > 0) {

            this.target = createTarget(this.size);
            this.modelTarget = createTarget(MODEL_MAP_SIZE);

        }

        // Mapy trafiają do shaderów dopiero po pierwszym narysowaniu
        // (tekstura głębi użyta wcześniej jako zwykła tekstura zostawała
        // w pamięci karty po wyjściu ze świata).

        shadowUniforms.uSunShadowMap.value = null;
        shadowUniforms.uModelShadowMap.value = null;

        this.valid = false;

    }


    // Zmienił się mesh chunka (World.onMeshChanged) - jeśli jest
    // w zasięgu mapy, trzeba ją przerysować.

    markChunk(chunk) {

        if (!this.valid) {
            return;
        }

        if (this.frustum.intersectsBox(chunkBox(this.box, chunk))) {
            this.changed = true;
        }

    }


    // Co klatkę (po Sky.update): które światło rzuca cienie, jak mocno,
    // czy trzeba przerysować mapę. focus - miejsce gracza.

    update(dt, sky, focus) {

        this.sinceDraw += dt;

        const state = sky.state;
        const celestial = sky.celestial;

        // Rzuca cienie mocniejsze z dwóch świateł - w dzień słońce,
        // w księżycową noc księżyc.

        const sun = state.sunLightIntensity >= state.moonLightIntensity;

        this.light = sun ? 'sun' : 'moon';

        this.direction.copy(sun ? celestial.sunDirection : celestial.moonDirection).normalize();

        // W kosmosie (nad światem) cieni nie ma.

        this.strength = smoothstep(FADE_LOW, FADE_HIGH, this.direction.y) * (1 - smoothstep(0.2, 0.6, sky.space));


        this.syncUniforms();


        if (!this.enabled || this.strength <= 0) {
            return false;
        }


        // Czy przerysować mapę.

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
        u.uSunShadowAmbient.value = SHADOW_INDOOR_DARKNESS * strength;

    }


    // Ustawia kamerę słońca: patrzy z kierunku światła na focus,
    // przesunięta tak, żeby piksele mapy stały w miejscu (bez migotania
    // brzegów cieni, gdy gracz chodzi).

    placeCamera(focus, loadedRadius) {

        const camera = this.camera;
        const direction = this.direction;
        const radius = this.radius;

        // "Do góry" kamery: pion świata (przy słońcu w zenicie - północ).

        this.up.set(0, 1, 0);

        if (Math.abs(direction.y) > 0.995) {
            this.up.set(0, 0, -1);
        }

        // Wzdłuż promieni (przy niskim słońcu) mapa nie musi być tak
        // wysoka - teren wokół gracza jest płaski względem promieni.

        const height = Math.min(
            radius,
            radius * Math.abs(direction.y) + VERTICAL_RANGE * Math.sqrt(Math.max(0, 1 - direction.y * direction.y)) + 4
        );

        // Kamera nad najwyższymi blokami (z zapasem), ale nie dalej niż
        // wczytany teren (dalej i tak nic nie rzuca cienia).

        const above = (CHUNK_HEIGHT + 8 - (focus.y - VERTICAL_RANGE)) / Math.max(0.05, direction.y);

        const distance = Math.max(radius + 16, Math.min(above, loadedRadius + radius));

        camera.left = -radius;
        camera.right = radius;
        camera.top = height;
        camera.bottom = -height;
        camera.near = 1;
        camera.far = distance + radius * 2 + VERTICAL_RANGE * 2 + 64;

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

        shadowUniforms.uSunShadowMatrix.value.multiplyMatrices(TO_TEXTURE, this.matrix);

        shadowUniforms.uSunShadowInfo.value.x = 1 / (camera.far - camera.near);
        shadowUniforms.uSunShadowInfo.value.z = texelX;

    }


    // Rysuje mapy cieni (przed światem, w Game.render).
    //   world - World (chunki w world.shadowScene),
    //   model - PlayerModel albo null (cień gracza),
    //   scene - scena świata (z modelem gracza).

    render(world, focus, model, scene, loadedRadius) {

        if (!this.enabled || this.strength <= 0) {
            return;
        }

        const renderer = this.renderer;

        const previous = renderer.getRenderTarget();


        if (this.needsDraw) {

            this.center.copy(focus);
            this.drawnDirection.copy(this.direction);
            this.drawnLight = this.light;

            this.placeCamera(focus, loadedRadius);

            // Tylko chunki w zasięgu kamery słońca.

            for (const caster of world.shadowScene.children) {
                caster.visible = this.frustum.intersectsBox(chunkBox(this.box, caster.userData.chunk));
            }

            renderer.setRenderTarget(this.target);
            renderer.clear();
            renderer.render(world.shadowScene, this.camera);

            this.valid = true;

            shadowUniforms.uSunShadowMap.value = this.target.depthTexture;
            this.changed = false;
            this.needsDraw = false;
            this.sinceDraw = 0;
            this.draws++;

            this.syncUniforms();

        }


        // Cień gracza - co klatkę (model ciągle się rusza).

        if (model) {
            this.renderModel(model, scene);
        }

        renderer.setRenderTarget(previous);

    }


    renderModel(model, scene) {

        const renderer = this.renderer;
        const camera = this.modelCamera;
        const object = model.object;

        object.updateMatrixWorld(true);

        const center = this.box.setFromObject(object).getCenter(this.modelCenter);

        camera.quaternion.copy(this.camera.quaternion);
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
    // osiągnięć) - promień przez bloki w stronę światła:
    // 1 = pełne słońce, 0 = cień. Liście przepuszczają trochę.
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
