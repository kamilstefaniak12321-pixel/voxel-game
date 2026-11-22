// ------------------------------------------------------------
// NACIĘCIA W PNIACH (1.41.0, dary pnia - docs/dary-pnia.md)
//
// Zasady i liczby: blocks/treeGifts.js. Obraz: rendering/TapRenderer.js.
//
// Każde nacięcie ma wpis { x, y, z, face, species, tree, width, amount,
// age, cup }:
//   face    - ściana pnia: 0 (+X), 1 (-X), 2 (+Z), 3 (-Z),
//   tree    - nazwa drzewa (do liczenia nacięć w jednym pniu),
//   width   - grubość pnia w blokach,
//   amount  - ile czeka: krople żywicy (0-3) albo część kubka (0-1),
//   age     - ile sekund ma nacięcie (po openDays dobach się zabliźnia),
//   cup     - nazwa kubka wiszącego pod nacięciem albo null.
//
//   PPM nożem w bok pnia żywego drzewa - nacięcie,
//   PPM glinianym kubkiem na nacięciu  - wiesza kubek (soki),
//   PPM na nacięciu                    - zbiera żywicę albo pełny kubek;
//                                        gdy nie ma czego - mówi, co słychać,
//   kucnięcie + PPM pustą ręką         - zdejmuje niepełny kubek.
//
// Krok co sekundę: przybywa żywicy i soku (blocks/treeGifts.js), czas
// płynie też dla dalekich drzew. Drzewo ścięte albo pień wykopany -
// nacięcie znika, a kubek i zastygła żywica spadają na ziemię.
// W grze ze znajomymi wpisy roznosi net/StateSync.js.
// ------------------------------------------------------------

