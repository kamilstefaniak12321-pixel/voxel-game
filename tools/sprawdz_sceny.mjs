// ------------------------------------------------------------
// SPRAWDZENIE USTAWIEŃ, TRYBU PROGRAMISTY I SCEN TESTOWYCH (0.55.0)
//
// - ekran ustawień: każde ustawienie jest na jakiejś zakładce (albo
//   celowo tylko w /ustaw), nic nie powtarza się dwa razy, każde ma napis,
// - jakość grafiki: domyślne na komputerze = Najwyższa, na telefonie =
//   Średnia, przełączanie po kolei, zmiana szczegółu = Własna,
// - eksperymenty: zakładka z opisem każdego, dawny model "atmosfera"
//   to dziś domyślny,
// - tryb programisty: jak kreatywny (latanie, bloki bez końca), plac
//   testowy tylko w nim, stary teren "light-lab" = plac,
// - sceny: każda ma nazwę, opis i istniejącą komendę albo budowanie,
//   miejsca na placu się nie nakładają; scena "Światło i materiały"
//   w prawdziwym świecie stawia stanowiska dawnego laboratorium,
//   a basen i ogródki z komend stają na swoich miejscach.
//
// Uruchomienie: node tools/sprawdz_sceny.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

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
        getAtlasUV: '() => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 })', ATLAS_TILES: '{ water: { x: 0, y: 0 } }',
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

const quiet = { warn: console.warn, log: console.log };
console.warn = () => {};

const THREE = await import('three');
const { SETTINGS_DEFAULTS, SETTINGS_RANGES, SETTINGS_CHOICES, EXPERIMENTS, GRAPHICS_PRESETS,
    graphicsPreset, nextGraphicsPreset, Settings } = await import('../src/settings/Settings.js');
const { SETTINGS_TABS, ADVANCED_VIDEO, COMMAND_ONLY_SETTINGS } = await import('../src/ui/settingsLayout.js');
const { TEXTS } = await import('../src/ui/texts.js');
const { TOUCH_SETTINGS, isCreative } = await import('../src/config.js');
const { TERRAIN_TYPES, createGenerator } = await import('../src/world/terrain/generators.js');
const { TEST_SITE_FLOOR } = await import('../src/world/terrain/TestSiteGenerator.js');
const { SCENES, SCENE_TIMES, LIGHT_SCENE_BOXES, LIGHT_SCENE_VIEW, findScene, buildScene } = await import('../src/dev/scenes.js');
const { LIGHTING_REFERENCE_CAMERAS, LIGHTING_REFERENCE_PROBES, LIGHTING_REFERENCE_ORIGIN,
    placeLightingReferenceCamera } = await import('../src/dev/LightingReference.js');
const { GAME_COMMANDS, setSceneTime } = await import('../src/commands/gameCommands.js');
const { MATERIAL_REFERENCE_PROBES, MATERIAL_REFERENCE_CAMERAS, editLightingMaterialsReference,
    placeLightingMaterialsCamera } = await import('../src/dev/LightingMaterialsReference.js');
const { World } = await import('../src/world/World.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Ekran ustawień -----------------------------------------------------

const shown = [...Object.values(SETTINGS_TABS).flat(), ...ADVANCED_VIDEO];
const special = new Set(['graphicsPreset', 'skin', 'texturePack']);

check(new Set(shown).size === shown.length, 'Ustawienie na dwóch zakładkach');
check(Object.keys(SETTINGS_TABS).every((tab) => typeof TEXTS.settingsTabs[tab] === 'string'), 'Zakładka bez nazwy');
check(Object.keys(SETTINGS_TABS).length <= 7, 'Za dużo zakładek');

for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    check(shown.includes(key) || COMMAND_ONLY_SETTINGS.includes(key), `Ustawienia ${key} nie ma w menu`);
}

for (const key of shown) {
    check(special.has(key) || key in SETTINGS_DEFAULTS, `Nieznane ustawienie na ekranie: ${key}`);
    if (!special.has(key) && key !== 'theme') {
        check(typeof TEXTS[key] === 'function' && TEXTS[key](SETTINGS_DEFAULTS[key]).length > 0, `Brak napisu: ${key}`);
    }
}

check(SETTINGS_TABS.video.length <= 6, 'Obraz: za dużo na wierzchu (reszta - Zaawansowane)');
check(SETTINGS_TABS.video[0] === 'graphicsPreset', 'Jakość grafiki pierwsza');


// --- Jakość grafiki ------------------------------------------------------

const store = new Map();
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };

