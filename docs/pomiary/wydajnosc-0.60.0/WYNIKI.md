# Aktualizacja wydajności 0.60.0 — wyniki odbioru

Pomiary natywne potwierdzają usunięcie zimnego przygotowania rzek z głównego
wątku oraz szybszą przebudowę i renderowanie roślin. W próbie eksploracji
najdłuższa klatka skróciła się z 291,60 do 55,30 ms. W ogrodzie 64 roślin
średnia wzrosła ze 112,14 do 136,52 FPS, a w próbie 256 z 28,89 do 107,39.
Skrajnie gęsty ogród nadal przycina przy każdej edycji; nie deklarujemy
idealnie stałych 60 FPS. Są to pojedyncze pary scenariuszy, a nie trzy
niezależne powtórzenia każdego pomiaru.

Końcowy test zapisu potwierdził poprawność wszystkich danych i zapisu przy
wyjściu. Zlecenie 512 chunków zajmuje teraz 30,80–34,70 ms zamiast
97,50–109,40 ms. Cała transakcja trwa dłużej w tle; pełne bloki wszystkich
zapisanych chunków nadal pozostają w pamięci. Odczyt 128 chunków pozostaje
nieco wolniejszy, natomiast dla 512 usunięto regresję pośredniego kursora.
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

## Wykryta regresja pierwszego kandydata — wynik odrzucony

Pierwsza próba rzek na commicie `0f67f4797dd1037d6c47b04eff4048b2158ebb3d`
(sesja `performance-2026-11-04T21-05-44-552Z`, raport 002) nie stanowi
odbioru nowej generacji w tle. Statystyki ujawniły awarię workera:
`enabled=false`, `requested=2`, `completed=0`, `applied=0`, `failures=1`.
Gra poprawnie wróciła do generacji synchronicznej, ale zimne `prepareZone`
nadal zajęło 278,20 ms, a najdłuższa klatka 291,60 ms.

Ogólne `valid=true` tego surowego raportu oznacza jedynie poprawny pomiar
bez utraty aktywności okna/błędów renderowania. Nie uwzględniało jeszcze
warunku działania workera. Wynik zachowujemy jako dowód znalezienia
regresji; nie używamy go jako potwierdzenia naprawy przycięcia rzek.

## Ogród 64 — porównanie kandydata z bazą

Kandydat: commit `0f67f4797dd1037d6c47b04eff4048b2158ebb3d`, sesja
`performance-2026-11-04T21-05-44-552Z`, raport 003. `valid=true`,
`gpuValid=true`, zero błędów. Obie próby obejmują 60 edycji i 86 przebudów.

| Miara | 0.59.0 | Kandydat 0.60.0 |
| --- | ---: | ---: |
| Średni FPS | 112,14 | 136,52 |
| P95 klatki | 14,50 ms | 7,40 ms |
| P99 klatki | 27,60 ms | 16,00 ms |
| Maksimum klatki | 83,90 ms | 57,20 ms |
| Klatki >33,33 ms | 60 | 10 |
| Klatki >50 ms | 8 | 2 |
| Mediana przebudowy | 26,80 ms | 11,70 ms |
| Maksimum przebudowy | 41,50 ms | 20,30 ms |
| Mediana GPU | 4,074 ms | 4,291 ms |

Koszt CPU przebudów wyraźnie spada przy zachowaniu tej samej zawartości
i liczby edycji. Nadal występują pojedyncze długie klatki; nie jest to
deklaracja idealnie stałych 60 FPS. Czas GPU nie spadł, co odpowiada
zakresowi poprawki zachowującej szczegółowość modeli.
To jedna para prób, bez oszacowania rozrzutu między niezależnymi sesjami.

## Próba 256 — duży wzrost płynności, kosztowne edycje pozostają

Ten sam commit i sesja kandydata, raport 005. Pomiar ma `valid=true`,
`gpuValid=true`, zero błędów. W obu wersjach wykonano 60 edycji i 102
przebudowy. Liczba i szczegółowość roślin pozostają takie same.

