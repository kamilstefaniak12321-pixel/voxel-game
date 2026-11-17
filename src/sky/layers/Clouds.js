import * as THREE from 'three';

import { skyUniforms, SKY_COLOR_GLSL } from '../skyShader.js';
import { cloudUniforms, CLOUD_LAYERS_GLSL } from '../../weather/cloudShader.js';

// ------------------------------------------------------------
// CHMURY NA NIEBIE (1.11.0)
//
// Trzy piętra chmur liczone w shaderze dla każdego piksela nieba:
//   niskie   - kłębiaste i warstwowe, z kolumn-klocków o płaskiej
//              podstawie (mają boki i wierzch, widać je także z góry),
//   średnie  - drobne kłębki albo szara zasłona,
//   wysokie  - pierzaste smugi ułożone z wiatrem.
// Gdzie i ile ich jest, mówi mapa pogody (weather/Weather.js); kształt
// daje szum (weather/CloudNoise.js). Każde piętro płynie z inną
// prędkością.
//
// Kolor chmur bierze się z nieba: w dzień białe z szarym spodem,
// o wschodzie i zachodzie podświetlone od dołu na pomarańczowo i różowo
// (wysokie świecą najdłużej - słońce jeszcze je widzi), nocą ciemne,
// rozjaśnione księżycem.
//
// Chmury mają własną scenę (nie są na liście warstw nieba), bo rysują
// się dwa razy: nad kamerą - przed terenem (render, przebieg 0), a pod
// kamerą, gdy leci się ponad nimi - po terenie (przebieg 1).
// ------------------------------------------------------------

const WHITE = new THREE.Color(1, 0.98, 0.95);

function smoothstep(a, b, x) {

    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);

}


export class Clouds {

