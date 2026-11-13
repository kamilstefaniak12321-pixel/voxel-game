// ------------------------------------------------------------
// KOMENDY GRY - GENERATOR TERENU
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { simplify, CommandError } from './CommandRegistry.js';
import { getBlockTypeById, getBlockDefinition } from '../blocks/BlockRegistry.js';
import { LANDFORMS, RELIEFS } from '../world/terrain/landforms.js';
import { terrainName } from '../world/terrain/generators.js';
import { MAP_LAYERS, MAP_SCALES } from '../ui/TerrainMap.js';
import { ROCK_INFO, blockNamePl, blockFromWord } from '../world/terrain/rocks.js';
import { BIOMES, LAND_BIOMES, BIOME_KEYS, biomeByWord } from '../world/terrain/Biomes.js';
import { CHUNK_HEIGHT } from '../config.js';
import {
    usageError,
    parseNumber,
    parseCoordinate,
    OFF_WORDS,
    treeName,
    riverBank
} from './commandHelpers.js';

// Formy terenu do wpisania w /teren znajdz (bez polskich znaków).
// Część słów to pasy wysokości (niziny, wyżyny, góry, morze).

const LANDFORM_WORDS = {
    morze: { relief: 'sea' },
    wybrzeze: { landform: 'coast' },
    plaza: { landform: 'coast' },
    nizina: { relief: 'lowland' },
    wyzyna: { relief: 'upland' },
    gory: { relief: 'mountains' },
    zbocze: { landform: 'mountains' },
    grzbiet: { landform: 'ridge' },
    turnia: { landform: 'crag' },
    wzgorze: { landform: 'hill' },
    pagorek: { landform: 'hillock' },
    dolina: { landform: 'valley' },
    kotlina: { landform: 'basin' },
    zleb: { landform: 'gully' },
    depresja: { landform: 'depression' },
    rownina: { landform: 'plain' },
    rownia: { landform: 'flat' },
    plaskowyz: { landform: 'plateau' },
    rzeka: { landform: 'river' },
    jezioro: { landform: 'lake' }
};

const SURFACE_NAMES = {
    grass: 'ziemia (trawa, ściółka, mech...)',
    riverbed: 'dno rzeki albo jeziora',
    rock: 'skała',
    sand: 'piasek',
    seabed: 'dno morza (piasek)',
    water: 'woda'
};


// Opis miejsca z generatora (do /teren).

function terrainText(world, x, z) {

    const generator = world.generator;

    const info = generator.describe(x, z);

    const sea = generator.seaLevel;

    const fields = Object.entries(info.fields)
        .map(([name, value]) => `${name} ${value.toFixed(2)}`)
        .join(', ');

    return `Teren: ${terrainName(world.terrain)} | ${x}, ${z} | wysokość ${info.height}` +
        `${sea !== null ? ` (${info.height - sea >= 0 ? '+' : ''}${info.height - sea} nad morzem)` : ''} | ` +
        `${RELIEFS[info.relief] ?? info.relief} | forma: ${LANDFORMS[info.landform]?.name ?? info.landform} | ` +
        `powierzchnia: ${SURFACE_NAMES[info.surface] ?? info.surface}` +
        (BIOMES[info.biome] ? ` | biom: ${BIOMES[info.biome].name} (/biom)` : '') +
        (info.rock ? ` | skała pod spodem: ${blockNamePl(info.rock)} (/skaly)` : '') +
        (info.forest?.species
            ? ` | las: ${Math.round(info.forest.density * 100)}% kratek z drzewem, przeważa ${treeName(info.forest.species)} (/drzewa)`
            : '') +
        (fields ? `\nPola: ${fields}` : '');

}


// Kolumna bloków (x, z) z generatora jako tekst: od góry, kolejne
// bloki tej samej skały razem - np. "trawa 1, ziemia 3, wapień 8 (y 50-57)".

function columnText(generator, x, z) {

    const { blocks, top } = generator.columnBlocks(x, z);

    const runs = [];

    for (let y = top; y >= 0; y--) {

        const type = getBlockTypeById(blocks[y]);

        const last = runs[runs.length - 1];

        if (last && last.type === type) {
            last.bottom = y;
        }
        else {
            runs.push({ type, top: y, bottom: y });
        }

    }


    const lepidolite = runs.filter((run) => run.type === 'lepidolite');

    const text = runs.map(({ type, top: from, bottom }) =>
        `${blockNamePl(type)} ${from - bottom + 1} (y ${bottom === from ? from : `${bottom}-${from}`})`
    ).join(', ');

    return `Kolumna ${x}, ${z} od góry: ${text}` +
        (lepidolite.length > 0
            ? ` | Lepidolit: ${lepidolite.reduce((sum, run) => sum + run.top - run.bottom + 1, 0)} bl.`
            : ' | Lepidolitu tu nie ma (/skaly zyla - najbliższa żyła).');

}


