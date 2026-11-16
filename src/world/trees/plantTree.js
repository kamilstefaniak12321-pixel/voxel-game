import { CHUNK_HEIGHT } from '../../config.js';

import { AIR_ID, isLeavesId, isLiquidId, isPlantId, isReplaceableId, isSoilId, getBlockTypeById, getBlockId, getGrowth } from '../../blocks/BlockRegistry.js';

import { buildTree } from './TreeShapes.js';

import { canReplace } from './Forests.js';

// ------------------------------------------------------------
// DRZEWO W ŚWIECIE (sadzonka, która urosła, albo komenda /drzewa)
//
// Ten sam kształt co w generatorze terenu (TreeShapes.js) i te same
// zasady wstawiania (Forests.js - placeTree), tylko blok po bloku przez
// world.setBlock (światło, przebudowa meshy, zapis zmienionych chunków).
//
// Drzewo rośnie tylko wtedy, gdy pień ma miejsce: w każdej komórce
// pnia i gałęzi jest powietrze, roślina albo liście (blok budynku czy
// skała nad sadzonką - drzewo czeka). Liście omijają zajęte miejsca.
//
// Sadzonka w wodzie (namorzyn, 1.10.0): drzewo wyrasta z wody jak
// w generatorze (Forests.placeTree - wade): pień i korzenie wypierają
// wodę (korzenie podporowe pod wodą stają się pniem - ażurowy blok
// zostawiłby w wodzie dziurę), liście wody nie ruszają.
// ------------------------------------------------------------

// Czy drzewo stanie w wodzie: w komórce podstawy jest woda albo wodna
// sadzonka.

function wades(world, x, y, z) {

    return isLiquidId(world.getBlockId(x, y, z));

}

// Czy drzewo `shape` zmieści się z podstawą pnia w (x, y, z).
// Komórka (x, y, z) - tam jest sadzonka - się nie liczy.

export function treeFits(world, x, y, z, shape) {

    if (y < 1 || y + shape.top >= CHUNK_HEIGHT) {
        return false;
    }

    const wade = wades(world, x, y, z);

    for (const [dx, dy, dz, type] of shape.blocks) {

        if (isLeavesId(getBlockId(type)) || (dx === 0 && dy === 0 && dz === 0)) {
            continue;
        }

        const id = world.getBlockId(x + dx, y + dy, z + dz);

        if (!canReplace(id, true) && !(wade && isLiquidId(id))) {
            return false;
        }

    }

    return true;

}


// Stawia drzewo gatunku `species` z podstawą pnia w (x, y, z).
// Zwraca kształt drzewa albo null (nie ma miejsca). force - bez
// sprawdzania miejsca (pień omija tylko zajęte komórki).

export function plantTree(world, x, y, z, species, seed, size = 0.5, force = false) {

    const shape = buildTree(species, seed, size);

    if (!force && !treeFits(world, x, y, z, shape)) {
        return null;
    }

    // Przed pierwszym blokiem - potem w podstawie stoi już pień.
    const wade = wades(world, x, y, z);
    const wadeLog = `${species}_log`;
    const wadeRoots = wade ? getBlockId(`${species}_roots`) : AIR_ID;

    if (y < 1 || y + shape.top >= CHUNK_HEIGHT) {
        return null;
    }


    // Najpierw pień i gałęzie (sadzonka zamienia się w pień), potem liście.

    const ordered = [...shape.blocks].sort((a, b) => isLeavesId(getBlockId(a[3])) - isLeavesId(getBlockId(b[3])));

    for (const [dx, dy, dz, type] of ordered) {

        const id = world.getBlockId(x + dx, y + dy, z + dz);

        const isBase = dx === 0 && dy === 0 && dz === 0;

        if (wade && isLiquidId(id)) {

            const typeId = getBlockId(type);

            if (!isLeavesId(typeId)) {
                world.setBlock(x + dx, y + dy, z + dz, type);
            }
            else if (typeId === wadeRoots) {
                world.setBlock(x + dx, y + dy, z + dz, wadeLog);
            }

            continue;

        }

        if (isBase || canReplace(id, !isLeavesId(getBlockId(type)))) {
            world.setBlock(x + dx, y + dy, z + dz, type);
        }

    }


    // Pień schodzi do gruntu (stok, nabiegi korzeniowe).

    for (const [dx, dz, type] of shape.roots) {

        const base = world.getBlock(x + dx, y, z + dz);

        if (base !== type && !(wade && base === wadeLog)) {
            continue;
        }

        for (let yy = y - 1, depth = 0; yy >= 1 && depth < 4; yy--, depth++) {

            const below = world.getBlockId(x + dx, yy, z + dz);

            if (wade && isLiquidId(below)) {
                world.setBlock(x + dx, yy, z + dz, isLeavesId(getBlockId(type)) ? wadeLog : type);
                continue;
            }

            if (!canReplace(below, true)) {
                break;
            }

            world.setBlock(x + dx, yy, z + dz, type);

        }

    }


    // Opadłe liście na trawie dookoła.

    for (const [dx, dz] of shape.litter) {

        for (let yy = y + 2; yy >= Math.max(1, y - 4); yy--) {

            const below = world.getBlockId(x + dx, yy - 1, z + dz);

            if (isLiquidId(below)) break;

            if (below === AIR_ID || isPlantId(below) || isLeavesId(below)) {
                continue;
            }

            const here = world.getBlockId(x + dx, yy, z + dz);

            if (isSoilId(below) && !isLiquidId(here) && (here === AIR_ID || isReplaceableId(here) || isPlantId(here))) {
                world.setBlock(x + dx, yy, z + dz, `${species}_leaf_litter`);
            }

            break;

        }

    }

    return shape;

}


// Gatunek drzewa, z którego jest sadzonka w (x, y, z) - albo null.

export function saplingSpecies(world, x, y, z) {

    return getGrowth(getBlockTypeById(world.getBlockId(x, y, z)))?.tree ?? null;

}
