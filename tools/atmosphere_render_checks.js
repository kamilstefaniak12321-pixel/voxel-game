// Piksele rzeczywistych adapterów gry, przy kontrolowanej radiancji nieba.
// Liniowy cel oddziela mgłę od istniejącego, osobno testowanego wyjścia HDR.
import * as THREE from 'three';
import { SEA_LEVEL } from '../src/config.js';
import { sampleAerialHaze } from '../src/sky/AerialPerspective.js';
import { blockMaterial, plantMaterial, leafMaterial, waterMaterial, waterUniforms,
    setShadowDefine, setPotatoDefine } from '../src/rendering/BlockRenderData.js';
import { createModelMaterial, modelLight } from '../src/rendering/ModelMaterial.js';
import { createFarTerrainMaterial } from '../src/world/FarTerrain.js';
import { skyUniforms } from '../src/sky/skyShader.js';
import { viewUniforms, chunkMaskUniforms } from '../src/rendering/viewUniforms.js';
import { shadowUniforms } from '../src/rendering/Shadows.js';
import { dynamicLightUniforms } from '../src/world/DynamicLight.js';
import { bounceUniforms } from '../src/world/BounceLight.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';
import { campfireLightUniforms } from '../src/rendering/CampfireLight.js';
import { lightingUniforms, setLightingView, resetLightingDiagnostics } from '../src/rendering/LightingDiagnostics.js';