const settings = new Settings();
check(graphicsPreset(settings) === 'ultra', 'Domyślna jakość na komputerze - Najwyższa');

const phone = new Settings(TOUCH_SETTINGS);
check(graphicsPreset(phone) === 'medium', 'Domyślna jakość na telefonie - Średnia');

const seen = [];
for (let i = 0; i < 4; i++) seen.push(nextGraphicsPreset(settings));
check(seen.join() === 'low,medium,high,ultra', `Kolejność jakości: ${seen}`);
for (const [name, values] of Object.entries(GRAPHICS_PRESETS)) {
    for (const [key, value] of Object.entries(values)) {
        check(key in SETTINGS_DEFAULTS && ADVANCED_VIDEO.includes(key), `${name}: ${key} poza Zaawansowanymi`);
        check(settings.validate(key, value) === value, `${name}: niepoprawne ${key}`);
    }
    check(TEXTS.graphicsPreset(name) !== TEXTS.graphicsPreset('custom'), `Brak nazwy jakości ${name}`);
}
settings.set('shadows', 2);
check(graphicsPreset(settings) === 'custom', 'Zmiana szczegółu - jakość Własna');
check(nextGraphicsPreset(settings) === 'low' && settings.get('potato') === true, 'Z Własnej - od Niskiej');
settings.reset();
check(graphicsPreset(settings) === 'ultra', 'Przywróć domyślne - Najwyższa');


// --- Dostępność ruchu w menu ---------------------------------------------

check(settings.get('menuMotion') === 'auto' && phone.get('menuMotion') === 'auto',
    'Menu domyślnie uwzględnia ustawienia ruchu urządzenia');
for (const mode of ['auto', 'full', 'off']) {
    check(settings.validate('menuMotion', mode) === mode, `Dozwolony ruch menu: ${mode}`);
}
for (const invalid of [null, true, 1, '', 'unknown']) {
    check(settings.validate('menuMotion', invalid) === 'auto', 'Nieznany ruch menu wraca do System');
}
settings.set('menuMotion', 'off');
check(new Settings().get('menuMotion') === 'off', 'Wyłączenie ruchu pozostaje po ponownym uruchomieniu');
settings.reset();
check(settings.get('menuMotion') === 'auto', 'Przywrócenie domyślnych przywraca System');
const oldSettings = JSON.parse(store.get('voxel-game-settings'));
delete oldSettings.menuMotion;
store.set('voxel-game-settings', JSON.stringify(oldSettings));
check(new Settings().get('menuMotion') === 'auto', 'Starszy zapis bez ruchu menu dostaje System');


// --- Zasięg pełnych bloków do 800 ----------------------------------------

check(SETTINGS_RANGES.viewDistance.max === 800, 'Suwak zasięgu udostępnia 800 bloków');
check(settings.get('viewDistance') === SETTINGS_DEFAULTS.viewDistance,
    'Zwiększenie limitu suwaka nie zmienia domyślnego zasięgu');
for (const [input, expected] of [[800, 800], ['800', 800], [799, 800], [792, 792], [808, 800], [9000, 800], [-1, 24]]) {
    check(settings.validate('viewDistance', input) === expected, `Walidacja zasięgu ${input} → ${expected}`);
}
settings.set('viewDistance', 800);
check(new Settings().get('viewDistance') === 800, 'Zasięg 800 zostaje po ponownym uruchomieniu');
const savedDistance = JSON.parse(store.get('voxel-game-settings'));
savedDistance.viewDistance = 9000;
store.set('voxel-game-settings', JSON.stringify(savedDistance));
check(new Settings().get('viewDistance') === 800, 'Za duży zasięg w zapisie jest ograniczany do 800');
const distanceCommand = GAME_COMMANDS.find(command => command.name === 'ustaw');
const distanceResult = distanceCommand.run(['zasieg', '800'], { game: { settings } });
check(settings.get('viewDistance') === 800 && distanceResult.includes('800'), 'Komenda /ustaw zasieg 800 działa tak samo jak suwak');
check(distanceCommand.complete(['zasieg', '']).includes('800'), 'Podpowiedź komendy zawiera nowy maksymalny zasięg');
settings.reset();
check(settings.get('viewDistance') === SETTINGS_DEFAULTS.viewDistance, 'Reset przywraca wcześniejszy domyślny zasięg');


// --- Eksperymenty --------------------------------------------------------

