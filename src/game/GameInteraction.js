// ------------------------------------------------------------
// GRA - CELOWANIE I KLIKNIĘCIA (0.96.0, wydzielone z Game.js)
//
// To, co gracz robi z blokami i przedmiotami:
//
//   updateInteraction - co klatkę: cel pod celownikiem, LPM i PPM
//                       (co się stanie, zależy od tego, co gracz
//                       trzyma i na co patrzy), środkowy przycisk,
//   updateMining      - kopanie (przygoda: trzymany LPM, pęknięcia;
//                       kreatywny: od razu),
//   breakTarget, breakDrops - zniszczenie bloku i to, co z niego wypada,
//   harvestTarget, addHarvest - zbiór owoców, żywicy, kwiatów (PPM),
//   stripTarget       - okorowanie pnia siekierą,
//   tillTarget, canPlantAt - rozgrzebana ziemia i sadzenie na niej,
//   updateWellbeing, eat - energia i jedzenie (Wellbeing.js),
//   pickBlock         - "weź blok" (środkowy przycisk).
//
// Game dziedziczy po tej klasie (class Game extends GameInteraction),
// więc wszystkie metody działają na grze: this to obiekt Game (świat,
// gracz, ekwipunek...). Nowe narzędzie albo nowy rodzaj kliknięcia
// dopisz tutaj, nie w Game.js.
// ------------------------------------------------------------

import * as THREE from 'three';
import { dyeTorch } from './TorchInteraction.js';
import { shapeInfo, shapeItem } from '../blocks/woodShapes.js';
import { beddingOf } from '../blocks/bedding.js';
import { isChestType } from '../blocks/chest.js';
import {
    getStrip,
    getTill,
    getHarvest,
    getRiverPlant,
    getBlockId,
    getBlockDefinition,
    getDropType,
    getBreakTime,
    isWaterloggedPlantId,
    getLiquidKindId,
    isPlantId,
    canPlantStay,
    ATTACH_OFFSETS,
    getAttach,
    getDropCount,
    getLoot,
    isReplaceableId,
    isLiquidId,
    FIELD_BLOCK
} from '../blocks/BlockRegistry.js';
import { getTool, getPlacedBlock, isItemType, getItemLabel } from '../items/ItemRegistry.js';
import { STATES, isNight } from './Wellbeing.js';
import { getFood } from '../items/foods.js';
import { EFFECTS } from '../items/effects.js';
import {
    CREATIVE_REPEAT_SECONDS,
    MINING_HIT_SECONDS,
    MINING_DELAY_SECONDS,
    HOTBAR_SIZE,
    isCreative
} from '../config.js';


export class GameInteraction {

    // Co klatkę (z Game.update): cel pod celownikiem i kliknięcia.
    // Zwraca { breakPressed, breakHeld } - reszta klatki (ogniska)
    // musi wiedzieć, czy gracz właśnie kopie.

