import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER,
    SEA_LEVEL,
    WATER_SURFACE,
    WATER_WAVE_HEIGHT
} from '../config.js';

import {
    isSolidId,
    isLiquidId,
    getBlockTypeById,
    getBlockDefinition
} from '../blocks/BlockRegistry.js';

import {
    skyUniforms,
    SKY_COLOR_GLSL
} from '../sky/skyShader.js';

import {
    viewUniforms,
    VIEW_GLSL,
    GLOBE_LIGHT_GLSL,
    CHUNK_MASK_SIZE,
    CHUNK_MASK_GLSL,
    chunkMaskData,
    chunkMaskUniforms
} from '../rendering/viewUniforms.js';

import {
    meteorLightUniforms,
    METEOR_LIGHT_GLSL
} from '../rendering/meteorLight.js';

import {
    atlasAveragesReady,
    getAtlasAverage
} from '../rendering/TextureAtlas.js';

import { setPotatoDefine, setDefine, FAR_WATER_TINT_RGB } from '../rendering/BlockRenderData.js';

import {
    shadowUniforms,
    FAR_TERRAIN_SHADOW_GLSL
} from '../rendering/Shadows.js';

import { grassTint } from './terrain/Biomes.js';
import { SURFACE_FACE_NAMES, SURFACE_MATERIAL_COUNT, getSurfaceFaceTexture, surfaceMaterialId, surfaceMaterialType } from '../rendering/SurfaceMaterials.js';
import { SURFACE_LIGHTING_GLSL } from '../rendering/SurfaceLighting.js';

import {
    KINDS,
    ROCK_KINDS,
    LEAF_KINDS,
    GRASS_KINDS,
    BLOCK_KINDS,
    kindIndex,
    samplePosition,
    sampleFarTile,
    meshFarTile,
    createMeshScratch
} from './farSamples.js';

// ------------------------------------------------------------
// DALEKI TEREN (HORYZONT)
//
// Za zasięgiem widzenia (gdzie kończą się prawdziwe chunki) widać
// uproszczony teren aż do odległości z ustawień "Daleki teren" (do
// kilkunastu tysięcy bloków). Jest zbudowany z KRATEK - kanciastych
// słupków jak wielkie bloki: każda kratka ma płaski wierzch w kolorze
// swojej powierzchni (trawa, skała, piasek, woda, korony drzew)
// i pionowe ścianki tam, gdzie sąsiad jest niżej. Blisko gracza
// kratka ma 1 blok (prawie jak prawdziwe chunki), dalej 2, 4, 8...
// aż do 128 bloków - im dalej, tym mniejsza rozdzielczość, ale
// teren zostaje kanciasty, nie rozmyty. Wysokości z tego samego
// generatora co chunki (TerrainGenerator), oświetlenie tym samym
// światłem nieba co bloki, mgiełka gęstnieje z odległością.
//
// BUDOWA: teren jest podzielony na kafelki (drzewo czwórkowe). Każdy
// kafelek ma 32 x 32 kratki (DETAIL niżej) i leży zawsze w tym samym
// miejscu świata, więc przy chodzeniu przebudowuje się tylko kilka
// z nich. Wysokości kratek liczy osobny wątek przeglądarki
// (FarTerrainWorker.js), więc nie zabierają czasu klatkom; z nich
// gra składa siatkę: wierzchy kratek o tej samej wysokości i rodzaju
// łączą się w większe prostokąty, ścianki wzdłuż brzegu też.
// Szczeliny między kafelkami różnej dokładności zasłaniają
// "fartuchy" - ścianki na brzegu kafelka opuszczone w dół.
//
// Chunki zmienione przez gracza (np. krater po meteorycie, budowle)
// daleki teren też pokazuje - z ich zapisanych bloków.
//
// RYSOWANIE: osobna scena rysowana po niebie, a przed światem
// (Game.render). Bliskie chunki są rysowane na wierzchu, a daleki
// teren w ich zasięgu jest wycięty (shader), więc nie przebija przez
// wykopane dziury ani nie wystaje spomiędzy prawdziwych drzew.
// ------------------------------------------------------------

// Dokładność kafelków:
//   cells       - kratek na brzegu kafelka,
//   minSpacing  - najmniejsza kratka (w blokach) - blisko gracza,
//   rootSpacing - największa kratka (kafelki "korzenie" drzewa),
//   lodDistance - kafelek dzielimy na 4 mniejsze, gdy gracz jest
//                 bliżej niż (rozmiar kafelka x lodDistance).
// Kratka ma mniej więcej (odległość / (cells x lodDistance)) bloków -
// przy 32 x 2: w odległości 256 bloków 4 bloki, 1000 bloków - 8-16.
// Więcej = drobniejsze kratki, ale więcej trójkątów (lodDistance x 2 =
// ~4x więcej). Ustawienie "Szczegóły dalekiego terenu" (farDetail)
// wybiera jeden z DETAILS; tryb ziemniaka - POTATO_DETAIL (~8x mniej
// trójkątów niż średnie).
const DETAILS = {
    1: { cells: 32, minSpacing: 2, rootSpacing: 256, lodDistance: 1 },     // niskie (telefon)
    2: { cells: 32, minSpacing: 1, rootSpacing: 256, lodDistance: 2 },     // średnie
    3: { cells: 32, minSpacing: 1, rootSpacing: 256, lodDistance: 3 }      // wysokie
};

const DETAIL = DETAILS[2];

const POTATO_DETAIL = {
    cells: 16,
    minSpacing: 2,
    rootSpacing: 256,
    lodDistance: 1.5
};

// Kratki od 1 do 256 bloków - poziomy dokładności 0..8.
const LEVELS = 9;

// Ile milisekund na klatkę może zająć składanie siatek kafelków (i,
// bez osobnego wątku, liczenie wysokości).
const BUILD_BUDGET_MS = 2;

// Wątków liczących kafelki: tyle, ile rdzeni procesora minus dwa
// (gra i przeglądarka), od 1 do MAX_WORKERS. Każdy liczy naraz
// najwyżej WORKER_REQUESTS kafelków (najbliższe najpierw - po przejściu
// kawałka nowe, bliższe kafelki nie czekają na stare).
const MAX_WORKERS = 3;
const WORKER_REQUESTS = 3;

// Dopóki wątek nie wystartuje (najwyżej tyle milisekund) - czekamy na
// niego; dłużej - liczymy w grze (a gdy wątek jednak ruszy - dalej on).
const WORKER_START_MS = 15000;

