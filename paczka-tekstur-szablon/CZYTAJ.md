# Paczka tekstur - szablon (Voxel Game 0.34.0)

Oryginalne tekstury gry, każda w osobnym pliku. Zrób z nich własną paczkę:

1. Skopiuj ten folder i zmień nazwę (np. `moja-paczka`).
2. W `paczka.json` wpisz nazwę paczki, autora i opis.
3. Podmień obrazki w `bloki/` (i, jeśli chcesz, `pekniecia.png`
   i `niebo/ksiezyc.png`). **Rozdzielczość dowolna**, np. 64 x 64,
   512 x 512 albo 1254 x 1254 - najlepiej taka sama dla wszystkich.
   Obrazek ma być kwadratowy (z wyższego gra bierze kwadrat z góry).
   Przezroczystość działa jak w oryginałach: liście, rośliny,
   sadzonki, owoce i narzędzia mają przezroczyste tło.
4. Tekstur, których nie zmieniasz, możesz nie dawać - zostaną oryginalne.
5. Spakuj **zawartość** folderu (albo cały folder) do pliku `.zip`.
6. W grze: **Ustawienia → Tekstury → Wczytaj paczkę (.zip)**
   (na telefonie: wybierz plik z pamięci telefonu). Gra uruchomi się
   ponownie z nowymi teksturami.

**Rozdzielczość w grze** (Ustawienia → Tekstury → Rozdzielczość):
automatyczna - taka jak paczki, najwyżej 512 x 512 na komputerze
i 256 x 256 na telefonie (większe zajmowałyby za dużo pamięci karty
graficznej). Można też wybrać mniej (np. 64) - gra działa szybciej.

Pliki:
- `paczka.json` - nazwa, autor, opis (niekonieczny),
- `bloki/<nazwa>.png` - tekstury bloków, roślin i przedmiotów
  (tabela niżej; `bloki/<drzewo>/...` - drzewa z paczek drzew),
- `pekniecia.png` - pęknięcia kopanego bloku: 10 etapów obok siebie
  (szerokość = 10 x wysokość), szary 128 nic nie zmienia, ciemniejszy
  przyciemnia blok, jaśniejszy rozjaśnia,
- `niebo/ksiezyc.png` - tarcza księżyca (poza tarczą przezroczysta).

Więcej: `docs/paczki-tekstur.md` w repozytorium gry, `/tekstury`
w grze (`/tekstury lista` - czego brakuje w paczce).

