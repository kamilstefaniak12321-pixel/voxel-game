# 0.71.0 — pamięć zapisów i koszt doczytywania

Baza: wydana wersja 0.70.0, commit `635d2a6174e280b1e1e0fb87e12fc5eb48925575`.
Ta zmiana ogranicza przechowywane tablice zapisanych bloków i pracę CPU
przy aktualizacji dalekiego terenu. Nie zmienia poziomów szczegółowości,
shaderów, rozdzielczości, reguł świata ani trwałego formatu zapisów.

## Co jest mierzone

- 4096 zapisanych chunków 16×128×16: na przemian stare Uint8 i nowe Uint16,
  warstwy gruntu, nierówna powierzchnia, budowle i drobna podziemna edycja.
  Źródłowe tablice zajmują 192 MiB. Trasa odczytu odwiedza 512 kolejnych
  chunków, a następnie wraca do wybranych wcześniejszych miejsc.
- Osobny świat 64 losowych chunków Uint16 sprawdza przypadek
  nieskompresowalny. To kontrola kosztu, nie reprezentatywny krajobraz.
- Node mierzy sam odczyt stron z portu bazy, kompresję i odtwarzanie.
  **Nie jest to pomiar IndexedDB, FPS ani fizycznego GPU.**
- Workflow „Pamięć zapisów — porównanie A/B” używa prawdziwego Chromium
  i IndexedDB. Trzy pary są wykonywane kolejno A/B, B/A, A/B na jednym
  runnerze; oba warianty używają tego samego skryptu i tych samych danych.
  Każdy wariant ma osobny, usuwany profil, a strona jest przeładowywana
  po przygotowaniu bazy, aby pozbyć się buforów użytych do jej wypełnienia.
- Oddzielne sprawdzenie po pomiarze uruchamia rzeczywistą grę: odczytuje
  podziemną edycję, zmienia blok, zapisuje, wyładowuje i odwiedza chunk,
  zamyka grę i uruchamia ją ponownie z potwierdzonym zapisem.

## Wyniki CPU i pamięci

Lokalny Node 24.22.1, AMD EPYC 9V74; trzy próby każdego wariantu.
Poniżej mediany. Przygotowanie obejmuje generujący strony port bazy,
kompresję i budowę podsumowań; nie obejmuje prawdziwego dysku.

| Metryka | 0.70.0 | 0.71.0 |
| --- | ---: | ---: |
| Bufory zapisu po otwarciu | 192 MiB | 11,408 MiB |
| Bufory zapisu po 512 odwiedzinach | 192 MiB | 17,408 MiB |
| Przygotowanie danych | 37,288 ms | 757,232 ms |
| p95 pojedynczego odczytu chunka | 0,000611 ms | 0,031527 ms |
| Losowe dane: bufory po 64 odczytach | 4 MiB | 8,047 MiB |

Po przejściu typowego zapisu bufory są mniejsze o **90,93%**. Nowy wynik
zawiera 8,408 MiB spakowanych bloków, 3 MiB podsumowań powierzchni oraz
6 MiB odtworzonych tablic w 128 wpisach cache. W tej próbie dodany koszt
przygotowania to około **720 ms**; nie przedstawiamy go jako przyspieszenia
otwierania świata. W losowych danych kompresja nie pomaga: kopie cache
zwiększają pamięć. Wyniki surowe:
[saved-cpu-baseline.json](saved-cpu-baseline.json),
[saved-cpu-candidate.json](saved-cpu-candidate.json).

Wyniki rzeczywistego Chromium/IndexedDB i stan sprawdzeń są podane w opisie
PR. Artefakt Actions `pamiec-zapisow-ab` zachowuje osobne wyniki wszystkich
par, `comparison.json`, wersję przeglądarki, sprzęt runnera, skróty kodu
i skryptów oraz logi Chrome. Nie należy utożsamiać czasów lokalnego Node
z czasami przeglądarki.

Mikrobenchmark dalekiego terenu porównuje poprzednie funkcje z nowymi
na identycznych danych: 10 000 zapisanych zmian, 613 wczytanych chunków,
1024 kafelki oraz zapytanie o obszar 25 chunków. Po rozgrzewce wykonuje
dziewięć naprzemiennych par. [far-cpu.json](far-cpu.json) zawiera wszystkie próbki.

| Fragment aktualizacji dalekiego terenu | 0.70.0 | 0.71.0 |
| --- | ---: | ---: |
| Wyszukanie lokalnych zmienionych chunków | 2,17748 ms | 0,00324 ms |
| Przeliczenie zmienionej maski pokrycia | 0,07585 ms | 0,04483 ms |
| Przebudowa siatki bez zmiany pokrycia | 0,07550 ms | 0,02056 ms |

To czasy pojedynczych funkcji na określonym obciążeniu, nie całej klatki.

## Zgodność i granice wyniku

Testy automatyczne sprawdzają kopie bit w bit, starsze 64-warstwowe zapisy,
migrację Uint8, wodę i jaskinie, ujemne współrzędne, błędy transakcji,
ponowienie starszego zapisu po nowszej edycji, wyjście z gry, wyrzucanie
cache i odrzucanie wyłącznie naprawdę nieaktualnych wyników workera.
Regresje dalekiego terenu porównują identyczne bajty masek, powierzchnie,
geometrię i indeksy cieni.

Spakowane migawki nadal rosną z liczbą i złożonością zmienionych chunków.
Stały limit 8 MiB/128 wpisów dotyczy wyłącznie cache pełnych tablic.
Nieskompresowalne dane mogą wymagać surowej migawki oraz rozpakowanej
kopii; raport ujawnia osobno ten przypadek. Liczniki obejmują bufory danych,
nie wszystkie obiekty, indeksy i zasoby przeglądarki ani pamięć GPU.
Otwarcie świata płaci koszt kompresji; podajemy także ten czas i koszt
dekodowania podczas przejścia, nie tylko oszczędność pamięci.

Lokalna piaskownica nie pozwalała uruchomić Chromium (odmowa systemowego
wywołania `socket()` przed załadowaniem gry). Dlatego sprawdzenie przeglądarkowe
wykonuje CI; jego wynik i ewentualne ograniczenia są zapisane w opisie PR. SwiftShader w sprawdzeniu obrazu nie jest pomiarem karty
gracza. Nie deklarujemy procentowego wzrostu FPS ani stałych 60 FPS.

## Powtórzenie

```sh
node tools/sprawdz_pamiec_zapisu.mjs
node tools/sprawdz_pamiec_swiata.mjs
node tools/sprawdz_cache_dalekiego_terenu.mjs --benchmark --output test-results/far-cache/cpu.json
node tools/benchmark_saved_cpu.mjs --root ../voxel-baseline --output test-results/saved-cpu/baseline --chunks 4096 --samples 3
node tools/benchmark_saved_cpu.mjs --root . --output test-results/saved-cpu/candidate --chunks 4096 --samples 3
CHROME_BIN=/usr/bin/google-chrome node tools/benchmark_saved_streaming.mjs --root . --output test-results/saved-streaming/candidate-1 --chunks 4096 --samples 1
```

Pełną naprzemienną sekwencję A/B wykonuje `.github/workflows/pamiec-ab.yml`.
`tools/compare_saved_streaming.mjs` odrzuca różne dane, wersje skryptów
i środowiska, nieudane sprawdzenia zawartości oraz przekroczone limity cache.
Różnica czasu nie jest niestabilnym progiem zaliczenia CI.
