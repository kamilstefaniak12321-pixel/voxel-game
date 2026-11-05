import { TEST_SITE_FLOOR } from '../world/terrain/TestSiteGenerator.js';

// Długi, zamknięty korytarz ujawnia mgłę zasłaniającą lokalne światło.
// Edycje są zwykłymi blokami, bez materiałów omijających renderer gry.
export const ATMOSPHERE_HALL = Object.freeze({ x: 160, y: TEST_SITE_FLOOR, z: -160 });
export const ATMOSPHERE_HALL_CAMERAS = Object.freeze({
    hall: { position: [160.5, 19.4, -131], target: [160.5, 19.4, -191] },
    window: { position: [160.5, 19.4, -181], target: [160.5, 20, -260] },
    outside: { position: [160.5, 20, -205], target: [160.5, 19.4, -160] }
});
export const ATMOSPHERE_HALL_PROBES = Object.freeze({
    near: [160, 19, -132], center: [160, 19, -160], end: [160, 19, -190],
    outside: [160, 19, -195], wall: [154, 19, -160]
});

export function editAtmosphereHallWindow(world, open) {
    for (let x = 158; x <= 162; x++) for (let y = 18; y <= 22; y++) {
        if (open) world.clearBlock(x, y, -192);
        else world.setBlock(x, y, -192, 'stone');
    }
}

export function buildAtmosphereHall(world) {
    for (let x = 154; x <= 166; x++) for (let z = -192; z <= -128; z++) {
        world.setBlock(x, 16, z, 'polished_stone');
        world.setBlock(x, 24, z, 'stone');
        for (let y = 17; y <= 23; y++) {
            if (x === 154 || x === 166 || z === -192 || z === -128) world.setBlock(x, y, z, 'stone');
            else world.clearBlock(x, y, z);
        }
    }
    for (const z of [-137, -157, -177, -187]) {
        for (const x of [156, 164]) world.setBlock(x, 17, z, 'torch');
        world.setBlock(160, 17, z - 1, 'lime_plaster');
        world.setBlock(162, 17, z - 1, 'oak_log');
    }
    editAtmosphereHallWindow(world, false);
}
