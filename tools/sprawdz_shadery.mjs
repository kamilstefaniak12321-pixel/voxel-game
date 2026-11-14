// ------------------------------------------------------------
// SPRAWDZENIE PRZYGOTOWANIA PROGRAMÓW CIENIUJĄCYCH (1.1.2)
//
// - wzór (warmupObject): ukryty, z podanymi atrybutami, właściwy rodzaj,
// - prewarmScenes: każda scena zgłoszona z właściwym celem rysowania,
//   stan renderera przywrócony, czekanie na kompilację w tle, programy
//   dokończone (getUniforms), błąd jednego nie psuje reszty,
// - licznik programów skompilowanych w trakcie gry,
// - gra zbiera wzory ze wszystkich miejsc, które tworzą rzeczy dopiero
//   w trakcie gry, i robi próbną klatkę pod ekranem wczytywania.
//
// Prawdziwą kartę graficzną sprawdza się w grze: /wydajnosc pokazuje,
// ile programów skompilowało się w trakcie gry.
//
// Uruchomienie: node tools/sprawdz_shadery.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer { update() {} dispose() {} } export const TABLE_ROTATION = {}; export function productSpot() { return { x: 0, z: 0 }; }' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const W = await import('../src/rendering/ShaderWarmup.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- Wzór ------------------------------------------------------------------------------

{
    const material = new THREE.MeshLambertMaterial();
    const mesh = W.warmupObject(material, W.COLORED_MODEL_ATTRIBUTES);
    check(mesh.isMesh && mesh.material === material && mesh.visible === false && mesh.userData.shaderWarmup, 'Wzór: ukryta siatka z podanym materiałem');
    check(Object.keys(mesh.geometry.attributes).join() === 'position,normal,uv,color,surfaceProfile', 'Wzór: atrybuty jak w modelu z kolorami');
    check(mesh.geometry.attributes.color.itemSize === 3 && mesh.geometry.attributes.position.count === 0, 'Wzór: kolor RGB, zero wierzchołków (nic nie rysuje)');
    check(!('color' in W.warmupObject(material, W.MODEL_ATTRIBUTES).geometry.attributes), 'Wzór bez kolorów nie ma atrybutu koloru');
    const far = W.warmupObject(material, { position: 4, color: [4, true] });
    check(far.geometry.attributes.color.itemSize === 4 && far.geometry.attributes.color.normalized && !far.geometry.attributes.position.normalized, 'Wzór: kolor RGBA znormalizowany (inny wariant programu)');
    check(W.warmupObject(new THREE.PointsMaterial(), { position: 3 }, 'points').isPoints && W.warmupObject(new THREE.LineBasicMaterial(), { position: 3 }, 'lines').isLineSegments, 'Wzór: punkty i linie');
}


// --- prewarmScenes ---------------------------------------------------------------------

function fakeRenderer({ readyAfter = 0, broken = null } = {}) {
    const log = [], stored = new Map();
    let target = 'ekran', polls = 0;
    const program = (name) => ({ name, uniforms: 0, isReady: () => ++polls > readyAfter, getUniforms() { if (name === broken) throw new Error('zepsuty'); this.uniforms++; } });
    const renderer = {
        log, info: { programs: [] },
        getRenderTarget: () => target, setRenderTarget: (value) => { target = value; log.push(['target', value]); },
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        getViewport: (v) => v.set(1, 2, 3, 4), setViewport: (v) => log.push(['viewport', v.toArray().join()]),
        getScissor: (v) => v.set(5, 6, 7, 8), setScissor: (v) => log.push(['scissor', v.toArray().join()]),
        getScissorTest: () => true, setScissorTest: (v) => log.push(['scissorTest', v]),
        properties: { get: (material) => stored.get(material) ?? {} },
        compile(scene, camera, targetScene) {
            log.push(['compile', scene.name, targetScene?.name ?? null, target]);
            const materials = new Set();
            scene.traverse((object) => {
                if (!object.material) return;
                materials.add(object.material);
                if (!stored.has(object.material)) {
                    // Przezroczysty dwustronny materiał ma dwa programy.
                    const names = object.material.transparent && object.material.side === THREE.DoubleSide ? ['back', 'front'] : ['one'];
                    const programs = new Map(names.map((side) => [side, program(`${object.material.name}:${side}`)]));
                    stored.set(object.material, { programs });
                    renderer.info.programs.push(...programs.values());
                }
            });
            return materials;
        },
        programsOf: (material) => [...stored.get(material).programs.values()]
    };
    return renderer;
}
const named = (name, objects) => { const scene = new THREE.Scene(); scene.name = name; for (const object of objects) scene.add(object); return scene; };
const material = (name, options = {}) => Object.assign(new THREE.MeshBasicMaterial(options), { name });

