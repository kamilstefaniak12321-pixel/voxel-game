// Kontroler kaskad działa naprawdę; tylko renderer liczy przesłane geometrie
// zamiast wykonywać WebGL. Obraz i samplery sprawdza shadow_render_checks.js.
// Uruchomienie: node tools/sprawdz_cienie.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: 'export const blockAtlasTexture = null;' };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { SunShadows, shadowUniforms, SHADOW_CASTER_MATERIALS,
    SHADOW_BUILD_BUDGET, DISTANT_SHADOW_CASCADES } = await import('../src/rendering/Shadows.js');
const { CHUNK_HEIGHT } = await import('../src/config.js');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

class CountingRenderer {
    capabilities = { isWebGL2: true };
    autoClear = true;
    target = { name: 'previous target' };
    submissions = [];
    clears = [];
    getRenderTarget() { return this.target; }
    setRenderTarget(target) { this.target = target; }
    clear() { this.clears.push(this.target); }
    render(scene) {
        const counts = { scene, target: this.target, draws: 0, triangles: 0 };
        scene.traverseVisible(mesh => {
            if (!mesh.isMesh) return;
            const geometry = mesh.geometry;
            const end = Math.min(geometry.index?.count ?? geometry.attributes.position.count,
                geometry.drawRange.start + geometry.drawRange.count);
            const groups = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count: end, materialIndex: 0 }];
            for (const group of groups) {
                const material = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
                const count = Math.min(end, group.start + group.count) - Math.max(geometry.drawRange.start, group.start);
                if (material?.visible !== false && count > 0) { counts.draws++; counts.triangles += Math.floor(count / 3); }
            }
        });
        this.submissions.push(counts);
    }
}

function fixture({ large = false, grouped = false, many = true } = {}) {
    const renderer = new CountingRenderer(), shadows = new SunShadows(renderer);
    const resources = [], world = { shadowScene: new THREE.Scene() }, focus = new THREE.Vector3(0, 64, 0);
    const triangle = (triangles = 1, material = SHADOW_CASTER_MATERIALS[0]) => {
        const geometry = new THREE.BufferGeometry(); resources.push(geometry);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 64, 0, 1, 64, 0, 0, 64, 1], 3));
        const indices = new Uint32Array(triangles * 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i % 3;
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.chunk = { cx: 0, cz: 0, maxY: 65 }; mesh.updateMatrixWorld();
        return mesh;
    };
    const source = triangle(large ? 120001 : grouped ? 30 : 1, grouped ? [SHADOW_CASTER_MATERIALS[0]] : SHADOW_CASTER_MATERIALS[0]);
    if (grouped) for (let i = 0; i < 30; i++) source.geometry.addGroup(i * 3, 3, 0);
    world.shadowScene.add(source);
    // Wodna grupa nie może wykorzystać budżetu ani zostać przesłana do mapy.
    const water = triangle(4, SHADOW_CASTER_MATERIALS);
    water.geometry.addGroup(0, 3, 0); water.geometry.addGroup(3, 9, 2);
    world.shadowScene.add(water);
    const casters = Array.from({ length: many ? 70 : 1 }, () => triangle());
    const snapshots = [];
    const terrain = { active: true, outer: 8192, shadowRevision: 1,
        collectShadowCasters() {
            const snapshot = { revision: this.shadowRevision, casters: casters.slice(), releases: 0,
                dispose() { this.releases++; assert.equal(this.releases, 1, 'Snapshot zwolniono więcej niż raz'); } };
            snapshots.push(snapshot); return snapshot;
        } };
    const sky = { atmosphere: {}, space: 0, state: { sunLightIntensity: 1, moonLightIntensity: 0 },
        sunLightDirection: new THREE.Vector3(),
        celestial: { sunDirection: new THREE.Vector3(), moonDirection: new THREE.Vector3(0, 1, 0) } };
    const orient = degrees => {
        const a = degrees * Math.PI / 180;
        sky.sunLightDirection.set(Math.cos(a), Math.sin(a), 0); sky.celestial.sunDirection.copy(sky.sunLightDirection);
    };
    orient(5); shadows.setQuality(3);
    const step = (dt = .1) => {
        const previous = renderer.target, autoClear = renderer.autoClear, before = renderer.submissions.length;
        shadows.update(dt, sky, focus); shadows.render(world, focus, null, null, 64, terrain);
        assert.equal(renderer.target, previous, 'Przywrócenie render target');
        assert.equal(renderer.autoClear, autoClear, 'Przywrócenie autoClear');
        const batches = renderer.submissions.slice(before).filter(s => s.scene === shadows.buildScene);
        assert.ok(batches.length <= 1, 'Wspólna paczka obu kaskad na jedną klatkę');
        const draws = batches.reduce((n, s) => n + s.draws, 0), triangles = batches.reduce((n, s) => n + s.triangles, 0);
        assert.ok(draws <= SHADOW_BUILD_BUDGET.draws, `Przekroczony budżet rysowań: ${draws}`);
        assert.ok(triangles <= SHADOW_BUILD_BUDGET.triangles, `Przekroczony budżet trójkątów: ${triangles}`);
        assert.equal(shadows.stats().lastFrame.draws, draws, 'Statystyki liczą rzeczywiste grupy materiałów');
        assert.equal(shadows.stats().lastFrame.triangles, triangles, 'Statystyki liczą rzeczywisty drawRange');
        assert.ok(Number.isFinite(shadows.stats().lastFrame.prepareMilliseconds));
        assert.ok(Number.isFinite(shadows.stats().lastFrame.submitMilliseconds));
    };
    const until = (condition, message) => {
        for (let i = 0; i < 100; i++) { if (condition()) return; step(); }
        assert.fail(message);
    };
    const settle = () => until(() => shadows.cascades.every(c => c.valid && !c.build && !c.changed &&
        c.terrainRevision === terrain.shadowRevision), 'Kaskady nie kończą aktualnej rewizji');
    const dispose = () => {
        shadows.dispose(); assert.ok(snapshots.every(s => s.releases === 1), 'Pozostawiony snapshot');
        for (const resource of resources) resource.dispose();
    };
    return { renderer, shadows, world, focus, source, water, terrain, snapshots, sky, orient, step, settle, until, dispose };
}

