# Odbiór atmosfery E08 — 0.63.0

Ta próba uruchamia rzeczywiste `Game.update` i `Game.render` z osobnym
profilem Electron, bez odczytywania ustawień i światów użytkownika.
Zapis świata i dźwięk są wyłączone. Kod próbny nie publikuje aktualizacji.

## Uruchomienie

Z katalogu repozytorium, na zasilaczu i bez drugiego aktywnego okna gry:

```powershell
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\atmosfera-0.63.0\native-launcher.cjs --size=1920x1080
```

Alternatywne okno: `--size=1600x900`. Launcher nie zmienia rozdzielczości
monitora. `--uncapped` wyłącza VSync; takich wyników nie wolno łączyć
z próbami ograniczonymi odświeżaniem monitora. F8 przełącza panel,
Ctrl+Shift+Q zamyka próbę, Ctrl+R uruchamia nowy izolowany świat.

JSON i oryginalne PNG trafiają do `../lighting-atmosphere-proof/native`.
Manifest identyfikuje commit, modyfikacje, surowy hash źródeł i harnessu,
wersję Electron/Chromium, ekran i bufor renderowania. Informacja GPU
z manifestu startowego jest wczesna; rzeczywistą kartę potwierdzają
`device.renderer` odczytane z WebGL i dostępność zapytań czasu GPU.

## Sceny

- **Las i rzeka:** realistyczny seed `2138286349`. Panorama z oka
  `(188,132,-252)`, brzeg z `(198,63.6,-261)`, daleki las i kadr z wysokości
  420 bloków. Zasięg pełnych bloków można zmienić 64/128, horyzont 1024/2048.
  Cienie pozostają na poziomie 3. Trasa lotu porusza kamerę po torze
  120 s nad rzeczywistym terenem; obejmuje doczytywanie chunków.
- **Zamknięty korytarz:** 64 bloki długości, dach i ściany ze zwykłych
  bloków, białe i drewniane odbiorniki oraz osiem ciepłych pochodni.
  Oko `(160.5,19.4,-131)`, widok wzdłuż pomieszczenia. Przycisk okna
  usuwa/stawia 25 bloków ściany końcowej; raport zawiera sondy światła
  kamery, środka, końca i zewnętrza. Kamera „Przy oknie” sprawdza
  widok na zewnątrz z osłoniętego miejsca. Korytarz wymusza zasięg 128,
  żeby obie ściany pozostały wczytane.
- **Paleta i emitery:** niezmieniona scena odniesienia 0.57.0,
  z dodatkową pochodnią przy materiałach. Kamery pokazują krzewy,
  białe/szare powierzchnie, dach, komorę i ognisko.

Sześć pór pochodzi z `LightingReference`: południe, złota godzina,
zachód, pełne zachmurzenie, błękitna godzina i noc. Czas świata oraz
wzrost roślin są zatrzymane; wiatr i płomienie działają w pomiarze.
Kolejne 25% zachmurzenia pozwalają kontrolować przejście profilów.

## Porównanie A/B i obrazy

„Atmosfera: 0.62” i „Atmosfera: Nowa” zmieniają wyłącznie
`atmosphereLook` w tym samym kodzie. To porównanie dwóch ścieżek mgły,
nie pomiar dwóch osobnych plików wykonywalnych. Paleta Naturalna, HDR,
stała ekspozycja 1, materiały, źródła, jasność 0, kamera i rozdzielczość
pozostają wspólne. Tryb ziemniaka jest osobnym odbiorem jakości,
nie częścią kosztu A/B standardowego profilu.

„2 kadry A/B” wymaga ukończonego ładowania, zatrzymuje animacje,
ukrywa panel i zapisuje oba PNG z identycznym czasem. Raport zapisuje
uniform czasu, pose kamery, stan mgły i liczbę przebudów od początku
pary. Surowych obrazów nie należy przeskalowywać ani poprawiać kolorów.

Kontrola wzrokowa obejmuje: szczegóły blisko kamery, ciągłość dalekiego
lasu i horyzontu, ciepły zachód/chłodny zenit, zmianę wysokości, ciepłe
emitery nocą, brak niebieskiej mgły w zamkniętym korytarzu oraz widok
przez otwór z wnętrza. Niska jakość powinna zachowywać tę samą paletę.

## Pomiary

„Pomiar 10 + 30 s” czeka na puste kolejki świata i gotowe odbicia, jeśli są włączone,
odczekuje jeszcze 2 s, rozgrzewa przez 10 s i zapisuje 30 s klatek.
Utrata aktywności okna, błędy JS/shaderów lub niepusta kolejka podczas
nieruchomego pomiaru unieważniają wynik. Próbka bez ważnych czasów GPU
nie może służyć do oceny kosztu GPU.

„3 pary A/B” wykonuje kolejno stara/nowa, nowa/stara, stara/nowa;
przy błędzie kończy serię i przywraca wcześniejszy wybór. Pełny koszt
porównujemy przez medianę różnic par GPU oraz P95/P99 czasu klatki,
nie przez sam FPS ograniczony odświeżaniem monitora. Roboczy cel
samej mgły to brak dodatkowych regularnych przycięć i niewielki koszt
wobec budżetu 16,67 ms; o przyjęciu decyduje też widoczny efekt.

„Lot 120 s” ma ten sam rozruch, ale ruch i doczytywanie są zamierzone.
Klatki z niepustymi kolejkami są zliczane, nie unieważniają takiej próby.
Raport zawiera liczniki zasobów co 10 s. To krótka kontrola streamingowa,
nie dowód braku wycieku pamięci podczas wielogodzinnej gry.

Raporty zachowują wszystkie odstępy rAF, czas CPU update/render,
niezależne zapytania GPU, medianę, P95, P99 i liczbę klatek ponad
16,67/33,33/50 ms. Tylko `frame.averageFps` oznacza FPS gry. Odczyty
GPU mogą obejmować inny rozkład pracy niż odstępy prezentacji klatek.

Wyniki rzeczywistego odbioru, kadry A/B i ograniczenia opisuje
[WYNIKI.md](WYNIKI.md); skrót raportów i ich hashe zawiera
[evidence.json](evidence.json).
Kompilacja Androida nie jest pomiarem na fizycznym telefonie.
