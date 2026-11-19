// ------------------------------------------------------------
// SAD: OPADŁE OWOCE I ZIMOWY ROZWÓJ ROŚLIN (1.22.0) - pomysł Kamila
//
// Zima to pora, w której nic nie rośnie - i w której rozstrzyga się
// następny rok. Dwa razy do roku gra "rozlicza" rośliny gracza:
//
// PO PORZE OWOCOWANIA (gdy minęła pora rośliny): owoce, których nikt nie
// zebrał, spadają. Roślina zostaje pusta, a na ziemi pod nią leży
// warstwa opadłych owoców (blocks/fallenFruit.js).
//
// NA WIOSNĘ (pierwsze rozliczenie po zimie):
//   - opadłe owoce gniją: ziemia pod nimi ma szansę zamienić się
//     w czarnoziem, a z części wyrasta sadzonka tej samej rośliny,
//   - roślina ma szansę dawać odtąd o jeden owoc więcej przy każdym
//     zbiorze (najwyżej MAX_LEVEL więcej). Szansa rośnie, gdy w zeszłym
//     roku zbierano z niej owoce i gdy rośnie na czarnoziemie,
//   - rośliny niskie (poza dynią i cukinią) rozrastają się na sąsiednie
//     wolne miejsce.
//
// Dotyczy tylko chunków zmienionych przez gracza - tak jak wzrost
// (game/PlantGrowth.js): dzikie rośliny w nietkniętym terenie nie rosną
// i nie są zapisywane. Chunk, którego gracz długo nie odwiedzał,
// rozlicza się przy pierwszym wczytaniu (raz, nie za każdy rok osobno).
//
// Pamięć (zapis świata - worldInfo.orchard):
//   levels  - "x,y,z" -> o ile owoców więcej daje roślina w tym miejscu,
//   picked  - miejsca, z których w tym roku zbierano owoce,
//   chunks  - "cx,cz" -> numer pory ostatniego rozliczenia.
//
// Do testów: /sad.
// ------------------------------------------------------------

import { CHUNK_SIZE } from '../config.js';
import { FERTILIZERS } from '../blocks/fertilizers.js';
import { seasonAt } from '../sky/Seasons.js';
import { BLOCK_TYPES, getBlockId, getBlockTypeById, isSoilId, isReplaceableId, canPlantStay, AIR_ID } from '../blocks/BlockRegistry.js';
import { plantSeasonInfo } from '../blocks/plantSeasons.js';
import { fallenFor, FALLEN_FIRST_ID, FALLEN_END_ID } from '../blocks/fallenFruit.js';
import { lowPlantInfo, lowPlantType } from '../blocks/lowPlants.js';

// O ile owoców więcej może dawać roślina.
export const MAX_LEVEL = 3;

// Szansa na wiosnę, że roślina zacznie dawać o jeden owoc więcej:
// podstawowa, premia za zbiory w zeszłym roku, premia za czarnoziem.
export const GROW_CHANCE = 0.3;
export const GROW_PICKED = 0.25;
export const GROW_HUMUS = 0.25;

// Opadłe owoce na wiosnę: szansa na czarnoziem pod nimi i na sadzonkę.
export const HUMUS_CHANCE = 0.5;
export const SAPLING_CHANCE = 0.25;

// Rozrastanie roślin niskich: szansa (i premia za czarnoziem) oraz ilu
// sąsiadów tej samej rośliny (z ośmiu) to już ciasno.
export const SPREAD_CHANCE = 0.25;
export const SPREAD_HUMUS = 0.2;
export const SPREAD_CROWD = 4;
const NO_SPREAD = new Set(['pumpkin', 'zucchini']);

// Jak głęboko pod rośliną szukać ziemi na opadłe owoce.
const FALL_DEPTH = 12;

// Co ile sekund sprawdzać, czy jakiś chunk czeka na rozliczenie,
// i z jak daleka gracz dostaje wiosenny napis.
const CHECK_SECONDS = 0.5;
const NOTICE_RANGE = 64;

// Z czego może powstać czarnoziem.
const TO_HUMUS = ['grass', 'dirt', 'coarse_dirt', 'forest_floor', 'tilled_dirt'];


