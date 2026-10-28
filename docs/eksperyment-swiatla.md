# Laboratorium światła — eksperyment v1

Nowy teren **Laboratorium światła (eksperymentalne)** służy do powtarzalnych
porównań światła. Wybierz go przy tworzeniu świata, najlepiej z trybem
kreatywnym. Wszystkie seedy dają ten sam układ stanowisk. Istniejące światy
zachowują swój generator.

## Uruchomienie i porównanie

W Ustawienia → Obraz jest **Model światła**:

- **Według świata** (domyślne): atmosfera tylko w laboratorium, klasyczny model
  we wszystkich pozostałych światach, również starszych zapisach.
- **Klasyczny**: dotychczasowe oświetlenie we wszystkich światach.
- **Atmosferyczny (eksperymentalny)**: nowy model we wszystkich światach.

Ustawienie zapisuje się lokalnie i dotyczy wszystkich światów. Przełączenie
nie wymaga przebudowy chunków ani ponownego wejścia do gry.

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
wysokość Słońca, względną drogę przez atmosferę i liniowe RGB wiązki.

Powrót do automatycznego wyboru: `/swiatlo model swiat`.
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

1. Długość drogi przez jednorodną kulistą powłokę, znormalizowana do 1 w zenicie.
2. Wykładnicze tłumienie wiązki osobno w R/G/B; niebieski słabnie szybciej.
3. Osobna empiryczna krzywa rozproszonego światła dziennego i zmierzchu.
4. Dwie półkule światła: niebo i uśredniony grunt o umownym albedo 0.18.

`Sky.js` zamienia wynik na światło kierunkowe i `HemisphereLight` dla świata,
dalekiego terenu i ręki gracza. Kierunek nadal pochodzi z `Celestial.js`.
Shader korzysta z normalnej powierzchni; światło półkul jest dodatkowo
mnożone przez istniejący dostęp do nieba, również przy włączonych cieniach.
Model atmosferyczny omija dodatkowe artystyczne podbijanie kontrastu słońca.
Powrót do klasycznego modelu wyłącza półkule i odtwarza dotychczasowe parametry.

`LightLabGenerator.js` używa jednej definicji kolumn dla chunków, przekroju
mapy i próbek dalekiego terenu. Budowle przecinające granice chunków nie
zależą od kolejności generowania. Z daleka materiały budowlane mają wspólny
kolor skały; to celowe uproszczenie LOD.

## Granice tego eksperymentu

To model względnych wartości RGB, nie spektrometria ani symulacja w luksach.
Grubość powłoki, tłumienie RGB i krzywa zmierzchu są dobrane do gry. Nie ma
jeszcze chmur, pogody, lokalnego albedo gruntu, rzeczywistego wielokrotnego
rozpraszania ani widmowego transportu światła. Niebo i mgła nadal korzystają
z dotychczasowego artystycznego gradientu; kolor widocznej tarczy Słońca jest
powiązany z transmisją atmosfery. Kosmos i globalne oświetlenie kuli planety
nie są przedmiotem kalibracji v1.

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

Szerokość geograficzna, pory roku, zmiana orbity Słońca, półcień od rozmiaru
tarczy i powiązanie oświetlenia ze wzrostem roślin to kolejne osobne etapy.

## Sprawdzanie

`npm test` uruchamia również `tools/sprawdz_swiatlo.mjs`: wartości skończone,
ciągłość przy horyzoncie, zmierzch bez wiązki bezpośredniej, zaćmienie,
przełączanie A/B, pełne przesłonięcie niskiego Słońca bez skoku doświetlenia
wnętrz, zapis ustawienia/typu świata, powtarzalność generatora,
zgodność chunków z mapą/LOD, bezpieczny start i obecność stanowisk.
Wygląd i wydajność na docelowym GPU należy porównać według scenariusza wyżej.

`node tools/sprawdz_swiatlo_webgl.mjs` uruchamia prawdziwą grę w lokalnym
Chrome (`google-chrome` w PATH albo zmienna `CHROME_BIN`). Sprawdza WebGL2,
shadery w kilku trybach, lampy, dostęp do nieba pod dachem, obrazy 12 ujęć
dnia/nocy oraz 6 położeń niskiego Słońca. Porównuje też obraz zachodu
z poprawnym przesłonięciem i ze starym przeciekiem światła, przy tym samym
doświetleniu wnętrz. Nie wymaga pakietów npm. Wynik i zrzut zapisuje w
`test-results/light-lab/`. Workflow „Laboratorium światła” uruchamia oba
rodzaje testów dla pull requestów i udostępnia te pliki jako artefakt.
