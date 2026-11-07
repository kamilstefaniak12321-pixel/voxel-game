# Kręgi wodospadów 0.74.0

Baza: wydana 0.73.0, commit `f2ddcae0ed6e0d37b38ac30b0194d7c9f0fe45a8`.
Wersja przygotowywana w [PR #110](https://github.com/kamilstefaniak12321-pixel/voxel-game/pull/110);
publikacja zgodnie z workflow po scaleniu PR. Końcowe wyniki CI i linki do
próbnych kompilacji są w opisie PR.

## Efekt na tafli

Licznik spadku 1–16 z 0.73 wyznacza zasięg oraz wyrazistość kręgów.
Jedna wspólna tekstura 128 × 1 przechowuje jasny grzbiet i ciemniejszy
pas za nim. Shader czyta ją promieniście względem miejsca uderzenia,
przesuwając wzór na zewnątrz. Trzy kręgi mieszczą się w zasięgu;
stan animacji powtarza się po 2,4 s. Tekstura powstaje raz, nie w każdej
klatce. Wzór zachowuje skalę 16 pikseli na blok.

| Licznik spadku | Promień | Maksymalny współczynnik przezroczystości |
| --- | ---: | ---: |
| 3 | 2,75 bloku | 0,18 |
| 8 | 4 bloki | 0,28 |
| 16 | 6 bloków | 0,44 |

Promień wynosi `2 + 0,25 × spadek`, a współczynnik `0,12 + 0,02 × spadek`.
Jasność i przezroczystość dodatkowo maleją z odległością, do zera przed
końcem zasięgu. Są to parametry wyglądu; kręgi nie zmieniają poziomu,
objętości wody ani siły działającej na gracza.

Płaskie fragmenty efektu leżą na rzeczywistych trójkątach tafli. Używają
tych samych wysokości narożników, normalnych, przekątnej i wag falowania
co woda. Wspólna funkcja deformacji zapobiega przecinaniu się obu warstw.
Oświetlenie jest pobierane z każdego fragmentu; materiał korzysta też
z istniejących map cieni. Efekt nie świeci samodzielnie.

Przeszukiwanie połączonej wody omija ląd, wyspy, niewczytane chunki oraz
powierzchnie przykryte blokiem albo wyższą wodą. Nie przenosi efektu do
osobnego zbiornika za pełną przegrodą. Poziom odbiorczy jest niższy o jeden
blok przy uderzeniu w sadzawkę; nad kamiennym dnem używa faktycznie
rozlanej płytkiej wody. To lokalna maska tafli, bez obliczania odbić fal,
dyfrakcji i hydrodynamicznej interferencji.

## Ograniczenia pracy

- Do 12 miejsc uderzenia; w trybie ziemniaka do 4. Bliskie uderzenia
  w tej samej tafli są reprezentowane przez najsilniejsze, aby szeroki
  wodospad nie rysował dziesiątek nakładających się pól.
- Do 169 sprawdzanych komórek na pole; łącznie najwyżej 2028 kafelków
  i 4056 trójkątów. Jedna siatka i jedno dodatkowe wywołanie rysowania.
- Wyszukiwanie najwyżej 48 komórek na klatkę z miękkim terminem 0,35 ms.
  Budowa jest rozłożona pomiędzy klatkami. Zegar jest sprawdzany między
  komórkami; pojedyncza operacja lub GC mogą przekroczyć termin.
- Stabilna tafla: tylko kontrola tożsamości i rewizji kilku chunków.
  Brak ponownego czytania bloków i wysyłania geometrii podczas animacji.
- Zmiana terenu i wyładowanie chunka unieważniają stare fragmenty przed
  kolejnym rysowaniem. Usunięte miejsca uderzenia znikają po odświeżeniu
  istniejącej listy wodospadów (najwyżej 0,3 s).
- Animacja gotowej tafli wymaga tylko zmiany czasu shadera. Obraz nie dodaje impulsów do
  kolejki symulacji wody, nie generuje chunków i nie zmienia zapisów.

Raport wydajności zawiera etap `waterfalls` oraz `waterfallRipples`:
liczbę pól, kafelków i trójkątów, oczekujące prace, koszt aktualizacji
oraz rewizję geometrii. Koszt cząsteczek z 0.73 i nowych kręgów jest
mierzony osobno w teście przeglądarkowym.

## Poprawki znalezione podczas testów 0.73

1. Strumień trafiający w źródłową sadzawkę potrafił rozlewać nową warstwę
   nad nią. Teraz trafia w dolną taflę; stare niepodtrzymywane warstwy
   stopniowo zanikają. Rozlewanie po suchym dnie nadal działa.
2. Sąsiednie ustabilizowane komórki spadającej wody budziły się nawzajem,
   mimo braku zmian. Aktualizacja pionowego dopływu nadal je budzi,
   ale sam spoczywający sąsiad już tego nie robi.
3. Odtworzenie zapisu na granicy wczytanego obszaru mogło pomijać znany
   punkt uderzenia, gdy brakowało poziomego sąsiada. Znane pionowe
   uderzenie jest teraz zachowane; nieaktualne chunki są usuwane z indeksu.

## Odtwarzanie sprawdzeń

`npm test` obejmuje istniejące testy wodospadów oraz nowe regresje:
`sprawdz_ladowania_wodospadow.mjs`, `sprawdz_powierzchnie_fal.mjs`
i `sprawdz_renderowanie_fal.mjs` w katalogu `tools/`.

`node tools/sprawdz_fale_wodospadow_webgl.mjs` uruchamia rzeczywistą grę
i scenę `/scena wodospady` z wysokościami 3, 8 i 16. Powstają pary obrazów
bez kręgów / z kręgami, klatki cyklu i raport CPU w
`test-results/waterfall-ripples/`. Wyłączenie warstwy służy do porównania
tego jednego efektu, nie udaje uruchomienia całej starej wersji 0.73.
Test kontroluje też ląd, kamienną wyspę, płytki odpływ, zmianę wysokości,
odcięcie źródeł i wyładowanie chunków. Pomiary CPU i programowy WebGL
w CI nie są pomiarem FPS na fizycznej karcie gracza.

Lokalny test CPU (Node 24.22.1, pięć prób, 12 wodospadów o sile 16)
odkrył 1632 kafelki w 35 porcjach po najwyżej 48 komórek. Największa
zmierzona porcja zajęła 0,123 ms; mediana stabilnej aktualizacji wyniosła
0,00249 ms, bez odczytów bloków. [Surowe próbki i warunki](pomiary/fale-0.74.0/powierzchnie-cpu.json).

## Proponowane dalsze efekty

1. **Płaskie łaty piany przy uderzeniu.** Zastąpiłyby część sześciennej
   piany z 0.73. Nurt mógłby wyciągać je w nieregularne smugi, z powolnym
   rozpadem; priorytet największy dla spójności z płaskimi kręgami.
2. **Mokry pas skał przy wodospadzie.** Nieco ciemniejsze kamienie
   i delikatny połysk wyłącznie blisko rozbryzgu. Aktualizacja rzadko,
   bez przeliczania oświetlenia całej okolicy.
3. **Dźwięk zależny od wysokości.** Łagodny plusk małego spadku,
   szerszy szum wysokiego, z tłumieniem za skałą i pod wodą. Wspólny
   limit najbliższych emiterów zapobiegnie nakładaniu dziesiątek pętli.
4. **Drobniejsza mgiełka nad dużymi spadkami.** Obecne kanciaste
   cząsteczki można uzupełnić kilkoma delikatnymi płaskimi smugami,
   widocznymi głównie pod światło i stopniowo znikającymi z odległością.
5. **Krótkie kręgi po graczu i deszczu.** Ten sam sposób rysowania,
   lecz impulsy wygasające zamiast stałego wodospadu, ze wspólnym
   limitem liczby efektów. Odbicia i interferencję warto rozważyć później,
   dopiero po pomiarze korzyści wizualnej względem kosztu.
