// Ruch kamery menu: przekierowanie w trakcie lotu, powrót i dostępność.
// Bez przeglądarki, WebGL i zmian zapisów świata.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
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
for (const [key, expected] of Object.entries({ viewDistance: 256, farTerrain: 1024, farDetail: 2, loadBudget: 12, fov: 58 })) {
    equal(desktopSettings.get(key), expected, `Limit sceny komputerowej: ${key}`);
}
equal(mobileSettings.get('viewDistance'), 128, 'Mniejszy zasięg pełnych bloków na telefonie');
equal(mobileSettings.get('farTerrain'), 768, 'Mniejszy horyzont na telefonie');
equal(mobileSettings.get('loadBudget'), 6, 'Mniejszy budżet przygotowania sceny na telefonie');
for (const key of ['shadows', 'potato', 'volumeMusic']) {
    equal(desktopSettings.get(key), values[key], `Scena respektuje ustawienie ${key}`);
}
equal(values, originalValues, 'Odczyty sceny nie zmieniają preferencji');
values.viewDistance = 24; values.farTerrain = 0; values.farDetail = 1;
values.loadBudget = 1; values.potato = true; values.shadows = 0;
for (const key of ['farDetail', 'potato', 'shadows']) {
    equal(desktopSettings.get(key), values[key], `Zmiana ${key} jest widoczna bez tworzenia nowej sceny`);
}
for (const [key, expected] of Object.entries({ viewDistance: 256, farTerrain: 1024, loadBudget: 12 })) {
    equal(desktopSettings.get(key), expected, `Własny ${key} sceny nie zależy od zasięgu wybranego do gry`);
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

fixture();
const reloadingBackdrop = new MenuBackdrop({}, userSettings);
await reloadingBackdrop.start();
reloadingBackdrop.world.ready = true; reloadingBackdrop.update(1 / 60);
equal(document.body.dataset.menuBackdrop, 'ready', 'Gotowość odsłania tło menu');
reloadingBackdrop.world.ready = false; reloadingBackdrop.update(1 / 60);
equal(document.body.dataset.menuBackdrop, 'loading', 'Ponowne przygotowanie sceny przywraca osłonę ładowania');
reloadingBackdrop.dispose();

// Prawdziwy MenuWorld z lekkimi zasobami zamiast WebGL/Worker. Sprawdzamy
// zwalnianie częściowej konstrukcji i wyścig przygotowania wariantów wody.
const THREE = await import('../lib/three/three.module.js');
const resourceSource = `
    import { Color, Vector3, Box3, Frustum, Matrix4 } from ${JSON.stringify(new URL('../lib/three/three.module.js', import.meta.url).href)};
    export { Color, Vector3, Frustum, Matrix4 };
    class Resource {
        constructor() {
            const f=globalThis.menuResources;
            if(f.throwAt===this.constructor.name) throw Error('Inicjalizacja '+this.constructor.name);
            this.fixture=f; this.disposals=0; f.resources.push(this);
        }
        dispose(){this.disposals++;}
    }
    export class Scene extends Resource {clear(){this.disposals++;}}
    export class Fog {constructor(){this.color=new Color();}}
    export class World extends Resource {
        constructor(){
            super();this.generator={type:'realistic',baseHeight:64};
            this.chunks=new Map();this.dirtyChunks=new Set();this.loadQueue=[];
            this.loadRadius=-1;this.centerCx=0;this.centerCz=0;
            this.shadowScene={children:[]};this.meshVersion=0;
            this.centerCalls=[];this.centerChanges=0;this.generated=0;this.meshCalls=0;
        }
        setExperiments(){}
        remeshAll(){for(const chunk of this.chunks.values())this.dirtyChunks.add(chunk);}
        setCenter(x,z,radius){
            this.centerCalls.push([x,z,radius]);
            const cx=Math.floor(x/16),cz=Math.floor(z/16);
            if(cx===this.centerCx&&cz===this.centerCz&&radius===this.loadRadius)return;
            this.centerCx=cx;this.centerCz=cz;this.loadRadius=radius;this.centerChanges++;
            this.loadQueue=this.fixture.chunkPlan.map(([dx,dz])=>[cx+dx,cz+dz,dx*dx+dz*dz])
                .filter(([x,z])=>!this.chunks.has(x+','+z));
        }
        generateChunk(cx,cz){
            if(this.fixture.throwGenerate)throw Error('Błąd generowania');
            const key=cx+','+cz;if(this.chunks.has(key))return;
            const chunk={cx,cz,mesh:null};this.chunks.set(key,chunk);this.dirtyChunks.add(chunk);
            this.generated++;this.fixture.clock+=this.fixture.generateCost;
        }
        updateMeshes(deadline=Infinity){
            this.meshCalls++;
            this.fixture.meshWhileLoading ||= this.loadQueue.length>0;
            if(this.fixture.holdMeshing)return;
            for(const chunk of this.dirtyChunks){
                const geometry={boundingBox:null,computeBoundingBox(){
                    this.boundingBox=new Box3(new Vector3(0,0,0),new Vector3(16,16,16));
                }};
                if(!chunk.mesh)this.shadowScene.children.push(chunk);
                chunk.mesh={geometry,position:new Vector3(chunk.cx*16,0,chunk.cz*16),visible:true};
                this.meshVersion++;this.dirtyChunks.delete(chunk);this.onMeshChanged?.(chunk);
                this.fixture.clock+=this.fixture.meshCost;
                if(performance.now()>=deadline)break;
            }
        }
        completeRadius(){return this.loadQueue.length?0:Infinity;}
        getLight(){return {sky:1};}
        dispose(){super.dispose();this.chunks.clear();this.dirtyChunks.clear();this.loadQueue=[];}
    }
    export class Sky extends Resource {
        constructor(){super();this.state={horizon:new Color(),sunLightColor:new Color(),moonLightColor:new Color(),
            sunLightIntensity:1,moonLightIntensity:0,ambientColor:new Color(),ambientIntensity:1};
            this.sunLightDirection=new Vector3(0,1,0);this.celestial={moonDirection:new Vector3(0,-1,0)};}
        attachLights(){}setLowDetail(){}update(){}applyShadowContrast(){}
        render(){this.fixture.draws.sky++;}
    }
    export class FarTerrain extends Resource {
        constructor(){super();this.scene={};this.active=false;this.positions=[];}
        setDetail(...args){this.detail=args;}
        setRange(inner,outer){this.inner=inner;this.outer=outer;this.active=outer>inner;}
        update(position){this.positions.push(position.toArray());}
        stats(){return {wanted:this.fixture.farWanted,missing:this.fixture.farMissing};}
        render(){this.fixture.draws.far++;}
    }
    export class SunShadows extends Resource {
        setNaturalLighting(enabled){this.naturalLighting=enabled;}
        setQuality(quality){this.enabled=quality>0;this.hasFar=quality===3;}
        markChunk(){}update(){}render(){this.fixture.draws.shadows++;}
    }
    export class LightShafts extends Resource {}
    export class BounceLight extends Resource {
        markChunk(){}update(world,center,options){this.enabled=options.enabled;}
        bind(){this.fixture.bounceBinds=(this.fixture.bounceBinds??0)+1;}
        stats(){return {enabled:!!this.enabled,pendingJobs:0};}
    }
    export const usesSolarAtmosphere=()=>true, lightToBrightness=x=>x, atmosphericLightToBrightness=x=>x;
    export const updateAerialPerspective=()=>{}; // Stan atmosfery ma osobne testy integracyjne.
    export const setAmbientOcclusion=()=>{},setFastLeaves=()=>{},setPotatoDefine=()=>{},setLeafMaterialFast=()=>{},setShadowDefine=()=>{},setFarTerrainShadows=()=>{};
    export const blockMaterial={},plantMaterial={},waterMaterial={},leafMaterial={};
    export const skyUniforms={uFogBrightness:{value:1}},shadowUniforms={uSunShadowInfo:{value:{w:0}}};
    export const viewUniforms=Object.fromEntries(['uBrightness','uUnderwater','uCurvature','uGlobe','uFarTextureBlend','uFarEnabled','uFarInner','uFarOuter','uTime'].map(k=>[k,{value:0}]));
    export const dynamicLightUniforms={uDynamicEnabled:{value:0}},bounceUniforms={uBounceColor:{value:new Color()}},campfireLightUniforms={uFirePowers:{value:[0,0,0,0]}};
    export const CHUNK_SIZE=16,POTATO_VIEW_DISTANCE=24,SHAFT_BRIGHTNESS=1,SHAFT_DENSITY_OUTSIDE=1,SHAFT_DENSITY_INSIDE=1,SHAFT_FAR_REACH=800;
    export const waterShaderVariantKey=target=>globalThis.menuResources.variant+(target?':linear':':screen');
    export function prewarmWaterMaterial(renderer,scene,camera,asynchronous,target){
        globalThis.menuResources.warmTargets.push(target);
        const item=globalThis.menuResources.warms.shift();
        if(item instanceof Error) throw item;
        return item;
    }
`;
const worldHook = registerHooks({
    resolve(specifier, context, next) {
        if (context.parentURL?.includes('/src/menu/MenuWorld.js')) {
            if (specifier.endsWith('/menuScene.js') || specifier.endsWith('/WorldOutput.js') ||
                specifier.endsWith('/LightingDiagnostics.js') || specifier.endsWith('/MaterialLighting.js')) return next(specifier, context);
            return { url: 'test:menu-resources', shortCircuit: true };
        }
        if(specifier==='three') return next(new URL('../lib/three/three.module.js',import.meta.url).href,context);
        return next(specifier, context);
    },
    load(url, context, next) {
        return url === 'test:menu-resources'
            ? { source: resourceSource, format: 'module', shortCircuit: true } : next(url, context);
    }
});
const { MenuWorld } = await import('../src/menu/MenuWorld.js');
const { viewUniforms: testedViewUniforms } = await import('test:menu-resources');
worldHook.deregister();
function resources(overrides = {}) {
    globalThis.menuResources = { resources: [], variant: 'initial', warms: [Promise.resolve()], warmTargets: [], outputDraws: 0,
        chunkPlan: [[0, 0], [1, 0], [0, 1]], farWanted: 3, farMissing: 0,
        clock: 0, generateCost: 0, meshCost: 0, meshWhileLoading: false,
        draws: { sky: 0, far: 0, shadows: 0, world: 0 }, ...overrides };
    return globalThis.menuResources;
}
const worldSettings = { get: key => ({ viewDistance: 48, farTerrain: 192, farDetail: 2, potato: false,
    loadBudget: 4, bushyGrass: false, shadows: 3, lightShafts: false,
    ambientOcclusion: 45, fancyLeaves: true, brightness: 0, lightingLook: 'baseline', cloudCover: 0,
    lightingMaterials:'standard',surfaceBounce:true,leafTransmission:true,materialSpecular:true,
    bounceLight:false,bounceStrength:18,bounceSaturation:65 })[key] };
function makeWorld({ settings = worldSettings, spec = { ...MENU_SCENE, seed: 42 }, camera } = {}) {
    const fixture = globalThis.menuResources;
    const renderer = { getPixelRatio: () => 1, autoClear: true, info: { reset() {} },
        capabilities: { isWebGL2: true }, extensions: { has: () => true },
        getDrawingBufferSize: size => size.set(1280, 720),
        target: null, getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; },
        clear() {}, clearDepth() {}, render(scene) {
            if(scene.children?.[0]?.material?.name==='WorldOutput') {
                fixture.outputDraws++;
                if(fixture.throwOutput)throw Error('Błąd prezentacji HDR');
            } else {
                fixture.draws.world++;
                if(fixture.throwWorld)throw Error('Błąd rysowania świata HDR');
            }
        } };
    if (!camera) {
        camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 256);
        camera.position.fromArray(MENU_SCENE.views.home.position);
        camera.lookAt(...MENU_SCENE.views.home.target); camera.updateMatrixWorld();
    }
    return new MenuWorld(renderer, settings, spec, camera);
}
function controlledTime(fixture, callback) {
    const original = globalThis.performance;
    globalThis.performance = { now: () => fixture.clock };
    try { return callback(); }
    finally { globalThis.performance = original; }
}
const nothingDrawn = fixture => Object.values(fixture.draws).every(count => count === 0);
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