check(SETTINGS_TABS.experiments === EXPERIMENTS, 'Zakładka eksperymentów');
for (const key of EXPERIMENTS) {
    check(typeof TEXTS.experimentNotes[key] === 'string' && TEXTS.experimentNotes[key].length > 20, `Brak opisu eksperymentu ${key}`);
    check(!Object.values(SETTINGS_TABS).some((keys) => keys !== EXPERIMENTS && keys.includes(key)) && !ADVANCED_VIDEO.includes(key),
        `Eksperyment ${key} także poza zakładką Eksperymenty`);
}
check(SETTINGS_DEFAULTS.bushyGrass === false && SETTINGS_DEFAULTS.bounceLight === false && SETTINGS_DEFAULTS.lightingModel === 'world',
    'Eksperymenty domyślnie wyłączone');
check(settings.validate('lightingModel', 'atmosphere') === 'world', 'Dawny model "atmosfera" = domyślny');
check(SETTINGS_CHOICES.lightingModel.join() === 'world,classic', 'Dwa modele światła');
check(!('loadBudget' in SETTINGS_RANGES) || COMMAND_ONLY_SETTINGS.includes('loadBudget'), 'Wczytywanie - tylko /ustaw');


// --- Tryb programisty i plac testowy ---------------------------------------

check(isCreative('developer') && isCreative('creative') && !isCreative('adventure'), 'Programista jak kreatywny');
check(TEXTS.gameModes.developer && TEXTS.gameModeNotes.developer, 'Napisy trybu programisty');
check(TERRAIN_TYPES.flat.developer === true && !TERRAIN_TYPES.realistic.developer, 'Plac testowy tylko w trybie programisty');
check(TERRAIN_TYPES['light-lab'].hidden === true && createGenerator('light-lab', 1).type === 'flat', 'Dawne laboratorium = plac testowy');
check(TEXTS.terrainNotes.flat, 'Opis placu testowego');


// --- Lista scen --------------------------------------------------------

const commandNames = new Set(GAME_COMMANDS.map((command) => command.name));
check(commandNames.has('scena'), 'Komenda /scena');
check(new Set(SCENES.map((scene) => scene.id)).size === SCENES.length, 'Powtórzone id sceny');

const slots = [];
for (const scene of SCENES) {
    check(scene.name && scene.description.length > 20, `Scena ${scene.id} bez opisu`);
    check(typeof scene.build === 'function' || commandNames.has(scene.command?.[0]), `Scena ${scene.id}: brak komendy ${scene.command?.[0]}`);
    check(findScene(scene.id) === scene, `findScene(${scene.id})`);
    if (scene.slot) {
        // Miejsca na placu: z dala od środka (scena światła) i od siebie.
        check(Math.hypot(scene.slot.x, scene.slot.z) > 60, `Scena ${scene.id} za blisko środka placu`);
        for (const other of slots) check(Math.abs(other.x - scene.slot.x) >= 64 || Math.abs(other.z - scene.slot.z) >= 64, `Sceny ${scene.id} nachodzą na siebie`);
        slots.push(scene.slot);
    }
}
check(Object.keys(SCENE_TIMES).every((name) => TEXTS.sceneTimes[name]), 'Napisy pór dnia');

const time = { days: 3.9, speed: 1 };
setSceneTime(time, 'noon');
check(Math.abs(time.days - 3.5) < 1e-5, 'Pora dnia - ten sam dzień');


// --- Sceny w prawdziwym świecie (plac testowy) ----------------------------

const world = new World(new THREE.Scene(), 42, new Map(), 'flat', {});
const player = {
    pos: new THREE.Vector3(7.5, TEST_SITE_FLOOR + 1, 32.5), vel: new THREE.Vector3(), yaw: 0, pitch: 0, canFly: true, flying: false,
    updateCamera() {}
};
const game = { mode: 'developer', world, player, settings, inventory: null };
const ctx = { game, world, player, time: { days: 0.5, speed: 1 } };
const run = (name, args) => GAME_COMMANDS.find((command) => command.name === name).run(args, ctx);

