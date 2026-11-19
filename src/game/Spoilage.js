// ------------------------------------------------------------
// PSUCIE SIĘ JEDZENIA (1.23.0) - kto, gdzie i kiedy
//
// Zasady i liczby: items/spoilage.js. Tutaj: co godzinę gry przegląd
// plecaka gracza i skrzyń.
//
//   plecak   - temperatura tam, gdzie stoi gracz (pogoda),
//   skrzynia - w wczytanym terenie: ta sama temperatura; skrzynia, nad
//              którą nie widać nieba, jest piwniczką. Daleka skrzynia
//              (teren nie jest wczytany): temperatura pory roku
//              (SEASON_TEMPERATURE) i zwykłe tempo skrzyni.
//
// Zepsute sztuki zamieniają się w kompost w tym samym miejscu (plecak:
// w wolnym miejscu plecaka; gdy go nie ma - przepadają). Zepsuta potrawa
// oddaje miskę.
//
// Tylko w trybie przygody. W grze ze znajomymi każdy liczy swój plecak,
// a skrzynie - gospodarz.
// ------------------------------------------------------------

import { DAY_LENGTH_MINUTES } from '../config.js';
import { seasonAt } from '../sky/Seasons.js';
import { getFood } from '../items/foods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { COMPOST, isPerishable, spoilChance, spoiledCount } from '../items/spoilage.js';

// Co ile dób gry przegląd (godzina gry).
export const SPOIL_STEP_DAYS = 1 / 24;

// Temperatura dalekich skrzyń według pory roku (°C).
export const SEASON_TEMPERATURE = [10, 22, 10, -3];

// Od jakiej jasności nieba nad skrzynią to już nie piwniczka (0-15).
const CELLAR_SKY = 4;

const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;

export class Spoilage {

    constructor(game) {
        this.game = game;
        this.pending = 0;
        // Mnożnik tempa (/psucie tempo) - nie zapisuje się.
        this.speed = 1;
        this.random = Math.random;
        // Ile sztuk zepsuło się od wejścia do świata.
        this.spoiled = 0;
    }

    get active() {
        return this.game.mode === 'adventure';
    }

    update(dt) {
        if (!this.active) return;
        this.pending += dt * this.speed / DAY_SECONDS;
        if (this.pending < SPOIL_STEP_DAYS) return;
        const days = this.pending;
        this.pending = 0;
        this.step(days);
    }

    // Przespany czas (Game.advanceWorld).
    advance(seconds) {
        if (!this.active || !(seconds > 0)) return;
        this.step(seconds * this.speed / DAY_SECONDS);
    }

    temperature() {
        const value = this.game.weather?.temperature;
        return Number.isFinite(value) ? value : SEASON_TEMPERATURE[seasonAt(this.game.time?.days ?? 0).index];
    }

    // Miejsce skrzyni: 'chest' albo 'cellar' (nie widać nad nią nieba).
    placeOf(chest) {
        const sky = this.game.world.getLight?.(chest.x, chest.y + 1, chest.z)?.sky;
        return Number.isFinite(sky) && sky < CELLAR_SKY ? 'cellar' : 'chest';
    }

    // Mija `days` dób gry.
    step(days) {

        const game = this.game;
        const here = this.temperature();
        const lost = new Map();

        // --- Plecak ----------------------------------------------------
        const inventory = game.inventory;

        if (inventory) {
            for (let index = 0; index < inventory.slots.length; index++) {
                const item = inventory.get(index);
                if (!item || !isPerishable(item.type)) continue;
                const count = spoiledCount(item.count, spoilChance(item.type, days, here, 'pack'), this.random);
                if (count === 0) continue;
                inventory.take(index, count);
                const returns = getFood(item.type)?.returns;
                if (returns) inventory.add(returns, count);
                inventory.add(COMPOST, count);
                lost.set(item.type, (lost.get(item.type) ?? 0) + count);
                this.spoiled += count;
            }
        }

        if (lost.size > 0) {
            const text = [...lost].map(([type, count]) => `${count} × ${getItemLabel(type)}`).join(', ');
            game.onNotice?.(`Zepsuło się: ${text}`);
            game.sounds?.play('harvest', { volume: 0.35, pitch: 0.7 });
            game.achieve?.('spoiled', { count: [...lost.values()].reduce((sum, count) => sum + count, 0) });
        }

        // --- Skrzynie ----------------------------------------------------
        const chests = game.chests;

        if (!chests || game.net?.isClient) return;

        const world = game.world;
        const season = SEASON_TEMPERATURE[seasonAt(game.time?.days ?? 0).index];
        let changed = false;

        for (const chest of chests.chests.values()) {

            const loaded = Boolean(world.getChunk(world.toChunkCoord(chest.x), world.toChunkCoord(chest.z)));
            const place = loaded ? this.placeOf(chest) : 'chest';
            const temperature = loaded ? here : season;

            for (const cells of chest.layers) {
                for (let cell = 0; cell < cells.length; cell++) {
                    const item = cells[cell];
                    if (!item || !isPerishable(item.type)) continue;
                    const count = spoiledCount(item.count, spoilChance(item.type, days, temperature, place), this.random);
                    if (count === 0) continue;
                    // W przegródce zostaje jeden rodzaj rzeczy: gdy psuje się
                    // cały stos, jego miejsce zajmuje kompost; inaczej zepsute
                    // sztuki po prostu ubywają (kompost nie ma gdzie leżeć).
                    if (count >= item.count) cells[cell] = { type: COMPOST, count: item.count };
                    else item.count -= count;
                    this.spoiled += count;
                    changed = true;
                }
            }

        }

        if (changed) chests.version++;

    }

}
