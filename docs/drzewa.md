# Drzewa

Sześć gatunków drzew z koncepcji Kamila: **świerk pospolity**, **sosna
zwyczajna**, **buk zwyczajny**, **lipa drobnolistna**, **dąb szypułkowy**
i **brzoza brodawkowata**. Każdy ma swoje bloki, dodatki, wygląd w świecie
i miejsca, w których rośnie. To pierwszy kawałek etapu 4 (biomy) z
`docs/generator-terenu.md` - same drzewa i lasy, jeszcze bez biomów.

Nowe gatunki można dodawać **bez programowania** - jako paczki drzew
w `assets/drzewa/` (przykład: jabłoń). Instrukcja krok po kroku:
[`docs/drzewa-paczki.md`](drzewa-paczki.md).

![Drzewa w grze](drzewa-galeria.jpg)

![Bloki i dodatki drzew](drzewa-bloki.png)

## Bloki

Każdy gatunek ma pięć bloków (`src/blocks/trees.js`):

| Blok | Nazwa (np. dąb) | Opis |
|---|---|---|
| pień | `oak_log` | kora z boku, słoje na górze i na dole |
| okorowany pień | `oak_log_stripped` | gładkie drewno (siekiera: PPM na pniu) |
| deski | `oak_planks` | cztery deski z usłojeniem |
| liście / igliwie | `oak_leaves` | z prześwitami - widać przez nie głąb korony |
| sadzonka | `oak_sapling` | wyrasta w całe drzewo |

(świerk - `spruce_...`, sosna - `pine_...`, buk - `beech_...`, lipa -
`linden_...`, brzoza - `birch_...`)

**Dodatki:**

| Gatunek | Dodatek | Co to jest |
|---|---|---|
| świerk | `spruce_cone` - szyszka świerka | wypada z igliwia, posadzona daje sadzonkę |
| świerk | `spruce_wreath` - wieniec świerkowy | dekoracja na ścianę (PPM na boku bloku) |
| sosna | `pine_log_upper` - pień sosny (górny) | rudopomarańczowa, łuszcząca się kora - góra pnia sosny |
| sosna | `pine_log_resin` - pień sosny z żywicą | PPM zbiera żywicę (zostaje zwykły pień) |
| sosna | `pine_cone` - szyszka sosny, `resin` - żywica | szyszka do posadzenia, kropla żywicy |
| buk | `beechnuts` - orzeszki bukowe | wypadają z liści, posadzone dają sadzonkę |
| buk | `beech_leaf_litter` - opadłe liście buka | rude liście leżące na ziemi pod bukiem |
| lipa | `linden_leaves_flowering` - kwitnące liście lipy | PPM zbiera kwiaty (zostają zwykłe liście) |
| lipa | `linden_flower` - kwiat lipy (z przysadką) | posadzony daje sadzonkę |
| dąb | `acorn` - żołądź | wypada z liści, posadzony daje sadzonkę |
| dąb | `oak_leaf_litter` - opadłe liście dębu | brązowe liście na ziemi pod dębem |
| brzoza | `birch_bark` - kora brzozowa | z okorowania brzozy siekierą |
| (wszystkie) | `axe` - siekiera | PPM na pniu - okorowany pień |

## Jak wyglądają w świecie

Kształt drzewa układa `src/world/trees/TreeShapes.js` - każdy gatunek
to jedna funkcja. Ten sam seed daje zawsze to samo drzewo; drzewa są
różnej wielkości (size 0-1).

- **Świerk** - wysoki (13-20 bloków), wąski stożek z pięter gałęzi
  (każde piętro na dole szersze), końce najniższych gałęzi piętra lekko
  opadają, ciemne igliwie do samego czubka.
- **Sosna** - najwyższa (15-22), długi goły pień: dół z grubą ciemną
  korą, góra rudopomarańczowa; na samej górze parasol z kilku osobnych
  kęp igliwia na krótkich gałęziach. Czasem z pnia wycieka żywica.
- **Buk** - gładki szary pień, szeroka (promień 3-5), gęsta, lekko
  spłaszczona korona z kopułkami na wierzchu i konarami w środku;
  pod spodem rude opadłe liście.
