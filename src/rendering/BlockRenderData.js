import * as THREE from 'three';
import { campfireLightUniforms, CAMPFIRE_LIGHT_GLSL } from './CampfireLight.js';
import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { installLightingDiagnostics } from './LightingDiagnostics.js';
import { plantWindUniforms, PLANT_WIND_GLSL } from './PlantWind.js';
import { WATER_WAVE_GLSL } from './WaterWave.js';
import { getSurfaceFaceTexture } from './SurfaceMaterials.js';
import { blockSurfaceProfile } from './SurfaceProfiles.js';
import { installSurfaceProfiles } from './LeafLighting.js';
import { CANOPY_LIGHTING_GLSL } from './CanopyLighting.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { WATERFALL_PIXEL_GLSL, WATERFALL_AVERAGE_GLSL, waterfallColorUniforms } from './WaterfallPixels.js';
import { PINE_TRANSITION_TEXTURES, MOSS_CARPET_TEXTURES } from './SurfaceTextureVariants.js';


import {
    BLOCK_TYPES,
    MAX_BLOCK_ID,
    ATTACH_DOWN,
    ATTACH_NORTH,
    ATTACH_SOUTH,
    ATTACH_EAST,
    ATTACH_WEST,
    getAttach
} from '../blocks/BlockRegistry.js';


import {
    blockAtlasTexture,
    atlasReady,
    getAtlasUV,
    ATLAS_TILES,
    ATLAS_COLUMNS,
    ATLAS_ROWS,
    atlasAveragesReady,
    getAtlasAverage
} from './TextureAtlas.js';


import {
    RIVER_TEXTURE,
    WATER_OPACITY,
    WATER_OPACITY_GRAZING
} from '../config.js';


import {
    skyUniforms,
    SKY_COLOR_GLSL,
    AERIAL_SKY_GLSL
} from '../sky/skyShader.js';


import {
    dynamicLightUniforms
} from '../world/DynamicLight.js';


import {
    viewUniforms,
    VIEW_GLSL,
    CHUNK_MASK_GLSL,
    chunkMaskUniforms
} from './viewUniforms.js';


import {
    meteorLightUniforms,
    METEOR_LIGHT_GLSL
} from './meteorLight.js';


import {
    shadowUniforms,
    SHADOW_GLSL,
    shadowLightsChunk,
    setShadowFastLeaves
} from './Shadows.js';


import {
    bounceUniforms,
    BOUNCE_GLSL
} from '../world/BounceLight.js';

// ------------------------------------------------------------
// Jeden wspólny materiał dla wszystkich bloków (atlas tekstur).
//
// vertexColors: każdy róg ściany ma "kolor" z poziomem światła
// (liczy go ChunkMesher.js):
//   r, g, b - światło lamp (w kolorze lamp),
//   a       - światło nieba.
// Światło nieba przechodzi przez zwykłe oświetlenie sceny
// (słońce + otoczenie), a światło lamp świeci niezależnie od
// słońca. Liczy się jaśniejsze z nich - jak w Minecrafcie, w dzień
// pod gołym niebem lampa niczego nie rozjaśnia.
// ------------------------------------------------------------

export const blockMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture,

        vertexColors: true

    });

// ------------------------------------------------------------
// Poprawka na kolorowe kreski i kropki w oddali.
//
// Przy włączonym wygładzaniu krawędzi (antialias) karta graficzna
// na samym brzegu ściany potrafi policzyć pozycję w teksturze
// odrobinę POZA tą ścianą. W atlasie oznacza to trafienie w
// sąsiedni kafelek, czyli np. brązowe kropki na trawie.
//
// Słowo "centroid" każe liczyć tę pozycję zawsze wewnątrz ściany.
// Działa tylko w WebGL2 (czyli w każdej współczesnej przeglądarce).
// ------------------------------------------------------------

