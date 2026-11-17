// ------------------------------------------------------------
// KOMENDY: POGODA (1.11.0)
//
// Pogoda liczy się sama z czasu gry i ziarna świata
// (src/weather/WeatherField.js). Komenda /pogoda pokazuje ją, podaje
// prognozę, szuka frontów i - do sprawdzania - ustawia wybraną pogodę
// nad graczem albo każe jej nadciągnąć. Od 1.13.0 także piorun na
// zawołanie i grad, od 1.14.0 temperatura, śnieg, pokrywa śnieżna i szron.
// ------------------------------------------------------------

import { CommandError, simplify } from './CommandRegistry.js';
import { parseNumber, usageError } from './commandHelpers.js';
import { SYSTEM_NAMES } from '../weather/WeatherField.js';
import { THUNDER } from '../weather/Thunderstorm.js';
import { forecastLines, sideName, tempText, weatherStatus } from '../weather/weatherText.js';

// Słowo z komendy -> rodzaj układu pogodowego.
const KINDS = {
    pogodnie: 'wyz', wyz: 'wyz',
    pochmurno: 'niz', niz: 'niz',
    frontcieply: 'front_cieply', cieply: 'front_cieply',
    frontchlodny: 'front_chlodny', chlodny: 'front_chlodny',
    burza: 'burze', burze: 'burze',
    przelotne: 'przelotne',
    pierzaste: 'pierzaste'
};

const KIND_WORDS = ['pogodnie', 'pochmurno', 'front-cieply', 'front-chlodny', 'burza', 'przelotne', 'pierzaste'];

// Ile bloków pod wiatr zaczyna układ, który ma "nadciągnąć": tyle,
// żeby najpierw było widać go na horyzoncie.
const ARRIVAL = { front_cieply: 4300, front_chlodny: 2600, burze: 2400, niz: 4200, wyz: 5200, przelotne: 3300, pierzaste: 3900 };

const kindOf = (word) => KINDS[simplify(word ?? '').replace(/[-_ ]/g, '')] ?? null;


