import { SELF_LIGHTING, newCampfire, restoreCampfire, updateCampfire, addFirewood, addTinder, addKindling,
    fuelWood, fuelName, isTinder, campfireDrops, burnSecondsLeft, TINDERS, FIRE_WOODS, KINDLING, KINDLING_MAX, KINDLING_TEMP,
    canIgnite, catchesFromEmbers, startTemp, emberTemp, campfireTemp, cookSpeed, logIgnite, topLog } from './CampfireState.js';
import { wetOf, isWet } from '../items/moisture.js';
import { PROCHNO, PROCHNO_EMBER, EMBER_CARRY_SECONDS, burnEmbers } from '../items/prochno.js';
import { makeItem } from '../items/freshness.js';
import { getBlockId, isLiquidId, isSolidId, blockExists } from '../blocks/BlockRegistry.js';
import { CampfireRenderer } from '../rendering/CampfireRenderer.js';
import { getRoast, isDrink, ROAST_SECONDS, roastSeconds, roastWord } from '../items/foods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { POT, POT_WATER, BOWL, DISHES, dishItem, isIngredient } from '../items/cooking.js';
import { newPot, addIngredient, canAddIngredient, takePortion, potDrops, potDescription, isCooking } from './CookingState.js';

// Z jak daleka gracz słyszy i widzi napis, że potrawa gotowa.
const COOK_NOTICE_RANGE = 12;

// Ognisko, nad którym da się piec: płonie albo żarzy się (od 1.32.0
// także na samym żarze po ognisku - wolniej).
const canRoastOn = (fire) => fire.phase === 'burning' || fire.phase === 'collapsing' || fire.embers > 0;

// Od takiej jasności nieba ognisko stoi pod gołym niebem (0-15).
const OPEN_SKY = 12;

// Z jak daleka gracz dostaje napis, że polano zajęło się od żaru.
const EMBER_NOTICE_RANGE = 8;

// Temperatura do napisów: w dziesiątkach stopni.
const degrees = (temp) => `${Math.round(temp / 10) * 10}°`;

// Nazwa drewna wielką literą ("Dąb", "Sosna oścista").
const woodName = (wood) => { const name = fuelName(wood); return name[0].toUpperCase() + name.slice(1); };

const keyOf = ({x, y, z}) => `${x},${y},${z}`;

// Podpowiedź, czym rozpalić (lista: TINDERS w CampfireState.js).
const TINDER_HINT = 'Dodaj podpałkę: korę, trawę, słomę albo hubę';

// Podpałka nie da rady polanu z wierzchu: co z tym zrobić.
// (Od 1.33.0 mokre polano ma wyższy zapłon - wtedy pomaga też suszenie.)
function tooCold(fire) {
    const top = topLog(fire), wet = isWet(top.wet ?? 0);
    const more = (fire.kindling ?? 0) < KINDLING_MAX ? `Dołóż patyk jako rozpałkę (+${KINDLING_TEMP}°)` : wet ? 'Wysusz drewno, użyj lepszej podpałki' : 'Użyj lepszej podpałki';
    return `${woodName(top.wood)}${wet ? ' (mokre drewno)' : ''} zajmuje się od ${Math.round(logIgnite(top))}°, a podpałka daje ${startTemp(fire)}°. ${more} albo zacznij od ${wet ? 'suchego' : 'łatwiejszego'} drewna na wierzchu.`;
}

