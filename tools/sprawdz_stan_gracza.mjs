// Zapis i odczyt stanu gracza, bez uruchamiania grafiki ani prawdziwej
// bazy światów. Uruchomienie (Node.js 22.15 lub nowszy):
//     node tools/sprawdz_stan_gracza.mjs

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Opcjonalnie: zależności dla niepełnej kopii roboczej. Zwykłe
// uruchomienie w repozytorium nie wymaga żadnych zmiennych.
const dependencies = process.env.VOXEL_TEST_DEPENDENCIES;

registerHooks({
    resolve(specifier, context, nextResolve) {
        let url;

        if (specifier === 'three') {
            url = new URL('../lib/three/three.module.js', import.meta.url);
        }
        else if (specifier.startsWith('file:')) {
            url = new URL(specifier);
        }
        else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
            url = new URL(specifier, context.parentURL);
        }

        if (url && dependencies && !existsSync(url)) {
            const local = relative(root, fileURLToPath(url));

            if (!local.startsWith('..') && !isAbsolute(local)) {
                const fallback = pathToFileURL(resolve(dependencies, local));

                if (existsSync(fallback)) {
                    url = fallback;
                }
            }
        }

        return nextResolve(url?.href ?? specifier, context);
    },

    load(url, context, nextLoad) {
        // Kod przeglądarkowy jest ESM, choć package.json pozostaje
        // CommonJS dla desktop/main.js. Tak samo działa mapa importów gry.
        if (url.startsWith('file:') && (url.includes('/src/') || url.includes('/lib/three/')) && url.endsWith('.js')) {
            return nextLoad(url, { ...context, format: 'module' });
        }

        return nextLoad(url, context);
    }
});

const [{ Player }, { WorldSaver }, THREE] = await Promise.all([
    import('../src/player/Player.js'),
    import('../src/storage/WorldSaver.js'),
    import('three')
]);

// Puste powietrze nad ziemią: pierwsza klatka sprawdza prawdziwą
// fizykę Player.update, bez kolizji i wody zmieniających wynik.
const world = {
    spawnPoint: { x: 0.5, z: 0.5 },
    ensureColumnLoaded() {},
    getGroundY() { return 60; },
    getBlockId() { return 0; },
    getFlow() { return null; },
    isSolid() { return false; },
    takeUnsavedChunks() { return []; }
};

const input = {
    isKeyDown() { return false; },
    consumeKeyPress() { return false; },
    consumeMouseDelta() { return { x: 0, y: 0 }; }
};

function player() {
    return new Player(world, new THREE.PerspectiveCamera());
}

let checked = 0;

async function check(name, run) {
    await run();
    checked++;
    console.log(`OK: ${name}`);
}

async function saveAndLoad(mode, flying, y) {
    const original = player();
    original.canFly = mode === 'creative';
    original.flying = flying;
    original.pos.set(12.5, y, -8.5);
    original.yaw = 0.6;
    original.pitch = -0.2;

    let record;
    const storage = {
        async saveWorldAndChunks(info) {
            // Jak zapis IndexedDB: osobna kopia, nie referencja do gracza.
            record = structuredClone(info);
        }
    };

    const saver = new WorldSaver(storage, { id: 'test', gameMode: mode }, world, original);
    assert.equal(await saver.flush(), true);
    assert.equal(record.player.flying, flying);

    const loaded = player();
    assert.equal(loaded.setState(record.player), true);
    // Game ustawia canFly dopiero po odczycie stanu gracza.
    loaded.canFly = mode === 'creative';
    assert.deepEqual(loaded.getState(), original.getState());

    loaded.update(1 / 60, input);
    assert.equal(loaded.flying, flying);

    if (flying) {
        assert.equal(loaded.pos.y, y);
        assert.equal(loaded.vel.y, 0);
        assert.equal(loaded.skyfall, false);
        assert.equal(loaded.skyfallImpact, null);
    }
    else {
        assert.ok(loaded.pos.y < y);
        assert.ok(loaded.vel.y < 0);
        assert.equal(loaded.skyfall, y > 1000);
    }
}

for (const mode of ['creative', 'adventure']) {
    for (const y of [100, 1100, 6000]) {
        await check(`zapis lotu: ${mode}, wysokość ${y}`, () => saveAndLoad(mode, true, y));
    }

    for (const y of [100, 6000]) {
        await check(`zapis bez lotu nadal pozwala spadać: ${mode}, wysokość ${y}`, () => saveAndLoad(mode, false, y));
    }
}

for (const y of [100, 6000]) {
    await check(`stary zapis bez pola flying: wysokość ${y}`, () => {
        const old = { x: 12.5, y, z: -8.5, yaw: 0.6, pitch: -0.2 };
        const loaded = player();
        loaded.flying = true;
        assert.equal(loaded.setState(old), true);
        assert.equal(loaded.flying, false);
        loaded.canFly = true;
        loaded.update(1 / 60, input);
        assert.ok(loaded.pos.y < y);
        assert.equal(loaded.skyfall, y > 1000);
    });
}

for (const flying of [false, null, 0, 1, 'true', 'false', {}, []]) {
    await check(`tylko boolean true przywraca lot: ${JSON.stringify(flying)}`, () => {
        const loaded = player();
        loaded.flying = true;
        assert.equal(loaded.setState({ x: 0.5, y: 100, z: 0.5, yaw: 0, pitch: 0, flying }), true);
        assert.equal(loaded.flying, false);
    });
}

for (const broken of [null, {}, { x: NaN }, { y: Infinity }, { z: '10' }, { yaw: undefined }, { pitch: null }]) {
    await check(`uszkodzony zapis nie zmienia gracza: ${JSON.stringify(broken)}`, () => {
        const loaded = player();
        const before = loaded.getState();
        const record = broken === null ? null : { x: 1, y: 100, z: 2, yaw: 0, pitch: 0, flying: true, ...broken };

        if (broken !== null && Object.keys(broken).length === 0) {
            assert.equal(loaded.setState({}), false);
        }
        else {
            assert.equal(loaded.setState(record), false);
        }

        assert.deepEqual(loaded.getState(), before);
    });
}

console.log(`Sprawdzono ${checked} przypadków zapisu i pierwszej klatki gracza, bez błędów.`);
