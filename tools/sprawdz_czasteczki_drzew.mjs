// ------------------------------------------------------------
// SPRAWDZENIE CZĄSTECZEK DRZEW I WIATRU (0.82.0)
//
// - wiatr: łagodny, kręci się wokół wschodu, porywy w granicach,
// - doły koron: liść z powietrzem pod spodem (nie nad innymi liśćmi
//   ani nad ziemią), liście jabłoni z jabłkami - także owoc,
// - płatek liścia spada powoli, kołysze się i płynie z wiatrem,
//   owoc spada szybko i zostaje na ziemi,
// - smugi wiatru: tylko pod gołym niebem, półprzezroczyste, wyłączalne,
// - ustawienia: w zakładce Modele, domyślnie włączone.
//
// Uruchomienie: node tools/sprawdz_czasteczki_drzew.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import * as THREE from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 });
                export const getAtlasAverage = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 35, ATLAS_TILE_SIZE = 16, ATLAS_TILES = {};
                export const getTileColors = (name) => name ? [0.2, 0.3, 0.4, 0.1].map((g) => new THREE.Color(name.includes('jablko') ? 0.6 : 0.05, g, 0.03)) : [];
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const { windAt, WIND_SPEED, WIND_BASE_ANGLE, WIND_SWING } = await import('../src/world/AmbientWind.js');
const { TreeParticles, fruitOf, LEAF_SECONDS } = await import('../src/rendering/TreeParticles.js');
const { WindStreaks, WIND_STREAKS } = await import('../src/rendering/WindStreaks.js');
const { CubeParticles } = await import('../src/rendering/CubeParticles.js');
const { getBlockId, getBlockDefinition } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { SETTINGS_DEFAULTS } = await import('../src/settings/Settings.js');
const { SETTINGS_TABS } = await import('../src/ui/settingsLayout.js');
const { TEXTS } = await import('../src/ui/texts.js');
const THREE = await import('three');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Wiatr ---------------------------------------------------------------

let gusts = [], angles = [];
for (let t = 0; t < 3600; t += 7) {
    const wind = windAt(t);
    gusts.push(wind.gust); angles.push(wind.angle);
    check(wind.speed >= WIND_SPEED[0] - 1e-9 && wind.speed <= WIND_SPEED[1] + 1e-9, 'Wiatr łagodny');
    check(Math.abs(Math.hypot(wind.x, wind.z) - wind.speed) < 1e-9, 'Wektor wiatru zgodny z prędkością');
}
check(Math.min(...angles) >= WIND_BASE_ANGLE - WIND_SWING - 1e-9 && Math.max(...angles) <= WIND_BASE_ANGLE + WIND_SWING + 1e-9, 'Kręci się wokół wschodu');
check(Math.max(...angles) - Math.min(...angles) > 0.6 && Math.max(...gusts) - Math.min(...gusts) > 0.5, 'Kierunek i porywy się zmieniają');
check(JSON.stringify(windAt(123.4)) === JSON.stringify(windAt(123.4)), 'Ten sam czas - ten sam wiatr');


// --- Owoce ------------------------------------------------------------------

check(fruitOf(getBlockDefinition('jablon_leaves_jablka')) === 'jablon_jablko', 'Liście jabłoni z jabłkami - jabłko');
check(fruitOf(getBlockDefinition('jablon_leaves')) === null, 'Zwykłe liście jabłoni - bez owoców');
check(fruitOf(getBlockDefinition('linden_leaves_flowering')) === null, 'Kwiaty lipy to nie owoc');


// --- Doły koron ---------------------------------------------------------------

const scene = new THREE.Scene();
const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const chunk = { cx: 0, cz: 0, blocks: new Uint16Array(LAYER * CHUNK_HEIGHT), maxY: 40, meshRevision: 1 };
const set = (x, y, z, type) => { chunk.blocks[y * LAYER + z * CHUNK_SIZE + x] = getBlockId(type); };
for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) set(x, 10, z, 'grass');
// Korona 3 x 3 x 2 nad pniem, jedno jabłko na dole, liść leżący na ziemi.
for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) for (const y of [16, 17]) set(x, y, z, 'oak_leaves');
for (let y = 11; y <= 15; y++) set(5, y, 5, 'oak_log');
set(4, 16, 4, 'jablon_leaves_jablka');
set(9, 11, 9, 'oak_leaves');

const light = { sky: 15, red: 0, green: 0, blue: 0 };
const world = {
    getChunk: (cx, cz) => cx === 0 && cz === 0 ? chunk : null,
    getBlockId: (x, y, z) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < CHUNK_HEIGHT ? chunk.blocks[y * LAYER + z * CHUNK_SIZE + x] : 0,
    isSolid(x, y, z) { return y <= 10 || this.getBlockId(x, y, z) === getBlockId('oak_log'); },
    getLight: () => light,
    getSurfaceY: () => 10
};

