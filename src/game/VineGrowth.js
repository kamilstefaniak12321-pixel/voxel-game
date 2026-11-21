// ------------------------------------------------------------
// PNĄCZA: SADZENIE I WSPINANIE SIĘ (1.30.0, docs/pnacza.md)
//
// Sadzenie (GameInteraction.plantVine): owoc pnącza (winogrona, szyszka
// chmielu, kiwi, marakuja) PPM
//   - w kratkę albo tyczkę stojącą na ziemi - pnącze zarasta podporę,
//   - w bok pełnego bloku (mur, pień), gdy przed nim jest ziemia - płaskie
//     pnącze na tym boku,
//   - w ziemię tuż przy murze - też płaskie pnącze na murze.
//
// Wspinanie (PlantGrowth.grow -> climbVine): gdy kawałek pnącza rośnie
// (z łodygi w liście albo z liści dalej), próbuje zasadzić łodygę obok -
// najczęściej w górę, czasem w bok - tylko tam, gdzie jest podpora:
//   - płaskie pnącze: wolne miejsce z pełnym blokiem z tej samej strony,
//   - kratka: kratka obok (ta sama strona), tyczka: tyczka wyżej,
//   - każde: pergola nad nim (daszek), a z daszku - pergole obok.
// Limit: wysokość gatunku (licząc od ziemi pod pnączem), najwyżej
// VINE_REACH bloków w bok od korzenia (kawałka na ziemi) i VINE_CROWD
// kawałków jednego gatunku w kostce 7 x 7 x 7. Liczy się tylko przy
// wzroście (średnio co kilka minut na kawałek), nie co klatkę.
// ------------------------------------------------------------

import {
    getBlockTypeById,
    getBlockDefinition,
    isOpaqueId,
    isSolidId,
    isLiquidId,
    isReplaceableId
} from '../blocks/BlockRegistry.js';
import { isSoilId } from '../blocks/soil.js';
import { VINES, VINE_CROWD, VINE_REACH, FLAT_MOUNTS, vineInfoById, vineType, supportMount } from '../blocks/vines.js';

// Płaskie pnącze 'north' przylega do bloku po stronie -z itd.
export const MOUNT_OFFSET = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };

// Kliknięta ściana (normalna) -> strona oparcia płaskiego pnącza.
export function wallSide(normal) {
    if (normal.z === 1) return 'north';
    if (normal.z === -1) return 'south';
    if (normal.x === 1) return 'west';
    if (normal.x === -1) return 'east';
    return null;
}

// Pełny blok, na którego boku może rosnąć płaskie pnącze (mur, pień).
export const isWallId = (id) => isSolidId(id) && isOpaqueId(id);

const isFree = (id) => id === 0 || (isReplaceableId(id) && !isLiquidId(id));

// Gdzie i co posadzić owocem gatunku `species` po kliknięciu `hit`
// (raycast): { x, y, z, type } albo null.
export function vinePlanting(world, hit, species) {

    if (!hit?.hit || !VINES[species]) return null;

    const { x, y, z } = hit.block;
    const id = world.getBlockId(x, y, z);
    const mount = supportMount(getBlockTypeById(id));

    // Kratka albo tyczka na ziemi (pergola wisi wysoko - pnącze dochodzi
    // do niej samo).
    if (mount && mount !== 'roof') {
        return isSoilId(world.getBlockId(x, y - 1, z)) ? { x, y, z, type: vineType(species, 'young', mount) } : null;
    }

    const normal = hit.normal ?? { x: 0, y: 0, z: 0 };

    // Bok muru: pnącze w wolnym miejscu przed nim, nad ziemią.
    if (normal.y === 0 && isWallId(id)) {
        const tx = x + normal.x, tz = z + normal.z;
        const side = wallSide(normal);
        if (!side || !isFree(world.getBlockId(tx, y, tz)) || !isSoilId(world.getBlockId(tx, y - 1, tz))) return null;
        return { x: tx, y, z: tz, type: vineType(species, 'young', side) };
    }

    // Ziemia przy murze: pnącze nad nią, na pierwszym murze obok.
    if (normal.y === 1 && isSoilId(id) && isFree(world.getBlockId(x, y + 1, z))) {
        for (const side of FLAT_MOUNTS) {
            const [dx, , dz] = MOUNT_OFFSET[side];
            if (isWallId(world.getBlockId(x + dx, y + 1, z + dz))) return { x, y: y + 1, z, type: vineType(species, 'young', side) };
        }
    }

    return null;

}


// Kierunki wzrostu z mocowania: [dx, dy, dz, waga].
function directions(mount) {
    const up = [0, 1, 0, 3];
    if (mount === 'north' || mount === 'south' || mount === 'trellis') return [up, [1, 0, 0, 1], [-1, 0, 0, 1]];
    if (mount === 'east' || mount === 'west' || mount === 'trellis_z') return [up, [0, 0, 1, 1], [0, 0, -1, 1]];
    if (mount === 'pole') return [up];
    return [[1, 0, 0, 1], [-1, 0, 0, 1], [0, 0, 1, 1], [0, 0, -1, 1]];
}

