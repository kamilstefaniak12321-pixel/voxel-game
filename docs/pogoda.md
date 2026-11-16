# Pogoda

Pogoda w Various Roots nie jest włącznikiem dla całego świata. To mapa,
która płynie nad krajobrazem: front widać z daleka, da się przed nim
uciec albo pójść mu naprzeciw. Liczy się wyłącznie z **ziarna świata
i czasu gry** - nic nie trafia do zapisu, a w grze ze znajomymi wszyscy
widzą ten sam front w tym samym miejscu (czas świata jest wspólny).

Kod: `src/weather/`, chmury na niebie: `src/sky/layers/Clouds.js`.

![Pogoda w 1.11.0: chmury kłębiaste, komórka burzowa, front chłodny, pierzaste o zachodzie, cień chmury i mapa pogody](pogoda-1110.jpg)

## Plan aktualizacji pogodowej

Całość jest za duża na jedno wydanie, więc idzie w sześciu częściach.
Każda jest grywalna sama w sobie.

| nr | część | stan |
|---|---|---|
| 1 | **Niebo i fronty** - pole pogody, fronty, lokalny wiatr, chmury na trzech piętrach, cienie chmur, mapa pogody, `/pogoda` | **1.11.0** |
| 2 | **Deszcz** - od mżawki po ulewę, skośne krople, odległe kurtyny deszczu, mokry świat, schronienie pod dachem, dźwięk, mgła, tęcza | plan |
| 3 | **Burze** - letnie komórki i ciemne fronty, wyładowania w chmurach i w ziemię oświetlające krajobraz, grzmot spóźniony o odległość, grad | plan |
| 4 | **Zima** - rodzaje śniegu (od krup po mokre płaty), śnieżyca, zamieć przy ziemi, pokrywa śnieżna (wizualna) i topnienie, szron | plan |
| 5 | **Pustynia i morze** - pyłowa mgiełka, burza piaskowa, haboob, wiry pyłowe, sztorm ze spienionymi falami | plan |
| 6 | **Wpływ na rozgrywkę** - deszcz gasi ognisko, rośliny rosną po deszczu, zimno | plan |

Ustalenia z Kamilem: pogoda **ma wpływać na rozgrywkę** (część 6),
śnieg na ziemi będzie **wizualną pokrywą** (nie blokami), piorun na
początek daje **tylko światło i dźwięk**.

## Jak powstaje pogoda (`WeatherField.js`)

1. **Przepływ.** Każdy świat ma stały kierunek, z którego nadciąga pogoda
   (przeważnie z zachodu, w każdym świecie trochę inaczej) i prędkość 5,5
   bloku na sekundę. Doba gry to 20 minut, więc front przechodzi nad
   graczem przez kilka-kilkanaście minut.
2. **Układy.** Na dwóch siatkach płynących z przepływem żyją układy
   pogodowe. Każdy rośnie, trwa około dwóch dób gry i zanika; w jego
   oczku rodzi się następny.

   | układ | co niesie | kiedy częściej |
   |---|---|---|
   | wyż | czyste niebo, słaby wiatr | lato |
   | front ciepły | najpierw chmury pierzaste, potem średnie, potem niskie z jednostajnym deszczem; za nim przejaśnienia | jesień, zima |
   | front chłodny | wąska ściana piętrzących się chmur z ulewą (latem z burzą), tuż za nią przejaśnienie, potem przelotne deszcze; silny, porywisty wiatr, który skręca | cały rok |
   | niż | niebo zamknięte cienką, szarą warstwą, miejscami mżawka | jesień, zima |
   | burze | kilka komórek burzowych, które rosną i zamierają, z kowadłem wysokich chmur; żyją z popołudniowego słońca | lato |
   | przelotne deszcze | wypiętrzone kłęby, z których tu i tam przez chwilę pada | wiosna |
   | chmury pierzaste | samo pole wysokich chmur | cały rok |

3. **Tło.** Chmury kłębiaste dobrej pogody: rosną od południa, najwięcej
   ich po południu, nocą znikają. Latem jest ich więcej.
4. **Klimat.** W suchych stronach świata (pustynia, sawanna - pole
   wilgotności generatora terenu) chmur z przerwami i deszczu jest mniej;
   zamknięte niebo frontu zostaje zamknięte.

Front ma **przekrój jak prawdziwy**, więc pogodę da się czytać z nieba:
pierzaste smugi na czystym niebie znaczą, że za kilka minut przyjdzie
front ciepły; ciemna ściana na horyzoncie i rosnący wiatr - front chłodny.

Próbka pola (`field.sample(x, z, doby)`) podaje: pokrycie chmurami
niskimi, ich piętrzenie, chmury średnie i wysokie, opad, burzę, wpływ
wyżu oraz wiatr (kierunek, prędkość, porywistość).

