import * as THREE from 'three';

import { shadowUniforms } from './Shadows.js';

// ------------------------------------------------------------
// PROMIENIE ŚWIATŁA (smugi słońca w powietrzu)
//
// Jak w prawdziwym powietrzu z odrobiną kurzu: tam, gdzie świeci
// słońce, powietrze lekko jaśnieje. Przez okno do ciemnego pokoju
// wpada wtedy widoczny snop światła, a między drzewami - smugi.
//
// Jak to działa (co klatkę, po narysowaniu świata):
//   1. Głębia bliskich chunków (w połowie rozdzielczości) - gdzie
//      kończy się powietrze w każdym punkcie ekranu.
//   2. Dla każdego punktu idziemy od oka do tej ściany kilkanaście
//      kroków i w mapie cieni (Shadows.js) sprawdzamy, w ilu z nich
//      świeci słońce. Więcej oświetlonego powietrza = jaśniej.
//      Najmocniej świeci powietrze, gdy patrzymy w stronę słońca.
//   3. Rozmycie (wygładza schodki z kroków) i dodanie do obrazu
//      w kolorze światła.
//
// Siła zależy od pory dnia (o wschodzie i zachodzie mocniej) i od
// tego, jak ciemno jest wokół gracza: w ciemnym pokoju snop jest
// wyraźny, w pełnym słońcu na dworze - ledwie widać mgiełkę.
// Ustawia to Game (render: color, strength).
// ------------------------------------------------------------

const STEPS = 20;


const QUAD_VERTEX = `
varying vec2 vUv;

void main() {

    vUv = uv;

    gl_Position = vec4(position.xy, 0.0, 1.0);

}
`;