blockMaterial.defaultAttributeValues = { ...blockMaterial.defaultAttributeValues, surfaceProfile: [0, 0], canopyTint: [1, 1, 1] };
blockMaterial.onBeforeCompile = (shader, renderer) => {
    installSurfaceProfiles(shader);
    // Only terrain materials use this path. Hands and inventory have their
    // own ModelMaterial, so global view distance never fades held objects.
    Object.assign(shader.uniforms, chunkMaskUniforms);
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CHUNK_MASK_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            if (uDistanceLodEnabled > 0.5 &&
                distanceLodNoise() >= effectiveNearLodWeight(vSkyDirection.xz + cameraPosition.xz)) discard;`);

    // Światło w rogach to jasność "na oko" (0.5 = wygląda na w pół
    // ciemniej), a karta liczy światło liniowo - stąd pow(..., 2.2).
    // Bez tego półcień wyglądałby prawie jak pełne światło.

    // Światło nieba: przyciemnia teksturę przed oświetleniem sceny.

    // Z dalekiego terenem: im bliżej końca zasięgu widzenia, tym
    // bardziej tekstura zlewa się w swój średni kolor - na końcu
    // zasięgu bloki wyglądają tak jak daleki teren za nimi.

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <color_fragment>',
            `if (uFarEnabled > 0.5 && uFarTextureBlend > 0.0) {
                float farBlur = smoothstep(uFarInner * 0.65, uFarInner, length(vSkyDirection.xz)) * uFarTextureBlend;
                diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uAtlasAverage, vMapUv).rgb, farBlur);
            }
            // Kolor trawy z klimatu (ChunkMesher - atrybut tint): tylko
            // zielone piksele (źdźbła), ziemia i kwiaty bez zmian.

            float tintMask = smoothstep(0.01, 0.07, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
            diffuseColor.rgb *= mix(vec3(1.0), vTint.rgb, mix(tintMask, 1.0, vTint.a));

            vec3 blockTexel = diffuseColor.rgb;
            float blockSky = surfaceDecodeLight(vColor.a);
            float blockAmbient = blockSky;
            vec3 blockBounce = vec3(0.0);
            #ifdef USE_SUN_SHADOWS

                // Z cieniami słońca (Shadows.js) światło nieba przyciemnia
                // tylko światło otoczenia, a światło słońca zależy od tego,
                // czy jego promień tu dochodzi (lights_fragment_begin niżej).

                blockAmbient = pow(vColor.a, 2.2 + uSunShadowAmbient);
                float blockSun = sunShadowLight(vWorldPosition, vWorldNormal, blockSky);

            #elif defined( USE_COLOR_ALPHA )
                diffuseColor.rgb *= mix(blockSky, 1.0, uAtmosphericLight);
            #endif
            blockAmbient = mix(blockAmbient, blockSky * surfaceDecodeLight(vSurfaceOcclusion), uAtmosphericLight);`
        );


    // Światło lamp: na końcu, jaśniejsze z dwóch świateł,
    // potem dynamiczne światło (lampa w ręce...) i suwak jasności.

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `#ifdef USE_DYNAMIC_LIGHT

                // The bounce solver has its own source visibility; disabling
                // directional shadow maps must not disable terrain bounce.

                blockBounce = bounceLight(vWorldPosition, vWorldNormal, blockSky);
                blockBounce *= mix(1.0, surfaceDecodeLight(vSurfaceOcclusion), uAtmosphericLight);

            #endif

            vec3 blockLocal = vec3(0.0);
            #ifdef USE_COLOR_ALPHA

                // Nocą to, co oświetla niebo, traci kolory (srebrna,
                // księżycowa noc). Światło lamp dochodzi dopiero potem,
                // więc zostaje kolorowe.

                blockLocal = surfaceDecodeLight(vColor.rgb);

            #endif

            #ifdef USE_DYNAMIC_LIGHT

                // Dynamiczne światło (lampa w ręce, meteoryt...): kolor
                // z tekstury 3D wokół gracza, w komórce przed ścianą.
                // Ściany cieniujemy tak jak przy zwykłych lampach.

                if (uDynamicEnabled > 0.5) {

                    vec3 cell = (vWorldPosition + vWorldNormal * 0.5 - uDynamicOrigin) / uDynamicSize;

                    if (all(greaterThanEqual(cell, vec3(0.0))) && all(lessThanEqual(cell, vec3(1.0)))) {

                        // W teksturze kolejne osie to x, z, y (tak są
                        // ułożone dane w DynamicLight.js).

                        vec3 dynamicLight = texture(uDynamicLight, cell.xzy).rgb * surfaceFaceShade(vWorldNormal);
                        dynamicLight *= mix(1.0, vSurfaceOcclusion, uAtmosphericLight);
                        blockLocal = max(blockLocal, surfaceDecodeLight(dynamicLight));

                    }

                }

            #endif

            outgoingLight = surfaceRadiance(blockTexel, outgoingLight, blockLocal, blockBounce,
                vec3(vSurfaceEmission * uAtmosphericLight), uNightDesaturation, uNightTint, uAtmosphericLight);

            #ifdef USE_DYNAMIC_LIGHT
                outgoingLight += surfaceLocalRadiance(blockTexel, meteorLight(vWorldPosition, vWorldNormal) + campfireLight(vWorldPosition, vWorldNormal));
            #endif

            // Ustawienie "Jasność" (viewUniforms.js).

            outgoingLight = applyBrightness(outgoingLight, blockTexel);

            #include <opaque_fragment>`
        );


    // Mgła w kolorze nieba w kierunku, w którym patrzymy na blok
    // (ta sama funkcja co kopuła nieba), więc daleki teren znika
    // dokładnie w kolorze nieba za nim. W tunelu mgła ciemnieje
    // (uFogBrightness).

    Object.assign(shader.uniforms, skyUniforms, viewUniforms);

    // W trybie ziemniaka (define POTATO) kolor nieba dla mgły liczy
    // się tylko w rogach ścian, a nie w każdym pikselu.

    shader.vertexShader =
        shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vSkyDirection;
                attribute vec4 tint;
                attribute vec4 atmosphereLight;
                attribute vec3 canopyTint;
                varying vec3 vCanopyTint;
                attribute float surfaceOcclusion;
                attribute float surfaceEmission;
                uniform float uAtmosphericLight;
                varying vec4 vTint;
                varying float vSurfaceOcclusion;
                varying float vSurfaceEmission;

                #ifdef POTATO
                    varying vec3 vFogSky;
                    uniform float uFogBrightness;
                    uniform float uAerialPerspective;
                    ${SKY_COLOR_GLSL}
                    ${AERIAL_SKY_GLSL}
                #endif`
            )
            .replace(
                '#include <color_vertex>',
                `#include <color_vertex>
                #ifdef USE_COLOR_ALPHA
                    vColor = mix(vColor, atmosphereLight, uAtmosphericLight);
                #endif
                vSurfaceOcclusion = surfaceOcclusion;
                vCanopyTint = canopyTint;
                vSurfaceEmission = surfaceEmission;`
            )
            .replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>
                vSkyDirection = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;

                // a = 1 (też bez atrybutu - inne siatki) - bez zmiany koloru.
                // a=0: biome tint on green texels; a=128/255: complete
                // linear albedo tint for generated plant models; a=1: none.
                vTint = tint.a < 0.5 ? vec4(tint.rgb * 2.0, 0.0)
                    : tint.a < 0.75 ? vec4(tint.rgb, 1.0) : vec4(1.0, 1.0, 1.0, 0.0);

                #ifdef POTATO
                    vFogSky = atmosphereFogColor(vSkyDirection, uAerialPerspective, uFogBrightness);
                #endif`
            );

    shader.fragmentShader =
        shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vSkyDirection;
                varying vec4 vTint;
                varying vec3 vCanopyTint;
                varying float vSurfaceOcclusion;
                varying float vSurfaceEmission;
                uniform float uFogBrightness;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                uniform sampler2D uAtlasAverage;
                ${SKY_COLOR_GLSL}
                ${AERIAL_SKY_GLSL}
                ${VIEW_GLSL}
                ${SURFACE_LIGHTING_GLSL}
                ${CANOPY_LIGHTING_GLSL}

                #ifdef POTATO
                    varying vec3 vFogSky;
                    #define FOG_SKY vFogSky
                #else
                    #define FOG_SKY atmosphereFogColor(vSkyDirection, uAerialPerspective, uFogBrightness)
                #endif`
            )
            .replace(
                '#include <fog_fragment>',
                `#ifdef USE_FOG
                    if (uUnderwater > 0.5) {

                        // Pod wodą: gęsta, niebieska mgła (Game.updateWater).

                        float waterFog = 1.0 - exp(-length(vSkyDirection) * uUnderwaterDensity);
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(uUnderwaterColor, 1.0)).rgb, waterFog);

                    }
                    else {

                        // Jeden wspólny callsite atmosfery także w dużym
                        // shaderze wody. ANGLE rozwija te funkcje inline.
                        float legacyFog = uFarEnabled > 0.5 ? farHaze(vSkyDirection)
                            : smoothstep(fogNear, fogFar, vFogDepth);
                        float fogFactor = atmosphereHaze(vSkyDirection, blockSky, legacyFog);
                        if (fogFactor > 0.0) {
                            vec3 fogSky = FOG_SKY;
                            gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(fogSky, 1.0)).rgb, fogFactor);
                        }

                    }
                #endif`
            );


    // Only diffuse skylight receives the overhead foliage filter. Sun/moon
    // shadow visibility, local colored lamps and emission retain their colors.
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #if defined(RE_IndirectDiffuse)
            irradiance *= canopySkyTint(vCanopyTint);
        #endif
        #include <lights_fragment_end>`);

    if (!renderer.capabilities.isWebGL2) {
        // Bez map cieni dostęp do nieba nadal tłumi światło naturalne.
        // AO działa tylko na otoczenie, tak jak w ścieżce WebGL2.
        shader.uniforms.uSunShadowLight = shadowUniforms.uSunShadowLight;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform int uSunShadowLight;')
            .replace('#include <lights_fragment_begin>',
                shadowLightsChunk('blockSky', 'blockSky', 'blockAmbient', 'uAtmosphericLight > 0.5'));
        installLightingDiagnostics(shader, { albedo: 'blockTexel', sky: 'blockSky',
            ao: 'surfaceDecodeLight(vSurfaceOcclusion)', visibility: 'blockSky' });
        return;
    }


    // Dynamiczne światło potrzebuje tekstur 3D (WebGL2), cienie słońca -
    // tekstury głębi (też WebGL2).

    Object.assign(shader.uniforms, dynamicLightUniforms, meteorLightUniforms, shadowUniforms, bounceUniforms, campfireLightUniforms);

    shader.vertexShader =
        shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;`
            )
            .replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>
                vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vWorldNormal = objectNormal;`
            );

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <common>',
            `#define USE_DYNAMIC_LIGHT
            #include <common>
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            uniform highp sampler3D uDynamicLight;
            uniform vec3 uDynamicOrigin;
            uniform float uDynamicSize;
            uniform float uDynamicEnabled;
            ${METEOR_LIGHT_GLSL}
            ${CAMPFIRE_LIGHT_GLSL}
            ${SHADOW_GLSL}

            #ifndef USE_SUN_SHADOWS
                uniform int uSunShadowLight;
            #endif

            ${BOUNCE_GLSL}`
        );


    // Cienie słońca: światło, które rzuca cienie, dochodzi tylko tam,
    // gdzie nic go nie zasłania (blockSun), reszta - jak dotąd.

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            `#ifdef USE_SUN_SHADOWS
                ${shadowLightsChunk('blockSun', 'blockSky', 'blockAmbient')}
            #else
                ${shadowLightsChunk('blockSky', 'blockSky', 'blockAmbient', 'uAtmosphericLight > 0.5')}
            #endif`
        );


    const before = 'varying vec2 vMapUv;';
    const after = 'centroid varying vec2 vMapUv;';


    shader.vertexShader =
        shader.vertexShader.replace(
            '#include <uv_pars_vertex>',
            THREE.ShaderChunk.uv_pars_vertex.replace(before, after)
        );

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <uv_pars_fragment>',
            THREE.ShaderChunk.uv_pars_fragment.replace(before, after)
        );

    installLightingDiagnostics(shader, { albedo: 'blockTexel', normal: 'vWorldNormal', sky: 'blockSky',
        ao: 'surfaceDecodeLight(vSurfaceOcclusion)', visibility: '\n#ifdef USE_SUN_SHADOWS\nblockSun\n#else\nblockSky\n#endif\n' });

};

