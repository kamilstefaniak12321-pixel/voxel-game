import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER
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
    VIEW_GLSL
} from '../rendering/viewUniforms.js';

import {
    atlasAveragesReady,
    getAtlasAverage
} from '../rendering/TextureAtlas.js';

import { setPotatoDefine } from '../rendering/BlockRenderData.js';

// ------------------------------------------------------------
// DALEKI TEREN (HORYZONT)
//
// Za zasięgiem widzenia (gdzie kończą się prawdziwe chunki) widać
// uproszczony teren aż do odległości z ustawień "Daleki teren".
// Nie ma tu bloków ani tekstur - to gładka siatka wysokości
// policzona z tego samego generatora co chunki (TerrainGenerator),
// w średnich kolorach tekstur (trawa, ziemia, kamień), oświetlona
// tym samym światłem nieba co bloki i z mgiełką, która gęstnieje
// z odległością. Dzięki temu:
//   - za prawdziwymi chunkami "coś jest" - wzgórza i góry po
//     horyzont, w dzień jasne i niebieskawe od powietrza, wieczorem
//     i w nocy ciemne,
//   - słońce i księżyc chowają się za dalekimi górami, a nie za
//     pustą linią horyzontu.
//
// BUDOWA: teren jest podzielony na kafelki (drzewo czwórkowe).
// Każdy kafelek ma 32 x 32 kratki (DETAIL niżej); blisko gracza
// kratka ma 4 bloki, dalej 2x, 4x, 8x więcej - z daleka
// szczegółów i tak nie widać. Kafelki leżą zawsze w tych samych
// miejscach świata, więc przy chodzeniu przebudowuje się tylko
// kilka z nich (z limitem czasu na klatkę). Szczeliny między
// kafelkami różnej dokładności zasłaniają "fartuchy" - paski
// opuszczone w dół na brzegach kafelka.
//
// Chunki zmienione przez gracza (np. krater po meteorycie, budowle)
// daleki teren też pokazuje - z ich zapisanych bloków.
//
// RYSOWANIE: osobna scena rysowana po niebie, a przed światem
// (Game.render). Bliskie chunki są rysowane na wierzchu, a daleki
// teren w ich zasięgu zapada się głęboko pod ziemię (shader), więc
// nie przebija przez wykopane dziury i nie ma szczeliny na granicy.
// ------------------------------------------------------------

// Dokładność kafelków:
//   cells       - kratek na brzegu kafelka,
//   minSpacing  - najmniejsza kratka (w blokach) - blisko gracza,
//   rootSpacing - największa kratka (kafelki "korzenie" drzewa),
//   lodDistance - kafelek dzielimy na 4 mniejsze, gdy gracz jest
//                 bliżej niż (rozmiar kafelka x lodDistance).
// Więcej kratek / większe lodDistance = dokładniej, ale więcej
// trójkątów. Tryb ziemniaka ma ~9x mniej trójkątów.
const DETAIL = {
    cells: 32,
    minSpacing: 4,
    rootSpacing: 64,
    lodDistance: 1.5
};

const POTATO_DETAIL = {
    cells: 16,
    minSpacing: 8,
    rootSpacing: 128,
    lodDistance: 0.8
};

// Najmniejsza kratka w ogóle (do kolorów /horyzont lod).
const MIN_SPACING = 4;

// Ile milisekund na klatkę może zająć budowanie kafelków.
const BUILD_BUDGET_MS = 2;

// Po przejściu tylu bloków od ostatniego środka wybieramy kafelki
// od nowa.
const RECENTER_DISTANCE = 16;

// Kolory, gdyby nie dało się policzyć średnich kolorów tekstur.
const FALLBACK_COLORS = {
    grass_top: new THREE.Color(0.10, 0.22, 0.05),
    grass_side: new THREE.Color(0.16, 0.12, 0.06),
    stone: new THREE.Color(0.22, 0.22, 0.22),
    sand: new THREE.Color(0.62, 0.55, 0.33),
    water: new THREE.Color(0.03, 0.11, 0.42)
};

// Skały, które mają na dalekim terenie własny kolor (średni kolor
// wierzchu bloku). Zwykły kamień to 'rock'.

const ROCK_KINDS = ['granite', 'limestone', 'sandstone', 'slate', 'basalt', 'lepidolite'];

