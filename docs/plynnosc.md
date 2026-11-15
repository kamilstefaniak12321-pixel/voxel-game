# Płynność: plan na kolejne wersje

Kamil: *„dla mnie jedną z ważniejszych rzeczy jest właśnie płynność
i wydajność - idźmy w tę stronę przez najbliższe wersje"*. Osiem
kroków, po kolei. Każdy krok to osobna wersja z pomiarem przed i po.

| Nr | Krok | Stan |
|---|---|---|
| 1 | Programy cieniujące przygotowane pod ekranem wczytywania | **zrobione - 1.1.2** (niżej) |
| 2 | Połączenie plików gry w paczkę (szybszy start aplikacji) | **zrobione - 1.1.3** (niżej) |
| 3 | Zapamiętywanie gotowych rzeczy między uruchomieniami (ikonki) i dane roślin w jednym pliku | **zrobione - 1.1.4** (niżej) |
| 4 | Dopasowanie pracy do sprzętu w locie (ile terenu na klatkę, zasięg efektów) | odłożone - pomiar Kamila pokazał, że to nie jest wąskie gardło |
| 5 | Więcej wątków do liczenia terenu | do zrobienia |
| 6 | Mniej poleceń rysowania | **teren: zrobione - 1.1.5** (niżej); rośliny i daleki teren - następne |
| 7 | Pomijanie tego, co zasłonięte (np. jaskinie pod ziemią) | do zrobienia |
| 8 | Rzadsze odświeżanie dalekich rzeczy | do zrobienia |

Wcześniej, w 1.1.1: ikonki odmian bloków rysowane raz (start gry około
dwa razy krótszy) - [celowanie-i-ladowanie.md](celowanie-i-ladowanie.md).

## Krok 1: programy cieniujące przed grą (1.1.2)

**Skąd przycięcia.** Karta graficzna kompiluje program cieniujący
dopiero wtedy, gdy coś pierwszy raz się nim rysuje - i gra na ten moment
staje. Dotąd działo się to:

- w pierwszej klatce po zniknięciu ekranu wczytywania (25 programów
  naraz),
- **w trakcie gry**, przy pierwszym użyciu rzeczy: przedmiot w ręce,
  pochodnia w ręce, postawiona pochodnia, ramka celownika, ognisko,
  płomień ogniska, wyrzucony przedmiot, deszcz, meteoryt, widok zza
  pleców, kręgi na wodzie, pierwszy kafelek dalekiego terenu.

Do tego gra **kasowała** program, gdy znikała ostatnia rzecz danego
rodzaju. Podniesienie ostatniego leżącego przedmiotu albo zgaszenie
ostatniej pochodni oznaczało, że następny przedmiot czy pochodnia
kompilowały program od nowa - przycięcie wracało za każdym razem.

**Co się zmieniło.** Wszystko powstaje pod ekranem wczytywania świata:

1. gra prosi o programy dla każdego obiektu każdej sceny, także
   ukrytego (deszcz, ramka, kręgi na wodzie);
2. rzeczy, które powstają dopiero w grze, mają w scenie ukryty **wzór**
   z prawdziwym materiałem - wzór nic nie rysuje, ale daje programowi
   powstać i trzyma go do końca gry;
3. na koniec jedna próbna klatka (cienie, promienie światła, końcowe
   złożenie obrazu mają własne przebiegi rysowania).

Gdy karta umie kompilować w tle (prawie każda), programy z punktów 1 i 2
kompilują się równolegle i nie blokują gry.

**Pomiar** - ten sam scenariusz w prawdziwej grze przed i po (wejście do
świata, przedmioty w ręce, pochodnia, skrzynia, schody, ognisko,
wyrzucone przedmioty, niszczenie bloku, deszcz, noc, meteoryt, widok
zza pleców, zaćmienie, woda, lot):

| Programy kompilowane... | Było | Jest |
|---|---|---|
| w pierwszej klatce po ekranie wczytywania | 25 | 0 |
| w trakcie gry | 18 | 2 |
| pod ekranem wczytywania | 2 | 55 |

Dwa pozostałe to małe programy samych cieni (cień przedmiotu w ręce
i mapa cieni dalekiego terenu) - są krótkie i powstają raz.

Czego ten pomiar **nie** mówi: ile milisekund trwało każde przycięcie
na Twoim sprzęcie. Maszyna testowa nie ma karty graficznej, więc liczę
programy, nie czas. Na zwykłej karcie jeden program to zwykle od
kilkudziesięciu do kilkuset milisekund, na telefonie więcej.

