// ------------------------------------------------------------
// SCENY TESTOWE (tryb programisty)
//
// Gotowe miejsca do sprawdzania gry: światło i materiały, lampy,
// słońce przez okno, budulec a światło odbite, woda, rośliny, krzaki,
// drzewa, warstwy skał. Stawia je:
//   - pauza -> "Sceny testowe" (src/ui/Menu.js, main.js),
//   - komenda /scena <nazwa> (src/commands/gameCommands.js),
//   - testy (tools/sprawdz_sceny.mjs, tools/sprawdz_swiatlo_webgl.mjs).
//
// Na placu testowym (teren 'flat' - TestSiteGenerator.js) każda scena
// ma swoje stałe miejsce, więc wygląda za każdym razem tak samo
// (zrzuty ekranu i testy da się porównywać). W innym terenie scena
// staje przed graczem.
//
// Scena to:
//   id, name, description - nazwa w /scena, w menu i opis,
//   build(ctx)            - stawia scenę sama (bloki), albo
//   command: [nazwa, ...argumenty] - korzysta z komendy, która już
//                           umie ją postawić (np. /rosliny ogrod),
//   slot: { x, z }        - miejsce na placu: tu staje gracz, patrząc
//                           na południe (+z); komenda buduje przed nim.
//
// Nowa scena = nowy wpis w SCENES (i opis w docs/tryb-programisty.md).
// ------------------------------------------------------------

import { PLANT_MODELS } from '../blocks/plantModels.js';
import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { TEST_SITE_FLOOR } from '../world/terrain/TestSiteGenerator.js';
import { buildLightingReference, LIGHTING_REFERENCE_ORIGIN } from './LightingReference.js';
import { buildLightingMaterialsReference, MATERIAL_REFERENCE_ORIGIN } from './LightingMaterialsReference.js';


// Pory dnia z ekranu scen i /scena czas (część doby: 0,5 = południe).
// Świt i zachód - słońce nisko (długie cienie, kolorowe niebo).

export const SCENE_TIMES = {
    dawn: 6.25 / 24,
    noon: 0.5,
    dusk: 17.75 / 24,
    night: 0
};


// ------------------------------------------------------------
// Światło i materiały (dawne "Laboratorium światła", 0.4x)
//
// Współrzędne względem środka placu (0, 0), y - względem posadzki
// (TEST_SITE_FLOOR = 16, wierzch posadzki). Te same miejsca sprawdzają
// testy WebGL (tools/light_room_checks.js, surface_render_checks.js).
// ------------------------------------------------------------

export const LIGHT_SCENE_BOXES = [];

{
    const box = (x0, y0, z0, x1, y1, z1, material) => {
        LIGHT_SCENE_BOXES.push({ x0, y0, z0, x1, y1, z1, material });
    };

    // Północ: identyczne wnęki z różnych materiałów.
    for (const [index, material] of ['lime_plaster', 'terracotta', 'ochre_plaster', 'dark_planks'].entries()) {
        const x = -28 + index * 14;
        box(x, 17, -30, x + 8, 23, -30, material);
        box(x, 17, -30, x, 23, -24, material);
        box(x, 16, -30, x + 8, 16, -22, material);
    }

    // Środek: słupy 2, 4, 8 i 12 bloków, zawsze ten sam materiał.
    for (const [index, height] of [2, 4, 8, 12].entries()) {
        const x = -24 + index * 12;
        box(x, 17, -12, x + 1, 16 + height, -11, 'lime_plaster');
    }

    // Zachód: liście przepuszczające światło i pień rzucający cień.
    box(-28, 24, 4, -16, 25, 16, 'oak_leaves');
    box(-23, 17, 9, -22, 23, 10, 'oak_log');

    // Środek-południe: płytki basen; dno, woda i krawędź.
    box(-8, 14, 6, 4, 14, 20, 'sand');
    box(-8, 15, 6, 4, 16, 20, 'water');

    // Wschód: pokój z drzwiami od południa, oknem od zachodu
    // i otworem w dachu. Tylna komora oddziela lampy od dnia.
    box(12, 17, 4, 28, 24, 4, 'lime_plaster');
    box(12, 17, 4, 12, 24, 22, 'lime_plaster');
    box(28, 17, 4, 28, 24, 22, 'lime_plaster');
    box(12, 17, 22, 28, 24, 22, 'lime_plaster');
    box(12, 25, 4, 28, 25, 22, 'lime_plaster');
    box(18, 17, 22, 21, 20, 22, null);
    box(12, 19, 12, 12, 21, 15, null);
    box(19, 25, 12, 21, 25, 14, null);
    box(13, 17, 9, 27, 24, 9, 'dark_planks');
    box(24, 17, 9, 26, 20, 9, null);
    box(16, 19, 5, 16, 19, 5, 'lamp_red');
    box(23, 19, 5, 23, 19, 5, 'lamp_blue');
}

