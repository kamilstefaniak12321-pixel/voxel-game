# Ekwipunek: wspólny panel, wygląd i motywy

Ekwipunek ma jedną wspólną ramkę, a nad nią mały pasek z przyciskami
(od 0.77.0, układ według projektu Kamila). W ramie u góry: postać
(2 kolumny), trzy miejsca na przyszłe ubrania, plecaki i paski
(1 kolumna) i strefa rzemieślnicza (6 kolumn); pod spodem 27 miejsc
i pasek - 4 × 9. Otwarta księga przepisów jest z lewej, w tej samej
ramie. Tryb kreatywny: 9 łukowatych zakładek kategorii, 5 przewijanych
rzędów bloków i pasek; wyszukiwanie i kosz są w pasku nad ramą.

Układ jest wspólny dla wszystkich wyglądów - motyw zmienia tylko kolory,
tekstury i grubość ramek. Motyw z grubszą ramką siatek ustawia
`--inv-framed-grid` (szerokość siatki z ramką) i `--inv-grid-inset`
(odstęp ramki od pierwszego miejsca), żeby górny rząd i zakładki stały
równo nad kolumnami.

![Wspólny panel w uruchomionej grze](ekwipunek-wspolny-panel.png)

## Rozmiar okna od 0.86.0

**Ustawienia → Wygląd → Skala ekwipunku** pozwala wybrać 75–200%.
Domyślne 175% powiększa jednocześnie miejsca, przedmioty, postać, przepisy
i napisy. 100% odpowiada poprzedniemu rozmiarowi. To osobne ustawienie
od skali paska przedmiotów i pozostałego HUD-u.

Okno automatycznie dopasowuje się do dostępnej szerokości i maksymalnie
88% wysokości ekranu. Dzięki temu księga przepisów lub grubsza drewniana
rama nie wypadają poza ekran. Dopasowanie może ograniczyć wybrane 200%.
Na telefonie i bardzo niskim oknie pozostają dostępne przewijanie oraz
przyciski zamykania i przełączania zakładek.

Próby rozmiarów, kliknięć, skrzyni i motywów:
[`ekwipunek 0.86.0`](pomiary/ekwipunek-0.86.0/README.md).

## Wygląd: drewniany i jasny

Okno ma dwa wyglądy do wyboru: *Ustawienia → Wygląd → Ekwipunek*
albo komenda `/ekwipunek wyglad [drewniany | jasny]`. Domyślny jest
**drewniany**:

![Drewniany ekwipunek](ekwipunek-drewniany.png)

- okno z poziomych desek (słoje, sęki, pęknięcia), z ciemnym obrysem,
  mchem na górnej krawędzi, kępami liści w rogach i pnączami po bokach,
- miejsca na przedmioty to ciemne przegródki z jaśniejszą listwą u dołu,
  w drewnianych ramkach ze złotym brzegiem; wybrane miejsce i gotowy
  wynik wytwarzania mają złotą obwódkę,
- przyciski to jasne deseczki, pola wyszukiwania i podgląd postaci -
  ciemne wnęki, drobne napisy pomocy - na ciemnych tabliczkach,
- podpowiedzi przedmiotów są ciemne, z drewnianym brzegiem.

Wybrany wygląd to atrybut `<html data-inv-style="wood | light">`
(ustawienie `inventoryStyle`, `src/main.js`). Wszystkie reguły
drewnianego wyglądu są w `src/ui/inventory-wood.css` i działają tylko
z `data-inv-style="wood"` - jasny wygląd i motywy menu działają jak
przedtem. Drewniany wygląd ma swoje kolory (`--inv-*` na
`:root[data-inv-style="wood"]`), więc motyw menu ich nie zmienia.

Od **0.80.0 tekstury wszystkich motywów są razem** w
[`assets/textures/interfejs.png`](../assets/textures/interfejs.png).
Granice regionów opisuje `assets/textures/atlas.json`; rysunek zmieniamy
bezpośrednio w odpowiednim miejscu tego arkusza. `UiTextureSheets.js`
wycina regiony raz przy starcie i udostępnia je jako zmienne CSS, dzięki
czemu powtarzanie desek i ramki `border-image` zachowują dotychczasowy
wygląd. Piksel tekstury to 3 piksele ekranu:

| Zmienna CSS obrazu | Co to jest |
| --- | --- |
| `--texture-wood-planks` | deski - tło okna (160 x 90, łączy się bez szwów) |
| `--texture-wood-frame` | rama okna (`border-image`, wycinek 28): 12 pikseli na zewnątrz okna (liście, pnącza), dalej obrys i mech; krawędzie powtarzają się co 200 / 160 pikseli |
| `--texture-wood-frame-compact` | ta sama rama bez części na zewnątrz - mały ekran (do 480 punktów szerokości albo 520 wysokości) |
| `--texture-wood-board` | jasna deseczka - przyciski |

**Miejsce na ekranie:** rama zajmuje więcej niż jasna. Na ekranie
laptopa (do 820 punktów wysokości) odstępy są mniejsze, a lista bloków
(kreatywny) i księga przepisów są krótsze i przewijają się w środku -
okno mieści się w całości od 1366 x 768. Na małym ekranie (telefon)
liście nie wystają za okno.

## Motyw Szare drewno (0.59.0)