- **Lipa** - gruby ciemny pień z nabiegami korzeniowymi, wysoka,
  zaokrąglona, bardzo gęsta korona; zwykle kwitnie (żółte kwiatki na
  wierzchu korony).
- **Dąb** - duży: pień 2 x 2, krótki i gruby, 3-4 konary rozchodzące się
  na boki i w górę, na ich końcach kępy liści - szeroka (do 7 bloków od
  pnia), nieregularna korona; mały: pień 1 x 1 i 2-3 konary. Pod spodem
  brązowe opadłe liście.
- **Brzoza** - smukła (10-14), biały pień z czarnymi kreskami, czasem
  lekko pochylony; wąska, wysoka, ażurowa korona (dużo prześwitów)
  ze zwisającymi gałązkami.

**Liście** to sześciany z prześwitami (model `leaves`): przez dziurki
w liściach widać liście głębiej w koronie (rysowane są tylko przy
wierzchu korony - dwie warstwy, głębiej i tak prawie nic nie widać).
Liście **przepuszczają światło**, ale pełne światło nieba wpada tylko do
pierwszego bloku liści, a dalej słabnie o 1 na blok - pod koroną i
w gęstym lesie jest cień (`src/world/Light.js`). W kątach korony są
cienie (jak przy zwykłych blokach). Na liściach da się stać (mają
kolizję).

Ustawienie **Liście drzew** (*Ustawienia → Obraz*, `/ustaw liscie`):
*Ładne* - z prześwitami, *Szybkie* - bez ścian w środku korony
i z zamalowanymi prześwitami (dużo mniej do rysowania - las nie
spowalnia gry). Na telefonie domyślnie szybkie, w trybie ziemniaka
zawsze szybkie.

## Gdzie rosną

Tylko w terenie **realistycznym** (klasyczny się nie zmienia). Kod:
`src/world/trees/Forests.js`, liczby do strojenia: `FORESTS`
w `src/world/terrain/TerrainShape.js`.

- **Siatka:** drzewa stoją na siatce co 4 bloki - w kratce najwyżej jedno,
  w losowym miejscu kratki. Czy jest, jakiego gatunku i jak duże -
  zależy tylko od seeda i kratki, więc każdy chunk wie, jakie drzewa
  rosną obok niego, i wstawia u siebie ich kawałki (korona drzewa
  z sąsiedniego chunka wchodzi do tego). Drzewo na granicy chunków
  zawsze pasuje po obu stronach.
- **Gęstość lasu:** pole lasów (plamy ~190 bloków) - łąki z pojedynczymi
  drzewami ↔ gęste lasy (drzewo w połowie kratek); w suchym klimacie
  lasy są rzadsze, w wilgotnym gęstsze; drzewa rosną do kilku bloków
  poniżej granicy gołej skały (góry mają nagie szczyty); tylko na trawie
  i niezbyt stromo. Mniej więcej 1/3 lądu to lasy.
- **Gatunek** - klimat (temperatura, wilgotność, wysokość nad morzem)
  i plamy gatunków (~150 bloków - w lesie przeważa jeden, dwa gatunki,
  na granicach lasy są mieszane):
  - świerk - zimno: wysoko w górach i w chłodnym klimacie,
  - sosna - sucho (bory), także nad samym morzem,
  - buk - wyżyny i pogórza, umiarkowanie wilgotno,
  - lipa - ciepło i wilgotno, niziny i wyżyny (z dębem),
  - dąb - ciepłe niziny,
  - brzoza - wilgotno i nisko (blisko wody), chłodniej.
- **Pod drzewem:** pień wchodzi w trawę i rośliny (nie w ziemię ani skałę),
  na stoku schodzi w dół do gruntu; pod bukiem i dębem leżą opadłe
  liście.
- **Daleki teren:** z daleka las widać jako korony drzew - teren
  podniesiony do wysokości koron, w kolorze liści gatunku, który tam
  przeważa (także na kuli Ziemi z kosmosu).
- **Mapa:** `/mapa lasy` - gatunek, który przeważa (kolor), i gęstość
  lasu (im mocniejszy kolor, tym gęściej). `/teren` też mówi o lesie.

