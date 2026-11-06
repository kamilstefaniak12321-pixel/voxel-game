"""Sprawdza wzorzec przyszłych desek bez tworzenia ani nadpisywania paczek.

Uruchomienie: python tools/sprawdz_styl_desek.py (numpy i Pillow).
"""
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from tekstury import ATLAS, ROOT
from tekstury_drzew import planks
from nowe_drzewo import textures


checks = 0


def check(condition, message):
    global checks
    assert condition, message
    checks += 1


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ranks(rgb):
    # Ordering of pixel brightness describes the authored joints/highlights,
    # independently of the replacement palette or its absolute brightness.
    brightness = rgb @ np.array([0.2126, 0.7152, 0.0722])
    return np.unique(brightness, return_inverse=True)[1].reshape(16, 16)


protected = [Path(ATLAS), *Path(ROOT, 'assets', 'drzewa').glob('*/deski.png')]
before = {path: digest(path) for path in protected}
with Image.open(ATLAS) as atlas:
    template = np.asarray(atlas.convert('RGB').crop((0, 112, 16, 128)), dtype=float)
template_ranks = ranks(template)
check(np.all(template_ranks[[3, 7, 11, 15]] == 0), 'Four continuous horizontal seams in the source')
check(np.all(template_ranks[[0, 1, 2, 8, 9, 10], 3] == 0), 'First and third course share their joint')
check(np.all(template_ranks[[4, 5, 6, 12, 13, 14], 12] == 0), 'Other courses have the staggered joint')

for color in [(200, 120, 50), (80, 60, 40), (180, 190, 160)]:
    tile = planks(1, color)
    check(tile.shape == (16, 16, 3) and np.isfinite(tile).all(), 'Complete finite RGB tile')
    check(np.array_equal(ranks(tile), template_ranks), 'A new wood palette retains every authored joint and highlight')
    check(np.allclose(tile.mean(axis=(0, 1)), color), 'Chosen wood color remains the mean palette color')
    check(np.array_equal(tile, planks(9001, color)), 'Species seed cannot introduce random dots or move the joints')
    check(np.array_equal(tile, planks(1, color, contrast=1.5)), 'Legacy stronger contrast cannot darken the approved style')
    soft = planks(1, color, contrast=0.5)
    check(np.array_equal(ranks(soft), template_ranks), 'Reduced contrast keeps the authored shape')
    check(np.ptp(soft) < np.ptp(tile), 'Reduced contrast is actually softer')

colors = {'kora': (100, 80, 60), 'drewno': (200, 160, 100), 'liscie': (70, 130, 50)}
new_tree = textures(123, colors, conifer=False, fruit=None)
check(new_tree['deski'].shape == (16, 16, 4), 'New-tree generator uses an RGBA plank tile')
check(np.all(new_tree['deski'][..., 3] == 255), 'New planks remain solid')
check(np.array_equal(ranks(new_tree['deski'][..., :3]), template_ranks), 'Actual new-tree path follows the authored template')
check(before == {path: digest(path) for path in protected}, 'Reading the pattern never rewrites the atlas or existing packs')

print(f'OK: styl desek — {checks} kontroli wzorca, palety, generatora i ochrony istniejących plików.')
