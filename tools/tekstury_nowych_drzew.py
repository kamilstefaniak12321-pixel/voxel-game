"""Support regions for the three supplied 0.79.0 tree species.

Original log_side/log_top/planks/leaves/leaves_variant pixels stay identical.
This extends the existing procedural pixel-art pipeline for missing saplings,
stripped logs and the established 32 x 32 campfire UV sheet. No resampling or
colour changes are applied to the original tree tiles.

    python tools/tekstury_nowych_drzew.py
"""
import numpy as np
from PIL import Image
from atlasy import read_texture, write_texture
from tekstury_drzew import as_image, opaque, grain, rings, sapling_broadleaf, conifer_sapling

SPECIES = {
    'acacia': {'seed': 1000, 'file': 'akacja', 'foliage': (113, 145, 62)},
    'bald_cypress': {'seed': 1010, 'file': 'cyprysnik', 'foliage': (75, 126, 52)},
    'cherry': {'seed': 1020, 'file': 'wisnia', 'foliage': (218, 136, 169)},
}
ORIGINALS = ['log_side.png', 'log_top.png', 'planks.png', 'leaves.png', 'leaves_variant.png']


def campfire_sheet(bark, end, seed):
    # The approved campfire model reads four 4x16 bark strips at x=0..15,
    # and four 4x4 end-grain squares at x=16..31. The second half stores char.
    sheet = Image.new('RGBA', (32, 32))
    sheet.paste(bark, (0, 0))
    cut = end.resize((4, 4), Image.Resampling.NEAREST)
    for panel in range(4):
        sheet.paste(cut.transpose(Image.Transpose.ROTATE_90) if panel % 2 else cut, (16 + panel * 4, 0))
    pixels = np.asarray(sheet).copy()
    fresh = pixels[:16].copy()
    y, x = np.mgrid[0:16, 0:32]
    light = fresh[..., :3].astype(float).mean(axis=2)
    shade = np.clip(13 + light * .1 + ((x * 7 + y * 11 + seed) % 7), 0, 255)
    burnt = np.stack((shade * 1.1, shade, shade * .92), axis=-1)
    # Sparse fixed embers, matching the renderer's existing animated heat layer.
    ember = ((x * 17 + y * 13 + seed) % 67 == 0) & (fresh[..., 3] > 0)
    burnt[ember] = (173, 65, 13)
    pixels[16:, :, :3] = burnt.astype(np.uint8)
    pixels[16:, :, 3] = fresh[..., 3]
    return Image.fromarray(pixels)


def main():
    for species, settings in SPECIES.items():
        # These are logical aliases, not directories to recreate.
        prefix = f'assets/drzewa/{species}/'
        original = {name: read_texture(prefix + name).tobytes() for name in ORIGINALS}
        bark = read_texture(prefix + 'log_side.png')
        top = read_texture(prefix + 'log_top.png')
        # The central end-grain pixels supply the wood palette, excluding dark bark.
        wood = tuple(np.median(np.asarray(top)[3:13, 3:13, :3], axis=(0, 1)).astype(int))
        stem = tuple(np.median(np.asarray(bark)[..., :3], axis=(0, 1)).astype(int))
        seed = settings['seed']
        write_texture(prefix + 'stripped_side.png', as_image(opaque(grain(seed, wood, streaks=5, contrast=.65))))
        write_texture(prefix + 'stripped_top.png', as_image(opaque(rings(seed + 1, wood, tuple(int(value * .78) for value in wood)))))
        if species == 'bald_cypress':
            sapling = conifer_sapling(settings['foliage'])
        else:
            sapling = sapling_broadleaf(seed + 2, stem, settings['foliage'],
                [(7.5, 3.5, -1.2), (3.6, 6.5, -2.4), (11.8, 5.5, -.5), (5.0, 10.0, 2.5)],
                round_=species == 'cherry')
        write_texture(prefix + 'sapling.png', as_image(sapling))
        write_texture(f"assets/models/campfire/drewno-{settings['file']}.png", campfire_sheet(bark, top, seed))
        # PNG encoding/layout may change; supplied RGBA pixels may not.
        for name, pixels in original.items():
            assert read_texture(prefix + name).tobytes() == pixels, name
        print(f'{species}: original pixels intact; stripped wood, sapling and firewood regions ready')


if __name__ == '__main__':
    main()
