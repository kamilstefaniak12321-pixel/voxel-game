# Krzaczki owocowe i owoce 3D

Modele z `src/rendering/FruitBushGeometry.js` rozwijają styl borówki
Kamila: warstwy pikselowych liści z prześwitami oraz bryłki owoców.
Wykorzystują istniejącą teksturę liści borówki. Poszczególne gatunki
mają własny pokrój i odcień, a owoce są budowane z kostek 1/16 bloku.
Nie powstaje osobny obiekt ani materiał dla każdego krzaka.

| Gatunek | Pokrój | Pełne owocowanie | Owoc |
| --- | --- | ---: | --- |
| Truskawka | Niska, szeroka rozeta; wysokość 7/16 bloku | 5 | Czerwony, zwężony na dole, z jasnymi pestkami i zielonym kielichem |
| Jeżyna | Ciemniejszy, wysoki krzak z luźną koroną; 15/16 bloku | 7 | Nierówna ciemnofioletowa kiść z wypukłymi segmentami |
| Chili | Smukła roślina z widoczną łodygą i rzadszą koroną; 14/16 bloku | 5 | Podłużna czerwona papryczka z zakrzywionym końcem i zielonym ogonkiem |
| Leszczyna | Gęstsza, ciepłozielona korona i zdrewniała łodyga; 1 blok | 6 | Brązowy orzech z jaśniejszą łupiną i zieloną okrywą |

W etapie częściowego plonu widoczne są dwa z tych samych owoców,
które później pozostają przy pełnym owocowaniu. Dorosłe liście nie
zmieniają położenia po zbiorze ani przy dojrzewaniu. Sadzonka używa
tej samej zakorzenionej geometrii, odpowiednio pomniejszonej.
Szerokość koron wraz z losowym przesunięciem mieści się w jednej komórce.

`getFruitItemModel()` zwraca dokładnie tę samą geometrię, której używa
owoc na krzaku; widok ekwipunku wybiera jedynie kamerę i skalę prezentacji.
Dotyczy to również borówki: jej przedmiot pochodzi z pierwszej kostki
owocu w oryginalnym modelu, z niezmienionymi UV. Każdy owoc złożony
z kilku kostek ma wspólny środek animacji, więc nie rozpada się podczas
zbioru, odrastania ani kołysania na wietrze.

Modele są buforowane na gatunek i etap. Pełne krzaki mają odpowiednio
235, 309, 171 i 328 czworokątów; wewnętrzne ściany owoców są pomijane.
To warstwa wyglądu: numery bloków, ilości plonu oraz biologiczne tempo
wzrostu pozostają w rejestrze gry.

Zasady ruchu: [docs/animacje-roslin.md](../../../docs/animacje-roslin.md).