| Miara | 0.59.0 | Kandydat 0.60.0 |
| --- | ---: | ---: |
| Średni FPS | 28,89 | 107,39 |
| P95 klatki | 50,60 ms | 14,20 ms |
| P99 klatki | 237,40 ms | 28,00 ms |
| Maksimum klatki | 285,10 ms | 175,40 ms |
| Klatki >33,33 ms | 1029 | 61 |
| Klatki >50 ms | 90 | 60 |
| Mediana przebudowy | 95,80 ms | 35,85 ms |
| Maksimum przebudowy | 133,30 ms | 59,30 ms |
| Mediana renderowania CPU | 34,40 ms | 4,50 ms |
| Mediana GPU | 8,915 ms | 6,107 ms |

Największą zmianą jest usunięcie powtarzanych obliczeń obwiedni podczas
przygotowania małych partii cieni dużego modelu. Widać to w spadku
mediany pracy renderera na CPU. Przy tej samej scenie ogólna płynność
rośnie znacząco, jednak **60 klatek powyżej 50 ms nadal przypada na
próbę z 60 edycjami**. Skrajnie gęsty ogród nie spełnia celu stałych
60 FPS podczas każdej zmiany rośliny. Przebudowa całego chunka oraz
przekazanie jego dużych buforów do GPU pozostają dalszym obszarem pracy.

Próba jest pojedynczą parą i celowym obciążeniem; nie przedstawiamy
107 FPS jako gwarantowanej wydajności wszystkich światów.

## IndexedDB — pośredni kandydat, zastąpiony po dalszych pomiarach

Raport 007 tej samej sesji kandydata: dziewięć zapisów (16/128/512 chunków,
po trzy próby), wszystkie poprawne. Po natychmiastowej zmianie żywych
tablic, pozycji gracza i stanu ogniska odczyt odtwarzał pierwotną migawkę.
Sprawdzono każdą komórkę, format 8/16-bitowy i ID 65535.

Próba `pagehide` przy jednym trwającym zadaniu workera uruchomiła lokalną
transakcję od razu, przed odpowiedzią workera. Odtworzenie zawierało
najnowszą pozycję gracza i najnowszą zmianę bloku; żadna zmiana nie została
na liście niezapisanych. Test przeprowadzono w unikalnej bazie QA.

| Wielkość | Zgłoszenie na głównym wątku | Cały zapis asynchroniczny |
| --- | ---: | ---: |
| 16 chunków | 0,70–2,40 ms | 9,90–61,70 ms |
| 128 chunków | 13,50–17,00 ms | 65,00–102,50 ms |
| 512 chunków | 48,90–57,00 ms | 271,10–285,40 ms |

Pierwsza próba obejmuje uruchomienie workera. Cały czas asynchroniczny
nie oznacza zablokowanego obrazu, jednak samo przekazanie kopii dużego
pakietu nadal potrafi przekroczyć 50 ms. Worker nie eliminuje całego kosztu
dużego zapisu. Końcowe porównanie z bazą 0.59.0 podano poniżej.

## Końcowy odbiór rzek po poprawieniu startu workera

Commit `80d6f52`, sesja `performance-2026-11-04T21-24-23-084Z`, raport 002.
Po wczytaniu zależności worker wysyła potwierdzenie gotowości; dopiero potem
otrzymuje inicjalizację i zadania. To usuwa zgubienie wiadomości podczas
asynchronicznego ładowania paczek roślin/drzew w module przeglądarki.

| Miara | 0.59.0 | Końcowy kandydat |
| --- | ---: | ---: |
| Średni FPS | 128,60 | 126,40 |
| P99 klatki | 19,10 ms | 19,10 ms |
| Maksimum klatki | 291,60 ms | 55,30 ms |
| Klatki >33,33 ms | 14 | 2 |
| Klatki >50 ms | 3 | 1 |
| Maksimum CPU klatki | 292,00 ms | 31,20 ms |
| Maksimum `World.update` | 50,10 ms | 14,70 ms |
| Maksimum przebudowy mesha | 50,10 ms | 9,10 ms |
| Mediana GPU | 6,785 ms | 6,830 ms |
| `prepareZone` na głównym wątku | 6 wywołań, max 257,80 ms | 0 wywołań |