buildScene(findScene('swiatlo'), ctx, run);
const id = (x, y, z) => world.getBlockId(x, y, z);
check(id(20, 25, 13) === 0, 'Światło: otwór w dachu');
check(id(17, 25, 13) === getBlockId('lime_plaster'), 'Światło: dach');
check(id(-20, 24, 8) === getBlockId('oak_leaves'), 'Światło: liście');
check(id(-4, 15, 10) === getBlockId('water'), 'Światło: basen');
check(id(16, 19, 5) === getBlockId('lamp_red') && id(23, 19, 5) === getBlockId('lamp_blue'), 'Światło: lampy');
check(id(-28, 20, -30) === getBlockId('lime_plaster') && id(-14, 20, -30) === getBlockId('terracotta'), 'Światło: wnęki z materiałów');
check(world.getLight(17, 20, 13).sky < world.getLight(7, 20, 30).sky, 'Światło: dach zabiera niebo');
check(world.getLight(16, 19, 6).red > 0, 'Światło: lampa świeci');
check(player.pos.distanceTo(new THREE.Vector3(LIGHT_SCENE_VIEW.x, LIGHT_SCENE_VIEW.y, LIGHT_SCENE_VIEW.z)) < 1e-6 && player.flying, 'Światło: gracz w punkcie widokowym (leci)');
const boxes = LIGHT_SCENE_BOXES.filter((b) => b.material);
check(boxes.length >= 20, 'Światło: wszystkie stanowiska');

// Druga budowa w tym samym miejscu daje to samo (nic się nie przesuwa).
const before = [...world.chunks.values()].map((chunk) => chunk.blocks.slice());
buildScene(findScene('swiatlo'), ctx, run);
const after = [...world.chunks.values()].map((chunk) => chunk.blocks.slice());
check(before.every((blocks, i) => blocks.every((value, j) => value === after[i][j])), 'Światło: powtórna budowa bez zmian');

// Osobna scena palety: rzeczywista komora na styku czterech chunków.
// Otwarcie i zamknięcie dachu musi zmienić niebo także u sąsiadów.
game.campfires = { fires: new Map(), version: 0 };
buildScene(findScene('paleta'), ctx, run);
const reference = LIGHTING_REFERENCE_PROBES;
const chamberSamples = [[79, 19, -81], [80, 19, -81], [79, 19, -80], reference.chamber];
const skyAt = point => world.getLight(...point).sky;
check(chamberSamples.every(point => skyAt(point) === 0), 'Paleta: zamknięta komora jest ciemna w czterech chunkach');
world.clearBlock(...reference.roof);
check(chamberSamples.every(point => skyAt(point) > 0), 'Paleta: otwarcie dachu rozświetla cztery chunki');
world.setBlock(...reference.roof, 'lime_plaster');
check(chamberSamples.every(point => skyAt(point) === 0), 'Paleta: zamknięcie dachu usuwa światło w czterech chunkach');
check(id(56, 17, -93) === getBlockId('blueberry_bush_full') && id(56, 17, -102) === getBlockId('blueberry_bush_full'),
    'Paleta: taki sam krzak w słońcu i pod dachem');
check(id(20, 25, 13) === 0 && id(16, 19, 5) === getBlockId('lamp_red'), 'Paleta: stare laboratorium pozostaje nienaruszone');
const referenceFire = game.campfires.fires.get(reference.campfire.join(','));
check(id(...reference.campfire) === getBlockId('campfire') && referenceFire.phase === 'burning' &&
    referenceFire.logs.length === 6 && referenceFire.logs.every(log => log.burn === 24 / 480),
    'Paleta: ognisko ma kompletny, powtarzalny stan zwykłego spalania');
const referenceBlocks = new Map([...world.chunks].map(([key, chunk]) => [key, chunk.blocks.slice()]));
buildScene(findScene('paleta'), ctx, run);
check([...referenceBlocks].every(([key, blocks]) => blocks.every((value, i) => value === world.chunks.get(key).blocks[i])),
    'Paleta: druga budowa odtwarza ten sam układ');
check(game.campfires.fires.size === 1, 'Paleta: ponowna budowa nie mnoży źródeł ognia');
const targetView = LIGHTING_REFERENCE_CAMERAS.chamber;
player.eyeHeight = 1.2;
placeLightingReferenceCamera(player, 'chamber');
check(player.pos.distanceTo(new THREE.Vector3(targetView.position[0], targetView.position[1] - player.eyeHeight,
    targetView.position[2])) < 1e-6, 'Paleta: stała pozycja oka niezależnie od wysokości gracza');
const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
check(direction.distanceTo(new THREE.Vector3(...targetView.target).sub(new THREE.Vector3(...targetView.position)).normalize()) < 1e-6,
    'Paleta: gracz patrzy dokładnie w zapisany cel');
placeLightingReferenceCamera(player, 'chamber', { ...LIGHTING_REFERENCE_ORIGIN, x: LIGHTING_REFERENCE_ORIGIN.x + 7 });
check(Math.abs(player.pos.x - targetView.position[0] - 7) < 1e-6, 'Paleta: kamera przesuwa się razem ze sceną poza placem');
delete game.campfires;

