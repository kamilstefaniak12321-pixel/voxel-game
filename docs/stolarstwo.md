# Stół stolarski i wyroby z drewna (0.90.0)

Pomysł Kamila: stół stolarski długi na dwa bloki. Drewniane bloki robi
się na nim w świecie, prosto na blacie, bez osobnego okna. Wyroby są
z każdego z 20 rodzajów desek:

- **schody**,
- **półbloki**,
- **płoty i furtki**.

![Stół z deskami i wyrobami, płot z furtką, ikonki](stolarstwo-090.jpg)

## W grze

- **Stół stolarski.**
  - Przepis: 2 deski nad 2 patykami (siatka 2 × 2). Wychodzi stół z tego
    drewna, np. *Stół stolarski klonowy*.
  - Stawia się przodem do gracza i zajmuje dwa bloki: ten wskazany i ten
    po prawej. Potrzebne jest wolne miejsce na oba.
  - Rozbicie jednej części zabiera cały stół (wypada jeden).
- **Praca przy stole.**
  - **PPM deskami w lewą część** kładzie deski na blat: cały stos z ręki,
    do 64. Na stole leży naraz jeden rodzaj desek, a im więcej desek, tym
    wyższy stos.
  - Na **prawej części** pojawiają się małe modele wyrobów z drewna
    leżącego na stole. Widać tylko te, na które starczy desek.
  - **PPM w wyrób** zabiera jedną partię do ekwipunku. **Shift + PPM**
    zabiera tyle partii, ile się da.

    | Miejsce na blacie (od przodu) | Wyrób | Deski → sztuki |
    | --- | --- | --- |
    | przód, lewa | schody | 3 → 2 |
    | przód, prawa | półblok | 1 → 2 |
    | tył, lewa | płot | 3 → 2 |
    | tył, prawa | furtka | 4 → 1 |

  - **PPM pustą ręką** (albo czymś innym niż deski) **w deski** zabiera
    je z powrotem.
  - Stołu z deskami na blacie nie da się rozbić. Pojawia się napis
    *Najpierw zabierz deski ze stołu*.
  - Deski na stołach zapisują się razem ze światem
    (`worldInfo.carpenterTables`).
  - Nowe osiągnięcie: *Stolarz*.
- **Schody.**
  - Wyższy stopień stoi po stronie, w którą patrzy gracz, więc idzie się
    po nich do przodu.
  - Kliknięcie w spód bloku albo w górną połowę ściany stawia schody do
    góry nogami.
  - Na schody i półbloki **wchodzi się bez skakania**: stopień do pół
    bloku. Na pełny blok nadal trzeba skoczyć.
- **Półbloki.**
  - Dolny albo górny, zależnie od kliknięcia: w górę bloku daje dolny,
    a w spód bloku albo górną połowę ściany daje górny.
  - Drugi półblok z tego samego drewna dopełnia pierwszy do pełnego
    bloku, który po rozbiciu daje dwa półbloki.
- **Płoty.**
  - Łączą się z płotami, z pełnymi blokami i z furtkami ustawionymi
    wzdłuż płotu.
  - Mają 1,5 bloku wysokości dla kolizji, więc nie da się ich
    przeskoczyć.
- **Furtki.**
  - Stoją w poprzek kierunku patrzenia.
  - PPM otwiera i zamyka. Otwierają się od gracza, a przez otwartą się
    przechodzi.
  - Z Shiftem i blokiem w ręce stawia się blok obok.
- **Wygląd.** Wyroby mają tekstury desek swojego drewna, a słoje biegną
  jak na deskach. W ekwipunku i w dłoni widać prawdziwy model (ten sam
  co w świecie).

## Jak to działa

| Plik | Co robi |
| --- | --- |
| `src/blocks/woods.js` | 20 rodzajów desek, polskie nazwy wyrobów (`woodName`) |
| `src/blocks/woodShapes.js` | bloki 10300-10859 (po 28 na drewno - tylko dopisywać), `shapeInfo`, `shapeId`, kierunki |
| `src/world/ShapeBoxes.js` | pudełka: wygląd, kolizje (płot 1,5), celownik; łączenie płotów (`connectMask`) |
| `src/rendering/ChunkMesher.js` | `addShape` - pudełka z UV pełnej ściany, cienie w rogach na brzegu komórki, łączenie płotów przez `padConnect` |
| `src/player/Player.js` | kolizje z pudełkami (`collisionExtent`), wchodzenie na stopień do pół bloku |
| `src/interaction/VoxelRaycast.js` | celownik trafia w pudełka (i podaje punkt trafienia) |
| `src/interaction/BlockPlacer.js` | kierunek schodów i furtek, górna/dolna połowa, dwa półbloki w jeden |
| `src/game/CarpenterTables.js` | stół: stawianie dwóch części, deski na blacie, wyroby, zapis, furtki |
| `src/rendering/CarpenterTableRenderer.js` | stos desek i miniatury wyrobów na blacie |
| `src/rendering/ShapeGeometry.js` | modele do ikonek, dłoni i miniatur |

Wyroby nie zasłaniają światła (jak liście), ale woda przez nie nie
przepływa.

## Sprawdzanie

`node tools/sprawdz_stolarstwo.mjs` (w `npm test`, 373 sprawdzenia)
sprawdza:

- numery i nazwy bloków oraz przepisy na stół;
- kształty i łączenie płotów;
- kolizje: wejście na półblok i schody bez skoku, pełny blok tylko ze
  skokiem, płot nie do przeskoczenia, zamknięta i otwarta furtka;
- stawianie, w tym dwa półbloki w jeden;
- stół we wszystkich kierunkach: deski, wyroby, Shift, za mało desek,
  jeden rodzaj desek, zabieranie desek, blokada rozbicia, druga część,
  zapis.