// Puste kolejki nie wystarczają: świat musi zawierać dane i mieć gotowe
// meshe, wodę oraz cały zaplanowany horyzont. Żaden etap nie rysuje LOD
// w zastępstwie jeszcze niewczytanego bliskiego terenu.
allocated = resources({ holdMeshing: true, farWanted: 0 });
const preparing = makeWorld();
preparing.render();
check(!preparing.ready && nothingDrawn(allocated), 'Nowo utworzona scena nie rysuje pustego świata');
await preparing.warmup;
controlledTime(allocated, () => preparing.update(1 / 60));
equal(preparing.world.loadQueue.length, 0, 'Pierwszy etap przygotował wszystkie dane chunków');
equal(preparing.world.completeRadius(), Infinity, 'Próba odtwarza Infinity pomimo niegotowej geometrii');
check(preparing.world.dirtyChunks.size > 0 && !preparing.ready, 'Brudne chunki blokują gotowość przy pustej kolejce danych');
preparing.render();
check(nothingDrawn(allocated), 'Niegotowe meshe blokują wszystkie przebiegi renderera');
allocated.holdMeshing = false;
controlledTime(allocated, () => preparing.update(1 / 60));
equal(preparing.world.dirtyChunks.size, 0, 'Drugi etap zbudował geometrię');
check(!preparing.ready, 'Aktywny horyzont bez zaplanowanych kafli nie jest gotowy');
allocated.farWanted = 3; allocated.farMissing = 1;
controlledTime(allocated, () => preparing.update(1 / 60)); preparing.render();
check(!preparing.ready && nothingDrawn(allocated), 'Brakujący kafel horyzontu wciąż blokuje odsłonięcie i render');
allocated.farMissing = 0;
controlledTime(allocated, () => preparing.update(1 / 60));
check(preparing.ready, 'Dane, meshe, shader i pełny horyzont odblokowują gotową scenę');
preparing.render();
equal(allocated.draws, { sky: 1, far: 1, shadows: 1, world: 1 }, 'Dopiero gotowa scena wykonuje komplet przebiegów renderera');
equal(testedViewUniforms.uFarTextureBlend.value, 0, 'Scena zachowuje tekstury pełnych bloków w oddali');

