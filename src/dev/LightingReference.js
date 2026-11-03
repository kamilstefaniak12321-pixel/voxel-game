import { TEST_SITE_FLOOR } from '../world/terrain/TestSiteGenerator.js';
import { newCampfire, addFirewood, addTinder, updateCampfire,
    CAMPFIRE_IGNITE_SECONDS } from '../game/CampfireState.js';

// Stały, niewielki zestaw odniesienia: działa również z rendererem 0.56.1.
// Buduje tylko bloki i stan zwykłego ogniska, bez materiałów testowych,
// podmiany świateł lub zapisywania ustawień. Pory i kamery ustawia tester.
export const LIGHTING_REFERENCE_SEED = 42;
export const LIGHTING_REFERENCE_ORIGIN = Object.freeze({ x: 64, y: TEST_SITE_FLOOR, z: -96 });

export const LIGHTING_REFERENCE_PRESETS = Object.freeze(Object.fromEntries(Object.entries({
    noon: { time: 12 / 24, cloudCover: 0 },
    golden: { time: 16.5 / 24, cloudCover: 0 },
    sunset: { time: 17.9 / 24, cloudCover: 0 },
    overcast: { time: 12 / 24, cloudCover: 1 },
    blueHour: { time: 18.6 / 24, cloudCover: 0 },
    night: { time: 0, cloudCover: 0 }
}).map(([name, value]) => [name, Object.freeze(value)])));

const toWorld = (point, origin = LIGHTING_REFERENCE_ORIGIN) =>
    [point[0] + origin.x, point[1] + origin.y, point[2] + origin.z];

// position oznacza oko kamery, nie stopy gracza. Wszystkie kamery patrzą
// na te same obiekty, niezależnie od wybranego modelu oświetlenia.
export const LIGHTING_REFERENCE_CAMERAS = Object.freeze(Object.fromEntries(Object.entries({
    overview: { position: [29, 22, 35], target: [3, 3, 4] },
    materials: { position: [3, 5, 13], target: [2, 1.8, 3] },
    foliage: { position: [-5, 2.6, 7], target: [-8, 1.6, 3] },
    roof: { position: [-1, 5, -1], target: [-8, 2.5, -6] },
    window: { position: [8, 4, 5], target: [17, 2, 3.5] },
    chamber: { position: [16.5, 3, 18.5], target: [16.5, 3, 12] },
    local: { position: [1, 4, 22], target: [-5, 2, 15] }
}).map(([name, view]) => [name, Object.freeze({
    position: Object.freeze(toWorld(view.position)),
    target: Object.freeze(toWorld(view.target))
})])));

// Punkty do odbioru otwarcia/zamknięcia nieba. Komora obejmuje cztery
// chunki: granice x=80 i z=-80 przechodzą przez jej środek.
export const LIGHTING_REFERENCE_PROBES = Object.freeze({
    chamber: Object.freeze(toWorld([16, 3, 16])),
    roof: Object.freeze(toWorld([16, 7, 16])),
    door: Object.freeze(toWorld([16, 2, 20])),
    warmEmitter: Object.freeze(toWorld([-8, 2, 14])),
    campfire: Object.freeze(toWorld([-3, 1, 16]))
});

export function placeLightingReferenceCamera(player, name = 'overview', origin = LIGHTING_REFERENCE_ORIGIN) {
    const view = LIGHTING_REFERENCE_CAMERAS[name];
    if (!view) throw new Error(`Nieznana kamera palety: ${name}`);
    const offset = [origin.x - LIGHTING_REFERENCE_ORIGIN.x,
        origin.y - LIGHTING_REFERENCE_ORIGIN.y, origin.z - LIGHTING_REFERENCE_ORIGIN.z];
    const [x, y, z] = view.position.map((value, i) => value + offset[i]);
    const dx = view.target[0] - view.position[0];
    const dy = view.target[1] - view.position[1];
    const dz = view.target[2] - view.position[2];
    player.pos.set(x, y - (player.eyeHeight ?? 1.6), z);
    player.vel?.set(0, 0, 0);
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (player.canFly) player.flying = true;
    player.updateCamera?.();
}

