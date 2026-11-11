// Regresje prawdziwych materiałów gry. Mały liniowy render target oddziela
// kompozycję światła od nieba, ekspozycji, mgły i tonemappingu całego kadru.
import * as THREE from 'three';
import { blockMaterial, plantMaterial, leafMaterial, waterMaterial, waterUniforms,
    setShadowDefine, setPotatoDefine } from '../src/rendering/BlockRenderData.js';
import { createModelMaterial, modelLight } from '../src/rendering/ModelMaterial.js';
import { buildBlockGeometry } from '../src/player/PlayerModel.js';
import { createFarTerrainMaterial } from '../src/world/FarTerrain.js';
import { CubeParticles } from '../src/rendering/CubeParticles.js';
import { skyUniforms } from '../src/sky/skyShader.js';
import { viewUniforms, chunkMaskUniforms } from '../src/rendering/viewUniforms.js';
import { shadowUniforms } from '../src/rendering/Shadows.js';
import { dynamicLightUniforms } from '../src/world/DynamicLight.js';
import { bounceUniforms } from '../src/world/BounceLight.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';
import { lightingUniforms, setLightingView, setLightingComponent, resetLightingDiagnostics } from '../src/rendering/LightingDiagnostics.js';
import { campfireLightUniforms } from '../src/rendering/CampfireLight.js';
import { newCampfire } from '../src/game/CampfireState.js';
import { SURFACE_PROFILES } from '../src/rendering/SurfaceProfiles.js';

