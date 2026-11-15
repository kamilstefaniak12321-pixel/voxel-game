# Pory roku

Od wersji 1.4.0 (pomysł Kamila). Na razie od pory roku zależą **kwiaty**;
ten opis jest też instrukcją, jak podpiąć pod pory kolejne rzeczy (kolory
liści, śnieg, pogodę).

## Zasada działania

Wszystko wynika z jednej liczby: **czasu gry w dobach** (`game.time.days`).
Z tej samej liczby gra liczy już słońce, księżyc i zaćmienia, więc pory
roku same się z nimi zgadzają.

| Jednostka | Ile trwa | Skąd |
|---|---|---|
| doba | 20 minut gry | `DAY_LENGTH_MINUTES` |
| miesiąc | 8 dób - jeden cykl księżyca, od nowiu do nowiu | `MOON_CYCLE_DAYS` |
| pora roku | 1 miesiąc = 8 dób (2 h 40 min gry) | `SEASON_MOONS` |
| rok | 4 pory = 32 doby (ok. 10 h 40 min gry) | - |

- **Pora zaczyna się w nowiu, a pełnia wypada w jej środku.** Patrząc na
  księżyc, widać, ile pory zostało: rośnie - pierwsza połowa, maleje -
  druga, znika - idzie zmiana.
- Kolejność: **wiosna, lato, jesień, zima**. Rok zaczyna się wiosną.
- Nowy świat zaczyna się tuż przed pełnią, czyli **w środku wiosny**
  (4. dzień z 8).
- Pora nie jest nigdzie zapisana - liczy się z czasu gry. Dlatego
  istniejące światy mają porę od razu, a w grze ze znajomymi wszyscy mają
  tę samą (czas podaje gospodarz).
- Sen, `/czas` i utrata przytomności przesuwają czas, więc przesuwają też
  porę.

Wszystkie liczby są w `src/config.js` (sekcja *DZIEŃ I NOC*):
`MOON_CYCLE_DAYS`, `MOON_START_PHASE`, `SEASON_MOONS`, `FIRST_SEASON`.
Zmiana `SEASON_MOONS` na 2 wydłuża porę do dwóch cykli księżyca - reszta
gry dopasuje się sama.

## Co widać w grze

- Komunikat nad paskiem przy zmianie pory („Nadeszło lato”).
- Ekran F3: `Pora roku: wiosna, dzień 4 z 8`.
- `/pora` - pora, dzień, rok, faza księżyca i co teraz kwitnie.
- `/pora ustaw lato` - przenosi czas do przodu, na początek lata.
- `/pora kwiaty` - co kwitnie w której porze.
- Osiągnięcia: *Coś wisi w powietrzu* (doczekaj zmiany pory) i *Cztery
  pory roku* (bądź w świecie we wszystkich czterech).

## Kwiaty i pory roku

Kwiaty rosną w świecie **cały rok**, ale pąki i kwiaty pokazują tylko
w swojej porze. Poza nią widać sam pierwszy etap - kępę liści.

| Pora | Kwitną |
|---|---|
| wiosna | zawilec (rośnie 4 × szybciej), barwinek, piwonia, gorczyca |
| lato | gorczyca, dzwonek, len, lawenda, szałwia, mikołajek, indygowiec, marzanna, nagietek, cynia |
| jesień | nagietek, cynia, amarantus, kocanka |
| zima | kocanka |
| cały rok | huba, porosty, ochra oraz rośliny spoza paczek (mak, chaber, mniszek, rumianek, trawy, krzaki owocowe) |

Te same rośliny (wszystkie w etapie „kwitnie”) w czterech porach roku:

![Rząd kwiatów wiosną, latem, jesienią i zimą](pory-roku-140.jpg)

Jak to działa:

- **Blok się nie zmienia.** W świecie i w zapisie dalej stoi np. „zawilec
  (kwitnie)”. Zmienia się tylko to, co gra pokazuje: zimą ten sam blok
  wygląda jak młody zawilec. Dzięki temu nic nie trzeba zapisywać ani
  przeliczać w całym świecie, a wiosną kwiaty wracają tam, gdzie były.
- **Celownik, nazwa i zbiór widzą to samo co oko.** Poza porą nie da się
  ściąć kwiatu, którego nie widać - barwniki i zioła z kwiatów są więc
  sezonowe.
- **Wzrost.** W swojej porze roślina rośnie szybciej (domyślnie 3 ×,
  zawilec 4 ×); poza porą odpoczywa i nie rośnie. Roślina posadzona poza
  porą poczeka jako liście.
- **Nie cała łąka naraz.** Każda roślina ma własny termin, zależny od
  miejsca: budzi się w ciągu pierwszych 1,5 doby pory, przez pół doby
  pokazuje pąki, potem kwitnie. Zasypia w ciągu ostatnich 1,5 doby.
  Roślina na dwie pory (nagietek) kwitnie bez przerwy.
