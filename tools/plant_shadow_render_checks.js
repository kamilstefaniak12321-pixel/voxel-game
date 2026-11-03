// Real colour/depth shaders, one cutout sheet and three motion modes. This
// catches a mismatch in deformation or alpha threshold without a full world.
import * as THREE from 'three';
import { plantMaterial } from '../src/rendering/BlockRenderData.js';
import { plantDepthMaterial } from '../src/rendering/Shadows.js';
import { plantWindUniforms } from '../src/rendering/PlantWind.js';

export async function checkPlantShadowRendering({ renderer, yieldBrowser = async () => {} }) {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const saved = { target: renderer.getRenderTarget(), autoClear: renderer.autoClear,
        clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
        viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
        scissorTest: renderer.getScissorTest(), time: plantWindUniforms.uTime.value,
        wave: plantWindUniforms.uWaveHeight.value, depthTime: plantDepthMaterial.uniforms.uTime.value,
        depthWave: plantDepthMaterial.uniforms.uWaveHeight.value,
        depthMap: plantDepthMaterial.uniforms.map.value };
    const resources = [], own = value => { resources.push(value); return value; };
    const size = 256;
    const output = own(new THREE.WebGLRenderTarget(size, size));
    output.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const depth = own(new THREE.WebGLRenderTarget(size, size, { depthBuffer: true }));
    depth.depthTexture = own(new THREE.DepthTexture(size, size, THREE.UnsignedIntType));
    depth.depthTexture.minFilter = depth.depthTexture.magFilter = THREE.NearestFilter;
    const texels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const offset = (y * 16 + x) * 4;
        texels.set([255, 255, 255, x >= 5 && x <= 10 && y >= 5 && y <= 10 ? 0 : 255], offset);
    }
    const texture = own(new THREE.DataTexture(texels, 16, 16));
    texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.needsUpdate = true;
    const geometry = own(new THREE.PlaneGeometry(.5, 1)); geometry.translate(0, .5, 0);
    const attribute = (name, values) => {
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, values.length / 4));
    };
    attribute('color', Array(4).fill([0, 0, 0, 1]).flat());
    attribute('atmosphereLight', Array(4).fill([0, 0, 0, 1]).flat());
    attribute('surfaceOcclusion', [1, 1, 1, 1]);
    attribute('surfaceEmission', [0, 0, 0, 0]);
    attribute('tint', Array(4).fill([1, 1, 1, 1]).flat());
    const motion = new Float32Array(8);
    geometry.setAttribute('plantMotion', new THREE.BufferAttribute(motion, 2));
    const material = own(plantMaterial.clone());
    material.map = texture; material.fog = false; material.toneMapped = false; material.defines = {};
    material.onBeforeCompile = (shader, context) => {
        plantMaterial.onBeforeCompile(shader, context);
        // Keep the actual cutout and wind; isolate silhouette from lighting.
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
            'outgoingLight = vec3(1.0);\n#include <opaque_fragment>');
    };
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 64; mesh.frustumCulled = false; scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-.8, .8, 1.3, -.3, .1, 10);
    camera.position.set(0, 64, 4); camera.lookAt(0, 64, 0);
    const quad = own(new THREE.PlaneGeometry(2, 2));
    const probeMaterial = own(new THREE.ShaderMaterial({
        uniforms: { depthMap: { value: depth.depthTexture } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
        fragmentShader: `uniform highp sampler2D depthMap; varying vec2 vUv;
            void main(){float occupied=1.0-step(0.99999,texture2D(depthMap,vUv).r);gl_FragColor=vec4(vec3(occupied),1.0);}`,
        toneMapped: false, depthTest: false, depthWrite: false
    }));
    const probe = new THREE.Scene(), probeMesh = new THREE.Mesh(quad, probeMaterial);
    // Its vertex shader already writes clip space; the world camera is at
    // y=64 and must not cull this screen quad at the origin.
    probeMesh.frustumCulled = false; probe.add(probeMesh);
    const read = () => {
        const pixels = new Uint8Array(size * size * 4);
        renderer.readRenderTargetPixels(output, 0, 0, size, size, pixels);
        return pixels;
    };
    const measure = pixels => {
        let count = 0, sumX = 0, minY = size;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (pixels[(y * size + x) * 4] < 128) continue;
            count++; sumX += x; minY = Math.min(minY, y);
        }
        let rootCount = 0, rootSum = 0;
        for (let y = minY; y < Math.min(size, minY + 3); y++) for (let x = 0; x < size; x++) {
            if (pixels[(y * size + x) * 4] < 128) continue;
            rootCount++; rootSum += x;
        }
        return { count, centerX: sumX / count, rootX: rootSum / rootCount };
    };
    const samples = [];
    try {
        renderer.autoClear = true; renderer.setClearColor(0, 1); renderer.setScissorTest(false);
        plantDepthMaterial.uniforms.map.value = texture;
        plantWindUniforms.uWaveHeight.value = plantDepthMaterial.uniforms.uWaveHeight.value = .045;
        for (const mode of [0, .5, 1]) {
            for (let i = 0; i < 4; i++) {
                motion[i * 2] = geometry.attributes.position.getY(i);
                motion[i * 2 + 1] = mode;
            }
            geometry.attributes.plantMotion.needsUpdate = true;
            for (const time of [0, 1.1]) {
                plantWindUniforms.uTime.value = plantDepthMaterial.uniforms.uTime.value = time;
                mesh.material = material;
                renderer.setRenderTarget(output); renderer.clear(); renderer.render(scene, camera);
                const colour = read();
                mesh.material = plantDepthMaterial;
                renderer.setRenderTarget(depth); renderer.clear(); renderer.render(scene, camera);
                renderer.setRenderTarget(output); renderer.clear(); renderer.render(probe, camera);
                const shadow = read();
                let mismatches = 0;
                for (let i = 0; i < colour.length; i += 4) if ((colour[i] >= 128) !== (shadow[i] >= 128)) mismatches++;
                const shape = measure(colour);
                check(shape.count > 5000 && shape.count < 12000, `Roślina nie ma prawidłowej wyciętej sylwetki (${shape.count})`);
                check(mismatches <= 2, `Depth/colour: rozjechana maska lub wiatr, mode=${mode}, time=${time}, pixels=${mismatches}`);
                check(renderer.getContext().getError() === renderer.getContext().NO_ERROR, 'Błąd WebGL roślinnych cieni');
                samples.push({ mode, time, mismatches, ...shape });
                await yieldBrowser();
            }
        }
        const wind = samples.filter(sample => sample.mode === 0);
        check(Math.abs(wind[0].centerX - wind[1].centerX) > 2, 'Cień rośliny nie poruszył się z wiatrem');
        check(Math.abs(wind[0].rootX - wind[1].rootX) <= 1, 'Wiatr odkleił korzeń od podłoża');
        return { status: 'passed', samples, note: 'Rzeczywisty shader rośliny i caster głębi: zgodne wycięcie, wiatr, rośliny wodne i pływające.' };
    } finally {
        plantWindUniforms.uTime.value = saved.time;
        plantWindUniforms.uWaveHeight.value = saved.wave;
        plantDepthMaterial.uniforms.uTime.value = saved.depthTime;
        plantDepthMaterial.uniforms.uWaveHeight.value = saved.depthWave;
        plantDepthMaterial.uniforms.map.value = saved.depthMap;
        renderer.setRenderTarget(saved.target); renderer.autoClear = saved.autoClear;
        renderer.setClearColor(saved.clearColor, saved.clearAlpha);
        renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
        for (const resource of resources) resource.dispose();
    }
}
