import { TEST_SITE_FLOOR } from '../world/terrain/TestSiteGenerator.js';

// Oddzielny plac E05/E06. Kadry palety 0.57.0 pozostają niezmienione.
export const MATERIAL_REFERENCE_SEED = 42;
// Z=-160 omija istniejące tarasy LOD placu (x128..320, |z|<96).
export const MATERIAL_REFERENCE_ORIGIN = Object.freeze({ x: 160, y: TEST_SITE_FLOOR, z: -160 });
const worldPoint = (p, o = MATERIAL_REFERENCE_ORIGIN) => [p[0] + o.x, p[1] + o.y, p[2] + o.z];
const freezePoint = p => Object.freeze(worldPoint(p));
export const MATERIAL_REFERENCE_GROUNDS = Object.freeze([
    { name: 'earth', block: 'dirt', center: [-10, -4] },
    { name: 'sand', block: 'sand', center: [0, -4] },
    { name: 'snow', block: 'snow', center: [10, -4] },
    { name: 'grass', block: 'grass', center: [-10, 5] },
    { name: 'wood', block: 'dark_planks', center: [0, 5] },
    { name: 'stone', block: 'stone', center: [10, 5] }
].map(value => Object.freeze({ ...value, center: Object.freeze(value.center) })));

export const MATERIAL_REFERENCE_CAMERAS = Object.freeze(Object.fromEntries(Object.entries({
    overview: { position: [28, 24, 37], target: [0, 2, 6] },
    earth: { position: [-9, 3.4, 2], target: [-10, 1.5, -4] },
    sand: { position: [1, 3.4, 2], target: [0, 1.5, -4] },
    snow: { position: [11, 3.4, 2], target: [10, 1.5, -4] },
    grass: { position: [-9, 3.4, 11], target: [-10, 1.5, 5] },
    wood: { position: [1, 3.4, 11], target: [0, 1.5, 5] },
    stone: { position: [11, 3.4, 11], target: [10, 1.5, 5] },
    roomA: { position: [-5.8, 3.2, 20.5], target: [-2, 2.3, 16] },
    roomB: { position: [5.8, 3.2, 20.5], target: [2, 2.3, 16] },
    leafFront: { position: [16, 2.7, -10], target: [16, 1.8, -18] },
    leafSide: { position: [24, 2.7, -18], target: [16, 1.8, -18] },
    leafBack: { position: [16, 2.7, -26], target: [16, 1.8, -18] },
    profiles: { position: [22, 3.7, 6], target: [17, 2, 2] }
}).map(([name, view]) => [name, Object.freeze({ position: freezePoint(view.position), target: freezePoint(view.target) })])));

export const MATERIAL_REFERENCE_PROBES = Object.freeze({
    roomA: freezePoint([-4, 3, 18]), roomB: freezePoint([4, 3, 18]),
    // Wspólna ściana x=160 oraz z=-144 przecinają granice chunków.
    divider: freezePoint([0, 3, 18]), roof: freezePoint([-4, 7, 18]),
    lamp: freezePoint([-4, 2, 16]), foliage: freezePoint([16, 1.8, -18]),
    earthReceiver: freezePoint([-8, 1, -4]), sandReceiver: freezePoint([2, 1, -4]),
    snowReceiver: freezePoint([12, 1, -4])
});

function editing(world, origin) {
    let changed = 0;
    const block = (x, y, z, type) => {
        const p = worldPoint([x, y, z], origin);
        if (type ? world.setBlock(...p, type) : world.clearBlock(...p)) changed++;
    };
    const box = (x0, y0, z0, x1, y1, z1, type) => {
        for (let i = 0; i <= y1 - y0; i++) {
            const y = type ? y0 + i : y1 - i;
            for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) block(x, y, z, type);
        }
    };
    return { block, box, count: () => changed };
}

