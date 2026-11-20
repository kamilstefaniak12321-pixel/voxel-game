// ------------------------------------------------------------
// ZIEMIA POD CELOWNIKIEM (1.29.0)
//
// Mały napis pod celownikiem: jak szybko rosną rośliny na ziemi, w którą
// celujesz (blocks/soil.js) - dotąd było to widać tylko komendą /ziemia.
// Np. "Wzrost: pole z kompostem ×1,5 · woda ×1,25 = ×1,88".
//
// Kiedy widać napis:
//   - celownik na polu (zwykłym, z kompostem, z czarnoziemu,
//     kamienistym),
//   - celownik na rosnącej roślinie - liczy się ziemia pod nią,
//   - celownik na zwykłej ziemi (trawa, ziemia, czarnoziem, kamienista),
//     gdy w ręce jest coś do sadzenia, łopata albo kompost.
// Nie w trybie "przodem do kamery" i nie przy otwartych oknach.
//
// Liczy się rzadko (zmiana celu albo co pół sekundy) - wody szuka
// blocks/soil.js: nearWater (najwyżej kilkadziesiąt bloków).
// ------------------------------------------------------------

import { getBlockTypeById, getBlockDefinition, getGrowth } from '../blocks/BlockRegistry.js';
import { soilInfo, WATER_GROWTH } from '../blocks/soil.js';
import { isFieldBlock, fertilizerOf } from '../blocks/fertilizers.js';
import { getTool } from '../items/ItemRegistry.js';

// Co ile sekund napis liczy się od nowa przy tym samym celu.
const REFRESH = 0.5;

const number = (value) => String(Math.round(value * 100) / 100).replace('.', ',');

const isSoil = (type) => Boolean(getBlockDefinition(type)?.soil);

// Rosnąca roślina (sadzonka, krzak, roślina niska) - nie ziemia, która też
// "rośnie" (puste pole zarasta).
const isGrowingPlant = (type) => Boolean(getGrowth(type)) && !isSoil(type);

// Czy z tym w ręce ziemia ma znaczenie (sadzenie, łopata, kompost).
export function caresAboutSoil(held) {
    if (!held) return false;
    return isGrowingPlant(held) || getTool(held) === 'shovel' || Boolean(fertilizerOf(held));
}

// Która ziemia: { x, y, z } albo null (napisu nie ma).
export function soilHintTarget(world, block, held) {
    if (!block) return null;
    const { x, y, z } = block;
    const type = getBlockTypeById(world.getBlockId(x, y, z));
    if (isFieldBlock(type)) return { x, y, z };
    if (isGrowingPlant(type)) {
        return isSoil(getBlockTypeById(world.getBlockId(x, y - 1, z))) ? { x, y: y - 1, z } : null;
    }
    return isSoil(type) && caresAboutSoil(held) ? { x, y, z } : null;
}

// Napis dla opisu ziemi (soilInfo) - i czy ziemia jest żyzna / jałowa.
export function soilHintText(info) {
    const label = (getBlockDefinition(info.type)?.label ?? info.type ?? '').toLowerCase();
    const parts = [`${label} ×${number(info.growth)}`];
    if (info.water) parts.push(`woda ×${number(WATER_GROWTH)}`);
    const text = `Wzrost: ${parts.join(' · ')}${info.water ? ` = ×${number(info.total)}` : ''}`;
    return { text, tone: info.total > 1.001 ? 'rich' : info.total < 0.999 ? 'poor' : 'plain' };
}

export class SoilHint {

    constructor(parent = document.body) {
        this.element = document.createElement('div');
        this.element.id = 'soil-hint';
        this.element.hidden = true;
        parent.append(this.element);
        this.key = '';
        this.wait = 0;
    }

    // active - czy w ogóle pokazywać (gra, bez okien).
    update(game, dt, active = true) {
        const hit = active && game?.currentHit?.hit ? game.currentHit.block : null;
        const target = hit ? soilHintTarget(game.world, hit, game.selectedBlock) : null;
        if (!target) {
            this.hide();
            return;
        }
        const key = `${target.x},${target.y},${target.z}`;
        this.wait -= dt;
        if (key === this.key && this.wait > 0) return;
        this.key = key;
        this.wait = REFRESH;
        const info = soilInfo(game.world, target.x, target.y, target.z);
        if (!info.soil) {
            this.hide();
            return;
        }
        const { text, tone } = soilHintText(info);
        if (this.element.textContent !== text || this.element.hidden) {
            this.element.textContent = text;
            // Osiągnięcie "Najlepsza grządka" - tylko przy zmianie napisu.
            game.achieve?.('soil_seen', { type: info.type, total: info.total });
        }
        this.element.dataset.tone = tone;
        this.element.hidden = false;
    }

    hide() {
        if (!this.element.hidden) this.element.hidden = true;
        this.key = '';
    }

    dispose() {
        this.element.remove();
    }
}