// Rzeczywista paczka: duża geometria chunków, wiele kafli far i wodna grupa.
// Dwie mapy muszą postępować naprzemiennie, bez nieograniczonej ostatniej paczki.
{
    const f = fixture({ large: true });
    try {
        const { source, shadows, renderer } = f;
        const index = source.geometry.index, attributes = source.geometry.attributes;
        const range = { ...source.geometry.drawRange }; let liveDisposals = 0;
        source.geometry.addEventListener('dispose', () => liveDisposals++); source.visible = false;
        f.step(); assert.ok(shadows.cascades[0].build); assert.equal(shadowUniforms.uFarShadowMap.value, null);
        f.step(); assert.ok(shadows.cascades.every(c => c.build?.cursor > 0), 'Brak zagłodzenia jednej kaskady');
        assert.equal(source.visible, false, 'Przywrócenie widoczności oryginalnego castera');
        f.settle();
        assert.equal(source.geometry.index, index); assert.equal(source.geometry.attributes, attributes);
        assert.deepEqual(source.geometry.drawRange, range); assert.equal(source.parent, f.world.shadowScene);
        assert.equal(liveDisposals, 0, 'Widoki zakresów nie zwalniają buforów żywej geometrii');
        const submitted = renderer.submissions.filter(s => s.scene === shadows.buildScene);
        assert.equal(submitted.reduce((n, s) => n + s.triangles, 0), 2 * (120001 + 1 + 70));
        assert.equal(shadows.cascades.reduce((n, c) => n + c.draws, 0), 2);
        for (const c of shadows.cascades) {
            assert.equal(renderer.clears.filter(t => t === c.target).length, 1, 'Mapa czyszczona raz na budowę');
        }
    } finally { f.dispose(); }
}

// Jeden mesh z większą liczbą grup niż limit także wymaga podziału.
{
    const f = fixture({ grouped: true });
    try {
        const groups = f.source.geometry.groups.map(group => ({ ...group })); f.settle();
        assert.deepEqual(f.source.geometry.groups, groups);
        assert.equal(f.renderer.submissions.filter(s => s.scene === f.shadows.buildScene)
            .reduce((n, s) => n + s.triangles, 0), 2 * (30 + 1 + 70));
    } finally { f.dispose(); }
}

