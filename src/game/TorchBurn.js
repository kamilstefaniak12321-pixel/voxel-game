// ------------------------------------------------------------
// WYPALANIE SIĘ POCHODNI (1.35.0, decyzja Kamila - docs/drewno.md)
//
// Zasady i liczby: items/torchFuel.js, etapy bloków: blocks/torches.js.
//
// Każda postawiona pochodnia ma wpis { x, y, z, left, color, out, rain }:
//   left  - ile sekund paliwa zostało,
//   color - kolor (wraca po dolaniu paliwa, bo ogarek koloru nie ma),
//   out   - zgaszona przez deszcz, choć paliwo jeszcze jest,
//   rain  - ile "sekund ulewy" już na nią spadło.
//
// Co sekundę: paliwa ubywa; gdy zostaje go TORCH_DIM_PART, blok zmienia
// się w przygasającą pochodnię (słabsze światło), a gdy się skończy -
// w ogarek. Pod gołym niebem deszcz gasi pochodnię po RAIN_OUT_SECONDS
// ulewy (słabszy deszcz - odpowiednio dłużej).
//
//   PPM żywicą albo oliwkami - dolewa paliwa do pełna i rozpala,
//   PPM starterem ognia       - rozpala pochodnię zgaszoną przez deszcz,
//   PPM pustą ręką            - mówi, na ile starczy paliwa.
//
// Pochodnia zdjęta ze ściany wraca do ekwipunku z resztą paliwa (pole
// fresh stosu), a postawiona z nadpalonego stosu pali się krócej.
//
// Pochodnia bez wpisu (świat sprzed 1.35.0, blok z komendy) dostaje
// pełne paliwo, gdy tylko gra ją zobaczy (ensure - woła TorchRenderer).
// Czas płynie też dla dalekich pochodni; blok zmienia się, gdy teren
// jest wczytany. W grze ze znajomymi bloki zmienia gospodarz.
// ------------------------------------------------------------

import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { getTorchInfo, torchStageType, TORCH_VARIANTS } from '../blocks/torches.js';
import { TORCH_BURN_SECONDS, TORCH_DIM_PART, TORCH_STUB, TORCH_REFILLS, LUCZYWO, LUCZYWO_PART, fuelOf, fuelMinutes } from '../items/torchFuel.js';
import { makeItem } from '../items/freshness.js';

// Co ile sekund przegląd pochodni.
export const TORCH_STEP_SECONDS = 1;
// Tyle sekund ulewy (deszcz o natężeniu 1) gasi pochodnię pod gołym niebem.
export const RAIN_OUT_SECONDS = 20;
// Słabszy deszcz niż ten pochodni nie gasi.
export const RAIN_MIN = 0.15;
// Od takiej jasności nieba pochodnia stoi pod gołym niebem (0-15).
const OPEN_SKY = 12;
// Najwięcej zmian bloków w jednym kroku (żeby deszcz nie gasił stu
// pochodni w jednej klatce).
const CHANGES_PER_STEP = 4;
// Z jak daleka gracz dostaje napis o zgaszonej pochodni.
const NOTICE_RANGE = 12;

const COLORS = new Set(TORCH_VARIANTS.map((variant) => variant.key));
const keyOf = ({ x, y, z }) => `${x},${y},${z}`;
const clampLeft = (value) => Math.max(0, Math.min(TORCH_BURN_SECONDS, Number.isFinite(value) ? value : TORCH_BURN_SECONDS));

export function newTorch(x, y, z, left = TORCH_BURN_SECONDS, color = 'plain') {
    return { x, y, z, left: clampLeft(left), color: COLORS.has(color) ? color : 'plain', out: false, rain: 0 };
}

// Wpis z zapisu albo od innego gracza: tylko poprawne wartości.
export function restoreTorch(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const torch = newTorch(value.x, value.y, value.z, value.left, value.color);
    torch.out = value.out === true && torch.left > 0;
    return torch;
}

// W jakim etapie powinna być pochodnia: 'lit', 'dim' albo 'out'.
export function stageFor(torch) {
    if (!(torch.left > 0) || torch.out) return 'out';
    return torch.left <= TORCH_BURN_SECONDS * TORCH_DIM_PART ? 'dim' : 'lit';
}

// Podpis do gry ze znajomymi: etap i paliwo co 5%.
export const torchSign = (torch) => `${stageFor(torch)}:${Math.round(torch.left / TORCH_BURN_SECONDS * 20)}:${torch.color}`;