// ------------------------------------------------------------
// MATERIAŁ ROŚLIN
//
// Ten sam shader co bloki, a do tego:
//   - przezroczyste piksele tekstury są pomijane (alphaTest),
//   - góra rośliny kołysze się na wietrze (uTime z viewUniforms).
// Rośliny są w osobnej grupie geometrii chunka (ChunkMesher.js),
// więc zwykłe bloki nie płacą za przezroczystość.
// ------------------------------------------------------------

export const plantMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture,

        vertexColors: true,

        alphaTest: 0.5

    });


// Held items or small previews without animation data remain stationary.
plantMaterial.defaultAttributeValues = { color: [1, 1, 1], uv: [0, 0], uv1: [0, 0], plantMotion: [0, 0], surfaceProfile: [0, 0], canopyTint: [1, 1, 1] };

plantMaterial.onBeforeCompile = (shader, renderer) => {

    blockMaterial.onBeforeCompile(shader, renderer);
    Object.assign(shader.uniforms, plantWindUniforms);

    // Roślina kołysze się, a mapa cieni nie - większy zapas, żeby
    // źdźbła nie cieniowały same siebie w paski (Shadows.js).

    shader.fragmentShader = `#define SUN_SHADOW_RECEIVER_BIAS (uPlantShadowInfo.w > 0.5 ? 0.03 : 0.3)\n${shader.fragmentShader}`;


    // Explicit motion weights keep roots anchored and let underwater plants
    // move gently. Floating leaves follow the same waves as the water surface.

    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform float uWaveHeight;
            attribute vec2 plantMotion;
            ${PLANT_WIND_GLSL}`
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>

            vec3 plantWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
            transformed += plantWindOffset(plantWorld, plantMotion, uTime, uWaveHeight);`
        );

};

