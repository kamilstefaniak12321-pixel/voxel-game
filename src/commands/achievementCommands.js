// ------------------------------------------------------------
// KOMENDY GRY - OSIĄGNIĘCIA I SEKRET
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { CommandError, simplify } from './CommandRegistry.js';
import { SKYFALL_START, SPACE_MAX_ALTITUDE, SPACE_FULL } from '../config.js';
import { skyfallSpeed } from '../player/Player.js';
import { TIER_ORDER, ACHIEVEMENTS, TIERS } from '../achievements/list.js';
import { findAchievement } from '../achievements/AchievementBook.js';
import { usageError, parseNumber } from './commandHelpers.js';

// Rangi osiągnięć po polsku (/osiagniecia pokaz).

const TIER_WORDS = {
    zwykle: 'common',
    rzadkie: 'rare',
    'bardzo-rzadkie': 'epic',
    legendarne: 'legendary'
};


// Ile mniej więcej trwa spadanie z kosmosu z wysokości height
// (krok co 1/20 s, jak Player.updateSkyfall - do poziomu morza).

function fallSeconds(height) {

    let y = height;
    let speed = 0;
    let time = 0;

    const dt = 0.05;

    while (y > 70 && time < 600) {

        const terminal = skyfallSpeed(y);

        speed = Math.min(speed + (30 + terminal * 0.5) * dt, terminal);

        y -= speed * dt;

        time += dt;

    }

    return time;

}

export const ACHIEVEMENT_COMMANDS = [

    // ========================================================
    // OSIĄGNIĘCIA (src/achievements/)
    // ========================================================

    {
        name: 'osiagniecia',
        aliases: ['achievements', 'osiagniecie'],
        usage: '/osiagniecia [ksiega | pokaz <ranga|id> | daj <id> | zabierz <id|wszystkie>]   (rangi: zwykle, rzadkie, bardzo-rzadkie, legendarne)',
        description: 'Osiągnięcia: lista, księga (L), test powiadomienia, przyznanie i zabranie (do testów).',

        run(args, { game }) {

            const book = game.achievements;

            if (!book) {
                throw new CommandError('Księga osiągnięć jest niedostępna.');
            }

            const action = simplify(args[0] ?? 'lista');

            const target = args[1] === undefined ? '' : simplify(args[1]);


            if (action === 'lista') {

                const summary = book.summary();

                const lines = TIER_ORDER.map((tier) => {

                    const names = ACHIEVEMENTS
                        .filter((achievement) => achievement.tier === tier)
                        .map((achievement) => {

                            const got = book.has(achievement.id);

                            const name = !got && achievement.secret ? '???' : achievement.title;

                            return `${got ? '✔' : '·'} ${name}${got || achievement.secret ? '' : ` (${achievement.id})`}`;

                        });

                    return `${TIERS[tier].name}: ${names.join(', ')}`;

                });

                return `Osiągnięcia: ${summary.unlocked} z ${summary.total}, punkty ${summary.points} z ${summary.maxPoints}\n` +
                    lines.join('\n') + '\nKsięga: L albo /osiagniecia ksiega';

            }


            if (action === 'ksiega') {

                game.onOpenAchievements?.();

                return 'Księga osiągnięć otwarta.';

            }


            if (action === 'pokaz') {

                const tier = TIER_WORDS[target] ?? (TIERS[target] ? target : null);

                const achievement =
                    tier ? ACHIEVEMENTS.find((a) => a.tier === tier) : findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Podaj rangę (${Object.keys(TIER_WORDS).join(', ')}) albo id osiągnięcia.`);
                }

                book.notify(achievement);

                return `Pokaz powiadomienia: ${achievement.title} (bez zdobywania).`;

            }


            if (action === 'daj') {

                const achievement = findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Nie ma osiągnięcia "${args[1] ?? ''}". Lista: /osiagniecia`);
                }

                if (!book.unlock(achievement.id, { command: true })) {
                    return `Już masz: ${achievement.title}.`;
                }

                return '';

            }


            if (action === 'zabierz') {

                if (target === 'wszystkie') {

                    book.reset();

                    return 'Wszystkie osiągnięcia i postęp wyzerowane.';

                }

                const achievement = findAchievement(target);

                if (!achievement) {
                    throw new CommandError(`Nie ma osiągnięcia "${args[1] ?? ''}". Lista: /osiagniecia`);
                }

                return book.revoke(achievement.id)
                    ? `Zabrano: ${achievement.title}.`
                    : `Nie masz jeszcze: ${achievement.title}.`;

            }


            throw usageError(this);

        },

        complete(args) {

            if (args.length === 1) {
                return ['lista', 'ksiega', 'pokaz', 'daj', 'zabierz'];
            }

            const action = simplify(args[0]);

            if (args.length === 2 && action === 'pokaz') {
                return [...Object.keys(TIER_WORDS), ...ACHIEVEMENTS.map((achievement) => achievement.id)];
            }

            if (args.length === 2 && (action === 'daj' || action === 'zabierz')) {
                return [...ACHIEVEMENTS.map((achievement) => achievement.id), ...(action === 'zabierz' ? ['wszystkie'] : [])];
            }

            return [];

        }
    },


    // ========================================================
    // SEKRET (ukryta - nie ma jej na liście /pomoc)
    // ========================================================

    {
        name: 'kosmos',
        aliases: ['space'],
        hidden: true,
        usage: '/kosmos [lec|spadaj|status] [wysokość]',
        description: 'Sekret: przenosi w kosmos (czarne niebo, planety, kula Ziemi). ' +
            '"spadaj" - od razu w dół jak meteoryt (krater przy lądowaniu).',

        run(args, { game, player }) {

            const action = simplify(args[0] ?? 'lec');

            const space = game.spaceView;


            if (action === 'status') {

                const map = space.globe.map;

                return `Wysokość ${Math.round(player.pos.y)} | kosmos ${Math.round(space.space * 100)}%, ` +
                    `kula ${Math.round(space.curve * 100)}%, mapa kuli ${Math.round(map.progress * 100)}%\n` +
                    (player.skyfall
                        ? `Spadasz: ${Math.round(game.skyfall.speed)} bloków/s, ogień ${Math.round(game.skyfall.heat * 100)}%`
                        : player.flying ? 'Lecisz (Spacja - w górę, Shift - w dół, wysoko coraz szybciej).' : 'Nie spadasz.');

            }

            if (action !== 'lec' && action !== 'spadaj') {
                throw usageError(this);
            }


            const height = args[1] === undefined ? 6000 : parseNumber(args[1], 'wysokość');

            if (height < SKYFALL_START || height > SPACE_MAX_ALTITUDE) {
                throw new CommandError(`Wysokość: od ${SKYFALL_START} do ${SPACE_MAX_ALTITUDE}`);
            }


            player.pos.y = height;

            player.vel.set(0, 0, 0);

            player.flying = action === 'lec';

            player.skyfall = false;

            player.updateCamera();


            if (action === 'spadaj') {

                const seconds = fallSeconds(height);

                return `Spadasz z wysokości ${Math.round(height)} - jak meteoryt! ` +
                    `Ziemia za ~${Math.round(seconds)} s.`;

            }

            return `Jesteś na wysokości ${Math.round(height)}` +
                `${height < SPACE_FULL ? ' (kosmos zaczyna się wyżej - Spacja w górę)' : ''}. ` +
                'Wyłącz latanie (dwa razy Spacja albo /latanie), żeby wrócić jak meteoryt.';

        },

        complete(args) {
            return args.length === 1 ? ['lec', 'spadaj', 'status'] : [];
        }
    }

];