| plik | co go używa |
|---|---|
| `bloki/acorn.png` | Żołądź |
| `bloki/axe.png` | Siekiera |
| `bloki/basalt_side.png` | Bazalt |
| `bloki/basalt_top.png` | Bazalt |
| `bloki/beech_leaf_litter.png` | Opadłe liście buka |
| `bloki/beech_leaves.png` | Liście buka |
| `bloki/beech_log_side.png` | Pień buka |
| `bloki/beech_log_top.png` | Pień buka |
| `bloki/beech_planks.png` | Deski bukowe |
| `bloki/beech_sapling.png` | Sadzonka buka |
| `bloki/beech_stripped_side.png` | Okorowany pień buka |
| `bloki/beech_stripped_top.png` | Okorowany pień buka |
| `bloki/beechnuts.png` | Orzeszki bukowe |
| `bloki/birch_bark.png` | Kora brzozowa |
| `bloki/birch_leaves.png` | Liście brzozy |
| `bloki/birch_log_side.png` | Pień brzozy |
| `bloki/birch_log_top.png` | Pień brzozy |
| `bloki/birch_planks.png` | Deski brzozowe |
| `bloki/birch_sapling.png` | Sadzonka brzozy |
| `bloki/birch_stripped_side.png` | Okorowany pień brzozy |
| `bloki/birch_stripped_top.png` | Okorowany pień brzozy |
| `bloki/blackberry.png` | Jeżyny |
| `bloki/blackberry_bush_few.png` | Krzak jeżyny (kilka owoców) |
| `bloki/blackberry_bush_full.png` | Krzak jeżyny (pełen owoców) |
| `bloki/blueberry.png` | Borówki |
| `bloki/blueberry_bush.png` | Krzak borówki |
| `bloki/blueberry_bush_few.png` | Krzak borówki (kilka owoców) |
| `bloki/blueberry_bush_full.png` | Krzak borówki (pełen owoców) |
| `bloki/bush_leaves.png` | Krzak truskawki, Krzak jeżyny, Krzak papryczki chili, Leszczyna |
| `bloki/bush_sapling.png` | Sadzonka truskawki, Sadzonka jeżyny, Sadzonka papryczki chili, Sadzonka leszczyny, Sadzonka borówki |
| `bloki/chamomile.png` | Rumianek |
| `bloki/chili_bush_few.png` | Krzak papryczki chili (kilka papryczek) |
| `bloki/chili_bush_full.png` | Krzak papryczki chili (pełen papryczek) |
| `bloki/chili_pepper.png` | Papryczki chili |
| `bloki/clay.png` | Glina |
| `bloki/clover.png` | Koniczyna, Grzybień biały, Rzęsa wodna |
| `bloki/coarse_dirt.png` | Ziemia kamienista |
| `bloki/cornflower.png` | Chaber, Krwawnica pospolita |
| `bloki/crocus.png` | Krokus |
| `bloki/dandelion.png` | Mniszek |
| `bloki/dark_planks.png` | Ciemne deski |
| `bloki/dirt.png` | Ziemia |
| `bloki/dune_grass.png` | Piaskownica (trawa wydmowa) |
| `bloki/fern.png` | Paproć, Wywłócznik |
| `bloki/forest_floor_side.png` | Ściółka leśna |
| `bloki/forest_floor_top.png` | Ściółka leśna |
| `bloki/granite.png` | Granit |
| `bloki/grass_side.png` | Blok trawy |
| `bloki/grass_top.png` | Blok trawy |
| `bloki/gravel.png` | Żwir |
| `bloki/hazel_bush_few.png` | Leszczyna (kilka orzechów) |
| `bloki/hazel_bush_full.png` | Leszczyna (pełna orzechów) |
| `bloki/hazelnut.png` | Orzech laskowy |
| `bloki/heather.png` | Wrzos |
| `bloki/humus.png` | Czarnoziem |
| `bloki/jablon/deski.png` | Deski jabłoniowe |
| `bloki/jablon/jablko.png` | Jabłko |
| `bloki/jablon/liscie.png` | Liście jabłoni, Liście jabłoni (jabłka odrastają) |
| `bloki/jablon/liscie_jablka.png` | Liście jabłoni z jabłkami |
| `bloki/jablon/okorowany_bok.png` | Okorowany pień jabłoni |
| `bloki/jablon/okorowany_gora.png` | Okorowany pień jabłoni |
| `bloki/jablon/opadle_liscie.png` | Opadłe liście jabłoni |
| `bloki/jablon/pien_bok.png` | Pień jabłoni |
| `bloki/jablon/pien_gora.png` | Pień jabłoni |
| `bloki/jablon/sadzonka.png` | Sadzonka jabłoni |
| `bloki/lamp.png` | Lampa |
| `bloki/lamp_blue.png` | Niebieska lampa |
| `bloki/lamp_green.png` | Zielona lampa |
| `bloki/lamp_purple.png` | Fioletowa lampa |
| `bloki/lamp_red.png` | Czerwona lampa |
| `bloki/lepidolite.png` | Lepidolit |
| `bloki/lime_plaster.png` | Tynk wapienny |
| `bloki/limestone.png` | Wapień |
| `bloki/linden_flower.png` | Kwiat lipy |
| `bloki/linden_leaves.png` | Liście lipy |
| `bloki/linden_leaves_flowering.png` | Kwitnące liście lipy |
| `bloki/linden_log_side.png` | Pień lipy |
| `bloki/linden_log_top.png` | Pień lipy |
| `bloki/linden_planks.png` | Deski lipowe |
| `bloki/linden_sapling.png` | Sadzonka lipy |
| `bloki/linden_stripped_side.png` | Okorowany pień lipy |
| `bloki/linden_stripped_top.png` | Okorowany pień lipy |
| `bloki/meteorite.png` | Meteoryt |
| `bloki/moss_carpet.png` | Kępki mchu |
| `bloki/moss_side.png` | Mech |
| `bloki/moss_top.png` | Mech |
| `bloki/mud.png` | Błoto |
| `bloki/nettle.png` | Pokrzywa |
| `bloki/oak_leaf_litter.png` | Opadłe liście dębu |
| `bloki/oak_leaves.png` | Liście dębu |
| `bloki/oak_log_side.png` | Pień dębu |
| `bloki/oak_log_top.png` | Pień dębu |
| `bloki/oak_planks.png` | Deski dębowe |
| `bloki/oak_sapling.png` | Sadzonka dębu |
| `bloki/oak_stripped_side.png` | Okorowany pień dębu |
| `bloki/oak_stripped_top.png` | Okorowany pień dębu |
| `bloki/ochre_plaster.png` | Tynk ochrowy |
| `bloki/olcha/deski.png` | Deski olchowe |
| `bloki/olcha/liscie.png` | Liście olchy |
| `bloki/olcha/okorowany_bok.png` | Okorowany pień olchy |
| `bloki/olcha/okorowany_gora.png` | Okorowany pień olchy |
| `bloki/olcha/opadle_liscie.png` | Opadłe liście olchy |
| `bloki/olcha/pien_bok.png` | Pień olchy |
| `bloki/olcha/pien_gora.png` | Pień olchy |
| `bloki/olcha/sadzonka.png` | Sadzonka olchy |
| `bloki/olcha/szyszki.png` | Szyszeczki olchy |
| `bloki/pickaxe.png` | Kilof |
| `bloki/pine_cone.png` | Szyszka sosny |
| `bloki/pine_leaves.png` | Igliwie sosny |
| `bloki/pine_log_resin_side.png` | Pień sosny z żywicą |
| `bloki/pine_log_side.png` | Pień sosny |
| `bloki/pine_log_top.png` | Pień sosny, Pień sosny (górny), Pień sosny z żywicą |
| `bloki/pine_log_upper_side.png` | Pień sosny (górny) |
| `bloki/pine_planks.png` | Deski sosnowe |
| `bloki/pine_sapling.png` | Sadzonka sosny |
| `bloki/pine_stripped_side.png` | Okorowany pień sosny |
| `bloki/pine_stripped_top.png` | Okorowany pień sosny |
| `bloki/plantain.png` | Babka zwyczajna |
| `bloki/polished_stone.png` | Polerowany kamień |
| `bloki/poppy.png` | Mak |
| `bloki/reed.png` | Trzcina, Turzyca rzeczna, Pałka wodna, Pałka wodna (w wodzie) |
| `bloki/resin.png` | Żywica |
| `bloki/rosliny/amarantus/wiecha.png` | Wiecha amarantusa |
| `bloki/rosliny/kocanka/bukiet.png` | Bukiet kocanki |
| `bloki/rosliny/lawenda/bukiet.png` | Bukiet lawendy |
| `bloki/rosliny/piwonia/kwiat.png` | Kwiat piwonii |
| `bloki/rosliny/zawilec/kwiat.png` | Kwiat zawilca |
| `bloki/sand.png` | Piasek |
| `bloki/sandstone_side.png` | Piaskowiec |
| `bloki/sandstone_top.png` | Piaskowiec |
| `bloki/short_grass.png` | Krótka trawa |
| `bloki/shovel.png` | Łopata |
| `bloki/slate_side.png` | Łupek |
| `bloki/slate_top.png` | Łupek |
| `bloki/snow.png` | Śnieg, Warstwa śniegu |
| `bloki/spruce_cone.png` | Szyszka świerka |
| `bloki/spruce_leaves.png` | Igliwie świerka |
| `bloki/spruce_log_side.png` | Pień świerka |
| `bloki/spruce_log_top.png` | Pień świerka |
| `bloki/spruce_planks.png` | Deski świerkowe |
| `bloki/spruce_sapling.png` | Sadzonka świerka |
| `bloki/spruce_stripped_side.png` | Okorowany pień świerka |
| `bloki/spruce_stripped_top.png` | Okorowany pień świerka |
| `bloki/spruce_wreath.png` | Wieniec świerkowy |
| `bloki/stick.png` | Patyk |
| `bloki/stone.png` | Kamień |
| `bloki/strawberry.png` | Truskawki |
| `bloki/strawberry_bush_few.png` | Krzak truskawki (kilka owoców) |
| `bloki/strawberry_bush_full.png` | Krzak truskawki (pełen owoców) |
| `bloki/tall_grass.png` | Wysoka trawa |
| `bloki/terracotta.png` | Terakota |
| `bloki/water.png` | Woda |
| `bloki/wierzba/bazie.png` | Bazie |
| `bloki/wierzba/deski.png` | Deski wierzbowe |
| `bloki/wierzba/liscie.png` | Liście wierzby |
| `bloki/wierzba/okorowany_bok.png` | Okorowany pień wierzby |
| `bloki/wierzba/okorowany_gora.png` | Okorowany pień wierzby |
| `bloki/wierzba/opadle_liscie.png` | Opadłe liście wierzby |
| `bloki/wierzba/pien_bok.png` | Pień wierzby |
| `bloki/wierzba/pien_gora.png` | Pień wierzby |
| `bloki/wierzba/sadzonka.png` | Sadzonka wierzby |
