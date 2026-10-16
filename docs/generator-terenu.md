# Generator terenu - plan rozdziału

Drugi duży rozdział gry, po świetle. Cel: teren **w miarę realistyczny**:
niziny, wyżyny i góry z płynnymi przejściami, szczegółowe formy terenu,
morza, rzeki, które naturalnie spływają z gór do innych rzek albo do
morza, a na tym wszystkim w przyszłości biomy (łąki, lasy...).

Ten plik to mapa drogi: co już jest, jak działa i co robimy dalej,
etap po etapie.

## Gdzie jesteśmy

**Etap 0 - fundamenty (zrobione):**

- **Wyższy świat** - `CHUNK_HEIGHT` 128 zamiast 64 (miejsce na morze,
  niziny, wyżyny i góry). Stare zapisy są automatycznie powiększane.
- **Typy terenu** - każdy świat pamięta swój typ (`worldInfo.terrain`):
  *Realistyczny (w budowie)* albo *Klasyczny* (dawny generator, który
  już się nie zmieni). Wybiera się go przy tworzeniu świata. Światy
  sprzed tej zmiany są klasyczne.
- **Wspólny interfejs generatorów** (`src/world/terrain/generators.js`)
  - z niego korzystają chunki, daleki teren, mapa i komendy.
- **Prototyp generatora realistycznego** (`src/world/terrain/`) -
  pola, makroformy, formy szczegółowe, powierzchnia, morze.
- **Woda wstępna i piasek** - morze do poziomu `SEA_LEVEL` (48), plaże
  i piaszczyste dno. Woda jest już półprzezroczysta, z pływaniem
  (pierwsza część etapu 2 - niżej).
- **Narzędzia**: mapa terenu (`/mapa`, klawisz **M**), opis miejsca
  (`/teren`), szukanie form (`/teren znajdz turnia`).
- **Szybkość przy wyższym świecie** - mesher pomija lity kamień pod
  terenem (`Chunk.solidBelow`), więc budowa meshy jest nawet szybsza
  niż przy świecie 64.

**Etap 1 - w toku:**

- **Budowa geologiczna** (zrobione) - zamiast samego kamienia:
  granit, wapień, piaskowiec, łupek, bazalt i kamień, każdy w swoim
  miejscu; lepidolit tylko jako rzadkie żyły w granicie. Opis niżej.
- **Pierwsze rośliny** (zrobione, przed biomami) - na trawie rośnie
  trawa (od rzadkiej do gęstych łąk - pole `meadows`), kępy kwiatów
  zwykle jednego gatunku (pola `flowers` i `flowerSpecies`), paprocie
  tam, gdzie wilgotno (pole wilgotności klimatu) i na wyżynach,
  a pojedynczo koniczyna, babka, pokrzywa i mniszek. Roślina jest
  częścią `fillColumn`, więc kolumna z `columnBlocks` zgadza się
  z chunkiem. Liczby: `PLANTS` w `TerrainShape.js`. Nowe ziemie
  (czarnoziem, ściółka, błoto, glina, ziemia kamienista, żwir) są na
  razie tylko w trybie kreatywnym - trafią do generatora z biomami.
- **Krzaki owocowe** (zrobione) - rzadkie zarośla truskawek, jeżyn,
  papryczek chili i leszczyny (pole `bushes` > `bushThreshold`; gatunek
  z pola `bushSpecies`, zmienia się co ~140 bloków), w różnych etapach
  wzrostu - najczęściej z owocami. Około pół procent kolumn z trawą.
  Dzikie krzaki rosną dalej dopiero w chunku zmienionym przez gracza
  (`src/game/PlantGrowth.js`). Liczby: `bush...`
  w `PLANTS` (`TerrainShape.js`).

## Jak działa generator realistyczny