const MARCH_FRAGMENT = `
uniform highp sampler2D uDepth;
uniform highp sampler2D uShadowMap;
uniform mat4 uProjectionInverse;
uniform mat4 uCameraWorld;
uniform mat4 uShadowMatrix;
uniform vec3 uLightDirection;
uniform float uMaxDistance;
uniform float uBias;
uniform float uDensity;
uniform float uIsotropic;
uniform highp sampler2D uFarShadowMap;
uniform mat4 uFarShadowMatrix;
uniform vec4 uFarShadowInfo;
uniform float uFarBias;
uniform highp sampler2D uDistantShadowMap;
uniform mat4 uDistantShadowMatrix;
uniform vec4 uDistantShadowInfo;
uniform float uDistantBias;

varying vec2 vUv;

// Szum (interleaved gradient noise): każdy piksel zaczyna kroki
// w trochę innym miejscu - po rozmyciu zamiast schodków jest gładko.

float noise(vec2 p) {

    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));

}

// Jak mocno powietrze rozprasza światło pod danym kątem do słońca
// (Henyey-Greenstein): najwięcej, gdy patrzymy w stronę słońca.

float phase(float cosine, float g) {

    float g2 = g * g;

    return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * cosine, 1.5));

}

// Ta sama osłona brzegów co na powierzchniach. Okluzja każdej mapy
// jest stosowana raz; bliska mapa nie może rozjaśnić cienia góry.
float shadowCoverage(vec3 p, float fadeStart) {
    float edge = max(abs(p.x - 0.5), abs(p.y - 0.5)) * 2.0;
    return (1.0 - smoothstep(fadeStart, 1.0, edge)) *
        smoothstep(0.0, 0.02, p.z) * (1.0 - smoothstep(0.98, 1.0, p.z));
}

void main() {

    float depth = texture2D(uDepth, vUv).r;

    vec4 view = uProjectionInverse * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);

    view.xyz /= view.w;

    vec3 origin = uCameraWorld[3].xyz;

    vec3 ray = (uCameraWorld * vec4(view.xyz, 1.0)).xyz - origin;

    float rayLength = min(length(ray), uMaxDistance);

    vec3 direction = normalize(ray);

    vec3 a = (uShadowMatrix * vec4(origin, 1.0)).xyz;
    vec3 b = (uShadowMatrix * vec4(origin + direction * rayLength, 1.0)).xyz;

    // Daleka mapa cieni (jeśli jest) - dla kroków poza bliską.

    vec3 farA = (uFarShadowMatrix * vec4(origin, 1.0)).xyz;
    vec3 farB = (uFarShadowMatrix * vec4(origin + direction * rayLength, 1.0)).xyz;
    vec3 distantA = (uDistantShadowMatrix * vec4(origin, 1.0)).xyz;
    vec3 distantB = (uDistantShadowMatrix * vec4(origin + direction * rayLength, 1.0)).xyz;

    float start = noise(gl_FragCoord.xy);

    // Każdy krok w oświetlonym powietrzu dodaje trochę światła, tym
    // mniej, im dalej od oka (powietrze po drodze je przesłania) -
    // dzięki temu bliski snop światła jest wyraźny, a dalekie powietrze
    // za oknem nie świeci na biało.

    float stepLength = rayLength / ${STEPS}.0;

    float glow = 0.0;

    for (int i = 0; i < ${STEPS}; i++) {

        float t = (float(i) + start) / ${STEPS}.0;

        vec3 s = mix(a, b, t);

        float coverage = shadowCoverage(s, 0.85);
        float occlusion = 0.0;
        if (coverage > 0.0) occlusion = (1.0 - step(s.z - uBias, texture2D(uShadowMap, s.xy).r)) * coverage;
        if (uFarShadowInfo.z > 0.5) {
            vec3 f = mix(farA, farB, t);
            coverage = shadowCoverage(f, 0.82);
            if (coverage > 0.0) occlusion = max(occlusion,
                (1.0 - step(f.z - uFarBias, texture2D(uFarShadowMap, f.xy).r)) * coverage);
        }
        if (uDistantShadowInfo.z > 0.5) {
            vec3 d = mix(distantA, distantB, t);
            coverage = shadowCoverage(d, 0.82);
            if (coverage > 0.0) occlusion = max(occlusion,
                (1.0 - step(d.z - uDistantBias, texture2D(uDistantShadowMap, d.xy).r)) * coverage);
        }
        float lit = 1.0 - occlusion;

        // Poza mapami cieni - powietrze w słońcu.

        glow += lit * exp(-uDensity * t * rayLength);

    }

    glow *= uDensity * stepLength;

    float cosine = dot(direction, uLightDirection);

    float scatter = uIsotropic + phase(cosine, 0.6);

    gl_FragColor = vec4(min(1.0, glow * scatter * 0.5), 0.0, 0.0, 1.0);

}
`;


const BLUR_FRAGMENT = `
uniform sampler2D uInput;
uniform vec2 uStep;

varying vec2 vUv;

void main() {

    float sum = texture2D(uInput, vUv).r * 0.2270;

    sum += texture2D(uInput, vUv + uStep * 1.3846).r * 0.3162;
    sum += texture2D(uInput, vUv - uStep * 1.3846).r * 0.3162;
    sum += texture2D(uInput, vUv + uStep * 3.2308).r * 0.0703;
    sum += texture2D(uInput, vUv - uStep * 3.2308).r * 0.0703;

    gl_FragColor = vec4(sum, 0.0, 0.0, 1.0);

}
`;


// Na końcu odrobina szumu (pół odcienia) - bez niego na gładkim niebie
// wokół słońca widać by było pierścienie (ekran ma tylko 256 odcieni).

const COMPOSITE_FRAGMENT = `
uniform sampler2D uInput;
uniform vec3 uColor;

varying vec2 vUv;

void main() {

    float amount = texture2D(uInput, vUv).r * 2.0;

    // Bardzo jasny blask łagodnie dochodzi do pełnej jasności (bez
    // ostrego przepalenia).

    vec3 light = 1.0 - exp(-uColor * amount);

    float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;

    gl_FragColor = vec4(max(vec3(0.0), light + dither / 255.0), 1.0);

}
`;


