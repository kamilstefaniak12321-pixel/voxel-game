# Odbiór aktualizacji wydajności 0.60.0

Zestaw porównuje niezmienione źródła wydania 0.59.0 (commit
`8aadbe8f878de6c033e4b8750f98c528acd33f20`) z aktualnym checkoutem.
Oba procesy wczytują ten sam harness. Każdy start ma odrębny profil
Chromium; światy i ustawienia gracza nie są odczytywane ani modyfikowane.

## Uruchomienie natywne

Z katalogu repozytorium, przy zasilaczu i jednym oknie gry:

```powershell
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\wydajnosc-0.60.0\native-launcher.cjs --size=1920x1080
```

Opcja `--baseline ..\performance-proof\baseline` wybiera źródła bazowe.
Baseline musi być rozpakowanym `git archive` wskazanego commita; manifest
zapisuje także hash wszystkich plików `src`, więc ewentualna zmiana
snapshotu jest wykrywalna. Dla innego ekranu użyj `--size=1600x900`.
Nie porównuj różnych rozdzielczości ani VSync z `--uncapped`.

Launcher zapisuje JSON i PNG w sąsiednim `performance-proof/native`.
F8 pokazuje panel, Ctrl+Shift+Q zamyka próbę. „Nowy identyczny świat”
przywraca zimny stan generatora i odtwarza rośliny. Powtórzenie trasy
w tym samym świecie korzystałoby z ciepłego cache i nie jest równoważne.

## Wspólne ustawienia

Naturalna paleta, Standard materiałów (odbicia, liście i refleksy ON),
pełny teren 64, LOD 1024, szczegół 2, cienie 3, promienie ON,
budżet ładowania 4 ms, DPR 1 i 1920×1080. Ustawienia obrazu,
wynikowy tor HDR i renderer GPU są w każdym raporcie. Dźwięk, meteoryty,
wzrost roślin oraz odczyt/zapis światów gracza są wyłączone.

## Scenariusze

- **Rzeki i eksploracja:** seed `porownanie-kamila`, prawdziwy teren
  realistyczny. Po ustaleniu kolejek i 10 s rozgrzewki zaczyna się
  nieprzerwany pomiar 90 s. Pierwsze 10 s to widok początkowy;
  w sekundzie 10 kamera przemieszcza się na `(8000,80,8000)`, pozostaje
  tam 10 s, następnie przez 60 s pokonuje 256 bloków na wschód.
  Ostatnie 10 s pozostaje nieruchoma. Wysokość kamery jest stała;
  harness nie odpytuje synchronicznego generatora wysokości na trasie.
  Teleport i doczytanie są częścią pomiaru, nie rozgrzewki.
- **Ogród 64 roślin:** rzeczywisty plac testowy, jeden chunk z indygowcem
  w etapie 3 co dwa bloki. Pomiar 60 s zmienia jedną roślinę na sekundę:
  usunięcie, przywrócenie, następna pozycja. To rzeczywiste `setBlock`
  i aktualizacja światła/mesha, bez wymuszonego ręcznego przebudowywania.
- **Próba 256 roślin:** identyczny scenariusz przy roślinie w każdej
  komórce. To test obciążeniowy, nie średnia gęstość świata.
- **Zapis IndexedDB 16/128/512:** prawdziwa, unikalna baza QA w osobnym
  profilu. Trzy kolejne zapisy każdej wielkości; co drugi chunk zawiera
  ID 65535 w ostatniej komórce. Bezpośrednio po zleceniu zmieniamy żywe
  bloki, pozycję i stan ogniska. Po zapisie sprawdzane są wszystkie komórki,
  typy tablic oraz oryginalne dane gracza i ogniska. Baza QA zostaje
  usunięta po zatrzymaniu workera i zamknięciu połączenia.

## Pomiary i interpretacja

Raport zachowuje wszystkie odstępy między klatkami, czas CPU aktualizacji
i renderowania, sprzętowe zapytania czasu GPU oraz długie zadania głównego
wątku. Podaje medianę, P95, P99, maksimum i klatki ponad 16,67/33,33/50 ms.
Wywołania `World.update`, `generateChunk`, `rebuildChunkMesh` i `prepareZone`
są mierzone osobno. Ich czasy są zagnieżdżone — nie sumujemy ich z czasem
klatki. Instrumentacja sama dodaje niewielki koszt w obu wersjach.
Pole `geometryChanges` to wyłącznie różnica licznika `meshVersion` świata;
licznik nie obejmuje każdej podmiany geometrii istniejącego mesha.
W ogrodzie liczbę faktycznych przebudów określa `operationTimings.rebuild`,
a edycje zawiera osobna lista `edits`. `averageFps` traktujemy jako FPS
wyłącznie w sekcji `frame`; odwrotność czasu CPU/GPU nie jest FPS gry.

Praca workera nie pojawia się jako główne zadanie `prepareZone`; sprawdzamy
również jego statystyki, liczbę ukończonych chunków i czas dochodzenia terenu
do gotowości. Skrócenie klatek kosztem niekończącego się doczytywania nie
jest pozytywnym wynikiem. Utrata aktywności okna unieważnia próbę.

Zapis raportuje czas zgłoszenia, całej transakcji, odczytu i odstępy rAF.
Odczyt oraz pełna walidacja danych są poza pomiarem zapisu. Wszystkie tablice
pozostają żywe; kopia `postMessage` także ma koszt CPU i pamięci.

Oryginalne skrypty z paczki audytu są przechowywane poza repozytorium
w `performance-proof/audit`. Ich wyniki CPU z Node Windows są odrębne
od powyższych testów realnego WebGL. Synchroniczny test generatora
nie mierzy nowej ścieżki workerów; służy też kontroli niezmienionej
zawartości i kosztu samej pracy, niezależnie od jej wątku.