export function buildLightingReference({ world, player, game }, origin = LIGHTING_REFERENCE_ORIGIN) {
    let changed = 0;
    const block = (x, y, z, material) => {
        const px = origin.x + x, py = origin.y + y, pz = origin.z + z;
        if (material ? world.setBlock(px, py, pz, material) : world.clearBlock(px, py, pz)) changed++;
    };
    const box = (x0, y0, z0, x1, y1, z1, material) => {
        for (let i = 0; i <= y1 - y0; i++) {
            const y = material ? y0 + i : y1 - i;
            for (let x = x0; x <= x1; x++) {
                for (let z = z0; z <= z1; z++) block(x, y, z, material);
            }
        }
    };

    // Powtórne postawienie odtwarza te same warunki po ręcznych próbach.
    box(-12, 1, -10, 20, 10, 20, null);
    box(-12, 0, -10, 20, 0, 20, 'grass');

    // Małe grupy prawdziwej roślinności: borówka, czerwony akcent owocu,
    // płaskie źdźbła i liście. Dwie identyczne borówki: słońce i dach.
    for (const [x, z, type] of [
        [-8, 3, 'blueberry_bush_full'], [-8, -6, 'blueberry_bush_full'],
        [-6, 3, 'strawberry_bush_full'], [-6, -6, 'strawberry_bush_full'],
        [-10, 3, 'short_grass'], [-10, 5, 'fern'], [-8, 5, 'tall_grass'],
        [-6, 5, 'poppy'], [-5, 1, 'chili_bush_full']
    ]) block(x, 1, z, type);
    box(-12, 1, -9, -12, 6, -9, 'oak_log');
    box(-4, 1, -9, -4, 6, -9, 'oak_log');
    box(-12, 7, -10, -4, 7, -2, 'dark_planks');
    box(-11, 1, -1, -11, 4, -1, 'oak_log');
    box(-12, 5, -2, -10, 5, 0, 'oak_leaves');

    // Neutralne punkty odniesienia są istniejącym jasnym tynkiem i
    // szarym polerowanym kamieniem, nie nowymi "idealnymi" teksturami.
    for (const [x, type] of [[-3, 'lime_plaster'], [0, 'polished_stone'],
        [3, 'stone'], [6, 'oak_log'], [9, 'dark_planks']]) {
        box(x, 1, 2, x + 1, 2, 3, type);
    }

    // Pokój z zachodnim oknem i otwartym wejściem od południa.
    box(12, 0, 0, 20, 0, 8, 'lime_plaster');
    box(12, 1, 0, 20, 6, 0, 'lime_plaster');
    box(12, 1, 0, 12, 6, 8, 'lime_plaster');
    box(20, 1, 0, 20, 6, 8, 'lime_plaster');
    box(12, 1, 8, 20, 6, 8, 'lime_plaster');
    box(12, 7, 0, 20, 7, 8, 'lime_plaster');
    box(12, 3, 3, 12, 4, 5, null);
    box(16, 1, 8, 17, 3, 8, null);
    block(16, 1, 4, 'polished_stone');

    // Zamknięta, pusta komora na styku czterech chunków. Wejście jest
    // zaznaczone deskami: tester usuwa je lub pojedynczy blok dachu.
    box(12, 0, 12, 20, 0, 20, 'lime_plaster');
    box(12, 1, 12, 20, 6, 12, 'lime_plaster');
    box(12, 1, 12, 12, 6, 20, 'lime_plaster');
    box(20, 1, 12, 20, 6, 20, 'lime_plaster');
    box(12, 1, 20, 20, 6, 20, 'lime_plaster');
    box(12, 7, 12, 20, 7, 20, 'lime_plaster');
    box(16, 1, 20, 17, 3, 20, 'dark_planks');

    // Stała, ciepła emisja meteorytu (#ff7a30) oraz zwykłe ognisko.
    // Osłona i szary klocek pokazują kolor, spadek światła i cień.
    box(-10, 0, 12, 0, 0, 20, 'lime_plaster');
    box(-10, 1, 12, 0, 5, 12, 'lime_plaster');
    box(-10, 1, 12, -10, 5, 20, 'lime_plaster');
    block(-8, 1, 14, 'polished_stone');
    block(-8, 2, 14, 'meteorite');
    box(-5, 1, 15, -5, 2, 15, 'polished_stone');
    block(-2, 1, 14, 'blueberry_bush_full');

    // Bez Game (np. test budowy świata) nie zostawiamy pustej struktury
    // ogniska bez metadanych. W grze używamy tych samych reguł zapłonu.
    if (game?.campfires) {
        const [x, y, z] = toWorld([-3, 1, 16], origin);
        const fire = newCampfire(x, y, z);
        for (let i = 0; i < 6; i++) addFirewood(fire, 'oak');
        addTinder(fire, 'short_grass');
        updateCampfire(fire, CAMPFIRE_IGNITE_SECONDS, true);
        updateCampfire(fire, 24);
        block(-3, 1, 16, 'campfire');
        game.campfires.fires.set(`${x},${y},${z}`, fire);
        game.campfires.version++;
    }

    if (player) placeLightingReferenceCamera(player, 'overview', origin);
    return `${changed} bloków: paleta materiałów i owoców, borówka w słońcu i pod dachem, ` +
        'pokój z oknem, zamknięta komora na granicy chunków i ciepłe źródło światła' +
        (game?.campfires ? ' z ogniskiem.' : '.');
}
