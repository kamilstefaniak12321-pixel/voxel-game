# Woda 0.72.0 — rozlewanie, powierzchnia i koszt aktualizacji

Baza: wydana 0.71.0, `b91a6ae7d9d0a4d46604110b5879b398ce575c47`.

## Zachowanie

- Dotychczasowy blok `water` (ID 12) jest trwałym źródłem. Woda najpierw
  szuka miejsca bezpośrednio pod sobą, a po dotarciu do podłoża rozlewa się
  na boki do siedmiu poziomów. To lokalne reguły blokowe, bez symulacji
  ciśnienia i zachowania objętości cieczy.
- Dwa poziome źródła odnawiają źródło w otwartej komórce między nimi,
  jeżeli pod nią jest blok z kolizją albo inne źródło. Spadająca woda
  i mocny strumień nie liczą się jako źródła. Po odcięciu ostatniego
  dopływu pozostały strumień stopniowo zanika.
- Woda zajmuje powietrze i zmywa zastępowalne rośliny. Pełne bloki,
  konstrukcje i granica świata zatrzymują przepływ. To nie jest ogólny
  system współdzielenia komórki przez dowolny blok i wodę.
- Rzeki i morza zachowują dotychczasowe źródła oraz wygenerowany nurt.
  Otwarty brzeg i usunięta tama uruchamiają lokalne rozlewanie. Źródła
  pod istniejącymi roślinami wodnymi pozostają źródłami; nowe rośliny
  wodne można sadzić tylko w źródle, aby nie tworzyć źródeł ze strumienia.
- Symulacja działa wyłącznie w wczytanych chunkach. Niewczytany sąsiad
  wstrzymuje zależny przepływ; nigdy nie jest traktowany jak powietrze.
  Po doczytaniu granica budzi się ponownie. Woda sama nie generuje świata.

## Tafla i kontakt z graczem

Cztery komórki wokół wspólnego narożnika wyznaczają jedną wysokość.
Źródło zachowuje 7/8 bloku; niższe stany łączą się w pochyłą powierzchnię.
Spadająca lub przykryta woda wypełnia wysokość bloku. Sąsiednie chunki
używają identycznych narożników i podziału na trójkąty. Fale mają wspólną
fazę w przestrzeni i mniejszą amplitudę w cienkiej wodzie.

Pływanie, zanurzenie kamery i wskazywanie wody używają tych samych
trójkątnych powierzchni, bez wizualnego falowania shaderów. Nurt poza
rzekami wynika z sąsiednich wysokości; wygenerowany kierunek rzek nie jest
nadpisywany. Daleki teren nadal przedstawia uproszczoną powierzchnię
całkowitych wysokości, zgodnie z istniejącym poziomem szczegółowości.

## Ograniczenia pracy

| Element | Ograniczenie |
| --- | --- |
| Krok rozlewania | 0,12 s, bez nadrabiania zaległych kroków po przycięciu |
| Budżet CPU symulacji | do 0,6 ms i do 20% pozostałego budżetu streamingu |
| Sprawdzane aktywne komórki | najwyżej 64 na wywołanie |
| Faktyczne zmiany bloków | najwyżej 24 na wywołanie |
| Rozruch po wczytaniu | najwyżej 1024 jednostki skanowania kolumn/komórek |
| Spokojny zbiornik | kolejka zasypia; brak ponownego przeglądania tafli |
| Indeks startowy | 512 bajtów na mokry chunk, brak alokacji na suchym |
| Dodatkowa pamięć meshera | 42 120 bajtów na aktywny bufor roboczy |

Zegar jest sprawdzany między komórkami oraz małymi porcjami skanowania.
Limit czasu jest miękkim terminem zakończenia pracy: pojedyncza operacja,
przeglądarka i GC mogą go przekroczyć. Limity liczby aktualizacji i zmian
są twarde. Istniejący mesher nadal buduje geometrię w porcjach ze wspólnego
budżetu streamingu; wiele zmian jednego chunka łączy się w jedno oznaczenie
do przebudowy. Zmiana poziomu wody nie przebudowuje osobnej siatki roślin
ani nie uruchamia od nowa czterech kanałów niezmienionego światła.

Każda komórka ma najwyżej jeden oczekujący wpis. Przy wyładowaniu chunka
jego kolejki są usuwane. Mokre kolumny są indeksowane przy istniejących
operacjach tworzenia/odczytu bloków; skan rozruchowy pomija suchy teren.

## Zapisy i diagnostyka

Poziomy 1–7 i spadanie używają zarezerwowanych ID 10100–10107; źródła
i starsze zapisane światy zachowują swoje numery. Nowe stany mieszczą się
w dotychczasowych tablicach Uint16, także w spakowanych migawkach 0.71.0.
Format IndexedDB nie zmienia się. Kolejka jest odtwarzana z bloków po
wczytaniu, więc zapis w trakcie rozlewania nie wymaga dodatkowej tabeli.

Raport wydajności ma etap `water` oraz `resources.water`: rozmiar kolejki,
liczbę rozruchowych skanów, aktualizacji, zmian i koszt ostatniego kroku.

## Sprawdzenia i pomiary

`npm test` zawiera osobne regresje symulacji, geometrii i interakcji.
Scenariusze obejmują źródła, odpływy, wodospady, cofanie strumienia,
ujemne współrzędne i granice chunków, zgodność zapisów i prawdziwego workera,
niezmienione oświetlenie, budżety, bezczynność oraz rośliny wodne.

`node tools/sprawdz_wode_webgl.mjs` uruchamia rzeczywistą grę w Chrome:
stary zapis → zalewanie → przerwanie brzegu → 64 źródła → zapis 16-bitowy
→ restart → usunięcie dopływu. Powstają PNG i raport z rozkładem czasów
symulacji oraz budowy siatek w `test-results/water-flow/`.

Końcowe wyniki, stan testów WebGL i kompilacji oraz linki do artefaktów
są w opisie PR przygotowującego 0.72.0. Pomiary programowego WebGL w CI
nie są pomiarem karty gracza i nie stanowią gwarancji stałego FPS.

Lokalny mikrobenchmark geometrii (Node 24.22.1, pięć prób) dał medianę
0,000284 ms dla obliczenia wysokości powierzchni oraz 0,386 ms dla siatki
chunka z 256 komórkami różnych poziomów wody. [Surowe próbki](pomiary/woda-0.72.0/geometria-cpu.json).
To izolowany koszt funkcji, nie czas pełnej klatki ani porównanie FPS.
