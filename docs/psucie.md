# Psucie się jedzenia (1.23.0, świeżość stosów od 1.24.0)

Świeże jedzenie się psuje - tym szybciej, im cieplej. Razem z porami
roku ([pory-owocowania.md](pory-owocowania.md)) daje to sens zapasom:
latem jedzenia jest dużo, ale nie poleży; na zimę trzeba mieć to, co
się nie psuje, albo chłodną piwniczkę.

## Zasada: świeżość stosu

(Od 1.24.0. W 1.23.0 sztuki psuły się losowo, po jednej, i nie było
widać, ile jedzenie ma jeszcze czasu.)

Każdy stos psującego się jedzenia ma swoją **świeżość** - od 100%
(świeże) do zera. Gdy spadnie do zera, **cały stos zamienia się
w kompost w tym samym miejscu** (plecak, skrzynia, ziemia), więc nic
nie ginie. Zepsuta potrawa zamienia się w **kompost w misce**.

**Ile jeszcze poleży, widać w opisie stosu**: po najechaniu myszą
w ekwipunku i w skrzyni („Świeże - zepsuje się za ok. 3 dni") oraz
w oknie statusu, gdy jedzenie jest w ręce. Opis liczy czas dla miejsca,
w którym stos leży, i temperatury, jaka jest teraz.

**Ile dób gry leży świeże jedzenie** (w plecaku, przy 15°C):

| Jedzenie | Leży |
|---|---|
| potrawy z garnka | 3 doby |
| miękkie owoce (jagody, maliny, truskawki, figi...) i jadalne kwiaty | 5 dób |
| pieczone jabłko, dynia i cukinia | 6 dób |
| twarde owoce i warzywa (jabłko, oliwki, owoc baobabu, chili, kawałek dyni, cukinia) | 12 dób |

**Nie psują się**: suszone owoce, orzechy laskowe, orzeszki bukowe,
żołędzie, orzechy araukarii, kokos, pestki dyni, prażone orzechy
i żołędzie, napary, cała dynia (blok).

## Łączenie stosów

- **Samo z siebie** (zbiór, podnoszenie z ziemi, Shift + klik, powrót
  z siatki wytwarzania) jedzenie dokłada się tylko do stosu o **takiej
  samej świeżości** (różnica do 10 punktów procentowych - to pół doby
  dla malin i ponad doba dla jabłek; świeżość wychodzi wtedy ze
  średniej). Inne trafia na puste miejsce - dzisiejsze maliny leżą obok
  wczorajszych.
- **Ręcznie** (stos na stos w ekwipunku albo skrzyni, także po jednej
  sztuce PPM) stosy łączą się zawsze, a świeżość wychodzi ze **średniej**
  obu stosów, ważonej liczbą sztuk: 10 świeżych i 30 w 20% dają 40 sztuk
  w 40%.
- Dzielenie stosu, wyrzucanie, skrzynia, zapis i gra ze znajomymi
  zachowują świeżość.
- Gdy plecak jest pełny, jedzenie o innej świeżości się nie podniesie,
  choć leży w nim niepełny stos tego samego jedzenia.

## Temperatura i miejsce

| | Tempo psucia |
|---|---|
| cieplej o 10°C | 2 razy szybciej (najwyżej 4 razy) |
| chłodniej o 10°C | 2 razy wolniej |
| mróz (0°C i mniej) | 20 razy wolniej - prawie wcale |
| skrzynia | 2 razy wolniej niż plecak |
| piwniczka | jeszcze 2 razy wolniej, a latem nie cieplej niż 10°C |

- **Piwniczka** to skrzynia, nad którą nie widać nieba: pod dachem albo
  pod ziemią. Latem (22°C) świeże maliny leżą w plecaku 3 doby,
  w skrzyni na słońcu 6, w piwniczce 28. Jabłka w piwniczce przetrwają
  jesień i zimę (pora roku trwa 8 dób).
- Temperatura to pogoda tam, gdzie stoi gracz (`/pogoda`, okno statusu).
  Daleka skrzynia i dalekie przedmioty na ziemi (w niewczytanym terenie)
  liczą się według pory roku: wiosna i jesień 10°C, lato 22°C, zima
  -3°C, bez premii za piwniczkę.
- Zimą na mrozie jedzenie prawie się nie psuje.
- Jedzenie leżące na ziemi psuje się jak w plecaku (o ile wcześniej nie
  wyschnie na słońcu - [pory-owocowania.md](pory-owocowania.md)).

## Kompost i kompost w misce

- Zepsuty stos to **kompost** - tyle sztuk, ile było jedzenia.
- Zepsuta potrawa to **kompost w misce**. **PPM z miską w ręce wysypuje
  kompost i oddaje miskę** (jedna miska na kliknięcie; gdy w plecaku nie
  ma miejsca, kompost albo miska lądują na ziemi przed graczem). PPM
  miską prosto na rozgrzebaną ziemię od razu ją użyźnia - miska wraca.

## Użyźnianie pola (1.24.0)

**PPM kompostem na rozgrzebanej ziemi** - zwykłej albo kamienistej
(także na roślinie, która na niej rośnie) posypuje jej górną warstwę: powstaje **pole z kompostem**
(`tilled_compost`, numer 15400).

| Statystyka pola z kompostem | |
|---|---|
| wzrost roślin | 1,5 raza szybszy |
| sad ([sad.md](sad.md)) | liczy się jak czarnoziem: roślina chętniej się rozwija (większy plon) i rozsiewa po zimie |
| zarastanie pustego pola | po 30 minutach (zwykłe pole: 15) |

Sadzi się na nim tak samo jak na zwykłym polu. Wykopane daje zwykłą
ziemię - kompost przepada.

PPM kompostem na **ziemi, trawie, ziemi kamienistej albo ściółce** robi
z niej czarnoziem (jak dotąd).

**Kolejne rodzaje kompostu**: tabela `FERTILIZERS`
w `src/blocks/fertilizers.js` - każdy nawóz ma swój blok pola
i statystyki (`growth`, `rich`); `FERTILIZER_ITEMS` mówi, którym
przedmiotem się go sypie. Nowy kompost to nowy wpis, nowy blok pola
(numery 15401-15499) i tekstura.

## Kiedy nie działa

Tylko w trybie przygody. Nie psuje się jedzenie w garnku na ognisku.

## Osiągnięcia i komendy

*Nic się nie marnuje* - użyźnij ziemię kompostem. *Posypane z wierzchu* -
posyp kompostem rozgrzebaną ziemię.

`/psucie` - temperatura i tempo tu, gdzie stoisz, świeżość stosu w ręce;
`/psucie tempo <x>` - przyspiesza albo wyłącza (0); `/psucie dni <ile>` -
starzeje jedzenie od razu tak, jakby minęło tyle dób;
`/psucie swiezosc <procent>` - ustawia świeżość stosu w ręce.

## Dla programisty

- `src/items/freshness.js` - świeżość stosu: `makeItem`, `withCount`
  (kopia z inną liczbą sztuk), `sameBatch` (czy samo się dołoży),
  `blend` (dołożenie ze średnią). **Każde miejsce, które kopiuje albo
  dzieli stos, musi używać `withCount`** - `{ type, count }` gubi
  świeżość.
- `src/items/spoilage.js` - liczby i zasady: `spoilKind`, `shelfDays`,
  `temperatureFactor`, `spoilFactor`, `freshLoss(typ, doby, temperatura,
  miejsce)`, `daysLeft`, `freshText`, `spoilsInto`.
- `src/game/Spoilage.js` - co godzinę gry starzeje plecak, siatkę,
  stos pod kursorem, skrzynie i przedmioty na ziemi (`step`), przespany
  czas (`advance`).
- `Inventory.add(typ, ile, od, do, świeżość)`, `addItem(stos)`,
  `insertIntoChest(..., świeżość)`, `Drops.spawn(..., świeżość)`.
- `src/blocks/fertilizers.js` - nawozy i pola; `GameInteraction.fertilize`
  i `emptyBowl`; mnożnik wzrostu w `PlantGrowth.tick` (`FIELD_GROWTH`).

Nowe jedzenie psuje się samo według rodzaju (owoc miękki, o ile nie
jest na liście `FIRM`; `KEEPS` - nie psuje się). Pilnuje tego
`tools/sprawdz_psucia.mjs`: każde jedzenie musi mieć rodzaj albo być na
liście niepsujących się.

## Czego nie ma (luki)

- Świeżości nie widać na ikonce stosu (np. paska) - tylko w opisie.
  Dwa stosy malin o różnej świeżości wyglądają tak samo, dopóki się na
  nie nie najedzie.
- Na telefonie nie ma najeżdżania myszą: świeżość widać tylko w oknie
  statusu dla jedzenia w ręce.
- Zepsute jedzenie nie szkodzi - po prostu przestaje być jedzeniem.
- Potrawa ugotowana ze starych składników jest świeża; pieczenie też
  odświeża.
- Piwniczkę poznaje się tylko po braku nieba nad skrzynią - skrzynia pod
  gęstą koroną drzewa też się liczy.
- Na polu z kompostem nie widać premii (poza inną teksturą ziemi).
  Kompost nie zużywa się z kolejnymi zbiorami - przepada dopiero, gdy
  puste pole zarośnie albo ktoś je wykopie.
- Większy plon na polu z kompostem działa tylko przez sad (po zimie),
  nie od razu.
- Gra ze znajomymi: skrzynie i przedmioty na ziemi liczy gospodarz,
  plecak każdy u siebie; nie testowałem w dwóch kartach.
- Liczby (ile dób leży, mnożniki, 1,5 raza szybszy wzrost) dobrałem na
  oko - do oceny w grze.