// Po przejściu tylu bloków od ostatniego środka wybieramy kafelki
// od nowa.
const RECENTER_DISTANCE = 16;

// Ścianka kratki jest u dołu ciemniejsza (jak cień w kącie przy
// prawdziwych blokach) - kolor dołu = kolor x SIDE_SHADE. Ścianka
// trawy u góry przechodzi w kolor wierzchu (jak zielony brzeg na boku
// bloku trawy) - GRASS_SIDE_FRINGE: ile koloru wierzchu.
const SIDE_SHADE = 0.72;
const GRASS_SIDE_FRINGE = 0.45;

// Kratki różnią się trochę jasnością (jak piksele tekstury z daleka):
// +-CELL_VARIATION.
const CELL_VARIATION = 0.07;

// Daleka woda: odcień FAR_WATER_TINT_RGB (BlockRenderData.js).
const FAR_WATER_TINT = new THREE.Color(...FAR_WATER_TINT_RGB);

// Kolory, gdyby nie dało się policzyć średnich kolorów tekstur.
const FALLBACK_COLORS = {
    grass_top: new THREE.Color(0.10, 0.22, 0.05),
    grass_side: new THREE.Color(0.16, 0.12, 0.06),
    snow: new THREE.Color(0.78, 0.84, 0.92),
    stone: new THREE.Color(0.22, 0.22, 0.22),
    sand: new THREE.Color(0.62, 0.55, 0.33),
    water: new THREE.Color(0.03, 0.11, 0.42)
};

// Kolor trawy na dalekim terenie (rodzaje GRASS_KINDS - farSamples.js):
// typowy kolor trawy z Biomes.js (grassTint) w ciepłym, chłodnym
// i górskim klimacie.
const FAR_GRASS_TINTS = {
    grass_warm: grassTint(0.45, -0.35, 8, [1, 1, 1]),
    grass_cool: grassTint(-0.65, 0.5, 8, [1, 1, 1]),
    grass_high: grassTint(-0.9, 0, 45, [1, 1, 1])
};

// Korony z daleka są trochę ciemniejsze niż sama tekstura liści
// (cienie między liśćmi i drzewami), a ich boki jeszcze trochę.
const FAR_LEAVES_SHADE = 0.78;
const FAR_LEAVES_SIDE_SHADE = 0.85;


// ------------------------------------------------------------
// MATERIAŁ - zwykły materiał z oświetleniem (jak bloki), z kolorem
// w wierzchołkach i z dopiskami w shaderze:
//   - środek (tam są prawdziwe chunki) i to, co za końcem dalekiego
//     terenu, jest wycięte,
//   - każda kratka ma trochę inną jasność (stały wzór w świecie),
//   - wysoko nad ziemią (kosmos, viewUniforms.uCurvature) teren
//     wygina się w kulę: punkt w odległości d od gracza trafia na
//     kulę w odległość łuku d (razem z kierunkiem "w górę" do
//     oświetlenia), a brzeg nie znika w niebie, tylko - postrzępiony -
//     przechodzi w kulę Ziemi (src/space/Globe.js),
//   - nocne odbarwienie i suwak jasności - tak jak na blokach,
//   - mgiełka w kolorze nieba zamiast zwykłej mgły.
// ------------------------------------------------------------

// Kolorowanie kafelków według dokładności (komenda /horyzont lod):
// jeden kolor na wielkość kratki (1, 2, 4... 256 bloków). Każda
// dokładność ma własny materiał (ten sam shader, inna wielkość
// kratki), bo wspólny materiał dostaje wartości tylko raz na klatkę.

const LOD_COLORS = [
    ['#ff4040', 'czerwone'],
    ['#ff9a30', 'pomarańczowe'],
    ['#ffe040', 'żółte'],
    ['#40ff60', 'zielone'],
    ['#40e0ff', 'błękitne'],
    ['#4060ff', 'niebieskie'],
    ['#d060ff', 'fioletowe'],
    ['#ff60c0', 'różowe'],
    ['#ffffff', 'białe']
];

// Opis kolorów do /horyzont lod.

function blocksWord(n) {

    if (n === 1) {
        return 'blok';
    }

    return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'bloki' : 'bloków';

}

export const LOD_LEGEND = LOD_COLORS
    .map(([, name], level) => `${name} - ${2 ** level} ${blocksWord(2 ** level)}`)
    .join(', ');

const lodDebug = { value: 0 };


// Kąt jednego piksela ekranu (radiany) - rogi kratek odsuwają się
// o pół piksela (FarTerrain.render liczy go z pola widzenia).
const pixelAngle = { value: 0.0015 };


