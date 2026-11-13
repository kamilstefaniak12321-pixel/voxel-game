// ------------------------------------------------------------
// KOMENDY GRY - ŚWIATŁO I SCENY TESTOWE
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import * as THREE from 'three';
import {
    LIGHTING_VIEWS,
    setLightingView,
    setLightingComponent,
    resetLightingDiagnostics
} from '../rendering/LightingDiagnostics.js';
import { simplify, CommandError } from './CommandRegistry.js';
import { describeLight } from '../world/Light.js';
import { TEXTS } from '../ui/texts.js';
import { SCENES, findScene, buildScene, SCENE_TIMES } from '../dev/scenes.js';
import { CHUNK_HEIGHT } from '../config.js';
import { usageError, COLOR_NAMES, parseColor, ON_WORDS, OFF_WORDS, SHADOW_WORDS } from './commandHelpers.js';

// ------------------------------------------------------------
// /demo swiatlo - zamknięty pokój z kolorowymi lampami przed
// graczem. Gracz trafia do środka.
// ------------------------------------------------------------

// Odkrywka: przed graczem (w stronę, w którą patrzy) długi wykop aż
// do y = 1. Patrząc wzdłuż niego widać na ścianach warstwy skał
// (granit, piaskowiec, wapień...) i czasem żyłę lepidolitu.

function buildRockDemo({ player, world }) {

    const p = player.pos;

    // Kierunek do przodu, wyrównany do osi X albo Z (proste ściany).

    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);

    const alongX = Math.abs(forwardX) >= Math.abs(forwardZ);

    const ax = alongX ? Math.sign(forwardX) : 0;
    const az = alongX ? 0 : Math.sign(forwardZ);

    const sx = az !== 0 ? 1 : 0;    // w poprzek
    const sz = ax !== 0 ? 1 : 0;

    const startX = Math.floor(p.x);
    const startZ = Math.floor(p.z);


    // Najwyższy teren w miejscu wykopu - tyle trzeba usunąć.

    const HALF = 4;

    let top = 1;

    for (let a = 3; a < 31; a++) {

        for (let s = -HALF; s <= HALF; s++) {

            const x = startX + ax * a + sx * s;
            const z = startZ + az * a + sz * s;

            world.ensureColumnLoaded(x, z);

            top = Math.max(top, world.getSurfaceY(x, z));

        }

    }


    // Długość tak, żeby zmieścić się w ~16 tys. bloków (w górach krótszy).

    const length = Math.max(8, Math.min(28, Math.floor(16384 / ((2 * HALF + 1) * top))));

    let changed = 0;

    for (let y = top; y >= 1; y--) {

        for (let a = 3; a < 3 + length; a++) {

            for (let s = -HALF; s <= HALF; s++) {

                if (world.clearBlock(startX + ax * a + sx * s, y, startZ + az * a + sz * s)) {
                    changed++;
                }

            }

        }

    }


    // Patrzymy wzdłuż wykopu, w dół.

    player.pitch = -0.6;
    player.updateCamera();

    return `Odkrywka przed tobą: ${2 * HALF + 1} x ${length} bloków, od y ${top} do 1 (${changed} bloków). ` +
        'Na ścianach widać warstwy skał. Uwaga: to zmienia świat (zapisze się).';

}


// /demo okno - ciemny pokój (kamień, podłoga z desek) z oknami od
// strony słońca i wąską szczeliną. Przez okna wpadają snopy światła,
// na podłodze leżą plamy słońca (cienie słońca i promienie - Shadows.js,
// LightShafts.js). Gdy słońce jest za wysoko, za nisko albo jest noc,
// zegar przestawia się na popołudnie. Gracz trafia do środka.

// Miejsce na budowlę oświetloną słońcem (dla /demo okno i /demo dom):
// pora dnia z niskim słońcem (gdy trzeba - zegar na popołudnie), osie
// (u - w stronę słońca, v - w poprzek), podłoga na najwyższym terenie
// pod budowlą (z kamiennym fundamentem), a przed nią pusto aż do 24
// bloków (drzewa i wzgórza nie zasłaniają słońca).
//   halfU, halfV - połowa budowli wzdłuż u i v (bloki)