function createTarget(width, height, depth = false, type = THREE.UnsignedByteType) {

    const target = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RedFormat,
        type,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
        depthBuffer: depth
    });

    if (depth) {

        target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
        target.depthTexture.minFilter = THREE.NearestFilter;
        target.depthTexture.magFilter = THREE.NearestFilter;

    }

    return target;

}

// ------------------------------------------------------------

export class LightShafts {

    constructor(renderer) {

        this.renderer = renderer;

        this.width = 0;
        this.height = 0;

        this.depthTarget = null;
        this.targets = [];

        // Kamera do głębi: ta sama co gracza, ale tylko do maxDistance.

        this.camera = new THREE.PerspectiveCamera();

        this.frustum = new THREE.Frustum();
        this.matrix = new THREE.Matrix4();
        this.box = new THREE.Box3();
        this.size = new THREE.Vector2();


        this.march = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERTEX,
            fragmentShader: MARCH_FRAGMENT,
            uniforms: {
                uDepth: { value: null },
                uShadowMap: shadowUniforms.uSunShadowMap,
                uProjectionInverse: { value: this.camera.projectionMatrixInverse },
                uCameraWorld: { value: new THREE.Matrix4() },
                uShadowMatrix: shadowUniforms.uSunShadowMatrix,
                uLightDirection: shadowUniforms.uSunShadowDir,
                uMaxDistance: { value: 64 },
                uBias: { value: 0 },
                uDensity: { value: 0.01 },
                uIsotropic: { value: 0.6 },
                uFarShadowMap: shadowUniforms.uFarShadowMap,
                uFarShadowMatrix: shadowUniforms.uFarShadowMatrix,
                uFarShadowInfo: shadowUniforms.uFarShadowInfo,
                uFarBias: { value: 0 },
                uDistantShadowMap: shadowUniforms.uDistantShadowMap,
                uDistantShadowMatrix: shadowUniforms.uDistantShadowMatrix,
                uDistantShadowInfo: shadowUniforms.uDistantShadowInfo,
                uDistantBias: { value: 0 }
            },
            depthTest: false,
            depthWrite: false
        });

        this.blur = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERTEX,
            fragmentShader: BLUR_FRAGMENT,
            uniforms: {
                uInput: { value: null },
                uStep: { value: new THREE.Vector2() }
            },
            depthTest: false,
            depthWrite: false
        });

        this.composite = new THREE.ShaderMaterial({
            vertexShader: QUAD_VERTEX,
            fragmentShader: COMPOSITE_FRAGMENT,
            uniforms: {
                uInput: { value: null },
                uColor: { value: new THREE.Color() }
            },
            depthTest: false,
            depthWrite: false,
            transparent: true,
            blending: THREE.AdditiveBlending
        });


        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.march);

        this.quad.frustumCulled = false;

        this.quadScene = new THREE.Scene();

        this.quadScene.add(this.quad);

        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    }


    // Rozmiar celów (połowa rozdzielczości ekranu).

    resize(width, height) {

        width = Math.max(1, Math.round(width / 2));
        height = Math.max(1, Math.round(height / 2));

        if (width === this.width && height === this.height) {
            return;
        }

        this.disposeTargets();

        this.width = width;
        this.height = height;

        this.depthTarget = createTarget(width, height, true);

        // Wynik w liczbach zmiennoprzecinkowych (płynne przejścia), jeśli
        // karta pozwala w nich rysować - inaczej 256 odcieni.

        const extensions = this.renderer.extensions;

        const type = extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float')
            ? THREE.HalfFloatType
            : THREE.UnsignedByteType;

        this.targets = [createTarget(width, height, false, type), createTarget(width, height, false, type)];

    }


    drawQuad(material, target) {

        this.quad.material = material;

        this.renderer.setRenderTarget(target);

        this.renderer.render(this.quadScene, this.quadCamera);

    }


    // Rysuje promienie na obraz (po świecie, przed ręką).
    //   camera      - kamera gracza (już ustawiona do rysowania),
    //   world       - World (chunki w world.shadowScene),
    //   shadows     - SunShadows (mapa narysowana),
    //   color       - THREE.Color: kolor i siła światła (liniowo),
    //   density     - jak gęste jest powietrze (na blok): w ciemnym
    //                 miejscu większe (oczy przyzwyczajone do ciemności),
    //   isotropic   - ile światła powietrze rozprasza na boki (reszta
    //                 świeci w stronę słońca) - w ciemnym miejscu więcej,
    //                 żeby snop było widać z boku,
    //   maxDistance - jak daleko od oka liczyć (bloki)

    render(camera, world, shadows, color, density, isotropic, maxDistance) {

        const renderer = this.renderer;

        renderer.getDrawingBufferSize(this.size);

        this.resize(this.size.x, this.size.y);


        // 1. Głębia bliskich chunków.

        const depthCamera = this.camera;

        depthCamera.fov = camera.fov;
        depthCamera.aspect = camera.aspect;
        depthCamera.near = camera.near;
        depthCamera.far = maxDistance;
        depthCamera.zoom = camera.zoom;
        depthCamera.updateProjectionMatrix();

        depthCamera.position.copy(camera.position);
        depthCamera.quaternion.copy(camera.quaternion);
        depthCamera.updateMatrixWorld();

        this.matrix.multiplyMatrices(depthCamera.projectionMatrix, depthCamera.matrixWorldInverse);

        this.frustum.setFromProjectionMatrix(this.matrix);

        for (const caster of world.shadowScene.children) {

            const chunk = caster.userData.chunk;

            this.box.min.set(chunk.cx * 16, 0, chunk.cz * 16);
            this.box.max.set(chunk.cx * 16 + 16, chunk.maxY + 2, chunk.cz * 16 + 16);

            caster.visible = this.frustum.intersectsBox(this.box);

        }

        renderer.setRenderTarget(this.depthTarget);
        renderer.clear();
        renderer.render(world.shadowScene, depthCamera);


        // 2. Kroki przez powietrze.

        const march = this.march.uniforms;

        march.uDepth.value = this.depthTarget.depthTexture;
        march.uCameraWorld.value.copy(depthCamera.matrixWorld);
        march.uMaxDistance.value = maxDistance;
        march.uDensity.value = density;
        march.uIsotropic.value = isotropic;

        // Ten sam zapas co przy ścianach (Shadows.js), żeby powietrze
        // tuż przy oświetlonej ścianie nie było w jej cieniu.

        const info = shadowUniforms.uSunShadowInfo.value;

        march.uBias.value = info.z * 1.5 * info.x;

        const farInfo = shadowUniforms.uFarShadowInfo.value;

        march.uFarBias.value = farInfo.y * 1.5 * farInfo.x;
        const distantInfo = shadowUniforms.uDistantShadowInfo.value;
        march.uDistantBias.value = distantInfo.y * 1.5 * distantInfo.x;

        this.drawQuad(this.march, this.targets[0]);


        // 3. Rozmycie (poziomo i pionowo) i dodanie do obrazu.

        this.blur.uniforms.uInput.value = this.targets[0].texture;
        this.blur.uniforms.uStep.value.set(1.5 / this.width, 0);

        this.drawQuad(this.blur, this.targets[1]);

        this.blur.uniforms.uInput.value = this.targets[1].texture;
        this.blur.uniforms.uStep.value.set(0, 1.5 / this.height);

        this.drawQuad(this.blur, this.targets[0]);

        this.composite.uniforms.uInput.value = this.targets[0].texture;
        this.composite.uniforms.uColor.value.copy(color);

        this.drawQuad(this.composite, null);

    }


    // Przy wyjściu ze świata: cele, prostokąt na cały ekran i shadery.

    dispose() {

        this.disposeTargets();

        this.quad.geometry.dispose();

        this.march.dispose();
        this.blur.dispose();
        this.composite.dispose();

    }


    disposeTargets() {

        this.depthTarget?.dispose();
        this.depthTarget?.depthTexture?.dispose();
        this.depthTarget = null;

        for (const target of this.targets) {
            target.dispose();
        }

        this.targets = [];

        this.width = 0;
        this.height = 0;

    }

}
