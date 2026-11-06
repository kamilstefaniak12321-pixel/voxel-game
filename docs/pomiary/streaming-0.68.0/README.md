# Powtarzalny pomiar streamingu i roślinności 0.68.0

Harness uruchamia prawdziwe `Game.update()` i `Game.render()` w Electronie,
z nowym światem i osobnym profilem. Nie odczytuje zapisów zainstalowanej gry,
nie uruchamia aktualizatora i nie zapisuje testowego świata.

## Uruchomienie

Zainstalowany Electron projektu uruchamia `native-launcher.cjs`:

```powershell
& '<electron.exe>' '<checkout-kandydata>\docs\pomiary\streaming-0.68.0\native-launcher.cjs' --baseline '<checkout-0.67.0>' --size=1920x1080
& '<electron.exe>' '<checkout-kandydata>\docs\pomiary\streaming-0.68.0\native-launcher.cjs' --size=1920x1080
```

Uruchamiać **kolejno**, z zasilaczem i zamkniętą zwykłą grą. Opcja `--quick`
skraca scenariusz i używa pełnego terenu 64 / horyzontu 1024: służy jedynie
do sprawdzenia działania harnessu. Nie reprezentuje najwyższych ustawień.
Dozwolone rozmiary: 1920×1080, 1920×1057 i 1600×900. Rozmiar bufora rysowania
jest zapisany niezależnie od wymiarów okna.

Raporty trafiają do sąsiedniego katalogu `streaming-proof/<runId>/`.
`streaming-proof/latest-run.json` wskazuje ostatni katalog. Każda próba
zawiera odcisk źródeł (łącznie z biblioteką Three.js), odcisk harnessu,
commit, wersję aplikacji, Electron/Chromium i dane karty graficznej.

## Scenariusz na ustawieniach z raportu

- Seed `test`, teren realistyczny; kamera zaczyna na −66, 80, −99.
- Pełny teren 800, horyzont 16384, szczegółowe rośliny, liście z części,
  cienie 3, promienie światła, rozdzielczość 100%, budżet ładowania 4 ms,
  limit 120 FPS. Jasność 50, AO 45. Ustawienia są dołączone do raportu.
- Świat ładuje się do 1800 chunków lub przez maksymalnie 150 s.
  Osiągnięcie limitu czasu jest widoczne w licznikach checkpointu.
- Przy 1800 chunkach harness tymczasowo wstrzymuje wyłącznie metodę
  `streamChunks()`. Ostatni odbiór ogranicza do brakującej liczby chunków,
  ponieważ stara wersja przyjmuje do dwóch wyników na raz, a nowa jeden.
  Zasięg, kamera i ustawienia nie ulegają zmianie. Siatki dalej powstają.
- Przez maksymalnie 30 s czekamy na puste kolejki terenu i roślin oraz
  brak aktywnych `meshJobs`. Po kolejnych 2 s stabilizacji następuje 15 s
  `held-stationary`. To pomiar rysowania ograniczonego, identycznego
  zestawu terenu, **nie** stan ustalony pełnego zasięgu 800 bloków.
  Porównanie wymaga jednakowych `chunkSet.keys` (oraz ich skrótu) w obu
  próbach i pustych kolejek. Jeśli siatki nie zdążą, faza jest pomijana
  z ostrzeżeniem. Następnie odbiór terenu zostaje wznowiony.
- Zmiana jakości szczegółowe → półszczegółowe → szczegółowe wywołuje
  prawdziwą zmianę wersji modeli, z jednym końcowym celem. Baseline
  przebudowuje cały teren, kandydat wyłącznie pobliskie rośliny.
- Następne 90 s mierzy przebudowę i dalsze wczytywanie przy nieruchomej
  kamerze. Potem kamera przemieszcza się o 195 bloków na zachód i 36 na
  południe przez 30 s, przy stałej wysokości.