export const WEATHER_COMMANDS = [

    {
        name: 'pogoda',
        aliases: ['weather'],
        usage: '/pogoda | prognoza | ustaw <rodzaj> [nadciaga] | znajdz <rodzaj> [tp] | auto | deszcz [0-100] | sucho | mgla [0-100] | tecza [wl|wyl] | piorun [odległość] [chmura] | grad [0-100] | temperatura <stopnie> | snieg [0-100] | pokrywa [0-100] | szron [0-100]',
        description: 'Pogoda nad tobą, prognoza, szukanie frontów i burz; do sprawdzania - ustawienie pogody ' +
            `(rodzaje: ${KIND_WORDS.join(', ')}). Mapa pogody: /mapa pogoda.`,

        run(args, { game, player, world }) {

            const weather = game?.weather;

            if (!weather) {
                throw new CommandError('Pogoda jest dostępna po wejściu do świata.');
            }

            const x = player.pos.x;
            const z = player.pos.z;
            const days = game.time.days;
            const word = simplify(args[0] ?? '');

            if (!args.length) {
                return weatherStatus(weather, x, z, days, player.pos.y) +
                    (weather.field.forced.length ? ' Pogoda ustawiona komendą - powrót: /pogoda auto.' : '');
            }

            if (word === 'prognoza' && args.length === 1) {
                return `Prognoza dla tego miejsca:\n${forecastLines(weather.field, x, z, days, 1.5, player.pos.y).join('\n')}`;
            }

            if (word === 'auto' && args.length === 1) {

                weather.field.clearForced();
                weather.reset();
                weather.fogOverride = null;
                weather.rainbowOverride = null;
                weather.hailOverride = null;
                weather.coverOverride = null;
                weather.frostOverride = null;
                weather.field.tempOverride = null;
                game.rainOverride = null;

                return 'Pogoda znów liczy się sama.';

            }

            if (word === 'ustaw' && args.length >= 2 && args.length <= 3) {

                const kind = kindOf(args[1]);
                const arrives = args[2] !== undefined && ['nadciaga', 'daleko'].includes(simplify(args[2]));

                if (!kind || (args[2] !== undefined && !arrives)) {
                    throw new CommandError(`Rodzaje pogody: ${KIND_WORDS.join(', ')}. Na końcu można dopisać: nadciaga.`);
                }

                weather.field.clearForced();
                weather.field.force(kind, x, z, days, arrives ? { ahead: ARRIVAL[kind] } : { stay: true });
                weather.reset();
                game.rainOverride = null;

                return arrives
                    ? `Nadciąga ${SYSTEM_NAMES[kind]} - patrz na ${sideName(weather.field.flow.angle + Math.PI)}. Powrót do zwykłej pogody: /pogoda auto.`
                    : `Ustawiono: ${SYSTEM_NAMES[kind]} (stoi nad tym miejscem). Powrót do zwykłej pogody: /pogoda auto.`;

            }

            if (word === 'znajdz' && args.length >= 2 && args.length <= 3) {

                const kind = kindOf(args[1]);
                const teleport = args[2] !== undefined && simplify(args[2]) === 'tp';

                if (!kind || (args[2] !== undefined && !teleport)) {
                    throw new CommandError(`Rodzaje pogody: ${KIND_WORDS.join(', ')}.`);
                }

                const found = weather.field.nearest(x, z, days, kind);

                if (!found) {
                    return `W promieniu kilkunastu tysięcy bloków teraz nie ma: ${SYSTEM_NAMES[kind]}.`;
                }

                const system = found.system;

                if (teleport) {

                    // Trochę przed układem, na jego drodze - widać, jak nadciąga.

                    const lead = ['front_cieply', 'front_chlodny', 'burze'].includes(kind) ? 1500 : 0;
                    const tx = Math.round(system.x + system.dx * lead);
                    const tz = Math.round(system.z + system.dz * lead);

                    world.ensureColumnLoaded(tx, tz);

                    player.pos.set(tx + 0.5, world.getSurfaceY(tx, tz), tz + 0.5);
                    player.vel.set(0, 0, 0);
                    player.yaw = Math.atan2(system.dx, system.dz);
                    player.updateCamera();
                    weather.reset();

                    return `Przeniesiono: ${SYSTEM_NAMES[kind]} (${tx} ${tz}).`;

                }

                const motion = system.speed > 0.05
                    ? `sunie na ${sideName(Math.atan2(system.dz, system.dx))} z prędkością ${system.speed.toFixed(1).replace('.', ',')} bl./s`
                    : 'stoi w miejscu';

                return `Najbliżej: ${SYSTEM_NAMES[kind]}, ${Math.round(found.distance)} bloków na ${sideName(found.angle)} ` +
                    `(${Math.round(system.x)} ${Math.round(system.z)}), ${motion}. Teleport: /pogoda znajdz ${args[1]} tp`;

            }

            if (word === 'sucho' && args.length === 1) {

                game.rainOverride = 0;

                return 'Deszcz wyłączony do odwołania (/pogoda auto).';

            }

            if (word === 'deszcz' && args.length <= 2) {

                const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'natężenie deszczu');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Natężenie deszczu: od 0 do 100.');
                }

                game.rainOverride = amount / 100;

                return `Deszcz: ${amount}% do odwołania (/pogoda auto).`;

            }

            if (word === 'mgla' && args.length <= 2) {

                const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'gęstość mgły');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Gęstość mgły: od 0 do 100.');
                }

                weather.fogOverride = amount / 100;

                return `Mgła: ${amount}% do odwołania (/pogoda auto).`;

            }

            if (word === 'tecza' && args.length <= 2) {

                const off = args[1] !== undefined && ['wyl', 'off', '0'].includes(simplify(args[1]));

                if (args[1] !== undefined && !off && !['wl', 'on', '1'].includes(simplify(args[1]))) {
                    throw usageError(this);
                }

                weather.rainbowOverride = off ? 0 : 1;

                return off
                    ? 'Tęcza wyłączona do odwołania (/pogoda auto).'
                    : 'Tęcza włączona - stań tyłem do słońca (widać ją, gdy słońce jest nisko). Powrót: /pogoda auto.';

            }

            if (word === 'piorun' && args.length <= 3) {

                // Wyładowanie przed graczem: domyślnie piorun w ziemię
                // 150 bloków dalej; "chmura" - błysk w chmurze.

                let distance = 150;
                let ground = true;

                for (const arg of args.slice(1)) {

                    if (['chmura', 'wchmurze'].includes(simplify(arg).replace(/[-_ ]/g, ''))) {
                        ground = false;
                    }
                    else {
                        distance = parseNumber(arg, 'odległość pioruna');
                    }

                }

                if (distance < 0 || distance > 6000) {
                    throw new CommandError('Odległość pioruna: od 0 do 6000 bloków.');
                }

                if (!game.thunder) {
                    throw new CommandError('Burza jest dostępna po wejściu do świata.');
                }

                const look = game.camera.getWorldDirection(game.camera.position.clone());
                const flat = Math.hypot(look.x, look.z) || 1;

                game.thunder.force(x + look.x / flat * distance, z + look.z / flat * distance, { ground });

                const seconds = distance / THUNDER.soundSpeed;

                return `${ground ? 'Piorun uderzy w ziemię' : 'Błyśnie w chmurze'} ${Math.round(distance)} bloków przed tobą; ` +
                    (distance < THUNDER.audible
                        ? `grzmot dojdzie po ${seconds < 1 ? 'niecałej sekundzie' : `ok. ${Math.round(seconds)} s`}.`
                        : 'grzmotu z tej odległości nie słychać.');

            }

            if (['temperatura', 'temp'].includes(word) && args.length === 2) {

                const degrees = parseNumber(args[1], 'temperatura');

                if (degrees < -40 || degrees > 40) {
                    throw new CommandError('Temperatura: od -40 do 40 stopni.');
                }

                // Ta sama temperatura wszędzie (na poziomie morza; w górach
                // dalej jest chłodniej) - do odwołania.
                weather.field.tempOverride = degrees;
                weather.reset();

                return `Temperatura: ${tempText(degrees)} na poziomie morza do odwołania (/pogoda auto). ` +
                    (degrees < 0 ? 'Opad będzie śniegiem.' : degrees < 2 ? 'Opad będzie deszczem ze śniegiem.' : 'Opad będzie deszczem.');

            }

            if (word === 'snieg' && args.length <= 2) {

                const amount = args[1] === undefined ? 60 : parseNumber(args[1], 'natężenie śniegu');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Natężenie śniegu: od 0 do 100.');
                }

                game.rainOverride = amount / 100;

                // Żeby padał śnieg, a nie deszcz, musi być mróz.
                let note = '';

                if (weather.temperature > -1 && amount > 0) {
                    weather.field.tempOverride = -3;
                    weather.reset();
                    note = ` Temperatura ustawiona na ${tempText(-3)}.`;
                }

                return `Śnieg: ${amount}% do odwołania (/pogoda auto).${note} Ziemia bieleje, póki pada.`;

            }

            if (word === 'pokrywa' && args.length <= 2) {

                const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'pokrywa śnieżna');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Pokrywa śnieżna: od 0 do 100.');
                }

                weather.coverOverride = amount / 100;

                return `Pokrywa śnieżna: ${amount}% wszędzie, do odwołania (/pogoda auto).`;

            }

            if (word === 'szron' && args.length <= 2) {

                const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'szron');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Szron: od 0 do 100.');
                }

                weather.frostOverride = amount / 100;

                return `Szron: ${amount}% do odwołania (/pogoda auto). Widać go tam, gdzie nie leży śnieg.`;

            }

            if (word === 'grad' && args.length <= 2) {

                const amount = args[1] === undefined ? 100 : parseNumber(args[1], 'natężenie gradu');

                if (amount < 0 || amount > 100) {
                    throw new CommandError('Natężenie gradu: od 0 do 100.');
                }

                weather.hailOverride = amount / 100;

                return `Grad: ${amount}% do odwołania (/pogoda auto).`;

            }

            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) return ['prognoza', 'ustaw', 'znajdz', 'auto', 'deszcz', 'sucho', 'mgla', 'tecza', 'piorun', 'grad', 'temperatura', 'snieg', 'pokrywa', 'szron'];

            const word = simplify(args[0]);

            if (args.length === 2 && ['ustaw', 'znajdz'].includes(word)) return KIND_WORDS;
            if (args.length === 2 && word === 'tecza') return ['wl', 'wyl'];
            if (args.length >= 2 && args.length <= 3 && word === 'piorun') return ['chmura'];
            if (args.length === 3) return word === 'ustaw' ? ['nadciaga'] : word === 'znajdz' ? ['tp'] : [];

            return [];

        }
    }

];
