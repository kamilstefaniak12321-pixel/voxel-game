# Odbiór odbić i materiałów 0.58.0

Ten katalog zawiera osobny zestaw QA dla E05/E06. Nie zmienia zapisanych
wyników 0.57.0. Scena `materialy` używa seed 42 i płaskiego świata;
las używa prawdziwego generatora i seeda 2138286349.

## Uruchomienie

Z katalogu repozytorium, przy zasilaczu i zamkniętych innych oknach gry:

```powershell
& ..\shadow-native-tools\node_modules\electron\dist\electron.exe .\docs\pomiary\materialy-0.58.0\native-launcher.cjs --size=1920x1080
```

Na ekranie innym niż 1920×1080 użyj `--size=1600x900`. Launcher nie
zmienia rozdzielczości systemu. Opcja `--uncapped` wyłącza synchronizację;
nie mieszaj takich wyników z próbami VSync. Każdy start tworzy osobny
profil Chromium, a artefakty zapisuje w `lighting-materials-proof/native`
pod nazwą `materials-<czas>-<numer>-<próba>.json/png`.

Opcjonalne `--baseline ..\voxel-lighting-foundation` wczytuje kod 0.57.0
z tamtego checkoutu, z tymi samymi helperami scen. Nowe przełączniki są
wówczas niedostępne. Podstawą oceny kosztu efektów jest jednak opisany
niżej A/B w jednym procesie 0.58.0, bez wymiany renderera.

## Sceny i kadry

Scena `materialy` znajduje się wokół `(160,16,-160)`, poza tarasami LOD
placu. Kamery i sondy eksportuje `src/dev/LightingMaterialsReference.js`.

- Ziemia, piasek i śnieg mają identyczny krzak oraz biały i szary odbiornik.
  Za nimi są kontrolne podłoża: trawa, drewno i kamień. Podmiana pierwszego
  podłoża jest rzeczywistą edycją bloków; pozostałe stanowiska się nie zmieniają.
- Dwa zamknięte pokoje dzieli ściana `x=160`; otwór w dachu doprowadza
  światło wyłącznie do A. Sondy: A `(156,19,-142)`, B `(164,19,-142)`.
  Dach, przegrodę i lampę można niezależnie zmieniać. Lampa jest kontrolą
  lokalnego RGB; E05 odbija słońce, księżyc i otoczenie, nie lokalne emitery.
- Kamery liści pokazują płaskie wycięcia, mikrokostki krzaków i większe
  voxelowe liście. Przycisk „Liście pod niskie słońce” ustawia zachód i
  oko po przeciwnej stronie źródła. Faktyczna kamera trafia do raportu.
- Próba profili zestawia owoce, korę, drewno, kamień i emisję. Powtarzamy
  front, bok, podświetlenie i noc, a kontrolami diagnostycznymi odcinamy
  źródła oraz oddzielnie oglądamy `bounce`, `transmission` i `specular`.
- Las zachowuje pełne bloki do 64, LOD 1024, szczegół 2 i cienie 3.
  Przycisk „Paleta 0.57” pozwala wrócić do niezmienionego układu referencyjnego.

## Pary OFF/ON i koszt

`lightingLook` pozostaje Naturalny. HDR16F, ekspozycja 1, MSAA, rozmiar
obrazu, kamera, pogoda i cienie są wspólne dla pary. Profil Standard
ma trzy niezależne ustawienia: `surfaceBounce`, `leafTransmission`,
`materialSpecular`. Początkowo siła odbicia wynosi 18%, nasycenie 65%.
Profil Podstawowy służy osobnej kontroli jakości, a nie zmianie renderera.

„3 pary OFF/ON + rozbicie kosztu” zapisuje dziewięć prób: OFF/ON,
ON/OFF, OFF/ON, samo odbicie, sama transmisja, sam refleks. Każda próba
ma 10 s rozgrzewki i 30 s pomiaru, po ustaleniu geometrii i odbić.
Przełączane są tylko trzy nowe efekty; źródła diagnostyczne są włączone.
Po serii wracają wcześniejsze ustawienia. „2 kadry OFF/ON” zatrzymuje
animacje na czas pary i zapisuje dwa czyste obrazy z raportami.

Roboczy cel to wzrost mediany GPU całego zestawu o nie więcej niż około
1 ms, z końcowym celem płynnej gry 60 FPS. Raportujemy każdą parę oraz
medianę różnic par, osobno P95/P99 i liczbę klatek ponad 16,67/33,33 ms.
Nie zastępujemy kosztu GPU liczbą FPS ograniczoną odświeżaniem monitora.
Brak timera GPU lub zbyt mało próbek oznacza `gpuValid=false` i przerywa
automatyczną serię. Wyniku OFF w kodzie 0.58.0 nie nazywamy pomiarem
starego pliku wykonywalnego 0.57.0.

## Ruch, edycja i zapis

W lesie wybierz „Ciągła trasa 180 s”, czas 180 s i uruchom pomiar.
Kamera pokonuje tor o półosiach 96 i 48 bloków; jej wysokość śledzi
wygenerowany teren. Przebieg nie zatrzymuje się co 30 s i uwzględnia
doczytywanie świata. Raport zachowuje pełne serie klatek/CPU/GPU,
zmiany geometrii, kolejki i statystyki pamięci oraz solvera.

Oddzielnie na scenie materiałów: zamknij dach A, usuń lampę i zamknij
przegrodę; sprawdź zanik światła. Podmień podłoże, otwórz dach i oceń
lokalną zmianę. „Zapisz w pamięci → odtwórz świat” używa rzeczywistych
`WorldSaver`, `WorldStorage` i nowego `Game` z izolowanym portem IndexedDB
w pamięci. Porównuje bloki, kanały światła i próbki odbicia po zakończeniu
przeliczenia. Nie otwiera zapisów użytkownika i nie jest testem dysku.
Autosave jest zatrzymany po odtworzeniu, aby nie zakłócał kolejnego A/B.

## Testy i dowody

- `tools/sprawdz_sceny.mjs`: prawdziwy świat, budowa/odtworzenie sceny,
  podłoża, zasłonięcie i otwarcie pokoju, usunięcie lampy, stała kamera.
- `tools/sprawdz_odbicia.mjs`: solver odbić, kolor, energia, ściany,
  wyłączenie źródeł, invalidacja i budżet; test właściciela solvera.
- `tools/sprawdz_swiatlo_zapisy.mjs`: cztery cykle zapisu/wczytania,
  343 sondy kanałów światła i nowego odbicia w różnych kolejnościach chunków.
- `tools/surface_render_checks.js`: prawdziwe piksele adapterów materiałów,
  maski/składniki E06 i próbka odbicia 3D przy wyłączonych mapach cieni.
  Dotychczasowa regresja zgodności animowanych wycięć z cieniem pozostaje osobna.

Manifest identyfikuje commit i zmodyfikowane źródła, oba helpery scen,
harness i inwentarz assetów. JSON zawiera rzeczywiste `WorldOutput.stats`
i `BounceLight.stats`; surowych raportów nie należy zastępować samym FPS.
Wyniki natywne i ocena zdjęć są uzupełniane dopiero po faktycznych próbach.
Zakres sprzętowy odbioru to PC z RTX 3050 na zasilaczu, bez deklaracji
wydajności na nieprzetestowanym urządzeniu Android.

F8 ukrywa panel, Ctrl+R odświeża próbę, Ctrl+Shift+Q zamyka okno.