Próba spełnia dodatkowy warunek `streamingValid=true`: worker jest aktywny
i gotowy, przyjął podczas pomiaru 321 nowych wyników (licznik 32→353),
nie zgłosił żadnej awarii. Końcowe kolejki świata, przebudów i workera
są puste; daleki teren nie ma brakujących kafli. Maksimum przyjęcia danych
chunka na głównym wątku wynosi 5,20 ms. W obu wersjach wystąpiły 243
przebudowy mesha, więc poprawa nie wynika z pominięcia doczytywania.

Średnia FPS i P99 pozostały podobne. Poprawa dotyczy szczególnie dużego
zimnego zatrzymania; pojedyncze krótsze zacięcia nadal występują.
Raport ma zero błędów gry i niewykonalnych programów shaderów. Zachowuje
ostrzeżenia kompilatora ANGLE X3595 o pochodnych w pętli; nie są to błędy
startu workera ani dowód wizualnej regresji.

## Kontrola CPU wykonana bezpośrednio przed i po zmianie kodu

Po długich próbach natywnych zmieniły się bezwzględne czasy testów Node.
Dlatego dodatkowo uruchomiono kolejno wszystkie trzy oryginalne skrypty
na bazie i kandydacie, przy zamkniętej grze i bez innych benchmarków.
Pierwszą próbę kandydata, która mogła pokrywać się z testem jednostkowym,
zachowano osobno i wyłączono z porównania.

Zimna generacja w tej sąsiadującej parze ma medianę **295,17 ms w bazie
i 292,22 ms w kandydacie**. Niezmieniona baza była wcześniej znacznie
szybsza (169,75 ms), zatem nie przypisujemy całej różnicy między odległymi
w czasie sesjami zmianie kodu. Nie zmierzono temperatur i zegarów CPU,
więc przyczyna zmienności środowiska pozostaje nieustalona.

| Model | Trzy rozgrzane przebudowy 0.59.0 | Trzy rozgrzane przebudowy 0.60.0 |
| --- | ---: | ---: |
| 16 indygowców | 6,81–14,90 ms | 1,80–3,13 ms |
| 64 indygowce | 26,02–35,27 ms | 14,65–24,13 ms |
| 256 indygowców | 79,47–95,39 ms | 44,76–52,92 ms |
| 64 marzanny | 14,40–16,76 ms | 5,58–18,79 ms |

Liczby trójkątów i rozmiary tablic geometrii są identyczne. Poprawa
indygowców wynika z przygotowania i kopiowania danych, bez upraszczania
modelu. Wyniki marzanny mają duży rozrzut; nie deklarujemy tu jednoznacznego
przyspieszenia. Pojedyncza synchroniczna próba dalekiego `World.update`
wyniosła 338,21 ms w bazie i 454,44 ms w kandydacie. Ta ścieżka awaryjna
nadal może przycinać; przeniesienie pracy do workera potwierdza osobny
pomiar natywny, nie ten test bez browserowego `Worker`.

## Regresja odczytu wykryta podczas testowania zapisu

Porównanie z nową sesją bazową `performance-baseline-2026-11-04T21-27-59-966Z`,
raport 002, potwierdziło poprawność danych w obu wersjach. Pierwszy kandydat
zmniejszył medianę czasu zlecenia 512 chunków ze 102,90 do 56,40 ms,
lecz cały zapis trwał dłużej asynchronicznie. Odczyt po jednym rekordzie
z kursora okazał się wolniejszy: mediana dla 128 chunków 36,00→130,20 ms,
a dla 512 160,70→333,00 ms.

To wynik pośredni, a nie końcowa zaleta aktualizacji. Na jego podstawie
odczyt zmieniono na partie po 64 rekordy w jednej transakcji, a do zapisu
przygotowywane są własne kopie buforów przesyłane przez transfer list.
Końcowy pomiar tego wariantu opisano poniżej.

