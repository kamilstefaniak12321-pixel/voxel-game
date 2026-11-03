import * as THREE from 'three';
import { waterMaterial } from './BlockRenderData.js';

// Tylko ustawienia zmieniające kod wody. Ruch, czas i inne uniformy
// nie powinny ponawiać przygotowania shaderów.
export function waterShaderVariantKey(renderTarget = null) {
    // Three r160 compiles a different output conversion for a linear target
    // and the screen. Target size/format and live uniforms do not change it.
    return JSON.stringify([renderTarget ? 'linear-target' : 'screen',
        Object.entries(waterMaterial.defines ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
}

// Woda może pojawić się dopiero w nowym chunku podczas lotu. Three rysuje
// przezroczysty DoubleSide dwoma programami (BackSide i FrontSide), więc
// przygotowujemy obydwa przed pierwszym spotkaniem z wodą.
export function prewarmWaterMaterial(renderer, worldScene, camera, asynchronous = false, renderTarget = undefined) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
    // Tak jak chunki: RGBA, nie RGB. Zmienia to wariant vertexAlphas.
    geometry.setAttribute('color', new THREE.Uint8BufferAttribute([], 4, true));
    const preparation = new THREE.Scene();
    preparation.add(new THREE.Mesh(geometry, waterMaterial));

    // W dostarczonym Three compileAsync czeka tylko na currentProgram,
    // czyli ostatnią stronę wody. Pobieramy oba programy z cache materiału.
    // getUniforms kończy też odłożoną inicjalizację lokalizacji atrybutów;
    // bez KHR_parallel_shader_compile oczekiwanie następuje tutaj,
    // podczas wczytywania świata lub zmiany ustawień, nie pierwszego lotu.
    const programs = () => [...renderer.properties.get(waterMaterial).programs.values()];
    const initialize = entries => {
        for (const program of entries) program.getUniforms();
    };

    // compileAsync starts its compilation synchronously in the bundled Three.
    // Bind only for that call, never for the lifetime of its Promise: menu
    // transitions/settings may prepare another variant while rendering.
    const compile = asyncCompile => {
        if (renderTarget === undefined) return asyncCompile
            ? renderer.compileAsync(preparation, camera, worldScene)
            : renderer.compile(preparation, camera, worldScene);
        const previous = renderer.getRenderTarget();
        const face = renderer.getActiveCubeFace?.() ?? 0;
        const level = renderer.getActiveMipmapLevel?.() ?? 0;
        const viewport = renderer.getViewport(new THREE.Vector4());
        const scissor = renderer.getScissor(new THREE.Vector4());
        const scissorTest = renderer.getScissorTest();
        try {
            renderer.setRenderTarget(renderTarget);
            return asyncCompile ? renderer.compileAsync(preparation, camera, worldScene)
                : renderer.compile(preparation, camera, worldScene);
        } finally {
            renderer.setRenderTarget(previous, face, level);
            renderer.setViewport(viewport);
            renderer.setScissor(scissor);
            renderer.setScissorTest(scissorTest);
        }
    };

    try {
        if (asynchronous && typeof renderer.compileAsync === 'function') {
            const ready = compile(true);
            const entries = programs();
            return ready.then(async () => {
                while (entries.some(program => !program.isReady())) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                initialize(entries);
            }).finally(() => geometry.dispose());
        }

        compile(false);
        initialize(programs());
        geometry.dispose();
    } catch (error) {
        geometry.dispose();
        throw error;
    }
}
