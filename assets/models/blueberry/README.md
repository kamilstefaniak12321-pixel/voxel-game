# Borówka v1.2

Modele i tekstura dostarczone przez Kamila w `Borowka-cztery-etapy-v1.2.zip`.
Pliki `borowka-*.mesh.json`, atlas oraz cztery podglądy PNG pochodzą
bez zmian z tej paczki. Kod demonstracyjny, GLB z osobną animacją
i dołączona kopia Three.js nie są potrzebne do uruchomienia gry.

`node tools/zbuduj_model_borowki.mjs` przelicza jednostki modelu
(16 na blok) i zapisuje `model-data.js`. Wczytanie gry nie wykonuje
kodu z archiwum ani nie wymaga Blockbencha.

Etapy źródłowe: young, few, full, empty. W grze pozostają historyczne
ID 94/95/96/97: young/empty/few/full. Dorosłe modele mają tę samą
bryłę 0,75 × 0,75 × 0,625 bloku; młody ma 55% jej rozmiaru.
6/24 kostki owoców w modelu są dekoracją; zbiór zachowuje dotychczasowy
balans 1–3/3–5 borówek.

Liście są dwustronne (30 ścian po dodaniu odwrotnych stron), kostki
owoców jednostronne (36/144 ściany). Gotowy pełny krzak ma 348
trójkątów. Wszystkie etapy trafiają do istniejącej grupy roślin chunka;
atlas 64 × 64 jest częścią wspólnej tekstury. Wiatr pochodzi z gry,
z ograniczoną amplitudą i jednym przesunięciem na kostkę owocu.

Modele nie pobierają barwy biomu — używają palety autora oraz światła
świata. Paczki tekstur zachowują ten atlas tak jak duże obrazki roślin.
Stare kafelki borówki pozostają dla zgodności narzędzi i paczek,
ale modele świata i ręki już z nich nie korzystają. Ikona przedmiotu
„Borówki” nadal przedstawia zbierane owoce; cztery ikony krzaków
korzystają z podglądów nowego modelu.

Od 0.43.0 borówka ma krótkie animacje interakcji oraz płynny wzrost.
Krzywe Kamila z pliku „krzaczek borówki.bbmodel” przełożono na ruch
zoptymalizowanych modeli gry: rdzeń (pierwsze 6 części), zewnętrzne
liście (kolejne 9), owoce (ostatnie 24). Każdy owoc ma własny środek
skalowania. Stałe modele źródłowe i ich UV pozostają bez zmian.
Zasady kolejnych gatunków: [animacje roślin](../../../docs/animacje-roslin.md).
