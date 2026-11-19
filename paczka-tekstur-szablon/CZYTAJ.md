# Paczka tekstur - szablon (Various Roots 1.27.0)

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
- `pekniecia.png` - pęknięcia kopanego bloku: 8 etapów w siatce 4 x 2
  (pierwszy z lewej u góry); szare, półprzezroczyste piksele
  przyciemniają blok - im mniej przezroczyste, tym mocniej. Stary pasek
  10 etapów (szerokość = 10 x wysokość) nadal działa po staremu,
- `pekniecia_wysokie.png` - to samo dla drzwi (dwa bloki wysokości):
  klatki dwa razy wyższe niż szersze,
- `niebo/ksiezyc.png` - tarcza księżyca (poza tarczą przezroczysta).

Więcej: `docs/paczki-tekstur.md` w repozytorium gry, `/tekstury`
w grze (`/tekstury lista` - czego brakuje w paczce).

| plik | co go używa |
|---|---|
| `bloki/acacia/leaves.png` | Liście akacji |
| `bloki/acacia/leaves_variant.png` | Kwitnące liście akacji |
| `bloki/acacia/log_side.png` | Pień akacji |
| `bloki/acacia/log_top.png` | Pień akacji |
| `bloki/acacia/planks.png` | Schody z akacji, Półblok z akacji, Furtka z akacji, Stół stolarski z akacji, Łóżko z akacji (pościelone), Łóżko z akacji (stelaż), Deski akacji |
| `bloki/acacia/sapling.png` | Sadzonka akacji |
| `bloki/acacia/stripped_side.png` | Okorowany pień akacji |
| `bloki/acacia/stripped_top.png` | Okorowany pień akacji |
| `bloki/acacia_bark.png` | Kora akacji |
| `bloki/acorn.png` | Żołądź |
| `bloki/araucaria/leaves.png` | Igliwie araukarii, Igliwie araukarii (szyszki odrastają) |
| `bloki/araucaria/leaves_variant.png` | Igliwie araukarii z szyszkami |
| `bloki/araucaria/log_side.png` | Pień araukarii |
| `bloki/araucaria/log_top.png` | Pień araukarii |
| `bloki/araucaria/nuts.png` | Orzeszki araukarii |
| `bloki/araucaria/planks.png` | Schody araukariowe, Półblok araukariowy, Furtka araukariowa, Stół stolarski araukariowy, Łóżko araukariowe (pościelone), Łóżko araukariowe (stelaż), Deski araukariowe |
| `bloki/araucaria/sapling.png` | Sadzonka araukarii |
| `bloki/araucaria/stripped_side.png` | Okorowany pień araukarii |
| `bloki/araucaria/stripped_top.png` | Okorowany pień araukarii |
| `bloki/araucaria_bark.png` | Kora araukarii |
| `bloki/aspen/leaf_litter.png` | Opadłe liście osiki |
| `bloki/aspen/leaves.png` | Liście osiki |
| `bloki/aspen/leaves_variant.png` | Złote liście osiki |
| `bloki/aspen/log_side.png` | Pień osiki |
| `bloki/aspen/log_side_base.png` | Pień osiki (przy ziemi) |
| `bloki/aspen/log_top.png` | Pień osiki, Pień osiki (przy ziemi) |
| `bloki/aspen/planks.png` | Schody osikowe, Półblok osikowy, Furtka osikowa, Stół stolarski osikowy, Łóżko osikowe (pościelone), Łóżko osikowe (stelaż), Deski osikowe |
| `bloki/aspen/sapling.png` | Sadzonka osiki |
| `bloki/aspen/stripped_side.png` | Okorowany pień osiki |
| `bloki/aspen/stripped_top.png` | Okorowany pień osiki |
| `bloki/aspen_bark.png` | Kora osiki |
| `bloki/axe.png` | Siekiera |
| `bloki/axe_basalt.png` | Siekiera bazaltowa |
| `bloki/axe_granite.png` | Siekiera granitowa |
| `bloki/axe_limestone.png` | Siekiera wapienna |
| `bloki/axe_sandstone.png` | Siekiera piaskowcowa |
| `bloki/axe_slate.png` | Siekiera łupkowa |
| `bloki/bald_cypress/leaves.png` | Igliwie cypryśnika |
| `bloki/bald_cypress/leaves_variant.png` | Jesienne igliwie cypryśnika |
| `bloki/bald_cypress/log_side.png` | Pień cypryśnika |
| `bloki/bald_cypress/log_top.png` | Pień cypryśnika |
| `bloki/bald_cypress/planks.png` | Schody z cypryśnika, Półblok z cypryśnika, Furtka z cypryśnika, Stół stolarski z cypryśnika, Łóżko z cypryśnika (pościelone), Łóżko z cypryśnika (stelaż), Deski cypryśnika |
| `bloki/bald_cypress/sapling.png` | Sadzonka cypryśnika |
| `bloki/bald_cypress/stripped_side.png` | Okorowany pień cypryśnika |
| `bloki/bald_cypress/stripped_top.png` | Okorowany pień cypryśnika |
| `bloki/bald_cypress_bark.png` | Kora cypryśnika |
| `bloki/banyan/fig.png` | Figa |
| `bloki/banyan/leaf_litter.png` | Opadłe liście figowca |
| `bloki/banyan/leaves.png` | Liście figowca, Liście figowca (figi odrastają) |
| `bloki/banyan/leaves_variant.png` | Liście figowca z figami |
| `bloki/banyan/log_side.png` | Pień figowca |
| `bloki/banyan/log_top.png` | Pień figowca |
| `bloki/banyan/planks.png` | Schody figowcowe, Półblok figowcowy, Furtka figowcowa, Stół stolarski figowcowy, Łóżko figowcowe (pościelone), Łóżko figowcowe (stelaż), Deski figowcowe |
| `bloki/banyan/roots.png` | Korzenie powietrzne figowca |
| `bloki/banyan/sapling.png` | Sadzonka figowca |
| `bloki/banyan/stripped_side.png` | Okorowany pień figowca |
| `bloki/banyan/stripped_top.png` | Okorowany pień figowca |
| `bloki/banyan_bark.png` | Kora figowca |
| `bloki/baobab/fruit.png` | Owoc baobabu |
| `bloki/baobab/leaf_litter.png` | Opadłe liście baobabu |
| `bloki/baobab/leaves.png` | Liście baobabu, Liście baobabu (owoce odrastają) |
| `bloki/baobab/leaves_fruit.png` | Liście baobabu z owocami |
| `bloki/baobab/leaves_variant.png` | Liście baobabu z kwiatami |
| `bloki/baobab/log_side.png` | Pień baobabu |
| `bloki/baobab/log_top.png` | Pień baobabu |
| `bloki/baobab/planks.png` | Schody baobabowe, Półblok baobabowy, Furtka baobabowa, Stół stolarski baobabowy, Łóżko baobabowe (pościelone), Łóżko baobabowe (stelaż), Deski baobabowe |
| `bloki/baobab/sapling.png` | Sadzonka baobabu |
| `bloki/baobab/stripped_side.png` | Okorowany pień baobabu |
| `bloki/baobab/stripped_top.png` | Okorowany pień baobabu |
| `bloki/baobab_bark.png` | Kora baobabu |
| `bloki/basalt_side.png` | Bazalt |
| `bloki/basalt_top.png` | Bazalt |
| `bloki/bast.png` | Łyko |
| `bloki/bast_weave.png` | Plecionka z łyka |
| `bloki/bedding_linen.png` | Lniana pościel |
| `bloki/bedding_straw.png` | Słomiana pościel |
| `bloki/beech_bark.png` | Kora buka |
| `bloki/beech_leaf_litter.png` | Opadłe liście buka |
| `bloki/beech_leaves.png` | Liście buka |
| `bloki/beech_log_side.png` | Pień buka |
| `bloki/beech_log_top.png` | Pień buka |
| `bloki/beech_planks.png` | Schody bukowe, Półblok bukowy, Furtka bukowa, Stół stolarski bukowy, Łóżko bukowe (pościelone), Łóżko bukowe (stelaż), Deski bukowe |
| `bloki/beech_sapling.png` | Sadzonka buka |
| `bloki/beech_stripped_side.png` | Okorowany pień buka |
| `bloki/beech_stripped_top.png` | Okorowany pień buka |
| `bloki/beechnuts.png` | Orzeszki bukowe |
| `bloki/birch_bark.png` | Kora brzozowa |
| `bloki/birch_leaves.png` | Liście brzozy |
| `bloki/birch_log_side.png` | Pień brzozy |
| `bloki/birch_log_top.png` | Pień brzozy |
| `bloki/birch_planks.png` | Schody brzozowe, Półblok brzozowy, Furtka brzozowa, Stół stolarski brzozowy, Łóżko brzozowe (pościelone), Łóżko brzozowe (stelaż), Stół krawiecki, Deski brzozowe |
| `bloki/birch_sapling.png` | Sadzonka brzozy |
| `bloki/birch_stripped_side.png` | Okorowany pień brzozy |
| `bloki/birch_stripped_top.png` | Okorowany pień brzozy |
| `bloki/blackberry.png` | - |
| `bloki/blackberry_bush_few.png` | - |
| `bloki/blackberry_bush_full.png` | - |
| `bloki/blueberry.png` | - |
| `bloki/blueberry_bush.png` | - |
| `bloki/blueberry_bush_few.png` | - |
| `bloki/blueberry_bush_full.png` | - |
| `bloki/boots_linen.png` | Buty lniane |
| `bloki/boots_nettle.png` | Buty pokrzywowe |
| `bloki/brew_calm.png` | Kubek ziół na sen |
| `bloki/brew_heal.png` | Kubek ziół leczniczych |
| `bloki/brew_vigor.png` | Kubek ziół wzmacniających |
| `bloki/bristlecone/cone.png` | Szyszka sosny ościstej |
| `bloki/bristlecone/leaves.png` | Igliwie sosny ościstej, Igliwie sosny ościstej (szyszki odrastają) |
| `bloki/bristlecone/leaves_variant.png` | Igliwie sosny ościstej z szyszkami |
| `bloki/bristlecone/log_side.png` | Pień sosny ościstej |
| `bloki/bristlecone/log_side_dead.png` | Pień sosny ościstej (martwe drewno) |
| `bloki/bristlecone/log_top.png` | Pień sosny ościstej, Pień sosny ościstej (martwe drewno) |
| `bloki/bristlecone/planks.png` | Schody z sosny ościstej, Półblok z sosny ościstej, Furtka z sosny ościstej, Stół stolarski z sosny ościstej, Łóżko z sosny ościstej (pościelone), Łóżko z sosny ościstej (stelaż), Deski z sosny ościstej |
| `bloki/bristlecone/sapling.png` | Sadzonka sosny ościstej |
| `bloki/bristlecone/stripped_side.png` | Okorowany pień sosny ościstej |
| `bloki/bristlecone/stripped_top.png` | Okorowany pień sosny ościstej |
| `bloki/bristlecone_bark.png` | Kora sosny ościstej |
| `bloki/bush_leaves.png` | - |
| `bloki/bush_sapling.png` | - |
| `bloki/cap_linen.png` | Czapka lniana |
| `bloki/cap_nettle.png` | Czapka pokrzywowa |
| `bloki/cedar/cone.png` | Szyszka cedru |
| `bloki/cedar/leaves.png` | Igliwie cedru, Igliwie cedru (szyszki odrastają) |
| `bloki/cedar/leaves_variant.png` | Igliwie cedru z szyszkami |
| `bloki/cedar/log_side.png` | Pień cedru |
| `bloki/cedar/log_top.png` | Pień cedru |
| `bloki/cedar/planks.png` | Schody cedrowe, Półblok cedrowy, Furtka cedrowa, Stół stolarski cedrowy, Łóżko cedrowe (pościelone), Łóżko cedrowe (stelaż), Deski cedrowe |
| `bloki/cedar/sapling.png` | Sadzonka cedru |
| `bloki/cedar/stripped_side.png` | Okorowany pień cedru |
| `bloki/cedar/stripped_top.png` | Okorowany pień cedru |
| `bloki/cedar_bark.png` | Kora cedru |
| `bloki/chamomile.png` | Rumianek |
| `bloki/cherry/leaves.png` | Liście wiśni |
| `bloki/cherry/leaves_variant.png` | Liście wiśni — rzadsze kwiaty |
| `bloki/cherry/log_side.png` | Pień wiśni |
| `bloki/cherry/log_top.png` | Pień wiśni |
| `bloki/cherry/planks.png` | Schody wiśniowe, Półblok wiśniowy, Furtka wiśniowa, Stół stolarski wiśniowy, Łóżko wiśniowe (pościelone), Łóżko wiśniowe (stelaż), Deski wiśni |
| `bloki/cherry/sapling.png` | Sadzonka wiśni |
| `bloki/cherry/stripped_side.png` | Okorowany pień wiśni |
| `bloki/cherry/stripped_top.png` | Okorowany pień wiśni |
| `bloki/cherry_bark.png` | Kora wiśni |
| `bloki/chili_bush_few.png` | - |
| `bloki/chili_bush_full.png` | - |
| `bloki/chili_pepper.png` | - |
| `bloki/clay.png` | Glina |
| `bloki/clay_bowl.png` | Gliniana miska |
| `bloki/clay_brick.png` | Cegła |
| `bloki/clay_bricks.png` | Cegły |
| `bloki/clay_cup.png` | Gliniany kubek |
| `bloki/clay_pot.png` | Gliniany garnek |
| `bloki/clay_pot_water.png` | Garnek z wodą |
| `bloki/clover.png` | Koniczyna, Grzybień biały, Rzęsa wodna |
| `bloki/coarse_dirt.png` | Rozgrzebana ziemia kamienista, Ziemia kamienista |
| `bloki/coconut_palm/coconut.png` | Kokos |
| `bloki/coconut_palm/leaves.png` | Liście palmy kokosowej, Liście palmy (kokosy odrastają) |
| `bloki/coconut_palm/leaves_variant.png` | Liście palmy z kokosami |
| `bloki/coconut_palm/log_side.png` | Pień palmy kokosowej |
| `bloki/coconut_palm/log_top.png` | Pień palmy kokosowej |
| `bloki/coconut_palm/planks.png` | Schody palmowe, Półblok palmowy, Furtka palmowa, Stół stolarski palmowy, Łóżko palmowe (pościelone), Łóżko palmowe (stelaż), Deski palmowe |
| `bloki/coconut_palm/sapling.png` | Sadzonka palmy kokosowej |
| `bloki/coconut_palm/stripped_side.png` | Okorowany pień palmy kokosowej |
| `bloki/coconut_palm/stripped_top.png` | Okorowany pień palmy kokosowej |
| `bloki/coconut_palm_bark.png` | Kora palmy kokosowej |
| `bloki/compost.png` | Kompost |
| `bloki/compost_bowl.png` | Kompost w misce |
| `bloki/cornflower.png` | Chaber, Krwawnica pospolita |
| `bloki/crocus.png` | Krokus |
| `bloki/dandelion.png` | Mniszek |
| `bloki/dark_planks.png` | Schody z ciemnego drewna, Półblok z ciemnego drewna, Furtka z ciemnego drewna, Stół stolarski z ciemnego drewna, Łóżko z ciemnego drewna (pościelone), Łóżko z ciemnego drewna (stelaż), Ciemne deski |
| `bloki/dirt.png` | Ziemia, Rozgrzebana ziemia, Pole z kompostem |
| `bloki/dish_compote.png` | Kompot owocowy |
| `bloki/dish_mixed_stew.png` | Polewka |
| `bloki/dish_nut_soup.png` | Polewka orzechowa |
| `bloki/dish_pumpkin_soup.png` | Zupa dyniowa |
| `bloki/dish_vegetable_stew.png` | Gulasz warzywny |
| `bloki/dish_zucchini_stew.png` | Duszona cukinia |
| `bloki/door_acacia_edge.png` | - |
| `bloki/door_araucaria_edge.png` | - |
| `bloki/door_aspen_edge.png` | - |
| `bloki/door_bald_cypress_edge.png` | - |
| `bloki/door_banyan_edge.png` | - |
| `bloki/door_baobab_edge.png` | - |
| `bloki/door_beech_edge.png` | - |
| `bloki/door_birch_edge.png` | - |
| `bloki/door_bristlecone_edge.png` | - |
| `bloki/door_cedar_edge.png` | - |
| `bloki/door_cherry_edge.png` | - |
| `bloki/door_coconut_palm_edge.png` | - |
| `bloki/door_dark_edge.png` | - |
| `bloki/door_dragon_tree_edge.png` | - |
| `bloki/door_fir_edge.png` | - |
| `bloki/door_ginkgo_edge.png` | - |
| `bloki/door_jablon_edge.png` | - |
| `bloki/door_jacaranda_edge.png` | - |
| `bloki/door_joshua_tree_edge.png` | - |
| `bloki/door_kapok_edge.png` | - |
| `bloki/door_larch_edge.png` | - |
| `bloki/door_linden_edge.png` | - |
| `bloki/door_mangrove_edge.png` | - |
| `bloki/door_maple_edge.png` | - |
| `bloki/door_mugo_edge.png` | - |
| `bloki/door_oak_edge.png` | - |
| `bloki/door_olcha_edge.png` | - |
| `bloki/door_olive_edge.png` | - |
| `bloki/door_pine_edge.png` | - |
| `bloki/door_rainbow_eucalyptus_edge.png` | - |
| `bloki/door_sequoia_edge.png` | - |
| `bloki/door_spruce_edge.png` | - |
| `bloki/door_wierzba_edge.png` | - |
| `bloki/dragon_tree/berries.png` | Jagody draceny |
| `bloki/dragon_tree/leaves.png` | Liście draceny, Liście draceny (jagody odrastają) |
| `bloki/dragon_tree/leaves_variant.png` | Liście draceny z jagodami |
| `bloki/dragon_tree/log_side.png` | Pień draceny |
| `bloki/dragon_tree/log_top.png` | Pień draceny |
| `bloki/dragon_tree/planks.png` | Schody z draceny, Półblok z draceny, Furtka z draceny, Stół stolarski z draceny, Łóżko z draceny (pościelone), Łóżko z draceny (stelaż), Deski z draceny |
| `bloki/dragon_tree/sapling.png` | Sadzonka draceny |
| `bloki/dragon_tree/stripped_side.png` | Okorowany pień draceny |
| `bloki/dragon_tree/stripped_top.png` | Okorowany pień draceny |
| `bloki/dragon_tree_bark.png` | Kora draceny |
| `bloki/dried_fruit.png` | Suszone owoce |
| `bloki/dune_grass.png` | Piaskownica (trawa wydmowa) |
| `bloki/dye_black.png` | Barwnik czarny |
| `bloki/dye_blue.png` | Barwnik niebieski |
| `bloki/dye_brown.png` | Barwnik brązowy |
| `bloki/dye_cyan.png` | Barwnik turkusowy |
| `bloki/dye_gray.png` | Barwnik szary |
| `bloki/dye_green.png` | Barwnik zielony |
| `bloki/dye_light_blue.png` | Barwnik jasnoniebieski |
| `bloki/dye_light_gray.png` | Barwnik jasnoszary |
| `bloki/dye_lime.png` | Barwnik limonkowy |
| `bloki/dye_magenta.png` | Barwnik purpurowy |
| `bloki/dye_orange.png` | Barwnik pomarańczowy |
| `bloki/dye_pink.png` | Barwnik różowy |
| `bloki/dye_purple.png` | Barwnik fioletowy |
| `bloki/dye_red.png` | Barwnik czerwony |
| `bloki/dye_white.png` | Barwnik biały |
| `bloki/dye_yellow.png` | Barwnik żółty |
| `bloki/fallen_aronia.png` | Opadłe owoce aronii |
| `bloki/fallen_blackberry.png` | Opadłe owoce (krzak jeżyny), Opadłe owoce jeżyny |
| `bloki/fallen_blackcurrant.png` | Opadłe owoce porzeczki czarnej |
| `bloki/fallen_blueberry.png` | Opadłe owoce (krzak borówki), Opadłe owoce borówki wysokiej |
| `bloki/fallen_chili_pepper.png` | Opadłe owoce (krzak papryczki chili) |
| `bloki/fallen_cranberry.png` | Opadłe owoce żurawiny |
| `bloki/fallen_elderberry.png` | Opadłe owoce bzu czarnego |
| `bloki/fallen_gooseberry.png` | Opadłe owoce agrestu |
| `bloki/fallen_hazelnut.png` | Opadłe owoce (leszczyna), Opadłe owoce leszczyny |
| `bloki/fallen_jablon_jablko.png` | Opadłe owoce jabłoni |
| `bloki/fallen_lingonberry.png` | Opadłe owoce brusznicy |
| `bloki/fallen_olive_oliwki.png` | Opadłe owoce oliwki |
| `bloki/fallen_raspberry.png` | Opadłe owoce maliny |
| `bloki/fallen_red_gooseberry.png` | Opadłe owoce agrestu czerwonego |
| `bloki/fallen_redcurrant.png` | Opadłe owoce porzeczki czerwonej |
| `bloki/fallen_rose_hip.png` | Opadłe owoce dzikiej róży |
| `bloki/fallen_sea_buckthorn_berry.png` | Opadłe owoce rokitnika |
| `bloki/fallen_strawberry.png` | Opadłe owoce (krzak truskawki), Opadłe owoce truskawek |
| `bloki/fallen_wild_strawberry.png` | Opadłe owoce poziomki |
| `bloki/fallen_yellow_raspberry.png` | Opadłe owoce maliny żółtej |
| `bloki/fallen_zucchini.png` | Opadłe owoce cukinii |
| `bloki/fern.png` | Paproć, Wywłócznik |
| `bloki/fir/cone.png` | Szyszka jodły |
| `bloki/fir/leaves.png` | Igliwie jodły, Igliwie jodły (szyszki odrastają) |
| `bloki/fir/leaves_variant.png` | Igliwie jodły z szyszkami |
| `bloki/fir/log_side.png` | Pień jodły |
| `bloki/fir/log_top.png` | Pień jodły |
| `bloki/fir/planks.png` | Schody jodłowe, Półblok jodłowy, Furtka jodłowa, Stół stolarski jodłowy, Łóżko jodłowe (pościelone), Łóżko jodłowe (stelaż), Deski jodłowe |
| `bloki/fir/sapling.png` | Sadzonka jodły |
| `bloki/fir/stripped_side.png` | Okorowany pień jodły |
| `bloki/fir/stripped_top.png` | Okorowany pień jodły |
| `bloki/fir_bark.png` | Kora jodły |
| `bloki/flax_fiber.png` | Włókno lniane |
| `bloki/flax_retted.png` | Moczony len |
| `bloki/flower_wreath.png` | Wianek z kwiatów |
| `bloki/forest_floor_side.png` | Ściółka leśna |
| `bloki/forest_floor_top.png` | Ściółka leśna |
| `bloki/ginkgo/leaves.png` | Liście miłorzębu |
| `bloki/ginkgo/leaves_variant.png` | Liście miłorzębu — jasne złoto |
| `bloki/ginkgo/log_side.png` | Pień miłorzębu |
| `bloki/ginkgo/log_top.png` | Pień miłorzębu |
| `bloki/ginkgo/planks.png` | Schody miłorzębowe, Półblok miłorzębowy, Furtka miłorzębowa, Stół stolarski miłorzębowy, Łóżko miłorzębowe (pościelone), Łóżko miłorzębowe (stelaż), Deski miłorzębowe |
| `bloki/ginkgo/sapling.png` | Sadzonka miłorzębu |
| `bloki/ginkgo/stripped_side.png` | Okorowany pień miłorzębu |
| `bloki/ginkgo/stripped_top.png` | Okorowany pień miłorzębu |
| `bloki/ginkgo_bark.png` | Kora miłorzębu |
| `bloki/granite.png` | Granit |
| `bloki/grass_side.png` | Blok trawy |
| `bloki/grass_top.png` | Blok trawy |
| `bloki/grass_top_babka.png` | - |
| `bloki/grass_top_chaber.png` | - |
| `bloki/grass_top_chabry.png` | - |
| `bloki/grass_top_dmuchawce.png` | - |
| `bloki/grass_top_fiolki.png` | - |
| `bloki/grass_top_fiolki_duzo.png` | - |
| `bloki/grass_top_jaskry.png` | - |
| `bloki/grass_top_koniczyna.png` | - |
| `bloki/grass_top_koniczyna2.png` | - |
| `bloki/grass_top_koniczyna_biala.png` | - |
| `bloki/grass_top_koniczyna_mlecz.png` | - |
| `bloki/grass_top_koniczyna_rozowa.png` | - |
| `bloki/grass_top_krokusy.png` | - |
| `bloki/grass_top_laka_czerwona.png` | - |
| `bloki/grass_top_laka_drobna.png` | - |
| `bloki/grass_top_laka_fiolet.png` | - |
| `bloki/grass_top_laka_pelna.png` | - |
| `bloki/grass_top_laka_zolta.png` | - |
| `bloki/grass_top_mak.png` | - |
| `bloki/grass_top_maki.png` | - |
| `bloki/grass_top_mech.png` | - |
| `bloki/grass_top_mech2.png` | - |
| `bloki/grass_top_mech_duzy.png` | - |
| `bloki/grass_top_mlecz.png` | - |
| `bloki/grass_top_mlecz_duzy.png` | - |
| `bloki/grass_top_mlecze.png` | - |
| `bloki/grass_top_niezapominajki.png` | - |
| `bloki/grass_top_paprotka.png` | - |
| `bloki/grass_top_platki.png` | - |
| `bloki/grass_top_poziomki.png` | - |
| `bloki/grass_top_rozeta.png` | - |
| `bloki/grass_top_rozeta_kwiat.png` | - |
| `bloki/grass_top_rozety2.png` | - |
| `bloki/grass_top_stokrotka.png` | - |
| `bloki/grass_top_stokrotki.png` | - |
| `bloki/grass_top_stokrotki_duzo.png` | - |
| `bloki/grass_top_trawa_ciemna.png` | - |
| `bloki/grass_top_trawa_kepki.png` | - |
| `bloki/grass_top_trawa_sucha.png` | - |
| `bloki/grass_top_trawa_sucha2.png` | - |
| `bloki/grass_top_trawa_zdzbla.png` | - |
| `bloki/grass_top_wrzos.png` | - |
| `bloki/gravel.png` | Żwir |
| `bloki/hazel_bush_few.png` | - |
| `bloki/hazel_bush_full.png` | - |
| `bloki/hazelnut.png` | - |
| `bloki/headband_linen.png` | Opaska lniana |
| `bloki/headband_nettle.png` | Opaska pokrzywowa |
| `bloki/heather.png` | Wrzos |
| `bloki/humus.png` | Rozgrzebany czarnoziem, Czarnoziem |
| `bloki/ice_block.png` | - |
| `bloki/item_aronia.png` | Aronia |
| `bloki/item_blackcurrant.png` | Czarne porzeczki |
| `bloki/item_cranberry.png` | Żurawina |
| `bloki/item_elderberry.png` | Owoce bzu czarnego |
| `bloki/item_elderflower.png` | Kwiat bzu czarnego |
| `bloki/item_gooseberry.png` | Agrest |
| `bloki/item_lingonberry.png` | Borówki brusznice |
| `bloki/item_pumpkin_seeds.png` | Pestki dyni |
| `bloki/item_pumpkin_slice.png` | Kawałek dyni |
| `bloki/item_raspberry.png` | Maliny |
| `bloki/item_red_gooseberry.png` | Czerwony agrest |
| `bloki/item_redcurrant.png` | Czerwone porzeczki |
| `bloki/item_rose_hip.png` | Owoce dzikiej róży |
| `bloki/item_rose_petals.png` | Płatki dzikiej róży |
| `bloki/item_sea_buckthorn.png` | Owoce rokitnika |
| `bloki/item_wild_strawberry.png` | Poziomki |
| `bloki/item_yellow_raspberry.png` | Żółte maliny |
| `bloki/item_zucchini.png` | Cukinia |
| `bloki/jablon/deski.png` | Schody jabłoniowe, Półblok jabłoniowy, Furtka jabłoniowa, Stół stolarski jabłoniowy, Łóżko jabłoniowe (pościelone), Łóżko jabłoniowe (stelaż), Deski jabłoniowe |
| `bloki/jablon/jablko.png` | Jabłko |
| `bloki/jablon/liscie.png` | Liście jabłoni, Liście jabłoni (jabłka odrastają) |
| `bloki/jablon/liscie_jablka.png` | Liście jabłoni z jabłkami |
| `bloki/jablon/okorowany_bok.png` | Okorowany pień jabłoni |
| `bloki/jablon/okorowany_gora.png` | Okorowany pień jabłoni |
| `bloki/jablon/opadle_liscie.png` | Opadłe liście jabłoni |
| `bloki/jablon/pien_bok.png` | Pień jabłoni |
| `bloki/jablon/pien_gora.png` | Pień jabłoni |
| `bloki/jablon/sadzonka.png` | Sadzonka jabłoni |
| `bloki/jablon_bark.png` | Kora jabłoni |
| `bloki/jacaranda/leaves.png` | Liście jakarandy |
| `bloki/jacaranda/leaves_variant.png` | Liście jakarandy — jasne kwiaty |
| `bloki/jacaranda/log_side.png` | Pień jakarandy |
| `bloki/jacaranda/log_top.png` | Pień jakarandy |
| `bloki/jacaranda/planks.png` | Schody jakarandowe, Półblok jakarandowy, Furtka jakarandowa, Stół stolarski jakarandowy, Łóżko jakarandowe (pościelone), Łóżko jakarandowe (stelaż), Deski jakarandowe |
| `bloki/jacaranda/sapling.png` | Sadzonka jakarandy |
| `bloki/jacaranda/stripped_side.png` | Okorowany pień jakarandy |
| `bloki/jacaranda/stripped_top.png` | Okorowany pień jakarandy |
| `bloki/jacaranda_bark.png` | Kora jakarandy |
| `bloki/joshua_tree/flowers.png` | Kwiaty jukki |
| `bloki/joshua_tree/leaves.png` | Liście jukki, Liście jukki (kwiaty odrastają) |
| `bloki/joshua_tree/leaves_variant.png` | Liście jukki z kwiatami |
| `bloki/joshua_tree/log_side.png` | Pień jukki |
| `bloki/joshua_tree/log_side_shaggy.png` | Pień jukki (z suchymi liśćmi) |
| `bloki/joshua_tree/log_top.png` | Pień jukki |
| `bloki/joshua_tree/planks.png` | Schody z jukki, Półblok z jukki, Furtka z jukki, Stół stolarski z jukki, Łóżko z jukki (pościelone), Łóżko z jukki (stelaż), Deski z jukki |
| `bloki/joshua_tree/sapling.png` | Sadzonka jukki |
| `bloki/joshua_tree/stripped_side.png` | Okorowany pień jukki |
| `bloki/joshua_tree/stripped_top.png` | Okorowany pień jukki |
| `bloki/joshua_tree_bark.png` | Kora jukki |
| `bloki/kapok/fluff.png` | Puch puchowca (kapok) |
| `bloki/kapok/leaf_litter.png` | Opadłe liście puchowca |
| `bloki/kapok/leaves.png` | Liście puchowca, Liście puchowca (puch odrasta) |
| `bloki/kapok/leaves_variant.png` | Liście puchowca z puchem |
| `bloki/kapok/log_side.png` | Pień puchowca |
| `bloki/kapok/log_top.png` | Pień puchowca |
| `bloki/kapok/planks.png` | Schody z puchowca, Półblok z puchowca, Furtka z puchowca, Stół stolarski z puchowca, Łóżko z puchowca (pościelone), Łóżko z puchowca (stelaż), Deski z puchowca |
| `bloki/kapok/sapling.png` | Sadzonka puchowca |
| `bloki/kapok/stripped_side.png` | Okorowany pień puchowca |
| `bloki/kapok/stripped_top.png` | Okorowany pień puchowca |
| `bloki/kapok_bark.png` | Kora puchowca |
| `bloki/knife.png` | Nóż |
| `bloki/knife_basalt.png` | Nóż bazaltowy |
| `bloki/knife_granite.png` | Nóż granitowy |
| `bloki/knife_limestone.png` | Nóż wapienny |
| `bloki/knife_sandstone.png` | Nóż piaskowcowy |
| `bloki/knife_slate.png` | Nóż łupkowy |
| `bloki/lamp.png` | Lampa |
| `bloki/lamp_blue.png` | Niebieska lampa |
| `bloki/lamp_green.png` | Zielona lampa |
| `bloki/lamp_purple.png` | Fioletowa lampa |
| `bloki/lamp_red.png` | Czerwona lampa |
| `bloki/lapcie_bast.png` | Łapcie z łyka |
| `bloki/larch/cone.png` | Szyszka modrzewia |
| `bloki/larch/leaf_litter.png` | Opadłe igliwie modrzewia |
| `bloki/larch/leaves.png` | Igliwie modrzewia, Igliwie modrzewia (szyszki odrastają) |
| `bloki/larch/leaves_cones.png` | Igliwie modrzewia z szyszkami |
| `bloki/larch/leaves_variant.png` | Złote igliwie modrzewia |
| `bloki/larch/log_side.png` | Pień modrzewia |
| `bloki/larch/log_top.png` | Pień modrzewia |
| `bloki/larch/planks.png` | Schody modrzewiowe, Półblok modrzewiowy, Furtka modrzewiowa, Stół stolarski modrzewiowy, Łóżko modrzewiowe (pościelone), Łóżko modrzewiowe (stelaż), Deski modrzewiowe |
| `bloki/larch/sapling.png` | Sadzonka modrzewia |
| `bloki/larch/stripped_side.png` | Okorowany pień modrzewia |
| `bloki/larch/stripped_top.png` | Okorowany pień modrzewia |
| `bloki/larch_bark.png` | Kora modrzewia |
| `bloki/lepidolite.png` | Lepidolit |
| `bloki/lime_plaster.png` | Tynk wapienny |
| `bloki/limestone.png` | Wapień |
| `bloki/linden_bark.png` | Kora lipy |
| `bloki/linden_flower.png` | Kwiat lipy |
| `bloki/linden_leaves.png` | Liście lipy |
| `bloki/linden_leaves_flowering.png` | Kwitnące liście lipy |
| `bloki/linden_log_side.png` | Pień lipy |
| `bloki/linden_log_top.png` | Pień lipy |
| `bloki/linden_planks.png` | Schody lipowe, Półblok lipowy, Furtka lipowa, Stół stolarski lipowy, Łóżko lipowe (pościelone), Łóżko lipowe (stelaż), Deski lipowe |
| `bloki/linden_sapling.png` | Sadzonka lipy |
| `bloki/linden_stripped_side.png` | Okorowany pień lipy |
| `bloki/linden_stripped_top.png` | Okorowany pień lipy |
| `bloki/linen_cloth.png` | Płótno lniane |
| `bloki/low_cranberry_flower_side.png` | Żurawina (kwitnie) |
| `bloki/low_cranberry_flower_top.png` | - |
| `bloki/low_cranberry_fruit_side.png` | Żurawina (owoce) |
| `bloki/low_cranberry_fruit_top.png` | - |
| `bloki/low_cranberry_plant_side.png` | Żurawina |
| `bloki/low_cranberry_plant_top.png` | - |
| `bloki/low_cranberry_unripe_side.png` | Żurawina (niedojrzałe owoce) |
| `bloki/low_cranberry_unripe_top.png` | - |
| `bloki/low_cranberry_young_side.png` | Sadzonka żurawiny |
| `bloki/low_cranberry_young_top.png` | - |
| `bloki/low_lingonberry_flower_side.png` | Borówka brusznica (kwitnie) |
| `bloki/low_lingonberry_flower_top.png` | - |
| `bloki/low_lingonberry_fruit_side.png` | Borówka brusznica (owoce) |
| `bloki/low_lingonberry_fruit_top.png` | - |
| `bloki/low_lingonberry_plant_side.png` | Sadzonka brusznicy, Borówka brusznica |
| `bloki/low_lingonberry_plant_top.png` | - |
| `bloki/low_lingonberry_unripe_side.png` | Borówka brusznica (niedojrzałe owoce) |
| `bloki/low_lingonberry_unripe_top.png` | - |
| `bloki/low_pumpkin_flower_top.png` | - |
| `bloki/low_pumpkin_plant_side.png` | Siewka dyni, Pnącze dyni, Pnącze dyni (kwitnie) |
| `bloki/low_pumpkin_plant_top.png` | - |
| `bloki/low_pumpkin_spent_side.png` | Pnącze dyni (żółknie) |
| `bloki/low_pumpkin_spent_top.png` | - |
| `bloki/low_strawberry_flower_side.png` | Truskawki (kwitnie) |
| `bloki/low_strawberry_flower_top.png` | - |
| `bloki/low_strawberry_fruit_side.png` | Truskawki (owoce) |
| `bloki/low_strawberry_fruit_top.png` | - |
| `bloki/low_strawberry_plant_side.png` | Sadzonka truskawek, Truskawki |
| `bloki/low_strawberry_plant_top.png` | - |
| `bloki/low_wild_strawberry_flower_side.png` | Poziomka (kwitnie) |
| `bloki/low_wild_strawberry_flower_top.png` | - |
| `bloki/low_wild_strawberry_fruit_side.png` | Poziomka (owoce) |
| `bloki/low_wild_strawberry_fruit_top.png` | - |
| `bloki/low_wild_strawberry_plant_side.png` | Sadzonka poziomki, Poziomka |
| `bloki/low_wild_strawberry_plant_top.png` | - |
| `bloki/low_zucchini_flower_top.png` | - |
| `bloki/low_zucchini_fruit_side.png` | Cukinia (owoce) |
| `bloki/low_zucchini_plant_side.png` | Sadzonka cukinii, Cukinia, Cukinia (kwitnie) |
| `bloki/low_zucchini_plant_top.png` | - |
| `bloki/mangrove/leaves.png` | Liście namorzynu, Liście namorzynu (siewki odrastają) |
| `bloki/mangrove/leaves_variant.png` | Liście namorzynu z siewkami |
| `bloki/mangrove/log_side.png` | Pień namorzynu |
| `bloki/mangrove/log_top.png` | Pień namorzynu |
| `bloki/mangrove/planks.png` | Schody namorzynowe, Półblok namorzynowy, Furtka namorzynowa, Stół stolarski namorzynowy, Łóżko namorzynowe (pościelone), Łóżko namorzynowe (stelaż), Deski namorzynowe |
| `bloki/mangrove/propagule.png` | Siewka namorzynu |
| `bloki/mangrove/roots.png` | Korzenie namorzynu |
| `bloki/mangrove/sapling.png` | Sadzonka namorzynu, Sadzonka namorzynu (w wodzie) |
| `bloki/mangrove/stripped_side.png` | Okorowany pień namorzynu |
| `bloki/mangrove/stripped_top.png` | Okorowany pień namorzynu |
| `bloki/mangrove_bark.png` | Kora namorzynu |
| `bloki/maple/leaf_litter.png` | Opadłe liście klonu |
| `bloki/maple/leaves.png` | Liście klonu |
| `bloki/maple/leaves_variant.png` | Złote liście klonu |
| `bloki/maple/log_side.png` | Pień klonu |
| `bloki/maple/log_top.png` | Pień klonu |
| `bloki/maple/planks.png` | Schody klonowe, Półblok klonowy, Furtka klonowa, Stół stolarski klonowy, Łóżko klonowe (pościelone), Łóżko klonowe (stelaż), Deski klonowe |
| `bloki/maple/sapling.png` | Sadzonka klonu |
| `bloki/maple/stripped_side.png` | Okorowany pień klonu |
| `bloki/maple/stripped_top.png` | Okorowany pień klonu |
| `bloki/maple_bark.png` | Kora klonu |
| `bloki/meteorite.png` | Meteoryt |
| `bloki/mob_hedgehog_albino.png` | - |
| `bloki/mob_hedgehog_brown.png` | - |
| `bloki/mob_hedgehog_dark.png` | - |
| `bloki/mob_hedgehog_sandy.png` | - |
| `bloki/models/bushy-grass/texture.png` | - |
| `bloki/models/rosliny/amarantus/polrealistyczny.png` | - |
| `bloki/models/rosliny/babka/polrealistyczny.png` | - |
| `bloki/models/rosliny/borowka/polrealistyczny.png` | - |
| `bloki/models/rosliny/chaber/polrealistyczny.png` | - |
| `bloki/models/rosliny/chili/polrealistyczny.png` | - |
| `bloki/models/rosliny/cynia/polrealistyczny.png` | - |
| `bloki/models/rosliny/cynia/prosty-1.png` | - |
| `bloki/models/rosliny/cynia/prosty-2.png` | - |
| `bloki/models/rosliny/cynia/prosty-3.png` | - |
| `bloki/models/rosliny/dzwonek/polrealistyczny.png` | - |
| `bloki/models/rosliny/dzwonek/prosty-1.png` | - |
| `bloki/models/rosliny/dzwonek/prosty-2.png` | - |
| `bloki/models/rosliny/dzwonek/prosty-3.png` | - |
| `bloki/models/rosliny/gorczyca/polrealistyczny.png` | - |
| `bloki/models/rosliny/gorczyca/prosty-1.png` | - |
| `bloki/models/rosliny/gorczyca/prosty-2.png` | - |
| `bloki/models/rosliny/gorczyca/prosty-3.png` | - |
| `bloki/models/rosliny/indygowiec/polrealistyczny.png` | - |
| `bloki/models/rosliny/indygowiec/prosty-1.png` | - |
| `bloki/models/rosliny/indygowiec/prosty-2.png` | - |
| `bloki/models/rosliny/indygowiec/prosty-3.png` | - |
| `bloki/models/rosliny/jezyna/polrealistyczny.png` | - |
| `bloki/models/rosliny/kocanka/polrealistyczny.png` | - |
| `bloki/models/rosliny/kocanka/prosty-1.png` | - |
| `bloki/models/rosliny/kocanka/prosty-2.png` | - |
| `bloki/models/rosliny/kocanka/prosty-3.png` | - |
| `bloki/models/rosliny/koniczyna/polrealistyczny.png` | - |
| `bloki/models/rosliny/krokus/polrealistyczny.png` | - |
| `bloki/models/rosliny/krotka-trawa/polrealistyczny.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-borowa-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-borowa.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-fiolki-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-fiolki.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-goryczka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-goryczka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-jaskry-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-jaskry.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-kaczence-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-kaczence.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-klosy-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-klosy-zlote-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-klosy-zlote.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-klosy.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-koniczynka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-koniczynka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-lesna-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-lesna.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-macierzanka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-macierzanka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-murawa-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-murawa.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-niezapominajki-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-niezapominajki.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-ostnica-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-ostnica.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-paprotka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-paprotka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-sitowie-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-sitowie.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-stokrotki-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-stokrotki.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-sucha-kepka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-sucha-kepka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-szarotka-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-szarotka.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-turzyca-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-turzyca.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-wrzosiec-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-wrzosiec.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-zawilce-prosty.png` | - |
| `bloki/models/rosliny/krotka-trawa/wariant-zawilce.png` | - |
| `bloki/models/rosliny/krwawnica/polrealistyczny.png` | - |
| `bloki/models/rosliny/krwawnica/prosty-1.png` | - |
| `bloki/models/rosliny/lawenda/polrealistyczny.png` | - |
| `bloki/models/rosliny/lawenda/prosty-1.png` | - |
| `bloki/models/rosliny/lawenda/prosty-2.png` | - |
| `bloki/models/rosliny/lawenda/prosty-3.png` | - |
| `bloki/models/rosliny/len/polrealistyczny.png` | - |
| `bloki/models/rosliny/len/prosty-1.png` | - |
| `bloki/models/rosliny/len/prosty-2.png` | - |
| `bloki/models/rosliny/len/prosty-3.png` | - |
| `bloki/models/rosliny/leszczyna/polrealistyczny.png` | - |
| `bloki/models/rosliny/mak/polrealistyczny.png` | - |
| `bloki/models/rosliny/marzanna/polrealistyczny.png` | - |
| `bloki/models/rosliny/marzanna/prosty-1.png` | - |
| `bloki/models/rosliny/marzanna/prosty-2.png` | - |
| `bloki/models/rosliny/marzanna/prosty-3.png` | - |
| `bloki/models/rosliny/mikolajek/polrealistyczny.png` | - |
| `bloki/models/rosliny/mikolajek/prosty-1.png` | - |
| `bloki/models/rosliny/mikolajek/prosty-2.png` | - |
| `bloki/models/rosliny/mikolajek/prosty-3.png` | - |
| `bloki/models/rosliny/mniszek/polrealistyczny.png` | - |
| `bloki/models/rosliny/nagietek/polrealistyczny.png` | - |
| `bloki/models/rosliny/nagietek/prosty-1.png` | - |
| `bloki/models/rosliny/nagietek/prosty-2.png` | - |
| `bloki/models/rosliny/nagietek/prosty-3.png` | - |
| `bloki/models/rosliny/palka/polrealistyczny.png` | - |
| `bloki/models/rosliny/palka/prosty-1.png` | - |
| `bloki/models/rosliny/paproc/polrealistyczny.png` | - |
| `bloki/models/rosliny/piwonia/polrealistyczny.png` | - |
| `bloki/models/rosliny/piwonia/prosty-1.png` | - |
| `bloki/models/rosliny/piwonia/prosty-2.png` | - |
| `bloki/models/rosliny/piwonia/prosty-3.png` | - |
| `bloki/models/rosliny/pokrzywa/polrealistyczny.png` | - |
| `bloki/models/rosliny/rumianek/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-akacja/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-araukaria/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-banian/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-baobab/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-brzoza/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-buk/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-cedr/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-cyprysnik/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-dab/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-dracena/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-eukaliptus/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jablon/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jakaranda/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jodla/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jukka/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-klon/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-kosodrzewina/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-aronia/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-bramble/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-currant/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-dog-rose/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-elderberry/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-gooseberry/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-hazel/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-highbush-blueberry/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-raspberry/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-krzew-sea-buckthorn/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-lipa/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-milorzab/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-modrzew/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-namorzyn/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-olcha/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-oliwka/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-oscista/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-osika/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-palma/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-puchowiec/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-sekwoja/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-sosna/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-swierk/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-wierzba/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-wisnia/polrealistyczny.png` | - |
| `bloki/models/rosliny/szalwia/polrealistyczny.png` | - |
| `bloki/models/rosliny/szalwia/prosty-1.png` | - |
| `bloki/models/rosliny/szalwia/prosty-2.png` | - |
| `bloki/models/rosliny/szalwia/prosty-3.png` | - |
| `bloki/models/rosliny/trawa-wydmowa/polrealistyczny.png` | - |
| `bloki/models/rosliny/truskawka/polrealistyczny.png` | - |
| `bloki/models/rosliny/trzcina/polrealistyczny.png` | - |
| `bloki/models/rosliny/turzyca/polrealistyczny.png` | - |
| `bloki/models/rosliny/turzyca/prosty-1.png` | - |
| `bloki/models/rosliny/wrzos/polrealistyczny.png` | - |
| `bloki/models/rosliny/wysoka-trawa/polrealistyczny.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-dzwonki-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-dzwonki.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-goryczka-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-goryczka.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-klosy-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-klosy.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-kosacce-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-kosacce.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-kosmatka-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-kosmatka.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-krwawnica-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-krwawnica.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-lesna-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-lesna.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-margerytki-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-margerytki.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-naparstnica-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-naparstnica.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-orlica-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-orlica.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-oset-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-oset.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-ostnica-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-ostnica.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-palki-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-palki.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-piorka-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-piorka.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-szczaw-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-szczaw.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-szuwar-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-szuwar.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-trzcinnik-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-trzcinnik.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-welnianka-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-welnianka.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-wiechy-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-wiechy.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-wrzos-prosty.png` | - |
| `bloki/models/rosliny/wysoka-trawa/wariant-wrzos.png` | - |
| `bloki/models/rosliny/zawilec/polrealistyczny.png` | - |
| `bloki/models/rosliny/zawilec/prosty-1.png` | - |
| `bloki/models/rosliny/zawilec/prosty-2.png` | - |
| `bloki/models/rosliny/zawilec/prosty-3.png` | - |
| `bloki/moss_carpet.png` | Kępki mchu |
| `bloki/moss_carpet_2.png` | - |
| `bloki/moss_carpet_3.png` | - |
| `bloki/moss_side.png` | Mech |
| `bloki/moss_top.png` | Mech |
| `bloki/mud.png` | Błoto |
| `bloki/mugo/cone.png` | Szyszka kosodrzewiny |
| `bloki/mugo/leaves.png` | Igliwie kosodrzewiny |
| `bloki/mugo/leaves_variant.png` | Igliwie kosodrzewiny z młodymi pędami |
| `bloki/mugo/log_side.png` | Pień kosodrzewiny |
| `bloki/mugo/log_top.png` | Pień kosodrzewiny |
| `bloki/mugo/planks.png` | Schody z kosodrzewiny, Półblok z kosodrzewiny, Furtka z kosodrzewiny, Stół stolarski z kosodrzewiny, Łóżko z kosodrzewiny (pościelone), Łóżko z kosodrzewiny (stelaż), Deski z kosodrzewiny |
| `bloki/mugo/sapling.png` | Sadzonka kosodrzewiny |
| `bloki/mugo/stripped_side.png` | Okorowany pień kosodrzewiny |
| `bloki/mugo/stripped_top.png` | Okorowany pień kosodrzewiny |
| `bloki/mugo_bark.png` | Kora kosodrzewiny |
| `bloki/nettle.png` | Pokrzywa |
| `bloki/nettle_cloth.png` | Płótno pokrzywowe |
| `bloki/nettle_fiber.png` | Włókno pokrzywowe |
| `bloki/nettle_retted.png` | Moczona pokrzywa |
| `bloki/oak_bark.png` | Kora dębu |
| `bloki/oak_leaf_litter.png` | Opadłe liście dębu |
| `bloki/oak_leaves.png` | Liście dębu |
| `bloki/oak_log_side.png` | Ognisko, Pień dębu |
| `bloki/oak_log_top.png` | Pień dębu |
| `bloki/oak_planks.png` | Schody dębowe, Półblok dębowy, Furtka dębowa, Stół stolarski dębowy, Łóżko dębowe (pościelone), Łóżko dębowe (stelaż), Deski dębowe |
| `bloki/oak_sapling.png` | Sadzonka dębu |
| `bloki/oak_stripped_side.png` | Okorowany pień dębu |
| `bloki/oak_stripped_top.png` | Okorowany pień dębu |
| `bloki/ochre_plaster.png` | Tynk ochrowy |
| `bloki/olcha/deski.png` | Schody olchowe, Półblok olchowy, Furtka olchowa, Stół stolarski olchowy, Łóżko olchowe (pościelone), Łóżko olchowe (stelaż), Deski olchowe |
| `bloki/olcha/liscie.png` | Liście olchy |
| `bloki/olcha/okorowany_bok.png` | Okorowany pień olchy |
| `bloki/olcha/okorowany_gora.png` | Okorowany pień olchy |
| `bloki/olcha/opadle_liscie.png` | Opadłe liście olchy |
| `bloki/olcha/pien_bok.png` | Pień olchy |
| `bloki/olcha/pien_gora.png` | Pień olchy |
| `bloki/olcha/sadzonka.png` | Sadzonka olchy |
| `bloki/olcha/szyszki.png` | Szyszeczki olchy |
| `bloki/olcha_bark.png` | Kora olchy |
| `bloki/olive/leaves.png` | Liście oliwki, Liście oliwki (oliwki odrastają) |
| `bloki/olive/leaves_variant.png` | Liście oliwki z oliwkami |
| `bloki/olive/log_side.png` | Pień oliwki |
| `bloki/olive/log_top.png` | Pień oliwki |
| `bloki/olive/olives.png` | Oliwki |
| `bloki/olive/planks.png` | Schody oliwkowe, Półblok oliwkowy, Furtka oliwkowa, Stół stolarski oliwkowy, Łóżko oliwkowe (pościelone), Łóżko oliwkowe (stelaż), Deski oliwkowe |
| `bloki/olive/sapling.png` | Sadzonka oliwki |
| `bloki/olive/stripped_side.png` | Okorowany pień oliwki |
| `bloki/olive/stripped_top.png` | Okorowany pień oliwki |
| `bloki/olive_bark.png` | Kora oliwki |
| `bloki/pickaxe.png` | Kilof |
| `bloki/pickaxe_basalt.png` | Kilof bazaltowy |
| `bloki/pickaxe_granite.png` | Kilof granitowy |
| `bloki/pickaxe_limestone.png` | Kilof wapienny |
| `bloki/pickaxe_sandstone.png` | Kilof piaskowcowy |
| `bloki/pickaxe_slate.png` | Kilof łupkowy |
| `bloki/pine_bark.png` | Kora sosny |
| `bloki/pine_bark_overlay_dense.png` | - |
| `bloki/pine_bark_overlay_medium.png` | - |
| `bloki/pine_bark_overlay_sparse.png` | - |
| `bloki/pine_cone.png` | Szyszka sosny |
| `bloki/pine_leaves.png` | Igliwie sosny |
| `bloki/pine_log_resin_side.png` | Pień sosny z żywicą |
| `bloki/pine_log_side.png` | Pień sosny |
| `bloki/pine_log_top.png` | Pień sosny, Pień sosny (górny), Pień sosny z żywicą |
| `bloki/pine_log_transition_1.png` | - |
| `bloki/pine_log_transition_2.png` | - |
| `bloki/pine_log_transition_3.png` | - |
| `bloki/pine_log_upper_side.png` | Pień sosny (górny) |
| `bloki/pine_planks.png` | Schody sosnowe, Półblok sosnowy, Furtka sosnowa, Stół stolarski sosnowy, Łóżko sosnowe (pościelone), Łóżko sosnowe (stelaż), Deski sosnowe |
| `bloki/pine_sapling.png` | Sadzonka sosny |
| `bloki/pine_stripped_side.png` | Okorowany pień sosny |
| `bloki/pine_stripped_top.png` | Okorowany pień sosny |
| `bloki/plantain.png` | Babka zwyczajna |
| `bloki/polished_stone.png` | Polerowany kamień |
| `bloki/poppy.png` | Mak |
| `bloki/pumpkin_side.png` | Dynia |
| `bloki/pumpkin_top.png` | Dynia |
| `bloki/pumpkin_young_side.png` | Młoda dynia |
| `bloki/pumpkin_young_top.png` | Młoda dynia |
| `bloki/rainbow_eucalyptus/leaves.png` | Liście eukaliptusa |
| `bloki/rainbow_eucalyptus/log_side.png` | Pień eukaliptusa |
| `bloki/rainbow_eucalyptus/log_top.png` | Pień eukaliptusa |
| `bloki/rainbow_eucalyptus/planks.png` | Schody eukaliptusowe, Półblok eukaliptusowy, Furtka eukaliptusowa, Stół stolarski eukaliptusowy, Łóżko eukaliptusowe (pościelone), Łóżko eukaliptusowe (stelaż), Deski eukaliptusowe |
| `bloki/rainbow_eucalyptus/sapling.png` | Sadzonka eukaliptusa |
| `bloki/rainbow_eucalyptus/stripped_side.png` | Okorowany pień eukaliptusa |
| `bloki/rainbow_eucalyptus/stripped_top.png` | Okorowany pień eukaliptusa |
| `bloki/rainbow_eucalyptus_bark.png` | Kora eukaliptusa |
| `bloki/red_clay.png` | Czerwona glina |
| `bloki/red_clay_brick.png` | Czerwona cegła |
| `bloki/red_clay_bricks.png` | Czerwone cegły |
| `bloki/red_clay_cup.png` | Czerwony gliniany kubek |
| `bloki/reed.png` | Trzcina, Turzyca rzeczna, Pałka wodna, Pałka wodna (w wodzie) |
| `bloki/reindeer_lichen.png` | Chrobotek |
| `bloki/resin.png` | Żywica |
| `bloki/roasted_acorn.png` | Prażony żołądź |
| `bloki/roasted_apple.png` | Pieczone jabłko |
| `bloki/roasted_beechnuts.png` | Prażone orzeszki bukowe |
| `bloki/roasted_hazelnut.png` | Prażone orzechy laskowe |
| `bloki/roasted_pumpkin_slice.png` | Pieczona dynia |
| `bloki/roasted_zucchini.png` | Pieczona cukinia |
| `bloki/rope.png` | Sznur |
| `bloki/rosliny/amarantus/wiecha.png` | Wiecha amarantusa |
| `bloki/rosliny/barwinek/kwiat.png` | Kwiat barwinka |
| `bloki/rosliny/cynia/kwiat.png` | Kwiat cynii |
| `bloki/rosliny/dzwonek/kwiat.png` | Kwiat dzwonka |
| `bloki/rosliny/gorczyca/nasiona.png` | Nasiona gorczycy |
| `bloki/rosliny/huba/huba.png` | Huba |
| `bloki/rosliny/indygowiec/liscie.png` | Liście indygowca |
| `bloki/rosliny/kocanka/bukiet.png` | Bukiet kocanki |
| `bloki/rosliny/lawenda/bukiet.png` | Bukiet lawendy |
| `bloki/rosliny/len/wiazka.png` | Wiązka lnu |
| `bloki/rosliny/marzanna/korzen.png` | Korzeń marzanny |
| `bloki/rosliny/mikolajek/kwiat.png` | Kwiat mikołajka |
| `bloki/rosliny/nagietek/kwiat.png` | Kwiat nagietka |
| `bloki/rosliny/ochra/grudka.png` | Grudka żółtej ochry |
| `bloki/rosliny/piwonia/kwiat.png` | Kwiat piwonii |
| `bloki/rosliny/porostiglasty/galazki.png` | Gałązki porostu iglastego |
| `bloki/rosliny/porostoliwkowy/plecha.png` | Plecha porostu oliwkowego |
| `bloki/rosliny/szalwia/lisc.png` | Liście szałwii |
| `bloki/rosliny/zawilec/kwiat.png` | Kwiat zawilca |
| `bloki/sand.png` | Piasek |
| `bloki/sandstone_side.png` | Piaskowiec |
| `bloki/sandstone_top.png` | Piaskowiec |
| `bloki/scarf_linen.png` | Chusta lniana |
| `bloki/scarf_nettle.png` | Chusta pokrzywowa |
| `bloki/sequoia/cone.png` | Szyszka sekwoi |
| `bloki/sequoia/leaves.png` | Igliwie sekwoi, Igliwie sekwoi (szyszki odrastają) |
| `bloki/sequoia/leaves_variant.png` | Igliwie sekwoi z szyszkami |
| `bloki/sequoia/log_side.png` | Pień sekwoi |
| `bloki/sequoia/log_top.png` | Pień sekwoi |
| `bloki/sequoia/planks.png` | Schody sekwojowe, Półblok sekwojowy, Furtka sekwojowa, Stół stolarski sekwojowy, Łóżko sekwojowe (pościelone), Łóżko sekwojowe (stelaż), Deski sekwojowe |
| `bloki/sequoia/sapling.png` | Sadzonka sekwoi |
| `bloki/sequoia/stripped_side.png` | Okorowany pień sekwoi |
| `bloki/sequoia/stripped_top.png` | Okorowany pień sekwoi |
| `bloki/sequoia_bark.png` | Kora sekwoi |
| `bloki/sewing_table_top.png` | Stół krawiecki |
| `bloki/sewing_table_top_b.png` | Stół krawiecki |
| `bloki/shirt_linen.png` | Koszula lniana |
| `bloki/shirt_nettle.png` | Koszula pokrzywowa |
| `bloki/short_grass.png` | Krótka trawa |
| `bloki/shorts_linen.png` | Krótkie spodnie lniane |
| `bloki/shorts_nettle.png` | Krótkie spodnie pokrzywowe |
| `bloki/shovel.png` | Łopata |
| `bloki/shovel_basalt.png` | Łopata bazaltowa |
| `bloki/shovel_granite.png` | Łopata granitowa |
| `bloki/shovel_limestone.png` | Łopata wapienna |
| `bloki/shovel_sandstone.png` | Łopata piaskowcowa |
| `bloki/shovel_slate.png` | Łopata łupkowa |
| `bloki/shrub_aronia_flower.png` | Kwiaty aronii |
| `bloki/shrub_aronia_fruit.png` | Owoce aronii |
| `bloki/shrub_aronia_leaves.png` | Liście aronii, Liście aronii (po zbiorze) |
| `bloki/shrub_aronia_sapling.png` | Sadzonka aronii |
| `bloki/shrub_aronia_stem.png` | Pędy aronii |
| `bloki/shrub_aronia_stem_top.png` | Pędy aronii |
| `bloki/shrub_bramble_flower.png` | Kwiaty jeżyny |
| `bloki/shrub_bramble_fruit.png` | Owoce jeżyny |
| `bloki/shrub_bramble_fruit_alt.png` | - |
| `bloki/shrub_bramble_leaves.png` | Liście jeżyny, Liście jeżyny (po zbiorze) |
| `bloki/shrub_bramble_sapling.png` | Sadzonka jeżyny |
| `bloki/shrub_currant_flower.png` | Kwiaty porzeczki czerwonej, Kwiaty porzeczki czarnej |
| `bloki/shrub_currant_fruit.png` | Owoce porzeczki czerwonej |
| `bloki/shrub_currant_fruit_black.png` | Owoce porzeczki czarnej |
| `bloki/shrub_currant_leaves.png` | Liście porzeczki, Liście porzeczki czerwonej (po zbiorze), Liście porzeczki czarnej (po zbiorze) |
| `bloki/shrub_currant_sapling.png` | Sadzonka porzeczki czerwonej, Sadzonka porzeczki czarnej |
| `bloki/shrub_dog_rose_flower.png` | Kwiaty dzikiej róży |
| `bloki/shrub_dog_rose_fruit.png` | Owoce dzikiej róży |
| `bloki/shrub_dog_rose_leaves.png` | Liście dzikiej róży, Liście dzikiej róży (po zbiorze) |
| `bloki/shrub_dog_rose_sapling.png` | Sadzonka dzikiej róży |
| `bloki/shrub_elderberry_flower.png` | Kwiaty bzu czarnego |
| `bloki/shrub_elderberry_flower_top.png` | Kwiaty bzu czarnego |
| `bloki/shrub_elderberry_fruit.png` | Owoce bzu czarnego |
| `bloki/shrub_elderberry_fruit_top.png` | Owoce bzu czarnego |
| `bloki/shrub_elderberry_leaves.png` | Liście bzu czarnego, Liście bzu czarnego (po zbiorze) |
| `bloki/shrub_elderberry_sapling.png` | Sadzonka bzu czarnego |
| `bloki/shrub_elderberry_stem.png` | Pień bzu czarnego |
| `bloki/shrub_elderberry_stem_top.png` | Pień bzu czarnego |
| `bloki/shrub_elderberry_unripe.png` | Niedojrzałe owoce bzu czarnego |
| `bloki/shrub_elderberry_unripe_top.png` | Niedojrzałe owoce bzu czarnego |
| `bloki/shrub_gooseberry_flower.png` | Kwiaty agrestu, Kwiaty agrestu czerwonego |
| `bloki/shrub_gooseberry_fruit.png` | Owoce agrestu |
| `bloki/shrub_gooseberry_fruit_red.png` | Owoce agrestu czerwonego |
| `bloki/shrub_gooseberry_leaves.png` | Liście agrestu, Liście agrestu (po zbiorze), Liście agrestu czerwonego (po zbiorze) |
| `bloki/shrub_gooseberry_sapling.png` | Sadzonka agrestu, Sadzonka agrestu czerwonego |
| `bloki/shrub_gooseberry_stem.png` | Pień agrestu |
| `bloki/shrub_gooseberry_stem_top.png` | Pień agrestu |
| `bloki/shrub_hazel_flower.png` | Kwiaty leszczyny |
| `bloki/shrub_hazel_fruit.png` | Owoce leszczyny |
| `bloki/shrub_hazel_leaves.png` | Liście leszczyny, Liście leszczyny (po zbiorze) |
| `bloki/shrub_hazel_sapling.png` | Sadzonka leszczyny |
| `bloki/shrub_hazel_stem.png` | Pień leszczyny |
| `bloki/shrub_hazel_stem_top.png` | Pień leszczyny |
| `bloki/shrub_hazel_unripe.png` | Niedojrzałe owoce leszczyny |
| `bloki/shrub_highbush_blueberry_flower.png` | Kwiaty borówki wysokiej |
| `bloki/shrub_highbush_blueberry_fruit.png` | Owoce borówki wysokiej |
| `bloki/shrub_highbush_blueberry_leaves.png` | Liście borówki wysokiej, Liście borówki wysokiej (po zbiorze) |
| `bloki/shrub_highbush_blueberry_sapling.png` | Sadzonka borówki wysokiej |
| `bloki/shrub_raspberry_flower.png` | Kwiaty maliny, Kwiaty maliny żółtej |
| `bloki/shrub_raspberry_fruit.png` | Owoce maliny |
| `bloki/shrub_raspberry_fruit_yellow.png` | Owoce maliny żółtej |
| `bloki/shrub_raspberry_leaves.png` | Liście maliny, Liście maliny (po zbiorze), Liście maliny żółtej (po zbiorze) |
| `bloki/shrub_raspberry_sapling.png` | Sadzonka maliny, Sadzonka maliny żółtej |
| `bloki/shrub_sea_buckthorn_fruit.png` | Owoce rokitnika |
| `bloki/shrub_sea_buckthorn_leaves.png` | Liście rokitnika, Liście rokitnika (po zbiorze) |
| `bloki/shrub_sea_buckthorn_sapling.png` | Sadzonka rokitnika |
| `bloki/shrub_sea_buckthorn_stem.png` | Pień rokitnika |
| `bloki/shrub_sea_buckthorn_stem_top.png` | Pień rokitnika |
| `bloki/shrub_sea_buckthorn_unripe.png` | Niedojrzałe owoce rokitnika |
| `bloki/slate_side.png` | Łupek |
| `bloki/slate_top.png` | Łupek |
| `bloki/snow.png` | Śnieg, Warstwa śniegu |
| `bloki/sphagnum_green_side.png` | Torfowiec zielony |
| `bloki/sphagnum_green_tall_side.png` | Torfowiec zielony (kępa) |
| `bloki/sphagnum_green_tall_top.png` | - |
| `bloki/sphagnum_green_top.png` | - |
| `bloki/sphagnum_red_side.png` | Torfowiec czerwony |
| `bloki/sphagnum_red_tall_side.png` | Torfowiec czerwony (kępa) |
| `bloki/sphagnum_red_tall_top.png` | - |
| `bloki/sphagnum_red_top.png` | - |
| `bloki/spruce_bark.png` | Kora świerka |
| `bloki/spruce_cone.png` | Szyszka świerka |
| `bloki/spruce_leaves.png` | Igliwie świerka |
| `bloki/spruce_log_side.png` | Pień świerka |
| `bloki/spruce_log_top.png` | Pień świerka |
| `bloki/spruce_planks.png` | Schody świerkowe, Półblok świerkowy, Furtka świerkowa, Stół stolarski świerkowy, Łóżko świerkowe (pościelone), Łóżko świerkowe (stelaż), Deski świerkowe |
| `bloki/spruce_sapling.png` | Sadzonka świerka |
| `bloki/spruce_stripped_side.png` | Okorowany pień świerka |
| `bloki/spruce_stripped_top.png` | Okorowany pień świerka |
| `bloki/spruce_wreath.png` | Wieniec świerkowy |
| `bloki/stick.png` | Patyk |
| `bloki/stone.png` | Kamień |
| `bloki/straw.png` | Słoma |
| `bloki/strawberry.png` | - |
| `bloki/strawberry_bush_few.png` | - |
| `bloki/strawberry_bush_full.png` | - |
| `bloki/tall_grass.png` | Wysoka trawa |
| `bloki/tea_calm.png` | Napar na sen |
| `bloki/tea_heal.png` | Napar leczniczy |
| `bloki/tea_vigor.png` | Napar wzmacniający |
| `bloki/terracotta.png` | Terakota |
| `bloki/tilled_coarse.png` | Rozgrzebana ziemia kamienista |
| `bloki/tilled_compost.png` | Pole z kompostem |
| `bloki/tilled_dirt.png` | Rozgrzebana ziemia |
| `bloki/tilled_humus.png` | Rozgrzebany czarnoziem |
| `bloki/tool_handle_source.png` | - |
| `bloki/torch.png` | Pochodnia |
| `bloki/torch_black.png` | Pochodnia czarna |
| `bloki/torch_blue.png` | Pochodnia niebieska |
| `bloki/torch_brown.png` | Pochodnia brązowa |
| `bloki/torch_cyan.png` | Pochodnia turkusowa |
| `bloki/torch_gray.png` | Pochodnia szara |
| `bloki/torch_green.png` | Pochodnia zielona |
| `bloki/torch_light_blue.png` | Pochodnia jasnoniebieska |
| `bloki/torch_light_gray.png` | Pochodnia jasnoszara |
| `bloki/torch_lime.png` | Pochodnia limonkowa |
| `bloki/torch_magenta.png` | Pochodnia purpurowa |
| `bloki/torch_orange.png` | Pochodnia pomarańczowa |
| `bloki/torch_pink.png` | Pochodnia różowa |
| `bloki/torch_purple.png` | Pochodnia fioletowa |
| `bloki/torch_red.png` | Pochodnia czerwona |
| `bloki/torch_white.png` | Pochodnia biała |
| `bloki/torch_yellow.png` | Pochodnia żółta |
| `bloki/trapdoor_acacia.png` | Klapa z akacji |
| `bloki/trapdoor_acacia_bottom.png` | - |
| `bloki/trapdoor_acacia_edge.png` | - |
| `bloki/trapdoor_araucaria.png` | Klapa araukariowa |
| `bloki/trapdoor_araucaria_bottom.png` | - |
| `bloki/trapdoor_araucaria_edge.png` | - |
| `bloki/trapdoor_aspen.png` | Klapa osikowa |
| `bloki/trapdoor_aspen_bottom.png` | - |
| `bloki/trapdoor_aspen_edge.png` | - |
| `bloki/trapdoor_bald_cypress.png` | Klapa z cypryśnika |
| `bloki/trapdoor_bald_cypress_bottom.png` | - |
| `bloki/trapdoor_bald_cypress_edge.png` | - |
| `bloki/trapdoor_banyan.png` | Klapa figowcowa |
| `bloki/trapdoor_banyan_bottom.png` | - |
| `bloki/trapdoor_banyan_edge.png` | - |
| `bloki/trapdoor_baobab.png` | Klapa baobabowa |
| `bloki/trapdoor_baobab_bottom.png` | - |
| `bloki/trapdoor_baobab_edge.png` | - |
| `bloki/trapdoor_beech.png` | Klapa bukowa |
| `bloki/trapdoor_beech_bottom.png` | - |
| `bloki/trapdoor_beech_edge.png` | - |
| `bloki/trapdoor_birch.png` | Klapa brzozowa |
| `bloki/trapdoor_birch_bottom.png` | - |
| `bloki/trapdoor_birch_edge.png` | - |
| `bloki/trapdoor_bristlecone.png` | Klapa z sosny ościstej |
| `bloki/trapdoor_bristlecone_bottom.png` | - |
| `bloki/trapdoor_bristlecone_edge.png` | - |
| `bloki/trapdoor_cedar.png` | Klapa cedrowa |
| `bloki/trapdoor_cedar_bottom.png` | - |
| `bloki/trapdoor_cedar_edge.png` | - |
| `bloki/trapdoor_cherry.png` | Klapa wiśniowa |
| `bloki/trapdoor_cherry_bottom.png` | - |
| `bloki/trapdoor_cherry_edge.png` | - |
| `bloki/trapdoor_coconut_palm.png` | Klapa palmowa |
| `bloki/trapdoor_coconut_palm_bottom.png` | - |
| `bloki/trapdoor_coconut_palm_edge.png` | - |
| `bloki/trapdoor_dark.png` | Klapa z ciemnego drewna |
| `bloki/trapdoor_dark_bottom.png` | - |
| `bloki/trapdoor_dark_edge.png` | - |
| `bloki/trapdoor_dragon_tree.png` | Klapa z draceny |
| `bloki/trapdoor_dragon_tree_bottom.png` | - |
| `bloki/trapdoor_dragon_tree_edge.png` | - |
| `bloki/trapdoor_fir.png` | Klapa jodłowa |
| `bloki/trapdoor_fir_bottom.png` | - |
| `bloki/trapdoor_fir_edge.png` | - |
| `bloki/trapdoor_ginkgo.png` | Klapa miłorzębowa |
| `bloki/trapdoor_ginkgo_bottom.png` | - |
| `bloki/trapdoor_ginkgo_edge.png` | - |
| `bloki/trapdoor_jablon.png` | Klapa jabłoniowa |
| `bloki/trapdoor_jablon_bottom.png` | - |
| `bloki/trapdoor_jablon_edge.png` | - |
| `bloki/trapdoor_jacaranda.png` | Klapa jakarandowa |
| `bloki/trapdoor_jacaranda_bottom.png` | - |
| `bloki/trapdoor_jacaranda_edge.png` | - |
| `bloki/trapdoor_joshua_tree.png` | Klapa z jukki |
| `bloki/trapdoor_joshua_tree_bottom.png` | - |
| `bloki/trapdoor_joshua_tree_edge.png` | - |
| `bloki/trapdoor_kapok.png` | Klapa z puchowca |
| `bloki/trapdoor_kapok_bottom.png` | - |
| `bloki/trapdoor_kapok_edge.png` | - |
| `bloki/trapdoor_larch.png` | Klapa modrzewiowa |
| `bloki/trapdoor_larch_bottom.png` | - |
| `bloki/trapdoor_larch_edge.png` | - |
| `bloki/trapdoor_linden.png` | Klapa lipowa |
| `bloki/trapdoor_linden_bottom.png` | - |
| `bloki/trapdoor_linden_edge.png` | - |
| `bloki/trapdoor_mangrove.png` | Klapa namorzynowa |
| `bloki/trapdoor_mangrove_bottom.png` | - |
| `bloki/trapdoor_mangrove_edge.png` | - |
| `bloki/trapdoor_maple.png` | Klapa klonowa |
| `bloki/trapdoor_maple_bottom.png` | - |
| `bloki/trapdoor_maple_edge.png` | - |
| `bloki/trapdoor_mugo.png` | Klapa z kosodrzewiny |
| `bloki/trapdoor_mugo_bottom.png` | - |
| `bloki/trapdoor_mugo_edge.png` | - |
| `bloki/trapdoor_oak.png` | Klapa dębowa |
| `bloki/trapdoor_oak_bottom.png` | - |
| `bloki/trapdoor_oak_edge.png` | - |
| `bloki/trapdoor_olcha.png` | Klapa olchowa |
| `bloki/trapdoor_olcha_bottom.png` | - |
| `bloki/trapdoor_olcha_edge.png` | - |
| `bloki/trapdoor_olive.png` | Klapa oliwkowa |
| `bloki/trapdoor_olive_bottom.png` | - |
| `bloki/trapdoor_olive_edge.png` | - |
| `bloki/trapdoor_pine.png` | Klapa sosnowa |
| `bloki/trapdoor_pine_bottom.png` | - |
| `bloki/trapdoor_pine_edge.png` | - |
| `bloki/trapdoor_rainbow_eucalyptus.png` | Klapa eukaliptusowa |
| `bloki/trapdoor_rainbow_eucalyptus_bottom.png` | - |
| `bloki/trapdoor_rainbow_eucalyptus_edge.png` | - |
| `bloki/trapdoor_sequoia.png` | Klapa sekwojowa |
| `bloki/trapdoor_sequoia_bottom.png` | - |
| `bloki/trapdoor_sequoia_edge.png` | - |
| `bloki/trapdoor_spruce.png` | Klapa świerkowa |
| `bloki/trapdoor_spruce_bottom.png` | - |
| `bloki/trapdoor_spruce_edge.png` | - |
| `bloki/trapdoor_wierzba.png` | Klapa wierzbowa |
| `bloki/trapdoor_wierzba_bottom.png` | - |
| `bloki/trapdoor_wierzba_edge.png` | - |
| `bloki/trousers_linen.png` | Spodnie lniane |
| `bloki/trousers_nettle.png` | Spodnie pokrzywowe |
| `bloki/tunic_linen.png` | Tunika lniana |
| `bloki/tunic_nettle.png` | Tunika pokrzywowa |
| `bloki/vest_bast.png` | Kamizelka z łyka |
| `bloki/vest_linen.png` | Kamizelka lniana |
| `bloki/vest_nettle.png` | Kamizelka pokrzywowa |
| `bloki/water.png` | Woda, Płynąca woda |
| `bloki/wet_clay_bowl.png` | Mokra miska z gliny |
| `bloki/wet_clay_brick.png` | Mokra cegła z gliny |
| `bloki/wet_clay_cup.png` | Mokry kubek z gliny |
| `bloki/wet_clay_pot.png` | Mokry garnek z gliny |
| `bloki/wet_red_clay_brick.png` | Mokra cegła z czerwonej gliny |
| `bloki/wet_red_clay_cup.png` | Mokry kubek z czerwonej gliny |
| `bloki/wet_white_clay_brick.png` | Mokra cegła z białej gliny |
| `bloki/wet_white_clay_cup.png` | Mokry kubek z białej gliny |
| `bloki/white_clay.png` | Biała glina |
| `bloki/white_clay_brick.png` | Biała cegła |
| `bloki/white_clay_bricks.png` | Białe cegły |
| `bloki/white_clay_cup.png` | Biały gliniany kubek |
| `bloki/wierzba/bazie.png` | Bazie |
| `bloki/wierzba/deski.png` | Schody wierzbowe, Półblok wierzbowy, Furtka wierzbowa, Stół stolarski wierzbowy, Łóżko wierzbowe (pościelone), Łóżko wierzbowe (stelaż), Deski wierzbowe |
| `bloki/wierzba/liscie.png` | Liście wierzby |
| `bloki/wierzba/okorowany_bok.png` | Okorowany pień wierzby |
| `bloki/wierzba/okorowany_gora.png` | Okorowany pień wierzby |
| `bloki/wierzba/opadle_liscie.png` | Opadłe liście wierzby |
| `bloki/wierzba/pien_bok.png` | Pień wierzby |
| `bloki/wierzba/pien_gora.png` | Pień wierzby |
| `bloki/wierzba/sadzonka.png` | Sadzonka wierzby |
| `bloki/wierzba_bark.png` | Kora wierzby |
