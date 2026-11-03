# Odbiór podstaw oświetlenia — 0.57.0

Harness uruchamia prawdziwy `Game` z seedem 42 na placu `flat` i osobną
sceną `paleta`. Nie uruchamia menu w tle. Ma własny profil Electron,
nie otwiera IndexedDB i nie odczytuje/zapisuje ustawień gracza.
To narzędzie pomiarowe; obecność plików nie oznacza wykonanego pomiaru.

## Uruchomienie

Z katalogu repozytorium, Electronem 44.4.5:

```powershell
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\swiatlo-0.57.0\native-launcher.cjs --baseline ..\voxel-menu-detail --size=1600x900
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\swiatlo-0.57.0\native-launcher.cjs --size=1600x900
```

Ścieżka wskazuje istniejący lokalny runtime w `shadow-native-tools`;
po własnej instalacji można wskazać `node_modules/electron/dist/electron.exe`.
Uruchamiaj tylko jedno okno naraz. `--baseline` serwuje kod i zasoby
niezmienionego checkoutu 0.56.1. Tylko harness oraz ten sam plik
`src/dev/LightingReference.js` pochodzą z nowego checkoutu. Manifest
zawiera commit, wersję, SHA-256 sceny, rozdzielczość i renderer.
Zapisuje również rzeczywisty SHA-256 wszystkich plików `src` (włącznie
z nieśledzonymi), spis/nazwy/rozmiary zasobów, stan `git status`, hash
`git diff --binary HEAD` kodu/zasobów/wersji/changeloga oraz hash harnessu.
Commit bazowy z brudnym worktree nie jest więc przedstawiany jako
niezmieniona wersja. Fingerprint powstaje przy uruchomieniu procesu.
Przełącznik „Poprzedni wygląd” w nowym kodzie służy dodatkowemu A/B;
nie zastępuje pomiaru starego wydania.

Opcjonalny `--size=1920x1080` wymaga ekranu 1920×1080 i pełnego ekranu.
Domyślne 1600×900 oznacza dokładny rozmiar zawartości, DPR=1, AA włączone.
Launcher nie zmienia rozdzielczości systemowej.

Domyślnie pozostaje VSync. Dodaj `--uncapped` po obu stronach porównania,
aby mierzyć koszt bez limitu odświeżania; manifest to zapisuje. Wynik
60 FPS przy VSync nie wystarcza do potwierdzenia narzutu poniżej 5%.

## Procedura

- Zasilacz, RTX 3050, jedno aktywne okno gry, identyczny rozmiar i tryb VSync.
- Siedem kamer i sześć presetów czasu/chmur wybiera się przyciskami.
  Kamera ma zapisaną pozycję oka, cel i nie rusza się podczas pomiaru.
  Stare wydanie nie obsługuje zachmurzenia: raport odróżnia żądany preset
  od rzeczywiście zastosowanego. Nie udaje się tam pochmurnego dnia.
- Poczekaj na gotowość. Przycisk pomiaru ponownie czeka na puste kolejki
  i 2 s stabilności, rozgrzewa przez 10 s, zbiera dane przez 30 s.
  Zmiana kadru, presetu lub wyglądu jest wtedy zablokowana. Utrata
  aktywności, zmiany geometrii lub błąd unieważniają próbę.
- Raport zawiera medianę/P95 czasu klatki, całego update+render na CPU,
  osobno update/render i GPU (`EXT_disjoint_timer_query_webgl2`), liczbę
  odrzuconych/pominiętych GPU próbek, pamięć, draw calle, trójkąty,
  wersję geometrii, stan kolejek i pełne ustawienia. GPU obejmuje
  polecenia update+render; CPU nie jest „czasem GPU”.
  `resources.worldOutput` podaje tryb, ekspozycję, liczbę próbek MSAA,
  rozmiar i szacowaną pamięć bufora końcowego; 0.56.1 ma tryb original.
- Zrób trzy przeplatane pary baseline/nowe przy tych samych kadrach.
  Dla samej kolorystyki porównaj medianę i P95: `nowe/stare - 1 <= 0.05`.
  Szum większy niż 5% oznacza wynik nierozstrzygający i wymaga ponownej
  pary. Oddzielnie sprawdź animacje i końcowe granie z limitem 60 FPS.
- „Zapisz czysty kadr” chowa panel na czas zdjęcia i zapisuje PNG z JSON
  opisującym kadr. F8 przywraca/ukrywa panel. Ctrl+Shift+Q zamyka próbę.
- „Zapisz 6 profili” wykonuje serię kolorowych zdjęć bieżącej kamery;
  „6 profili w szarości” robi analogiczną serię w nowej wersji.
  Każdy profil czeka na puste kolejki, 2 s stabilności terenu i gotowe
  mapy cieni. Seria nie jest benchmarkiem. Zatrzymuje ruch kamery,
  blokuje inne kontrolki i pokazuje postęp; można ją anulować.
  Po ukończeniu lub błędzie przywraca czas/preset, zachmurzenie,
  diagnostykę i kamerę. Maski źródeł pozostają wybrane przez testera.

Raporty, zdjęcia i odrębne profile trafiają obok checkoutu do
`lighting-update-proof/native/`. Nie ma żadnych wyników wpisanych z góry.
Ognisko i wiatr są animowane; wyłącz „Ruch roślin i ognia”, gdy celem jest
statyczne porównanie obrazów. „Odtwórz scenę” przywraca bloki i stan ognia.
Ta niewielka scena mierzy podstawę materiałów. Nie zastępuje próby
gęstego lasu, dalekiego terenu 800, chodzenia i rzeczywistego Androida.

## Las i ruch kamery

„Las / horyzont 800+” zwalnia poprzednią grę i tworzy osobny świat
`realistic`, seed `2138286349`, bez zapisów. „Paleta” analogicznie
odtwarza scenę odniesienia; oba światy nie działają równocześnie.
Oba checkouty używają pełnych chunków do **64**, LOD do **1024**,
cieni jakości **3** (zasięg dalekich cieni 800) i w lesie włączonych
promieni światła. Nie są to pełne chunki w promieniu 800 bloków.

Kadr „Panorama 132” ma oko `(188,132,-252)`, cel `(216,67,-202)`.
„Brzeg z bliska”: oko `(188,54.6,-252)`, cel `(168,52,-265)`.
Generator potwierdza grunt 51 pod pierwszym punktem, grunt 48 i wodę 50
w rzece przy `(168,-252)`. Raport zapisuje również faktyczny grunt.

Orbita robi pełen obrót po promieniu 12 w 30 s. „Spacer kamery” to
powtarzalna 30-sekundowa pętla nad gruntem, wokół `(188,-252)`
(półosie 24 i 12); nie symuluje kolizji gracza. Każdy pomiar zaczyna
tor od tej samej fazy po rozgrzewce. Raport ruchu ma rodzaj
`movement-including-streaming`: przebudowy i kolejki są mierzone,
a nie traktowane jako automatycznie nieprawidłowa próba statyczna.

„Cienie ruchomych roślin” pozwalają oddzielić koszt mapy cieni roślin
od samej palety; nie zmieniają uniformu kolorystyki. Kontrolka nie
jest dostępna w 0.56.1. W nowym checkoutcie sekcja diagnostyczna
wywołuje istniejące `setLightingView` i `setLightingComponent`.
Widok i sześć masek źródeł zapisują się w raporcie. W baseline moduł
diagnostyki nie jest importowany. Do finalnych kadrów wróć do `full`
i włącz wszystkie źródła.
