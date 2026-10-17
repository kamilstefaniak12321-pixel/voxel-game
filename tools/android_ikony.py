# ------------------------------------------------------------
# APLIKACJA NA TELEFON (Android) - ikonki i ekran startowy
#
# Z ikonki gry (desktop/icon.png - blok trawy) robi wszystkie obrazki,
# których potrzebuje Android:
#   - ikonka "adaptacyjna" (Android 8+): niebo w tle + blok na wierzchu
#     (telefon sam przycina ją do koła, kwadratu z zaokrągleniami...),
#     i wersja jednokolorowa (Android 13+, ikonki w kolorach tapety),
#   - zwykła ikonka (kwadrat i koło) dla starszych telefonów,
#   - ekran startowy (splash) - poziomo i pionowo, w kilku rozmiarach.
#
# Uruchomienie (w folderze gry, potrzebny Python z Pillow i fontTools):
#     python tools/android_ikony.py
# Obrazki trafiają do android/app/src/main/res/ (są w gicie - wystarczy
# uruchomić ponownie po zmianie ikonki albo kolorów poniżej).
# ------------------------------------------------------------

import io
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ICON = 'desktop/icon.png'
RES = 'android/app/src/main/res'
FONT = 'assets/fonts/pixelify-sans/pixelify-sans-latin-400-normal.woff2'

# Niebo w tle ikonki (góra -> dół) i tło ekranu startowego.
SKY_TOP = (150, 214, 255)
SKY_BOTTOM = (58, 136, 214)
SPLASH_TOP = (16, 28, 48)
SPLASH_BOTTOM = (4, 8, 16)

# Gęstości ekranu Androida: nazwa -> ile pikseli na 1 dp.
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

# Ekran startowy (szerokość x wysokość poziomo) dla każdej gęstości.
SPLASH = {'mdpi': (480, 320), 'hdpi': (800, 480), 'xhdpi': (1280, 720),
          'xxhdpi': (1600, 960), 'xxxhdpi': (1920, 1280)}


def gradient(size, top, bottom):

    width, height = size
    image = Image.new('RGB', size)
    draw = ImageDraw.Draw(image)

    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        draw.line([(0, y), (width, y)], fill=color)

    return image


def block(size):

    # Blok (bez przezroczystych brzegów) przeskalowany do kwadratu size x size.
    icon = Image.open(ICON).convert('RGBA')
    icon = icon.crop(icon.getbbox())
    side = max(icon.size)
    square = Image.new('RGBA', (side, side))
    square.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))

    return square.resize((size, size), Image.LANCZOS)


