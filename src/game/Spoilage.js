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
//   ziemia   - leżące przedmioty psują się jak w plecaku.
//
// Każdy stos ma swoją świeżość (items/freshness.js); gdy spadnie do
// zera, CAŁY stos zamienia się w kompost w tym samym miejscu - nic nie
// ginie. Potrawa zamienia się w kompost w misce.
//
// Tylko w trybie przygody. W grze ze znajomymi każdy liczy swój plecak,
// a skrzynie - gospodarz.
// ------------------------------------------------------------

import { DAY_LENGTH_MINUTES } from '../config.js';
import { seasonAt } from '../sky/Seasons.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { isPerishable, freshLoss, spoilsInto } from '../items/spoilage.js';
import { freshOf } from '../items/freshness.js';

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

    // Stos starzeje się o `loss`. Zwraca stos po zmianie: ten sam albo
    // (gdy się zepsuł) kompost - i wtedy dolicza go do `lost`.
    age(item, loss, lost) {
        if (!item || !(loss > 0)) return item;
        const fresh = freshOf(item) - loss;
        if (fresh > 0) {
            item.fresh = fresh;
            return item;
        }
        if (lost) lost.set(item.type, (lost.get(item.type) ?? 0) + item.count);
        this.spoiled += item.count;
        return { type: spoilsInto(item.type), count: item.count };
    }

    // Mija `days` dób gry.
    step(days) {

        const game = this.game;
        const here = this.temperature();
        const lost = new Map();

        // --- Plecak, siatka wytwarzania i stos pod kursorem --------------
        const inventory = game.inventory;

        if (inventory) {
            for (const list of [inventory.slots, inventory.craft]) {
                for (let index = 0; index < list.length; index++) {
                    const item = list[index];
                    if (item && isPerishable(item.type)) list[index] = this.age(item, freshLoss(item.type, days, here, 'pack'), lost);
                }
            }
            const held = inventory.cursor;
            if (held && isPerishable(held.type)) inventory.cursor = this.age(held, freshLoss(held.type, days, here, 'pack'), lost);
        }

        if (lost.size > 0) {
            const text = [...lost].map(([type, count]) => `${count} × ${getItemLabel(type)}`).join(', ');
            game.onNotice?.(`Zepsuło się: ${text}`);
            game.sounds?.play('harvest', { volume: 0.35, pitch: 0.7 });
            game.achieve?.('spoiled', { count: [...lost.values()].reduce((sum, count) => sum + count, 0) });
        }

        // W grze ze znajomymi skrzynie i leżące przedmioty liczy gospodarz.
        if (game.net?.isClient) return;

        const world = game.world;
        const season = SEASON_TEMPERATURE[seasonAt(game.time?.days ?? 0).index];
        const loadedAt = (x, z) => Boolean(world.getChunk(world.toChunkCoord(Math.floor(x)), world.toChunkCoord(Math.floor(z))));

        // --- Skrzynie ----------------------------------------------------
        const chests = game.chests;

        if (chests) {

            let changed = false;

            for (const chest of chests.chests.values()) {

                const loaded = loadedAt(chest.x, chest.z);
                const place = loaded ? this.placeOf(chest) : 'chest';
                const temperature = loaded ? here : season;

                for (const cells of chest.layers) {
                    for (let cell = 0; cell < cells.length; cell++) {
                        const item = cells[cell];
                        if (!item || !isPerishable(item.type)) continue;
                        cells[cell] = this.age(item, freshLoss(item.type, days, temperature, place));
                        if (cells[cell] !== item) changed = true;
                    }
                }

            }

            if (changed) chests.version++;

        }

        // --- Przedmioty leżące na ziemi ------------------------------------
        const drops = game.drops;

        if (drops?.drops) {
            for (const drop of drops.drops.values()) {
                if (!isPerishable(drop.type)) continue;
                const aged = this.age(drop, freshLoss(drop.type, days, loadedAt(drop.x, drop.z) ? here : season, 'pack'));
                if (aged === drop) continue;
                drop.type = aged.type;
                delete drop.fresh;
                drops.version++;
            }
        }

    }

}
