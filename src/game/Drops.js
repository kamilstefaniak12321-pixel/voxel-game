// ------------------------------------------------------------
// WYRZUCONE PRZEDMIOTY (0.100.0)
//
// Pomysł Kamila: przedmiotu z ekwipunku da się pozbyć - wyrzucony (klawisz
// Q, albo kliknięcie poza oknem ekwipunku) leży w świecie jako
// pomniejszony model i można go podnieść, wchodząc na niego.
//
// Sama logika (bez rysowania - rendering/DropRenderer.js):
//   throwFromPlayer(type, count) - rzut przed siebie,
//   spawn(type, count, pozycja, prędkość) - przedmiot w świecie,
//   update(dt)   - spadanie, leżenie, podnoszenie, sklejanie stosów,
//   getState()   - do zapisu świata (worldInfo.drops).
//
// Jeden wpis: { id, type, count, x, y, z, vx, vy, vz, rest, age, wait }.
//   rest - leży (nie liczymy mu fizyki),
//   wait - ile sekund jeszcze nie da się go podnieść (żeby wyrzucony
//          przedmiot nie wrócił od razu do ręki),
//   dry  - ile sekund mokra gliniana rzecz schła już na słońcu (1.1.0 -
//          items/clay.js): po DRY_SECONDS zamienia się w suchą.
//
// Przedmiot nie znika z czasem - leży, dopóki ktoś go nie podniesie.
// Gdy jest ich za dużo (DROP_LIMIT), znikają najstarsze.
//
// Gra ze znajomymi: wpisy rozsyła StateSync (net/StateSync.js, system
// 'drops') - każdy widzi leżące przedmioty i może je podnieść.
// ------------------------------------------------------------

import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { itemExists, currentType } from '../items/ItemRegistry.js';
import { isLiquidId } from '../blocks/BlockRegistry.js';
import { STACK_SIZE } from './Inventory.js';
import { sunDries, DRY_SECONDS, DRY_SKY_LIGHT } from '../items/clay.js';
import { driesInto } from '../items/drying.js';
import { makeItem, sameBatch, blend } from '../items/freshness.js';

// Z jakiej odległości (bloki) gracz podnosi przedmiot.
export const DROP_PICKUP_RADIUS = 1.4;
// Tyle sekund wyrzucony przedmiot nie wraca do tego, kto go wyrzucił.
export const DROP_THROW_WAIT = 1.5;
// Cudzy albo wczytany przedmiot - krótka chwila, zanim da się go podnieść.
export const DROP_WAIT = 0.4;
// Leżące obok siebie takie same przedmioty łączą się w jeden stos.
export const DROP_MERGE_RADIUS = 0.9;
// Najwięcej leżących przedmiotów w świecie.
export const DROP_LIMIT = 400;

// Rzut: prędkość do przodu i w górę (bloki na sekundę).
const THROW_SPEED = 5.2;
const THROW_LIFT = 2.4;
const GRAVITY = 22;
// Połowa szerokości i wysokość przedmiotu (do kolizji).
const HALF = 0.14;
const MERGE_SECONDS = 0.5;

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

let counter = 0;

