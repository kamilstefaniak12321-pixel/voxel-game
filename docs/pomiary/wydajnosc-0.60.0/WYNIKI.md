# Aktualizacja wydajności 0.60.0 — wyniki odbioru

Stan roboczy: pomiary bazowej wersji 0.59.0 zakończone. Wyniki kandydata
oraz końcowa ocena zostaną dopisane po zamrożeniu kodu i próbach natywnych.
Szczegółowe dane, identyfikatory źródeł i SHA-256 raportów: [wyniki.json](wyniki.json).

## Komputer i wspólna konfiguracja

Windows, Intel Core i5-12500H, 16 logicznych procesorów, około 16 GB RAM.
Natywny renderer: NVIDIA GeForce RTX 3050 Laptop GPU przez ANGLE/D3D11.
Zasilacz potwierdzono odczytem BatteryStatus 2, stan baterii 79%.
Bufor WebGL 1920×1080, DPR 1, ekran 144 Hz, VSync; Naturalna paleta,
materiały Standard, odbicia/liście/refleksy ON, cienie 3, promienie ON,
pełny teren 64, LOD 1024, szczegół 2 i budżet ładowania 4 ms.

Baza to niezmieniony snapshot commita `8aadbe8f878de6c033e4b8750f98c528acd33f20`
wydania 0.59.0, z osobnego `git archive`. Każda aplikacja używa odizolowanego
profilu; zapisy użytkownika nie są otwierane. Kod oraz manifesty mają hashe.
Podczas pomiarów nie uruchamiano równoległych testów CPU ani drugiej gry.

## Powtórzenie audytu CPU na docelowym Windowsie

Oryginalne trzy skrypty z paczki audytu uruchomiono bez modyfikacji
w Node 24.22.0. Zastępstwa atlasu i skina są takie jak w audycie;
to wyniki CPU, nie FPS ani VRAM. Względem Linuxa wartości bezwzględne
są mniejsze, lecz oba główne problemy występują również na tym komputerze.

| Próba bazowa | Wynik |
| --- | ---: |
| Pierwszy chunk, zimny cache — mediana trzech | 169,75 ms |
| Pierwszy chunk — maksimum | 183,80 ms |
| Udział `prepareZone` w pierwszym chunku | 98,07% |
| Ponowne wygenerowanie z gotowym cache — mediana | 1,43 ms |
| Daleki region — mediana trzech | 170,92 ms |
| Wczytane bloki + zimne `fillFlow` — mediana | 176,54 ms |
| Rzeczywiste `World.update` przy dalekim przemieszczeniu — maksimum | 187,68 ms |

| Rośliny w centralnym chunku | Trzy kolejne przebudowy po pierwszej | Trójkąty z podłożem | Tablice CPU |
| --- | ---: | ---: | ---: |
| Brak | 0,63–0,94 ms | 1 024 | 0,11 MB |
| 16 indygowców | 4,24–5,33 ms | 32 028 | 3,39 MB |
| 64 indygowce | 13,62–19,15 ms | 124 850 | 13,98 MB |
| 256 indygowców | 44,83–47,41 ms | 497 088 | 55,67 MB |
| 64 marzanny | 9,58–11,49 ms | 87 252 | 9,77 MB |

Tablice obejmują geometrię CPU. Nie są pomiarem całego RAM ani VRAM.
Synchroniczny test generatora pozostaje kontrolą kosztu obliczeń;
sam nie mierzy przeniesienia pracy do workera w grze.

## Natywna baza 0.59.0

Sesja `performance-baseline-2026-11-04T20-48-26-044Z`, raporty 002–004.
Każda próba ma `valid=true`, `gpuValid=true`, brak błędów gry.
Dokładny przebieg scenariuszy opisuje [README.md](README.md).

| Scenariusz | Czas | Średni FPS | P95 klatki | P99 klatki | Najdłuższa klatka | Klatki >33,33 / >50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Rzeki, zimny teleport i eksploracja | 90 s | 128,60 | 13,90 ms | 19,10 ms | 291,60 ms | 14 / 3 |
| Ogród 64, edycja co sekundę | 60 s | 112,14 | 14,50 ms | 27,60 ms | 83,90 ms | 60 / 8 |
| Próba 256, edycja co sekundę | 60 s | 28,89 | 50,60 ms | 237,40 ms | 285,10 ms | 1029 / 90 |

### Rzeki

Przy zimnym przemieszczeniu pojedyncze `prepareZone` trwa 257,80 ms,
a `generateChunk` 263,50 ms. Odstęp klatek osiąga 291,60 ms. Największy
koszt występuje w zapewnianiu kolumny pod graczem, przed `World.update`;
dlatego maksimum samego `World.update` wynosi tylko 50,10 ms.
Nie wystarcza poprawić wyłącznie kolejki w `World.update`.

GPU ma medianę 6,785 ms i P95 8,928 ms. Po trasie kolejka świata
jest pusta, daleki teren ma 337/337 widocznych kafli i zero brakujących.
Zaobserwowano 243 wywołania przebudowy mesha, z medianą 3,50 ms,
P95 12,90 ms i maksimum 50,10 ms. Dwa długie zadania głównego wątku
zostały zapisane przez `PerformanceObserver`.

### Ogrody

W obu próbach wykonano 60 rzeczywistych edycji bloków, naprzemiennie
usuwając i przywracając roślinę. Dla 64 roślin liczba przebudów wynosi 86,
mediana 26,80 ms, maksimum 41,50 ms; GPU mediana 4,074 ms.

Próba 256 to celowy test skrajnego zagęszczenia. Ma 102 przebudowy,
medianę 95,80 ms i maksimum 133,30 ms. Ciężka jest także praca renderera
na CPU: mediana 34,40 ms, P95 46,00 ms. Mediana GPU wynosi 8,915 ms,
ale P99 33,594 ms i maksimum 129,308 ms. Nie przypisujemy wszystkich
przycięć tej próby samemu generatorowi mesha.

Pole `geometryChanges` nie obejmuje wszystkich podmian buforów istniejącego
mesha; faktyczne zmiany potwierdzają lista edycji i licznik wywołań
`rebuildChunkMesh`. Do FPS używamy wyłącznie odstępów klatek, nie odwrotności
samych czasów CPU lub GPU.

## Ograniczenia porównania

Pierwszą bazową sesję rozpoczęto przed dodaniem przycisku testu IndexedDB
i odczytu statystyk nowego workera do harnessu. Trasa, edycje, główna pętla
pomiarowa i ustawienia obrazu pozostają takie same; manifest przechowuje
oryginalny hash harnessu. Każdy kolejny proces musi identyfikować faktyczny
zestaw plików z chwili uruchomienia. Nie wolno dopisywać wynikom starej sesji
hasha późniejszej wersji.

Każdy dotychczasowy scenariusz natywny wykonano raz. Są to pomiary
konkretnej trasy i ogrodów, nie gwarancja stabilnych 60 FPS w każdym świecie.
Android wymaga oddzielnej kompilacji oraz osobno testu na fizycznym urządzeniu;
ten odbiór sprzętowy dotyczy komputera.