export function placeLightingMaterialsCamera(player, name = 'overview', origin = MATERIAL_REFERENCE_ORIGIN) {
    const view = MATERIAL_REFERENCE_CAMERAS[name];
    if (!view) throw new Error(`Nieznana kamera materiałów: ${name}`);
    const position = view.position.map((v, i) => v + [origin.x - MATERIAL_REFERENCE_ORIGIN.x,
        origin.y - MATERIAL_REFERENCE_ORIGIN.y, origin.z - MATERIAL_REFERENCE_ORIGIN.z][i]);
    const direction = view.target.map((v, i) => v - view.position[i]);
    player.pos.set(position[0], position[1] - (player.eyeHeight ?? 1.6), position[2]);
    player.vel?.set(0, 0, 0);
    player.yaw = Math.atan2(-direction[0], -direction[2]);
    player.pitch = Math.atan2(direction[1], Math.hypot(direction[0], direction[2]));
    if (player.canFly) player.flying = true;
    player.updateCamera?.();
}

// Operacje używają zwykłych edycji świata: te same ścieżki unieważniania
// światła i zapisu, co stawianie/usuwanie bloków przez gracza.
export function editLightingMaterialsReference(world, operation, value, origin = MATERIAL_REFERENCE_ORIGIN) {
    const { block, box, count } = editing(world, origin);
    if (operation === 'roof') box(-5, 7, 17, -3, 7, 19, value ? null : 'lime_plaster');
    else if (operation === 'divider') box(0, 1, 17, 0, 4, 19, value ? null : 'lime_plaster');
    else if (operation === 'lamp') block(-4, 2, 16, value ? 'lamp_red' : null);
    else if (operation === 'ground') {
        if (!['dirt', 'sand', 'snow', 'grass', 'dark_planks', 'stone'].includes(value)) throw new Error('Nieznane podłoże materiałów');
        box(-13, 0, -7, -7, 0, -1, value);
    } else throw new Error(`Nieznana edycja materiałów: ${operation}`);
    return count();
}

export function buildLightingMaterialsReference({ world, player }, origin = MATERIAL_REFERENCE_ORIGIN) {
    const { block, box, count } = editing(world, origin);
    box(-15, 1, -24, 21, 9, 23, null);
    box(-15, 0, -24, 21, 0, 23, 'grass');
    for (const { block: ground, center: [x, z] } of MATERIAL_REFERENCE_GROUNDS) {
        box(x - 3, 0, z - 3, x + 3, 0, z + 3, ground);
        block(x - 1, 1, z, 'blueberry_bush_full');
        block(x + 1, 1, z, 'lime_plaster');
        block(x + 2, 1, z, 'polished_stone');
        block(x + 1, 2, z, 'lime_plaster');
    }
    // Dwa zamknięte pokoje: tylko A ma otwór w dachu. Nie wstawiamy
    // domyślnie lampy, by test odbić słońca nie miał drugiego źródła.
    box(-8, 0, 14, 8, 0, 22, 'lime_plaster');
    box(-8, 1, 14, 8, 6, 14, 'lime_plaster');
    box(-8, 1, 22, 8, 6, 22, 'lime_plaster');
    for (const x of [-8, 0, 8]) box(x, 1, 14, x, 6, 22, 'lime_plaster');
    box(-8, 7, 14, 8, 7, 22, 'lime_plaster');
    box(-7, 0, 15, -1, 0, 21, 'sand');
    editLightingMaterialsReference(world, 'roof', true, origin);
    for (const x of [-2, 2]) block(x, 1, 16, 'polished_stone');

    // Płaskie wycięcia, mikrokostki krzaka i większe liście voxelowe.
    // Stanowisko leży poza cieniem pokoi przy niskim zachodnim słońcu.
    // Dąb jest odsunięty od osi oko–krzak, także w ujęciu bocznym.
    block(14, 1, -20, 'fern');
    block(16, 1, -18, 'blueberry_bush_full');
    block(17, 1, -15, 'strawberry_bush_full');
    block(20, 1, -22, 'oak_log'); block(20, 2, -22, 'oak_leaves');
    // Owoc pochodzi z krzaka; obok matowe materiały i emisja jako kontrola.
    for (const [x, z, type] of [[16, 1, 'oak_log'], [18, 1, 'dark_planks'], [20, 1, 'stone'],
        [16, 3, 'blueberry_bush_full'], [18, 3, 'chili_bush_full'], [20, 3, 'meteorite']]) block(x, 1, z, type);
    if (player) placeLightingMaterialsCamera(player, 'overview', origin);
    return `${count()} bloków: sześć podłoży, dwa pokoje z przegrodą na granicy chunków, ` +
        'liście z trzech rodzajów geometrii oraz próbki owoców, kory, drewna, kamienia i emisji.';
}