export class TorchBurn {

    constructor(game, saved = []) {
        this.game = game;
        this.torches = new Map();
        this.version = 0;
        this.pending = 0;
        // Ile pochodni wypaliło się albo zgasło od wejścia do świata.
        this.burnt = 0;
        for (const value of Array.isArray(saved) ? saved : []) {
            const torch = restoreTorch(value);
            if (torch) this.torches.set(keyOf(torch), torch);
        }
    }

    get(position) { return position ? this.torches.get(keyOf(position)) : null; }
    getState() {
        return [...this.torches.values()].map((torch) => ({ x: torch.x, y: torch.y, z: torch.z, left: Math.round(torch.left * 10) / 10,
            color: torch.color, ...(torch.out ? { out: true } : {}) }));
    }
    // Zmiana z sieci (StateSync).
    changed() { this.version++; }

    // Pochodnia, którą gra właśnie zobaczyła: bez wpisu - pełna (ogarek -
    // pusty, przygasająca - końcówka paliwa).
    ensure(x, y, z, info) {
        const key = `${x},${y},${z}`;
        if (this.torches.has(key)) return this.torches.get(key);
        const stage = info?.stage ?? 'lit';
        const torch = newTorch(x, y, z, stage === 'out' ? 0 : stage === 'dim' ? TORCH_BURN_SECONDS * TORCH_DIM_PART : TORCH_BURN_SECONDS, info?.colorKey);
        if (stage === 'out') torch.stub = true;
        this.torches.set(key, torch);
        this.version++;
        return torch;
    }

    // Pochodnia właśnie postawiona z ekwipunku: fuel - paliwo stosu (0-1).
    placed(position, fuel = 1, color = 'plain') {
        const torch = newTorch(position.x, position.y, position.z, Math.max(0.01, Math.min(1, Number.isFinite(fuel) ? fuel : 1)) * TORCH_BURN_SECONDS, color);
        this.torches.set(keyOf(torch), torch);
        this.version++;
        return torch;
    }

    // Pochodnia postawiona tym stosem: łuczywo ma mało paliwa, pochodnia -
    // tyle, ile miał stos.
    placedItem(position, item, color = 'plain') {
        return this.placed(position, item?.type === LUCZYWO ? LUCZYWO_PART : fuelOf(item), color);
    }

    // Co wypada z rozbitej pochodni: pochodnia z resztą paliwa albo ogarek.
    drops(type, position) {
        const info = getTorchInfo(type);
        if (!info) return [];
        const torch = this.get(position);
        const stage = info.stage ?? 'lit';
        if (stage === 'out' && !(torch?.out && torch.left > 0)) return [{ type: TORCH_STUB, count: 1 }];
        const variant = stage === 'out' ? TORCH_VARIANTS.find((entry) => entry.key === torch.color) ?? TORCH_VARIANTS[0] : info.variant;
        return [makeItem(variant.type, 1, torch ? torch.left / TORCH_BURN_SECONDS : 1)];
    }

    // Opis słowami (PPM pustą ręką).
    description(torch, stage) {
        const minutes = Math.max(1, fuelMinutes(torch.left / TORCH_BURN_SECONDS));
        if (stage === 'out') {
            return torch.out && torch.left > 0 ? 'Pochodnię zgasił deszcz - rozpal ją starterem ognia (PPM)'
                : 'Ogarek - dolej żywicy albo oliwek (PPM), a znów zapłonie';
        }
        return stage === 'dim' ? `Pochodnia przygasa - paliwa na ok. ${minutes} min. Dolej żywicy albo oliwek (PPM)`
            : `Pochodnia - paliwa na ok. ${minutes} min`;
    }