def with_shadow(canvas, item, x, y, blur):

    # Miękki cień pod blokiem.
    shadow = Image.new('RGBA', canvas.size)
    alpha = item.getchannel('A').point(lambda a: a * 0.35)
    shade = Image.new('RGBA', item.size, (0, 20, 40, 255))
    shade.putalpha(alpha)
    shadow.paste(shade, (x, y + max(1, blur // 2)), shade)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(item, (x, y))


def foreground(px):

    # Ikonka adaptacyjna: 108 dp, z czego środkowe 72 dp zawsze widać
    # (reszta może zostać ucięta) - blok zajmuje ~60% boku.
    canvas = Image.new('RGBA', (px, px))
    size = round(px * 0.6)
    item = block(size)
    offset = (px - size) // 2
    with_shadow(canvas, item, offset, offset + round(px * 0.01), max(1, round(px * 0.02)))

    return canvas


def monochrome(px):

    # Jeden kolor (telefon sam go zabarwia): sylwetka bloku z wyciętymi
    # krawędziami między ścianami (żeby było widać, że to sześcian).
    canvas = Image.new('RGBA', (px, px))
    size = round(px * 0.6)
    alpha = block(size).getchannel('A')
    x0, y0, x1, y1 = alpha.getbbox()
    cx, height = (x0 + x1) / 2, y1 - y0
    center = (cx, y0 + height * 0.5)
    cut = ImageDraw.Draw(alpha)
    line = max(1, round(size * 0.035))
    for end in [(x0, y0 + height * 0.25), (x1, y0 + height * 0.25), (cx, y1)]:
        cut.line([center, end], fill=0, width=line)
    white = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    white.putalpha(alpha)
    canvas.alpha_composite(white, ((px - size) // 2, (px - size) // 2))

    return canvas


def legacy(px, round_icon):

    # Zwykła ikonka (starsze telefony): niebo w kwadracie z zaokrągleniem
    # albo w kole, blok na środku.
    scale = 4
    big = px * scale
    mask = Image.new('L', (big, big))
    draw = ImageDraw.Draw(mask)
    margin = round(big * 0.04)

    if round_icon:
        draw.ellipse([margin, margin, big - margin, big - margin], fill=255)
    else:
        draw.rounded_rectangle([margin, margin, big - margin, big - margin], radius=round(big * 0.2), fill=255)

    mask = mask.resize((px, px), Image.LANCZOS)

    canvas = Image.new('RGBA', (px, px))
    sky = gradient((px, px), SKY_TOP, SKY_BOTTOM).convert('RGBA')
    canvas.paste(sky, (0, 0), mask)

    size = round(px * (0.62 if round_icon else 0.68))
    item = block(size)
    offset = (px - size) // 2
    with_shadow(canvas, item, offset, offset + round(px * 0.01), max(1, round(px * 0.03)))

    return canvas


def font(size):

    from fontTools.ttLib import TTFont

    data = io.BytesIO()
    ttf = TTFont(FONT)
    ttf.flavor = None
    ttf.save(data)
    data.seek(0)

    return ImageFont.truetype(data, size)


def splash(size):

    width, height = size
    canvas = gradient(size, SPLASH_TOP, SPLASH_BOTTOM).convert('RGBA')
    short = min(width, height)

    item_size = round(short * 0.34)
    item = block(item_size)
    x = (width - item_size) // 2
    y = round(height * 0.5 - item_size * 0.72)
    with_shadow(canvas, item, x, y, max(2, round(short * 0.015)))

    text = 'Voxel Game'
    face = font(round(short * 0.09))
    draw = ImageDraw.Draw(canvas)
    box = draw.textbbox((0, 0), text, font=face)
    tx = (width - (box[2] - box[0])) // 2 - box[0]
    ty = y + item_size + round(short * 0.05)
    shadow = max(2, round(short * 0.006))
    draw.text((tx + shadow, ty + shadow), text, font=face, fill=(0, 0, 0, 200))
    draw.text((tx, ty), text, font=face, fill=(255, 255, 255, 255))

    return canvas.convert('RGB')


def save(image, path):

    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save(path, optimize=True)


def main():

    for name, scale in DENSITIES.items():

        folder = f'{RES}/mipmap-{name}'

        save(foreground(round(108 * scale)), f'{folder}/ic_launcher_foreground.png')
        save(gradient((round(108 * scale),) * 2, SKY_TOP, SKY_BOTTOM), f'{folder}/ic_launcher_background.png')
        save(monochrome(round(108 * scale)), f'{folder}/ic_launcher_monochrome.png')
        save(legacy(round(48 * scale), False), f'{folder}/ic_launcher.png')
        save(legacy(round(48 * scale), True), f'{folder}/ic_launcher_round.png')

        width, height = SPLASH[name]
        save(splash((width, height)), f'{RES}/drawable-land-{name}/splash.png')
        save(splash((height, width)), f'{RES}/drawable-port-{name}/splash.png')

    save(splash(SPLASH['mdpi']), f'{RES}/drawable/splash.png')

    # Duży podgląd ikonki (do opisu / sklepu) - poza aplikacją.
    save(legacy(512, False), 'android/ikonka-512.png')

    print('Gotowe: ikonki i ekran startowy w', RES)


if __name__ == '__main__':
    main()
