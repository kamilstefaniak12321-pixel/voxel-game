# Wzorzec drewna i narzędzi od 0.70.0

Podstawą są ręczne tekstury Kamila z `terrain (2).png`, przekazane
6 listopada 2026 r. Atlas w grze zachowuje ich oryginalne piksele.
Siatka materiału to **16 × 16 pikseli na blok**; skalowanie podglądu
powinno używać najbliższego sąsiada, bez rozmywania krawędzi.

## Deski

Kolejne gatunki mają korzystać z tego samego schematu:

- Cztery poziome pasy, każdy wysoki na 4 piksele: 3 piksele drewna
  i 1 piksel spokojnego, ciemniejszego łączenia.
- Pionowe łączenia są przesunięte między sąsiednimi pasami. Nie tworzą
  jednej pionowej kreski przechodzącej przez cały blok.
- Niewielka paleta jednego odcienia, jasna górna krawędź i delikatne
  podłużne usłojenie. Światło w grze dodaje główne cieniowanie.
- Bez czarnych obrysów i przypadkowych kontrastowych kropek. Ewentualne
  przyszłe sęki powinny być subtelne i wydłużone wzdłuż deski.
- Odcień odróżnia gatunki, a układ desek pozostaje wspólny. Nowy wariant
  trzeba obejrzeć także jako powtarzającą się ścianę i podłogę.

Wzorzec techniczny to region `spruce_planks` w `assets/textures/drzewa.png`.
Położenie podaje `assets/textures/atlas.json`. Funkcja `planks()`
w `tools/tekstury_drzew.py` przenosi jego względną jasność na wybrany
kolor drewna. Zachowuje układ pikseli. Nowy region dodaje się do wspólnego
arkusza i katalogu — mechanizm osobnych paczek drzew został usunięty.

Nie uruchamiaj zbiorczego generatora tylko po to, by poprawić jedne deski.
Do wycięcia i wklejenia pojedynczego regionu służy `tools/atlasy.py`.
Pełny opis: [arkusze tekstur](tekstury-atlasy.md).

## Narzędzia i patyk

Kształty bazowe pochodzą z nowego atlasu: siekiera `(13, 8)`, kilof
`(1, 9)`, łopata `(2, 9)` i patyk `(0, 9)`. Dodatkowy wzorzec trzonka
leży w `(0, 10)`. Współrzędne oznaczają kolumnę i wiersz kafelka.

Wariant materiału zmienia głowicę narzędzia. Zachowuje jej obrys,
czytelne ostrze oraz istniejące światła i cienie. Drewniany trzonek
z kolorami `#96683C` i `#704C2C` pozostaje drewniany; nie należy
barwić całej ikonki kolorem kamienia. W ekwipunku i ręce używa się
tej samej tekstury. Nowy materiał nie oznacza automatycznie zmiany
siły, trwałości lub zasad działania narzędzia.

## Kora sosny i mech

Pomarańczowa kora sosny korzysta z trzech autorskich nakładek brązowej
kory: `(14, 5)` gęsta, `(15, 5)` pośrednia, `(15, 6)` rzadka.
Kolejność od dolnego, brązowego pnia w górę to gęsta → pośrednia →
rzadka → sama pomarańczowa kora. Jest to wygląd istniejących bloków,
bez nowych identyfikatorów bloków. Plik `sosna przejście.png` jest
podglądem tego układu; właściwe nakładki są w atlasie.

Mech dywanowy ma trzy warianty w `(7, 9)`, `(8, 9)` i `(9, 9)`.
Wariant wizualny zależy od pozycji, aby nie zmieniał się po ponownym
wczytaniu świata. Puste piksele pozostają przezroczyste.

## Pochodzenie wzorców

Pliki są autorskimi materiałami Kamila, a nie nową paczką zewnętrznego
twórcy. Odciski SHA256 oryginalnych plików pozwalają sprawdzić, że nie
zmieniono ręcznego rysunku podczas importu:

| Plik | SHA256 |
| --- | --- |
| `terrain (2).png` | `effda1cba123324a372ceffe196475b50f63bde7fdc8b20402be6e2f9eb4e1c8` |
| `sosna przejście.png` | `1d8e714a07d4f5bd37cd879a1068dce26083470f044ba6dcacdefa0745cf21db` |