export function createFarTerrainMaterial(level = 0) {

    // Tylko przednie strony trójkątów - tylne (ścianki od drugiej
    // strony, spody) karta graficzna od razu pomija.

    const material = new THREE.MeshLambertMaterial({
        vertexColors: true
    });

    const lodColor = new THREE.Color(LOD_COLORS[level][0]);

    const cellSize = 2 ** level;


    material.onBeforeCompile = (shader) => {

        Object.assign(shader.uniforms, skyUniforms, viewUniforms, meteorLightUniforms, shadowUniforms, chunkMaskUniforms, {
            uLodTint: { value: lodColor },
            uLodDebug: lodDebug,
            uCellSize: { value: cellSize },
            uPixelAngle: pixelAngle
        });


        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vFarWorld;
                varying vec2 vFarFlatXZ;
                varying vec2 vFarMaskXZ;
                varying vec2 vFarSide;
                varying float vFarCurtain;
                varying vec3 vFarCell;
                varying float vFarSunHeight;
                attribute vec4 surfaceAlbedo;
                uniform float uAtmosphericLight;
                uniform float uCurvature;
                uniform float uCellSize;
                uniform float uPixelAngle;

                #ifndef POTATO
                    uniform vec3 uSunDirection;
                #endif

                // Tryb ziemniaka: kolor mgiełki liczony w wierzchołkach.

                #ifdef POTATO
                    varying vec3 vHazeSky;
                    uniform float uFogBrightness;
                    ${SKY_COLOR_GLSL}
                #endif`
            )
            .replace(
                '#include <color_vertex>',
                `#include <color_vertex>

                // Kolor zapisany jako pierwiastek (więcej odcieni
                // w ciemnych kolorach przy 8 bitach).

                vColor.rgb = mix(vColor.rgb * vColor.rgb,
                    surfaceAlbedo.rgb * surfaceAlbedo.rgb, uAtmosphericLight);`
            )
            .replace(
                '#include <beginnormal_vertex>',
                `#include <beginnormal_vertex>

                // Normalna z siatki: 127 na osi ściany, +-1 na pozostałych -
                // w którą stronę od środka ściany leży róg (farSamples.js).

                vec3 farPacked = floor(objectNormal * 127.0 + 0.5);

                vec3 farAxis = step(vec3(64.0), abs(farPacked)) * sign(farPacked);

                vec3 farSpread = farPacked - farAxis * 127.0;

                objectNormal = farAxis;

                // Ścianka zwrócona w bok: w którą stronę (do maski chunków).

                vFarSide = farAxis.xz;

                // Odległość od gracza w poziomie (na płaskim świecie)
                // i zgięcie w kulę: kierunek i kąt od miejsca pod kamerą.

                vec3 farFlatWorld = (modelMatrix * vec4(position, 1.0)).xyz;

                // Znacznik rogu (farSamples.js, czwarta liczba koloru):
                // wierzch wody - na wysokości powierzchni bliskiej wody,
                // trochę niżej niż jej najniższa fala (na granicy chunków
                // z wodą daleka woda nie wystaje nad bliską); kurtyna.

                float farFlag = color.a * 255.0;

                float farWaterDrop = farFlag < 75.0 ? ${(1 - WATER_SURFACE + WATER_WAVE_HEIGHT + 0.02).toFixed(4)} : 0.0;

                vFarCurtain = farFlag > 25.0 && farFlag < 175.0 ? 1.0 : 0.0;

                farFlatWorld.y -= farWaterDrop;

                // Kratka, do której należy ta ściana (trochę w głąb
                // słupka) - do różnej jasności kratek.

                vFarCell = (farFlatWorld - objectNormal * 0.05) / uCellSize;

                vec2 farOffset = farFlatWorld.xz - cameraPosition.xz;

                float farFlat = length(farOffset);

                vec2 farBendDir = farFlat > 0.001 ? farOffset / farFlat : vec2(1.0, 0.0);

                float farBendAngle = min(farFlat * uCurvature, 3.0);

                // Kierunek ściany obraca się razem z kulą.

                if (uCurvature > 0.0) {

                    float along = dot(objectNormal.xz, farBendDir);

                    float along2 = along * cos(farBendAngle) + objectNormal.y * sin(farBendAngle);

                    objectNormal = vec3(
                        objectNormal.x + farBendDir.x * (along2 - along),
                        -along * sin(farBendAngle) + objectNormal.y * cos(farBendAngle),
                        objectNormal.z + farBendDir.y * (along2 - along)
                    );

                }`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>

                // Róg o pół piksela na zewnątrz ściany - bez prześwitów
                // między połączonymi ścianami.

                vec3 farGrow = farSpread * (0.5 * uPixelAngle * length(farFlatWorld - cameraPosition));

                // Do maski chunków - położenie bez odsunięcia: przy granicy
                // z chunkami odsunięty róg wycinałby piksele po tej stronie.

                vFarMaskXZ = farFlatWorld.xz;

                transformed.y -= farWaterDrop;

                transformed += farGrow;

                farFlatWorld += farGrow;

                vFarFlatXZ = farFlatWorld.xz;

                // Jak wysoko stoi słońce w tym miejscu kuli.

                vFarSunHeight = dot(vec3(farBendDir.x * sin(farBendAngle), cos(farBendAngle), farBendDir.y * sin(farBendAngle)), uSunDirection);

                // Kula: punkt na wysokości h nad morzem, kąt a od miejsca
                // pod kamerą (licząc tak, żeby przy ogromnej kuli nie
                // gubić dokładności).

                if (uCurvature > 0.0) {

                    float worldY = farFlatWorld.y;

                    float h = worldY - ${(SEA_LEVEL + 1).toFixed(1)};

                    float s = sin(farBendAngle);

                    float halfSin = sin(farBendAngle * 0.5);

                    float horizontal = s / uCurvature + h * s;

                    float bentY = ${(SEA_LEVEL + 1).toFixed(1)} + h * cos(farBendAngle) - 2.0 * halfSin * halfSin / uCurvature;

                    vec2 bentXZ = cameraPosition.xz + farBendDir * horizontal;

                    transformed.xz += bentXZ - farFlatWorld.xz;

                    transformed.y += bentY - worldY;

                }`
            )
            .replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                vFarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;

                #ifdef POTATO
                    vHazeSky = skyColor(normalize(vFarWorld - cameraPosition)) * uFogBrightness;
                #endif`
            );


        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vFarWorld;
                varying vec2 vFarFlatXZ;
                varying vec2 vFarMaskXZ;
                varying vec2 vFarSide;
                varying float vFarCurtain;
                varying vec3 vFarCell;
                varying float vFarSunHeight;
                uniform float uFogBrightness;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                uniform vec3 uLodTint;
                uniform float uLodDebug;
                ${CHUNK_MASK_GLSL}
                ${SKY_COLOR_GLSL}
                ${VIEW_GLSL}
                ${GLOBE_LIGHT_GLSL}
                ${METEOR_LIGHT_GLSL}
                ${FAR_TERRAIN_SHADOW_GLSL}
                ${SURFACE_LIGHTING_GLSL}

                #ifdef POTATO
                    varying vec3 vHazeSky;
                    #define HAZE_SKY vHazeSky
                #else
                    #define HAZE_SKY (skyColor(normalize(vFarWorld - cameraPosition)) * uFogBrightness)
                #endif`
            )
            .replace(
                '#include <clipping_planes_fragment>',
                `#include <clipping_planes_fragment>

                // Tam, gdzie są prawdziwe chunki (z meshem), nic - one rysują
                // się na wierzchu; daleki teren nie wystaje spomiędzy nich.
                // Ścianka na granicy chunka liczy się po stronie słupka,
                // do którego należy: ścianka słupka w chunku bez meshu
                // zwrócona do prawdziwych chunków zostaje - patrząc z nich
                // (np. z góry między drzewami) widać ją, a nie niebo.

                float farFlat = length(vFarFlatXZ - cameraPosition.xz);

                if (chunkMeshed(vFarMaskXZ - vFarSide * 0.5)) {
                    discard;
                }

                // Kurtyna (farSamples.js) - tylko zwrócona do prawdziwych
                // chunków.

                if (vFarCurtain > 0.5 && !chunkMeshed(vFarMaskXZ + vFarSide * 0.5)) {
                    discard;
                }

                // Za końcem dalekiego terenu - niebo (okrągły horyzont).
                // Z kulą Ziemi za nim: brzeg postrzępiony (stały wzór
                // w świecie), za nim widać kulę.

                float farEnd = uFarOuter;

                if (uGlobe > 0.0) {

                    vec2 cell = floor(vFarFlatXZ / 12.0);

                    float jag = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);

                    farEnd *= 1.0 - uGlobe * (0.03 + 0.2 * jag);

                }

                if (farFlat > farEnd) {
                    discard;
                }`
            )
            .replace(
                '#include <color_fragment>',
                `#include <color_fragment>

                // Klasyczny widok: każda kratka trochę jaśniejsza albo
                // ciemniejsza. Atmosfera używa czystego albedo tekstur.

                vec3 farCellIndex = mod(floor(vFarCell), 509.0);

                float farCellNoise = fract(sin(dot(farCellIndex, vec3(12.9898, 78.233, 37.719))) * 43758.5453);

                float farVariation = ${(1 - CELL_VARIATION).toFixed(3)} + ${(2 * CELL_VARIATION).toFixed(3)} * farCellNoise;

                diffuseColor.rgb *= mix(farVariation, 1.0, uAtmosphericLight);

                diffuseColor.rgb *= mix(vec3(1.0), uLodTint, uLodDebug);`
            )
            .replace(
                '#include <lights_fragment_begin>',
                `#ifdef USE_FAR_SHADOWS

                    // Daleka mapa cieni (src/rendering/Shadows.js): góry
                    // rzucają cień na doliny - słońce świeci tylko tam,
                    // dokąd dochodzą jego promienie.

                    float farSun = farTerrainSun(vFarWorld, inverseTransformDirection(normal, viewMatrix));

                    ${THREE.ShaderChunk.lights_fragment_begin.replace(
                        'getDirectionalLightInfo( directionalLight, directLight );',
                        `getDirectionalLightInfo( directionalLight, directLight );
                        directLight.color *= ( UNROLLED_LOOP_INDEX == uSunShadowLight ) ? farSun : 1.0;`
                    )}

                #else
                    #include <lights_fragment_begin>
                #endif`
            )
            .replace(
                '#include <opaque_fragment>',
                `float nightDesaturation = uNightDesaturation;

                // Wygięty w kulę (kosmos): tam, gdzie jest inna pora dnia
                // niż u gracza, jaśniej albo ciemniej (jak na kuli Ziemi).

                if (uCurvature > 0.0) {

                    float hereSun = vFarSunHeight;
                    float playerSun = uSunDirection.y;

                    vec3 farNormal = inverseTransformDirection(normal, viewMatrix);

                    float extra =
                        daylightAmbient(hereSun) - daylightAmbient(playerSun) +
                        (daylightSun(hereSun) - daylightSun(playerSun)) * max(dot(farNormal, uSunDirection), 0.0);

                    outgoingLight = max(outgoingLight + diffuseColor.rgb * extra * RECIPROCAL_PI, vec3(0.0));

                    nightDesaturation = clamp(nightDesaturation + daylightNight(hereSun) - daylightNight(playerSun), 0.0, 1.0);

                }

                // Siatka wysokości nie zawiera jeszcze lokalnych źródeł,
                // odbić ani emisji. Jawne zera, bez zastępowania ich albedo.
                outgoingLight = surfaceRadiance(diffuseColor.rgb, outgoingLight,
                    vec3(0.0), vec3(0.0), vec3(0.0),
                    nightDesaturation, uNightTint, uAtmosphericLight);

                // Kula ognia meteorytu oświetla też daleki teren.

                outgoingLight += diffuseColor.rgb * meteorLight(vFarWorld, inverseTransformDirection(normal, viewMatrix));

                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);

                #include <opaque_fragment>`
            )
            .replace(
                '#include <fog_fragment>',
                `vec3 farDirection = vFarWorld - cameraPosition;

                vec3 hazeSky = HAZE_SKY;

                // Na kuli (kosmos): mgiełka ciemnieje tam, gdzie jest noc.

                if (uCurvature > 0.0) {
                    hazeSky *= hazeScale(vFarSunHeight);
                }

                gl_FragColor.rgb = mix(
                    gl_FragColor.rgb,
                    linearToOutputTexel(vec4(hazeSky, 1.0)).rgb,
                    farHaze(farDirection)
                );`
            );

    };


    return material;

}