{
    const renderer = fakeRenderer({ readyAfter: 6 });
    const a = material('a'), b = material('b', { transparent: true, side: THREE.DoubleSide }), hidden = material('ukryty');
    const hiddenMesh = W.warmupObject(hidden, { position: 3 });
    const world = named('swiat', [new THREE.Mesh(new THREE.BufferGeometry(), a), hiddenMesh]);
    const patterns = named('wzory', [W.warmupObject(b, { position: 3 })]);
    const camera = new THREE.PerspectiveCamera();
    const count = await W.prewarmScenes(renderer, [
        { scene: world, camera }, { scene: patterns, camera, targetScene: world }, { scene: null, camera }, { scene: world, camera: null }
    ], 'cel-hdr');
    check(count === 4, `Cztery programy: a, ukryty i dwa dla przezroczystego dwustronnego (jest ${count})`);
    const compiles = renderer.log.filter(([kind]) => kind === 'compile');
    check(compiles.length === 2 && compiles.every((entry) => entry[3] === 'cel-hdr'), 'Kompilacja z celem rysowania świata; brakujące sceny pominięte');
    check(compiles[0][2] === null && compiles[1][2] === 'swiat', 'Wzory kompilują się ze światłami sceny, do której trafią');
    check(renderer.getRenderTarget() === 'ekran', 'Cel rysowania przywrócony');
    check(renderer.log.some(([kind, value]) => kind === 'viewport' && value === '1,2,3,4') && renderer.log.some(([kind, value]) => kind === 'scissor' && value === '5,6,7,8') && renderer.log.some(([kind, value]) => kind === 'scissorTest' && value === true), 'Okno rysowania i przycinanie przywrócone');
    check([a, b, hidden].every((entry) => renderer.programsOf(entry).every((program) => program.uniforms === 1)), 'Każdy program dokończony dokładnie raz - także ukrytego obiektu');
}
{
    // Program z błędem nie przerywa przygotowania pozostałych.
    const renderer = fakeRenderer({ broken: 'zly:one' });
    const good = material('dobry'), bad = material('zly');
    const scene = named('s', [new THREE.Mesh(new THREE.BufferGeometry(), bad), new THREE.Mesh(new THREE.BufferGeometry(), good)]);
    const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
    try { await W.prewarmScenes(renderer, [{ scene, camera: new THREE.PerspectiveCamera() }]); } finally { console.warn = warn; }
    check(warned === 1 && renderer.programsOf(good)[0].uniforms === 1, 'Błąd jednego programu: ostrzeżenie, reszta gotowa');
}
{
    // Błąd kompilacji: stan renderera i tak wraca.
    const renderer = fakeRenderer();
    renderer.compile = () => { throw new Error('brak kontekstu'); };
    let thrown = false;
    try { await W.prewarmScenes(renderer, [{ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }], 'cel'); } catch { thrown = true; }
    check(thrown && renderer.getRenderTarget() === 'ekran', 'Po błędzie cel rysowania wraca na ekran');
}
{
    // Licznik programów skompilowanych w trakcie gry.
    const renderer = fakeRenderer();
    check(W.lateShaderPrograms(renderer) === 0, 'Przed przygotowaniem licznik = 0');
    renderer.info.programs.push({}, {}, {});
    W.markShadersReady(renderer);
    check(W.lateShaderPrograms(renderer) === 0, 'Po przygotowaniu: 0 spóźnionych');
    renderer.info.programs.push({}, {});
    check(W.lateShaderPrograms(renderer) === 2, 'Dwa nowe programy w grze = 2 spóźnione');
    renderer.info.programs.length = 1;
    check(W.lateShaderPrograms(renderer) === 0, 'Usunięte programy nie dają liczby ujemnej');
}


// --- Gra zbiera wzory i przygotowuje je przed grą -------------------------------------

{
    const game = source('src/game/Game.js');
    for (const place of ['this.torches?.shaderPrototypes', 'this.drops?.renderer?.shaderPrototypes', 'this.campfires?.renderer?.shaderPrototypes', 'this.meteorites?.shaderPrototypes', 'this.farTerrain?.shaderPrototypes']) {
        check(game.includes(place), `Gra zbiera wzory: ${place}`);
    }
    check(/heldPlantMaterial, COLORED_MODEL_ATTRIBUTES/.test(game) && /heldCutoutMaterial, COLORED_MODEL_ATTRIBUTES/.test(game), 'Wzory przedmiotu w dłoni: model gracza i ręka z oczu');
    const start = game.slice(game.indexOf('static async start('), game.indexOf('async prewarmShaders('));
    check(start.indexOf('prewarmWaterMaterial') < start.indexOf('game.prewarmShaders(') && start.indexOf('game.prewarmShaders(') < start.indexOf('game.render()'), 'Kolejność przed grą: woda, wszystkie sceny, próbna klatka');
    check(/try \{[^}]*game\.shadows\.update\(0[^}]*game\.render\(\);[^}]*\} catch/s.test(start), 'Próbna klatka z cieniami; jej błąd nie zatrzymuje wejścia do świata');
    for (const [file, marker] of [
        ['src/rendering/TorchRenderer.js', 'createTorchModel(\'plain\', \'down\', { lighting })'],
        ['src/rendering/DropRenderer.js', 'vertexColors: true, lighting: lighting()'],
        ['src/rendering/CampfireRenderer.js', 'warmupObject(this.flameMaterial'],
        ['src/game/Meteorites.js', 'warmupObject(createTrailMaterial()'],
        ['src/world/FarTerrain.js', 'farMaterials.map((material) => warmupObject(material']
    ]) {
        const text = source(file);
        check(text.includes('shaderPrototypes()') && text.includes(marker), `${file}: wzór z prawdziwym materiałem`);
        check(/dispose\(\) \{[\s\S]{0,400}prototype/.test(text), `${file}: wzór zwalniany razem z resztą`);
    }
    check(source('src/commands/settingsCommands.js').includes('lateShaderPrograms(game.renderer)'), '/wydajnosc pokazuje programy skompilowane w trakcie gry');
}

console.log(`OK: programy cieniujące - ${checks} sprawdzeń`);