const chunkKeys = [...preparing.world.chunks.keys()].sort();
const meshVersion = preparing.world.meshVersion;
const initialRegion = preparing.world.centerCalls[0];
for (const name of ['river', 'forest', 'mountains', 'home']) {
    const view = MENU_SCENE.views[name];
    preparing.camera.position.fromArray(view.position);
    preparing.camera.lookAt(...view.target); preparing.camera.updateMatrixWorld();
    controlledTime(allocated, () => preparing.update(1 / 60)); preparing.render();
    equal([...preparing.world.chunks.keys()].sort(), chunkKeys, `${name}: przejazd zachowuje wczytany zestaw chunków`);
    equal(preparing.world.loadQueue.length, 0, `${name}: zmiana kadru nie rozpoczyna streamingu`);
    equal(preparing.world.meshVersion, meshVersion, `${name}: przejazd nie przebudowuje geometrii`);
}
check(preparing.world.centerCalls.every(value => value.every((n, i) => n === initialRegion[i])),
    'Każdy kadr używa tego samego centrum i promienia pełnego terenu');
equal(preparing.world.centerChanges, 1, 'Obszar wczytywania zostaje wybrany tylko raz');
check(preparing.farTerrain.positions.every(p => p[0] === initialRegion[0] && p[2] === initialRegion[1]),
    'Horyzont również pozostaje zakotwiczony podczas przejazdów');

