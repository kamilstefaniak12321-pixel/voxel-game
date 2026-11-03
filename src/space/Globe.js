import * as THREE from 'three';
import { lightingUniforms } from '../rendering/LightingDiagnostics.js';

import { SEA_LEVEL, GLOBE_RADIUS } from '../config.js';

import { skyUniforms, SKY_COLOR_GLSL } from '../sky/skyShader.js';

import { viewUniforms, VIEW_GLSL, GLOBE_LIGHT_GLSL } from '../rendering/viewUniforms.js';

import { GlobeMapPair } from './GlobeMap.js';

// ------------------------------------------------------------
// KULA ZIEMI (widok z kosmosu)
//
// Świat jest płaski, więc z wysoka zawijamy go w kulę: miejsce pod
// graczem to "biegun widoku", a im dalej od niego, tym niżej leży
// teren (daleki teren wygina się tak samo - viewUniforms.uCurvature).
// Punkt na kuli w odległości łuku L w danym kierunku to punkt świata
// L bloków w tym kierunku od gracza. Za końcem dalekiego terenu kulę
// maluje mapa z generatora (GlobeMap.js).
//
// Kula nie jest siatką trójkątów: dla każdego piksela ekranu shader
// liczy, gdzie promień z kamery trafia w kulę (dokładnie, przy każdej
// wielkości kuli). Dwa przejścia:
//   1. powierzchnia (przed dalekim terenem): kolor z mapy (bliżej
//      z dokładniejszej - GlobeMapPair), góry
//      cieniowane z wysokości, słońce dla każdego miejsca osobno
//      (więc widać granicę dnia i nocy), połysk morza, czapy lodowe,
//      mgiełka powietrza i poświata atmosfery na brzegu kuli,
//   2. chmury (po dalekim terenie, więc są też nad nim).
// ------------------------------------------------------------

// Mapa: teksele na bok i pół boku w blokach (trochę więcej niż
// ćwierć obwodu kuli - tyle najwyżej widać z kosmosu).

const MAP_SIZE = 512;
const MAP_SIZE_POTATO = 256;
const MAP_HALF = Math.ceil(GLOBE_RADIUS * Math.PI / 2 / 512) * 512 + 1024;

// Ile milisekund na klatkę na liczenie mapy.

const MAP_BUDGET_MS = 4;

// Nowa mapa, gdy gracz odleci tyle bloków od środka obecnej.

const MAP_RECENTER = 1500;

// Co ile klatek wysyłamy policzone kawałki mapy do karty graficznej.

const UPLOAD_FRAMES = 12;

// Grubość świecącej warstwy atmosfery (bloki).

const ATMOSPHERE = 140;


