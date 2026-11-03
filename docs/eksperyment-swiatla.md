# Laboratorium światła — wspólny model powierzchni 0.24.0

> **Od 0.55.0** nie ma osobnego terenu „Laboratorium światła”. Te same
> stanowiska (wnęki z materiałów, słupy, liście z pniem, basen, pokój
> z lampami i otworem w dachu) stawia scena testowa **Światło i materiały**
> w trybie programisty (pauza → *Sceny testowe* albo `/scena swiatlo`) -
> na placu testowym dokładnie w dawnych współrzędnych. Model światła
> wybiera się w *Ustawienia → Eksperymenty → Światło* (*atmosferyczne* -
> domyślne, albo *klasyczne*; dawny wybór „Atmosferyczny” to dziś
> domyślny). Stare światy z laboratorium dostają płaski plac testowy
> (zmienione przez gracza miejsca zostają). Workflow nazywa się
> „Testy gry”, wyniki - `test-results/sceny/`. Opis:
> [tryb programisty](tryb-programisty.md). Niżej - opis z 0.24.0.

Nowy teren **Laboratorium światła (eksperymentalne)** służy do powtarzalnych
porównań światła. Wybierz go przy tworzeniu świata, najlepiej z trybem
kreatywnym. Wszystkie seedy dają ten sam układ stanowisk. Istniejące światy
zachowują swój generator.

Wersja **0.24.0** jest pierwszym etapem ujednolicenia oświetlenia bliskiego
i dalekiego terenu. Łączy zasady składania światła i wybór materiałów;
nie zwiększa zasięgu map cieni ani światła odbitego. Laboratorium pozostaje
stałą sceną porównawczą, a model atmosferyczny jest teraz domyślny również
w pozostałych światach.

## Uruchomienie i porównanie

Ustalenie z 29 października 2026: po etapie cieni 0.25.0 dalsze prace
nad światłem odkładamy na osobny etap, a teraz naprawiamy generację rzek.
Do światła wrócimy z zachowaniem celu stabilnych 60 FPS na RTX 3050 Laptop
na zasilaczu i spójnego wyglądu dalekiego terenu.

W Ustawienia → Obraz jest **Model światła**:

- **Domyślny (atmosferyczny)**: atmosfera we wszystkich światach, również
  starszych zapisach i niezależnie od wybranego generatora.
- **Klasyczny**: dotychczasowe oświetlenie we wszystkich światach.
- **Atmosferyczny**: jawny wybór tego samego modelu atmosferycznego.

Ustawienie zapisuje się lokalnie i dotyczy wszystkich światów. Przełączenie
nie wymaga przebudowy chunków ani ponownego wejścia do gry.
Wcześniej zapisany jawny wybór „Klasyczny” pozostaje klasyczny. Wartość
ustawienia `world` zachowuje zgodność zapisu, ale oznacza teraz wspólny
domyślny model atmosferyczny, a nie wybór zależny od typu świata.

Do rzetelnego porównania ustaw jasność na 0%, wyłącz światło odbite i zachowaj
tę samą kamerę. Cienie ustaw na „Dalekie”; tryb ziemniaka wyłącza mapy cieni.
W czacie:

```text
/czas predkosc 0
/czas ustaw 06:15
/swiatlo model atmosfera
/swiatlo
/swiatlo model klasyczne
```

Powtórz dla 05:30 (przed wschodem), 12:00, 17:45, 18:30 i nocy. Model
atmosferyczny daje słabszą, cieplejszą wiązkę nisko nad horyzontem i światło
rozproszone również wtedy, gdy Słońce jest już pod nim. `/swiatlo` podaje
wysokość środka Słońca, widoczną część tarczy, kierunek wiązki,
względną drogę przez atmosferę i liniowe RGB wiązki.

Powrót do modelu domyślnego: `/swiatlo model swiat`.
Powrót upływu czasu: `/czas predkosc 1` (pauza zegara nie jest zapisywana).

## Stanowiska

Start: x=7.5, z=32.5; podłoga y=16, powietrze od y=17.
Północ to −Z, wschód +X. Osie placu są zaznaczone terakotą.

| Miejsce | Współrzędne X/Z | Co sprawdzać |
| --- | --- | --- |
| Cztery wnęki | X od −28 do 22, Z od −30 do −22 | Ten sam kształt, biały tynk / terakota / ochra / ciemne deski; wpływ barwy powierzchni |
| Cztery słupy | X −24, −12, 0, 12; Z −12 | Wysokości 2/4/8/12; kierunek i długość cienia wraz z czasem |
| Liściasty daszek | X od −28 do −16, Z 4–16 | Prześwity, przyciemnienie pod liśćmi i cień pnia |
| Basen | X od −8 do 4, Z 6–20 | Widoczność dna i obecne zachowanie wody |
| Pokój | X 12–28, Z 4–22 | Drzwi od południa, okno od zachodu, otwór w dachu i przyciemnienie pod pełnym dachem |
| Tylna komora pokoju | Z 5–8 | Czerwone i niebieskie lampy; kontrola niezależnego światła blokowego |
| Tarasy w oddali | X 128–319, Z od −95 do 95 | Wysokości 32/48/64; dalekie cienie i przejścia szczegółowości terenu |