Start nowego świata nigdy nie wypada przy pniu drzewa, a gracz staje na
ziemi (nie na koronie). Meteoryt zmiata drzewa nad kraterem.

## Rozgrywka

- **Sadzonka** wyrasta w całe drzewo średnio po `TREE_GROWTH_SECONDS`
  sekundach (`src/config.js`, teraz 5 minut), każda w swoim czasie -
  tak jak krzaki: w chunkach wczytanych wokół gracza i zmienionych
  przez niego. Drzewo rośnie tylko wtedy, gdy pień ma miejsce (blok
  nad sadzonką - czeka dalej); liście omijają to, co zajęte. Każde
  wyrośnięte drzewo jest trochę inne (losowy rozmiar).
- **Sadzenie:** sadzonka na ziemi albo nasiono w ręce + PPM na ziemi:
  szyszka świerka i sosny, orzeszki bukowe, kwiat lipy, żołądź (brzoza -
  tylko sadzonka).
- **Siekiera** (`/daj axe`): PPM na pniu - okorowany pień; z brzozy
  jeszcze kora brzozowa. PPM z czymś innym w ręce stawia blok normalnie.
- **Żywica:** PPM na pniu sosny z żywicą (1-2 krople). **Kwiaty lipy:**
  PPM na kwitnących liściach (1-2 kwiaty).
- **Przygoda:** pień daje pień, liście - liście, a czasem jeszcze
  sadzonkę (5-7%) i nasiono gatunku (szyszkę, orzeszki, żołądź - 8-10%).
- **Wieniec świerkowy** wisi na boku bloku (nie na górze ani pod spodem)
  i znika razem z blokiem, na którym wisi. Opadłe liście leżą na
  pełnym bloku i też znikają, gdy go zabraknie; postawiony blok je
  zastępuje (jak trawę).

## Osiągnięcia

*Drwal* (zetnij pień), *Brzozowy papirus* (kora brzozowa siekierą),
*Leśniczy* (pień każdego z sześciu gatunków), *Z małego ziarenka*
(wyhoduj drzewo z sadzonki). Lista: `docs/osiagniecia.md`.

## Komendy

| Komenda | Co robi |
|---|---|
| `/drzewa` | ile drzew rośnie w okolicy (gatunki), las w miejscu gracza |
| `/drzewa posadz <gatunek> [0-100]` | drzewo 5 bloków przed tobą (rozmiar 0 - małe, 100 - duże) |
| `/drzewa <gatunek>` | to samo, krócej - np. `/drzewa dab` |
| `/drzewa aleja` | wszystkie sześć gatunków w rzędzie przed tobą |
| `/drzewa znajdz <gatunek> [tp]` | najbliższe drzewo gatunku w świecie (tp - przeniesienie pod nie) |
| `/drzewa rosnij` | sadzonki do 64 bloków od ciebie rosną od razu |
| `/drzewa tempo <0-500>` | szybszy wzrost (to samo co `/krzaki tempo`) |
| `/mapa lasy` | mapa lasów |

Gatunki w komendach: `swierk`, `sosna`, `buk`, `lipa`, `dab`, `brzoza`
(albo po angielsku).

## Tekstury i dźwięki

Tekstury drzew rysuje **`tools/tekstury_drzew.py`** (ten sam styl
i narzędzia co `tools/tekstury.py`): kora z płytek, łusek albo bruzd,
słoje od środka pnia, deski z usłojeniem, liście z pojedynczych
listków albo igieł z przezroczystymi prześwitami, sadzonki i przedmioty
z ciemnym obrysem. `python tools/tekstury_drzew.py [podglad.png]`.
Wiersze 5-8 atlasu.

Pnie i deski mają nowy materiał dźwięków **drewno** (`wood` - ciepłe,
głuche puknięcie; przy niszczeniu ciche trzaski drzazg), liście -
szelest liści (`plant`). `tools/dzwieki.py`.

## Do zrobienia później

- biomy (łąka, las liściasty, iglasty, bór, mokradła...) - lasy staną
  się ich częścią, ściółka leśna pod drzewami,
- rzeki (brzozy i olchy nad wodą),
- liście opadające jesienią, śnieg na świerkach (pory roku),
- deski i inne bloki z pni (crafting).
