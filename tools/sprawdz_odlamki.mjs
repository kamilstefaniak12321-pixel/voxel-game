// Prawdziwe BlockDebris/CubeParticles i bufory Three; tylko bitmapa atlasu
// jest zastąpiona znanym liniowym pikselem. Kompilację GPU sprawdza test WebGL.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false });
                export const atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null;
                export const getTileColors = () => [new Color(0.5, 0.25, 0.125)];
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { BlockDebris } = await import('../src/rendering/BlockDebris.js');
const { CubeParticles } = await import('../src/rendering/CubeParticles.js');
const { lightToBrightness } = await import('../src/world/Light.js');
const { skyUniforms } = await import('../src/sky/skyShader.js');
const { composeSurfaceRadiance } = await import('../src/rendering/SurfaceLighting.js');

const scene = new THREE.Scene();
let light = { sky: 0, red: 0, green: 0, blue: 0 };
const world = { getLight: () => light, isSolid: () => false };
const debris = new BlockDebris(scene, world);
const albedo = [0.5, 0.25, 0.125];
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

const dark = debris.colorsOf('stone', 0, 0, 0);
assert.deepEqual(dark.colors[0].toArray(), albedo);
assert.equal(dark.lighting.sky, 0, 'Brak sztucznego nieba w zamkniętym pokoju');
assert.deepEqual(dark.lighting.local, [0, 0, 0]);
assert.equal(dark.lighting.emission, 0);
near(dark.lighting.classicShade, lightToBrightness(0) ** 2.2);
assert.ok(dark.lighting.classicShade > 0, 'Classic zachowuje dawne minimum');
assert.deepEqual(composeSurfaceRadiance({ albedo, natural: [0, 0, 0], local: dark.lighting.local }), [0, 0, 0]);

light = { sky: 15, red: 0, green: 0, blue: 0 };
assert.equal(debris.colorsOf('stone', 0, 0, 0).lighting.sky, 1);

// Kanały są dekodowane dokładnie raz; czerwone światło nie robi się białe.
light = { sky: 0, red: 255, green: 128, blue: 0 };
const red = debris.colorsOf('stone', 0, 0, 0);
near(red.lighting.local[0], 1);
near(red.lighting.local[1], (128 / 255) ** 2.2);
assert.equal(red.lighting.local[2], 0);
assert.equal(red.lighting.sky, 0);
const lit = composeSurfaceRadiance({ albedo, natural: [0, 0, 0], local: red.lighting.local });
assert.equal(lit[2], 0);
near(lit[0], 0.5);
near(red.lighting.classicShade, 0.75);

light = { sky: 0, red: 0, green: 0, blue: 0 };
const lamp = debris.colorsOf('lamp_red', 0, 0, 0);
assert.equal(lamp.lighting.emission, 1);
assert.deepEqual(lamp.lighting.local, [0, 0, 0], 'Własna emisja nie trafia do pola lamp');
assert.equal(lamp.lighting.sky, 0, 'Emisja nie udaje otwartego nieba');
assert.deepEqual(composeSurfaceRadiance({ albedo, natural: [0, 0, 0], emission: [1, 1, 1] }), albedo);

// Rzeczywista droga emit -> write: albedo nie jest wypalone światłem.
debris.emitOne(red.colors, red.lighting, new THREE.Vector3(), new THREE.Vector3(), 0.1);
debris.update(0);
const mesh = debris.particles.mesh;
assert.deepEqual(Array.from(mesh.instanceColor.array.slice(0, 3)), albedo);
const stored = mesh.geometry.getAttribute('particleLight');
near(stored.getX(0), red.lighting.local[0]);
near(stored.getY(0), red.lighting.local[1]);
assert.equal(stored.getZ(0), 0);
assert.equal(stored.getW(0), 0);
near(mesh.geometry.getAttribute('particleEmission').getY(0), red.lighting.classicShade);

const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
mesh.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.uAtmosphericLight, skyUniforms.uAtmosphericLight, 'A/B działa przez wspólny uniform bez ponownej emisji');
assert.match(shader.vertexShader, /vColor = mix\(vColor \* particleEmission.y, instanceColor, uAtmosphericLight\)/);
assert.match(shader.fragmentShader, /outgoingLight = surfaceRadiance\(/);
assert.doesNotMatch(shader.fragmentShader, /pow\(vParticleLight|surfaceDecodeLight\(vParticleLight/);
assert.equal((shader.fragmentShader.match(/uniform float uAtmosphericLight;/g) ?? []).length, 1);

// Kompaktowanie wygasłych cząstek przenosi również wszystkie dane światła.
const particles = new CubeParticles(scene, { capacity: 2, surfaceLighting: true });
particles.emit({ position: new THREE.Vector3(), colors: new THREE.Color(...albedo), life: 0.01, lighting: dark.lighting });
particles.emit({ position: new THREE.Vector3(2, 0, 0), colors: new THREE.Color(...albedo), life: 2, lighting: lamp.lighting });
particles.update(0.02, world);
assert.equal(particles.count, 1);
assert.equal(particles.mesh.geometry.getAttribute('particleEmission').getX(0), 1);
assert.equal(particles.mesh.geometry.getAttribute('particleLight').getW(0), 0);

// Pozostały dym oraz iskry nie zyskują dodatkowych atrybutów ani nowego modelu.
const smoke = new CubeParticles(scene, { capacity: 1 });
assert.equal(smoke.mesh.geometry.getAttribute('particleLight'), undefined);
assert.ok(smoke.mesh.material.isMeshLambertMaterial);
const glowing = new CubeParticles(scene, { capacity: 1, glowing: true, surfaceLighting: true });
assert.equal(glowing.mesh.geometry.getAttribute('particleLight'), undefined);
assert.ok(glowing.mesh.material.isMeshBasicMaterial);
for (const item of [debris, particles, smoke, glowing]) item.dispose();

console.log('OK: odłamki mają osobne liniowe albedo/niebo/RGB lamp/emisję, zero w ciemności, zgodność classic, przełączanie A/B i poprawne przenoszenie danych cząstek.');
