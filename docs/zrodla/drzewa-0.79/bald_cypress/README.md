# Cypryśnik błotny

> Archiwalny opis importu w 0.79.0. Od 0.80.0 piksele są w `assets/textures/drzewa.png`, a wspólna konfiguracja w `src/blocks/treeCatalog.js`. Poniższe ścieżki pojedynczych plików opisują pochodzenie, nie obecną organizację gry.

Paczka 0.79.0 utworzona z `bald_cypress.zip`, przekazanego przez Kamila
9 listopada 2026 r. Oryginalne pięć tekstur 16 × 16 i `render_info.json`
zachowują dokładnie zawartość źródłowych plików. Sumy SHA-256 i metadane:
[`source.json`](source.json). Archiwum zawierało tekstury oraz podgląd,
ale nie zawierało siatki modelu; geometria w grze powstaje proceduralnie.

Wysoki pień z rozszerzoną podstawą, nierówne piętra gałęzi i wystające korzenie. Jesienna tekstura zachowuje brązowopomarańczową barwę z paczki.

Umowna skala: jeden blok ≈ jeden metr, zgodna z sylwetką gracza.
Zakres modeli: **24–36 bloków wysokości**, **8–14 bloków średnicy korony**.
Wymiary rzeczywistej siatki są zaokrąglone do pełnych bloków i mogą
różnić się o jeden blok między osiami.

Przyjęte odniesienie botaniczne: *Taxodium distichum*. University of Florida opisuje okazy osiągające 100–150 stóp (około 30–46 m). Referencja 32 m wysokości i 12 m korony przedstawia duży dorosły okaz, nie młode drzewo ogrodowe.
[Źródło botaniczne](https://ask.ifas.ufl.edu/publication/st620). To wybór skali i sylwetki do gry;
nie traktujemy wszystkich losowych modeli jako dokładnych pomiarów terenowych.

`stripped_side.png`, `stripped_top.png` i `sapling.png` to uzupełnienia
wykonane istniejącym generatorem pikselowych tekstur gry z paletą tej paczki.
`tools/tekstury_nowych_drzew.py` odtwarza je oraz opał 32 × 32, zgodny
z UV istniejącego ogniska. Świeży opał używa dostarczonej kory i słojów;
druga połowa arkusza zawiera zwęglenie i drobne żary. Skrypt sprawdza,
że oryginalne tekstury pozostały nietknięte.

Nowe numery bloków są stałe i nie zastępują numerów wcześniejszych drzew.
Paczka dochodzi na końcu `lista.json`, zachowując pierwszeństwo istniejących
paczek przy naturalnym losowaniu gatunków.