    // PPM na postawionej pochodni. Zwraca true, gdy kliknięcie jej dotyczyło.
    interact(hit, type) {
        if (!hit?.hit) return false;
        const game = this.game, { x, y, z } = hit.block;
        const info = getTorchInfo(game.world.getBlockId(x, y, z));
        if (!info) return false;
        const stage = info.stage ?? 'lit';
        const torch = this.ensure(x, y, z, info);
        const relight = () => {
            const next = torchStageType(torch.color, info.attach, stageFor(torch));
            if (game.world.getBlock(x, y, z) !== next) game.world.setBlock(x, y, z, next);
            this.version++;
        };

        if (TORCH_REFILLS.includes(type)) {
            if (stage === 'lit' && torch.left > TORCH_BURN_SECONDS * 0.9) { game.onNotice?.('Pochodnia ma jeszcze pełno paliwa'); return true; }
            torch.left = TORCH_BURN_SECONDS; torch.out = false; torch.rain = 0; torch.stub = false;
            if (game.mode === 'adventure') game.inventory.take(game.inventory.selected, 1);
            relight();
            game.playBlockSound?.('place', 'torch', hit.block);
            game.onNotice?.(`Dolano paliwa - pochodnia płonie, starczy na ok. ${fuelMinutes(1)} min`);
            game.achieve?.('torchRefilled', { stub: stage === 'out' });
            return true;
        }
        if (type === 'fire_starter') {
            if (stage !== 'out') return false;
            if (torch.out && torch.left > 0) {
                torch.out = false; torch.rain = 0;
                relight();
                game.playBlockSound?.('place', 'torch', hit.block);
                game.onNotice?.('Pochodnia znów płonie');
            }
            else game.onNotice?.(this.description(torch, stage));
            return true;
        }
        if (!type) { game.onNotice?.(this.description(torch, stage)); return true; }
        return false;
    }

    update(dt) {
        this.pending += Math.max(0, Number.isFinite(dt) ? dt : 0);
        if (this.pending < TORCH_STEP_SECONDS) return;
        const seconds = this.pending;
        this.pending = 0;
        this.step(seconds, true);
    }

    // Przespany czas (Game.advanceWorld): bez deszczu.
    advance(seconds) {
        if (seconds > 0) this.step(seconds, false);
    }

    // Deszcz tam, gdzie stoi gracz (0-1).
    rain() {
        const rain = this.game.rainNow;
        return Number.isFinite(rain) && rain >= RAIN_MIN ? Math.min(1, rain) : 0;
    }

    step(seconds, weather = true) {
        const game = this.game, world = game.world, host = !game.net?.isClient;
        const rain = weather ? this.rain() : 0;
        const player = game.player?.pos;
        let changes = 0, rained = false;
        for (const [key, torch] of this.torches) {
            if (!world.getChunk(world.toChunkCoord(torch.x), world.toChunkCoord(torch.z))) {
                // Daleka pochodnia: paliwa ubywa, blok zmieni się po wczytaniu.
                if (!torch.out) torch.left = Math.max(0, torch.left - seconds);
                continue;
            }
            const info = getTorchInfo(world.getBlockId(torch.x, torch.y, torch.z));
            if (!info) { this.torches.delete(key); this.version++; continue; }
            const stage = info.stage ?? 'lit';
            if (stage !== 'out') {
                torch.color = info.colorKey;
                // Był już ogarkiem, a znów płonie: ktoś dolał paliwa (gość, komenda).
                if (torch.stub) { torch.stub = false; torch.left = TORCH_BURN_SECONDS; torch.out = false; }
                torch.left = Math.max(0, torch.left - seconds);
                // (Zgaszona, której blok jeszcze czeka na zmianę, nie moknie dalej.)
                if (torch.out) { /* czeka na zmianę bloku */ }
                else if (rain > 0 && (world.getLight?.(torch.x, torch.y, torch.z)?.sky ?? 0) >= OPEN_SKY) {
                    torch.rain += seconds * rain;
                    if (torch.rain >= RAIN_OUT_SECONDS && torch.left > 0) { torch.out = true; torch.rain = 0; }
                }
                else torch.rain = Math.max(0, torch.rain - seconds * 0.5);
            }
            else if (!torch.out) { torch.left = 0; torch.stub = true; }
            const want = stageFor(torch);
            if (want === stage || !host || changes >= CHANGES_PER_STEP) continue;
            changes++;
            if (world.setBlock(torch.x, torch.y, torch.z, torchStageType(want === 'out' ? 'plain' : torch.color, info.attach, want))) {
                this.version++;
                if (want === 'out') {
                    this.burnt++;
                    const near = Boolean(player) && Math.hypot(torch.x + 0.5 - player.x, torch.y - player.y, torch.z + 0.5 - player.z) <= NOTICE_RANGE;
                    if (torch.out && near) rained = true;
                    if (near) game.achieve?.('torchOut', { rain: torch.out });
                }
            }
        }
        if (rained) game.onNotice?.('Deszcz gasi pochodnie pod gołym niebem');
    }

    dispose() { this.torches.clear(); }

}
