# Historia zmian

Wszystko, co trafiło do gry - od pierwszego chunka po wytwarzanie.
Najnowsze na górze. Numer wersji to `"version"` w `package.json`
(nowa wersja = nowe wydanie aplikacji na Windows i Androida); zmiany
sprzed 0.1.0 są na dole, w części *Początki*. Przy każdej wersji jest
numer pull requesta (#), w którym weszła.

Pełny opis gry - bloki, przedmioty, przepisy, osiągnięcia - jest
w wiki: [`docs/wiki/`](docs/wiki/README.md).

---

## W przygotowaniu — laboratorium światła

- Eksperymentalne światło atmosferyczne: tłumienie wiązki RGB, cieplejsze
  Słońce przy horyzoncie, rozproszone światło zmierzchu i półkule nieba/gruntu.
- Osobny generator „Laboratorium światła” z powtarzalnymi stanowiskami,
  przełączanie A/B w ustawieniach i przez `/swiatlo model`.
- Domyślnie eksperyment działa tylko w laboratorium; stare światy zachowują
  klasyczne oświetlenie. Testy modelu, generatora i integracji WebGL2.

## 0.22.0 - Wspólny panel ekwipunku (2026-10-27)

### Zmiany
- Biały i jasnoszary ekwipunek z jedną wspólną ramką dla zapasów,
  postaci, wytwarzania i księgi przepisów.
- Pasek dziewięciu przedmiotów wyrównany z kolumnami zapasów; postać
  i siatka wytwarzania znajdują się nad przedmiotami.
- Układ dostosowany do szerokości i wysokości okna, z przewijaniem
  zamiast zmniejszania miejsc do nieczytelnych rozmiarów.
- Osobna paleta kolorów ekwipunku i podpowiedzi, którą przyszłe motywy
  mogą nadpisywać bez zmiany układu ani zasad przenoszenia przedmiotów.

---

## 0.21.1 - Poprawki ekwipunku i lotu (2026-10-27)

Poprawki z pull requesta #42 oraz wcześniejsze poprawki zbioru owoców
i księgi przepisów.

### Poprawki
- Owoce zostają na roślinie, gdy w ekwipunku brakuje na nie miejsca.
- Lista „Tylko możliwe” w księdze przepisów odświeża się po zmianach
  zawartości ekwipunku i siatki wytwarzania.
- Przedmioty trzymane na kursorze nie znikają po zapisaniu i wczytaniu
  świata, również przy pełnym ekwipunku.
- Zniszczenie podpory oddaje także przedmioty z odpadających dekoracji.
  Brak miejsca na wszystkie łupy blokuje niszczenie bez utraty bloków.
- Zapis świata zachowuje włączony lot, także w trybie Przygoda po
  użyciu `/latanie`.

---

## 0.21.0 - Biomy (2026-10-26)

Pull request #41.

### Nowe
- **Biomy** w terenie realistycznym (`docs/biomy.md`): **łąka**, **las
  liściasty**, **buczyna**, **brzezina**, **bór sosnowy**,
  **świerczyna**, **hala**, **skaliste góry**, **ośnieżone szczyty**,
  **mokradła**, **plaża i wydmy**. Biom wynika z wysokości, klimatu,
  wody w pobliżu i pola lasów; każdy ma swój wierzch ziemi (ściółka,
  mech, błoto, żwir, śnieg), rośliny, krzaki owocowe i drzewa.
  - Granice biomów są poszarpane, drzewa na granicach się przeplatają.
  - **Wydmy** na niektórych płaskich wybrzeżach.
  - **Kolor trawy** zmienia się z klimatem (cieplej - żółciej,
    chłodniej i wilgotniej - sinawo, w górach bledziej) - tylko zielone
    piksele, także na dalekim terenie.
  - Daleki teren: ośnieżone szczyty, trawa w kolorze klimatu, korony
    drzew biomu.
- **Nowe bloki:** śnieg i warstwa śniegu (nowy dźwięk - skrzypiący
  śnieg), mech i kępki mchu, trzcina, wrzos, krokus, piaskownica
  (trawa wydmowa), **borówka** (krzak owocowy, owoce: borówki).
- **Nowe drzewa** (paczki drzew): **olcha czarna** i **wierzba biała**
  na mokradłach, z przedmiotami (szyszeczki olchy, bazie). Paczki drzew
  mogą rosnąć w wybranych biomach (`"biomy"` w `gdzieRosnie`); jabłonie
  rosną teraz na łąkach i w lasach liściastych.
- Trzcina, wrzos i piaskownica rosną też na piasku.
- Przepisy: śnieg ↔ warstwy śniegu, mech ↔ kępki mchu, niebieska lampa
  także z borówek, fioletowa - z wrzosu i krokusów.
- `/biom` (biom pod graczem), `/biom lista`, `/biom znajdz <biom> [tp]`,
  `/mapa biomy`; `/teren` pokazuje biom.
- Osiągnięcia: *Borówkowy język*, *Turysta* (wszystkie biomy), *Dach
  świata* (ośnieżony szczyt); *Pełne kosze* - z borówkami.

### Zmiany
- Numery bloków: bloki gry mają też numery 240-255, paczki drzew
  100-239.
- W istniejących światach realistycznych nietknięte chunki dostają
  biomy (zmienione przez gracza zostają).

---

## 0.20.0 - Paczki tekstur w dowolnej rozdzielczości (2026-10-26)

Pull request #40.

### Nowe
- **Paczki tekstur** - zakładka **Ustawienia → Tekstury**: wczytanie
  własnej paczki (plik `.zip`; na telefonie - systemowe okno wyboru
  pliku), rozdzielczość w grze, powrót do oryginalnych tekstur, szablon.
  - Tekstury w paczce mogą mieć **dowolną rozdzielczość** (np. 1254 x
    1254) - gra skaluje je do rozdzielczości w grze: automatycznie (jak
    paczka) albo wybranej (16-512); najwyżej 512 x 512 na komputerze
    i 256 x 256 na telefonie (pamięć karty graficznej).
  - Duże tekstury mają **mipmapy** (pomniejszone kopie dla dalekich
    bloków, każdy kafelek osobno) - nie migoczą z daleka.
  - Bloki, rośliny, przedmioty, drzewa z paczek drzew, pęknięcia
    i księżyc; czego paczka nie ma - zostaje oryginalne. Ikonki
    i kolory dalekiego terenu liczą się z paczki.
  - Paczka zapisuje się w grze (przeskalowane tekstury też - start
    jest szybki); zmiana działa po ponownym uruchomieniu gry (świat
    zapisuje się przedtem).
- **Szablon paczki** z oryginalnymi teksturami (każda w osobnym pliku,
  opis: który plik to który blok): folder `paczka-tekstur-szablon/`
  i `Voxel-Game-paczka-tekstur.zip` w każdym wydaniu; tworzy go
  `tools/paczka_tekstur.py`.
- `/tekstury [wczytaj | rozdzielczosc | oryginalne | szablon | lista]`.
- Osiągnięcie *Nowe szaty* - zagraj z własną paczką tekstur.
- **Aktualizacje automatyczne** - ustawienie (Ustawienia → Inne,
  w aplikacji na komputer i na telefon): wyłączone - gra tylko pokazuje
  nową wersję z przyciskiem *Pobierz* (`/aktualizacja pobierz`).

---

## 0.19.0 - Aplikacja na telefon aktualizuje się sama (2026-10-26)

Pull request #39.

### Nowe
- **Aktualizacje na telefonie** - jak w aplikacji na komputer: przy
  uruchomieniu (i co 3 godziny) gra sprawdza wydania na GitHubie i sama
  pobiera nową wersję w tle. Stan widać na ekranie tytułowym (lewy dolny
  róg), a gotową aktualizację - także na czacie w trakcie gry.
  - **Nowa wersja gry** (pliki gry, ok. 2 MB) pobiera się sama
    i włącza przy następnym uruchomieniu albo od razu (*Uruchom ponownie
    teraz* - świat zapisuje się przedtem). Bez instalowania.
  - **Nowa aplikacja** (gdy zmieni się część na telefon) - przez Wi-Fi
    pobiera się sama, na danych komórkowych po stuknięciu *Pobierz*;
    *Zainstaluj* - Android zapyta o zgodę (za pierwszym razem trzeba
    zezwolić grze na instalowanie aplikacji).
  - Zepsuta wersja nie blokuje gry: po dwóch nieudanych uruchomieniach
    aplikacja wraca do wersji wbudowanej.
- `/aktualizacja` - wersja i stan; `sprawdz`, `pobierz`, `instaluj`,
  `wroc` (na komputerze - stan i `instaluj`).
- W wydaniach obok `.apk`: paczka z plikami gry
  (`Voxel-Game-<wersja>-android-www.zip`) i `android-latest.json`.

### Uwaga
- Wersję 0.19.0 trzeba na telefonie zainstalować jeszcze ręcznie (nowy
  `.apk` z wydań na starym) - kolejne przyjdą same.

---

## 0.18.0 - Rzeki, jeziora i nurt (2026-10-26)

Pull request #38.

### Nowe
- **Rzeki** (teren realistyczny). Zaczynają się w źródłach - częściej
  w górach i na wyżynach - i spływają zawsze w dół, dnem dolin (wzdłuż
  spadku terenu, nie w poprzek zbocza), aż do morza albo do jeziora.
  Rzeki, które się spotkają, płyną dalej razem i są coraz szersze
  (od ~3 do ~9 bloków). Na płaskim terenie meandrują, na spadkach płyną
  prosto. Poziom wody nigdy nie rośnie w dół rzeki - tam, gdzie spada
  o blok, jest mały próg.
- **Jeziora** - w zagłębieniach terenu (także w górach, między
  szczytami), z płaską taflą na poziomie przelewu. Rzeka wpływa do
  jeziora równo z taflą i wypływa z niego przelewem; zagłębienie, które
  nie ma odpływu, jest jeziorem, w którym rzeka się kończy. Morze ma
  zawsze jeden poziom.
- **Bez zalewisk i ścian wody**: przy rzece wzgórza się wygładzają,
  brzegi opadają łagodnie (w górach stromiej), tuż przy korycie brzeg
  jest blok nad wodą. Przy jeziorze teren obok wody nie schodzi poniżej
  tafli (przy przelewie jest próg), a rzeka dochodzi do jeziora równo
  z taflą i dopiero dalej łagodnie opada. Dno z piasku (w górach ze
  żwiru), brzegi z trawy, drzewa nie rosną w wodzie ani na samym
  brzegu.
- **Nurt**: woda w rzece płynie w dół rzeki - wolno na płaskim, szybko
  w górach. Nurt niesie gracza (tym mocniej, im głębiej jest w wodzie),
  a tekstura wody płynie w jego stronę.
- `/rzeka` (nurt i dokąd płynie stąd woda), `/rzeka znajdz tp`,
  `/rzeka jezioro tp`, `/rzeka nurt 0-3`, `/rzeka statystyki`,
  `/teren znajdz rzeka | jezioro`; rzeki i jeziora na mapie (`/mapa`)
  i w dalekim terenie.
- Osiągnięcie *Spływ* - daj się ponieść nurtowi rzeki przez 100 bloków.

### Poprawki
- Woda przy granicy zasięgu widzenia: bez jasnego pasa wzdłuż końca
  prawdziwych chunków (przez wodę było tam widać niebo - pod nią nie
  ma już dna), bez szczeliny między bliską a daleką wodą (daleka woda
  jest na wysokości powierzchni bliskiej), a daleki teren jest
  wycinany dokładnie tam, gdzie są narysowane prawdziwe chunki (co do
  chunka).
- Z góry, na końcu zasięgu widzenia, między drzewami nie widać już
  dziur z niebem - daleki teren ma tam ścianki koron (i wody) zwrócone
  do prawdziwych chunków.

---

## 0.17.0 - Kanciasty daleki teren do 16 384 bloków (2026-10-25)

Pull request #37.

### Nowe
- **Daleki teren jest kanciasty, jak bloki.** Zamiast gładkiej,
  rozmytej siatki - kratki (słupki) z płaskim wierzchem w kolorze
  trawy, skały, piasku, wody albo koron drzew i z pionowymi ściankami
  tam, gdzie teren schodzi niżej. Tuż za zasięgiem widzenia kratka ma
  1 blok, dalej 2, 4, 8... aż do 128 bloków - rozdzielczość maleje
  z odległością, ale teren zostaje kanciasty. Każda kratka ma trochę
  inną jasność (jak tekstura z daleka), ścianki są u dołu ciemniejsze,
  a ścianki trawy u góry zielonkawe.
- **Daleki teren sięga do 16 384 bloków** (było 4096), domyślnie 8192
  (na telefonie 1024). Dwa razy dalszy horyzont to tylko jeden poziom
  kratek więcej, więc 16 384 bloków kosztuje niewiele więcej niż 4096.
- **Daleki teren liczą osobne wątki przeglądarki** (1-3, zależnie od
  procesora) - wysokości i siatki kratek powstają obok gry, więc
  nie zabierają czasu klatkom. `/horyzont` pokazuje, ile wątków liczy.
- Ustawienie **Szczegóły dalekiego terenu**: *niskie* (większe kratki,
  ~2x mniej trójkątów - na telefonie domyślnie), *średnie*, *wysokie*
  (drobniejsze kratki); `/horyzont szczegoly niskie | srednie | wysokie`.
- `/horyzont lod` koloruje kafelki według wielkości kratki (od 1 do 256
  bloków).

### Zmiany
- **Światło odbite jest eksperymentalne i domyślnie wyłączone** - na
  dworze dawało świecący krąg wokół gracza. Można je włączyć
  w ustawieniach albo `/swiatlo odbite wl`; poprawka - później.
- Przy pierwszym uruchomieniu nowej wersji ustawienia *Światło odbite*
  i *Daleki teren* wracają do nowych wartości domyślnych (raz - potem
  zostaje to, co ustawisz).
- W zasięgu prawdziwych chunków daleki teren jest wycięty, a nie
  zapadnięty pod ziemię - nigdzie nie wystaje spomiędzy prawdziwych
  drzew ani przez wykopane dziury (to samo w dalekiej mapie cieni).

---

## 0.16.0 - Światło odbite, budulec i dalekie cienie (2026-10-25)

Pull request #36.

### Nowe
- **Światło odbite - światło „wlewa się” do pokoju.** Słońce, które
  wpadnie przez okno, nie zostaje na podłodze: oświetlona podłoga
  i ściany świecą dalej w kolorze swojej tekstury i rozjaśniają cały
  pokój, słabnąc z odległością. Jasne ściany oddają dużo światła
  (i odbijają je dalej), ciemne - mało, więc to, z czego zbudujesz dom,
  zmienia jego wnętrze. Liczone w tle, po kawałku (nie przycina gry);
  model gracza i ręka też je dostają. Ustawienie *Światło odbite*.
- **Budulec, który inaczej odbija światło** (kategoria *Budulec*):
  tynk wapienny (biały - jasny pokój), tynk ochrowy (ciepły), terakota
  (czerwonawe światło), polerowany kamień (gładki, odbija najwięcej)
  i ciemne deski (pochłaniają światło - pokój jest mroczny). Przepisy:
  wapień + piasek, tynk + glina, 4 x glina, 4 x kamień, deski + bazalt.
  Nowe pole bloku `reflect` - jak mocno odbija światło.
- **Dalekie cienie** (jakość cieni *Dalekie*, domyślna na komputerze):
  druga mapa cieni na 512 bloków wokół gracza, razem z dalekim terenem -
  o wschodzie i zachodzie góry rzucają długie cienie na doliny, a słońce
  chowa się za grzbietem. Rysowana rzadko i po kawałku, do drugiej
  tekstury - nie przycina gry. Promienie światła sięgają z nią dalej.
- **Trawa i kwiaty rzucają cienie** - drobne, pikselowe.
- `/demo dom` - cztery pokoje z różnego budulca obok siebie, każdy
  z oknem od strony słońca. `/swiatlo odbite wl | wyl`, `/swiatlo`
  pokazuje światło odbite przy głowie; `/cienie dalekie`; w `/ustaw`:
  `swiatlo-odbite`.
- Osiągnięcie *Projektant wnętrz* - postaw każdy z pięciu budulców.

### Zmiany
- W pomieszczeniach światło nieba wpadające przez otwory jest słabsze
  (wnętrze oświetla głównie światło odbite).
- Promienie światła są wyraźniejsze.

---

## 0.15.0 - Cienie słońca i promienie światła (2026-10-24)

Pull request #35.

### Nowe
- **Pikselowe cienie słońca i księżyca** (jak „Vibrant Visuals”
  w Minecrafcie). Drzewa, budowle i gracz rzucają cienie, które idą za
  słońcem: rano i pod wieczór długie, w południe krótkie, w jasną noc
  cienie rzuca księżyc. Brzeg cienia idzie po pikselach tekstury bloku
  (16 na blok), a pod drzewem z ładnymi liśćmi leżą plamki słońca.
  Cienie są do 64 bloków od gracza (ustawienie *Dokładne*) albo do 32
  (*Zwykłe*).
- **Słońce wpada przez okna**: światło słońca dochodzi tylko tam, dokąd
  sięgają jego promienie, więc przez okno do ciemnego pokoju wpada jasna
  plama słońca, a w środku jest ciemniej niż na dworze. Z cieniami
  słońce świeci mocniej, a cienie i wnętrza są wyraźniej ciemniejsze.
- **Promienie światła w powietrzu**: widoczne snopy światła przez okna
  i między drzewami, mocniejsze o wschodzie i zachodzie, blask wokół
  słońca, gdy patrzy się pod słońce; nocą słabe, w kolorze księżyca.
  W ciemnym pomieszczeniu są wyraźniejsze (oczy przyzwyczajone do
  ciemności).
- **Cień gracza** - także w widoku z oczu (widać go, patrząc pod nogi),
  a model i ręka ciemnieją, gdy gracz wejdzie w cień.
- Ustawienia *Cienie słońca* (wyłączone / zwykłe / dokładne) i *Promienie
  światła* w zakładce *Obraz*; na telefonie i w trybie ziemniaka
  domyślnie wyłączone.
- Komendy `/cienie` (stan, `/cienie dokladne | zwykle | wyl`,
  `/cienie promienie wl | wyl`) i `/demo okno` (ciemny pokój z oknami od
  strony słońca); w `/ustaw`: `cienie-slonca`, `promienie`. Stan cieni
  w debugu (F3).
- Osiągnięcia *Złota godzina* (popatrz na zachodzące słońce) i *Promyk
  słońca* (stań w plamie słońca pod dachem).

### Zmiany
- Animacja kopania w widoku z oczu: ręka (i narzędzie) macha szerokim
  łukiem w górę i do środka ekranu, a przy trzymanym przycisku robi
  jedno machnięcie na każde uderzenie (bez przerw).
- Poprawka: po wyjściu ze świata w pamięci karty graficznej zostawała
  mała tekstura z kośćmi modelu gracza.

---

## 0.14.0 - Paczki drzew i jabłoń (2026-10-23)

Pull requesty #33 i #34.

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
