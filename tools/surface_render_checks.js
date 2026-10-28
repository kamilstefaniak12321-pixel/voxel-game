// Regresje prawdziwych materiałów gry. Mały liniowy render target oddziela
// kompozycję światła od nieba, ekspozycji, mgły i tonemappingu całego kadru.
import * as THREE from 'three';
import { blockMaterial, plantMaterial, leafMaterial, waterMaterial,
    setShadowDefine, setPotatoDefine } from '../src/rendering/BlockRenderData.js';
import { createModelMaterial, modelLight } from '../src/rendering/ModelMaterial.js';
import { createFarTerrainMaterial } from '../src/world/FarTerrain.js';
import { CubeParticles } from '../src/rendering/CubeParticles.js';
import { skyUniforms } from '../src/sky/skyShader.js';
import { viewUniforms, chunkMaskUniforms } from '../src/rendering/viewUniforms.js';
import { shadowUniforms } from '../src/rendering/Shadows.js';
import { dynamicLightUniforms } from '../src/world/DynamicLight.js';
import { bounceUniforms } from '../src/world/BounceLight.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';

export async function checkSurfaceRendering({ game, settings, renderer, yieldBrowser }) {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const close = (actual, expected, label, tolerance = 2) => actual.forEach((v, i) =>
        check(Math.abs(v - expected[i]) <= tolerance, `${label}, RGB[${i}]: ${v} != ${expected[i]}`));
    const uniforms = [...new Set([skyUniforms, viewUniforms, chunkMaskUniforms, shadowUniforms,
        dynamicLightUniforms, bounceUniforms, meteorLightUniforms, modelLight].flatMap(Object.values))];
    const savedUniforms = uniforms.map(uniform => [uniform,
        uniform.value?.clone && !uniform.value.isTexture ? uniform.value.clone() : uniform.value]);
    const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest() };
    const resources = [], variants = [], programs = new Set(), pixels = {};
    const own = resource => { resources.push(resource); return resource; };
    const target = own(new THREE.WebGLRenderTarget(16, 16));
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const white = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    white.needsUpdate = true;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.set(0, 0, 2); camera.lookAt(0, 0, 0);
    const ambient = new THREE.AmbientLight(0xffffff, Math.PI * .4);
    const sun = new THREE.DirectionalLight(0xffffff, 0);
    sun.position.set(0, 0, 2);
    scene.add(ambient, sun);
    const plane = own(new THREE.PlaneGeometry(2, 2));
    const fill = (geometry, name, values) => {
        const count = geometry.getAttribute('position').count;
        let attribute = geometry.getAttribute(name);
        if (!attribute) {
            attribute = new THREE.BufferAttribute(new Float32Array(count * values.length), values.length);
            geometry.setAttribute(name, attribute);
        }
        for (let i = 0; i < count; i++) attribute.array.set(values, i * values.length);
        attribute.needsUpdate = true;
    };
    fill(plane, 'color', [0, 0, 0, 1]);
    fill(plane, 'atmosphereLight', [0, 0, 0, 1]);
    fill(plane, 'tint', [1, 1, 1, 1]);
    fill(plane, 'surfaceOcclusion', [1]); fill(plane, 'surfaceEmission', [0]);
    const meshes = new Map();
    const add = (name, material, geometry = plane) => {
        material.toneMapped = false; material.fog = false;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false; scene.add(mesh); meshes.set(name, mesh);
        return mesh;
    };
    const blockMaterials = [blockMaterial, plantMaterial, leafMaterial, waterMaterial].map((source, i) => {
        const material = own(source.clone());
        // Three.clone nie kopiuje onBeforeCompile: zachowujemy prawdziwy adapter.
        material.onBeforeCompile = source.onBeforeCompile;
        material.defines = { ...source.defines }; material.map = white;
        material.color.setRGB(.25, .25, .25);
        add(['near', 'plant', 'leaf', 'water'][i], material);
        return material;
    });
    const model = own(createModelMaterial({ map: white }));
    model.color.setRGB(.25, .25, .25); add('model', model);
    const farGeometry = own(new THREE.PlaneGeometry(2, 2));
    // Prawdziwe kodowanie farSamples: pierwiastek liniowego albedo oraz oś 127.
    fill(farGeometry, 'color', [.5, .5, .5, 1]);
    fill(farGeometry, 'surfaceAlbedo', [.5, .5, .5, 1]);
    farGeometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([
        0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127
    ]), 3, true));
    const far = own(createFarTerrainMaterial());
    const compileFar = far.onBeforeCompile;
    far.onBeforeCompile = (shader, context) => {
        compileFar(shader, context);
        // Kontrolowane wejścia prawdziwego materiału, bez zmiany jego kodu GLSL.
        shader.uniforms.uLodDebug = { value: 0 };
        shader.uniforms.uPixelAngle = { value: 0 };
    };
    add('far', far, farGeometry);
    const debris = new CubeParticles(scene, { capacity: 1, surfaceLighting: true });
    debris.emit({ position: new THREE.Vector3(), size: 1, life: 10,
        colors: new THREE.Color(.25, .25, .25),
        lighting: { sky: 1, local: [0, 0, 0], emission: 0, classicShade: 1 } });
    debris.update(0, game.world);
    debris.mesh.setMatrixAt(0, new THREE.Matrix4()); debris.mesh.instanceMatrix.needsUpdate = true;
    debris.mesh.material.toneMapped = false;
    meshes.set('debris', debris.mesh);

    const draw = name => {
        for (const [key, mesh] of meshes) mesh.visible = key === name;
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const rgba = new Uint8Array(4);
        renderer.readRenderTargetPixels(target, 8, 8, 1, 1, rgba);
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, `${name}: błąd WebGL`);
        const program = renderer.properties.get(meshes.get(name).material).currentProgram;
        check(program && program.diagnostics?.runnable !== false, `${name}: shader nie skompilował się`);
        programs.add(program.id);
        return [...rgba.slice(0, 3)];
    };
    const flags = (quality, potato) => {
        setShadowDefine(blockMaterials, quality > 0, quality === 3);
        far.defines = { ...(quality === 3 ? { USE_FAR_SHADOWS: '' } : {}), ...(potato ? { POTATO: '' } : {}) };
        far.needsUpdate = true;
        setPotatoDefine([...blockMaterials, model, debris.mesh.material], potato);
        modelLight.uModelShadows.value = quality > 0 ? 1 : 0;
    };
    const checkWebGL1 = async () => {
        const canvas = document.createElement('canvas');
        let context;
        try {
            context = canvas.getContext('webgl', { antialias: false, alpha: false });
        } catch (error) {
            return { status: 'skipped', reason: `Nie można utworzyć kontekstu WebGL1: ${error.message}` };
        }
        if (!context) return { status: 'skipped', reason: 'Przeglądarka nie udostępnia rzeczywistego kontekstu WebGL1.' };

        // Oddzielny prawdziwy kontekst uruchamia fallback onBeforeCompile.
        // Nie wystarczy zmienić capabilities na atrapie renderera WebGL2.
        const fallback = new THREE.WebGLRenderer({ canvas, context, antialias: false });
        const fallbackTarget = new THREE.WebGLRenderTarget(16, 16);
        fallbackTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const samples = {}, compiled = [];
        try {
            check(!fallback.capabilities.isWebGL2, 'Próba WebGL1 przypadkowo używa WebGL2');
            fallback.setSize(16, 16, false); fallback.setClearColor(0, 1);
            fallback.outputColorSpace = THREE.LinearSRGBColorSpace;
            fallback.toneMapping = THREE.NoToneMapping;
            const sample = () => {
                for (const [name, mesh] of meshes) mesh.visible = name === 'near';
                fallback.setRenderTarget(fallbackTarget); fallback.render(scene, camera);
                const bytes = new Uint8Array(4);
                fallback.readRenderTargetPixels(fallbackTarget, 8, 8, 1, 1, bytes);
                check(context.getError() === context.NO_ERROR, 'Fallback WebGL1: błąd rysowania');
                const program = fallback.properties.get(blockMaterials[0]).currentProgram;
                check(program && program.diagnostics?.runnable !== false, 'Fallback WebGL1: shader nie skompilował się');
                return [...bytes.slice(0, 3)];
            };
            fill(plane, 'surfaceEmission', [0]); fill(plane, 'surfaceOcclusion', [1]);
            fill(plane, 'color', [0, 0, 0, 0]); fill(plane, 'atmosphereLight', [0, 0, 0, 0]);
            ambient.intensity = Math.PI * .4; sun.intensity = Math.PI * .4;
            for (const atmosphere of [0, 1]) for (const potato of [false, true]) {
                flags(0, potato); skyUniforms.uAtmosphericLight.value = atmosphere;
                const dark = sample();
                close(dark, [0, 0, 0], `WebGL1: zamknięty pokój, atmosfera ${atmosphere}, potato ${potato}`);
                compiled.push({ atmosphere, potato, dark });
                await yieldBrowser();
            }

            flags(0, false); skyUniforms.uAtmosphericLight.value = 1;
            fill(plane, 'atmosphereLight', [0, 0, 0, 1]);
            sun.intensity = 0;
            samples.openAmbient = sample();
            check(samples.openAmbient.every(v => v > 8), 'WebGL1: brak dodatniej próby kontrolnej otoczenia');
            fill(plane, 'surfaceOcclusion', [0]); samples.occludedAmbient = sample();
            close(samples.occludedAmbient, [0, 0, 0], 'WebGL1: AO musi tłumić światło otoczenia');
            ambient.intensity = 0; sun.intensity = Math.PI * .4;
            samples.occludedDirect = sample(); fill(plane, 'surfaceOcclusion', [1]);
            samples.direct = sample();
            check(samples.direct.every(v => v > 8), 'WebGL1: brak dodatniej próby kontrolnej słońca');
            close(samples.occludedDirect, samples.direct, 'WebGL1: AO nie może gasić bezpośredniego słońca');
            await yieldBrowser();
            return { status: 'passed', version: context.getParameter(context.VERSION), compiled, samples };
        } finally {
            fallback.setRenderTarget(null); fallbackTarget.dispose(); fallback.dispose(); fallback.forceContextLoss();
        }
    };
    try {
        renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.setClearColor(0, 1); renderer.setScissorTest(false);
        Object.assign(viewUniforms.uBrightness, { value: 0 });
        viewUniforms.uFarEnabled.value = 0; viewUniforms.uFarInner.value = 48;
        viewUniforms.uFarOuter.value = 1000; viewUniforms.uHazeMax.value = 0;
        viewUniforms.uCurvature.value = 0; viewUniforms.uGlobe.value = 0;
        viewUniforms.uUnderwater.value = 0; viewUniforms.uTime.value = 0;
        chunkMaskUniforms.uChunkMaskOrigin.value.set(1e6, 1e6);
        skyUniforms.uNightDesaturation.value = 0; skyUniforms.uFogBrightness.value = 1;
        dynamicLightUniforms.uDynamicEnabled.value = 0;
        meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);
        bounceUniforms.uBounceColor.value.setRGB(0, 0, 0);
        modelLight.uModelSky.value = 1; modelLight.uModelAmbient.value = 1;
        modelLight.uModelSun.value = 1; modelLight.uModelBlock.value.set(0, 0, 0);
        modelLight.uModelBounce.value.set(0, 0, 0);

        // Każdy adapter faktycznie rysuje piksel; brak siatki far w aktualnym
        // kadrze świata nie może omijać kompilacji dalekiego materiału w CI.
        for (const atmosphere of [0, 1]) for (const quality of [0, 1, 3]) for (const potato of [false, true]) {
            skyUniforms.uAtmosphericLight.value = atmosphere; flags(quality, potato);
            for (const name of meshes.keys()) draw(name);
            variants.push({ atmosphere, shadows: quality, potato, materials: [...meshes.keys()] });
            await yieldBrowser();
        }

        flags(0, false); skyUniforms.uAtmosphericLight.value = 1;
        pixels.natural = draw('near');
        check(pixels.natural.every(v => v > 8 && v < 100), 'Nieprawidłowa energia/kolor liniowy próby naturalnej');
        for (const name of ['far', 'model', 'debris']) {
            pixels[name] = draw(name);
            close(pixels[name], pixels.natural, `Near/${name}: ten sam liniowy materiał i światło`);
        }
        fill(plane, 'atmosphereLight', [.5, .25, 0, 1]);
        ambient.intensity = 0;
        pixels.lamp = draw('near');
        close(pixels.lamp, [14, 3, 0], 'Jednokrotne dekodowanie RGB lampy');
        ambient.intensity = Math.PI * .4;
        pixels.combined = draw('near');
        close(pixels.combined, pixels.natural.map((v, i) => v + pixels.lamp[i]), 'Atmosfera sumuje niebo i lampę');
        check(pixels.combined[0] > Math.max(pixels.natural[0], pixels.lamp[0]) + 5, 'Atmosfera nadal wybiera maksimum');
        fill(plane, 'color', [.5, .25, 0, 1]); skyUniforms.uAtmosphericLight.value = 0;
        pixels.classicCombined = draw('near');
        close(pixels.classicCombined, pixels.natural.map((v, i) => Math.max(v, pixels.lamp[i])), 'Klasyczny model zachowuje maksimum');

        skyUniforms.uAtmosphericLight.value = 1;
        fill(plane, 'atmosphereLight', [0, 0, 0, 1]); fill(plane, 'surfaceOcclusion', [0]);
        pixels.occludedAmbient = draw('near'); close(pixels.occludedAmbient, [0, 0, 0], 'AO tłumi otoczenie');
        ambient.intensity = 0; sun.intensity = Math.PI * .4;
        pixels.occludedDirect = draw('near'); fill(plane, 'surfaceOcclusion', [1]);
        pixels.direct = draw('near');
        check(pixels.direct[0] > 8, 'Próba bezpośredniego światła nie świeci');
        close(pixels.occludedDirect, pixels.direct, 'AO nie tłumi bezpośredniego światła');
        sun.intensity = 0; fill(plane, 'atmosphereLight', [0, 0, 0, 0]);
        pixels.dark = draw('near'); close(pixels.dark, [0, 0, 0], 'Brak źródeł daje ciemność');
        fill(plane, 'surfaceEmission', [.4]); pixels.emission = draw('near');
        fill(plane, 'surfaceOcclusion', [0]); pixels.occludedEmission = draw('near');
        close(pixels.emission, [26, 26, 26], 'Liniowa emisja, bez dodatkowej gammy');
        close(pixels.occludedEmission, pixels.emission, 'AO nie tłumi własnej emisji');
        await yieldBrowser();
        const webgl1 = await checkWebGL1();
        return { status: 'passed', variants, programs: programs.size, pixels, webgl1,
            scope: 'Prawdziwe materiały; liniowy render target 16x16; kontrolowane źródła i geometria.',
            initialSettings: { lightingModel: settings.get('lightingModel'), shadows: settings.get('shadows') } };
    } finally {
        for (const [uniform, value] of savedUniforms) {
            if (value?.clone && !value.isTexture && uniform.value?.copy) uniform.value.copy(value);
            else uniform.value = value;
        }
        renderer.setRenderTarget(saved.target); renderer.autoClear = saved.autoClear;
        renderer.toneMapping = saved.toneMapping; renderer.outputColorSpace = saved.outputColorSpace;
        renderer.setClearColor(saved.clearColor, saved.clearAlpha);
        renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
        debris.dispose(); for (const resource of resources) resource.dispose();
    }
}