- Maksymalnie 90 s oczekiwania na zakończenie ładowania i przebudów.
  Dopiero po opróżnieniu kolejek przez 3 s zaczyna się 20 s pomiaru
  `settled-stationary`. Brak tej fazy oznacza, że pełny teren nie zdążył
  się ustabilizować — wynik nie jest pomiarem stanu ustalonego.
- Limit pamięci sterty JavaScript 6500 MiB i czasu 480 s kończy próbę
  z jawnym powodem. To zabezpieczenie testu; nie zmiana zachowania gry.

Dla powtarzalności czas świata i wzrost są zatrzymane, wyłączono dźwięk,
meteoryty i rękę. Pozostałe oświetlenie i animacje roślin pozostają aktywne.
To nie jest dosłowne odtworzenie wejścia użytkownika z raportu; oba warianty
przechodzą identyczny, kontrolowany scenariusz.

## Co porównywać

`result.json` zawiera rozkłady odstępów między klatkami, CPU, osobno update
i render, oraz rzeczywiste próbki GPU i etapy CPU z `PerfDiagnostics`.
Koszt CPU jest przypisany do następującego po nim odstępu RAF. GPU jest
próbkowane asynchronicznie, bez przypisania konkretnej wolnej klatki.

Raz na sekundę zapisywane są chunki, obie kolejki siatek, stan workera,
wywołania rysowania, trójkąty, geometrie i sterta JavaScript. Checkpointy
mają także ilość geometrii roślin i unikalnych buforów CPU. Ta liczba nie
jest pomiarem VRAM. Draw calls obejmują wszystkie przebiegi renderowania.

Lepszy streaming może w tym samym czasie załadować **więcej** świata.
Nie porównywać samych FPS przy różnych ilościach gotowego terenu jako
czystego przyspieszenia renderowania. Porównywać także tempo przyjmowania
chunków, gotowe wyniki workera, czas opróżnienia kolejek i zbliżone
checkpointy obciążenia. Utrata aktywności/ukrycie okna jest raportowana.

## Odbiór wyglądu i regresji

F8 ukrywa panel. Kadry zapisują się na granicach faz i na końcu; przycisk
pozwala zapisać dodatkowy kadr. Do oceny roślinności sprawdzić:

1. Zgodność kształtu, koloru, światła i ruchu widocznych roślin przed/po.
2. Ciągłość przy marszu przez granice chunków i promień widoczności roślin;
   zapas generowania nie powinien odsłaniać spóźnionych kęp w pobliżu.
3. Zmianę jakości podczas wczytywania: teren nadal doczytuje się, a worker
   nie pozostaje przez wiele sekund z gotowymi, nieodebranymi wynikami.
4. Zmianę bloku i zbiór owocu podczas trwającej budowy siatki: gotowy model
   musi odzwierciedlać aktualny stan, a nie przestarzałe zadanie.
5. Cienie roślin, przejścia wzrostu i światło lokalne na osobnej geometrii.
6. Powrót do menu / usunięcie odległego chunka: brak jego meshów i cieni
   oraz brak kolejnego zastosowania anulowanego zadania.

## Wstępna próba granicy pamięci

Pilot bazowej wersji, wykonany przed wyborem checkpointu 1800, miał cel
3000 chunków i zatrzymał się po około 75,85 s na limicie 6500 MiB sterty,
przy 2214 chunkach. Nie doszedł do zmiany jakości ani pomiaru stacjonarnego.
Dlatego nie służy jako wynik A/B; potwierdził potrzebę wcześniejszego,
ograniczonego checkpointu. Jego oryginalny odcisk harnessu pozostaje w
lokalnym raporcie `baseline-report-2026-11-06T17-42-18-745Z`.

Launcher przyjmuje tylko lokalne polecenia `status`, `shot`, `exit` przez
`<runDir>/command.json`, np. `{"id":"stop-1","action":"exit"}`. Nie
przyjmuje dowolnego kodu ani ścieżki pliku w tym kanale.
