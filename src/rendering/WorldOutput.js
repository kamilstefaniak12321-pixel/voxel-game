import * as THREE from 'three';
import { lightingUniforms } from './LightingDiagnostics.js';

// Jeden właściciel prezentacji świata. Three r160 rysuje do zwykłego
// RenderTarget w Linear-sRGB i bez tone mappingu, również dla materiałów
// z colorspace_fragment. Niebo, mgła, powierzchnie i efekty mieszają się
// więc liniowo, a dopiero ten pass kompresuje światła i koduje wyjście.
const SHOULDER = 0.6;
const HEADROOM = 1 - SHOULDER;
const LUMA = [0.2126, 0.7152, 0.0722];

// Neutralna kompresja zachowuje proporcje RGB, nie zmienia dominanty.
// Poniżej 0.6 jest tożsamością; wyżej ma ciągłą pierwszą pochodną,
// asymptotę 1 i nie obcina pojedynczo kanałów ciepłych źródeł.
export function neutralToneMap(rgb, exposure = 1) {
    const power = Number.isFinite(exposure) ? Math.max(0, exposure) : 1;
    const color = rgb.map(value => Math.max(0, Number.isFinite(value) ? value : 0) * power);
    const peak = Math.max(...color);
    if (peak <= SHOULDER) return color;
    const mappedPeak = 1 - HEADROOM * HEADROOM / (peak - SHOULDER + HEADROOM);
    return color.map(value => value * mappedPeak / peak);
}

