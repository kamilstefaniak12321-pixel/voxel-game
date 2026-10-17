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
| `/kamera [oczy \| tyl \| przod]` | widok kamery: z oczu, zza pleców, z przodu (bez nazwy - następny, jak F5) |
| `/animacja <stanie \| chodzenie \| bieg \| kucanie \| skradanie \| skok \| machanie \| latanie \| plywanie \| plywanie-w-miejscu>` | podgląd animacji modelu gracza w miejscu (włącza kamerę z przodu); `/animacja wyl` - koniec |
| `/model` | model gracza: styl zgięć, druga warstwa skórki, tempo animacji |
| `/model gladki \| klocki` | zgięcia rąk, nóg i tułowia: gładkie albo osobne klocki |
| `/model warstwa <wl \| wyl>` | druga (wierzchnia) warstwa skórki |
| `/model tempo <0.05-2>` | tempo animacji (0.25 = cztery razy wolniej) |
| `/skorka plik` | wczytanie własnej skórki (PNG 64 x 64, układ jak w Minecrafcie) |
| `/skorka domyslna` | powrót do domyślnej skórki |
| `/pozycja` | pozycja i chunk |
| `/tryb [przygoda \| kreatywny]` | tryb gry (bez słowa - jaki jest): przygoda - zniszczone bloki trafiają do ekwipunku, stawianie je zużywa; kreatywny - bloki bez końca, wszystkie bloki pod E, latanie po dwukliku Spacji. Skróty: `/gm p`, `/gm k` |
| `/ekwipunek` | co jest w ekwipunku (ile sztuk każdego bloku, ile miejsc zajętych) |
| `/ekwipunek wyczysc` | czyści cały ekwipunek (z paskiem) |
| `/latanie` | włącza/wyłącza latanie w każdym trybie (Spacja w górę, Shift w dół) - do testów; w kreatywnym wystarczy 2× Spacja |
| `/predkosc <0.1-20>` | prędkość ruchu (1 = normalnie) |
| `/daj <blok albo przedmiot> [ilość]` | blok albo przedmiot (owoc) do ekwipunku: z ilością - tyle sztuk (do 2304, pierwsze wolne miejsca, najpierw pasek); bez ilości w trybie kreatywnym - jedna sztuka do wybranego miejsca paska, w przygodzie - stos 64. Nazwy też po polsku, bez ogonków: `granit`, `trawa`, `ziemia`, `mak`, `chaber`, `paproc`, `czarnoziem`, `krotka_trawa`, `truskawki` (`truskawka`), `jezyny`, `chili` (`papryczki`), `orzech`, `sadzonka_truskawki`, `leszczyna`... |
| `/bloki` | lista bloków i przedmiotów (nazwa do komend i polska nazwa) |
| `/krzaki` | krzaki owocowe do 64 bloków od ciebie: ile w każdym etapie (sadzonki, bez owoców, kilka owoców, pełne), tempo wzrostu |
| `/krzaki ogrod` | przed tobą ogródek: 4 rzędy (truskawka, jeżyna, papryczka chili, leszczyna), w każdym od lewej sadzonka, krzak bez owoców, kilka owoców, pełen owoców (zmienia świat) |
| `/krzaki znajdz` | najbliższy dziki krzak z owocami: nazwa, odległość, kierunek i komenda `/tp` |
| `/krzaki rosnij [1-3]` | krzaki do 64 bloków od ciebie od razu rosną o tyle etapów (3 = od sadzonki do pełnego owoców) |
| `/krzaki tempo [0-500]` | tempo wzrostu krzaków: 60 = etap średnio co 2,5 s zamiast 150 s, 0 = nie rosną, 1 = normalnie; bez liczby - jakie jest (nie zapisuje się) |
| `/wypelnij <x1> <y1> <z1> <x2> <y2> <z2> <blok \| powietrze>` | wypełnia prostopadłościan (do 16 384 bloków) |
| `/swiatlo` | światło przy głowie i przy wskazanej ścianie (niebo 0-15, lampy 0-15 i ich kolor) |
| `/swiatlo dynamiczne [wl \| wyl]` | włącza/wyłącza dynamiczne światło (to samo co w ustawieniach) |
| `/demo swiatlo` | buduje zamknięty pokój z kolorowymi lampami i stawia w nim gracza |
| `/demo kula [kolor \| usun]` | kula dynamicznego światła krąży przed graczem przez minutę |
| `/demo skaly` | odkrywka: wykop przed graczem aż do y = 1 - na ścianach widać warstwy skał (zmienia świat) |
| `/meteory` | ile spadających gwiazd na minutę, czy jest deszcz meteorów |
| `/meteory deszcz <wl \| wyl \| auto>` | wymusza albo wyłącza deszcz meteorów (auto = sam wybiera noce) |
| `/meteory pokaz [ile]` | od razu kilka spadających gwiazd (widać w nocy) |
| `/meteor` | zrzuca meteoryt w pobliżu (nie w chunki zmieniane przez gracza); nadlatuje zza miejsca upadku, więc patrząc w tamtą stronę widać cały przelot (8 s) |
| `/meteor tu` | meteoryt spada tam, gdzie patrzysz (albo 15 bloków przed graczem) |
| `/meteor pokaz` | meteoryt spada 30 bloków przed graczem i nadlatuje z naprzeciwka - najlepszy widok |
| `/meteor tempo [0.05-2]` | tempo meteorytów (lot, cząsteczki, wybuch, także dźwięki - niższe): 0.25 = cztery razy wolniej, 1 = normalnie; bez liczby - jakie jest |
| `/dzwiek` | stan dźwięku (gra / wstrzymany), ile plików się wczytało, głośności |
| `/dzwiek lista` | wszystkie dźwięki (nazwy z `src/audio/sounds.js`) |
| `/dzwiek <nazwa>` | gra jeden dźwięk, np. `/dzwiek meteor_impact`, `/dzwiek break_stone` |
| `/dzwiek pokaz [materiał]` | po kolei dla każdego materiału (albo jednego: `trawa`, `ziemia`, `kamien`, `piasek`, `zwir`, `bloto`, `rosliny`, `szklo`): trzy kroki, postawienie, zniszczenie |
| `/woda` | czy jesteś w wodzie: jak głęboko (procent ciała), czy pływasz, czy oczy są pod wodą; ile wody dookoła |
| `/woda basen` | basen przed tobą (zmienia świat): brodzik (1 blok wody), dalej 4 bloki głębokości, ściany z wapienia równo z ziemią |
| `/woda znajdz` | najbliższa woda we wczytanych chunkach: odległość, kierunek i komenda `/tp` nad wodę |
| `/woda fale [0-3]` | wysokość fal na wodzie (0 = płaska, 1 = zwykłe); bez liczby - jaka jest (nie zapisuje się) |
| `/dzwiek menu` | po kolei dźwięki menu i ekwipunku: przycisk, "Wróć", suwak, otwarcie ekwipunku, wzięcie, odłożenie, kosz, zamknięcie, błąd, zbieranie owoców |
| `/horyzont` | daleki teren: zasięg, ile kafelków widać i ile się buduje, trójkąty |
| `/horyzont <bloki \| wyl>` | zasięg dalekiego terenu (to samo co w ustawieniach) |
| `/horyzont lod` | koloruje kafelki dalekiego terenu według dokładności (czerwone - najdokładniejsze) |
| `/horyzont odswiez` | buduje daleki teren od nowa |
| `/teren` | teren pod graczem: wysokość, pas (morze, nizina, wyżyna, góry), forma terenu, powierzchnia, nachylenie i pola generatora |
| `/teren <x> <z>` | to samo dla dowolnego miejsca (`~` = względem gracza) |
| `/teren formy` | lista form terenu do szukania |
| `/teren znajdz <forma> [promien] [tp]` | najbliższa forma terenu (np. `turnia`, `kotlina`, `plaskowyz`, `wyzyna`); `tp` - od razu teleport |
| `/mapa [warstwa] [skala]` | mapa terenu z góry (klawisz **M**); warstwy: `teren`, `formy`, `pasy`, `skaly` (skała na wierzchu albo pod glebą), `przekroj` (przekrój pionowy w kierunku patrzenia, domyślnie 1 blok na punkt), `kontynent`, `wypietrzenie`, `erozja`, `grzbiety`, `gory`, `wyzyny`, `temperatura`, `wilgotnosc`; skala = bloki na punkt (1-32) |
| `/mapa wyl` | zamyka mapę |
| `/skaly` | skały w kolumnie pod graczem, od góry (np. trawa 1, ziemia 3, piaskowiec 12...) |
| `/skaly statystyki [promien]` | udział skał w okolicy (domyślnie 128 bloków) i ile lepidolitu wychodzi na wierzch |
| `/skaly znajdz <skala> [promien] [tp]` | najbliższe miejsce, gdzie skała jest na wierzchu: `granit`, `wapien`, `piaskowiec`, `lupek`, `bazalt`, `kamien`, `lepidolit` |
| `/skaly zyla [promien] [tp]` | najbliższa żyła lepidolitu pod ziemią (z `tp` - przeniesienie nad nią) |
| `/skaly przekroj` | przekrój pionowy terenu (to samo co `/mapa przekroj`) |
| `/ziemniak [wl \| wyl]` | tryb ziemniaka - wszystko działa, ale prościej i szybciej (słaby komputer, brak karty graficznej) |
| `/dotyk [wl \| wyl]` | sterowanie dotykowe (telefon, tablet): czy włączone, ekran i rozdzielczość; `wl` / `wyl` - przełącza (zapis świata i odświeżenie strony) - `docs/telefon.md` |
| `/ustaw` | lista ustawień z wartościami |
| `/ustaw <ustawienie> <wartość>` | zmienia ustawienie, np. `/ustaw zasieg 256`, `/ustaw jasnosc 50`, `/ustaw licznik-fps wl` |
| `/ustaw domyslne` | przywraca domyślne ustawienia |
| `/wydajnosc` | FPS, czasy klatki, rysowanie (wywołania, trójkąty), chunki, daleki teren, pamięć |
| `/wydajnosc test [sekundy]` | test: kamera obraca się raz dookoła, wynik na czacie (domyślnie 10 s) |
| `/osiagniecia` | osiągnięcia: co zdobyte, punkty, id (opis: `docs/osiagniecia.md`) |
| `/osiagniecia ksiega` | otwiera księgę osiągnięć (to samo co klawisz L) |
| `/osiagniecia pokaz <zwykle \| rzadkie \| bardzo-rzadkie \| legendarne \| id>` | samo powiadomienie o osiągnięciu (bez zdobywania) |
| `/osiagniecia daj <id>` / `zabierz <id \| wszystkie>` | przyznaje / zabiera osiągnięcie (do testów) |

