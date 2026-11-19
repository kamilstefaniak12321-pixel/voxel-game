import { newCampfire, restoreCampfire, updateCampfire, addFirewood, addTinder,
    fuelWood, isTinder, campfireDrops, burnSecondsLeft, TINDERS } from './CampfireState.js';
import { getBlockId, isLiquidId, isSolidId, blockExists } from '../blocks/BlockRegistry.js';
import { CampfireRenderer } from '../rendering/CampfireRenderer.js';
import { getRoast, isDrink, ROAST_SECONDS } from '../items/foods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { POT, POT_WATER, BOWL, DISHES, dishItem, isIngredient } from '../items/cooking.js';
import { newPot, addIngredient, canAddIngredient, takePortion, potDrops, potDescription, isCooking } from './CookingState.js';

// Z jak daleka gracz słyszy i widzi napis, że potrawa gotowa.
const COOK_NOTICE_RANGE = 12;

// Ognisko, nad którym da się piec: płonie albo żarzy się.
const canRoastOn = (fire) => fire.phase === 'burning' || fire.phase === 'collapsing';

const keyOf = ({x, y, z}) => `${x},${y},${z}`;

// Podpowiedź, czym rozpalić (lista: TINDERS w CampfireState.js).
const TINDER_HINT = 'Dodaj podpałkę: korę, trawę, słomę albo hubę';

export class Campfires {
    constructor(game, saved = []) {
        this.game = game;
        this.fires = new Map();
        this.version = 0;
        this.clock = 0;
        this.noticeAt = -10;
        // Pieczenie (trzymany PPM z surowym jedzeniem): { key, type, time }.
        this.roast = null;
        for (const value of Array.isArray(saved) ? saved : []) {
            const fire = restoreCampfire(value);
            if (fire) this.fires.set(keyOf(fire), fire);
        }
        this.renderer = new CampfireRenderer(game);
    }

    get(position) { return position ? this.fires.get(keyOf(position)) : null; }
    getState() { return [...this.fires.values()].map(fire => structuredClone(fire)); }
    drops(position) { return campfireDrops(this.get(position)); }
    notice(text) {
        if (this.clock - this.noticeAt > .8) { this.game.onNotice?.(text); this.noticeAt = this.clock; }
    }
    consume() {
        if (this.game.mode === 'adventure') this.game.inventory.take(this.game.inventory.selected, 1);
        this.version++;
    }

    interact(hit, type) {
        const game = this.game, world = game.world, wood = fuelWood(type);
        if (!hit?.hit) return false;
        let fire = this.get(hit.block);
        if (hit.block.type === 'campfire') {
            // Recover a harmless empty structure if an old/modded save has no metadata.
            if (!fire) { fire = newCampfire(hit.block.x, hit.block.y, hit.block.z); this.fires.set(keyOf(fire), fire); }
            if (wood) {
                if (addFirewood(fire, wood)) {
                    this.consume(); game.playBlockSound('place', 'oak_log', fire);
                    // Dołożone do płonącego ogniska - pali się dłużej.
                    if (fire.phase === 'burning') { this.noticeAt = -10; this.notice(`Dołożono opał: ${fire.logs.length}/6`); }
                }
                else this.notice(fire.phase === 'unlit' ? `Jest już 6 polan. ${TINDER_HINT}.`
                    : fire.phase === 'burning' ? 'Ognisko jest pełne - dołóż, gdy polano się wypali.' : 'Poczekaj, aż polana opadną w żar.');
            } else if (isTinder(type)) {
                if (addTinder(fire, type)) {
                    this.consume(); game.playBlockSound('place', blockExists(type) ? type : 'short_grass', fire);
                    // Lepsza podpałka - krótsze rozpalanie.
                    if (TINDERS[type] > 1) this.notice('Dobra podpałka - ognisko rozpali się szybciej');
                }
                else this.notice(fire.logs.length < 6 ? `Najpierw opał: ${fire.logs.length}/6` : 'Podpałka jest już gotowa lub ognisko płonie.');
            } else if (this.interactPot(fire, type)) {
                // Garnek (1.20.0): postawiony, składnik, porcja albo zdjęcie.
            } else if (getRoast(type)) {
                // Samo pieczenie liczy update (trzeba trzymać PPM).
                if (!canRoastOn(fire)) this.notice(isDrink(getRoast(type)) ? 'Żeby zaparzyć zioła, ognisko musi płonąć.' : 'Żeby coś upiec, ognisko musi płonąć.');
            } else if (type === 'fire_starter') {
                if (fire.phase === 'unlit' && (fire.logs.length < 6 || !fire.tinder)) this.notice(`Potrzeba 6 polan i podpałki (${fire.logs.length}/6).`);
            } else this.notice(this.description(fire));
            return true;
        }
        if (!wood) return false;
        const target = game.placer.targetOf(hit, 'campfire');
        if (!target || isLiquidId(world.getBlockId(target.x, target.y, target.z)) ||
            !isSolidId(world.getBlockId(target.x, target.y - 1, target.z))) {
            this.notice('Ułóż opał na suchym, stałym podłożu.'); return true;
        }
        if (game.placer.placeBlock(hit, 'campfire')) {
            fire = newCampfire(target.x, target.y, target.z);
            addFirewood(fire, wood); this.fires.set(keyOf(fire), fire); this.consume();
            game.playBlockSound('place', 'oak_log', fire);
            this.notice('Opał 1/6. Dokładaj polana PPM.');
        }
        return true;
    }