// Rodzaj powierzchni (generator.farSurface) -> numer w kafelku.

const KINDS = ['grass', 'rock', 'sand', 'water', ...ROCK_KINDS];

// Numer rodzaju: 'stone' to to samo co 'rock', nieznany = trawa.

function kindIndex(kind) {

    return Math.max(0, KINDS.indexOf(kind === 'stone' ? 'rock' : kind));

}

// Blok wierzchu w zmienionym chunku -> rodzaj powierzchni
// (inne bloki - jak trawa).

const BLOCK_KINDS = {
    stone: 'rock',
    sand: 'sand',
    water: 'water'
};

for (const rock of ROCK_KINDS) {
    BLOCK_KINDS[rock] = rock;
}


// ------------------------------------------------------------
// MATERIAŁ - zwykły materiał z oświetleniem (jak bloki), z kolorem
// w wierzchołkach i z dopiskami w shaderze:
//   - środek (tam są prawdziwe chunki) zapada się pod ziemię, a to,
//     co za końcem dalekiego terenu, jest wycięte,
//   - nocne odbarwienie i suwak jasności - tak jak na blokach,
//   - mgiełka w kolorze nieba zamiast zwykłej mgły.
// ------------------------------------------------------------

// Kolorowanie kafelków według dokładności (komenda /horyzont lod):
// czerwony - kratka 4 bloki, niebieski - 8, żółty - 16, zielony - 32,
// fioletowy - 64. Każda dokładność ma własny materiał (ten sam shader),
// bo wspólny materiał dostaje wartości tylko raz na klatkę.

const LOD_COLORS = [
    new THREE.Color('#ff4040'),
    new THREE.Color('#4080ff'),
    new THREE.Color('#ffe040'),
    new THREE.Color('#40ff60'),
    new THREE.Color('#d060ff')
];

// O ile bloków w dół zapada się daleki teren w zasięgu prawdziwych
// chunków (patrz shader niżej).

const SINK_DEPTH = 48;

const lodDebug = { value: 0 };


function createFarMaterial(lodColor) {

    // Tylko przednie strony trójkątów - tylne (odwrócone od gracza
    // zbocza gór, środek fartuchów) karta graficzna od razu pomija.

    const material = new THREE.MeshLambertMaterial({
        vertexColors: true
    });


    material.onBeforeCompile = (shader) => {

        Object.assign(shader.uniforms, skyUniforms, viewUniforms, {
            uLodTint: { value: lodColor },
            uLodDebug: lodDebug
        });


        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vFarWorld;
                uniform float uFarInner;

                // Tryb ziemniaka: kolor mgiełki liczony w wierzchołkach.

                #ifdef POTATO
                    varying vec3 vHazeSky;
                    uniform float uFogBrightness;
                    ${SKY_COLOR_GLSL}
                #endif`
            )
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>

                // W zasięgu prawdziwych chunków daleki teren zapada się
                // głęboko pod ziemię (chunki rysują się na nim). Dzięki
                // temu na granicy nie ma szczeliny, przez którą widać
                // by niebo - zamiast niej jest stromy, schowany stok.

                vec3 farWorldVertex = (modelMatrix * vec4(transformed, 1.0)).xyz;

                if (length(farWorldVertex.xz - cameraPosition.xz) < uFarInner) {
                    transformed.y -= ${SINK_DEPTH.toFixed(1)};
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
                uniform float uFogBrightness;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                uniform vec3 uLodTint;
                uniform float uLodDebug;
                ${SKY_COLOR_GLSL}
                ${VIEW_GLSL}

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

                // Za końcem dalekiego terenu - niebo (okrągły horyzont).

                if (length(vFarWorld.xz - cameraPosition.xz) > uFarOuter) {
                    discard;
                }`
            )
            .replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                diffuseColor.rgb *= mix(vec3(1.0), uLodTint, uLodDebug);`
            )
            .replace(
                '#include <opaque_fragment>',
                `float skyLuminance = dot(outgoingLight, VIEW_LUMINANCE);

                outgoingLight = mix(outgoingLight, skyLuminance * uNightTint, uNightDesaturation);

                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);

                #include <opaque_fragment>`
            )
            .replace(
                '#include <fog_fragment>',
                `vec3 farDirection = vFarWorld - cameraPosition;

                vec3 hazeSky = HAZE_SKY;

                gl_FragColor.rgb = mix(
                    gl_FragColor.rgb,
                    linearToOutputTexel(vec4(hazeSky, 1.0)).rgb,
                    farHaze(length(farDirection.xz))
                );`
            );

    };


    return material;

}


