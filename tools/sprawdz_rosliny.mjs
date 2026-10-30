// ------------------------------------------------------------
// SPRAWDZENIE PACZEK ROŚLIN (assets/rosliny/, src/blocks/plantPacks.js)
//
// - paczki wczytują się bez błędów, numery bloków w zakresie 100-239,
//   nie zachodzą na paczki drzew ani bloki gry,
// - bloki etapów: rozmiar obrazka (PNG) = rozmiar rośliny (16 px na blok),
//   wzrost etap po etapie (z miejscem nad rośliną), zbiór na ostatnim
//   etapie, zniszczona roślina daje pierwszy etap,
// - przedmiot 16 x 16, w grupach składników (np. czerwona lampa),
// - paczka z błędem jest pomijana (zła nazwa, brak pliku),
// - teren realistyczny: rośliny rosną w swoich biomach, we wszystkich
//   etapach, powtarzalnie (ten sam seed - te same miejsca).
//
// Uruchomienie: node tools/sprawdz_rosliny.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const P = await import('../src/blocks/plantPacks.js');
const R = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { GROUPS } = await import('../src/crafting/recipes.js');
const { TREE_PACKS, PACK_ID_SLOTS } = await import('../src/blocks/treePacks.js');

assert.deepEqual(P.PLANT_PACK_ERRORS, [], 'paczki roślin bez błędów');
assert.ok(P.PLANT_PACKS.length > 0, 'jest choć jedna paczka');

