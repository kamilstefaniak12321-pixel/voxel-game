// ------------------------------------------------------------
// SPRAWDZENIE WARIANTÓW TRAWY WEDŁUG SIEDLISKA (1.3.0)
//
// - krótka i wysoka trawa mają zestaw wyglądów dla każdego siedliska
//   (łąka, brzeg, las, bór, suche miejsca, góry), a zestawy różnią się
//   między sobą (na łące rośnie co innego niż nad wodą),
// - siedlisko kolumny: z biomu i odległości do wody; chunk nowy
//   i wczytany z zapisu dostają tę samą siatkę,
// - tekstury wariantów są w atlasie (16 x 16), zieleń barwi klimat,
//   kwiaty i kłosy zostają w swoim kolorze,
// - mesher: ten sam blok, ta sama liczba rysowań; wygląd zależy od
//   siedliska i miejsca, zawsze taki sam w tym samym miejscu,
// - poziomy: prosty i półrealistyczny mają warianty (także dalekie
//   chunki), szczegółowy - zwykły wygląd,
// - koszt: średnia liczba ścian trawy w każdym siedlisku w granicach.
//
// Uruchomienie: node tools/sprawdz_warianty_kepek.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null,getTileMask=()=>null;
                const seen=new Map();
                export const getAtlasUV=(name)=>{ if(!seen.has(name)) seen.set(name,seen.size); const i=seen.get(name); return {uMin:i/2048,uMax:(i+1)/2048,vMin:0,vMax:1,name}; };
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILE_SIZE=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

console.warn = () => {};

const { readTextureRegion } = await import('./texture_regions.mjs');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { PLANT_MODELS, PLANT_MODEL_ERRORS, PLANT_MODEL_TEXTURES } = await import('../src/blocks/plantModels.js');
const H = await import('../src/blocks/plantHabitats.js');
const { BIOME_KEYS } = await import('../src/world/terrain/Biomes.js');
const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const { applyPlantModelLevel } = await import('../src/rendering/PlantModelLevels.js');
const { createPlantDetailLookup } = await import('../src/rendering/PlantDistanceModels.js');
const { pickRegionalPlant } = await import('../src/rendering/PlantRegionalVariants.js');
const { getPlaneModelFaces } = await import('../src/rendering/PlaneModelGeometry.js');
const { buildChunkGeometry, createChunkGeometryJob } = await import('../src/rendering/ChunkMesher.js');
const { WORLD_ATLAS_TILES, TEXTURE_REGIONS } = await import('../src/rendering/TextureSheetData.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

check(PLANT_MODEL_ERRORS.length === 0, `Modele roślin bez błędów: ${PLANT_MODEL_ERRORS.join('; ')}`);

const HABITATS = H.PLANT_HABITATS;
check(HABITATS.join() === 'laka,brzeg,las,bor,sucha,gory', 'Sześć siedlisk w stałej kolejności (numery idą do chunków)');
check(HABITATS.every((key) => H.PLANT_HABITAT_NAMES[key]), 'Każde siedlisko ma nazwę');


// --- Opisy: zestawy wariantów -------------------------------------------------------------

const grasses = ['krotka-trawa', 'wysoka-trawa'].map((id) => PLANT_MODELS.find((model) => model.id === id));

for (const model of grasses) {

    check(model.variants.length >= 15, `${model.id}: co najmniej 15 wariantów (jest ${model.variants.length})`);
    check(model.habitats.length === HABITATS.length && model.habitats.every(Boolean), `${model.id}: zestaw dla każdego siedliska`);

    const sets = model.habitats.map((entries) => entries.map((entry) => entry.variant).sort().join());

    check(new Set(sets).size === HABITATS.length, `${model.id}: każde siedlisko ma inny zestaw`);

    const used = new Set();

    model.habitats.forEach((entries, habitat) => {

        const total = entries.reduce((sum, entry) => sum + entry.share, 0);

        check(Math.abs(total - 1) < 1e-9, `${model.id} / ${HABITATS[habitat]}: udziały dają razem 1`);
        check(entries.length >= 3 && entries.length <= 6, `${model.id} / ${HABITATS[habitat]}: od 3 do 6 wyglądów`);
        check(entries.some((entry) => entry.variant === -1), `${model.id} / ${HABITATS[habitat]}: zwykła trawa też rośnie`);

        // Wyglądy z kwiatami i kłosami (łodygi) to dodatek, nie większość.
        const flowering = entries.filter((entry) => entry.variant >= 0 && model.variants[entry.variant].semi.spec.lodygi)
            .reduce((sum, entry) => sum + entry.share, 0);

        check(flowering >= 0.1 && flowering <= 0.4, `${model.id} / ${HABITATS[habitat]}: kwitnące kępki to 10-40% (jest ${(flowering * 100).toFixed(0)}%)`);

        for (const entry of entries) if (entry.variant >= 0) used.add(entry.variant);

    });

    check(used.size === model.variants.length, `${model.id}: każdy wariant gdzieś rośnie`);

    // Łąka: zwykła trawa to większość. Poza łąką - własna trawa siedliska.
    check(model.habitats[0].find((entry) => entry.variant === -1).share >= 0.6, `${model.id}: na łące zwykła trawa to większość`);

    for (let habitat = 1; habitat < HABITATS.length; habitat++) {
        const top = [...model.habitats[habitat]].sort((a, b) => b.share - a.share)[0];
        check(top.variant >= 0 && !model.variants[top.variant].semi.spec.lodygi, `${model.id} / ${HABITATS[habitat]}: najczęstsza jest własna trawa siedliska (bez kwiatów)`);
    }

}


// --- Tekstury -------------------------------------------------------------------------------

const green = (r, g, b) => g - Math.max(r, b) > 18;   // barwi klimat (BlockRenderData.js)
let textures = 0;

for (const model of grasses) {

    for (const variant of model.variants) {

        for (const level of [variant.semi, variant.simple]) {

            check(PLANT_MODEL_TEXTURES[level.texture], `${level.texture}: na liście tekstur modeli`);
            check(WORLD_ATLAS_TILES[level.texture] && TEXTURE_REGIONS[level.texture], `${level.texture}: kafelek w atlasie`);

            const { width, height, rgba: data } = readTextureRegion(level.texture);

            check(width === 16 && height === 16, `${level.texture}: 16 x 16`);

            let solid = 0, tinted = 0, half = 0;

            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] === 0) continue;
                if (data[i + 3] !== 255) half++;
                solid++;
                if (green(data[i], data[i + 1], data[i + 2])) tinted++;
            }

            check(half === 0, `${level.texture}: piksele pełne albo przezroczyste`);
            check(solid >= 12 && tinted >= 8, `${level.texture}: jest na niej zielona roślina (${tinted} z ${solid})`);

            if (variant.semi.spec.lodygi && level === variant.simple) {
                check(solid - tinted >= 2, `${level.texture}: kwiat albo kłos w swoim kolorze (nie barwi go klimat)`);
            }

            textures++;

        }

        // Liść arkusza części (x 0-7, y 8-15) nie jest pusty.
        const sheet = readTextureRegion(variant.semi.texture).rgba;
        let leaf = 0;
        for (let y = 8; y < 16; y++) for (let x = 0; x < 8; x++) if (sheet[(y * 16 + x) * 4 + 3]) leaf++;
        check(leaf >= 8, `${variant.semi.texture}: liść w arkuszu`);

    }

}