// Rzeczywista matematyka Three sprawdza obwiednię i culling, bez GPU.
const boundedChunk = preparing.world.chunks.values().next().value;
equal(boundedChunk.mesh.geometry.boundingBox.min.toArray(), [0, 0, 0], 'Obwiednia menu nie zmienia lokalnej geometrii');
equal(boundedChunk.menuBounds.min.toArray(), [boundedChunk.cx * 16 - 3, -3, boundedChunk.cz * 16 - 3],
    'Obwiednia ma margines na wiatr i pozycję chunka w świecie');
equal(boundedChunk.menuBounds.max.toArray(), [boundedChunk.cx * 16 + 19, 19, boundedChunk.cz * 16 + 19],
    'Margines chroni również górną i dalszą krawędź geometrii');
const centerX = boundedChunk.cx * 16 + 8, centerZ = boundedChunk.cz * 16 + 8;
preparing.camera.position.set(centerX, 8, centerZ + 40);
preparing.camera.lookAt(centerX, 8, centerZ); preparing.camera.updateMatrixWorld(); preparing.render();
check(boundedChunk.mesh.visible, 'Chunk przed kamerą pozostaje widoczny');
preparing.camera.lookAt(centerX, 8, centerZ + 100); preparing.camera.updateMatrixWorld(); preparing.render();
check(!boundedChunk.mesh.visible, 'Chunk za kamerą jest pomijany na podstawie obwiedni');
const drawsBeforeStop = { ...allocated.draws }, generatedBeforeStop = preparing.world.generated;
preparing.dispose(); preparing.update(1 / 60); preparing.render();
equal(allocated.draws, drawsBeforeStop, 'Zwolniona scena nie rysuje po wyjściu do gry');
equal(preparing.world.generated, generatedBeforeStop, 'Zwolniona scena nie generuje dalszego terenu');
equal(testedViewUniforms.uFarTextureBlend.value, 1, 'Wyjście z menu przywraca politykę tekstur używaną w grze');
check(!preparing.ready, 'Dispose usuwa gotowość sceny');