// Materiał dla każdej dokładności (indeks = poziom: 0 - kratka 1 blok).

const farMaterials = Array.from({ length: LEVELS }, (_, level) => createFarTerrainMaterial(level));


function levelOf(spacing) {

    return Math.max(0, Math.min(LEVELS - 1, Math.round(Math.log2(spacing))));

}


// Kolor (liniowy, 0-1) jako pierwiastek w bajcie (shader podnosi do
// kwadratu - więcej odcieni w ciemnych kolorach).

function colorByte(value) {

    return Math.round(Math.sqrt(Math.min(1, Math.max(0, value))) * 255);

}


// Bufory do składania siatki kafelka w grze (wspólne - kafelki
// powstają po kolei).

let scratch = createMeshScratch(DETAIL.cells);

// ------------------------------------------------------------

export class FarTerrain {

    // world - świat (generator terenu, chunki zmienione przez gracza)

    constructor(world) {

        this.world = world;

        this.generator = world.generator;


        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera();


        // Promień prawdziwych chunków i koniec dalekiego terenu (bloki).

        this.inner = 48;
        this.outer = 0;


        // Kafelki: klucz "kratki:kratka:x:z" -> kafelek
        // { key, cells, spacing, x0, z0, size, distance, raw, pending,
        //   mesh, stale, usedAt }
        // raw - wysokości i rodzaje kratek z generatora (z wątku).

        this.tiles = new Map();

        // Kafelki, które powinny być widoczne (najbliższe najpierw)
        // i te, które naprawdę są w scenie.

        this.wanted = [];
        this.shown = new Set();

        // Czy pokazany jest już pełny zestaw (do tego czasu kafelki
        // pojawiają się po kolei, najbliższe najpierw).

        this.complete = false;

        this.center = null;

        this.frame = 0;

        // Kolorowanie kafelków według dokładności (/horyzont lod).

        this.debugLod = false;

        // Jak dokładne są kafelki (tryb ziemniaka - mniej kratek).

        this.detail = DETAIL;


        // Wątki liczące kafelki (bez nich - po kawałku w grze):
        // [{ worker, ready, busy }], zlecenia: numer -> { tile, entry }.

        this.workers = [];

        this.requests = new Map();

        this.nextRequest = 1;

        this.startWorkers();


        // Kolory czekają na policzenie średnich kolorów tekstur.

        this.colorsReady = false;

        atlasAveragesReady.then(() => this.prepareColors());


        // Chunk zmieniony przez gracza znika z pamięci - kafelki nad
        // nim trzeba przebudować, żeby pokazały jego nowy kształt.

        world.onModifiedChunkUnloaded = (chunk) => this.invalidateChunk(chunk.cx, chunk.cz);

    }