// Materiał dla każdej dokładności (indeks = poziom: 0 - kratka 4 bloki).

const farMaterials = LOD_COLORS.map((color) => createFarMaterial(color));


function smoothstep(edge0, edge1, x) {

    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}

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


        // Kafelki: klucz "kratka:x:z" -> kafelek
        // { key, spacing, x0, z0, size, distance, mesh, stale, usedAt }

        this.tiles = new Map();

        // Kafelki, które powinny być widoczne (najbliższe najpierw)
        // i te, które naprawdę są w scenie.

        this.wanted = [];
        this.shown = new Set();

        this.center = null;

        this.frame = 0;

        // Kolorowanie kafelków według dokładności (/horyzont lod).

        this.debugLod = false;

        // Jak dokładne są kafelki (tryb ziemniaka - rzadsza siatka).

        this.detail = DETAIL;


        // Kolory czekają na policzenie średnich kolorów tekstur.

        this.colorsReady = false;

        atlasAveragesReady.then(() => {

            this.colors = {};

            for (const name of Object.keys(FALLBACK_COLORS)) {
                this.colors[name] = getAtlasAverage(name) ?? FALLBACK_COLORS[name];
            }


            // Skały: średni kolor tekstury wierzchu bloku.

            for (const rock of ROCK_KINDS) {

                const textures = getBlockDefinition(rock)?.textures ?? {};

                this.colors[rock] =
                    getAtlasAverage(textures.top ?? textures.all) ?? this.colors.stone;

            }

            this.colorsReady = true;

        });


        // Chunk zmieniony przez gracza znika z pamięci - kafelki nad
        // nim trzeba przebudować, żeby pokazały jego nowy kształt.

        world.onModifiedChunkUnloaded = (chunk) => this.invalidateChunk(chunk.cx, chunk.cz);

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


        if (
            !this.center ||
            Math.hypot(cameraPosition.x - this.center.x, cameraPosition.z - this.center.z) > RECENTER_DISTANCE
        ) {

            this.center = { x: cameraPosition.x, z: cameraPosition.z };

            this.wanted = this.selectTiles(this.center);

        }


        // Budujemy brakujące i nieaktualne kafelki, najbliższe najpierw.

        const deadline = performance.now() + BUILD_BUDGET_MS;

        let missing = 0;

        for (const tile of this.wanted) {

            tile.usedAt = this.frame;

            if (tile.mesh && !tile.stale) {
                continue;
            }

            if (performance.now() >= deadline) {

                if (!tile.mesh) {
                    missing++;
                }

                continue;

            }

            this.buildTile(tile);

        }


        // Nowy zestaw kafelków pokazujemy dopiero, gdy jest gotowy cały
        // (do tego czasu zostaje stary - kafelki leżą zawsze w tych samych
        // miejscach świata, więc stary zestaw nadal pasuje).

        if (missing === 0) {
            this.showWanted();
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

        const near = Math.hypot(dx, dz);

        const fx = Math.max(Math.abs(center.x - x0), Math.abs(center.x - (x0 + size)));
        const fz = Math.max(Math.abs(center.z - z0), Math.abs(center.z - (z0 + size)));

        const far = Math.hypot(fx, fz);


        // Za końcem dalekiego terenu albo w całości w zasięgu
        // prawdziwych chunków - nie jest potrzebny.

        if (near > this.outer || far < this.inner - 8) {
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


        // Zapomniane kafelki (dawno niepotrzebne) zwalniają pamięć.

        if (this.tiles.size > this.wanted.length * 2 + 64) {

            const old = [...this.tiles.values()]
                .filter((tile) => !this.shown.has(tile))
                .sort((a, b) => a.usedAt - b.usedAt);

            for (const tile of old.slice(0, this.tiles.size - this.wanted.length * 2)) {
                this.disposeTile(tile);
            }

        }

    }


    hideAll() {

        for (const tile of this.shown) {
            this.scene.remove(tile.mesh);
        }

        this.shown = new Set();

        this.wanted = [];

    }

    // --------------------------------------------------------
    // WYSOKOŚĆ TERENU
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


    // Wierzch terenu w kolumnie (x, z): { top, kind } - top = y nad
    // najwyższym blokiem (albo nad wodą), kind = rodzaj powierzchni
    // ('grass', 'rock', 'sand', 'water' albo skała: 'granite',
    // 'limestone'... - KINDS). spacing = jak gęsto
    // próbkujemy (mniej szczegółów przy rzadszych próbkach).

    surfaceAt(x, z, spacing, modified) {

        if (modified.size > 0) {

            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);

            const blocks = modified.get(`${cx},${cz}`);

            if (blocks) {

                const lx = x - cx * CHUNK_SIZE;
                const lz = z - cz * CHUNK_SIZE;

                for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {

                    const id = blocks[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];

                    if (isSolidId(id) || isLiquidId(id)) {
                        return { top: y + 1, kind: BLOCK_KINDS[getBlockTypeById(id)] ?? 'grass' };
                    }

                }

                return { top: 0, kind: 'rock' };

            }

        }


        return this.generator.farSurface(x, z, spacing);

    }

    // --------------------------------------------------------
    // BUDOWANIE KAFELKA
    // --------------------------------------------------------

    buildTile(tile) {

        const { spacing, x0, z0 } = tile;

        const N = tile.cells;

        // Wysokości z ramką jednej próbki dookoła (do normalnych).

        const W = N + 3;

        const heights = new Float32Array(W * W);

        const kinds = new Uint8Array(W * W);

        const modified = this.modifiedChunksIn(x0 - spacing, z0 - spacing, tile.size + 2 * spacing);


        for (let j = 0; j < W; j++) {

            for (let i = 0; i < W; i++) {

                const x = Math.max(-WORLD_BORDER, Math.min(WORLD_BORDER - 1, x0 + (i - 1) * spacing));
                const z = Math.max(-WORLD_BORDER, Math.min(WORLD_BORDER - 1, z0 + (j - 1) * spacing));

                const surface = this.surfaceAt(x, z, spacing, modified);

                heights[j * W + i] = surface.top;
                kinds[j * W + i] = kindIndex(surface.kind);

            }

        }


        const height = (i, j) => heights[(j + 1) * W + (i + 1)];

        const kindAt = (i, j) => KINDS[kinds[(j + 1) * W + (i + 1)]];


        // Wierzchołki: siatka (N+1) x (N+1) i fartuchy na 4 brzegach.

        const gridCount = (N + 1) * (N + 1);
        const skirtCount = 4 * (N + 1);
        const vertexCount = gridCount + skirtCount;

        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);


        const { grass_top: grass, grass_side: side, stone, sand, water } = this.colors;

        const normal = new THREE.Vector3();

        const color = new THREE.Color();


        for (let j = 0; j <= N; j++) {

            for (let i = 0; i <= N; i++) {

                const v = j * (N + 1) + i;

                const h = height(i, j);


                // Środek bloku (x + 0.5), wierzch terenu na wysokości h.

                positions[v * 3] = i * spacing + 0.5;
                positions[v * 3 + 1] = h;
                positions[v * 3 + 2] = j * spacing + 0.5;


                normal.set(
                    height(i - 1, j) - height(i + 1, j),
                    2 * spacing,
                    height(i, j - 1) - height(i, j + 1)
                ).normalize();

                normals[v * 3] = normal.x;
                normals[v * 3 + 1] = normal.y;
                normals[v * 3 + 2] = normal.z;


                // Kolor z rodzaju powierzchni (generator); trawa na
                // stromych zboczach - ziemia (boki trawy).

                const kind = kindAt(i, j);

                if (kind === 'water') {
                    color.copy(water);
                }
                else if (kind === 'sand') {
                    color.copy(sand);
                }
                else if (kind === 'rock') {
                    color.copy(stone);
                }
                else if (kind !== 'grass') {
                    color.copy(this.colors[kind] ?? stone);
                }
                else {
                    color.copy(grass).lerp(side, smoothstep(0.3, 0.75, 1 - normal.y));
                }

                colors[v * 3] = color.r;
                colors[v * 3 + 1] = color.g;
                colors[v * 3 + 2] = color.b;

            }

        }


        // Fartuchy: kopie brzegowych wierzchołków opuszczone w dół.

        const skirtDepth = spacing * 2 + 4;

        const edges = [
            (k) => k,                         // z = 0
            (k) => N * (N + 1) + k,           // z = N
            (k) => k * (N + 1),               // x = 0
            (k) => k * (N + 1) + N            // x = N
        ];

        for (let e = 0; e < 4; e++) {

            for (let k = 0; k <= N; k++) {

                const from = edges[e](k);
                const to = gridCount + e * (N + 1) + k;

                for (let c = 0; c < 3; c++) {

                    positions[to * 3 + c] = positions[from * 3 + c];
                    normals[to * 3 + c] = normals[from * 3 + c];
                    colors[to * 3 + c] = colors[from * 3 + c];

                }

                positions[to * 3 + 1] -= skirtDepth;

            }

        }


        // Trójkąty siatki i fartuchów.

        const indices = new Uint16Array(N * N * 6 + 4 * N * 6);

        let n = 0;

        for (let j = 0; j < N; j++) {

            for (let i = 0; i < N; i++) {

                const a = j * (N + 1) + i;
                const b = a + (N + 1);
                const c = a + 1;
                const d = b + 1;

                indices[n++] = a; indices[n++] = b; indices[n++] = c;
                indices[n++] = c; indices[n++] = b; indices[n++] = d;

            }

        }

        // Fartuch jest widoczny od zewnątrz kafelka (tam jest szczelina
        // do zasłonięcia), więc trójkąty są skierowane na zewnątrz.

        for (let e = 0; e < 4; e++) {

            const outward = e === 1 || e === 2;

            for (let k = 0; k < N; k++) {

                const a = edges[e](k);
                const b = edges[e](k + 1);
                const c = gridCount + e * (N + 1) + k;
                const d = c + 1;

                if (outward) {
                    indices[n++] = a; indices[n++] = c; indices[n++] = b;
                    indices[n++] = b; indices[n++] = c; indices[n++] = d;
                }
                else {
                    indices[n++] = a; indices[n++] = b; indices[n++] = c;
                    indices[n++] = b; indices[n++] = d; indices[n++] = c;
                }

            }

        }


        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        geometry.computeBoundingSphere();


        if (tile.mesh) {

            tile.mesh.geometry.dispose();

            tile.mesh.geometry = geometry;

        }
        else {

            const level = Math.min(
                farMaterials.length - 1,
                Math.round(Math.log2(spacing / MIN_SPACING))
            );

            const mesh = new THREE.Mesh(geometry, farMaterials[level]);

            mesh.position.set(x0, 0, z0);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;

            tile.mesh = mesh;

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


    // Tryb ziemniaka: rzadsza siatka kafelków i mgiełka liczona
    // w wierzchołkach.

    setLowDetail(on) {

        const detail = on ? POTATO_DETAIL : DETAIL;

        if (detail === this.detail) {
            return;
        }

        this.detail = detail;

        setPotatoDefine(farMaterials, on);

        // Inne kafelki będą potrzebne - wybieramy je od nowa.

        this.center = null;

    }


    // Kolorowanie kafelków według dokładności (/horyzont lod):
    // czerwony - najdokładniejsze, potem niebieski, żółty, zielony...

    setDebugLod(on) {

        this.debugLod = on;

        lodDebug.value = on ? 1 : 0;

    }


    // Wszystko od nowa (komenda /horyzont odswiez).

    rebuildAll() {

        for (const tile of this.tiles.values()) {
            tile.stale = true;
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

        // Bliżej niż ułamek zasięgu widzenia nic nie widać (wycięte),
        // a daleko trzeba sięgnąć aż do rogów ekranu.

        farCamera.near = Math.max(1, this.inner * 0.2);
        farCamera.far = this.outer * 1.6 + 200;

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
            triangles
        };

    }


    disposeTile(tile) {

        if (tile.mesh) {

            this.scene.remove(tile.mesh);

            tile.mesh.geometry.dispose();

            tile.mesh = null;

        }

        this.tiles.delete(tile.key);

    }


    dispose() {

        for (const tile of [...this.tiles.values()]) {
            this.disposeTile(tile);
        }

        this.shown = new Set();
        this.wanted = [];

        if (this.world.onModifiedChunkUnloaded) {
            this.world.onModifiedChunkUnloaded = null;
        }

    }

}
