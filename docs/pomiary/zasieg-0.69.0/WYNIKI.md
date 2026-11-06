# 0.69.0 — wynik próby zasięgu na RTX 3050

Pomiar z 6 listopada 2026 r. do [PR #103](https://github.com/kamilstefaniak12321-pixel/voxel-game/pull/103).
Porównano 0.68.0 z 0.69.0 na tym samym laptopie i przy tych samych ustawieniach.
Nowy sposób rysowania zasięgu ukończył wczytywanie i osiągnął średnio **86,81 FPS**
w nieruchomej, gotowej scenie. Podczas ruchu było **66,53 FPS średnio**, ale p95
czasu klatki wyniosło 23,7 ms: ten wynik nie oznacza utrzymania 60 FPS w każdej
chwili. Pełne warunki, ograniczenia oraz odciski danych są poniżej.

## Warunki i porównywalność

- NVIDIA GeForce RTX 3050 Laptop GPU, ANGLE/D3D11, bufor obrazu **1920×1057**, skala 1.
- Electron 44.4.5 / Chromium 152.0.7977.130. Osobne profile, nowy świat `test`,
  bez odczytu lub zapisywania świata zainstalowanej gry.
- Zasięg 800, horyzont 16384, szczegółowe rośliny i liście z części,
  cienie 3, promienie światła, AO 45, rozdzielczość 100%, limit 120 FPS,
  budżet wczytywania 4 ms. Wszystkie ustawienia zapisano w `evidence.json`.
- Zatrzymany czas świata 0,25 i wzrost roślin; wyłączone dźwięk, meteoryty
  i ręka. Wiatr oraz oświetlenie działały. Kamera i przebieg są opisane
  w [README.md](README.md).
- Przed próbami nie działała druga gra. Odczyty `Win32_Battery` przed
  próbami oraz przed i po końcowym uruchomieniu kandydata wskazywały
  `BatteryStatus=2`, 79% baterii, czyli zasilanie AC.
  To kontrole w określonych momentach, nie ciągły zapis zasilania.

`compare.mjs` potwierdził wszystkie 11 warunków: identyczny harness,
rozdzielczość, ustawienia, czasy faz, GPU i seed; obecność obu stałych próbek,
identyczną kamerę tej fazy, pełny czas próbek, brak błędów i brak utraty
aktywności okna. Oba raporty mają `valid=true`; nie powstały dodatkowe pliki
błędów importu, konsoli, ładowania lub procesu renderującego. Obie wersje
uruchomiono kolejno, bez równoległych ciężkich testów.

**To porównanie całych sposobów rysowania zasięgu, przy jednakowym ustawieniu
wizualnym. Liczba pełnych chunków i geometria celowo są różne.** Wynik nie
izoluje oszczędności samych liści ani samego współdzielenia głębi.

## Te same przedziały czasu

Najbardziej bezpośrednie porównanie to 20 sekund postoju po pierwszych
60 sekundach zwykłego wczytywania. Baza nadal wczytywała świat; kandydat
miał już gotowy bliski i daleki teren przez całą tę próbkę.

| Pomiar, stała kamera po 60 s | 0.68.0 | 0.69.0 |
| --- | ---: | ---: |
| Średnie FPS | 25,42 | 86,92 |
| Czas klatki p95 / p99 | 48,6 / 48,7 ms | 16,8 / 23,7 ms |
| Średni CPU update + render | 38,74 ms | 10,62 ms |
| Średni GPU | 29,92 ms | 10,83 ms |
| Średnie polecenia rysowania, wszystkie przebiegi | 2743 | 826 |
| Średnie trójkąty, wszystkie przebiegi | 14,12 mln | 2,74 mln |
| Sterta JavaScript na końcu | 3875 MiB | 716 MiB |
| Bufory geometrii CPU na końcu | 3081,0 MiB | 459,1 MiB |
| Załadowane pełne chunki na końcu | 3327 | 613 |
| Cały wybrany widok gotowy | nie | tak |

W tej konkretnej fazie liczba poleceń spadła o **69,9%**, średni czas GPU
o **63,8%**, a bufory geometrii CPU o **85,1%**. Średnie GPU są ważone
liczbą rzeczywistych próbek. CPU i GPU pracują częściowo równolegle;
podanych czasów nie należy dodawać. Bufory CPU obejmują bliskie siatki
oraz wszystkie zachowane kafle dalekiego terenu, nie są pomiarem VRAM
ani wszystkich dodatkowych alokacji renderera.

| Faza | 0.68.0 FPS | 0.69.0 FPS | 0.68.0 p95 | 0.69.0 p95 |
| --- | ---: | ---: | ---: | ---: |
| Pierwsze 60 s wczytywania | 47,28 | 79,28 | 34,7 ms | 20,7 ms |
| 20 s stałej kamery | 25,42 | 86,92 | 48,6 ms | 16,8 ms |
| 40 s ruchu | 18,91 | 66,53 | 76,3 ms | 23,7 ms |

Ruch obejmował 195 bloków na zachód i 36 na południe, z łagodnym obrotem
kamery. W 0.69.0 p99 wynosiło wtedy 30,5 ms. Nowa wersja wyraźnie
ogranicza koszt zasięgu, ale krótsze spadki podczas przemieszczania nadal
występują.

## Gotowy widok i ograniczenie próby bazowej

0.68.0 zatrzymał testowy limit sterty 6500 MiB po **224,97 s**. Na końcu
było 5788 chunków, 2709 pozycji w kolejce wczytywania i około 6506 MiB
sterty. Dalekie kafle były gotowe, lecz bliski świat nadal się wczytywał.
To nie był błąd gry ani pomiar gotowego pełnego zasięgu:
`reason=heap-guard-6500MiB`, `steadyStateMeasured=false`. Limit chronił
komputer w czasie testu; nie jest limitem produkcyjnej gry.

0.69.0 zakończył cały scenariusz w około **178,2 s**. Po ruchu potrzebował
4,25 s fazy uspokajania, w tym wymaganych 3 s ciągłej gotowości. Następna
20-sekundowa próba `settled-stationary` miała puste kolejki przed, po i we
wszystkich próbkach sekundowych:

| Gotowa scena 0.69.0, po ruchu | Wynik |
| --- | ---: |
| Średnie FPS | 86,81 |
| Czas klatki p95 / p99 | 16,8 / 23,7 ms |
| Średni CPU / GPU | 10,52 / 11,13 ms |
| Średnie polecenia / trójkąty | 1064 / 3,80 mln |
| Sterta / bufory geometrii CPU | 1022 / 615,4 MiB |
| Pełne chunki / widoczne kafle dalekiego terenu | 693 / 659 |
| Brakujące kafle / żądania / aktywne przenikania | 0 / 0 / 0 |
| Puste grupy geometrii / błędne programy shaderów | 0 / 0 |

Kandydat ma `steadyStateMeasured=true`. Nie ma porównywalnego pomiaru
gotowej sceny bazowej, dlatego nie wyliczamy dla tej fazy przyspieszenia
względem 0.68.0. Wynik dotyczy jednego seeda, trasy, pory dnia i laptopa;
nie jest gwarancją wszystkich scen lub wydajności telefonu.

Raport potwierdza trzy poziomy geometrii liści i roślin. Na końcu gotowej
fazy siatki liści rozkładały się na poziomy `[41, 100, 478]`, a roślin
na `[30, 48, 445]`. Daleki teren używał stopni 1, 2 i 4 bloków odpowiednio
do odległości 256, 448 i 800; dalej działał oszczędniejszy horyzont.
Współdzielenie głębi było aktywne: `source=main`, `reused=true`,
`extraDraws=0` dla promieni światła.

## Ocena wyglądu

Obejrzano parę ujęć kończących `fixed-stationary` oraz wszystkie cztery
końcowe kadry kandydata. Kadry końcowe są **próbą wyglądu, nie źródłem
podanych FPS** — fazy `visual-*` są wyłączone z porównań wydajności.

- Bliskie rośliny zachowują rozpoznawalne modele, kolory kwiatów i tekstury.
  Pozostają widoczne rzeźba terenu, pas plaży i daleka sylwetka lasu.
- Na oglądanych kadrach nie widać pustej szczeliny między bliską i daleką
  warstwą. Dodatkowy test pikseli sprawdza pełne pokrycie podczas przejścia
  i zachowanie szczegółowej warstwy, gdy zamiennik nie jest gotowy.
- **Ograniczenia jakości:** korony odległych drzew są wyraźnie uproszczonymi
  bryłami. Na wodzie w pasie przekazywania widoku widać ziarniste
  przenikanie. To kompromisy tej wersji; przejście nie jest niewidoczne.

Ta sama kamera po stałej fazie:
[0.68.0](images/baseline/checkpoint-movement.png) ·
[0.69.0](images/candidate/checkpoint-movement.png).
Końcowe ujęcia 0.69.0:
[bliskie rośliny](images/candidate/visual-near-plants.png) ·
[las](images/candidate/visual-forest.png) ·
[strefa przejścia](images/candidate/visual-transition.png) ·
[horyzont](images/candidate/visual-horizon.png).
PNG są niezmienionymi zapisami okna próby.

## Sprawdzenia i pochodzenie dowodów

Przeszło pełne `npm test`, w tym 659 kontroli modeli odległych, 42 kontroli
stref, 1032 kontroli dalekiej roślinności, 155 meshera partiami oraz
163794 kontroli katalogu modeli roślin. Osobne próby przeglądarkowe
potwierdziły 57 wariantów shaderów, 18 kontroli głębi i przejścia
WebGL2/WebGL1 oraz 8 kontroli rozdziału siatek roślin. Test przejścia
na dystansach 144/156/168/180/192 nie znalazł pustego piksela. Kontrola
menu obejmowała 217 przypadków. Odciski logów oraz syntetyczne wyniki
pikseli są w [evidence.json](evidence.json).

Regresja nowo odsłoniętych kafli obejmuje brak, częściowe i pełne pokrycie
poprzednim zestawem. Przenikanie zaczyna się od zera tylko przy pełnym
pokryciu; pozostałe nowe kafle są od razu widoczne przed oddaniem im pikseli
przez bliski teren. Kontrolne przywrócenie starego warunku powoduje błąd
testu. Po poprawce powtórzono cały pomiar kandydata; zestawienie i jego
kadry pochodzą wyłącznie z tego końcowego przebiegu.

| Źródło | 0.68.0 | 0.69.0 |
| --- | --- | --- |
| Commit podczas startu | `73ef0c1f1bd16df14d02687cb6c8784afb966e80` | `1a0c60d9cf299ed2b9966e473d97d2be4cd2c63a` |
| Niezapisane zmiany podczas startu | brak | brak |
| SHA256 `src` + Three.js | `20da31700f18f3be523f9156273df816faa58a0a9c1b411178de96ec3089fa2e` | `49e262c03e0c52e8d84650bbec480d4fac60a6a8521db0e977496689b08d4d48` |
| SHA256 surowego raportu | `59bd40d0420fa7a33c5092e950c6b13c5955f9e25488960c7ebe709864ec2980` | `5e76138df7eac5610330a02212922ccf6fd7d7677cc5fd3ad7afeb8a4bde3eac` |

Wspólny SHA256 harnessu:
`c0df5dea4a3d56e80ec6b5f175919631c07f46020b11c0ff03e572be97e5e99f`.
Skrypt ponownie policzył odcisk aktualnego runtime i potwierdził zgodność
ze zmierzonym kandydatem (`candidateMatchesCurrentRuntime=true`).
Późniejsze dopisanie dokumentacji nie zmienia tego odcisku.

Identyfikatory prób:
`baseline-report-2026-11-06T19-59-23-538Z` oraz
`candidate-report-2026-11-06T20-26-39-735Z`.
`evidence.json` zawiera skrócone dane i SHA256 wszystkich kadrów;
pełne szeregi klatek i izolowane profile przeglądarki pozostają poza
repozytorium. Odtworzenie zestawienia po nowych próbach:

```sh
node docs/pomiary/zasieg-0.69.0/prepare-evidence.mjs '<baseline-directory>' '<candidate-directory>' '<output.json>'
```

Próba lokalna nie oznacza opublikowania wersji. Status kompilacji
Windows/Android i wydania należy sprawdzać w PR #103.
