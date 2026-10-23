# Historia zmian

Wszystko, co trafiło do gry - od pierwszego chunka po wytwarzanie.
Najnowsze na górze. Numer wersji to `"version"` w `package.json`
(nowa wersja = nowe wydanie aplikacji na Windows i Androida); zmiany
sprzed 0.1.0 są na dole, w części *Początki*. Przy każdej wersji jest
numer pull requesta (#), w którym weszła.

Pełny opis gry - bloki, przedmioty, przepisy, osiągnięcia - jest
w wiki: [`docs/wiki/`](docs/wiki/README.md).

---

## 0.14.0 - Paczki drzew i jabłoń (2026-10-19)

Pull request #33.

### Nowe
- **Paczki drzew - nowe gatunki bez programowania.** Folder
  w `assets/drzewa/` to jeden gatunek: tekstury PNG 16 x 16, opis
  `drzewo.json` i kształt drzewa narysowany literkami (warstwy od dołu
  do góry w pliku `.txt`) albo jeden z gotowych kształtów (kula,
  stożek, parasol, kolumna). Gra przy starcie sama robi z paczki bloki
  (pień, okorowany pień, deski, liście, sadzonka, opadłe liście i do
  dwóch odmian liści), przedmioty (np. owoce, które posadzone dają
  sadzonkę), ikonki, przepisy (deski, opadłe liście i własne
  z `drzewo.json`), drzewa z sadzonek i w lesie - tam, gdzie pasuje
  im klimat. Tekstury trafiają do atlasu same (bez wklejania do
  `terrain.png`). Paczka z błędem jest pomijana, a gra mówi na czacie,
  co poprawić. Instrukcja krok po kroku: `docs/drzewa-paczki.md`.
- **Odmiany liści z owocami**: PPM zbiera owoce, a po zbiorze owoce
  **odrastają** (liście "po zbiorze" po pewnym czasie znów są z owocami).
- **Jabłoń domowa** (`assets/drzewa/jablon/`) - przykładowa paczka:
  krótki pień, konary i szeroka korona w trzech rozmiarach, liście
  z jabłkami (jabłka odrastają po ok. 10 minutach), jabłko do
  posadzenia, deski jabłoniowe, opadłe liście; rośnie w ciepłych lasach
  na nizinach. Jabłko z lampą daje czerwoną lampę.
- `python tools/nowe_drzewo.py <nazwa>` - zakłada paczkę z teksturami
  zastępczymi w stylu gry, szablonami kształtu i wolnymi numerami
  bloków; `node tools/drzewa.mjs` - dopisuje paczki do listy, nadaje
  numery i sprawdza je jak gra (`pokaz <drzewo>` - warstwy drzewa
  w konsoli).
- Akcja **Drzewa (paczki)** na GitHubie: folder drzewa wgrany do
  repozytorium (także przeciągnięty na stronie GitHuba) sam trafia na
  listę, dostaje numery bloków, jest sprawdzany, a wiki się odświeża.
- Komenda `/drzewa paczki` (wczytane paczki i ich błędy); `/drzewa
  posadz`, `aleja`, `znajdz` znają drzewa z paczek.
- Osiągnięcie *Sadownik* - zbierz owoce z drzewa owocowego.

### Zmiany
- Atlas tekstur składa się w grze z `terrain.png` i tekstur paczek
  (przy wielu paczkach ma 32 wiersze zamiast 16); ikonki bloków rysują
  się z tego samego obrazka.
- Wiki: bloki i przedmioty z paczek (z ikonkami i folderem paczki).
- Aplikacje: próbny instalator i `.apk` z pull requestów leżą w Actions
  2 dni zamiast 14 (darmowe 0,5 GB miejsca na miesiąc), a brak miejsca
  na nie nie zatrzymuje już publikacji wydania.

---

## 0.13.0 - Wytwarzanie, narzędzia i porządki (2026-10-19)

Pull request #32.

### Nowe
- **Wytwarzanie (crafting) w ekwipunku** - siatka 2 x 2 obok miejsc
  ekwipunku i wynik ze strzałką. Składniki układa się jak w Minecrafcie:
  przepisy z kształtem (można je przesuwać po siatce i odbijać
  w poziomie) i bez kształtu (obojętne, gdzie leżą). Klik na wyniku -
  wyrób pod kursor (kolejny klik dokłada), **Shift + klik** - wytwarza,
  ile się da, prosto do ekwipunku. Składniki z siatki wracają do
  ekwipunku po zamknięciu okna.
- **Księga przepisów** (przycisk 📖 *Przepisy*) - wszystkie przepisy
  z kategoriami, wyszukiwaniem i filtrem *Tylko możliwe*. Klik układa
  składniki w siatce (kolejny klik - jeszcze jeden komplet, Shift - ile
  się da). Gdy brakuje składników, w siatce widać półprzezroczysty
  przepis, a podpowiedź pokazuje, czego brakuje (✔ / ✖). Na telefonie
  księga otwiera się w miejscu ekwipunku, a stuknięcie w wynik wkłada
  wyrób prosto do ekwipunku.
- **22 przepisy**: deski z pni (6 gatunków, także z okorowanych),
  patyki, siekiera, kilof, łopata, lampa (lepidolit + żywica + kora
  brzozowa), cztery kolorowe lampy (lampa + mak / truskawki / chili,
  koniczyna / pokrzywa / paproć, chaber, jeżyny), wieniec świerkowy,
  opadłe liście buka i dębu, piaskowiec z piasku, ziemia kamienista,
  czarnoziem i ściółka leśna.
- **Nowe przedmioty**: patyk, **kilof** (skały 3 razy szybciej)
  i **łopata** (ziemia, piasek, żwir, błoto 3 razy szybciej). Siekiera
  dalej przyspiesza drewno i okorowuje pnie.
- **Kategorie** bloków i przedmiotów: Ziemia, Skały, Drewno, Rośliny,
  Owoce i nasiona, Światło, Ozdoby, Narzędzia i surowce - w zakładce
  *Wszystkie bloki* (przyciski z ikonkami), w księdze przepisów i w wiki.
  Lista bloków w trybie kreatywnym jest ułożona według kategorii.
- Komendy **`/przepisy`** (jak zrobić rzecz i do czego się przydaje,
  `lista`, `moge`) i **`/wytworz <przepis> [ile]`** (wytwarzanie
  z ekwipunku na skróty).
- Osiągnięcia: *Złota rączka* (pierwsze wytworzenie), *Kolorowe
  światła* (kolorowa lampa), *Komplet narzędzi* (siekiera, kilof
  i łopata).
- Dźwięk wytworzenia (dwa stuknięcia i dzwoneczek).
- **Wiki gry** (`docs/wiki/`) i ta historia zmian. Strony z blokami,
  przedmiotami, przepisami i osiągnięciami generuje
  `python tools/wiki.py` prosto z kodu gry (z ikonkami).

### Zmiany
- `/kopanie` pokazuje czas kopania każdym pasującym narzędziem
  (kilofem, łopatą, siekierą).
- Porządki w kodzie: usunięte nieużywane powtarzanie przycisków
  dotykowych (kopanie działa teraz przez trzymany przycisk).

### Poprawki
- Kopanie przy pełnym ekwipunku: napis *Ekwipunek pełny* pojawiał się
  w każdej klatce trzymanego LPM - teraz raz na sekundę.

### Dla twórców
- Przepisy: `src/crafting/recipes.js` (opis pól na początku pliku),
  logika: `src/crafting/Crafting.js`. Literówka w przepisie = błąd od
  razu przy starcie gry.
- Narzędzia: `TOOL_MATERIALS` i `TOOL_SPEED` w `src/config.js`
  (zamiast `AXE_SPEED`), `getBestTool()` w `BlockRegistry.js`.
- Kategorie: `src/items/categories.js` (dobierają się same, blok
  albo przedmiot może podać własną: pole `category`).
- Ikonki narzędzi: `tools/tekstury_narzedzi.py` (wiersz 9 atlasu).

---

## 0.12.0 - Widok z oczu (2026-10-18)

Pull request #31.

### Nowe
- **Ręka i przedmiot w ręce** z oczu gracza: pusta ręka ze skórki
  (z rękawem), blok obrócony jak w Minecrafcie, przedmiot głowicą
  w głąb ekranu, roślina. Machnięcie, wyjęcie przy zmianie przedmiotu,
  kołysanie przy chodzeniu, oddech, spóźnianie się za obrotem kamery.
  Ręka nigdy nie wchodzi w ścianę i jest oświetlona jak świat.
- **Kołysanie widoku** przy chodzeniu (przy biegu mocniej) i ugięcie
  kamery po upadku z wysoka.
- **Kopanie w trybie przygody**: trzymany LPM, uderzenia co 0,25 s,
  blok pęka w 10 etapach i znika po czasie kopania (ziemia ~0,6 s,
  drewno 2 s, kamień 2,2 s, granit i bazalt 2,8 s, meteoryt 4,5 s,
  rośliny od razu; siekierą drewno 3 razy szybciej). Puszczony LPM
  albo inny blok - od nowa.
- **Odłamki** w kolorach tekstury bloku przy uderzeniach i rozbiciu.
- W trybie kreatywnym trzymany LPM niszczy blok za blokiem.
- Ustawienia *Ręka w widoku z oczu* i *Kołysanie przy chodzeniu*,
  komenda `/kopanie`, osiągnięcia *Ostrze w ruch* i *Prawie robi
  różnicę* (sekret).

---

## 0.11.0 - Drzewa i lasy (2026-10-18)

Pull request #30.

### Nowe
- **Sześć gatunków drzew**: świerk pospolity, sosna zwyczajna, buk
  zwyczajny, lipa drobnolistna, dąb szypułkowy, brzoza brodawkowata.
  Każdy ma pień, okorowany pień, deski, liście (igliwie) i sadzonkę.
- **Dodatki**: szyszki świerka i sosny, żywica (PPM na pniu sosny
  z żywicą), górny pień sosny, orzeszki bukowe, opadłe liście buka
  i dębu, kwitnące liście lipy (PPM - kwiat lipy), żołędzie, kora
  brzozowa, wieniec świerkowy (wisi na boku bloku).
- **Siekiera** - PPM na pniu okorowuje go (z brzozy spada kora).
- **Lasy w terenie realistycznym** - gatunek z klimatu (świerk
  w górach i na zimno, sosna na sucho, buk na wyżynach, lipa i dąb na
  ciepłych nizinach, brzoza nisko i wilgotno), ok. 1/3 lądu. Korony
  widać też w dalekim terenie i na kuli Ziemi z kosmosu, `/mapa lasy`.
- Liście z prześwitami, światło słabnie pod koroną; ustawienie *Liście
  drzew: ładne / szybkie*.
- **Sadzenie i wzrost**: sadzonki, szyszki, orzeszki, żołędzie i kwiat
  lipy wyrastają w drzewo średnio po 5 minutach.
- Dźwięk drewna, komenda `/drzewa`, osiągnięcia *Drwal*, *Brzozowy
  papirus*, *Leśniczy*, *Z małego ziarenka*.

---

## 0.10.0 - Nowe tekstury i miękkie dźwięki (2026-10-18)

Pull request #29.

### Zmiany
- **Tekstury wygładzone i wycieniowane** - 26 bloków (ziemie, skały,
  piasek, żwir, lepidolit, meteoryt, lampy) narysowanych od nowa
  w jednym stylu: faktura ze światłem z lewej góry, bez przypadkowego
  szumu, bez szwów między blokami (`tools/tekstury.py`).
- **Miękkie, ciche dźwięki bloków** - bez syczących wysokich tonów,
  6 wersji kroków.

---

## 0.9.1 - Telefon: dotyk zawsze działa (2026-10-17)

Pull request #28.

### Poprawki
- W aplikacji na Androida (i na części telefonów) gra próbowała
  przechwycić mysz i stawała na pauzie. Teraz w aplikacji dotyk jest
  zawsze, a w przeglądarce włącza go pierwsze dotknięcie ekranu.
- Testowa aplikacja podpisana stałym kluczem - kolejne wersje
  instalują się na poprzednich.

---

## 0.9.0 - Aplikacja na Androida (2026-10-17)

Pull request #27.

### Nowe
- **Gra jako aplikacja na Androida** (`.apk` w wydaniach): ikonka,
  pełny ekran, zawsze poziomo, ekran nie gaśnie, „wstecz” = pauza,
  działa bez internetu.
- Osiągnięcie *Lokator z ikonką*.

---

## 0.8.0 - Telefon: sterowanie dotykowe (2026-10-17)

Pull request #26.

### Nowe
- **Sterowanie dotykowe**: joystick pod lewym kciukiem (do brzegu -
  bieg), rozglądanie palcem, stuknięcie - postaw, przytrzymanie - kop,
  przyciski skoku, kucania, kopania i stawiania, u góry pauza,
  ekwipunek, czat, osiągnięcia, widok, mapa i pełny ekran.
- Lżejsze ustawienia na telefonie, komenda `/dotyk`, osiągnięcie
  *Kopalnia w kieszeni*.

---

## 0.7.0 - Osiągnięcia (2026-10-17)

Pull request #25.

### Nowe
- **Księga osiągnięć** (klawisz **L**) z czterema rangami (zwykłe,
  rzadkie, bardzo rzadkie, legendarne), punktami, postępem i sekretami.
- Powiadomienia z melodyjką zależną od rangi i żartobliwym komentarzem.
- 17 pierwszych osiągnięć, komenda `/osiagniecia`.

---

## 0.6.0 - Kosmos (sekret) (2026-10-17)

Pull request #24.

### Nowe
- Lot w górę przyspiesza z wysokością - aż do **kosmosu**: świat
  zagina się w kulę Ziemi z prawdziwymi kontynentami, czarne niebo,
  planety, Droga Mleczna w dzień.
- **Powrót jak meteoryt** - powłoka ognia, wstrząs, krater albo
  wielki plusk do wody. Ukryta komenda `/kosmos`.

---

## 0.5.0 - Woda (2026-10-16)

Pull requesty #22 i #23.

### Nowe
- **Przezroczysta woda** z falami i płynącą teksturą, **pływanie**
  (Spacja w górę, Shift - nurkowanie, wyjście na brzeg), mgła i dźwięki
  pod wodą, plusk, fale przy brzegu, animacja żabki.
- Maliny zostały **truskawkami**, a porzeczki - **papryczkami chili**
  (stare nazwy w ekwipunku same się zamieniają).

### Poprawki
- Instalator `.exe` nie trafiał do wydań - teraz wydanie jest
  kompletne (instalator, `latest.yml`), a aktualizacje działają.

---

## 0.4.0 - Krzaki owocowe i dźwięki menu (2026-10-12)

Pull request #21.

### Nowe
- **Krzaki owocowe i leszczyna** - rosną w czterech etapach, PPM
  zbiera owoce, owoc posadzony na ziemi daje sadzonkę, dzikie zarośla
  w terenie.
- Pierwsze **przedmioty** (owoce, orzech laskowy).
- **Dźwięki menu i ekwipunku**, suwak *Menu i ekwipunek*.

---

## 0.3.0 - Dźwięki (2026-10-12)

Pull request #20.

### Nowe
- Kroki, stawianie i niszczenie bloków w ośmiu materiałach (dźwięk
  przestrzenny), lądowanie po skoku, dźwięki meteorytu (huk przelotu,
  uderzenie słychać po błysku, żar).
- Zakładka ustawień *Dźwięk*, komenda `/dzwiek`.

---

## 0.2.0 - Meteoryt jako widowisko (2026-10-12)

Pull request #19.

### Nowe
- Przelot kuli ognia z warkoczem i kanciastymi cząsteczkami, światło
  na terenie, błysk, wstrząs, fala uderzeniowa, deszcz odłamków, krater
  z wałem i osmaloną ziemią, dym i żar po uderzeniu.
- `/meteor pokaz`, `/meteor tempo`.

---

## 0.1.0 - Aplikacja na komputer (2026-10-11)

Pull request #18.

### Nowe
- **Gra jako program na Windowsa** - instalator po polsku, skrót na
  pulpicie, działa bez internetu, **automatyczne aktualizacje**
  z wydań.

### Poprawki
- Klawisz **E** otwierał ekwipunek i od razu go zamykał.

---

## Początki (przed 0.1.0)

Pierwsze dwa dni pracy nad grą - zanim gra dostała numery wersji.

### Ekwipunek, tryby gry i rośliny (#17, 2026-10-11)
- Tryby **przygoda** i **kreatywny**, ekwipunek na 36 miejsc (E),
  zakładka *Wszystkie bloki* z wyszukiwaniem, kosz.
- Nowe ziemie (czarnoziem, ziemia kamienista, ściółka leśna, błoto,
  glina, żwir) i **rośliny** (trawy, paproć, koniczyna, pokrzywa,
  babka, mak, chaber, rumianek, mniszek) kołyszące się na wietrze.

### Gracz (#16, 2026-10-11)
- **Model gracza z 11 stawami**, skórka 64 x 64 (domyślna
  „Wędrowiec”), animacje (chód, bieg, kucanie, skok, lądowanie...),
  **kucanie** (Shift), **bieg** (2 x W albo R), widok z trzeciej
  osoby (**F5**).

### Skały i lepidolit (#15, 2026-10-11)
- Granit, wapień, piaskowiec, łupek i bazalt w warstwach geologicznych,
  **lepidolit** jako rzadki surowiec w żyłach w granicie, `/skaly`,
  przekrój terenu.

### Generator terenu (#14, 2026-10-11)
- Świat wysoki na 128 bloków, typy terenu *Realistyczny* i *Klasyczny*,
  formy terenu (góry, turnie, doliny, płaskowyże...), morze, piasek,
  **mapa terenu** (M), podpowiedzi komend w czacie.

### Tryb ziemniaka (#13, 2026-10-11)
- Prostsza i dużo szybsza grafika dla słabych komputerów.

### Horyzont i zaćmienia (#12, 2026-10-11)
- **Daleki teren** aż po horyzont, **zaćmienia słońca**, zakładki
  ustawień (Obraz, Sterowanie, Inne), `/wydajnosc`.

### Noc, Droga Mleczna i dynamiczne światło (#11, 2026-10-10)
- Noc zależna od fazy księżyca, Droga Mleczna i galaktyki, spadające
  gwiazdy, **meteoryty spadające na ziemię**, światło lampy w ręce.

### Kolorowe światło i czat (#10, 2026-10-10)
- Kolorowe lampy (czerwona, zielona, niebieska, fioletowa), barwa
  światła z nieba, **czat z komendami** (T, /).

### Dzień i noc (#9, 2026-10-10)
- Słońce, **księżyc z fazami**, gwiazdy, doba 20 minut.

### Oświetlenie (#7, #8, 2026-10-10)
- Światło nieba, lampy, cienie w kątach; bezpieczne wyjście ze świata
  z zapisem.

### Pasek bloków i poprawki (#5, #6, 2026-10-10)
- **Pasek bloków** (1-9, kółko, środkowy przycisk - weź blok);
  klikanie nie zatrzymuje już chodzenia.

### Nieskończony świat (#4, 2026-10-10)
- Teren generuje się wokół gracza, granica świata 30 000 bloków.

### Menu, ustawienia i zapis (#1-#3, 2026-10-10)
- **Zapis światów** w przeglądarce, ekran tytułowy, lista światów,
  motywy, pauza, ustawienia (czułość, pole widzenia, zasięg, F3).

### Pierwsza wersja (2026-10-10)
- Świat z chunków, teren, trawa, ziemia, kamień, lampa i lepidolit,
  chodzenie, skakanie, stawianie i niszczenie bloków.
