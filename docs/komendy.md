# Komendy

Czat otwiera się klawiszem **T** (albo **/** - wtedy od razu z ukośnikiem).
Tekst zaczynający się od `/` to komenda. **ESC** zamyka, **↑ ↓**
przywołują poprzednie wpisy.

**Podpowiedzi:** w trakcie pisania nad czatem widać listę pasujących
komend (z krótkim opisem) albo słów, które pasują w tym miejscu (bloki,
godziny, kolory, formy terenu...). Pierwsza z nich dopisuje się szarym
kolorem w polu tekstowym - **Tab** ją zatwierdza, a **↑ ↓** wybierają
inną z listy (gdy podpowiedzi jest kilka). Po wpisaniu nazwy komendy
nad czatem pojawia się, jak jej użyć.

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
| `/niebo` | wysokość słońca, łuna, ile gwiazd widać, Droga Mleczna, spadające gwiazdy na minutę, trwające zaćmienie |
| `/niebo zachod <kolor \| domyslny>` | kolor łuny wschodu i zachodu (zabarwia też światło) |
| `/zacmienie` | kiedy następne zaćmienie słońca (dzień, godzina, pełne czy częściowe); jeśli trwa - ile słońca jest zasłonięte |
| `/zacmienie lista [ile]` | najbliższe zaćmienia (domyślnie 5) |
| `/zacmienie nastepne` | przeskok czasu na 1,5 h przed następnym zaćmieniem |
| `/zacmienie pokaz [pelne \| czesciowe \| <procent>]` | wymusza zaćmienie w najbliższym nowiu i przestawia czas na 1,5 h przed nim |
| `/zacmienie auto` | wyłącza wymuszone zaćmienie (wracają zwykłe) |
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
| `/horyzont` | daleki teren: zasięg, ile kafelków widać i ile się buduje, trójkąty |
| `/horyzont <bloki \| wyl>` | zasięg dalekiego terenu (to samo co w ustawieniach) |
| `/horyzont lod` | koloruje kafelki dalekiego terenu według dokładności (czerwone - najdokładniejsze) |
| `/horyzont odswiez` | buduje daleki teren od nowa |
| `/teren` | teren pod graczem: wysokość, pas (morze, nizina, wyżyna, góry), forma terenu, powierzchnia, nachylenie i pola generatora |
| `/teren <x> <z>` | to samo dla dowolnego miejsca (`~` = względem gracza) |
| `/teren formy` | lista form terenu do szukania |
| `/teren znajdz <forma> [promien] [tp]` | najbliższa forma terenu (np. `turnia`, `kotlina`, `plaskowyz`, `wyzyna`); `tp` - od razu teleport |
| `/mapa [warstwa] [skala]` | mapa terenu z góry (klawisz **M**); warstwy: `teren`, `formy`, `pasy`, `kontynent`, `wypietrzenie`, `erozja`, `grzbiety`, `gory`, `wyzyny`, `temperatura`, `wilgotnosc`; skala = bloki na punkt (1-32) |
| `/mapa wyl` | zamyka mapę |
| `/ziemniak [wl \| wyl]` | tryb ziemniaka - wszystko działa, ale prościej i szybciej (słaby komputer, brak karty graficznej) |
| `/ustaw` | lista ustawień z wartościami |
| `/ustaw <ustawienie> <wartość>` | zmienia ustawienie, np. `/ustaw zasieg 256`, `/ustaw jasnosc 50`, `/ustaw licznik-fps wl` |
| `/ustaw domyslne` | przywraca domyślne ustawienia |
| `/wydajnosc` | FPS, czasy klatki, rysowanie (wywołania, trójkąty), chunki, daleki teren, pamięć |
| `/wydajnosc test [sekundy]` | test: kamera obraca się raz dookoła, wynik na czacie (domyślnie 10 s) |

Kolory: `czerwony`, `krwawy`, `pomaranczowy`, `zloty`, `zolty`, `zielony`,
`turkusowy`, `niebieski`, `fioletowy`, `rozowy`, `bialy` albo `#rrggbb`.

Nazwy ustawień w `/ustaw`: `ziemniak`, `zasieg`, `daleki-teren`, `pole`, `jasnosc`,
`rozdzielczosc`, `fps` (limit), `cienie`, `dynamiczne-swiatlo`, `wczytywanie`, `czulosc`,
`odwroc-mysz`, `motyw`, `interfejs`, `debug`, `licznik-fps`, `meteoryty`.
Wartości tak/nie: `wl` / `wyl`.

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
    // sky, time, chat, commands, map }. Zwrócony tekst pojawi się na czacie.

    run(args, { player }) {

        const power = Number(args[0] ?? 10);

        if (!Number.isFinite(power)) {
            throw new CommandError('Siła musi być liczbą');   // czerwony błąd
        }

        player.vel.y = power;

        return `Hop! (${power})`;

    },

    // Podpowiedzi (lista nad czatem, Tab) dla ostatniego wpisanego
    // słowa (opcjonalne).

    complete(args) {
        return args.length === 1 ? ['5', '10', '20'] : [];
    }
}
```

Pomocnicze funkcje na górze pliku: `parseNumber`, `parseCoordinate`
(obsługuje `~`), `parseColor`, `parseClock`, `blockArgument`.