const vertexShader = /* glsl */ `
    varying vec2 vNdc;

    void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;


const commonShader = /* glsl */ `
    uniform float uLightingNatural;
    uniform mat4 uProjectionInverse;
    uniform mat4 uCameraMatrix;
    uniform float uHeight;
    uniform vec2 uCameraXZ;
    uniform sampler2D uMapColor;
    uniform sampler2D uMapHeight;
    uniform sampler2D uNearColor;
    uniform sampler2D uNearHeight;
    uniform vec2 uMapOffset;
    uniform float uMapSize;
    uniform float uMapTexel;
    uniform float uMapBlocks;
    uniform float uTime;
    uniform float uVisibility;
    uniform float uSpaceGlow;
    uniform float uClouds;
    uniform float uFogBrightness;
    uniform float uNightDesaturation;
    uniform vec3 uNightTint;
    uniform vec3 uWorldAmbient;
    uniform vec3 uWorldSun;
    uniform vec3 uWorldMoon;
    uniform vec3 uMoonDirection;

    ${SKY_COLOR_GLSL}
    ${VIEW_GLSL}
    ${GLOBE_LIGHT_GLSL}

    varying vec2 vNdc;

    const float ATMOSPHERE = ${ATMOSPHERE.toFixed(1)};


    // Kierunek promienia z kamery przez ten piksel (w świecie).

    vec3 viewRay() {

        vec4 view = uProjectionInverse * vec4(vNdc, 1.0, 1.0);

        return normalize((uCameraMatrix * vec4(view.xyz / view.w, 0.0)).xyz);

    }


    // Trafienie w kulę o promieniu R = 1 / uCurvature (VIEW_GLSL - to
    // samo zgięcie co na dalekim terenie), styczną do
    // poziomu morza pod kamerą (kamera uHeight bloków nad nim).
    // q - punkt trafienia względem środka kuli, t - odległość.
    // Liczone tak, żeby nie gubić dokładności przy ogromnej kuli.

    bool hitGlobe(vec3 dir, out float t, out vec3 q) {

        float R = 1.0 / uCurvature;
        float h = uHeight;

        float b = dir.y * (h + R);

        if (b >= 0.0) return false;

        float c = h * (h + 2.0 * R);

        float disc = b * b - c;

        if (disc < 0.0) return false;

        t = c / (-b + sqrt(disc));

        q = vec3(t * dir.x, (h + R) + t * dir.y, t * dir.z);

        return true;

    }


    // Punkt kuli -> przesunięcie w świecie od miejsca pod kamerą
    // (łuk w tym samym kierunku), kąt od "bieguna widoku" i kierunek.

    vec2 globeOffset(vec3 q, out float theta, out vec2 u) {

        float across = length(q.xz);

        theta = atan(across, q.y);

        u = across > 1e-6 ? q.xz / across : vec2(1.0, 0.0);

        return u * theta / uCurvature;

    }


    // Wektor z płaskiego świata obrócony na kulę (w punkcie theta, u).

    vec3 onGlobe(vec3 v, vec2 u, float theta) {

        float along = dot(v.xz, u);

        float s = sin(theta);
        float c = cos(theta);

        float along2 = along * c + v.y * s;

        return vec3(v.x + u.x * (along2 - along), -along * s + v.y * c, v.z + u.y * (along2 - along));

    }


    float hash12(vec2 p) {

        vec3 p3 = fract(vec3(p.xyx) * 0.1031);

        p3 += dot(p3, p3.yzx + 33.33);

        return fract((p3.x + p3.y) * p3.z);

    }

    float valueNoise2(vec2 p) {

        vec2 i = floor(p);
        vec2 f = fract(p);

        f = f * f * (3.0 - 2.0 * f);

        return mix(
            mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
            mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
            f.y
        );

    }

    float fbmNoise2(vec2 p, int octaves) {

        float sum = 0.0;
        float amplitude = 0.5;

        for (int i = 0; i < 6; i++) {

            if (i >= octaves) break;

            sum += valueNoise2(p) * amplitude;

            p = p * 2.03 + vec2(17.1, 9.7);

            amplitude *= 0.5;

        }

        return sum;

    }


    // Mapa w punkcie offset (od miejsca pod kamerą): kolor (alfa = morze)
    // i nachylenie terenu (do cieniowania gór). W środku z bliskiej,
    // dokładniejszej mapy, dalej z dalekiej. edge - jak daleko od
    // środka dalekiej mapy (0.5 = jej brzeg).

    vec4 mapTexel(sampler2D colors, sampler2D heights, vec2 uv, float blocks, out vec2 slope) {

        float scale = 127.5 / (2.0 * blocks) * 1.4;

        slope = vec2(
            texture2D(heights, uv + vec2(uMapTexel, 0.0)).r - texture2D(heights, uv - vec2(uMapTexel, 0.0)).r,
            texture2D(heights, uv + vec2(0.0, uMapTexel)).r - texture2D(heights, uv - vec2(0.0, uMapTexel)).r
        ) * scale;

        return texture2D(colors, uv);

    }

    vec4 sampleMap(vec2 offset, out vec2 slope, out float edge) {

        vec2 uv = (offset - uMapOffset) / uMapSize + 0.5;

        edge = max(abs(uv.x - 0.5), abs(uv.y - 0.5));

        vec4 texel = mapTexel(uMapColor, uMapHeight, uv, uMapBlocks, slope);

        vec2 nearUv = (uv - 0.5) * 2.0 + 0.5;

        float nearWeight = 1.0 - smoothstep(0.4, 0.48, edge * 2.0);

        if (nearWeight > 0.0) {

            vec2 nearSlope;

            vec4 nearTexel = mapTexel(uNearColor, uNearHeight, nearUv, uMapBlocks * 0.5, nearSlope);

            texel = mix(texel, nearTexel, nearWeight);
            slope = mix(slope, nearSlope, nearWeight);

        }

        return texel;

    }


    // Mgiełka (z VIEW_GLSL - ta sama co na dalekim terenie) w kolorze
    // powietrza; tam, gdzie jest noc, ciemna.

    vec3 hazeColor(vec3 dir, float sunHeight) {

        return skyColor(dir) * uFogBrightness * hazeScale(sunHeight);

    }