Obróć kamerę w miejscu: położenie Słońca i energia oświetlająca daną
powierzchnię nie powinny się zmieniać. Otwórz mapę, przejdź przez granice
chunków, zapisz i ponownie wczytaj świat: układ stanowisk ma pozostać ten sam.

## Co liczy nowy model

`src/sky/SolarAtmosphere.js` jest czystym modułem matematycznym. Dostaje
wysokość Słońca oraz stopień zaćmienia, bez danych kamery i bez Three.js.

1. Widoczny wycinek tarczy 7° nad horyzontem świata (`SolarDisc.js`).
   Jeden promień ze środka tego wycinka przybliża kierunek rozszerzonego
   źródła. Środek tarczy może być już pod horyzontem, a jej górna część
   jeszcze świecić; energia zanika przy pełnym zachodzie, około −3.5°.
2. Długość drogi wiązki przez jednorodną kulistą powłokę, znormalizowana do 1 w zenicie.
3. Wykładnicze tłumienie wiązki osobno w R/G/B; niebieski słabnie szybciej.
4. Osobna empiryczna krzywa rozproszonego światła dziennego i zmierzchu.
5. Dwie półkule światła: niebo i uśredniony grunt o umownym albedo 0.18.

`NightIllumination.js` dodaje osobno poświatę Księżyca i słabe, umowne tło
nocne, wchodzące płynnie między −6° a −12°. Nie czyta klasycznej tabeli
jasności zmierzchu. Noc może wyglądać inaczej niż wcześniej: jej jasność
nie jest już sumą dwóch krzywych zmierzchu. To względne RGB do gry,
nie fizyczny pomiar światła gwiazd.

`Sky.js` zamienia wynik na światło kierunkowe i `HemisphereLight` dla świata,
dalekiego terenu i ręki gracza. Pozycja środka tarczy pochodzi z `Celestial.js`,
a wspólny `sunLightDirection` służy źródłu kierunkowemu i mapom cieni.
Shader korzysta z normalnej powierzchni; światło półkul jest dodatkowo
mnożone przez istniejący dostęp do nieba, również przy włączonych cieniach.
Model atmosferyczny omija dodatkowe artystyczne podbijanie kontrastu słońca.
Powrót do klasycznego modelu wyłącza półkule i odtwarza dotychczasowe parametry.

## Wspólne światło i materiały powierzchni

`src/rendering/SurfaceLighting.js` zawiera wspólną funkcję GLSL dla bloków,
roślin, liści, wody, ręki/modelu, dalekiego terenu i odłamków bloków. Przyjmuje
osobno albedo, światło naturalne, lokalne, odbite i emisję powierzchni.
Albedo atlasu jest liniowe; nie przechodzi ponownie przez gammę. Światło
naturalne zawiera już odpowiedź Lamberta z Three.js, więc funkcja nie mnoży
go drugi raz przez albedo ani nie dzieli ponownie przez π.

W atmosferze niezależne składowe światła dodają się. Model klasyczny zachowuje
dotychczasowe wybieranie maksimum. Statyczne i dynamiczne pole lamp mogą
opisywać to samo źródło, dlatego najpierw łączą się maksimum kanałów;
nie są traktowane jako dwie niezależne lampy. Nocne odbarwienie obejmuje
światło naturalne i odbite, a lampy i własna emisja zachowują barwę.
To wspólny kontrakt względnego liniowego RGB, nie nowe jednostki fizyczne.

Mesher zachowuje klasyczne RGBA oraz `atmosphereLight` (4 bajty na
wierzchołek). Dane atmosferyczne nie mają sztucznego minimum: zerowy dostęp
do nieba i brak źródeł dają zero także po AO i tłumieniu wody. Dwa dodatkowe
atrybuty, `surfaceOcclusion` i `surfaceEmission`, zajmują po 1 bajcie na
wierzchołek. Pozwalają uwzględniać AO w świetle otoczenia i odbitym bez
przyciemniania bezpośredniej wiązki ani własnej emisji. Shader wybiera dane
uniformem, bez przebudowy świata przy zmianie modelu. Ręka/model i jasność
mgły używają tej samej krzywej bez minimum.

