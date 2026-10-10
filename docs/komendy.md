# Komendy

Czat otwiera się klawiszem **T** (albo **/** - wtedy od razu z ukośnikiem).
Tekst zaczynający się od `/` to komenda. **Tab** podpowiada, **↑ ↓**
przywołują poprzednie wpisy, **ESC** zamyka.

Wielkość liter i polskie znaki nie mają znaczenia: `/Księżyc` = `/ksiezyc`.
Współrzędne można podawać względem gracza: `~` (tu, gdzie stoję),
`~5` (5 dalej), `~-3` (3 bliżej).

## Lista

| komenda | co robi |
|---|---|
| `/pomoc [komenda]` | lista komend albo opis jednej |
| `/wyczysc` | czyści czat |
| `/czas` | dzień, godzina, prędkość czasu, faza księżyca |
| `/czas ustaw <18:30 \| rano \| poludnie \| popoludnie \| zachod \| wieczor \| noc \| polnoc \| wschod>` | ustawia godzinę (ten sam dzień) |
| `/czas dodaj <godziny \| 30m>` | przesuwa czas (może być ujemnie) |
| `/czas predkosc <x>` | prędkość czasu: 0 = stoi, 1 = normalnie, 60 = minuta na sekundę |
| `/czas dzien <numer>` | ustawia numer dnia (godzina zostaje) |
| `/ksiezyc` | faza, oświetlenie, czy jest nad horyzontem, kolor |
| `/ksiezyc faza <now \| sierp \| kwadra \| garb \| pelnia \| ubywajacy-garb \| ostatnia-kwadra \| ubywajacy-sierp>` | przesuwa czas o pełne doby do tej fazy i mówi, o której księżyc jest najwyżej |
| `/ksiezyc kolor <kolor \| domyslny>` | kolor księżyca (zabarwia też światło nocą) |
| `/niebo` | wysokość słońca, łuna, ile gwiazd widać, Droga Mleczna, spadające gwiazdy na minutę |
| `/niebo zachod <kolor \| domyslny>` | kolor łuny wschodu i zachodu (zabarwia też światło) |
| `/tp <x> <z>`, `/tp <x> <y> <z>`, `/tp spawn` | teleport (bez y - na powierzchnię) |
| `/pozycja` | pozycja i chunk |
| `/latanie` | włącza/wyłącza latanie (Spacja w górę, Shift w dół) |
| `/predkosc <0.1-20>` | prędkość ruchu (1 = normalnie) |
| `/daj <blok>` | blok do wybranego miejsca na pasku |
| `/bloki` | lista bloków |
| `/wypelnij <x1> <y1> <z1> <x2> <y2> <z2> <blok \| powietrze>` | wypełnia prostopadłościan (do 16 384 bloków) |
| `/swiatlo` | światło przy głowie i przy wskazanej ścianie (niebo 0-15, lampy 0-15 i ich kolor) |
| `/swiatlo dynamiczne [wl \| wyl]` | włącza/wyłącza dynamiczne światło (to samo co w ustawieniach) |
| `/demo swiatlo` | buduje zamknięty pokój z kolorowymi lampami i stawia w nim gracza |
| `/demo kula [kolor \| usun]` | kula dynamicznego światła krąży przed graczem przez minutę |
| `/meteory` | ile spadających gwiazd na minutę, czy jest deszcz meteorów |
| `/meteory deszcz <wl \| wyl \| auto>` | wymusza albo wyłącza deszcz meteorów (auto = sam wybiera noce) |
| `/meteory pokaz [ile]` | od razu kilka spadających gwiazd (widać w nocy) |
| `/meteor` | zrzuca meteoryt w pobliżu (nie w chunki zmieniane przez gracza) |
| `/meteor tu` | meteoryt spada tam, gdzie patrzysz (albo 15 bloków przed graczem) |

Kolory: `czerwony`, `krwawy`, `pomaranczowy`, `zloty`, `zolty`, `zielony`,
`turkusowy`, `niebieski`, `fioletowy`, `rozowy`, `bialy` albo `#rrggbb`.

Niektóre komendy mają też angielskie nazwy (`/time`, `/moon`, `/tp`,
`/fly`, `/give`, `/fill`...) - pokazuje je `/pomoc <komenda>`.

## Zasada: nowa rzecz w grze = nowa komenda

Każda nowość powinna dać się szybko sprawdzić z czatu: nowy blok -
`/daj`, nowa rzecz na niebie - opcja `/niebo` albo `/demo`, nowy
efekt - komenda, która go włącza albo buduje scenę do obejrzenia.

## Jak dodać komendę

Komendy są w `src/commands/gameCommands.js` (lista `GAME_COMMANDS`,
pogrupowana tematami). Nowa komenda to nowy obiekt na tej liście:

```js
{
    name: 'skok',                       // wpisuje się /skok
    aliases: ['jump'],                  // inne nazwy (opcjonalne)
    usage: '/skok <siła>',              // pokazywane przy błędzie i w /pomoc
    description: 'Wyrzuca gracza w górę.',

    // args - słowa po nazwie komendy, ctx - { game, world, player,
    // sky, time, chat, commands }. Zwrócony tekst pojawi się na czacie.

    run(args, { player }) {

        const power = Number(args[0] ?? 10);

        if (!Number.isFinite(power)) {
            throw new CommandError('Siła musi być liczbą');   // czerwony błąd
        }

        player.vel.y = power;

        return `Hop! (${power})`;

    },

    // Podpowiedzi pod Tab dla ostatniego wpisanego słowa (opcjonalne).

    complete(args) {
        return args.length === 1 ? ['5', '10', '20'] : [];
    }
}
```

Pomocnicze funkcje na górze pliku: `parseNumber`, `parseCoordinate`
(obsługuje `~`), `parseColor`, `parseClock`, `blockArgument`.