export async function checkSurfaceRendering({ game, settings, renderer, yieldBrowser }) {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const close = (actual, expected, label, tolerance = 2) => actual.forEach((v, i) =>
        check(Math.abs(v - expected[i]) <= tolerance, `${label}, RGB[${i}]: ${v} != ${expected[i]}`));
    const uniforms = [...new Set([skyUniforms, viewUniforms, chunkMaskUniforms, shadowUniforms,
        dynamicLightUniforms, bounceUniforms, meteorLightUniforms, modelLight, waterUniforms,
        lightingUniforms, campfireLightUniforms].flatMap(Object.values))];
    const savedUniforms = uniforms.map(uniform => [uniform,
        uniform.value?.clone && !uniform.value.isTexture ? uniform.value.clone() : uniform.value]);
    const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest() };
    const resources = [], variants = [], programs = new Set(), pixels = {};
    let fireFixture = null, glowFixture = null;
    const own = resource => { resources.push(resource); return resource; };
    const target = own(new THREE.WebGLRenderTarget(16, 16));
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const white = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    white.needsUpdate = true;
    const blackAverage = own(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1));
    const matchingAverage = own(new THREE.DataTexture(new Uint8Array([64, 64, 64, 255]), 1, 1));
    blackAverage.needsUpdate = matchingAverage.needsUpdate = true;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.set(0, 0, 2); camera.lookAt(0, 0, 0);
    const ambient = new THREE.AmbientLight(0xffffff, Math.PI * .4);
    const sun = new THREE.DirectionalLight(0xffffff, 0);
    sun.position.set(0, 0, 2);
    const moon = new THREE.DirectionalLight(0xffffff, 0);
    moon.position.set(0, 0, 2);
    scene.add(ambient, sun, moon);
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
        // Three.clone nie kopiuje adaptera ani domyślnych atrybutów gry.
        // Świeży kontekst GL bez nich podałby canopyTint=(0,0,0).
        material.onBeforeCompile = source.onBeforeCompile;
        material.defaultAttributeValues = structuredClone(source.defaultAttributeValues);
        material.defines = { ...source.defines }; material.map = white;
        material.color.setRGB(.25, .25, .25);
        add(['near', 'plant', 'leaf', 'water'][i], material);
        return material;
    });
    // Exact chunk attribute types exercise both the new linear-albedo mode
    // and all three motion modes on the GPU, independently of world density.
    const riverGeometry = own(plane.clone());
    const riverTint = [51, 128, 26];
    riverGeometry.setAttribute('tint', new THREE.BufferAttribute(new Uint8Array([
        ...riverTint, 128, ...riverTint, 128, ...riverTint, 128, ...riverTint, 128
    ]), 4, true));
    riverGeometry.setAttribute('plantMotion', new THREE.BufferAttribute(new Uint8Array([
        255, 0, 255, 0, 0, 0, 0, 0
    ]), 2, true));
    const riverMaterial = own(plantMaterial.clone());
    riverMaterial.onBeforeCompile = plantMaterial.onBeforeCompile;
    riverMaterial.defaultAttributeValues = structuredClone(plantMaterial.defaultAttributeValues);
    riverMaterial.defines = { ...plantMaterial.defines }; riverMaterial.map = white;
    riverMaterial.color.setRGB(.25, .25, .25);
    blockMaterials.push(riverMaterial);
    add('riverPlant', riverMaterial, riverGeometry);
    const model = own(createModelMaterial({ map: white }));
    model.color.setRGB(.25, .25, .25); add('model', model);
    const heldGrass = own(createModelMaterial({ map: white, alphaTest: .5, vertexColors: true }));
    heldGrass.color.setRGB(.25, .25, .25);
    add('heldGrass', heldGrass, own(buildBlockGeometry('short_grass')));
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
        setPotatoDefine([...blockMaterials, model, heldGrass, debris.mesh.material], potato);
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
            check(!plane.hasAttribute('canopyTint'), 'WebGL1: próba domyślnego tintu musi nie mieć atrybutu');
            fill(plane, 'canopyTint', [1, 1, 1]);
            samples.explicitNeutralCanopy = sample();
            close(samples.openAmbient, samples.explicitNeutralCanopy, 'WebGL1: brak canopyTint musi być neutralny jak jawne RGB1');
            plane.deleteAttribute('canopyTint');
            samples.restoredDefaultCanopy = sample();
            close(samples.restoredDefaultCanopy, samples.explicitNeutralCanopy, 'WebGL1: usunięcie atrybutu przywraca neutralny domyślny tint');
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
        // Wyjście z podglądu nie może pozostawić innego wyglądu zwykłej gry,
        // również gdy uniform trzeba odzyskać już po zastosowaniu ustawień.
        viewUniforms.uFarTextureBlend.value = 0;
        game.applySettings();
        check(viewUniforms.uFarTextureBlend.value === 1, 'Ustawienia gry nie przywróciły mieszania tekstur po menu');
        viewUniforms.uFarTextureBlend.value = 0;
        game.updateFarRange();
        check(viewUniforms.uFarTextureBlend.value === 1, 'Aktualizacja gry nie przywróciła mieszania tekstur po menu');
        Object.assign(viewUniforms.uBrightness, { value: 0 });
        viewUniforms.uFarEnabled.value = 0; viewUniforms.uFarInner.value = 48;
        viewUniforms.uFarOuter.value = 1000; viewUniforms.uHazeMax.value = 0;
        viewUniforms.uCurvature.value = 0; viewUniforms.uGlobe.value = 0;
        viewUniforms.uUnderwater.value = 0; viewUniforms.uTime.value = 0;
        chunkMaskUniforms.uChunkMaskOrigin.value.set(1e6, 1e6);
        skyUniforms.uNightDesaturation.value = 0; skyUniforms.uFogBrightness.value = 1;
        resetLightingDiagnostics();
        lightingUniforms.uLightingNatural.value = 1;
        // Własna tablica: nie modyfikujemy zachowanego stanu ognisk gry.
        campfireLightUniforms.uFirePowers.value = [0, 0, 0, 0];
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

        // Rzeczywisty shader: tekstura i jej średnia celowo różnią się.
        // Menu zachowuje teksturę także ZA granicą pełnego mieszania, a 1
        // przywraca dawną średnią bez wymiany programu/materiału.
        const atlasAverage = viewUniforms.uAtlasAverage.value;
        viewUniforms.uAtlasAverage.value = blackAverage;
        viewUniforms.uFarInner.value = 1;
        pixels.farTextureBlend = {};
        for (const name of ['near', 'plant', 'leaf']) {
            viewUniforms.uFarEnabled.value = 0;
            const original = draw(name);
            viewUniforms.uFarEnabled.value = 1;
            viewUniforms.uFarTextureBlend.value = 0;
            const sharp = draw(name);
            close(sharp, original, `${name}: ostre menu zachowuje atlas mimo włączonego horyzontu`);
            viewUniforms.uFarTextureBlend.value = 1;
            const averaged = draw(name);
            close(averaged, [0, 0, 0], `${name}: zwykła gra nadal korzysta ze średniej atlasu`);
            viewUniforms.uFarTextureBlend.value = 0;
            close(draw(name), sharp, `${name}: ponowne wejście do menu nie wymaga rekompilacji`);
            pixels.farTextureBlend[name] = { original, sharp, averaged };
        }
        // Identyczne albedo obu ścieżek: zmiana mieszania nie zmienia mgły.
        viewUniforms.uAtlasAverage.value = matchingAverage;
        viewUniforms.uHazeMax.value = .6; viewUniforms.uHazeDistance.value = 1;
        scene.fog = new THREE.Fog(0, 0, 1);
        blockMaterials[0].fog = true; blockMaterials[0].needsUpdate = true;
        const sharpHaze = draw('near');
        viewUniforms.uFarTextureBlend.value = 1;
        close(draw('near'), sharpHaze, 'Wyłączenie mieszania tekstur nie przełącza ani nie usuwa atmosfery');
        pixels.farTextureBlend.haze = sharpHaze;
        blockMaterials[0].fog = false; blockMaterials[0].needsUpdate = true;
        scene.fog = null;
        viewUniforms.uAtlasAverage.value = atlasAverage;
        viewUniforms.uFarEnabled.value = 0; viewUniforms.uFarInner.value = 48;
        viewUniforms.uHazeMax.value = 0;

        pixels.riverDay = draw('riverPlant');
        pixels.heldGrass = draw('heldGrass');
        close(pixels.heldGrass, pixels.natural,
            'Stara roślina w ręce po modelu rzecznym: biały kolor wierzchołków, bez czarnej sylwetki');
        close(pixels.riverDay, pixels.natural.map((v, i) => v * riverTint[i] / 255),
            'Rośliny rzeczne: liniowy kolor modelu, bez podwójnej gammy');
        check(pixels.riverDay[1] > pixels.riverDay[0] && pixels.riverDay[1] > pixels.riverDay[2],
            'Rośliny rzeczne nie otrzymały koloru modelu');
        ambient.intensity = Math.PI * .08;
        pixels.riverNight = draw('riverPlant');
        close(pixels.riverNight, pixels.riverDay.map(v => v * .2), 'Rośliny rzeczne: światło nocne');
        check(pixels.riverNight[1] > 0 && pixels.riverNight[1] < pixels.riverDay[1],
            'Rośliny rzeczne świecą same albo znikają w świetle nocnym');
        fill(riverGeometry, 'color', [0, 0, 0, 0]);
        fill(riverGeometry, 'atmosphereLight', [0, 0, 0, 0]);
        for (const atmosphere of [0, 1]) {
            skyUniforms.uAtmosphericLight.value = atmosphere;
            close(draw('riverPlant'), [0, 0, 0], `Rośliny rzeczne: ciemność, model ${atmosphere}`);
        }
        skyUniforms.uAtmosphericLight.value = 1;
        ambient.intensity = Math.PI * .4;
        fill(riverGeometry, 'color', [0, 0, 0, 1]);
        fill(riverGeometry, 'atmosphereLight', [0, 0, 0, 1]);
        const motion = riverGeometry.getAttribute('plantMotion');
        for (const kind of [0, 128, 255]) {
            for (let i = 0; i < motion.count; i++) motion.array[i * 2 + 1] = kind;
            motion.needsUpdate = true;
            viewUniforms.uTime.value = 4.7;
            waterUniforms.uWaveHeight.value = .135;
            close(draw('riverPlant'), pixels.riverDay, `Rośliny rzeczne: tryb ruchu ${kind}`);
        }
        viewUniforms.uTime.value = 0;
        waterUniforms.uWaveHeight.value = .045;
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

        // E01/E10: prawdziwy unroll Three dla Sun i Moon. Źródła mają
        // rozłączne kanały, więc pomylenie indeksu albo przechwycenie
        // skumulowanej energii jest widoczne w odczytanym pikselu.
        pixels.diagnostics = {};
        fill(plane, 'atmosphereLight', [0, 0, 0, 1]);
        fill(plane, 'surfaceEmission', [0]); fill(plane, 'surfaceOcclusion', [1]);
        ambient.color.setRGB(0, 1, 0); ambient.intensity = Math.PI * .3;
        sun.color.setRGB(1, 0, 0); sun.intensity = Math.PI * .2;
        moon.color.setRGB(0, 0, 1); moon.intensity = Math.PI * .1;
        flags(0, false); skyUniforms.uAtmosphericLight.value = 1;
        resetLightingDiagnostics();
        for (const name of ['near', 'plant', 'leaf', 'model', 'far', 'debris']) {
            const samples = {};
            setLightingView('full'); samples.full = draw(name);
            for (const source of ['sun', 'moon', 'sky']) {
                setLightingView(source); samples[source] = draw(name);
                const channel = source === 'sun' ? 0 : source === 'sky' ? 1 : 2;
                check(samples[source][channel] > 3, `${name}/${source}: brak dodatniej kontroli źródła`);
                close(samples[source].map((value, index) => index === channel ? 0 : value),
                    [0, 0, 0], `${name}/${source}: do diagnostyki weszło inne źródło`);
            }
            close(samples.full, samples.sun.map((value, i) => value + samples.moon[i] + samples.sky[i]),
                `${name}: suma diagnostyczna odtwarza liniowy obraz`);
            setLightingView('full');
            for (const source of ['sun', 'moon', 'sky']) {
                setLightingComponent(source, false);
                samples[`without_${source}`] = draw(name);
                close(samples[`without_${source}`], samples.full.map((value, i) => value - samples[source][i]),
                    `${name}: wyłączenie ${source} usuwa tylko jego składnik`);
                setLightingView(source);
                close(draw(name), [0, 0, 0], `${name}: wyłączony ${source} nie zostaje w diagnostyce`);
                setLightingComponent(source, true); setLightingView('full');
            }
            pixels.diagnostics[name] = samples;
        }

        // Dane dostępu do nieba trafiają również do odłamka. Samo
        // przechwycenie Three przed particleSky dawałoby fałszywie
        // jasny widok diagnostyczny we wnętrzu zamkniętej komory.
        const particleLight = debris.mesh.geometry.getAttribute('particleLight');
        particleLight.setXYZW(0, 0, 0, 0, 0); particleLight.needsUpdate = true;
        fill(plane, 'atmosphereLight', [0, 0, 0, 0]); modelLight.uModelSky.value = 0;
        for (const name of ['near', 'plant', 'leaf', 'model', 'debris']) {
            for (const source of ['full', 'sun', 'moon', 'sky']) {
                setLightingView(source);
                close(draw(name), [0, 0, 0], `${name}/${source}: zerowy dostęp nie może pokazywać energii`);
            }
        }
        particleLight.setXYZW(0, 0, 0, 0, 1); particleLight.needsUpdate = true;
        modelLight.uModelSky.value = 1;
        fill(plane, 'atmosphereLight', [0, 0, 0, 1]);

        // Lokalny składnik, emisja i odbicie mają własne przełączniki.
        // Żaden z nich nie może zgasić pozostałych ani zmieniać albedo.
        ambient.intensity = sun.intensity = moon.intensity = 0;
        fill(plane, 'atmosphereLight', [.5, .25, 0, 0]);
        fill(plane, 'surfaceEmission', [.4]);
        setLightingView('local'); const localOnly = draw('near');
        setLightingView('emission'); const emissionOnly = draw('near');
        check(localOnly[0] > 5 && emissionOnly[0] > 5, 'Lokalna kontrola musi mieć obydwa dodatnie składniki');
        setLightingView('full');
        close(draw('near'), localOnly.map((value, i) => value + emissionOnly[i]), 'Lampa + emisja składają się raz');
        setLightingComponent('local', false);
        close(draw('near'), emissionOnly, 'Wyłączenie lokalnego światła zachowuje emisję');
        setLightingView('local'); close(draw('near'), [0, 0, 0], 'Wyłączona lampa nie zostaje w diagnostyce');
        setLightingComponent('local', true); setLightingComponent('emission', false); setLightingView('full');
        close(draw('near'), localOnly, 'Wyłączenie emisji zachowuje lokalne światło');
        setLightingView('emission'); close(draw('near'), [0, 0, 0], 'Wyłączona emisja nie zostaje w diagnostyce');
        resetLightingDiagnostics();
        fill(plane, 'atmosphereLight', [0, 0, 0, 0]);
        fill(plane, 'surfaceOcclusion', [0]);
        setLightingView('full'); close(draw('near'), emissionOnly, 'Natural: AO=0 nie wygasza emisji');
        setLightingView('emission'); close(draw('near'), emissionOnly, 'Emisja przy AO=0 jest czytelna w diagnostyce');

        modelLight.uModelBounce.value.set(0, .2, 0);
        setLightingView('bounce'); const bounceOnly = draw('model');
        check(bounceOnly[1] > 5 && bounceOnly[0] === 0 && bounceOnly[2] === 0, 'Brak odrębnej kontroli odbicia');
        setLightingView('full'); close(draw('model'), bounceOnly, 'Odbicie mnoży albedo tylko raz');
        setLightingComponent('bounce', false); close(draw('model'), [0, 0, 0], 'Wyłączenie odbicia usuwa jego energię');
        setLightingView('albedo'); close(draw('model'), [64, 64, 64], 'Albedo nie zależy od źródeł');
        modelLight.uModelBounce.value.set(0, 0, 0);
        pixels.diagnostics.local = { localOnly, emissionOnly, bounceOnly };
        resetLightingDiagnostics();
        ambient.color.setRGB(1, 1, 1); sun.color.setRGB(1, 1, 1); moon.color.setRGB(1, 1, 1);

        // E06: prawdziwe adaptery bloków, wycięć, liści i modelu. Profil
        // ma dwa surowe bajty, jak w chunku; pomyłka normalize wyzeruje
        // dodatnią kontrolę liścia i owocu, zamiast dać pozorny PASS.
        pixels.materialExtensions = {};
        plane.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(
            Array(plane.getAttribute('position').count).fill(SURFACE_PROFILES.leaf).flat(), 2));
        const profile = name => fill(plane, 'surfaceProfile', SURFACE_PROFILES[name]);
        flags(0, false);
        fill(plane, 'surfaceEmission', [0]); fill(plane, 'surfaceOcclusion', [1]);
        fill(plane, 'atmosphereLight', [0, 0, 0, 1]); fill(plane, 'normal', [0, 0, 1]);
        modelLight.uModelSky.value = 1; modelLight.uModelShadows.value = 0;
        ambient.intensity = moon.intensity = 0; sun.intensity = Math.PI * .4;
        sun.position.set(0, 0, -2);
        lightingUniforms.uSurfaceMaterials.value = 1;
        lightingUniforms.uLeafTransmission.value = lightingUniforms.uMaterialSpecular.value = 1;
        for (const name of ['near', 'plant', 'leaf', 'model']) {
            const sample = {};
            profile('leaf'); setLightingView('transmission');
            sample.backlit = draw(name);
            check(sample.backlit.every(v => v > 4), `${name}: brak dodatniej kontroli przeświecania`);
            fill(plane, 'normal', [0, 0, -1]);
            close(draw(name), sample.backlit, `${name}: odwrócenie normalnej nie zmienia transmisji cienkiego liścia`);
            fill(plane, 'normal', [0, .8, .6]);
            close(draw(name), sample.backlit, `${name}: uproszczona normalna kępki nie tworzy skoku transmisji`);
            fill(plane, 'normal', [0, 0, 1]);
            profile('leafVoxel'); sample.voxel = draw(name);
            profile('leafBlock'); sample.block = draw(name);
            check(sample.voxel[0] < sample.backlit[0] && sample.block[0] < sample.voxel[0],
                `${name}: większa objętość liści nie ogranicza przeświecania`);
            for (const kind of ['branch', 'bark', 'wood', 'fruit', 'stone', 'emissive']) {
                profile(kind); close(draw(name), [0, 0, 0], `${name}/${kind}: materiał niebędący liściem prześwieca`);
            }
            profile('leaf');
            sun.position.set(0, 0, 2); close(draw(name), [0, 0, 0], `${name}: słońce przed liściem nie jest podświetleniem od tyłu`);
            sun.position.set(2, 0, 0); close(draw(name), [0, 0, 0], `${name}: boczne słońce nie tworzy poświaty frontalnej`);
            sun.position.set(0, 0, -2);
            lightingUniforms.uLeafTransmission.value = 0;
            close(draw(name), [0, 0, 0], `${name}: ustawienie OFF wyłącza transmisję`);
            lightingUniforms.uLeafTransmission.value = 1;
            setLightingComponent('transmission', false);
            close(draw(name), [0, 0, 0], `${name}: maska transmisji wyłącza tylko nowy składnik`);
            setLightingComponent('transmission', true);
            lightingUniforms.uSurfaceMaterials.value = 0;
            close(draw(name), [0, 0, 0], `${name}: profil podstawowy nie ma transmisji`);
            lightingUniforms.uSurfaceMaterials.value = 1;
            setLightingComponent('sun', false);
            close(draw(name), [0, 0, 0], `${name}: wyłączone źródło nie pozostawia poświaty`);
            setLightingComponent('sun', true);
            fill(plane, 'atmosphereLight', [0, 0, 0, 0]); modelLight.uModelSky.value = 0;
            close(draw(name), [0, 0, 0], `${name}: zasłonięte źródło nie prześwietla wnętrza`);
            fill(plane, 'atmosphereLight', [0, 0, 0, 1]); modelLight.uModelSky.value = 1;
            sun.intensity = 0;
            close(draw(name), [0, 0, 0], `${name}: liść nie świeci w nocy bez źródła`);
            sun.intensity = Math.PI * .4;
            setLightingView('full'); const fullLeaf = draw(name);
            setLightingComponent('transmission', false); const withoutLeaf = draw(name);
            close(fullLeaf, withoutLeaf.map((v, i) => v + sample.backlit[i]), `${name}: transmisja dodana dokładnie raz`);
            setLightingComponent('transmission', true);
            setLightingView('albedo'); close(draw(name), [64, 64, 64], `${name}: transmisja nie zmienia albedo`);

            sun.position.set(0, 0, 2); profile('fruit'); setLightingView('specular');
            sample.fruit = draw(name);
            check(sample.fruit.every(v => v > 3 && v < 20), `${name}: mały, ograniczony refleks owocu`);
            for (const kind of ['leaf', 'branch', 'bark', 'wood', 'stone', 'emissive']) {
                profile(kind); close(draw(name), [0, 0, 0], `${name}/${kind}: wspólny przypadkowy połysk`);
            }
            profile('fruit'); lightingUniforms.uMaterialSpecular.value = 0;
            close(draw(name), [0, 0, 0], `${name}: refleks OFF`);
            lightingUniforms.uMaterialSpecular.value = 1; setLightingComponent('specular', false);
            close(draw(name), [0, 0, 0], `${name}: refleks mask OFF`);
            setLightingComponent('specular', true); sun.intensity = 0;
            close(draw(name), [0, 0, 0], `${name}: owoc nie świeci bez źródła`);
            sun.intensity = Math.PI * .4; sun.position.set(0, 0, -2);
            pixels.materialExtensions[name] = sample;
        }
        profile('matte'); setLightingView('full'); resetLightingDiagnostics();
        sun.position.set(0, 0, 2); sun.intensity = 0;
        // E05: prawdziwe próbkowanie czterech warstw tekstury 3D, również
        // przy jakości cieni 0. Źródło testowe jest kontrolowanym transferem,
        // nie ręcznym dodaniem koloru do końcowego shadera.
        const bounceTexture = own(new THREE.Data3DTexture(new Uint8Array([
            255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255
        ]), 1, 1, 4));
        bounceTexture.format = THREE.RGBAFormat; bounceTexture.type = THREE.UnsignedByteType;
        bounceTexture.minFilter = bounceTexture.magFilter = THREE.LinearFilter;
        bounceTexture.unpackAlignment = 1; bounceTexture.needsUpdate = true;
        bounceUniforms.uBounceLight.value = bounceTexture;
        bounceUniforms.uBounceOrigin.value.set(-21, -13, -21);
        bounceUniforms.uBounceSize.value.set(42, 26, 42);
        bounceUniforms.uBounceSun.value.setRGB(1, .5, .25);
        bounceUniforms.uBounceMoon.value.setRGB(0, 0, 0);
        bounceUniforms.uBounceSky.value.setRGB(0, 0, 0);
        bounceUniforms.uBounceGround.value.setRGB(0, 0, 0);
        bounceUniforms.uBounceSaturation.value = 1;
        bounceUniforms.uBounceColor.value.setRGB(.18, .18, .18);
        pixels.materialBounceNoShadows = {};
        setLightingView('bounce');
        for (const name of ['near', 'plant', 'leaf']) {
            const value = draw(name);
            check(value[0] > 5 && value[0] > value[1] && value[1] > value[2] && value[2] > 0,
                `${name}: brak rzeczywistego barwnego odbicia przy shadows=0`);
            setLightingComponent('bounce', false);
            close(draw(name), [0, 0, 0], `${name}: wyłączone odbicie nadal próbuje świecić`);
            setLightingComponent('bounce', true);
            pixels.materialBounceNoShadows[name] = value;
        }
        bounceUniforms.uBounceColor.value.setRGB(0, 0, 0); resetLightingDiagnostics();
        await yieldBrowser();

        // Ognisko: prawdziwe materiały widoku, przy lokalnych danych
        // zamkniętej komory. Popiół/podpałka nie są emiterami; węgle,
        // szczeliny żaru, płomień i iskry mają oddzielną emisję.
        pixels.campfire = {};
        const fire = newCampfire(0, 40, 0);
        fire.logs = [{ wood: 'oak', burn: .8 }]; fire.ash = true; fire.tinder = 'short_grass';
        const fireRenderer = game.campfires.renderer;
        fireFixture = { renderer: fireRenderer, key: '__lighting-material-test__' };
        const view = fireFixture.view = fireRenderer.createView(fireFixture.key, fire);
        fireRenderer.syncView(view, fire, 0, 0);
        view.lighting.uModelSky.value = 0; view.lighting.uModelSun.value = 0;
        view.lighting.uModelDistantShadows.value = 0; view.lighting.uModelBlock.value.set(0, 0, 0);
        for (const [name, material] of [['ash', view.ash.material], ['tinder', view.tinder.material], ['coal', view.coalMaterial]]) {
            add(name, material);
            const legacy = own(new THREE.MeshLambertMaterial({ color: material.color, flatShading: material.flatShading,
                emissive: material.emissive, emissiveIntensity: material.emissiveIntensity }));
            add(`legacy_${name}`, legacy);
        }
        ambient.intensity = Math.PI * .4; sun.intensity = Math.PI * .2;
        view.coalMaterial.emissiveIntensity = .4;
        meshes.get('legacy_coal').material.emissiveIntensity = .4;
        viewUniforms.uBrightness.value = .4; skyUniforms.uNightDesaturation.value = .6;
        lightingUniforms.uLightingNatural.value = 0;
        for (const name of ['ash', 'tinder', 'coal']) {
            close(draw(name), draw(`legacy_${name}`), `${name}: baza zachowuje dawny Lambert bez dodatkowych filtrów`);
        }
        viewUniforms.uBrightness.value = 0; skyUniforms.uNightDesaturation.value = 0;
        view.coalMaterial.emissiveIntensity = 0;
        lightingUniforms.uLightingNatural.value = 1;
        for (const name of ['ash', 'tinder', 'coal']) {
            const dark = draw(name);
            close(dark, [0, 0, 0], `${name}: zamknięta komora bez emisji jest ciemna`);
            pixels.campfire[name] = dark;
        }
        view.coalMaterial.emissiveIntensity = .4;
        const coal = draw('coal'); check(coal[0] > 15, 'Brak dodatniej próby żarzących węgli');
        setLightingView('emission'); close(draw('coal'), coal, 'Emisja Lamberta jest oddzielna i liczona raz');
        setLightingComponent('emission', false); setLightingView('full');
        close(draw('coal'), [0, 0, 0], 'Wyłączenie emisji wygasza węgle bez rozjaśnienia niebem');
        resetLightingDiagnostics();
        pixels.campfire.embers = coal;

        const charred = view.logs[0].mesh.material;
        charred.userData.char.uChar.value = 1; charred.userData.char.uHeat.value = 1;
        add('charred', charred);
        const flame = own(fireRenderer.flameMaterial.clone());
        flame.onBeforeCompile = fireRenderer.flameMaterial.onBeforeCompile;
        flame.customProgramCacheKey = fireRenderer.flameMaterial.customProgramCacheKey;
        add('flame', flame);
        glowFixture = new CubeParticles(scene, { capacity: 1, glowing: true });
        glowFixture.emit({ position: new THREE.Vector3(), size: 1, life: 10, colors: new THREE.Color(1, .42, .06) });
        glowFixture.update(0, game.world); glowFixture.mesh.setMatrixAt(0, new THREE.Matrix4());
        glowFixture.mesh.instanceMatrix.needsUpdate = true; meshes.set('spark', glowFixture.mesh);
        const firePointGeometry = own(new THREE.BufferGeometry());
        firePointGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
        firePointGeometry.setAttribute('particleColor', new THREE.Float32BufferAttribute([1, .42, .06, 1], 4));
        firePointGeometry.setAttribute('particleSize', new THREE.Float32BufferAttribute([.8], 1));
        firePointGeometry.setAttribute('particleEmission', new THREE.Float32BufferAttribute([1], 1));
        const firePointMaterial = own(fireRenderer.particleMaterial.clone());
        Object.assign(firePointMaterial.uniforms, lightingUniforms);
        firePointMaterial.uniforms.uPixelScale.value = 40;
        const firePoint = new THREE.Points(firePointGeometry, firePointMaterial);
        firePoint.frustumCulled = false; scene.add(firePoint); meshes.set('fireSpark', firePoint);
        const energyOf = name => {
            draw(name);
            const rgba = new Uint8Array(16 * 16 * 4);
            renderer.readRenderTargetPixels(target, 0, 0, 16, 16, rgba);
            return rgba.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : value), 0);
        };
        for (const name of ['charred', 'flame', 'spark', 'fireSpark']) {
            setLightingView('full'); const energy = energyOf(name);
            check(energy > 20, `${name}: brak dodatniej kontroli emisji`);
            setLightingView('emission'); const diagnostic = energyOf(name);
            check(Math.abs(diagnostic - energy) <= 8, `${name}: emisja rozbiega się z obrazem`);
            setLightingComponent('emission', false); setLightingView('full');
            check(energyOf(name) === 0, `${name}: wyłączona emisja nadal świeci`);
            setLightingComponent('emission', true);
            pixels.campfire[name] = { energy, diagnostic };
        }
        resetLightingDiagnostics();
        firePointGeometry.getAttribute('particleEmission').setX(0, 0);
        firePointGeometry.getAttribute('particleEmission').needsUpdate = true;
        const smoke = energyOf('fireSpark');
        setLightingComponent('emission', false);
        check(energyOf('fireSpark') === smoke, 'Wyłączenie iskier nie usuwa rozpraszania dymu');
        setLightingComponent('local', false);
        check(energyOf('fireSpark') === 0, 'Rozpraszanie dymu należy do lokalnego składnika');
        resetLightingDiagnostics();
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
        if (fireFixture?.view) fireFixture.renderer.removeView(fireFixture.key, fireFixture.view);
        glowFixture?.dispose();
        debris.dispose(); for (const resource of resources) resource.dispose();
    }
}
