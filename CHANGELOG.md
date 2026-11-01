# Historia zmian

Wszystko, co trafiło do gry - od pierwszego chunka po wytwarzanie.
Najnowsze na górze. Numer wersji to `"version"` w `package.json`
(nowa wersja = nowe wydanie aplikacji na Windows i Androida); zmiany
sprzed 0.1.0 są na dole, w części *Początki*. Przy każdej wersji jest
numer pull requesta (#), w którym weszła.

Pełny opis gry - bloki, przedmioty, przepisy, osiągnięcia - jest
w wiki: [`docs/wiki/`](docs/wiki/README.md).

---

## 0.52.0 - Naturalne krawędzie cieni

Zmiana wyglądu cieni słońca i księżyca — PR #85.

- Cienie podążają za powierzchnią i kształtem przeszkody, bez przyciągania do siatki pikseli tekstury bloku.
- Delikatnie wygładzone krawędzie cieni terenu, roślin i gracza; wspólne filtrowanie także na dalekim terenie.
- Zachowany zasięg dalekich cieni około 800 bloków, rozdzielczości map i budżety ich aktualizacji.
- Regresja WebGL sprawdza płynną krawędź wewnątrz pojedynczego piksela tekstury, a także dalekie przeszkody i bardzo niskie słońce.

Wydanie Windows/Android przygotowane do publikacji po scaleniu PR.

## 0.51.1 - Animowana tekstura ognia i kwadratowy popiół

Korekta wyglądu ognisk po 0.51.0 — PR #84.

- Płomień animowany 16 klatkami tekstury przy 12 klatkach/s, z falowaniem modelu zmniejszonym o połowę.
- Wypalone ognisko ma bardziej kwadratowy, pikselowy obrys popiołu i prostokątny układ węgli.

## 0.51.0 - Ogniska budowane z opału

Nowa mechanika ognisk — PR #83.

- Dziewięć gatunków opału z zatwierdzonych modeli; można je mieszać w jednym ognisku. Pień i siekiera dają 4 opały, a siekiera zostaje.
- Budowanie w świecie: 6 polan, trawa na podpałkę i starter z dwóch patyków. Przytrzymanie PPM przez 5 sekund stopniowo rozpala ogień. Ognisko nie jest przedmiotem ekwipunku.
- Około 8 minut spalania, płynne zwęglanie i żarzące szczeliny. Wypalone polana osiadają w popiół z powoli gasnącymi węglami. Ponowne rozpalenie wymaga 6 świeżych opałów i nowej podpałki.
- Animowany ogień, delikatny dym, rzadkie iskry i ciepłe migoczące światło z cieniami terenu oraz roślin. Koszt efektów ograniczają wspólna pula drobin i przechowywane mapy cieni.
- Zapis stanu ogniska; odzyskiwanie świeżego opału przy rozbiórce, także przez usunięcie podłoża. Pełny ekwipunek blokuje rozbiórkę zamiast gubić opał.
- Opały i starter mają modele 3D w ekwipunku oraz dłoni. Dotykowy przycisk „Postaw” obsługuje przytrzymanie do rozpalania.

Instrukcja i limity: `docs/ogniska.md`. Wydanie Windows/Android przygotowane do publikacji po scaleniu PR.

## 0.50.1 - Licencja PolyForm Noncommercial (przed upublicznieniem kodu)

Licencja gry - PR #82. Dla gracza w samej grze bez zmian względem 0.50.0.

- **Licencja: PolyForm Noncommercial 1.0.0** (`LICENSE.md` - oficjalny
  tekst bez zmian i linia `Required Notice:` z autorem). Grę można
  oglądać, zmieniać (mody, paczki tekstur, roślin i drzew) i udostępniać
  za darmo - niekomercyjnie, z informacją o autorze; sprzedaż i
  zarabianie na grze - tylko za zgodą autora. Streszczenie po polsku
  i lista części na innych licencjach (three.js - MIT, Pixelify Sans -
  OFL, Gradle Wrapper - Apache 2.0): `docs/licencja.md`, sekcja
  *Licencja* w README.
- `LICENSE.md` jedzie z grą: w instalatorze (electron-builder) i w
  aplikacji na Androida (`tools/android-www.mjs`, paczka aktualizacji).
- `package.json`: `"license": "PolyForm-Noncommercial-1.0.0"`.
- `AGENTS.md`: zasady publicznego repozytorium (żadnych sekretów ani
  danych osobowych, cudze pliki tylko na zgodnych licencjach).
- `docs/aplikacja.md`: limity Actions dla repozytorium prywatnego
  i publicznego.
- Historia repozytorium sprawdzona przed upublicznieniem: brak tokenów,
  kluczy i haseł poza celowo publicznym kluczem testowym Androida.

## 0.50.0 - Puszyste krzaki i wspólne owoce 3D

Nowy wygląd istniejących krzaków i ich owoców — PR #81.
Zmiany względem opublikowanej wersji 0.49.0.

- Truskawka, jeżyna, chili i leszczyna mają modele w stylu borówki:
  puszyste liście, różne wysokości, odcienie i zagęszczenie korony.
  Owoce mają osobne bryły: truskawki z szypułką i pestkami, ziarniste
  jeżyny, zagięte papryczki oraz orzechy w zielonych okrywach.
- Zebrany owoc ma ten sam model 3D co owoc na krzaku — w ekwipunku
  i w dłoni, również dla borówki. Ikony są zapamiętywanymi podglądami
  modeli, bez ciągłego renderowania osobnej sceny dla każdej kratki.
- Cztery krzaki otrzymują płynny wzrost, odrastanie owoców i krótkie
  reakcje na posadzenie, zbiór, brak miejsca oraz zniszczenie.
  Wspólny limit 12 aktywnych animacji obejmuje też borówkę i kępki.
- Istniejące światy automatycznie pokazują nowe modele. ID, plony,
  czas wzrostu i zapis pozostają zgodne z 0.49.0. Wszystkie krzaki
  znajdują się w kategorii „Rośliny”; dorosła leszczyna mieści się
  w jednym bloku i nie przebija sufitu.
- Sprawdzenia oraz pomiary: [krzaki-owocowe-0.50.0.md](docs/krzaki-owocowe-0.50.0.md).

## 0.49.0 - Indygowiec i marzanna: duże rośliny barwierskie, animacje roślin

Rośliny większe niż blok i animacje wszystkich roślin z paczek — PR #80
(zawiera #79 - 0.48.1, #78 - 0.48.0 i #77 - 0.47.1).

- **Indygowiec** (brzeziny, skraje łąk, buczyny) - pierwszy **duży
  krzew**: u dołu obszerna kępa liści, z niej wachlarzem zdrewniałe pędy
  z owalnymi liśćmi i ziarniste, fioletowo-granatowe grona kwiatów.
  Kwitnący krzew ma ok. 1.4 bloku wysokości i wystaje na boki poza swój
  blok. Trzy etapy: młody, krzew z pąkami, kwitnący. Zbiór z kwitnącego:
  **liście indygowca** (2-4, grupa "coś niebieskiego" - przyszły
  niebieski barwnik), krzew wraca do etapu z pąkami. Osiągnięcie
  *Błękit z zieleni*.
- **Marzanna barwierska** (mokradła, lasy): wysoka, rozgałęziona łodyga
  z długimi, łukowatymi liśćmi parami na krzyż - dolne opadają aż do
  ziemi i sięgają poza blok; czerwone pąki, potem kopułki kremowych
  kwiatków z czerwonym środkiem; przy ziemi wystają czerwone korzenie.
  Zbiór z kwitnącej: **korzeń marzanny** (1-3, grupa "coś czerwonego" -
  przyszły czerwony barwnik), roślina wraca do młodej. Osiągnięcie
  *Czerwień spod ziemi*.
- **Rośliny większe niż blok**: model z pikseli może wystawać w bok
  i w górę (do 2 bloków). Część, która weszłaby w lity blok obok (ściana,
  pagórek, blok nad rośliną, także po skosie), jest ucinana - roślina nie
  przebija bloków. Celownik bierze komórkę rośliny (bloki obok dalej da
  się trafić). W świecie duże rośliny nie wyrastają tuż obok siebie.
- **Animacje wszystkich roślin z paczek** (kępki i krzewy - od kocanki
  po indygowiec), w kierunku borówki: posadzenie - roślina wyrasta
  z lekkim przeskokiem i kołysaniem; wzrost - nowy etap rośnie płynnie od
  wysokości poprzedniego; zbiór - kwiaty maleją wokół własnych środków,
  potem płynnie etap po zbiorze; pełny ekwipunek - ugięcie i kołysanie
  (kwiaty zostają); zniszczenie - szybki zanik. Tylko warstwa wizualna
  (blok i zapis zmieniają się od razu), ten sam limit 12 roślin w pobliżu.
  Dywany, porosty i huby jeszcze bez animacji.
- Paczki roślin: nowe części modelu `kepka` - układ liści `krzew`,
  łukowate liście łodyg (`"luk": true`), łodyga rozgałęziona
  (`"rozgalezione": true`), kwiaty `grono` i `kwiatki`, korzenie przy
  ziemi (`korzenie`, kolory `korzen` i `korzenJasny`) - opis w
  `docs/rosliny.md`, animacje w `docs/animacje-roslin.md`.
- Szybsze budowanie modeli z pikseli (klucze liczbowe zamiast tekstu) -
  kępki i rośliny nad rzeką ok. 2 razy szybciej, modele identyczne co do
  bajtu. Animacja kępki nie przelicza kolorów co klatkę: 12 kwitnących
  indygowców naraz to ok. 3 ms na klatkę (zwykle animuje się 1-2 rośliny).
- Sprawdzenie `tools/sprawdz_animacje_kepek.mjs` (526 sprawdzeń: wymiary,
  ucinanie przy ścianach, przejścia, neutralny początek i koniec, model
  po animacji jak bez niej). Wiki i szablon paczki tekstur odświeżone.

## 0.48.1 - Oszczędniejsze kompilacje w GitHub Actions

Próbne kompilacje tylko dla gotowych PR-ów — PR #79 (zawiera #78 - 0.48.0
i #77 - 0.47.1).

- **Dla gracza bez zmian** w samej grze - wydanie zawiera zmiany z 0.47.1
  (płaskie brzegi rzek) i 0.48.0 (szum wody bez pisków, strumień).
- **Próbne kompilacje Windowsa i Androida oraz Laboratorium światła
  w pull requeście ruszają dopiero z etykietą `kompilacja`** - dodawaną,
  gdy PR jest gotowy. Wcześniej budowały się przy każdym pushu (ok. 14
  minut limitu Actions za każdym razem; w październiku ok. 1 450 minut,
  po czym 31.10 GitHub zatrzymał Actions). PR bez etykiety pokazuje
  przebieg jako pominięty i nie zużywa minut.
- Nowszy push do PR-a przerywa starszą, jeszcze trwającą próbę. Wydania
  na `main` czekają w kolejce (nie są przerywane); z kilku czekających
  zostaje najnowsze.
- Android: zapisany Gradle między przebiegami (`cache: gradle`).
- Opis w `docs/aplikacja.md` (*Próbne kompilacje w pull requeście*),
  zasada w `AGENTS.md` i w szablonie PR.

## 0.48.0 - Szum wody bez pisków, strumień przy rzekach

Szum wody: naprawa pisku i nowy dźwięk strumienia — PR #78 (zawiera #77 - 0.47.1).

- **Naprawa pisku i jęku zamiast szumu fal**: szum wody brzmiał z jednego
  punktu - środka wody wokół gracza - a nad rzeką ten punkt leżał prawie
  pod głową. Przestrzenny filtr HRTF przeglądarki (Chromium, Electron)
  nakładał wtedy na szum przesuwające się wycięcia częstotliwości (jak
  flanger) - przy rozglądaniu się albo przeskoku punktu słychać było pisk
  i jęk. Teraz pętle (szum wody) grają zwykłym stereo, punkt dźwięku jest
  zawsze co najmniej 4 bloki od gracza na wysokości uszu (gdy woda jest
  dookoła - przed graczem, równo z obu stron) i przesuwa się płynnie.
  Krótkie dźwięki zjawisk (meteoryt) zostają przestrzenne (HRTF).
- **Nowy dźwięk: szemranie strumienia** przy rzekach - płynąca woda
  (kolumny z nurtem) brzmi jak strumień: szum przepływu i setki
  pęcherzyków w skupiskach (model fizyczny, 24 s pętla bez rytmu).
  Fale zostają dla stojącej wody (jeziora, morze); oba szumy mieszają się
  według tego, ile jakiej wody jest dookoła. `/woda` pokazuje, ile wody
  płynie.
- Strumień można podmienić nagraniem (`assets/sounds/water/water_stream.ogg`).
- Nowe sprawdzenie `tools/sprawdz_szum_wody.mjs` (w `npm test`).
- Wersja 0.48.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #77).

## 0.47.1 - Płaskie brzegi rzek

Rzeki bez okopów na płaskim terenie — PR #77.

- **Brzegi rzek na poziomie wody**: dotąd brzeg tuż przy korycie był
  zawsze blok nad wodą, więc na płaskim terenie rzeki płynęły w "okopach"
  - między ziemnymi ścianami albo wałami. Teraz przy samej wodzie jest
  płaski pas brzegu na poziomie wody (tafla tuż pod jego wierzchem), na
  nizinach do 2 bloków szeroki, a dalej teren wznosi się łagodnie.
  W górach brzegi zostają strome.
- Brzeg jest o blok wyżej tylko tam, gdzie trzyma wyższą wodę: przy
  progach na rzece (także na zakrętach i dopływach) i przy wejściu rzeki
  do jeziora - woda nigdzie nie stoi ścianą (sprawdzone na 5 seedach).
- Dotyczy nowo generowanego terenu; zapisane już kawałki świata
  (odwiedzone wcześniej) zostają jak były.
- `tools/sprawdz_teren_rzek.mjs`: na płaskim brzeg zwykle na poziomie
  wody (ok. 90%), żadnej ściany wody.
- Wersja 0.47.1 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.47.0 - Porosty i huby

Rośliny na skałach i pniach — PR #76 (zawiera #73-#75).

- Trzy **porosty** z paczek roślin: **porost oliwkowy** (zachodzące,
  oliwkowe płatki z wypukłymi środkami), **porost iglasty**
  (rozgałęzione, ciemnozielone gałązki) i **żółta ochra** (złote grudki
  skorupy). Porost **porasta każdą ścianę, przy której rośnie** - wierzch
  kamienia, bok skały, korę pnia, nawet sufit. Trzy etapy (coraz większa
  plama), PPM na dużym - plecha / gałązki / grudka (obrazki z atlasów).
- **Huba** (grzyb półkowy): półki ze słojami (jasny brzeg, brązowe pasy,
  kremowy spód) wyrastające z boku pnia; trzy etapy - jedna mała półka,
  potem piętrowa kępa. PPM na starej - **huba**.
- Porosty i huby **nie potrzebują ziemi**: stawia się je przy bloku,
  znikają, gdy nie mają już żadnej ściany.
- W świecie: porosty na skałach gór i wybrzeży oraz na pniach (lasy,
  bory, świerczyny), huby na pniach w lasach liściastych i buczynach.
  `gdzieRosnie.na`: `ziemia`, `kamien`, `pnie`.
- Model "kepka": liście `nalot` (wzory `listki`, `galazki`, `kropki`)
  i `huba` - `docs/rosliny.md`. Osiągnięcia *Cierpliwość kamienia*
  i *Półka na pniu*.
- Nowe sprawdzenie `tools/sprawdz_porosty.mjs` (w `npm test`).
- Numery bloków: porosty 5036-5044, huba 5045-5047.
- Wersja 0.47.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #73-#75).

## 0.46.0 - Gorczyca

Gorczyca - grona kwiatów i strąki — PR #75 (zawiera #73 i #74).

- Nowa roślina z paczki roślin: **gorczyca** - rozeta szerokich liści,
  rozgałęzione łodygi z **gronami żółtych kwiatów**, potem przekwita
  w **złote strąki** sterczące ukosem z łodyg (żółknące liście). Trzy
  etapy: młoda, kwitnąca, strąki. PPM na strąkach - **nasiona
  gorczycy** (obrazek z atlasu), gorczyca wraca do młodej. Rośnie
  w **brzezinach**, rzadziej na łąkach. Osiągnięcie *Ziarnko gorczycy*.
- Model "kepka": kwiaty `straczki` (strąki) - `docs/rosliny.md`.
- Numery bloków gorczycy: 5033-5035.
- Wersja 0.46.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #73 i #74).

## 0.45.0 - Len

Len - kwitnie i przekwita — PR #74 (zawiera #73 - 0.44.0).

- Nowa roślina z paczki roślin: **len** - smukłe łodygi z wąskimi
  listkami i **błękitnymi kwiatami**, potem **przekwita**: łodygi schną
  na złoto, a na szczytach rosną kuliste torebki nasion. Trzy etapy:
  młody, kwitnący, dojrzały (suchy). PPM na suchym - **wiązka lnu**
  (obrazek z atlasu), len wraca do młodego (jak po wyrwaniu). Rośnie na
  **halach** i rzadziej na łąkach. Osiągnięcie *Lniana robota*.
- Model "kepka": kwiaty `torebka` (kulista torebka nasion); etap
  z własnymi kolorami jako "przekwitła" roślina - `docs/rosliny.md`.
- Numery bloków lnu: 5030-5032.
- Wersja 0.45.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #73).

## 0.44.0 - Barwinek opada z terenem

Barwinek spływa po stopniach terenu — PR #73.

- **Barwinek opada z terenem**: tam, gdzie teren schodzi o blok, dywan
  spływa zasłoną liści, pędów i kwiatów po boku bloku pod sobą - krótko,
  z postrzępionym dołem. Gdy niżej też rośnie barwinek, zasłona schodzi
  aż do niego, a dolny dywan łączy się z nią - **dywan idzie po schodkach
  jednym kawałkiem**. Pęd z kobierca biegnie dalej w dół zasłony.
- Działa sam, bez nowych bloków: ChunkMesher patrzy na stopień terenu
  obok (także przez granicę chunka); posadzenie, zniszczenie albo
  wykopanie bloku obok od razu zmienia zasłonę.
- `tools/sprawdz_dywan.mjs`: zasłony tuż przed ścianą, krótka i do dywanu
  niżej, schodki w prawdziwym ChunkMesher (108 sprawdzeń).
- Wersja 0.44.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.43.0 - Animacje borówki i płynny wzrost

Animacje interakcji i wzrostu borówki — PR #72.

- Stawianie, zbieranie, krótsze niszczenie oraz delikatna reakcja przy
  pełnym ekwipunku, na podstawie animacji Kamila z Blockbencha.
- Borówki rosną i maleją wokół własnych środków. Krzak płynnie zmienia
  rozmiar, a nowe owoce pojawiają się stopniowo.
- Przerywanie wzrostu zbiorem lub zniszczeniem zachowuje bieżącą pozę.
  Zapis, ilość plonu i tempo wzrostu pozostają zgodne z 0.42.0.
- Ograniczona liczba aktywnych animacji; wspólny materiał, światło, wiatr
  i geometria terenu. Zasady zapisane dla kolejnych gatunków roślin.
- Wersja 0.43.0 przygotowana do wydania po scaleniu PR; pobieralna baza 0.42.0.

## 0.42.0 - Nowy model borówki

Podmiana borówki na modele z paczki „Borowka-cztery-etapy-v1.2” — PR #71.

- Cztery przestrzenne modele: młody krzak, dorosły z kilkoma owocami,
  pełny i dorosły po zbiorze. Liście mają prześwity, a owoce są
  kostkami o krawędzi 1/16 bloku. Dorosły krzak ma 0,75 bloku wysokości.
- Młody krzak dorasta do pierwszych owoców; po zbiorze zostaje dorosły
  krzak, na którym odrastają owoce. Średni czas pierwszego pełnego plonu oraz
  ilość zbieranych borówek pozostają zgodne z dotychczasową grą.
- Nowe modele w świecie i w ręce, ikony ekwipunku oraz wiki, ramka
  celowania dopasowana do kształtu i wysokości krzaka.
- Zachowane numery wszystkich czterech bloków: istniejące światy
  dostają nowy wygląd bez regeneracji terenu. Borówki nadal rosną
  w dotychczasowych biomach, służą do sadzenia i niebieskich przepisów.
- Modele korzystają ze wspólnego atlasu i rysowania roślin, wiatru
  oraz oświetlenia gry. Pełny ekwipunek nie zabiera owoców z krzaka.
- Wersja 0.42.0 dla Windowsa i Androida, przygotowana do publikacji
  po scaleniu PR; wydanie 0.41.0 pozostaje ostatnią pobieralną bazą.

## 0.41.0 - Barwinek (dywan kwiatów)

Barwinek - płożący się dywan kwiatów — PR #70 (zawiera #64-#69).

- Nowa roślina z paczki roślin: **barwinek** - płoży się po ziemi:
  płaski kobierzec ciemnozielonych liści z brązowymi pędami
  i **liliowoniebieskimi kwiatami-gwiazdkami** z jasnym środkiem.
  Trzy etapy: młody (mała kępka), pąki, kwitnący.
- **Barwinki obok siebie łączą się w jeden dywan**: w stronę sąsiada
  (dowolny etap) kobierzec sięga do samej krawędzi, a pęd przechodzi przez
  nią w stałym miejscu - u sąsiada w tym samym; działa też między
  chunkami. Samotny barwinek to okrągła kępka z postrzępionym brzegiem,
  w połączonym dywanie jest więcej kwiatów. Posadzenie albo zniszczenie
  barwinka od razu zmienia sąsiadów.
- W świecie rośnie **gęstymi plamami - dywany** w lasach liściastych
  (często), buczynach i na łąkach. PPM na kwitnącym - **kwiat
  barwinka** (obrazek z atlasu). Osiągnięcie *Dywan z kwiatów*.
- Model "kepka": liście `dywan`, kwiaty `gwiazdka` (płaskie, leżące na
  liściach), `kwiaty.ile`; płaszczyzny jednostronne (od spodu niewidoczne -
  mniej ścian) - `docs/rosliny.md`. Wcześniejsze rośliny bez zmian.
- Nowe sprawdzenie `tools/sprawdz_dywan.mjs` (w `npm test`): krawędzie
  i pędy sąsiadów, maski sąsiadów w prawdziwym ChunkMesher (także przez
  granicę chunka), łączenie etapów.
- Numery bloków barwinka: 5027-5029.
- Wersja 0.41.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64-#69).

## 0.40.1 - Naprawa: rośliny z paczek w terenie realistycznym

Naprawa numerów roślin w generatorze — PR #69 (zawiera #64-#68).

- **Rośliny z paczek nie pojawiały się w terenie realistycznym**
  (kocanka, lawenda, piwonia, zawilec, dzwonek - od 0.31.0): generator
  budował chunk w kolumnie z 1-bajtowymi numerami bloków, więc rośliny
  z numerami 5000+ trafiały do świata z obciętym numerem jako
  niewidoczne, nieznane bloki. Teraz kolumna ma 2 bajty - rośliny rosną
  tam, gdzie powinny.
- **Zapisane światy są naprawiane przy wczytaniu**: obcięty numer
  rośliny wraca do właściwej rośliny (w miejscach, gdzie była
  niewidoczna, pojawi się).
- Rośliny z `"podloze": ["sand"]` rosną też na piasku (plaże, wydmy,
  piaszczyste brzegi): kocanka, a od teraz także **mikołajek i nagietek**
  - dotąd na plaży rosły tylko na rzadkich kawałkach trawy.
- Te same 2 bajty w komendach czytających kolumny terenu
  (`/skaly statystyki`, `/skaly zyla`).
- Nowe sprawdzenia: prawdziwy chunk terenu realistycznego ma roślinę
  z pełnym numerem, stary zapis z obciętym numerem jest naprawiany,
  każda roślina naprawdę stoi w kolumnach terenu.
- Wersja 0.40.1 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64-#68).

## 0.40.0 - Rośliny w swoich biomach

Wagi biomów roślin — PR #68 (zawiera #64-#67).

- Każda roślina z paczki ma teraz **swój biom**, gdzie rośnie
  najczęściej, i czasem poboczny, gdzie jest rzadsza - łąka nie jest
  zatłoczona (ok. połowa dawnej liczby roślin z paczek), a każdy
  krajobraz ma swoje kwiaty: hala - lawenda i dzwonek, skały - szałwia,
  plaże - kocanka i mikołajek, las liściasty - piwonia, buczyna -
  zawilec, brzezina - cynia, łąka - amarantus i nagietek (tabela
  w `docs/rosliny.md`).
- `roslina.json`: `"biomy": { "hala": 1, "laka": 0.3 }` - waga biomu
  (lista bez wag działa jak dotąd). `/rosliny <roslina>` pokazuje biomy,
  poboczne z dopiskiem "rzadziej".
- Plamy roślin z paczek są przypisane do numeru paczki, nie do miejsca
  na liście - kolejne rośliny nie przesuwają plam innych (rośliny
  z paczek w nowo wygenerowanym terenie są jednorazowo w innych
  miejscach niż w 0.39.0; zapisany teren bez zmian).
- Wersja 0.40.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64-#67).

## 0.39.0 - Mikołajek

Mikołajek - kolczaste, niebieskie główki — PR #67 (zawiera #64-#66).

- Nowa roślina z paczki roślin: **mikołajek** - kolczasta,
  stalowoniebieska roślina: kępa liści o srebrnych końcach, na łodygach
  **jajowate, niebieskie główki w kratkę na gwiazdach kolczastych
  przysadek**. Trzy etapy: młody, pąki (małe główki), kwitnący. Rośnie
  na **plażach i w skalistych górach**. PPM na kwitnącym - **kwiat
  mikołajka** (obrazek z atlasu), wraca do etapu z pąkami. Osiągnięcie
  *Kłujący błękit*.
- Model "kepka" umie więcej (bez kodu): kwiaty `oset` (główka w kratkę
  z gwiazdą przysadek) - `docs/rosliny.md`. Wcześniejsze rośliny bez
  zmian.
- Numery bloków mikołajka: 5024-5026.
- Wersja 0.39.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64-#66).

## 0.38.0 - Cynia

Cynia - kwiaty z pięter płatków — PR #66 (zawiera #64 i #65).

- Nowa roślina z paczki roślin: **cynia** - proste łodygi z **parami
  liści na krzyż**, na szczycie pełny, **koralowy kwiat z pięter
  płatków** (szeroki ciemny spód, jaśniejsze piętra, żółty środek).
  Trzy etapy: młoda (łodyżki z liśćmi), okrągłe pąki, kwitnąca. Rośnie
  w **brzezinach i na łąkach**. PPM na kwitnącej - **kwiat cynii**
  (obrazek z atlasu), wraca do etapu z pąkami. Osiągnięcie *Piętrowy
  kwiat*.
- Model "kepka" umie więcej (bez kodu): kwiaty `warstwy` (piętra
  płatków), liście naprzeciwległe (`"naprzeciw": true`) -
  `docs/rosliny.md`. Wcześniejsze rośliny bez zmian.
- Numery bloków cynii: 5021-5023.
- Wersja 0.38.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64 i #65).

## 0.37.0 - Nagietek

Nagietek - pomarańczowe koszyczki — PR #65 (zawiera #64 - 0.36.0).

- Nowa roślina z paczki roślin: **nagietek** - kępa szerokich,
  jasnozielonych liści, na łodygach **pomarańczowe koszyczki
  z brązowym środkiem** (otwarte, przechylone na zewnątrz kępy). Trzy
  etapy: młody, okrągłe pąki, kwitnący. Rośnie na **łąkach i plażach**.
  PPM na kwitnącym - **kwiat nagietka** (obrazek z atlasu), wraca do
  etapu z pąkami. Osiągnięcie *Słoneczko*.
- Bez nowego kodu - sam `roslina.json` z gotowych części modelu "kepka".
- Numery bloków nagietka: 5018-5020.
- Wersja 0.37.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #64).

## 0.36.0 - Szałwia

Szałwia - zioło z kłosami w okółkach — PR #64.

- Nowa roślina z paczki roślin: **szałwia** - szarozielona kopułka
  miękkich liści (dłuższe liście z boków), nad nią łodygi z **kłosami
  w okółkach** - piętra fioletowych kwiatów dookoła łodygi, rozdzielone
  kawałkiem łodygi. Trzy etapy: młoda, pąki, kwitnąca. Rośnie na
  **łąkach i w skalistych górach**. PPM na kwitnącej - **liście
  szałwii** (obrazek z atlasu), wraca do etapu z pąkami. Osiągnięcie
  *Ogródek zielarza*.
- Model "kepka": kłos w okółkach (`"okolki": true`), długość liści
  z boków krzaka (`liscie.brzeg`) - `docs/rosliny.md`. Wcześniejsze
  rośliny bez zmian.
- Numery bloków szałwii: 5015-5017.
- Wersja 0.36.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.35.0 - Dzwonek gołębi

Dzwonek gołębi - zwisające dzwonki z pikseli — PR #63 (zawiera #60-#62).

- Nowa roślina z paczki roślin: **dzwonek gołębi** - kępa wąskich
  liści, nad nią łodygi z **zwisającymi, liliowymi dzwonkami** na
  zagiętych szypułkach (zielony kielich, wąska szyjka, szeroki jaśniejszy
  brzeg, kremowe pręciki od spodu). Trzy etapy: młody (kępa liści),
  pąki (małe, ciemniejsze dzwonki), kwitnący. Rośnie na **halach
  i w skalistych górach**. PPM na kwitnącym - **kwiat dzwonka** (obrazek
  z atlasu), wraca do etapu z pąkami. Osiągnięcie *Kto dzwoni?*.
- Model "kepka" umie więcej (bez kodu): kwiaty `dzwonek` (zwisające
  z szypułek) - `docs/rosliny.md`.
- Numery bloków dzwonka: 5012-5014.
- Wersja 0.35.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #60-#62).

## 0.34.0 - Zawilec

Zawilec - otwarte kwiaty z pikseli — PR #62 (zawiera #60 i #61).

- Nowa roślina z paczki roślin: **zawilec** - niska kępka wcinanych
  liści, na łodygach okółek trzech liści i **otwarte, brzoskwiniowe
  kwiaty** z żółtym środkiem: miseczki przechylone na zewnątrz kępy
  (widać je z góry i z boku). Trzy etapy: młody (liście na niskich
  łodyżkach), pąki, kwitnący. Rośnie w **buczynach i lasach
  liściastych**. PPM na kwitnącym - **kwiat zawilca** (obrazek
  z atlasu), wraca do etapu z pąkami. Osiągnięcie *Pierwszy zwiastun*.
- Model "kepka" umie więcej (bez kodu): kwiaty `talerz` (otwarta
  miseczka, przechylona), okółek liści na łodydze (`okolek`) -
  `docs/rosliny.md`.
- Numery bloków zawilca: 5009-5011.
- Wersja 0.34.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #60 i #61).

## 0.33.0 - Piwonia

Piwonia - krzak z pikseli z kulistymi kwiatami — PR #61 (zawiera #60 - 0.32.0).

- Nowa roślina z paczki roślin: **piwonia** - obszerny krzak z pikseli na
  cały blok: wysoka kopułka liści z kostek z postrzępionym brzegiem
  (wystające liście), łodygi z płaskimi liśćmi i **kuliste, pudrowo
  różowe kwiaty** dwóch wielkości (3 x 3 i 5 x 5 pikseli) z żółtym
  środkiem. Trzy etapy: młoda, okrągłe pąki, kwitnąca. Rośnie na
  skrajach **lasów liściastych i w brzezinach**. PPM na kwitnącej -
  **kwiat piwonii** (obrazek z atlasu), piwonia wraca do etapu z pąkami.
  Osiągnięcie *Róża bez kolców*.
- Model "kepka" umie więcej (bez kodu): liście w układzie `krzak`
  (kopułka liści z liściastym brzegiem) i `brak`, płaskie liście na
  łodygach (`lodygi.liscie`), kwiaty `pompon`, okrągłe pąki (`pak`
  rozmiar 2), `rozmiar` jako zakres (każda łodyga losuje), kolor
  `srodek` - `docs/rosliny.md`. Kocanka i lawenda wyglądają tak samo
  jak dotąd.
- Numery bloków piwonii: 5006-5008.
- Wersja 0.33.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #60).

## 0.32.0 - Lawenda

Lawenda - krzaczek z pikseli z kłosami — PR #60.

- Nowa roślina z paczki roślin: **lawenda** - krzaczek z pikseli (do 15
  pikseli wysokości, prawie blok): gęsta kępa wąskich liści wokół niskiej
  kopułki z kostek, z niej wachlarz rozchylonych łodyg z **fioletowymi
  kłosami**. Trzy etapy: młoda kępa, pąki (ciemny fiolet), kwitnąca.
  Rośnie plamami na **łąkach i halach**. PPM na kwitnącej - **bukiet
  lawendy** (obrazek z atlasu), lawenda wraca do etapu z pąkami.
  Osiągnięcie *Zapach lata*.
- Model "kepka" umie więcej (bez kodu, w `roslina.json`): liście
  w układzie `kepa` (krzaczek z kopułką i wachlarzami liści), łodygi
  `rozchylone`, kwiaty `klos` (kłos z kwiatkami z boku), etap może mieć
  własne kolory (np. ciemniejsze pąki) - `docs/rosliny.md`.
- Numery bloków lawendy: 5003-5005.
- Wersja 0.32.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.31.0 - Kocanka piaskowa

Kocanka piaskowa - mała roślina z pikseli — PR #59 (zawiera #58 - 0.30.0).

- Nowa roślina z paczki roślin: **kocanka piaskowa** - niska,
  srebrzystozielona kępka z baldachami złotych koszyczków. Rośnie
  plamami **na piasku w borach i na plażach**, trzy etapy: młoda rozeta
  (8 x 4 piksele), pąki (10 x 6) i kwitnąca (10 x 10 pikseli, ok. 0.6
  bloku). Sadzi się na piasku i na ziemi.
- **Nowy model małych roślin "kepka"**: zamiast pomniejszonego obrazka
  (przy kilku pikselach - plama) prawdziwy model z pikseli 1/16 bloku -
  rozeta liści przy ziemi, łodygi 1 x 1 piksel z listkami, baldachy
  z kostek albo pąki. 8 odmian, kołysze się na wietrze, miękkie światło
  jak zwykłe rośliny, ikonka w ekwipunku - ten sam model z ukosa.
  Kształt i kolory opisuje `roslina.json` (bez kodu) - `docs/rosliny.md`.
- PPM na kwitnącej kocance - **bukiet kocanki** (obrazek z atlasu Kamila),
  kocanka wraca do etapu z pąkami. Osiągnięcie *Nieśmiertelnik*.
- Pierwsza roślina z numerami bloków 5000+ (2-bajtowe numery z 0.30.0).
- `/rosliny kocanka` pokazuje, które etapy są kępkami z pikseli.
- Wersja 0.31.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu
  (najpierw #58).

## 0.30.0 - Numery bloków do 65279

Numery bloków 2-bajtowe — PR #58.

- Chunk trzyma numery bloków w 2 bajtach zamiast 1: bloki mogą mieć numery
  **1-65279** (dotąd najwyżej 255, a wolnych zostało kilkadziesiąt). Miejsce
  na tysiące nowych bloków, roślin i drzew bez kolejnej zmiany zapisu.
- Zakresy: nowe bloki gry 256-999, paczki drzew 1000-4999 (oprócz dawnych
  100-239), paczki roślin 5000-9999 - `docs/numery-blokow.md`.
  `tools/drzewa.mjs` i `tools/nowe_drzewo.py` nadają numery z obu zakresów.
- **Stare światy działają bez zmian.** Chunk bez bloków o numerze ponad 255
  zapisuje się jak dotąd, po 1 bajcie (zapis nie rośnie); 2 bajty tylko
  przy nowych blokach.
- `/wydajnosc` liczy pamięć chunków z 2-bajtowymi numerami.
- Nowe sprawdzenie `tools/sprawdz_numery_blokow.mjs` w `npm test`.
- Wersja 0.30.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.29.0 - Eksperymentalna trawa kępiasta

Opcjonalny dodatek świata — PR #57.

- Krótka i wysoka trawa mogą przyjąć postać przestrzennych kępek:
  kilka warstw schodkowych liści, różne wysokości i pojedyncze kłosy.
  Modele zachowują siatkę pikseli 1/16 bloku i kolory lokalnego biomu.
- Opcja **Trawa kępiasta** jest domyślnie wyłączona. Można ją wybrać
  przy tworzeniu świata lub w **Pauza → Dodatki świata**. Wybór jest
  zapisywany osobno dla każdego świata, także już istniejącego.
- Wyłączenie przywraca zwykłą trawę; bloki, teren, zbieranie i inne
  rośliny zachowują dotychczasowe działanie.
- Dalsze kępki mają stopniowo mniej geometrii. Rośliny korzystają
  ze wspólnego rysowania chunka i dotychczasowego zasięgu roślin.
- Wersja 0.29.0 dla Windowsa i Androida, przygotowana do wydania po
  scaleniu PR. Zawiera też scalony już PR #56 (0.28.0): paczki
  roślin i amarantus, opisane poniżej.

## 0.28.0 - Duże rośliny: amarantus

Paczki roślin i pierwsza duża roślina — PR #56.

- **Amarantus** - nowa roślina w trzech etapach wzrostu: młody (1.3 bloku),
  z wiechami (1.7) i dojrzały, **2 bloki wysokości** - wyższy od gracza,
  z długimi, zwisającymi, bordowymi wiechami. Rośnie kępami na łąkach
  (teren realistyczny). PPM na dojrzałym daje **wiechy amarantusa**
  (1-3), a roślina wraca do etapu z wiechami. Zniszczona roślina daje
  młody amarantus do posadzenia.
- Wiecha jest "czymś czerwonym" - czerwona lampa: lampa + wiecha.
- Osiągnięcie **Wyższy od ciebie** - zbierz wiechy z dojrzałego amarantusa.
- **Rośliny większe niż blok**: tekstura w skali bloków (16 pikseli na blok),
  roślina wystaje nad swoją komórkę, kołysze się na wietrze, celownik
  i ramka obejmują ją całą. Wyższy etap rośnie tylko z wolnym miejscem
  nad rośliną.
- **Paczki roślin** (`assets/rosliny/`): nowa roślina to folder
  z obrazkami etapów i `roslina.json` - bez kodu (jak paczki drzew).
  Błędy paczek na czacie i w `/rosliny bledy`.
- `tools/rosliny_z_atlasu.py` robi tekstury z dużych atlasów "pixel art"
  (np. 1254 x 1254): odczytuje siatkę pikseli rysunku, zmniejsza do skali
  gry bez mieszania kolorów, wszystkie etapy w tej samej skali.
- Komendy: `/rosliny`, `/rosliny <roslina>`, `/rosliny ogrod`,
  `/rosliny znajdz <roslina>`, `/rosliny bledy`.
- Plan rozmiarów i modeli dla wszystkich 28 roślin z atlasów:
  `docs/rosliny.md`.
- Wersja 0.28.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.27.1 - Pikselowe modele roślin rzecznych

Pikselowy styl roślin — PR #55.

- Sześć roślin rzecznych ma kształty oparte na pikselach wielkości
  1/16 bloku: schodkowe liście i pędy oraz kwiaty i kolby z małych bryłek.
- Cienkie liście są płaskie i widoczne z obu stron. Obrót i przesunięcie
  roślin zachowują siatkę pikseli; ikony również mają ostre krawędzie.
- Sąsiednie powierzchnie o tym samym kolorze są łączone, a wnętrza
  bryłek pomijane. Rośliny nadal korzystają ze wspólnego rysowania chunka.
- Nowy wygląd obejmuje rośliny już zapisane w świecie i przedmioty
  trzymane w ręce, zachowując siedliska, ruch, zbieranie i wodę.
- Wersja 0.27.1 dla Windowsa i Androida; publikacja po scaleniu PR.

## 0.27.0 - Drewniany ekwipunek

Nowy wygląd okna ekwipunku — PR #54.

- **Drewniany ekwipunek** (domyślny): okno z poziomych desek ze słojami
  i sękami, z mchem na górnej krawędzi, kępami liści w rogach i pnączami
  po bokach. Miejsca na przedmioty to ciemne przegródki z jaśniejszą
  listwą u dołu, w drewnianych ramkach ze złotym brzegiem; wybrane
  miejsce i gotowy wynik wytwarzania świecą na złoto.
- Przyciski to jasne deseczki, pola wyszukiwania i podgląd postaci to
  ciemne wnęki, podpowiedzi przedmiotów są ciemne z drewnianym brzegiem.
  Dotyczy wszystkich części okna: ekwipunku, wytwarzania, księgi
  przepisów i zakładek trybu kreatywnego.
- Nowe ustawienie *Ustawienia → Inne → Ekwipunek*: **Drewniany**
  albo **Jasny** (dotychczasowy). Komenda `/ekwipunek wyglad [drewniany |
  jasny]`.
- Okno mieści się w całości od 1366 x 768 (na niższym ekranie księga
  i lista bloków przewijają się w środku). Na telefonie liście nie
  wystają za okno.
- Tekstury rysuje `tools/ekwipunek_drewno.py`
  (`assets/ui/inventory/wood/`).
- Wersja 0.27.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.26.0 - Żywe brzegi i roślinność wodna

Roślinność rzeczna — PR #53.

- Turzyce, pałki wodne i fioletowa krwawnica tworzą nieregularne kępy
  przy brzegach, uzupełniając dotychczasową trzcinę.
- W płytkiej wodzie rośnie wywłócznik, a spokojną taflę zdobią
  grzybienie z okazjonalnymi kwiatami i małe skupiska rzęsy.
- Sześć nowych modeli ma różne kształty, warianty i subtelny ruch:
  łodygi kołyszą się, podwodne pędy falują, a liście podążają za taflą.
  Siedliska uwzględniają brzeg, głębokość i nurt, pozostawiając przerwy.
- Nowe rośliny można zbierać i sadzić. Wodne formy zachowują wodę
  oraz możliwość pływania; pałka dobiera postać do lądu lub płycizny.
- Drzewa i ściółka nie zastępują wody zajętej przez rośliny. Celownik
  rozpoznaje także górną część wysokich pędów.
- Roślinność pojawia się w nowych i nietkniętych fragmentach światów
  realistycznych. Zapisane fragmenty zmienione przez gracza nie są
  regenerowane; rośliny można tam dosadzić ręcznie.
- Wersja 0.26.0 wspólna dla Windowsa i Androida. Przygotowana w PR;
  publikacja w `voxel-game-wydania` następuje przez workflow po scaleniu.

## 0.25.1 - Naturalne koryta i ujścia rzek

Naprawy generacji terenu — PR #52.

- Usunięte dawne suche szczeliny przypominające opuszczone koryta.
  Doliny i górskie żleby pozostają.
- Ujścia nie usypują piaszczystych wałów w morzu. Rzeka łączy się
  z istniejącą taflą wody.
- Jezioro zalewa tylko połączony obszar od swojego dna. Suche przejścia
  do odpływu nie stają się już łańcuchem prostokątnych basenów;
  prowadzi przez nie ciągłe koryto rzeczne.
- Wpływ jeziora na pobliskie wzgórza wygasa według odległości od brzegu,
  bez prostokątnych spłaszczeń otaczającego terenu.
- Gracz wczytany wewnątrz podniesionego terenu trafia do najbliższego
  wolnego miejsca nad nim. Budowle, wykopy i wolne pozycje w jaskiniach
  pozostają bez zmian.
- Poprawki dotyczą nowych i nietkniętych obszarów istniejących światów.
  Zapisane fragmenty zmienione przez gracza nie są regenerowane.
- Wersja 0.25.1 wspólna dla Windowsa i Androida. Po scaleniu PR workflow
  „Aplikacje (komputer i telefon)” przygotuje wydanie w `voxel-game-wydania`.
  Sam PR nie publikuje aktualizacji.

---

## 0.25.0 - Spójne cienie i teren do 800 kratek

Drugi etap oświetlenia — PR #51.

- Trzy skale cieni: szczegółowe przy graczu, pośrednie i dalekie.
  Zasięg obejmuje około 800 kratek z zapasem na płynne wygaszenie.
- Dalekie góry zasłaniają słońce również blisko gracza, na postaci,
  przedmiocie w ręce i w smugach światła. Niskie słońce nie obcina już
  pionowego obszaru dalekiej mapy.
- Gęstszy uproszczony teren do około 800 kratek w średniej i wysokiej
  jakości; dalszy horyzont pozostaje dostępny do 8192 kratek domyślnie.
  Pełne, interaktywne bloki zachowują osobny zasięg z ustawień.
- Dalekie mapy powstają stopniowo, w ograniczonych porcjach, i trafiają
  do obrazu dopiero po zakończeniu. Woda i sztuczne łączenia kafelków
  nie rzucają już fałszywych cieni.
- Przygotowanie materiału wody podczas ładowania świata ogranicza
  przycięcie przy pierwszym dotarciu nad jezioro lub rzekę.
- Panel diagnostyczny F3 odświeża się pięć razy na sekundę, ograniczając
  obciążenie interfejsu także przy włączonych narzędziach dostępności.
- Wersja 0.25.0 wspólna dla Windowsa i Androida. Po scaleniu PR workflow
  „Aplikacje (komputer i telefon)” opublikuje `v0.25.0` w
  `voxel-game-wydania` z plikami automatycznej aktualizacji.
  Przygotowanie PR nie publikuje jeszcze aktualizacji.

---

## 0.24.0 - Wspólne światło i materiały

Pierwszy etap spójnego oświetlenia bliskiego i dalekiego terenu — PR #50.

### Zmiany

- Atmosferyczne oświetlenie jest domyślne we wszystkich światach. Opcja
  „Klasyczny” zachowuje wcześniejsze zasady i pozostaje dostępna do porównania.
- Bloki, modele, odłamki i daleki teren korzystają ze wspólnych zasad
  liniowego koloru. Światło otoczenia, lamp i emisja dodają się do siebie.
- Przyciemnienie zakamarków jest oddzielone od dostępu do nieba i emisji;
  nie nakłada drugiego cienia na bezpośrednie światło słoneczne.
- Daleki teren korzysta z kolorów właściwych tekstur powierzchni, także
  budowli i paczek bloków. Materiał nie zawiera już dodatkowego,
  wypalonego przyciemnienia boków w trybie atmosferycznym.
- Odłamki zachowują kolor lamp i brak światła w ciemnym pomieszczeniu.
- Zasięg widoku i cieni pozostaje bez zmian. Dalekie lampy, rozszerzenie
  światła odbitego i nowe właściwości wody/liści należą do następnych etapów.

### Wydanie

- Wersja 0.24.0 wspólna dla Windowsa i Androida; kod Androida: 2400.
- Po scaleniu PR workflow „Aplikacje (komputer i telefon)” przygotuje
  `v0.24.0` w `voxel-game-wydania` z instalatorem, APK i plikami aktualizacji.
  Przygotowanie PR nie publikuje jeszcze aktualizacji.

---

## 0.23.1 - Poprawki światła i cieni

Przygotowane do wydania: poprawki z PR #47 i #48,
które nie weszły do pobieralnej wersji 0.23.0.

### Poprawki

- Usunięto nakładanie klasycznego zmierzchu na nową atmosferę. Księżyc
  i słabe tło nocne są osobnymi składowymi.
- Widoczny fragment tarczy Słońca dostarcza światło aż do pełnego zachodu.
  Wiązka i cienie korzystają ze wspólnego kierunku tego fragmentu.
- W modelu atmosferycznym zamknięte pomieszczenie bez źródeł może być
  całkowicie ciemne; lampy zachowują światło i kolory. Przełączanie modeli
  nie przebudowuje chunków, klasyczne minimum jasności pozostaje dostępne.

- Usunięto podwójne wygaszanie słonecznych cieni przy horyzoncie w modelu
  atmosferycznym. Słabnie sama wiązka światła; blok nadal ją przesłania.
  Klasyczny model, Księżyc i płynne przyciemnienie wnętrz zachowują swoje
  dotychczasowe działanie.

### Wydanie

- Wersja 0.23.1 wspólna dla Windowsa i Androida; kod wersji Androida: 2301.
- Po scaleniu PR workflow „Aplikacje (komputer i telefon)” buduje
  i publikuje `v0.23.1` w `voxel-game-wydania`: instalator Windows,
  APK, paczkę aktualizacji Androida i pliki automatycznych aktualizacji.

---

## 0.23.0 - Laboratorium światła (2026-10-28)

Eksperyment z PR #45, wydany jako aktualizacja Windows i Androida.

### Zmiany

- Eksperymentalne światło atmosferyczne: tłumienie wiązki RGB, cieplejsze
  Słońce przy horyzoncie, rozproszone światło zmierzchu i półkule nieba/gruntu.
- Osobny generator „Laboratorium światła” z powtarzalnymi stanowiskami,
  przełączanie A/B w ustawieniach i przez `/swiatlo model`.
- Domyślnie eksperyment działa tylko w laboratorium; stare światy zachowują
  klasyczne oświetlenie. Testy modelu, generatora i integracji WebGL2.

### Jak wypróbować
- Utwórz świat typu „Laboratorium światła”, najlepiej w trybie kreatywnym.
- Porównuj modele w Ustawienia → Obraz → Model światła lub komendami
  `/swiatlo model atmosfera` i `/swiatlo model klasyczne`.
- Instrukcja i ograniczenia pierwszej wersji: [eksperyment światła](docs/eksperyment-swiatla.md).

---

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