// ------------------------------------------------------------
// MATERIAŁ LIŚCI (i płaskich dekoracji - opadłe liście, wieniec)
//
// Ten sam shader co bloki, a przezroczyste piksele tekstury są
// pomijane (prześwity w liściach). Zwykłe liście (sześciany) stoją -
// kołysząc się rozjechałyby się na szwach; liście z 8 części kołyszą się
// każda część osobno (niżej). Osobna grupa geometrii
// chunka (ChunkMesher.js), żeby zwykłe bloki nie płaciły za
// przezroczystość.
// ------------------------------------------------------------

export const leafMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture,

        vertexColors: true,

        alphaTest: 0.5

    });


leafMaterial.defaultAttributeValues = { ...leafMaterial.defaultAttributeValues, surfaceProfile: [0, 0], plantMotion: [0, 0], canopyTint: [1, 1, 1] };
leafMaterial.onBeforeCompile = (shader, renderer) => {

    // Szybkie liście (define FAST_LEAVES, bez alphaTest): prześwity
    // zamalowane ciemnym kolorem liści - jak cień w głębi korony.

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#ifdef FAST_LEAVES
                if (diffuseColor.a < 0.5) {
                    diffuseColor.rgb = texture2D(uAtlasAverage, vMapUv).rgb * 0.38;
                }
                diffuseColor.a = 1.0;
            #endif
            #include <color_fragment>`
        );

    blockMaterial.onBeforeCompile(shader, renderer);

    // Liście z 8 części (ChunkMesher.addLeafParts): każda część kołysze
    // się lekko w całości - plantMotion.x - siła, y - faza (zwykłe liście:
    // 0, stoją). Kołysanie na wietrze wył. (uPlantSway) - stoją wszystkie.

    shader.uniforms.uTime = plantWindUniforms.uTime;
    shader.uniforms.uPlantSway = plantWindUniforms.uPlantSway;

    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform float uPlantSway;
            attribute vec2 plantMotion;`
        )
        .replace(
            '#include <project_vertex>',
            `if (plantMotion.x > 0.0) {
                float leafPhase = plantMotion.y * 6.2831853;
                float leafGust = 0.75 + 0.25 * sin(uTime * 0.37 + leafPhase * 0.5);
                transformed += vec3(
                    sin(uTime * 1.3 + leafPhase),
                    0.45 * sin(uTime * 1.9 + leafPhase * 1.7),
                    cos(uTime * 1.05 + leafPhase * 1.3)
                ) * plantMotion.x * leafGust * 0.022 * uPlantSway;
            }
            #include <project_vertex>`
        );

};


// Przełącza szybkie liście w materiale (ChunkMesher.setFastLeaves -
// osobno, w meshach).

export function setLeafMaterialFast(on) {

    leafMaterial.defines = leafMaterial.defines ?? {};

    if (('FAST_LEAVES' in leafMaterial.defines) === on) {
        return;
    }

    if (on) {
        leafMaterial.defines.FAST_LEAVES = '';
    }
    else {
        delete leafMaterial.defines.FAST_LEAVES;
    }

    leafMaterial.alphaTest = on ? 0 : 0.5;

    leafMaterial.needsUpdate = true;

    // Mapa cieni: szybkie liście rzucają pełny cień.

    setShadowFastLeaves(on);

}

