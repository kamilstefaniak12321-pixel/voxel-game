# Bloki

> Ta strona jest generowana z kodu gry (`python tools/wiki.py`) - nie zmieniaj jej ręcznie, zmiany przepadną przy następnym generowaniu.

Wersja gry **0.48.1** - 178 bloków (do tego 5 odmian, których nie ma w ekwipunku, np. wieniec zawieszony na boku bloku). Czas kopania dotyczy trybu przygody; w kreatywnym bloki znikają od razu.

[Ziemia](#ziemia) · [Skały](#skały) · [Drewno](#drewno) · [Budulec](#budulec) · [Rośliny](#rośliny) · [Światło](#światło) · [Ozdoby](#ozdoby)

## Ziemia

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/grass.png" width="32" height="32" alt=""> | **Blok trawy** | `grass` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Daje:** Ziemia |
| <img src="ikony/dirt.png" width="32" height="32" alt=""> | **Ziemia** | `dirt` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Skąd:** zniszczony blok: Blok trawy<br>**Przydaje się do:** Ziemia kamienista, Czarnoziem, Ściółka leśna |
| <img src="ikony/sand.png" width="32" height="32" alt=""> | **Piasek** | `sand` | **Kopanie:** 0,55 s (łopatą 0,18 s)<br>**Przydaje się do:** Piaskowiec, Tynk wapienny |
| <img src="ikony/water.png" width="32" height="32" alt=""> | **Woda** | `water` | - |
| <img src="ikony/humus.png" width="32" height="32" alt=""> | **Czarnoziem** | `humus` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Przepis:** Czarnoziem |
| <img src="ikony/coarse_dirt.png" width="32" height="32" alt=""> | **Ziemia kamienista** | `coarse_dirt` | **Kopanie:** 0,7 s (łopatą 0,23 s)<br>**Przepis:** Ziemia kamienista x4 |
| <img src="ikony/forest_floor.png" width="32" height="32" alt=""> | **Ściółka leśna** | `forest_floor` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Przepis:** Ściółka leśna |
| <img src="ikony/mud.png" width="32" height="32" alt=""> | **Błoto** | `mud` | **Kopanie:** 0,6 s (łopatą 0,2 s) |
| <img src="ikony/clay.png" width="32" height="32" alt=""> | **Glina** | `clay` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Przydaje się do:** Tynk ochrowy, Terakota |
| <img src="ikony/gravel.png" width="32" height="32" alt=""> | **Żwir** | `gravel` | **Kopanie:** 0,7 s (łopatą 0,23 s)<br>**Przydaje się do:** Ziemia kamienista |
| <img src="ikony/snow.png" width="32" height="32" alt=""> | **Śnieg** | `snow` | **Kopanie:** 0,4 s (łopatą 0,13 s)<br>**Przepis:** Śnieg<br>**Przydaje się do:** Warstwa śniegu |
| <img src="ikony/snow_layer.png" width="32" height="32" alt=""> | **Warstwa śniegu** | `snow_layer` | **Kopanie:** 0,4 s (łopatą 0,13 s)<br>**Przepis:** Warstwa śniegu x4<br>**Przydaje się do:** Śnieg |
| <img src="ikony/moss.png" width="32" height="32" alt=""> | **Mech** | `moss` | **Kopanie:** 0,6 s (łopatą 0,2 s)<br>**Przepis:** Mech<br>**Przydaje się do:** Kępki mchu |
| <img src="ikony/blueberry_sapling.png" width="32" height="32" alt=""> | **Sadzonka borówki** | `blueberry_sapling` | **Kopanie:** od razu<br>**Rośnie:** w: Krzak borówki (kilka owoców)<br>**Skąd:** zniszczony blok: Krzak borówki (po zbiorze); zniszczony blok: Krzak borówki (kilka owoców); zniszczony blok: Krzak borówki (pełen owoców); posadzony przedmiot: Borówki |
| <img src="ikony/blueberry_bush.png" width="32" height="32" alt=""> | **Krzak borówki (po zbiorze)** | `blueberry_bush` | **Kopanie:** od razu<br>**Daje:** Sadzonka borówki<br>**Rośnie:** w: Krzak borówki (kilka owoców) |
| <img src="ikony/blueberry_bush_few.png" width="32" height="32" alt=""> | **Krzak borówki (kilka owoców)** | `blueberry_bush_few` | **Kopanie:** od razu<br>**Daje:** Sadzonka borówki<br>**Zbiór (PPM):** Borówki 1-3<br>**Rośnie:** w: Krzak borówki (pełen owoców)<br>**Skąd:** wyrasta z: Sadzonka borówki; wyrasta z: Krzak borówki (po zbiorze) |
| <img src="ikony/blueberry_bush_full.png" width="32" height="32" alt=""> | **Krzak borówki (pełen owoców)** | `blueberry_bush_full` | **Kopanie:** od razu<br>**Daje:** Sadzonka borówki<br>**Zbiór (PPM):** Borówki 3-5<br>**Skąd:** wyrasta z: Krzak borówki (kilka owoców) |

## Skały

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/stone.png" width="32" height="32" alt=""> | **Kamień** | `stone` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przydaje się do:** Polerowany kamień, Siekiera, Kilof, Łopata |
| <img src="ikony/lepidolite.png" width="32" height="32" alt=""> | **Lepidolit** | `lepidolite` | **Kopanie:** 2,5 s (kilofem 0,83 s)<br>**Przydaje się do:** Lampa |
| <img src="ikony/meteorite.png" width="32" height="32" alt=""> | **Meteoryt** | `meteorite` | **Kopanie:** 4,5 s (kilofem 1,5 s)<br>**Świeci:** 7 / 15 |
| <img src="ikony/granite.png" width="32" height="32" alt=""> | **Granit** | `granite` | **Kopanie:** 2,8 s (kilofem 0,93 s)<br>**Przydaje się do:** Siekiera, Kilof, Łopata |
| <img src="ikony/limestone.png" width="32" height="32" alt=""> | **Wapień** | `limestone` | **Kopanie:** 1,8 s (kilofem 0,6 s)<br>**Przydaje się do:** Tynk wapienny, Siekiera, Kilof, Łopata |
| <img src="ikony/sandstone.png" width="32" height="32" alt=""> | **Piaskowiec** | `sandstone` | **Kopanie:** 1,8 s (kilofem 0,6 s)<br>**Przepis:** Piaskowiec<br>**Przydaje się do:** Siekiera, Kilof, Łopata |
| <img src="ikony/slate.png" width="32" height="32" alt=""> | **Łupek** | `slate` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przydaje się do:** Siekiera, Kilof, Łopata |
| <img src="ikony/basalt.png" width="32" height="32" alt=""> | **Bazalt** | `basalt` | **Kopanie:** 2,8 s (kilofem 0,93 s)<br>**Przydaje się do:** Ciemne deski, Siekiera, Kilof, Łopata |

## Drewno

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/spruce_log.png" width="32" height="32" alt=""> | **Pień świerka** | `spruce_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień świerka<br>**Przydaje się do:** Deski świerkowe |
| <img src="ikony/spruce_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień świerka** | `spruce_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień świerka<br>**Przydaje się do:** Deski świerkowe |
| <img src="ikony/spruce_planks.png" width="32" height="32" alt=""> | **Deski świerkowe** | `spruce_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski świerkowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/pine_log.png" width="32" height="32" alt=""> | **Pień sosny** | `pine_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień sosny<br>**Skąd:** zniszczony blok: Pień sosny z żywicą<br>**Przydaje się do:** Deski sosnowe |
| <img src="ikony/pine_log_upper.png" width="32" height="32" alt=""> | **Pień sosny (górny)** | `pine_log_upper` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień sosny<br>**Przydaje się do:** Deski sosnowe |
| <img src="ikony/pine_log_resin.png" width="32" height="32" alt=""> | **Pień sosny z żywicą** | `pine_log_resin` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Daje:** Pień sosny<br>**Zbiór (PPM):** Żywica 1-2<br>**Siekierą (PPM):** Okorowany pień sosny<br>**Przydaje się do:** Deski sosnowe |
| <img src="ikony/pine_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień sosny** | `pine_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień sosny; siekierą (PPM) z bloku: Pień sosny (górny); siekierą (PPM) z bloku: Pień sosny z żywicą<br>**Przydaje się do:** Deski sosnowe |
| <img src="ikony/pine_planks.png" width="32" height="32" alt=""> | **Deski sosnowe** | `pine_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski sosnowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/beech_log.png" width="32" height="32" alt=""> | **Pień buka** | `beech_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień buka<br>**Przydaje się do:** Deski bukowe |
| <img src="ikony/beech_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień buka** | `beech_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień buka<br>**Przydaje się do:** Deski bukowe |
| <img src="ikony/beech_planks.png" width="32" height="32" alt=""> | **Deski bukowe** | `beech_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski bukowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/linden_log.png" width="32" height="32" alt=""> | **Pień lipy** | `linden_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień lipy<br>**Przydaje się do:** Deski lipowe |
| <img src="ikony/linden_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień lipy** | `linden_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień lipy<br>**Przydaje się do:** Deski lipowe |
| <img src="ikony/linden_planks.png" width="32" height="32" alt=""> | **Deski lipowe** | `linden_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski lipowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/oak_log.png" width="32" height="32" alt=""> | **Pień dębu** | `oak_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień dębu<br>**Przydaje się do:** Deski dębowe |
| <img src="ikony/oak_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień dębu** | `oak_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień dębu<br>**Przydaje się do:** Deski dębowe |
| <img src="ikony/oak_planks.png" width="32" height="32" alt=""> | **Deski dębowe** | `oak_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski dębowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/birch_log.png" width="32" height="32" alt=""> | **Pień brzozy** | `birch_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień brzozy + Kora brzozowa<br>**Przydaje się do:** Deski brzozowe |
| <img src="ikony/birch_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień brzozy** | `birch_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Skąd:** siekierą (PPM) z bloku: Pień brzozy<br>**Przydaje się do:** Deski brzozowe |
| <img src="ikony/birch_planks.png" width="32" height="32" alt=""> | **Deski brzozowe** | `birch_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Deski brzozowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/jablon_log.png" width="32" height="32" alt=""> | **Pień jabłoni** | `jablon_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień jabłoni<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Przydaje się do:** Deski jabłoniowe |
| <img src="ikony/jablon_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień jabłoni** | `jablon_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Skąd:** siekierą (PPM) z bloku: Pień jabłoni<br>**Przydaje się do:** Deski jabłoniowe |
| <img src="ikony/jablon_planks.png" width="32" height="32" alt=""> | **Deski jabłoniowe** | `jablon_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Przepis:** Deski jabłoniowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/olcha_log.png" width="32" height="32" alt=""> | **Pień olchy** | `olcha_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień olchy<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Przydaje się do:** Deski olchowe |
| <img src="ikony/olcha_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień olchy** | `olcha_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Skąd:** siekierą (PPM) z bloku: Pień olchy<br>**Przydaje się do:** Deski olchowe |
| <img src="ikony/olcha_planks.png" width="32" height="32" alt=""> | **Deski olchowe** | `olcha_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Przepis:** Deski olchowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |
| <img src="ikony/wierzba_log.png" width="32" height="32" alt=""> | **Pień wierzby** | `wierzba_log` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Siekierą (PPM):** Okorowany pień wierzby<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Przydaje się do:** Deski wierzbowe |
| <img src="ikony/wierzba_log_stripped.png" width="32" height="32" alt=""> | **Okorowany pień wierzby** | `wierzba_log_stripped` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Skąd:** siekierą (PPM) z bloku: Pień wierzby<br>**Przydaje się do:** Deski wierzbowe |
| <img src="ikony/wierzba_planks.png" width="32" height="32" alt=""> | **Deski wierzbowe** | `wierzba_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Przepis:** Deski wierzbowe x4<br>**Przydaje się do:** Ciemne deski, Patyk |

## Budulec

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/lime_plaster.png" width="32" height="32" alt=""> | **Tynk wapienny** | `lime_plaster` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przepis:** Tynk wapienny x4<br>**Przydaje się do:** Tynk ochrowy |
| <img src="ikony/ochre_plaster.png" width="32" height="32" alt=""> | **Tynk ochrowy** | `ochre_plaster` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przepis:** Tynk ochrowy x4 |
| <img src="ikony/terracotta.png" width="32" height="32" alt=""> | **Terakota** | `terracotta` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przepis:** Terakota x4 |
| <img src="ikony/polished_stone.png" width="32" height="32" alt=""> | **Polerowany kamień** | `polished_stone` | **Kopanie:** 2,2 s (kilofem 0,73 s)<br>**Przepis:** Polerowany kamień x4 |
| <img src="ikony/dark_planks.png" width="32" height="32" alt=""> | **Ciemne deski** | `dark_planks` | **Kopanie:** 2 s (siekierą 0,67 s)<br>**Przepis:** Ciemne deski x3 |

## Rośliny

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/short_grass.png" width="32" height="32" alt=""> | **Krótka trawa** | `short_grass` | **Kopanie:** od razu |
| <img src="ikony/tall_grass.png" width="32" height="32" alt=""> | **Wysoka trawa** | `tall_grass` | **Kopanie:** od razu |
| <img src="ikony/fern.png" width="32" height="32" alt=""> | **Paproć** | `fern` | **Kopanie:** od razu<br>**Przydaje się do:** Zielona lampa |
| <img src="ikony/clover.png" width="32" height="32" alt=""> | **Koniczyna** | `clover` | **Kopanie:** od razu<br>**Przydaje się do:** Zielona lampa |
| <img src="ikony/nettle.png" width="32" height="32" alt=""> | **Pokrzywa** | `nettle` | **Kopanie:** od razu<br>**Przydaje się do:** Zielona lampa |
| <img src="ikony/plantain.png" width="32" height="32" alt=""> | **Babka zwyczajna** | `plantain` | **Kopanie:** od razu |
| <img src="ikony/poppy.png" width="32" height="32" alt=""> | **Mak** | `poppy` | **Kopanie:** od razu<br>**Przydaje się do:** Czerwona lampa |
| <img src="ikony/cornflower.png" width="32" height="32" alt=""> | **Chaber** | `cornflower` | **Kopanie:** od razu<br>**Przydaje się do:** Niebieska lampa |
| <img src="ikony/chamomile.png" width="32" height="32" alt=""> | **Rumianek** | `chamomile` | **Kopanie:** od razu |
| <img src="ikony/dandelion.png" width="32" height="32" alt=""> | **Mniszek** | `dandelion` | **Kopanie:** od razu |
| <img src="ikony/moss_carpet.png" width="32" height="32" alt=""> | **Kępki mchu** | `moss_carpet` | **Kopanie:** od razu<br>**Przepis:** Kępki mchu x4<br>**Przydaje się do:** Mech |
| <img src="ikony/reed.png" width="32" height="32" alt=""> | **Trzcina** | `reed` | **Kopanie:** od razu |
| <img src="ikony/heather.png" width="32" height="32" alt=""> | **Wrzos** | `heather` | **Kopanie:** od razu<br>**Przydaje się do:** Fioletowa lampa |
| <img src="ikony/crocus.png" width="32" height="32" alt=""> | **Krokus** | `crocus` | **Kopanie:** od razu<br>**Przydaje się do:** Fioletowa lampa |
| <img src="ikony/dune_grass.png" width="32" height="32" alt=""> | **Piaskownica (trawa wydmowa)** | `dune_grass` | **Kopanie:** od razu |
| <img src="ikony/strawberry_sapling.png" width="32" height="32" alt=""> | **Sadzonka truskawki** | `strawberry_sapling` | **Kopanie:** od razu<br>**Rośnie:** w: Krzak truskawki<br>**Skąd:** zniszczony blok: Krzak truskawki; zniszczony blok: Krzak truskawki (kilka owoców); zniszczony blok: Krzak truskawki (pełen owoców); posadzony przedmiot: Truskawki |
| <img src="ikony/strawberry_bush.png" width="32" height="32" alt=""> | **Krzak truskawki** | `strawberry_bush` | **Kopanie:** od razu<br>**Daje:** Sadzonka truskawki<br>**Rośnie:** w: Krzak truskawki (kilka owoców)<br>**Skąd:** wyrasta z: Sadzonka truskawki |
| <img src="ikony/strawberry_bush_few.png" width="32" height="32" alt=""> | **Krzak truskawki (kilka owoców)** | `strawberry_bush_few` | **Kopanie:** od razu<br>**Daje:** Sadzonka truskawki<br>**Zbiór (PPM):** Truskawki 1-2<br>**Rośnie:** w: Krzak truskawki (pełen owoców)<br>**Skąd:** wyrasta z: Krzak truskawki |
| <img src="ikony/strawberry_bush_full.png" width="32" height="32" alt=""> | **Krzak truskawki (pełen owoców)** | `strawberry_bush_full` | **Kopanie:** od razu<br>**Daje:** Sadzonka truskawki<br>**Zbiór (PPM):** Truskawki 2-4<br>**Skąd:** wyrasta z: Krzak truskawki (kilka owoców) |
| <img src="ikony/blackberry_sapling.png" width="32" height="32" alt=""> | **Sadzonka jeżyny** | `blackberry_sapling` | **Kopanie:** od razu<br>**Rośnie:** w: Krzak jeżyny<br>**Skąd:** zniszczony blok: Krzak jeżyny; zniszczony blok: Krzak jeżyny (kilka owoców); zniszczony blok: Krzak jeżyny (pełen owoców); posadzony przedmiot: Jeżyny |
| <img src="ikony/blackberry_bush.png" width="32" height="32" alt=""> | **Krzak jeżyny** | `blackberry_bush` | **Kopanie:** od razu<br>**Daje:** Sadzonka jeżyny<br>**Rośnie:** w: Krzak jeżyny (kilka owoców)<br>**Skąd:** wyrasta z: Sadzonka jeżyny |
| <img src="ikony/blackberry_bush_few.png" width="32" height="32" alt=""> | **Krzak jeżyny (kilka owoców)** | `blackberry_bush_few` | **Kopanie:** od razu<br>**Daje:** Sadzonka jeżyny<br>**Zbiór (PPM):** Jeżyny 1-2<br>**Rośnie:** w: Krzak jeżyny (pełen owoców)<br>**Skąd:** wyrasta z: Krzak jeżyny |
| <img src="ikony/blackberry_bush_full.png" width="32" height="32" alt=""> | **Krzak jeżyny (pełen owoców)** | `blackberry_bush_full` | **Kopanie:** od razu<br>**Daje:** Sadzonka jeżyny<br>**Zbiór (PPM):** Jeżyny 2-4<br>**Skąd:** wyrasta z: Krzak jeżyny (kilka owoców) |
| <img src="ikony/chili_sapling.png" width="32" height="32" alt=""> | **Sadzonka papryczki chili** | `chili_sapling` | **Kopanie:** od razu<br>**Rośnie:** w: Krzak papryczki chili<br>**Skąd:** zniszczony blok: Krzak papryczki chili; zniszczony blok: Krzak papryczki chili (kilka papryczek); zniszczony blok: Krzak papryczki chili (pełen papryczek); posadzony przedmiot: Papryczki chili |
| <img src="ikony/chili_bush.png" width="32" height="32" alt=""> | **Krzak papryczki chili** | `chili_bush` | **Kopanie:** od razu<br>**Daje:** Sadzonka papryczki chili<br>**Rośnie:** w: Krzak papryczki chili (kilka papryczek)<br>**Skąd:** wyrasta z: Sadzonka papryczki chili |
| <img src="ikony/chili_bush_few.png" width="32" height="32" alt=""> | **Krzak papryczki chili (kilka papryczek)** | `chili_bush_few` | **Kopanie:** od razu<br>**Daje:** Sadzonka papryczki chili<br>**Zbiór (PPM):** Papryczki chili 1-2<br>**Rośnie:** w: Krzak papryczki chili (pełen papryczek)<br>**Skąd:** wyrasta z: Krzak papryczki chili |
| <img src="ikony/chili_bush_full.png" width="32" height="32" alt=""> | **Krzak papryczki chili (pełen papryczek)** | `chili_bush_full` | **Kopanie:** od razu<br>**Daje:** Sadzonka papryczki chili<br>**Zbiór (PPM):** Papryczki chili 2-4<br>**Skąd:** wyrasta z: Krzak papryczki chili (kilka papryczek) |
| <img src="ikony/hazel_sapling.png" width="32" height="32" alt=""> | **Sadzonka leszczyny** | `hazel_sapling` | **Kopanie:** od razu<br>**Rośnie:** w: Leszczyna<br>**Skąd:** zniszczony blok: Leszczyna; zniszczony blok: Leszczyna (kilka orzechów); zniszczony blok: Leszczyna (pełna orzechów); posadzony przedmiot: Orzech laskowy |
| <img src="ikony/hazel_bush.png" width="32" height="32" alt=""> | **Leszczyna** | `hazel_bush` | **Kopanie:** od razu<br>**Daje:** Sadzonka leszczyny<br>**Rośnie:** w: Leszczyna (kilka orzechów)<br>**Skąd:** wyrasta z: Sadzonka leszczyny |
| <img src="ikony/hazel_bush_few.png" width="32" height="32" alt=""> | **Leszczyna (kilka orzechów)** | `hazel_bush_few` | **Kopanie:** od razu<br>**Daje:** Sadzonka leszczyny<br>**Zbiór (PPM):** Orzech laskowy 1-2<br>**Rośnie:** w: Leszczyna (pełna orzechów)<br>**Skąd:** wyrasta z: Leszczyna |
| <img src="ikony/hazel_bush_full.png" width="32" height="32" alt=""> | **Leszczyna (pełna orzechów)** | `hazel_bush_full` | **Kopanie:** od razu<br>**Daje:** Sadzonka leszczyny<br>**Zbiór (PPM):** Orzech laskowy 2-3<br>**Skąd:** wyrasta z: Leszczyna (kilka orzechów) |
| <img src="ikony/spruce_leaves.png" width="32" height="32" alt=""> | **Igliwie świerka** | `spruce_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka świerka (5%), Szyszka świerka (8%)<br>**Przydaje się do:** Ściółka leśna, Wieniec świerkowy |
| <img src="ikony/spruce_sapling.png" width="32" height="32" alt=""> | **Sadzonka świerka** | `spruce_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Igliwie świerka (5%); posadzony przedmiot: Szyszka świerka |
| <img src="ikony/pine_leaves.png" width="32" height="32" alt=""> | **Igliwie sosny** | `pine_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka sosny (5%), Szyszka sosny (8%)<br>**Przydaje się do:** Ściółka leśna |
| <img src="ikony/pine_sapling.png" width="32" height="32" alt=""> | **Sadzonka sosny** | `pine_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Igliwie sosny (5%); posadzony przedmiot: Szyszka sosny |
| <img src="ikony/beech_leaves.png" width="32" height="32" alt=""> | **Liście buka** | `beech_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka buka (5%), Orzeszki bukowe (8%)<br>**Przydaje się do:** Opadłe liście buka |
| <img src="ikony/beech_sapling.png" width="32" height="32" alt=""> | **Sadzonka buka** | `beech_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Liście buka (5%); posadzony przedmiot: Orzeszki bukowe |
| <img src="ikony/linden_leaves.png" width="32" height="32" alt=""> | **Liście lipy** | `linden_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka lipy (6%)<br>**Skąd:** zniszczony blok: Kwitnące liście lipy |
| <img src="ikony/linden_leaves_flowering.png" width="32" height="32" alt=""> | **Kwitnące liście lipy** | `linden_leaves_flowering` | **Kopanie:** 0,35 s<br>**Daje:** Liście lipy<br>**Czasem wypada:** Sadzonka lipy (6%)<br>**Zbiór (PPM):** Kwiat lipy 1-2 |
| <img src="ikony/linden_sapling.png" width="32" height="32" alt=""> | **Sadzonka lipy** | `linden_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Liście lipy (6%); czasem z bloku: Kwitnące liście lipy (6%); posadzony przedmiot: Kwiat lipy |
| <img src="ikony/oak_leaves.png" width="32" height="32" alt=""> | **Liście dębu** | `oak_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka dębu (5%), Żołądź (10%)<br>**Przydaje się do:** Opadłe liście dębu |
| <img src="ikony/oak_sapling.png" width="32" height="32" alt=""> | **Sadzonka dębu** | `oak_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Liście dębu (5%); posadzony przedmiot: Żołądź |
| <img src="ikony/birch_leaves.png" width="32" height="32" alt=""> | **Liście brzozy** | `birch_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka brzozy (7%) |
| <img src="ikony/birch_sapling.png" width="32" height="32" alt=""> | **Sadzonka brzozy** | `birch_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Skąd:** czasem z bloku: Liście brzozy (7%) |
| <img src="ikony/jablon_leaves.png" width="32" height="32" alt=""> | **Liście jabłoni** | `jablon_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka jabłoni (5%), Jabłko (5%)<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Skąd:** zniszczony blok: Liście jabłoni z jabłkami; zniszczony blok: Liście jabłoni (jabłka odrastają)<br>**Przydaje się do:** Opadłe liście jabłoni |
| <img src="ikony/jablon_leaves_jablka.png" width="32" height="32" alt=""> | **Liście jabłoni z jabłkami** | `jablon_leaves_jablka` | **Kopanie:** 0,35 s<br>**Daje:** Liście jabłoni<br>**Czasem wypada:** Sadzonka jabłoni (5%), Jabłko (5%)<br>**Zbiór (PPM):** Jabłko 1-2<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Skąd:** wyrasta z: Liście jabłoni (jabłka odrastają) |
| <img src="ikony/jablon_sapling.png" width="32" height="32" alt=""> | **Sadzonka jabłoni** | `jablon_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Skąd:** czasem z bloku: Liście jabłoni (5%); czasem z bloku: Liście jabłoni z jabłkami (5%); czasem z bloku: Liście jabłoni (jabłka odrastają) (5%); posadzony przedmiot: Jabłko |
| <img src="ikony/olcha_leaves.png" width="32" height="32" alt=""> | **Liście olchy** | `olcha_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka olchy (4%), Szyszeczki olchy (6%)<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Przydaje się do:** Opadłe liście olchy |
| <img src="ikony/olcha_sapling.png" width="32" height="32" alt=""> | **Sadzonka olchy** | `olcha_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Skąd:** czasem z bloku: Liście olchy (4%); posadzony przedmiot: Szyszeczki olchy |
| <img src="ikony/wierzba_leaves.png" width="32" height="32" alt=""> | **Liście wierzby** | `wierzba_leaves` | **Kopanie:** 0,35 s<br>**Czasem wypada:** Sadzonka wierzby (4%), Bazie (6%)<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Przydaje się do:** Opadłe liście wierzby |
| <img src="ikony/wierzba_sapling.png" width="32" height="32" alt=""> | **Sadzonka wierzby** | `wierzba_sapling` | **Kopanie:** od razu<br>**Rośnie:** w drzewo, średnio po 5 min<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Skąd:** czasem z bloku: Liście wierzby (4%); posadzony przedmiot: Bazie |
| <img src="ikony/river_sedge.png" width="32" height="32" alt=""> | **Turzyca rzeczna** | `river_sedge` | **Kopanie:** od razu |
| <img src="ikony/cattail.png" width="32" height="32" alt=""> | **Pałka wodna** | `cattail` | **Kopanie:** od razu<br>**Skąd:** zniszczony blok: Pałka wodna (w wodzie) |
| <img src="ikony/purple_loosestrife.png" width="32" height="32" alt=""> | **Krwawnica pospolita** | `purple_loosestrife` | **Kopanie:** od razu |
| <img src="ikony/water_milfoil.png" width="32" height="32" alt=""> | **Wywłócznik** | `water_milfoil` | - |
| <img src="ikony/water_lily.png" width="32" height="32" alt=""> | **Grzybień biały** | `water_lily` | - |
| <img src="ikony/duckweed.png" width="32" height="32" alt=""> | **Rzęsa wodna** | `duckweed` | - |
| <img src="ikony/amarantus_etap1.png" width="32" height="32" alt=""> | **Młody amarantus** | `amarantus_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Amarantus (zawiązuje wiechy)<br>**Skąd:** zniszczony blok: Amarantus (zawiązuje wiechy); zniszczony blok: Amarantus (dojrzałe wiechy) |
| <img src="ikony/amarantus_etap2.png" width="32" height="32" alt=""> | **Amarantus (zawiązuje wiechy)** | `amarantus_etap2` | **Kopanie:** od razu<br>**Daje:** Młody amarantus<br>**Rośnie:** w: Amarantus (dojrzałe wiechy)<br>**Skąd:** wyrasta z: Młody amarantus |
| <img src="ikony/amarantus_etap3.png" width="32" height="32" alt=""> | **Amarantus (dojrzałe wiechy)** | `amarantus_etap3` | **Kopanie:** od razu<br>**Daje:** Młody amarantus<br>**Zbiór (PPM):** Wiecha amarantusa 1-3<br>**Skąd:** wyrasta z: Amarantus (zawiązuje wiechy) |
| <img src="ikony/kocanka_etap1.png" width="32" height="32" alt=""> | **Młoda kocanka** | `kocanka_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Kocanka (pąki)<br>**Skąd:** zniszczony blok: Kocanka (pąki); zniszczony blok: Kocanka (kwitnie) |
| <img src="ikony/kocanka_etap2.png" width="32" height="32" alt=""> | **Kocanka (pąki)** | `kocanka_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda kocanka<br>**Rośnie:** w: Kocanka (kwitnie)<br>**Skąd:** wyrasta z: Młoda kocanka |
| <img src="ikony/kocanka_etap3.png" width="32" height="32" alt=""> | **Kocanka (kwitnie)** | `kocanka_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda kocanka<br>**Zbiór (PPM):** Bukiet kocanki 1-2<br>**Skąd:** wyrasta z: Kocanka (pąki) |
| <img src="ikony/lawenda_etap1.png" width="32" height="32" alt=""> | **Młoda lawenda** | `lawenda_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Lawenda (pąki)<br>**Skąd:** zniszczony blok: Lawenda (pąki); zniszczony blok: Lawenda (kwitnie) |
| <img src="ikony/lawenda_etap2.png" width="32" height="32" alt=""> | **Lawenda (pąki)** | `lawenda_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda lawenda<br>**Rośnie:** w: Lawenda (kwitnie)<br>**Skąd:** wyrasta z: Młoda lawenda |
| <img src="ikony/lawenda_etap3.png" width="32" height="32" alt=""> | **Lawenda (kwitnie)** | `lawenda_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda lawenda<br>**Zbiór (PPM):** Bukiet lawendy 1-2<br>**Skąd:** wyrasta z: Lawenda (pąki) |
| <img src="ikony/piwonia_etap1.png" width="32" height="32" alt=""> | **Młoda piwonia** | `piwonia_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Piwonia (pąki)<br>**Skąd:** zniszczony blok: Piwonia (pąki); zniszczony blok: Piwonia (kwitnie) |
| <img src="ikony/piwonia_etap2.png" width="32" height="32" alt=""> | **Piwonia (pąki)** | `piwonia_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda piwonia<br>**Rośnie:** w: Piwonia (kwitnie)<br>**Skąd:** wyrasta z: Młoda piwonia |
| <img src="ikony/piwonia_etap3.png" width="32" height="32" alt=""> | **Piwonia (kwitnie)** | `piwonia_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda piwonia<br>**Zbiór (PPM):** Kwiat piwonii 1-2<br>**Skąd:** wyrasta z: Piwonia (pąki) |
| <img src="ikony/zawilec_etap1.png" width="32" height="32" alt=""> | **Młody zawilec** | `zawilec_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Zawilec (pąki)<br>**Skąd:** zniszczony blok: Zawilec (pąki); zniszczony blok: Zawilec (kwitnie) |
| <img src="ikony/zawilec_etap2.png" width="32" height="32" alt=""> | **Zawilec (pąki)** | `zawilec_etap2` | **Kopanie:** od razu<br>**Daje:** Młody zawilec<br>**Rośnie:** w: Zawilec (kwitnie)<br>**Skąd:** wyrasta z: Młody zawilec |
| <img src="ikony/zawilec_etap3.png" width="32" height="32" alt=""> | **Zawilec (kwitnie)** | `zawilec_etap3` | **Kopanie:** od razu<br>**Daje:** Młody zawilec<br>**Zbiór (PPM):** Kwiat zawilca 1-2<br>**Skąd:** wyrasta z: Zawilec (pąki) |
| <img src="ikony/dzwonek_etap1.png" width="32" height="32" alt=""> | **Młody dzwonek** | `dzwonek_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Dzwonek (pąki)<br>**Skąd:** zniszczony blok: Dzwonek (pąki); zniszczony blok: Dzwonek (kwitnie) |
| <img src="ikony/dzwonek_etap2.png" width="32" height="32" alt=""> | **Dzwonek (pąki)** | `dzwonek_etap2` | **Kopanie:** od razu<br>**Daje:** Młody dzwonek<br>**Rośnie:** w: Dzwonek (kwitnie)<br>**Skąd:** wyrasta z: Młody dzwonek |
| <img src="ikony/dzwonek_etap3.png" width="32" height="32" alt=""> | **Dzwonek (kwitnie)** | `dzwonek_etap3` | **Kopanie:** od razu<br>**Daje:** Młody dzwonek<br>**Zbiór (PPM):** Kwiat dzwonka 1-3<br>**Skąd:** wyrasta z: Dzwonek (pąki) |
| <img src="ikony/szalwia_etap1.png" width="32" height="32" alt=""> | **Młoda szałwia** | `szalwia_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Szałwia (pąki)<br>**Skąd:** zniszczony blok: Szałwia (pąki); zniszczony blok: Szałwia (kwitnie) |
| <img src="ikony/szalwia_etap2.png" width="32" height="32" alt=""> | **Szałwia (pąki)** | `szalwia_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda szałwia<br>**Rośnie:** w: Szałwia (kwitnie)<br>**Skąd:** wyrasta z: Młoda szałwia |
| <img src="ikony/szalwia_etap3.png" width="32" height="32" alt=""> | **Szałwia (kwitnie)** | `szalwia_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda szałwia<br>**Zbiór (PPM):** Liście szałwii 1-3<br>**Skąd:** wyrasta z: Szałwia (pąki) |
| <img src="ikony/nagietek_etap1.png" width="32" height="32" alt=""> | **Młody nagietek** | `nagietek_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Nagietek (pąki)<br>**Skąd:** zniszczony blok: Nagietek (pąki); zniszczony blok: Nagietek (kwitnie) |
| <img src="ikony/nagietek_etap2.png" width="32" height="32" alt=""> | **Nagietek (pąki)** | `nagietek_etap2` | **Kopanie:** od razu<br>**Daje:** Młody nagietek<br>**Rośnie:** w: Nagietek (kwitnie)<br>**Skąd:** wyrasta z: Młody nagietek |
| <img src="ikony/nagietek_etap3.png" width="32" height="32" alt=""> | **Nagietek (kwitnie)** | `nagietek_etap3` | **Kopanie:** od razu<br>**Daje:** Młody nagietek<br>**Zbiór (PPM):** Kwiat nagietka 1-3<br>**Skąd:** wyrasta z: Nagietek (pąki) |
| <img src="ikony/cynia_etap1.png" width="32" height="32" alt=""> | **Młoda cynia** | `cynia_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Cynia (pąki)<br>**Skąd:** zniszczony blok: Cynia (pąki); zniszczony blok: Cynia (kwitnie) |
| <img src="ikony/cynia_etap2.png" width="32" height="32" alt=""> | **Cynia (pąki)** | `cynia_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda cynia<br>**Rośnie:** w: Cynia (kwitnie)<br>**Skąd:** wyrasta z: Młoda cynia |
| <img src="ikony/cynia_etap3.png" width="32" height="32" alt=""> | **Cynia (kwitnie)** | `cynia_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda cynia<br>**Zbiór (PPM):** Kwiat cynii 1-2<br>**Skąd:** wyrasta z: Cynia (pąki) |
| <img src="ikony/mikolajek_etap1.png" width="32" height="32" alt=""> | **Młody mikołajek** | `mikolajek_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Mikołajek (pąki)<br>**Skąd:** zniszczony blok: Mikołajek (pąki); zniszczony blok: Mikołajek (kwitnie) |
| <img src="ikony/mikolajek_etap2.png" width="32" height="32" alt=""> | **Mikołajek (pąki)** | `mikolajek_etap2` | **Kopanie:** od razu<br>**Daje:** Młody mikołajek<br>**Rośnie:** w: Mikołajek (kwitnie)<br>**Skąd:** wyrasta z: Młody mikołajek |
| <img src="ikony/mikolajek_etap3.png" width="32" height="32" alt=""> | **Mikołajek (kwitnie)** | `mikolajek_etap3` | **Kopanie:** od razu<br>**Daje:** Młody mikołajek<br>**Zbiór (PPM):** Kwiat mikołajka 1-2<br>**Skąd:** wyrasta z: Mikołajek (pąki) |
| <img src="ikony/barwinek_etap1.png" width="32" height="32" alt=""> | **Młody barwinek** | `barwinek_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Barwinek (pąki)<br>**Skąd:** zniszczony blok: Barwinek (pąki); zniszczony blok: Barwinek (kwitnie) |
| <img src="ikony/barwinek_etap2.png" width="32" height="32" alt=""> | **Barwinek (pąki)** | `barwinek_etap2` | **Kopanie:** od razu<br>**Daje:** Młody barwinek<br>**Rośnie:** w: Barwinek (kwitnie)<br>**Skąd:** wyrasta z: Młody barwinek |
| <img src="ikony/barwinek_etap3.png" width="32" height="32" alt=""> | **Barwinek (kwitnie)** | `barwinek_etap3` | **Kopanie:** od razu<br>**Daje:** Młody barwinek<br>**Zbiór (PPM):** Kwiat barwinka 1-2<br>**Skąd:** wyrasta z: Barwinek (pąki) |
| <img src="ikony/len_etap1.png" width="32" height="32" alt=""> | **Młody len** | `len_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Len (kwitnie)<br>**Skąd:** zniszczony blok: Len (kwitnie); zniszczony blok: Len (dojrzały, suchy) |
| <img src="ikony/len_etap2.png" width="32" height="32" alt=""> | **Len (kwitnie)** | `len_etap2` | **Kopanie:** od razu<br>**Daje:** Młody len<br>**Rośnie:** w: Len (dojrzały, suchy)<br>**Skąd:** wyrasta z: Młody len |
| <img src="ikony/len_etap3.png" width="32" height="32" alt=""> | **Len (dojrzały, suchy)** | `len_etap3` | **Kopanie:** od razu<br>**Daje:** Młody len<br>**Zbiór (PPM):** Wiązka lnu 1-2<br>**Skąd:** wyrasta z: Len (kwitnie) |
| <img src="ikony/gorczyca_etap1.png" width="32" height="32" alt=""> | **Młoda gorczyca** | `gorczyca_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Gorczyca (kwitnie)<br>**Skąd:** zniszczony blok: Gorczyca (kwitnie); zniszczony blok: Gorczyca (strąki) |
| <img src="ikony/gorczyca_etap2.png" width="32" height="32" alt=""> | **Gorczyca (kwitnie)** | `gorczyca_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda gorczyca<br>**Rośnie:** w: Gorczyca (strąki)<br>**Skąd:** wyrasta z: Młoda gorczyca |
| <img src="ikony/gorczyca_etap3.png" width="32" height="32" alt=""> | **Gorczyca (strąki)** | `gorczyca_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda gorczyca<br>**Zbiór (PPM):** Nasiona gorczycy 1-3<br>**Skąd:** wyrasta z: Gorczyca (kwitnie) |
| <img src="ikony/porostoliwkowy_etap1.png" width="32" height="32" alt=""> | **Młody porost oliwkowy** | `porostoliwkowy_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Porost oliwkowy<br>**Skąd:** zniszczony blok: Porost oliwkowy; zniszczony blok: Porost oliwkowy (duża plecha) |
| <img src="ikony/porostoliwkowy_etap2.png" width="32" height="32" alt=""> | **Porost oliwkowy** | `porostoliwkowy_etap2` | **Kopanie:** od razu<br>**Daje:** Młody porost oliwkowy<br>**Rośnie:** w: Porost oliwkowy (duża plecha)<br>**Skąd:** wyrasta z: Młody porost oliwkowy |
| <img src="ikony/porostoliwkowy_etap3.png" width="32" height="32" alt=""> | **Porost oliwkowy (duża plecha)** | `porostoliwkowy_etap3` | **Kopanie:** od razu<br>**Daje:** Młody porost oliwkowy<br>**Zbiór (PPM):** Plecha porostu oliwkowego 1-2<br>**Skąd:** wyrasta z: Porost oliwkowy |
| <img src="ikony/porostiglasty_etap1.png" width="32" height="32" alt=""> | **Młody porost iglasty** | `porostiglasty_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Porost iglasty<br>**Skąd:** zniszczony blok: Porost iglasty; zniszczony blok: Porost iglasty (gęsty) |
| <img src="ikony/porostiglasty_etap2.png" width="32" height="32" alt=""> | **Porost iglasty** | `porostiglasty_etap2` | **Kopanie:** od razu<br>**Daje:** Młody porost iglasty<br>**Rośnie:** w: Porost iglasty (gęsty)<br>**Skąd:** wyrasta z: Młody porost iglasty |
| <img src="ikony/porostiglasty_etap3.png" width="32" height="32" alt=""> | **Porost iglasty (gęsty)** | `porostiglasty_etap3` | **Kopanie:** od razu<br>**Daje:** Młody porost iglasty<br>**Zbiór (PPM):** Gałązki porostu iglastego 1-2<br>**Skąd:** wyrasta z: Porost iglasty |
| <img src="ikony/ochra_etap1.png" width="32" height="32" alt=""> | **Żółta ochra (kropki)** | `ochra_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Żółta ochra<br>**Skąd:** zniszczony blok: Żółta ochra; zniszczony blok: Żółta ochra (skorupa) |
| <img src="ikony/ochra_etap2.png" width="32" height="32" alt=""> | **Żółta ochra** | `ochra_etap2` | **Kopanie:** od razu<br>**Daje:** Żółta ochra (kropki)<br>**Rośnie:** w: Żółta ochra (skorupa)<br>**Skąd:** wyrasta z: Żółta ochra (kropki) |
| <img src="ikony/ochra_etap3.png" width="32" height="32" alt=""> | **Żółta ochra (skorupa)** | `ochra_etap3` | **Kopanie:** od razu<br>**Daje:** Żółta ochra (kropki)<br>**Zbiór (PPM):** Grudka żółtej ochry 1-2<br>**Skąd:** wyrasta z: Żółta ochra |
| <img src="ikony/huba_etap1.png" width="32" height="32" alt=""> | **Młoda huba** | `huba_etap1` | **Kopanie:** od razu<br>**Rośnie:** w: Huba<br>**Skąd:** zniszczony blok: Huba; zniszczony blok: Huba (stara, piętrowa) |
| <img src="ikony/huba_etap2.png" width="32" height="32" alt=""> | **Huba** | `huba_etap2` | **Kopanie:** od razu<br>**Daje:** Młoda huba<br>**Rośnie:** w: Huba (stara, piętrowa)<br>**Skąd:** wyrasta z: Młoda huba |
| <img src="ikony/huba_etap3.png" width="32" height="32" alt=""> | **Huba (stara, piętrowa)** | `huba_etap3` | **Kopanie:** od razu<br>**Daje:** Młoda huba<br>**Zbiór (PPM):** Huba 1-2<br>**Skąd:** wyrasta z: Huba |

## Światło

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/lamp.png" width="32" height="32" alt=""> | **Lampa** | `lamp` | **Kopanie:** 0,45 s<br>**Świeci:** 15 / 15<br>**Przepis:** Lampa x2, Lampa<br>**Przydaje się do:** Czerwona lampa, Zielona lampa, Niebieska lampa, Fioletowa lampa, Czerwona lampa |
| <img src="ikony/lamp_red.png" width="32" height="32" alt=""> | **Czerwona lampa** | `lamp_red` | **Kopanie:** 0,45 s<br>**Świeci:** 15 / 15<br>**Przepis:** Czerwona lampa, Czerwona lampa |
| <img src="ikony/lamp_green.png" width="32" height="32" alt=""> | **Zielona lampa** | `lamp_green` | **Kopanie:** 0,45 s<br>**Świeci:** 15 / 15<br>**Przepis:** Zielona lampa |
| <img src="ikony/lamp_blue.png" width="32" height="32" alt=""> | **Niebieska lampa** | `lamp_blue` | **Kopanie:** 0,45 s<br>**Świeci:** 15 / 15<br>**Przepis:** Niebieska lampa<br>**Przydaje się do:** Lampa |
| <img src="ikony/lamp_purple.png" width="32" height="32" alt=""> | **Fioletowa lampa** | `lamp_purple` | **Kopanie:** 0,45 s<br>**Świeci:** 15 / 15<br>**Przepis:** Fioletowa lampa |

## Ozdoby

| | Nazwa | W komendach | Najważniejsze |
|---|---|---|---|
| <img src="ikony/spruce_wreath.png" width="32" height="32" alt=""> | **Wieniec świerkowy** | `spruce_wreath` | **Kopanie:** od razu<br>**Skąd:** zniszczony blok: Wieniec świerkowy<br>**Przepis:** Wieniec świerkowy |
| <img src="ikony/beech_leaf_litter.png" width="32" height="32" alt=""> | **Opadłe liście buka** | `beech_leaf_litter` | **Kopanie:** od razu<br>**Przepis:** Opadłe liście buka x2<br>**Przydaje się do:** Czarnoziem |
| <img src="ikony/oak_leaf_litter.png" width="32" height="32" alt=""> | **Opadłe liście dębu** | `oak_leaf_litter` | **Kopanie:** od razu<br>**Przepis:** Opadłe liście dębu x2<br>**Przydaje się do:** Czarnoziem |
| <img src="ikony/jablon_leaf_litter.png" width="32" height="32" alt=""> | **Opadłe liście jabłoni** | `jablon_leaf_litter` | **Kopanie:** od razu<br>**Paczka drzewa:** assets/drzewa/jablon<br>**Przepis:** Opadłe liście jabłoni x2<br>**Przydaje się do:** Czarnoziem |
| <img src="ikony/olcha_leaf_litter.png" width="32" height="32" alt=""> | **Opadłe liście olchy** | `olcha_leaf_litter` | **Kopanie:** od razu<br>**Paczka drzewa:** assets/drzewa/olcha<br>**Przepis:** Opadłe liście olchy x2<br>**Przydaje się do:** Czarnoziem |
| <img src="ikony/wierzba_leaf_litter.png" width="32" height="32" alt=""> | **Opadłe liście wierzby** | `wierzba_leaf_litter` | **Kopanie:** od razu<br>**Paczka drzewa:** assets/drzewa/wierzba<br>**Przepis:** Opadłe liście wierzby x2<br>**Przydaje się do:** Czarnoziem |