## Końcowy odbiór zapisu i odczytu IndexedDB

Commit `af151f8ad191b120bf27e1a8982c032fe00a1ed6`, sesja
`performance-2026-11-04T21-35-10-292Z`, raport 002. Baza to raport 002
sesji `performance-baseline-2026-11-04T21-27-59-966Z`. Oba pomiary wykonano
w świeżej scenie ogrodu 64, przy tej samej kamerze i konfiguracji obrazu.
Test obejmuje po trzy kolejne zapisy każdej wielkości w jednym procesie;
pierwszy zapis 16 chunków uruchamia worker. To nie są trzy niezależne sesje.

| Liczba chunków | Mediana zlecenia 0.59 / 0.60 | Mediana pełnego zapisu 0.59 / 0.60 | Mediana odczytu 0.59 / 0.60 |
| --- | ---: | ---: | ---: |
| 16 | 3,20 / 2,40 ms | 16,80 / 15,40 ms | 12,70 / 14,40 ms |
| 128 | 26,10 / 7,20 ms | 46,90 / 57,30 ms | 36,00 / 48,10 ms |
| 512 | 102,90 / 31,10 ms | 122,10 / 183,80 ms | 160,70 / 145,50 ms |

Końcowy kandydat zaliczył wszystkie dziewięć porównań pełnych tablic
bloków, w tym ID 65535, i migawek gracza oraz ogniska. Zmiana żywych danych
bezpośrednio po zleceniu nie zmieniła zapisywanej migawki. Worker wykonał
dziewięć zapisów bez awarii. Przy jednym trwającym zapisie zdarzenie
`pagehide` natychmiast rozpoczęło lokalną transakcję; odczyt potwierdził
najnowszy blok i pozycję gracza. Gra nie otwierała baz użytkownika.

Własne kopie buforów i transfer list zmniejszyły koszt zlecenia dużej
paczki na głównym wątku o około 70% względem bazowej mediany. Zlecenie
512 chunków nadal zajmuje 30,80–34,70 ms, więc nie jest operacją mieszczącą
się zawsze w klatce 60 FPS. Transakcja kończy się później, lecz większość
tego czasu upływa w tle. Nie przedstawiamy tego jako przyspieszenia całego
zapisu na dysk. Przy 128 chunkach odczyt jest nadal wolniejszy o około
12 ms; przy 512 wynik 142,40–146,80 ms jest bliski lub lepszy od bazowych
152,00–167,40 ms. Odczyt partiami ogranicza tymczasową listę rekordów do
64, ale wynikowa mapa wszystkich zapisanych bloków pozostaje w RAM.

Pomocniczy heartbeat zapisu nie służy do wyznaczania FPS ani maksimum
zatrzymania: jego pierwszy odcinek miesza czas wywołania z timestampem
klatki rAF, jest niepełny i w dwóch małych próbach był ujemny. Zachowujemy
surowe dane z tą adnotacją; wnioski wyciągamy z niezależnych liczników
`submitMs`, `totalMs` i `loadMs`. Pomiary FPS scenariuszy gry korzystają
z osobnej pętli i nie mają tego ograniczenia.

Zmiany transportu zapisu i odczytu nie zmieniają generatora ani meshera
użytych w zaakceptowanych próbach rzek i ogrodów. Ich wcześniejsze commity
pozostają w manifestach; nie przypisujemy im hasha późniejszego źródła.

## Końcowe sprawdzenie regresji

Po zamknięciu pomiarów natywnych pełne `npm test` zaliczyło 52 skrypty.
Test prawdziwego WebGL zaliczył 62 programy shaderów i 43 przypadki
powierzchni oraz sceny oświetlenia. Oba procesy zakończyły się kodem 0.
Logi `npm-test-final.log` i `webgl-final.log` mają SHA-256 w `wyniki.json`.
Nie są to pomiary wydajności i nie uruchamiano ich równolegle z benchmarkami.
Nie wykonano testu na fizycznym Androidzie.
