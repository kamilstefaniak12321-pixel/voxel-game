# Odbicia i materiały 0.58.0 — zapis odbioru

Zapisano testy automatyczne, odbiór natywny, trzy pary OFF/ON i osobne próby
efektów: mediana przyrostu GPU wyniosła **0,108 ms**, poniżej roboczego
budżetu około 1 ms w tym statycznym kadrze. Ciągła trasa 180 s z efektami
ON dała średnio 122,34 FPS, z krótkimi spadkami opisanymi poniżej. Nowy
kadr liści potwierdza subtelny efekt także w natywnym obrazie. Kontrolna
trasa OFF pozwala oddzielić część kosztu dodatków od istniejących
zacięć przy ruchu; oba przebiegi opisano poniżej.
Szczegółowe identyfikatory i SHA-256 znajdują się w [wyniki.json](wyniki.json),
a protokół w [README.md](README.md).

## Testy automatyczne

Pełne `npm test` przeszło, log zakończony 2026-11-03 22:50:03 UTC.
Końcowy WebGL z `test-results/lighting-materials/result.json` ma PASS,
2026-11-03 22:48:53 UTC; obejmuje 62 programy shaderów.
Testy wykonano przed późniejszym przesunięciem samego stanowiska liści.
Po zmianach operator potwierdził również PASS regresji ustawień podczas
pauzy, 363 sprawdzeń scen oraz testu solvera odbić na commicie `06ee8d0`.
Te trzy kontrole nie mają tu osobnego pliku logu.

W rzeczywistych shaderach czterech adapterów — bloków, roślin, liści
i modeli — próbki transmisji wynoszą `[13,12,10]`, `[9,8,7]` i `[5,4,4]`
dla cienkich liści, mikrokostek i większych kostek. Kontrolowany refleks
owocu daje `[11,11,11]`. Są to próbki liniowego celu testowego, nie
docelowe kolory ekranu. Sprawdzono maski, wyłączone efekty, brak źródła,
zasłonięcie, odwrócenie normalnych i brak transmisji na innych profilach.
Odbicie przy wyłączonych mapach cieni daje `[11,6,3]` w trzech adapterach.

Regresja zapisu CPU obejmuje rzeczywiste `World`, `LightEngine`,
`BounceLight`, `WorldSaver` i `WorldStorage`: cztery odtworzenia,
343 sondy na etap, różne kolejności chunków. Zamknięty dach daje odbicie
0; otwarty 0,024362; po zamknięciu i usunięciu lampy wraca 0; po ponownym
otwarciu odtwarza się ten sam dodatni wynik.

## Pierwsza sesja natywna

Sesja `materials-2026-11-03T22-50-03-649Z` korzysta z 0.58.0 na bazie
commita `5b6a2bc0a66577456d0fb8364f8654253a0074fc`, ze zmodyfikowanym
drzewem źródeł identyfikowanym hashem w raporcie. Bufor WebGL ma 1920×1080,
DPR 1, Naturalną paletę, HDR16F, ekspozycję 1 i MSAA 4×.

Pierwsza para zdjęć 002/003 jest **kontrolą zasłoniętego źródła**,
nie odbiorem krzaków pod otwartym słońcem. Kamera jest prawidłowo
skierowana ku zachodniemu słońcu, ale pień i kostka liści leżą przed
krzakami, a pokój zasłania im niskie źródło. Dlatego tej pary nie używamy
do dowodzenia wyglądu lub braku działania transmisji.

Po tej kontroli zmieniono wyłącznie układ referencyjny: krzak docelowy
przesunięto do `(176,17.8,-178)`, poza cień pokoi, dąb odsunięto od osi
kamery, a rośliny rozsunięto po skosie. Kolejne ujęcia wymagają nowego
uruchomienia i mają inny hash helpera; pierwsza sesja pozostaje opisana
oryginalnym hashem, bez przepisywania dowodów.

Próba zapisu 008 ma `valid=true`, brak błędów i różnicę próbek odbicia
0. Dach i przegroda były zamknięte, lampa usunięta; oba pokoje zachowały
zerowe kanały światła przed i po odtworzeniu. Jest to kontrola braku
resztek światła. Magazyn działa wyłącznie w pamięci i nie sprawdza dysku
ani zapisów użytkownika.

## Końcowy kadr liści i dodatni zapis

Sesja `materials-2026-11-03T23-13-03-488Z` używa commita
`06ee8d06977174a8b8ba0be7218b2d1755da8018`. Kod śledzony w Git jest
czysty; `dirty=true` w manifeście wynika z jeszcze nieśledzonych plików
niniejszego raportu. Źródła i nowy układ sceny mają odrębne hashe.

