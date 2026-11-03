import * as THREE from 'three';
import { World } from '../world/World.js';
import { FarTerrain, setFarTerrainShadows } from '../world/FarTerrain.js';
import { Sky } from '../sky/Sky.js';
import { usesSolarAtmosphere } from '../sky/SolarAtmosphere.js';
import { skyUniforms } from '../sky/skyShader.js';
import { viewUniforms } from '../rendering/viewUniforms.js';
import { SunShadows, shadowUniforms } from '../rendering/Shadows.js';
import { LightShafts } from '../rendering/LightShafts.js';
import { WorldOutput } from '../rendering/WorldOutput.js';
import { lightingUniforms, resetLightingDiagnostics } from '../rendering/LightingDiagnostics.js';
import { lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from '../rendering/LightPolicy.js';
import { setAmbientOcclusion, setFastLeaves } from '../rendering/ChunkMesher.js';
import { blockMaterial, plantMaterial, waterMaterial, leafMaterial,
    setPotatoDefine, setLeafMaterialFast, setShadowDefine } from '../rendering/BlockRenderData.js';
import { prewarmWaterMaterial, waterShaderVariantKey } from '../rendering/WaterMaterialWarmup.js';
import { dynamicLightUniforms } from '../world/DynamicLight.js';
import { BounceLight } from '../world/BounceLight.js';
import { applyMaterialLightingSettings, createBounceLightingState, updateBounceLightingState } from '../rendering/MaterialLighting.js';
import { campfireLightUniforms } from '../rendering/CampfireLight.js';
import { CHUNK_SIZE, POTATO_VIEW_DISTANCE, SHAFT_BRIGHTNESS,
    SHAFT_DENSITY_OUTSIDE, SHAFT_DENSITY_INSIDE, SHAFT_FAR_REACH } from '../config.js';

const materials = [blockMaterial, plantMaterial, waterMaterial, leafMaterial];
const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

// Prawdziwy generator i renderer gry, bez gracza, ekwipunku, zapisu
// ani symulacji interakcji. Ta scena i Game nie mogą działać naraz:
// shadery terenu korzystają ze wspólnych uniformów.
export class MenuWorld {
    constructor(renderer, settings, spec, camera) {
        this.renderer = renderer;
        this.settings = settings;
        this.spec = spec;
        this.camera = camera;
        this.fogBrightness = 1;
        this.warmed = false;
        this.disposed = false;
        this.error = null;
        this.firstReady = false;
        this.warmEpoch = 0;
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();
        const positions = Object.values(spec.views ?? { home: { position: camera.position.toArray() } })
            .map(view => view.position);
        const x = (Math.min(...positions.map(p => p[0])) + Math.max(...positions.map(p => p[0]))) / 2;
        const z = (Math.min(...positions.map(p => p[2])) + Math.max(...positions.map(p => p[2]))) / 2;
        this.focus = new THREE.Vector3(x, 0, z);
        this.cameraReach = Math.max(...positions.map(p => Math.hypot(p[0] - x, p[2] - z))) + 2;
        try {
            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.Fog(0x87ceeb, 20, 80);
            this.world = new World(this.scene, spec.seed, new Map(), spec.terrain ?? 'realistic',
                { bushyGrass: settings.get('bushyGrass') });
            this.sky = new Sky(this.scene);
            this.farTerrain = new FarTerrain(this.world);
            this.sky.attachLights(this.farTerrain.scene);
            this.shadows = new SunShadows(renderer);
            this.bounce = new BounceLight();
            this.bounceLighting = createBounceLightingState();
            this.lightShafts = new LightShafts(renderer);
            this.worldOutput = new WorldOutput(renderer);
            resetLightingDiagnostics();
            this.shaftColor = new THREE.Color();
            this.world.onMeshChanged = chunk => {
                this.shadows.markChunk(chunk);
                this.bounce.markChunk(chunk);
                if (chunk.mesh) {
                    chunk.mesh.geometry.computeBoundingBox();
                    chunk.menuBounds = chunk.mesh.geometry.boundingBox.clone().expandByScalar(3);
                    chunk.menuBounds.translate(chunk.mesh.position);
                }
            };
            this.applySettings();
            this.sky.update(spec.time ?? 0.34, 0, renderer.getPixelRatio());
            this.warmWater();
        } catch (error) {
            // Backdrop nie dostanie referencji, jeśli konstruktor rzuci.
            // Zwalniamy więc również niepełną scenę, w tym wątki horyzontu.
            this.dispose();
            throw error;
        }
    }

    get viewDistance() {
        const value = this.settings.get('viewDistance');
        return this.settings.get('potato') ? Math.min(value, POTATO_VIEW_DISTANCE) : value;
    }

    get ready() { return this.firstReady && !this.disposed; }

    warmWater() {
        if (this.disposed) return;
        const natural = this.sky.lightingLook === 'natural';
        const variant = waterShaderVariantKey(natural);
        if (variant === this.waterVariant) return;
        this.waterVariant = variant;
        this.warmed = false;
        this.firstReady = false;
        this.error = null;
        const epoch = ++this.warmEpoch;
        const current = () => !this.disposed && epoch === this.warmEpoch;
        try {
            const target = natural ? this.worldOutput.prepareTarget() : null;
            this.warmup = Promise.resolve(prewarmWaterMaterial(this.renderer, this.scene, this.camera, true, target))
                .then(() => { if (current()) this.warmed = true; })
                .catch(error => { if (current()) this.error = error; });
        } catch (error) {
            // compileAsync może też rzucić przed zwróceniem Promise.
            // Identyczna ścieżka awaryjna przy starcie i zmianie ustawień.
            if (current()) this.error = error;
            this.warmup = Promise.resolve();
        }
    }

    applySettings() {
        if (this.disposed) return;
        const settings = this.settings;
        this.sky.lightingLook = settings.get('lightingLook');
        this.sky.cloudCover = settings.get('cloudCover') / 100;
        lightingUniforms.uLightingNatural.value = this.sky.lightingLook === 'natural' ? 1 : 0;
        applyMaterialLightingSettings(settings);
        this.shadows.setNaturalLighting(this.sky.lightingLook === 'natural');
        const potato = settings.get('potato');
        const distance = this.viewDistance;
        this.camera.far = distance + 3 * CHUNK_SIZE + 64;
        this.camera.updateProjectionMatrix();
        this.scene.fog.near = distance * 0.45;
        this.scene.fog.far = distance;
        this.sky.solarAtmosphere = usesSolarAtmosphere(settings.get('lightingModel'), this.world.generator.type);
        this.sky.setLowDetail(potato);
        this.farTerrain.setDetail(settings.get('farDetail'), potato, true);
        this.world.setExperiments({ bushyGrass: settings.get('bushyGrass') });
        setPotatoDefine(materials, potato);
        this.shadows.setQuality(potato ? 0 : settings.get('shadows'));
        setShadowDefine(materials, this.shadows.enabled, this.shadows.hasFar);
        setFarTerrainShadows(this.shadows.hasFar);
        this.shaftsEnabled = !potato && settings.get('lightShafts');
        const ao = settings.get('ambientOcclusion') / 100;
        const fastLeaves = potato || !settings.get('fancyLeaves');
        if (ao !== this.ao || fastLeaves !== this.fastLeaves) {
            setAmbientOcclusion(ao);
            setFastLeaves(fastLeaves);
            setLeafMaterialFast(fastLeaves);
            this.world.remeshAll();
            this.ao = ao;
            this.fastLeaves = fastLeaves;
        }
        viewUniforms.uBrightness.value = settings.get('brightness') / 100;
        viewUniforms.uUnderwater.value = 0;
        viewUniforms.uCurvature.value = 0;
        viewUniforms.uGlobe.value = 0;
        viewUniforms.uFarTextureBlend.value = 0;
        dynamicLightUniforms.uDynamicEnabled.value = 0;
        campfireLightUniforms.uFirePowers.value.fill(0);
        if (this.waterVariant !== undefined) this.warmWater();
    }

    update(dt) {
        if (this.disposed || this.error) return;
        const elapsed = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0;
        // Jeden obszar pokrywa wszystkie kamery i ich przejazdy. Najpierw
        // dane całego otoczenia, potem meshe: sąsiedzi nie przebudowują
        // wielokrotnie tych samych siatek podczas pierwszego ładowania.
        const radius = Math.ceil((this.viewDistance + this.cameraReach) / CHUNK_SIZE) + 2;
        if (radius !== this.world.loadRadius) this.firstReady = false;
        this.world.setCenter(this.focus.x, this.focus.z, radius);
        const deadline = performance.now() + Math.max(1, this.settings.get('loadBudget'));
        while (this.world.loadQueue.length && performance.now() < deadline) {
            const [cx, cz] = this.world.loadQueue.pop();
            this.world.generateChunk(cx, cz);
        }
        if (!this.world.loadQueue.length) this.world.updateMeshes(deadline);
        const inner = this.viewDistance;
        const outer = this.settings.get('farTerrain');
        this.farTerrain.setRange(inner, outer);
        viewUniforms.uFarEnabled.value = this.farTerrain.active ? 1 : 0;
        viewUniforms.uFarInner.value = inner;
        viewUniforms.uFarOuter.value = Math.max(outer, inner);
        viewUniforms.uTime.value = (viewUniforms.uTime.value + elapsed) % 3600;
        this.focus.y = this.camera.position.y;
        this.farTerrain.update(this.focus);
        this.sky.horizonDip = this.farTerrain.active
            ? Math.min(0, (this.world.generator.baseHeight + 1 - this.camera.position.y) / this.farTerrain.outer) : 0;
        // Stała wybrana pora zachowuje kompozycję; animacje nieba,
        // roślin i nurtu biegną normalnie. Kolejne scenerie mogą zmienić spec.
        this.sky.update(this.spec.time ?? 0.34, elapsed, this.renderer.getPixelRatio());
        const p = this.camera.position;
        const light = this.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        const target = this.sky.atmosphere ? atmosphericLightToBrightness(light.sky) : lightToBrightness(light.sky);
        this.fogBrightness += (target - this.fogBrightness) * Math.min(1, elapsed * 3);
        skyUniforms.uFogBrightness.value = this.fogBrightness ** 2.2;
        this.scene.fog.color.copy(this.sky.state.horizon).multiplyScalar(skyUniforms.uFogBrightness.value);
        this.shadows.update(elapsed, this.sky, p);
        this.sky.applyShadowContrast(this.shadows.active ? this.shadows.strength : 0);
        this.bounce.update(this.world, p, updateBounceLightingState(this.bounceLighting,
            this.settings, this.sky, this.renderer.capabilities.isWebGL2));
        if (!this.firstReady) {
            const far = this.farTerrain.stats();
            this.firstReady = this.warmed && this.world.chunks.size > 0
                && this.world.loadQueue.length === 0 && this.world.dirtyChunks.size === 0
                && (!this.farTerrain.active || (far.wanted > 0 && far.missing === 0));
        }
    }

    render() {
        if (this.disposed || this.error || !this.ready) return;
        const renderer = this.renderer, camera = this.camera;
        this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.frustumMatrix);
        for (const chunk of this.world.chunks.values()) {
            if (chunk.mesh && chunk.menuBounds) chunk.mesh.visible = this.frustum.intersectsBox(chunk.menuBounds);
        }
        const previousAutoClear = renderer.autoClear;
        const previousTarget = renderer.getRenderTarget();
        renderer.autoClear = false;
        try {
            renderer.info.reset();
            this.shadows.render(this.world, camera.position, null, this.scene, this.viewDistance, this.farTerrain);
            this.bounce.bind();
            // Wspólna bliska mapa może mieć cień gracza, lecz menu nie
            // ma modelu ani jego mapy. Nie próbuj próbkować pustej tekstury.
            shadowUniforms.uSunShadowInfo.value.w = 0;
            const naturalOutput = this.sky.lightingLook === 'natural';
            const grayscaleOutput = lightingUniforms.uLightingDebug.value === 12;
            if (!this.worldOutput.begin(naturalOutput || grayscaleOutput,
                { bypassTone: !naturalOutput && grayscaleOutput })) renderer.clear();
            this.sky.render(renderer, camera);
            renderer.clearDepth();
            this.farTerrain.render(renderer, camera);
            renderer.clearDepth();
            renderer.render(this.scene, camera);
            this.renderLightShafts();
        } finally {
            try { this.worldOutput.end(); }
            finally {
                renderer.autoClear = previousAutoClear;
                // Także błąd końcowej prezentacji HDR musi przywrócić stan
                // renderera przed zwolnieniem menu i uruchomieniem gry.
                renderer.setRenderTarget(previousTarget);
            }
        }
    }

    renderLightShafts() {
        const shadows = this.shadows;
        const debugView = lightingUniforms.uLightingDebug.value;
        if (debugView > 0 && debugView !== 12) return;
        if (!this.shaftsEnabled || !shadows.active) return;
        const state = this.sky.state;
        const sun = shadows.light === 'sun';
        const intensity = sun ? state.sunLightIntensity : state.moonLightIntensity * 1.6;
        const lowSun = 1 + 0.9 * (1 - smoothstep(0.06, 0.4, shadows.direction.y));
        const amount = intensity * shadows.strength * lowSun * SHAFT_BRIGHTNESS
            * lightingUniforms.uLightingComponents.value.getComponent(sun ? 0 : 1);
        if (amount < 0.003) return;
        this.shaftColor.copy(sun ? state.sunLightColor : state.moonLightColor).multiplyScalar(amount);
        const inside = smoothstep(0.3, 0.8, 1 - this.fogBrightness);
        const density = SHAFT_DENSITY_OUTSIDE + (SHAFT_DENSITY_INSIDE - SHAFT_DENSITY_OUTSIDE) * inside;
        const isotropic = 0.12 + 0.5 * inside;
        this.lightShafts.render(this.camera, this.world, shadows, this.shaftColor,
            density, isotropic, shadows.farValid ? SHAFT_FAR_REACH : shadows.radius);
    }

    resize(width = window.innerWidth, height = window.innerHeight) {
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
    }

    stats() {
        return { ready: this.ready, warmed: this.warmed, chunks: this.world.chunks.size,
            loadQueue: this.world.loadQueue.length, completeRadius: this.world.completeRadius(),
            meshes: this.world.shadowScene.children.length, far: this.farTerrain.stats(),
            bounce: this.bounce.stats(),
            error: this.error ? String(this.error) : null };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        viewUniforms.uFarTextureBlend.value = 1;
        ++this.warmEpoch;
        if (this.world) this.world.onMeshChanged = null;
        this.shadows?.dispose();
        this.bounce?.dispose();
        this.lightShafts?.dispose();
        this.worldOutput?.dispose();
        this.farTerrain?.dispose();
        this.world?.dispose();
        this.sky?.dispose();
        this.scene?.clear();
    }
}
