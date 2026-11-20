# Pnącza (1.30.0)

Trzecia część roślin jadalnych z paczki Kamila `food_pack_all`
(tekstury 16 × 16 i podglądy - materiały autorskie Kamila):
**winorośl, chmiel, kiwi i marakuja**. Fasola i groch - w 1.31.0
([plan.md](plan.md)).

> Stan: **w budowie** (gałąź `pnacza`). Ten plik to plan uzgodniony
> z Kamilem 20.11.2026; po zrobieniu opisuje grę.

## Zasada: pnącze rośnie po podporze

(Decyzja Kamila.) Sadzonkę sadzi się **przy podporze, na ziemi**:
przy murze, pniu, kratce, tyczce. Dalej pnącze **samo pnie się w górę
i na boki** po tej podporze, aż do swojej wysokości. Owoce zbiera się
PPM z liści - po zbiorze zostają liście i owocują znowu w swojej porze
roku. Pnącza są wieloletnie: zimą stoją (jak krzewy - pory roku z
[pory-owocowania.md](pory-owocowania.md)).

| Pnącze | Wysokość | Gdzie najlepiej | Owoce | Dziko |
|---|---|---|---|---|
| Winorośl | do 5 bloków | mur, kratka | winogrona (ciemne albo białe) | ciepłe biomy: na skałach i murach ruin |
| Chmiel | do 6 bloków | tyczka (chmielnik) | szyszki chmielu - napar na sen | stare pnie i skraje lasów |
| Kiwi | do 4 bloków + pergola | pergola, kratka | kiwi; kiwi ostrolistne (małe, gładkie) | lasy deszczowe i subtropikalne |
| Marakuja | do 4 bloków + pergola | pergola, kratka, mur | marakuja (fioletowa albo żółta) | dżungla |

Etapy każdego kawałka pnącza: **młode** (łodyga) → **liście** →
(kiwi, marakuja: **kwiaty**) → **zielone owoce** → **dojrzałe**; zbiór
cofa do liści.

## Podpory (nowe bloki)

- **Kratka** - drewniana kratka na środku bloku (przez prześwity widać,
  co za nią). Stawia się wzdłuż patrzenia gracza. Pnącze na kratce
  zarasta ją z obu stron.
- **Tyczka** - cienki słup; kilka jedna na drugiej to chmielnik. Pnącze
  owija tyczkę dookoła.
- **Pergola** - daszek z listew na górze bloku; stawia się na słupkach
  (tyczki, płot, kłody). Pnącze, które dojdzie do daszku, rozchodzi się
  pod nim, a owoce kiwi i marakui wiszą pod liśćmi.
- Mur (każdy pełny blok) i pień też są podporą - pnącze rośnie na jego
  boku jak płaski obrazek (jak wieniec na ścianie).

## Jak to działa w grze (plan techniczny)

- Pnącze na boku pełnego bloku: model `flat` (jak wieniec) z wersjami na
  cztery strony; pnącze na kratce, tyczce i pergoli: osobne bloki
  "podpora z pnączem" (model `shape` z prześwitami - pudełka podpory
  i liści).
- Wzrost: pole `grows` jak u krzewów. Gdy kawałek przechodzi z młodego
  w liście, próbuje zasadzić młody kawałek obok - w górę (najczęściej)
  albo w bok, tylko tam, gdzie jest podpora tego samego rodzaju. Limit:
  wysokość pnącza (licząc od ziemi) i najwyżej kilkanaście kawałków
  jednego gatunku w okolicy (sprawdzenie ograniczone do kostki 7 × 7 × 7,
  tylko przy wzroście - nie co klatkę).
- Owocowanie w porze roku gatunku (`fruitSeasons.js`).
- Ikonki owoców w stylu z 1.28.0 (`tools/owoce_ikony.py`).
- Osiągnięcia, komenda `/pnacza` (galeria, wzrost), test
  `tools/sprawdz_pnaczy.mjs`.