Odłamki mają osobno albedo oraz próbkę dostępu do nieba, RGB lamp i własnej
emisji. Nie wypalają już minimum jasności w kolorze atmosferycznego odłamka:
w całkowicie ciemnym pomieszczeniu fragment nieświecącego bloku pozostaje
ciemny. Model klasyczny zachowuje wcześniejsze przyciemnienie odłamków.
To światło pobrane przy ich powstawaniu, a nie nowa symulacja transportu
światła dla poruszających się cząstek; dym i iskry zachowują wcześniejsze
materiały.

`SurfaceMaterials.js` ustala wspólną kolejność ścian i wybór tekstur dla
bliskich bloków oraz dalekich powierzchni. Daleki teren zachowuje klasyczną
paletę, a atmosfera korzysta z osobnego `surfaceAlbedo` (RGBA8, 4 bajty na
wierzchołek): średniego liniowego koloru właściwej tekstury góry lub boku,
bez wypalonego przyciemnienia dołu ściany, koron drzew i losowej jasności
kratek LOD. Kodowanie pierwiastkiem w bajcie jest odwracane jednym
podniesieniem do kwadratu w shaderze; nie jest dodatkową konwersją sRGB.

Próbki dalekiego terenu niosą też `materialIds` (Uint16, 2 bajty na próbkę).
Rzeczywiste materiały używają ID rejestru bloków, także dla paczek drzew.
Trzy pomocnicze odcienie trawy mają numery powyżej `MAX_BLOCK_ID`, więc nie
kolidują z blokami i nie zawijają się do Uint8. Te dane są wyłącznie
buforami renderowania — nie zmieniają ID ani formatu zapisanych chunków.
Worker i obliczanie w głównym wątku używają tych samych danych i meshera.

`LightLabGenerator.js` używa jednej definicji kolumn dla chunków, przekroju
mapy i próbek dalekiego terenu. Budowle przecinające granice chunków nie
zależą od kolejności generowania. W atmosferze dalekie powierzchnie
laboratorium i chunków zmienionych przez gracza zachowują rzeczywisty
materiał budowlany. Klasyczny widok zachowuje wcześniejsze przypisanie
kolorów. Siatka nie scala sąsiednich powierzchni różnych materiałów tylko
dlatego, że mają tę samą wysokość i klasyczny rodzaj.

## Granice tego eksperymentu

To model względnych wartości RGB, nie spektrometria ani symulacja w luksach.
Grubość powłoki, tłumienie RGB i krzywa zmierzchu są dobrane do gry. Nie ma
jeszcze chmur, pogody, lokalnego albedo gruntu, rzeczywistego wielokrotnego
rozpraszania ani widmowego transportu światła. Niebo i mgła nadal korzystają
z dotychczasowego artystycznego gradientu; kolor widocznej tarczy Słońca jest
powiązany z transmisją atmosfery. Kosmos i globalne oświetlenie kuli planety
nie są przedmiotem kalibracji tego etapu.

Horyzont atmosferycznej tarczy to stałe Y=0, niezależne od kamery. Obniżony
horyzont widziany z dużej wysokości i geometria orbity wymagają osobnego
modelu; ten etap dotyczy obserwacji z powierzchni. Pojedynczy promień
ze środka widocznego wycinka nadal nie tworzy miękkiego półcienia.

Mapy cieni i ich rozdzielczość pozostają istniejące. W modelu atmosferycznym
bloki przesłaniają całą pozostałą wiązkę Słońca także nisko nad horyzontem;
nie nakładamy na to drugiego, klasycznego wygaszania maski cienia. Kontrast
nadal zależy od słabnącej wiązki, kąta padania i światła rozproszonego — nie
musi rosnąć aż do zachodu. Klasyczne cienie, cienie Księżyca i dodatkowe
przyciemnienie wnętrz zachowują dotychczasowe płynne przejścia.
Bez map cieni działa dotychczasowe uproszczenie oparte na dostępie do nieba;
nie jest to test poprawnych kierunkowych cieni. Dostęp do nieba jest skalarem
z flood fill, a nie pełnym rozkładem widoczności nieba. Światło odbite od
konkretnych ścian pozostaje osobnym, domyślnie wyłączonym eksperymentem.
Woda nie otrzymuje nowego modelu załamania czy pochłaniania, a materiały
budowlane wciąż są rozproszone (Lambert), także „polerowany kamień”.