    constructor() {

        this.uniforms = {
            ...skyUniforms,
            ...cloudUniforms,
            uCloudCamera: { value: new THREE.Vector3() },
            uCloudLight: { value: new THREE.Vector3(0, 1, 0) },
            uCloudLit: { value: new THREE.Color(1, 1, 1) },
            uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.72) },
            uCloudGlow: { value: new THREE.Color(0, 0, 0) },
            uCloudLayerLit: { value: new THREE.Vector3(1, 1, 1) },
            uCloudView: { value: new THREE.Vector4(0, 1, 0.001, 1) },
            uCloudFlow: { value: new THREE.Vector2(1, 0) }
        };

        this.material = new THREE.ShaderMaterial({

            uniforms: this.uniforms,

            vertexShader: /* glsl */ `
                varying vec3 vDirection;

                void main() {
                    vDirection = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,

            fragmentShader: /* glsl */ `
                varying vec3 vDirection;

                ${SKY_COLOR_GLSL}
                ${CLOUD_LAYERS_GLSL}

                void main() {

                    vec4 clouds = cloudLayers(normalize(vDirection));

                    if (clouds.a <= 0.003) {
                        discard;
                    }

                    gl_FragColor = clouds;

                    #include <colorspace_fragment>

                }
            `,

            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false,
            transparent: true

        });

        this.object = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), this.material);
        this.object.frustumCulled = false;

        this.scene = new THREE.Scene();
        this.scene.add(this.object);

        // Ustawia Game z ustawień: 'pelne', 'plaskie' albo 'brak'.
        this.quality = 'pelne';

        // Pogoda (weather/Weather.js) albo null - bez niej chmur nie ma
        // (np. tło menu).
        this.weather = null;

        this.color = new THREE.Color();

    }


    get active() {

        return this.quality !== 'brak' && this.weather !== null && cloudUniforms.uWeatherMap.value !== null;

    }


    // Kolory chmur z bieżącego stanu nieba.

    update(state, celestial) {

        const uniforms = this.uniforms;
        const sunHeight = celestial.sunHeight;
        const day = state.daylight;

        // Światło: słońce, dopóki choć trochę świeci zza horyzontu,
        // potem księżyc.

        const moonUp = celestial.moonHeight > 0.02;

        uniforms.uCloudLight.value.copy(sunHeight > -0.14 || !moonUp ? celestial.sunDirection : celestial.moonDirection);

        // Kolor w pełnym świetle: w dzień biel, nisko nad horyzontem barwa
        // zachodu.

        const warm = Math.min(1, state.sunset * 1.1);

        uniforms.uCloudLit.value.copy(WHITE).lerp(this.color.copy(state.sunsetColor).multiplyScalar(1.25), warm * 0.9)
            .multiplyScalar(0.3 + 0.7 * smoothstep(-0.25, 0.1, sunHeight));

        // Słońce pod horyzontem oświetla już tylko wyższe piętra.

        uniforms.uCloudLayerLit.value.set(
            smoothstep(-0.07, 0.05, sunHeight),
            smoothstep(-0.12, 0.02, sunHeight),
            smoothstep(-0.2, -0.04, sunHeight)
        );

        // Cień: kolor nieba (trochę zenitu, trochę horyzontu), w dzień
        // rozjaśniony; nocą dochodzi światło księżyca.

        const moon = state.moonLightIntensity * (1 - day);

        // Szarzeje względem nieba (chmura w cieniu nie jest niebieska).

        const shade = uniforms.uCloudShade.value.copy(state.zenith).lerp(state.horizon, 0.5);
        const grey = 0.3 * shade.r + 0.55 * shade.g + 0.15 * shade.b;

        shade.lerp(this.color.setRGB(grey, grey, grey * 1.04), 0.55).multiplyScalar(0.84)
            .add(this.color.copy(WHITE).multiplyScalar(0.1 * day))
            .add(this.color.copy(state.moonLightColor).multiplyScalar(0.35 * moon));

        // Zasłona deszczu pod chmurami: ciemniejsza od cienia chmury,
        // z odrobiną koloru horyzontu.

        cloudUniforms.uRainVeilColor.value.copy(shade).multiplyScalar(0.6).lerp(state.horizon, 0.16);

        // Gdy pada śnieg, zasłona jest jasna - biała ściana, nie szara.
        const snowy = this.weather?.snowShare ?? 0;

        if (snowy > 0.01) {
            cloudUniforms.uRainVeilColor.value.lerp(this.color.copy(shade).multiplyScalar(1.3), 0.65 * snowy);
        }

        // Pył (burza piaskowa, haboob): u góry kłęby w barwie piasku
        // (Sky.refresh - dustColor), u podstawy ciemny brąz.

        if (state.dustColor) {
            cloudUniforms.uDustColor.value.copy(state.dustColor).multiplyScalar(1.1);
            cloudUniforms.uDustShade.value.copy(state.dustColor).multiply(this.color.setRGB(0.6, 0.48, 0.38));
        }

        // Podświetlenie od spodu o wschodzie i zachodzie.

        uniforms.uCloudGlow.value.copy(state.sunsetColor).multiplyScalar(0.45 * state.sunset * smoothstep(-0.12, 0.0, sunHeight));

        // W kosmosie chmury ma kula Ziemi (space/Globe.js).

        uniforms.uCloudView.value.w = 1 - smoothstep(0.05, 0.6, state.space);

        const flow = this.weather?.field.flow;

        if (flow) {
            uniforms.uCloudFlow.value.set(Math.cos(flow.angle), Math.sin(flow.angle));
        }

    }


    // pass 0 - chmury nad kamerą (przed terenem), 1 - pod kamerą (po
    // terenie). skyCamera - kamera nieba (stoi w miejscu, tylko się
    // obraca), camera - kamera gracza.

    render(renderer, skyCamera, camera, pass = 0) {

        if (!this.active || this.uniforms.uCloudView.value.w <= 0) {
            return;
        }

        const view = this.uniforms.uCloudView.value;

        view.x = pass;
        view.y = this.quality === 'pelne' ? 1 : 0;

        // Kąt jednego piksela ekranu (radiany) - do doboru szczegółów.
        view.z = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.height);

        camera.getWorldPosition(this.uniforms.uCloudCamera.value);

        renderer.render(this.scene, skyCamera);

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}