// Odniesienie CPU dla odbioru operatora, bez szumu ditheringu.
export function sampleWorldOutput(rgb, { exposure = 1, bypassTone = false, grayscale = false } = {}) {
    let color = bypassTone ? rgb.map(value => Math.max(0, value)) : neutralToneMap(rgb, exposure);
    if (grayscale) color = Array(3).fill(color.reduce((sum, value, i) => sum + value * LUMA[i], 0));
    return color.map(value => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
}

export class WorldOutput {
    constructor(renderer) {
        this.renderer = renderer;
        this.exposure = 1;
        this.grayscale = false;
        this.bypassTone = false;
        this.active = false;
        this.target = null;
        this.size = new THREE.Vector2();

        const extensions = renderer.extensions;
        this.hdr = renderer.capabilities.isWebGL2
            ? extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float')
            : extensions.has('EXT_color_buffer_half_float') && extensions.has('OES_texture_half_float')
                && extensions.has('OES_texture_half_float_linear');
        const antialias = renderer.getContext?.().getContextAttributes?.()?.antialias === true;
        this.samples = antialias && renderer.capabilities.isWebGL2
            ? Math.max(0, Math.min(4, renderer.capabilities.maxSamples ?? 0)) : 0;

        // RGBA8 nadal zachowuje jedno liniowe mieszanie i jedno wyjście,
        // lecz wartości >1 tracą szczegóły przed kompresją. To jawny
        // fallback starszych GPU, nie równoważna jakość HDR.
        this.mode = this.hdr ? 'hdr16f' : 'ldr8';
        this.material = new THREE.ShaderMaterial({
            name: 'WorldOutput',
            uniforms: {
                uScene: { value: null }, uExposure: { value: 1 },
                uBypassTone: { value: 0 }, uGrayscale: { value: 0 }
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = position.xy * 0.5 + 0.5;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform sampler2D uScene;
                uniform float uExposure;
                uniform float uBypassTone;
                uniform float uGrayscale;
                varying vec2 vUv;

                vec3 neutralTone(vec3 color) {
                    float peak = max(color.r, max(color.g, color.b));
                    if (peak <= 0.6) return color;
                    float mappedPeak = 1.0 - 0.16 / (peak - 0.2);
                    return color * (mappedPeak / peak);
                }

                void main() {
                    vec3 color = max(texture2D(uScene, vUv).rgb, vec3(0.0));
                    if (uBypassTone < 0.5) color = neutralTone(color * uExposure);
                    if (uGrayscale > 0.5) color = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
                    gl_FragColor = vec4(color, 1.0);
                    #include <colorspace_fragment>
                    // Szum dopiero w obrazie wyjściowym, nie w słabej
                    // liniowej radiancji nocy. Maski zostają dokładne.
                    if (uBypassTone < 0.5) {
                        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                            vec2(0.06711056, 0.00583715)))) - 0.5;
                        gl_FragColor.rgb += noise / 255.0;
                    }
                }
            `,
            depthTest: false, depthWrite: false, toneMapped: false,
            blending: THREE.NoBlending
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
        this.triangle = new THREE.Mesh(geometry, this.material);
        this.triangle.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.triangle);
        this.camera = new THREE.Camera();
    }

    // Warmup może przygotować wariant shaderów dla tego samego formatu
    // i przestrzeni wyjścia, bez czyszczenia ani prezentowania klatki.
    prepareTarget(referenceTarget = this.renderer.getRenderTarget()) {
        const renderer = this.renderer;
        if (referenceTarget) this.size.set(referenceTarget.width, referenceTarget.height);
        else renderer.getDrawingBufferSize(this.size);
        const width = Math.max(1, Math.round(this.size.x)), height = Math.max(1, Math.round(this.size.y));
        if (!this.target) {
            this.target = new THREE.WebGLRenderTarget(width, height, {
                type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
                format: THREE.RGBAFormat, colorSpace: THREE.LinearSRGBColorSpace,
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                generateMipmaps: false, depthBuffer: true, stencilBuffer: false,
                // Zachowujemy wygładzanie krawędzi włączone przy
                // tworzeniu głównego kontekstu. Cel HDR nie dziedziczy
                // automatycznie MSAA domyślnego bufora przeglądarki.
                samples: this.samples
            });
            // LightShafts rozpoznaje, że ma oddać energię liniową,
            // zamiast gotowego blasku przeznaczonego dla ekranu bazy.
            this.target.isWorldOutputTarget = true;
            this.target.texture.name = 'WorldLinearColor';
        } else if (this.target.width !== width || this.target.height !== height) {
            this.target.setSize(width, height);
        }
        return this.target;
    }

    // Nie alokuje pełnoekranowego celu, dopóki wybrana jest baza A/B.
    // debugView: 1..5 to dane (bez ekspozycji/tone), 12 to szarość;
    // źródła 6..11 zachowują te same ustawienia co pełny obraz.
    begin(enabled, { debugView = lightingUniforms.uLightingDebug.value,
        exposure = this.exposure, bypassTone = this.bypassTone, grayscale = this.grayscale } = {}) {
        if (this.active) throw new Error('WorldOutput.begin: poprzednia klatka nie została zakończona');
        if (!enabled) return false;

        const renderer = this.renderer;
        this.previousTarget = renderer.getRenderTarget();
        this.previousCubeFace = renderer.getActiveCubeFace?.() ?? 0;
        this.previousMipmapLevel = renderer.getActiveMipmapLevel?.() ?? 0;
        this.previousAutoClear = renderer.autoClear;
        this.prepareTarget(this.previousTarget);

        const uniforms = this.material.uniforms;
        uniforms.uScene.value = this.target.texture;
        uniforms.uExposure.value = Number.isFinite(exposure) ? Math.max(0, exposure) : 1;
        uniforms.uBypassTone.value = bypassTone || (debugView >= 1 && debugView <= 5) ? 1 : 0;
        uniforms.uGrayscale.value = grayscale || debugView === 12 ? 1 : 0;
        this.active = true;
        renderer.autoClear = false;
        renderer.setRenderTarget(this.target);
        renderer.clear(true, true, true);
        return true;
    }

    end() {
        if (!this.active) return;
        this.active = false;
        const renderer = this.renderer;
        try {
            renderer.setRenderTarget(this.previousTarget, this.previousCubeFace, this.previousMipmapLevel);
            renderer.render(this.scene, this.camera);
        } finally {
            renderer.autoClear = this.previousAutoClear;
            renderer.setRenderTarget(this.previousTarget, this.previousCubeFace, this.previousMipmapLevel);
        }
    }

    stats() {
        const width = this.target?.width ?? 0, height = this.target?.height ?? 0;
        return { mode: this.mode, width, height, exposure: this.exposure,
            // Rozwiązany kolor + depth24/32 oraz, przy MSAA, osobne
            // wielopróbkowe bufory koloru/głębi. Bez bufora okna.
            estimatedBytes: width * height * (this.hdr ? 12 : 8) * (this.samples > 0 ? this.samples + 1 : 1),
            samples: this.samples };
    }

    dispose() {
        if (this.active) this.end();
        this.target?.dispose();
        this.target = null;
        this.triangle.geometry.dispose();
        this.material.dispose();
        this.scene.clear();
    }
}
