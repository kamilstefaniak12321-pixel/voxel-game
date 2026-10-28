import * as THREE from 'three';
import { waterMaterial } from './BlockRenderData.js';

// Tylko ustawienia zmieniające kod wody. Ruch, czas i inne uniformy
// nie powinny ponawiać przygotowania shaderów.
export function waterShaderVariantKey() {
    return JSON.stringify(Object.entries(waterMaterial.defines ?? {})
        .sort(([a], [b]) => a.localeCompare(b)));
}

// Woda może pojawić się dopiero w nowym chunku podczas lotu. Three rysuje
// przezroczysty DoubleSide dwoma programami (BackSide i FrontSide), więc
// przygotowujemy obydwa przed pierwszym spotkaniem z wodą.
export function prewarmWaterMaterial(renderer, worldScene, camera, asynchronous = false) {
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

    try {
        if (asynchronous && typeof renderer.compileAsync === 'function') {
            const ready = renderer.compileAsync(preparation, camera, worldScene);
            const entries = programs();
            return ready.then(async () => {
                while (entries.some(program => !program.isReady())) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                initialize(entries);
            }).finally(() => geometry.dispose());
        }

        renderer.compile(preparation, camera, worldScene);
        initialize(programs());
        geometry.dispose();
    } catch (error) {
        geometry.dispose();
        throw error;
    }
}