```
seed ──► POLA (gładkie mapy szumu)                       TerrainShape.js: SCALES
           kontynent, wypiętrzenie, erozja, grzbiety,
           kotliny, płaskowyże, wąwozy, żleby, turnie,
           depresje, klimat (temperatura, wilgotność)
            │
            ▼
         MAKROFORMY                                       CONTINENT_PROFILE, UPLAND_..., MOUNTAIN_...
           morze → wybrzeże → niziny → wyżyny → góry
           (wszystkie przejścia płynne: pogórza, krawędzie)
            │
            ▼
         FORMY SZCZEGÓŁOWE                                HILLS, CRAG_..., RAVINE_..., BASIN_...
           wzgórza, pagórki, grzbiety, turnie,
           doliny, kotliny, wąwozy, żleby, depresje,
           równiny, równie, płaskowyże
            │
            ▼
         POWIERZCHNIA I WODA                              ROCK_LINE, ROCK_SLOPE, BEACH_HEIGHT
           trawa / ziemia, skała (strome zbocza, szczyty),
           piasek (plaże, dno), woda do poziomu morza
            │
            ▼
         SKAŁY POD ZIEMIĄ                                 Geology.js; GRANITE_..., STRATA, LEPIDOLITE
           bazalt, granit, kamień, warstwy osadowe,
           żyły lepidolitu
```

Każda kolumna (x, z) jest liczona niezależnie - tylko z seeda
i pozycji (`RealisticGenerator.compute`). Dzięki temu chunki można
generować w dowolnej kolejności i zawsze do siebie pasują, a daleki
teren i mapa liczą ten sam teren (z mniejszą dokładnością).

**Pola** to szum o różnych skalach. Kontynent i wypiętrzenie są
dodatkowo "wykrzywiane" (domain warping), żeby brzegi i pasma gór nie
były okrągłymi plamami. Pola klimatu na razie widać tylko na mapie
(`/mapa temperatura`, `/mapa wilgotnosc`) - przydadzą się przy biomach.

**Wszystkie liczby** do strojenia są w `src/world/terrain/TerrainShape.js`,
z opisami. Najwygodniej stroić tak: zmienić liczbę, odświeżyć grę,
`/mapa formy 16` - i widać efekt na kilku kilometrach terenu.

## Budowa geologiczna

Każda kolumna ma pod glebą (trawa + 3 ziemi) albo piaskiem (3 bloki)
kilka pięter skał (`src/world/terrain/Geology.js`):

```
 y 127  ┌──────────────────────────────────────────────┐
        │  gleba / piasek                              │
        │  WARSTWY OSADOWE  (pasy po 4 bloki, lekko     │  sięgają ~22 bloki
        │  pofalowane; w górach mocno pofałdowane)      │  pod powierzchnię
        │  KAMIEŃ                                       │
        │  GRANIT   (pod nizinami od y ~16, pod wyżynami │
        │           ~24, pod górami tuż pod powierzchnią│
        │           albo na wierzchu) + żyły lepidolitu │
 y 0    │  BAZALT   (najgłębsze 2-6 bloków)              │
        └──────────────────────────────────────────────┘
```

Z jakich skał są warstwy, zależy od krajobrazu (`STRATA`
w `TerrainShape.js`). Każda warstwa ciągnie się daleko w bok, a na
granicy krajobrazów zmienia skałę - jak prawdziwe skały osadowe.

| skała | gdzie | na powierzchni |
|---|---|---|
| **granit** | podłoże pod całym lądem; pod górami tuż pod powierzchnią | granitowe szczyty i turnie |
| **łupek** | warstwy w górach (na przemian z kamieniem, pofałdowane) | zbocza gór |
| **wapień** | warstwy na wyżynach (~65%) i płaskowyżach | białe urwiska wyżyn, krawędzie wąwozów |
| **piaskowiec** | warstwy na nizinach, wybrzeżach (pod plażą) i płaskowyżach | klify, krawędzie płaskowyżów (pasy z wapieniem) |
| **kamień** | między granitem a warstwami; część warstw na nizinach i w górach | wszędzie po trochu |
| **bazalt** | dno świata; pod głębokim morzem zamiast granitu (skorupa oceaniczna) | dno głębokiego morza (pod piaskiem) |
| **lepidolit** | cienkie, powyginane żyły tylko w granicie, w rzadkich skupiskach | rzadko - tylko gdzie granit jest na wierzchu |

