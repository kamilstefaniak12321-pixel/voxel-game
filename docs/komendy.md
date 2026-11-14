# Komendy

Czat otwiera się klawiszem **T** (albo **/** - wtedy od razu z ukośnikiem).
Tekst zaczynający się od `/` to komenda. **ESC** zamyka, **↑ ↓**
przywołują poprzednie wpisy.

**Podpowiedzi:** w trakcie pisania nad czatem widać listę pasujących
komend (z krótkim opisem) albo słów, które pasują w tym miejscu (bloki,
godziny, kolory, formy terenu...). Pierwsza z nich dopisuje się szarym
kolorem w polu tekstowym - **Tab** ją zatwierdza, a **↑ ↓** wybierają
inną z listy (gdy podpowiedzi jest kilka). Po wpisaniu nazwy komendy
nad czatem pojawia się, jak jej użyć.

Wielkość liter i polskie znaki nie mają znaczenia: `/Księżyc` = `/ksiezyc`.
Współrzędne można podawać względem gracza: `~` (tu, gdzie stoję),
`~5` (5 dalej), `~-3` (3 bliżej).

## Lista

| komenda | co robi |
|---|---|
| `/pomoc [komenda]` | lista komend albo opis jednej |
| `/wyczysc` | czyści czat |
| `/czas` | dzień, godzina, prędkość czasu, faza księżyca |
| `/czas ustaw <18:30 \| rano \| poludnie \| popoludnie \| zachod \| wieczor \| noc \| polnoc \| wschod>` | ustawia godzinę (ten sam dzień) |
| `/czas dodaj <godziny \| 30m>` | przesuwa czas (może być ujemnie) |
| `/czas predkosc <x>` | prędkość czasu: 0 = stoi, 1 = normalnie, 60 = minuta na sekundę |
| `/czas dzien <numer>` | ustawia numer dnia (godzina zostaje) |
| `/ksiezyc` | faza, oświetlenie, czy jest nad horyzontem, kolor |
| `/ksiezyc faza <now \| sierp \| kwadra \| garb \| pelnia \| ubywajacy-garb \| ostatnia-kwadra \| ubywajacy-sierp>` | przesuwa czas o pełne doby do tej fazy i mówi, o której księżyc jest najwyżej |
| `/ksiezyc kolor <kolor \| domyslny>` | kolor księżyca (zabarwia też światło nocą) |
| `/pogoda [deszcz [0-100] \| sucho]` | stan opadu albo zmiana natężenia deszczu (domyślnie 40%); na czas bieżącej sesji, dach zatrzymuje krople, trafienia w wodę tworzą kręgi |
| `/niebo` | wysokość słońca, łuna, ile gwiazd widać, Droga Mleczna, spadające gwiazdy na minutę, trwające zaćmienie |
| `/niebo zachod <kolor \| domyslny>` | kolor łuny wschodu i zachodu (zabarwia też światło) |
| `/zacmienie` | kiedy następne zaćmienie słońca (dzień, godzina, pełne czy częściowe); jeśli trwa - ile słońca jest zasłonięte |
| `/zacmienie lista [ile]` | najbliższe zaćmienia (domyślnie 5) |
| `/zacmienie nastepne` | przeskok czasu na 1,5 h przed następnym zaćmieniem |
| `/zacmienie pokaz [pelne \| czesciowe \| <procent>]` | wymusza zaćmienie w najbliższym nowiu i przestawia czas na 1,5 h przed nim |
| `/zacmienie auto` | wyłącza wymuszone zaćmienie (wracają zwykłe) |
| `/tp <x> <z>`, `/tp <x> <y> <z>`, `/tp spawn` | teleport (bez y - na powierzchnię) |
| `/kamera [oczy \| tyl \| przod]` | widok kamery: z oczu, zza pleców, z przodu (bez nazwy - następny, jak F5) |
| `/animacja <stanie \| chodzenie \| bieg \| kucanie \| skradanie \| skok \| machanie \| latanie \| plywanie \| plywanie-w-miejscu>` | podgląd animacji modelu gracza w miejscu (włącza kamerę z przodu); `/animacja wyl` - koniec |
| `/model` | model gracza: styl zgięć, druga warstwa skórki, tempo animacji |
| `/model gladki \| klocki` | zgięcia rąk, nóg i tułowia: gładkie albo osobne klocki |
| `/model warstwa <wl \| wyl>` | druga (wierzchnia) warstwa skórki |
| `/model tempo <0.05-2>` | tempo animacji (0.25 = cztery razy wolniej) |
| `/skorka plik` | wczytanie własnej skórki (PNG 64 x 64, układ jak w Minecrafcie) |
| `/skorka domyslna` | powrót do domyślnej skórki |
| `/pozycja` | pozycja i chunk |
| `/tryb [przygoda \| kreatywny \| programista]` | tryb gry (bez słowa - jaki jest): przygoda - bloki się kopie (trzymany LPM), zniszczone trafiają do ekwipunku, stawianie je zużywa; kreatywny - bloki bez końca i znikają od razu, wszystkie bloki pod E, latanie po dwukliku Spacji; programista - jak kreatywny + sceny testowe (`/scena`). Skróty: `/gm p`, `/gm k`, `/gm dev` |
| `/scena lista` | sceny testowe (tryb programisty): nazwa, opis - [tryb programisty](tryb-programisty.md) |
| `/scena <nazwa>` | stawia scenę (swiatlo, paleta, materialy, lampy, okno, dom, basen, rosliny, krzaki, drzewa, skaly, wodospady, modele) - na placu testowym zawsze w tym samym miejscu, w innym terenie przed graczem - i przenosi do niej gracza (zmienia świat) |
| `/scena czas <swit \| poludnie \| zachod \| noc \| stop \| start>` | pora dnia jednym słowem (ten sam dzień) i zatrzymanie/wznowienie czasu |
| `/kopanie [blok \| lista]` | ile trwa kopanie w trybie przygody: blok, na który patrzysz, albo podany (`/kopanie granit` - także kilofem, łopatą albo siekierą, jeśli przyspiesza), `lista` - czasy wszystkich bloków. Skrót: `/kop` |
| `/przepisy [rzecz \| lista \| moge]` | przepisy wytwarzania: `/przepisy kilof` - jak zrobić i do czego się przydaje (też dla surowców: `/przepisy granit`), `lista` - wszystkie, `moge` - te, na które masz składniki (ile razy). Też `/recipes` |
| `/wytworz <przepis> [ile razy]` | wytwarza od razu ze składników z ekwipunku (nazwa przepisu albo wyrobu, też po polsku: `/wytworz kilof`, `/wytworz stick 4`). Też `/craft` |
| `/ekwipunek` | co jest w ekwipunku (ile sztuk każdego bloku, ile miejsc zajętych) |
| `/ekwipunek wyczysc` | czyści cały ekwipunek (z paskiem) |
| `/ekwipunek wyglad [drewniany \| jasny]` | wygląd okna ekwipunku (bez słowa - przełącza na drugi); to samo co *Ustawienia → Wygląd → Ekwipunek* |
| `/latanie` | włącza/wyłącza latanie w każdym trybie (Spacja w górę, Shift w dół) - do testów; w kreatywnym wystarczy 2× Spacja |
| `/predkosc <0.1-20>` | prędkość ruchu (1 = normalnie) |
| `/energia` | energia, kondycja i samopoczucie w liczbach (tryb przygody, `docs/energia.md`). Też `/samopoczucie` |
| `/energia <0-130>` | ustawia energię - do testów (np. `/energia 15` - zmęczony, `/energia 2` - wyczerpany) |
| `/energia noga <sekundy>` | stłuczona noga na tyle sekund (0 - zdrowa, najwyżej 300): utykanie bez skakania z wysokości - do testów |
| `/energia utoniecie` | utrata przytomności i pobudka na brzegu, jak po utonięciu - do testów |
| `/energia sen <0-100>` | ustawia wyspanie - do testów (np. `/energia sen 20` - senny, `/energia sen 5` - niewyspany; `docs/sen.md`) |
| `/energia efekt <calm, heal, vigor, brak>` | włącza efekt naparu bez picia (spokój, gojenie, wigor) albo wyłącza wszystkie - do testów (`docs/ziola.md`) |
| `/energia kondycja <60-130>` | ustawia kondycję - do testów (od 108 przy pełnej energii: świetne samopoczucie) |
| `/daj <blok albo przedmiot> [ilość]` | blok albo przedmiot (owoc) do ekwipunku: z ilością - tyle sztuk (do 2304, pierwsze wolne miejsca, najpierw pasek); bez ilości w trybie kreatywnym - jedna sztuka do wybranego miejsca paska, w przygodzie - stos 64. Nazwy też po polsku, bez ogonków: `granit`, `trawa`, `ziemia`, `mak`, `chaber`, `paproc`, `czarnoziem`, `krotka_trawa`, `truskawki` (`truskawka`), `jezyny`, `chili` (`papryczki`), `orzech`, `sadzonka_truskawki`, `leszczyna`... |
| `/bloki` | lista bloków i przedmiotów (nazwa do komend i polska nazwa) |
| `/krzaki` | krzaki owocowe do 64 bloków od ciebie: ile w każdym etapie (sadzonki, bez owoców, kilka owoców, pełne), tempo wzrostu |
| `/krzaki ogrod` | przed tobą ogródek: 4 rzędy (truskawka, jeżyna, papryczka chili, leszczyna), w każdym od lewej sadzonka, krzak bez owoców, kilka owoców, pełen owoców (zmienia świat) |
| `/krzaki znajdz` | najbliższy dziki krzak z owocami: nazwa, odległość, kierunek i komenda `/tp` |
| `/rosliny` | rośliny z paczek roślin (`assets/rosliny/`, `docs/rosliny.md`): lista z wysokością |
| `/rosliny <roslina>` | opis rośliny: etapy z rozmiarem w blokach i pikselach, przedmiot i zbiór, gdzie rośnie, numery bloków (np. `/rosliny amarantus`) |
| `/rosliny ogrod [roslina]` | przed tobą wszystkie etapy każdej rośliny (roślina w rzędzie, co 3 bloki; zmienia świat) |
| `/rosliny znajdz <roslina>` | najbliższa we wczytanym terenie: etap, odległość, kierunek i `/tp` |
| `/rosliny bledy` | błędy paczek roślin (roślinę z błędem gra pomija) |
| `/krzaki rosnij [1-3]` | krzaki do 64 bloków od ciebie od razu rosną o tyle etapów (3 = od sadzonki do pełnego owoców) |
| `/krzaki tempo [0-500]` | tempo wzrostu krzaków: 60 = etap średnio co 2,5 s zamiast 150 s, 0 = nie rosną, 1 = normalnie; bez liczby - jakie jest (nie zapisuje się) |
| `/drzewa` | drzewa do 64 bloków od ciebie (ile każdego gatunku - z generatora terenu), las w miejscu gracza, tempo wzrostu sadzonek (`docs/drzewa.md`) |
| `/drzewa lista` | katalog wszystkich gatunków (od 0.85.0 dziewiętnaście) i przykłady pokazów |
| `/drzewa las <gatunek> [liczba 1-36] [seed]` | losowy las jednego gatunku przed graczem, domyślnie 16 drzew; omija przeszkody i podaje wynik |
| `/drzewa warianty <gatunek> [seed]` | galeria dostępnych szablonów, rozmiarów i stanów specjalnych (np. kwitnąca lipa, owocująca jabłoń) |
| `/drzewa porownanie [seed]` | wszystkie gatunki obok siebie; razem z galerią wymaga wolnej ziemi na komplet drzew, najlepiej na trawie obok centralnego placu świata programisty |
| `/drzewa ostatnie` | powtarza nazwy, współrzędne i seed ostatniego pokazu |
| `/drzewa cofnij` | cofa ostatni nowy pokaz w tej sesji; zachowuje późniejsze zmiany bloków. Pamięć cofnięcia znika po wyjściu ze świata |
| `/drzewa posadz <gatunek> [0-100]` | drzewo 5 bloków przed tobą (gatunki: `swierk`, `sosna`, `buk`, `lipa`, `dab`, `brzoza`, `jablon`, `olcha`, `wierzba`, `akacja`, `cyprysnik`, `wisnia`, `klon`, `kosodrzewina`, `oliwka`, `eukaliptus`, `sekwoja`; rozmiar 0 - małe, 100 - duże, bez - losowy); krócej: `/drzewa dab` |
| `/drzewa aleja` | wszystkie gatunki w rzędzie przed tobą, co 12 bloków (zmienia świat) |
| `/drzewa znajdz <gatunek> [tp]` | najbliższe drzewo gatunku w świecie (do 1500 bloków): odległość, kierunek; `tp` - przeniesienie pod nie |
| `/drzewa rosnij` | sadzonki (i krzaki) do 64 bloków od ciebie rosną od razu - sadzonka bez miejsca nad sobą czeka |
| `/drzewa tempo [0-500]` | tempo wzrostu roślin (to samo co `/krzaki tempo`): 60 = sadzonka wyrasta średnio po 5 s zamiast 5 min |
| `/drzewa paczki` | starszy alias `/drzewa lista`; od 0.80.0 wszystkie gatunki są we wspólnym katalogu, bez osobnego mechanizmu paczek drzew |
| `/wypelnij <x1> <y1> <z1> <x2> <y2> <z2> <blok \| powietrze>` | wypełnia prostopadłościan (do 16 384 bloków) |
| `/swiatlo` | światło przy głowie i przy wskazanej ścianie (niebo 0-15, lampy 0-15 i ich kolor) |
| `/swiatlo dynamiczne [wl \| wyl]` | włącza/wyłącza dynamiczne światło (to samo co w ustawieniach) |
| `/swiatlo odbite [wl \| wyl]` | włącza/wyłącza światło odbite od oświetlonych ścian (to samo co w ustawieniach) |
| `/swiatlo paleta <naturalna \| poprzednia>` | paleta światła: naturalna albo poprzednia (porównanie A/B) - [podstawa oświetlenia](podstawa-oswietlenia.md) |
| `/swiatlo widok <full \| albedo \| normals \| sunVisibility \| skyAccess \| ao \| sun \| moon \| sky \| bounce \| local \| emission \| grayscale \| transmission \| specular>` | diagnostyka: pokazuje jedną składową obrazu (dane materiału albo jedno źródło światła); `full` albo `/swiatlo reset` - zwykły obraz |
| `/swiatlo zrodlo <sun \| moon \| sky \| bounce \| local \| emission \| transmission \| specular> <wl \| wyl>` | diagnostyka: włącza / wyłącza jedno źródło światła |
| `/swiatlo chmury <0-100>` | zachmurzenie w profilu oświetlenia (bez symulacji pogody) |
| `/swiatlo reset` | pełny obraz i wszystkie źródła światła z powrotem |
| `/swiatlo model <atmosfera \| klasyczne>` | model światła (to samo co *Ustawienia → Eksperymenty → Światło*) |
| `/demo swiatlo` | buduje zamknięty pokój z kolorowymi lampami i stawia w nim gracza |
| `/demo okno` | buduje ciemny pokój z oknami od strony słońca (snopy światła, plamy słońca na podłodze) i stawia w nim gracza; w nocy albo przy słońcu za wysoko przestawia zegar na popołudnie (zmienia świat) |
| `/demo dom` | buduje cztery pokoje obok siebie z różnego budulca (tynk wapienny, terakota, polerowany kamień, ciemne deski), każdy z oknem od strony słońca i przejściami między nimi - widać, jak budulec zmienia światło odbite (zmienia świat) |
| `/cienie` | cienie słońca i promienie światła: jakość, które światło rzuca cienie i jak wysoko jest, ile razy przerysowano mapę cieni, czy słońce świeci na gracza |
| `/cienie <wyl \| zwykle \| dokladne \| dalekie>` | jakość cieni słońca (to samo co w ustawieniach; dalekie - też daleka mapa z dalekim terenem) |
| `/cienie promienie [wl \| wyl]` | promienie światła w powietrzu (to samo co w ustawieniach) |
| `/demo kula [kolor \| usun]` | kula dynamicznego światła krąży przed graczem przez minutę |
| `/demo skaly` | odkrywka: wykop przed graczem aż do y = 1 - na ścianach widać warstwy skał (zmienia świat) |
| `/meteory` | ile spadających gwiazd na minutę, czy jest deszcz meteorów |
| `/meteory deszcz <wl \| wyl \| auto>` | wymusza albo wyłącza deszcz meteorów (auto = sam wybiera noce) |
| `/meteory pokaz [ile]` | od razu kilka spadających gwiazd (widać w nocy) |
| `/meteor` | zrzuca meteoryt w pobliżu (nie w chunki zmieniane przez gracza); nadlatuje zza miejsca upadku, więc patrząc w tamtą stronę widać cały przelot (8 s) |
| `/meteor tu` | meteoryt spada tam, gdzie patrzysz (albo 15 bloków przed graczem) |
| `/meteor pokaz` | meteoryt spada 30 bloków przed graczem i nadlatuje z naprzeciwka - najlepszy widok |
| `/meteor tempo [0.05-2]` | tempo meteorytów (lot, cząsteczki, wybuch, także dźwięki - niższe): 0.25 = cztery razy wolniej, 1 = normalnie; bez liczby - jakie jest |
| `/dzwiek` | stan dźwięku (gra / wstrzymany), ile plików się wczytało, głośności |
| `/dzwiek lista` | wszystkie dźwięki (nazwy z `src/audio/sounds.js`) |
| `/dzwiek <nazwa>` | gra jeden dźwięk, np. `/dzwiek meteor_impact`, `/dzwiek break_stone` |
| `/dzwiek pokaz [materiał]` | po kolei dla każdego materiału (albo jednego: `trawa`, `ziemia`, `kamien`, `piasek`, `zwir`, `bloto`, `rosliny`, `szklo`, `drewno`): trzy kroki, postawienie, zniszczenie |
| `/woda` | czy jesteś w wodzie: jak głęboko (procent ciała), czy pływasz, czy oczy są pod wodą; ile wody dookoła |
| `/woda basen` | basen przed tobą (zmienia świat): brodzik (1 blok wody), dalej 4 bloki głębokości, ściany z wapienia równo z ziemią |
| `/woda znajdz` | najbliższa woda we wczytanych chunkach: odległość, kierunek i komenda `/tp` nad wodę |
| `/woda fale [0-3]` | wysokość fal na wodzie (0 = płaska, 1 = zwykłe); bez liczby - jaka jest (nie zapisuje się) |
| `/rzeka` | rzeka tam, gdzie jesteś: nurt (siła, kierunek), dokąd płynie woda (do morza albo jeziora, ile bloków, przez ile jezior); poza rzeką - najbliższa rzeka |
| `/rzeka znajdz [tp]` | najbliższa rzeka; z `tp` - teleport nad brzeg, twarzą do wody |
| `/rzeka jezioro [tp]` | najbliższe jezioro, do którego wpływa rzeka (wielkość, czy ma odpływ) |
| `/rzeka wodospad [tp]` | najbliższy wodospad (do 1024 bloków; rzeka spada tam, gdzie teren opada o 5 bloków i więcej): wysokość, odległość, kierunek; `tp` - teleport nad sadzawkę. Na placu testowym: `/scena wodospady` |
| `/rzeka nurt [0-3]` | jak mocno nurt niesie gracza (0 - wcale, 1 - zwykle); bez liczby - jak jest |
| `/rzeka statystyki` | ile rzek, źródeł, jezior i obszarów policzono dotąd (`docs/rzeki.md`) |
| `/dzwiek menu` | po kolei dźwięki menu i ekwipunku: przycisk, "Wróć", suwak, otwarcie ekwipunku, wzięcie, odłożenie, kosz, zamknięcie, błąd, zbieranie owoców |
| `/horyzont` | daleki teren: zasięg, ile kafelków widać i ile się buduje, trójkąty, ile wątków go liczy |
| `/horyzont <bloki \| wyl>` | zasięg dalekiego terenu, do 16384 (to samo co w ustawieniach) |
| `/horyzont szczegoly <niskie \| srednie \| wysokie>` | wielkość kratek dalekiego terenu (to samo co w ustawieniach) |
| `/horyzont lod` | koloruje kafelki dalekiego terenu według wielkości kratki (czerwone - 1 blok, pomarańczowe - 2, żółte - 4...) |
| `/horyzont odswiez` | buduje daleki teren od nowa |
| `/teren` | teren pod graczem: wysokość, pas (morze, nizina, wyżyna, góry), forma terenu, powierzchnia, biom, nachylenie i pola generatora |
| `/biom` | biom pod graczem (teren realistyczny): co tam rośnie, temperatura, wilgotność, ile biomów odwiedzone (`docs/biomy.md`) |
| `/biom lista` | wszystkie biomy (✔ - odwiedzone) i słowa do szukania |
| `/biom znajdz <biom> [promien] [tp]` | najbliższy biom, np. `hala`, `mokradla`, `bor`, `snieg`, `plaza`; `tp` - od razu teleport |
| `/teren <x> <z>` | to samo dla dowolnego miejsca (`~` = względem gracza) |
| `/teren formy` | lista form terenu do szukania |
| `/teren znajdz <forma> [promien] [tp]` | najbliższa forma terenu (np. `turnia`, `kotlina`, `plaskowyz`, `wyzyna`); `tp` - od razu teleport |
| `/mapa [warstwa] [skala]` | mapa terenu z góry (klawisz **M**); warstwy: `teren`, `formy`, `pasy`, `skaly` (skała na wierzchu albo pod glebą), `przekroj` (przekrój pionowy w kierunku patrzenia, domyślnie 1 blok na punkt), `lasy` (gatunek drzew, który przeważa, i gęstość lasu), `biomy` (biomy z legendą), `kontynent`, `wypietrzenie`, `erozja`, `grzbiety`, `gory`, `wyzyny`, `temperatura`, `wilgotnosc`; skala = bloki na punkt (1-32) |
| `/mapa wyl` | zamyka mapę |
| `/skaly` | skały w kolumnie pod graczem, od góry (np. trawa 1, ziemia 3, piaskowiec 12...) |
| `/skaly statystyki [promien]` | udział skał w okolicy (domyślnie 128 bloków) i ile lepidolitu wychodzi na wierzch |
| `/skaly znajdz <skala> [promien] [tp]` | najbliższe miejsce, gdzie skała jest na wierzchu: `granit`, `wapien`, `piaskowiec`, `lupek`, `bazalt`, `kamien`, `lepidolit` |
| `/skaly zyla [promien] [tp]` | najbliższa żyła lepidolitu pod ziemią (z `tp` - przeniesienie nad nią) |
| `/skaly przekroj` | przekrój pionowy terenu (to samo co `/mapa przekroj`) |
| `/ziemniak [wl \| wyl]` | tryb ziemniaka - wszystko działa, ale prościej i szybciej (słaby komputer, brak karty graficznej) |
| `/dotyk [wl \| wyl]` | sterowanie dotykowe (telefon, tablet): czy włączone, ekran i rozdzielczość; `wl` / `wyl` - przełącza (zapis świata i odświeżenie strony) - `docs/telefon.md` |
| `/aktualizacja [sprawdz \| pobierz \| instaluj \| wroc]` | wersja gry i aktualizacje aplikacji (komputer, telefon): stan; `sprawdz` - sprawdź wydania teraz (telefon); `pobierz` - pobierz nową wersję (bez aktualizacji automatycznych; na telefonie też aplikację na danych komórkowych); `instaluj` - nowa wersja od razu; `wroc` - wersja wbudowana w aplikację (telefon) - `docs/telefon.md`, `docs/aplikacja.md` |
| `/tekstury [wczytaj \| rozdzielczosc <auto \| 16 ... 512> \| oryginalne \| szablon \| lista]` | paczka tekstur: stan; `wczytaj` - wybór pliku `.zip`; `rozdzielczosc` - piksele na blok w grze; `oryginalne` - bez paczki; `szablon` - szablon paczki z oryginalnymi teksturami; `lista` - brakujące i pominięte pliki paczki (zmiany - po ponownym uruchomieniu gry, z zapisem świata) - `docs/paczki-tekstur.md` |
| `/ustaw` | lista ustawień z wartościami |
| `/ustaw <ustawienie> <wartość>` | zmienia ustawienie, np. `/ustaw zasieg 256`, `/ustaw jasnosc 50`, `/ustaw licznik-fps wl` |
| `/ustaw jakosc <niska \| srednia \| wysoka \| najwyzsza>` | jakość grafiki - kilka ustawień obrazu naraz (jak *Ustawienia → Obraz → Jakość grafiki*); bez słowa - jaka jest teraz |
| `/ustaw domyslne` | przywraca domyślne ustawienia |
| `/wydajnosc` | FPS, czasy klatki, rysowanie (wywołania, trójkąty), chunki, daleki teren, pamięć |
| `/wydajnosc test [sekundy]` | test: kamera obraca się raz dookoła, wynik na czacie (domyślnie 10 s) |
| `/logi [problem]` | raport błędów i wydajności (to samo co *Pauza → Diagnostyka i logi*); `problem` zaznacza bieżący moment (też **F8**). Też `/diagnostyka` |
| `/osiagniecia` | osiągnięcia: co zdobyte, punkty, id (opis: `docs/osiagniecia.md`) |
| `/osiagniecia ksiega` | otwiera księgę osiągnięć (to samo co klawisz L) |
| `/osiagniecia pokaz <zwykle \| rzadkie \| bardzo-rzadkie \| legendarne \| id>` | samo powiadomienie o osiągnięciu (bez zdobywania) |
| `/osiagniecia daj <id>` / `zabierz <id \| wszystkie>` | przyznaje / zabiera osiągnięcie (do testów) |

Kolory: `czerwony`, `krwawy`, `pomaranczowy`, `zloty`, `zolty`, `zielony`,
`turkusowy`, `niebieski`, `fioletowy`, `rozowy`, `bialy` albo `#rrggbb`.

Nazwy ustawień w `/ustaw`: `ziemniak`, `zasieg`, `daleki-teren`, `szczegoly-terenu` (też `daleki-teren-szczegoly`), `pole`, `jasnosc`,
`rozdzielczosc`, `fps` (limit), `cienie` (cienie w kątach, 0-100), `cienie-slonca` (`wyl` / `zwykle` / `dokladne` / `dalekie`), `promienie` (promienie światła: `wl` / `wyl`),
`swiatlo-odbite` (też `odbicia`: `wl` / `wyl`),
`model-swiatla`, `swiatlo-materialow`, `atmosfera`, `przeswiecanie-lisci`, `sila-odbicia`, `nasycenie-odbicia`,
`liscie` (ładne liście z prześwitami: `wl` / `wyl`), `trawa-kepiasta`, `dynamiczne-swiatlo`, `wczytywanie`, `czulosc`,
`odwroc-mysz`, `motyw`, `interfejs`, `debug`, `licznik-fps`, `meteoryty`,
`warstwa-skorki`, `reka` (ręka w widoku z oczu), `kolysanie` (kołysanie widoku przy chodzeniu),
`zgiecia` (`gladkie` / `klocki`), `kamera` (odległość kamery z F5, 2-8),
`imie` (imię widoczne dla innych graczy), `serwer` (własny serwer połączeń gry ze znajomymi, np. `https://moj-serwer.pl/peer`; `-` - publiczny),
`modele-roslin`, `model-lisci`, `wiatr` (rośliny kołyszą się na wietrze), `animacje-roslin`,
`spadajace-liscie` (liście i owoce spadające z drzew), `smugi-wiatru` (zakładka *Modele*),
`glosnosc`, `glosnosc-bloki`, `glosnosc-otoczenie` (też `glosnosc-zjawiska`), `glosnosc-menu` (0-100).
Wartości tak/nie: `wl` / `wyl`.

Niektóre komendy mają też angielskie nazwy (`/time`, `/moon`, `/tp`,
`/fly`, `/give`, `/fill`...) - pokazuje je `/pomoc <komenda>`.

### Sekrety (nie ma ich w `/pomoc` ani w podpowiedziach)

| komenda | co robi |
|---|---|
| `/kosmos [lec \| spadaj \| status] [wysokość]` | kosmos: przeniesienie wysoko (domyślnie 6000, w locie), `spadaj` - od razu w dół jak meteoryt (krater przy lądowaniu), `status` - wysokość, kula, prędkość, ogień. Opis: `docs/kosmos.md` |

## Zasada: nowa rzecz w grze = nowa komenda

Każda nowość powinna dać się szybko sprawdzić z czatu: nowy blok -
`/daj`, nowa rzecz na niebie - opcja `/niebo` albo `/demo`, nowy
efekt - komenda, która go włącza albo buduje scenę do obejrzenia.
A jeśli jest za co - także nowe osiągnięcie (`docs/osiagniecia.md`).

## Jak dodać komendę

Komendy są w `src/commands/gameCommands.js` (lista `GAME_COMMANDS`,
pogrupowana tematami). Nowa komenda to nowy obiekt na tej liście:

```js
{
    name: 'skok',                       // wpisuje się /skok
    aliases: ['jump'],                  // inne nazwy (opcjonalne)
    usage: '/skok <siła>',              // pokazywane przy błędzie i w /pomoc
    description: 'Wyrzuca gracza w górę.',
    // hidden: true,                    // sekret: bez /pomoc i podpowiedzi

    // args - słowa po nazwie komendy, ctx - { game, world, player,
    // sky, time, chat, commands, map }. Zwrócony tekst pojawi się na czacie.

    run(args, { player }) {

        const power = Number(args[0] ?? 10);

        if (!Number.isFinite(power)) {
            throw new CommandError('Siła musi być liczbą');   // czerwony błąd
        }

        player.vel.y = power;

        return `Hop! (${power})`;

    },

    // Podpowiedzi (lista nad czatem, Tab) dla ostatniego wpisanego
    // słowa (opcjonalne).

    complete(args) {
        return args.length === 1 ? ['5', '10', '20'] : [];
    }
}
```

Pomocnicze funkcje na górze pliku: `parseNumber`, `parseCoordinate`
(obsługuje `~`), `parseColor`, `parseClock`, `blockArgument`.

**Opis musi nadążać:** `node tools/sprawdz_komendy_opis.mjs` (w `npm test`,
od 0.82.2) sprawdza, czy każda komenda i podkomenda z `usage`, każda
nazwa ustawienia z `/ustaw` (`SETTING_WORDS`) i każda scena testowa są
opisane w tym pliku (sceny także w `docs/tryb-programisty.md`). Nowa
komenda bez wiersza w tabeli wyżej = czerwony test.
