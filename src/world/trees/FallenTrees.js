// ------------------------------------------------------------
// POWALONE DRZEWA (1.37.0, pomysł Kamila - docs/powalone-drzewa.md)
//
// Stary pień, który kiedyś sam upadł i leży w lesie: to z niego bierze
// się pierwsze drewno. Jeden metr pnia to jeden blok:
//   - zdrowy leżący pień gatunku (tnie się go siekierą),
//   - albo spróchniały pień (wyłamuje się go gołą ręką),
// a do tego kępki mchu na grzbiecie i suche gałęzie obok (patyki).
//
// Trzy sposoby, jeden układ (fallenMetres):
//   - generator terenu: lasy mają własną, rzadką siatkę powalonych pni
//     (FallenTrees.place - kawałki wchodzą do sąsiednich chunków jak
//     korony drzew, więc pień na granicy zawsze pasuje),
//   - pień przy miejscu startu nowego świata (game/StarterLog.js),
//   - komenda /powalone postaw.
// ------------------------------------------------------------

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config.js';
import { AIR_ID, isLeavesId, isLiquidId, isPlantId, isReplaceableId, isSoilId, isSolidId, getAttach } from '../../blocks/BlockRegistry.js';
import { TREE_SPECIES } from '../../blocks/trees.js';
import { lyingLogType, rottenLogType, DEAD_BRANCH } from '../../blocks/lyingLogs.js';

// Siatka powalonych pni (bloki): w kratce najwyżej jeden.
export const FALLEN_GRID = 20;
// Jaka część kratek w gęstym lesie ma pień i od jakiej gęstości lasu.
export const FALLEN_CHANCE = 0.5;
export const FALLEN_MIN_DENSITY = 0.25;
// Długość pnia w blokach.
export const FALLEN_MIN = 4, FALLEN_MAX = 8;
// Jaka część metrów jest spróchniała, omszona, z gałęzią obok.
export const ROTTEN_PART = 0.4, MOSS_PART = 0.3, BRANCH_PART = 0.45;
// Najdalej od podstawy sięga pień z gałęzią obok.
const REACH = FALLEN_MAX + 1;

// Drzewa, po których nie zostaje prosty pień (krzew, olbrzymy).
const NO_FALLEN = new Set(['mugo', 'baobab']);

// Gatunek powalonego pnia: sam gatunek albo jego podszyt (u olbrzymów
// z własnym odstępem); null - nie ma czego położyć.
export function fallenSpecies(species) {
    for (let step = 0; species && step < 3; step++) {
        if (NO_FALLEN.has(species)) return null;
        const shape = TREE_SPECIES[species]?.shape;
        if (!shape?.spacing) return TREE_SPECIES[species] ? species : null;
        species = shape.under ?? null;
    }
    return null;
}

// Kierunki: [dx, dz, oś].
export const FALLEN_DIRECTIONS = [[1, 0, 'x'], [0, 1, 'z'], [-1, 0, 'x'], [0, -1, 'z']];

// Układ pnia: dla każdego metra { rotten, moss, branch } (branch: 0 -
// brak, -1 / 1 - sucha gałąź po lewej / prawej). random(n) - liczba 0-1
// zależna tylko od n (ten sam pień w każdym chunku).
export function fallenMetres(random, length) {
    const metres = [];
    for (let i = 0; i < length; i++) {
        metres.push({
            rotten: random(10 + i) < ROTTEN_PART,
            moss: random(30 + i) < MOSS_PART,
            branch: random(50 + i) < BRANCH_PART ? (random(70 + i) < 0.5 ? -1 : 1) : 0
        });
    }
    // Zawsze coś dla gołej ręki i coś dla siekiery: przynajmniej jeden
    // metr spróchniały, dwa zdrowe i jedna sucha gałąź.
    if (!metres.some((metre) => metre.rotten)) metres[Math.floor(random(1) * length)].rotten = true;
    for (let guard = 0; metres.filter((metre) => !metre.rotten).length < 2 && guard < length; guard++) {
        metres[(Math.floor(random(2) * length) + guard) % length].rotten = false;
    }
    if (!metres.some((metre) => metre.rotten)) metres[0].rotten = true;
    if (!metres.some((metre) => metre.branch)) metres[Math.floor(random(3) * length)].branch = random(4) < 0.5 ? -1 : 1;
    return metres;
}

// Czy pień może zająć to miejsce (jak pień drzewa w generatorze).
function free(id) {
    return !isLiquidId(id) && (id === AIR_ID || isPlantId(id) || isReplaceableId(id) || isLeavesId(id) || getAttach(id) !== 0);
}

// Bloki powalonego pnia: [{ x, y, z, type, kind }] (kind: 'log',
// 'moss', 'branch').
//   heightAt(x, z) - wysokość gruntu (Y najwyższego bloku ziemi) albo
//   null, gdy tam nie da się położyć pnia (woda, skała...).
// null - teren się nie nadaje (uskok większy niż blok, przeszkoda).
export function fallenBlocks(x, z, direction, species, length, random, heightAt) {
    const [dx, dz, axis] = FALLEN_DIRECTIONS[direction];
    const metres = fallenMetres(random, length);
    const blocks = [];
    let last = null;
    for (let i = 0; i < length; i++) {
        const mx = x + dx * i, mz = z + dz * i;
        const height = heightAt(mx, mz);
        if (height === null || height === undefined || (last !== null && Math.abs(height - last) > 1)) return null;
        last = height;
        const metre = metres[i];
        blocks.push({ x: mx, y: height + 1, z: mz, type: metre.rotten ? rottenLogType(axis) : lyingLogType(species, axis), kind: 'log' });
        if (metre.moss) blocks.push({ x: mx, y: height + 2, z: mz, type: 'moss_carpet', kind: 'moss' });
        if (metre.branch) {
            // Obok pnia, w poprzek kierunku.
            const bx = mx + dz * metre.branch, bz = mz + dx * metre.branch;
            const side = heightAt(bx, bz);
            if (side !== null && side !== undefined && Math.abs(side - height) <= 1) blocks.push({ x: bx, y: side + 1, z: bz, type: DEAD_BRANCH, kind: 'branch' });
        }
    }
    return blocks;
}

