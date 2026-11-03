// Ruch kamery menu: przekierowanie w trakcie lotu, powrót i dostępność.
// Bez przeglądarki, WebGL i zmian zapisów świata.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});
const { MenuCamera } = await import('../src/menu/MenuCamera.js');
const { MENU_SCENE, menuSettings } = await import('../src/menu/menuScene.js');

const views = Object.freeze(Object.fromEntries(Object.entries({
    home: { position: [12, 70, 24], target: [0, 54, 0] },
    river: { position: [-20, 60, 8], target: [-4, 49, -16] },
    forest: { position: [36, 68, -12], target: [48, 52, -28] },
    mountains: { position: [-8, 96, -48], target: [0, 84, -180] }
}).map(([name, view]) => [name, Object.freeze({
    position: Object.freeze(view.position), target: Object.freeze(view.target)
})])));
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const near = (actual, expected, label, tolerance = 1e-8) =>
    check(actual.every((value, index) => Math.abs(value - expected[index]) < tolerance), label);
const step = (rig, seconds, fps = 60, reduced = false) => {
    for (let frame = 0; frame < Math.round(seconds * fps); frame++) rig.update(1 / fps, reduced);
};
const state = rig => ({
    position: [...rig.position], target: [...rig.target],
    velocity: [...rig.velocity], targetVelocity: [...rig.targetVelocity], clock: rig.clock
});
function cameraStub() {
    return { position: { set(...value) { this.value = value; } },
        lookAt(...value) { this.aim = value; }, updateMatrixWorld() { this.updated = true; } };
}

const rig = new MenuCamera(views);
equal(rig.position, views.home.position, 'Start w głównym widoku');
equal(rig.target, views.home.target, 'Start z właściwym kierunkiem patrzenia');
check(rig.position !== views.home.position && rig.target !== views.home.target,
    'Ruch nie nadpisuje konfiguracji sceny');
const start = state(rig);
rig.goTo('river');
equal(state(rig), start, 'Wybranie zakładki nie teleportuje ani nie zeruje stanu');
rig.update(1 / 60);
check(rig.position[0] < start.position[0] && rig.position[0] > views.river.position[0],
    'Pierwsza klatka rozpoczyna przejazd zamiast skoku do celu');

step(rig, 0.5);
const interrupted = state(rig);
check(interrupted.velocity.some(value => Math.abs(value) > 1), 'Próba przerwania odbywa się w ruchu');
rig.goTo('forest');
equal(state(rig), interrupted, 'Nowa zakładka zachowuje pozycję, cel patrzenia i obie prędkości');
rig.update(1 / 10000);
check(Math.hypot(...rig.position.map((value, i) => value - interrupted.position[i])) < 0.02,
    'Pierwsza klatka po przekierowaniu nie skacze');
rig.goTo('mountains');
step(rig, 0.2);
rig.goTo('home');
step(rig, 10);
near(rig.position, views.home.position, 'Po szybkim przeglądzie wraca do głównego miejsca');
near(rig.target, views.home.target, 'Powrót przywraca główny kadr');
near(rig.velocity, [0, 0, 0], 'Po zakończeniu przejazdu prędkość zanika');
near(rig.targetVelocity, [0, 0, 0], 'Po zakończeniu zanika również obrót');

// Ta sama sekwencja i czas, ale inne odświeżanie ekranu.
const frameRates = [30, 60, 144];
const endpoints = frameRates.map(fps => {
    const current = new MenuCamera(views);
    current.goTo('river'); step(current, 0.5, fps);
    current.goTo('forest'); step(current, 0.5, fps);
    current.goTo('mountains'); step(current, 1, fps);
    return state(current);
});
for (let i = 1; i < endpoints.length; i++) {
    for (const key of ['position', 'target', 'velocity', 'targetVelocity']) {
        near(endpoints[i][key], endpoints[0][key], `${key}: taki sam przejazd przy ${frameRates[i]} i 30 FPS`);
    }
}

