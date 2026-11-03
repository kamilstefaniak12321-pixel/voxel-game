# Odbicia i materiały — 0.58.0

Pakiet rozwija zaakceptowaną podstawę 0.57.0 o E05, E06 i dostrojenie
materiałów E07. Zachowuje naturalną paletę, stałą ekspozycję oraz wspólne
wyjście HDR. Rozbudowana atmosfera E08 będzie osobnym etapem.

## Porównanie w grze

W **Obraz → Zaawansowane** są ustawienia „Światło materiałów”, „Odbicia
otoczenia” i „Przeświecanie liści”. Podstawowe światło materiałów wyłącza
nowe dodatki przy zachowaniu palety i cieni 0.57.0. Tryb ziemniaka również
je wyłącza. Telefon domyślnie pozostaje przy podstawowym profilu, dopóki
nie wykonamy pomiaru na urządzeniu.

Standardowy profil zbiera 14 kierunków otoczenia; dokładny 26. Zasięg
pojedynczego odbicia jest identyczny, więc wyższy profil poprawia
próbkowanie zamiast zmieniać reguły jasności. Dla diagnostyki dostępne
są `/ustaw bounceStrength 18`, `/ustaw bounceSaturation 65` oraz
`/ustaw materialSpecular wyl`. Siła i nasycenie to procenty 0–100.

`/swiatlo widok transmission` pokazuje wyłącznie przeświecanie,
`/swiatlo widok specular` refleksy, a istniejący widok `bounce` odbicia.
Odpowiadające maski `/swiatlo zrodlo … wl|wyl` nie zmieniają innych
składników. `/swiatlo reset` przywraca pełny obraz.

## Jedno odbicie od otoczenia

Sonda w powietrzu sprawdza pierwszą widoczną powierzchnię w promieniu
6 bloków. Jej barwa pochodzi z liniowych pikseli atlasu, właściwej
strony bloku i tintu biomu. Ziemia na boku bloku trawy zachowuje brąz;
zielony tint dotyczy zielonych pikseli. ID bloków nie są obcinane do
8 bitów, dzięki czemu paczki z numerami powyżej 255 działają poprawnie.

Wokół kamery jest ograniczona siatka sond. Współdzielony cache
powierzchni przechowuje ich materiał i zasłonięcie źródeł. Osobne
transfery słońca, księżyca, nieba i dolnej półkuli są spakowane w jedną
teksturę 3D. Shader mnoży je przez bieżącą energię źródeł; zmiana
palety ani wyłączenie słońca nie wymagają przebudowy geometrii.

Wynik odbicia nigdy nie zasila następnego odbicia. Wagi próbek i
reflektancja są ograniczone, a nasycenie dotyczy materiału odbijającego,
zachowując kolor samego źródła. Odbicie przechodzi przez lokalne AO
odbiornika; własna emisja pozostaje osobna.

Promienie nie przenikają przez zamknięte ściany ani szczeliny na
przekątnej siatki. Nieznany chunk jest traktowany konserwatywnie jako
przeszkoda. Widoczność źródła jest sprawdzana do 96 bloków; przy niskim
słońcu niewczytany teren może konserwatywnie wyłączyć jego odbicie.
Edycje bloków unieważniają lokalne próbki oraz widoczność
źródeł. Dane odbicia są odtwarzane ze świata po wczytaniu, zamiast
zapisywania potencjalnie nieaktualnego cache.

To przybliżenie lokalne: nie symuluje odbić od lamp i ogniska, wielu
odbić ani globalnego transportu z odległych obszarów. Daleki teren
zachowuje wspólne światło słońca i nieba, a lokalny dodatek zanika
łagodnie przy brzegu siatki. Przedmioty i widoczne ogniska próbkują
odbicie w swoich pozycjach.

## Liście, gałęzie, owoce i bryły

Każda ściana modelu ma profil powierzchni i stopień cienkości.
Dwa bajty na wierzchołek wystarczają do rozróżnienia liścia, gałęzi,
kory, drewna, owocu, kamienia i emitera. Nie powstają dodatkowe
grupy rysowania, tekstury ani mapy cieni. Te same dane trafiają do
krzaka oraz owocu/przedmiotu w dłoni.

Liść otrzymuje niewielki ciepłozielony składnik przy patrzeniu pod
światło. Wykorzystuje już policzoną widoczność źródła, więc zasłonięte
lub zgaszone źródło go nie wytwarza. To dwustronne, izotropowe
przybliżenie cienkiego liścia: zależy od kierunku kamery i światła,
bez dodatkowego kąta normalnej. Istniejące kępki mają celowo
wygładzone normalne; użycie ich dla transmisji powodowałoby skok
jasności po zmianie widocznej strony.

Centralne karty krzaków przepuszczają mniej światła niż zewnętrzne,
a pełne kostki liści mniej niż cienkie wycięcia. Kora, gałęzie,
drewno i kamień pozostają matowe. Owoce dostają mały, szeroki
refleks kierunkowego źródła. Emisja żaru i płomienia jest niezależna.
Mieszane sprite’y bez osobnych masek materiału pozostają matowe;
kolor zielony sam w sobie nie jest dowodem, że piksel to liść.

## Odbiór

Scena `/scena materialy` zawiera sześć podłoży, białe i szare
odbiorniki, identyczne krzewy, dwa pokoje rozdzielone na granicy
chunków oraz płaskie i przestrzenne liście. Można otwierać dach,
usuwać przegrodę, zmieniać podłoże i odtwarzać zapis.

Procedura i zapis pomiarów są w
[`pomiary/materialy-0.58.0/`](pomiary/materialy-0.58.0/).
Porównanie OFF/ON używa tej samej palety, HDR, kamery i cieni;
mierzy koszt nowych efektów oddzielnie od przebudowy renderera 0.57.0.
