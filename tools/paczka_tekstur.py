"""
SZABLON PACZKI TEKSTUR

Tworzy folder paczka-tekstur-szablon/ - paczkę tekstur z oryginalnymi
teksturami gry (każda tekstura w osobnym pliku, 16 x 16), z opisem
(CZYTAJ.md) i paczka.json. Kopia do zrobienia własnej paczki: podmień
obrazki (dowolna rozdzielczość, np. 512 x 512 albo 1254 x 1254), spakuj
zawartość folderu do .zip i wczytaj w grze: Ustawienia -> Tekstury.

GitHub Actions dokłada spakowany szablon do każdego wydania gry
(Voxel-Game-paczka-tekstur.zip). Opis: docs/paczki-tekstur.md.

Uruchom w folderze gry (po zmianie tekstur albo nowym bloku):
    python tools/paczka_tekstur.py
Potrzebne: Python 3 z Pillow i Node.js (dane bloków z tools/wiki_dane.mjs).
"""

import json
import os
import shutil
import subprocess
import sys

from PIL import Image
from atlasy import read_texture

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'paczka-tekstur-szablon')
TILE = 16


def game_data():
    result = subprocess.run(['node', os.path.join('tools', 'wiki_dane.mjs')], cwd=ROOT,
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        sys.exit('Błąd w tools/wiki_dane.mjs:\n' + result.stderr)
    return json.loads(result.stdout)


def main():
    data = game_data()
    tiles = data['tiles']

    # Co używa której tekstury (nazwy bloków i przedmiotów po polsku).
    used = {}
    for kind, entries in (('blok', data['blocks']), ('przedmiot', data['items'])):
        for entry in entries:
            icon = entry['icon']
            for key in ('top', 'front', 'right', 'tile'):
                name = icon.get(key)
                if name:
                    labels = used.setdefault(name, [])
                    if entry['label'] not in labels:
                        labels.append(entry['label'])

    # Refresh known files in place; do not recursively remove the template.
    os.makedirs(os.path.join(OUT, 'bloki'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'niebo'), exist_ok=True)

    rows = []
    for name, tile in tiles.items():
        if tile.get('region'):
            # Duża roślina z paczki roślin (kilka kafelków) - paczka tekstur
            # jeszcze jej nie zmienia (docs/rosliny.md).
            continue
        relative = name if name.endswith('.png') else f'{name}.png'
        target = os.path.join(OUT, 'bloki', *relative.split('/'))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        read_texture(name).save(target, optimize=True)
        path = f'bloki/{relative}'
        rows.append((path, ', '.join(used.get(name, [])) or '-'))

    read_texture('assets/textures/blocks/cracks.png').save(os.path.join(OUT, 'pekniecia.png'))
    read_texture('assets/textures/sky/moon.png').save(os.path.join(OUT, 'niebo', 'ksiezyc.png'))

    with open(os.path.join(OUT, 'paczka.json'), 'w', encoding='utf-8') as file:
        json.dump({
            'nazwa': 'Oryginalne tekstury (szablon)',
            'autor': 'Voxel Game',
            'opis': f'Szablon paczki tekstur - oryginalne tekstury gry {data["version"]}.'
        }, file, ensure_ascii=False, indent=4)
        file.write('\n')

    table = '\n'.join(f'| `{path}` | {labels} |' for path, labels in sorted(rows))

    readme = f"""# Paczka tekstur - szablon (Voxel Game {data["version"]})

Oryginalne tekstury gry, każda w osobnym pliku. Zrób z nich własną paczkę:

1. Skopiuj ten folder i zmień nazwę (np. `moja-paczka`).
2. W `paczka.json` wpisz nazwę paczki, autora i opis.
3. Podmień obrazki w `bloki/` (i, jeśli chcesz, `pekniecia.png`
   i `niebo/ksiezyc.png`). **Rozdzielczość dowolna**, np. 64 x 64,
   512 x 512 albo 1254 x 1254 - najlepiej taka sama dla wszystkich.
   Obrazek ma być kwadratowy (z wyższego gra bierze kwadrat z góry).
   Przezroczystość działa jak w oryginałach: liście, rośliny,
   sadzonki, owoce i narzędzia mają przezroczyste tło.
4. Tekstur, których nie zmieniasz, możesz nie dawać - zostaną oryginalne.
5. Spakuj **zawartość** folderu (albo cały folder) do pliku `.zip`.
6. W grze: **Ustawienia → Tekstury → Wczytaj paczkę (.zip)**
   (na telefonie: wybierz plik z pamięci telefonu). Gra uruchomi się
   ponownie z nowymi teksturami.

**Rozdzielczość w grze** (Ustawienia → Tekstury → Rozdzielczość):
automatyczna - taka jak paczki, najwyżej 512 x 512 na komputerze
i 256 x 256 na telefonie (większe zajmowałyby za dużo pamięci karty
graficznej). Można też wybrać mniej (np. 64) - gra działa szybciej.

Pliki:
- `paczka.json` - nazwa, autor, opis (niekonieczny),
- `bloki/<nazwa>.png` - tekstury bloków, roślin i przedmiotów
  (tabela niżej; `bloki/<drzewo>/...` - drzewa z paczek drzew),
- `pekniecia.png` - pęknięcia kopanego bloku: 10 etapów obok siebie
  (szerokość = 10 x wysokość), szary 128 nic nie zmienia, ciemniejszy
  przyciemnia blok, jaśniejszy rozjaśnia,
- `niebo/ksiezyc.png` - tarcza księżyca (poza tarczą przezroczysta).

Więcej: `docs/paczki-tekstur.md` w repozytorium gry, `/tekstury`
w grze (`/tekstury lista` - czego brakuje w paczce).

| plik | co go używa |
|---|---|
{table}
"""
    with open(os.path.join(OUT, 'CZYTAJ.md'), 'w', encoding='utf-8') as file:
        file.write(readme)

    print(f'Szablon paczki: {len(rows)} tekstur + pęknięcia i księżyc -> {os.path.relpath(OUT, ROOT)}/')


if __name__ == '__main__':
    main()