allocated = resources({ chunkPlan: [] });
const emptyWorld = makeWorld(); await emptyWorld.warmup;
controlledTime(allocated, () => emptyWorld.update(1 / 60)); emptyWorld.render();
check(emptyWorld.world.loadQueue.length === 0 && emptyWorld.world.dirtyChunks.size === 0,
    'Próba pustego świata ma obie kolejki puste');
check(!emptyWorld.ready && nothingDrawn(allocated), 'Pusty świat nigdy nie udaje gotowej sceny');
emptyWorld.dispose();

const pendingShader = deferred();
allocated = resources({ warms: [pendingShader.promise] });
const shaderWait = makeWorld();
controlledTime(allocated, () => shaderWait.update(1 / 60)); shaderWait.render();
check(shaderWait.world.chunks.size > 0 && shaderWait.world.dirtyChunks.size === 0,
    'Próba opóźnionego shadera ma już całą geometrię');
check(!shaderWait.ready && nothingDrawn(allocated), 'Gotowy teren nie omija oczekiwania na shader');
pendingShader.resolve(); await shaderWait.warmup;
controlledTime(allocated, () => shaderWait.update(1 / 60));
check(shaderWait.ready, 'Zakończenie shadera odblokowuje uprzednio przygotowany teren');
const replacementShader = deferred();
allocated.warms.push(replacementShader.promise); allocated.variant = 'new-quality';
shaderWait.applySettings(); shaderWait.render();
check(!shaderWait.ready && nothingDrawn(allocated), 'Zmiana wariantu wody odbiera gotowość i blokuje przedwczesne rysowanie');
controlledTime(allocated, () => shaderWait.update(1 / 60));
check(!shaderWait.ready, 'Gotowe chunki nie omijają ponownego przygotowania shadera');
replacementShader.resolve(); await shaderWait.warmup;
controlledTime(allocated, () => shaderWait.update(1 / 60));
check(shaderWait.ready, 'Nowy wariant shadera przywraca gotowość bez ponownego generowania terenu');
equal(shaderWait.world.generated, 3, 'Zmiana shadera nie generuje ponownie istniejących chunków');
shaderWait.dispose();