function sunSite({ player, world, sky, time }, halfU, halfV) {

    let note = '';

    sky.refresh(time.days);

    const height = sky.celestial.sunHeight;

    if (height < 0.3 || height > 0.6) {

        // Popołudnie tego samego (albo następnego) dnia: słońce mniej
        // więcej 20-25 stopni nad horyzontem.

        let day = Math.floor(time.days);

        let best = null;

        for (let hour = 12; hour <= 20; hour += 0.125) {

            sky.refresh(day + hour / 24);

            const h = sky.celestial.sunHeight;

            if (h > 0.15 && (best === null || Math.abs(h - 0.42) < Math.abs(best.h - 0.42))) {
                best = { hour, h };
            }

        }

        if (best) {

            if (day + best.hour / 24 < time.days) {
                day++;
            }

            time.days = day + best.hour / 24 + 1e-7;

            note = ` Ustawiono godzinę ${time.formatClock()} - słońce nisko, długie snopy światła.`;

        }

        sky.refresh(time.days);

    }


    // Ściana z oknami - od strony słońca (wzdłuż osi X albo Z).

    const sun = sky.celestial.sunDirection;

    const alongX = Math.abs(sun.x) >= Math.abs(sun.z);

    const ux = alongX ? (Math.sign(sun.x) || 1) : 0;     // "u" - w stronę słońca
    const uz = alongX ? 0 : (Math.sign(sun.z) || 1);

    const vx = uz;                                        // "v" - w poprzek
    const vz = ux;


    // Budowla przed graczem (w stronę, w którą patrzy).

    const p = player.pos;

    const reach = Math.max(halfU, halfV) + 5;

    const centerX = Math.floor(p.x - Math.sin(player.yaw) * reach);
    const centerZ = Math.floor(p.z - Math.cos(player.yaw) * reach);

    const at = (u, v) => [centerX + ux * u + vx * v, centerZ + uz * u + vz * v];

    let floor = 1;

    for (let u = -halfU; u <= halfU; u++) {

        for (let v = -halfV; v <= halfV; v++) {

            const [x, z] = at(u, v);

            world.ensureColumnLoaded(x, z);

            floor = Math.max(floor, world.getSurfaceY(x, z));

        }

    }

    floor = Math.min(CHUNK_HEIGHT - 24, floor);

    const put = (u, y, v, type) => {

        const [x, z] = at(u, v);

        if (type === null) world.clearBlock(x, floor + y, z);
        else world.setBlock(x, floor + y, z, type);

    };


    // Przed oknami pusto.

    for (let u = halfU + 1; u <= halfU + 24; u++) {

        for (let v = -halfV - 3; v <= halfV + 3; v++) {

            const [x, z] = at(u, v);

            world.ensureColumnLoaded(x, z);

            for (let y = 1; y <= 20; y++) {
                put(u, y, v, null);
            }

        }

    }


    // Fundament.

    for (let u = -halfU; u <= halfU; u++) {

        for (let v = -halfV; v <= halfV; v++) {

            const [x, z] = at(u, v);

            for (let y = floor - 1; y > 0 && !world.isSolid(x, y, z); y--) {
                world.setBlock(x, y, z, 'stone');
            }

        }

    }


    // Gracz w punkcie (u, v) budowli, patrzy na (lookU, lookV).

    const place = (u, v, lookU, lookV, pitch = -0.18) => {

        p.set(
            centerX + ux * u + vx * v + 0.5,
            floor + 1,
            centerZ + uz * u + vz * v + 0.5
        );

        const lookX = ux * (lookU - u) + vx * (lookV - v);
        const lookZ = uz * (lookU - u) + vz * (lookV - v);

        player.yaw = Math.atan2(-lookX, -lookZ);
        player.pitch = pitch;

        player.vel.set(0, 0, 0);

        player.updateCamera();

    };

    return { put, place, floor, note };

}


// /demo okno - ciemny pokój (kamień, podłoga z desek) z oknami od
// strony słońca i wąską szczeliną. Przez okna wpadają snopy światła,
// na podłodze leżą plamy słońca (cienie słońca i promienie - Shadows.js,
// LightShafts.js). Gracz trafia do środka.