    // Garnek na ognisku (items/cooking.js). Zwraca true, gdy kliknięcie
    // dotyczyło garnka.
    interactPot(fire, type) {
        const game = this.game, inventory = game.inventory, pot = fire.pot;
        const say = (text) => { this.noticeAt = -10; this.notice(text); };
        if (type === POT || type === POT_WATER) {
            if (pot) say('Na ognisku już stoi garnek.');
            else if (type === POT) say('Najpierw nabierz wody: PPM garnkiem na wodzie.');
            else if (fire.phase === 'collapsing') say('Poczekaj, aż polana opadną w żar.');
            else {
                fire.pot = newPot(); this.consume();
                game.playBlockSound('place', 'clay', fire);
                say(potDescription(fire.pot, fire.phase === 'burning', getItemLabel));
            }
            return true;
        }
        if (!pot) return false;
        if (type === BOWL) {
            if (!pot.dish) { say(pot.empty ? 'Garnek jest pusty.' : 'Jeszcze nie ma czego nabrać.'); return true; }
            const item = dishItem(pot.dish);
            // W przygodzie miska znika z ręki, więc potrawa zawsze się zmieści
            // tylko wtedy, gdy jest na nią miejsce po zabraniu miski.
            if (!inventory.canAdd(item) && !(game.mode === 'adventure' && inventory.get(inventory.selected)?.count === 1)) { say('Ekwipunek pełny'); return true; }
            const dish = takePortion(pot);
            this.consume();
            inventory.add(item);
            game.sounds?.play('pot_serve');
            say(`${DISHES[dish].label} w misce${pot.empty ? ' - garnek pusty' : ` - zostało: ${pot.portions}`}`);
            game.achieve('served', { dish });
            return true;
        }
        if (isIngredient(type)) {
            if (canAddIngredient(pot, type)) {
                addIngredient(pot, type); this.consume();
                game.sounds?.play('pot_drop');
                say(potDescription(pot, fire.phase === 'burning', getItemLabel));
            } else say(pot.dish ? 'Potrawa jest gotowa - nabierz ją glinianą miską.' : pot.empty ? 'Garnek jest pusty - zdejmij go i nabierz wody.' : 'Garnek jest pełny.');
            return true;
        }
        if (!type) {
            // Pusta ręka: zdejmuje garnek (surowe składniki wracają).
            if (pot.dish) { say(`W garnku jest jeszcze ${DISHES[pot.dish].label.toLowerCase()} - nabierz glinianą miską.`); return true; }
            const drops = potDrops(pot);
            if (!inventory.canAddAll(drops)) { say('Ekwipunek pełny'); return true; }
            for (const drop of drops) inventory.add(drop.type, drop.count);
            fire.pot = null; this.version++;
            game.playBlockSound('break', 'clay', fire);
            say('Garnek zdjęty z ogniska');
            return true;
        }
        if (getRoast(type)) { say('Garnek zajmuje ognisko - zdejmij go pustą ręką, żeby piec.'); return true; }
        // Opał, podpałka i starter obsługuje ognisko; reszta - opis garnka.
        if (type === 'fire_starter') return false;
        say(potDescription(pot, fire.phase === 'burning', getItemLabel));
        return true;
    }

    description(fire) {
        // Płonie: ile polan zostało i na jak długo (minuty prawdziwego czasu).
        if (fire.phase === 'burning') {
            const minutes = burnSecondsLeft(fire) / 60;
            return `Ognisko płonie - opał ${fire.logs.length}/6, ${minutes >= 1 ? `jeszcze ok. ${Math.round(minutes)} min` : 'zaraz zgaśnie'}`;
        }
        if (fire.phase === 'collapsing') return 'Polana opadają w żar';
        if (fire.ignition > 0) return `Rozpalanie: ${Math.round(fire.ignition * 100)}% — trzymaj PPM`;
        if (fire.logs.length < 6) return `Opał ${fire.logs.length}/6 — dokładaj PPM`;
        return fire.tinder ? 'Przytrzymaj PPM starterem ognia' : TINDER_HINT;
    }