// ------------------------------------------------------------
// MATERIAŁ WODY
//
// Ten sam shader co bloki, a do tego:
//   - woda jest półprzezroczysta - patrząc z góry widać dno, z boku
//     (pod małym kątem) jest gęstsza, jak prawdziwa woda,
//   - tekstura wody powoli płynie: dwie warstwy w różne strony,
//     piksele zostają ostre,
//   - powierzchnia faluje również na pochyłych, płytkich strumieniach,
//   - widać ją z obu stron (spod wody też).
// Woda jest w osobnej grupie geometrii chunka (ChunkMesher.js),
// rysowanej po wszystkim, co nieprzezroczyste.
// Liczby: WATER_... w config.js.
// ------------------------------------------------------------

const waterTile = ATLAS_TILES.water;

// Nurt rzeki w UV ściany wody (ChunkMesher.js): środek kafelka wody
// przesunięty o nurt / 3.97 bloku/s razy WATER_FLOW_UV rozmiaru kafelka.
export const WATER_FLOW_UV = 0.35;

// Bok spadającej wody (0.73.0): zamiast nurtu UV niesie spadek (u: 1/16
// na blok spadku) i znacznik WATER_FALL_MARK (v poza kafelkiem). Od 0.87.0
// shader rysuje z tego pikselowe smugi i pianę (WaterfallPixels.js).
export const WATER_FALL_MARK = 2;

// Woda z bliska jest półprzezroczysta (widać przez nią ciemne dno), więc
// wydaje się trochę jaśniejsza i mniej niebieska niż sama tekstura -
// daleka (nieprzezroczysta) woda dostaje taki odcień: mnożnik koloru
// tekstury, bez szwu na granicy zasięgu widzenia. Tak samo bliska woda
// tam, gdzie pod nią nie ma już narysowanego dna (waterMaterial).
export const FAR_WATER_TINT_RGB = [2.2, 1.13, 0.75];

// Nieprzezroczysta bliska woda (bez dna pod spodem) jest oświetlona
// jak powierzchnia, a nie jak dno widziane przez wodę - trochę ciemniej,
// żeby wyglądała jak daleka woda za nią.
const WATER_EDGE_SHADE = 0.82;

const glslVec3 = (v) => `vec3(${v.map((x) => x.toFixed(3)).join(', ')})`;

export const waterUniforms = {

    // Jak wysoko faluje powierzchnia (bloki; 0 = płaska) - /woda fale.
    uWaveHeight: plantWindUniforms.uWaveHeight,

    uWaterOpacity: { value: WATER_OPACITY },
    uWaterOpacityGrazing: { value: WATER_OPACITY_GRAZING },

    // Kafelek wody w atlasie: róg (u, v) i rozmiar.
    uWaterTile: {
        value: new THREE.Vector4(
            waterTile.x / ATLAS_COLUMNS,
            1 - (waterTile.y + 1) / ATLAS_ROWS,
            1 / ATLAS_COLUMNS,
            1 / ATLAS_ROWS
        )
    },

    // Pikseli na kafelek w atlasie (16; z paczką tekstur więcej) i czy
    // atlas ma mipmapy (TextureAtlas.js) - woda sama wybiera kopię
    // atlasu (textureLod), bo jej współrzędne skaczą co piksel.
    uAtlasTile: { value: 16 },
    uAtlasMipmaps: { value: 0 },

    // Średni kolor tekstury wody (liniowy) - z niego kolory wodospadów.
    uWaterAverage: waterfallColorUniforms.uWaterAverage

};

atlasAveragesReady.then(() => {

    const average = getAtlasAverage('water');
    if (average) waterUniforms.uWaterAverage.value.copy(average);

}, () => {});

atlasReady.then((atlas) => {

    waterUniforms.uAtlasTile.value = atlas.tileSize;
    waterUniforms.uAtlasMipmaps.value = atlas.mipmaps ? 1 : 0;

}, () => {});


export const waterMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture,

        vertexColors: true,

        transparent: true,

        side: THREE.DoubleSide

    });

// The existing chunk attribute doubles as water wave/face metadata. Defaults
// also allow the empty prewarm geometry to compile this exact shader variant.
waterMaterial.defaultAttributeValues = {
    ...waterMaterial.defaultAttributeValues, plantMotion: [0, 1], surfaceProfile: [0, 0], canopyTint: [1, 1, 1]
};

