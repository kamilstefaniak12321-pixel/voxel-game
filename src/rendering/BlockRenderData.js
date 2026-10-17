import * as THREE from 'three';


import {
    BLOCK_TYPES,
    MAX_BLOCK_ID
} from '../blocks/BlockRegistry.js';


import {
    blockAtlasTexture,
    getAtlasUV,
    ATLAS_TILES,
    ATLAS_COLUMNS,
    ATLAS_ROWS
} from './TextureAtlas.js';


import {
    WATER_SURFACE,
    WATER_WAVE_HEIGHT,
    WATER_OPACITY,
    WATER_OPACITY_GRAZING
} from '../config.js';


import {
    skyUniforms,
    SKY_COLOR_GLSL
} from '../sky/skyShader.js';


import {
    dynamicLightUniforms
} from '../world/DynamicLight.js';


import {
    viewUniforms,
    VIEW_GLSL
} from './viewUniforms.js';


import {
    meteorLightUniforms,
    METEOR_LIGHT_GLSL
} from './meteorLight.js';

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

blockMaterial.onBeforeCompile = (shader, renderer) => {

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
            `if (uFarEnabled > 0.5) {
                float farBlur = smoothstep(uFarInner * 0.65, uFarInner, length(vSkyDirection.xz));
                diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uAtlasAverage, vMapUv).rgb, farBlur);
            }
            vec3 blockTexel = diffuseColor.rgb;
            #ifdef USE_COLOR_ALPHA
                diffuseColor.rgb *= pow(vColor.a, 2.2);
            #endif`
        );


    // Światło lamp: na końcu, jaśniejsze z dwóch świateł,
    // potem dynamiczne światło (lampa w ręce...) i suwak jasności.

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            `#ifdef USE_COLOR_ALPHA

                // Nocą to, co oświetla niebo, traci kolory (srebrna,
                // księżycowa noc). Światło lamp dochodzi dopiero potem,
                // więc zostaje kolorowe.

                float skyLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));

                outgoingLight = mix(outgoingLight, skyLuminance * uNightTint, uNightDesaturation);

                outgoingLight = max(outgoingLight, blockTexel * pow(vColor.rgb, vec3(2.2)));

            #endif

            #ifdef USE_DYNAMIC_LIGHT

                // Dynamiczne światło (lampa w ręce, meteoryt...): kolor
                // z tekstury 3D wokół gracza, w komórce przed ścianą.
                // Ściany cieniujemy tak jak przy zwykłych lampach.

                if (uDynamicEnabled > 0.5) {

                    vec3 cell = (vWorldPosition + vWorldNormal * 0.5 - uDynamicOrigin) / uDynamicSize;

                    if (all(greaterThanEqual(cell, vec3(0.0))) && all(lessThanEqual(cell, vec3(1.0)))) {

                        vec3 n = abs(vWorldNormal);

                        float faceShade =
                            n.x * 0.8 + n.z * 0.9 +
                            n.y * (vWorldNormal.y > 0.0 ? 1.0 : 0.65);

                        // W teksturze kolejne osie to x, z, y (tak są
                        // ułożone dane w DynamicLight.js).

                        vec3 dynamicLight = texture(uDynamicLight, cell.xzy).rgb * faceShade * 0.75;

                        outgoingLight = max(outgoingLight, blockTexel * pow(dynamicLight, vec3(2.2)));

                    }

                }

                // Kula ognia meteorytu oświetla teren z daleka
                // (rendering/meteorLight.js).

                outgoingLight += blockTexel * meteorLight(vWorldPosition, vWorldNormal);

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

                #ifdef POTATO
                    varying vec3 vFogSky;
                    uniform float uFogBrightness;
                    ${SKY_COLOR_GLSL}
                #endif`
            )
            .replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>
                vSkyDirection = (modelMatrix * vec4(transformed, 1.0)).xyz - cameraPosition;

                #ifdef POTATO
                    vFogSky = skyColor(normalize(vSkyDirection)) * uFogBrightness;
                #endif`
            );

    shader.fragmentShader =
        shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vSkyDirection;
                uniform float uFogBrightness;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                uniform sampler2D uAtlasAverage;
                ${SKY_COLOR_GLSL}
                ${VIEW_GLSL}

                #ifdef POTATO
                    varying vec3 vFogSky;
                    #define FOG_SKY vFogSky
                #else
                    #define FOG_SKY (skyColor(normalize(vSkyDirection)) * uFogBrightness)
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
                    else if (uFarEnabled > 0.5) {

                        // Z dalekim terenem: ta sama mgiełka co na nim
                        // (rośnie z odległością), bez znikania bloków.

                        float haze = farHaze(vSkyDirection);
                        vec3 hazeSky = FOG_SKY;
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(hazeSky, 1.0)).rgb, haze);

                    }
                    else {

                        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
                        if (fogFactor > 0.0) {
                            vec3 fogSky = FOG_SKY;
                            gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(fogSky, 1.0)).rgb, fogFactor);
                        }

                    }
                #endif`
            );


    if (!renderer.capabilities.isWebGL2) {
        return;
    }


    // Dynamiczne światło potrzebuje tekstur 3D (WebGL2).

    Object.assign(shader.uniforms, dynamicLightUniforms, meteorLightUniforms);

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
            ${METEOR_LIGHT_GLSL}`
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


plantMaterial.onBeforeCompile = (shader, renderer) => {

    blockMaterial.onBeforeCompile(shader, renderer);


    // Góra kafelka rośliny: wierzchołki z v przy górnej krawędzi kafelka
    // atlasu. Kołysanie zależy od miejsca (każda kępka trochę inaczej).

    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;`
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>

            float plantTop = step(fract((1.0 - uv.y) * 16.0), 0.5);

            vec3 plantWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;

            float plantPhase = plantWorld.x * 0.45 + plantWorld.z * 0.35;

            float gust = 0.75 + 0.25 * sin(uTime * 0.37 + plantWorld.x * 0.05);

            transformed.x += plantTop * gust * (sin(uTime * 1.8 + plantPhase) * 0.07 + sin(uTime * 3.3 + plantPhase * 2.1) * 0.02);
            transformed.z += plantTop * gust * cos(uTime * 1.45 + plantPhase * 1.3) * 0.055;`
        );

};

// ------------------------------------------------------------
// MATERIAŁ WODY
//
// Ten sam shader co bloki, a do tego:
//   - woda jest półprzezroczysta - patrząc z góry widać dno, z boku
//     (pod małym kątem) jest gęstsza, jak prawdziwa woda,
//   - tekstura wody powoli płynie: dwie warstwy w różne strony,
//     piksele zostają ostre,
//   - powierzchnia faluje (wierzchołki na wysokości WATER_SURFACE),
//   - widać ją z obu stron (spod wody też).
// Woda jest w osobnej grupie geometrii chunka (ChunkMesher.js),
// rysowanej po wszystkim, co nieprzezroczyste.
// Liczby: WATER_... w config.js.
// ------------------------------------------------------------

const waterTile = ATLAS_TILES.water;

export const waterUniforms = {

    // Jak wysoko faluje powierzchnia (bloki; 0 = płaska) - /woda fale.
    uWaveHeight: { value: WATER_WAVE_HEIGHT },

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
    }

};


export const waterMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture,

        vertexColors: true,

        transparent: true,

        side: THREE.DoubleSide

    });


waterMaterial.onBeforeCompile = (shader, renderer) => {

    blockMaterial.onBeforeCompile(shader, renderer);

    Object.assign(shader.uniforms, waterUniforms);


    shader.vertexShader = shader.vertexShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform float uWaveHeight;
            varying vec3 vWaterWorld;
            varying vec3 vWaterNormal;`
        )
        .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>

            vec3 waterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;

            // Wierzchołki na wysokości powierzchni falują: kilka fal
            // w różnych kierunkach. Zależy tylko od miejsca w świecie,
            // więc sąsiednie bloki (i chunki) falują razem, bez szpar.

            if (abs(fract(waterWorld.y) - ${WATER_SURFACE.toFixed(4)}) < 0.01) {

                float wave =
                    sin(waterWorld.x * 0.9 + uTime * 1.3) * 0.5 +
                    sin(waterWorld.z * 1.3 - uTime * 1.05) * 0.35 +
                    sin((waterWorld.x + waterWorld.z) * 0.45 + uTime * 0.7) * 0.15;

                transformed.y += wave * uWaveHeight;
                waterWorld.y += wave * uWaveHeight;

            }

            vWaterWorld = waterWorld;
            vWaterNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );


    shader.fragmentShader = shader.fragmentShader
        .replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;
            uniform vec4 uWaterTile;
            uniform float uWaterOpacity;
            uniform float uWaterOpacityGrazing;
            varying vec3 vWaterWorld;
            varying vec3 vWaterNormal;`
        )
        .replace(
            '#include <map_pars_fragment>',
            `#include <map_pars_fragment>

            // Piksel tekstury wody w miejscu p (powtarza się co blok).

            vec4 waterTexel(vec2 p) {

                vec2 cell = (floor(fract(p) * 16.0) + 0.5) / 16.0;

                return texture2D(map, uWaterTile.xy + cell * uWaterTile.zw);

            }`
        )
        .replace(
            '#include <map_fragment>',
            `vec3 waterNormal = normalize(vWaterNormal);

            // Płaszczyzna tekstury: góra / dół - x, z; boki - poziomo i y.

            vec2 waterPlane = abs(waterNormal.y) > 0.5
                ? vWaterWorld.xz
                : (abs(waterNormal.x) > 0.5 ? vWaterWorld.zy : vWaterWorld.xy);

            // Dwie warstwy płyną w różne strony (na bokach - w dół).

            vec2 flowA = abs(waterNormal.y) > 0.5 ? vec2(0.06, 0.025) : vec2(0.0, 0.35);
            vec2 flowB = abs(waterNormal.y) > 0.5 ? vec2(-0.035, 0.05) : vec2(0.02, 0.22);

            vec4 waterColor = mix(
                waterTexel(waterPlane + flowA * uTime),
                waterTexel(waterPlane + flowB * uTime + 0.37),
                0.5
            );

            diffuseColor *= waterColor;`
        )
        .replace(
            '#include <alphamap_fragment>',
            `#include <alphamap_fragment>

            // Z góry widać dno, z boku woda jest gęstsza.

            float waterFacing = abs(dot(normalize(cameraPosition - vWaterWorld), waterNormal));

            diffuseColor.a = mix(uWaterOpacityGrazing, uWaterOpacity, pow(waterFacing, 0.6));`
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

    if (textures.all) {

        return textures.all;

    }


    if (
        textures[faceName]
    ) {

        return textures[faceName];

    }


    if (
        faceName === 'right' ||
        faceName === 'left' ||
        faceName === 'front' ||
        faceName === 'back'
    ) {

        return textures.side;

    }


    if (faceName === 'top') {

        return textures.top;

    }


    if (faceName === 'bottom') {

        return textures.bottom;

    }


    throw new Error(
        `Brak tekstury dla ściany: ${faceName}`
    );

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
// }
// ------------------------------------------------------------

export const blockRenderData =
    new Array(MAX_BLOCK_ID + 1).fill(null);


for (
    const [name, definition]
    of Object.entries(
        BLOCK_TYPES
    )
) {

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

        // Roślina: płaszczyzny z jedną teksturą (ChunkMesher.addPlants).

        cross: definition.model === 'cross'
            ? {
                uv: getAtlasUV(getFaceTexture(definition.textures, 'front')),
                planes: definition.plant?.planes ?? 2,
                height: definition.plant?.height ?? 1,
                width: definition.plant?.width ?? 0.45
            }
            : null,

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
