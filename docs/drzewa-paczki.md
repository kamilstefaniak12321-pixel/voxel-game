# Katalog drzew — od 0.80.0

Osobne paczki drzew zostały zastąpione jednym katalogiem
`src/blocks/treeCatalog.js`. Wszystkie dotychczasowe gatunki, kształty,
numery bloków, owoce, wzrost, przepisy i komendy pozostają dostępne.

Tekstury wszystkich drzew są w `assets/textures/drzewa.png`, a regiony
opisuje `assets/textures/atlas.json`. Nie trzeba utrzymywać osobnych
folderów PNG i plików `drzewo.json`.

- [Edycja arkuszy i organizacja tekstur](tekstury-atlasy.md)
- [Gatunki, wzrost i komendy drzew](drzewa.md)

Historyczne wydania do 0.79.0 używały `assets/drzewa/`,
`tools/nowe_drzewo.py` i akcji „Drzewa (paczki)”. Ten mechanizm nie jest
już używany. Dawne numery bloków są zachowane w katalogu i nie mogą
być przydzielane innym przedmiotom.
