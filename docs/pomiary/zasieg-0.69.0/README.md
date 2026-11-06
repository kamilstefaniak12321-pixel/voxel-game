# Próba stopniowego zasięgu 0.69.0

Ten sam harness uruchamia rzeczywiste `Game.update()` i `Game.render()`
przeciw źródłom 0.68.0 i 0.69.0. Każde uruchomienie ma nowy świat oraz
osobny profil Electrona. Nie czyta zapisów zainstalowanej gry, nie zapisuje
testowego świata i nie uruchamia aktualizatora.

```powershell
& '<electron.exe>' '<checkout-0.69.0>\docs\pomiary\zasieg-0.69.0\native-launcher.cjs' --baseline '<checkout-0.68.0>' --size=1920x1057
& '<electron.exe>' '<checkout-0.69.0>\docs\pomiary\zasieg-0.69.0\native-launcher.cjs' --size=1920x1057
```

Uruchamiać kolejno, na zasilaczu i bez drugiej gry lub testu obciążającego
GPU. `--quick` jest jedynie próbą harnessu: skraca fazy, ustawia zasięg
256 i horyzont 1024. Nie służy jako pomiar najwyższych ustawień.

Raporty, kadry i osobny profil trafiają do sąsiedniego katalogu
`distance-proof/<runId>/`; `latest-run.json` wskazuje ostatni katalog.
Manifest zapisuje wersję, commit, odcisk `src` i dołączonego Three.js,
odcisk harnessu, Electron/Chromium, GPU oraz faktyczny bufor rysowania.

## Przebieg

- Seed `test`, świat realistyczny, kamera −66, 80, −99, yaw −0,8,
  pitch −0,25. Zasięg 800, horyzont 16384, szczegółowe rośliny i liście
  z części, cienie 3, promienie światła, AO 45, rozdzielczość 100%,
  limit 120 FPS i budżet wczytywania 4 ms. Pełne ustawienia są w raporcie.
- 60 s zwykłego wczytywania ze stałą kamerą. Checkpoint po 30 s i kadr
  na końcu. Nie ma limitu chunków ani zatrzymywania odbioru terenu.
- 20 s `fixed-stationary`: ta sama kamera i ten sam moment scenariusza
  obu wersji. Ta faza **może nadal wczytywać teren**; gotowość jest
  zapisywana osobno przed, po i w każdej sekundzie fazy.
- 40 s ruchu o 195 bloków na zachód i 36 na południe, na wysokości 80,
  z łagodnym ruchem kierunku kamery. Umożliwia ocenę przechodzenia stref.
- Do 180 s oczekiwania na gotowość całego wybranego widoku: pusta kolejka
  chunków i obu rodzajów siatek, brak aktywnego zadania meshera, brak
  brakujących i oczekujących kafli FarTerrain oraz zakończone przenikanie
  jego stref. Warunek musi utrzymać się 3 s.
- Dopiero wtedy 20 s `settled-stationary`. Wynik `steadyStateMeasured`
  wymaga gotowości także na obu końcach i we wszystkich próbkach tej fazy.
- Cztery osobne, ośmiosekundowe ujęcia końcowej lokalizacji: pobliskie
  rośliny z wysokości gruntu + 2,2; las z wysokości 70; strefy z wysokości
  100; horyzont z wysokości 80. Są oznaczone `timedPerformance: false`
  i nie wchodzą do porównania FPS. Kamera pozostaje nieruchoma, dopóki
  zapis kadru nie zostanie ukończony.

Obie wersje mają zatrzymany czas świata (0,25) i wzrost roślin. Wyłączono
dźwięk, meteoryty i rękę; wiatr oraz oświetlenie działają. Limit 6500 MiB
ster­ty JavaScript lub 420 s zatrzymuje próbę z jawnym powodem. To granice
bezpieczeństwa testu, a nie nowe ograniczenia produkcyjnej gry.

## Interpretacja

To porównanie **całego sposobu rysowania zasięgu**, a nie tych samych
siatek. 0.69.0 celowo zachowuje mniej pełnych chunków i zastępuje resztę
odpowiednimi warstwami terenu i roślinności. Nie należy przedstawiać
różnicy FPS jako przyspieszenia identycznej geometrii ani nazywać próby
z nieopróżnionymi kolejkami pomiarem całego gotowego zasięgu.

Raport zachowuje odstępy klatek, CPU update/render, asynchroniczne próbki
GPU, liczbę poleceń i trójkątów wszystkich przebiegów, stertę, poziomy
geometrii liści/roślin, stan kafli i ich roślinności oraz źródło głębi
promieni światła. Bufory geometrii są liczone po unikalnych tablicach CPU
(bliskie chunki i wszystkie zachowane kafle), **nie są pomiarem VRAM**.
Puste grupy i błędy shaderów są raportowane; utrata aktywności okna
unieważnia próbę. CPU i GPU pracują częściowo równolegle.

```powershell
node docs/pomiary/zasieg-0.69.0/compare.mjs '<baseline>\result.json' '<candidate>\result.json'
```

`compare.mjs` weryfikuje harness, GPU, rozdzielczość, ustawienia, seed,
czasy i kamerę. Średnie GPU waży faktyczną liczbą próbek; nie wylicza
globalnego percentyla z percentyli poszczególnych okien.

Launcher obsługuje wyłącznie `status`, `shot`, `exit` przez lokalny
`<runDir>/command.json`, np. `{"id":"stop-1","action":"exit"}`. Nie przyjmuje
dowolnego kodu ani ścieżki pliku. Po zakończeniu pomiaru ostatni kadr
pozostaje na ekranie, a pętla gry zatrzymuje się.
