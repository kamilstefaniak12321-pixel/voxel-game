// ------------------------------------------------------------
// SPRAWDZENIE POZIOMÓW MODELI ROŚLIN (Ustawienia -> Modele)
//
// - opisy (assets/models/rosliny/*/model.json) wczytują się bez błędów,
//   tekstury to PNG 16 x 16,
// - model z płaszczyzn: karty tylko z obszarów arkusza, w obrębie
//   komórki, korzenie przy ziemi,
// - przełączanie: prosty / półrealistyczny / szczegółowy, najbliższy
//   poziom, gdy brak wybranego, rośliny spoza listy bez zmian,
// - kołysanie (uniform w shaderze i cieniach) i wyłączanie animacji.
//
// Uruchomienie: node tools/sprawdz_modele_roslin.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { readTexturePng } from './texture_regions.mjs';

// Moduły przeglądarki (pliki, tekstury, mapa) - zaślepki z tymi samymi
// nazwami eksportów (funkcje nic nie robią). Komendy i świat - prawdziwe.
const STUBBED = ['src/rendering/TextureAtlas.js', 'src/app/textures.js', 'src/app/AndroidUpdates.js',
    'src/rendering/TexturePacks.js', 'src/player/skin.js', 'src/ui/TerrainMap.js'];

function stubSource(url) {
    const source = readFileSync(new URL(url), 'utf8');
    const names = new Set();
    for (const [, name] of source.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(name);
    for (const [, list] of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of list.split(',')) { const name = part.trim().split(/\s+as\s+/).pop(); if (name) names.add(name); }
    }
    const special = {
        atlasReady: 'Promise.resolve({ tileSize: 16, mipmaps: false })', atlasAveragesReady: 'Promise.resolve()',
        getTileColors: '() => []',
        getAtlasUV: '(name) => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1, name })', ATLAS_TILES: '{ water: { x: 0, y: 0 } }',
        ATLAS_COLUMNS: '16', ATLAS_ROWS: '16', MAP_LAYERS: '{}', MAP_SCALES: '[]'
    };
    return [...names].map((name) => `export const ${name} = ${special[name] ?? (/^[A-Z_0-9]+$/.test(name) ? 'null' : '() => null')};`).join('\n');
}

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (STUBBED.some((path) => url.endsWith('/' + path))) {
            return { format: 'module', shortCircuit: true, source: stubSource(url) };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/') || url.includes('/assets/'))
            ? { ...context, format: 'module' } : context);
    }
});


console.warn = () => {};