    updateInteraction(dt, input) {

        this.currentHit =
            this.raycast.castFromCamera(this.camera);


        // Oba kliknięcia odczytujemy od razu: gdy w tej samej klatce
        // wciśnięto LPM i PPM, wygrywa niszczenie, a PPM przepada
        // (inaczej blok postawiłby się klatkę później sam z siebie).

        let breakPressed = input.consumeMousePress(0);
        let placePressed = input.consumeMousePress(2);
        const raftInteraction = this.rafts?.interact({ breakPressed, placePressed, terrainHit: this.currentHit });
        if (raftInteraction) { breakPressed = false; placePressed = false; this.mining = null; }

        // Trzymany LPM: w przygodzie kopie (blok pęka i znika po czasie
        // kopania), w kreatywnym niszczy kolejne bloki co chwilę.

        const breakHeld = !raftInteraction && !this.rafts?.mounted && input.isMouseDown(0);


        // PPM siekierą na pniu - okorowanie.

        const stripping =
            placePressed &&
            getTool(this.selectedBlock) === 'axe' &&
            this.currentHit?.hit &&
            getStrip(this.currentHit.block.type) !== null;


        // PPM łopatą na ziemi albo trawie - rozgrzebana ziemia (pole).

        const tilling =
            placePressed &&
            getTool(this.selectedBlock) === 'shovel' &&
            this.currentHit?.hit &&
            getTill(this.currentHit.block.type) !== null;


        // PPM na krzaku z owocami zbiera owoce (z Shiftem i czymś
        // w ręce - zwyczajnie stawia obok). Tak samo żywica z pnia
        // sosny i kwiaty z kwitnącej lipy.

        const harvesting =
            placePressed &&
            !stripping &&
            !(this.player.crouching && this.selectedBlock) &&
            this.currentHit?.hit &&
            getHarvest(this.currentHit.block.type) !== null;


        // Machnięcie ręką przy każdym kliknięciu (jak w Minecrafcie).

        if (breakPressed || (placePressed && (this.selectedBlock || harvesting))) {
            this.swingArm();
        }


        const mined = this.updateMining(dt, breakPressed, breakHeld);

        if (breakPressed || mined) {

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        // PPM - tylko gdy w tej samej klatce nie było LPM.

        const placing = !breakPressed;

        // Stół stolarski (deski na blat, wyroby) i furtka (otwórz/zamknij).
        // Z Shiftem i blokiem w ręce przy furtce - stawia się blok obok.
        const hitShape = this.currentHit?.hit ? shapeInfo(this.world.getBlockId(this.currentHit.block.x, this.currentHit.block.y, this.currentHit.block.z)) : null;
        // Łóżko i posłanie (0.98.0): pościelenie stelaża albo sen. Z Shiftem
        // i blokiem w ręce - stawia się blok obok.
        const bedHit = hitShape?.kind === 'bed' || hitShape?.kind === 'mat';
        const shapeInteraction = placing && !breakHeld && placePressed && hitShape && (bedHit
            ? !(this.player.crouching && this.selectedBlock) && this.beds.interact(this.currentHit, this.selectedBlock)
            : (hitShape.kind === 'table' || (['gate', 'door', 'trapdoor'].includes(hitShape.kind) && !(this.player.crouching && this.selectedBlock))) &&
                this.carpenterTables.interact(this.currentHit, this.selectedBlock, this.player.crouching));
        if (shapeInteraction) this.currentHit = this.raycast.castFromCamera(this.camera);
        const chestInteraction = !shapeInteraction && placing && !breakHeld && placePressed &&
            this.chests.interact(this.currentHit);
        const fireInteraction = !chestInteraction && placing && !breakHeld && placePressed &&
            this.campfires.interact(this.currentHit, this.selectedBlock);
        const torchInteraction = !fireInteraction && placing && !breakHeld && placePressed &&
            dyeTorch(this, this.currentHit, this.selectedBlock);

        // Sen na gołej ziemi: kucnięcie + PPM pustą ręką w ziemię pod nogami.
        const groundSleep = !shapeInteraction && !chestInteraction && !fireInteraction && placing && !breakHeld && placePressed &&
            this.player.crouching && !this.selectedBlock && this.player.onGround && this.currentHit?.hit &&
            this.currentHit.normal?.y === 1 && isNight(this.time.days) && this.sleep.startOnGround();

        if (chestInteraction || shapeInteraction || groundSleep) {
            // Ekwipunek ze skrzynią już się otwiera / stół i furtka obsłużone.
        }
        else if (fireInteraction || torchInteraction) {
            this.currentHit = this.raycast.castFromCamera(this.camera);
        }
        else if (placing && stripping) {

            this.stripTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placing && tilling) {

            this.tillTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placing && harvesting) {

            this.harvestTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placing && placePressed) {

            // Puste miejsce na pasku - nie ma czego postawić. Owoc albo
            // nasiono sadzi się tylko na rozgrzebanej ziemi (useSeed),
            // inny przedmiot - nic.

            const type = this.selectedBlock;

            const block = type ? getPlacedBlock(type) : null;

            if (block && isItemType(type) && !this.canPlantAt(this.currentHit, block)) {

                // Nie na polu: jedzenie się zjada, nasiono podpowiada.

                if (getFood(type) && this.wellbeing.active) {
                    this.eat();
                }
                else {
                    this.onNotice?.('Najpierw rozgrzeb ziemię łopatą');
                }

            }
            else if (block) {

                const river = getRiverPlant(getBlockId(block));
                const surfacePlant = river && river.kind !== 'milfoil' &&
                    (river.waterlogged || river.kind === 'cattail');
                const placeHit = surfacePlant
                    ? this.raycast.castFromCamera(this.camera, true)
                    : this.currentHit;
                const target = this.placer.targetOf(placeHit, block);

                // Stół stolarski i drzwi - dwa bloki naraz (CarpenterTables).
                const item = shapeItem(block);
                const table = item?.kind === 'table' ? item : null;
                const door = item?.kind === 'door' ? item : null;
                // Stelaż łóżka i posłanie - też dwa bloki (Beds).
                const bed = item?.kind === 'bed' ? item : null;
                const mat = beddingOf(block);

                const placed = table
                    ? (target ? this.carpenterTables.place(target, table.wood, this.player.yaw, this.player) : false)
                    : door
                    ? (target ? this.carpenterTables.placeDoor(target, door.wood, this.player.yaw, this.player) : false)
                    : bed
                    ? (target ? this.beds.placeBed(target, bed.wood, this.player.yaw, this.player) : false)
                    : mat
                    ? (target ? this.beds.placeMat(target, mat, this.player.yaw, this.player) : false)
                    : this.placer.placeBlock(
                        placeHit,
                        block
                    );

                if (placed) {

                    this.playBlockSound('place', block, target);

                    // Nowa skrzynia - pusta zawartość (i model).
                    if (isChestType(placed)) {
                        this.chests.ensure(target);
                    }

                    this.achieve('blockPlaced', { type: block });

                    // Owoc postawiony jako sadzonka - posadzony.

                    if (block !== type) {
                        this.achieve('planted', { type: block, item: type });
                    }

                }

                // W przygodzie postawiony blok (posadzony owoc) znika ze stosu.

                if (placed && this.mode === 'adventure') {
                    this.inventory.take(this.inventory.selected, 1);
                }

                this.currentHit =
                    this.raycast.castFromCamera(this.camera);

            }

        }


        // Środkowy przycisk: weź blok, na który patrzysz.

        if (
            input.consumeMousePress(1) &&
            this.currentHit &&
            this.currentHit.hit
        ) {
            this.pickBlock(getBlockDefinition(this.currentHit.block.type)?.pick ?? this.currentHit.block.type);
        }

        return { breakPressed, breakHeld };

    }


    // KOPANIE. Zwraca true, gdy w tej klatce zniknął blok.
    //
    // Kreatywny: kliknięcie niszczy blok od razu, trzymany LPM - kolejne
    // bloki co CREATIVE_REPEAT_SECONDS.
    // Przygoda: trzeba trzymać LPM na bloku przez czas kopania
    // (getBreakTime; pasujące narzędzie - siekiera, kilof, łopata -
    // szybciej). Blok pęka (BlockCracks), co MINING_HIT_SECONDS ręka
    // uderza: stuk i odłamki. Zmiana celu albo puszczenie LPM - od nowa.
    // Rośliny znikają od razu.

    updateMining(dt, pressed, held) {

        const hit = this.currentHit?.hit ? this.currentHit : null;


        if (this.mode !== 'adventure') {

            this.stopMining();

            if (pressed) {

                this.breakRepeat = CREATIVE_REPEAT_SECONDS;

                return this.breakTarget(hit);

            }

            if (held && hit) {

                this.breakRepeat -= dt;

                if (this.breakRepeat <= 0) {

                    this.breakRepeat = CREATIVE_REPEAT_SECONDS;

                    this.swingArm(Math.max(CREATIVE_REPEAT_SECONDS, 0.2));

                    return this.breakTarget(hit);

                }

            }

            return false;

        }


        this.miningDelay = Math.max(0, this.miningDelay - dt);

        if (!(pressed || held) || !hit) {

            // Puszczony LPM tuż przed rozbiciem (osiągnięcie).

            if (this.mining && !held && this.mining.progress >= 0.5) {
                this.achieve('miningAbandoned', { type: this.mining.type, progress: this.mining.progress });
            }

            this.stopMining();

            return false;

        }


        // Przerwa po rozbitym bloku (albo po napisie "Ekwipunek pełny" -
        // żeby trzymany LPM nie powtarzał go w każdej klatce).

        if (this.miningDelay > 0) {

            this.cracks.update(null, 0);

            return false;

        }


        const { x, y, z, type } = hit.block;

        let mining = this.mining;

        if (!mining || mining.x !== x || mining.y !== y || mining.z !== z || mining.type !== type) {

            // Pełny ekwipunek - nie ma sensu kopać (blok i tak by został).

            const drop = getDropType(type);

            if (drop && !this.inventory.canAdd(drop)) {

                this.onNotice?.('Ekwipunek pełny');

                this.stopMining();

                this.miningDelay = 1;

                return false;

            }

            mining = this.mining = { x, y, z, type, progress: 0, hit: 0 };

        }


        // Zmęczony kopie wolniej, w świetnej formie szybciej.

        const time = getBreakTime(type, getTool(this.selectedBlock)) / this.wellbeing.effects.work;

        mining.progress = time <= 0 ? 1 : mining.progress + dt / time;


        // Uderzenie: machnięcie, stuk (dźwięk kroku po tym bloku), odłamki.

        mining.hit -= dt;

        if (mining.hit <= 0 && mining.progress < 1) {

            mining.hit = MINING_HIT_SECONDS;

            if (!pressed) {
                this.swingArm(MINING_HIT_SECONDS);
            }

            this.playBlockSound('step', type, hit.block, 0.7);

            this.debris.chips(type, x, y, z, hit.normal);

        }


        if (mining.progress >= 1) {

            const broken = this.breakTarget(hit);

            this.stopMining();

            // Pełny ekwipunek - blok zostaje; nie próbujemy co klatkę.

            this.miningDelay = broken ? MINING_DELAY_SECONDS : 1;

            return broken;

        }

        this.cracks.update(mining, mining.progress);

        return false;

    }


    // Energia: zużycie przy wysiłku, burczenie w brzuchu, jedzenie (F).

    updateWellbeing(dt, input) {

        const player = this.player, wellbeing = this.wellbeing;
        const jumps = player.jumpCount - this.seenJumps;
        this.seenJumps = player.jumpCount;
        this.eatDelay = Math.max(0, this.eatDelay - dt);

        if (input.consumeKeyPress('KeyF')) {
            this.eat();
        }

        if (!wellbeing.active || player.flying) {
            return;
        }

        // Twarde lądowanie tłucze nogę (nie w wodzie i nie po locie
        // z kosmosu - tam rządzi Skyfall).

        const skyfall = player.skyfall || this.wasSkyfall;
        this.wasSkyfall = player.skyfall;

        if (player.landed > 0 && !skyfall && player.submerged < 0.3 && wellbeing.fall(player.landed) > 0) {
            this.sounds?.play('hurt');
            this.onNotice?.('Stłukłeś nogę - przez jakiś czas utykasz');
            this.onWellbeing?.({ type: 'hurt' });
            this.achieve('hurt', { speed: player.landed });
        }

        const events = wellbeing.update(dt, {
            moving: Math.hypot(player.vel.x, player.vel.z) > 0.5,
            sprinting: player.sprinting,
            swimming: player.swimming,
            mining: Boolean(this.mining),
            jumps,
            // Głowa pod wodą: zanurzone ponad 93% wysokości ciała.
            underwater: player.submerged >= 0.93 && !this.blackout?.active,
            sleeping: Boolean(this.sleep?.lying)
        }, this.time.days);

        for (const event of events) {

            if (event.type === 'drown') {
                this.blackout.start();
            }
            else if (event.type === 'rest') {
                // Wyspanie zmieniło stan (pobudkę opisuje Sleep.wake).
                if (event.to === 'sleepy') this.onNotice?.('Robisz się senny');
                else if (event.to === 'worn') this.onNotice?.('Jesteś niewyspany - prześpij się');
                this.onWellbeing?.(event);
            }
            else if (event.type === 'healed') {
                this.onNotice?.('Noga już nie boli');
                this.onWellbeing?.(event);
            }
            else if (event.type === 'effectEnded') {
                this.onNotice?.(`Napar przestał działać (${EFFECTS[event.effect]?.label ?? event.effect})`);
            }
            else if (event.type === 'rumble') {
                this.sounds?.play('stomach');
                this.onNotice?.('Burczy ci w brzuchu');
                this.onWellbeing?.(event);
            }
            else if (event.type === 'state' && event.to !== 'hungry') {
                this.onNotice?.(`Samopoczucie: ${STATES[event.to].label.toLowerCase()}`);
            }
            else if (event.type === 'day' && event.change !== 0) {
                this.onWellbeing?.(event);
                this.onMessage?.(event.change > 0
                    ? 'Nowy dzień. Jadłeś regularnie - kondycja rośnie.'
                    : 'Nowy dzień. Jadłeś za mało - kondycja spada.');
            }

        }

    }


    // Zjedzenie jednej sztuki tego, co gracz trzyma (klawisz F, przycisk
    // w oknie statusu). Zwraca true, gdy coś zjadł.

    eat() {

        const inventory = this.inventory;
        const item = inventory.selectedItem;

        if (this.eatDelay > 0 || !item || !getFood(item.type)) {
            return false;
        }

        // To, co zostaje po wypiciu (kubek), musi się gdzieś zmieścić:
        // w zwolnionym miejscu w ręce albo obok.

        const food = getFood(item.type);

        if (food.returns && item.count > 1 && !inventory.canAdd(food.returns)) {
            this.onNotice?.(`Brak miejsca w ekwipunku na: ${getItemLabel(food.returns)}`);
            return false;
        }

        const result = this.wellbeing.eat(item.type, this.time.days);

        if (!result.ok) {
            this.onNotice?.(result.reason);
            return false;
        }

        const type = item.type;

        inventory.take(inventory.selected, 1);

        if (food.returns) {
            inventory.add(food.returns);
        }

        this.eatDelay = 0.45;

        this.sounds?.play('eat');

        this.swingArm(0.3);

        this.achieve('ate', { type, meal: result.meal, mealsToday: result.mealsToday, kind: food.kind, effects: result.effects });

        if (result.meal) {
            this.onNotice?.('Posiłek zaliczony');
            this.onWellbeing?.({ type: 'meal' });
        }

        // Napar: co daje (items/effects.js).

        for (const effect of result.effects) {
            this.onNotice?.(`${EFFECTS[effect].text} (${EFFECTS[effect].label})`);
            this.onWellbeing?.({ type: 'effect', effect });
        }

        return true;

    }


    stopMining() {

        this.mining = null;

        this.cracks.update(null, 0);

    }


    // Zniszczenie wskazanego bloku. W przygodzie blok (albo to, co
    // z niego zostaje - np. trawa daje ziemię) trafia do ekwipunku;
    // gdy nie mieści się cała paczka łupów (także owoce), blok zostaje.
    // Roślina i dekoracje, które tracą oparcie, też trafiają do ekwipunku.

    breakTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        // Skrzynia z czymś w środku - najpierw trzeba ją opróżnić.

        if (this.chests && !this.chests.canBreak(hit.block)) {
            this.onNotice?.('Najpierw opróżnij skrzynię');
            return false;
        }

        // Stół z deskami na blacie - najpierw zabierz deski.
        if (this.carpenterTables && !this.carpenterTables.canBreak(hit.block)) {
            this.onNotice?.('Najpierw zabierz deski ze stołu');
            return false;
        }

        const brokenShape = shapeInfo(this.world.getBlockId(hit.block.x, hit.block.y, hit.block.z));

        if (this.mode !== 'adventure') {

            const broken = this.breaker.breakBlock(hit);

            if (broken) {

                this.carpenterTables?.broken(hit.block, brokenShape);

                this.beds?.broken(hit.block, brokenShape);

                this.playBlockSound('break', hit.block.type, hit.block);

                this.debris.burst(hit.block.type, hit.block.x, hit.block.y, hit.block.z);

                this.achieve('blockBroken', { type: hit.block.type, mode: this.mode, tool: getTool(this.selectedBlock) });

            }

            return broken;

        }


        const { x, y, z, type } = hit.block;

        const drops = this.breakDrops(type, hit.block);

        // Te same sąsiednie bloki, które usuwa World.setBlock:
        // roślina nad podłożem i dekoracje przylegające do podpory.
        // Mapa po pozycji pilnuje, żeby żaden blok nie dał łupu dwa razy.
        const supported = new Map();

        const rememberSupported = (sx, sy, sz) => {
            const key = `${sx},${sy},${sz}`;

            if (!supported.has(key)) {
                supported.set(key, {
                    x: sx, y: sy, z: sz,
                    type: this.world.getBlock(sx, sy, sz),
                    drops: this.breakDrops(this.world.getBlock(sx, sy, sz), {x:sx,y:sy,z:sz})
                });
            }
        };

        const aboveId = this.world.getBlockId(x, y + 1, z);
        const currentId = this.world.getBlockId(x, y, z);
        const replacementId = isWaterloggedPlantId(currentId) ? getLiquidKindId(currentId) : 0;
        if (isPlantId(aboveId) && !canPlantStay(aboveId, replacementId, this.world.getBlockId(x, y + 2, z))) {
            rememberSupported(x, y + 1, z);
        }

        for (let attach = 1; attach < ATTACH_OFFSETS.length; attach++) {
            const [dx, dy, dz] = ATTACH_OFFSETS[attach];
            const sx = x - dx, sy = y - dy, sz = z - dz;

            if (getAttach(this.world.getBlockId(sx, sy, sz)) === attach) {
                rememberSupported(sx, sy, sz);
            }
        }

        // Losujemy raz, przed usunięciem bloku. Osobne canAdd dla każdego
        // łupu nie wystarczyłyby: dwa rodzaje mogłyby liczyć to samo miejsce.
        const supportedDrops = [...supported.values()].flatMap((block) => block.drops);
        const tool = getTool(this.selectedBlock);

        if (!this.inventory.canAddAll([...drops, ...supportedDrops])) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }


