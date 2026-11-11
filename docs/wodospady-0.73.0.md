# Wodospady 0.73.0 — licznik spadku, rozbryzg i rzeki piętrami

Baza: `main` po 0.72.0 (rozlewanie wody, PR #108).

## Licznik spadku

Spadająca woda pamięta, ile bloków już spada. Pierwszy blok pod
krawędzią ma 1 (dawny numer 10107 - stare zapisy się nie zmieniają),
każdy następny bierze liczbę z bloku nad sobą i dodaje 1 - do 16
(numery 10108-10122; dłuższy spadek zostaje na 16). Wszystkie są zwykłą
pełną wodą: pływanie, światło, zapis i symulacja traktują je jak
dotychczasową spadającą wodę (`src/blocks/water.js`,
`WaterSimulation.cell`). Zmiana górnej części strumienia poprawia
liczby niżej tym samym mechanizmem, który rozlewa wodę.

Dół każdego strumienia (spadająca woda nad dnem albo nad taflą)
symulacja zapamiętuje w `landings` (osobno dla każdego wczytanego
chunka). `forEachLanding` podaje doły przy graczu z aktualnym
spadkiem i usuwa nieaktualne.

## Wygląd

- **Bok spadającej wody** niesie spadek w UV (zamiast nurtu; znacznik
  `WATER_FALL_MARK`). *Od 0.87.0 wygląd boku i piany na tafli opisuje
  [wodospady-0.87.0.md](wodospady-0.87.0.md); poniżej - wersja 0.73.0.*
  Shader wody (`waterMaterial`) przewijał teksturę
  `1 + 0,3 × spadek` razy szybciej, w dłuższych smugach
  (`WATER_FALL_STRETCH`), bielszą i mniej przezroczystą (piana). Górne
  40% bloku przechodzi w prędkość bloku nad nim, więc między blokami
  nie ma szwu, a woda przyspiesza płynnie.
- **Rozbryzg** (`src/rendering/WaterfallEffects.js`): z dołów do 40
  bloków od gracza (najwyżej 64 najbliższe) lecą małe sześciany -
  krople w górę i na boki (wyżej i więcej przy wyższym spadku), piana
  na tafli niesiona nurtem (przy wyższym spadku więcej i płynie dłużej,
  więc sięga dalej w dół rzeki) i mgiełka od spadku 6. Jedno rysowanie
  (`CubeParticles`), światło jak w miejscu wodospadu. Tryb ziemniaka -
  około jednej trzeciej cząsteczek.

## Rzeki piętrami

Opis w [rzekach](rzeki.md#wodospady-0730): przy spadku poziomu wody
o 5 bloków i więcej między sąsiednimi kratkami rzeka płynie płasko do
krawędzi i spada, pod spodem sadzawka, dalej rzeka niżej. W seedzie
42 przy (-200, -636) są dwa piętra: 83 → 75 i 75 → 60.

## Sprawdzanie

- `node tools/sprawdz_wodospady.mjs` (w `npm test`): licznik 1-16,
  UV boków, siła rozbryzgu, wodospady seeda 42 - bez schodków przy
  krawędzi, sadzawki głębsze niż koryto, woda nigdzie nie ucieka
  z koryta na boki.
- `node tools/sprawdz_symulacje_wody.mjs`: liczby spadku w kolumnie,
  ograniczenie do 16, doły wodospadów (i ich znikanie po odcięciu).
- Tryb programisty: `/scena wodospady` (3, 8 i 16 bloków);
  w świecie realistycznym `/rzeka wodospad tp`.