## Wiatr

Do 1.10.3 wiatr był jeden dla całego świata (0,6-2,4 bloku/s). Teraz
wieje stamtąd, skąd nadciąga pogoda, a układy go wzmacniają i skręcają:
w wyżu prawie cisza, przed frontem chłodnym i przy burzy nawet 8-10
bloków/s w porywach. Wiatr w miejscu gracza (`weather.wind`) niesie
spadające liście i smugi wiatru, a rośliny kołyszą się tym mocniej, im
silniej wieje (`weather.sway`, od 0,55 do 3 razy zwykłego kołysania).

Wiatr w menu głównym zostaje po staremu (`world/AmbientWind.js`).

## Chmury (`sky/layers/Clouds.js`, `weather/cloudShader.js`)

Trzy piętra, każde płynie z inną prędkością i w trochę innym kierunku:

| piętro | wysokość (y) | wygląd | prędkość |
|---|---|---|---|
| niskie | podstawa ok. 210 (latem wyżej, zimą niżej) | kłębiaste i warstwowe; zbudowane z kolumn-klocków o boku 8 bloków, z płaską podstawą, tarasami i wierzchem - z bliska jak chmury z klocków, mają boki i widać je także z góry | jak przepływ |
| średnie | 470 | drobne kłębki albo szara zasłona | 1,25 × |
| wysokie | 760 | pierzaste, falujące smugi ułożone z wiatrem | 1,9 × |

Teren kończy się na wysokości 128, więc chmury zawsze są nad nim.

- **Gdzie są chmury**, mówi mapa pogody: tekstura 128 × 128 punktów,
  punkt co 128 bloków (ponad 16 km), odświeżana po jednym wierszu na
  klatkę. **Kształt** daje mała tekstura szumu (`CloudNoise.js`),
  wyrównana tak, żeby „pokrycie 40%" znaczyło 40% nieba w chmurach.
- **Kolor** bierze się z nieba: w dzień białe z szarym spodem (gruba
  chmura ma spód ciemny), o wschodzie i zachodzie pomarańczowe
  i podświetlone od dołu - wysokie świecą najdłużej, bo słońce jeszcze je
  widzi - nocą ciemne, rozjaśnione księżycem. Z odległością chmury
  toną w kolorze nieba.
- **Z góry.** Gdy leci się ponad chmurami, rysują się drugi raz, po
  terenie, i zasłaniają go. W środku chmury robi się biało.
- **Kosmos.** Wysoko nad ziemią chmury gasną - tam ma je kula Ziemi.

## Światło i cienie chmur

- **Zachmurzenie zmienia światło całego świata.** Zamknięte niebo nad
  graczem przechodzi w profil światła pochmurnego (ten sam, który dotąd
  włączało tylko `/swiatlo chmury`): słońce słabnie, niebo szarzeje,
  cienie miękną. Pod grubą chmurą deszczową albo burzową jest jeszcze
  ciemniej (`Sky.cloudDepth`).
- **Cienie chmur suną po krajobrazie** - po blokach, roślinach, liściach,
  wodzie i dalekim terenie. Cień leży pod tą samą chmurą, którą widać na
  niebie, i przesuwa się z niskim słońcem. Pod zamkniętym niebem cienie
  znikają (światło i tak jest rozproszone).

## Komendy i mapa

| komenda | działanie |
|---|---|
| `/pogoda` | niebo nad tobą, piętra chmur, wiatr; najbliższy front albo burza i za ile minut tu będzie |
| `/pogoda prognoza` | zmiany nieba w tym miejscu na najbliższe półtorej doby gry |
| `/pogoda znajdz <rodzaj> [tp]` | najbliższy układ danego rodzaju; `tp` przenosi tuż przed niego |
| `/pogoda ustaw <rodzaj>` | ustawia pogodę nad tobą (stoi w miejscu) |
| `/pogoda ustaw <rodzaj> nadciaga` | układ zaczyna kilka tysięcy bloków pod wiatr i nadciąga jak prawdziwy |
| `/pogoda auto` | powrót do pogody liczonej samodzielnie |
| `/pogoda deszcz [0-100]`, `/pogoda sucho` | sam deszcz, do odwołania |
| `/mapa pogoda [skala]` | **mapa pogody na żywo**: chmury (im ciemniejsze, tym bardziej się piętrzą), opad (niebieski), burza (fioletowy), linie frontów (czerwona - ciepły, niebieska - chłodny) i strzałki wiatru. Domyślnie 64 bloki na punkt (ponad 12 km). Przy otwartym czacie mysz pokazuje pogodę wskazanego miejsca |

Rodzaje: `pogodnie`, `pochmurno`, `front-cieply`, `front-chlodny`,
`burza`, `przelotne`, `pierzaste`.

