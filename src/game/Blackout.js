// ------------------------------------------------------------
// UTRATA PRZYTOMNOŚCI (0.97.0)
//
// W grze nie ma śmierci. Gdy graczowi pod wodą skończy się oddech
// (Wellbeing: zdarzenie 'drown'), obraz gaśnie, a gracz budzi się na
// brzegu kawałek dalej - wyczerpany, ale żywy:
//
//   1. 'out'  - ekran ciemnieje (FADE sekund), gracz nie steruje,
//   2. przeniesienie na brzeg (findShore), resztka energii
//      (Wellbeing.blackout), w grze dla jednego gracza mijają dwie
//      godziny,
//   3. 'in'   - ekran się rozjaśnia.
//
// Obraz gasi element #blackout (StatusPanel czyta phase co klatkę).
// Brzeg szukamy tylko we wczytanych
// chunkach - tam, gdzie na pewno da się stanąć.
// ------------------------------------------------------------

import { isLiquidId, isSolidId } from '../blocks/BlockRegistry.js';

export const FADE_SECONDS = 1.6;
const HOURS_LOST = 2;

// Brzeg: najlepiej w tej odległości od miejsca utonięcia (bloki).
const SHORE_MIN = 10;
const SHORE_BEST = 24;
const SHORE_MAX = 72;
const SCAN_UP = 24;
const SCAN_DOWN = 48;

// Wejście "nic nie wciśnięto" - na czas utraty przytomności.
export const NO_INPUT = new Proxy({}, {
    get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0
});

// Najwyższy blok, na którym da się stanąć w kolumnie (x, z): pełny,
// nie pod wodą, z dwoma wolnymi blokami nad sobą. null - nie ma.
function standingY(world, x, z, fromY) {
    for (let y = fromY + SCAN_UP; y >= fromY - SCAN_DOWN && y > 0; y--) {
        const id = world.getBlockId(x, y, z);
        if (id === 0) continue;
        if (isLiquidId(id) || !isSolidId(id)) return null;
        return world.getBlockId(x, y + 1, z) === 0 && world.getBlockId(x, y + 2, z) === 0 ? y : null;
    }
    return null;
}

function waterNear(world, x, y, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        for (let dy = 0; dy >= -2; dy--) {
            if (isLiquidId(world.getBlockId(x + dx, y + dy, z + dz))) return true;
        }
    }
    return false;
}

// Miejsce na brzegu koło (x, y, z): { x, y, z } (y - poziom stóp) albo
// null. Najpierw brzeg przy wodzie, w ostateczności jakikolwiek ląd.
export function findShore(world, x, y, z) {
    const px = Math.floor(x), py = Math.floor(y), pz = Math.floor(z);
    let shore = null, land = null;
    for (let dx = -SHORE_MAX; dx <= SHORE_MAX; dx += 2) {
        for (let dz = -SHORE_MAX; dz <= SHORE_MAX; dz += 2) {
            const distance = Math.hypot(dx, dz);
            if (distance < SHORE_MIN || distance > SHORE_MAX) continue;
            const ground = standingY(world, px + dx, pz + dz, py);
            if (ground === null) continue;
            const score = Math.abs(distance - SHORE_BEST) + Math.abs(ground - py) * 0.5;
            const spot = { x: px + dx + 0.5, y: ground + 1, z: pz + dz + 0.5, score };
            if (waterNear(world, px + dx, ground, pz + dz)) {
                if (!shore || score < shore.score) shore = spot;
            } else if (!land || score < land.score) land = spot;
        }
    }
    const found = shore ?? land;
    return found ? { x: found.x, y: found.y, z: found.z } : null;
}

export class Blackout {

    constructor(game) {
        this.game = game;
        this.phase = null;
        this.left = 0;
    }

    get active() { return this.phase !== null; }

    start() {
        if (this.active) return;
        this.phase = 'out';
        this.left = FADE_SECONDS;
        this.game.stopMining?.();
    }

    // Co klatkę. Zwraca true, dopóki gracz jest nieprzytomny.
    update(dt) {
        if (!this.active) return false;
        this.left -= dt;
        if (this.left > 0) return true;
        if (this.phase === 'out') {
            this.wake();
            this.phase = 'in';
            this.left = FADE_SECONDS;
            return true;
        }
        this.phase = null;
        return false;
    }

    // Pobudka na brzegu.
    wake() {
        const game = this.game, player = game.player;
        const shore = findShore(game.world, player.pos.x, player.pos.y, player.pos.z);
        if (shore) {
            player.pos.set(shore.x, shore.y, shore.z);
        } else {
            // Nie ma lądu w pobliżu (otwarte morze): wynurzenie na powierzchnię.
            let y = Math.floor(player.pos.y);
            while (y < 255 && isLiquidId(game.world.getBlockId(Math.floor(player.pos.x), y, Math.floor(player.pos.z)))) y++;
            player.pos.y = Math.max(player.pos.y, y - 0.4);
        }
        player.vel.set(0, 0, 0);
        game.wellbeing.blackout();
        // Czas mija tylko w grze dla jednego gracza (u gościa zegar
        // należy do gospodarza, a gospodarz nie zabiera czasu innym).
        if (!game.net) game.time.addHours(HOURS_LOST);
        game.achieve('blackout', { shore: Boolean(shore) });
        game.onMessage?.(shore
            ? 'Straciłeś przytomność pod wodą. Budzisz się na brzegu, wyczerpany.'
            : 'Straciłeś przytomność pod wodą. Budzisz się wyczerpany.');
    }
}
