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

## Drzwi i klapy (1.16.0)

Wzorcem wszystkich drzwi i klap są rysunki Kamila na deskach wiśni:
`tools/wzorce/drzwi.png` i `tools/wzorce/zapadnia.png` (tekstury modelu
`tools/wzorce/drzwi-i-zapadnia.bbmodel`).

- Poziome deski w pasach po 4 piksele - jak deski bloku: wiersz szpary,
  dwa wiersze drewna, wiersz cienia. Pionowe łączenia przesunięte.
- Siedem tonów: dwa na klamkę (najciemniejsze), dwa na szpary, cień,
  deska, połysk. Bez czarnych obrysów i bez żelaza.
- Klamka drzwi: ciemny kwadrat 3 × 3 naprzeciw zawiasu, w połowie
  wysokości. Uchwyt klapy: ciemna wnęka przy brzegu naprzeciw zawiasu.
- Przód i tył drzwi oraz wierzch i spód klapy to osobne rysunki,
  krawędzie mają tylko kolory szpar.

Nowe drewno dostaje te same rysunki w swoich kolorach przez
`tools/drzwi_tekstury.py` (cztery tony z desek gatunku, reszta
w proporcjach wzorca). Nie rysuj drzwi gatunku od zera - zmiana wyglądu
wszystkich drzwi to zmiana wzorca i ponowne uruchomienie narzędzia.

Pęknięcia kopanych bloków (`tools/wzorce/pekniecia.png`,
`pekniecia_wysokie.png`) to szare, półprzezroczyste piksele (kolor 154,
krycie 184-249 z 255): gra przyciemnia nimi teksturę bloku. Osiem klatek
w siatce 4 × 2, pierwsza z lewej u góry.

## Ikonki owoców i orzechów (1.28.0)

Wzorzec od Kamila: poradnik „jak teksturować jak w Minecrafcie"
(jabłko i gruszka w czterech krokach). Wszystkie 29 owoców i orzechów
rysuje `tools/owoce_ikony.py`:

1. **Kształt** - sylwetka narysowana piksel po pikselu (mapa znaków
   16 × 16; każda litera to jedna część: owoc, listek, szypułka, kolejne
   jagody w kiści - od tyłu do przodu). Dobry kształt wygląda dobrze już
   w jednej barwie.
2. **Kontur** - ciemniejszy i bardziej nasycony niż baza. Część z tyłu
   nie dostaje konturu tam, gdzie zasłania ją część z przodu (jedna
   kreska między jagodami, nie dwie).
3. **Cieniowanie** - światło z lewej góry. Ciemniejsze odcienie są
   bardziej nasycone i przesunięte ku błękitowi, jaśniejsze - mniej
   nasycone i ku żółci (paleta `ramp`). Udział odcieni stały: mało
   najjaśniejszego, najwięcej bazy, do tego połysk (1-3 piksele).
4. **Brud** - na granicy dwóch odcieni piksele się przeplatają, trochę
   losowo; górny kontur ma dwa jaśniejsze odcienie, dolny - drugi,
   ciemniejszy kolor konturu.

Szczegóły (pestki truskawki, guzki maliny i jeżyny, korona borówki,
żyłki agrestu) to kropki dokładane po cieniowaniu. Pieczona dynia
i cukinia powstają z nowych ikonek (`niskie_tekstury.roasted`).
`tools/krzewy_tekstury.py` i `tools/niskie_tekstury.py` tych kafelków
nie nadpisują (`owoce_ikony.OWNED`).

    python3 tools/owoce_ikony.py                 # do atlasu
    python3 tools/owoce_ikony.py podglad out.png # obecne obok nowych
    python3 tools/owoce_ikony.py kroki out.png   # cztery kroki

## Pochodzenie wzorców

Pliki są autorskimi materiałami Kamila, a nie nową paczką zewnętrznego
twórcy. Odciski SHA256 oryginalnych plików pozwalają sprawdzić, że nie
zmieniono ręcznego rysunku podczas importu:

| Plik | SHA256 |
| --- | --- |
| `terrain (2).png` | `effda1cba123324a372ceffe196475b50f63bde7fdc8b20402be6e2f9eb4e1c8` |
| `sosna przejście.png` | `1d8e714a07d4f5bd37cd879a1068dce26083470f044ba6dcacdefa0745cf21db` |
| `drzwi i zapadnia.bbmodel` | `1568d0a96a18aa1a0f5f7a75417e6ae4d11666faa3ef509e0ce97d0163021528` |
| `drzwi.png` | `cb30178e668b836c7008ed7282c2bf351edcbe30f2f3a010323fd8e77395678c` |
| `zapadnia.png` | `a75e59a4fb0906cee16fb9b53193c900f4ea9e1334946d04d30aa9e73e6a1580` |
| `niszczenie_bloku.png` | `f8264b628e79349b4007de1a4fcdbacacd518d9781c873c91900cc0f066671be` |
| `niszczenie_dwublokowych_moodeli.png` | `a8658a341185f67497383d3914b35bd5550966a50a700bf80b33f6f33d8e805c` |