        if (!this.breaker.breakBlock(hit)) {
            return false;
        }

        this.carpenterTables?.broken(hit.block, brokenShape);

        this.beds?.broken(hit.block, brokenShape);

        for (const block of supported.values()) {
            if (this.world.getBlock(block.x, block.y, block.z) !== block.type) {
                drops.push(...block.drops);
            }
        }

        for (const { type: item, count } of drops) {
            this.inventory.add(item, count);
        }

        this.playBlockSound('break', type, hit.block);

        this.debris.burst(type, x, y, z);

        this.achieve('blockBroken', { type, mode: this.mode, tool });

        return true;

    }


    // Cała paczka ze zniszczonego bloku, bez zmieniania ekwipunku.
    // Ten sam wynik służy do sprawdzenia miejsca i przyznania łupów.

    breakDrops(type, position = null) {

        if (type === 'campfire') return this.campfires.drops(position);

        const drops = [];
        const drop = getDropType(type);

        if (drop) {
            drops.push({ type: drop, count: getDropCount(type) });
        }

        const harvest = getHarvest(type);

        if (harvest) {

            const [min, max] = harvest.count;
            const count = min + Math.floor(Math.random() * (max - min + 1));

            drops.push({ type: harvest.item, count });

        }

        for (const [item, chance] of getLoot(type)) {

            if (Math.random() < chance) {
                drops.push({ type: item, count: 1 });
            }

        }

        return drops;

    }


    // Okorowanie siekierą (PPM na pniu): pień zamienia się w okorowany,
    // z brzozy zostaje jeszcze kora (do ekwipunku - w obu trybach).

    // PPM łopatą: ziemia albo trawa -> rozgrzebana ziemia. Nad blokiem
    // musi być wolno (trawa i kwiaty na nim znikają).

    tillTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        const { x, y, z, type } = hit.block;

        const into = getTill(type);

        if (!into) {
            return false;
        }

        const aboveId = this.world.getBlockId(x, y + 1, z);

        if (aboveId !== 0 && (!isReplaceableId(aboveId) || isLiquidId(aboveId))) {
            return false;
        }

        if (!this.world.setBlock(x, y, z, into)) {
            return false;
        }

        if (aboveId !== 0) {
            this.world.setBlock(x, y + 1, z, null);
        }

        this.playBlockSound('break', into, hit.block);

        this.achieve('tilled', { type, into });

        return true;

    }


    // Czy owoc albo nasiono da się tu posadzić: sadzonka stanie na
    // rozgrzebanej ziemi (kliknięta z góry albo roślina na niej).

    canPlantAt(hit, block) {

        const target = this.placer.targetOf(hit, block);

        return Boolean(target) && this.world.getBlock(target.x, target.y - 1, target.z) === FIELD_BLOCK;

    }


    stripTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        const { x, y, z, type } = hit.block;

        const strip = getStrip(type);

        if (!strip) {
            return false;
        }

        if (strip.item && !this.inventory.canAdd(strip.item)) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }

        if (!this.world.setBlock(x, y, z, strip.into)) {
            return false;
        }

        if (strip.item) {
            this.inventory.add(strip.item);
        }

        this.playBlockSound('break', strip.into, hit.block);

        this.achieve('stripped', { type, into: strip.into, item: strip.item });

        return true;

    }


    // Owoce z rośliny (zbiór albo zniszczony krzak) do ekwipunku.
    // Zwraca, ile sztuk się zmieściło.

    addHarvest(type) {

        const harvest = getHarvest(type);

        if (!harvest) {
            return 0;
        }

        const [min, max] = harvest.count;

        const count = min + Math.floor(Math.random() * (max - min + 1));

        return count - this.inventory.add(harvest.item, count);

    }


    // Zbiór (PPM na krzaku z owocami): owoce trafiają do ekwipunku
    // (w obu trybach), krzak wraca do etapu bez owoców i owocuje od
    // nowa (PlantGrowth.js). Pełny ekwipunek - nic się nie dzieje.

    harvestTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        const { x, y, z, type } = hit.block;

        const harvest = getHarvest(type);

        if (!harvest) {
            return false;
        }

        if (!this.inventory.canAdd(harvest.item, harvest.count[1])) {

            this.onNotice?.('Ekwipunek pełny');
            this.plantAnimations?.reject(x, y, z);

            return false;

        }

        if (!this.world.setBlock(x, y, z, harvest.becomes)) {
            return false;
        }

        const count = this.addHarvest(type);

        this.sounds?.play('harvest', {
            position: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)
        });

        this.achieve('harvested', { type, item: harvest.item });

        return count > 0;

    }


    // --------------------------------------------------------
    // WEŹ BLOK
    // --------------------------------------------------------

    // "Weź blok" (środkowy przycisk myszy):
    // - blok jest na pasku -> wybieramy jego miejsce,
    // - jest w reszcie ekwipunku -> zamienia się z wybranym miejscem paska,
    // - nie ma go: w trybie kreatywnym trafia do pierwszego pustego
    //   miejsca paska (albo zastępuje wybrany), w przygodzie - nic.

    pickBlock(type) {

        const inventory = this.inventory;


        const onHotbar = inventory.find(type, 0, HOTBAR_SIZE);

        if (onHotbar !== -1) {

            inventory.selected = onHotbar;

            return;

        }


        const inMain = inventory.find(type, HOTBAR_SIZE);

        if (inMain !== -1) {

            const selected = inventory.selected;

            const item = inventory.get(selected);

            inventory.set(selected, inventory.get(inMain));
            inventory.set(inMain, item);

            return;

        }


        if (!isCreative(this.mode)) {
            return;
        }


        const empty = inventory.slots.slice(0, HOTBAR_SIZE).indexOf(null);

        if (empty !== -1) {
            inventory.selected = empty;
        }

        inventory.set(inventory.selected, { type, count: 1 });

    }

}