`;


const surfaceShader = /* glsl */ `
    ${commonShader}

    // Poświata atmosfery wokół kuli (promień mija kulę).

    vec3 limbGlow(vec3 dir) {

        float R = 1.0 / uCurvature;
        float h = uHeight;

        float b = dir.y * (h + R);

        // Najbliższy środka kuli punkt promienia.

        float tc = max(-b, 0.0);

        vec3 closest = vec3(tc * dir.x, (h + R) + tc * dir.y, tc * dir.z);

        float altitude = (b < 0.0 ? (h + R) * length(dir.xz) : h + R) - R;

        float glow = exp(-max(altitude, 0.0) / (ATMOSPHERE * 0.32));

        float sunHeight = dot(normalize(closest), uSunDirection);

        vec3 day = vec3(0.32, 0.58, 1.0) * smoothstep(-0.08, 0.35, sunHeight);

        vec3 dusk = vec3(1.0, 0.42, 0.16) * exp(-pow((sunHeight - 0.02) / 0.1, 2.0)) * 0.9;

        float forward = 1.0 + 2.5 * pow(max(dot(dir, uSunDirection), 0.0), 10.0);

        return (day + dusk) * glow * forward * uSpaceGlow;

    }


    void main() {

        vec3 dir = viewRay();

        float t;
        vec3 q;

        if (!hitGlobe(dir, t, q)) {

            vec3 glow = limbGlow(dir);

            if (max(glow.r, max(glow.g, glow.b)) < 0.002) discard;

            gl_FragColor = vec4(glow, 0.0);

            #include <colorspace_fragment>

            return;

        }


        float theta;
        vec2 u;

        vec2 offset = globeOffset(q, theta, u);

        vec3 n = normalize(q);


        // Mapa (poza nią kula znika - za daleko).

        vec2 slope;
        float edge;

        vec4 texel = sampleMap(offset, slope, edge);

        float alpha = uVisibility * (1.0 - smoothstep(0.45, 0.5, edge));

        if (alpha < 0.002) discard;

        vec3 albedo = texel.rgb;

        float water = texel.a;


        // Góry: nachylenie z mapy (morze płaskie).

        vec3 flatNormal = normalize(vec3(-slope.x * (1.0 - water), 1.0, -slope.y * (1.0 - water)));

        vec3 normal = onGlobe(flatNormal, u, theta);


        // Czapy lodowe na "biegunach" (północ i południe od gracza).

        vec2 worldXZ = uCameraXZ + offset;

        float iceNoise = fbmNoise2(worldXZ / 700.0, 3) - 0.5;

        float ice = smoothstep(0.83, 0.85, abs(n.z) + 0.08 * iceNoise);

        albedo = mix(albedo, vec3(0.8, 0.86, 0.92), ice);

        water *= 1.0 - ice;


        // Światło: to samo co na świecie u gracza (otoczenie, słońce,
        // księżyc), plus różnica pory dnia między tym miejscem kuli
        // a graczem (VIEW_GLSL) - tak samo jak na dalekim terenie.

        vec3 L = uSunDirection;

        float sunHeight = dot(n, L);

        float playerSun = L.y;

        float sunFacing = max(dot(normal, L), 0.0);

        vec3 light =
            uWorldAmbient +
            uWorldSun * sunFacing +
            uWorldMoon * max(dot(normal, uMoonDirection), 0.0) +
            daylightAmbient(sunHeight) - daylightAmbient(playerSun) +
            (daylightSun(sunHeight) - daylightSun(playerSun)) * sunFacing;

        vec3 color = albedo * max(light, vec3(0.0)) / 3.14159265;

        float nightDesaturation = uLightingNatural > 0.5 ? 0.0 : clamp(uNightDesaturation + daylightNight(sunHeight) - daylightNight(playerSun), 0.0, 1.0);

        color = mix(color, dot(color, VIEW_LUMINANCE) * uNightTint, nightDesaturation);


        // Połysk słońca na morzu.

        float sunUp = smoothstep(-0.02, 0.22, sunHeight);

        vec3 sunColor = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.96, 0.88), smoothstep(0.0, 0.3, sunHeight));

        float glint = pow(max(dot(reflect(dir, normal), L), 0.0), 90.0);

        color += sunColor * glint * water * sunUp * 0.5;


        // Mgiełka powietrza (z wysoka cienka, przy brzegu kuli gęsta) -
        // mieszana w kolorach ekranu, tak jak na dalekim terenie.

        gl_FragColor = vec4(color, 1.0);

        #include <colorspace_fragment>

        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(hazeColor(dir, sunHeight), 1.0)).rgb, hazeAlong(t));

        gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);

    }