function buildWindowDemo(ctx) {

    const SIZE = 5;

    const { put, place, note } = sunSite(ctx, SIZE, SIZE);


    // Ściany, podłoga i dach. Wnętrze: 9 x 5 x 9 bloków.

    for (let u = -SIZE; u <= SIZE; u++) {

        for (let v = -SIZE; v <= SIZE; v++) {

            for (let y = 0; y <= 6; y++) {

                const wall = Math.abs(u) === SIZE || Math.abs(v) === SIZE || y === 6;

                put(u, y, v, y === 0 ? 'oak_planks' : wall ? 'stone' : null);

            }

        }

    }


    // Okna od strony słońca i wąska szczelina (jak drzwi) między nimi.

    for (const v of [-3, -2, 2, 3]) {

        put(SIZE, 2, v, null);
        put(SIZE, 3, v, null);

    }

    for (let y = 1; y <= 4; y++) {
        put(SIZE, y, 0, null);
    }

    // Gracz w głębi pokoju, patrzy w stronę okien (trochę z boku,
    // żeby snopy było widać).

    place(-SIZE + 1.5, 3.5, SIZE - 1, -1.5);

    return 'Zbudowano ciemny pokój z oknami od strony słońca - jesteś w środku.' + note + shadowsNote(ctx.game);

}


// /demo dom - cztery pokoje obok siebie, każdy z innego budulca
// (biały tynk, terakota, polerowany kamień, ciemne deski), każdy
// z oknem od strony słońca, połączone przejściami. Widać, jak budulec
// zmienia światło odbite (BounceLight.js): biały pokój jest jasny,
// z ciemnych desek - mroczny, z terakoty - ciepły.

const HOUSE_ROOMS = [
    ['lime_plaster', 'tynk wapienny'],
    ['terracotta', 'terakota'],
    ['polished_stone', 'polerowany kamień'],
    ['dark_planks', 'ciemne deski']
];

function buildHouseDemo(ctx) {

    const HALF_U = 4;           // pokój 7 x 7 wewnątrz (ściany co 8 bloków)
    const ROOM = 8;

    const halfV = (HOUSE_ROOMS.length * ROOM) / 2;

    const { put, place, note } = sunSite(ctx, HALF_U, halfV);

    HOUSE_ROOMS.forEach(([material], room) => {

        const v0 = -halfV + room * ROOM;

        for (let u = -HALF_U; u <= HALF_U; u++) {

            for (let v = v0; v <= v0 + ROOM; v++) {

                for (let y = 0; y <= 5; y++) {

                    const wall = Math.abs(u) === HALF_U || v === v0 || v === v0 + ROOM || y === 0 || y === 5;

                    // Ściany między pokojami stawia pokój po lewej (ten
                    // po prawej ich nie nadpisuje).

                    if (v === v0 && room > 0) {
                        continue;
                    }

                    put(u, y, v, wall ? material : null);

                }

            }

        }


        // Okno 2 x 2 od strony słońca.

        for (const v of [v0 + 3, v0 + 4]) {

            put(HALF_U, 2, v, null);
            put(HALF_U, 3, v, null);

        }


        // Przejście do następnego pokoju (2 bloki wysokości).

        if (room < HOUSE_ROOMS.length - 1) {

            put(-1, 1, v0 + ROOM, null);
            put(-1, 2, v0 + ROOM, null);

        }

    });


    // Gracz w pierwszym (białym) pokoju, w głębi, patrzy na okno.

    place(-HALF_U + 1.5, -halfV + 6.5, HALF_U - 1, -halfV + 3.5);

    return `Zbudowano dom z czterech pokoi: ${HOUSE_ROOMS.map(([, name]) => name).join(', ')} - każdy z oknem od strony słońca, ` +
        'przejścia między nimi są w ścianach. Jesteś w białym pokoju - porównaj, jak jasne są pozostałe.' + note +
        shadowsNote(ctx.game);

}


function shadowsNote(game) {

    if (game.settings.get('shadows') === 0 || game.settings.get('potato')) {
        return ' Cienie słońca są wyłączone (/cienie dalekie). Odbicia otoczenia mają osobne ustawienie.';
    }

    const natural = game.settings.get('lightingLook') === 'natural';
    if (!game.settings.get(natural ? 'surfaceBounce' : 'bounceLight')) {
        return ' Odbicia otoczenia są wyłączone — włącz: /swiatlo odbite wl.';
    }

    return '';

}