for (const name of ['river', 'forest', 'mountains']) {
    const current = new MenuCamera(views);
    current.goTo(name);
    let bounded = true, approaching = true;
    let previous = Math.hypot(...current.position.map((value, i) => value - views[name].position[i]));
    for (let frame = 0; frame < 300; frame++) {
        current.update(1 / 60);
        for (let i = 0; i < 3; i++) {
            bounded &&= current.position[i] >= Math.min(views.home.position[i], views[name].position[i]) - 1e-8 &&
                current.position[i] <= Math.max(views.home.position[i], views[name].position[i]) + 1e-8;
        }
        const distance = Math.hypot(...current.position.map((value, i) => value - views[name].position[i]));
        approaching &&= distance <= previous + 1e-8;
        previous = distance;
    }
    check(bounded, `${name}: brak przelatywania za punkt docelowy przy starcie ze spoczynku`);
    check(approaching, `${name}: zbliżanie do celu bez oscylacji`);
}

rig.goTo('nieznana-zakladka');
equal(rig.view, 'home', 'Nieznany widok bezpiecznie wraca do głównego');
rig.goTo('river'); step(rig, 0.4);
rig.goTo('forest', true);
equal(rig.position, views.forest.position, 'Ograniczenie animacji ustawia od razu wybrany kadr');
equal(rig.target, views.forest.target, 'Ograniczenie animacji ustawia kierunek patrzenia');
equal(rig.velocity, [0, 0, 0], 'Ograniczenie animacji usuwa pozostałą prędkość');
equal(rig.targetVelocity, [0, 0, 0], 'Ograniczenie animacji usuwa pozostały obrót');
const stillCamera = cameraStub();
rig.apply(stillCamera, true);
const still = { position: [...stillCamera.position.value], target: [...stillCamera.aim] };
step(rig, 20, 60, true);
rig.apply(stillCamera, true);
equal(stillCamera.position.value, still.position, 'Ograniczenie animacji wyłącza także kołysanie postoju');
equal(stillCamera.aim, still.target, 'Kadr nie obraca się bezczynnie przy ograniczeniu animacji');
check(stillCamera.updated, 'Kamera otrzymuje aktualne macierze');

const invalid = new MenuCamera(views);
invalid.goTo('mountains'); step(invalid, 0.5);
const beforeInvalid = state(invalid);
for (const dt of [NaN, Infinity, -Infinity, undefined, -1, 0]) invalid.update(dt);
for (const key of ['position', 'target', 'velocity', 'targetVelocity']) {
    near(invalid[key], beforeInvalid[key], `${key}: nieprawidłowy czas nie przesuwa kamery`);
}
equal(invalid.clock, beforeInvalid.clock, 'Nieprawidłowy czas nie przesuwa zegara kołysania');
const longFrame = new MenuCamera(views), boundedFrame = new MenuCamera(views);
longFrame.goTo('mountains'); boundedFrame.goTo('mountains');
longFrame.update(60); boundedFrame.update(0.1);
equal(state(longFrame), state(boundedFrame), 'Powrót po długiej przerwie nie nadrabia całego przejazdu');

const normal = cameraStub();
const idle = new MenuCamera(views); step(idle, 5); idle.apply(normal);
check(Math.abs(normal.position.value[1] - views.home.position[1]) <= 0.18,
    'Zwykłe kołysanie pozostaje subtelne');
equal([normal.position.value[0], normal.position.value[2]], [views.home.position[0], views.home.position[2]],
    'Spoczynek nie oddala kamery od miejsca głównego');

// Ograniczenia sceny nie zapisują niższej jakości do preferencji gracza.
const values = { viewDistance: 384, farTerrain: 8192, farDetail: 3,
    loadBudget: 16, fov: 110, shadows: 3, potato: false, volumeMusic: 45 };
