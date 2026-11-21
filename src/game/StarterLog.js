// ------------------------------------------------------------
// POWALONY PIEŃ PRZY MIEJSCU STARTU (1.37.0, docs/powalone-drzewa.md)
//
// Gołą ręką nie da się już ściąć drzewa, więc pierwsze drewno bierze
// się z powalonego pnia. W lesie leżą co jakiś czas (generator terenu),
// ale nowy świat nie może zależeć od szczęścia: przy miejscu startu
// ZAWSZE leży jeden - kilka kroków przed graczem.
//
// Kładziemy go raz, w nowym świecie, gdy wczytają się chunki dookoła
// (worldInfo.starterLog zapamiętuje, że już jest). Stare światy go nie
// dostają - tam gracz ma już swoje narzędzia.
// ------------------------------------------------------------

import { placeFallenInWorld, fallenSpecies, FALLEN_DIRECTIONS } from '../world/trees/FallenTrees.js';
import { logSpecies } from './TreeScan.js';

// Długość pnia i odległość od gracza (bloki).
export const STARTER_LENGTH = 6;
// Miejsca do sprawdzenia: [w przód, w bok] od gracza - najpierw na wprost.
const SPOTS = [[6, -3], [7, 2], [5, -6], [8, -1], [6, 5], [9, -4], [10, 3], [4, 7], [-6, -3], [-7, 3], [11, -8], [12, 6], [-9, -6], [14, 0]];
// Tyle bloków dookoła startu szukamy drzewa, którego gatunek ma pień.
const SPECIES_RANGE = 20;
// Po tylu próbach (sekundach) dajemy spokój - nie ma gdzie go położyć.
const MAX_TRIES = 40;

// Gatunek najbliższego drzewa przy (x, z) albo 'spruce'.
export function nearbySpecies(world, x, z) {
    let best = null;
    for (let dx = -SPECIES_RANGE; dx <= SPECIES_RANGE; dx += 1) {
        for (let dz = -SPECIES_RANGE; dz <= SPECIES_RANGE; dz += 1) {
            const distance = Math.hypot(dx, dz);
            if (best && distance >= best.distance) continue;
            const ground = world.getGroundY(x + dx, z + dz);
            for (let y = ground; y <= ground + 2; y++) {
                const species = fallenSpecies(logSpecies(world.getBlockId(x + dx, y, z + dz)));
                if (species) { best = { species, distance }; break; }
            }
        }
    }
    return best?.species ?? 'spruce';
}

// Kładzie pień przy (x, z); forward - kierunek, w który patrzy gracz
// ({ x, z }, długość 1). Zwraca { x, z, species, blocks } albo null.
export function placeStarterLog(world, x, z, forward = { x: 0, z: -1 }, random = Math.random) {
    const px = Math.floor(x), pz = Math.floor(z);
    const species = nearbySpecies(world, px, pz);
    for (const [ahead, side] of SPOTS) {
        const sx = Math.round(px + forward.x * ahead - forward.z * side), sz = Math.round(pz + forward.z * ahead + forward.x * side);
        // W poprzek spojrzenia gracza (widać cały pień), potem wzdłuż.
        const across = Math.abs(forward.x) > Math.abs(forward.z) ? [1, 3, 0, 2] : [0, 2, 1, 3];
        for (const direction of across) {
            const [dx, dz] = FALLEN_DIRECTIONS[direction];
            // Pień nie może przejść przez miejsce, w którym stoi gracz.
            let clear = true;
            for (let i = 0; i < STARTER_LENGTH; i++) if (Math.abs(sx + dx * i - px) <= 1 && Math.abs(sz + dz * i - pz) <= 1) clear = false;
            if (!clear) continue;
            const blocks = placeFallenInWorld(world, sx, sz, direction, species, STARTER_LENGTH, random);
            if (blocks) return { x: sx, z: sz, species, direction, blocks };
        }
    }
    return null;
}

export class StarterLog {

    // fresh - świat właśnie powstał (gracz stoi w miejscu startu).
    constructor(game, fresh) {
        this.game = game;
        const info = game.worldInfo;
        // Tylko gospodarz / gra dla jednego gracza, tylko raz.
        this.pending = Boolean(fresh) && info && info.starterLog === undefined && !(game.net && game.net.isHost === false);
        this.wait = 1;
        this.tries = 0;
        this.placed = null;
    }

    update(dt) {
        if (!this.pending) return;
        this.wait -= dt;
        if (this.wait > 0) return;
        this.wait = 1;
        const game = this.game, world = game.world, player = game.player;
        // Czekamy, aż wczytają się chunki dookoła.
        const cx = world.toChunkCoord(player.pos.x), cz = world.toChunkCoord(player.pos.z);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!world.getChunk(cx + dx, cz + dz)) return;
        const yaw = player.yaw ?? 0;
        const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        this.placed = placeStarterLog(world, player.pos.x, player.pos.z, forward);
        if (this.placed || ++this.tries >= MAX_TRIES) {
            this.pending = false;
            game.worldInfo.starterLog = Boolean(this.placed);
        }
    }

}