// Mocowanie pnącza, które z `mount` wejdzie w komórkę (x, y, z), albo null.
export function climbMount(world, x, y, z, mount, up) {

    const id = world.getBlockId(x, y, z);
    const target = supportMount(getBlockTypeById(id));

    if (target) {
        // Na pergolę wchodzi się od dołu (z każdej podpory) albo z daszku obok.
        if (target === 'roof') return up || mount === 'roof' ? 'roof' : null;
        // Kratka - ta sama strona; tyczka - tylko z tyczki.
        if (mount === 'roof') return null;
        if (target === 'pole') return mount === 'pole' ? 'pole' : null;
        return target === mount || FLAT_MOUNTS.includes(mount) ? target : null;
    }

    if (!FLAT_MOUNTS.includes(mount) || !isFree(id)) return null;

    const [dx, dy, dz] = MOUNT_OFFSET[mount];

    return isWallId(world.getBlockId(x + dx, y + dy, z + dz)) ? mount : null;

}

// Ile bloków nad ziemią jest komórka (x, y, z) - przez powietrze i inne
// kawałki pnącza w dół, do pierwszego innego bloku. Najwyżej limit + 1.
export function heightAboveGround(world, x, y, z, limit) {

    for (let k = 1; k <= limit + 1; k++) {
        const id = world.getBlockId(x, y - k, z);
        if (id !== 0 && !vineInfoById(id) && !supportMount(getBlockTypeById(id))) return k;
    }

    return limit + 1;

}

// Czy w zasięgu VINE_REACH bloków w bok od (x, y, z) i niżej (do `limit`
// w dół) jest korzeń gatunku - kawałek pnącza stojący na ziemi. Pnącze
// rozchodzi się tylko blisko swojego korzenia.
export function rootNear(world, x, y, z, species, limit) {

    for (let dy = 0; dy <= limit; dy++) for (let dz = -VINE_REACH; dz <= VINE_REACH; dz++) for (let dx = -VINE_REACH; dx <= VINE_REACH; dx++) {
        if (vineInfoById(world.getBlockId(x + dx, y - dy, z + dz))?.species === species && isSoilId(world.getBlockId(x + dx, y - dy - 1, z + dz))) return true;
    }

    return false;

}

// Ile kawałków gatunku jest w kostce 7 x 7 x 7 wokół (x, y, z).
export function crowdAround(world, x, y, z, species, stop = Infinity) {

    let count = 0;

    for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (vineInfoById(world.getBlockId(x + dx, y + dy, z + dz))?.species === species && ++count >= stop) return count;
    }

    return count;

}

// Kawałek (x, y, z) próbuje zasadzić łodygę obok. Zwraca miejsce albo null.
export function climbVine(world, x, y, z, random = Math.random) {

    const info = vineInfoById(world.getBlockId(x, y, z));

    if (!info) return null;

    const vine = VINES[info.species];

    // Kolejność prób: losowa, ważona (w górę najczęściej).
    const options = directions(info.mount).map(([dx, dy, dz, weight]) => ({ dx, dy, dz, key: random() ** (1 / weight) }));

    // Pergola nad kratką, tyczką albo murem - też "w górę".
    if (info.mount !== 'roof' && info.mount !== 'pole' && !options.some((o) => o.dy === 1)) options.push({ dx: 0, dy: 1, dz: 0, key: random() });

    options.sort((a, b) => b.key - a.key);

    for (const { dx, dy, dz } of options) {

        const tx = x + dx, ty = y + dy, tz = z + dz;
        const mount = climbMount(world, tx, ty, tz, info.mount, dy === 1);

        if (!mount) continue;
        // Przy ziemi pnącze nie rozchodzi się w bok - jeden pień, korona wyżej
        // (inaczej każdy kawałek przy ziemi byłby nowym korzeniem).
        if (dy === 0 && isSoilId(world.getBlockId(tx, ty - 1, tz))) continue;
        if (heightAboveGround(world, tx, ty, tz, vine.height) > vine.height) continue;
        if (crowdAround(world, tx, ty, tz, info.species, VINE_CROWD) >= VINE_CROWD) continue;
        if (!rootNear(world, tx, ty, tz, info.species, vine.height)) continue;

        const type = vineType(info.species, 'young', mount);

        if (world.setBlock(tx, ty, tz, type)) return { x: tx, y: ty, z: tz, type };

    }

    return null;

}

// Co zostaje po zniszczeniu kawałka pnącza: podpora (kratka, tyczka,
// pergola) albo nic.
export function vineLeftover(type) {
    return getBlockDefinition(type)?.vineSupportType ?? null;
}
