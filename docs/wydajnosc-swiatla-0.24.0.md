# Wydajność światła 0.24.0 — RTX 3050 Laptop

Porównanie lokalnych wersji 0.23.1 i 0.24.0, wykonane 28.10.2026.
Wspólny model powierzchni zwiększył zmierzony czas GPU w `Game.render`
o około 4%. Średnia przepustowość pozostaje wysoka, ale wyniki nie dają
gwarancji stałych 60 klatek/s podczas doczytywania świata.

## Warunki

- Intel Core i5-12500H, NVIDIA GeForce RTX 3050 Laptop GPU, 4 GB VRAM;
  zasilacz podłączony (potwierdzony odczytem systemowym).
- Windows, Chromium 156, WebGL2 przez ANGLE / Direct3D11; potwierdzony renderer NVIDIA.
- Bufor 1920×1080, DPR 1, skala 100%, antyaliasing włączony od utworzenia kontekstu.
  Monitor 60 Hz: wyniki powyżej 60 opisują przepustowość pętli renderowania,
  nie liczbę odrębnych obrazów pokazywanych przez panel w sekundzie.
- Bliskie chunki: 48 bloków; daleki teren: 8192, szczegóły 2; cienie 3 („Dalekie”).
  Atmosfera w obu wersjach, promienie światła włączone, światło odbite wyłączone.
  FOV 75°, jasność 0%, AO 45, limit FPS 0, tryb ziemniaka wyłączony.
  Interfejs dotykowy był aktywny; ustawienia obrazu odpowiadały powyższemu profilowi.
- Podczas prób 0.24.0 obserwowano GPU 81–86°C i około 51–57 W.
  Odczyt około 1098 MiB VRAM dotyczył całego systemu, w tym Codex;
  nie jest pomiarem pamięci zajmowanej wyłącznie przez grę.

## Metoda i zakres pomiaru

Realistyczny świat kreatywny, seed `lighting-rtx3050-0231`, start
`(-28.5, 80, 66.5)`, yaw/pitch 0. Każda próba: 10 s rozgrzewki i 30 s pomiaru.
Zegar świata zatrzymany: południe 12:00 albo zachód 17:45.
Obrót obejmuje 360° przy stałej pozycji. Lot ma nieruchomą rozgrzewkę,
następnie deterministyczną trasę 256 bloków w stronę −Z przy y=80,
z prędkością 8.5333 bloku/s; ostatnia próbka wypada tuż przed końcem trasy.
Na początku pomiarów było 81 chunków, 439 kafelków far i puste kolejki;
lot kończył się przy 107 chunkach i 446 widocznych kafelkach far.

„FPS” poniżej to `1000 / średni odstęp między początkami Game.render`,
mierzony przez `performance.now()`. „1% low” to `1000 / średnia najwolniejszego
1% odstępów`, nie odwrotność p99. p99 to percentyl najbliższej rangi.
Osobne odstępy `requestAnimationFrame` pozostają w danych źródłowych;
mają inny zegar i uwzględniają harmonogram przeglądarki, więc nie mieszamy
ich z odstępami między wywołaniami renderowania.

Asynchroniczny timer GPU obejmuje całe `Game.render`: mapy cieni, niebo,
far, świat, promienie i rękę. Nie obejmuje UI ani operacji GPU zlecanych
poza tą metodą, np. wysyłania zasobów podczas aktualizacji świata.
CPU update/render to czas tych metod, bez osobnej pracy UI/audio w głównej
pętli; tych czasów nie należy dodawać do czasu GPU ani traktować jako FPS.
W uwzględnionych próbach nie było zdarzeń disjoint ani pominiętych zapytań GPU.

## Wyniki porównywalnych prób Full HD