// Nowa rewizja nie może publikować połówki mapy ani udawać aktualnego
// snapshotu. Ciągłe pojawianie się chunków nie restartuje budowy w kółko.
{
    const f = fixture();
    try {
        f.settle();
        const before = f.shadows.cascades.map(c => ({ target: c.target,
            matrix: shadowUniforms[c.config.name === 'far' ? 'uFarShadowMatrix' : 'uDistantShadowMatrix'].value.clone() }));
        f.terrain.shadowRevision++; f.focus.z += 4; f.step(1); f.step();
        assert.ok(f.shadows.cascades.every(c => c.build));
        for (const [i, c] of f.shadows.cascades.entries()) {
            assert.equal(c.target, before[i].target, 'Częściowa mapa zostaje w backTarget');
            assert.deepEqual(shadowUniforms[c.config.name === 'far' ? 'uFarShadowMatrix' : 'uDistantShadowMatrix'].value.elements,
                before[i].matrix.elements, 'Macierz opublikowana razem z kompletną mapą');
        }
        f.shadows.markChunk(f.source.userData.chunk);
        const jobs = f.shadows.cascades.map(c => c.build);
        const draws = f.shadows.cascades.map(c => c.draws);
        for (let i = 0; i < 100 && f.shadows.cascades.some((c, n) => c.draws === draws[n]); i++) {
            f.terrain.shadowRevision++; f.step();
            for (const [n, c] of f.shadows.cascades.entries()) {
                if (c.draws === draws[n]) assert.equal(c.build, jobs[n], 'Streaming nie restartuje immutable snapshotu');
                else if (c.draws === draws[n] + 1) {
                    assert.equal(c.terrainRevision, jobs[n].terrainRevision, 'Publikacja zachowuje prawdziwą starą rewizję');
                    assert.equal(c.changed, true, 'Nie zgubiono zmiany podczas budowy');
                }
            }
        }
        assert.ok(f.shadows.cascades.every((c, i) => c.draws > draws[i]), 'Budowa kończy się mimo streamingu');
        f.settle(); assert.ok(f.shadows.cascades.every(c => !c.changed));
    } finally { f.dispose(); }
}

// Sama edycja bliskiego chunka podczas budowy też utrzymuje dirty.
// Mały krok gracza i naturalny krok Słońca nie porzucają pracy w toku.
{
    const f = fixture();
    try {
        f.step(); f.step(); const pending = f.shadows.cascades.map(c => c.build);
        f.shadows.markChunk(f.source.userData.chunk); f.focus.z += 1; f.orient(5.001);
        f.shadows.update(.1, f.sky, f.focus);
        assert.ok(f.shadows.cascades.every((c, i) => c.build === pending[i]));
        for (let i = 0; i < 100 && f.shadows.cascades.some(c => c.draws === 0); i++) {
            f.step();
            for (const c of f.shadows.cascades) {
                if (c.draws === 1) assert.equal(c.changed, true, 'Edycja chunka zniknęła po publikacji');
            }
        }
        assert.ok(f.shadows.cascades.every(c => c.draws >= 1)); f.settle();
    } finally { f.dispose(); }
}

// Wyjście z jakości 3 zwalnia obie ukończone mapy i niedokończone snapshoty.
for (const quality of [0, 1, 2]) {
    const f = fixture();
    try {
        f.settle(); f.terrain.shadowRevision++; f.step(1); f.step();
        assert.ok(f.shadows.cascades.every(c => c.valid && c.build));
        f.shadows.setQuality(quality);
        assert.equal(f.shadows.hasFar, false); assert.equal(f.shadows.farRadius, 0);
        assert.ok(f.shadows.cascades.every(c => !c.build && !c.target && !c.backTarget && !c.valid));
        assert.ok(f.snapshots.every(s => s.releases === 1));
        assert.equal(shadowUniforms.uFarShadowInfo.value.z, 0); assert.equal(shadowUniforms.uDistantShadowInfo.value.z, 0);
        assert.equal(shadowUniforms.uFarShadowMap.value, null); assert.equal(shadowUniforms.uDistantShadowMap.value, null);
        const count = f.snapshots.length; f.step(); assert.equal(f.snapshots.length, count);
        if (quality === 0) assert.equal(f.shadows.valid, false);
        else assert.equal(f.shadows.valid, true, 'Jakość 1/2 nadal rysuje bliską mapę');
        f.shadows.setQuality(3); f.settle(); assert.equal(f.shadows.farRadius, 1024);
    } finally { f.dispose(); }
}

