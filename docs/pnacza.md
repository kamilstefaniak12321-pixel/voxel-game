# Pnącza (1.30.0) oraz fasola i groch (1.31.0)

Trzecia część roślin jadalnych z paczki Kamila `food_pack_all`
(tekstury 16 × 16 i podglądy - materiały autorskie Kamila, wzorce
w `tools/wzorce/pnacza/`): **winorośl, chmiel, kiwi i marakuja**.
Od 1.31.0 także **fasola i groch** - jednoroczne, opisane
[niżej](#fasola-i-groch-1310).

## Zasada: pnącze rośnie po podporze

(Decyzja Kamila, 20.11.2026.) Owoc pnącza sadzi się **PPM przy
podporze, na ziemi**:

- w **kratkę** albo **tyczkę**, która stoi na ziemi - pnącze zarasta
  podporę,
- w **bok muru** (każdy pełny blok: kamień, cegły, pień), gdy przed nim
  jest ziemia - pnącze rośnie płasko na murze, jak wieniec,
- w **ziemię tuż przy murze** - też na murze.

Gdzie indziej owoc się zjada (chmiel podpowiada, gdzie go posadzić).

Dalej pnącze **pnie się samo**: kawałek, który rośnie (z łodygi w liście
albo z liści dalej), sadzi łodygę obok - najczęściej w górę, czasem
w bok, ale tylko tam, gdzie jest podpora: wolne miejsce przy tym samym
murze, kratka obok, tyczka wyżej, pergola nad nim. Przy samej ziemi
pnącze w bok się nie rozchodzi (jeden pień, korona wyżej), a dalej
najwyżej 3 bloki w bok od korzenia. Jedna roślina to kilkanaście
kawałków.

| Pnącze | Wysokość | Najlepiej | Owoce | Dziko |
|---|---|---|---|---|
| Winorośl | do 5 bloków | mur, kratka | winogrona | na pniach w gajach oliwnych (rzadko na sawannie) |
| Chmiel | do 6 bloków | tyczka (chmielnik) | szyszki chmielu - napar na sen | na pniach w lasach liściastych, bukowych, brzozowych i klonowych |
| Kiwi | do 4 bloków | pergola, kratka | kiwi | na pniach w lesie deszczowym i eukaliptusowym |
| Marakuja | do 4 bloków | pergola, kratka, mur | marakuja | na pniach w lesie deszczowym i namorzynach |

Etapy każdego kawałka: **łodyga** → **liście** → (kiwi, marakuja:
**kwiaty**) → **zielone owoce** (winorośl, chmiel, marakuja) →
**dojrzałe**. PPM na dojrzałych - zbiór (2-4 winogrona albo szyszki,
1-3 kiwi, 1-2 marakuje), zostają liście i owocują znowu. Etap trwa
średnio 4 minuty, łodyga w liście - jak sadzonka krzewu.

Pory roku ([pory-owocowania.md](pory-owocowania.md)): wszystkie cztery
kwitną i owocują **latem i jesienią**. Poza porą widać same liście
i nic się nie zbiera; zimą pnącza stoją. Pnącza są wieloletnie.

Pnącze zniszczone na kratce, tyczce albo pergoli zostawia podporę.
Zniszczone na murze - znika (dojrzałe daje owoce jak przy zbiorze).

## Podpory (nowe bloki)

| Podpora | Przepis | Jak działa |
|---|---|---|
| **Kratka** | 3 patyki + sznur → 2 kratki | drewniana kratka na środku bloku, przodem do gracza; pnącze zarasta ją z obu stron i przechodzi na kratki obok i wyżej (ustawione tak samo) |
| **Tyczka** | 3 patyki → 2 tyczki | cienki słup; kilka jedna na drugiej to chmielnik; pnącze owija ją dookoła i idzie w górę |
| **Pergola** | 2 deski + patyk + sznur → 2 pergole | daszek z listew na górze bloku - stawia się na tyczkach, płocie albo kłodach; pnącze, które dojdzie do niego od dołu, rozchodzi się pod daszkiem, a kiwi i marakuja wiszą pod liśćmi |

Szyszka chmielu to nowe zioło na sen (napar - [ziola.md](ziola.md)),
razem z kwiatem lipy i płatkami róży. Winogrona, kiwi i marakuja to
jedzenie; psują się jak inne owoce (kiwi - jak twarde owoce, wolniej).

Nowe ikonki owoców są narysowane w stylu z 1.28.0 (`tools/owoce_ikony.py`).

## Fasola i groch (1.31.0)

Ostatnia część paczki `food_pack_all` (wzorce w
`tools/wzorce/pnacza/bean_pea/`). Obie rośliny są **jednoroczne**: zimą
giną i zostaje sama podpora, więc na wiosnę sieje się je od nowa -
z nasion odłożonych jesienią.

| | Groch | Fasola |
|---|---|---|
| Sieje się | **grochem** (wyłuskanym ze strąka) | **suchą fasolą** |
| Podpory | siatka, chrust, kratka | tyczka, kratka, **wigwam z tyczek** |
| Wysokość | do 2 bloków | do 3 bloków (wigwam - jeden blok) |
| Kwitnie i owocuje | **wiosną i latem** | **latem i jesienią** |
| Zbiór | strąki grochu, 2-3 (zostają liście) | strąki fasoli, 1-2; z wigwamu 4-6 |
| Na koniec | - | strąki zostawione na pędach **wysychają**: sucha fasola, 2-3 (z wigwamu 6-9) |
| Dziko | na łąkach i w gajach oliwnych | na sawannie i w lesie deszczowym |

- Nasiono **PPM w podporę stojącą na ziemi** - jak inne pnącza. Każdy
  gatunek wchodzi tylko na swoje podpory: groch nie wejdzie na tyczkę,
  fasola na siatkę, a winorośl czy chmiel - na siatkę, chrust i wigwam.
- **Bez podpory**: nasiono PPM **na polu** (rozgrzebanej ziemi). Roślina
  płoży się po ziemi, nie rośnie w górę i daje jeden strąk. Tak rosną
  też dziko - stamtąd pierwsze nasiona.
- Etapy: **siewki → liście → kwiaty → strąki** (u fasoli jeszcze
  **suche strąki**, średnio po 12 minutach bez zbioru). Zebranie suchych
  strąków kończy roślinę - zostaje podpora.
- **Zima**: wszystko, co zostało, ginie w ciągu minuty-dwóch. Podpory
  zostają na następny rok.
- Przy ziemi groch i fasola nie przechodzą na podporę obok - każdą
  siatkę i tyczkę trzeba obsiać osobno. Wyżej (drugi poziom siatki)
  groch rozchodzi się na boki.
- Strąki i nasiona to warzywa do garnka; na surowo dają mało. **Sucha
  fasola i groch nie psują się** - to zapas i nasiona na następny rok.
  Strąki psują się jak twarde warzywa.

Nowe podpory:

| Podpora | Przepis | Jak działa |
|---|---|---|
| **Siatka na groch** | 2 sznury + 2 patyki → 2 | jak kratka: staje przodem do gracza; siatka na siatce daje grochowi drugi poziom |
| **Chrust** | 4 patyki → 3 | gałązki wbite w ziemię - najtańsza podpora grochu; groch idzie po nim tylko w górę |
| **Wigwam z tyczek** | 3 tyczki + sznur → 1 | stoi na ziemi, potrzebuje 3 bloków w górę; jeden blok z obrazkiem 2 × 3 bloki, przechodzi się przez niego; fasola oplata go cały i daje najwięcej |

Wigwam i rośliny płożące się po ziemi znikają, gdy zabraknie pod nimi
ziemi (jak kwiaty).

## Osiągnięcia i komendy

*Na podporze* - posadź pnącze. *Winobranie* - zbierz winogrona.
*Chmielnik* - zbierz szyszki chmielu z tyczki. *Pod pergolą* - zerwij
kiwi albo marakuję spod pergoli. Od 1.31.0: *Wigwam* - posiej fasolę
na wigwamie, *Zielony groszek* - zbierz strąki grochu z siatki albo
chrustu, *Na przyszły rok* - zbierz suchą fasolę.

`/pnacza` - lista, `/pnacza galeria` - mur z winoroślą, kratki
z marakują, tyczki z chmielem i pergola z kiwi (wszystkie etapy),
`/pnacza grzadka` - fasola i groch na wszystkich podporach,
`/pnacza daj` - podpory i owoce albo nasiona do sadzenia,
`/pnacza znajdz [pnącze]` - najbliższe dzikie
([komendy.md](komendy.md)). Wzrost przyspiesza `/krzaki tempo`
i `/krzaki rosnij` (jak u krzewów), porę roku zmienia `/pora ustaw`.

## Dla programisty

- `src/blocks/vines.js` - gatunki (`VINES`), podpory (`VINE_SUPPORTS`),
  numery (15600-15999, [numery-blokow.md](numery-blokow.md)), etapy
  i mocowania: płaskie `north/south/east/west` (model `flat`) albo
  podpora z pnączem `trellis`, `trellis_z`, `pole`, `roof` (model
  `shape` z `cutout` - kształty w `world/ShapeBoxes.js`, rysowane razem
  z roślinami w `ChunkMesher`, bo mają prześwity).
- `src/game/VineGrowth.js` - sadzenie (`vinePlanting`), wspinanie
  (`climbVine`: `climbMount`, `heightAboveGround`, `rootNear`,
  `crowdAround`), co zostaje po zniszczeniu (`vineLeftover`).
  Wspinanie woła `PlantGrowth.grow` po wzroście kawałka; sprawdzenia
  sąsiadów tylko wtedy (najwyżej kilkaset odczytów bloków na wzrost,
  średnio co kilka minut na kawałek) - nie co klatkę.
- Dzikie pnącza: `RealisticGenerator.decorateVines` (`WILD_VINES`).
- Pory roku: `VINE_SEASONS` w `blocks/fruitSeasons.js`.
- Tekstury: `tools/pnacza_tekstury.py` (wzorce Kamila bez zmian),
  ikonki owoców: `tools/owoce_ikony.py`.
- Test: `tools/sprawdz_pnaczy.mjs`.
- Fasola i groch (1.31.0): gatunek ma własne mocowania (`mounts`,
  `vineMounts`) - `ground` (płoży się, bez kolizji), `net`, `net_z`,
  `brush`, `wigwam`; etap `dry`; `annual` - każdy etap ma pole `grows`
  (ostatni z `rest`), więc jest na liście rosnących chunka i zimą
  `PlantGrowth.wither` zamienia go w podporę (`annualLeftover`).
  Wigwam to kształt z prześwitami z obrazkiem większym niż blok
  (`shapeInfo.sprite`, `ChunkMesher.addShape`), obrazki składa
  `tools/pnacza_tekstury.py` (`wigwam`). Dzikie plamy: pola `habitat`
  i `wild` gatunku, `RealisticGenerator` (obok roślin niskich). Test:
  `tools/sprawdz_fasoli.mjs`.

## Czego nie ma (luki)

- Owoce po porze roku znikają z pnącza - nie opadają na ziemię (brak
  opadłych owoców i sadzonek z nich, jak w sadzie).
- Z paczki nie weszły jeszcze: białe winogrona, kiwi ostrolistne (małe,
  gładkie), żółta marakuja, drugie warianty liści (`_alt`) - każdy
  kawałek danego etapu wygląda tak samo.
- Pnącza nie rosną na płocie ani na żywopłocie (płot to nie pełny blok),
  dzikie - tylko na pniach (nie na skałach i murach ruin z podglądów).
- Kratka stoi tylko prosto (wzdłuż x albo z), nie łączy się w rogach;
  pergola nie ma własnych słupków.
- Pnącza nie mają animacji wzrostu i zbioru (jak krzewy -
  [animacje-roslin.md](animacje-roslin.md)) i nie kołyszą się na wietrze.
- Jak krzewy, pnącza rosną tylko w chunkach zmienionych przez gracza -
  dzikie stoją w etapie, w jakim wygenerował je świat.
- Zniszczona łodyga przy ziemi nie usuwa reszty pnącza; bez korzenia
  pnącze dalej owocuje, ale już się nie rozrasta.
- Kiwi i marakuja nie mają działania (jak większość owoców).
- Fasola i groch (1.31.0):
  - z podglądu paczki nie ma **rzędu tyczek w kształcie A** - zamiast
    niego stawia się wigwamy obok siebie; wigwam to jeden blok, więc
    celuje się w jego dolną część (pierwszy blok nad ziemią), a tyczek
    skośnych nie da się stawiać osobno,
  - fasola kwitnie tylko na czerwono (biała odmiana z paczki czeka),
  - dzikie rośliny w nietkniętym terenie zimą nie giną - widać same
    liście (giną tylko w chunkach zmienionych przez gracza, jak cały
    wzrost),
  - nie ma własnych potraw (grochówka, fasola po...) - strąki i nasiona
    liczą się w garnku jak inne warzywa,
  - groch nie ma suchych strąków - nasiona to wyłuskany groch,
  - wigwam nie kołysze się na wietrze i nie ma animacji wzrostu.