import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { getBlockDefinition, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { TREE_CATALOG } from '../blocks/treeCatalog.js';
import { GIFTS, DAY_SECONDS, giftOf, giftKey, flowPerSecond, seasonFlow, flowSeasonsText, tapsAllowed } from '../blocks/treeGifts.js';
import { CUPS } from '../items/clay.js';
import { getTool } from '../items/ItemRegistry.js';
import { scanTree } from './TreeScan.js';

export const TAP_STEP_SECONDS = 1;
// Dłuższy krok liczy się bez pory doby (przespana noc, nadrabianie czasu).
const AVERAGE_FROM_SECONDS = 120;
// Tyle nacięć pamięta świat (najstarsze znikają).
export const TAP_LIMIT = 400;

// Ściany: numer -> kierunek.
export const TAP_FACES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function faceOfNormal(normal) {
    if (!normal || normal.y) return -1;
    return TAP_FACES.findIndex(([dx, dz]) => dx === normal.x && dz === normal.z);
}

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

// Nazwa drzewa w dopełniaczu ("brzozy").
export function treeOf(species) {
    const label = TREE_CATALOG[species]?.labels?.[0] ?? '';
    return label.startsWith('Pień ') ? label.slice(5) : species;
}

// Gatunek stojącej kłody z korą pod numerem bloku albo null.
function logOf(id) {
    const definition = id ? getBlockDefinition(getBlockTypeById(id)) : null;
    return definition?.tree && definition.part === 'log' ? definition.tree : null;
}

export function newTap(x, y, z, face, species, tree, width = 1) {
    return { x, y, z, face, species, tree: String(tree), width: clamp(Math.round(width), 1, 9), amount: 0, age: 0, cup: null };
}

// Wpis z zapisu albo od innego gracza: tylko poprawne wartości.
export function restoreTap(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const gift = giftOf(value.species);
    if (!gift || ![0, 1, 2, 3].includes(value.face)) return null;
    const tap = newTap(value.x, value.y, value.z, value.face, value.species, typeof value.tree === 'string' ? value.tree.slice(0, 40) : keyOf(value), value.width);
    tap.amount = clamp(value.amount, 0, gift.max);
    tap.age = clamp(value.age, 0, 1e9);
    tap.cup = gift.vessel && CUPS.includes(value.cup) ? value.cup : null;
    return tap;
}

export const isHealed = (tap) => tap.age >= (giftOf(tap.species)?.openDays ?? 0) * DAY_SECONDS;
// Ile da się teraz zebrać (całe krople albo pełny kubek).
export const readyCount = (tap) => (giftOf(tap.species)?.vessel ? (tap.cup && tap.amount >= 1 ? 1 : 0) : Math.floor(tap.amount + 1e-6));

// Podpis do gry ze znajomymi: ilość co ćwierć, kubek, zabliźnienie.
export const tapSign = (tap) => `${tap.face}:${Math.round(tap.amount * 4)}:${tap.cup ?? ''}:${isHealed(tap) ? 1 : 0}`;

export class TreeTaps {

    constructor(game, saved = []) {
        this.game = game;
        this.taps = new Map();
        this.version = 0;
        this.pending = 0;
        for (const value of Array.isArray(saved) ? saved.slice(0, TAP_LIMIT) : []) {
            const tap = restoreTap(value);
            if (tap) this.taps.set(keyOf(tap), tap);
        }
    }

    get(position) { return position ? this.taps.get(keyOf(position)) ?? null : null; }
    getState() {
        return [...this.taps.values()].map((tap) => ({ x: tap.x, y: tap.y, z: tap.z, face: tap.face, species: tap.species, tree: tap.tree,
            width: tap.width, amount: Math.round(tap.amount * 1000) / 1000, age: Math.round(tap.age), ...(tap.cup ? { cup: tap.cup } : {}) }));
    }
    // Zmiana z sieci (StateSync).
    changed() { this.version++; }

    // Ile nacięć ma drzewo o tej nazwie.
    countOn(tree) {
        let count = 0;
        for (const tap of this.taps.values()) if (tap.tree === tree) count++;
        return count;
    }

    // Czy da się tu naciąć. Zwraca { ok, reason } albo { ok, species, tree, width }.
    check(x, y, z) {
        const world = this.game.world;
        const species = logOf(world.getBlockId(x, y, z));
        if (!species) return { ok: false, reason: null };
        const gift = giftOf(species);
        if (!gift) return { ok: false, reason: `Z pnia ${treeOf(species)} nic nie pocieknie` };
        const scan = scanTree(world, x, y, z);
        // Krzew i olbrzym, których się nie ścina, też dają (kosodrzewina, baobab).
        if (!scan?.living || scan.prop || !(scan.blocked || scan.trunk)) {
            return { ok: false, reason: 'To nie pień żywego drzewa - z takiego nic nie pocieknie' };
        }
        const width = scan.blocked ? 1 : scan.width;
        // Nazwa drzewa: narożnik przekroju pnia (ten sam na każdej wysokości).
        const first = scan.cut.length ? scan.cut.reduce((best, cell) => (cell.x < best.x || (cell.x === best.x && cell.z < best.z) ? cell : best), scan.cut[0]) : { x, z };
        const tree = `${first.x},${first.z}`;
        if (this.countOn(tree) >= tapsAllowed(width)) return { ok: false, reason: 'To drzewo ma już dość nacięć - więcej soku z niego nie będzie' };
        return { ok: true, species, tree, width };
    }

    // Nowe nacięcie (bez sprawdzania - komenda, test).
    cut(x, y, z, face, species, tree = `${x},${z}`, width = 1) {
        const tap = newTap(x, y, z, face, species, tree, width);
        this.taps.set(keyOf(tap), tap);
        // Za dużo nacięć: znikają najstarsze (Map trzyma kolejność).
        while (this.taps.size > TAP_LIMIT) this.remove(this.taps.values().next().value, false);
        this.version++;
        return tap;
    }

    // Usuwa nacięcie; spill - kubek i zastygła żywica spadają na ziemię.
    remove(tap, spill = true) {
        if (!this.taps.delete(keyOf(tap))) return;
        this.version++;
        const game = this.game;
        if (!spill || game.net?.isClient || !game.drops) return;
        const [dx, dz] = TAP_FACES[tap.face];
        const position = { x: tap.x + 0.5 + dx * 0.7, y: tap.y + 0.2, z: tap.z + 0.5 + dz * 0.7 };
        if (tap.cup) game.drops.spawn(tap.cup, 1, position);
        const gift = giftOf(tap.species);
        if (gift && !gift.vessel && readyCount(tap) > 0) game.drops.spawn(gift.item, readyCount(tap), position);
    }

    // Drzewo ścięte (game/Felling.js): nacięcia w tym, co z niego zostało
    // (pniak), znikają - to, co wyżej, znika samo razem z kłodami.
    felled(cells) {
        for (const cell of cells ?? []) {
            const tap = this.get(cell);
            if (tap) this.remove(tap, true);
        }
    }

    // Opis słowami (PPM, gdy nie ma czego zebrać).
    description(tap) {
        const gift = giftOf(tap.species), tree = treeOf(tap.species), days = this.game.time?.days ?? 0;
        if (!gift) return '';
        const flowing = seasonFlow(gift, days) > 0;
        if (isHealed(tap)) {
            return tap.cup ? `Nacięcie w pniu ${tree} się zabliźniło - zdejmij kubek (kucnij + PPM pustą ręką) i natnij pień nożem jeszcze raz`
                : `Nacięcie w pniu ${tree} się zabliźniło - natnij pień nożem jeszcze raz`;
        }
        if (!flowing) return `Nacięcie w pniu ${tree} jest suche: ${gift.label} płynie ${flowSeasonsText(gift)}`;
        if (!gift.vessel) return `Nacięcie w pniu ${tree}: ${gift.label} dopiero się zbiera`;
        if (!tap.cup) return `Z nacięcia w pniu ${tree} kapie ${gift.label} - powieś pod nim gliniany kubek (PPM kubkiem)`;
        const rate = flowPerSecond(gift, days, tap.width, this.countOn(tap.tree), true);
        const minutes = rate > 0 ? Math.max(1, Math.round((1 - tap.amount) / rate / 60)) : null;
        const part = tap.amount < 0.25 ? 'prawie pusty' : tap.amount < 0.6 ? 'w połowie pełny' : 'prawie pełny';
        return `Kubek pod nacięciem jest ${part}${minutes ? ` - pełny będzie za ok. ${minutes} min` : ''}`;
    }

    // PPM na pniu. Zwraca true, gdy kliknięcie dotyczyło nacięcia.
    interact(hit, type, crouching = false) {
        if (!hit?.hit) return false;
        const game = this.game, { x, y, z } = hit.block;
        const tap = this.get(hit.block);
        const knife = getTool(type) === 'knife';
        if (!tap) {
            if (!knife) return false;
            const face = faceOfNormal(hit.normal);
            if (!logOf(game.world.getBlockId(x, y, z))) return false;
            if (face < 0) { game.onNotice?.('Nacina się bok pnia, nie przekrój'); return true; }
            const check = this.check(x, y, z);
            if (!check.ok) { if (check.reason) game.onNotice?.(check.reason); return true; }
            const made = this.cut(x, y, z, face, check.species, check.tree, check.width);
            const gift = giftOf(made.species), flowing = seasonFlow(gift, game.time?.days ?? 0) > 0;
            game.playBlockSound?.('step', hit.block.type, hit.block, 0.8);
            game.onNotice?.(!flowing ? `Nacięcie zrobione, ale zostanie suche: ${gift.label} płynie ${flowSeasonsText(gift)}`
                : gift.vessel ? `Z nacięcia kapie ${gift.label} - powieś pod nim gliniany kubek (PPM kubkiem)`
                : `Nacięcie zrobione - ${gift.label} zbierze się na korze`);
            game.achieve?.('treeTapped', { species: made.species, gift: giftKey(made.species), flowing, taps: this.countOn(made.tree),
                full: this.countOn(made.tree) >= tapsAllowed(made.width) });
            return true;
        }

        const gift = giftOf(tap.species);
        if (!gift) { this.remove(tap, false); return false; }
        const ready = readyCount(tap);

        // Zbiór: żywica do ręki albo pełny kubek.
        if (ready > 0 && !(crouching && type)) {
            // Lateks ścina się w kubku: do ręki idzie bryłka i sam kubek.
            const back = gift.solid ? tap.cup : null;
            const fits = back ? game.inventory.canAddAll?.([{ type: gift.item, count: ready }, { type: back, count: 1 }]) ?? game.inventory.canAdd(gift.item, ready)
                : game.inventory.canAdd(gift.item, ready);
            if (!fits) { game.onNotice?.('Nie masz miejsca w ekwipunku'); return true; }
            game.inventory.add(gift.item, ready);
            if (back) game.inventory.add(back, 1);
            tap.amount = gift.vessel ? 0 : tap.amount - ready;
            if (gift.vessel) tap.cup = null;
            this.version++;
            game.sounds?.play('harvest', { volume: 0.4, pitch: 0.9 });
            game.onNotice?.(gift.solid ? `Zebrano: ${gift.label} (kubek wraca do ręki)` : gift.vessel ? `Kubek pełny: ${gift.label}` : `Zebrano: ${gift.label} (${ready})`);
            game.achieve?.('giftCollected', { species: tap.species, gift: giftKey(tap.species), item: gift.item, count: ready });
            if (isHealed(tap) && readyCount(tap) === 0) this.remove(tap, false);
            return true;
        }
        // Kubek pod nacięcie.
        if (CUPS.includes(type) && gift.vessel) {
            if (tap.cup) { game.onNotice?.(this.description(tap)); return true; }
            if (isHealed(tap)) { game.onNotice?.(this.description(tap)); return true; }
            tap.cup = type; tap.amount = 0;
            if (game.mode === 'adventure') game.inventory.take(game.inventory.selected, 1);
            this.version++;
            game.playBlockSound?.('place', 'clay', hit.block);
            game.onNotice?.(seasonFlow(gift, game.time?.days ?? 0) > 0 ? `Kubek wisi - ${gift.label} kapie do środka` : this.description(tap));
            game.achieve?.('cupHung', { species: tap.species, gift: giftKey(tap.species) });
            return true;
        }
        // Zdjęcie niepełnego kubka.
        if (tap.cup && crouching && !type) {
            if (!game.inventory.canAdd(tap.cup, 1)) { game.onNotice?.('Nie masz miejsca w ekwipunku'); return true; }
            game.inventory.add(tap.cup, 1);
            tap.cup = null; tap.amount = 0;
            this.version++;
            game.sounds?.play('harvest', { volume: 0.4, pitch: 0.8 });
            game.onNotice?.('Zdjęto kubek - to, co nakapało, wylało się');
            if (isHealed(tap)) this.remove(tap, false);
            return true;
        }
        // Zabliźnione nacięcie nożem otwiera się na nowo.
        if (knife && isHealed(tap)) {
            tap.age = 0;
            this.version++;
            game.playBlockSound?.('step', hit.block.type, hit.block, 0.8);
            game.onNotice?.('Nacięcie otwarte na nowo');
            return true;
        }
        if (knife || !type || CUPS.includes(type)) { game.onNotice?.(this.description(tap)); return true; }
        return false;
    }

    update(dt) {
        this.pending += Math.max(0, Number.isFinite(dt) ? dt : 0);
        if (this.pending < TAP_STEP_SECONDS) return;
        const seconds = this.pending;
        this.pending = 0;
        this.step(seconds);
    }

    // Przespany czas (Game.advanceWorld).
    advance(seconds) {
        if (seconds > 0) this.step(seconds);
    }

    step(seconds) {
        if (this.taps.size === 0) return;
        const game = this.game, world = game.world, days = game.time?.days ?? 0;
        const average = seconds >= AVERAGE_FROM_SECONDS;
        const counts = new Map();
        for (const tap of this.taps.values()) counts.set(tap.tree, (counts.get(tap.tree) ?? 0) + 1);
        for (const tap of [...this.taps.values()]) {
            const gift = giftOf(tap.species);
            if (!gift) { this.remove(tap, false); continue; }
            // Pień zniknął (ścięty, wykopany, okorowany) - tylko w wczytanym terenie.
            if (world.getChunk(world.toChunkCoord(tap.x), world.toChunkCoord(tap.z)) && logOf(world.getBlockId(tap.x, tap.y, tap.z)) !== tap.species) {
                this.remove(tap, true);
                continue;
            }
            const before = tapSign(tap);
            // Płynie do zabliźnienia - także w kroku, w którym się zabliźnia.
            const open = Math.max(0, Math.min(seconds, gift.openDays * DAY_SECONDS - tap.age));
            tap.age += seconds;
            if (open > 0 && (!gift.vessel || tap.cup)) {
                tap.amount = Math.min(gift.max, tap.amount + flowPerSecond(gift, days, tap.width, counts.get(tap.tree), average) * open);
            }
            // Zabliźnione i puste - nie ma po co pamiętać.
            if (isHealed(tap) && !tap.cup && readyCount(tap) === 0) { this.remove(tap, false); continue; }
            if (tapSign(tap) !== before) this.version++;
        }
    }

    dispose() { this.taps.clear(); }

}

export { GIFTS };
