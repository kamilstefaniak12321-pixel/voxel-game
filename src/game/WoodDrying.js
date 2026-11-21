// ------------------------------------------------------------
// SCHNIĘCIE DREWNA (1.33.0, pomysł Kamila - docs/drewno.md)
//
// Zasady i liczby wilgotności: items/moisture.js. Tutaj: co kilkanaście
// sekund przegląd polan w plecaku, skrzyniach, na ziemi i w zimnych
// stosach ognisk. (Polana w PŁONĄCYM ognisku schną w CampfireState.js.)
//
// Ile wilgotności ubywa na dobę gry (dryingRate):
//
//   DRY_PER_DAY x miejsce x temperatura + ogień
//
//   miejsce      - PLACE: plecak i skrzynia - wolno (zamknięte),
//                  piwniczka - jeszcze wolniej (wilgoć), na powietrzu
//                  (leżące polano, stos ogniska) - zwykłe tempo,
//                  w słońcu (dzień, gołe niebo, bez deszczu) - szybciej,
//   temperatura  - im cieplej, tym szybciej; na mrozie prawie wcale,
//   ogień        - blisko płonącego ogniska FIRE_DRY_PER_DAY przy
//                  cieple +22°C (game/Warmth.js - fireHeat), mocniej
//                  przy gorętszym; w plecaku liczy się w części PLACE.
//
// Deszcz moczy polana leżące pod gołym niebem (do RAIN_WET), woda -
// te, które w niej leżą (SOAKED). Plecak i skrzynia chronią.
//
// Polano, które zeszło poniżej DRY_WET, jest suche (pole znika).
//
// W grze ze znajomymi każdy liczy swój plecak, a skrzynie, leżące
// przedmioty i ogniska - gospodarz (jak psucie jedzenia).
// ------------------------------------------------------------

import { DAY_LENGTH_MINUTES } from '../config.js';
import { seasonAt } from '../sky/Seasons.js';
import { isLiquidId } from '../blocks/BlockRegistry.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { isSeasonable, wetOf, setWet, isWet, DRY_WET, RAIN_WET, SOAKED } from '../items/moisture.js';
import { sunDries } from '../items/clay.js';
import { fireHeat, FIRE_HEAT } from './Warmth.js';
import { setLogWet } from './CampfireState.js';
import { SEASON_TEMPERATURE } from './Spoilage.js';

// Co ile dób gry przegląd (kwadrans gry - 12,5 sekundy).
export const DRY_STEP_DAYS = 1 / 96;

// Tyle wilgotności ubywa na dobę gry na powietrzu przy 15°C.
export const DRY_PER_DAY = 0.35;

// Mnożnik miejsca.
export const PLACE = { pack: 0.3, chest: 0.3, cellar: 0.15, air: 1, sun: 1.5 };

// Tyle na dobę dokłada ogień, przy którym jest o FIRE_HEAT cieplej.
export const FIRE_DRY_PER_DAY = 4;

// Tyle wilgotności na dobę przybywa w ulewie pod gołym niebem.
export const RAIN_PER_DAY = 3;

// Od takiej jasności nieba miejsce jest pod gołym niebem (0-15).
const OPEN_SKY = 12;
// Od jakiej jasności nieba nad skrzynią to już nie piwniczka.
const CELLAR_SKY = 4;
// Z jak daleka gracz dostaje napis, że polana przy ogniu wyschły.
const NOTICE_RANGE = 8;

const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;

// Mnożnik schnięcia dla temperatury (°C): 15° - 1, upał - do 2, mróz - 0,2.
export function temperatureDrying(temperature) {
    if (!Number.isFinite(temperature)) return 1;
    return Math.max(0.2, Math.min(2, 0.25 + temperature / 20));
}

