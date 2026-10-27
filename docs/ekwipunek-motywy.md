# Ekwipunek: wspólny panel i motywy

Ekwipunek ma jedną jasną ramkę. Po lewej znajduje się otwarta księga
przepisów, a po prawej postać, wytwarzanie, 27 miejsc i wyrównany pasek
9 miejsc. Księga jest częścią tego samego okna. Tryb kreatywny zachowuje
wyszukiwanie bloków, kategorie i kosz.

![Wspólny panel w uruchomionej grze](ekwipunek-wspolny-panel.png)

## Pliki

- `src/ui/InventoryScreen.js` — budowa ekranu i dotychczasowe operacje
  na przedmiotach.
- `src/ui/inventory.css` — układ, odstępy, rozmiary oraz stany kontrolek.
- `src/ui/inventory-theme.css` — domyślna biała i jasnoszara paleta.
- `assets/ui/themes/<motyw>/theme.css` — opcjonalne nadpisania motywu;
  ten plik jest ładowany jako ostatni.

Motyw dziedziczy wszystkie niepodane kolory z jasnej bazy. Dotychczasowe
motywy menu działają dalej; ich kolory ekwipunku można dodać oddzielnie.
Przełączenie motywu usuwa jego poprzednie nadpisania dzięki wymianie
jednego arkusza `theme-css`. Font nadal pochodzi z `--ui-font`.

## Kolory do nadpisania

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