    // Osobne wątki, każdy z własnym generatorem (ten sam typ terenu
    // i seed). Gdy przeglądarka ich nie uruchomi - liczymy w grze.

    startWorkers() {

        const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;

        const count = Math.max(1, Math.min(MAX_WORKERS, cores - 2));

        this.workersStarted = performance.now();

        for (let n = 0; n < count; n++) {

            try {

                const worker = new Worker(new URL('./FarTerrainWorker.js', import.meta.url), { type: 'module' });

                const entry = { worker, ready: false, busy: 0 };

                worker.onmessage = (event) => this.onWorkerMessage(entry, event.data);

                worker.onerror = (event) => this.stopWorker(entry, event);

                this.workers.push(entry);

            }
            catch (error) {

                console.warn('Daleki teren liczy się bez osobnego wątku:', error?.message ?? error);

                break;

            }

        }

    }


    // Wątek nie działa - jego kafelki policzy inny albo gra.

    stopWorker(entry, reason) {

        console.warn('Wątek dalekiego terenu zatrzymany:', reason?.message ?? reason);

        entry.worker.terminate();

        this.workers = this.workers.filter((other) => other !== entry);

        for (const [id, request] of this.requests) {

            if (request.entry === entry) {

                request.tile.pending = 0;

                this.requests.delete(id);

            }

        }

    }


    onWorkerMessage(entry, message) {

        // Wątek wczytany - dopiero teraz można mu coś zlecić.

        if (message.type === 'ready') {

            entry.worker.postMessage({ type: 'init', terrain: this.world.terrain, seed: this.world.seed });

            entry.ready = true;

            this.sendPalette(entry);

            return;

        }

        if (message.type !== 'tile') {
            return;
        }

        const request = this.requests.get(message.id);

        this.requests.delete(message.id);

        entry.busy = Math.max(0, entry.busy - 1);

        const tile = request?.tile;

        if (!tile || tile.pending !== message.id) {
            return;
        }

        tile.pending = 0;

        tile.raw = { heights: message.heights, kinds: message.kinds, materialIds: message.materialIds };

        tile.workerMesh = message.mesh;

        tile.stale = true;

    }


    // Kolory kratek dla wątków (siatki składają wtedy one).

    sendPalette(only = null) {

        if (!this.kindColors) {
            return;
        }

        for (const entry of only ? [only] : this.workers) {

            if (entry.ready) {
                entry.worker.postMessage({ type: 'palette', colors: this.kindColors, albedo: this.surfaceAlbedoPalette });
            }

        }

    }


    // Kolory kratek: wierzch i boki dla każdego rodzaju powierzchni
    // (średnie kolory tekstur), w bajtach dla siatki.

    prepareColors() {

        const colors = {};

        for (const name of Object.keys(FALLBACK_COLORS)) {
            colors[name] = getAtlasAverage(name) ?? FALLBACK_COLORS[name];
        }

        colors.water = colors.water.clone().multiply(FAR_WATER_TINT);


        const top = new Map();
        const side = new Map();

        top.set('grass', colors.grass_top);
        side.set('grass', colors.grass_side);

        top.set('rock', colors.stone);
        side.set('rock', colors.stone);

        top.set('sand', colors.sand);
        side.set('sand', colors.sand);

        top.set('water', colors.water);
        side.set('water', colors.water);

        top.set('snow', colors.snow);
        side.set('snow', colors.snow);


        // Trawa w kolorze klimatu (tylko zielony wierzch - jak shader
        // bloków; bok trawy to głównie ziemia).

        for (const [kind, tint] of Object.entries(FAR_GRASS_TINTS)) {

            colors[kind] = colors.grass_top.clone().multiply(new THREE.Color(...tint));

            top.set(kind, colors[kind]);
            side.set(kind, colors.grass_side);

        }


        // Skały: średni kolor tekstury wierzchu i boku bloku.

        for (const rock of ROCK_KINDS) {

            const textures = getBlockDefinition(rock)?.textures ?? {};

            colors[rock] = getAtlasAverage(textures.top ?? textures.all) ?? colors.stone;

            top.set(rock, colors[rock]);
            side.set(rock, getAtlasAverage(textures.side ?? textures.all) ?? colors[rock]);

        }


        // Korony drzew: średni kolor liści gatunku, trochę ciemniej.

        for (const leaves of LEAF_KINDS) {

            colors[leaves] =
                (getAtlasAverage(leaves) ?? FALLBACK_COLORS.grass_top).clone().multiplyScalar(FAR_LEAVES_SHADE);

            top.set(leaves, colors[leaves]);
            side.set(leaves, colors[leaves].clone().multiplyScalar(FAR_LEAVES_SIDE_SHADE));

        }


        // Bajty: [wierzch r g b, góra boku r g b, dół boku r g b] na rodzaj.

        this.kindColors = new Uint8Array(KINDS.length * 9);

        KINDS.forEach((kind, index) => {

            const t = top.get(kind) ?? colors.stone;
            const s = side.get(kind) ?? t;

            const u = kind === 'grass' || GRASS_KINDS.includes(kind) ? s.clone().lerp(t, GRASS_SIDE_FRINGE) : s;

            const bytes = [
                t.r, t.g, t.b,
                u.r, u.g, u.b,
                s.r * SIDE_SHADE, s.g * SIDE_SHADE, s.b * SIDE_SHADE
            ];

            bytes.forEach((value, c) => {
                this.kindColors[index * 9 + c] = colorByte(value);
            });

        });

        // Atmosfera: te same tekstury ścian i liniowe średnie co bliskie
        // bloki. Cień boku/korony i wariacja LOD nie są częścią albedo.
        // Osobna paleta zachowuje dawny wygląd modelu klasycznego.
        this.surfaceAlbedoPalette = new Uint8Array(SURFACE_MATERIAL_COUNT * 18);
        for (let id = 0; id < SURFACE_MATERIAL_COUNT; id++) {
            const type = surfaceMaterialType(id);
            const tint = FAR_GRASS_TINTS[type];
            const definition = getBlockDefinition(tint ? 'grass' : type);
            for (let face = 0; face < SURFACE_FACE_NAMES.length; face++) {
                const name = SURFACE_FACE_NAMES[face];
                const texture = definition ? getSurfaceFaceTexture(definition.textures, name) : 'stone';
                const average = (getAtlasAverage(texture) ?? colors.stone).clone();
                if (tint && name === 'top') average.multiply(new THREE.Color(...tint));
                for (const [channel, value] of average.toArray().entries()) {
                    this.surfaceAlbedoPalette[id * 18 + face * 3 + channel] = colorByte(value);
                }
            }
        }


        // Kolory po nazwie (kula Ziemi z kosmosu - GlobeMap.js).

        this.colors = colors;

        this.colorsReady = true;

        this.sendPalette();

        this.rebuildAll(false);

    }


