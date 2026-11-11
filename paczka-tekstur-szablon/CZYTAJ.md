# Paczka tekstur - szablon (Voxel Game 0.85.0)

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
| `bloki/acacia/leaves.png` | Liście akacji |
| `bloki/acacia/leaves_variant.png` | Kwitnące liście akacji |
| `bloki/acacia/log_side.png` | Pień akacji |
| `bloki/acacia/log_top.png` | Pień akacji |
| `bloki/acacia/planks.png` | Deski akacji |
| `bloki/acacia/sapling.png` | Sadzonka akacji |
| `bloki/acacia/stripped_side.png` | Okorowany pień akacji |
| `bloki/acacia/stripped_top.png` | Okorowany pień akacji |
| `bloki/acorn.png` | Żołądź |
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
| `bloki/bald_cypress/planks.png` | Deski cypryśnika |
| `bloki/bald_cypress/sapling.png` | Sadzonka cypryśnika |
| `bloki/bald_cypress/stripped_side.png` | Okorowany pień cypryśnika |
| `bloki/bald_cypress/stripped_top.png` | Okorowany pień cypryśnika |
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
| `bloki/blackberry.png` | - |
| `bloki/blackberry_bush_few.png` | - |
| `bloki/blackberry_bush_full.png` | - |
| `bloki/blueberry.png` | - |
| `bloki/blueberry_bush.png` | - |
| `bloki/blueberry_bush_few.png` | - |
| `bloki/blueberry_bush_full.png` | - |
| `bloki/bush_leaves.png` | - |
| `bloki/bush_sapling.png` | - |
| `bloki/chamomile.png` | Rumianek |
| `bloki/cherry/leaves.png` | Liście wiśni |
| `bloki/cherry/leaves_variant.png` | Liście wiśni — rzadsze kwiaty |
| `bloki/cherry/log_side.png` | Pień wiśni |
| `bloki/cherry/log_top.png` | Pień wiśni |
| `bloki/cherry/planks.png` | Deski wiśni |
| `bloki/cherry/sapling.png` | Sadzonka wiśni |
| `bloki/cherry/stripped_side.png` | Okorowany pień wiśni |
| `bloki/cherry/stripped_top.png` | Okorowany pień wiśni |
| `bloki/chili_bush_few.png` | - |
| `bloki/chili_bush_full.png` | - |
| `bloki/chili_pepper.png` | - |
| `bloki/clay.png` | Glina |
| `bloki/clover.png` | Koniczyna, Grzybień biały, Rzęsa wodna |
| `bloki/coarse_dirt.png` | Ziemia kamienista |
| `bloki/cornflower.png` | Chaber, Krwawnica pospolita |
| `bloki/crocus.png` | Krokus |
| `bloki/dandelion.png` | Mniszek |
| `bloki/dark_planks.png` | Ciemne deski |
| `bloki/dirt.png` | Ziemia |
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
| `bloki/fern.png` | Paproć, Wywłócznik |
| `bloki/forest_floor_side.png` | Ściółka leśna |
| `bloki/forest_floor_top.png` | Ściółka leśna |
| `bloki/ginkgo/leaves.png` | Liście miłorzębu |
| `bloki/ginkgo/leaves_variant.png` | Liście miłorzębu — jasne złoto |
| `bloki/ginkgo/log_side.png` | Pień miłorzębu |
| `bloki/ginkgo/log_top.png` | Pień miłorzębu |
| `bloki/ginkgo/planks.png` | Deski miłorzębowe |
| `bloki/ginkgo/sapling.png` | Sadzonka miłorzębu |
| `bloki/ginkgo/stripped_side.png` | Okorowany pień miłorzębu |
| `bloki/ginkgo/stripped_top.png` | Okorowany pień miłorzębu |
| `bloki/granite.png` | Granit |
| `bloki/grass_side.png` | Blok trawy |
| `bloki/grass_top.png` | Blok trawy |
| `bloki/gravel.png` | Żwir |
| `bloki/hazel_bush_few.png` | - |
| `bloki/hazel_bush_full.png` | - |
| `bloki/hazelnut.png` | - |
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
| `bloki/jacaranda/leaves.png` | Liście jakarandy |
| `bloki/jacaranda/leaves_variant.png` | Liście jakarandy — jasne kwiaty |
| `bloki/jacaranda/log_side.png` | Pień jakarandy |
| `bloki/jacaranda/log_top.png` | Pień jakarandy |
| `bloki/jacaranda/planks.png` | Deski jakarandowe |
| `bloki/jacaranda/sapling.png` | Sadzonka jakarandy |
| `bloki/jacaranda/stripped_side.png` | Okorowany pień jakarandy |
| `bloki/jacaranda/stripped_top.png` | Okorowany pień jakarandy |
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
| `bloki/maple/leaf_litter.png` | Opadłe liście klonu |
| `bloki/maple/leaves.png` | Liście klonu |
| `bloki/maple/leaves_variant.png` | Złote liście klonu |
| `bloki/maple/log_side.png` | Pień klonu |
| `bloki/maple/log_top.png` | Pień klonu |
| `bloki/maple/planks.png` | Deski klonowe |
| `bloki/maple/sapling.png` | Sadzonka klonu |
| `bloki/maple/stripped_side.png` | Okorowany pień klonu |
| `bloki/maple/stripped_top.png` | Okorowany pień klonu |
| `bloki/meteorite.png` | Meteoryt |
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
| `bloki/models/rosliny/sadzonka-brzoza/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-buk/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-cyprysnik/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-dab/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-eukaliptus/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jablon/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-jakaranda/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-klon/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-kosodrzewina/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-lipa/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-milorzab/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-olcha/polrealistyczny.png` | - |
| `bloki/models/rosliny/sadzonka-oliwka/polrealistyczny.png` | - |
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
| `bloki/mugo/planks.png` | Deski z kosodrzewiny |
| `bloki/mugo/sapling.png` | Sadzonka kosodrzewiny |
| `bloki/mugo/stripped_side.png` | Okorowany pień kosodrzewiny |
| `bloki/mugo/stripped_top.png` | Okorowany pień kosodrzewiny |
| `bloki/nettle.png` | Pokrzywa |
| `bloki/oak_leaf_litter.png` | Opadłe liście dębu |
| `bloki/oak_leaves.png` | Liście dębu |
| `bloki/oak_log_side.png` | Ognisko, Pień dębu |
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
| `bloki/olive/leaves.png` | Liście oliwki, Liście oliwki (oliwki odrastają) |
| `bloki/olive/leaves_variant.png` | Liście oliwki z oliwkami |
| `bloki/olive/log_side.png` | Pień oliwki |
| `bloki/olive/log_top.png` | Pień oliwki |
| `bloki/olive/olives.png` | Oliwki |
| `bloki/olive/planks.png` | Deski oliwkowe |
| `bloki/olive/sapling.png` | Sadzonka oliwki |
| `bloki/olive/stripped_side.png` | Okorowany pień oliwki |
| `bloki/olive/stripped_top.png` | Okorowany pień oliwki |
| `bloki/pickaxe.png` | Kilof |
| `bloki/pickaxe_basalt.png` | Kilof bazaltowy |
| `bloki/pickaxe_granite.png` | Kilof granitowy |
| `bloki/pickaxe_limestone.png` | Kilof wapienny |
| `bloki/pickaxe_sandstone.png` | Kilof piaskowcowy |
| `bloki/pickaxe_slate.png` | Kilof łupkowy |
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
| `bloki/pine_planks.png` | Deski sosnowe |
| `bloki/pine_sapling.png` | Sadzonka sosny |
| `bloki/pine_stripped_side.png` | Okorowany pień sosny |
| `bloki/pine_stripped_top.png` | Okorowany pień sosny |
| `bloki/plantain.png` | Babka zwyczajna |
| `bloki/polished_stone.png` | Polerowany kamień |
| `bloki/poppy.png` | Mak |
| `bloki/rainbow_eucalyptus/leaves.png` | Liście eukaliptusa |
| `bloki/rainbow_eucalyptus/log_side.png` | Pień eukaliptusa |
| `bloki/rainbow_eucalyptus/log_top.png` | Pień eukaliptusa |
| `bloki/rainbow_eucalyptus/planks.png` | Deski eukaliptusowe |
| `bloki/rainbow_eucalyptus/sapling.png` | Sadzonka eukaliptusa |
| `bloki/rainbow_eucalyptus/stripped_side.png` | Okorowany pień eukaliptusa |
| `bloki/rainbow_eucalyptus/stripped_top.png` | Okorowany pień eukaliptusa |
| `bloki/reed.png` | Trzcina, Turzyca rzeczna, Pałka wodna, Pałka wodna (w wodzie) |
| `bloki/resin.png` | Żywica |
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
| `bloki/sequoia/cone.png` | Szyszka sekwoi |
| `bloki/sequoia/leaves.png` | Igliwie sekwoi, Igliwie sekwoi (szyszki odrastają) |
| `bloki/sequoia/leaves_variant.png` | Igliwie sekwoi z szyszkami |
| `bloki/sequoia/log_side.png` | Pień sekwoi |
| `bloki/sequoia/log_top.png` | Pień sekwoi |
| `bloki/sequoia/planks.png` | Deski sekwojowe |
| `bloki/sequoia/sapling.png` | Sadzonka sekwoi |
| `bloki/sequoia/stripped_side.png` | Okorowany pień sekwoi |
| `bloki/sequoia/stripped_top.png` | Okorowany pień sekwoi |
| `bloki/short_grass.png` | Krótka trawa |
| `bloki/shovel.png` | Łopata |
| `bloki/shovel_basalt.png` | Łopata bazaltowa |
| `bloki/shovel_granite.png` | Łopata granitowa |
| `bloki/shovel_limestone.png` | Łopata wapienna |
| `bloki/shovel_sandstone.png` | Łopata piaskowcowa |
| `bloki/shovel_slate.png` | Łopata łupkowa |
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
| `bloki/strawberry.png` | - |
| `bloki/strawberry_bush_few.png` | - |
| `bloki/strawberry_bush_full.png` | - |
| `bloki/tall_grass.png` | Wysoka trawa |
| `bloki/terracotta.png` | Terakota |
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
| `bloki/water.png` | Woda, Płynąca woda |
| `bloki/wierzba/bazie.png` | Bazie |
| `bloki/wierzba/deski.png` | Deski wierzbowe |
| `bloki/wierzba/liscie.png` | Liście wierzby |
| `bloki/wierzba/okorowany_bok.png` | Okorowany pień wierzby |
| `bloki/wierzba/okorowany_gora.png` | Okorowany pień wierzby |
| `bloki/wierzba/opadle_liscie.png` | Opadłe liście wierzby |
| `bloki/wierzba/pien_bok.png` | Pień wierzby |
| `bloki/wierzba/pien_gora.png` | Pień wierzby |
| `bloki/wierzba/sadzonka.png` | Sadzonka wierzby |