Lepidolit (~0,3% skał, dawniej ~2,6%): pod nizinami jest głęboko
(y ~5-15, w granicie), pod górami płycej. Na powierzchnię wychodzi
w nielicznych miejscach (`LEPIDOLITE.OUTCROP`).

Sprawdzanie: `/skaly` (kolumna pod graczem), `/skaly statystyki`,
`/skaly znajdz granit tp`, `/skaly zyla tp`, `/mapa skaly`,
`/mapa przekroj` (przekrój pionowy), `/demo skaly` (odkrywka w świecie).

Klasyczny teren zostaje bez zmian (sam kamień i lepidolit jak dawniej).

## Formy terenu

Klucz w nawiasie to nazwa w kodzie (`landforms.js`), na mapie i w
`/teren znajdz` (bez polskich znaków).

### Formy wypukłe

| forma | jak powstaje teraz | dalej |
|---|---|---|
| **góry** (`mountains`, `gory`) | duże wypiętrzenie: podnóże + grzbiety; przy dużej erozji niższe i łagodniejsze | różne typy gór (alpejskie, łagodne, stołowe), pogórza z dolinami rzek |
| **wzgórza** (`hill`, `wzgorze`) | falowanie terenu, silniejsze na wyżynach i w górach | wzgórza morenowe, ostańce |
| **pagórki** (`hillock`, `pagorek`) | drobne garby, głównie na nizinach | pola wydm przy morzu |
| **grzbiety** (`ridge`, `grzbiet`) | linie pola grzbietów (szum "ridged") | grzbiety boczne odchodzące od głównych |
| **turnie** (`crag`, `turnia`) | skalne iglice na najwyższych graniach | pojedyncze skałki na wyżynach |

### Formy wklęsłe

| forma | jak powstaje teraz | dalej |
|---|---|---|
| **doliny** (`valley`, `dolina`) | między grzbietami gór i w obniżeniach falistego terenu | doliny rzeczne (etap 3): V w górach, płaskie dno na nizinach |
| **kotliny** (`basin`, `kotlina`) | pole kotlin obniża góry i wyżyny - płaskie dno otoczone górami | jeziora w kotlinach, rzeki z nich wypływające |
| **wąwozy** (`ravine`, `wawoz`) | wąskie, głębokie pasy rozcinające wyżyny (też płaskowyże) | wąwozy wyżłobione przez potoki |
| **żleby** (`gully`, `zleb`) | rynny na zboczach gór (nie na grani, nie w dolinie) | żleby skierowane w dół stoku, z piargami u wylotu |
| **depresje** (`depression`, `depresja`) | suche obniżenia poniżej poziomu morza na nizinach, z dala od brzegu | wały / mierzeje oddzielające je od morza |

### Formy płaskie

| forma | jak powstaje teraz | dalej |
|---|---|---|
| **równiny** (`plain`, `rownina`) | duża erozja wygładza niziny | równiny zalewowe rzek |
| **równie** (`flat`, `rownia`) | płaskie miejsca wśród gór (półki, szerokie dna) | hale i polany (biomy) |
| **płaskowyże** (`plateau`, `plaskowyz`) | wyżyna ułożona w stopnie: płaskie wierzchy, strome krawędzie | krawędzie z urwiskami, wodospady |

Do tego pasy wysokości jak na mapie fizycznej: **nizina** (do 14 bloków
nad morzem), **wyżyna** (15-31), **góry** (32 i więcej), **depresja**
(ląd poniżej morza) i **morze**.

## Plan - etapy

### Etap 1 - rzeźba terenu (dopracowanie)

Co: dopracować kształty z prototypu, aż teren będzie wyglądał
naturalnie z bliska i z daleka.

