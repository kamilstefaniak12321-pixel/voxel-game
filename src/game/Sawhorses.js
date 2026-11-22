// ------------------------------------------------------------
// KOZŁY - OBRÓBKA LEŻĄCEGO PNIA (1.38.0, pomysł Kamila - docs/kozly.md,
// projekt: docs/drewno.md rozdział 4)
//
// Kozioł (blocks/sawhorse.js) stawia się po jednym NA OBU KOŃCACH
// leżącego pnia. Pień między nimi leży na kozłach:
//
//   - LPM siekierą: metr pnia odpada jako pień w zwykłym tempie,
//   - kucnięcie + LPM siekierą: metr pnia od razu łupie się na opał
//     (SPLIT_COUNT polan),
//   - BEZ KOZŁÓW też się da, ale NO_SAWHORSE_SLOW razy wolniej (siekiera
//     bije w ziemię) i bez łupania.
//
// Nie ma tu żadnego stanu: czy pień leży na kozłach, widać z samych
// bloków (onSawhorses) - sprawdzamy to przy kopaniu.
// ------------------------------------------------------------

import { getBlockDefinition, getBlockTypeById, isSolidId } from '../blocks/BlockRegistry.js';
import { isSawhorse } from '../blocks/sawhorse.js';
import { choppedFresh } from '../items/moisture.js';
import { makeItem } from '../items/freshness.js';

// Bez kozłów leżący pień tnie się tyle razy wolniej.
export const NO_SAWHORSE_SLOW = 3;
// Tyle polan z metra pnia łupanego na kozłach (jak z pnia w siatce wytwarzania).
export const SPLIT_COUNT = 4;
// Najdłuższy pień między kozłami (bloki).
export const MAX_SPAN = 24;

// Zdrowy leżący pień (z korą albo okorowany) - nie spróchniały.
export function lyingLog(type) {
    const definition = getBlockDefinition(type);
    return definition?.lying && definition.tree && !definition.rotten ? definition : null;
}

// Czy za końcem pnia stoi kozioł: szukamy od (ex, y, ez) dalej wzdłuż
// osi (krok dx, dz), przez puste miejsca po już odciętych metrach - aż
// do kozła albo przeszkody. Kozioł może stać też obok w poprzek (gruby
// pień ma jeden kozioł na koniec, nie cztery).
function sawhorseBeyond(world, ex, y, ez, dx, dz, room) {
    for (let step = 0; step <= room; step++) {
        const cx = ex + dx * step, cz = ez + dz * step;
        for (let side = -1; side <= 1; side++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (isSawhorse(getBlockTypeById(world.getBlockId(cx + (dz !== 0 ? side : 0), y + dy, cz + (dx !== 0 ? side : 0))))) return true;
            }
        }
        // Dalej tylko przez wolne miejsce i przez dalsze kawałki pnia
        // (wycięty środek dzieli pień na dwa - oba leżą na kozłach).
        const id = world.getBlockId(cx, y, cz);
        if (isSolidId(id) && !lyingLog(getBlockTypeById(id))) return false;
    }
    return false;
}

// Odcinek pnia, do którego należy blok (x, y, z): od którego do którego
// bloku wzdłuż osi ciągnie się leżący pień. null - to nie leżący pień.
// Zwraca { axis, from, to, length, sawhorses: [przy początku, przy końcu] }.
export function trunkSpan(world, x, y, z) {
    const definition = lyingLog(getBlockTypeById(world.getBlockId(x, y, z)));
    if (!definition) return null;
    const axis = definition.lying, dx = axis === 'x' ? 1 : 0, dz = axis === 'z' ? 1 : 0;
    const same = (px, pz) => { const other = lyingLog(getBlockTypeById(world.getBlockId(px, y, pz))); return other?.lying === axis; };
    let from = 0, to = 0;
    while (from > -MAX_SPAN && same(x + dx * (from - 1), z + dz * (from - 1))) from--;
    while (to < MAX_SPAN && same(x + dx * (to + 1), z + dz * (to + 1))) to++;
    return {
        axis, from, to, length: to - from + 1,
        sawhorses: [
            sawhorseBeyond(world, x + dx * (from - 1), y, z + dz * (from - 1), -dx, -dz, MAX_SPAN - (to - from + 1)),
            sawhorseBeyond(world, x + dx * (to + 1), y, z + dz * (to + 1), dx, dz, MAX_SPAN - (to - from + 1))
        ]
    };
}