**Jak sprawdzić u siebie:** `/wydajnosc` ma nowy wiersz *Programy
cieniujące: N, z tego skompilowane w trakcie gry: M*. Jeśli po dłuższej
grze M rośnie powyżej 2, to znaczy, że jakaś rzecz nie ma jeszcze wzoru.

## Krok 2: paczka plików gry (1.1.3)

**Skąd strata.** Gra to 274 pliki kodu i biblioteka grafiki. Przy
każdym starcie aplikacja otwierała je pojedynczo - a potem każdy
z trzech wątków w tle (teren, daleki teren, zapis) otwierał swoje pliki
jeszcze raz.

**Co się zmieniło.** Przy budowaniu aplikacji pliki są łączone w paczkę
(`pakiet/js/`, 14 plików). Aplikacja na komputer i na telefon startuje
z paczki; wątki w tle też.

| | Było | Jest |
|---|---|---|
| pliki kodu otwierane do pojawienia się menu (gra w przeglądarce) | 278 | 13 |
| czas od otwarcia okna do menu (prawdziwa aplikacja na komputer, średnia z 8 uruchomień) | 4,56 s | 3,92 s |

Czyli około 0,6 s (14%) krócej do menu. Pomiar jest z aplikacji
uruchomionej z folderu, na maszynie bez karty graficznej. W
zainstalowanej aplikacji i na telefonie nie mierzyłem.

**Bezpieczniki:**

- pliki `src/` dalej są w aplikacji. Gdyby paczka się nie wczytała
  (brak pliku, uszkodzona), gra rusza ze zwykłych plików;
- przy pracy nad grą (`npm start`, przeglądarka) i w testach paczki nie
  ma - gra działa z `src/`, więc zmiana w kodzie jest widoczna od razu;
- nazwy funkcji w paczce zostają czytelne - raport diagnostyczny dalej
  pokazuje, gdzie wystąpił błąd;
- wydanie nie zbuduje się bez paczki (pilnuje tego workflow), a *Testy
  gry* uruchamiają prawdziwą grę z paczki: menu, świat, trzy wątki,
  zapis, start bez paczki i start z uszkodzoną paczką.

**Co zostało na później:** około 130 małych plików z danymi roślin
i modeli oraz dźwięki dalej ładują się pojedynczo (krok 3).

Przy okazji łączenie znalazło powtórzoną metodę w zapisie świata
(`SavedChunkStore.keys` zdefiniowana dwa razy, identycznie) - usunięta.

## Krok 3: pamięć startu (1.1.4)

**Skąd strata.** Po kroku 2 największą częścią startu było rysowanie
ikonek bloków i przedmiotów: około 600 różnych obrazków, przy każdym
uruchomieniu od zera, choć wynik zmienia się tylko z wersją gry. Do tego
około 80 małych plików z opisami roślin i ich modeli było pobieranych
pojedynczo - przez grę i osobno przez wątki w tle.

**Co się zmieniło.**

- **Ikonki są zapamiętywane.** Pierwsze uruchomienie po aktualizacji
  rysuje je jak dotąd i zapisuje; każde następne bierze gotowe.
- **Opisy roślin i modeli są w jednym pliku** (76 plików w jednym) -
  jedno pobranie zamiast kilkudziesięciu, także w wątkach.

Prawdziwa aplikacja na komputer, czas od otwarcia okna do menu:

| | Czas | Względem 1.1.2 |
|---|---|---|
| 1.1.2 (przed paczką) | 4,56 s | - |
| 1.1.3 (paczka plików) | 3,92 s | -14% |
| 1.1.4, pierwsze uruchomienie po aktualizacji | 3,77 s | -17% |
| 1.1.4, każde następne | 2,32 s | **-49%** |

(Średnie: 1.1.2 i 1.1.3 z 8 uruchomień, 1.1.4 z 12; aplikacja z folderu,
maszyna bez karty graficznej. Zainstalowanej aplikacji i telefonu nie
mierzyłem.)

**Skąd pewność, że zapamiętane ikonki są dobre:**

- wpis jest ważny tylko dla tego samego **odcisku gry** - wersji i skrótu
  wszystkich plików gry (kod, modele, rośliny, tekstury). Każda
  aktualizacja go unieważnia;
- klucz zawiera też skrót obrazka tekstur, z którego ikonki powstają;
- z **paczką tekstur gracza** ikonek się nie zapamiętuje (rysują się
  zawsze);
- wpis niepełny albo uszkodzony jest pomijany - ikonki rysują się od
  nowa;
- test w prawdziwej przeglądarce porównuje zapamiętane ikonki
  z narysowanymi: wszystkie 2606 identyczne;
- przy pracy nad grą i w testach pamięć startu jest wyłączona.