function buildLightDemo({ player, world }) {

    const p = player.pos;

    // Pokój 15 x 7 x 11 (z ścianami), kilka bloków przed graczem
    // (w stronę, w którą patrzy).

    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);

    const centerX = Math.floor(p.x + forwardX * 10);
    const centerZ = Math.floor(p.z + forwardZ * 10);

    const floor = Math.max(1, Math.min(CHUNK_HEIGHT - 8, Math.floor(p.y)));


    for (let x = -7; x <= 7; x++) {

        for (let y = 0; y <= 6; y++) {

            for (let z = -5; z <= 5; z++) {

                const wall = Math.abs(x) === 7 || Math.abs(z) === 5 || y === 0 || y === 6;

                if (wall) world.setBlock(centerX + x, floor + y, centerZ + z, 'stone');
                else world.clearBlock(centerX + x, floor + y, centerZ + z);

            }

        }

    }


    // Lampy: czerwona i niebieska naprzeciw siebie (fiolet pośrodku),
    // zielona i fioletowa na drugiej osi, zwykła w rogu, filar na
    // środku rzuca kolorowe cienie.

    const put = (x, y, z, type) => world.setBlock(centerX + x, floor + y, centerZ + z, type);

    put(-7, 3, 0, 'lamp_red');
    put(7, 3, 0, 'lamp_blue');
    put(0, 3, -5, 'lamp_green');
    put(0, 3, 5, 'lamp_purple');
    put(-6, 1, -4, 'lamp');

    for (let y = 1; y <= 5; y++) {
        put(0, y, 0, 'lepidolite');
    }


    p.set(centerX + 0.5 + 4, floor + 1, centerZ + 0.5 + 3);

    player.vel.set(0, 0, 0);

    player.updateCamera();

    return 'Zbudowano pokój z lampami: czerwona i niebieska (pośrodku fiolet), ' +
        'zielona, fioletowa i zwykła. Jesteś w środku.';

}


// Pora dnia ze scen (SCENE_TIMES) - tego samego dnia.

export function setSceneTime(time, name) {

    time.days = Math.floor(time.days) + SCENE_TIMES[name] + 1e-7;

}