`;


const cloudShader = /* glsl */ `
    ${commonShader}

    void main() {

        vec3 dir = viewRay();

        float t;
        vec3 q;

        if (!hitGlobe(dir, t, q)) discard;

        float theta;
        vec2 u;

        vec2 offset = globeOffset(q, theta, u);

        vec3 n = normalize(q);


        // Chmury przesuwają się z wiatrem nad światem. Wzór jest
        // "zawirowany" (szum przesunięty innym szumem), żeby były
        // smugi i zawijasy, a nie okrągłe plamy.

        vec2 worldXZ = uCameraXZ + offset;

        vec2 p = worldXZ / 420.0 + vec2(uTime * 0.01, uTime * 0.004);

        vec2 warp = vec2(fbmNoise2(p * 0.5 + vec2(3.1, 7.4), 3), fbmNoise2(p * 0.5 + vec2(8.3, 1.7), 3));

        float density = fbmNoise2(p + (warp - 0.5) * 2.2, 5);

        float cover = smoothstep(0.53, 0.68, density);

        float alpha = cover * uClouds * 0.85;

        if (alpha < 0.003) discard;


        // Oświetlone słońcem tego miejsca (różowe o zmierzchu).

        float sunHeight = dot(n, uSunDirection);

        float lit = clamp(sunHeight * 2.5 + 0.2, 0.0, 1.0);

        vec3 color = mix(vec3(0.03, 0.035, 0.05), vec3(0.95), lit);

        color *= mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(-0.02, 0.12, sunHeight));

        gl_FragColor = vec4(color, 1.0);

        #include <colorspace_fragment>

        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(hazeColor(dir, sunHeight), 1.0)).rgb, hazeAlong(t) * 0.6);

        gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);

    }
