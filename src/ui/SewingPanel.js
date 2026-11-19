// ------------------------------------------------------------
// STÓŁ KRAWIECKI W EKWIPUNKU (1.27.0, pomysł Kamila)
//
// PPM na stole krawieckim otwiera ekwipunek, a zamiast siatki
// wytwarzania jest stół (InventoryScreen.js - station 'sewing'):
//
//   Krosno   - włókno w polu "włókno"; klik w wynik tka jedno płótno
//              (dwa włókna), Shift + klik - ile się da,
//   Szycie   - płótno w polu "materiał", wybór kroju i wzoru (przyciski
//              pod spodem), barwnik główny i barwnik wzoru (oba można
//              pominąć - wtedy naturalny kolor płótna); klik w wynik szyje,
//   Barwienie - gotowe ubranie w polu "materiał": wzór i barwniki na nowo
//              (potrzebny choć jeden barwnik).
//
// Postać w podglądzie od razu przymierza to, co powstanie (game -
// previewClothes). Pola stołu leżą w ekwipunku gracza (Inventory: sew)
// i po zamknięciu okna wracają do ekwipunku.
// Logika i liczby: items/clothing.js.
// ------------------------------------------------------------

import { GARMENTS, PATTERNS, CLOTHS, clothOf, garmentInfo, garmentType, kindsFor, sewResult, weave, FIBERS_PER_CLOTH, SLOTS } from '../items/clothing.js';
import { stackSize, withCount } from '../items/freshness.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { playUi } from '../audio/ui.js';