Pamięć startu to osobna, mała baza. Nie dotyka światów,
ustawień ani paczek tekstur i można ją skasować bez żadnej straty.

**Co zostało:** dźwięki (169 plików) dalej ładują się pojedynczo, ale
w tle - nie wstrzymują menu. Reszta startu to głównie tło menu (mały
świat za ekranem tytułowym) i przygotowanie tekstur.

## Pomiar na laptopie Kamila (po 1.1.4)

RTX 3050 Laptop, 16 wątków, obraz 1920x1057, zasięg 800, cienie 3,
promienie światła. Raport diagnostyczny z trzech minut gry i cztery
próby w gęstym lesie:

| Próba (ten sam kadr w lesie) | Klatki/s | Poleceń rysowania |
|---|---|---|
| bez cieni | 88 | 1041 |
| bez promieni światła | 79 | 1079 |
| skala obrazu 75% | 78 | 1084 |
| zasięg 400 zamiast 800 | 77 | 1088 |

Wnioski:

- **karta graficzna ma zapas** - mniej pikseli (skala 75%) nie dało nic;
- **ogranicza procesor wysyłający polecenia rysowania**: około 1000
  poleceń na klatkę, rysowanie to 11 ms z 13 ms klatki; logika gry
  zajmuje 0,6-0,9 ms;
- w raporcie z 270 zapisanych wolnych klatek w 233 dominowało wysyłanie
  świata do karty; klatki spadały ze 142 (otwarty teren) do 48 (gęsty
  las) razem z liczbą poleceń;
- zasięg widzenia nie zmienia liczby poleceń (prawdziwe chunki są tylko
  w promieniu 14 chunków; dalej jest daleki teren).

Dlatego kolejność planu się zmieniła: najpierw krok 6 (mniej poleceń
rysowania), potem 7; kroki 4 i 5 dotyczą doczytywania terenu, które
u Kamila nie jest problemem.

Z czego składa się około 900 poleceń w takiej scenie (pomiar w grze):
daleki teren - ok. 260, bloki - ok. 110, liście - ok. 100, woda - 30-100,
rośliny - ok. 110, cienie (gdy mapa się odświeża) - 90-180.

## Krok 6, część 1: łączenie terenu (1.1.5)

**Co się zmieniło.** Sąsiednie chunki (2 x 2) są sklejane w jedną
geometrię. Bloki, liście i woda czterech chunków to teraz 3 polecenia
rysowania zamiast 12.

**Zasada: sklejanie nigdy nie opóźnia tego, co widać.**

- chunk, który właśnie powstał albo się zmienił (kopanie, stawianie,
  doczytany sąsiad), rysuje się sam, od razu, dokładnie jak dawniej;
  ze sklejonej geometrii znika w tej samej klatce;
- gdy okolica jest spokojna przez 0,6 s, region skleja się od nowa -
  jeden region na klatkę, najbliższe najpierw;
- przy szybkim locie teren ciągle się zmienia, więc gra rysuje jak
  dawniej; gdy gracz stoi albo idzie, okolica skleja się w kilka sekund.

**Pomiar** (ten sam kadr, ta sama klatka, las z raportu Kamila; świat
wczytany w części - maszyna testowa jest wolna):

| | Bez łączenia | Z łączeniem |
|---|---|---|
| polecenia rysowania terenu | 322 | 139 (-57%) |
| wszystkie polecenia w klatce | 734 | 544 (-26%) |
| obraz świata (5 kadrów, czas zatrzymany) | - | identyczny piksel w piksel |

Czego ten pomiar nie mówi: ile klatek zyska laptop Kamila. Maszyna
testowa nie ma karty graficznej. Szacunek z jego liczb (ok. 10
mikrosekund na polecenie): około 3 ms krótsza klatka w gęstym lesie,
czyli z około 75 do około 95 klatek na sekundę - do sprawdzenia u niego
(`/ustaw laczenie-terenu wyl` i `wl`, potem `/wydajnosc test`).

**Koszty:**

- karta dostaje więcej trójkątów spoza kadru (region 2 x 2 jest
  pomijany w całości albo wcale): w pomiarze teren 343 → 600 tys.
  trójkątów. Karta Kamila ma zapas; gdyby gdzieś go nie było,
  łączenie da się wyłączyć;
- geometria terenu jest na karcie dwa razy (osobna dla cieni i do
  ponownego sklejania): około 0,45 MB na chunk, czyli około 300 MB przy
  700 chunkach;
- sklejenie regionu trwa zwykle 0,3-1,6 ms, najwyżej jedno na klatkę;
  pierwsze sklejenia po wejściu do świata bywały na wolnej maszynie
  testowej dużo dłuższe (do 46 ms) - na laptopie Kamila do sprawdzenia
  (`/wydajnosc` pokazuje stan łączenia).

