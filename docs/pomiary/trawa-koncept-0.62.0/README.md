# Odbiór koncepcyjnej trawy 0.62.0

Harness porównuje poprzedni eksperyment z wydania 0.61.0 (commit
`2ac97b885f124c95b1866df1f141200021e0e4e2`) z nowym modelem. Oba źródła
uruchamia ten sam kod pomiaru, z prawdziwym `Game.update` i `Game.render`.
Każdy start otrzymuje osobny profil Chromium, bez odczytu ustawień lub
światów gracza. Próba nie zapisuje świata.

## Uruchomienie

Z katalogu repozytorium, na zasilaczu i przy zamkniętej zwykłej grze:

```powershell
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\trawa-koncept-0.62.0\native-launcher.cjs --size=1920x1080
```

Dla starego modelu dodaj `--baseline ..\voxel-grass-baseline`.
Ten katalog musi być czystym checkoutem wskazanego commita (launcher
sprawdza HEAD i status) albo jego niezmienionym `git archive`.
Manifest zapisuje hash źródeł, stan
bieżącego checkoutu, rozdzielczość i parametry GPU. Nie porównuj różnych
rozdzielczości, kadrów, zasięgów ani VSync z opcją `--uncapped`.

Raporty JSON i kadry PNG trafiają do sąsiedniego `grass-concept-proof/native`.
F8 przełącza panel; Ctrl+Shift+Q zamyka próbę. Kolejne uruchomienia wykonuj
sekwencyjnie, bez drugiego aktywnego procesu gry ani testów CPU w tle.

## Kadry i ustawienia

- **Naturalny brzeg:** realistyczny świat z seedem `2138286349`, pozycja
  gracza `(198,62,-261)`, yaw `2.297439`, pitch `-0.4827`. To kadr używany
  przy poprzednim odbiorze trawy nad rzeką. Przyciskiem obrotu można
  obejrzeć otoczenie; do porównania A/B przywróć identyczny kadr.
- **Kępki z bliska:** plac testowy, dziewięć roślin co trzy bloki, naprzemiennie
  trawa krótka i wysoka. Osobno widać objętość, prześwity i zakorzenienie.
- **Łąka 2304 kępek:** plac testowy z trawą w każdej komórce pola 48×48,
  naprzemiennie krótka i wysoka. To celowo gęsty test nakładania się kart
  tekstury, nie średnia liczba roślin w generowanym świecie.

Wspólne parametry: DPR 1, 1920×1080, render scale 100%, pełny teren 64,
horyzont 1024, szczegół 2, cienie 3, naturalne oświetlenie, materiały
Standard i promienie światła włączone. Czas świata to południe,
wzrost roślin i dźwięk są zatrzymane. Przycisk zasięgu 128 służy
dodatkowej kontroli przejść LOD; taki wynik porównuj tylko z bazą 128.
Przełącznik trawy wywołuje zwykłe ustawienie `bushyGrass` i pozwala
wizualnie sprawdzić przywracanie standardowej trawy bez zmian świata.

## Pomiar

Po opróżnieniu kolejek terenu, meshowania i dalekiego terenu harness
czeka jeszcze dwie sekundy, wykonuje dziesięć sekund rozgrzewki oraz
trzydzieści sekund pomiaru nieruchomego kadru. Utrata aktywności okna,
błąd renderowania lub niepusta kolejka podczas próbki unieważnia wynik.
Kadry można zapisać osobno przy ukrytym panelu, włącznie z pozą kamery.

Raport zawiera wszystkie odstępy między klatkami, medianę, P95, P99,
liczbę klatek ponad 16,67/33,33/50 ms, czas aktualizacji i renderowania
na CPU oraz niezależne zapytania czasu GPU. FPS gry to wyłącznie
`frame.averageFps`, a nie odwrotność czasu samego CPU lub GPU.
`grassByDetail` podaje liczbę kępek w załadowanych meshach dla LOD 0/1/2;
obejmuje również chunki poza aktualnym kadrem. Liczniki draw calls i
trójkątów obejmują cały rendering, także cienie i pozostałe przebiegi.

Dla oceny różnicy najlepiej zrobić sąsiadujące próby baza/kandydat/baza.
Pojedyncza para nie wyklucza zmian taktowania, temperatury lub obciążenia
systemu. Pierwszy kadr służy kontroli wyglądu; syntetyczna łąka ujawnia
koszt nakładania tekstur, którego sama liczba trójkątów nie przewiduje.