Para 002/003 pokazuje odsłonięty krzak borówki na tle niskiego słońca,
truskawkę po lewej i paproć po prawej. Po włączeniu efektów liście
rozjaśniają się delikatnie, zachowując ciemniejsze partie, fakturę
i sylwetkę. Słońce, niebo i ułożenie geometrii pozostają niezmienione.
Oba zdjęcia mają tę samą kamerę, porę, ekspozycję, zatrzymaną animację
oraz `meshVersion=199`; kolejki odbić są puste.

Analiza oryginalnych PNG potwierdza różnicę: w prostokącie krzaka
`x=865, y=548, szerokość=82, wysokość=72` zmieniły się 4203 z 5904
pikseli, wyłącznie w stronę rozjaśnienia. Średnia różnica RGB wynosi
`(+1,825,+2,756,+0,335)` w skali 0–255, największa różnica kanału 17.
Wewnętrzny liść przy `(898,577)` zmienia się z `[22,29,10]` na
`[36,44,12]`. Kontrolne 56 000 pikseli nieba jest identyczne; obszar
podłoża ma różnicę najwyżej 2. To dowód działania na rzeczywistej
karcie, nie tylko w teście shaderów. Para przełącza trzy efekty razem,
więc nie przypisujemy całej różnicy wyłącznie transmisji.

Faktyczne pliki PNG mają **1904×1041**, mimo że bufor WebGL i pomiary
pracują w **1920×1080**. Współrzędne powyżej dotyczą PNG. Nie przeliczano
ani nie skalowano obrazów podczas liczenia różnic.

Próba zapisu 005 nowej sesji ma `valid=true`, brak błędów i maksymalną
różnicę odbicia 0. Otwarty dach pokoju A przy usuniętej lampie daje
sky=15 i dodatnie odbicie `[0,003856,0,004089,0,003808]`, identyczne
przed i po odtworzeniu. Zamknięty pokój B pozostaje z sky=0 i RGB
odbicia `[0,0,0]`. Uzupełnia to wcześniejszą próbę całkowicie ciemnego
pokoju; ograniczenie magazynu w pamięci nadal obowiązuje.

## Trzy pary OFF/ON — las przy rzece

Próby 010–018 i raport zbiorczy 019 pochodzą z tej samej sesji
`materials-2026-11-03T22-50-03-649Z`. NVIDIA GeForce RTX 3050 Laptop GPU,
ANGLE/D3D11, 1920×1080, DPR 1, VSync na ekranie 144 Hz, WebGL 2 i timer
GPU. Las: seed 2138286349, oko `(188,54.6,-252)`, cel `(168,52,-265)`,
południe bez chmur. Pełny teren 64, LOD 1024, szczegół 2, cienie 3,
animowane rośliny i promienie światła włączone. Profil Standard, siła
odbicia 18%, nasycenie 65%, Naturalna paleta, ten sam HDR16F/MSAA 4×.

Każdy pomiar ma 10 s rozgrzewki i 30 s próbkowania. Zmieniano wyłącznie
trzy nowe przełączniki: odbicia, transmisję i refleksy. OFF oznacza ich
wyłączenie w kodzie 0.58.0; nie jest uruchomieniem starego pliku 0.57.0.

| Para / kolejność | Pliki OFF / ON | GPU OFF mediana | GPU ON mediana | Różnica median | Różnica P95 GPU |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 / OFF→ON | 010 / 011 | 6,340 ms | 6,459 ms | +0,120 ms | +0,252 ms |
| 2 / ON→OFF | 013 / 012 | 6,454 ms | 6,546 ms | +0,092 ms | +0,217 ms |
| 3 / OFF→ON | 014 / 015 | 6,471 ms | 6,579 ms | +0,108 ms | +0,218 ms |

Mediana różnic par wynosi **+0,108 ms GPU**, około **+1,67%**;
mediana różnic P95 GPU +0,218 ms. Dla CPU odpowiednie różnice to
+0,200 ms mediany oraz +1,000 ms P95. Roboczy budżet +1 ms GPU jest
spełniony w tych trzech parach, przy identycznym torze HDR.

W wariantach ON średni FPS wyniósł 137,52 / 137,71 / 140,37. P95 klatki
wynosiło 7,60 / 7,60 / 7,30 ms, P99 15,20 / 15,20 / 14,00 ms.
Jednocześnie **22 / 15 / 7 klatek** przekroczyło 16,67 ms: łącznie
44 z 12 465, około 0,35%. Najdłuższe odstępy wyniosły 38,30 / 26,90 /
24,00 ms; jeden przekroczył 33,33 ms. Wynik pokazuje duży zapas do
60 FPS, ale nie oznacza braku sporadycznych zacięć. FPS jest ponadto
ograniczony odświeżaniem; do oceny kosztu użyto timera GPU.

