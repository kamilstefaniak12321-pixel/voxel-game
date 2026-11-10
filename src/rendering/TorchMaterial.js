import * as THREE from 'three';
import { createModelMaterial } from './ModelMaterial.js';
import { installEmissionDiagnostics } from './LightingDiagnostics.js';
import { loadTextureRegionBitmap } from './TextureSheets.js';
import { getTorchFaces, getTorchFlamePosition, torchTextureName,
    TORCH_COLORS, TORCH_ATTACHMENTS, TORCH_ANIMATION_SECONDS } from './TorchGeometry.js';

export { getTorchAnimationFrame } from './TorchGeometry.js';

// Jeden zegar dla wszystkich arkuszy, modeli w świecie i pochodni w dłoni.
// Shader zmienia tylko UV i miesza klatki; PNG jest wysyłane do GPU raz.
export const torchTime = { value: 0 };
const textures = new Map();
const geometries = new Map();
const flames = new Map();
let modelReferences = 0;

export function updateTorchTime(seconds = 0) {
    torchTime.value = Number.isFinite(seconds) ? Math.max(0, seconds) % TORCH_ANIMATION_SECONDS : 0;
}

function textureFor(colorKey) {
    const key = torchTextureName(colorKey);
    if (textures.has(key)) return textures.get(key).texture;
    let loaded;
    const ready = new Promise(resolve => { loaded = resolve; });
    const record = {texture: null, ready, error: null};
    const texture = new THREE.Texture();
    texture.userData.regionImageFlipped = true;
    loadTextureRegionBitmap(`assets/models/torch/${key}.png`, true).then(image => {
        texture.image = image; texture.needsUpdate = true; loaded(texture);
    }, error => {
        record.error = new Error(`Nie udało się wczytać ${key}.png`, {cause:error}); loaded(null);
    });
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    // RGB z PNG mieszamy przed dekodowaniem, tak jak źródłowe klatki moda.
    // Shader niżej dekoduje wynik do liniowego RGB dokładnie jeden raz.
    texture.colorSpace = THREE.NoColorSpace;
    texture.name = `Reactive Torch: ${key}`;
    record.texture = texture; textures.set(key, record);
    return texture;
}

/** Czeka na tekstury modeli utworzonych do chwili wywołania; błędy nie giną w teście. */
export async function awaitTorchTextures() {
    const current = [...textures.values()];
    await Promise.all(current.map(record => record.ready));
    const failed = current.find(record => record.error);
    if (failed) throw failed.error;
    return current.map(record => record.texture);
}

// Współrzędne vMapUv są lokalne dla pojedynczej klatki 16×16.
// Próbkujemy środki pikseli, więc dolna/górna krawędź nie pobiera sąsiedniej
// klatki; filtr nearest zachowuje piksele, mix zapewnia płynność czasową RGBA.
const FRAME_SAMPLE_GLSL = `
    vec2 torchPixel = floor(clamp(vec2(vMapUv.x, 1.0 - vMapUv.y), 0.0, .999999) * 16.0);
    float torchPhase = mod(uTorchTime * 10.0, 20.0);
    float torchFrame = floor(torchPhase);
    float torchNext = mod(torchFrame + 1.0, 20.0);
    vec2 torchUv0 = vec2((torchPixel.x + .5) / 16.0, 1.0 - (torchFrame * 16.0 + torchPixel.y + .5) / 320.0);
    vec2 torchUv1 = vec2(torchUv0.x, 1.0 - (torchNext * 16.0 + torchPixel.y + .5) / 320.0);
    vec4 torchTexel = mix(texture2D(map, torchUv0), texture2D(map, torchUv1), fract(torchPhase));
    torchTexel.rgb = mix(torchTexel.rgb / 12.92,
        pow((torchTexel.rgb + .055) / 1.055, vec3(2.4)), step(vec3(.04045), torchTexel.rgb));
    diffuseColor *= torchTexel;
`;