function pngSize(path) {
    const data = readFileSync(new URL(`../assets/rosliny/${path}`, import.meta.url));
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

let stages = 0;

for (const pack of P.PLANT_PACKS) {

    const types = pack.stages.map((_, i) => P.plantStageType(pack, i));

    for (const [i, stage] of pack.stages.entries()) {

        stages++;

        const type = types[i];
        const definition = R.BLOCK_TYPES[type];

        assert.ok(definition, `${type} jest blokiem`);
        assert.equal(definition.id, pack.firstId + i, `${type}: kolejny numer`);
        assert.ok(definition.id >= 100 && definition.id <= 239, `${type}: numer w zakresie paczek`);

        for (const tree of TREE_PACKS) {
            assert.ok(definition.id < tree.firstId || definition.id >= tree.firstId + PACK_ID_SLOTS, `${type}: nie zachodzi na drzewo ${tree.id}`);
        }

        const [w, h] = pngSize(`${pack.folder}/${stage.file}`);
        assert.equal(definition.plant.height, h / 16, `${type}: wysokość = obrazek / 16`);
        assert.equal(definition.plant.width, w / 32, `${type}: pół szerokości = obrazek / 32`);
        assert.deepEqual(definition.plant.sprite, { width: Math.ceil(w / 16), height: Math.ceil(h / 16) }, `${type}: kafelki obrazka`);
        assert.equal(definition.model, 'cross');
        assert.equal(R.isPlantId(definition.id), true, `${type}: roślina`);
        assert.equal(R.getDropType(type), types[0], `${type}: zniszczony daje pierwszy etap`);

        const growth = R.getGrowth(type);

        if (i < pack.stages.length - 1) {
            assert.equal(growth.into, types[i + 1], `${type}: rośnie w następny etap`);
            assert.equal(growth.room, Math.ceil(pack.stages[i + 1].height / 16), `${type}: miejsce nad rośliną na następny etap`);
        }
        else {
            assert.equal(growth, null, `${type}: ostatni etap nie rośnie`);
        }

    }

    if (pack.item) {

        assert.ok(ITEM_TYPES[pack.item.type], `${pack.item.type} jest przedmiotem`);
        assert.deepEqual(pngSize(`${pack.folder}/${pack.item.file}`), [16, 16], `${pack.item.type}: 16 x 16`);

        for (const group of pack.item.groups) {
            assert.ok(GROUPS[group].types.includes(pack.item.type), `${pack.item.type} w grupie #${group}`);
            assert.match(GROUPS[group].label, new RegExp(pack.item.label.toLowerCase()), `grupa #${group} wymienia ${pack.item.label}`);
        }

    }

    if (pack.harvest) {
        const harvest = R.getHarvest(types[types.length - 1]);
        assert.equal(harvest.item, pack.item.type);
        assert.equal(harvest.becomes, types[pack.harvest.back], 'po zbiorze wraca do etapu');
    }

}

// Amarantus - pierwsza roślina: 2 bloki wysokości, czerwona lampa.
const amaranth = P.getPlantPack('amarantus');
assert.ok(amaranth, 'amarantus');
assert.equal(R.BLOCK_TYPES.amarantus_etap3.plant.height, 2, 'dojrzały amarantus ma 2 bloki');
assert.ok(GROUPS.red.types.includes('amarantus_wiecha'), 'wiecha - coś czerwonego');


// Paczki z błędami są pomijane (osobny proces - moduł wczytuje paczki
// raz, przy imporcie).
const broken = execFileSync(process.execPath, ['--input-type=module', '-e', `
    const P = await import(${JSON.stringify(new URL('../src/blocks/plantPacks.js', import.meta.url).href)});
    console.log(JSON.stringify({ ids: P.PLANT_PACKS.map((p) => p.id), errors: P.PLANT_PACK_ERRORS }));
`], { env: { ...process.env, ROSLINY_LISTA: JSON.stringify(['amarantus', 'Zla_Nazwa', 'brakfolderu', 'amarantus']) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const result = JSON.parse(broken.trim().split('\n').pop());
assert.deepEqual(result.ids, ['amarantus'], 'zostaje tylko dobra paczka');
assert.equal(result.errors.length, 3, 'trzy błędy: nazwa, brak pliku, druga kopia');
assert.match(result.errors[0], /zła nazwa folderu/);
assert.match(result.errors[1], /brak pliku roslina\.json/);
assert.match(result.errors[2], /dwa razy|zachodzą/);


// Teren realistyczny: rośliny w swoich biomach, wszystkie etapy,
// powtarzalnie.
const { RealisticGenerator, DETAIL_FULL } = await import('../src/world/terrain/RealisticGenerator.js');
const { BIOME_KEYS } = await import('../src/world/terrain/Biomes.js');

function scan(seed) {
    const generator = new RealisticGenerator(seed);
    const found = [];
    const ids = new Set(P.PLANT_PACKS.flatMap((pack) => pack.stages.map((_, i) => pack.firstId + i)));
    for (let x = -600; x <= 600; x += 3) {
        for (let z = -600; z <= 600; z += 3) {
            const sample = generator.compute(x, z, DETAIL_FULL, {});
            const biome = generator.biomeIndexAt(x, z, sample);
            const id = generator.plantAt(x, z, sample, biome);
            if (ids.has(id)) {
                found.push([x, z, id, BIOME_KEYS[biome]]);
            }
        }
    }
    return found;
}

const found = scan('lepidolit');
const again = scan('lepidolit');

assert.deepEqual(found, again, 'ten sam seed - te same rośliny');

for (const pack of P.PLANT_PACKS.filter((p) => p.where)) {
    const mine = found.filter(([, , id]) => id >= pack.firstId && id < pack.firstId + pack.stages.length);
    assert.ok(mine.length > 10, `${pack.id}: rośnie w świecie (${mine.length})`);
    assert.ok(mine.every(([, , , biome]) => pack.where.biomes.includes(biome)), `${pack.id}: tylko w swoich biomach`);
    for (let i = 0; i < pack.stages.length; i++) {
        assert.ok(mine.some(([, , id]) => id === pack.firstId + i), `${pack.id}: jest etap ${i + 1}`);
    }
}

console.log(`OK: paczki roślin (${P.PLANT_PACKS.length}), etapy: ${stages} (rozmiary z obrazków, wzrost, zbiór, łupy), przedmioty i grupy, 3 błędne paczki pominięte, ${found.length} roślin w terenie (biomy, etapy, powtarzalność).`);