- ~~rodzaje skał i budowa geologiczna~~ (zrobione - opis wyżej);
  dalej: żwir i glina, ostańce wapienne, kolor skał na dalekich
  górach zależny od skały,
- przejścia: pogórza między nizinami a górami, krawędzie wyżyn,
  wybrzeża (klify przy górach, płaskie plaże przy nizinach),
- góry: mniej "płaskowyżu z graniami", więcej zboczy; grzbiety boczne;
  różne typy gór zależnie od erozji,
- płaskowyże ze ścianami skalnymi, ostańce,
- żleby skierowane w dół stoku (kierunek z nachylenia terenu),
- strojenie częstości form (cel: niziny ~45%, wyżyny ~20%, góry ~15%,
  morze ~20%),
- szybkość: generowanie chunka < 2 ms.

Sprawdzanie: `/mapa formy`, `/mapa pasy`, `/teren znajdz <forma> tp`,
porównanie kilku seedów.

### Etap 2 - woda

Co: prawdziwa woda zamiast wstępnej.

- (zrobione) przezroczysta woda (osobna, półprzezroczysta grupa meshu
  chunka rysowana po zwykłych blokach), lekko obniżona i falująca
  powierzchnia, płynąca tekstura,
- (zrobione) pływanie, wolniejszy ruch w wodzie, mgła i barwa pod wodą,
  dno ciemniejące z głębokością (światło nieba w meshu, nie w silniku
  światła), dźwięki,
- jeziora: zagłębienia terenu wypełnione wodą do poziomu przelewu,
- wybrzeża: plaże, żwir, klify; fale (animacja tekstury),
- woda w dalekim terenie z odbiciem nieba,
- stawianie i niszczenie wody (wiadro) - prosto, bez płynięcia;
  płynięcie wody jako osobny, późniejszy krok.

### Etap 3 - rzeki

Co: rzeki, które zaczynają się w górach, łączą się w większe
i uchodzą do morza (albo do jeziora).

Pomysł (hydrologia na zgrubnej siatce):

1. **Zgrubna mapa wysokości** - teren z generatora co ~16-32 bloki,
   w regionach (np. 1024 x 1024 bloki) z zapasem na brzegach.
2. **Kierunek spływu** - z każdej kratki woda płynie do najniższej
   sąsiedniej. Zagłębienia bez odpływu są "wypełniane" (algorytm
   priority-flood) - tak powstają jeziora i przelewy.
3. **Przepływ** - ile kratek spływa przez daną kratkę. Gdzie przepływ
   przekracza próg - jest rzeka; im większy, tym szersza i głębsza
   (szerokość ~ pierwiastek z przepływu). Dopływy łączą się same,
   bo woda zawsze płynie w dół.
4. **Koryto i dolina** - wzdłuż rzeki teren jest obniżany: w górach
   wąska dolina w kształcie V, na nizinach szerokie, płaskie dno.
   Poziom wody opada wzdłuż rzeki, więc nigdy nie płynie pod górę.
5. **Ujście** - przy morzu rzeka się poszerza (estuarium, czasem delta).

Trudność: świat nie ma końca, a rzeka przechodzi przez wiele regionów.
Plan: regiony liczone niezależnie z dużą zakładką (wynik dla tego
samego miejsca zawsze ten sam), główne dorzecza na jeszcze rzadszej
siatce, a szczegóły rzeki dopiero w chunku. Liczenie regionu może
trwać dłużej - wtedy w osobnym wątku (Web Worker), z wyprzedzeniem.

Sprawdzanie: warstwa `/mapa rzeki`, `/teren znajdz rzeka`,
`/rzeka` (skąd płynie i dokąd).

### Etap 4 - biomy

Co: łąki, lasy i inne krajobrazy na podstawie rzeźby i klimatu.

- klimat: temperatura (spada z wysokością - już jest), wilgotność
  (więcej przy morzu i rzekach), odległość od morza,
- biomy: łąka, las liściasty, las iglasty, bór, mokradła (przy rzekach
  i w depresjach), plaża i wydmy, hale (równie w górach), skaliste
  góry, ośnieżone szczyty,