export class Campfires {
    constructor(game, saved = []) {
        this.game = game;
        this.fires = new Map();
        this.version = 0;
        this.clock = 0;
        this.noticeAt = -10;
        // Pieczenie (trzymany PPM z surowym jedzeniem): { key, type, time }.
        this.roast = null;
        // Kiedy następne bulgotanie gotującego się garnka (ognisko -> sekundy).
        this.bubbles = new WeakMap();
        // Kiedy następny syk mokrego polana (ognisko -> sekundy).
        this.hisses = new WeakMap();
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
        // Wilgotność polan w ręce (1.33.0).
        const held = game.inventory?.selectedItem, wet = wetOf(held?.type === type ? held : null);
        let fire = this.get(hit.block);
        if (hit.block.type === 'campfire') {
            // Recover a harmless empty structure if an old/modded save has no metadata.
            if (!fire) { fire = newCampfire(hit.block.x, hit.block.y, hit.block.z); this.fires.set(keyOf(fire), fire); }
            if (wood) {
                if (addFirewood(fire, wood, wet)) {
                    this.consume(); game.playBlockSound('place', 'oak_log', fire);
                    // Dołożone do płonącego ogniska - pali się dłużej.
                    if (fire.phase === 'burning') { this.noticeAt = -10; this.notice(`Dołożono opał: ${fire.logs.length}/6${isWet(wet) ? ' (mokre - syczy i dymi, póki nie przeschnie)' : ''}`); }
                    // Na żar: łatwe drewno zajmie się samo.
                    else if (fire.embers > 0) { this.noticeAt = -10; this.notice(this.description(fire)); }
                }
                else this.notice(fire.phase === 'unlit' ? `Jest już 6 polan. ${TINDER_HINT}.`
                    : fire.phase === 'burning' ? 'Ognisko jest pełne - dołóż, gdy polano się wypali.' : 'Poczekaj, aż polana opadną w żar.');
            } else if (type === PROCHNO && (fire.phase === 'burning' || fire.embers > 0)) {
                // Próchno na ogniu albo żarze (1.37.0): zajmuje się i niesie żar.
                const ember = makeItem(PROCHNO_EMBER, 1, 1);
                this.noticeAt = -10;
                if (game.mode === 'adventure' && held?.count > 1 && !game.inventory.canAdd(PROCHNO_EMBER)) this.notice('Ekwipunek pełny');
                else {
                    this.consume();
                    game.inventory.addItem(ember);
                    game.sounds?.play('sizzle', { position: { x: fire.x + .5, y: fire.y + .4, z: fire.z + .5 }, volume: 0.4 });
                    this.notice(`Próchno zajęło się żarem - tli się ${Math.round(EMBER_CARRY_SECONDS / 60)} minuty. Połóż je na ułożonym stosie.`);
                    game.achieve('emberTaken', {});
                }
            } else if (isTinder(type)) {
                if (addTinder(fire, type)) {
                    this.consume(); game.playBlockSound('place', blockExists(type) ? type : 'short_grass', fire);
                    // Za słaba na polano z wierzchu - od razu wiadomo, co zrobić.
                    if (!canIgnite(fire)) { this.noticeAt = -10; this.notice(tooCold(fire)); }
                    else if (type === PROCHNO_EMBER) { this.noticeAt = -10; this.notice('Tlące się próchno na stosie - ognisko rozpali się samo'); }
                    // Lepsza podpałka - krótsze rozpalanie.
                    else if (TINDERS[type] > 1) this.notice('Dobra podpałka - ognisko rozpali się szybciej');
                }
                else this.notice(fire.logs.length < 6 ? `Najpierw opał: ${fire.logs.length}/6` : 'Podpałka jest już gotowa lub ognisko płonie.');
            } else if (type === KINDLING && fire.phase === 'unlit') {
                // Patyki jako rozpałka (1.32.0): podnoszą temperaturę podpałki.
                if (addKindling(fire)) {
                    this.consume(); game.playBlockSound('place', 'oak_log', fire);
                    this.noticeAt = -10;
                    this.notice(`Rozpałka z patyków ${fire.kindling}/${KINDLING_MAX}` + (!fire.tinder ? ` (+${fire.kindling * KINDLING_TEMP}° do podpałki). ${TINDER_HINT}.`
                        : canIgnite(fire) ? `: ${startTemp(fire)}° - wystarczy. Przytrzymaj PPM starterem ognia.` : `. ${tooCold(fire)}`));
                }
                else this.notice(fire.logs.length < 6 ? `Najpierw opał: ${fire.logs.length}/6` : `Więcej patyków się nie zmieści (${KINDLING_MAX}/${KINDLING_MAX}).`);
            } else if (this.interactPot(fire, type)) {
                // Garnek (1.20.0): postawiony, składnik, porcja albo zdjęcie.
            } else if (getRoast(type)) {
                // Samo pieczenie liczy update (trzeba trzymać PPM).
                if (!canRoastOn(fire)) this.notice(roastWord(type) === 'odparowywanie' ? 'Żeby odparować sok na syrop, ognisko musi płonąć albo się żarzyć.' : isDrink(getRoast(type)) ? 'Żeby zaparzyć zioła, ognisko musi płonąć albo się żarzyć.' : 'Żeby coś upiec, ognisko musi płonąć albo się żarzyć.');
            } else if (type === 'fire_starter') {
                if (fire.phase === 'unlit' && (fire.logs.length < 6 || !fire.tinder)) this.notice(`Potrzeba 6 polan i podpałki (${fire.logs.length}/6).`);
                else if (fire.phase === 'unlit' && !canIgnite(fire)) { this.noticeAt = -10; this.notice(tooCold(fire)); }
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
            addFirewood(fire, wood, wet); this.fires.set(keyOf(fire), fire); this.consume();
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
        // Płonie: temperatura, ile polan zostało i na jak długo (minuty
        // prawdziwego czasu).
        if (fire.phase === 'burning') {
            const minutes = burnSecondsLeft(fire) / 60;
            const damp = (isWet(topLog(fire).wet ?? 0) ? ', mokre drewno' : '') + (fire.rain > 0 ? ', pada na nie deszcz' : '');
            return `Ognisko płonie (${degrees(campfireTemp(fire))}${damp}) - opał ${fire.logs.length}/6, ${minutes >= 1 ? `jeszcze ok. ${Math.round(minutes)} min` : 'zaraz zgaśnie'}`;
        }
        if (fire.phase === 'collapsing') return 'Polana opadają w żar';
        // Żar po ognisku: polano zajmuje się samo, jeśli żar jest dość gorący.
        if (catchesFromEmbers(fire)) return `Polano zajmuje się od żaru: ${Math.round(fire.ignition * 100)}%`;
        if (fire.ignition > 0) return `Rozpalanie: ${Math.round(fire.ignition * 100)}% — trzymaj PPM`;
        if (fire.embers > 0 && fire.logs.length === 0) return `Żar (${degrees(emberTemp(fire))}) - dołóż polano, a zajmie się samo`;
        if (fire.embers > 0 && fire.logs.length < 6) {
            const top = topLog(fire);
            return `Żar (${degrees(emberTemp(fire))}) jest za słaby: ${woodName(top.wood).toLowerCase()}${isWet(top.wet ?? 0) ? ' (mokre drewno)' : ''} zajmuje się od ${Math.round(logIgnite(top))}°. Opał ${fire.logs.length}/6`;
        }
        if (fire.logs.length < 6) return `Opał ${fire.logs.length}/6 — dokładaj PPM`;
        if (!fire.tinder) return TINDER_HINT;
        return canIgnite(fire) ? 'Przytrzymaj PPM starterem ognia' : tooCold(fire);
    }

    update(dt, holding) {
        this.clock += dt;
        const game = this.game, hit = game.currentHit;
        const rain = Number.isFinite(game.rainNow) && game.rainNow > 0.05 ? Math.min(1, game.rainNow) : 0;
        for (const [key, fire] of this.fires) {
            const chunk = game.world.getChunk(game.world.toChunkCoord(fire.x), game.world.toChunkCoord(fire.z));
            if (chunk && game.world.getBlockId(fire.x, fire.y, fire.z) !== getBlockId('campfire')) {
                this.fires.delete(key); this.version++; continue;
            }
            const active = holding && hit?.hit && keyOf(hit.block) === key && game.selectedBlock === 'fire_starter';
            const phase = fire.phase, logs = fire.logs.length;
            // Deszcz (1.35.0): pada na ogniska pod gołym niebem.
            fire.rain = chunk && rain > 0 && (fire.phase !== 'unlit' || fire.embers > 0) &&
                (game.world.getLight?.(fire.x, fire.y + 1, fire.z)?.sky ?? 0) >= OPEN_SKY ? rain : 0;
            const selfLit = fire.tinder === SELF_LIGHTING;
            const cooked = updateCampfire(fire, dt, active);
            if (fire.doused) {
                // Deszcz zgasił ognisko: syk i napis dla gracza obok.
                delete fire.doused;
                if (this.near(fire, EMBER_NOTICE_RANGE * 2)) {
                    this.noticeAt = -10;
                    this.notice('Deszcz zgasił ognisko');
                    game.sounds?.play('sizzle', { position: { x: fire.x + .5, y: fire.y + .4, z: fire.z + .5 } });
                    game.achieve('fireDoused', { wood: topLog(fire)?.wood ?? null });
                }
            }
            if (cooked) this.cooked(fire, cooked);
            else if (chunk && fire.phase === 'burning' && isCooking(fire.pot)) this.bubble(fire, dt);
            // Mokre polano w ogniu syczy (1.33.0).
            if (chunk && fire.phase === 'burning' && isWet(topLog(fire).wet ?? 0)) this.hiss(fire, dt);
            // Wypalone polano: stos jest niższy (zapis, gra ze znajomymi).
            if (logs !== fire.logs.length) this.version++;
            if (phase !== fire.phase) {
                this.version++;
                if (active && fire.phase === 'burning') {
                    this.noticeAt = -10;
                    this.notice('Ognisko rozpalone');
                    game.achieve('fireLit', { wood: topLog(fire).wood, woods: fire.logs.map((log) => log.wood), embers: false, wet: topLog(fire).wet ?? 0 });
                } else if (selfLit && fire.phase === 'burning') {
                    // Tlące się próchno rozpaliło stos (1.37.0).
                    if (this.near(fire, EMBER_NOTICE_RANGE * 2)) { this.noticeAt = -10; this.notice('Ognisko rozpalone od tlącego się próchna'); }
                    game.achieve('fireLit', { wood: topLog(fire).wood, woods: fire.logs.map((log) => log.wood), embers: false, carried: true, wet: topLog(fire).wet ?? 0 });
                } else if (phase === 'unlit' && fire.phase === 'burning' && this.near(fire, EMBER_NOTICE_RANGE)) {
                    // Polano zajęło się samo od żaru.
                    this.noticeAt = -10;
                    this.notice('Polano zajęło się od żaru');
                    game.achieve('fireLit', { wood: topLog(fire).wood, woods: fire.logs.map((log) => log.wood), embers: true, wet: topLog(fire).wet ?? 0 });
                }
            }
            if (active && fire.ignition > 0 && fire.phase === 'unlit') {
                this.notice(this.description(fire));
                if (Math.floor(this.clock * 5) !== Math.floor((this.clock - dt) * 5)) game.swingArm();
            }
        }
        this.updateRoast(dt, holding, hit);
        // Tlące się próchno w ekwipunku przygasa (items/prochno.js).
        if (burnEmbers(game.inventory, dt) > 0) { this.noticeAt = -10; this.notice('Tlące się próchno zgasło'); }
        this.renderer.update(dt, this.fires, this.clock);
    }

    // Czy gracz jest nie dalej niż `range` bloków od ogniska.
    near(fire, range) {
        const player = this.game.player?.pos;
        return Boolean(player) && Math.hypot(fire.x + .5 - player.x, fire.y - player.y, fire.z + .5 - player.z) <= range;
    }

    // Potrawa właśnie się ugotowała: zapis, napis i dźwięk dla gracza obok.
    cooked(fire, dish) {
        this.version++;
        if (!this.near(fire, COOK_NOTICE_RANGE)) return;
        this.noticeAt = -10;
        this.notice(`Gotowe: ${DISHES[dish].label} - nabierz glinianą miską`);
        this.game.sounds?.play('pot_ready', { position: { x: fire.x + .5, y: fire.y + .6, z: fire.z + .5 } });
        this.game.achieve('cooked', { dish });
    }

    // Bulgotanie gotującego się garnka (co kilka sekund, słychać z bliska).
    bubble(fire, dt) {
        // (Licznik poza stanem ogniska - nie trafia do zapisu.)
        const left = (this.bubbles.get(fire) ?? 1) - dt;
        this.bubbles.set(fire, left > 0 ? left : 1.6 + Math.random() * 1.4);
        if (left > 0) return;
        this.game.sounds?.play('pot_boil', { position: { x: fire.x + .5, y: fire.y + .6, z: fire.z + .5 } });
    }

    // Syk mokrego drewna (co kilka sekund, słychać z bliska).
    hiss(fire, dt) {
        const left = (this.hisses.get(fire) ?? 0.6) - dt;
        this.hisses.set(fire, left > 0 ? left : 2.2 + Math.random() * 2.2);
        if (left > 0) return;
        this.game.sounds?.play('sizzle', { position: { x: fire.x + .5, y: fire.y + .4, z: fire.z + .5 }, volume: 0.6 });
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
        // Nad gorętszym ogniem piecze się szybciej, na samym żarze wolniej.
        this.roast.time += dt * cookSpeed(campfireTemp(fire));
        if (Math.floor(this.roast.time * 2.5) !== Math.floor(before * 2.5)) game.swingArm();
        if (Math.floor(this.roast.time / 0.9) !== Math.floor(before / 0.9)) game.sounds?.play('sizzle');
        const needed = roastSeconds(type);
        if (this.roast.time < needed) {
            const word = roastWord(type);
            this.notice(`${word[0].toUpperCase()}${word.slice(1)}: ${Math.round(this.roast.time / needed * 100)}% — trzymaj PPM`);
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
        // (Przespanego deszczu nie liczymy - ogniska dopalają się jak w pogodę.)
        for (const fire of this.fires.values()) { fire.rain = 0; updateCampfire(fire, seconds); delete fire.doused; }
        this.version++;
    }

    dispose() { this.renderer.dispose(); this.fires.clear(); }
}
