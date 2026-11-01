# Lokalna próba krzaków 0.50.0

Raport i ograniczenia: [krzaki-owocowe-0.50.0.md](../../krzaki-owocowe-0.50.0.md).

Pliki `before-*` pochodzą z 0.49.0 (`b299f76`), `after-*` z `cf6db57`.
Tablica `results` w JSON jest narastająca w ramach sesji. Dla nazwy
danego pliku raport używa ostatniego pomiaru. Powtórne próby w tej samej
sesji pozostają widoczne. `after-integration.json` zawiera 37 pozytywnych
sprawdzeń interakcji i zapisu; `after-gpu.json` wynik materiałów GPU.
Pomiary wykonywano osobno, bez tych sprawdzeń w tle.

PNG to bezpośrednie kadry płótna gry (bez nakładki testowej i HUD).
`ogrod.png` przedstawia wszystkie cztery etapy pięciu gatunków; plik
powstał po pomiarach, nie służy do odczytywania ich FPS. Normalne zapisy
użytkownika nie były otwierane ani dołączane do repozytorium.

## Odtworzenie próby

Skrypty są archiwum lokalnego stanowiska, poza produkcyjnym wejściem gry.
Skopiuj trzy pliki `fruit-bush-qa.js`, `serve-fruit-bush-qa.cjs` oraz
`fruit-bush-native-launcher.cjs` do osobnego katalogu roboczego. W nim
przygotuj dwa checkouty: `voxel-fruit-baseline` na `b299f76` i
`voxel-fruit-bushes` na `cf6db57`, wraz z zależnościami projektu.

Uruchom `node serve-fruit-bush-qa.cjs` (nowa wersja) albo z argumentem
`--baseline` (baza). Serwer nasłuchuje tylko na 127.0.0.1, odpowiednio
63516/63517. Następnie istniejącym Electronem 44.4.5 uruchom
`fruit-bush-native-launcher.cjs`, z tym samym argumentem dla bazy.
Launcher wymaga ekranu 1920×1080; sam nie zmienia ustawień systemu.
Tworzy odrębny profil w `voxel-fruit-bush-proof/native-user-data`.
Włącz tylko jedną wersję naraz. Zamknięcie: Ctrl+Shift+Q.

Wczytaj przygotowany świat. Przyciski nakładki tworzą ogród, pokazują
zbliżenia i uruchamiają sprawdzenia. Pomiary: 10 s rozgrzewki + 30 s
próbkowania. Dla porównania zacznij od świeżego uruchomienia, wykonaj
pomiar statyczny, masowe zmiany etapów i pojedynczy wzrost. Nie zwiedzaj
wcześniej świata (zwiększa to liczbę wczytanych chunków). Laptop na
zasilaczu, VSync włączony, monitor 144 Hz. Wyniki zapisują się obok profilu.