export const LIGHT_COMMANDS = [

    // ========================================================
    // ŚWIATŁO
    // ========================================================

    {
        name: 'swiatlo',
        aliases: ['light'],
        usage: '/swiatlo | /swiatlo paleta <naturalna | poprzednia> | /swiatlo widok <full | albedo | normals | sunVisibility | skyAccess | ao | sun | moon | sky | bounce | local | emission | grayscale | transmission | specular> | /swiatlo zrodlo <sun | moon | sky | bounce | local | emission | transmission | specular> <wl | wyl> | /swiatlo chmury <0–100> | /swiatlo reset | /swiatlo model <atmosfera | klasyczne> | /swiatlo dynamiczne <wl | wyl> | /swiatlo odbite <wl | wyl>',
        description: 'Pomiar źródeł, odbić i materiałów; paleta, diagnostyka liści oraz światło dynamiczne.',

        run(args, { game, world }) {

            const action = simplify(args[0] ?? '');
            if (action === 'paleta') {
                const choice = { naturalna: 'natural', natural: 'natural', poprzednia: 'baseline', baseline: 'baseline' }[simplify(args[1] ?? '')];
                if (args.length !== 2 || !choice) throw usageError(this);
                game.settings.set('lightingLook', choice);
                return TEXTS.lightingLook(choice);
            }
            if (action === 'widok') {
                const name = LIGHTING_VIEWS.find(view => simplify(view) === simplify(args[1] ?? ''));
                if (args.length !== 2 || !name) throw usageError(this);
                setLightingView(name);
                return `Widok światła: ${name}. Powrót: /swiatlo reset.`;
            }
            if (action === 'zrodlo') {
                const source = simplify(args[1] ?? '');
                const value = simplify(args[2] ?? '');
                if (args.length !== 3 || !['sun', 'moon', 'sky', 'bounce', 'local', 'emission', 'transmission', 'specular'].includes(source)
                    || ![...ON_WORDS, ...OFF_WORDS].includes(value)) throw usageError(this);
                const enabled = ON_WORDS.includes(value);
                setLightingComponent(source, enabled);
                return `Źródło ${source}: ${enabled ? 'włączone' : 'wyłączone'} (diagnostyka powierzchni).`;
            }
            if (action === 'chmury') {
                const value = Number(args[1]);
                if (args.length !== 2 || !Number.isFinite(value) || value < 0 || value > 100) throw usageError(this);
                game.settings.set('cloudCover', value);
                return `${TEXTS.cloudCover(game.settings.get('cloudCover'))}. Profil oświetlenia, bez symulacji pogody.`;
            }
            if (action === 'reset') {
                if (args.length !== 1) throw usageError(this);
                resetLightingDiagnostics();
                return 'Pełny obraz i wszystkie źródła światła przywrócone.';
            }

            if (simplify(args[0] ?? '') === 'model') {
                const choices = { swiat: 'world', atmosfera: 'world', domyslny: 'world', klasyczne: 'classic', klasyczny: 'classic' };
                const choice = choices[simplify(args[1] ?? '')];
                if (args.length !== 2 || !choice) throw usageError(this);
                // Te modele są odniesieniem sprzed naturalnej palety.
                // Jawna komenda ma rzeczywiście przełączyć wygląd świata.
                game.settings.set('lightingLook', 'baseline');
                game.settings.set('lightingModel', choice);
                return `${TEXTS.lightingModel(choice)}; ${TEXTS.lightingLook('baseline')}. Powrót: /swiatlo paleta naturalna.`;
            }

            if (args[0] !== undefined && simplify(args[0]) === 'odbite') {

                const mode = simplify(args[1] ?? '');
                const key = game.settings.get('lightingLook') === 'natural' ? 'surfaceBounce' : 'bounceLight';

                const on =
                    ON_WORDS.includes(mode) ? true :
                    OFF_WORDS.includes(mode) ? false :
                    !game.settings.get(key);

                game.settings.set(key, on);

                return `${TEXTS[key](on)}${on && (game.settings.get('potato') || game.settings.get('lightingMaterials') === 'basic')
                    ? ' (włącz Standardowe światło materiałów w zaawansowanych ustawieniach obrazu)' : ''}`;

            }

            if (args[0] !== undefined) {

                if (simplify(args[0]) !== 'dynamiczne') {
                    throw usageError(this);
                }

                const mode = simplify(args[1] ?? '');

                const on =
                    ['wl', 'on', 'tak'].includes(mode) ? true :
                    ['wyl', 'off', 'nie'].includes(mode) ? false :
                    !game.settings.get('dynamicLight');

                game.settings.set('dynamicLight', on);

                return `Dynamiczne światło (lampa w ręce, meteoryty, kule): ${on ? 'włączone' : 'wyłączone'}.`;

            }

            const camera = game.camera.position;

            let text = 'Przy głowie: ' + describeLight(world.getLight(
                Math.floor(camera.x), Math.floor(camera.y), Math.floor(camera.z)
            ));

            text += ` | ${TEXTS.lightingLook(game.settings.get('lightingLook'))} | model: ${game.sky.atmosphere ? 'atmosferyczny' : 'klasyczny'}`;
            if (game.sky.atmosphere) {
                const sample = game.sky.atmosphere;
                text += ` | wysokość Słońca: ${sample.altitude.toFixed(1)}°` +
                    ` | widoczna tarcza: ${(sample.discVisibility * 100).toFixed(1)}%` +
                    ` | kierunek wiązki: ${(Math.asin(sample.lightHeight) * 180 / Math.PI).toFixed(1)}°` +
                    ` | droga w atmosferze: x${sample.airMass.toFixed(1)}` +
                    ` | bezpośrednie RGB: ${sample.direct.map(v => v.toFixed(2)).join(' / ')}`;
            }

            // Końcowe liniowe odbicie wraz z aktualną energią źródeł.

            if (game.bounce?.enabled) {

                const bounce = game.bounce.sample(camera.x, camera.y, camera.z);

                text += `, odbite od ścian: ${bounce.map((value) => value.toFixed(2)).join(' / ')} (R / G / B)`;

            }


            const hit = game.currentHit;

            if (hit && hit.hit) {

                const x = hit.block.x + hit.normal.x;
                const y = hit.block.y + hit.normal.y;
                const z = hit.block.z + hit.normal.z;

                text += ` | przy wskazanej ścianie: ${describeLight(world.getLight(x, y, z))}`;

            }

            return text;

        },

        complete(args) {
            if (args.length === 1) return ['paleta', 'widok', 'zrodlo', 'chmury', 'reset', 'model', 'dynamiczne', 'odbite'];
            if (args.length === 2 && simplify(args[0]) === 'paleta') return ['naturalna', 'poprzednia'];
            if (args.length === 2 && simplify(args[0]) === 'widok') return LIGHTING_VIEWS;
            if (args.length === 2 && simplify(args[0]) === 'zrodlo') return ['sun', 'moon', 'sky', 'bounce', 'local', 'emission', 'transmission', 'specular'];
            if (args.length === 2 && simplify(args[0]) === 'model') return ['atmosfera', 'klasyczne'];
            if (args.length === 2) return ['wl', 'wyl'];
            return [];
        }
    },


    {
        name: 'cienie',
        aliases: ['shadows'],
        usage: '/cienie | /cienie <wyl | zwykle | dokladne | dalekie> | /cienie promienie <wl | wyl>',
        description: 'Cienie słońca i księżyca (pikselowe) i promienie światła w powietrzu: stan i włączanie.',

        run(args, { game }) {

            const settings = game.settings;

            const word = simplify(args[0] ?? '');


            if (word === 'promienie') {

                const mode = simplify(args[1] ?? '');

                const on =
                    ON_WORDS.includes(mode) ? true :
                    OFF_WORDS.includes(mode) ? false :
                    !settings.get('lightShafts');

                settings.set('lightShafts', on);

                return `${TEXTS.lightShafts(on)}${on && settings.get('shadows') === 0 ? ' (działają tylko z cieniami słońca: /cienie dokladne)' : ''}`;

            }


            if (word !== '') {

                const value = SHADOW_WORDS[word] ?? Number(word);

                if (![0, 1, 2, 3].includes(value)) {
                    throw usageError(this);
                }

                settings.set('shadows', value);

            }


            const shadows = game.shadows;

            const quality = settings.get('shadows');

            let text = `${TEXTS.shadows(quality)}, ${TEXTS.lightShafts(settings.get('lightShafts')).replace(/\.$/, '')}.`;

            if (!shadows.supported) {
                return `${text} Ta przeglądarka nie ma WebGL2 - cienie nie zadziałają.`;
            }

            if (settings.get('potato')) {
                return `${text} W trybie ziemniaka cieni nie ma (/ziemniak wyl).`;
            }

            if (!shadows.enabled) {
                return text;
            }

            const degrees = Math.round(Math.asin(Math.max(-1, Math.min(1, shadows.direction.y))) * 180 / Math.PI);

            text += ` Cienie rzuca ${shadows.light === 'sun' ? 'słońce' : 'księżyc'} (${degrees}° nad horyzontem, ` +
                `siła ${Math.round(shadows.strength * 100)}%), mapa ${shadows.size} x ${shadows.size} - ${shadows.radius} bloki wokół gracza, ` +
                `przerysowana ${shadows.draws} ${shadows.draws === 1 ? 'raz' : 'razy'}` +
                (shadows.hasFar ? `; daleka mapa: ${shadows.farRadius} bloków wokół gracza (z dalekim terenem), przerysowana ${shadows.farDraws} ${shadows.farDraws === 1 ? 'raz' : 'razy'}` : '') +
                `. Słońce na graczu: ${Math.round(game.sunVisibility * 100)}%.`;

            if (shadows.strength === 0) {
                text += ' Teraz słońce i księżyc są za nisko (albo nie świecą) - cieni nie widać.';
            }

            return text;

        },

        complete(args) {

            if (args.length === 1) return ['wyl', 'zwykle', 'dokladne', 'dalekie', 'promienie'];
            if (args.length === 2 && simplify(args[0]) === 'promienie') return ['wl', 'wyl'];

            return [];

        }
    },


    {
        name: 'demo',
        aliases: [],
        usage: '/demo swiatlo | /demo okno | /demo dom | /demo kula [kolor | usun] | /demo skaly',
        description: 'Sceny do sprawdzania nowości: pokój z kolorowymi lampami, ciemny pokój z oknami od strony słońca ' +
            '(snopy światła i cienie), dom z pokoi z różnego budulca (światło odbite), krążąca kula dynamicznego światła, ' +
            'odkrywka (wykop do dna świata - widać warstwy skał).',

        run(args, ctx) {

            const what = simplify(args[0] ?? '');


            if (what === 'swiatlo') {
                return buildLightDemo(ctx);
            }


            if (['okno', 'okna', 'slonce'].includes(what)) {
                return buildWindowDemo(ctx);
            }


            if (['dom', 'pokoje', 'budulec'].includes(what)) {
                return buildHouseDemo(ctx);
            }


            if (['skaly', 'odkrywka'].includes(what)) {
                return buildRockDemo(ctx);
            }


            if (what === 'kula') {

                if (simplify(args[1] ?? '') === 'usun') {

                    ctx.game.removeOrbs();

                    return 'Usunięto kule światła.';

                }

                const color = args[1] === undefined ? new THREE.Color('#9fd0ff') : parseColor(args[1]);

                if (!color) {
                    throw new CommandError('Podaj kolor kuli, np. /demo kula zielony');
                }

                const srgb = {};

                color.getRGB(srgb, THREE.SRGBColorSpace);

                ctx.game.addOrb([srgb.r, srgb.g, srgb.b]);

                return 'Kula światła krąży przed tobą przez minutę (światło nie przechodzi przez ściany). ' +
                    (ctx.game.settings.get('dynamicLight') ? '' : 'Uwaga: dynamiczne światło jest wyłączone (/swiatlo dynamiczne wl).');

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['swiatlo', 'okno', 'dom', 'kula', 'skaly'];
            if (args.length === 2 && simplify(args[0]) === 'kula') return [...Object.keys(COLOR_NAMES), 'usun'];

            return [];

        }
    },

    // ========================================================
    // SCENY TESTOWE (tryb programisty - src/dev/scenes.js)
    // ========================================================

    {
        name: 'scena',
        aliases: ['scene', 'sceny'],
        usage: '/scena lista | /scena <nazwa> | /scena czas <swit | poludnie | zachod | noc | stop | start>',
        description: 'Tryb programisty: gotowe sceny do testów (światło, lampy, okno, dom, basen, rośliny, krzaki, drzewa, skały) - ' +
            'na placu testowym zawsze w tym samym miejscu; pora dnia jednym słowem i zatrzymanie czasu.',

        run(args, ctx) {

            const { game, time } = ctx;

            const word = simplify(args[0] ?? '');


            if (word === 'czas') {

                const what = simplify(args[1] ?? '');

                const times = { swit: 'dawn', poludnie: 'noon', zachod: 'dusk', noc: 'night' };

                if (what in times) {
                    setSceneTime(time, times[what]);
                    return `Pora dnia: ${TEXTS.sceneTimes[times[what]]}${time.speed === 0 ? ' (czas stoi)' : ''}.`;
                }

                if (['stop', 'start'].includes(what)) {
                    time.speed = what === 'stop' ? 0 : 1;
                    return TEXTS.sceneFreeze(time.speed === 0) + '.';
                }

                throw usageError(this);

            }


            if (!word || word === 'lista') {

                return 'Sceny testowe (/scena <nazwa>):\n' +
                    SCENES.map((scene) => `${scene.id} - ${scene.name}: ${scene.description}`).join('\n');

            }


            if (game.mode !== 'developer') {
                throw new CommandError('Sceny testowe są w trybie programisty: /tryb programista.');
            }

            const scene = findScene(word);

            if (!scene) {
                throw new CommandError(`Nie ma sceny "${args[0]}". Do wyboru: ${SCENES.map((s) => s.id).join(', ')}`);
            }

            const text = buildScene(scene, ctx, (name, commandArgs) =>
                ctx.commands.find(name).run(commandArgs, ctx));

            return `${TEXTS.sceneBuilt(scene.name)} ${text}`.trim();

        },

        complete(args) {

            if (args.length === 1) return ['lista', 'czas', ...SCENES.map((scene) => scene.id)];
            if (args.length === 2 && simplify(args[0]) === 'czas') return ['swit', 'poludnie', 'zachod', 'noc', 'stop', 'start'];

            return [];

        }
    }

];