// Bloki opadłych owoców: numer -> { item, sapling }.
const FALLEN = new Map();
for (const definition of Object.values(BLOCK_TYPES)) if (definition.fallen) FALLEN.set(definition.id, definition.fallen);

// Numery bloków "roślina bez owoców", które owocują od nowa.
const REGROWS = new Set(Object.values(BLOCK_TYPES).filter((definition) => definition.grows).map((definition) => definition.id));

const keyOf = (x, y, z) => `${x},${y},${z}`;

// Numer pory od początku świata (rok * 4 + pora).
export function seasonSerial(days) {
    const season = seasonAt(days);
    return (season.year - 1) * 4 + season.index;
}

// Czy między rozliczeniami `from` i `to` zaczęła się wiosna.
export function springBetween(from, to) {
    return Math.floor(to / 4) > Math.floor(from / 4);
}

export class Orchard {

    constructor(game, saved = null) {

        this.game = game;
        this.levels = new Map();
        this.picked = new Set();
        this.chunks = new Map();
        this.version = 0;
        this.timer = 0;
        // Zebrane do jednego wiosennego napisu.
        this.news = null;
        this.random = Math.random;

        if (saved && typeof saved === 'object') {
            for (const [key, level] of Object.entries(saved.levels ?? {})) {
                if (/^-?\d+,\d+,-?\d+$/.test(key) && Number.isInteger(level) && level >= 1) this.levels.set(key, Math.min(MAX_LEVEL, level));
            }
            for (const key of Array.isArray(saved.picked) ? saved.picked : []) if (/^-?\d+,\d+,-?\d+$/.test(key)) this.picked.add(key);
            for (const [key, serial] of Object.entries(saved.chunks ?? {})) {
                if (/^-?\d+,-?\d+$/.test(key) && Number.isInteger(serial)) this.chunks.set(key, serial);
            }
        }

    }

    getState() {
        return { levels: Object.fromEntries(this.levels), picked: [...this.picked], chunks: Object.fromEntries(this.chunks) };
    }

    // O ile owoców więcej daje roślina w tym miejscu (0-MAX_LEVEL).
    level(x, y, z) {
        return this.levels.get(keyOf(x, y, z)) ?? 0;
    }

    // Zbiór: roślina zapamiętuje, że w tym roku o nią dbano.
    harvested(x, y, z) {
        const key = keyOf(x, y, z);
        if (!this.picked.has(key)) { this.picked.add(key); this.version++; }
    }

    // Roślina zniknęła (wykopana, zastąpiona): pamięć miejsca też.
    forget(x, y, z) {
        const key = keyOf(x, y, z);
        if (this.levels.delete(key) | this.picked.delete(key)) this.version++;
    }

    update(dt) {

        this.timer += dt;
        if (this.timer < CHECK_SECONDS) return;
        this.timer = 0;

        const game = this.game, days = game.time?.days;
        if (!Number.isFinite(days)) return;

        const serial = seasonSerial(days);

        // Jeden chunk na raz - przegląd całego chunka trochę kosztuje.
        for (const chunk of game.world.chunks.values()) {
            if (!chunk.modified) continue;
            if (game.plantGrowth?.shouldTick && !game.plantGrowth.shouldTick(chunk)) continue;
            const key = `${chunk.cx},${chunk.cz}`;
            const last = this.chunks.get(key);
            if (last === undefined) { this.chunks.set(key, serial); this.version++; continue; }
            if (last >= serial) continue;
            this.settle(chunk, last, serial, days);
            this.chunks.set(key, serial);
            this.version++;
            break;
        }

        this.announce();

    }