// Punkty na pierścieniach coraz dalej od (x0, z0), co `step` bloków.
// test(x, z) zwraca wynik albo null - pierwszy wynik kończy szukanie.

function searchRings(x0, z0, maxRadius, step, test) {

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            const result = test(x, z);

            if (result) {
                return { x, z, distance: radius, ...result };
            }

        }

    }

    return null;

}


// Najbliższe miejsce z formą terenu (szukanie coraz dalej).

function findLandform(generator, x0, z0, target, maxRadius) {

    // Rzeki są wąskie - szukamy ich w sieci rzek, nie co kilka bloków.

    if ((target.landform === 'river' || target.landform === 'lake') && generator.rivers) {

        const found = target.landform === 'river'
            ? generator.rivers.nearest(x0, z0, maxRadius)
            : generator.rivers.nearestLake(x0, z0, maxRadius);

        if (!found) {
            return null;
        }

        const spot = target.landform === 'river' ? found : riverBank(generator, found.x, found.z);

        return { x: spot.x, z: spot.z, info: generator.describe(found.x, found.z), distance: Math.round(found.distance) };

    }

    const step = 12;

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            const info = generator.describe(x, z);

            if (
                (target.landform && info.landform === target.landform) ||
                (target.relief && info.relief === target.relief)
            ) {
                return { x, z, info, distance: radius };
            }

        }

    }

    return null;

}


// Najbliższe miejsce z biomem `target` (klucz z BIOMES) - kawałek w głębi
// biomu (sąsiednie punkty o kilkanaście bloków też w nim), nie na samej
// granicy: { x, z, distance } albo null.

function findBiome(generator, x0, z0, target, maxRadius) {

    const sample = {};

    const inside = (x, z) => generator.biomes.classify(x, z, generator.compute(x, z, 0, sample)) === target;

    const step = 16;

    for (let radius = 0; radius <= maxRadius; radius += step) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / step);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const x = Math.round(x0 + Math.cos(angle) * radius);
            const z = Math.round(z0 + Math.sin(angle) * radius);

            if (!inside(x, z)) {
                continue;
            }

            // Woda - wystarczy jedna kolumna (rzeki są wąskie).

            if (BIOMES[target].water) {
                return { x, z, distance: radius };
            }

            let around = 0;

            for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
                around += inside(x + dx, z + dz) ? 1 : 0;
            }

            if (around >= 3) {
                return { x, z, distance: radius };
            }

        }

    }

    return null;

}