// --- Siedlisko kolumny ----------------------------------------------------------------------

const index = (key) => HABITATS.indexOf(key);

check(BIOME_KEYS.every((key) => HABITATS.includes(H.BIOME_HABITATS[key])), 'Każdy biom ma siedlisko');
check(H.plantHabitat('meadow', Infinity, 5, 5) === index('laka'), 'Łąka daleko od wody - łąka');
check(H.plantHabitat('meadow', 1, 5, 5) === index('brzeg'), 'Łąka tuż przy wodzie - brzeg');
check(H.plantHabitat('spruce', 0, 9, 2) === index('brzeg'), 'Bór tuż przy wodzie - brzeg');
check(H.plantHabitat('spruce', 40, 9, 2) === index('bor') && H.plantHabitat('beech', 40, 9, 2) === index('las'), 'Bór i las liściasty osobno');
check(H.plantHabitat('wetland', 40, 9, 2) === index('brzeg'), 'Mokradła - brzeg');
check(H.plantHabitat('beach', 0, 9, 2) === index('sucha') && H.plantHabitat('olive_grove', 30, 1, 1) === index('sucha'), 'Plaża (nawet przy wodzie) i gaj oliwny - suche');
check(H.plantHabitat('alpine', 30, 1, 1) === index('gory') && H.plantHabitat('mugo_scrub', 30, 1, 1) === index('gory'), 'Hale i kosodrzewina - góry');
check(H.plantHabitat('nowy_biom', 30, 1, 1) === 0, 'Nieznany biom - łąka');