Wszystkie dziewięć prób ma `valid=true`, `gpuValid=true`, zero przerw
timera, pominiętych próbek GPU, błędów gry i zmian geometrii.
Końcowe kolejki chunków, przebudów, kafli LOD i odbić są puste.
Bufor i szacowany cache odbić zajmują 4 364 888 bajtów (około 4,16 MiB).
To nie jest pomiar całej pamięci procesu lub VRAM; dodatkowy cel HDR
pozostaje wspólny dla OFF/ON i wynosi 124 416 000 bajtów.

### Rozbicie na efekty

Każdy wariant poniżej zmierzono raz po trzech parach. Punktem odniesienia
jest mediana trzech wyników OFF: 6,454 ms GPU.

| Włączony efekt / plik | GPU mediana | GPU P95 | Różnica od mediany OFF |
| --- | ---: | ---: | ---: |
| Tylko odbicia / 016 | 6,598 ms | 6,987 ms | +0,143 ms |
| Tylko transmisja / 017 | 6,502 ms | 6,794 ms | +0,048 ms |
| Tylko refleks owoców / 018 | 6,493 ms | 6,843 ms | +0,039 ms |

To pomocnicze rozbicie kosztu, bez trzech par dla każdego składnika.
Różnic nie sumujemy: kolejność prób, zmienność zegarów i pomiaru wpływają
na te małe wartości. Wynik całego zestawu pochodzi z par powyżej.

## Ciągły ruch i doczytywanie — 180 s

Próba 020 z tej samej sesji obejmuje pełne 180 s bez zatrzymywania
pomiaru, po 10 s rozgrzewki. Kamera przemierza stałą pętlę lasu, wszystkie
trzy efekty są włączone; pozostałe ustawienia odpowiadają próbom
statycznym. Wystąpiły **463 zmiany geometrii**, więc wynik obejmuje
doczytywanie i przebudowę świata.

| Miara | Klatka | CPU | GPU |
| --- | ---: | ---: | ---: |
| Mediana | 7,00 ms | 7,00 ms | 6,147 ms |
| P95 | 14,20 ms | 12,20 ms | 7,674 ms |
| P99 | 20,80 ms | 17,40 ms | 9,017 ms |
| Maksimum | 53,00 ms | 51,60 ms | 27,415 ms |

Średnia wyniosła **122,34 FPS**. Spośród 22 020 odstępów między klatkami
371 przekroczyło 16,67 ms (około **1,68%**), a 10 przekroczyło 33,33 ms.
GPU ma zapas w medianie i percentylach, ale nie jest to dowód idealnie
stabilnych 60 FPS: P99 czasu klatki przekracza ich budżet i wystąpiły
krótkie zacięcia. Porównanie z kontrolną trasą OFF poniżej nie uzasadnia
przypisania tego ogona wyłącznie streamingowi ani wyłącznie nowym odbiciom.

Pomiar ma `valid=true`, `gpuValid=true`, zero błędów, pominiętych próbek
GPU i przerw timera. Na końcu kolejki chunków i przebudów oraz brakujące
kafle LOD wynoszą 0. Solver odbić nadal przelicza otoczenie ruchomej
kamery (`ready=false`, kolejka geometrii 38 387, źródeł 2, sond 1);
nie twierdzimy, że po tym ujęciu końcowym wszystkie odbicia już osiadły.

Tablice solvera zajmują 3 990 168 bajtów w obu odczytach.
Szacowany całkowity koszt jego pamięci wzrósł z 4 364 888 do 5 222 968
bajtów wskutek rozbudowy cache. To dwa odczyty przed i po trasie,
nie pomiar szczytowego VRAM ani dowód stałego zużycia w długiej sesji.

### Kontrolna trasa OFF i koszt dodatków

Próba 007 z sesji `materials-2026-11-03T23-13-03-488Z` powtarza tę samą
180-sekundową trasę, seed i ustawienia po odtworzeniu świata. Wyłączono
tylko trzy nowe efekty, zachowując Naturalną paletę i tor HDR.
Oba przebiegi mają **463 zmiany geometrii**, wersję siatek 233→696,
142→148 chunków i cache LOD 428→533. Nie jest to spacer po wcześniej
dogranym świecie. Sesje mają różne hashe źródeł: w drugiej jest już
korekta ustawień podczas pauzy i nowy układ stanowiska referencyjnego.