// Gracz po zbudowaniu: w powietrzu nad basenem, patrzy na północ
// i w dół - wnęki są w zasięgu widzenia 48 bloków (latanie włączone).
export const LIGHT_SCENE_VIEW = { x: 2.5, y: 36, z: 14.5, yaw: 0, pitch: -0.6 };


function buildLightScene({ world, player }, origin) {

    // Bloki stawiamy od dołu, a usuwamy od góry - tak światło nieba
    // przelicza się najszybciej (jak /wypelnij).

    let changed = 0;

    const dy = origin.y - TEST_SITE_FLOOR;

    for (const b of LIGHT_SCENE_BOXES) {

        for (let i = 0; i <= b.y1 - b.y0; i++) {

            const y = (b.material ? b.y0 + i : b.y1 - i) + dy;

            for (let x = b.x0; x <= b.x1; x++) {

                for (let z = b.z0; z <= b.z1; z++) {

                    const ok = b.material
                        ? world.setBlock(origin.x + x, y, origin.z + z, b.material)
                        : world.clearBlock(origin.x + x, y, origin.z + z);

                    if (ok) changed++;

                }

            }

        }

    }

    const view = LIGHT_SCENE_VIEW;

    place(player, origin.x + view.x, view.y + dy, origin.z + view.z, view.yaw, view.pitch);

    if (player.canFly) {
        player.flying = true;
    }

    return `${changed} bloków: wnęki z tynku, terakoty, ochry i ciemnych desek (północ), słupy 2-12 bloków, ` +
        'liście z pniem (zachód), basen (środek) i pokój z lampami i otworem w dachu (wschód). ' +
        'Porównanie modeli światła: Ustawienia - Eksperymenty albo /swiatlo model klasyczne.';

}


// ------------------------------------------------------------
// Modele roślin (Ustawienia -> Modele): każda roślina z listy modeli
// we wszystkich etapach, w rzędach - po przełączeniu poziomu modeli
// widać od razu, jak wygląda każda. Rząd = roślina, kolumny - etapy
// powtarzane (różne odmiany: obrót, pochylenie łodyg).
// ------------------------------------------------------------

function buildPlantModelScene({ world, player }, origin) {

    // Wszystkie etapy po kolei, rzędami po 12 (co 2 bloki).
    const stages = PLANT_MODELS.flatMap((model) => model.stages);
    const columns = 12;

    let placed = 0;

    stages.forEach((stage, i) => {

        const x = origin.x - columns + 1 + (i % columns) * 2;
        const z = origin.z + 3 + Math.floor(i / columns) * 2;
        const ground = getBlockDefinition(stage.type)?.ground?.[0] ?? 'grass';

        world.setBlock(x, origin.y, z, ground === 'sand' ? 'sand' : 'grass');

        if (world.setBlock(x, origin.y + 1, z, stage.type)) placed++;

    });

    place(player, origin.x + 0.5, origin.y + 6.5, origin.z - 4.5, Math.PI, -0.55);

    return `${placed} roślin (${PLANT_MODELS.length} gatunków, wszystkie etapy). ` +
        'Wygląd: Ustawienia - Modele - Modele roślin.';

}


// ------------------------------------------------------------
// Lista scen (kolejność = kolejność w menu)
// ------------------------------------------------------------