// Czy ten blok leżącego pnia leży na kozłach (kozioł na obu końcach).
export function onSawhorses(world, x, y, z) {
    const span = trunkSpan(world, x, y, z);
    return Boolean(span && span.sawhorses[0] && span.sawhorses[1]);
}

// Ile razy wolniej kopie się ten blok: leżący pień bez kozłów - 3, reszta - 1.
export function sawhorseSlow(world, block) {
    if (!block || !lyingLog(block.type)) return 1;
    return onSawhorses(world, block.x, block.y, block.z) ? 1 : NO_SAWHORSE_SLOW;
}

// Łup z leżącego pnia łupanego na kozłach (kucnięcie + siekiera): polana
// zamiast pnia. null - zwykły łup.
export function splitDrops(world, type, block, tool, crouching) {
    const definition = lyingLog(type);
    if (!definition || !block || tool !== 'axe' || !crouching || !onSawhorses(world, block.x, block.y, block.z)) return null;
    const item = `${definition.tree}_firewood`;
    return [makeItem(item, SPLIT_COUNT, choppedFresh(item))];
}

// Oś belki kozła stawianego w (x, y, z): w poprzek leżącego pnia obok;
// bez pnia - null (decyduje spojrzenie gracza).
export function sawhorseAxisAt(world, x, y, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let dy = -1; dy <= 1; dy++) {
            const definition = lyingLog(getBlockTypeById(world.getBlockId(x + dx, y + dy, z + dz)));
            // Pień ciągnie się w naszą stronę: belka kozła w poprzek niego.
            if (definition && (definition.lying === 'x') === (dx !== 0)) return definition.lying === 'x' ? 'z' : 'x';
        }
    }
    return null;
}


// Kozły w grze: to, o co pyta kopanie (GameInteraction), i podpowiedzi.
export class Sawhorses {

    constructor(game) {
        this.game = game;
        this.hintAt = -Infinity;
    }

    // Ile razy wolniej kopie się ten blok (tylko przygoda, siekiera).
    slow(block) {
        const game = this.game;
        if (game.mode !== 'adventure') return 1;
        const slow = sawhorseSlow(game.world, block);
        // Raz na jakiś czas podpowiedź, dlaczego idzie tak wolno.
        if (slow > 1 && performance.now() - this.hintAt > 60000) {
            this.hintAt = performance.now();
            game.onNotice?.('Bez kozłów pień tnie się 3 razy wolniej. Postaw kozioł na obu końcach pnia (kozioł to 3 konary).');
        }
        return slow;
    }

    // Łup z bloku: polana, gdy gracz kucając łupie pień na kozłach.
    drops(type, block, tool) {
        const game = this.game;
        const split = splitDrops(game.world, type, block, tool, Boolean(game.player?.crouching));
        if (split) game.achieve?.('trunkSplit', { type, count: split[0].count });
        return split;
    }

    // Kozioł postawiony w (x, y, z): czy pień obok leży już na kozłach.
    placed(target) {
        const game = this.game, world = game.world;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            for (let dy = -1; dy <= 1; dy++) {
                const x = target.x + dx, y = target.y + dy, z = target.z + dz;
                const span = trunkSpan(world, x, y, z);
                if (!span) continue;
                if (span.sawhorses[0] && span.sawhorses[1]) {
                    game.onNotice?.(`Pień leży na kozłach (${span.length} m): siekierą tniesz go na pnie, kucając - łupiesz na opał.`);
                    game.achieve?.('sawhorsesReady', { length: span.length });
                }
                else game.onNotice?.('Kozioł stoi. Postaw drugi na przeciwnym końcu pnia.');
                return;
            }
        }
        game.onNotice?.('Kozioł stawia się na końcu leżącego pnia - po jednym z każdej strony.');
    }

}