    // Rozliczenie chunka: pory od `from` (ostatnie rozliczenie) do `to`.
    settle(chunk, from, to, days) {

        const world = this.game.world;
        const season = to % 4;
        const spring = springBetween(from, to);
        const layer = CHUNK_SIZE * CHUNK_SIZE;
        const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
        const result = { fallen: 0, humus: 0, saplings: 0, grown: 0, spread: 0 };

        // Najpierw lista (rozliczenie zmienia bloki, po których idziemy).
        const fruits = [], layers = [], plants = [];
        const end = Math.min(chunk.blocks.length, (chunk.maxY ?? 0) * layer || chunk.blocks.length);

        for (let i = Math.max(0, (chunk.solidBelow ?? 0)) * layer; i < end; i++) {

            const id = chunk.blocks[i];

            if (id === AIR_ID) continue;

            if (id >= FALLEN_FIRST_ID && id < FALLEN_END_ID) { layers.push(i); continue; }

            const info = plantSeasonInfo(id);

            if (!info?.fruit) continue;

            // Rozwija się tylko to, co owocuje od nowa (gałązka z "grows");
            // zwykłe liście lipy, które kwitną raz, nie mają pamięci.
            if (REGROWS.has(info.shown[0])) plants.push(i);

            if (info.stage === 2 && !info.seasons.includes(season)) fruits.push(i);

        }

        const position = (i) => [baseX + (i % CHUNK_SIZE), Math.floor(i / layer), baseZ + Math.floor((i % layer) / CHUNK_SIZE)];

        // --- Po porze: owoce spadają --------------------------------------

        for (const i of fruits) {
            const [x, y, z] = position(i);
            const id = chunk.blocks[i], type = getBlockTypeById(id);
            world.setBlock(x, y, z, getBlockTypeById(plantSeasonInfo(id).shown[0]));
            const fallen = fallenFor(type);
            if (fallen && this.drop(x, y, z, fallen)) result.fallen++;
        }

        if (spring) {

            // --- Opadłe owoce: czarnoziem i sadzonki ----------------------

            for (const i of layers) {
                const [x, y, z] = position(i);
                const fallen = FALLEN.get(world.getBlockId(x, y, z));
                if (!fallen) continue;
                const ground = getBlockTypeById(world.getBlockId(x, y - 1, z));
                if (TO_HUMUS.includes(ground) && this.random() < HUMUS_CHANCE) {
                    world.setBlock(x, y - 1, z, 'humus');
                    result.humus++;
                }
                const sapling = getBlockId(fallen.sapling);
                if (this.random() < SAPLING_CHANCE && canPlantStay(sapling, world.getBlockId(x, y - 1, z), world.getBlockId(x, y + 1, z))) {
                    world.setBlock(x, y, z, fallen.sapling);
                    result.saplings++;
                } else world.clearBlock(x, y, z);
            }

            // --- Rośliny: większy plon i rozrastanie -----------------------

            // Żyzna ziemia: czarnoziem i pole z nawozem (blocks/fertilizers.js).
            const fertile = new Set([getBlockId('humus'), ...Object.values(FERTILIZERS).filter((entry) => entry.rich).map((entry) => getBlockId(entry.field))]);

            for (const i of plants) {

                const [x, y, z] = position(i);
                const id = world.getBlockId(x, y, z);

                const info = plantSeasonInfo(id);

                if (!info?.fruit || !REGROWS.has(info.shown[0])) continue;

                const key = keyOf(x, y, z);
                const rich = fertile.has(world.getBlockId(x, y - 1, z));
                const level = this.levels.get(key) ?? 0;

                if (level < MAX_LEVEL && this.random() < GROW_CHANCE + (this.picked.has(key) ? GROW_PICKED : 0) + (rich ? GROW_HUMUS : 0)) {
                    this.levels.set(key, level + 1);
                    result.grown++;
                }

                this.picked.delete(key);

                const low = lowPlantInfo(getBlockTypeById(id));

                if (low && !NO_SPREAD.has(low.species) && this.random() < SPREAD_CHANCE + (rich ? SPREAD_HUMUS : 0) && this.spread(x, y, z, low.species)) {
                    result.spread++;
                }

            }

            // Pamięć miejsc, w których w tym chunku nie ma już rośliny.
            for (const key of this.levels.keys()) {
                const [x, y, z] = key.split(',').map(Number);
                if (Math.floor(x / CHUNK_SIZE) !== chunk.cx || Math.floor(z / CHUNK_SIZE) !== chunk.cz) continue;
                if (!plantSeasonInfo(world.getBlockId(x, y, z))?.fruit) this.levels.delete(key);
            }

        }

        // Gracz widzi skutki tylko wtedy, gdy jest w pobliżu.
        const player = this.game.player?.pos;
        const total = result.fallen + result.humus + result.saplings + result.grown + result.spread;

        if (total > 0 && player && Math.hypot(baseX + 8 - player.x, baseZ + 8 - player.z) <= NOTICE_RANGE) {
            this.news ??= { fallen: 0, humus: 0, saplings: 0, grown: 0, spread: 0, wait: 2 };
            for (const name of Object.keys(result)) this.news[name] += result[name];
            this.news.wait = 2;
        }

        void days;

        return result;

    }