export const TERRAIN_COMMANDS = [

    // ========================================================
    // TEREN (generator terenu - docs/generator-terenu.md)
    // ========================================================

    {
        name: 'teren',
        aliases: ['terrain'],
        usage: '/teren [x z] | /teren znajdz <forma> [promien] [tp] | /teren formy',
        description: 'Teren w miejscu gracza (albo x z): wysokość, niziny/wyżyny/góry, forma terenu, pola generatora. Szukanie form.',

        run(args, { world, player }) {

            const [action] = args;


            if (!action) {
                return terrainText(world, Math.floor(player.pos.x), Math.floor(player.pos.z));
            }


            const word = simplify(action);


            if (word === 'formy') {

                return 'Formy terenu (/teren znajdz <forma>): ' +
                    Object.keys(LANDFORM_WORDS).join(', ');

            }


            if (['znajdz', 'find'].includes(word)) {

                const target = LANDFORM_WORDS[simplify(args[1] ?? '')];

                if (!target) {
                    throw new CommandError(`Podaj formę terenu: ${Object.keys(LANDFORM_WORDS).join(', ')}`);
                }

                const teleport = args.slice(2).some((arg) => simplify(arg) === 'tp');

                const radiusArg = args.slice(2).find((arg) => simplify(arg) !== 'tp');

                const radius = radiusArg === undefined ? 1500 : parseNumber(radiusArg, 'promień');

                if (radius < 16 || radius > 4000) {
                    throw new CommandError('Promień: od 16 do 4000 bloków');
                }


                const found = findLandform(
                    world.generator,
                    Math.floor(player.pos.x),
                    Math.floor(player.pos.z),
                    target,
                    radius
                );

                if (!found) {
                    throw new CommandError(`Nie ma "${args[1]}" w promieniu ${radius} bloków. Spróbuj większy promień.`);
                }


                const { x, z, info, distance } = found;

                const what = target.landform
                    ? LANDFORMS[info.landform].name
                    : RELIEFS[info.relief];

                if (teleport) {

                    world.ensureColumnLoaded(x, z);

                    player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.updateCamera();

                    return `Przeniesiono: ${what} na ${x}, ${z} (${distance} bloków stąd).`;

                }

                return `Najbliżej: ${what} na ${x}, ${z} (ok. ${distance} bloków stąd, wysokość ${info.height}). ` +
                    `Przeniesienie: /tp ${x} ${z} albo /teren znajdz ${simplify(args[1])} tp`;

            }


            if (args.length === 2) {

                const x = Math.floor(parseCoordinate(args[0], player.pos.x));
                const z = Math.floor(parseCoordinate(args[1], player.pos.z));

                return terrainText(world, x, z);

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['znajdz', 'formy', '~'];
            if (args.length === 2 && simplify(args[0]) === 'znajdz') return Object.keys(LANDFORM_WORDS);
            if (args.length >= 3 && simplify(args[0]) === 'znajdz') return ['tp', '500', '3000'];

            return [];

        }
    },


    {
        name: 'biom',
        aliases: ['biome', 'biomy'],
        usage: '/biom | /biom lista | /biom znajdz <biom> [promien] [tp]',
        description: 'Biom w miejscu gracza (łąka, las liściasty, hala, mokradła...): co tam rośnie, klimat. Lista biomów i szukanie najbliższego.',

        run(args, { world, player, game }) {

            const generator = world.generator;

            if (!generator.biomes) {
                throw new CommandError('Teren klasyczny nie ma biomów - są w terenie realistycznym (nowy świat: Teren - Realistyczny).');
            }

            const visited = new Set(game?.achievements?.data?.progress?.biomes ?? []);

            const [action] = args;


            if (!action) {

                const x = Math.floor(player.pos.x);
                const z = Math.floor(player.pos.z);

                const key = generator.biomeAt(x, z);

                const info = generator.biomes.info;

                const biome = BIOMES[key];

                return `Biom: ${biome.name} (${x}, ${z}) - ${biome.about}. ` +
                    `Temperatura ${info.temperature.toFixed(2)}, wilgotność ${info.humidity.toFixed(2)}, wysokość ${info.above >= 0 ? '+' : ''}${info.above} nad morzem. ` +
                    `Odwiedzone: ${LAND_BIOMES.filter((k) => visited.has(k)).length} z ${LAND_BIOMES.length} (/biom lista, /mapa biomy).`;

            }


            const word = simplify(action);


            if (['lista', 'list'].includes(word)) {

                return 'Biomy (✔ - odwiedzone; /biom znajdz <słowo>): ' +
                    BIOME_KEYS.map((key) => `${!BIOMES[key].water && visited.has(key) ? '✔ ' : ''}${BIOMES[key].name} (${BIOMES[key].words[0]})`).join(', ');

            }


            if (['znajdz', 'find'].includes(word)) {

                const target = biomeByWord(simplify(args[1] ?? ''));

                if (!target) {
                    throw new CommandError(`Podaj biom: ${BIOME_KEYS.map((key) => BIOMES[key].words[0]).join(', ')}`);
                }

                const teleport = args.slice(2).some((arg) => simplify(arg) === 'tp');

                const radiusArg = args.slice(2).find((arg) => simplify(arg) !== 'tp');

                const radius = radiusArg === undefined ? 3000 : parseNumber(radiusArg, 'promień');

                if (radius < 16 || radius > 8000) {
                    throw new CommandError('Promień: od 16 do 8000 bloków');
                }

                const found = findBiome(generator, Math.floor(player.pos.x), Math.floor(player.pos.z), target, radius);

                if (!found) {
                    throw new CommandError(`Nie ma biomu "${BIOMES[target].name}" w promieniu ${radius} bloków. Spróbuj większy promień.`);
                }

                const { x, z, distance } = found;

                if (teleport) {

                    world.ensureColumnLoaded(x, z);

                    player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                    player.vel.set(0, 0, 0);
                    player.updateCamera();

                    return `Przeniesiono: ${BIOMES[target].name} na ${x}, ${z} (${distance} bloków stąd).`;

                }

                return `Najbliżej: ${BIOMES[target].name} na ${x}, ${z} (ok. ${distance} bloków stąd). ` +
                    `Przeniesienie: /tp ${x} ${z} albo /biom znajdz ${BIOMES[target].words[0]} tp`;

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['lista', 'znajdz'];
            if (args.length === 2 && simplify(args[0]) === 'znajdz') return BIOME_KEYS.map((key) => BIOMES[key].words[0]);
            if (args.length >= 3 && simplify(args[0]) === 'znajdz') return ['tp', '1000', '6000'];

            return [];

        }
    },


    {
        name: 'skaly',
        aliases: ['rocks', 'geologia'],
        usage: '/skaly | /skaly statystyki [promien] | /skaly znajdz <skala> [promien] [tp] | /skaly zyla [promien] [tp] | /skaly przekroj',
        description: 'Skały pod ziemią: kolumna pod graczem, udział skał w okolicy, szukanie odsłoniętych skał i żył lepidolitu, przekrój.',

        run(args, { world, player, game, map }) {

            const generator = world.generator;

            if (!generator.columnBlocks) {
                throw new CommandError('Ten typ terenu nie ma opisu skał.');
            }


            const px = Math.floor(player.pos.x);
            const pz = Math.floor(player.pos.z);

            const action = simplify(args[0] ?? '');


            if (!action) {
                return columnText(generator, px, pz);
            }


            const flags = args.slice(1).map(simplify);

            const teleport = flags.includes('tp');

            const radiusOf = (fallback, max) => {

                const text = args.slice(1).find((arg) => /^\d+$/.test(arg));

                const radius = text === undefined ? fallback : Number(text);

                if (radius < 16 || radius > max) {
                    throw new CommandError(`Promień: od 16 do ${max} bloków`);
                }

                return radius;

            };

            const moveTo = (x, z) => {

                world.ensureColumnLoaded(x, z);

                player.pos.set(x + 0.5, world.getSurfaceY(x, z), z + 0.5);
                player.vel.set(0, 0, 0);
                player.updateCamera();

            };


            if (['statystyki', 'stat', 'stats'].includes(action)) {

                const radius = radiusOf(128, 1024);

                const step = Math.max(1, Math.ceil(radius / 20));

                const counts = {};

                let columns = 0;
                let rock = 0;
                let exposed = 0;

                const buffer = new Uint16Array(CHUNK_HEIGHT);

                for (let dz = -radius; dz <= radius; dz += step) {

                    for (let dx = -radius; dx <= radius; dx += step) {

                        if (dx * dx + dz * dz > radius * radius) {
                            continue;
                        }

                        const { blocks, height } = generator.columnBlocks(px + dx, pz + dz, buffer);

                        columns++;

                        for (let y = 0; y <= height; y++) {

                            const type = getBlockTypeById(blocks[y]);

                            if (type in ROCK_INFO) {
                                counts[type] = (counts[type] ?? 0) + 1;
                                rock++;
                            }

                        }

                        if (getBlockTypeById(blocks[height]) === 'lepidolite') {
                            exposed++;
                        }

                    }

                }


                const shares = Object.entries(counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => `${blockNamePl(type)} ${(100 * count / rock).toFixed(type === 'lepidolite' ? 2 : 1)}%`)
                    .join(', ');

                return `Skały w promieniu ${radius} bl. (${columns} kolumn co ${step} bl.): ${shares || 'brak'}. ` +
                    `Lepidolit na wierzchu: ${exposed} kolumn.`;

            }


            if (['znajdz', 'find'].includes(action)) {

                const target = blockFromWord(flags[0] ?? '');

                if (!target || !(target in ROCK_INFO)) {
                    throw new CommandError(`Podaj skałę: ${Object.values(ROCK_INFO).map((info) => info.word).join(', ')}`);
                }


                // Odsłonięte skały zajmują duże plamy - wystarczy rzadka
                // siatka. Lepidolit wychodzi na wierzch w małych miejscach,
                // więc szukamy gęsto (i bliżej).

                const lepidolite = target === 'lepidolite';

                const radius = radiusOf(lepidolite ? 256 : 1500, lepidolite ? 512 : 4000);

                const found = searchRings(px, pz, radius, lepidolite ? 2 : 12, (x, z) =>
                    generator.surfaceBlock(x, z) === target ? {} : null
                );

                if (!found) {

                    throw new CommandError(
                        `Nie ma odsłoniętego: ${blockNamePl(target)} w promieniu ${radius} bl.` +
                        (lepidolite ? ' Lepidolit rzadko wychodzi na wierzch - pod ziemią szukaj: /skaly zyla' : '')
                    );

                }

                if (teleport) {

                    moveTo(found.x, found.z);

                    return `Przeniesiono: ${blockNamePl(target)} na wierzchu, ${found.x}, ${found.z} (${found.distance} bl. stąd).`;

                }

                return `Najbliżej: ${blockNamePl(target)} na wierzchu, ${found.x}, ${found.z} (ok. ${found.distance} bl. stąd). ` +
                    `Przeniesienie: /skaly znajdz ${flags[0]} tp`;

            }


            if (['zyla', 'zyly', 'vein'].includes(action)) {

                const radius = radiusOf(192, 512);

                const buffer = new Uint16Array(CHUNK_HEIGHT);

                const lepidoliteId = getBlockDefinition('lepidolite').id;

                const found = searchRings(px, pz, radius, 4, (x, z) => {

                    const { blocks, height } = generator.columnBlocks(x, z, buffer);

                    for (let y = height; y >= 0; y--) {

                        if (blocks[y] === lepidoliteId) {
                            return { y, height };
                        }

                    }

                    return null;

                });

                if (!found) {
                    throw new CommandError(`Nie ma żyły lepidolitu w promieniu ${radius} bl. Spróbuj większy promień albo inne miejsce (żyły są w granicie - pod górami płycej).`);
                }

                const depth = found.height - found.y;

                if (teleport) {

                    moveTo(found.x, found.z);

                    return `Przeniesiono nad żyłę lepidolitu: ${found.x}, ${found.z} - żyła ${depth} bl. pod tobą (y ${found.y}).`;

                }

                return `Najbliższa żyła lepidolitu: ${found.x}, ${found.z}, y ${found.y} (${depth} bl. pod powierzchnią, ` +
                    `ok. ${found.distance} bl. stąd). Przeniesienie: /skaly zyla tp`;

            }


            if (['przekroj', 'section'].includes(action)) {

                if (!map) {
                    throw new CommandError('Mapa jest niedostępna.');
                }

                map.open(generator, player.pos.x, player.pos.z, 'przekroj', 1, player.yaw);

                return 'Przekrój terenu w kierunku patrzenia (to samo co /mapa przekroj). Zamknięcie: M albo /mapa wyl.';

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['statystyki', 'znajdz', 'zyla', 'przekroj'];

            const action = simplify(args[0]);

            if (action === 'znajdz' && args.length === 2) return Object.values(ROCK_INFO).map((info) => info.word);
            if (action === 'znajdz' && args.length >= 3) return ['tp', '500', '3000'];
            if (action === 'zyla') return ['tp', '256', '512'];
            if (action === 'statystyki' && args.length === 2) return ['64', '128', '512'];

            return [];

        }
    },


    {
        name: 'mapa',
        aliases: ['map'],
        usage: '/mapa [warstwa] [skala] | /mapa wyl   (skala = bloki na punkt: 1, 2, 4, 8, 16, 32)',
        description: 'Mapa terenu z góry: wysokość, formy terenu, niziny/wyżyny/góry, skały, pola generatora; ' +
            'przekrój pionowy w kierunku patrzenia (/mapa przekroj). Klawisz M.',

        run(args, { game, player, map }) {

            if (!map) {
                throw new CommandError('Mapa jest niedostępna.');
            }


            if (args.length === 0 && map.isOpen) {

                map.close();

                return 'Mapa zamknięta.';

            }

            if (OFF_WORDS.includes(simplify(args[0] ?? ''))) {

                map.close();

                return 'Mapa zamknięta.';

            }


            let layer = map.layer;
            let scale = null;

            for (const arg of args) {

                const word = simplify(arg);

                if (word in MAP_LAYERS) {
                    layer = word;
                }
                else if (MAP_SCALES.includes(Number(word))) {
                    scale = Number(word);
                }
                else {
                    throw new CommandError(`Warstwy: ${Object.keys(MAP_LAYERS).join(', ')}. Skale: ${MAP_SCALES.join(', ')}`);
                }

            }


            // Bez podanej skali: przekrój z bliska (1 blok na punkt),
            // a po przekroju zwykła mapa wraca do 8.

            if (scale === null) {

                scale =
                    layer === 'przekroj' ? 1 :
                    map.layer === 'przekroj' ? 8 :
                    map.scale;

            }


            map.open(game.world.generator, player.pos.x, player.pos.z, layer, scale, player.yaw);

            return `Mapa: ${MAP_LAYERS[layer]}, 1 punkt = ${scale} bl. ` +
                (layer === 'przekroj'
                    ? 'Przy otwartym czacie wskaż punkt myszą - pokaże wysokość i skałę.'
                    : 'Przy otwartym czacie wskaż punkt myszą - pokaże współrzędne i formę terenu.');

        },

        complete(args) {
            return args.length <= 2 ? [...Object.keys(MAP_LAYERS), ...MAP_SCALES.map(String), 'wyl'] : [];
        }
    }

];
