// ------------------------------------------------------------
// KSZTAŁT BLOKU DLA CELOWNIKA I RAMKI (1.1.1)
//
// Jedno miejsce, które mówi, gdzie blok NAPRAWDĘ jest w swojej komórce.
// Korzysta z niego celownik (VoxelRaycast.js) i biała ramka
// (BlockHighlight.js), więc ramka zawsze pokazuje dokładnie to, w co
// celownik trafia. Wcześniej celownik brał całą komórkę dla każdego
// bloku poza schodami i roślinami z modelem - płaski mech, opadłe
// liście, śnieg, wieniec, trawa, kwiaty, sadzonki i skrzynia zasłaniały
// to, co za nimi, choć ramka rysowała się mniejsza.
//
// cellBoxes(world, id, x, y, z) zwraca:
//   FULL_CELL  - zwykły pełny blok (cała komórka),
//   []         - nic w tej komórce (powietrze, woda, pochodnia i rośliny
//                z własnym modelem - te sprawdza osobno plantHit
//                w VoxelRaycast.js, bo wystają poza komórkę),
//   [[x0, y0, z0, x1, y1, z1], ...] - pudełka w komórce (0-1).
//
// Nowy rodzaj bloku z modelem mniejszym niż komórka: dopisz go tutaj -
// celownik i ramka dostaną go razem. Test: tools/sprawdz_celowanie.mjs.
// ------------------------------------------------------------
import { getBlockDefinition, getBlockTypeById, isLiquidId, getRiverPlant } from '../blocks/BlockRegistry.js';
import { getTorchInfo } from '../blocks/torches.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { shapeBoxes, connectMask } from '../world/ShapeBoxes.js';
import { plantRandom } from '../rendering/RiverPlantGeometry.js';

export const FULL_CELL = Object.freeze([Object.freeze([0, 0, 0, 1, 1, 1])]);

const NOTHING = Object.freeze([]);

// Płaska dekoracja (mech, opadłe liście, śnieg, wieniec): cienka płytka
// przy swoim oparciu. Sam obrazek jest płaski - grubość jest po to, żeby
// dało się w nią trafić także z boku.
export const FLAT_THICKNESS = 0.08;

const FLAT_BOXES = {
    down: [0, 0, 0, 1, FLAT_THICKNESS, 1],
    north: [0, 0, 0, 1, 1, FLAT_THICKNESS],
    south: [0, 0, 1 - FLAT_THICKNESS, 1, 1, 1],
    east: [1 - FLAT_THICKNESS, 0, 0, 1, 1, 1],
    west: [0, 0, 0, FLAT_THICKNESS, 1, 1]
};

const PLATE_BOXES = new Map();

function plateBox(id, height) {
    let box = PLATE_BOXES.get(id);
    if (!box) {
        box = [[0, 0, 0, 1, height, 1]];
        PLATE_BOXES.set(id, box);
    }
    return box;
}

// Ognisko: stos polan do połowy bloku. Skrzynia: 14 x 14 x 14 pikseli.
const CAMPFIRE_BOX = [[0, 0, 0, 1, 0.5, 1]];
const CHEST_BOX = [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]];

// Kępka trawy, kwiat, sadzonka (model 'cross'): pudełko wokół środka
// kępki - to samo losowe przesunięcie i wysokość co w rysowaniu
// (ChunkMesher.addPlants). Węższe niż płaszczyzny (3/4): końce źdźbeł
// nie zasłaniają bloków obok ani ziemi pod spodem.
const CROSS_WIDTH = 0.75;

function crossBox(plant, x, y, z) {
    const cx = 0.5 + (plantRandom(x, y, z, 2) - 0.5) * 0.3;
    const cz = 0.5 + (plantRandom(x, y, z, 3) - 0.5) * 0.3;
    const r = Math.max(0.2, plant.width * CROSS_WIDTH);
    const top = Math.min(1, plant.height * (0.85 + 0.3 * plantRandom(x, y, z, 4)));
    return [[Math.max(0, cx - r), 0, Math.max(0, cz - r), Math.min(1, cx + r), top, Math.min(1, cz + r)]];
}

// Rodzaj kształtu dla numeru bloku (liczony raz).
const KINDS = new Map();

function kindOf(id) {
    let kind = KINDS.get(id);
    if (kind !== undefined) return kind;
    const definition = getBlockDefinition(getBlockTypeById(id));
    if (!definition || isLiquidId(id) || getTorchInfo(id) || getRiverPlant(id)) kind = 'none';
    else if (shapeInfo(id)) kind = 'shape';
    else if (definition.model === 'structure') kind = 'campfire';
    else if (definition.model === 'chest') kind = 'chest';
    else if (definition.model === 'flat' && FLAT_BOXES[definition.flat?.attach]) kind = 'flat';
    else if (definition.plant?.sprite) kind = 'none';
    else if (definition.model === 'cross' && definition.plant) kind = 'cross';
    else kind = 'full';
    KINDS.set(id, kind);
    return kind;
}

export function cellBoxes(world, id, x, y, z) {
    if (!id) return NOTHING;
    switch (kindOf(id)) {
        case 'none': return NOTHING;
        case 'full': return FULL_CELL;
        case 'campfire': return CAMPFIRE_BOX;
        case 'chest': return CHEST_BOX;
        case 'flat': {
            // Niska płyta (rośliny niskie - flat.height): pudełko do jej wysokości.
            const flat = getBlockDefinition(getBlockTypeById(id)).flat;
            return flat.height ? plateBox(id, flat.height) : [FLAT_BOXES[flat.attach]];
        }
        case 'cross': return crossBox(getBlockDefinition(getBlockTypeById(id)).plant, x, y, z);
        // Schody, półbloki, płoty (z ramionami do sąsiadów), furtki, drzwi, stół.
        default: {
            const info = shapeInfo(id);
            const mask = info.kind === 'fence' && world ? connectMask((a, b, c) => world.getBlockId(a, b, c), x, y, z) : 0;
            return shapeBoxes(id, 'outline', mask) ?? NOTHING;
        }
    }
}
