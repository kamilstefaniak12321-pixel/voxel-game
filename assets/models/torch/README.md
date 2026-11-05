# Pochodnia z Reactive Torch

Tekstury i wzorcowe modele pochodni pochodzą z przekazanego przez Kamila
projektu **Reactive Torch**, autor `ktulman8`, licencja MIT w pliku `LICENSE`.

Pliki PNG i `.mcmeta` są skopiowane bez zmiany pikseli:

- `torch.png` — `common/src/main/resources/assets/minecraft/textures/block/torch.png`;
- `torch_<kolor>.png` — `common/src/main/resources/assets/reactive_torch/textures/block/tinted/torch_<kolor>_tips.png`.

Każdy arkusz zawiera 20 klatek 16 × 16 w pionie (16 × 320), po 2 ticki
Minecrafta, czyli 100 ms na klatkę. Pętla trwa 2 sekundy. Shader gry miesza
sąsiednie klatki wraz z przezroczystością; przestrzenne próbkowanie zachowuje
ostre piksele. Zmiana klatki nie wysyła ponownie tekstur do GPU.

Pliki `template_flame_torch*.json` zachowują źródłową geometrię i UV.
`src/rendering/TorchGeometry.js` odwzorowuje ten sam patyk i cztery ścianki
płomienia w jednostkach świata gry. Barwniki zmieniają końcówki płomienia;
dolna część ognia i drewno zachowują oryginalne kolory.