allocated = resources({ farWanted: 0, farMissing: 10 });
const noHorizon = makeWorld({ settings: { get: key => key === 'farTerrain' ? 0 : worldSettings.get(key) } });
await noHorizon.warmup; controlledTime(allocated, () => noHorizon.update(1 / 60));
check(noHorizon.ready, 'Wyłączony horyzont nie wymaga kafli do gotowości');
noHorizon.dispose();

// Kontrolowany zegar odtwarza granicę budżetu bez czekania i pomiarów CPU.
allocated = resources({ generateCost: 3, meshCost: 3 });
const budgeted = makeWorld(); await budgeted.warmup;
controlledTime(allocated, () => budgeted.update(1 / 60));
equal(budgeted.world.generated, 2, 'Generowanie zatrzymuje się po przekroczeniu budżetu przez pojedynczy chunk');
equal(budgeted.world.meshCalls, 0, 'Meshe nie są budowane, dopóki brakuje danych sąsiadów');
check(!budgeted.ready && budgeted.world.loadQueue.length === 1, 'Reszta preloadu przechodzi do kolejnej klatki');
controlledTime(allocated, () => budgeted.update(1 / 60));
check(budgeted.world.loadQueue.length === 0 && budgeted.world.dirtyChunks.size > 0 && !budgeted.ready,
    'Koniec generowania nie odblokowuje sceny przed końcem meshowania');
controlledTime(allocated, () => budgeted.update(1 / 60));
check(budgeted.ready && !allocated.meshWhileLoading, 'Kolejne klatki kończą przygotowanie bez przedwczesnego meshowania');
budgeted.dispose();

allocated = resources();
let changedDistance = 48;
const resizedRegion = makeWorld({ settings: { get: key => key === 'viewDistance' ? changedDistance : worldSettings.get(key) } });
await resizedRegion.warmup; controlledTime(allocated, () => resizedRegion.update(1 / 60));
check(resizedRegion.ready, 'Początkowy obszar przed zmianą ustawień jest gotowy');
changedDistance = 96; allocated.chunkPlan.push([2, 0]); allocated.holdMeshing = true;
resizedRegion.applySettings(); controlledTime(allocated, () => resizedRegion.update(1 / 60)); resizedRegion.render();
check(!resizedRegion.ready && nothingDrawn(allocated), 'Większy obszar ponownie czeka na brakującą geometrię');
allocated.holdMeshing = false; controlledTime(allocated, () => resizedRegion.update(1 / 60));
check(resizedRegion.ready, 'Po przygotowaniu większego obszaru scena znów jest gotowa');
resizedRegion.dispose();

allocated = resources();
const fallbackCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 256);
fallbackCamera.position.set(-17, 72, 33); fallbackCamera.updateMatrixWorld();
const fallbackRegion = makeWorld({ spec: { seed: 42, terrain: 'realistic' }, camera: fallbackCamera });
equal(fallbackRegion.focus.toArray(), [-17, 0, 33], 'Scena bez listy kadrów wybiera pozycję otrzymanej kamery');
check(Number.isFinite(fallbackRegion.cameraReach), 'Zapas pojedynczego kadru pozostaje skończony');
fallbackRegion.dispose();

// Pokrycie rzeczywistych kadrów: każdy chunk przecinający widoczny
// obszar potrzebuje także ośmiu sąsiadów do policzenia ścian i światła.
// Sprawdzamy współrzędne ujemne i zaokrąglenie centrum do siatki chunków.
for (const distance of [128, 256]) {
    allocated = resources();
    const coverage = makeWorld({ settings: { get: key => key === 'viewDistance' ? distance : worldSettings.get(key) } });
    controlledTime(allocated, () => coverage.update(1 / 60));
    const world = coverage.world;
    let covered = true;
    for (const view of Object.values(MENU_SCENE.views)) {
        const [x, , z] = view.position;
        for (let cz = Math.floor((z - distance) / 16); cz <= Math.floor((z + distance) / 16); cz++) {
            for (let cx = Math.floor((x - distance) / 16); cx <= Math.floor((x + distance) / 16); cx++) {
                const dx = Math.max(cx * 16 - x, 0, x - (cx + 1) * 16);
                const dz = Math.max(cz * 16 - z, 0, z - (cz + 1) * 16);
                if (dx * dx + dz * dz > distance * distance) continue;
                for (let nz = -1; nz <= 1; nz++) for (let nx = -1; nx <= 1; nx++) {
                    covered &&= (cx + nx - world.centerCx) ** 2 + (cz + nz - world.centerCz) ** 2 <= world.loadRadius ** 2;
                }
            }
        }
    }
    check(covered, `Wszystkie kadry mają pełne ${distance} bloków terenu wraz z sąsiadami meshera`);
    coverage.dispose();
}

