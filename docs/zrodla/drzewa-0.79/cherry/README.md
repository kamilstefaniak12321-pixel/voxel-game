# Wiśnia japońska

> Archiwalny opis importu w 0.79.0. Od 0.80.0 piksele są w `assets/textures/drzewa.png`, a wspólna konfiguracja w `src/blocks/treeCatalog.js`. Poniższe ścieżki pojedynczych plików opisują pochodzenie, nie obecną organizację gry.

Paczka 0.79.0 utworzona z `cherry.zip`, przekazanego przez Kamila
9 listopada 2026 r. Oryginalne pięć tekstur 16 × 16 i `render_info.json`
zachowują dokładnie zawartość źródłowych plików. Sumy SHA-256 i metadane:
[`source.json`](source.json). Archiwum zawierało tekstury oraz podgląd,
ale nie zawierało siatki modelu; geometria w grze powstaje proceduralnie.

Rozłożysta, niska korona z różowymi kwiatami. Obie dostarczone tekstury są kwitnące; wariant ma więcej widocznej zieleni i rzadsze kwiaty. Nie udaje stanu całkowicie bez kwiatów.

Umowna skala: jeden blok ≈ jeden metr, zgodna z sylwetką gracza.
Zakres modeli: **6–10 bloków wysokości**, **8–12 bloków średnicy korony**.
Wymiary rzeczywistej siatki są zaokrąglone do pełnych bloków i mogą
różnić się o jeden blok między osiami.

Przyjęte odniesienie botaniczne: *Prunus serrulata*. Cornell podaje 20–35 stóp (około 6–11 m) dla odmian ozdobnych. Referencja 9 m wysokości i 11 m korony mieści się w kierunku dużej, rozłożystej odmiany ogrodowej.
[Źródło botaniczne](https://woodyplants.cals.cornell.edu/plant/print/194). To wybór skali i sylwetki do gry;
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
