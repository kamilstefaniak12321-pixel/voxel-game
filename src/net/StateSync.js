// ------------------------------------------------------------
// GRA WIELOOSOBOWA - SKRZYNIE, STOŁY STOLARSKIE I OGNISKA (0.92.0)
//
// Każdy z tych systemów trzyma wpisy po pozycji bloku ("x,y,z"). Co
// chwilę porównujemy podpis każdego wpisu z ostatnio wysłanym i wysyłamy
// tylko zmienione (albo usunięte - v: null). Odebrany wpis podmieniamy
// w miejscu (otwarta skrzynia w ekwipunku pokazuje ten sam obiekt).
//
// Wpis zmieniony przez kogoś innego przez chwilę (LEASE) nie wraca do
// niego z naszymi drobnymi zmianami (np. gaśnięcie rozpalania, gdy ktoś
// inny właśnie trzyma krzesiwo).
// ------------------------------------------------------------

import { restoreChest, chestState } from '../game/ChestState.js';
import { restoreCampfire } from '../game/CampfireState.js';
import { restoreTable } from '../game/CarpenterTables.js';

const LEASE = 1.2;

export function stateSystems(game) {
    return {
        chests: {
            map: () => game.chests.chests,
            save: (chest) => chestState(chest),
            restore: restoreChest,
            sign: (chest) => JSON.stringify(chestState(chest).layers),
            changed: () => game.chests.changed()
        },
        tables: {
            map: () => game.carpenterTables.tables,
            save: ({ x, y, z, planks, count }) => ({ x, y, z, planks, count }),
            restore: restoreTable,
            sign: (table) => `${table.planks}:${table.count}`,
            changed: () => game.carpenterTables.version++
        },
        fires: {
            map: () => game.campfires.fires,
            save: (fire) => structuredClone(fire),
            restore: restoreCampfire,
            // Spalanie polan liczy każdy u siebie - podpis bez postępu.
            sign: (fire) => JSON.stringify([fire.logs.map((log) => log.wood), fire.tinder, fire.phase, fire.ash,
                Math.round(fire.ignition * 8), fire.embers > 0]),
            changed: () => game.campfires.version++
        }
    };
}

export class StateSync {

    // send(sys, key, value) - wysyła zmianę (value null - usunięte).
    constructor(game, send) {
        this.game = game;
        this.send = send;
        this.systems = stateSystems(game);
        this.sent = Object.fromEntries(Object.keys(this.systems).map((name) => [name, new Map()]));
        this.remoteAt = new Map();
        this.clock = 0;
        this.wait = 0;
    }

    // Stan po wejściu do świata (bez wysyłania).
    remember() {
        for (const [name, system] of Object.entries(this.systems)) {
            const sent = this.sent[name];
            sent.clear();
            for (const [key, entry] of system.map()) sent.set(key, system.sign(entry));
        }
    }

    snapshot(name) {
        const system = this.systems[name];
        return [...system.map().values()].map(system.save);
    }

    update(dt, interval = 0.2) {
        this.clock += dt;
        this.wait -= dt;
        if (this.wait > 0) return;
        this.wait = interval;
        for (const [name, system] of Object.entries(this.systems)) {
            const sent = this.sent[name], map = system.map();
            for (const [key, entry] of map) {
                const sign = system.sign(entry);
                if (sent.get(key) === sign) continue;
                sent.set(key, sign);
                if (this.clock - (this.remoteAt.get(`${name}:${key}`) ?? -Infinity) < LEASE) continue;
                this.send(name, key, system.save(entry));
            }
            for (const key of [...sent.keys()]) {
                if (map.has(key)) continue;
                sent.delete(key);
                if (this.clock - (this.remoteAt.get(`${name}:${key}`) ?? -Infinity) < LEASE) continue;
                this.send(name, key, null);
            }
        }
    }

    // Wszystkie wpisy jeszcze raz (gospodarz co jakiś czas - drobne
    // różnice, np. postęp spalania, się wyrównują).
    resendAll(name) {
        const system = this.systems[name];
        for (const [key, entry] of system.map()) this.send(name, key, system.save(entry));
    }

    // Zmiana od kogoś innego. Zwraca true, gdy coś zmieniła.
    apply(name, key, value) {
        const system = this.systems[name];
        if (!system || typeof key !== 'string') return false;
        const map = system.map();
        this.remoteAt.set(`${name}:${key}`, this.clock);
        if (value === null) {
            if (!map.has(key)) return false;
            map.delete(key);
            this.sent[name].delete(key);
            system.changed();
            return true;
        }
        const restored = system.restore(value);
        if (!restored || `${restored.x},${restored.y},${restored.z}` !== key) return false;
        const existing = map.get(key);
        if (existing) {
            for (const field of Object.keys(existing)) delete existing[field];
            Object.assign(existing, restored);
        } else map.set(key, restored);
        this.sent[name].set(key, system.sign(map.get(key)));
        system.changed();
        return true;
    }
}