const trees = new TreeParticles(scene, world);
const cells = trees.scanChunk(chunk);
check(cells.leaves.length / 4 === 8, `Dół korony: 8 liści (bez tego nad pniem) (${cells.leaves.length / 4})`);
check(cells.fruits.length / 4 === 1 && cells.fruits[0] === 4 && cells.fruits[2] === 4, 'Jedno jabłko');
check(!cells.leaves.some((_, i) => i % 4 === 1 && cells.leaves[i] === 11), 'Liść na ziemi nie spada');
check(!cells.leaves.some((_, i) => i % 4 === 1 && cells.leaves[i] === 17), 'Liść nad liściem nie spada');

// Gracz pod drzewem: z czasem lecą liście i czasem owoc.
const player = { pos: new THREE.Vector3(5.5, 11, 8.5) };
for (let i = 0; i < 60 * 30; i++) trees.update(1 / 60, player, windAt(i / 60));
check(trees.cells.size === 1, 'Chunk przejrzany');
const expected = 8 / LEAF_SECONDS * 30;
check(trees.leaves.count > 0 && trees.leaves.count <= expected * 3, `Liście spadają spokojnie (${trees.leaves.count}, ok. ${expected.toFixed(1)})`);
trees.setEnabled(false);
check(trees.leaves.count === 0 && trees.fruits.count === 0, 'Wyłączone - bez cząsteczek');
trees.setEnabled(true);


// --- Ruch płatka i owocu --------------------------------------------------------

const flakes = new CubeParticles(scene, { capacity: 4, flat: 0.22 });
flakes.wind.x = 2; flakes.wind.z = 0;
flakes.emit({ position: new THREE.Vector3(0.5, 30, 0.5), life: 30, size: 0.14, colors: new THREE.Color(0, 1, 0),
    gravity: 0.9, drag: 2.2, flutter: 0.5, carry: 0.5 });
const start = Float32Array.from(flakes.data.slice(0, 3));
for (let i = 0; i < 600; i++) flakes.update(1 / 60, null);
const fall = start[1] - flakes.data[1], drift = flakes.data[0] - start[0];
check(fall > 2 && fall < 6, `Płatek spada powoli (${fall.toFixed(2)} bloku w 10 s)`);
check(drift > 4, `Płatek płynie z wiatrem (${drift.toFixed(2)})`);

const ground = { isSolid: (x, y) => y <= 10 };
const fruit = new CubeParticles(scene, { capacity: 4 });
fruit.emit({ position: new THREE.Vector3(0.5, 16, 0.5), life: 8, size: 0.17, colors: new THREE.Color(1, 0, 0), gravity: 16, drag: 0.1, collide: true });
for (let i = 0; i < 180; i++) fruit.update(1 / 60, ground);
check(Math.abs(fruit.data[1] - (11 + 0.085)) < 0.02 && fruit.data[4] === 0, 'Owoc leży na ziemi');


// --- Smugi wiatru -----------------------------------------------------------------

const streaks = new WindStreaks(scene, world);
for (let i = 0; i < 600; i++) streaks.update(1 / 60, player, windAt(i / 60), 1);
check(streaks.count > 0 && streaks.count <= WIND_STREAKS.max, `Smugi na otwartym powietrzu (${streaks.count})`);
const colors = streaks.geometry.attributes.color.array;
let maxAlpha = 0;
for (let i = 3; i < streaks.geometry.drawRange.count * 4; i += 4) maxAlpha = Math.max(maxAlpha, colors[i]);
check(maxAlpha > 0 && maxAlpha <= 0.42, `Półprzezroczyste (najwyżej ${maxAlpha.toFixed(2)})`);
light.sky = 9;
const indoor = new WindStreaks(scene, world);
for (let i = 0; i < 600; i++) indoor.update(1 / 60, player, windAt(i / 60), 1);
check(indoor.count === 0, 'Pod dachem / w lesie - bez smug');
streaks.setEnabled(false);
check(streaks.count === 0, 'Wyłączone - bez smug');


// --- Ustawienia -----------------------------------------------------------------------

check(SETTINGS_DEFAULTS.fallingLeaves === true && SETTINGS_DEFAULTS.windStreaks === true, 'Domyślnie włączone');
check(SETTINGS_TABS.models.includes('fallingLeaves') && SETTINGS_TABS.models.includes('windStreaks'), 'W zakładce Modele');
check(TEXTS.fallingLeaves(true) && TEXTS.windStreaks(false) && TEXTS.modelNotes.fallingLeaves && TEXTS.modelNotes.windStreaks, 'Napisy');

console.log(`OK: cząsteczki drzew i wiatru - ${checks} sprawdzeń (wiatr, doły koron, owoce, płatki, smugi, ustawienia).`);