    // Daleki teren jest rysowany, gdy sięga wyraźnie dalej niż
    // prawdziwe chunki.

    get active() {

        return this.outer > this.inner + 32;

    }


    setRange(inner, outer) {

        if (inner === this.inner && outer === this.outer) {
            return;
        }

        this.inner = inner;
        this.outer = outer;

        // Inne kafelki będą potrzebne - wybieramy je od nowa.

        this.center = null;

        if (!this.active) {
            this.hideAll();
        }

    }

    // --------------------------------------------------------
    // CO KLATKĘ: wybór kafelków i budowanie brakujących
    // --------------------------------------------------------

    update(cameraPosition) {

        this.frame++;

        if (!this.active || !this.colorsReady) {
            return;
        }

        this.updateMask(cameraPosition);


        // Wysokość kamery nad terenem (z wysoka bliskie kafelki są
        // daleko, więc mogą być mniej dokładne).

        const height = Math.max(0, cameraPosition.y - CHUNK_HEIGHT);

        if (
            !this.center ||
            Math.hypot(cameraPosition.x - this.center.x, cameraPosition.z - this.center.z) > RECENTER_DISTANCE ||
            Math.abs(height - this.center.height) > Math.max(32, this.center.height * 0.25)
        ) {

            this.center = { x: cameraPosition.x, z: cameraPosition.z, height };

            this.wanted = this.selectTiles(this.center);

        }


        // Brakujące i nieaktualne kafelki, najbliższe najpierw: najpierw
        // wysokości kratek (wątek albo po kawałku tutaj), potem siatka.

        const deadline = performance.now() + BUILD_BUDGET_MS;

        let missing = 0;

        for (const tile of this.wanted) {

            tile.usedAt = this.frame;

            if (tile.mesh && !tile.stale) {
                continue;
            }

            if (!tile.raw) {

                this.requestSamples(tile, deadline);

                if (!tile.raw) {

                    if (!tile.mesh) {
                        missing++;
                    }

                    continue;

                }

            }

            if (performance.now() >= deadline) {

                if (!tile.mesh) {
                    missing++;
                }

                continue;

            }

            this.buildMesh(tile);

        }


        // Nowy zestaw kafelków pokazujemy dopiero, gdy jest gotowy cały
        // (do tego czasu zostaje stary - kafelki leżą zawsze w tych samych
        // miejscach świata, więc stary zestaw nadal pasuje). Na początku
        // (nic jeszcze nie widać) - po kolei, co już jest.

        if (missing === 0) {

            this.showWanted();

            this.complete = true;

        }
        else if (!this.complete) {

            this.showReady();

        }

    }


    // Maska chunków z meshem wokół gracza (viewUniforms.js)
    // - od nowa, gdy zmienił się zestaw meshy albo gracz przeszedł dalej.

    updateMask(cameraPosition) {

        const world = this.world;

        const ox = Math.floor(cameraPosition.x / CHUNK_SIZE) - (CHUNK_MASK_SIZE >> 1);
        const oz = Math.floor(cameraPosition.z / CHUNK_SIZE) - (CHUNK_MASK_SIZE >> 1);

        const origin = chunkMaskUniforms.uChunkMaskOrigin.value;

        const version = world.meshVersion ?? 0;

        if (origin.x === ox && origin.y === oz && version === this.maskVersion) {
            return;
        }

        this.maskVersion = version;

        origin.set(ox, oz);

        chunkMaskData.fill(0);

        for (const chunk of world.chunks.values()) {

            const i = chunk.cx - ox;
            const j = chunk.cz - oz;

            if (chunk.mesh && i >= 0 && j >= 0 && i < CHUNK_MASK_SIZE && j < CHUNK_MASK_SIZE) {
                chunkMaskData[j * CHUNK_MASK_SIZE + i] = 255;
            }

        }

        chunkMaskUniforms.uChunkMask.value.needsUpdate = true;

    }


    // Wysokości kratek kafelka: zlecenie dla wątku albo (bez wątku)
    // liczenie tutaj - rząd po rzędzie, do końca czasu klatki.

    requestSamples(tile, deadline) {

        const ready = this.workers.filter((entry) => entry.ready);

        const waiting = ready.length === 0 && this.workers.length > 0 &&
            performance.now() - this.workersStarted < WORKER_START_MS;

        if (waiting || tile.pending) {
            return;
        }

        if (ready.length > 0 && !tile.job) {

            // Najmniej zajęty wątek (każdy liczy naraz kilka kafelków).

            const entry = ready.reduce((best, other) => other.busy < best.busy ? other : best);

            if (entry.busy >= WORKER_REQUESTS) {
                return;
            }

            const id = this.nextRequest++;

            tile.pending = id;

            entry.busy++;

            this.requests.set(id, { tile, entry });

            entry.worker.postMessage({
                type: 'tile',
                id,
                x0: tile.x0,
                z0: tile.z0,
                spacing: tile.spacing,
                cells: tile.cells
            });

            return;

        }


        const W = tile.cells + 2;

        const job = tile.job ??= {
            heights: new Int16Array(W * W),
            kinds: new Uint8Array(W * W),
            materialIds: new Uint16Array(W * W),
            row: 0
        };

        while (job.row < W && performance.now() < deadline) {

            sampleFarTile(this.generator, tile.x0, tile.z0, tile.spacing, tile.cells, job.heights, job.kinds, job.row, job.row + 1, job.materialIds);

            job.row++;

        }

        if (job.row === W) {

            tile.raw = { heights: job.heights, kinds: job.kinds, materialIds: job.materialIds };

            tile.job = null;

            tile.stale = true;

        }

    }