- **Poziomy modeli, dalekie chunki, animacje** - wszędzie ten sam
  widoczny etap.

### Nowa roślina z porą

W `assets/rosliny/<roślina>/roslina.json`:

```json
"pory": ["wiosna"],
"wzrostWPorze": 4,
```

- `pory` - od 1 do 3 pór (`wiosna`, `lato`, `jesien`, `zima`); bez tego
  pola roślina wygląda i rośnie tak samo cały rok,
- `wzrostWPorze` - ile razy szybciej rośnie w porze (domyślnie 3),
- pierwszy etap rośliny to jej wygląd poza porą - ma być samymi liśćmi.

## Wydajność

- Rysowanie: bez zmian (te same siatki i materiały).
- Budowanie chunka: jedno sprawdzenie w tablicy na blok; liczenie terminu
  tylko dla kwiatów z porami.
- Zmiana pory **nie przebudowuje świata naraz**. Chunk pamięta chwilę,
  w której zmieni się jego pierwszy kwiat (`chunk.seasonNext`), i tylko
  wtedy przebudowuje swoje rośliny - zwykłą kolejką, po trochu. Co 6
  sekund gra przegląda listę chunków (samo porównanie liczb).
- Zimą jest mniej trójkątów niż dotąd (liście zamiast kwiatów).

## Jak podpiąć coś nowego pod pory roku

`src/sky/Seasons.js` niczego nie rysuje - tylko odpowiada na pytania:

| Funkcja | Co daje | Do czego |
|---|---|---|
| `seasonAt(days)` | `index` 0-3, `key`, `name`, `progress` 0..1, `day`, `year`, `start`, `end` | wszystko, co ma się zmieniać skokiem (co rośnie, co pada) |
| `seasonWeights(days, blendDays)` | cztery udziały pór, suma 1; przez `blendDays` dób wokół granicy mieszają się dwie pory | kolory liści i trawy, światło - płynnie, bez skoku |
| `yearPosition(days)` | miejsce w roku w dobach (0 = początek wiosny) | własne terminy w roku |
| `nextSeasonStart(index, days)` | kiedy zacznie się dana pora | odliczanie, komendy |

Trzy sposoby, zależnie od tego, co się zmienia:

1. **Kolor** (liście jesienią, trawa): policz kolor z `seasonWeights`
   i podaj go shaderowi jako uniform - bez przebudowy chunków. Tak już
   działa kolor nieba i światła.
2. **Wygląd bloku** (kwiat, śnieg na świerku): zrób jak kwiaty -
   `src/blocks/plantSeasons.js`: funkcja „co widać w tym miejscu teraz”
   i „kiedy to się zmieni”, a `ChunkMesher` pyta o nie przy budowaniu
   (`world.seasonDays`, `chunk.seasonNext`). Blok w zapisie zostaje.
3. **Zasada gry** (tempo wzrostu, pogoda): zapytaj `seasonAt` tam, gdzie
   zasada działa. Wspólne miejsce na co-klatkowe rzeczy to
   `Game.updateSeason()`; zdarzenie `season` (`game.achieve('season',
   { key, changed })`) leci przy wejściu do świata i przy każdej zmianie.

Zasady, których warto się trzymać:

- nic nie zapisuj - licz z czasu gry (wtedy działa w starych światach
  i w grze ze znajomymi),
- nie zmieniaj całego świata w jednej klatce - własny termin z miejsca
  (jak kwiaty) albo płynny uniform,
- świat bez pór roku (`world.seasonDays === null`: podglądy, sceny,
  testy) ma wyglądać jak dawniej.

## Znane ograniczenia

- Rośliny spoza paczek (mak, chaber, mniszek, rumianek, trawy z kwiatami)
  nie mają jeszcze pór - kwitną cały rok.
- Zmiana wyglądu z porą nie ma animacji (roślina po prostu się zmienia
  przy przebudowie chunka).
- Daleka roślinność (plamy koloru daleko od gracza) nie zna pór.
- Drzewa, trawa, śnieg i pogoda nie reagują jeszcze na pory.

## Dla programisty

- `src/sky/Seasons.js` - kalendarz.
- `src/blocks/plantSeasons.js` - `shownPlantId`, `nextPlantChange`,
  `plantGrowthFactor`, terminy pobudki i snu.
- `src/blocks/plantPacks.js` - pola `pory`, `wzrostWPorze`.
- `src/world/World.js` - `seasonDays`, `shownBlockId`, `updateSeasons`.
- `src/rendering/ChunkMesher.js` - widoczny etap i `chunk.seasonNext`.
- `src/interaction/VoxelRaycast.js`, `src/rendering/PlantAnimations.js` -
  celownik i animacje na widocznym etapie.
- `src/game/PlantGrowth.js` - tempo wzrostu; `src/game/Game.js` -
  `updateSeason`.
- Test: `node tools/sprawdz_pory_roku.mjs`.
