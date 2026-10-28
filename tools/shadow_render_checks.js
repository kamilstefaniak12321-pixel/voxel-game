// Prawdziwy kontroler map głębi i rzeczywiste materiały odbiorców.
// Świat-fixture zawiera tylko daleką przeszkodę: pusta mapa near nie może
// skasować jej cienia na bloku ani modelu stojącym przy środku kaskad.
import * as THREE from 'three';
import { SunShadows, shadowUniforms, SHADOW_CASTER_MATERIALS } from '../src/rendering/Shadows.js';
import { blockMaterial, setShadowDefine } from '../src/rendering/BlockRenderData.js';
import { createModelMaterial, modelLight, setModelPreviewRenderer } from '../src/rendering/ModelMaterial.js';
import { createFarTerrainMaterial } from '../src/world/FarTerrain.js';
import { skyUniforms } from '../src/sky/skyShader.js';
import { viewUniforms, chunkMaskUniforms } from '../src/rendering/viewUniforms.js';
import { dynamicLightUniforms } from '../src/world/DynamicLight.js';
import { bounceUniforms } from '../src/world/BounceLight.js';
import { meteorLightUniforms } from '../src/rendering/meteorLight.js';

export async function checkDistantShadowRendering({ renderer, yieldBrowser }) {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const allUniforms = [...new Set([shadowUniforms, modelLight, skyUniforms, viewUniforms,
        chunkMaskUniforms, dynamicLightUniforms, bounceUniforms, meteorLightUniforms].flatMap(Object.values))];
    const savedUniforms = allUniforms.map(u => [u, u.value?.clone && !u.value.isTexture ? u.value.clone() : u.value]);
    const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest() };
    const resources = [], own = resource => { resources.push(resource); return resource; };
    const target = own(new THREE.WebGLRenderTarget(16, 16));
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const white = own(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
    white.needsUpdate = true;
    const geometry = own(new THREE.PlaneGeometry(4, 4)); geometry.rotateX(-Math.PI / 2);
    const attribute = (mesh, name, value) => {
        const array = new Float32Array(mesh.getAttribute('position').count * value.length);
        for (let i = 0; i < array.length; i += value.length) array.set(value, i);
        mesh.setAttribute(name, new THREE.BufferAttribute(array, value.length));
    };
    attribute(geometry, 'color', [0, 0, 0, 1]); attribute(geometry, 'atmosphereLight', [0, 0, 0, 1]);
    attribute(geometry, 'surfaceOcclusion', [1]); attribute(geometry, 'surfaceEmission', [0]);
    attribute(geometry, 'tint', [1, 1, 1, 1]);
    const nearMaterial = own(blockMaterial.clone()); nearMaterial.onBeforeCompile = blockMaterial.onBeforeCompile;
    nearMaterial.map = white; nearMaterial.color.setRGB(.25, .25, .25); nearMaterial.defines = {};
    setShadowDefine([nearMaterial], true, true);
    const modelMaterial = own(createModelMaterial({ map: white })); modelMaterial.color.setRGB(.25, .25, .25);
    const farGeometry = own(geometry.clone());
    attribute(farGeometry, 'color', [.5, .5, .5, 1]); attribute(farGeometry, 'surfaceAlbedo', [.5, .5, .5, 1]);
    farGeometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array([
        0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127, 0
    ]), 3, true));
    const farMaterial = own(createFarTerrainMaterial()); farMaterial.defines = { USE_FAR_SHADOWS: '' };
    const farCompile = farMaterial.onBeforeCompile;
    farMaterial.onBeforeCompile = (shader, context) => {
        farCompile(shader, context); shader.uniforms.uLodDebug = { value: 0 }; shader.uniforms.uPixelAngle = { value: 0 };
    };
    const scene = new THREE.Scene();
    const receivers = new Map([['near', new THREE.Mesh(geometry, nearMaterial)],
        ['model', new THREE.Mesh(geometry, modelMaterial)], ['far', new THREE.Mesh(farGeometry, farMaterial)]]);
    for (const mesh of receivers.values()) {
        mesh.material.fog = false; mesh.material.toneMapped = false; mesh.frustumCulled = false; scene.add(mesh);
    }
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 50);
    camera.up.set(0, 0, -1);
    const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 32); scene.add(sun, sun.target);
    const focus = new THREE.Vector3(0, 64, 0);
    const world = { shadowScene: new THREE.Scene() };
    // Ściana 800 bloków w stronę niskiego Słońca. Jej duża szerokość
    // daje ten sam fizyczny cień po obu stronach wszystkich stref blendu.
    const wall = new THREE.Mesh(own(new THREE.BoxGeometry(24, 200, 1900)), SHADOW_CASTER_MATERIALS[0]);
    wall.position.set(800, 100, 0); wall.updateMatrixWorld(); wall.frustumCulled = false;
    const groundGeometry = own(new THREE.PlaneGeometry(2000, 2000)); groundGeometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeometry, SHADOW_CASTER_MATERIALS[0]);
    ground.position.y = 64; ground.updateMatrixWorld(); ground.frustumCulled = false;
    let wallPresent = true, groundPresent = false, retained = 0;
    const terrain = { active: true, outer: 2048, inner: 64, shadowRevision: 1,
        collectShadowCasters() {
            retained++; let disposed = false;
            return { revision: this.shadowRevision, casters: [...(wallPresent ? [wall] : []), ...(groundPresent ? [ground] : [])],
                triangleCount: (wallPresent ? 12 : 0) + (groundPresent ? 2 : 0),
                dispose() { if (!disposed) { disposed = true; retained--; } } };
        } };
    const shadows = new SunShadows(renderer);
    const sky = { atmosphere: {}, space: 0, state: { sunLightIntensity: 1, moonLightIntensity: 0 },
        sunLightDirection: new THREE.Vector3(),
        celestial: { sunDirection: new THREE.Vector3(), moonDirection: new THREE.Vector3(0, -1, 0) } };
    const orient = degrees => {
        const a = degrees * Math.PI / 180;
        sky.sunLightDirection.set(Math.cos(a), Math.sin(a), 0);
        sky.celestial.sunDirection.copy(sky.sunLightDirection);
        sun.position.copy(focus).addScaledVector(sky.sunLightDirection, 100);
        sun.target.position.copy(focus); sun.target.updateMatrixWorld();
    };
    const settle = async () => {
        for (let frame = 0; frame < 180; frame++) {
            shadows.update(.1, sky, focus); shadows.render(world, focus, null, scene, 64, terrain);
            await yieldBrowser();
            if (shadows.valid && shadows.cascades?.every(c => c.valid && !c.build && !c.needed &&
                c.terrainRevision === terrain.shadowRevision && c.direction.dot(sky.sunLightDirection) > .999999)) return frame + 1;
        }
        throw new Error('Kaskady fixture nie ukończyły aktualnej rewizji w 180 krokach');
    };
    const read = (name, z = 0, x = 0) => {
        for (const [key, mesh] of receivers) { mesh.visible = key === name; mesh.position.set(x, 64, z); }
        camera.position.set(x, 80, z); camera.lookAt(x, 64, z);
        // Fixture nie zawiera gracza rzucającego własny cień.
        shadowUniforms.uSunShadowInfo.value.w = 0;
        renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
        const rgba = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, rgba);
        check(renderer.getContext().getError() === renderer.getContext().NO_ERROR, `${name}: błąd WebGL map cieni`);
        const program = renderer.properties.get(receivers.get(name).material).currentProgram;
        check(program && program.diagnostics?.runnable !== false, `${name}: nie skompilowano materiału odbiorcy`);
        return rgba[0];
    };
    // Uruchamiane wyłącznie po niepowodzeniu: zapisuje liczby z GPU,
    // aby odróżnić błąd położenia próbki od tolerancji głębi.
    const debugSelfShadow = (name, z, x) => {
        const gl = renderer.getContext(), subpixelBits = gl.getParameter(gl.SUBPIXEL_BITS);
        const farValid = shadowUniforms.uFarShadowInfo.value.z;
        const distantValid = shadowUniforms.uDistantShadowInfo.value.z;
        const isolated = {};
        try {
            shadowUniforms.uDistantShadowInfo.value.z = 0;
            isolated.middle = read(name, z, x);
            shadowUniforms.uFarShadowInfo.value.z = 0;
            shadowUniforms.uDistantShadowInfo.value.z = distantValid;
            isolated.outer = read(name, z, x);
        } finally {
            shadowUniforms.uFarShadowInfo.value.z = farValid;
            shadowUniforms.uDistantShadowInfo.value.z = distantValid;
        }
        if (!renderer.extensions.has('EXT_color_buffer_float')) return { isolated, subpixelBits, floatTarget: false };
        const probeTarget = new THREE.WebGLRenderTarget(16, 16, { type: THREE.FloatType });
        const probeMaterial = new THREE.ShaderMaterial({
            uniforms: { depthMap: { value: null }, worldToMap: { value: null }, info: { value: null }, mode: { value: 0 } },
            vertexShader: `varying vec3 worldPosition; varying vec3 worldNormal;
                void main() {
                    worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                    worldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `precision highp float;
                uniform highp sampler2D depthMap; uniform mat4 worldToMap; uniform vec4 info; uniform int mode;
                varying vec3 worldPosition; varying vec3 worldNormal;
                void main() {
                    vec3 p = worldPosition;
                    vec3 n = normalize(worldNormal);
                    vec3 s = (worldToMap * vec4(p, 1.0)).xyz;
                    vec3 rx = vec3(worldToMap[0][0], worldToMap[1][0], worldToMap[2][0]);
                    vec3 ry = vec3(worldToMap[0][1], worldToMap[1][1], worldToMap[2][1]);
                    vec3 rz = vec3(worldToMap[0][2], worldToMap[1][2], worldToMap[2][2]);
                    float texel = info.y * length(rx);
                    vec2 uv = (floor(s.xy / texel) + 0.5) * texel;
                    vec2 delta = uv - s.xy;
                    vec2 depthGradient = -vec2(dot(n, rx) / dot(rx, rx),
                        dot(n, ry) / dot(ry, ry)) * dot(rz, rz) / dot(n, rz);
                    float planeDepth = s.z + dot(depthGradient, delta);
                    float stored = texture2D(depthMap, uv).r;
                    float rasterBias = texel * (abs(depthGradient.x) + abs(depthGradient.y)) / 128.0;
                    float transformBias = max(info.y * 0.1 * info.x, 0.0000002);
                    float bias = max(transformBias, rasterBias);
                    if (mode == 0) gl_FragColor = vec4(p, s.z);
                    else if (mode == 1) gl_FragColor = vec4(uv, planeDepth, stored);
                    else if (mode == 2) gl_FragColor = vec4((planeDepth - stored) / info.x, bias / info.x,
                        planeDepth - stored, step(planeDepth - bias, stored));
                    else gl_FragColor = vec4(rasterBias / info.x, transformBias / info.x, texel, dot(n, rz));
                }`,
            toneMapped: false
        });
        const probeScene = new THREE.Scene(), probeMesh = new THREE.Mesh(geometry, probeMaterial);
        probeMesh.position.set(x, 64, z); probeMesh.frustumCulled = false; probeScene.add(probeMesh);
        const maps = {};
        try {
            for (const [label, prefix] of [['middle', 'uFarShadow'], ['outer', 'uDistantShadow']]) {
                probeMaterial.uniforms.depthMap.value = shadowUniforms[prefix + 'Map'].value;
                probeMaterial.uniforms.worldToMap.value = shadowUniforms[prefix + 'Matrix'].value;
                probeMaterial.uniforms.info.value = shadowUniforms[prefix + 'Info'].value;
                const values = [];
                for (let mode = 0; mode < 4; mode++) {
                    probeMaterial.uniforms.mode.value = mode;
                    renderer.setRenderTarget(probeTarget); renderer.clear(); renderer.render(probeScene, camera);
                    const rgba = new Float32Array(4);
                    renderer.readRenderTargetPixels(probeTarget, 8, 8, 1, 1, rgba);
                    values.push([...rgba]);
                }
                maps[label] = { worldPositionAndDepth: values[0], uvPlaneStored: values[1], residualBiasWorldDepthLit: values[2],
                    rasterTransformBiasWorldUvPlaneZ: values[3],
                    info: shadowUniforms[prefix + 'Info'].value.toArray() };
            }
            return { isolated, maps, subpixelBits, glError: gl.getError() };
        } finally {
            probeTarget.dispose(); probeMaterial.dispose(); renderer.setRenderTarget(target);
        }
    };
    // Osobny renderer, jak w oknie ekwipunku. Globalne mapy świata nadal
    // działają; podgląd nie może wiązać ich w innym kontekście WebGL.
    const checkPreview = () => {
        check(shadowUniforms.uSunShadowMap.value && shadowUniforms.uFarShadowInfo.value.z === 1 &&
            shadowUniforms.uDistantShadowInfo.value.z === 1, 'Próba podglądu wymaga trzech aktywnych map świata');
        const canvas = document.createElement('canvas'), context = canvas.getContext('webgl2');
        check(context, 'Nie można utworzyć kontekstu WebGL2 podglądu');
        const preview = new THREE.WebGLRenderer({ canvas, context, antialias: false });
        setModelPreviewRenderer(preview);
        const previewTarget = new THREE.WebGLRenderTarget(16, 16);
        previewTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const previewGeometry = geometry.clone(), previewMaterial = createModelMaterial({ map: white });
        previewMaterial.color.setRGB(.25, .25, .25); previewMaterial.fog = false; previewMaterial.toneMapped = false;
        const previewScene = new THREE.Scene(), mesh = new THREE.Mesh(previewGeometry, previewMaterial);
        mesh.position.set(0, 64, 0); previewScene.add(mesh);
        const light = new THREE.DirectionalLight(0xffffff, sun.intensity);
        light.position.copy(sun.position); light.target.position.copy(sun.target.position); previewScene.add(light, light.target);
        try {
            camera.position.set(0, 80, 0); camera.lookAt(0, 64, 0);
            preview.toneMapping = THREE.NoToneMapping; preview.outputColorSpace = THREE.LinearSRGBColorSpace;
            preview.setRenderTarget(previewTarget); preview.setClearColor(0, 1); preview.render(previewScene, camera);
            const rgba = new Uint8Array(4); preview.readRenderTargetPixels(previewTarget, 8, 8, 1, 1, rgba);
            check(context.getError() === context.NO_ERROR, 'Podgląd ekwipunku: błąd WebGL');
            const program = preview.properties.get(previewMaterial).currentProgram;
            check(program && program.diagnostics?.runnable !== false, 'Podgląd ekwipunku: shader nie skompilował się');
            const samplers = program.getUniforms().seq.map(uniform => uniform.id).filter(name => /ShadowMap$/.test(name));
            check(samplers.length === 0, `Podgląd ekwipunku próbuje użyć map świata: ${samplers.join(', ')}`);
            return { pixel: rgba[0], shadowSamplers: samplers, textures: preview.info.memory.textures };
        } finally {
            previewTarget.dispose(); previewGeometry.dispose(); previewMaterial.dispose(); preview.dispose(); preview.forceContextLoss();
        }
    };
    // Tylko near: dach wypełnia prawdziwą mapę głębi. W połowie pasa
    // wygaszania cień musi mieć połowę siły. Ponowne mnożenie wagi
    // dałoby tu 75% światła zamiast 50%, choć pełny cień nadal byłby czarny.
    const checkNearOnlyFalloff = async () => {
        const roof = new THREE.Mesh(groundGeometry, SHADOW_CASTER_MATERIALS[0]);
        roof.position.y = 65; roof.frustumCulled = false;
        roof.userData.chunk = { cx: 0, cz: 0, maxY: 66 }; roof.updateMatrixWorld();
        world.shadowScene.add(roof);
        orient(90); sun.intensity = Math.PI * 2;
        // Mały wycinek sprawia, że próbka jest praktycznie w środku
        // odbiorcy. Kwantyzacja do piksela bloku mieści się w 3/255.
        camera.left = camera.bottom = -.016; camera.right = camera.top = .016;
        camera.updateProjectionMatrix();
        const results = []; let clear;
        try {
            for (const quality of [0, 1, 2]) {
                shadows.setQuality(quality);
                setShadowDefine([nearMaterial], quality > 0, false);
                shadows.update(.1, sky, focus); shadows.render(world, focus, null, scene, 64, terrain);
                check(shadowUniforms.uFarShadowInfo.value.z === 0 && shadowUniforms.uDistantShadowInfo.value.z === 0 &&
                    shadowUniforms.uFarShadowMap.value === null && shadowUniforms.uDistantShadowMap.value === null,
                    `Jakość ${quality}: pozostała aktywna mapa daleka`);
                if (quality === 0) {
                    clear = read('near');
                    check(clear > 64 && clear < 192, `Near-only: nasycona lub ciemna kontrola (${clear})`);
                    results.push({ quality, clear });
                } else {
                    const values = [];
                    // Near wygasa od 85% do 100% promienia; 92.5% to
                    // połowa symetrycznego wygaszania, bez CPU kopii GLSL.
                    for (const [edge, fraction] of [[0, 0], [.925, .5], [1.02, 1]]) {
                        const value = read('near', 0, shadows.radius * edge), expected = clear * fraction;
                        check(Math.abs(value - expected) <= 3,
                            `Near-only q${quality}, edge=${edge}: ${value}/${expected}; ` +
                            'połowa wygaszania ma dawać 50% światła, nie 75%');
                        values.push({ edge, value, expected });
                    }
                    results.push({ quality, radius: shadows.radius, clear, values });
                }
                await yieldBrowser();
            }
            return { status: 'passed', values: results };
        } finally { roof.removeFromParent(); }
    };
    const samples = [], transitions = [], selfShadow = [], disabled = []; let inventoryPreview;
    try {
        renderer.autoClear = false; renderer.setClearColor(0, 1); renderer.setScissorTest(false);
        renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        skyUniforms.uAtmosphericLight.value = 1; skyUniforms.uNightDesaturation.value = 0;
        skyUniforms.uFogBrightness.value = 1; viewUniforms.uBrightness.value = 0;
        viewUniforms.uFarEnabled.value = 0; viewUniforms.uFarOuter.value = 4096; viewUniforms.uHazeMax.value = 0;
        viewUniforms.uCurvature.value = 0; viewUniforms.uGlobe.value = 0; viewUniforms.uUnderwater.value = 0;
        chunkMaskUniforms.uChunkMaskOrigin.value.set(1e6, 1e6);
        dynamicLightUniforms.uDynamicEnabled.value = 0; meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);
        bounceUniforms.uBounceColor.value.setRGB(0, 0, 0);
        modelLight.uModelSky.value = 1; modelLight.uModelAmbient.value = 1; modelLight.uModelSun.value = 1;
        modelLight.uModelShadows.value = 1; modelLight.uModelDistantShadows.value = 1;
        modelLight.uModelBlock.value.set(0, 0, 0); modelLight.uModelBounce.value.set(0, 0, 0);
        shadows.setQuality(3);
        for (const degrees of [.5, 2, 5]) {
            orient(degrees); wallPresent = true; groundPresent = false; terrain.shadowRevision++;
            const frames = await settle();
            const blocked = Object.fromEntries([...receivers.keys()].map(name => [name, read(name)]));
            if (degrees === 2) {
                inventoryPreview = checkPreview();
                modelLight.uModelDistantShadows.value = 0;
                disabled.push({ name: 'model', mode: 'runtime distant off', pixel: read('model') });
                modelLight.uModelDistantShadows.value = 1;
                for (const quality of [0, 1]) {
                    setShadowDefine([nearMaterial], quality > 0, false);
                    disabled.push({ name: 'near', mode: `quality ${quality}`, pixel: read('near') });
                }
                setShadowDefine([nearMaterial], true, true);
                for (const z of [0, 53, 55, 60, 64, 68, 220, 232, 248, 256, 264, 480, 512, 544, 800]) {
                    const values = Object.fromEntries([...receivers.keys()].map(name => [name, read(name, z)]));
                    for (const [name, value] of Object.entries(values)) check(value <= 3, `${name}: przerwa cienia w strefie z=${z}: ${value}`);
                    transitions.push({ z, values });
                }
            }
            wallPresent = false; terrain.shadowRevision++;
            await settle();
            const clear = Object.fromEntries([...receivers.keys()].map(name => [name, read(name)]));
            if (degrees === 2) check(Math.abs(inventoryPreview.pixel - clear.model) <= 2,
                `Podgląd postaci odziedziczył cień dalekiej góry (${inventoryPreview.pixel}/${clear.model})`);
            if (degrees === 2) for (const sample of disabled) check(Math.abs(sample.pixel - clear[sample.name]) <= 2,
                `${sample.name}: ${sample.mode} pozostawiło daleki cień (${sample.pixel}/${clear[sample.name]})`);
            for (const name of receivers.keys()) {
                check(clear[name] > 8, `${name}: brak dodatniej próby kontrolnej przy ${degrees}°`);
                check(blocked[name] <= 3 && blocked[name] < clear[name] * .2,
                    `${name}: góra 800 bloków dalej nie zatrzymała słońca ${degrees}° (${blocked[name]}/${clear[name]})`);
            }
            samples.push({ degrees, frames, blocked, clear, revision: terrain.shadowRevision });
            groundPresent = true; terrain.shadowRevision++;
            await settle();
            // Te same powierzchnie i wysokość są odbiorcą oraz casterem.
            // Próbkujemy fazy tekseli i strefy blendu: nie tylko jeden piksel.
            const values = [];
            for (const z of [0, 55, 64, 232, 256, 512, 800]) {
                for (const x of [-.75, -.25, .25, .75]) {
                    const pixels = Object.fromEntries([...receivers.keys()].map(name => [name, read(name, z, x)]));
                    for (const [name, value] of Object.entries(pixels)) {
                        if (Math.abs(value - clear[name]) > 3) {
                            const debug = debugSelfShadow(name, z, x);
                            check(false, `${name}: samocień płaskiego terenu przy ${degrees}°, x=${x}, z=${z}: ` +
                                `${value}/${clear[name]}; debug=${JSON.stringify(debug)}`);
                        }
                    }
                    values.push({ x, z, pixels });
                }
            }
            selfShadow.push({ degrees, clear, values });
        }
        const stats = shadows.stats(), nearOnly = await checkNearOnlyFalloff();
        return { status: 'passed', casterDistance: 800, receiverHeight: 64, samples, transitions, selfShadow, inventoryPreview, disabled, nearOnly,
            rasterSubpixelBits: renderer.getContext().getParameter(renderer.getContext().SUBPIXEL_BITS),
            stats, note: 'W próbie ściany 800 mapa near jest pusta. Osobna próba near-only zawiera dach i mierzy pojedyncze wygaszanie.' };
    } finally {
        shadows.dispose();
        for (const [u, value] of savedUniforms) {
            if (value?.clone && !value.isTexture && u.value?.copy) u.value.copy(value); else u.value = value;
        }
        renderer.setRenderTarget(saved.target); renderer.autoClear = saved.autoClear;
        renderer.toneMapping = saved.toneMapping; renderer.outputColorSpace = saved.outputColorSpace;
        renderer.setClearColor(saved.clearColor, saved.clearAlpha); renderer.setViewport(saved.viewport);
        renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
        for (const resource of resources) resource.dispose();
        check(retained === 0, 'Kontroler nie zwolnił snapshotów casterów');
    }
}