W **Ustawienia → Wygląd → Motyw** wybierz **Szare drewno**. To wspólny
motyw menu i interfejsu gry: surowe szare deski, proste gwoździe, ciemne
wnęki oraz jasne zaznaczenie przedmiotu. Obejmuje ekwipunek w obu trybach,
księgę przepisów, podpowiedzi, pasek przedmiotów i menu ustawień.

Motyw przejmuje wygląd ekwipunku, zachowując w zapisie dotychczasowe
ustawienie **Drewniany / Jasny**. Po przełączeniu na Ziemię albo Lepidolit
wraca wybrany wcześniej wygląd. Nie zmienia liczby miejsc, receptur,
przenoszenia stosów ani zawartości zapisów świata.

Paleta i reguły kontrolek są w `assets/ui/themes/grey-wood/theme.css`.
Tekstury mieszczą się we wspólnym `assets/textures/interfejs.png`:
zmienne `--texture-grey-wood-planks` (160 × 90),
`--texture-grey-wood-board` (48 × 12),
`--texture-grey-wood-frame` (64 × 64, wycinek ramy 8 pikseli).
Tekstury są powiększane ×3; rama menu i małego ekranu ×2. Ramka nie ma
ozdób wystających poza okno; mały ekran korzysta z istniejącego układu
adaptacyjnego i przewijania.

Sprawdzenie w Chrome: `node tools/sprawdz_motyw_gui_webgl.mjs`
(Node 22.15 lub nowszy; `google-chrome` w PATH albo `CHROME_BIN`).
Test uruchamia rzeczywiste komponenty GUI, sprawdza zmianę motywu,
zapis ustawień, przenoszenie przedmiotów, wytwarzanie i rozmiary okien.
Zrzuty ekranu trafiają do `test-results/grey-wood/`.

## Pliki

- `src/ui/InventoryScreen.js` — budowa ekranu i dotychczasowe operacje
  na przedmiotach.
- `src/ui/inventory.css` — układ, odstępy, rozmiary oraz stany kontrolek.
- `src/ui/inventory-theme.css` — biała i jasnoszara paleta (wygląd jasny).
- `src/ui/inventory-wood.css` — wygląd drewniany (kolory, tekstury,
  grubości ramek).
- `assets/ui/themes/<motyw>/theme.css` — opcjonalne nadpisania motywu;
  ten plik jest ładowany jako ostatni.
- `assets/textures/interfejs.png` — wspólne tekstury motywów, ramek
  i przycisków; `src/ui/UiTextureSheets.js` wiąże regiony ze zmiennymi CSS.

Motyw dziedziczy wszystkie niepodane kolory z jasnej bazy. Dotychczasowe
motywy menu działają dalej; ich kolory ekwipunku można dodać oddzielnie.
Przełączenie motywu usuwa jego poprzednie nadpisania dzięki wymianie
jednego arkusza `theme-css`. Font nadal pochodzi z `--ui-font`.

## Kolory do nadpisania (wygląd jasny)

Wszystkie kolory określamy na `:root`. Podpowiedź i przedmiot pod kursorem
są bezpośrednio pod `body`, więc nadpisanie jedynie na `#inventory`
nie obejmie całego interfejsu.

| Zmienne | Przeznaczenie |
| --- | --- |
| `--inv-overlay` | Przyciemnienie świata za oknem |
| `--inv-panel-bg`, `--inv-surface-bg` | Główny panel, podgląd i pola tekstowe |
| `--inv-slot-bg`, `--inv-hover-bg`, `--inv-selected-bg` | Slot i jego stany |
| `--inv-border`, `--inv-border-strong`, `--inv-accent` | Obramowania i zaznaczenie |
| `--inv-text`, `--inv-muted` | Tekst główny i pomocniczy |
| `--inv-shadow`, `--inv-highlight` | Subtelny cień i światło krawędzi |
| `--inv-positive`, `--inv-negative` | Posiadane i brakujące składniki |
| `--inv-missing-bg`, `--inv-result-bg` | Niedostępny przepis i gotowy wynik |
| `--inv-tooltip-bg`, `--inv-tooltip-border` | Podpowiedzi przedmiotów i przepisów |
| `--inv-count-text`, `--inv-count-shadow` | Liczby stosów, również pod kursorem |

Przykład akcentu w przyszłym motywie:

```css
:root {
    --inv-accent: #79618d;
    --inv-selected-bg: #f5f0fa;
}
```

Kolor nie zastępuje obramowania, przygaszenia ani tekstowej informacji
o brakujących składnikach. Własną paletę należy sprawdzić również na
podpowiedziach, liczbach stosów i polach wyszukiwania.

## Rozmiary ekranu

Na węższym ekranie sekcje zmieniają ułożenie. Przy bardzo małej szerokości
siatka zapasów i pasek przewijają się razem, zachowując kolejność miejsc
i wielkość pól. Niskie okno pozwala przewinąć panel w pionie. Reguły
tego układu należą do `inventory.css`, a nie do palety motywu.

Przy zmianach sprawdzamy oba tryby gry, otwartą i zamkniętą księgę,
wyszukiwanie i „Tylko możliwe”, przenoszenie stosów, wytwarzanie,
trzymany przedmiot podczas przebudowy ekranu i ponowne wczytanie świata.
Testy reguł przedmiotów uruchamia `npm test`.
