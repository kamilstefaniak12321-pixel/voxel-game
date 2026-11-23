// ------------------------------------------------------------
// GRA WIELOOSOBOWA - SKRZYNIE, STOŁY STOLARSKIE, OGNISKA (0.92.0)
// I WYRZUCONE PRZEDMIOTY (0.100.0)
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
import { isSeasonable, wetOf } from '../items/moisture.js';
import { restoreWoodpile, pileSign } from '../game/WoodpileState.js';
import { restoreTorch, torchSign } from '../game/TorchBurn.js';
import { restoreTap, tapSign } from '../game/TreeTaps.js';
import { restoreFlames, flamesSign } from '../game/Wildfire.js';
import { restoreTable } from '../game/CarpenterTables.js';
import { restoreSewingTable, sewingTableState } from '../game/SewingTables.js';
import { restoreDrop, dropState } from '../game/Drops.js';

const LEASE = 1.2;

// Pusta lista (gra bez stołów krawieckich - np. w testach).
const NONE = new Map();

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
        // Stoły krawieckie (1.27.0): materiał, barwy, wzór i kroje.
        sewing: {
            map: () => game.sewingTables?.tables ?? NONE,
            save: sewingTableState,
            restore: restoreSewingTable,
            sign: (table) => JSON.stringify(sewingTableState(table)),
            changed: () => { if (game.sewingTables) game.sewingTables.version++; }
        },
        fires: {
            map: () => game.campfires.fires,
            save: (fire) => structuredClone(fire),
            restore: restoreCampfire,
            // Spalanie polan liczy każdy u siebie - podpis bez postępu.
            sign: (fire) => JSON.stringify([fire.logs.map((log) => log.wood + Math.round((log.wet ?? 0) * 4)), fire.tinder, fire.kindling ?? 0, fire.phase, fire.ash,
                Math.round(fire.ignition * 8), fire.embers > 0]),
            changed: () => game.campfires.version++
        },
        // Drewutnie (1.34.0): polana i ich wilgotność co ćwierć.
        woodpiles: {
            map: () => game.woodpiles?.piles ?? NONE,
            save: (pile) => structuredClone(pile),
            restore: restoreWoodpile,
            sign: pileSign,
            changed: () => game.woodpiles?.changed()
        },
        // Paliwo pochodni (1.35.0): etap i paliwo co 5%.
        torches: {
            map: () => game.torchBurn?.torches ?? NONE,
            save: (torch) => ({ ...torch }),
            restore: restoreTorch,
            sign: torchSign,
            changed: () => game.torchBurn?.changed()
        },
        // Nacięcia w pniach (1.41.0): ilość co ćwierć, kubek, zabliźnienie.
        taps: {
            map: () => game.treeTaps?.taps ?? NONE,
            save: (tap) => ({ ...tap }),
            restore: restoreTap,
            sign: tapSign,
            changed: () => game.treeTaps?.changed()
        },
        // Pożar (1.43.0): gdzie widać płomienie (bloki zmienia gospodarz).
        wildfire: {
            map: () => game.wildfire?.flames ?? NONE,
            save: (flame) => ({ ...flame }),
            restore: restoreFlames,
            sign: flamesSign,
            changed: () => game.wildfire?.changed()
        },
        // Wyrzucone przedmioty (0.100.0): wpis po nazwie (id), nie po
        // pozycji. Lot liczy każdy u siebie - podpis to tylko "co i ile".
        drops: {
            map: () => game.drops.drops,
            key: (drop) => drop.id,
            save: dropState,
            restore: restoreDrop,
            // (Typ zmienia się też, gdy mokra glina wyschnie; polana -
            // z wilgotnością co ćwierć, żeby gość podniósł to, co wyschło.)
            sign: (drop) => `${drop.type}:${drop.count}${isSeasonable(drop.type) ? `:${Math.round(wetOf(drop) * 4)}` : ''}`,
            changed: () => game.drops.changed()
        }
    };
}

// Nazwa wpisu: własna (system.key) albo pozycja bloku.
export function entryKey(system, entry) {
    return system.key ? system.key(entry) : `${entry.x},${entry.y},${entry.z}`;
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
            // W czasie LEASE zmiana czeka: nie oznaczamy jej jako wysłanej,
            // więc wyjdzie przy pierwszym sprawdzeniu po jego upływie. (Do
            // 1.10.1 była oznaczana od razu - edycja albo usunięcie wpisu
            // tuż po cudzej zmianie nigdy nie docierały do innych.)
            const leased = (key) => this.clock - (this.remoteAt.get(`${name}:${key}`) ?? -Infinity) < LEASE;
            for (const [key, entry] of map) {
                const sign = system.sign(entry);
                if (sent.get(key) === sign || leased(key)) continue;
                sent.set(key, sign);
                this.send(name, key, system.save(entry));
            }
            for (const key of [...sent.keys()]) {
                if (map.has(key) || leased(key)) continue;
                sent.delete(key);
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
        if (!restored || entryKey(system, restored) !== key) return false;
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
