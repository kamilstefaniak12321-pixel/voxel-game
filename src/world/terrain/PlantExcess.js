import { PLANT_PACKS, plantStageType } from '../../blocks/plantPacks.js';
import { getBlockId } from '../../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// TRYB PRZESADY (1.6.0) - pomysł Kamila. Opis: docs/przesada.md.
//
// Rzadko w świecie trafia się miejsce, w którym jedna roślina opanowała
// wszystko: ok. 80% trawiastego podłoża to jej dywan (np. barwinek pod
// całym lasem albo łan lawendy na łące). Reszta świata bez zmian.
//
// Jak to działa:
//   - świat jest podzielony na kwadraty CELL x CELL bloków; w co którymś
//     (CHANCE) leży jedno takie miejsce: środek, promień od RADIUS[0] do
//     RADIUS[1] bloków i jedna roślina,
//   - roślinę losujemy spośród paczek z "gdzieRosnie.przesada" (waga),
//     które rosną w biomie na środku miejsca; gdy żadna nie pasuje,
//     miejsca nie ma,
//   - w środku roślina rośnie na COVER kolumn trawy, przy brzegu (ostatnie
//     EDGE promienia) coraz rzadziej; brzeg jest nierówny (szum),
//   - rośnie tylko w biomach tej rośliny - dywan kończy się tam, gdzie
//     roślina i tak by nie rosła (plaża, skały).
//
// Wszystko wynika z ziarna świata i miejsca - ten sam świat ma zawsze te
// same miejsca. Koszt: bez miejsca w pobliżu - kilka odczytów z pamięci
// na kolumnę chunka.
// ------------------------------------------------------------

export const EXCESS_CELL = 320;
export const EXCESS_CHANCE = 0.15;
export const EXCESS_RADIUS = [36, 84];
export const EXCESS_COVER = 0.8;
export const EXCESS_EDGE = 0.25;

// Jak mocno szum wygina brzeg (część promienia).
const EDGE_WOBBLE = 0.18;

function hash01(seed, x, z, salt) {
    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Paczki, które mogą "przesadzić": rosną na ziemi i mają wagę.
const CANDIDATES = PLANT_PACKS
    .filter((pack) => pack.where?.excess > 0 && pack.where.on.includes('ziemia'))
    .map((pack) => {
        let sum = 0;
        return {
            pack,
            ids: pack.stages.map((_, stage) => getBlockId(plantStageType(pack, stage))),
            limits: pack.where.stages.map((weight) => (sum += weight))
        };
    });

export const EXCESS_PLANTS = CANDIDATES.map((candidate) => candidate.pack.id);


export class PlantExcess {

    // seed - ziarno roślin świata; biomeAt(x, z) - klucz biomu kolumny;
    // wobble(x, z) - gładki szum -1..1 do nierównego brzegu.

    constructor(seed, biomeAt, wobble = () => 0) {

        this.seed = (seed ^ 0x51a7c0de) >>> 0;
        this.biomeAt = biomeAt;
        this.wobble = wobble;
        this.cells = new Map();

    }


    // Miejsce w kwadracie (cx, cz) albo null: { x, z, radius, plant, ids,
    // limits, pack, biome }.

    zoneOfCell(cx, cz) {

        const key = cx * 65536 + cz;

        let zone = this.cells.get(key);

        if (zone !== undefined) {
            return zone;
        }

        zone = null;

        if (CANDIDATES.length > 0 && hash01(this.seed, cx, cz, 1) < EXCESS_CHANCE) {

            const x = Math.floor((cx + hash01(this.seed, cx, cz, 2)) * EXCESS_CELL);
            const z = Math.floor((cz + hash01(this.seed, cx, cz, 3)) * EXCESS_CELL);
            const biome = this.biomeAt(x, z);

            const fitting = CANDIDATES.filter((candidate) => candidate.pack.where.biomes.includes(biome));

            let total = 0;

            for (const candidate of fitting) {
                total += candidate.pack.where.excess * (candidate.pack.where.weights?.[biome] ?? 1);
            }

            if (total > 0) {

                let roll = hash01(this.seed, cx, cz, 4) * total;
                let chosen = fitting[fitting.length - 1];

                for (const candidate of fitting) {
                    roll -= candidate.pack.where.excess * (candidate.pack.where.weights?.[biome] ?? 1);
                    if (roll < 0) { chosen = candidate; break; }
                }

                zone = {
                    x, z, biome,
                    radius: EXCESS_RADIUS[0] + hash01(this.seed, cx, cz, 5) * (EXCESS_RADIUS[1] - EXCESS_RADIUS[0]),
                    plant: chosen.pack.id, pack: chosen.pack, ids: chosen.ids, limits: chosen.limits
                };

            }

        }

        // (Pamięć: jeden wpis na kwadrat 320 x 320 bloków - bez limitu
        // wystarczy na dowolnie długą wędrówkę.)
        this.cells.set(key, zone);

        return zone;

    }


    // Miejsce, którego zasięg obejmuje (x, z): { zone, depth } (depth:
    // 1 w środku, 0 na brzegu) albo null.

    zoneAt(x, z) {

        const reach = EXCESS_RADIUS[1] * (1 + EDGE_WOBBLE);

        const fromX = Math.floor((x - reach) / EXCESS_CELL), toX = Math.floor((x + reach) / EXCESS_CELL);
        const fromZ = Math.floor((z - reach) / EXCESS_CELL), toZ = Math.floor((z + reach) / EXCESS_CELL);

        for (let cz = fromZ; cz <= toZ; cz++) {

            for (let cx = fromX; cx <= toX; cx++) {

                const zone = this.zoneOfCell(cx, cz);

                if (!zone) continue;

                const distance = Math.hypot(x - zone.x, z - zone.z);

                if (distance > zone.radius * (1 + EDGE_WOBBLE)) continue;

                const edge = zone.radius * (1 + EDGE_WOBBLE * this.wobble(x, z));

                if (distance < edge) {
                    return { zone, depth: 1 - distance / edge };
                }

            }

        }

        return null;

    }


    // Roślina przesady na trawie w kolumnie (x, z) w biomie `biome`:
    // numer bloku albo 0 (zwykłe rośliny).

    plantAt(x, z, biome) {

        const found = this.zoneAt(x, z);

        if (!found || !found.zone.pack.where.biomes.includes(biome)) {
            return 0;
        }

        const cover = EXCESS_COVER * Math.min(1, found.depth / EXCESS_EDGE);

        if (hash01(this.seed, x, z, 6) >= cover) {
            return 0;
        }

        const { ids, limits } = found.zone;
        const stage = hash01(this.seed, x, z, 7);
        const index = limits.findIndex((limit) => stage < limit);

        return ids[index < 0 ? ids.length - 1 : index];

    }


    // Najbliższe miejsce w promieniu `range` bloków od (x, z) albo null
    // (/przesada).

    nearest(x, z, range = 3000) {

        const cells = Math.ceil(range / EXCESS_CELL);
        const cx0 = Math.floor(x / EXCESS_CELL), cz0 = Math.floor(z / EXCESS_CELL);

        let best = null, bestDistance = range;

        for (let dz = -cells; dz <= cells; dz++) {
            for (let dx = -cells; dx <= cells; dx++) {
                const zone = this.zoneOfCell(cx0 + dx, cz0 + dz);
                if (!zone) continue;
                const distance = Math.hypot(zone.x - x, zone.z - z);
                if (distance < bestDistance) { best = zone; bestDistance = distance; }
            }
        }

        return best ? { zone: best, distance: bestDistance } : null;

    }

}