const { PLANT_MODELS, PLANT_MODEL_ERRORS, PLANT_MODEL_LEVELS, PLANT_MODEL_TEXTURES, resolvePlantModel } = await import('../src/blocks/plantModels.js');
const { applyPlantModelLevel, plantModelLevel } = await import('../src/rendering/PlantModelLevels.js');
const { PLANE_REGIONS, makePlaneModel } = await import('../src/rendering/PlaneModelGeometry.js');
const { blockRenderData, plantDepthMaterial } = await import('../src/rendering/BlockRenderData.js').then(async (m) => ({ ...m, ...(await import('../src/rendering/Shadows.js')) }));
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { getRiverPlantFaces } = await import('../src/rendering/RiverPlantGeometry.js');
const { PLANT_WIND_GLSL, plantWindUniforms } = await import('../src/rendering/PlantWind.js');
const { PlantAnimations } = await import('../src/rendering/PlantAnimations.js');
const { tuftInfo } = await import('../src/rendering/TuftAnimation.js');
const { SETTINGS_DEFAULTS, SETTINGS_CHOICES } = await import('../src/settings/Settings.js');
const { SETTINGS_TABS } = await import('../src/ui/settingsLayout.js');
const { TEXTS } = await import('../src/ui/texts.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Opisy i tekstury -------------------------------------------------------

check(PLANT_MODEL_ERRORS.length === 0, `Błędy modeli: ${PLANT_MODEL_ERRORS.join('; ')}`);
check(PLANT_MODELS.length >= 45 && PLANT_MODELS.slice(0, 5).map((model) => model.id).join() === 'mak,chaber,mniszek,rumianek,lawenda', 'Lista modeli roślin');

// Wszystkie rośliny gry mają trzy wersje - poza tymi, które leżą na
// ścianie, ziemi albo wodzie jedną warstwą pikseli (jedna wersja na
// wszystkie poziomy).
const SINGLE_LAYER = new Set(['water_lily', 'duckweed', 'water_milfoil']);
const modelled = new Set(PLANT_MODELS.flatMap((model) => model.stages.map((stage) => stage.type)));
const { BLOCK_TYPES } = await import('../src/blocks/BlockRegistry.js');
for (const [type, definition] of Object.entries(BLOCK_TYPES)) {
    if (definition.model !== 'cross' && definition.model !== 'riverPlant') continue;
    const tuft = definition.riverPlant?.tuft;
    if (SINGLE_LAYER.has(type) || tuft?.carpet || tuft?.coating || tuft?.bracket) continue;
    check(modelled.has(type), `Roślina bez trzech wersji: ${type}`);
}

for (const [name, url] of Object.entries(PLANT_MODEL_TEXTURES)) {
    const data = readTexturePng(url);
    check(data.toString('latin1', 1, 4) === 'PNG', `${name}: PNG`);
    check(data.readUInt32BE(16) === 16 && data.readUInt32BE(20) === 16, `${name}: 16 x 16 pikseli`);
}

let stageCount = 0;
for (const model of PLANT_MODELS) {
    for (const [index, stage] of model.stages.entries()) {
        stageCount++;
        check(getBlockId(stage.type), `${model.id}: nie ma bloku ${stage.type}`);
        const own = blockRenderData[getBlockId(stage.type)];
        check(stage.semi, `${model.id}[${index}]: półrealistyczny`);
        check(stage.detailed || own.riverPlant, `${model.id}[${index}]: szczegółowy`);
        check(stage.simple || own.cross, `${model.id}[${index}]: prosty obrazek`);

        // Model z płaszczyzn: wszystkie karty z tekstury etapu, w obrębie
        // obszarów arkusza, korzenie przy ziemi, mieści się nad komórką.
        for (let variant = 0; variant < 8; variant++) {
            const faces = makePlaneModel(stage.semi.spec, stage.semi.texture, variant, 7);
            check(faces.length >= 8 && faces.length <= 400, `${model.id}[${index}]: ${faces.length} ścian`);
            for (const face of faces) {
                check(face.texture === stage.semi.texture, 'Karta z tekstury etapu');
                const regions = Object.values(PLANE_REGIONS).filter(([x, y, w, h]) =>
                    face.uv.every(([u, v]) => u >= x / 16 - 1e-9 && u <= (x + w) / 16 + 1e-9 && v >= y / 16 - 1e-9 && v <= (y + h) / 16 + 1e-9));
                check(regions.length > 0, 'Karta w obszarze arkusza');
                for (const point of face.vertices) {
                    check(point[1] > -0.05 && point[1] < 2.1 && Math.abs(point[0]) < 1.25 && Math.abs(point[2]) < 1.25, `${model.id}: wierzchołek za daleko ${point}`);
                }
                check(face.weights.every((w) => w >= 0 && w <= 255), 'Waga wiatru');
            }
        }
    }
}


// --- Wybór poziomu --------------------------------------------------------

const nettle = blockRenderData[getBlockId('nettle')];
const nettleCross = nettle.cross;
const poppyId = getBlockId('poppy');
const poppyCross = blockRenderData[poppyId].cross;
const lavender = [0, 1, 2].map((i) => getBlockId(`lawenda_etap${i + 1}`));
const lavenderPack = lavender.map((id) => blockRenderData[id].riverPlant);

check(SETTINGS_DEFAULTS.plantModels === 'semi' && SETTINGS_CHOICES.plantModels.join() === PLANT_MODEL_LEVELS.join(), 'Ustawienie modeli roślin');
check(applyPlantModelLevel('semi') === stageCount && plantModelLevel() === 'semi', 'Półrealistyczne - wszystkie etapy');
check(blockRenderData[getBlockId('short_grass')].riverPlant?.tint === true, 'Trawa z płaszczyzn - kolor klimatu');
check(blockRenderData[getBlockId('cattail_water')].riverPlant?.waterlogged === true, 'Pałka w wodzie - woda zostaje');
check(applyPlantModelLevel('semi') === 0, 'Ten sam poziom - bez przebudowy');
check(blockRenderData[poppyId].cross === null && blockRenderData[poppyId].riverPlant.kind.startsWith('plane:'), 'Mak - płaszczyzny');
check(getRiverPlantFaces(blockRenderData[poppyId].riverPlant.kind, 2).length > 0, 'Mak - ściany z płaszczyzn');

applyPlantModelLevel('detailed');
check(blockRenderData[poppyId].riverPlant.tuft && blockRenderData[poppyId].riverPlant.uv.name === 'snow', 'Mak - model z pikseli');
check(getRiverPlantFaces(blockRenderData[poppyId].riverPlant.kind, 2, false, blockRenderData[poppyId].riverPlant.tuft).length > 50, 'Mak - dużo pikseli');
check(tuftInfo(poppyId)?.pack === 'model:mak', 'Mak - animacje kępki');
check(lavender.every((id, i) => blockRenderData[id].riverPlant === lavenderPack[i]), 'Lawenda - model z paczki');

applyPlantModelLevel('simple');
check(blockRenderData[poppyId].riverPlant === null && blockRenderData[poppyId].cross === poppyCross, 'Mak - dawny obrazek');
// Blok z własnym modelem (paczka) - prosty obrazek na dwóch kartach tą
// samą drogą co model.
check(lavender.every((id, i) => blockRenderData[id].riverPlant?.kind.endsWith(':simple') && blockRenderData[id].riverPlant.uv.name === `models/rosliny/lawenda/prosty-${i + 1}`), 'Lawenda - prosty obrazek');
check(getRiverPlantFaces(blockRenderData[lavender[0]].riverPlant.kind, 0).length === 4, 'Prosty - dwie karty');
const cattail = blockRenderData[getBlockId('cattail_water')].riverPlant;
check(cattail.waterlogged === true && cattail.kind.endsWith(':simple'), 'Pałka w wodzie - prosty obrazek z wodą');
const grass = blockRenderData[getBlockId('short_grass')];
check(grass.cross && !grass.riverPlant, 'Trawa - dawny obrazek');
check(tuftInfo(poppyId) === null, 'Prosty - bez animacji kępki');
check(nettle.cross === nettleCross && nettle.riverPlant === null, 'Roślina bez modeli bez zmian');

const only = (simple, semi, detailed) => ({ simple: simple ? {} : null, semi: semi ? {} : null, detailed: detailed ? {} : null });
check(resolvePlantModel(only(0, 0, 1), 'simple', {}) === 'detailed', 'Tylko szczegółowy');
check(resolvePlantModel(only(0, 0, 1), 'semi', { sprite: true }) === 'simple', 'Brak półrealistycznego - prostszy');
check(resolvePlantModel(only(1, 0, 1), 'detailed', {}) === 'detailed', 'Wybrany, gdy jest');
check(resolvePlantModel(only(0, 1, 0), 'detailed', {}) === 'semi', 'Najbliższy');
applyPlantModelLevel('semi');


// --- Wiatr i animacje -------------------------------------------------------

check(PLANT_WIND_GLSL.includes('uniform float uPlantSway') && PLANT_WIND_GLSL.includes('offset *= uPlantSway'), 'Kołysanie - przełącznik w shaderze');
check(plantDepthMaterial.uniforms.uPlantSway === plantWindUniforms.uPlantSway, 'Cienie roślin - ten sam przełącznik');
check(SETTINGS_DEFAULTS.plantWind === true && SETTINGS_DEFAULTS.plantAnimations === true, 'Wiatr i animacje domyślnie włączone');

let dirty = 0;
const world = { markDirty: () => dirty++, getChunk: () => null };
const animations = new PlantAnimations(world, { position: { x: 0, y: 0, z: 0 } });
const chunk = { cx: 0, cz: 0, mesh: {}, blocks: new Uint16Array(16) };
animations.setEnabled(false);
animations.blockChanged(chunk, 0, 0, lavender[2]);
check(animations.active.size === 0 && dirty === 0, 'Wyłączone animacje - nic nie startuje');
check(animations.reject(0, 0, 0) === false, 'Wyłączone animacje - bez odrzucenia');
animations.setEnabled(true);


// --- Ustawienia na ekranie ---------------------------------------------------

check(SETTINGS_TABS.models?.join() === 'plantModels,leafModel,plantWind,plantAnimations', 'Zakładka Modele');
check(TEXTS.settingsTabs.models === 'Modele', 'Nazwa zakładki');
for (const level of PLANT_MODEL_LEVELS) {
    check(TEXTS.plantModels(level).length > 15 && TEXTS.modelNotes.plantModels(level).length > 20, `Napis i opis: ${level}`);
}
check(TEXTS.plantWind(true) && TEXTS.plantAnimations(false) && TEXTS.modelNotes.plantWind && TEXTS.modelNotes.plantAnimations, 'Napisy wiatru i animacji');

console.log(`OK: modele roślin - ${checks} sprawdzeń (${PLANT_MODELS.length} roślin, ${stageCount} etapów, 3 poziomy, wiatr i animacje do wyłączenia).`);