**Co zostało w kroku 6:** rośliny (osobna geometria z animacjami
i własnym zasięgiem) i daleki teren (każdy kafelek to osobne polecenie
z własnym materiałem - ok. 260 poleceń).

## Dla programisty

- `src/rendering/ShaderWarmup.js` - `warmupObject` (ukryty wzór),
  `prewarmScenes` (zgłoszenie, czekanie, dokończenie programów),
  `lateShaderPrograms` (licznik).
- `Game.prewarmShaders` zbiera wzory: `shaderPrototypes()` w
  `TorchRenderer`, `DropRenderer`, `CampfireRenderer`, `Meteorites`,
  `FarTerrain` oraz przedmiot w dłoni (model gracza i ręka z oczu).
- **Nowy efekt tworzony dopiero w grze** (obiekt dodawany do sceny po
  starcie, z własnym materiałem): dodaj `shaderPrototypes()` albo wzór
  w `Game.prewarmShaders`. Wzór musi mieć ten sam materiał (te same
  opcje) i ten sam rozmiar atrybutu koloru co prawdziwy obiekt.
- Program zależy też od celu rysowania i świateł sceny - dlatego wzory
  kompilują się z tym samym celem i ze sceną, do której trafią.
- Test: `node tools/sprawdz_shadery.mjs`.

Paczka plików gry (krok 2):

- `tools/pakiet.mjs` (esbuild) - `npm run pakiet`; `npm run dist`
  i `npm run android:www` budują ją same. Folder `pakiet/` nie trafia
  do gita.
- `src/bootstrap.js` wybiera paczkę albo `src/start.js`: komputer -
  `desktop.bundle`, telefon - pole `pakiet` w `wersja.json`,
  przeglądarka - tylko z `?pakiet` w adresie (po `npm run pakiet`).
- Pliki paczki leżą dwa foldery pod stroną gry, tak jak `src/<folder>/`,
  więc adresy `new URL('../../assets/...', import.meta.url)` działają
  bez zmian. Adres innej postaci licz od strony (`document.baseURI`).
- **Nowy wątek** (`new Worker(new URL('./X.js', import.meta.url))`):
  dopisz plik do `WORKERS` w `tools/pakiet.mjs`.
- Testy: `node tools/sprawdz_pakiet.mjs` (zasady i budowanie),
  `node tools/sprawdz_pakiet_webgl.mjs` (prawdziwa gra z paczki).
- Sprawdzenie w aplikacji na komputer bez instalatora:
  `npm run pakiet`, potem `VOXEL_QA_BUNDLE=1 npm start`.

Łączenie terenu (krok 6):

- `src/rendering/RegionBatches.js` - regiony `REGION_SIZE` x
  `REGION_SIZE` chunków; `changed(chunk)` przy każdej zmianie mesha
  terenu (cztery miejsca w `World.js`), `update()` co klatkę skleja
  spokojne regiony.
- Chunk w regionie ma `mesh.visible = false`; jego geometria zostaje
  (cienie - `World.shadowScene` - i następne sklejenie).
- Ustawienie `terrainBatching` (tylko komenda: `/ustaw laczenie-terenu
  wl | wyl`), stan w `/wydajnosc`.
- Żywe tło menu i narzędzia testowe rysują po staremu
  (`World.setRegionBatching` woła tylko `Game`).
- Test: `node tools/sprawdz_laczenie_terenu.mjs` - sklejone regiony dają
  dokładnie te same trójkąty co chunki osobno, także zaraz po zmianie
  i usunięciu chunka.

Pamięć startu (krok 3):

- `src/storage/StartCache.js` - `readStartCache(nazwa, klucz)`,
  `writeStartCache(nazwa, klucz, wynik)`, `BUILD_ID` (odcisk gry,
  wstawiany przez `tools/pakiet.mjs` na początku plików paczki; przy
  pracy nad grą `null` - wtedy pamięć jest wyłączona).
- Nowa rzecz do zapamiętania: klucz musi obejmować wszystko, od czego
  zależy wynik, a odczyt musi sprawdzić wpis (jak `unpackIcons` w
  `src/ui/BlockIcons.js`).
- `src/blocks/dataFiles.js` - `bundledText(ścieżka)`: tekst z
  `pakiet/dane.json` albo `null` (wtedy zwykły plik). Foldery zbierane
  do pliku: `DATA_FOLDERS` w `tools/pakiet.mjs`; pliki, od których
  zależy odcisk gry: `FINGERPRINT`.