| Miara | OFF / 007 | ON / 020 | Różnica ON−OFF |
| --- | ---: | ---: | ---: |
| Średni FPS | 132,43 | 122,34 | −10,10 |
| GPU mediana | 5,949 ms | 6,147 ms | +0,198 ms |
| GPU P95 | 7,421 ms | 7,674 ms | +0,253 ms |
| GPU P99 | 8,084 ms | 9,017 ms | +0,933 ms |
| CPU mediana | 5,90 ms | 7,00 ms | +1,10 ms |
| CPU P95 | 10,60 ms | 12,20 ms | +1,60 ms |
| CPU P99 | 15,50 ms | 17,40 ms | +1,90 ms |
| Klatka P95 | 13,90 ms | 14,20 ms | +0,30 ms |
| Klatka P99 | 16,20 ms | 20,80 ms | +4,60 ms |
| Najdłuższa klatka | 49,80 ms | 53,00 ms | +3,20 ms |
| Klatki >16,67 ms | 224 / 23 837 (0,94%) | 371 / 22 020 (1,68%) | +0,74 p.p. |
| Klatki >33,33 ms | 7 | 10 | +3 |

Roboczy budżet przyrostu GPU około 1 ms jest spełniony także w ruchu.
Nowe efekty mają jednak koszt CPU: mediana samej aktualizacji rośnie
o 0,60 ms, a zgłoszeń renderowania o 0,40 ms. W ON częściej występują
długie klatki. Jednocześnie OFF również ma piki blisko 50 ms, więc
wszystkich zacięć nie powodują dodatki; nie można też wszystkich
przypisać istniejącemu streamingowi. To jedna kontrolna para ruchu,
nie wielokrotny eksperyment pozwalający przypisać każdą długą klatkę
konkretnemu podsystemowi.

OFF ma `valid=true`, `gpuValid=true`, zero błędów i brak przerw lub
pominięć timera. Końcowe kolejki chunków i brakujące kafle LOD wynoszą 0.
Wyłączony solver nie wykonuje pracy i zachowuje 3 990 168 bajtów tablic.

## Regresja żywego menu

Sesja `menu-2026-11-03T23-22-46-585Z`, na commicie `06ee8d0` i tym samym
hashu źródeł co końcowa scena materiałów, przeszła trasę home → river →
home → forest → home → mountains → home dla palet Naturalna i Bazowa.
Zapisano osiem PNG/JSON 002–009 oraz raport `010-menu-tour.json`.
Użyto istniejącego harnessu menu; historyczne wyniki 0.57 pozostają
niezmienione. Bazowa oznacza paletę w kodzie 0.58.0, nie starszy plik gry.

We wszystkich ośmiu zapisach teren ma `ready=true`, `pending=false`,
`failed=false`, 1257 chunków, pustą kolejkę ładowania i wszystkie
1219 z 1219 wymaganych kafli LOD. Zapisano **zero błędów JavaScript,
nieudanych programów shaderów i naruszeń toru wyjściowego**. Menu
zachowuje HDR16F 1920×1080, ekspozycję 1 i MSAA 4×. Operator obejrzał
natywne kadry home i river w palecie Naturalnej oraz przejazdy;
wygląd i przejścia są poprawne. Hashe wszystkich ośmiu PNG i raportów
są w `wyniki.json`.

To **regresja funkcjonalna, nie formalny benchmark FPS menu**. Po
6-sekundowym oczekiwaniu trasa zatrzymuje się krótko: ukończone widoki
poza home mają zwykle 31–35 próbek, a w chwili części zdjęć zaledwie
1–2; Naturalna/home zebrała 1250. Tak nierównej próbki nie wykorzystujemy
do deklarowania stabilnych 60 FPS ani porównania kosztu GPU.
Gotowość terenu i kompletność LOD nie oznaczają też pełnego przeliczenia
wszystkich odbić: w ruchomych ujęciach solver ma jeszcze `ready=false`.

## Zakres i ograniczenia odbioru

Budżet GPU, obraz liści i odtworzenie światła po zapisie są potwierdzone
na PC z RTX 3050 na zasilaczu. Przebieg ruchu osiąga średnio ponad 120 FPS,
ale **nie potwierdza idealnie stabilnych 60 FPS**: sporadyczne zacięcia
pozostają i nowe efekty zwiększają ich częstość. Pomiar przy VSync 144 Hz
obejmuje trzy minuty ruchu, nie wielogodzinną sesję ani Androida.
Zapis działał w izolowanym magazynie pamięciowym. Żywe menu przeszło
opisaną wyżej regresję funkcjonalną, bez osobnej certyfikacji wydajności.