export const SCENES = [

    {
        id: 'swiatlo',
        name: 'Światło i materiały',
        description: 'Wnęki z czterech materiałów, słupy, liście z pniem, basen i pokój z lampami i otworem w dachu.',
        build: buildLightScene
    },

    {
        id: 'paleta',
        name: 'Paleta światła',
        description: 'Materiały i owoce, borówka w słońcu i cieniu, okno, zamknięta komora na granicy chunków i ciepłe światło.',
        build: buildLightingReference,
        slot: { x: LIGHTING_REFERENCE_ORIGIN.x, z: LIGHTING_REFERENCE_ORIGIN.z }
    },

    {
        id: 'materialy',
        name: 'Odbicia i cienkie liście',
        description: 'Ziemia, piasek i śnieg, dwa oddzielone pokoje oraz liście, owoce, kora i kamień do porównań oświetlenia.',
        build: buildLightingMaterialsReference,
        slot: { x: MATERIAL_REFERENCE_ORIGIN.x, z: MATERIAL_REFERENCE_ORIGIN.z }
    },

    {
        id: 'lampy',
        name: 'Kolorowe lampy',
        description: 'Zamknięty pokój z lampą czerwoną, niebieską, zieloną i fioletową; filar rzuca kolorowe cienie.',
        command: ['demo', 'swiatlo'],
        slot: { x: -280, z: 100 }
    },

    {
        id: 'okno',
        name: 'Słońce przez okno',
        description: 'Ciemny pokój z oknami od strony słońca: plamy światła, snopy i cienie.',
        command: ['demo', 'okno'],
        slot: { x: -200, z: 100 }
    },

    {
        id: 'dom',
        name: 'Budulec i światło odbite',
        description: 'Cztery pokoje z różnego budulca, każdy z oknem - jak kolor ścian zmienia światło.',
        command: ['demo', 'dom'],
        slot: { x: -120, z: 100 }
    },

    {
        id: 'basen',
        name: 'Woda',
        description: 'Basen z brodzikiem i głęboką częścią: pływanie, plusk, widok pod wodą.',
        command: ['woda', 'basen'],
        slot: { x: -40, z: 100 }
    },

    {
        id: 'rosliny',
        name: 'Rośliny',
        description: 'Ogródek ze wszystkimi roślinami z paczek, każda we wszystkich etapach wzrostu.',
        command: ['rosliny', 'ogrod'],
        slot: { x: 40, z: 100 }
    },

    {
        id: 'krzaki',
        name: 'Krzaki owocowe',
        description: 'Wszystkie krzaki owocowe we wszystkich etapach - zbieranie owoców i animacje.',
        command: ['krzaki', 'ogrod'],
        slot: { x: 120, z: 100 }
    },

    {
        id: 'drzewa',
        name: 'Drzewa',
        description: 'Aleja ze wszystkimi gatunkami drzew (także z paczek drzew).',
        command: ['drzewa', 'aleja'],
        slot: { x: 200, z: 100 }
    },

    {
        id: 'skaly',
        name: 'Warstwy skał',
        description: 'Odkrywka do dna świata - widać warstwy skał pod terenem.',
        command: ['demo', 'skaly'],
        slot: { x: 280, z: 100 }
    },

    {
        id: 'modele',
        name: 'Modele roślin',
        description: 'Wszystkie rośliny w trzech wersjach we wszystkich etapach - do porównania prostych, półrealistycznych i szczegółowych modeli.',
        build: buildPlantModelScene,
        slot: { x: 360, z: 100 }
    }

];


export function findScene(word) {

    const simple = String(word ?? '').toLowerCase();

    return SCENES.find((scene) => scene.id === simple) ?? null;

}


function place(player, x, y, z, yaw, pitch = 0) {

    player.pos.set(x, y, z);
    player.vel?.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = pitch;
    player.updateCamera?.();

}


// Stawia scenę. ctx - jak dla komend ({ game, world, player, ... }),
// runCommand(nazwa, argumenty) - wykonanie komendy (scena "command").
// Zwraca opis dla czatu.

export function buildScene(scene, ctx, runCommand) {

    const { world, player } = ctx;

    const testSite = world.generator?.type === 'flat';


    if (scene.build) {

        // Na placu - slot sceny lub środek, gdzie indziej - pod graczem (stopy
        // gracza = wierzch posadzki + 1).

        const origin = testSite
            ? { x: scene.slot?.x ?? 0, y: TEST_SITE_FLOOR, z: scene.slot?.z ?? 0 }
            : { x: Math.floor(player.pos.x), y: Math.floor(player.pos.y) - 1, z: Math.floor(player.pos.z) };

        return scene.build(ctx, origin);

    }


    if (testSite && scene.slot) {
        place(player, scene.slot.x + 0.5, world.generator.getHeight(scene.slot.x, scene.slot.z) + 1, scene.slot.z + 0.5, Math.PI);
    }

    return runCommand(scene.command[0], scene.command.slice(1)) ?? '';

}