// Ile wilgotności ubywa na dobę gry. place - klucz PLACE, heat - ciepło
// ognisk w tym miejscu (°C, fireHeat).
export function dryingRate({ place = 'air', temperature = 15, heat = 0 } = {}) {
    const share = place === 'sun' ? 1 : PLACE[place] ?? 1;
    return DRY_PER_DAY * (PLACE[place] ?? 1) * temperatureDrying(temperature) +
        FIRE_DRY_PER_DAY * Math.max(0, heat) / FIRE_HEAT * share;
}

// Wilgotność po `days` dobach schnięcia w tych warunkach (poniżej
// DRY_WET - suche, czyli 0).
export function driedWet(wet, days, conditions) {
    if (!(wet > 0) || !(days > 0)) return Math.max(0, wet);
    const next = wet - dryingRate(conditions) * days;
    return next <= DRY_WET ? 0 : next;
}

// Wilgotność po `days` dobach deszczu o natężeniu `rain` (0-1).
export function rainedWet(wet, days, rain) {
    if (!(rain > 0) || !(days > 0) || wet >= RAIN_WET) return wet;
    return Math.min(RAIN_WET, wet + RAIN_PER_DAY * rain * days);
}

// Ile dób gry jeszcze poschnie polano o tej wilgotności; Infinity - wcale.
export function dryDaysLeft(wet, conditions) {
    if (!isWet(wet)) return 0;
    const rate = dryingRate(conditions);
    return rate > 0 ? (wet - DRY_WET) / rate : Infinity;
}

export class WoodDrying {

    constructor(game) {
        this.game = game;
        this.pending = 0;
        // Mnożnik tempa (/drewno tempo) - nie zapisuje się.
        this.speed = 1;
        // Ile polan wyschło od wejścia do świata.
        this.dried = 0;
    }

    update(dt) {
        this.pending += dt * this.speed / DAY_SECONDS;
        if (this.pending < DRY_STEP_DAYS) return;
        const days = this.pending;
        this.pending = 0;
        this.step(days);
    }

    // Przespany czas (Game.advanceWorld).
    advance(seconds) {
        if (!(seconds > 0)) return;
        this.step(seconds * this.speed / DAY_SECONDS);
    }

    temperature() {
        const value = this.game.weather?.temperature;
        return Number.isFinite(value) ? value : SEASON_TEMPERATURE[seasonAt(this.game.time?.days ?? 0).index];
    }

    // Deszcz tam, gdzie stoi gracz (0-1); śnieg nie moczy.
    rain() {
        const rain = this.game.rainNow;
        return Number.isFinite(rain) && rain > 0.05 ? rain : 0;
    }

    // Warunki w miejscu świata (x, y, z): { place, temperature, heat,
    // rain, water }. Poza wczytanym terenem - powietrze, temperatura
    // pory roku, bez ognia i deszczu.
    conditionsAt(x, y, z) {
        const game = this.game, world = game.world;
        const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
        if (!world?.getChunk?.(world.toChunkCoord(bx), world.toChunkCoord(bz))) {
            return { place: 'air', temperature: SEASON_TEMPERATURE[seasonAt(game.time?.days ?? 0).index], heat: 0, rain: 0, water: false };
        }
        const open = (world.getLight?.(bx, by, bz)?.sky ?? 15) >= OPEN_SKY;
        const rain = open ? this.rain() : 0;
        return {
            place: open && rain === 0 && sunDries(game.time?.days ?? 0.5) ? 'sun' : 'air',
            temperature: this.temperature(),
            heat: fireHeat(game.campfires?.fires, x, y, z),
            rain,
            water: isLiquidId(world.getBlockId(bx, by, bz))
        };
    }

    // Nowa wilgotność po `days` dobach w tych warunkach.
    next(wet, days, conditions) {
        if (conditions.water) return Math.max(wet, SOAKED);
        if (conditions.rain > 0) return rainedWet(wet, days, conditions.rain);
        return driedWet(wet, days, conditions);
    }