const originalValues = { ...values };
const userSettings = { get: key => values[key], set() { throw Error('Menu zmienia ustawienia gracza'); } };
const desktopSettings = menuSettings(userSettings), mobileSettings = menuSettings(userSettings, true);
for (const [key, expected] of Object.entries({ viewDistance: 64, farTerrain: 2048, farDetail: 2, loadBudget: 4, fov: 58 })) {
    equal(desktopSettings.get(key), expected, `Limit sceny komputerowej: ${key}`);
}
equal(mobileSettings.get('viewDistance'), 48, 'Mniejszy zasięg pełnych bloków na telefonie');
equal(mobileSettings.get('farTerrain'), 1024, 'Mniejszy horyzont na telefonie');
for (const key of ['shadows', 'potato', 'volumeMusic']) {
    equal(desktopSettings.get(key), values[key], `Scena respektuje ustawienie ${key}`);
}
equal(values, originalValues, 'Odczyty sceny nie zmieniają preferencji');
values.viewDistance = 24; values.farTerrain = 0; values.farDetail = 1;
values.loadBudget = 1; values.potato = true; values.shadows = 0;
for (const key of ['viewDistance', 'farTerrain', 'farDetail', 'loadBudget', 'potato', 'shadows']) {
    equal(desktopSettings.get(key), values[key], `Zmiana ${key} jest widoczna bez tworzenia nowej sceny`);
}
check(!('set' in desktopSettings), 'Scena ma wyłącznie odczyt ustawień');