waterMaterial.onBeforeCompile = (shader, renderer) => {

    blockMaterial.onBeforeCompile(shader, renderer);

    Object.assign(shader.uniforms, waterUniforms, chunkMaskUniforms);


    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform float uWaveHeight;
            attribute vec2 plantMotion;
            varying vec3 vWaterWorld;
            varying vec3 vWaterNormal;
            varying float vWaterFace;
            ${WATER_WAVE_GLSL}`
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>

            vec3 waterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;

            // Wierzchołki powierzchni falują: kilka fal
            // w różnych kierunkach. Zależy tylko od miejsca w świecie,
            // więc sąsiednie bloki (i chunki) falują razem, bez szpar.

            if (plantMotion.x > 0.0) {

                float wave = waterWave(waterWorld.xz, uTime);

                transformed.y += wave * uWaveHeight * plantMotion.x;
                waterWorld.y += wave * uWaveHeight * plantMotion.x;

            }

            vWaterWorld = waterWorld;
            vWaterNormal = normalize(mat3(modelMatrix) * objectNormal);
            vWaterFace = plantMotion.y * 2.0 - 1.0;`
        );


    shader.fragmentShader = shader.fragmentShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform vec4 uWaterTile;
            uniform float uAtlasTile;
            uniform float uAtlasMipmaps;
            uniform float uWaterOpacity;
            uniform float uWaterOpacityGrazing;
            uniform vec3 uWaterAverage;
            varying vec3 vWaterWorld;
            varying vec3 vWaterNormal;
            varying float vWaterFace;
            ${CHUNK_MASK_GLSL}`
        )
        .replace(
            '#include <map_pars_fragment>',
            `#include <map_pars_fragment>

            // Piksel tekstury wody w miejscu p (powtarza się co blok),
            // z kopii atlasu lod (mipmapy - z daleka mniejsza).

            vec4 waterTexel(vec2 p, float lod) {

                vec2 cell = (floor(fract(p) * uAtlasTile) + 0.5) / uAtlasTile;

                return textureLod(map, uWaterTile.xy + cell * uWaterTile.zw, lod);

            }

            ${WATERFALL_PIXEL_GLSL}
            ${WATERFALL_AVERAGE_GLSL}`
        )
        .replace(
            '#include <map_fragment>',
            `vec3 waterNormal = normalize(vWaterNormal);

            // Płaszczyzna tekstury: góra / dół - x, z; boki - poziomo i y.

            vec2 waterPlane = abs(vWaterFace) > 0.5
                ? vWaterWorld.xz
                : (abs(waterNormal.x) > 0.5 ? vWaterWorld.zy : vWaterWorld.xy);

            // Dwie warstwy płyną w różne strony (na bokach - w dół).

            vec2 flowA = abs(vWaterFace) > 0.5 ? vec2(0.06, 0.025) : vec2(0.0, 0.35);
            vec2 flowB = abs(vWaterFace) > 0.5 ? vec2(-0.035, 0.05) : vec2(0.02, 0.22);

            // Rzeka: nurt zapisany w UV (środek kafelka przesunięty o nurt) -
            // na wierzchu obie warstwy płyną z nurtem (trochę inaczej, żeby
            // było widać ruch wody, a nie przesuwany obrazek).

            vec2 riverFlow = ((vMapUv - uWaterTile.xy) / uWaterTile.zw - 0.5) / ${WATER_FLOW_UV.toFixed(3)} * ${(127 / 32).toFixed(4)};

            if (abs(vWaterFace) > 0.5 && dot(riverFlow, riverFlow) > 0.01) {

                vec2 across = vec2(-riverFlow.y, riverFlow.x);

                flowA = -riverFlow * ${RIVER_TEXTURE.toFixed(3)};
                flowB = -riverFlow * ${(RIVER_TEXTURE * 0.7).toFixed(3)} + across * 0.04;

            }

            // Kopia atlasu: ile pikseli tekstury przypada na piksel ekranu.

            vec2 waterTexels = vec2(length(dFdx(waterPlane)), length(dFdy(waterPlane))) * uAtlasTile;

            float waterLod = uAtlasMipmaps > 0.5 ? max(0.0, log2(max(waterTexels.x, waterTexels.y))) : 0.0;

            vec4 waterColor = mix(
                waterTexel(waterPlane + flowA * uTime, waterLod),
                waterTexel(waterPlane + flowB * uTime + 0.37, waterLod),
                0.5
            );

            // Bok spadającej wody (0.87.0): pikselowe smugi - u góry ciemne,
            // niżej coraz więcej piany (WaterfallPixels.js). Spadek liczony
            // ciągle: góra bloku = spadek bloku nad nim, więc bez szwów.

            float waterFoam = 0.0;

            if (abs(vWaterFace) <= 0.5 && riverFlow.y > ${(WATER_FALL_MARK * 127 / 32 * 0.6).toFixed(3)}) {

                float fall = floor(riverFlow.x * ${(32 / 127 * 16).toFixed(4)} + 0.5);

                float depth = fall - fract(vWaterWorld.y);

                vec4 fallPixel = waterfallPixel(waterPlane, depth, uTime, uWaterAverage);

                // Z daleka (piksel mniejszy niż piksel ekranu) - średni kolor.
                float fallFar = smoothstep(0.6, 1.8, max(waterLod, log2(max(waterTexels.x, waterTexels.y) * 16.0 / uAtlasTile)));

                waterColor = vec4(mix(fallPixel.rgb, waterfallAverage(depth, uWaterAverage), fallFar), 1.0);

                // Spadająca woda jest gęsta, piana prawie całkiem kryje.
                waterFoam = 0.62 + 0.1 * fallPixel.a;

            }

            diffuseColor *= waterColor;`
        )
        .replace(
            '#include <alphamap_fragment>',
            `#include <alphamap_fragment>

            // Z góry widać dno, z boku woda jest gęstsza.

            float waterFacing = abs(dot(normalize(cameraPosition - vWaterWorld), waterNormal));

            diffuseColor.a = mix(uWaterOpacityGrazing, uWaterOpacity, pow(waterFacing, 0.6));

            // Spieniona spadająca woda prawie nie prześwituje.

            diffuseColor.a = max(diffuseColor.a, waterFoam * 1.4);

            // Przy granicy prawdziwych chunków (z dalekim terenem za nimi):
            // promień przez wodę schodzi pod powierzchnię i wychodzi poza
            // narysowane chunki, zanim trafi w dno - tam pod wodą nie ma
            // nic (daleki teren ma wierzch na poziomie wody), więc przez
            // wodę widać by jasne niebo (pas wzdłuż granicy). Sprawdzamy
            // kilka głębokości: im płycej promień już jest poza chunkami,
            // tym bardziej woda jest nieprzezroczysta, w kolorze dalekiej
            // wody.

            if (uFarEnabled > 0.5 && vWaterFace > 0.5) {

                vec3 waterRay = vWaterWorld - cameraPosition;

                if (waterRay.y < -0.001) {

                    vec2 waterRun = waterRay.xz / -waterRay.y;

                    float waterEdge = 0.0;

                    for (int i = 0; i < 4; i++) {

                        float depth = 1.5 * exp2(float(i));

                        vec2 offset = waterRun * depth;

                        float run = length(offset);

                        if (run > 48.0) {
                            offset *= 48.0 / run;
                        }

                        if (!chunkMeshed(vWaterWorld.xz + offset)) {
                            waterEdge = max(waterEdge, 1.0 - float(i) * 0.1);
                        }

                    }

                    diffuseColor.a = mix(diffuseColor.a, 1.0, waterEdge);
                    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * ${glslVec3(FAR_WATER_TINT_RGB.map((v) => v * WATER_EDGE_SHADE))}, waterEdge);

                }

            }`
        );

};

// ------------------------------------------------------------
// TRYB ZIEMNIAKA
//
// Włącza albo wyłącza prostszą wersję shadera (define POTATO) w podanych
// materiałach. Zmiana defines = nowy shader, więc tylko gdy się zmienia.
// ------------------------------------------------------------

export function setPotatoDefine(materials, on) {

    for (const material of materials) {

        material.defines = material.defines ?? {};

        if (('POTATO' in material.defines) === on) {
            continue;
        }

        if (on) {
            material.defines.POTATO = '';
        }
        else {
            delete material.defines.POTATO;
        }

        material.needsUpdate = true;

    }

}

// ------------------------------------------------------------

// Nazwa kafelka atlasu dla danej ściany bloku
// (np. 'grass_side' dla boku trawy).

export function getFaceTexture(
    textures,
    faceName
) {
    return getSurfaceFaceTexture(textures, faceName);
}

// ------------------------------------------------------------

export const FACE_NAMES = [

    'right',   // +X
    'left',    // -X

    'top',     // +Y
    'bottom',  // -Y

    'front',   // +Z
    'back'     // -Z

];

// ------------------------------------------------------------
// SZABLON ŚCIAN BLOKU
//
// Dla każdej z 6 ścian: kierunek (normalna), 4 rogi i 6 indeksów
// (dwa trójkąty). Dane są wyciągnięte z BoxGeometry, więc układ
// wierzchołków i tekstur jest dokładnie taki sam jak wtedy,
// gdy każdy blok był osobnym sześcianem.
//
// Rogi są w współrzędnych 0..1 (róg bloku w 0,0,0).
// Kolejność rogów na ścianie:
//   0 - lewy górny     1 - prawy górny
//   2 - lewy dolny     3 - prawy dolny
// ------------------------------------------------------------

function createBlockFaces() {

    const box =
        new THREE.BoxGeometry(1, 1, 1);

    const position = box.getAttribute('position');
    const normal = box.getAttribute('normal');
    const index = box.getIndex();

    const faces = [];


    for (
        let faceIndex = 0;
        faceIndex < FACE_NAMES.length;
        faceIndex++
    ) {

        const firstVertex = faceIndex * 4;

        const corners = [];


        for (let i = 0; i < 4; i++) {

            const vertex = firstVertex + i;

            // BoxGeometry ma środek w 0,0,0 - przesuwamy o 0.5.

            corners.push([
                Math.round(position.getX(vertex) + 0.5),
                Math.round(position.getY(vertex) + 0.5),
                Math.round(position.getZ(vertex) + 0.5)
            ]);

        }


        const indices = [];

        for (let i = 0; i < 6; i++) {

            indices.push(
                index.getX(faceIndex * 6 + i) - firstVertex
            );

        }


        faces.push({

            name: FACE_NAMES[faceIndex],

            normal: [
                Math.round(normal.getX(firstVertex)),
                Math.round(normal.getY(firstVertex)),
                Math.round(normal.getZ(firstVertex))
            ],

            corners,
            indices

        });

    }


    box.dispose();

    return faces;

}


export const BLOCK_FACES = createBlockFaces();

// ------------------------------------------------------------
// UV ŚCIAN
//
// Dla jednego kafelka atlasu zwraca 4 wersje UV: obrócone
// o 0, 90, 180 i 270 stopni. Każda wersja to 8 liczb:
// u,v dla rogów 0, 1, 2, 3 (w kolejności z szablonu ścian).
// ------------------------------------------------------------

// Rogi ściany wymienione "po okręgu":
// lewy górny -> prawy górny -> prawy dolny -> lewy dolny.

const CORNER_CYCLE = [0, 1, 3, 2];


function createRotatedUVs(textureName) {

    const {
        uMin,
        uMax,
        vMin,
        vMax
    } = getAtlasUV(
        textureName
    );


    // Rogi kafelka w tej samej kolejności "po okręgu".

    const tileCycle = [
        [uMin, vMax],
        [uMax, vMax],
        [uMax, vMin],
        [uMin, vMin]
    ];


    const rotations = [];


    for (let rotation = 0; rotation < 4; rotation++) {

        const uv = new Float32Array(8);


        for (let i = 0; i < 4; i++) {

            const corner = CORNER_CYCLE[i];

            const tileCorner =
                tileCycle[(i + rotation) % 4];

            uv[corner * 2] = tileCorner[0];
            uv[corner * 2 + 1] = tileCorner[1];

        }


        rotations.push(uv);

    }


    return rotations;

}

// ------------------------------------------------------------
// DANE RENDEROWANIA BLOKÓW
//
// blockRenderData[id] = {
//     uv:     [ściana][obrót] -> Float32Array(8)
//     rotate: [ściana]        -> czy losowo obracać teksturę
//     cross:  roślina (płaszczyzny) albo null
//     leaves: liście (sześcian z prześwitami)
//     flat:   płaska dekoracja { face, axis, far } albo null - która
//             ściana sześcianu, wzdłuż której osi ją przesunąć i czy pod
//             dalszą ścianę komórki (1) zamiast bliższej (0)
// }
// ------------------------------------------------------------

// Model 'flat': przyleganie -> ściana (indeks w FACE_NAMES) zwrócona
// od sąsiada, oś i strona komórki.

const FLAT_FACES = {
    [ATTACH_DOWN]: { face: 2, axis: 1, far: false },    // leży: wierzch
    [ATTACH_NORTH]: { face: 4, axis: 2, far: false },   // sąsiad -Z: przód (+Z)
    [ATTACH_SOUTH]: { face: 5, axis: 2, far: true },    // sąsiad +Z: tył (-Z)
    [ATTACH_EAST]: { face: 1, axis: 0, far: true },     // sąsiad +X: lewa (-X)
    [ATTACH_WEST]: { face: 0, axis: 0, far: false }     // sąsiad -X: prawa (+X)
};

export const blockRenderData =
    new Array(MAX_BLOCK_ID + 1).fill(null);


for (
    const [name, definition]
    of Object.entries(
        BLOCK_TYPES
    )
) {

    // Ognisko, pochodnie i skrzynie rysują własne modele.
    if (definition.model === 'structure' || definition.model === 'chest' || definition.model === 'door') continue;

    const rotatedFaces =
        definition.randomRotation ?? [];


    for (const faceName of rotatedFaces) {

        if (!FACE_NAMES.includes(faceName)) {

            throw new Error(
                `Blok "${name}": nieznana ściana ` +
                `w randomRotation: ${faceName}`
            );

        }

    }


    blockRenderData[definition.id] = {
        surfaceProfiles: FACE_NAMES.map(faceName => blockSurfaceProfile(definition, faceName)),

        // Composed once while loading the atlas; variants reuse the same
        // opaque/cutout face and material instead of adding overlay geometry.
        worldTextureVariants: name === 'pine_log_upper'
            ? [definition.textures.side, ...PINE_TRANSITION_TEXTURES].map(texture => FACE_NAMES.map(faceName =>
                createRotatedUVs(['top', 'bottom'].includes(faceName)
                    ? getFaceTexture(definition.textures, faceName) : texture)))
            : name === 'moss_carpet'
                ? MOSS_CARPET_TEXTURES.map(texture => FACE_NAMES.map(() => createRotatedUVs(texture)))
                : null,

        // Roślina: płaszczyzny z jedną teksturą (ChunkMesher.addPlants).

        cross: definition.model === 'cross'
            ? {
                uv: getAtlasUV(getFaceTexture(definition.textures, 'front')),
                planes: definition.plant?.planes ?? 2,
                height: definition.plant?.height ?? 1,
                width: definition.plant?.width ?? 0.45,
                // Roślina z paczki: płaszczyzny tak duże jak obrazek
                // (w blokach), bez losowej wysokości - 16 pikseli na blok.
                sprite: definition.plant?.sprite ?? null
            }
            : null,

        riverPlant: definition.model === 'riverPlant'
            ? { ...definition.riverPlant, uv: getAtlasUV(definition.riverPlant.texture ?? 'snow') }
            : null,

        leaves: definition.model === 'leaves',

        // Schody, półbloki, płoty, furtki, stół stolarski (0.90.0):
        // pudełka z ShapeBoxes.js (ChunkMesher.addShape).
        shape: definition.model === 'shape' ? { kind: shapeInfo(definition.id)?.kind } : null,

        // Dodatkowe tekstury pudełek kształtu (np. pościel na łóżku):
        // pudełko z numerem tekstury n bierze shapeUv[n - 1].
        shapeUv: (definition.shapeTextures ?? []).map(texture => FACE_NAMES.map(() => createRotatedUVs(texture))),

        flat: definition.model === 'flat'
            ? FLAT_FACES[getAttach(definition.id)]
            : null,

        // Kolor trawy zależny od klimatu (chunk.tint - ChunkMesher.js):
        // tylko zielone piksele tekstury (shader niżej).

        tint: definition.tint === true,

        uv: FACE_NAMES.map(
            faceName => createRotatedUVs(
                getFaceTexture(
                    definition.textures,
                    faceName
                )
            )
        ),

        rotate: FACE_NAMES.map(
            faceName => rotatedFaces.includes(faceName)
        )

    };

}

// ------------------------------------------------------------


// ------------------------------------------------------------
// CIENIE SŁOŃCA
//
// Włącza albo wyłącza cienie (define USE_SUN_SHADOWS) i daleką mapę
// cieni (USE_FAR_SHADOWS) w podanych materiałach. Tylko z WebGL2
// (Shadows.supported). Zmiana defines = nowy shader, więc tylko gdy
// się zmienia.
// ------------------------------------------------------------

export function setShadowDefine(materials, on, far = false) {

    for (const material of materials) {

        setDefine(material, 'USE_SUN_SHADOWS', on);

        setDefine(material, 'USE_FAR_SHADOWS', on && far);

    }

}


export function setDefine(material, name, on) {

    material.defines = material.defines ?? {};

    if ((name in material.defines) === on) {
        return;
    }

    if (on) {
        material.defines[name] = '';
    }
    else {
        delete material.defines[name];
    }

    material.needsUpdate = true;

}