// Granica brzegu jest postrzępiona: między SHORE_NEAR a SHORE_FAR część
// kolumn to brzeg, część nie - i coraz mniej im dalej.
const shoreShare = (water) => { let n = 0; for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z++) if (H.plantHabitat('meadow', water, x, z) === 1) n++; return n / 3600; };
check(shoreShare(H.SHORE_NEAR - 0.5) === 1 && shoreShare(H.SHORE_FAR) === 0, 'Brzeg: blisko wody zawsze, daleko nigdy');
check(shoreShare(4) > shoreShare(6) && shoreShare(4) < 1 && shoreShare(6) > 0, 'Brzeg: postrzępiona granica');

// Prawdziwy świat: siatka w chunku, taka sama po wczytaniu z zapisu.
const generator = new RealisticGenerator(644734948);
const seen = new Set();
for (const [cx, cz] of [[0, 0], [-4, 2], [5, 5], [12, -7], [-9, -9], [20, 3]]) {
    const fresh = new Chunk(cx, cz);
    generator.generateChunk(fresh);
    check(fresh.habitats instanceof Uint8Array && fresh.habitats.length === 256, `Chunk ${cx},${cz}: siatka siedlisk 16 x 16`);
    check(fresh.habitats.every((value) => value < HABITATS.length), `Chunk ${cx},${cz}: numery siedlisk z listy`);
    const loaded = new Chunk(cx, cz);
    loaded.blocks.set(fresh.blocks);
    generator.fillFlow(loaded);
    check(Buffer.from(loaded.habitats).equals(Buffer.from(fresh.habitats)), `Chunk ${cx},${cz}: po wczytaniu z zapisu te same siedliska`);
    for (const value of fresh.habitats) seen.add(value);
}
check(seen.size >= 2, `W kilku chunkach świata są różne siedliska (${[...seen].map((value) => HABITATS[value]).join(', ')})`);


// --- Wybór wyglądu i poziomy modeli ---------------------------------------------------------

const SHORT = getBlockId('short_grass'), TALL = getBlockId('tall_grass');

applyPlantModelLevel('detailed');
check(!blockRenderData[SHORT].riverPlant.regional && !blockRenderData[TALL].riverPlant.regional, 'Poziom szczegółowy: zwykły wygląd wszędzie');

applyPlantModelLevel('simple');
for (const id of [SHORT, TALL]) {
    const cross = blockRenderData[id].cross;
    check(cross?.regional?.length === HABITATS.length, 'Poziom prosty: obrazki według siedliska');
    const option = cross.regional[1].options.find((item) => item !== cross);
    check(option.planes === cross.planes && option.width === cross.width && option.height === cross.height && option.uv.name.endsWith('-prosty'),
        'Poziom prosty: wariant to ten sam kształt z innym obrazkiem');
}

applyPlantModelLevel('semi');

const faceCost = {};

for (const [id, model] of [[SHORT, grasses[0]], [TALL, grasses[1]]]) {

    const base = blockRenderData[id].riverPlant;

    check(base.regional?.length === HABITATS.length, `${model.id}: modele według siedliska`);
    check(base.regional.every((set) => set.options.every((option) => !option.regional || option === base)), `${model.id}: wariant nie ma własnych wariantów`);
    check(base.regional.every((set) => set.options.every((option) => option.tint === true && option.kind.startsWith('plane:'))), `${model.id}: warianty to modele z kart, barwione klimatem`);

    const faces = (data) => { let sum = 0; for (let v = 0; v < 8; v++) sum += getPlaneModelFaces(data.kind, v).length; return sum / 8; };
    const plain = faces(base);

    HABITATS.forEach((key, habitat) => {

        const set = base.regional[habitat];
        const entries = model.habitats[habitat];

        // Częstość z losu = udział z opisu; ten sam los - ten sam wygląd.
        const counts = new Map();
        const N = 20000;
        for (let i = 0; i < N; i++) {
            const option = pickRegionalPlant(base, habitat, (i + 0.5) / N);
            counts.set(option, (counts.get(option) ?? 0) + 1);
        }
        entries.forEach((entry, i) => {
            check(Math.abs((counts.get(set.options[i]) ?? 0) / N - entry.share) < 0.002, `${model.id} / ${key}: udział wyglądu ${i}`);
        });
        check(pickRegionalPlant(base, habitat, 0) === set.options[0] && pickRegionalPlant(base, habitat, 0.999999) === set.options.at(-1), `${model.id} / ${key}: skrajne losy`);

        const cost = entries.reduce((sum, entry, i) => sum + entry.share * faces(set.options[i]), 0);
        (faceCost[key] ??= []).push(cost / plain);
        check(cost / plain <= 1.4, `${model.id} / ${key}: średnio najwyżej 1,4 x ścian zwykłej trawy (jest ${(cost / plain).toFixed(2)})`);
        for (const option of set.options) check(faces(option) <= 28, `${model.id} / ${key}: jeden wygląd to najwyżej 28 ścian`);

    });

}