Kolory: `czerwony`, `krwawy`, `pomaranczowy`, `zloty`, `zolty`, `zielony`,
`turkusowy`, `niebieski`, `fioletowy`, `rozowy`, `bialy` albo `#rrggbb`.

Nazwy ustawień w `/ustaw`: `ziemniak`, `zasieg`, `daleki-teren`, `pole`, `jasnosc`,
`rozdzielczosc`, `fps` (limit), `cienie`, `dynamiczne-swiatlo`, `wczytywanie`, `czulosc`,
`odwroc-mysz`, `motyw`, `interfejs`, `debug`, `licznik-fps`, `meteoryty`,
`warstwa-skorki`, `zgiecia` (`gladkie` / `klocki`), `kamera` (odległość kamery z F5, 2-8),
`glosnosc`, `glosnosc-bloki`, `glosnosc-otoczenie` (też `glosnosc-zjawiska`), `glosnosc-menu` (0-100).
Wartości tak/nie: `wl` / `wyl`.

Niektóre komendy mają też angielskie nazwy (`/time`, `/moon`, `/tp`,
`/fly`, `/give`, `/fill`...) - pokazuje je `/pomoc <komenda>`.

### Sekrety (nie ma ich w `/pomoc` ani w podpowiedziach)

| komenda | co robi |
|---|---|
| `/kosmos [lec \| spadaj \| status] [wysokość]` | kosmos: przeniesienie wysoko (domyślnie 6000, w locie), `spadaj` - od razu w dół jak meteoryt (krater przy lądowaniu), `status` - wysokość, kula, prędkość, ogień. Opis: `docs/kosmos.md` |

## Zasada: nowa rzecz w grze = nowa komenda

Każda nowość powinna dać się szybko sprawdzić z czatu: nowy blok -
`/daj`, nowa rzecz na niebie - opcja `/niebo` albo `/demo`, nowy
efekt - komenda, która go włącza albo buduje scenę do obejrzenia.
A jeśli jest za co - także nowe osiągnięcie (`docs/osiagniecia.md`).

## Jak dodać komendę

Komendy są w `src/commands/gameCommands.js` (lista `GAME_COMMANDS`,
pogrupowana tematami). Nowa komenda to nowy obiekt na tej liście:

```js
{
    name: 'skok',                       // wpisuje się /skok
    aliases: ['jump'],                  // inne nazwy (opcjonalne)
    usage: '/skok <siła>',              // pokazywane przy błędzie i w /pomoc
    description: 'Wyrzuca gracza w górę.',
    // hidden: true,                    // sekret: bez /pomoc i podpowiedzi

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