// Pola stołu: [włókno, materiał, barwnik główny, barwnik wzoru].
export const SEW_FIBER = 0, SEW_MATERIAL = 1, SEW_MAIN = 2, SEW_ACCENT = 3;

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class SewingPanel {

    constructor(screen) {
        this.screen = screen;
        this.choice = { kind: null, pattern: 'plain' };
        this.root = null;
        this.shownCloth = undefined;
    }

    get game() { return this.screen.game; }
    get sew() { return this.game.inventory.sew; }

    // --- Budowa ----------------------------------------------------------

    element() {
        const screen = this.screen;
        const box = el('div', 'inv-zone inv-sewing');
        box.title = 'Stół krawiecki - tkanie, szycie i barwienie';

        const loom = el('div', 'inv-sew-row');
        loom.append(el('span', 'inv-sew-label', 'Krosno'), screen.slotElement(SEW_FIBER, 'sew'),
            el('span', 'inv-craft-arrow', '➜'), this.resultSlot('weave'));

        const sewing = el('div', 'inv-sew-row');
        sewing.append(el('span', 'inv-sew-label', 'Szycie'), screen.slotElement(SEW_MATERIAL, 'sew'),
            screen.slotElement(SEW_MAIN, 'sew'), screen.slotElement(SEW_ACCENT, 'sew'),
            el('span', 'inv-craft-arrow', '➜'), this.resultSlot('sewresult'));

        this.kinds = el('div', 'inv-sew-chips inv-sew-kinds');
        this.patterns = el('div', 'inv-sew-chips inv-sew-patterns');
        for (const [key, pattern] of Object.entries(PATTERNS)) {
            const chip = el('button', 'inv-chip inv-sew-chip', pattern.label);
            chip.type = 'button';
            chip.dataset.pattern = key;
            this.patterns.append(chip);
        }

        box.append(loom, sewing, this.kinds, this.patterns);
        this.root = box;
        this.shownCloth = undefined;
        return box;
    }

    resultSlot(kind) {
        const slot = el('div', 'inv-slot inv-result');
        slot.dataset.kind = kind;
        slot.append(el('img'), el('span', 'inv-count'));
        return slot;
    }

    // Przyciski krojów - tylko te, które da się uszyć z płótna w polu.
    fillKinds(cloth) {
        this.kinds.replaceChildren();
        if (!cloth) {
            this.kinds.append(el('span', 'inv-sew-hint', 'Połóż płótno, żeby wybrać krój - albo gotowe ubranie, żeby je zabarwić.'));
            return;
        }
        for (const kind of kindsFor(cloth)) {
            const garment = GARMENTS[kind];
            const chip = el('button', 'inv-chip inv-sew-chip');
            chip.type = 'button';
            chip.dataset.garment = kind;
            chip.title = `${garment.label}: ${garment.cost} ${garment.cost === 1 ? 'płótno' : garment.cost < 5 ? 'płótna' : 'płócien'}`;
            const icon = el('img');
            icon.src = this.screen.icons.get(garmentType(kind, cloth)) ?? '';
            icon.alt = garment.label;
            chip.append(icon);
            this.kinds.append(chip);
        }
    }

    // --- Stan ------------------------------------------------------------

    // Co powstanie z pól i wyboru (sewResult) albo null.
    result() {
        const sew = this.sew;
        return sewResult(sew[SEW_MATERIAL], this.choice, [sew[SEW_MAIN], sew[SEW_ACCENT]]);
    }

    weaveResult() {
        const fiber = this.sew[SEW_FIBER];
        return fiber ? weave(fiber.type, fiber.count) : null;
    }

    refresh() {
        if (!this.root) return;
        const screen = this.screen, sew = this.sew;
        for (const slot of this.root.querySelectorAll('.inv-slot[data-kind="sew"]')) screen.showItem(slot, sew[Number(slot.dataset.index)]);

        // Krosno: wynik jednego tkania.
        const woven = this.weaveResult();
        const weaveSlot = this.root.querySelector('.inv-slot[data-kind="weave"]');
        screen.showItem(weaveSlot, woven ? { type: woven.type, count: 1 } : null);
        weaveSlot.classList.toggle('ready', Boolean(woven));

        // Krój: przyciski zależą od płótna; gotowe ubranie - barwienie.
        const material = sew[SEW_MATERIAL];
        const cloth = clothOf(material?.type);
        const garment = garmentInfo(material?.type);
        const key = garment ? `dye:${material.type}` : cloth;
        if (key !== this.shownCloth) {
            this.shownCloth = key;
            if (garment) {
                this.kinds.replaceChildren(el('span', 'inv-sew-hint', `Barwienie: ${garment.label.toLowerCase()} - wybierz wzór i połóż barwniki.`));
                this.choice.pattern = material.look?.pattern ?? 'plain';
            }
            else {
                this.fillKinds(cloth);
                if (!cloth || !GARMENTS[this.choice.kind]?.cloths.includes(cloth)) this.choice.kind = cloth ? kindsFor(cloth)[0] : null;
            }
        }
        for (const chip of this.kinds.querySelectorAll('[data-garment]')) {
            const kind = chip.dataset.garment;
            chip.classList.toggle('selected', kind === this.choice.kind);
            chip.classList.toggle('missing', (material?.count ?? 0) < GARMENTS[kind].cost);
        }
        for (const chip of this.patterns.querySelectorAll('[data-pattern]')) chip.classList.toggle('selected', chip.dataset.pattern === this.choice.pattern);

        const result = this.result();
        const sewSlot = this.root.querySelector('.inv-slot[data-kind="sewresult"]');
        screen.showItem(sewSlot, result?.item ?? null);
        sewSlot.classList.toggle('ready', Boolean(result));

        // Przymiarka: postać w podglądzie nosi to, co powstanie.
        this.preview(result?.item ?? null);
    }

    preview(item) {
        const info = garmentInfo(item?.type);
        if (!info) {
            this.game.previewClothes?.(null);
            return;
        }
        const equip = [...this.game.inventory.equip];
        equip[SLOTS.indexOf(info.slot)] = item;
        this.game.previewClothes?.(equip);
    }

    // --- Kliknięcia ----------------------------------------------------------

    // Przyciski kroju i wzoru. Zwraca true, gdy kliknięto przycisk stołu.
    onButton(target) {
        const chip = target.closest?.('.inv-sew-chip');
        if (!chip || !this.root?.contains(chip)) return false;
        if (chip.dataset.garment) this.choice.kind = chip.dataset.garment;
        if (chip.dataset.pattern) this.choice.pattern = chip.dataset.pattern;
        playUi('ui_click');
        this.screen.refresh();
        return true;
    }

    // Klik w wynik krosna (kind 'weave') albo szycia ('sewresult').
    click(kind, shift) {
        if (kind === 'weave') return this.clickWeave(shift);
        return this.clickSew();
    }

    clickWeave(shift) {
        const screen = this.screen, sew = this.sew, inventory = this.game.inventory;
        let woven = 0;
        while (true) {
            const fiber = sew[SEW_FIBER];
            const result = fiber ? weave(fiber.type, fiber.count) : null;
            if (!result) break;
            if (shift) {
                if (!inventory.canAdd(result.type, 1)) break;
                inventory.add(result.type, 1);
            }
            else {
                const held = screen.cursor;
                if (held && (held.type !== result.type || held.count >= stackSize(result.type))) break;
                screen.cursor = held ? withCount(held, held.count + 1) : { type: result.type, count: 1 };
            }
            fiber.count -= FIBERS_PER_CLOTH;
            if (fiber.count <= 0) sew[SEW_FIBER] = null;
            woven++;
            if (!shift) break;
        }
        if (woven > 0) {
            playUi('item_craft');
            const cloth = clothOf(screen.cursor?.type) ?? null;
            this.game.achieve?.('woven', { count: woven, cloth });
        }
        else playUi('ui_error');
        return woven;
    }

    clickSew() {
        const screen = this.screen, sew = this.sew;
        const result = this.result();
        if (!result || screen.cursor) {
            playUi('ui_error');
            return false;
        }
        screen.cursor = result.item;
        const material = sew[SEW_MATERIAL];
        material.count -= result.material;
        if (material.count <= 0) sew[SEW_MATERIAL] = null;
        for (const [i, used] of [[SEW_MAIN, result.dyes[0]], [SEW_ACCENT, result.dyes[1]]]) {
            if (!used || !sew[i]) continue;
            sew[i].count -= used;
            if (sew[i].count <= 0) sew[i] = null;
        }
        playUi('item_craft');
        this.game.achieve?.('sewn', { type: result.item.type, look: result.item.look, mode: result.mode });
        return true;
    }

    // Shift + klik w ekwipunku przy otwartym stole: rzecz idzie do swojego
    // pola (włókno, płótno albo ubranie, barwnik). Zwraca true, gdy poszła.
    quickMove(item) {
        const sew = this.sew;
        const index = clothOf(item.type) || garmentInfo(item.type) ? SEW_MATERIAL
            : Object.values(CLOTHS).some((cloth) => cloth.fiber === item.type) ? SEW_FIBER
                : item.type.startsWith('dye_') ? (sew[SEW_MAIN] && sew[SEW_MAIN].type !== item.type ? SEW_ACCENT : SEW_MAIN) : -1;
        if (index < 0) return false;
        const target = sew[index];
        if (!target) { sew[index] = withCount(item, item.count); item.count = 0; return true; }
        if (target.type !== item.type || stackSize(item.type) === 1) return false;
        const moved = Math.min(item.count, stackSize(item.type) - target.count);
        target.count += moved;
        item.count -= moved;
        return moved > 0;
    }

    // Zamknięcie okna: pola stołu wracają do ekwipunku (co się nie zmieści -
    // zostaje na stole w zapisie, jak siatka wytwarzania).
    close() {
        const inventory = this.game.inventory, sew = this.sew;
        for (let i = 0; i < sew.length; i++) {
            const item = sew[i];
            if (!item) continue;
            const left = inventory.addItem(item);
            sew[i] = left > 0 ? withCount(item, left) : null;
        }
        this.game.previewClothes?.(null);
        this.root = null;
    }

}

export function sewSlotLabel(index) {
    return ['Włókno (len, pokrzywa, łyko)', 'Płótno albo ubranie do barwienia', 'Barwnik - kolor ubrania', 'Barwnik - kolor wzoru'][index] ?? '';
}

export { getItemLabel };