    // Drzewo czwórkowe: od kafelków-korzeni w dół, aż kafelek jest
    // wystarczająco dokładny jak na swoją odległość od gracza.

    selectTiles(center) {

        const result = [];

        const { rootSpacing, cells } = this.detail;

        const rootSize = rootSpacing * cells;

        const minX = Math.floor((center.x - this.outer) / rootSize);
        const maxX = Math.floor((center.x + this.outer) / rootSize);
        const minZ = Math.floor((center.z - this.outer) / rootSize);
        const maxZ = Math.floor((center.z + this.outer) / rootSize);


        for (let rz = minZ; rz <= maxZ; rz++) {

            for (let rx = minX; rx <= maxX; rx++) {

                this.visit(rootSpacing, rx * rootSize, rz * rootSize, center, result);

            }

        }


        result.sort((a, b) => a.distance - b.distance);

        return result;

    }


    visit(spacing, x0, z0, center, result) {

        const { cells, minSpacing, lodDistance } = this.detail;

        const size = spacing * cells;


        // Za granicą świata nie ma terenu.

        if (
            x0 >= WORLD_BORDER || x0 + size <= -WORLD_BORDER ||
            z0 >= WORLD_BORDER || z0 + size <= -WORLD_BORDER
        ) {
            return;
        }


        // Najbliższy i najdalszy punkt kafelka od gracza (w poziomie).

        const dx = Math.max(x0 - center.x, 0, center.x - (x0 + size));
        const dz = Math.max(z0 - center.z, 0, center.z - (z0 + size));

        const near = Math.hypot(dx, dz, center.height);

        const fx = Math.max(Math.abs(center.x - x0), Math.abs(center.x - (x0 + size)));
        const fz = Math.max(Math.abs(center.z - z0), Math.abs(center.z - (z0 + size)));

        const far = Math.hypot(fx, fz);


        // Za końcem dalekiego terenu albo w całości w zasięgu
        // prawdziwych chunków - nie jest potrzebny.

        if (Math.hypot(dx, dz) > this.outer || far < this.inner - 8) {
            return;
        }


        if (spacing > minSpacing && near < size * lodDistance) {

            const half = size / 2;

            this.visit(spacing / 2, x0, z0, center, result);
            this.visit(spacing / 2, x0 + half, z0, center, result);
            this.visit(spacing / 2, x0, z0 + half, center, result);
            this.visit(spacing / 2, x0 + half, z0 + half, center, result);

            return;

        }


        const key = `${cells}:${spacing}:${x0}:${z0}`;

        let tile = this.tiles.get(key);

        if (!tile) {

            tile = {
                key,
                cells,
                spacing,
                x0,
                z0,
                size,
                raw: null,
                workerMesh: null,
                job: null,
                pending: 0,
                mesh: null,
                stale: false,
                usedAt: 0
            };

            this.tiles.set(key, tile);

        }

        tile.distance = near;

        result.push(tile);

    }


    showWanted() {

        const wanted = new Set(this.wanted);


        for (const tile of this.shown) {

            if (!wanted.has(tile)) {
                this.scene.remove(tile.mesh);
            }

        }

        for (const tile of wanted) {

            if (!this.shown.has(tile)) {
                this.scene.add(tile.mesh);
            }

        }

        this.shown = wanted;


        // Zapomniane kafelki (dawno niepotrzebne) zwalniają pamięć - zostaje
        // zapas na powrót w to samo miejsce (pół widocznego zestawu).

        const keep = this.wanted.length + Math.max(64, this.wanted.length >> 1);

        if (this.tiles.size > keep + 32) {

            const old = [...this.tiles.values()]
                .filter((tile) => !this.shown.has(tile))
                .sort((a, b) => a.usedAt - b.usedAt);

            for (const tile of old.slice(0, this.tiles.size - keep)) {
                this.disposeTile(tile);
            }

        }

    }


    // Na początku: gotowe kafelki od razu do sceny (nie zachodzą na
    // siebie - to liście jednego drzewa czwórkowego).

    showReady() {

        for (const tile of this.wanted) {

            if (tile.mesh && !this.shown.has(tile)) {

                this.scene.add(tile.mesh);

                this.shown.add(tile);

            }

        }

    }


    hideAll() {

        for (const tile of this.shown) {
            this.scene.remove(tile.mesh);
        }

        this.shown = new Set();

        this.wanted = [];

        this.complete = false;

    }

    // --------------------------------------------------------
    // WYSOKOŚĆ TERENU W ZMIENIONYCH CHUNKACH
    // --------------------------------------------------------

    // Chunki zmienione przez gracza, które leżą w prostokącie
    // (bloki z pamięci albo z zapisu): Map "cx,cz" -> bloki.

    modifiedChunksIn(x0, z0, size) {

        const found = new Map();

        const minCx = Math.floor(x0 / CHUNK_SIZE);
        const maxCx = Math.floor((x0 + size) / CHUNK_SIZE);
        const minCz = Math.floor(z0 / CHUNK_SIZE);
        const maxCz = Math.floor((z0 + size) / CHUNK_SIZE);

        const inside = (cx, cz) => cx >= minCx && cx <= maxCx && cz >= minCz && cz <= maxCz;


        for (const [key, blocks] of this.world.savedChunks) {

            const [cx, cz] = key.split(',').map(Number);

            if (inside(cx, cz)) {
                found.set(key, blocks);
            }

        }

        for (const chunk of this.world.chunks.values()) {

            if (chunk.modified && inside(chunk.cx, chunk.cz)) {
                found.set(`${chunk.cx},${chunk.cz}`, chunk.blocks);
            }

        }

        return found;

    }


    // Wierzch kolumny (x, z): { top, kind, material } albo
    // null, gdy chunk nie był zmieniany.

    modifiedSurface(x, z, modified) {

        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);

        const blocks = modified.get(`${cx},${cz}`);

        if (!blocks) {
            return null;
        }

        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;

        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {

            const id = blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];

