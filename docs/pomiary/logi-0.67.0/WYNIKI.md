# Logi 0.67.0 — sprawdzenie diagnostyki

Sprawdzono rzeczywisty start gry, zapis i eksport raportu, wykrywanie
kontrolowanych błędów oraz przypisanie kontrolowanego przycięcia do
zmierzonego etapu CPU. Pomiary natywne dotyczą RTX 3050 Laptop na
Windows. Próba przeglądarkowa sprawdza poprawność integracji, nie FPS
tej karty. Skrót danych i hashe plików źródłowych są w
[`evidence.json`](evidence.json).

## Natywna próba kosztu — pierwsza seria

Rzeczywisty `desktop/main.js`, preload, protokół `gra://voxel-game`,
bootstrap i główna pętla gry; osobny profil testowy, bez zapisów gracza.
NVIDIA GeForce RTX 3050 Laptop, ANGLE D3D11 / WebGL2, 1920×1080,
DPR 1. Seed `2138286349`, pozycja `(198,62,-261)`, nieruchoma kamera
nad rzeką. Pełny teren 64, horyzont 1024, naturalne światło i atmosfera,
cienie 3, materiały Standard, model liści `parts`. Limit gry wyłączony;
wynik ogranicza VSync monitora 144 Hz. Wzrost roślin i pora dnia
zatrzymane; wiatr pozostaje aktywny.

Cztery próbki po 20 s, każda po 5 s rozgrzewki; kolejność:
wyłączone/włączone/włączone/wyłączone logi wydajności. Oddzielny
obserwator RAF mierzy odstępy klatek. Kolumny CPU pochodzą z istniejącego
`PerfMonitor` i obejmują `update + render`, czyli wykonywanie gry i
wysyłanie poleceń rysowania. Nie obejmują wszystkich czynności loggera
wokół tych etapów ani czasu wykonania poleceń na GPU.

| Kolejność | Logi wydajności | Klatki | FPS | P95 klatki | Maks. klatka | Mediana CPU | P95 CPU |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Wyłączone | 2880 | 144,00 | 7,1 ms | 14,1 ms | 4,3 ms | 5,7 ms |
| 2 | Włączone | 2881 | 144,05 | 7,1 ms | 7,7 ms | 4,4 ms | 6,0 ms |
| 3 | Włączone | 2877 | 143,85 | 7,1 ms | 14,1 ms | 4,4 ms | 6,0 ms |
| 4 | Wyłączone | 2881 | 144,05 | 7,1 ms | 8,2 ms | 4,3 ms | 5,6 ms |

We wszystkich próbkach końcowa kolejka doczytywania była pusta.
Różnica mediany czasu `update + render` wyniosła około **0,1 ms**.
FPS i P95 klatki pozostały podobne. Jest to kontrola jednej nieruchomej
sceny przy VSync, więc nie dowodzi zerowego kosztu loggera ani zachowania
we wszystkich światach i podczas szybkiego przemieszczania.

Ostatnia dostępna próbka loggera w obu próbach z logowaniem miała
18/19 ważnych pomiarów GPU, status `ready`, bez `disjoint`, pominięć
lub wygasłych zapytań. Średnia GPU tej ostatniej próbki to
5,783/5,816 ms. To próbka około jednej sekundy, nie średnia całego
20-sekundowego przebiegu. Bez loggera zapytania GPU są wyłączone,
więc ta seria nie mierzy różnicy kosztu GPU między wariantami.

Pole `overheadMs` wynosiło 3,9/5,6 ms **na całe ostatnie okno około
1 sekundy**, zawierające 145 klatek. Nie jest to narzut każdej klatki.
Obejmuje zadeklarowany zakres CPU rejestratora i zapytań GPU; wywołania
zegara znaczników etapów pozostają wewnątrz mierzonego CPU. Nie zastępuje
niezależnego porównania całej aplikacji.

## Kontrolowane przycięcie

W natywnej grze harness jednorazowo dodał około 85 ms pracy do
aktualizacji gracza. Raport wykazał:

- odstęp klatki **90,2 ms**;
- CPU tej samej klatki **89,6 ms**;
- etap „Gracz, fizyka i interakcje”: **86,5 ms**;
- wskazanie `same-frame-measured-cost` dla tego etapu.

Nie przypisano winy do GPU na podstawie samego niskiego FPS. W próbce
P95 CPU wynosiło tylko 7,7 ms, dlatego przechowanie konkretnych wolnych
klatek jest istotne: pojedynczy duży skok może zniknąć w percentylu.
To celowe wymuszenie służące sprawdzeniu diagnostyki, a nie nowy błąd
fizyki. Wcześniejsze incydenty obecne w sesji są oddzielone w skrócie
dowodowym od tego wymuszenia.

## Błędy, eksport i awaria procesu

Wymuszono trzy rozróżnialne zdarzenia: `console.error`, nieobsłużony
wyjątek i odrzucony Promise. Wszystkie trafiły do raportu z właściwym
rodzajem, komunikatem, stosem i kontekstem. Zapis przez rzeczywisty
systemowy dialog Windows zakończył się plikiem JSON zawierającym
**180 próbek, 71 zdarzeń i 3 oczekiwane błędy**. Czytelne podsumowanie
miało 27 610 znaków. Ostatnia próbka GPU zachowała status `ready`.
Wyeksportowany JSON zawiera również zdarzenia procesu Electrona.

Następnie harness wywołał `webContents.forcefullyCrashRenderer()`.
Natywny dziennik zachował `desktop.renderer-gone`, `reason=crashed`,
`exitCode=2`. To celowa awaria procesu renderera; nie jest dowodem
samoczynnego błędu gry ani awarii całego systemu operacyjnego.

Zarejestrowane ostrzeżenia kompilatora ANGLE `X3595` pozostają
ostrzeżeniami. Raport nie zamienia ich w nieudane kompilacje shaderów.

## Integracja przeglądarkowa

Próba zakończyła się **34 sprawdzeniami PASS**. Obejmuje rzeczywisty
bootstrap i obsługę przycisków, wyłączanie/włączanie logów oraz pamięć
ustawienia po ponownym uruchomieniu, oznaczenie problemu, wyjątek i
Promise, brak próbek podczas pauzy i ukrycia strony, cel 30 FPS,
eksport z czytelnym podsumowaniem oraz zachowanie poprzedniej sesji.
Sprawdzono także kontrolowany błąd importu głównego modułu: ekran
awarii pozwolił zapisać raport mimo nieuruchomienia gry.

Panel mieścił się w widokach **1280×760** i **390×844**, bez poziomego
przewijania. Drugi rozmiar jest testem układu mobilnego w przeglądarce,
nie pomiarem na telefonie z Androidem. Renderer SwiftShader tej próby
nie służy do oceny wydajności RTX 3050.

## Granice wnioskowania

Logi podają zmierzone koszty oraz powiązane zdarzenia. Pomiar GPU
jest próbkowany i dociera z opóźnieniem; nie wskazuje automatycznie
przyczyny każdej wolnej klatki. Wysokie oczekiwanie na prezentację,
sterownik lub system pozostaje oznaczone jako nierozpoznane, jeśli
nie ma odpowiednich danych. Pamięć i retencja plików są ograniczone;
eksport nie jest nieograniczoną historią aplikacji.