    // Mija `days` dób gry.
    step(days) {

        const game = this.game;
        const here = this.temperature();
        const player = game.player?.pos;
        const dried = new Map();

        // --- Plecak, siatka wytwarzania i stos pod kursorem --------------
        // (Plecak chroni przed deszczem; przy ognisku schnie szybciej.)
        const inventory = game.inventory;

        if (inventory) {
            const conditions = { place: 'pack', temperature: here,
                heat: player ? fireHeat(game.campfires?.fires, player.x, player.y + 0.9, player.z) : 0 };
            const dry = (item) => {
                const wet = wetOf(item);
                if (!(wet > 0)) return;
                const next = driedWet(wet, days, conditions);
                setWet(item, next);
                if (next === 0 && isWet(wet)) dried.set(item.type, (dried.get(item.type) ?? 0) + item.count);
            };
            for (const list of [inventory.slots, inventory.craft]) for (const item of list) if (item) dry(item);
            if (inventory.cursor) dry(inventory.cursor);
        }

        // W grze ze znajomymi skrzynie, leżące przedmioty i ogniska liczy gospodarz.
        if (!game.net?.isClient) {

            const world = game.world;

            // --- Skrzynie ------------------------------------------------
            for (const chest of game.chests?.chests?.values?.() ?? []) {
                const loaded = Boolean(world?.getChunk?.(world.toChunkCoord(chest.x), world.toChunkCoord(chest.z)));
                const sky = loaded ? world.getLight?.(chest.x, chest.y + 1, chest.z)?.sky : undefined;
                const conditions = { place: Number.isFinite(sky) && sky < CELLAR_SKY ? 'cellar' : 'chest',
                    temperature: loaded ? here : SEASON_TEMPERATURE[seasonAt(game.time?.days ?? 0).index], heat: 0 };
                let changed = false;
                for (const cells of chest.layers) {
                    for (const item of cells) {
                        const wet = wetOf(item);
                        if (!(wet > 0)) continue;
                        const next = driedWet(wet, days, conditions);
                        setWet(item, next);
                        if (next === 0) changed = true;
                    }
                }
                if (changed) game.chests.version++;
            }

            // --- Polana leżące na ziemi ----------------------------------
            const drops = game.drops;

            for (const drop of drops?.drops?.values?.() ?? []) {
                if (!isSeasonable(drop.type)) continue;
                const wet = wetOf(drop);
                const conditions = this.conditionsAt(drop.x, drop.y + 0.1, drop.z);
                const next = this.next(wet, days, conditions);
                if (next === wet) continue;
                setWet(drop, next);
                // (Zapis i gra ze znajomymi: co ćwierć wilgotności.)
                if (Math.round(next * 4) !== Math.round(wet * 4)) drops.version++;
                if (isWet(next) !== isWet(wet)) {
                    if (next === 0 && this.near(drop, player)) dried.set(drop.type, (dried.get(drop.type) ?? 0) + drop.count);
                }
            }

            // --- Zimne stosy ognisk --------------------------------------
            // (Także polana dołożone na żar, które jeszcze się nie zajęły.)
            const campfires = game.campfires;

            for (const fire of campfires?.fires?.values?.() ?? []) {
                if (fire.phase !== 'unlit' || fire.logs.length === 0) continue;
                const conditions = this.conditionsAt(fire.x + 0.5, fire.y + 0.5, fire.z + 0.5);
                let changed = false;
                for (const log of fire.logs) {
                    const wet = log.wet ?? 0;
                    const next = this.next(wet, days, conditions);
                    if (next === wet) continue;
                    setLogWet(log, next);
                    if (isWet(next) !== isWet(wet)) changed = true;
                }
                if (changed) campfires.version++;
            }

        }

        if (dried.size > 0) {
            const count = [...dried.values()].reduce((sum, value) => sum + value, 0);
            this.dried += count;
            game.onNotice?.(`Drewno wyschło: ${[...dried].map(([type, amount]) => `${amount} × ${getItemLabel(type)}`).join(', ')}`);
            game.achieve?.('woodDried', { count });
        }

    }

    near(point, player) {
        return Boolean(player) && Math.hypot(point.x - player.x, point.y - player.y, point.z - player.z) <= NOTICE_RANGE;
    }

}
