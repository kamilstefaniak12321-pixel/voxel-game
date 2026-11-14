# Animowane pochodnie — 0.61.0

Pochodnia wykorzystuje model i oryginalne animowane tekstury z moda
**Reactive Torch**, przekazanego przez Kamila. Płomień ma 20 klatek,
100 ms na klatkę, płynne przejścia i pętlę trwającą 2 sekundy.
Animacja działa w świecie oraz na pochodni trzymanej w ręce.

## Wytwarzanie i używanie

- **Patyk + żywica (albo oliwki) → 4 pochodnie.** Żywicę zbiera się PPM z żywicznego
  pnia sosny. Przepis działa w siatce 2 × 2, bez ustalonego układu.
- Pochodnia może stać na pełnym bloku albo wisieć na jego bocznej ścianie.
  Nie zajmuje miejsca w wodzie. Po usunięciu podpory zostaje usunięta;
  podczas kopania w przygodzie trafia wraz z łupami do ekwipunku.
- **PPM barwnikiem na pochodnię** zmienia jej kolor i zużywa jeden barwnik
  w przygodzie. Ten sam kolor nie zużywa kolejnego barwnika.
- **Dowolna pochodnia + barwnik → pochodnia w wybranym kolorze** działa
  również w siatce wytwarzania. Przepisy widać w księdze.
- Zniszczona kolorowa pochodnia zachowuje kolor. Kolor i mocowanie są
  również zapisywane w świecie. W kreatywnym odmiany są w kategorii
  **Światło**, a barwniki w **Narzędzia i surowce**.

## Barwniki z roślin

Każdy z poniższych składników daje jedną sztukę barwnika. Źródła
przypisane w paczkach roślin do tych samych grup kolorów też działają.

| Barwnik | Składnik |
|---|---|
| Czerwony | mak, truskawki, papryczki chili lub składnik grupy czerwonej |
| Żółty | mniszek |
| Biały | rumianek |
| Zielony | koniczyna, pokrzywa, paproć lub składnik grupy zielonej |
| Niebieski | chaber, borówki lub składnik grupy niebieskiej |
| Fioletowy | jeżyny, wrzos, krokus lub składnik grupy fioletowej |
| Brązowy | żołądź |

Pozostałe kolory powstają przez mieszanie. Liczba wynikowych barwników
jest równa liczbie użytych składników.

| Wynik | Barwniki do zmieszania |
|---|---|
| Pomarańczowy | czerwony + żółty |
| Purpurowy | fioletowy + różowy |
| Jasnoniebieski | niebieski + biały |
| Limonkowy | zielony + biały |
| Różowy | czerwony + biały |
| Szary | czarny + biały |
| Jasnoszary | szary + biały |
| Turkusowy | niebieski + zielony |
| Czarny | czerwony + zielony + niebieski |

## Światło, animacja i zapis

Oryginalne barwione tekstury zmieniają głównie końcówki płomienia;
drewniany trzonek i ciepły dół pozostają rozpoznawalne. Światło otoczenia
korzysta ze wspólnego systemu RGB gry i uwzględnia ciepłą podstawę
płomienia. Czarna odmiana nie odejmuje światła od świata.

Każda pochodnia ma stałą emisję (poziom 14). Klatki animacji wybiera GPU
ze wspólnej tekstury. Zmiana klatki nie zapisuje bloku ani nie uruchamia
ponownie rozchodzenia światła. Kolorowanie uruchamia standardową zmianę
bloku i aktualizuje oświetlenie tylko wtedy, kiedy kolor się zmienił.

Numery bloków **10010–10094** zapisują 17 odmian i pięć mocowań. Chunk
przechowuje pomocniczy indeks pochodni, odbudowywany z zapisanych bloków;
indeks trafia również z workera generującego/wczytującego teren. Iskry
i dym korzystają ze wspólnej, ograniczonej puli cząsteczek.

## Pliki

- `src/blocks/torches.js` — warianty, kolory, numery i mocowania.
- `src/items/dyes.js`, `src/crafting/recipes.js` — barwniki i przepisy.
- `src/rendering/TorchGeometry.js`, `TorchMaterial.js`, `TorchRenderer.js`
  — model, animacja i cząsteczki.
- `src/game/TorchInteraction.js` — barwienie postawionej pochodni.
- `assets/models/torch/` — oryginalne PNG i licencja MIT autora.
- `tools/sprawdz_pochodnie.mjs`, `tools/sprawdz_pochodnie_webgl.mjs`
  — sprawdzenia zasad oraz renderowania animacji w Chrome.