// E05/E06: słońce dociera wyłącznie do pierwszego pokoju. Przegroda
// leży na granicy chunków; każda edycja używa zwykłej ścieżki World.
buildScene(findScene('materialy'), ctx, run);
const materialProbe = MATERIAL_REFERENCE_PROBES;
check(skyAt(materialProbe.roomA) > 0 && skyAt(materialProbe.roomB) === 0,
    `Materiały: otwarty dach A nie rozświetla zamkniętego pokoju B (A=${skyAt(materialProbe.roomA)}, B=${skyAt(materialProbe.roomB)})`);
check(id(150, 16, -164) === getBlockId('dirt') && id(160, 16, -164) === getBlockId('sand') &&
    id(170, 16, -164) === getBlockId('snow'), 'Materiały: trzy różne podłoża pod identycznymi odbiornikami');
editLightingMaterialsReference(world, 'roof', false);
check(skyAt(materialProbe.roomA) === 0 && skyAt(materialProbe.roomB) === 0,
    'Materiały: zamknięcie dachu usuwa dzienne źródło z obu pokoi');
editLightingMaterialsReference(world, 'lamp', true);
check(world.getLight(...materialProbe.roomA).red > 0 && world.getLight(...materialProbe.roomB).red === 0,
    'Materiały: lokalna lampa nie przechodzi przez wspólną ścianę');
editLightingMaterialsReference(world, 'divider', true);
check(world.getLight(...materialProbe.roomB).red > 0, 'Materiały: rzeczywisty otwór w przegrodzie wpuszcza światło');
editLightingMaterialsReference(world, 'lamp', false);
check(world.getLight(...materialProbe.roomA).red === 0 && world.getLight(...materialProbe.roomB).red === 0,
    'Materiały: usunięcie źródła usuwa RGB po obu stronach otwartej przegrody');
editLightingMaterialsReference(world, 'ground', 'snow');
check(id(150, 16, -164) === getBlockId('snow'), 'Materiały: podmiana ziemi na śnieg jest edycją bloków');
buildScene(findScene('materialy'), ctx, run);
check(id(150, 16, -164) === getBlockId('dirt') && id(...materialProbe.divider) === getBlockId('lime_plaster') &&
    id(...materialProbe.lamp) === 0 && skyAt(materialProbe.roomA) > 0 && skyAt(materialProbe.roomB) === 0,
    'Materiały: odtworzenie przywraca podłoże, ścianę, dach i brak lampy');
check(id(56, 17, -93) === getBlockId('blueberry_bush_full'), 'Materiały: nie narusza palety 0.57.0');
placeLightingMaterialsCamera(player, 'leafSide');
check(player.pos.distanceTo(new THREE.Vector3(...MATERIAL_REFERENCE_CAMERAS.leafSide.position)
    .sub(new THREE.Vector3(0, player.eyeHeight, 0))) < 1e-6, 'Materiały: kamera zachowuje stałą pozycję oka');

// Basen z komendy /woda basen - na swoim miejscu, przed graczem (+z).
const pool = findScene('basen');
buildScene(pool, ctx, run);
check(player.pos.x === pool.slot.x + 0.5 && player.pos.z === pool.slot.z + 0.5 && player.yaw === Math.PI, 'Basen: gracz na miejscu sceny');
let water = 0;
for (let z = pool.slot.z + 1; z < pool.slot.z + 16; z++) {
    if (id(pool.slot.x, TEST_SITE_FLOOR, z) === getBlockId('water')) water++;
}
check(water >= 8, `Basen: woda przed graczem (${water})`);

// Ogródki roślin, krzaków i aleja drzew z komend - stawiają bloki.
for (const name of ['rosliny', 'krzaki', 'drzewa']) {
    const scene = findScene(name);
    const version = world.version;
    const text = buildScene(scene, ctx, run);
    check(world.version > version, `${scene.name}: nic nie postawiono (${text})`);
    check(Math.abs(player.pos.x - scene.slot.x - 0.5) < 1e-9, `${scene.name}: gracz na miejscu sceny`);
}

console.warn = quiet.warn;
console.log(`OK: ustawienia, tryb programisty i sceny - ${checks} sprawdzeń (${Object.keys(SETTINGS_TABS).length} zakładek, ` +
    `jakość Niska-Najwyższa, ${EXPERIMENTS.length} eksperymenty, ${SCENES.length} scen, światło i basen w prawdziwym świecie).`);
