# Skrzynia (0.81.0)

Pomysł Kamila: zamiast osobnego okna skrzyni otwiera się zwykły ekwipunek,
a w strefie rzemieślniczej (prawe górne okno) widać samą skrzynię -
z otwierającym się wiekiem i przedmiotami leżącymi w środku. Gracz ma
wrażenie, że naprawdę wkłada rzeczy do skrzyni.

## W grze

- **Przepis:** 4 deski (dowolne drzewo, siatka 2 × 2) → skrzynia.
  Stawia się przodem do gracza (cztery kierunki).
- **PPM na skrzyni** otwiera ekwipunek. W świecie i w oknie unosi się
  wieko. Z Shiftem i blokiem w ręce stawia się blok obok, jak zwykle.
- **4 × 3 przegródki, w każdej dwie warstwy** (spód i wierzch):
  - klik bierze to, co leży na wierzchu (PPM - połowę stosu),
  - stos na pustą przegródkę trafia na spód, ten sam przedmiot dokłada
    się do stosu, a inny kładzie się na wierzch tego ze spodu,
  - żeby wyjąć coś ze spodu, najpierw trzeba zdjąć wierzch. Po
    najechaniu podpowiedź mówi, co leży pod spodem,
  - Shift + klik w skrzyni przenosi do ekwipunku, a Shift + klik
    w ekwipunku do skrzyni (najpierw do takich samych stosów, potem na
    puste przegródki, na końcu na wierzch).
- **Skrzynię z czymś w środku najpierw trzeba opróżnić**, żeby ją
  rozbić (napis *Najpierw opróżnij skrzynię*), więc nic nie ginie. Pusta
  daje skrzynię.
- Zawartość zapisuje się razem ze światem (`worldInfo.chests`).

## Pliki

| Plik | Co robi |
| --- | --- |
| `src/blocks/chest.js` | bloki (ID 10095-10098, przód N/E/S/W), kierunek przy stawianiu |
| `src/game/ChestState.js` | zawartość i zasady warstw (bez rysowania) |
| `src/game/Chests.js` | skrzynie świata: zapis, PPM, blokada rozbicia |
| `src/rendering/ChestGeometry.js` | model (ścianki, dno, wieko, zamek) i przegródki |
| `src/rendering/ChestRenderer.js` | skrzynie w świecie, wieko na zawiasie |
| `src/ui/ChestView.js` | okno skrzyni w ekwipunku: kamera, karty przedmiotów, klik |
| obszar `chest` w `assets/textures/drzewa.png` | tekstura 32 × 32 (`tools/skrzynia_tekstura.py`, `tools/atlasy.py export chest`) |

Okno skrzyni rysuje ten sam renderer co podgląd postaci, czyli jeden
kontekst WebGL na całe okno ekwipunku. Scena trafia do fragmentu płótna
poza stroną, a jej kopia na płótno w strefie.

## Sprawdzanie

- `node tools/sprawdz_skrzynie.mjs` (w `npm test`) - warstwy,
  wkładanie, zapis, kierunki, przepis, przegródki modelu.
- `node tools/sprawdz_motyw_gui_webgl.mjs` - okno skrzyni w ekwipunku:
  trafianie w przegródki, wierzch i spód, Shift + klik; zrzut
  `skrzynia.png`.

## Dalej

- Wieka i zawartość innych pojemników (beczka, piec z ogniem w środku).
- Miejsca na ubrania, plecaki i paski obok postaci (plecak może dawać
  więcej miejsca).