// Błąd w środku renderowania mapy cieni nie może zostawić aktywnego
// FBO należącego do menu: fallback zwolni go przed startem Game.
allocated = resources();
const interruptedRender = makeWorld();
await interruptedRender.warmup;
controlledTime(allocated, () => interruptedRender.update(1 / 60));
check(interruptedRender.ready, 'Regresja błędu renderowania uruchamia w pełni przygotowaną scenę');
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

// Prawdziwy WorldOutput, bez WebGL: naturalne menu przygotowuje wodę
// dla tego samego liniowego celu, a obie ścieżki błędu oddają renderer.
allocated = resources();
let lightingLook = 'natural';
const hdrMenu = makeWorld({ settings: { get: key => key === 'lightingLook' ? lightingLook : worldSettings.get(key) } });
equal(allocated.warmTargets, [hdrMenu.worldOutput.target], 'Warmup naturalnego menu otrzymuje rzeczywisty docelowy RT');
check(hdrMenu.worldOutput.target.texture.type === THREE.HalfFloatType, 'Warmup używa HDR16F na obsługującym go rendererze');
check(!hdrMenu.worldOutput.active && hdrMenu.renderer.getRenderTarget() === null && allocated.outputDraws === 0,
    'Przygotowanie HDR nie zaczyna ani nie prezentuje klatki');
await hdrMenu.warmup;
controlledTime(allocated, () => hdrMenu.update(1 / 60));
const originalHdrTarget = { name: 'odbiorca HDR', width: 320, height: 180 };
hdrMenu.renderer.setRenderTarget(originalHdrTarget);
hdrMenu.render();
equal(allocated.outputDraws, 1, 'Naturalny świat jest prezentowany jednym końcowym przebiegiem');
equal(hdrMenu.renderer.getRenderTarget(), originalHdrTarget, 'Poprawna prezentacja przywraca cel wywołującego');
equal(hdrMenu.renderer.autoClear, true, 'Poprawna prezentacja przywraca autoClear menu');
for (const fault of ['throwWorld', 'throwOutput']) {
    allocated[fault] = true;
    assert.throws(() => hdrMenu.render(), /Błąd.*HDR/); checks++;
    check(!hdrMenu.worldOutput.active, `${fault}: przerwana prezentacja kończy aktywną klatkę HDR`);
    equal(hdrMenu.renderer.getRenderTarget(), originalHdrTarget, `${fault}: przywrócony cel renderowania`);
    equal(hdrMenu.renderer.autoClear, true, `${fault}: przywrócone autoClear`);
    allocated[fault] = false;
}
lightingLook = 'baseline'; allocated.warms.push(Promise.resolve()); hdrMenu.applySettings();
equal(allocated.warmTargets.at(-1), null, 'Przejście do bazy przygotowuje wariant ekranu zamiast HDR');
await hdrMenu.warmup; controlledTime(allocated, () => hdrMenu.update(1 / 60));
const presentations = allocated.outputDraws;
hdrMenu.render();
equal(allocated.outputDraws, presentations, 'Porównanie bazowe omija prezentację HDR');
let targetDisposals = 0;
hdrMenu.worldOutput.target.addEventListener('dispose', () => targetDisposals++);
hdrMenu.dispose(); hdrMenu.dispose();
equal(targetDisposals, 1, 'Wyjście z menu zwalnia także wcześniej przygotowany bufor HDR dokładnie raz');
check(allocated.resources.every(item => item.disposals === 1), 'Naturalne menu zwalnia pozostałe zasoby');

console.log(`OK: kamera i scena menu — ${checks} sprawdzeń przejazdów, ustawień i cyklu życia.`);