    // Kładzie opadłe owoce na ziemi pod (x, y, z); gdy roślina sama stoi
    // na ziemi (krzak, płyta) - obok niej. Zwraca true, gdy znalazło się
    // dla nich miejsce.
    drop(x, y, z, fallen) {

        const world = this.game.world;
        const free = (px, py, pz) => {
            const here = world.getBlockId(px, py, pz);
            return (here === AIR_ID || isReplaceableId(here)) && !FALLEN.has(here) && isSoilId(world.getBlockId(px, py - 1, pz));
        };

        for (let depth = 1; depth <= FALL_DEPTH; depth++) {

            if (free(x, y - depth, z)) return Boolean(world.setBlock(x, y - depth, z, fallen));

            // Liście (krzewu, drzewa) nie zatrzymują owoców; reszta tak.
            const here = world.getBlockId(x, y - depth, z);
            const definition = BLOCK_TYPES[getBlockTypeById(here)];

            if (here !== AIR_ID && !isReplaceableId(here) && definition?.model !== 'leaves') break;

        }

        // Roślina przy ziemi: owoce leżą obok.
        const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => free(x + dx, y, z + dz));

        if (sides.length === 0) return false;

        const [dx, dz] = sides[Math.floor(this.random() * sides.length)];

        return Boolean(world.setBlock(x + dx, y, z + dz, fallen));

    }

    // Sadzonka rośliny niskiej na wolnym sąsiednim miejscu.
    spread(x, y, z, species) {

        const world = this.game.world;
        const young = lowPlantType(species, 'young'), youngId = getBlockId(young);
        const free = [];
        let crowd = 0;

        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {

            if (dx === 0 && dz === 0) continue;

            const here = world.getBlockId(x + dx, y, z + dz);

            if (lowPlantInfo(getBlockTypeById(here))?.species === species) { crowd++; continue; }

            if (dx !== 0 && dz !== 0) continue;

            if ((here === AIR_ID || isReplaceableId(here)) && canPlantStay(youngId, world.getBlockId(x + dx, y - 1, z + dz), AIR_ID)) free.push([dx, dz]);

        }

        if (crowd >= SPREAD_CROWD || free.length === 0) return false;

        const [dx, dz] = free[Math.floor(this.random() * free.length)];

        return Boolean(world.setBlock(x + dx, y, z + dz, young));

    }

    // Jeden napis po serii rozliczeń (chunki rozliczają się po kolei).
    announce() {

        const news = this.news;

        if (!news || --news.wait > 0) return;

        this.news = null;

        const parts = [];
        const many = (count, one, few, lots) => `${count} ${count === 1 ? one : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? few : lots}`;

        if (news.grown) parts.push(`${many(news.grown, 'roślina daje', 'rośliny dają', 'roślin daje')} więcej owoców`);
        if (news.spread) parts.push(`${many(news.spread, 'roślina się rozrosła', 'rośliny się rozrosły', 'roślin się rozrosło')}`);
        if (news.saplings) parts.push(`${many(news.saplings, 'nowa sadzonka', 'nowe sadzonki', 'nowych sadzonek')} z opadłych owoców`);
        if (news.humus) parts.push(`czarnoziem pod opadłymi owocami (${news.humus})`);

        if (parts.length > 0) this.game.onNotice?.(`Po zimie: ${parts.join(', ')}`);
        else if (news.fallen) this.game.onNotice?.(`Niezebrane owoce opadły na ziemię (${news.fallen})`);

        this.game.achieve?.('orchard', { ...news });

    }

}