`;


function createMaterial(uniforms, fragmentShader) {

    const material = new THREE.ShaderMaterial({

        uniforms,
        vertexShader,
        fragmentShader,

        transparent: true,
        depthTest: false,
        depthWrite: false,

        // Kolor już pomnożony przez przezroczystość.

        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor

    });

    return material;

}


export class Globe {

    constructor(game) {

        this.game = game;

        this.potato = false;

        this.map = new GlobeMapPair(MAP_SIZE, MAP_HALF);

        // Nowa mapa liczy się obok, stara jest pokazywana do czasu,
        // aż nowa ma pierwszy przebieg.

        this.nextMap = null;

        this.frame = 0;

        this.uploadedOnce = false;


        this.uniforms = {

            ...skyUniforms,
            ...viewUniforms,
            ...lightingUniforms,

            uProjectionInverse: { value: new THREE.Matrix4() },
            uCameraMatrix: { value: new THREE.Matrix4() },
            uHeight: { value: 1 },
            uCameraXZ: { value: new THREE.Vector2() },
            uMapColor: { value: this.map.far.colorTexture },
            uMapHeight: { value: this.map.far.heightTexture },
            uNearColor: { value: this.map.near.colorTexture },
            uNearHeight: { value: this.map.near.heightTexture },
            uMapOffset: { value: new THREE.Vector2() },
            uMapSize: { value: 2 * MAP_HALF },
            uMapTexel: { value: 1 / MAP_SIZE },
            uMapBlocks: { value: this.map.far.texel },
            uTime: { value: 0 },
            uVisibility: { value: 0 },
            uSpaceGlow: { value: 0 },
            uClouds: { value: 0 },
            uWorldAmbient: { value: new THREE.Color() },
            uWorldSun: { value: new THREE.Color() },
            uWorldMoon: { value: new THREE.Color() },
            uMoonDirection: { value: new THREE.Vector3() }

        };


        const geometry = new THREE.PlaneGeometry(2, 2);

        this.surface = new THREE.Mesh(geometry, createMaterial(this.uniforms, surfaceShader));
        this.clouds = new THREE.Mesh(geometry, createMaterial(this.uniforms, cloudShader));

        for (const mesh of [this.surface, this.clouds]) {
            mesh.frustumCulled = false;
        }

        this.surfaceScene = new THREE.Scene();
        this.surfaceScene.add(this.surface);

        this.cloudScene = new THREE.Scene();
        this.cloudScene.add(this.clouds);


        // Ustawia SpaceView co klatkę (zgięcie kuli: viewUniforms.uCurvature).

        this.visibility = 0;
        this.spaceGlow = 0;
        this.cloudAmount = 0;

        this.time = 0;

    }


    // Tryb ziemniaka: mniejsza mapa, bez chmur.

    setLowDetail(on) {

        this.potato = on;

        const size = on ? MAP_SIZE_POTATO : MAP_SIZE;

        if (this.map.size !== size && !this.map.center) {

            this.map.dispose();

            this.useMap(new GlobeMapPair(size, MAP_HALF));

        }

    }


    useMap(map) {

        this.map = map;

        this.uniforms.uMapColor.value = map.far.colorTexture;
        this.uniforms.uMapHeight.value = map.far.heightTexture;
        this.uniforms.uNearColor.value = map.near.colorTexture;
        this.uniforms.uNearHeight.value = map.near.heightTexture;
        this.uniforms.uMapTexel.value = 1 / map.size;
        this.uniforms.uMapBlocks.value = map.far.texel;

        this.uploadedOnce = false;

    }


    // Co klatkę: liczenie mapy (gdy gracz jest wysoko - wantMap).

    update(dt, cameraPosition, wantMap) {

        this.time += dt;

        this.frame++;

        if (!wantMap) {
            return;
        }

        const generator = this.game.world.generator;

        const colors = this.game.farTerrain.colorsReady ? this.game.farTerrain.colors : null;


        // Pierwsza mapa albo nowa, bo gracz odleciał daleko.

        const map = this.map;

        if (!map.center) {
            map.start(cameraPosition.x, cameraPosition.z);
        }
        else if (
            !this.nextMap &&
            Math.max(Math.abs(cameraPosition.x - map.center.x), Math.abs(cameraPosition.z - map.center.z)) > MAP_RECENTER
        ) {

            this.nextMap = new GlobeMapPair(this.potato ? MAP_SIZE_POTATO : MAP_SIZE, MAP_HALF);

            this.nextMap.start(cameraPosition.x, cameraPosition.z);

        }


        if (this.nextMap) {

            this.nextMap.build(generator, colors, MAP_BUDGET_MS);

            if (this.nextMap.ready) {

                this.nextMap.upload();

                this.map.dispose();

                this.useMap(this.nextMap);

                this.nextMap = null;

            }

        }
        else if (!map.complete) {

            map.build(generator, colors, MAP_BUDGET_MS);

        }


        // Wysyłanie do karty co kilka klatek (i od razu po pierwszym
        // przebiegu albo na końcu).

        if (this.map.dirty && (this.frame % UPLOAD_FRAMES === 0 || this.map.complete || !this.uploadedOnce)) {

            this.map.upload();

            this.uploadedOnce = this.map.ready;

        }

    }


    // Jak daleko (łukiem od gracza) sięga kula, zanim zniknie na
    // brzegu mapy.

    get mapReach() {

        return MAP_HALF * 0.9;

    }


    // Czy jest co rysować.

    get drawable() {

        return viewUniforms.uCurvature.value > 0 && this.visibility > 0.001 && this.map.ready;

    }


    // Ustawienia shadera z kamery (tej, z której rysujemy - z trzeciej
    // osoby to kamera za graczem).

    setupUniforms(camera) {

        const u = this.uniforms;

        u.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
        u.uCameraMatrix.value.copy(camera.matrixWorld);

        const position = camera.position;

        u.uHeight.value = Math.max(0.5, position.y - (SEA_LEVEL + 1));
        u.uCameraXZ.value.set(position.x, position.z);
        u.uMapOffset.value.set(this.map.center.x - position.x, this.map.center.z - position.z);
        u.uTime.value = this.time;
        u.uVisibility.value = this.visibility;
        u.uSpaceGlow.value = this.spaceGlow;
        u.uClouds.value = this.cloudAmount;


        // Światło świata u gracza (z nieba).

        const sky = this.game.sky;
        const state = sky.state;

        u.uWorldAmbient.value.copy(state.ambientColor).multiplyScalar(state.ambientIntensity);
        u.uWorldSun.value.copy(state.sunLightColor).multiplyScalar(state.sunLightIntensity);
        u.uWorldMoon.value.copy(state.moonLightColor).multiplyScalar(state.moonLightIntensity);
        u.uMoonDirection.value.copy(sky.celestial.moonDirection);

    }


    // Powierzchnia kuli i poświata atmosfery (przed dalekim terenem).

    renderSurface(renderer, camera) {

        if (!this.drawable) {
            return;
        }

        this.setupUniforms(camera);

        renderer.render(this.surfaceScene, camera);

    }


    // Chmury (po dalekim terenie). W trybie ziemniaka ich nie ma
    // (drugie przejście przez cały ekran).

    renderClouds(renderer, camera) {

        if (!this.drawable || this.cloudAmount < 0.002 || this.potato) {
            return;
        }

        this.setupUniforms(camera);

        renderer.render(this.cloudScene, camera);

    }


    dispose() {

        this.map.dispose();
        this.nextMap?.dispose();

        this.surface.geometry.dispose();
        this.surface.material.dispose();
        this.clouds.material.dispose();

    }

}
