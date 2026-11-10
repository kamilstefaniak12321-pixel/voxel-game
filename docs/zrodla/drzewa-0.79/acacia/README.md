# Akacja parasolowata

> Archiwalny opis importu w 0.79.0. Od 0.80.0 piksele są w `assets/textures/drzewa.png`, a wspólna konfiguracja w `src/blocks/treeCatalog.js`. Poniższe ścieżki pojedynczych plików opisują pochodzenie, nie obecną organizację gry.

Paczka 0.79.0 utworzona z `acacia.zip`, przekazanego przez Kamila
9 listopada 2026 r. Oryginalne pięć tekstur 16 × 16 i `render_info.json`
zachowują dokładnie zawartość źródłowych plików. Sumy SHA-256 i metadane:
[`source.json`](source.json). Archiwum zawierało tekstury oraz podgląd,
ale nie zawierało siatki modelu; geometria w grze powstaje proceduralnie.

Parasolowata korona i przewaga szerokości nad wysokością. Przyjęta nazwa naukowa to interpretacja podglądu i nazwy archiwum, nie oznaczenie gatunku w ZIP.

Umowna skala: jeden blok ≈ jeden metr, zgodna z sylwetką gracza.
Zakres modeli: **8–12 bloków wysokości**, **12–18 bloków średnicy korony**.
Wymiary rzeczywistej siatki są zaokrąglone do pełnych bloków i mogą
różnić się o jeden blok między osiami.

Przyjęte odniesienie botaniczne: *Vachellia tortilis*. SANBI opisuje naturalne drzewa o wysokości 5–20 m. Modele gry wybierają środkowy zakres; dostarczony render_info.json wskazuje 10 m wysokości i 16 m korony.
[Źródło botaniczne](https://pza.sanbi.org/vachellia-tortilis). To wybór skali i sylwetki do gry;
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
