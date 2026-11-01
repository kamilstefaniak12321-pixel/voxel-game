# Krzaki owocowe i owoce 3D — 0.50.0

Truskawka, jeżyna, chili i leszczyna korzystają z puszystych, wycinanych
liści borówki oraz owoców z bryłek o siatce 1/16 bloku. To podmiana
wyglądu istniejących roślin, także w zapisanych światach; nie wymaga
ponownego generowania terenu. ID bloków, czas wzrostu i plony zostają
takie jak w 0.49.0.

| Roślina | Sylwetka | Owoce na pełnym modelu |
| --- | --- | --- |
| Truskawka | Niska, szeroka, jasna rozeta | 5 czerwonych owoców z zielonymi szypułkami i pestkami |
| Jeżyna | Wyższy, ciemniejszy, luźny krzew | 7 ciemnych, ziarnistych owoców |
| Chili | Wąska korona nad widoczną łodygą | 5 wydłużonych, zagiętych papryczek |
| Leszczyna | Najwyższy, gęstszy krzew z brązowym pędem | 6 brązowych orzechów w zielonych okrywach |

Każdy gatunek ma cztery dotychczasowe etapy. Młoda roślina płynnie
powiększa się; owoce wyrastają wokół własnych środków. Posadzenie,
zbiór, pełny ekwipunek i usunięcie używają krótkich reakcji w kierunku
borówki. Wspólny limit 12 aktywnych animacji obejmuje również borówkę
i rośliny z paczek. Nieruchome krzaki pozostają w siatkach chunków.

Owoce w ekwipunku to podglądy tych samych modeli 3D, które rosną na
krzakach. W dłoni również są bryłami. Dotyczy to wszystkich pięciu
gatunków, także borówki: jej owoc pochodzi bezpośrednio z oryginalnego
modelu i zachowuje jego UV. Ikony są liczone raz i przechowywane w
pamięci, bez osobnego kontekstu WebGL dla każdego przedmiotu.

Geometria: `src/rendering/FruitBushGeometry.js`; zasady animacji:
[animacje-roslin.md](animacje-roslin.md). Sprawdzenia regresji:
`tools/sprawdz_krzaki_owocowe.mjs` (w pełnym `npm test`).