Pogoda ustawiona komendą jest tylko u tego gracza i nie daje osiągnięć.

## Ustawienia

- **Chmury** (Ustawienia → Obraz → zaawansowane, `/ustaw chmury`):
  *Pełne* (z bokami i wierzchem), *Płaskie* (sama podstawa - dużo
  tańsze), *Wył.* Jakość grafiki *Niska* i *Średnia* oraz telefon
  zaczynają z płaskimi, *Wysoka* i *Najwyższa* z pełnymi; tryb ziemniaka
  zawsze używa płaskich. Stary zapis ustawień zachowuje swoją jakość.
- **Cienie chmur** (`/ustaw cienie-chmur`): wł. / wył. W trybie ziemniaka
  wyłączone.

## Wydajność

- **Procesor:** pogoda ma własny etap w `/wydajnosc` („Pogoda (mapa
  chmur, wiatr)"). Na maszynie testowej 0,33 ms na klatkę średnio.
  Przy wejściu do świata i po dalekim teleporcie mapa liczy się raz
  w całości (ok. 0,1 s).
- **Karta graficzna:** chmury liczą się dla pikseli nieba; czyste niebo
  kończy się po czterech odczytach mapy. Cień chmur to trzy odczyty
  tekstury na piksel terenu. **Kosztu na prawdziwej karcie nie zmierzono**
  - tutaj gra działa tylko na programowym rysowaniu. Do sprawdzenia
  u Kamila: `/wydajnosc test` z chmurami pełnymi, płaskimi i wyłączonymi.

## Osiągnięcia

*Pierwsze krople* (deszcz, który przyniosła pogoda), *Wiatr we włosach*
(wiatr od 6 bloków/s), *Ani jednej chmurki* (środek wyżu w dzień),
*Głowa w chmurach* (wlot w niską chmurę).

## Sprawdzenia

`tools/sprawdz_pogode.mjs` (ponad 5000 sprawdzeń): powtarzalność
i zakresy pola, gładkość w czasie i przestrzeni, ruch układów, przekroje
frontów, pory roku i klimat, mapa pogody w teksturze (także po
przesunięciu okna), światło, cienie i wiatr, szum chmur i próg pokrycia,
kolory chmur o różnych porach, opisy słowne, prognoza, komenda, mapa,
ustawienia, osiągnięcia i wpięcie w grę.

Testy przeglądarkowe, które mierzą kolory albo sterują deszczem, same
ustawiają pogodę: `tools/fixtures/trees-085.js` przypina wyż nad kamerą
(świat o ziarnie 42 zaczyna się w deszczu frontowym), a
`tools/fixtures/waterfall-ripple-benchmark.js` włącza deszcz tak jak
komenda (`game.rainOverride`). Do powtarzalnych porównań światła w grze
służy `/pogoda ustaw pogodnie`.

## Braki (stan na 1.11.0)

- **Deszcz jest jeszcze dawny** - kilkadziesiąt kresek wokół gracza. Pada
  już tam, gdzie mówi pogoda, ale wygląd, dźwięk, kurtyny deszczu i mokry
  świat to część 2.
- **Burza nie błyska i nie grzmi** - na razie to ciemna, piętrząca się
  chmura z ulewą i wiatrem (część 3).
- **Daleka ściana chmur jest mało wyrazista** - z kilku kilometrów
  piętrzące się chmury zlewają się w jasny pas z ciemną podstawą.
- **Cienia chmur nie dostają** modele (gracz, przedmioty na ziemi,
  skrzynie, ogniska) ani rozbryzgi wodospadów; promienie światła
  w powietrzu też o nim nie wiedzą.
- **Woda nie odbija chmur** (odbija sam kolor nieba).
- **Paleta światła „Poprzednia"** (`/swiatlo paleta poprzednia`) nie ciemnieje
  pod zachmurzeniem - chmury i ich cienie działają, światło nieba nie.
- **Rośliny przechylają się zawsze w tę samą stronę** - zmienia się siła
  kołysania, nie kierunek. Wiatr nie ma jeszcze dźwięku.
- **Tło menu nie ma chmur**, a chmury na kuli Ziemi (widok z kosmosu) nie
  są tymi z pola pogody.
- **Góry nie sięgają chmur** (teren do 128, chmury od ok. 210) - mgła na
  szczytach przyjdzie z mgłą w części 2.
- **Temperatury jeszcze nie ma w polu pogody** - o tym, czy pada deszcz,
  czy śnieg, zdecyduje część 4.
- **Przeskok czasu** (sen, `/czas`) przeskakuje też pogodę - po
  przebudzeniu może już padać. To zamierzone, ale chmury zmieniają się
  wtedy skokiem.
- **`/pogoda ustaw` nie jest wysyłane innym graczom.**