export async function checkAtmosphereRendering({ renderer, yieldBrowser }) {
    const check = (condition, label) => { if (!condition) throw new Error(`Atmosfera: ${label}`); };
    const close = (a, b, label, tolerance = 2) => a.forEach((v, i) =>
        check(Math.abs(v - b[i]) <= tolerance, `${label}, kanał ${i}: ${v} != ${b[i]}`));
    const sets = [viewUniforms, skyUniforms, chunkMaskUniforms, shadowUniforms, modelLight,
        waterUniforms, dynamicLightUniforms, bounceUniforms, meteorLightUniforms,
        campfireLightUniforms, lightingUniforms];
    const savedUniforms = [...new Set(sets.flatMap(Object.values))].map(u => [u,
        u.value?.clone && !u.value.isTexture ? u.value.clone() : u.value]);
    const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest() };
    const resources = [], meshes = new Map(), pixels = {}, variants = [];
    const own = resource => { resources.push(resource); return resource; };
    const ground = SEA_LEVEL + 40;
    const target = own(new THREE.WebGLRenderTarget(16, 16));
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const white = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    white.needsUpdate = true;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0, 10, 4096);
    // Real sunlight slots remain present, but contribute zero energy.
    scene.add(new THREE.AmbientLight(0xffffff, 0),
        new THREE.DirectionalLight(0xffffff, 0), new THREE.DirectionalLight(0xffffff, 0));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000);
    camera.position.set(0, ground, 0); camera.lookAt(0, ground, -1);
    const plane = own(new THREE.PlaneGeometry(4, 4));
    const fill = (geometry, name, values) => {
        const count = geometry.getAttribute('position').count;
        let attribute = geometry.getAttribute(name);
        if (!attribute) geometry.setAttribute(name, attribute =
            new THREE.BufferAttribute(new Float32Array(count * values.length), values.length));
        for (let i = 0; i < count; i++) attribute.array.set(values, i * values.length);
        attribute.needsUpdate = true;
    };
    fill(plane, 'color', [0, 0, 0, 1]); fill(plane, 'atmosphereLight', [0, 0, 0, 1]);
    fill(plane, 'tint', [1, 1, 1, 1]); fill(plane, 'surfaceOcclusion', [1]);
    fill(plane, 'surfaceEmission', [0]); fill(plane, 'plantMotion', [0, 0]);
    const add = (name, material, geometry = plane) => {
        material.fog = true; material.toneMapped = false; material.transparent = false;
        material.blending = THREE.NoBlending;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = false; mesh.position.set(0, ground, -800);
        scene.add(mesh); meshes.set(name, mesh); return mesh;
    };
    const blocks = [blockMaterial, plantMaterial, leafMaterial, waterMaterial].map((source, i) => {
        const material = own(source.clone());
        material.onBeforeCompile = source.onBeforeCompile;
        material.defines = { ...source.defines }; material.map = white; material.color.setRGB(.25, .25, .25);
        add(['near', 'plant', 'leaf', 'water'][i], material); return material;
    });
    const model = own(createModelMaterial({ map: white }));
    model.color.setRGB(.25, .25, .25); add('model', model);
    const farPlane = own(new THREE.PlaneGeometry(4, 4));
    fill(farPlane, 'color', [.5, .5, .5, 1]); fill(farPlane, 'surfaceAlbedo', [.5, .5, .5, 1]);
    farPlane.setAttribute('normal', new THREE.Int8BufferAttribute([
        0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127
    ], 3, true));
    const far = own(createFarTerrainMaterial());
    const compileFar = far.onBeforeCompile;
    far.onBeforeCompile = (shader, context) => {
        compileFar(shader, context);
        shader.uniforms.uLodDebug = { value: 0 }; shader.uniforms.uPixelAngle = { value: 0 };
    };
    add('far', far, farPlane);
    const sky = [.1, .3, .5];
    const draw = name => {
        for (const [key, mesh] of meshes) mesh.visible = key === name;
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const rgba = new Uint8Array(4);
        renderer.readRenderTargetPixels(target, 8, 8, 1, 1, rgba);
        check(renderer.getContext().getError() === renderer.getContext().NO_ERROR, `${name}: błąd WebGL`);
        const program = renderer.properties.get(meshes.get(name).material).currentProgram;
        check(program && program.diagnostics?.runnable !== false, `${name}: kompilacja shadera`);
        return [...rgba.slice(0, 3)];
    };
    const endpoint = value => {
        fill(plane, 'color', [0, 0, 0, value]); fill(plane, 'atmosphereLight', [0, 0, 0, value]);
        modelLight.uModelSky.value = value;
    };
    const expectedAt = (d, cameraY = ground) => {
        const haze = sampleAerialHaze([0, 0, -d], { cameraY, farOuter: 4096 });
        return sky.map(value => Math.round(value * haze * 255));
    };
    try {
        renderer.autoClear = true; renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.setClearColor(0, 1); renderer.setScissorTest(false);
        resetLightingDiagnostics(); lightingUniforms.uLightingNatural.value = 1;
        lightingUniforms.uSurfaceMaterials.value = 0;
        viewUniforms.uAerialPerspective.value = 1; viewUniforms.uAerialDensity.value = 1;
        viewUniforms.uAerialHeight.value = 250; viewUniforms.uAerialCameraSky.value = 1;
        viewUniforms.uBrightness.value = 0; viewUniforms.uFarEnabled.value = 1;
        viewUniforms.uFarTextureBlend.value = 0; viewUniforms.uFarInner.value = 64;
        viewUniforms.uFarOuter.value = 4096; viewUniforms.uHazeDistance.value = 900;
        viewUniforms.uHazeMax.value = .82; viewUniforms.uCurvature.value = 0;
        viewUniforms.uGlobe.value = 0; viewUniforms.uUnderwater.value = 0; viewUniforms.uTime.value = 0;
        skyUniforms.uAtmosphericLight.value = 1; skyUniforms.uFogBrightness.value = 1;
        skyUniforms.uSkyZenith.value.setRGB(...sky); skyUniforms.uSkyHorizon.value.setRGB(...sky);
        skyUniforms.uSunset.value = 0; skyUniforms.uEclipseGlow.value = 0;
        skyUniforms.uSunHalo.value.setRGB(0, 0, 0); skyUniforms.uMeteorGlow.value.setRGB(0, 0, 0);
        skyUniforms.uSkyFlash.value.setRGB(0, 0, 0); skyUniforms.uNightDesaturation.value = 0;
        dynamicLightUniforms.uDynamicEnabled.value = 0;
        bounceUniforms.uBounceColor.value.setRGB(0, 0, 0);
        campfireLightUniforms.uFirePowers.value = [0, 0, 0, 0];
        meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);
        modelLight.uModelBlock.value.set(0, 0, 0); modelLight.uModelBounce.value.set(0, 0, 0);
        modelLight.uModelShadows.value = 0; modelLight.uModelDistantShadows.value = 0;
        waterUniforms.uWaterOpacity.value = waterUniforms.uWaterOpacityGrazing.value = 1;
        chunkMaskUniforms.uChunkMaskOrigin.value.set(1e6, 1e6);
        setShadowDefine(blocks, false, false);
        for (const potato of [false, true]) {
            setPotatoDefine([...blocks, model], potato);
            far.defines = potato ? { POTATO: '' } : {}; far.needsUpdate = true;
            const samples = {};
            for (const name of meshes.keys()) {
                samples[name] = draw(name);
                close(samples[name], expectedAt(800), `${name}: wspólna całka, potato=${potato}`);
            }
            variants.push({ potato, samples });
            await yieldBrowser();
        }
        // Indoor exposure must not turn the landscape behind a window black.
        viewUniforms.uAerialCameraSky.value = 0; skyUniforms.uFogBrightness.value = 0;
        for (const name of ['near', 'model', 'far']) {
            pixels[`window-${name}`] = draw(name);
            close(pixels[`window-${name}`], expectedAt(800), `${name}: widok za oknem`);
        }
        endpoint(0);
        for (const name of ['near', 'plant', 'leaf', 'model']) {
            pixels[`closed-${name}`] = draw(name);
            close(pixels[`closed-${name}`], [0, 0, 0], `${name}: zamknięty korytarz`, 0);
        }
        endpoint(1); viewUniforms.uAerialCameraSky.value = 1;
        for (const d of [8, 24, 48, 800]) {
            for (const mesh of meshes.values()) mesh.position.z = -d;
            const sample = draw('near'); pixels[`distance-${d}`] = sample;
            close(sample, expectedAt(d), `Głębia ${d}`);
        }
        for (const mesh of meshes.values()) mesh.position.set(0, ground + 1000, -800);
        camera.position.y = ground + 1000; camera.lookAt(0, ground + 1000, -1);
        pixels.high = draw('near'); close(pixels.high, expectedAt(800, ground + 1000), 'Rozrzedzenie wysoko nad terenem');
        for (const mesh of meshes.values()) mesh.position.set(0, ground, -800);
        camera.position.y = ground; camera.lookAt(0, ground, -1);
        viewUniforms.uAerialPerspective.value = 0; skyUniforms.uFogBrightness.value = .2;
        const legacy = sky.map(v => Math.round(v * .2 * .82 * (1 - Math.exp(-800 / 900)) * 255));
        for (const name of ['near', 'model', 'far']) {
            pixels[`baseline-${name}`] = draw(name);
            close(pixels[`baseline-${name}`], legacy, `${name}: zachowany bazowy profil`);
        }
        viewUniforms.uAerialPerspective.value = 1;
        viewUniforms.uUnderwater.value = 1; viewUniforms.uUnderwaterColor.value.setRGB(.02, .11, .18);
        viewUniforms.uUnderwaterDensity.value = .08;
        for (const name of ['near', 'model']) {
            pixels[`water-${name}`] = draw(name);
            close(pixels[`water-${name}`], [.02, .11, .18].map(v => Math.round(v * 255)),
                `${name}: pod wodą obowiązuje wodna mgła`);
        }
        viewUniforms.uUnderwater.value = 0;
        setLightingView('albedo'); pixels.albedo = draw('near');
        close(pixels.albedo, [.25, .25, .25].map(v => Math.round(v * 255)), 'Diagnostyka albedo pomija atmosferę');
        resetLightingDiagnostics();
        return { status: 'passed', variants, pixels,
            scope: 'Prawdziwe materiały; liniowy render target 16×16; kamera, endpoint sky access, wysokość i dystans.' };
    } finally {
        for (const [uniform, value] of savedUniforms) {
            if (value?.clone && !value.isTexture && uniform.value?.copy) uniform.value.copy(value);
            else uniform.value = value;
        }
        renderer.setRenderTarget(saved.target); renderer.autoClear = saved.autoClear;
        renderer.toneMapping = saved.toneMapping; renderer.outputColorSpace = saved.outputColorSpace;
        renderer.setClearColor(saved.clearColor, saved.clearAlpha);
        renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
        for (const resource of resources) resource.dispose();
    }
}
