# Psucie się jedzenia (1.23.0)

Świeże jedzenie się psuje - tym szybciej, im cieplej. Razem z porami
roku ([pory-owocowania.md](pory-owocowania.md)) daje to sens zapasom:
latem jedzenia jest dużo, ale nie poleży; na zimę trzeba mieć to, co
się nie psuje, albo chłodną piwniczkę.

## Zasada

Nie ma „daty ważności" każdej sztuki. Co godzinę gry każda sztuka
psującego się jedzenia ma małą szansę, że się zepsuje - stos topnieje
więc powoli, a dwa stosy tego samego jedzenia łączą się jak zawsze.

**Po ilu dobach gry zostaje połowa** (w plecaku, przy 15°C):

| Jedzenie | Połowa po |
|---|---|
| potrawy z garnka | 2 dobach |
| miękkie owoce (jagody, maliny, truskawki, figi...) i jadalne kwiaty | 3 dobach |
| pieczone jabłko, dynia i cukinia | 4 dobach |
| twarde owoce i warzywa (jabłko, oliwki, owoc baobabu, chili, kawałek dyni, cukinia) | 7 dobach |

**Nie psują się**: suszone owoce, orzechy laskowe, orzeszki bukowe,
żołędzie, orzechy araukarii, kokos, pestki dyni, prażone orzechy
i żołędzie, napary, cała dynia (blok).

## Temperatura i miejsce

| | Tempo psucia |
|---|---|
| cieplej o 10°C | 2 razy szybciej (najwyżej 4 razy) |
| chłodniej o 10°C | 2 razy wolniej |
| mróz (0°C i mniej) | 20 razy wolniej - prawie wcale |
| skrzynia | 2 razy wolniej niż plecak |
| piwniczka | jeszcze 2 razy wolniej, a latem nie cieplej niż 10°C |

- **Piwniczka** to skrzynia, nad którą nie widać nieba: pod dachem albo
  pod ziemią. Latem (22°C) maliny w plecaku tracą połowę po niecałych
  2 dobach, w skrzyni na słońcu po niecałych 4, w piwniczce po 17.
- Temperatura to pogoda tam, gdzie stoi gracz (`/pogoda`, okno statusu).
  Daleka skrzynia (w niewczytanym terenie) liczy się według pory roku:
  wiosna i jesień 10°C, lato 22°C, zima -3°C, bez premii za piwniczkę.
- Zimą na mrozie jedzenie w plecaku prawie się nie psuje.

## Kompost

Zepsute jedzenie zamienia się w **kompost** (w plecaku - w wolnym
miejscu; zepsuta potrawa oddaje miskę). Kompostu nie da się zjeść, ale
**PPM kompostem na ziemi, trawie, ziemi kamienistej albo ściółce robi
z niej czarnoziem**. Czarnoziem pomaga roślinom po zimie
([sad.md](sad.md)).

W skrzyni zepsute sztuki po prostu ubywają ze stosu; dopiero gdy
zepsuje się cały stos, w jego przegródce zostaje kompost.

## Kiedy nie działa

Tylko w trybie przygody. Nie psuje się: jedzenie w garnku na ognisku,
wyrzucone na ziemię (tam schnie - [pory-owocowania.md](pory-owocowania.md)),
w siatce wytwarzania.

## Osiągnięcia i komendy

*Nic się nie marnuje* - użyźnij ziemię kompostem.

`/psucie` - temperatura i tempo tu, gdzie stoisz; `/psucie tempo <x>` -
przyspiesza albo wyłącza (0); `/psucie dni <ile>` - psuje od razu tak,
jakby minęło tyle dób.

## Dla programisty

- `src/items/spoilage.js` - liczby i zasady: `spoilKind`,
  `halfLifeDays`, `temperatureFactor`, `spoilChance(typ, doby,
  temperatura, miejsce)`, `spoiledCount`.
- `src/game/Spoilage.js` - przegląd plecaka i skrzyń co godzinę gry
  (`step`), przespany czas (`advance`).
- `GameInteraction.fertilize` - kompost na ziemię.

Nowe jedzenie psuje się samo według rodzaju (owoc miękki, o ile nie
jest na liście `FIRM`; `KEEPS` - nie psuje się). Pilnuje tego
`tools/sprawdz_psucia.mjs`: każde jedzenie musi mieć rodzaj albo być na
liście niepsujących się.

## Czego nie ma (luki)

- **Nie widać, ile jedzenie ma jeszcze czasu** - nie ma wieku sztuki;
  w oknie statusu jest tylko „psuje się szybko / powoli / nie psuje się".
- Zepsute jedzenie nie szkodzi - po prostu znika jako jedzenie.
- W skrzyni zepsuta potrawa nie oddaje miski (miska przepada), a zepsute
  sztuki z niepełnego stosu nie zostawiają kompostu.
- Pełny plecak: zepsute sztuki przepadają bez kompostu.
- Piwniczkę poznaje się tylko po braku nieba nad skrzynią - skrzynia pod
  gęstą koroną drzewa też się liczy.
- Rozgrzebanej ziemi nie da się użyźnić kompostem (czarnoziemu nie da
  się potem rozgrzebać bez utraty - plan: „ziemia z charakterem").
- Gra ze znajomymi: skrzynie liczy gospodarz, plecak każdy u siebie;
  nie testowałem w dwóch kartach.
- Liczby (półtrwanie, mnożniki) dobrałem na oko - do oceny w grze.