function installAnimation(material, key, emission = false) {
    const base = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        base.call(material, shader, renderer);
        shader.uniforms.uTorchTime = torchTime;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTorchTime;')
            .replace('#include <map_fragment>', FRAME_SAMPLE_GLSL);
        if (emission) installEmissionDiagnostics(shader);
    };
    material.customProgramCacheKey = () => `${baseKey}-reactive-torch-rgba-v1-${key}`;
    material.userData.torchTime = torchTime;
    return material;
}

function flameMaterial(colorKey, texture) {
    if (flames.has(colorKey)) return flames.get(colorKey);
    const material = new THREE.MeshBasicMaterial({map:texture, transparent:true,
        depthWrite:false, side:THREE.DoubleSide, alphaTest:0, toneMapped:false});
    // Domyślne dwa przebiegi DoubleSide rysują najpierw tylne strony,
    // potem przednie. Dzięki temu cztery przezroczyste ścianki płomienia
    // mieszają się we właściwej kolejności z każdej strony pochodni.
    installAnimation(material, 'flame', true);
    flames.set(colorKey, material);
    return material;
}

function geometryFor(attach, part) {
    const key = `${attach}:${part}`;
    if (geometries.has(key)) return geometries.get(key);
    const positions=[], normals=[], uv=[], profiles=[], indices=[];
    for (const face of getTorchFaces('plain', attach).filter(face => face.part === part)) {
        const base = positions.length/3;
        face.vertices.forEach((point, i) => {
            positions.push(...point); normals.push(...face.normal);
            uv.push(face.uv[i][0], 1 - face.uv[i][1]);
            profiles.push(...face.surfaceProfile);
        });
        indices.push(base,base+2,base+1,base+2,base+3,base+1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(profiles,2));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.set(key, geometry); return geometry;
}

/** Model ma x/z wokół zera, a y od podłoża. Umieść go w (x+.5,y,z+.5).
 * attachment to kierunek podpory od komórki pochodni: down/north/south/east/west.
 * lighting: opcjonalne uniformy createModelMaterial dla położenia pochodni;
 * bez nich model w dłoni korzysta ze światła gracza. */
export function createTorchModel(colorKey = 'plain', attach = 'down', {lighting = null} = {}) {
    if (!TORCH_COLORS.includes(colorKey)) colorKey = 'plain';
    if (!TORCH_ATTACHMENTS.includes(attach)) attach = 'down';
    const texture = textureFor(colorKey);
    const shaftMaterial = installAnimation(createModelMaterial({map:texture, lighting}), 'shaft');
    const shaft = new THREE.Mesh(geometryFor(attach, 'shaft'), shaftMaterial);
    const flame = new THREE.Mesh(geometryFor(attach, 'flame'), flameMaterial(colorKey, texture));
    shaft.name = 'torch-shaft'; flame.name = 'torch-flame';
    const group = new THREE.Group(); group.name = `torch-${colorKey}-${attach}`;
    group.add(shaft, flame);
    group.userData.torch = {colorKey, attach, texture, shaft, flame, released:false};
    group.userData.flamePosition = new THREE.Vector3(...getTorchFlamePosition(attach));
    modelReferences++;
    return group;
}

/** Zwalnia własny materiał patyka. Zasoby wspólne żyją dopóki istnieje choć
 * jeden model (świat, dłoń lub podgląd); zamknięcie świata nie psuje podglądu. */
export function disposeTorchModel(group) {
    const own = group?.userData?.torch;
    if (!own || own.released) return;
    own.released = true; own.shaft.material.dispose(); group.removeFromParent();
    modelReferences--;
    if (modelReferences === 0) {
        for (const geometry of geometries.values()) geometry.dispose();
        for (const material of flames.values()) material.dispose();
        for (const record of textures.values()) record.texture.dispose();
        geometries.clear(); flames.clear(); textures.clear();
    }
}
