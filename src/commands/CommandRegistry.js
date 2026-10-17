// ------------------------------------------------------------
// KOMENDY
//
// Komenda to obiekt:
//
//   {
//       name: 'czas',                    // wpisuje się: /czas ...
//       aliases: ['time'],               // inne nazwy (opcjonalne)
//       usage: '/czas ustaw <godzina>',  // jak używać (do /pomoc)
//       description: 'Ustawia czas.',    // krótki opis (do /pomoc)
//       hidden: true,                    // sekret: nie ma jej na liście
//                                        // /pomoc ani w podpowiedziach
//                                        // (opcjonalne)
//
//       run(args, ctx) { ... },          // wykonanie
//       complete(args, ctx) { ... }      // podpowiedzi pod Tab (opcjonalne)
//   }
//
// args - słowa wpisane po nazwie komendy, np. ['ustaw', '18:00'].
// ctx  - to, czym komenda może sterować: { game, world, player,
//        sky, time, chat }.
//
// run() zwraca tekst do pokazania na czacie (albo nic). Błąd
// zgłasza się przez throw new CommandError('opis') - gracz zobaczy
// go na czerwono.
//
// complete() zwraca listę możliwych słów dla OSTATNIEGO wpisanego
// argumentu (args.length - 1).
//
// Nazwy są porównywane bez wielkich liter i polskich znaków,
// więc /księżyc i /ksiezyc to to samo.
// ------------------------------------------------------------

export class CommandError extends Error {}


// "Księżyc" -> "ksiezyc"

export function simplify(text) {

    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l');

}


export class CommandRegistry {

    constructor() {

        this.commands = [];

        // nazwa albo alias (uproszczony) -> komenda

        this.byName = new Map();

    }


    register(command) {

        for (const name of [command.name, ...(command.aliases ?? [])]) {

            const key = simplify(name);

            if (this.byName.has(key)) {
                throw new Error(`Komenda "${name}" już istnieje`);
            }

            this.byName.set(key, command);

        }

        this.commands.push(command);

    }


    // Komendy widoczne na liście /pomoc i w podpowiedziach (bez ukrytych).

    get visible() {

        return this.commands.filter((command) => !command.hidden);

    }


    find(name) {

        return this.byName.get(simplify(name)) ?? null;

    }


    // Wykonuje tekst komendy (bez ukośnika), np. "czas ustaw 18:00".
    // Zwraca { ok, text }.

    execute(line, ctx) {

        const words = line.trim().split(/\s+/).filter(Boolean);

        if (words.length === 0) {
            return { ok: false, text: 'Wpisz komendę, np. /pomoc' };
        }


        const command = this.find(words[0]);

        if (!command) {

            return {
                ok: false,
                text: `Nie ma komendy "/${words[0]}". Lista komend: /pomoc`
            };

        }


        try {

            const text = command.run(words.slice(1), ctx);

            return { ok: true, text: text ?? '' };

        }

        catch (error) {

            if (error instanceof CommandError) {
                return { ok: false, text: error.message };
            }

            console.error(error);

            return { ok: false, text: `Błąd w komendzie /${command.name}: ${error.message}` };

        }

    }


    // Podpowiedzi pod Tab dla wpisanego tekstu (bez ukośnika).
    // Zwraca listę pełnych linii do wstawienia.

    complete(line, ctx) {

        const words = line.split(' ');

        const last = simplify(words[words.length - 1]);


        let options;

        if (words.length === 1) {

            options = this.visible.map((command) => command.name);

        }
        else {

            const command = this.find(words[0]);

            options = command?.complete?.(words.slice(1), ctx) ?? [];

        }


        const prefix = words.slice(0, -1).join(' ');

        return options
            .filter((option) => simplify(option).startsWith(last))
            .map((option) => (prefix ? `${prefix} ${option}` : option));

    }

}