    update(dt, holding) {
        this.clock += dt;
        const game = this.game, hit = game.currentHit;
        for (const [key, fire] of this.fires) {
            const chunk = game.world.getChunk(game.world.toChunkCoord(fire.x), game.world.toChunkCoord(fire.z));
            if (chunk && game.world.getBlockId(fire.x, fire.y, fire.z) !== getBlockId('campfire')) {
                this.fires.delete(key); this.version++; continue;
            }
            const active = holding && hit?.hit && keyOf(hit.block) === key && game.selectedBlock === 'fire_starter';
            const phase = fire.phase, logs = fire.logs.length;
            const cooked = updateCampfire(fire, dt, active);
            if (cooked) this.cooked(fire, cooked);
            else if (chunk && fire.phase === 'burning' && isCooking(fire.pot)) this.bubble(fire, dt);
            // Wypalone polano: stos jest niższy (zapis, gra ze znajomymi).
            if (logs !== fire.logs.length) this.version++;
            if (phase !== fire.phase) {
                this.version++;
                if (active && fire.phase === 'burning') {
                    this.noticeAt = -10;
                    this.notice('Ognisko rozpalone');
                }
            }
            if (active && fire.ignition > 0 && fire.phase === 'unlit') {
                this.notice(this.description(fire));
                if (Math.floor(this.clock * 5) !== Math.floor((this.clock - dt) * 5)) game.swingArm();
            }
        }
        this.updateRoast(dt, holding, hit);
        this.renderer.update(dt, this.fires, this.clock);
    }

    // Potrawa właśnie się ugotowała: zapis, napis i dźwięk dla gracza obok.
    cooked(fire, dish) {
        this.version++;
        const player = this.game.player?.pos;
        if (!player || Math.hypot(fire.x + .5 - player.x, fire.y - player.y, fire.z + .5 - player.z) > COOK_NOTICE_RANGE) return;
        this.noticeAt = -10;
        this.notice(`Gotowe: ${DISHES[dish].label} - nabierz glinianą miską`);
        this.game.sounds?.play('pot_ready', { position: { x: fire.x + .5, y: fire.y + .6, z: fire.z + .5 } });
        this.game.achieve('cooked', { dish });
    }

    // Bulgotanie gotującego się garnka (co kilka sekund, słychać z bliska).
    bubble(fire, dt) {
        fire.pot.bubble = (fire.pot.bubble ?? 1) - dt;
        if (fire.pot.bubble > 0) return;
        fire.pot.bubble = 1.6 + Math.random() * 1.4;
        this.game.sounds?.play('pot_boil', { position: { x: fire.x + .5, y: fire.y + .6, z: fire.z + .5 } });
    }

    // Pieczenie: trzymany PPM z surowym jedzeniem na płonącym ognisku.
    // Po ROAST_SECONDS jedna sztuka zamienia się w pieczoną.
    updateRoast(dt, holding, hit) {
        const game = this.game, type = game.selectedBlock, roasted = getRoast(type);
        const fire = holding && roasted && hit?.hit && hit.block.type === 'campfire' ? this.get(hit.block) : null;
        // (Garnek zajmuje ognisko - piec można po jego zdjęciu.)
        if (!fire || fire.pot || !canRoastOn(fire)) { this.roast = null; return; }
        const key = keyOf(fire);
        if (!this.roast || this.roast.key !== key || this.roast.type !== type) {
            this.roast = { key, type, time: 0 };
            game.sounds?.play('sizzle');
        }
        const before = this.roast.time;
        this.roast.time += dt;
        if (Math.floor(this.roast.time * 2.5) !== Math.floor(before * 2.5)) game.swingArm();
        if (Math.floor(this.roast.time / 0.9) !== Math.floor(before / 0.9)) game.sounds?.play('sizzle');
        if (this.roast.time < ROAST_SECONDS) {
            this.notice(`${isDrink(roasted) ? 'Parzenie' : 'Pieczenie'}: ${Math.round(this.roast.time / ROAST_SECONDS * 100)}% — trzymaj PPM`);
            return;
        }
        this.roast = null;
        const inventory = game.inventory;
        if (game.mode === 'adventure') inventory.take(inventory.selected, 1);
        this.noticeAt = -10;
        if (inventory.canAdd(roasted)) {
            inventory.add(roasted);
            this.notice(`Gotowe: ${getItemLabel(roasted)}`);
            game.achieve('roasted', { type, into: roasted });
        } else {
            // Nie ma miejsca: surowe wraca do ręki.
            if (game.mode === 'adventure') inventory.add(type);
            this.notice('Ekwipunek pełny');
        }
    }

    // Świat nadrabia przespany czas (sen, utrata przytomności -
    // Game.advanceWorld): ogniska palą się tak, jakby minęło tyle sekund.
    // Garnek gotuje się tak długo, jak przez ten czas płonął ogień.
    advance(seconds) {
        for (const fire of this.fires.values()) updateCampfire(fire, seconds);
        this.version++;
    }

    dispose() { this.renderer.dispose(); this.fires.clear(); }
}