| Wersja | Scena / próba | FPS | 1% low | p99 odstępu [ms] | Maks. odstęp [ms] | Śr. GPU render [ms] | Odstępy >33.34 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.23.1 | Południe, obrót 1 | 140.45 | 72.91 | 11.50 | 19.90 | 2.514 | 0 |
| 0.23.1 | Południe, obrót 2 | 136.16 | 57.61 | 12.70 | 95.40 | 2.538 | 1 |
| 0.23.1 | Południe, obrót 3 | 141.12 | 75.11 | 11.10 | 21.60 | 2.528 | 0 |
| 0.24.0 | Południe, obrót 1 | 128.95 | 47.34 | 15.30 | 124.70 | 2.623 | 2 |
| 0.24.0 | Południe, obrót 2 | 139.80 | 74.72 | 11.80 | 25.90 | 2.613 | 0 |
| 0.24.0 | Południe, obrót 3 | 139.49 | 75.04 | 11.40 | 23.00 | 2.640 | 0 |
| 0.23.1 | Zachód, obrót | 133.45 | 68.76 | 13.00 | 21.40 | 2.513 | 0 |
| 0.24.0 | Zachód, obrót | 138.90 | 70.77 | 11.80 | 23.20 | 2.625 | 0 |
| 0.23.1 | Południe, lot | 133.41 | 55.41 | 15.40 | 34.50 | 2.700 | 1 |
| 0.24.0 | Południe, lot | 128.11 | 52.95 | 15.70 | 34.60 | 2.814 | 2 |

Pierwsza chronologiczna próba 0.24.0 miała bufor **1625×877**, dlatego jest
wykluczona z porównania Full HD: 119.13 FPS, 1% low 55.12, GPU 2.275 ms.
Nie usunięto natomiast słabszej pierwszej próby Full HD 0.24.0 — widnieje w tabeli.
Próby 0.23.1 z wyłączonymi promieniami lub włączonym GI nie należą do tego porównania.

## Wnioski i ograniczenia

Średnia z trzech południowych prób czasu GPU wzrosła z 2.527 do 2.625 ms
(+3.9%); w locie z 2.700 do 2.814 ms (+4.3%). Lot 0.24.0 miał około 4.0%
niższą średnią przepustowość i 4.5% niższe 1% low. Średni CPU update/render
w locie wyniósł odpowiednio 0.690/3.671 ms wobec 0.657/3.445 ms w 0.23.1.
Nie należy przedstawiać lepszego pojedynczego wyniku zachodu jako dowodu przyspieszenia.

Dwie kolejne próby obrotu 0.24.0 były stabilniejsze od pierwszej, ale jej
124.70 ms nie znika z oceny. Już baza miała przycięcie 95.40 ms, a obie
wersje miały 1% low poniżej 60 podczas lotu i odstępy ponad 33.34 ms.
Pusta kolejka na początku i końcu nie wyklucza pracy doczytywania pomiędzy nimi.
To krótkie porównanie jednej konfiguracji: po trzy obroty w południe,
po jednym zachodzie i locie, bez losowania kolejności wersji.
Nie rozdziela przyczyn zacięć między generowanie, przesyłanie zasobów,
przeglądarkę, sterownik i pracę innych aplikacji; do tego potrzebny jest
osobny ślad profilera. Nie gwarantuje też wydajności innych światów i urządzeń.

## Dane źródłowe sesji

Dokładne statystyki, ustawienia i stan kolejek wszystkich prób są w
[pomiary/swiatlo-0.24.0.json](pomiary/swiatlo-0.24.0.json), wraz z powodem
wykluczenia innych profili i rozdzielczości. Nazwy oryginalnych zbiorów:

- `lighting-benchmark-rtx3050.json`: pierwsze trzy wyniki `default` w południe
  i ostatni wynik zachodu dla 0.23.1.
- `rotation-0240.json`: pierwszy wynik 1625×877 wykluczony; kolejne trzy
  wyniki południa Full HD oraz ostatni zachód.
- `flight-0231.json` i `flight-0240.json`: pojedyncze loty porównawcze.

Pliki JSON pochodzą z lokalnej sesji pomiarowej; tabela podaje ich wartości
zaokrąglone, bez mieszania profili ani usuwania przycięć z prób Full HD.
