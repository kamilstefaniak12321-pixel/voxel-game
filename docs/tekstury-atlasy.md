# Arkusze tekstur — od 0.80.0

Wszystkie źródłowe grafiki PNG gry leżą w **`assets/textures/`**.
Zamiast 243 rozproszonych plików jest dziewięć arkuszy tematycznych.
Przeniesienie zachowuje wygląd: 363 nazwane tekstury świata mają te same
piksele oraz współrzędne UV co w 0.79.0. Grafiki w dokumentacji i eksportowane
paczki dla graczy są wynikami pracy narzędzi, a nie drugim źródłem tekstur.

| Plik | Zawartość |
|---|---|
| `drzewa.png` | Wszystkie gatunki: kora, słoje, deski, liście, sadzonki i ich modele, owoce/dodatki drzew, opał |
| `teren.png` | Ziemia, skały, piasek, woda, budulec i powierzchnie bloków |
| `rosliny.png` | Trawy, kwiaty, roślinność rzeczna, krzaki i elementy modeli roślin |
| `przedmioty.png` | Narzędzia, przedmioty i barwniki |
| `efekty.png` | Pełne animacje pochodni, tekstura płomieni ogniska i pęknięcia bloków |
| `niebo.png` | Księżyc |
| `gracz.png` | Domyślna skórka i szablon postaci |
| `interfejs.png` | Tła, deski i ramy wszystkich motywów GUI |
| `podglady.png` | Duże ikonki modeli borówki oraz podglądy ustawień roślin |

`atlas.json` opisuje nazwę, arkusz, położenie i rozmiar każdego regionu.
Współrzędne są w pikselach, od lewego górnego rogu. Nazwy tekstur pozostają
stałe, także starsze nazwy w paczkach użytkowników. Zmiana organizacji
plików nie zmienia numerów bloków, zapisów ani własnych skórek gracza.

## Edycja

Można otworzyć odpowiedni PNG bezpośrednio w edytorze pikselowym i zmienić
wybrany region. Nie przesuwaj innych regionów ani nie zmieniaj rozmiaru
arkusza bez aktualizacji `atlas.json`. Zachowaj przezroczystość i siatkę
16 pikseli na blok; klatki animacji pozostają w swoim dotychczasowym układzie.

Pomocnicze polecenia (Python z Pillow):

```text
python tools/atlasy.py list drzewa
python tools/atlasy.py export oak_planks podglad-desek.png
python tools/atlasy.py replace oak_planks poprawione-deski.png
python tools/atlasy.py check
```

`export` tworzy roboczy wycinek, a `replace` wkleja poprawiony obrazek
do jego istniejącego miejsca. Wymiary muszą się zgadzać. Po samej edycji
PNG wystarczy ponownie uruchomić grę. Po zmianie układu manifestu wykonaj
`python tools/atlasy.py sync`, aby odświeżyć dane w kodzie.

## Drzewa

Osobny mechanizm paczek drzew został usunięty. Wszystkie gatunki
opisuje jeden katalog `src/blocks/treeCatalog.js`: nazwy, tekstury,
numery bloków, wzrost, owoce, występowanie i szablony sylwetek.
Modele proceduralne korzystają z `TreeShapes.js`. Drzewa, komendy lasów
i galerii, sadzonki, przepisy oraz odrastanie owoców działają jak wcześniej.
Dodawanie gatunku wymaga świadomego wpisu w katalogu i wolnych numerów
bloków; przypadkowy folder nie jest już automatycznie ładowany jako drzewo.

## Wczytywanie i sprawdzenie

Gra wczytuje potrzebny arkusz raz. Tekstury świata składa do tego samego
wspólnego atlasu GPU; nie dochodzą nowe materiały ani wywołania rysowania.
Animacje, skórka i powtarzane ramy GUI otrzymują wycinki o poprzednich
rozmiarach, dzięki czemu nie pobierają pikseli sąsiedniej grafiki.

`node tools/sprawdz_atlasy_tekstur.mjs` porównuje każdy kafelek z wzorcem
0.79.0 oraz sprawdza granice regionów. Gdy później celowo zmienisz wygląd,
zaktualizuj odpowiedni wzorzec po sprawdzeniu efektu w grze. Test ma wykrywać
niezamierzone podmiany, a nie blokować świadomą zmianę grafiki.

`python tools/paczka_tekstur.py` nadal eksportuje zgodny szablon paczek
użytkownika. `python tools/wiki.py` czyta te same arkusze co gra.