            if (isSolidId(id) || isLiquidId(id)) {
                const material = getBlockTypeById(id);
                return { top: y + 1, kind: BLOCK_KINDS[material] ?? 'grass', material };
            }

        }

        return { top: 0, kind: 'rock' };

    }

    // --------------------------------------------------------
    // SIATKA KAFELKA
    // --------------------------------------------------------

    // Siatka kafelka z wysokości kratek (meshFarTile w farSamples.js).
    // Zwykle gotowa z wątku; w zmienionych chunkach (ich wierzch zamiast
    // generatora) i bez wątku - składana tutaj.

    buildMesh(tile) {

        const { spacing: s, x0, z0, cells } = tile;

        const W = cells + 2;

        let mesh = tile.workerMesh;

        tile.workerMesh = null;


        const modified = this.modifiedChunksIn(x0 - s, z0 - s, tile.size + 2 * s);

        if (modified.size > 0 || !mesh) {

            let { heights, kinds, materialIds } = tile.raw;

            if (modified.size > 0) {

                heights = heights.slice();
                kinds = kinds.slice();
                materialIds = materialIds.slice();

                for (let row = 0; row < W; row++) {

                    const z = samplePosition(z0, row - 1, s);

                    for (let column = 0; column < W; column++) {

                        const surface = this.modifiedSurface(samplePosition(x0, column - 1, s), z, modified);

                        if (surface) {
                            heights[row * W + column] = surface.top;
                            kinds[row * W + column] = kindIndex(surface.kind);
                            materialIds[row * W + column] = surfaceMaterialId(surface.material ?? surface.kind);
                        }

                    }

                }

            }

            if (scratch.cells < cells) {
                scratch = createMeshScratch(cells);
            }

            mesh = meshFarTile(heights, kinds, cells, s, this.kindColors, scratch, materialIds, this.surfaceAlbedoPalette);

        }


        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 4));
        geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 4, true));
        geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 4, true));
        geometry.setAttribute('surfaceAlbedo', new THREE.BufferAttribute(mesh.surfaceAlbedo, 4, true));
        geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

        geometry.computeBoundingSphere();


        if (tile.mesh) {

            tile.mesh.geometry.dispose();

            tile.mesh.geometry = geometry;

        }
        else {

            const object = new THREE.Mesh(geometry, farMaterials[levelOf(s)]);

            object.position.set(x0, 0, z0);
            object.updateMatrix();
            object.matrixAutoUpdate = false;

            tile.mesh = object;

        }


        tile.stale = false;

    }


    // Chunk zmieniony przez gracza - kafelki nad nim przebudujemy
    // (do tego czasu widać stary kształt).

    invalidateChunk(cx, cz) {

        const x = cx * CHUNK_SIZE;
        const z = cz * CHUNK_SIZE;

        for (const tile of this.tiles.values()) {

            if (
                tile.mesh &&
                x + CHUNK_SIZE > tile.x0 - tile.spacing && x < tile.x0 + tile.size + tile.spacing &&
                z + CHUNK_SIZE > tile.z0 - tile.spacing && z < tile.z0 + tile.size + tile.spacing
            ) {
                tile.stale = true;
            }

        }

    }


    // Szczegóły (ustawienie farDetail: 1 - niskie, 2 - średnie,
    // 3 - wysokie); tryb ziemniaka: mniej kratek i mgiełka liczona
    // w wierzchołkach.

    setDetail(level, potato = false) {

        setPotatoDefine(farMaterials, potato);

        const detail = potato ? POTATO_DETAIL : DETAILS[level] ?? DETAIL;

        if (detail === this.detail) {
            return;
        }

        this.detail = detail;

        // Inne kafelki będą potrzebne - wybieramy je od nowa.

        this.center = null;

    }


    // Kolorowanie kafelków według dokładności (/horyzont lod).

    setDebugLod(on) {

        this.debugLod = on;

        lodDebug.value = on ? 1 : 0;

    }


    // Wszystko od nowa (komenda /horyzont odswiez): także wysokości
    // (samples = false - tylko siatki, np. po nowych kolorach).

    rebuildAll(samples = true) {

        for (const tile of this.tiles.values()) {

            tile.stale = true;

            tile.workerMesh = null;

            if (samples) {
                tile.raw = null;
                tile.job = null;
                tile.pending = 0;
            }

        }

        if (samples) {
            this.requests.clear();
        }

    }

    // --------------------------------------------------------
    // RYSOWANIE
    // --------------------------------------------------------

    // Rysuje daleki teren widziany z kamery gracza.

    render(renderer, camera) {

        if (!this.active || this.shown.size === 0) {
            return;
        }


        const farCamera = this.camera;

        camera.getWorldPosition(farCamera.position);
        camera.getWorldQuaternion(farCamera.quaternion);

        farCamera.fov = camera.fov;
        farCamera.aspect = camera.aspect;

        // Kąt jednego piksela (do odsuwania rogów kratek).

        const pixels = Math.max(1, renderer.domElement.height);

        pixelAngle.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / pixels;

        // Bliżej niż ułamek zasięgu widzenia nic nie widać (wycięte),
        // a daleko trzeba sięgnąć aż do rogów ekranu.

        // Z wysoka (kosmos) teren jest dalej - i niżej, bo wygina się w kulę.

        farCamera.near = Math.max(1, this.inner * 0.2, (farCamera.position.y - CHUNK_HEIGHT) * 0.2);
        farCamera.far = this.outer * 1.6 + 200 + Math.max(0, farCamera.position.y) * 1.5;

        farCamera.updateProjectionMatrix();


        renderer.render(this.scene, farCamera);

    }


    // Liczby do /horyzont i /wydajnosc.

    stats() {

        let triangles = 0;

        for (const tile of this.shown) {
            triangles += tile.mesh.geometry.index.count / 3;
        }

        return {
            active: this.active,
            shown: this.shown.size,
            wanted: this.wanted.length,
            missing: this.wanted.filter((tile) => !tile.mesh || tile.stale).length,
            cached: this.tiles.size,
            triangles,
            workers: this.workers.filter((entry) => entry.ready).length
        };

    }


    disposeTile(tile) {

        if (tile.mesh) {

            this.scene.remove(tile.mesh);

            tile.mesh.geometry.dispose();

            tile.mesh = null;

        }

        if (tile.pending) {
            this.requests.delete(tile.pending);
        }

        this.tiles.delete(tile.key);

    }


    dispose() {

        for (const tile of [...this.tiles.values()]) {
            this.disposeTile(tile);
        }

        this.shown = new Set();
        this.wanted = [];

        for (const entry of this.workers) {
            entry.worker.terminate();
        }

        this.workers = [];

        if (this.world.onModifiedChunkUnloaded) {
            this.world.onModifiedChunkUnloaded = null;
        }

    }

}


// Daleka mapa cieni (jakość cieni "Dalekie") na dalekim terenie.

export function setFarTerrainShadows(on) {

    for (const material of farMaterials) {
        setDefine(material, 'USE_FAR_SHADOWS', on);
    }

}