// Teleport, komenda pory dnia i zmiana Słońce/Księżyc unieważniają starą
// mapę natychmiast; zwykły mały ruch nadal pozwala skończyć snapshot.
for (const jump of ['teleport', 'sun-angle', 'moon', 'space', 'no-light']) {
    const f = fixture();
    try {
        f.settle(); f.terrain.shadowRevision++; f.step(1); f.step();
        const pending = f.shadows.cascades.map(c => c.build);
        assert.ok(pending.every(Boolean));
        if (jump === 'teleport') f.focus.x += 2048;
        if (jump === 'sun-angle') f.orient(30);
        if (jump === 'moon') { f.sky.state.sunLightIntensity = 0; f.sky.state.moonLightIntensity = 1; }
        if (jump === 'space') f.sky.space = 1;
        if (jump === 'no-light') { f.orient(-5); f.sky.state.sunLightIntensity = 0; }
        f.shadows.update(.1, f.sky, f.focus);
        assert.ok(f.shadows.cascades.every(c => !c.build), `${jump}: stara budowa nadal trwa`);
        assert.ok(pending.every(b => b.terrain.releases === 1));
        assert.equal(shadowUniforms.uFarShadowInfo.value.z, 0, `${jump}: stara mapa nadal działa`);
        assert.equal(shadowUniforms.uDistantShadowInfo.value.z, 0, `${jump}: zewnętrzna mapa nadal działa`);
        if (jump === 'space' || jump === 'no-light') {
            const count = f.snapshots.length; f.step(); assert.equal(f.snapshots.length, count);
            f.sky.space = 0; f.sky.state.sunLightIntensity = 1; f.orient(30);
        }
        f.settle();
        for (const c of f.shadows.cascades) {
            assert.equal(c.light, jump === 'moon' ? 'moon' : 'sun');
            near(c.center.distanceTo(f.focus), 0); near(c.direction.dot(f.shadows.direction), 1);
        }
    } finally { f.dispose(); }
}

// Geometria kamer światła: pas do 800 i góra 800 w stronę Słońca
// pozostają we frustum także przy horyzoncie, niezależnie od kamery widza.
{
    const f = fixture({ many: false });
    try {
        f.focus.y = 32;
        for (const degrees of [.5, 2, 5, 45, 90]) {
            f.orient(degrees); f.step();
            for (const c of f.shadows.cascades) c.view.place(f.focus, f.shadows.direction, 8256);
            const outer = f.shadows.cascades.at(-1);
            for (const z of [-800, 0, 800]) {
                assert.ok(outer.view.frustum.containsPoint(new THREE.Vector3(0, f.focus.y, z)), `Brak odbiorcy z=${z}, ${degrees}°`);
            }
            if (degrees <= 5) {
                const height = f.focus.y + 800 * Math.tan(degrees * Math.PI / 180);
                assert.ok(height < CHUNK_HEIGHT);
                for (const c of f.shadows.cascades) {
                    assert.ok(c.view.frustum.containsPoint(new THREE.Vector3(800, height, 0)), `Brak przeszkody 800 przy ${degrees}°`);
                }
            }
        }
        assert.deepEqual(DISTANT_SHADOW_CASCADES.map(c => c.radius), [256, 1024]);
    } finally { f.dispose(); }
}

// WebGL1 nie alokuje map głębi nawet po wybraniu jakości 3.
{
    const renderer = new CountingRenderer(); renderer.capabilities.isWebGL2 = false;
    const shadows = new SunShadows(renderer); shadows.setQuality(3);
    assert.equal(shadows.enabled, false); assert.ok(shadows.cascades.every(c => !c.target)); shadows.dispose();
}
console.log('OK: wspólny budżet kaskad, atomowa publikacja, streaming bez zagłodzenia, zmiany chunków, jakość 0/1/2/3, teleport, dzień/noc, kosmos i frustum przy niskim Słońcu.');