// Dalekie chunki (uproszczone modele) też trzymają warianty.
for (const detail of [1, 2]) {
    const lookup = createPlantDetailLookup(detail);
    const data = lookup(SHORT);
    check((data.riverPlant ?? data.cross).regional?.length === HABITATS.length, `Dalekie chunki (poziom ${detail}): warianty zostają`);
}


// --- Mesher ---------------------------------------------------------------------------------

const worldFor = (chunk) => ({ getChunk: (x, z) => x === chunk.cx && z === chunk.cz ? chunk : null,
    experiments: { bushyGrass: false }, getGrassDetail: () => 0, markPlantsDirty: (c) => { c.plantRevision++; } });

function field(habitat) {
    const chunk = new Chunk(0, 0);
    const grass = getBlockId('grass');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        chunk.setId(x, 8, z, grass);
        chunk.setId(x, 9, z, (x + z) % 2 ? SHORT : TALL);
    }
    chunk.skyLight.fill(15);
    chunk.tint = new Uint8Array(17 * 17 * 3).fill(137);
    if (habitat !== null) chunk.habitats = new Uint8Array(256).fill(habitat);
    return chunk;
}

const built = (habitat, level) => { applyPlantModelLevel(level); const chunk = field(habitat); return buildChunkGeometry(chunk, worldFor(chunk), { terrain: true, plants: true }); };
const same = (a, b) => ['position', 'uv', 'tint'].every((name) => a.attributes[name].array.length === b.attributes[name].array.length && a.attributes[name].array.every((value, i) => value === b.attributes[name].array[i]));
const textureSet = (geometry) => new Set([...geometry.attributes.uv.array].filter((_, i) => i % 2 === 0).map((u) => Math.floor(u * 2048 + 1e-6))).size;

for (const level of ['semi', 'simple']) {

    const meadow = built(0, level), shore = built(1, level), none = built(null, level);

    check(same(meadow, built(0, level)), `${level}: to samo miejsce - ta sama trawa`);
    check(same(meadow, none), `${level}: chunk bez siatki siedlisk to łąka`);
    check(!same(meadow, shore), `${level}: nad wodą trawa wygląda inaczej niż na łące`);
    check(meadow.groups.length === shore.groups.length && meadow.groups.every((group, i) => group.materialIndex === shore.groups[i].materialIndex),
        `${level}: te same materiały - ani jednego rysowania więcej`);
    check(textureSet(meadow) >= 6 && textureSet(shore) >= 6, `${level}: w jednym chunku kilka różnych wyglądów`);
    // Barwienie klimatem zostaje (tint 137 w każdym wierzchołku trawy).
    check([...shore.attributes.tint.array].filter((value) => value === 137).length > 1000, `${level}: warianty barwi klimat`);

}

// Dwa chunki budowane na zmianę, po kawałku (tak pracuje gra): każdy
// trzyma własne siedliska - łąka nie dostaje trawy z brzegu sąsiada.
{
    applyPlantModelLevel('semi');
    const first = field(0), second = field(1);
    const jobs = [first, second].map((chunk) => createChunkGeometryJob(chunk, worldFor(chunk), { terrain: true, plants: true }));
    const results = [null, null];
    let clock = 0, slices = 0;
    const realNow = Object.getOwnPropertyDescriptor(performance, 'now');
    Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
    try {
        while ((!results[0] || !results[1]) && slices++ < 100000) {
            jobs.forEach((job, i) => { if (!results[i]) { const step = job.step(clock + 9); if (step.done) results[i] = step.geometry; } });
        }
    } finally {
        if (realNow) Object.defineProperty(performance, 'now', realNow); else delete performance.now;
    }
    check(slices > 4, `Budowanie na zmianę rzeczywiście się przeplata (${slices} kroków)`);
    check(same(results[0], built(0, 'semi')) && same(results[1], built(1, 'semi')), 'Chunki budowane na zmianę: każdy ze swoim siedliskiem');
}

applyPlantModelLevel('detailed');
check(same(built(0, 'detailed'), built(1, 'detailed')), 'Szczegółowe: siedlisko nie zmienia wyglądu');
applyPlantModelLevel('semi');

console.log(`Ściany trawy względem zwykłej (krótka, wysoka): ${Object.entries(faceCost).map(([key, [a, b]]) => `${key} ${a.toFixed(2)} ${b.toFixed(2)}`).join(' | ')}`);
console.log(`OK: warianty trawy według siedliska - ${checks} sprawdzeń, ${textures} tekstur.`);