// Kładzie powalony pień w gotowym świecie (start świata, komenda).
// Zwraca listę postawionych bloków albo null (teren się nie nadaje).
export function placeFallenInWorld(world, x, z, direction, species, length, random = Math.random) {
    const picks = new Map();
    const pick = (n) => { if (!picks.has(n)) picks.set(n, random()); return picks.get(n); };
    const heightAt = (cx, cz) => {
        const y = world.getGroundY(cx, cz);
        if (!(y > 0) || y + 2 >= CHUNK_HEIGHT) return null;
        const ground = world.getBlockId(cx, y - 1, cz);
        // Na ziemi, nie na wodzie ani na budowli; miejsce nad nią wolne.
        if (!isSoilId(ground) || !free(world.getBlockId(cx, y, cz)) || !free(world.getBlockId(cx, y + 1, cz))) return null;
        return y - 1;
    };
    const blocks = fallenBlocks(x, z, direction, species, length, pick, heightAt);
    if (!blocks) return null;
    const placed = [];
    for (const block of blocks) {
        if (block.kind !== 'log' && !free(world.getBlockId(block.x, block.y, block.z))) continue;
        if (world.setBlock(block.x, block.y, block.z, block.type)) placed.push(block);
    }
    return placed;
}


function hash01(seed, x, z, salt) {
    let h = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const CACHE_SIZE = 2048;

// Powalone pnie w generatorze terenu realistycznego.
export class FallenTrees {

    // forests - Forests tego generatora (gęstość lasu, gatunki, teren).
    constructor(forests) {
        this.forests = forests;
        this.seed = (forests.seed ^ 0x7a11e0d5) >>> 0;
        this.cache = new Map();
        this.sample = {};
    }

    // Powalony pień w kratce (gx, gz) albo null: { x, z, species, blocks }.
    at(gx, gz) {
        const key = (gx + 32768) * 65536 + (gz + 32768);
        if (this.cache.has(key)) return this.cache.get(key);
        const fallen = this.find(gx, gz);
        if (this.cache.size >= CACHE_SIZE) this.cache.clear();
        this.cache.set(key, fallen);
        return fallen;
    }

    find(gx, gz) {
        const G = FALLEN_GRID, seed = this.seed, forests = this.forests, generator = forests.generator;
        const random = (n) => hash01(seed, gx, gz, n);
        if (random(100) >= FALLEN_CHANCE) return null;
        const x = gx * G + Math.floor(random(101) * G), z = gz * G + Math.floor(random(102) * G);
        // Najpierw tanio: poza lasem nic nie leży.
        const sample = generator.compute(x, z, 0, this.sample);
        if (sample.ocean || sample.water > sample.height || sample.riverGap < 2) return null;
        const forest = forests.forestAt(x, z, sample);
        if (!(forest.density >= FALLEN_MIN_DENSITY)) return null;
        const species = fallenSpecies(forests.biomeSpecies(x, z, forest.biome, random(103)));
        if (!species) return null;
        const length = FALLEN_MIN + Math.floor(random(104) * (FALLEN_MAX - FALLEN_MIN + 1));
        const direction = Math.floor(random(105) * 4);
        // Pień tylko na trawie i nie w wodzie.
        const probe = {};
        const heightAt = (cx, cz) => {
            const here = generator.compute(cx, cz, 0, probe);
            if (here.ocean || here.water > here.height || here.riverGap < 2 || here.height + 3 >= CHUNK_HEIGHT) return null;
            return generator.surfaceKind(cx, cz, here, 0) === 'grass' ? here.height : null;
        };
        const blocks = fallenBlocks(x, z, direction, species, length, random, heightAt);
        return blocks ? { x, z, species, direction, length, blocks } : null;
    }

    // Wstawia do świeżo wygenerowanego chunka jego kawałki powalonych pni
    // (po drzewach: pień nie wchodzi w stojące pnie ani w teren).
    place(chunk, idOf) {
        const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE, G = FALLEN_GRID, S = CHUNK_SIZE;
        for (let gz = Math.floor((baseZ - REACH) / G); gz <= Math.floor((baseZ + S - 1 + REACH) / G); gz++) {
            for (let gx = Math.floor((baseX - REACH) / G); gx <= Math.floor((baseX + S - 1 + REACH) / G); gx++) {
                const fallen = this.at(gx, gz);
                if (!fallen) continue;
                for (const block of fallen.blocks) {
                    const lx = block.x - baseX, lz = block.z - baseZ;
                    if (lx < 0 || lx >= S || lz < 0 || lz >= S || block.y < 1 || block.y >= CHUNK_HEIGHT) continue;
                    const old = chunk.getId(lx, block.y, lz), below = chunk.getId(lx, block.y - 1, lz);
                    if (!free(old)) continue;
                    // Pień leży na czymś stałym; mech na pniu; gałąź w ziemi.
                    if (block.kind === 'log' ? !isSolidId(below) : block.kind === 'moss' ? !isSolidId(below) || isLeavesId(below) : !isSoilId(below)) continue;
                    chunk.setId(lx, block.y, lz, idOf(block.type));
                }
            }
        }
    }

}
