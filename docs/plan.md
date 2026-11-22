# Plan kolejnych wersji

Ustalony z Kamilem 19.11.2026. Kolejność może się zmienić - ten plik to
pamięć, nie umowa. Po każdej wydanej wersji wpis przechodzi do
`CHANGELOG.md`.

## Teraz

- **1.35.0 - Pochodnie i deszcz** (PR #188): ostatni kawałek części A.
  Pochodnie się wypalają (godzina, przygasanie, ogarek, dolewanie
  żywicy), łuczywo, deszcz gasi pochodnie pod gołym niebem, chłodzi
  ognisko i gasi słabe ([pochodnie.md](pochodnie.md),
  [ogniska.md](ogniska.md)).

- **1.36.0 - Ścinanie drzew** (PR #189): pierwsza wersja części B.
  Siekiera w pień żywego drzewa to cios; rośnie karb, drzewo pada od
  gracza jako jedna bryła, zostaje pniak, leżący pień i konary
  ([scinanie.md](scinanie.md)).

- **1.37.0 - Powalone drzewa** (PR #190): druga wersja części B. Stare
  pnie w lesie (i zawsze jeden przy starcie) jako pierwsze drewno,
  spróchniałe drewno i próchno, które niesie żar; gołą ręką żywego
  drzewa już się nie zetnie; nowy samouczek
  ([powalone-drzewa.md](powalone-drzewa.md)).

- **1.38.0 - Kozły** (PR #191): trzecia wersja części B - część B cała.
  Kozioł z 3 konarów na obu końcach leżącego pnia: pień tnie się 3 razy
  szybciej, a kucając łupie się go od razu na opał ([kozly.md](kozly.md)).

- **1.39.0 - Twardość siekier** (PR #192): pierwsza wersja części C.
  Skała siekiery ma twardość: tnie drewno najwyżej półtora raza twardsze
  od siebie, zużywa się (pasek pod ikonką) i pęka, zostawiając patyk
  ([narzedzia.md](narzedzia.md)).

- **1.40.0 - Kołysanie drzew** (PR #193): druga wersja części C - część
  C cała. Pień z koroną wygina się z wiatrem, zależnie od gatunku
  i pogody; liczy to karta graficzna ([kolysanie.md](kolysanie.md)).

- **1.41.0 - Dary pnia: żywica i soki** (PR #194): pierwsza wersja
  części D. Nacięcie nożem w pniu żywego drzewa: żywica z iglastych,
  soki (brzoza, klon, palma) i woda z baobabu do glinianego kubka,
  zależnie od pory roku i doby; syrop klonowy ([dary-pnia.md](dary-pnia.md)).

## Dalej

**Drewno, ogień i ścinanie drzew** - duży projekt Kamila, uzgodniony
21.11.2026 ([drewno.md](drewno.md)). Sześć części; pierwsza (A) jest
w grze cała (1.32.0 - cechy i ognisko, 1.33.0 - wilgotność, 1.34.0 -
drewutnia, 1.35.0 - pochodnie i deszcz) i druga (B) są w grze całe
(1.36.0 - ścinanie, 1.37.0 - powalone drzewa, 1.38.0 - kozły). Zostało:

- ~~B3 - Kozły~~: obróbka leżącego pnia (kłody, opał, okorowanie).
- **C - Narzędzia i kołysanie**: twardość skał, widoczne zużycie,
  kołysanie drzew.
- **D - Dary pnia**: soki, żywice, guma, łyko - nacinanie nożem.
- **E - Pożar**: płonące drzewa i trawa, piorun, popiół, zwęglone pnie.
- **F - Metal meteorytowy**: węgiel drzewny, dymarka, narzędzia.

## Później

- Barwniki na kolejnych rzeczach.
- Kamienne kształty (schody, płyty, murki).
- Pogoda, część 6.
- Kompostownik i inne rodzaje kompostu (`blocks/fertilizers.js`).
- Reszta paczki roślin: rząd tyczek w kształcie A, biała fasola, białe
  winogrona, kiwi ostrolistne, żółta marakuja; potrawy z fasoli i grochu.

## Odpowiedzi Kamila

- Drewno (21.11.2026): wszystkie polecane warianty z
  [drewno.md](drewno.md) - drzewo pada od gracza, kozły nieobowiązkowe,
  olbrzymy tylko metalem (baobab wcale), budowle na początek nie płoną
  i jest ustawienie świata; **pochodnie mają się wypalać**; najpierw
  fasola i groch, potem drewno.
- Drewno, dopowiedzenia (21.11.2026): pod padającym drzewem
  **ogłuszenie jak pod wodą, tylko urwane** - nagłe skupienie na
  drzewie, „ciach" i ciemność. **Pierwsze drewno z powalonego drzewa**,
  które leży w lesie (pomysł Kamila; wejdzie ze ścinaniem). Gołą ręką
  bierze się z niego **gałęzie, korę i spróchniałe drewno** (polano na
  start, próchno do noszenia żaru i jako nawóz - [drewno.md](drewno.md),
  rozdział 9); zdrowe kłody tnie się siekierą.

- Pnącza (20.11.2026): rosną **po podporze** - sadzonka przy murze,
  płocie, kratce, tyczce albo pniu, sama pnie się w górę i na boki po
  tej ścianie; owoce zbiera się PPM z liści. Nowe podpory: **kratka,
  tyczka i pergola**. Sześć pnączy w **dwóch wersjach**: 1.30.0
  (winorośl, chmiel, kiwi, marakuja) i 1.31.0 (fasola, groch).
- Stare krzaki (truskawka, jeżyna, leszczyna, borówka) znikają
  z generowania świata - zrobione w 1.27.0.
- Pomiary na prawdziwej karcie graficznej - Kamil da znać.
- Garnek, miska i potrawy - obecne grafiki zostają (może kiedyś zmiana).