- płynne granice biomów (mieszanie kolorów trawy, przenikanie roślin),
- nowe bloki: drewno, liście, śnieg (żwir, glina, czarnoziem, ściółka,
  błoto, trawy, paproć, zioła i kwiaty już są - do rozmieszczenia
  w biomach),
- drzewa i rośliny: rozmieszczane z seeda tak, żeby drzewo na granicy
  chunków pasowało po obu stronach,
- daleki teren i mapa w kolorach biomów (`/mapa biomy`).

### Później

Jaskinie, rudy i warstwy skał, wodospady, klify nadmorskie, pory roku.

## Zasady techniczne

- **Deterministycznie**: teren zależy tylko od seeda i pozycji -
  żadnego `Math.random()` w generatorze.
- **Chunk po chunku**: każdy chunk da się wygenerować sam; rzeczy
  większe niż chunk (rzeki, drzewa) liczymy tak, żeby każdy chunk
  dostał ten sam wynik dla wspólnych miejsc.
- **Typy terenu**: generator klasyczny już się nie zmienia. Realistyczny
  zmienia się z każdym etapem - w istniejących światach realistycznych
  niezmienione chunki dostaną nowy kształt, a zmienione przez gracza
  zostają (na ich brzegach mogą być uskoki). Gdy generator będzie
  gotowy, zamrozimy jego wersję (jak klasyczny) i dalsze zmiany pójdą
  do nowego typu.
- **Wydajność**: realistyczny liczy ~3 µs na kolumnę, wygenerowanie
  chunka to ~1 ms razem ze skałami (klasyczny ~0,5 ms), mesh ~0,2 ms.
  Szum żył lepidolitu jest liczony w punktach co 2-4 bloki i tylko
  do wysokości granitu. Każdy kolejny
  etap (rzeki, biomy, drzewa) ma się zmieścić tak, żeby cały chunk
  był gotowy w kilku ms (`/wydajnosc`, `/wydajnosc test`).
- **Wysokość świata**: 128 bloków (morze na 48). Chunk zajmuje teraz
  ~160 KB (bloki + światło), więc przy największym zasięgu widzenia
  (384) to ~300 MB. Gdyby góry miały być dużo wyższe albo pamięć
  zaczęła przeszkadzać - podział chunków na sekcje 16 x 16 x 16
  (puste powietrze i lita skała bez tablic).

## Narzędzia

| narzędzie | do czego |
|---|---|
| `/mapa [warstwa] [skala]`, klawisz **M** | mapa z góry: `teren` (wysokość), `formy`, `pasy`, pola (`kontynent`, `wypietrzenie`, `erozja`, `grzbiety`, `gory`, `wyzyny`, `temperatura`, `wilgotnosc`); skala 1-32 bloki na punkt |
| `/teren [x z]` | wysokość, pas wysokości, forma, powierzchnia i wartości pól w miejscu |
| `/teren znajdz <forma> [promień] [tp]` | najbliższe miejsce z formą (np. `turnia`, `kotlina`, `wawoz`, `morze`) |
| `/skaly`, `/skaly statystyki [promień]` | skały w kolumnie pod graczem; udział skał w okolicy |
| `/skaly znajdz <skała> [promień] [tp]`, `/skaly zyla [tp]` | najbliższa odsłonięta skała; najbliższa żyła lepidolitu |
| `/mapa skaly`, `/mapa przekroj` | mapa skał (pod glebą); przekrój pionowy w kierunku patrzenia |
| `/demo skaly` | odkrywka - wykop do dna świata, na ścianach widać warstwy |
| `/horyzont lod`, `/wydajnosc` | daleki teren i szybkość |

## Ustalone z Kamilem

- Góry do ~70 bloków nad morzem - na razie wystarczą (świat 128).
- Morza i lądy - zostają takie jak teraz.
- Nowe światy są domyślnie realistyczne.

## Do ustalenia

- Lista biomów na start (etap 4).