Ujednolicenie albedo i składania światła nie oznacza identycznej ilości
informacji blisko i daleko. Daleki teren nadal jest siatką wysokości:
jeden materiał opisuje słupek, bez wnętrz budynków i kolejnych pionowych
warstw. Lasy mają uproszczone korony dominującego gatunku, a klimat trawy
trzy reprezentatywne odcienie. Zasięgi i rozdzielczości LOD pozostają
dotychczasowe. Daleki shader przekazuje do wspólnej funkcji jawne zero
lokalnych lamp, odbić i emisji, ponieważ jego siatka nie zawiera jeszcze
tych danych. Istniejąca mapa dalekich cieni ma zasięg 512 bloków; etap 1
nie dodaje dalszych cieni ani GI. Osobny efekt światła kuli meteorytu
pozostaje taki jak wcześniej.

Szerokość geograficzna, pory roku, zmiana orbity Słońca, półcień od rozmiaru
tarczy i powiązanie oświetlenia ze wzrostem roślin to kolejne osobne etapy.

## Sprawdzanie

`npm test` uruchamia również `tools/sprawdz_swiatlo.mjs`: wartości skończone,
ciągłość przy horyzoncie, zmierzch bez wiązki bezpośredniej, zaćmienie,
przełączanie A/B, pełne przesłonięcie niskiego Słońca bez skoku doświetlenia
wnętrz, zapis ustawienia/typu świata, powtarzalność generatora,
zgodność chunków z mapą/LOD, bezpieczny start i obecność stanowisk.
`sprawdz_tarcze.mjs` porównuje pole/kierunek tarczy z próbkowaniem geometrycznym.
`sprawdz_ciemnosc.mjs` sprawdza rzeczywisty mesher, AO, brak źródeł, kolorowe
lampy i emisję dla bloków, roślin, dekoracji, liści i wody. Oba należą do `npm test`.

Nowe kontrole etapu 1 również należą do `npm test`:

- `tools/sprawdz_materialy.mjs`: referencja CPU wspólnego kontraktu — suma
  i maksimum, liniowe albedo, brak źródeł, emisja, nocne odbarwienie,
  skalowanie energii oraz brak akumulacji między wywołaniami.
- `tools/sprawdz_materialy_far.mjs`: rzeczywiste próbkowanie, mesher, worker
  i palety dalekiego terenu — tekstury ścian, ID paczek i odcieni, różne
  materiały na jednej wysokości, laboratorium, zmodyfikowane chunki oraz
  zgodność klasycznych buforów z 0.23.1. W teście CPU odczyt bitmap atlasu
  zastępują kontrolowane liniowe kolory.
- `tools/sprawdz_odlamki.mjs`: rzeczywista droga danych odłamków — oddzielne
  albedo i światło, ciemność bez źródeł, kolorowe lampy, emisja, zgodność
  klasycznego modelu, przełączanie A/B i przenoszenie danych wygasających
  cząstek.

Wygląd i wydajność na docelowym GPU należy porównać według scenariusza wyżej.
Przy stałym czasie i ustawieniach obejrzyj również materiały laboratorium
po obu stronach granicy bliskich chunków oraz odłamki w zamkniętym, ciemnym
pokoju. Porównuj ten sam kadr po przełączeniu atmosfery i modelu klasycznego;
osobno oceniaj zmianę materiału, geometrii LOD i dostępnych cieni.

`node tools/sprawdz_swiatlo_webgl.mjs` uruchamia prawdziwą grę w lokalnym
Chrome (`google-chrome` w PATH albo zmienna `CHROME_BIN`). Sprawdza WebGL2,
shadery w kilku trybach, lampy, dostęp do nieba pod dachem, obrazy 12 ujęć
dnia/nocy oraz 6 położeń niskiego Słońca. Porównuje też obraz zachodu
z poprawnym przesłonięciem i ze starym przeciekiem światła, przy tym samym
doświetleniu wnętrz. Renderuje tarczę po zejściu jej środka pod horyzont
i buduje zamknięty pokój: atmosfera ma dać ciemność z cieniami i bez nich,
klasyczny model zachować minimum, a czerwona lampa rozświetlić ściany.
`tools/surface_render_checks.js`, wywoływany przez ten test, renderuje
rzeczywiste materiały bloków, roślin, liści, wody, modelu, far i odłamków
do małej liniowej tekstury wynikowej przy kontrolowanym świetle i geometrii.
Sprawdza kompilację wariantów oraz wartości pikseli: zgodność powierzchni,
sumowanie niezależnych źródeł, klasyczne maksimum, ciemność bez źródeł,
emisję i oddzielenie AO od bezpośredniej wiązki. To uzupełnia pełne ujęcia
gry, nie zastępuje oceny przejść LOD i wyglądu rzeczywistej sceny.
Nie wymaga pakietów npm. Wynik i zrzut zapisuje w
`test-results/light-lab/`. Workflow „Laboratorium światła” uruchamia oba
rodzaje testów dla pull requestów i udostępnia te pliki jako artefakt.