// Kontrolowany atlas i świat pozwalają sprawdzić anulowanie startu bez GPU.
const hook = registerHooks({
    resolve(specifier, context, next) {
        if (context.parentURL?.includes('/src/menu/MenuBackdrop.js')) {
            if (specifier === 'three') return { url: 'test:menu-three', shortCircuit: true };
            if (specifier.endsWith('/TextureAtlas.js')) return { url: 'test:menu-atlas', shortCircuit: true };
            if (specifier.endsWith('/MenuWorld.js')) return { url: 'test:menu-world', shortCircuit: true };
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        const sources = {
            'test:menu-three': `export class PerspectiveCamera {
                constructor(fov, aspect) { this.fov=fov; this.aspect=aspect;
                    this.position={x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z});},toArray(){return [this.x,this.y,this.z];}}; }
                lookAt() {} updateMatrixWorld() {} updateProjectionMatrix() { this.resized=true; }
            }`,
            'test:menu-atlas': `export const atlasReady={then(resolve,reject){return globalThis.menuFixture.atlas.then(resolve,reject);}};`,
            'test:menu-world': `export class MenuWorld {
                constructor(renderer, settings, spec, camera) {
                    this.fixture=globalThis.menuFixture; this.fixture.worlds.push(this);
                    this.settings=settings; this.camera=camera; this.ready=false; this.error=null;
                    this.updates=0;this.renders=0;this.disposals=0;this.settingsApplied=0;
                }
                update() { this.updates++; if(this.fixture.throwFrame) throw Error('Błąd klatki'); }
                render() { this.renders++; }
                applySettings() { this.settingsApplied++; }
                resize() { this.resized=true; }
                dispose() { this.disposals++; }
                stats() { return {updates:this.updates}; }
            }`
        };
        return url in sources ? { source: sources[url], format: 'module', shortCircuit: true } : next(url, context);
    }
});
const { MenuBackdrop } = await import('../src/menu/MenuBackdrop.js');
hook.deregister();
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
const motionListeners = new Set();
const media = { matches: false, addEventListener: (_, cb) => motionListeners.add(cb),
    removeEventListener: (_, cb) => motionListeners.delete(cb) };
globalThis.window = { matchMedia: () => media };
globalThis.document = { hidden: false, body: { dataset: {} } };
function fixture(atlas = Promise.resolve()) {
    globalThis.menuFixture = { atlas, worlds: [] };
    return globalThis.menuFixture;
}
let currentFixture = fixture();
const live = new MenuBackdrop({}, userSettings);
await live.start(); await live.start();
equal(currentFixture.worlds.length, 1, 'Wielokrotne start nie tworzy równoległych światów');
const liveWorld = live.world;
liveWorld.ready = true; live.update(1 / 60);
equal(document.body.dataset.menuBackdrop, 'ready', 'Gotowa scena odsłania tło');
equal([liveWorld.updates, liveWorld.renders], [1, 1], 'Aktywne menu aktualizuje i rysuje świat');
document.hidden = true; live.update(1 / 60);
equal([liveWorld.updates, liveWorld.renders], [1, 1], 'Ukryta aplikacja nie generuje i nie rysuje sceny');
document.hidden = false;
live.applySettings(); equal(liveWorld.settingsApplied, 1, 'Zmiana ustawień dochodzi do istniejącej sceny');
live.resize(800, 400); equal(live.camera.aspect, 2, 'Zmiana okna zachowuje proporcje kadru');
live.stop(); live.stop(); live.update(1 / 60); live.applySettings();
equal(liveWorld.disposals, 1, 'Stop zwalnia świat dokładnie raz');
equal([liveWorld.updates, liveWorld.renders], [1, 1], 'Zwolniona scena nie pracuje podczas gry');
equal(live.world, null, 'Po stop brak referencji do świata menu');
equal(document.body.dataset.menuBackdrop, 'off', 'Stop ukrywa warstwę menu');
await live.start(); equal(currentFixture.worlds.length, 2, 'Powrót z gry tworzy nowy świat menu');
live.dispose(); equal(motionListeners.size, 0, 'Dispose usuwa listener preferencji animacji');

const delayed = deferred(); currentFixture = fixture(delayed.promise);
const cancelled = new MenuBackdrop({}, userSettings);
const oldStart = cancelled.start(); cancelled.stop();
delayed.resolve(); await oldStart;
equal(currentFixture.worlds.length, 0, 'Start gry przed atlasem nie tworzy spóźnionej sceny menu');
check(!cancelled.pending && !cancelled.active, 'Anulowany start pozostaje nieaktywny');
cancelled.dispose();

const sharedAtlas = deferred(); currentFixture = fixture(sharedAtlas.promise);
const redirected = new MenuBackdrop({}, userSettings);
const staleStart = redirected.start(); redirected.stop();
redirected.setView('forest'); const newestStart = redirected.start();
sharedAtlas.resolve(); await Promise.all([staleStart, newestStart]);
equal(currentFixture.worlds.length, 1, 'Start–stop–start tworzy wyłącznie najnowszą scenę');
equal(redirected.rig.view, 'forest', 'Kliknięcie zakładki podczas ładowania zostaje zachowane');
check(redirected.active && !redirected.pending, 'Stary start nie nadpisuje stanu najnowszego');
redirected.dispose();

const lateError = deferred(); currentFixture = fixture(lateError.promise);
const abandoned = new MenuBackdrop({}, userSettings);
const abandonedStart = abandoned.start(); abandoned.stop();
lateError.reject(Error('Atlas odrzucony po wejściu do gry')); await abandonedStart;
check(!abandoned.failed, 'Spóźniony błąd anulowanego startu nie zmienia działającej aplikacji');
equal(document.body.dataset.menuBackdrop, 'off', 'Spóźniony błąd nie przywraca nakładki menu');
abandoned.dispose();

currentFixture = fixture();
const broken = new MenuBackdrop({}, userSettings);
await broken.start(); const brokenWorld = broken.world;
const originalWarn = console.warn;
console.warn = () => {};
try {
    currentFixture.throwFrame = true; broken.update(1 / 60);
} finally { console.warn = originalWarn; }
check(broken.failed && !broken.active, 'Błąd rysowania przełącza scenę na statyczny wariant');
equal(brokenWorld.disposals, 1, 'Błąd rysowania zwalnia świat i jego zasoby');
equal(document.body.dataset.menuBackdrop, 'failed', 'Menu zachowuje widoczny wariant awaryjny');
await broken.start(); equal(currentFixture.worlds.length, 1, 'Błąd nie uruchamia pętli nowych światów');
broken.dispose();

// Asynchronizacja warmupu zapisuje błąd w świecie zamiast rzucać go
// z klatki. Również ta ścieżka musi odsłonić działające, statyczne menu.
currentFixture = fixture();
const warmupFailure = new MenuBackdrop({}, userSettings);
await warmupFailure.start(); const failedWarmupWorld = warmupFailure.world;
failedWarmupWorld.error = Error('Shader wody nie został przygotowany');
console.warn = () => {};
try { warmupFailure.update(1 / 60); }
finally { console.warn = originalWarn; }
check(warmupFailure.failed && warmupFailure.world === null,
    'Błąd asynchronicznego warmupu nie pozostawia menu w wiecznym ładowaniu');
equal(failedWarmupWorld.disposals, 1, 'Błąd warmupu zwalnia utworzoną scenę');
equal(failedWarmupWorld.renders, 0, 'Scena z błędnym shaderem nie jest rysowana');
equal(document.body.dataset.menuBackdrop, 'failed', 'Błąd warmupu włącza statyczne menu');
warmupFailure.dispose();

// Preferencja gry ma pierwszeństwo przed systemem tylko w trybach
// wymuszonych. Sprawdzamy rzeczywisty przejazd, nie sam getter.
for (const osReduced of [false, true]) {
    for (const mode of ['auto', 'full', 'off']) {
        fixture(); media.matches = osReduced; values.menuMotion = mode;
        const motionMenu = new MenuBackdrop({}, userSettings);
        await motionMenu.start();
        const expectedReduced = mode === 'off' || (mode === 'auto' && osReduced);
        const label = `${mode}, system ${osReduced ? 'ograniczony' : 'zwykły'}`;
        equal(motionMenu.reducedMotion, expectedReduced, `${label}: właściwy wybór animacji`);
        equal(motionMenu.stats().reducedMotion, expectedReduced, `${label}: diagnostyka pokazuje aktywny tryb`);
        motionMenu.setView('river');
        if (expectedReduced) {
            equal(motionMenu.rig.position, MENU_SCENE.views.river.position, `${label}: zakładka bez przejazdu`);
            motionMenu.update(1 / 60);
            const position = motionMenu.camera.position.toArray();
            for (let frame = 0; frame < 60; frame++) motionMenu.update(1 / 60);
            equal(motionMenu.camera.position.toArray(), position, `${label}: wyłączone kołysanie postoju`);
        } else {
            equal(motionMenu.rig.position, MENU_SCENE.views.home.position, `${label}: zmiana zakładki zachowuje początek`);
            motionMenu.update(1 / 60);
            check(motionMenu.rig.velocity.some(value => Math.abs(value) > 0), `${label}: kamera rozpoczyna lot`);
        }
        motionMenu.dispose();
    }
}

fixture(); media.matches = true; values.menuMotion = 'full';
const toggledMotion = new MenuBackdrop({}, userSettings);
await toggledMotion.start(); toggledMotion.setView('river'); toggledMotion.update(0.1);
const beforeMotionChange = state(toggledMotion.rig);
for (const callback of motionListeners) callback();
equal(state(toggledMotion.rig), beforeMotionChange, 'Pełne animacje ignorują zmianę systemową bez utraty prędkości');
values.menuMotion = 'auto'; toggledMotion.applySettings();
equal(toggledMotion.rig.position, MENU_SCENE.views.river.position, 'Auto z ograniczeniem systemowym zatrzymuje lot w wybranym kadrze');
equal(toggledMotion.rig.velocity, [0, 0, 0], 'Włączenie auto z ograniczeniem usuwa prędkość przejazdu');
media.matches = false;
for (const callback of motionListeners) callback();
toggledMotion.setView('forest'); toggledMotion.update(0.1);
check(!toggledMotion.reducedMotion && toggledMotion.rig.velocity.some(value => value !== 0),
    'Auto reaguje na wyłączenie ograniczenia systemowego i przywraca przejazdy');
values.menuMotion = 'off'; toggledMotion.applySettings();
equal(toggledMotion.rig.position, MENU_SCENE.views.forest.position, 'Wyłączenie animacji działa natychmiast również bez ograniczenia systemowego');
equal(toggledMotion.rig.targetVelocity, [0, 0, 0], 'Wyłączenie animacji usuwa również prędkość obrotu');
values.menuMotion = 'full'; toggledMotion.applySettings();
toggledMotion.setView('mountains'); toggledMotion.update(0.1);
check(toggledMotion.rig.velocity.some(value => value !== 0), 'Powrót z off do full przywraca lot do kolejnej zakładki');
values.menuMotion = 'auto'; toggledMotion.applySettings();
media.matches = true;
for (const callback of motionListeners) callback();
equal(toggledMotion.rig.position, MENU_SCENE.views.mountains.position, 'Auto reaguje na włączenie systemowego ograniczenia podczas lotu');
toggledMotion.dispose();
equal(motionListeners.size, 0, 'Zmiany trybów nie pozostawiają listenerów po zamknięciu menu');
delete values.menuMotion; media.matches = false;

// Prawdziwy MenuWorld z lekkimi zasobami zamiast WebGL/Worker. Sprawdzamy
// zwalnianie częściowej konstrukcji i wyścig przygotowania wariantów wody.
const resourceSource = `
    class Resource {
        constructor() {
            const f=globalThis.menuResources;
            if(f.throwAt===this.constructor.name) throw Error('Inicjalizacja '+this.constructor.name);
            this.disposals=0; f.resources.push(this);
        }
        dispose(){this.disposals++;}
    }
    export class Color {copy(){return this;}multiplyScalar(){return this;}setRGB(){return this;}}
    export class Scene extends Resource {clear(){this.disposals++;}}
    export class Fog {constructor(){this.color=new Color();}}
    export class World extends Resource {
        constructor(){super();this.generator={type:'realistic'};}
        setExperiments(){} remeshAll(){}
    }
    export class Sky extends Resource {constructor(){super();this.state={};}attachLights(){}setLowDetail(){}update(){}}
    export class FarTerrain extends Resource {constructor(){super();this.scene={};}setDetail(){}}
    export class SunShadows extends Resource {setQuality(){}markChunk(){}}
    export class LightShafts extends Resource {}
    export const usesSolarAtmosphere=()=>true, lightToBrightness=x=>x, atmosphericLightToBrightness=x=>x;
    export const setAmbientOcclusion=()=>{},setFastLeaves=()=>{},setPotatoDefine=()=>{},setLeafMaterialFast=()=>{},setShadowDefine=()=>{},setFarTerrainShadows=()=>{};
    export const blockMaterial={},plantMaterial={},waterMaterial={},leafMaterial={};
    export const skyUniforms={},shadowUniforms={};
    export const viewUniforms=Object.fromEntries(['uBrightness','uUnderwater','uCurvature','uGlobe'].map(k=>[k,{value:0}]));
    export const dynamicLightUniforms={uDynamicEnabled:{value:0}},bounceUniforms={uBounceColor:{value:new Color()}},campfireLightUniforms={uFirePowers:{value:[0,0,0,0]}};
    export const CHUNK_SIZE=16,POTATO_VIEW_DISTANCE=24,SHAFT_BRIGHTNESS=1,SHAFT_DENSITY_OUTSIDE=1,SHAFT_DENSITY_INSIDE=1,SHAFT_FAR_REACH=800;
    export const waterShaderVariantKey=()=>globalThis.menuResources.variant;
    export function prewarmWaterMaterial(){
        const item=globalThis.menuResources.warms.shift();
        if(item instanceof Error) throw item;
        return item;
    }
`;
const worldHook = registerHooks({
    resolve(specifier, context, next) {
        if (context.parentURL?.includes('/src/menu/MenuWorld.js')) {
            return { url: 'test:menu-resources', shortCircuit: true };
        }
        return next(specifier, context);
    },
    load(url, context, next) {
        return url === 'test:menu-resources'
            ? { source: resourceSource, format: 'module', shortCircuit: true } : next(url, context);
    }
});
const { MenuWorld } = await import('../src/menu/MenuWorld.js');
worldHook.deregister();
function resources(overrides = {}) {
    globalThis.menuResources = { resources: [], variant: 'initial', warms: [Promise.resolve()], ...overrides };
    return globalThis.menuResources;
}
const worldSettings = { get: key => ({ viewDistance: 48, farDetail: 2, potato: false,
    bushyGrass: false, shadows: 3, ambientOcclusion: 45, fancyLeaves: true, brightness: 0 })[key] };
const worldRenderer = { getPixelRatio: () => 1 };
const worldCamera = { updateProjectionMatrix() {} };
const makeWorld = () => new MenuWorld(worldRenderer, worldSettings,
    { seed: 42, terrain: 'realistic', time: 0.5 }, worldCamera);
let allocated = resources({ throwAt: 'SunShadows' });
assert.throws(makeWorld, /Inicjalizacja SunShadows/); checks++;
equal(allocated.resources.map(item => item.constructor.name), ['Scene', 'World', 'Sky', 'FarTerrain'],
    'Błąd występuje po uruchomieniu świata i horyzontu');
check(allocated.resources.every(item => item.disposals === 1),
    'Częściowo utworzona scena zwalnia wszystkie wcześniejsze zasoby, w tym horyzont');

const olderWarm = deferred(), newerWarm = deferred();
allocated = resources({ warms: [olderWarm.promise, newerWarm.promise] });
const variants = makeWorld();
check(!variants.warmed, 'Scena czeka na pierwszy wariant wody');
allocated.variant = 'changed'; variants.warmWater();
const latestWarmup = variants.warmup;
olderWarm.resolve(); await Promise.resolve(); await Promise.resolve();
check(!variants.warmed, 'Stary warmup nie oznacza nowego wariantu jako gotowego');
newerWarm.resolve(); await latestWarmup;
check(variants.warmed, 'Dopiero bieżący wariant odblokowuje gotowość');
const thirdWarm = deferred(); allocated.warms.push(thirdWarm.promise);
allocated.variant = 'third'; variants.warmWater();
check(!variants.warmed, 'Zmiana już gotowego wariantu resetuje stan przygotowania');
thirdWarm.resolve(); await variants.warmup;
check(variants.warmed, 'Kolejna zmiana wariantu również kończy przygotowanie');
variants.dispose(); variants.dispose();
check(allocated.resources.every(item => item.disposals === 1), 'Pełna scena zwalnia zasoby dokładnie raz');

const oldReject = deferred(), currentWarm = deferred();
allocated = resources({ warms: [oldReject.promise, currentWarm.promise] });
const rejectedOld = makeWorld();
allocated.variant = 'newest'; rejectedOld.warmWater();
const currentTask = rejectedOld.warmup;
oldReject.reject(Error('Nieaktualny wariant')); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
equal(rejectedOld.error, null, 'Błąd starego wariantu nie wyłącza nowego');
currentWarm.resolve(); await currentTask;
check(rejectedOld.warmed && rejectedOld.error === null, 'Nowszy wariant kończy się poprawnie po błędzie starszego');
rejectedOld.dispose();

const afterStop = deferred();
allocated = resources({ warms: [afterStop.promise] });
const stoppedWarmup = makeWorld(); const stoppedTask = stoppedWarmup.warmup;
stoppedWarmup.dispose(); afterStop.resolve(); await stoppedTask;
check(!stoppedWarmup.warmed && stoppedWarmup.disposed, 'Zakończenie warmupu nie ożywia zwolnionej sceny');
allocated = resources({ warms: [Error('Synchroniczny błąd compileAsync')] });
const synchronousFailure = makeWorld();
check(synchronousFailure.error?.message.includes('Synchroniczny'),
    'Synchroniczny błąd przygotowania wody trafia do tej samej ścieżki awaryjnej');
synchronousFailure.dispose();
check(allocated.resources.every(item => item.disposals === 1), 'Po synchronicznym błędzie można zwolnić całą scenę');

// Błąd w środku renderowania mapy cieni nie może zostawić aktywnego
// FBO należącego do menu: fallback zwolni go przed startem Game.
allocated = resources();
const interruptedRender = makeWorld();
const previousTarget = { name: 'cel sprzed klatki' };
const menuTarget = { name: 'mapa cieni menu' };
let renderTarget = previousTarget;
interruptedRender.renderer = { autoClear: true, info: { reset() {} },
    getRenderTarget: () => renderTarget, setRenderTarget: target => { renderTarget = target; } };
interruptedRender.shadows.render = () => {
    interruptedRender.renderer.setRenderTarget(menuTarget);
    throw Error('Przerwane rysowanie mapy cieni');
};
assert.throws(() => interruptedRender.render(), /Przerwane rysowanie/); checks++;
equal(renderTarget, previousTarget, 'Przerwana klatka przywraca poprzedni framebuffer przed fallbackiem');
equal(interruptedRender.renderer.autoClear, true, 'Przerwana klatka przywraca również autoClear');
interruptedRender.dispose();
check(allocated.resources.every(item => item.disposals === 1), 'Po przerwaniu renderowania można zwolnić wszystkie zasoby menu');

console.log(`OK: kamera i scena menu — ${checks} sprawdzeń przejazdów, ustawień i cyklu życia.`);