// Niepowtarzalna nazwa wpisu (także między graczami w jednej grze).
function newId() {
    counter = (counter + 1) % 1e6;
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}${counter.toString(36)}`;
}

// Wpis z zapisu albo od innego gracza - albo null, gdy jest uszkodzony.
export function restoreDrop(value) {
    if (!value || typeof value !== 'object') return null;
    const type = currentType(value.type);
    if (!itemExists(type)) return null;
    const count = Math.floor(value.count);
    if (!(count >= 1)) return null;
    const { x, y, z } = value;
    if (![x, y, z].every(Number.isFinite) || y < -8 || y > CHUNK_HEIGHT + 64 ||
        Math.abs(x) > WORLD_BORDER || Math.abs(z) > WORLD_BORDER) return null;
    const id = typeof value.id === 'string' && /^[a-z0-9]{4,32}$/.test(value.id) ? value.id : newId();
    return {
        id, type, count: Math.min(count, STACK_SIZE * 4), x, y, z,
        vx: finite(value.vx), vy: finite(value.vy), vz: finite(value.vz),
        rest: value.rest === true, age: 0, wait: DROP_WAIT,
        dry: Math.max(0, Math.min(DRY_SECONDS, finite(value.dry))),
        ...freshField(type, value.fresh)
    };
}

// Świeżość psującego się jedzenia (items/freshness.js) - pole wpisu.
function freshField(type, fresh) {
    const item = makeItem(type, 1, Number(fresh));
    return item.fresh === undefined ? {} : { fresh: Math.round(item.fresh * 1000) / 1000 };
}

// To, co idzie do zapisu i do innych graczy.
export function dropState(drop) {
    const round = (value) => Math.round(value * 100) / 100;
    return {
        id: drop.id, type: drop.type, count: drop.count,
        x: round(drop.x), y: round(drop.y), z: round(drop.z),
        vx: round(drop.vx), vy: round(drop.vy), vz: round(drop.vz), rest: drop.rest,
        ...(drop.dry > 0 ? { dry: Math.round(drop.dry) } : {}),
        ...freshField(drop.type, drop.fresh)
    };
}

export class Drops {

    // saved - worldInfo.drops (albo nic).
    constructor(game, saved = []) {
        this.game = game;
        this.drops = new Map();
        this.version = 0;
        this.mergeIn = MERGE_SECONDS;
        // Rysowanie (DropRenderer) - ustawia Game; w testach null.
        this.renderer = null;
        for (const value of Array.isArray(saved) ? saved.slice(0, DROP_LIMIT) : []) {
            const drop = restoreDrop(value);
            if (drop) this.drops.set(drop.id, drop);
        }
    }

    getState() { return [...this.drops.values()].map(dropState); }

    // Zmiana z sieci (StateSync).
    changed() { this.version++; }

    // Nowy przedmiot w świecie. position - { x, y, z } (dół przedmiotu),
    // velocity - { x, y, z } albo nic. Zwraca wpis.
    // fresh - świeżość jedzenia (pominięte: świeże).
    spawn(type, count, position, velocity = null, wait = DROP_WAIT, fresh) {
        if (!itemExists(type) || !(count >= 1)) return null;
        const drop = {
            id: newId(), type, count: Math.floor(count),
            x: position.x, y: position.y, z: position.z,
            vx: velocity?.x ?? 0, vy: velocity?.y ?? 0, vz: velocity?.z ?? 0,
            rest: false, age: 0, wait, dry: 0,
            ...freshField(type, fresh)
        };
        this.drops.set(drop.id, drop);
        // Za dużo przedmiotów: znikają najstarsze (Map trzyma kolejność).
        while (this.drops.size > DROP_LIMIT) this.drops.delete(this.drops.keys().next().value);
        this.version++;
        return drop;
    }

    // Rzut przed siebie z wysokości oczu: tam, gdzie gracz patrzy.
    throwFromPlayer(type, count, fresh) {
        const player = this.game.player;
        const yaw = player.yaw, pitch = player.pitch ?? 0;
        const flat = Math.cos(pitch);
        const direction = { x: -Math.sin(yaw) * flat, y: Math.sin(pitch), z: -Math.cos(yaw) * flat };
        const position = {
            x: player.pos.x + direction.x * 0.35,
            y: player.pos.y + (player.eyeHeight ?? 1.6) - 0.35,
            z: player.pos.z + direction.z * 0.35
        };
        // Twarzą przy ścianie: przedmiot startuje z miejsca gracza, nie ze
        // środka bloku.
        if (this.solid(position.x, position.y, position.z)) {
            position.x = player.pos.x;
            position.z = player.pos.z;
        }
        return this.spawn(type, count, position, {
            x: direction.x * THROW_SPEED + (player.vel?.x ?? 0) * 0.5,
            y: direction.y * THROW_SPEED + THROW_LIFT,
            z: direction.z * THROW_SPEED + (player.vel?.z ?? 0) * 0.5
        }, DROP_THROW_WAIT, fresh);
    }

    // Wyrzucenie z wybranego miejsca paska: jedna sztuka albo cały stos.
    // Zwraca true, gdy coś wyrzucono.
    throwSelected(all = false) {
        const inventory = this.game.inventory;
        const item = inventory.selectedItem;
        if (!item) return false;
        const count = all ? item.count : 1;
        if (!this.throwFromPlayer(item.type, count, item.fresh)) return false;
        inventory.take(inventory.selected, count);
        this.game.sounds?.play('harvest', { volume: 0.45, pitch: 0.75 });
        this.game.achieve?.('dropped', { type: item.type, count });
        return true;
    }

    solid(x, y, z) {
        return this.game.world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
    }

    // Fizyka jednego przedmiotu: grawitacja, kolizje osobno w każdej osi.
    move(drop, dt) {
        const world = this.game.world;
        // Niewczytany teren: przedmiot czeka w powietrzu (nie przeleci przez ziemię).
        if (world.getChunk && !world.getChunk(world.toChunkCoord(Math.floor(drop.x)), world.toChunkCoord(Math.floor(drop.z)))) return;

        const inWater = isLiquidId(world.getBlockId(Math.floor(drop.x), Math.floor(drop.y + 0.1), Math.floor(drop.z)));
        drop.vy -= GRAVITY * dt * (inWater ? 0.25 : 1);
        if (inWater) {
            const drag = Math.max(0, 1 - 4 * dt);
            drop.vx *= drag; drop.vz *= drag;
            drop.vy = Math.max(drop.vy * drag, -1.2);
        }

        // Krótkie kroki, żeby szybki przedmiot nie przeskoczył cienkiej ściany.
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(drop.vx), Math.abs(drop.vy), Math.abs(drop.vz)) * dt / 0.4));
        const step = dt / steps;

        for (let i = 0; i < steps; i++) {
            const nx = drop.x + drop.vx * step;
            if (this.solid(nx + Math.sign(drop.vx) * HALF, drop.y + 0.05, drop.z)) drop.vx = 0; else drop.x = nx;
            const nz = drop.z + drop.vz * step;
            if (this.solid(drop.x, drop.y + 0.05, nz + Math.sign(drop.vz) * HALF)) drop.vz = 0; else drop.z = nz;
            const ny = drop.y + drop.vy * step;
            if (drop.vy <= 0 && this.solid(drop.x, ny, drop.z)) {
                // Na ziemi: staje na wierzchu bloku i wyhamowuje.
                drop.y = Math.floor(ny) + 1;
                drop.vy = 0;
                drop.vx *= 0.5; drop.vz *= 0.5;
                if (Math.hypot(drop.vx, drop.vz) < 0.3) {
                    drop.vx = 0; drop.vz = 0; drop.rest = true;
                    this.version++;
                    return;
                }
            }
            else if (drop.vy > 0 && this.solid(drop.x, ny + HALF * 2, drop.z)) drop.vy = 0;
            else drop.y = ny;
        }

        // Poniżej świata nic nie ma - przedmiot wraca na dno.
        if (drop.y < -4) { drop.y = 0; drop.vy = 0; drop.rest = true; this.version++; }
    }

    // SUSZENIE GLINY (1.1.0). Mokry kubek albo cegła schnie, gdy leży
    // w dzień pod gołym niebem i nie w wodzie; po DRY_SECONDS zamienia
    // się w suchą rzecz (cały stos naraz).
    updateDrying(drop, dt) {
        const into = driesInto(drop.type);
        if (!into || !drop.rest) return;
        const game = this.game, world = game.world;
        if (!sunDries(game.time?.days ?? 0.5)) return;
        const x = Math.floor(drop.x), y = Math.floor(drop.y + 0.1), z = Math.floor(drop.z);
        if (isLiquidId(world.getBlockId(x, y, z))) return;
        if ((world.getLight?.(x, y, z)?.sky ?? 15) < DRY_SKY_LIGHT) return;
        drop.dry = (drop.dry ?? 0) + dt;
        if (drop.dry < DRY_SECONDS) return;
        drop.type = into;
        drop.dry = 0;
        delete drop.fresh;
        this.version++;
        game.achieve?.('dried', { type: into, count: drop.count });
    }

    // Czy leżący przedmiot dalej ma na czym leżeć (ktoś wykopał blok).
    supported(drop) {
        return this.solid(drop.x, drop.y - 0.05, drop.z);
    }

    update(dt) {
        if (!(dt > 0)) return;
        const game = this.game, player = game.player, inventory = game.inventory;
        const canPick = !game.sleep?.active && !game.blackout?.active;
        const px = player.pos.x, py = player.pos.y + 0.8, pz = player.pos.z;

        for (const [id, drop] of this.drops) {
            drop.age += dt;
            drop.wait = Math.max(0, drop.wait - dt);

            if (!drop.rest) this.move(drop, Math.min(dt, 0.1));
            else if (Math.abs(drop.x - px) < 24 && Math.abs(drop.z - pz) < 24 && !this.supported(drop)) drop.rest = false;

            this.updateDrying(drop, dt);

            // Podnoszenie: tyle, ile się zmieści; reszta zostaje.
            if (!canPick || drop.wait > 0) continue;
            const distance = Math.hypot(drop.x - px, (drop.y - py) * 0.7, drop.z - pz);
            if (distance > DROP_PICKUP_RADIUS) continue;
            const left = inventory.add(drop.type, drop.count, 0, inventory.slots.length, drop.fresh);
            if (left === drop.count) continue;
            const taken = drop.count - left;
            game.sounds?.play('harvest', { volume: 0.5, pitch: 1.25 });
            game.achieve?.('pickedUp', { type: drop.type, count: taken });
            this.version++;
            if (left > 0) drop.count = left;
            else this.drops.delete(id);
        }

        this.mergeIn -= dt;
        if (this.mergeIn <= 0) {
            this.mergeIn = MERGE_SECONDS;
            this.merge();
        }

        this.renderer?.update(dt, this.drops);
    }

    // Leżące blisko siebie takie same przedmioty łączą się w jeden stos.
    merge() {
        const resting = [...this.drops.values()].filter((drop) => drop.rest);
        for (let i = 0; i < resting.length; i++) {
            const a = resting[i];
            if (!this.drops.has(a.id)) continue;
            for (let j = i + 1; j < resting.length; j++) {
                const b = resting[j];
                if (!this.drops.has(b.id) || a.count + b.count > STACK_SIZE || !sameBatch(a, b.type, b.fresh)) continue;
                if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > DROP_MERGE_RADIUS) continue;
                blend(a, b.count, b.fresh);
                a.wait = Math.max(a.wait, b.wait);
                // Połączony stos jest tak suchy, jak jego wilgotniejsza część.
                a.dry = Math.min(a.dry ?? 0, b.dry ?? 0);
                this.drops.delete(b.id);
                this.version++;
            }
        }
    }

    dispose() {
        this.renderer?.dispose();
        this.drops.clear();
    }
}
