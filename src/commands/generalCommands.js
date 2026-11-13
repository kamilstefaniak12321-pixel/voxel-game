// ------------------------------------------------------------
// KOMENDY GRY - OGÓLNE (POMOC, LOGI, CZAT)
//
// Część listy komend (wszystkie zbiera gameCommands.js). Opis budowy
// komendy jest w CommandRegistry.js, lista dla gracza w docs/komendy.md.
// ------------------------------------------------------------

import { simplify, CommandError } from './CommandRegistry.js';
import { usageError } from './commandHelpers.js';


export const GENERAL_COMMANDS = [

    {
        name: 'logi',
        aliases: ['diagnostyka'],
        usage: '/logi [problem]',
        description: 'Otwiera raport błędów i wydajności; problem zaznacza bieżący moment (także F8).',
        run(args, { diagnostics, openDiagnostics, markProblem }) {
            if (args.length > 1 || (args.length && simplify(args[0]) !== 'problem')) throw usageError(this);
            if (!diagnostics) throw new CommandError('Diagnostyka jest niedostępna w tej sesji.');
            if (args.length) {
                markProblem();
                return 'Zaznaczono problem. Raport: Pauza → Diagnostyka i logi.';
            }
            openDiagnostics();
            return 'Raport diagnostyczny został otwarty.';
        },
        complete(args) { return args.length === 1 ? ['problem'] : []; }
    },

    // ========================================================
    // OGÓLNE
    // ========================================================

    {
        name: 'pomoc',
        aliases: ['help', '?'],
        usage: '/pomoc [komenda]',
        description: 'Lista komend albo opis jednej komendy.',

        run(args, { commands }) {

            if (args[0]) {

                const command = commands.find(args[0].replace(/^\//, ''));

                if (!command) {
                    throw new CommandError(`Nie ma komendy "${args[0]}"`);
                }

                const aliases = command.aliases?.length ? ` (też: /${command.aliases.join(', /')})` : '';

                return `/${command.name}${aliases} - ${command.description}\nUżycie: ${command.usage}`;

            }

            return 'Komendy (szczegóły: /pomoc <komenda>, Tab podpowiada):\n' +
                commands.visible
                    .map((command) => `/${command.name} - ${command.description}`)
                    .join('\n');

        },

        complete(args, { commands }) {
            return args.length === 1 ? commands.visible.map((command) => command.name) : [];
        }
    },


    {
        name: 'wyczysc',
        aliases: ['clear'],
        usage: '/wyczysc',
        description: 'Czyści czat.',

        run(args, { chat }) {
            chat.clear();
        }
    }

];
