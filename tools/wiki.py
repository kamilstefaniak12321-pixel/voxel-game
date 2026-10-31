# ------------------------------------------------------------
# WIKI GRY
#
# Generuje strony wiki prosto z kodu gry - zawsze pasują do aktualnej
# wersji:
#   docs/wiki/bloki.md, przedmioty.md, przepisy.md, osiagniecia.md,
#   docs/wiki/ikony/*.png       - ikonki bloków i przedmiotów (jak w grze),
#   docs/wiki/przepisy/*.png    - obrazki przepisów (siatka 2 x 2 i wynik),
#   docs/wiki/index.html        - całe wiki jako jedna strona (otwiera się
#                                 w przeglądarce, także bez internetu -
#                                 tylko czcionki są z Google Fonts).
# Strona główna (docs/wiki/README.md) i historia zmian (CHANGELOG.md)
# są pisane ręcznie - index.html bierze je stamtąd.
#
# Dane (bloki, przedmioty, przepisy, osiągnięcia) czyta
# tools/wiki_dane.mjs (Node.js), ikonki rysujemy tutaj z atlasu
# tekstur - tak samo jak src/ui/BlockIcons.js w grze.
#
# Uruchomienie (w folderze gry; Python z numpy, Pillow i markdown -
# pip install numpy pillow markdown - oraz Node.js):
#     python tools/wiki.py
#     python tools/wiki.py --strona wiki.html   (sama strona, bez
#                                                <html>/<head> - do publikacji)
# ------------------------------------------------------------

import html
import json
import os
import re
import subprocess
import sys
import base64
import io
from datetime import date

import numpy as np
from PIL import Image, ImageDraw
import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
WIKI = os.path.join(ROOT, 'docs', 'wiki')
ATLAS = os.path.join(ROOT, 'assets', 'textures', 'blocks', 'terrain.png')
TILE = 16
ICON = 64

# Przyciemnienie boków sześcianu - jak LEFT_SHADE / RIGHT_SHADE w BlockIcons.js.
LEFT_SHADE = 0.2
RIGHT_SHADE = 0.4

GENERATED = ('> Ta strona jest generowana z kodu gry (`python tools/wiki.py`) - '
             'nie zmieniaj jej ręcznie, zmiany przepadną przy następnym generowaniu.')


def load_data():
    result = subprocess.run(['node', os.path.join('tools', 'wiki_dane.mjs')], cwd=ROOT,
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        sys.exit('Błąd w tools/wiki_dane.mjs:\n' + result.stderr)
    return json.loads(result.stdout)


# ------------------------------------------------------------
# Ikonki (jak src/ui/BlockIcons.js)
# ------------------------------------------------------------

class Icons:

    def __init__(self, data):
        self.atlas = np.asarray(Image.open(ATLAS).convert('RGBA')).astype(np.float64)
        self.tiles = data['tiles']
        self.cache = {}
        self.files = {}

    def tile(self, name):
        pos = self.tiles.get(name)
        if not pos:
            return np.zeros((TILE, TILE, 4))
        if 'file' in pos:
            # Tekstura z paczki drzewa (assets/drzewa/<drzewo>/<plik>.png).
            if name not in self.files:
                try:
                    img = Image.open(os.path.join(ROOT, pos['file'])).convert('RGBA').resize((TILE, TILE), Image.NEAREST)
                    self.files[name] = np.asarray(img).astype(np.float64)
                except OSError:
                    self.files[name] = np.zeros((TILE, TILE, 4))
            return self.files[name]
        x, y = pos['x'], pos['y']
        return self.atlas[y * TILE:(y + 1) * TILE, x * TILE:(x + 1) * TILE]

    def flat(self, name):
        pos = self.tiles.get(name) or {}
        if pos.get('sprite'):
            # Roślina z paczki roślin: obrazek w swoim rozmiarze, jak
            # największy w ikonce, w całych pikselach (jak BlockIcons.js).
            try:
                img = Image.open(os.path.join(ROOT, pos['file'])).convert('RGBA')
            except OSError:
                return Image.new('RGBA', (ICON, ICON))
            fit = ICON / max(img.size)
            scale = int(fit) if fit >= 1 else fit
            w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
            out = Image.new('RGBA', (ICON, ICON))
            out.alpha_composite(img.resize((w, h), Image.NEAREST), ((ICON - w) // 2, (ICON - h) // 2))
            return out
        img = Image.fromarray(self.tile(name).astype(np.uint8), 'RGBA')
        return img.resize((ICON, ICON), Image.NEAREST)

    def cube(self, top, front, right):
        out = np.zeros((ICON, ICON, 4))
        u = ICON / 2 / TILE
        faces = [
            (top, (u, u / 2, -u, u / 2, ICON / 2, 0), 0.0),
            (front, (u, u / 2, 0, u, 0, ICON / 4), LEFT_SHADE),
            (right, (u, -u / 2, 0, u, ICON / 2, ICON / 2), RIGHT_SHADE),
        ]
        yy, xx = np.mgrid[0:ICON, 0:ICON]
        X = xx + 0.5
        Y = yy + 0.5
        for name, (a, b, c, d, e, f), shade in faces:
            tile = self.tile(name)
            det = a * d - b * c
            tx = (d * (X - e) - c * (Y - f)) / det
            ty = (-b * (X - e) + a * (Y - f)) / det
            inside = (tx >= -0.15) & (tx < TILE + 0.15) & (ty >= -0.15) & (ty < TILE + 0.15)
            sx = np.clip(np.floor((tx + 0.15) * TILE / (TILE + 0.3)), 0, TILE - 1).astype(int)
            sy = np.clip(np.floor((ty + 0.15) * TILE / (TILE + 0.3)), 0, TILE - 1).astype(int)
            pixels = tile[sy, sx]
            draw = inside & (pixels[..., 3] > 0)
            color = pixels[..., :3] * (1 - shade)
            out[draw, :3] = color[draw]
            out[draw, 3] = 255
        return Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), 'RGBA')

    def image(self, entry):
        key = entry['type']
        if key not in self.cache:
            icon = entry['icon']
            if icon['kind'] == 'pixels':
                # Mała roślina z pikseli - piksele z src/ui/PixelPlantIcon.js.
                img = Image.frombytes('RGBA', (icon['size'], icon['size']), base64.b64decode(icon['data']))
                self.cache[key] = img if icon['size'] == ICON else img.resize((ICON, ICON), Image.NEAREST)
            else:
                self.cache[key] = (self.cube(icon['top'], icon['front'], icon['right'])
                                   if icon['kind'] == 'cube' else self.flat(icon['tile']))
        return self.cache[key]


def png_bytes(img):
    buffer = io.BytesIO()
    img.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()


def data_uri(img):
    return 'data:image/png;base64,' + base64.b64encode(png_bytes(img)).decode('ascii')


# Obrazek przepisu: siatka 2 x 2 (jak w ekwipunku), strzałka, wynik.

def recipe_image(recipe, icon_of):
    cell, gap, pad = 40, 4, 6
    grid = 2 * cell + gap
    width = pad * 2 + grid + 34 + cell + 12
    height = pad * 2 + grid
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    slot = (21, 22, 27, 255)
    border = (74, 77, 89, 255)

    def box(x, y, size, outline=border):
        draw.rectangle([x, y, x + size - 1, y + size - 1], fill=slot, outline=outline, width=2)

    for i, entry in enumerate(recipe['cells']):
        x = pad + (i % 2) * (cell + gap)
        y = pad + (i // 2) * (cell + gap)
        box(x, y, cell)
        if entry:
            icon = icon_of(entry['icon']).resize((cell - 10, cell - 10), Image.NEAREST)
            img.alpha_composite(icon, (x + 5, y + 5))
    # strzałka
    ax = pad + grid + 8
    ay = height // 2
    draw.polygon([(ax, ay - 4), (ax + 12, ay - 4), (ax + 12, ay - 9), (ax + 21, ay), (ax + 12, ay + 9), (ax + 12, ay + 4), (ax, ay + 4)],
                 fill=(198, 198, 198, 255))
    rx = pad + grid + 34
    ry = (height - cell - 12) // 2
    box(rx, ry, cell + 12, outline=(232, 195, 90, 255))
    img.alpha_composite(icon_of(recipe['result']['type']).resize((cell - 4, cell - 4), Image.NEAREST), (rx + 8, ry + 8))
    if recipe['result']['count'] > 1:
        text = str(recipe['result']['count'])
        tx, ty = rx + cell + 12 - 4 - 7 * len(text), ry + cell + 12 - 16
        for dx, dy in [(1, 1)]:
            draw.text((tx + dx, ty + dy), text, fill=(40, 40, 40, 255))
        draw.text((tx, ty), text, fill=(255, 255, 255, 255))
    return img


# ------------------------------------------------------------
# Pomocnicze
# ------------------------------------------------------------

def seconds(value):
    text = ('%.2f' % value).rstrip('0').rstrip('.')
    return text.replace('.', ',') + ' s'


def esc(text):
    return html.escape(str(text), quote=True)


class Wiki:

    def __init__(self, data):
        self.data = data
        self.icons = Icons(data)
        self.blocks = {b['type']: b for b in data['blocks']}
        self.items = {i['type']: i for i in data['items']}
        self.recipes = {r['id']: r for r in data['recipes']}
        self.categories = {c['id']: c for c in data['categories']}

    def entry(self, type_):
        return self.blocks.get(type_) or self.items.get(type_)

    def label(self, type_):
        entry = self.entry(type_)
        return entry['label'] if entry else type_

    def icon(self, type_):
        entry = self.entry(type_)
        return self.icons.image(entry) if entry else Image.new('RGBA', (ICON, ICON))

    # Krótkie opisy (wspólne dla markdown i strony).

    def mining(self, block):
        if block['liquid']:
            return None
        if block['breakTime'] <= 0:
            return 'od razu'
        text = seconds(block['breakTime'])
        if block['tool']:
            with_tool = {'axe': 'siekierą', 'pickaxe': 'kilofem', 'shovel': 'łopatą'}[block['tool']]
            text += f' ({with_tool} {seconds(block["toolTime"])})'
        return text

    def facts(self, entry, is_block):
        """Lista (etykieta, tekst) - co warto wiedzieć o bloku / przedmiocie."""
        out = []
        if is_block:
            mining = self.mining(entry)
            if mining:
                out.append(('Kopanie', mining))
            if entry['light']:
                out.append(('Świeci', f'{entry["light"]} / 15'))
            if entry['drops'] is None:
                out.append(('Daje', 'nic'))
            elif entry['drops'] != entry['type']:
                out.append(('Daje', self.label(entry['drops'])))
            if entry['loot']:
                out.append(('Czasem wypada', ', '.join(f'{self.label(l["item"])} ({round(l["chance"] * 100)}%)' for l in entry['loot'])))
            if entry['harvest']:
                lo, hi = entry['harvest']['count']
                out.append(('Zbiór (PPM)', f'{self.label(entry["harvest"]["item"])} {lo}-{hi}'))
            if entry['strip']:
                out.append(('Siekierą (PPM)', self.label(entry['strip']) + (f' + {self.label(entry["bark"])}' if entry['bark'] else '')))
            if entry['grows'] and entry['grows'].get('tree'):
                out.append(('Rośnie', f'w drzewo, średnio po {round(entry["grows"]["seconds"] / 60)} min'))
            elif entry['grows'] and entry['grows'].get('into'):
                out.append(('Rośnie', f'w: {self.label(entry["grows"]["into"])}'))
        else:
            if entry['plants']:
                out.append(('Posadzony (PPM na ziemi)', entry['plantsLabel']))
            if entry['tool']:
                out.append(('Narzędzie', f'kopie 3 razy szybciej: {", ".join(entry["toolMaterials"])}'))
        if entry.get('pack'):
            out.append(('Paczka drzewa', f'assets/drzewa/{entry["pack"]}'))
        if entry['sources']:
            out.append(('Skąd', '; '.join(entry['sources'])))
        if entry['madeBy']:
            out.append(('Przepis', ', '.join(self.recipes[r]['text'].split(':')[0] for r in entry['madeBy'])))
        if entry['usedIn']:
            out.append(('Przydaje się do', ', '.join(self.recipes[r]['result']['label'] for r in entry['usedIn'])))
        return out

    # --------------------------------------------------------
    # Pliki
    # --------------------------------------------------------

    def write_icons(self):
        folder = os.path.join(WIKI, 'ikony')
        os.makedirs(folder, exist_ok=True)
        for entry in [*self.data['blocks'], *self.data['items']]:
            self.icons.image(entry).save(os.path.join(folder, f'{entry["type"]}.png'), optimize=True)
        folder = os.path.join(WIKI, 'przepisy')
        os.makedirs(folder, exist_ok=True)
        self.recipe_images = {}
        for recipe in self.data['recipes']:
            img = recipe_image(recipe, self.icon)
            self.recipe_images[recipe['id']] = img
            img.save(os.path.join(folder, f'{recipe["id"]}.png'), optimize=True)

    def md_table(self, entries, is_block):
        lines = ['| | Nazwa | W komendach | Najważniejsze |', '|---|---|---|---|']
        for entry in entries:
            facts = '<br>'.join(f'**{k}:** {v}' for k, v in self.facts(entry, is_block)) or '-'
            lines.append(f'| <img src="ikony/{entry["type"]}.png" width="32" height="32" alt=""> | **{entry["label"]}** | `{entry["type"]}` | {facts} |')
        return '\n'.join(lines)

    def write_markdown(self):
        d = self.data
        version = d['version']

        def by_category(entries):
            groups = []
            for category in d['categories']:
                inside = [e for e in entries if e['category'] == category['id']]
                if inside:
                    groups.append((category, inside))
            return groups

        # Bloki
        blocks = [b for b in d['blocks'] if b['creative']]
        hidden = len(d['blocks']) - len(blocks)
        parts = ['# Bloki', '', GENERATED, '',
                 f'Wersja gry **{version}** - {len(blocks)} bloków (do tego {hidden} odmian, których nie ma w ekwipunku, '
                 'np. wieniec zawieszony na boku bloku). Czas kopania dotyczy trybu przygody; w kreatywnym bloki znikają od razu.', '']
        groups = by_category(blocks)
        parts.append(' · '.join(f'[{c["label"]}](#{slug(c["label"])})' for c, _ in groups))
        for category, entries in groups:
            parts += ['', f'## {category["label"]}', '', self.md_table(entries, True)]
        write(os.path.join(WIKI, 'bloki.md'), '\n'.join(parts) + '\n')

        # Przedmioty
        parts = ['# Przedmioty', '', GENERATED, '',
                 f'Wersja gry **{version}** - {len(d["items"])} przedmiotów. Przedmiotu nie da się postawić jak bloku; '
                 'owoce i nasiona posadzone na ziemi (PPM) wyrastają w krzak albo drzewo, narzędzia przyspieszają kopanie.', '']
        for category, entries in by_category(d['items']):
            parts += ['', f'## {category["label"]}', '', self.md_table(entries, False)]
        write(os.path.join(WIKI, 'przedmioty.md'), '\n'.join(parts) + '\n')

        # Przepisy
        parts = ['# Przepisy', '', GENERATED, '',
                 f'Wersja gry **{version}** - {len(d["recipes"])} przepisów. Wytwarza się w ekwipunku (**E**): '
                 'siatka 2 x 2 obok miejsc ekwipunku, wynik po prawej (klik - weź, Shift + klik - ile się da). '
                 'Przycisk 📖 *Przepisy* otwiera księgę - klik na przepisie sam układa składniki. '
                 'Przepisy *z kształtem* można przesuwać po siatce i odbijać w poziomie; '
                 'przepisy *bez kształtu* - obojętne, gdzie leżą składniki. Z czatu: `/przepisy`, `/wytworz <przepis>`.', '']
        for category in d['categories']:
            inside = [r for r in d['recipes'] if r['category'] == category['id']]
            if not inside:
                continue
            parts += ['', f'## {category["label"]}', '']
            for recipe in inside:
                result = recipe['result']
                count = f' x{result["count"]}' if result['count'] > 1 else ''
                ingredients = ' + '.join(f'{i["count"]} x {i["label"]}' for i in recipe['ingredients'])
                shape = 'z kształtem' if recipe['shaped'] else 'bez kształtu'
                parts += [f'### {result["label"]}{count}', '',
                          f'<img src="przepisy/{recipe["id"]}.png" alt="{esc(recipe["text"])}">', '',
                          f'{ingredients} ({shape}). Nazwa przepisu: `{recipe["id"]}`.' + (f' {recipe["note"]}' if recipe['note'] else ''), '']
        parts += ['', '## Grupy składników', '',
                  'Składnik z grupy to dowolna rzecz z listy (np. patyki z desek różnych drzew).', '']
        for name, group in d['groups'].items():
            if name.endswith('_logs'):
                continue
            parts.append(f'- **{group["label"]}**: {", ".join(group["labels"])}')
        parts.append('- **pień (gatunek)**: zwykły, okorowany, a u sosny także górny i z żywicą')
        write(os.path.join(WIKI, 'przepisy.md'), '\n'.join(parts) + '\n')

        # Osiągnięcia
        tiers = d['tiers']
        parts = ['# Osiągnięcia', '', GENERATED, '',
                 f'Wersja gry **{version}** - {len(d["achievements"])} osiągnięć. Księga osiągnięć: klawisz **L**. '
                 'Uwaga, spoilery: sekretne osiągnięcia są tu opisane (w grze widać tylko „???”).', '']
        for tier, info in tiers.items():
            inside = [a for a in d['achievements'] if a['tier'] == tier]
            parts += ['', f'## {info["name"]} ({info["points"]} pkt)', '', '| | Tytuł | Jak zdobyć | Komentarz |', '|---|---|---|---|']
            for a in inside:
                secret = ' *(sekret)*' if a['secret'] else ''
                parts.append(f'| <img src="ikony/{a["icon"]}.png" width="32" height="32" alt=""> | **{a["title"]}**{secret} | {a["task"]} | „{a["comment"]}” |')
        write(os.path.join(WIKI, 'osiagniecia.md'), '\n'.join(parts) + '\n')


def slug(text):
    """Kotwica nagłówka jak na GitHubie."""
    text = text.lower()
    text = re.sub(r'[^\w\- ]', '', text)
    return text.replace(' ', '-')


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


# ------------------------------------------------------------
# Strona HTML
# ------------------------------------------------------------

STYLE = r"""
/* Wiki gry: jak okna gry - kanciaste panele z obwódką, miejsca na
   przedmioty jak w ekwipunku, ikonki pikselowe. Zieleń trawy i fiolet
   lepidolitu jako dwa kolory przewodnie. Układ: menu z boku (na telefonie
   u góry), jedna strona wiki naraz. */
:root {
    --bg: #eef0ea;
    --panel: #f8f9f5;
    --card: #ffffff;
    --ink: #1d221e;
    --muted: #5b655d;
    --line: #c6cdc1;
    --edge: #1d221e;
    --accent: #3f7d24;
    --accent-ink: #ffffff;
    --accent-soft: #dfeed4;
    --violet: #6d45b8;
    --violet-soft: #ece4fa;
    --slot: #262830;
    --slot-edge: #4a4d59;
    --gold: #9a6a00;
    --tier-common: #6b7680;
    --tier-rare: #2a72c9;
    --tier-epic: #8a45c9;
    --tier-legendary: #b07300;
    --ok: #2f7d32;
    --font-display: "Pixelify Sans", "Courier New", monospace;
    --font-body: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
    --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        --bg: #14161a; --panel: #1b1e24; --card: #20232b; --ink: #e8ebe5; --muted: #a2aaa1;
        --line: #343843; --edge: #000000; --accent: #8ccf5e; --accent-ink: #10200a; --accent-soft: #24331c;
        --violet: #b996ff; --violet-soft: #2c2342; --slot: #15161b; --slot-edge: #4a4d59; --gold: #ffc552;
        --tier-common: #cfd6dc; --tier-rare: #57a9ff; --tier-epic: #c27bff; --tier-legendary: #ffb52e; --ok: #8ccf5e;
        color-scheme: dark;
    }
}
:root[data-theme="dark"] {
    --bg: #14161a; --panel: #1b1e24; --card: #20232b; --ink: #e8ebe5; --muted: #a2aaa1;
    --line: #343843; --edge: #000000; --accent: #8ccf5e; --accent-ink: #10200a; --accent-soft: #24331c;
    --violet: #b996ff; --violet-soft: #2c2342; --slot: #15161b; --slot-edge: #4a4d59; --gold: #ffc552;
    --tier-common: #cfd6dc; --tier-rare: #57a9ff; --tier-epic: #c27bff; --tier-legendary: #ffb52e; --ok: #8ccf5e;
    color-scheme: dark;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.55 var(--font-body);
}
a { color: var(--accent); text-underline-offset: 2px; }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 3px solid var(--violet); outline-offset: 2px; }
img.px, .slot img { image-rendering: pixelated; }
code { font-family: var(--font-mono); font-size: 0.86em; background: var(--accent-soft); padding: 0.05em 0.35em; }

.layout {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 28px;
    max-width: 1240px;
    margin: 0 auto;
    padding-block: 24px 64px;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
}

/* Menu */
.nav {
    position: sticky;
    top: calc(env(safe-area-inset-top, 0px) + 16px);
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    background: var(--panel);
    border: 2px solid var(--edge);
    box-shadow: inset 0 0 0 2px var(--line);
}
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); }
.brand img { width: 40px; height: 40px; }
.brand b { font: 22px/1 var(--font-display); }
.brand small { display: block; font: 12px/1.3 var(--font-mono); color: var(--muted); margin-top: 4px; }
.nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.nav a.page {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px;
    color: var(--ink); text-decoration: none;
    border: 2px solid transparent;
    font-weight: 600;
}
.nav a.page img { width: 24px; height: 24px; image-rendering: pixelated; }
.nav a.page:hover { background: var(--accent-soft); }
.nav a.page[aria-current="page"] { border-color: var(--edge); background: var(--accent); color: var(--accent-ink); }
.nav .count { margin-left: auto; font: 12px var(--font-mono); opacity: 0.75; }
.nav p { margin: 0; font-size: 13px; color: var(--muted); }

main { min-width: 0; }
section[data-page] { display: flex; flex-direction: column; gap: 18px; }
section[data-page] > header h1 {
    margin: 0;
    font: 400 clamp(30px, 4.5vw, 44px)/1.1 var(--font-display);
    text-wrap: balance;
}
section[data-page] > header p { margin: 8px 0 0; color: var(--muted); max-width: 70ch; }

/* Tekst z markdown (strona główna, historia zmian) */
.prose { max-width: 74ch; }
.prose h1 { display: none; }
.prose h2 { font: 400 26px/1.2 var(--font-display); margin: 30px 0 10px; }
.prose h3 { font-size: 18px; margin: 22px 0 6px; }
.prose p, .prose li { color: var(--ink); }
.prose table { border-collapse: collapse; width: 100%; font-size: 15px; }
.prose th, .prose td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
.prose th { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.prose .table-wrap { overflow-x: auto; }
.prose hr { border: 0; border-top: 2px dashed var(--line); margin: 28px 0; }
.prose img { display: block; max-width: 100%; height: auto; border: 2px solid var(--edge); }

/* Historia zmian: wersja = wpis na osi czasu */
.changelog h2 {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px;
    padding-top: 18px; border-top: 2px solid var(--line);
}
.changelog h2 .ver {
    font: 400 15px/1 var(--font-display);
    padding: 5px 8px; background: var(--accent); color: var(--accent-ink); border: 2px solid var(--edge);
}
.changelog h2 .date { font: 13px var(--font-mono); color: var(--muted); }
.changelog hr { display: none; }

.stats { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: 15px; }
.stats b { color: var(--ink); font: 400 20px var(--font-display); margin-right: 4px; }

/* Wyszukiwanie i kategorie */
.tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tools input {
    flex: 1 1 260px; min-width: 0;
    font: inherit; padding: 8px 10px;
    color: var(--ink); background: var(--card);
    border: 2px solid var(--edge);
}
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
    display: inline-flex; align-items: center; gap: 6px;
    font: 600 14px var(--font-body);
    padding: 5px 9px;
    color: var(--ink); background: var(--card);
    border: 2px solid var(--line);
    cursor: pointer;
}
.chip img { width: 20px; height: 20px; image-rendering: pixelated; }
.chip[aria-pressed="true"] { border-color: var(--edge); background: var(--accent-soft); }
.empty { color: var(--muted); }

.cat-title { display: flex; align-items: center; gap: 10px; margin: 10px 0 0; font: 400 22px var(--font-display); }
.cat-title img { width: 28px; height: 28px; image-rendering: pixelated; }
.cat-title span { font: 13px var(--font-mono); color: var(--muted); }

/* Karty bloków i przedmiotów */
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.card {
    display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 4px 12px;
    padding: 12px;
    align-content: start;
    background: var(--card);
    border: 2px solid var(--line);
}
.card > img { width: 48px; height: 48px; grid-row: span 2; image-rendering: pixelated; }
.card h3 { margin: 0; font-size: 17px; line-height: 1.25; }
.card .id { font: 12px var(--font-mono); color: var(--muted); }
.card dl { grid-column: 1 / -1; margin: 6px 0 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; font-size: 14px; }
.card dt { color: var(--muted); }
.card dd { margin: 0; overflow-wrap: anywhere; }
.swatch { display: inline-block; width: 0.8em; height: 0.8em; border: 1px solid var(--edge); vertical-align: -0.05em; margin-left: 4px; }

/* Przepisy: siatka jak w ekwipunku */
.recipes { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
.recipe { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: var(--card); border: 2px solid var(--line); }
.recipe:target { border-color: var(--violet); box-shadow: 0 0 0 3px var(--violet-soft); }
.recipe h3 { margin: 0; font-size: 17px; }
.recipe h3 small { font: 12px var(--font-mono); color: var(--muted); margin-left: 6px; font-weight: 400; }
.craft { display: flex; align-items: center; gap: 10px; }
.grid2 { display: grid; grid-template-columns: repeat(2, 40px); gap: 3px; }
.slot {
    position: relative;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    background: var(--slot);
    border: 2px solid var(--slot-edge);
}
.slot img { width: 30px; height: 30px; }
.slot.result { width: 52px; height: 52px; border-color: #e8c35a; }
.slot.result img { width: 38px; height: 38px; }
.slot .n { position: absolute; right: 2px; bottom: -1px; font: 400 15px var(--font-display); color: #ffffff; text-shadow: 2px 2px 0 #3f3f3f; }
.slot.group::after { content: "*"; position: absolute; top: -2px; right: 2px; font: 400 14px var(--font-display); color: #e8c35a; }
.arrow { font: 400 24px var(--font-display); color: var(--muted); }
.recipe ul { margin: 0; padding-left: 18px; font-size: 14px; }
.recipe .tag { align-self: flex-start; font: 12px var(--font-mono); padding: 2px 6px; border: 1px solid var(--line); color: var(--muted); }
.recipe .note { margin: 0; font-size: 14px; color: var(--violet); }

/* Osiągnięcia */
.tier-head { display: flex; align-items: baseline; gap: 12px; margin: 10px 0 0; font: 400 22px var(--font-display); }
.tier-head span { font: 13px var(--font-mono); color: var(--muted); }
.ach { display: grid; grid-template-columns: 40px minmax(0, 1fr); gap: 2px 12px; align-content: start; padding: 12px; background: var(--card); border: 2px solid var(--line); border-left-width: 6px; }
.ach > img { width: 40px; height: 40px; grid-row: span 3; image-rendering: pixelated; }
.ach h3 { margin: 0; font-size: 17px; }
.ach p { margin: 0; font-size: 14px; }
.ach .comment { color: var(--muted); font-style: italic; }
.ach[data-tier="common"] { border-left-color: var(--tier-common); }
.ach[data-tier="rare"] { border-left-color: var(--tier-rare); }
.ach[data-tier="epic"] { border-left-color: var(--tier-epic); }
.ach[data-tier="legendary"] { border-left-color: var(--tier-legendary); }
.spoiler { font: 600 13px var(--font-body); padding: 3px 8px; background: var(--violet-soft); color: var(--violet); border: 2px solid var(--violet); cursor: pointer; justify-self: start; }

footer.foot { margin-top: 40px; font-size: 13px; color: var(--muted); }

@media (max-width: 860px) {
    .layout { grid-template-columns: minmax(0, 1fr); gap: 18px; padding-block: 12px 48px; }
    .nav { position: static; padding: 12px; }
    .nav ul { flex-direction: row; flex-wrap: wrap; }
    .nav a.page { padding: 5px 8px; }
    .nav .count, .nav p.hint { display: none; }
}
@media (prefers-reduced-motion: no-preference) {
    .recipe, .card, .ach { transition: border-color 0.15s; }
}
"""

SCRIPT = r"""
(() => {
    const pages = [...document.querySelectorAll('section[data-page]')];
    const links = [...document.querySelectorAll('.nav a.page')];

    function show(hash) {
        let id = (hash || '').replace(/^#/, '') || 'start';
        let target = null;
        if (!pages.some((page) => page.id === id)) {
            target = document.getElementById(id);
            const owner = target?.closest('section[data-page]');
            id = owner ? owner.id : 'start';
        }
        for (const page of pages) {
            page.hidden = page.id !== id;
        }
        for (const link of links) {
            link.toggleAttribute('aria-current', link.getAttribute('href') === '#' + id);
            if (link.getAttribute('href') === '#' + id) link.setAttribute('aria-current', 'page');
        }
        if (target) {
            target.scrollIntoView({ block: 'center' });
        } else {
            window.scrollTo(0, 0);
        }
    }

    window.addEventListener('hashchange', () => show(location.hash));
    show(location.hash);
    // Przeglądarka po wczytaniu sama przewija do kotwicy - poprawiamy po niej.
    window.addEventListener('load', () => setTimeout(() => show(location.hash), 0));

    // Wyszukiwanie i kategorie w każdej stronie z listą.
    for (const page of pages) {
        const input = page.querySelector('input[type="search"]');
        const chips = [...page.querySelectorAll('.chip[data-category]')];
        const items = [...page.querySelectorAll('[data-search]')];
        const groups = [...page.querySelectorAll('[data-group]')];
        const empty = page.querySelector('.empty');
        if (!input && chips.length === 0) continue;
        let category = '';
        const simplify = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
        const apply = () => {
            const query = simplify(input ? input.value.trim() : '');
            let shown = 0;
            for (const item of items) {
                const ok = (!category || item.dataset.category === category) && (!query || simplify(item.dataset.search).includes(query));
                item.hidden = !ok;
                if (ok) shown++;
            }
            for (const group of groups) {
                group.hidden = !group.querySelector('[data-search]:not([hidden])');
            }
            if (empty) empty.hidden = shown > 0;
        };
        input?.addEventListener('input', apply);
        for (const chip of chips) {
            chip.addEventListener('click', () => {
                category = chip.dataset.category;
                for (const other of chips) other.setAttribute('aria-pressed', String(other === chip));
                apply();
            });
        }
    }

    // Sekretne osiągnięcia: odsłanianie.
    for (const button of document.querySelectorAll('.spoiler')) {
        button.addEventListener('click', () => {
            const card = button.closest('.ach');
            for (const hidden of card.querySelectorAll('[data-secret]')) hidden.hidden = false;
            card.querySelector('h3').textContent = card.dataset.title;
            button.remove();
        });
    }
})();
"""

PAGE_ICONS = {
    'start': 'grass', 'zmiany': 'spruce_sapling', 'bloki': 'granite', 'przedmioty': 'pickaxe',
    'przepisy': 'oak_planks', 'osiagniecia': 'lamp_purple'
}


class Page:

    def __init__(self, wiki):
        self.wiki = wiki
        self.uris = {}

    def uri(self, type_):
        if type_ not in self.uris:
            self.uris[type_] = data_uri(self.wiki.icon(type_))
        return self.uris[type_]

    def img(self, type_, alt=''):
        return f'<img class="px" src="{self.uri(type_)}" alt="{esc(alt)}" width="48" height="48">'

    def markdown(self, path, changelog=False):
        with open(path, encoding='utf-8') as f:
            text = f.read()
        body = markdown.markdown(text, extensions=['tables'])
        body = re.sub(r'<table>', '<div class="table-wrap"><table>', body)
        body = re.sub(r'</table>', '</table></div>', body)
        # Linki do stron wiki -> sekcje tej strony.
        mapping = {'bloki.md': '#bloki', 'przedmioty.md': '#przedmioty', 'przepisy.md': '#przepisy',
                   'osiagniecia.md': '#osiagniecia', '../../CHANGELOG.md': '#zmiany', 'docs/wiki/README.md': '#start'}
        for old, new in mapping.items():
            body = body.replace(f'href="{old}"', f'href="{new}"')
        # Pozostałe względne linki do repozytorium - na GitHub.
        repo = 'https://github.com/kamilstefaniak12321-pixel/voxel-game/blob/main/'
        base = 'docs/wiki/' if not changelog else ''

        def fix(match):
            href = match.group(1)
            if href.startswith(('#', 'http')):
                return match.group(0)
            full = os.path.normpath(os.path.join(base, href)).replace(os.sep, '/')
            return f'href="{repo}{full}"'

        body = re.sub(r'href="([^"]+)"', fix, body)

        # Obrazki z folderu wiki - wprost w stronie (działa też poza repozytorium).
        folder = os.path.dirname(path)

        def embed(match):
            src = match.group(1)
            file = os.path.join(folder, src)
            if src.startswith(('http', 'data:')) or not os.path.isfile(file):
                return match.group(0)
            kind = 'jpeg' if src.lower().endswith(('.jpg', '.jpeg')) else 'png'
            with open(file, 'rb') as f:
                encoded = base64.b64encode(f.read()).decode('ascii')
            return f'src="data:image/{kind};base64,{encoded}"'

        body = re.sub(r'src="([^"]+)"', embed, body)
        if changelog:
            def version(match):
                title = match.group(1)
                m = re.match(r'([0-9.]+) - (.*) \((\d{4}-\d{2}-\d{2})\)$', title)
                if not m:
                    return f'<h2>{title}</h2>'
                return (f'<h2 id="v{m.group(1).replace(".", "-")}"><span class="ver">{m.group(1)}</span>'
                        f'<span>{m.group(2)}</span><span class="date">{m.group(3)}</span></h2>')
            body = re.sub(r'<h2>(.*?)</h2>', version, body)
        return body

    def filters(self, categories, placeholder, page_id):
        chips = [f'<button type="button" class="chip" data-category="" aria-pressed="true">Wszystko</button>']
        for c in categories:
            chips.append(f'<button type="button" class="chip" data-category="{c["id"]}" aria-pressed="false">'
                         f'<img src="{self.uri(c["icon"])}" alt="">{esc(c["label"])}</button>')
        return (f'<div class="tools"><input type="search" id="szukaj-{page_id}" placeholder="{esc(placeholder)}" '
                f'aria-label="{esc(placeholder)}"><div class="chips">{"".join(chips)}</div></div>')

    def card(self, entry, is_block):
        w = self.wiki
        facts = w.facts(entry, is_block)
        rows = []
        for key, value in facts:
            extra = ''
            if is_block and key == 'Świeci' and entry.get('lightColor'):
                extra = f'<span class="swatch" style="background:{esc(entry["lightColor"])}"></span>'
            rows.append(f'<dt>{esc(key)}</dt><dd>{esc(value)}{extra}</dd>')
        links = ''
        recipes = entry['madeBy']
        if recipes:
            links = ' · '.join(f'<a href="#przepis-{r}">przepis</a>' for r in recipes)
        search = ' '.join([entry['label'], entry['type'], entry.get('name', '')])
        return (f'<article class="card" data-search="{esc(search)}" data-category="{entry["category"]}">'
                f'{self.img(entry["type"])}<h3>{esc(entry["label"])}</h3>'
                f'<span class="id">{esc(entry["type"])}{(" · " + links) if links else ""}</span>'
                f'{"<dl>" + "".join(rows) + "</dl>" if rows else ""}</article>')

    def list_page(self, page_id, title, intro, entries, is_block, placeholder):
        w = self.wiki
        groups = []
        used = []
        for c in w.data['categories']:
            inside = [e for e in entries if e['category'] == c['id']]
            if not inside:
                continue
            used.append(c)
            cards = ''.join(self.card(e, is_block) for e in inside)
            groups.append(f'<div data-group><h2 class="cat-title"><img src="{self.uri(c["icon"])}" alt="">{esc(c["label"])}'
                          f'<span>{len(inside)}</span></h2><div class="cards">{cards}</div></div>')
        return (f'<section data-page id="{page_id}" aria-labelledby="h-{page_id}"><header><h1 id="h-{page_id}">{esc(title)}</h1>'
                f'<p>{intro}</p></header>{self.filters(used, placeholder, page_id)}'
                f'{"".join(groups)}<p class="empty" hidden>Nic nie pasuje do wyszukiwania.</p></section>')

    def recipe_card(self, recipe):
        cells = []
        for cell in recipe['cells']:
            if cell is None:
                cells.append('<span class="slot"></span>')
            else:
                group = ' group' if cell['spec'].startswith('#') else ''
                cells.append(f'<span class="slot{group}" title="{esc(cell["label"])}"><img src="{self.uri(cell["icon"])}" alt="{esc(cell["label"])}"></span>')
        result = recipe['result']
        count = f'<span class="n">{result["count"]}</span>' if result['count'] > 1 else ''
        ingredients = ''.join(f'<li>{i["count"]} x {esc(i["label"])}</li>' for i in recipe['ingredients'])
        tag = 'kształt ważny (można przesuwać i odbijać)' if recipe['shaped'] else 'obojętne, gdzie leżą składniki'
        note = f'<p class="note">{esc(recipe["note"])}</p>' if recipe['note'] else ''
        search = ' '.join([result['label'], recipe['id'], *[i['label'] for i in recipe['ingredients']]])
        return (f'<article class="recipe" id="przepis-{recipe["id"]}" data-search="{esc(search)}" data-category="{recipe["category"]}">'
                f'<h3>{esc(result["label"])}{(" x" + str(result["count"])) if result["count"] > 1 else ""}<small>{esc(recipe["id"])}</small></h3>'
                f'<div class="craft"><div class="grid2">{"".join(cells)}</div><span class="arrow" aria-hidden="true">&rarr;</span>'
                f'<span class="slot result" title="{esc(result["label"])}"><img src="{self.uri(result["type"])}" alt="{esc(result["label"])}">{count}</span></div>'
                f'<ul>{ingredients}</ul><span class="tag">{tag}</span>{note}</article>')

    def recipes_page(self):
        w = self.wiki
        d = w.data
        groups = []
        used = []
        for c in d['categories']:
            inside = [r for r in d['recipes'] if r['category'] == c['id']]
            if not inside:
                continue
            used.append(c)
            groups.append(f'<div data-group><h2 class="cat-title"><img src="{self.uri(c["icon"])}" alt="">{esc(c["label"])}'
                          f'<span>{len(inside)}</span></h2><div class="recipes">{"".join(self.recipe_card(r) for r in inside)}</div></div>')
        group_list = ''.join(f'<li><b>{esc(g["label"])}</b>: {esc(", ".join(g["labels"]))}</li>'
                             for name, g in d['groups'].items() if not name.endswith('_logs'))
        intro = ('Wytwarza się w ekwipunku (<b>E</b>): siatka 2 x 2 i wynik po prawej - klik bierze wyrób, Shift + klik '
                 'wytwarza, ile się da. Przycisk 📖 <i>Przepisy</i> otwiera księgę, która sama układa składniki. '
                 'Gwiazdka przy składniku oznacza grupę (np. dowolne deski). Z czatu: <code>/przepisy</code>, '
                 '<code>/wytworz &lt;przepis&gt;</code>.')
        return (f'<section data-page id="przepisy" aria-labelledby="h-przepisy"><header><h1 id="h-przepisy">Przepisy</h1><p>{intro}</p></header>'
                f'{self.filters(used, "Szukaj przepisu albo składnika...", "przepisy")}{"".join(groups)}'
                f'<p class="empty" hidden>Nic nie pasuje do wyszukiwania.</p>'
                f'<div class="prose"><h2>Grupy składników</h2><ul>{group_list}'
                f'<li><b>pień (gatunek)</b>: zwykły, okorowany, a u sosny także górny i z żywicą</li></ul></div></section>')

    def achievements_page(self):
        d = self.wiki.data
        parts = []
        for tier, info in d['tiers'].items():
            inside = [a for a in d['achievements'] if a['tier'] == tier]
            cards = []
            for a in inside:
                if a['secret']:
                    cards.append(f'<article class="ach" data-tier="{tier}" data-title="{esc(a["title"])}">{self.img(a["icon"])}'
                                 f'<h3>Sekretne osiągnięcie</h3><p data-secret hidden>{esc(a["task"])}</p>'
                                 f'<p class="comment" data-secret hidden>„{esc(a["comment"])}”</p>'
                                 f'<button type="button" class="spoiler">Pokaż (spoiler)</button></article>')
                else:
                    cards.append(f'<article class="ach" data-tier="{tier}">{self.img(a["icon"])}<h3>{esc(a["title"])}</h3>'
                                 f'<p>{esc(a["task"])}</p><p class="comment">„{esc(a["comment"])}”</p></article>')
            parts.append(f'<h2 class="tier-head">{esc(info["name"])}<span>{info["points"]} pkt · {len(inside)}</span></h2>'
                         f'<div class="cards">{"".join(cards)}</div>')
        total = sum(d['tiers'][a['tier']]['points'] for a in d['achievements'])
        return (f'<section data-page id="osiagniecia" aria-labelledby="h-osiagniecia"><header><h1 id="h-osiagniecia">Osiągnięcia</h1>'
                f'<p>{len(d["achievements"])} osiągnięć w czterech rangach, razem {total} punktów. Księga osiągnięć w grze: klawisz '
                f'<b>L</b>. Sekretne są zakryte - przycisk odsłania opis.</p></header>{"".join(parts)}</section>')

    def build(self):
        w = self.wiki
        d = w.data
        blocks = [b for b in d['blocks'] if b['creative']]
        start = self.markdown(os.path.join(WIKI, 'README.md'))
        changes = self.markdown(os.path.join(ROOT, 'CHANGELOG.md'), changelog=True)
        stats = (f'<ul class="stats"><li><b>{len(blocks)}</b>bloków</li><li><b>{len(d["items"])}</b>przedmiotów</li>'
                 f'<li><b>{len(d["recipes"])}</b>przepisów</li><li><b>{len(d["achievements"])}</b>osiągnięć</li>'
                 f'<li><b>6</b>gatunków drzew</li></ul>')
        pages = [('start', 'Strona główna', ''), ('zmiany', 'Historia zmian', ''), ('bloki', 'Bloki', str(len(blocks))),
                 ('przedmioty', 'Przedmioty', str(len(d['items']))), ('przepisy', 'Przepisy', str(len(d['recipes']))),
                 ('osiagniecia', 'Osiągnięcia', str(len(d['achievements'])))]
        nav = ''.join(f'<li><a class="page" href="#{pid}"><img src="{self.uri(PAGE_ICONS[pid])}" alt="">{title}'
                      f'<span class="count">{count}</span></a></li>' for pid, title, count in pages)
        body = f"""
<div class="layout">
<nav class="nav" aria-label="Strony wiki">
<a class="brand" href="#start"><img class="px" src="{self.uri('grass')}" alt=""><span><b>Voxel Game</b><small>wiki · wersja {esc(d['version'])}</small></span></a>
<ul>{nav}</ul>
<p class="hint">Wiki generuje <code>python tools/wiki.py</code> z kodu gry.</p>
</nav>
<main>
<section data-page id="start" aria-labelledby="h-start"><header><h1 id="h-start">Voxel Game</h1><p>Wiki gry w wersji {esc(d['version'])}: jak grać, wszystkie bloki, przedmioty, przepisy, osiągnięcia i historia zmian.</p></header>
{stats}<div class="prose">{start}</div></section>
<section data-page id="zmiany" aria-labelledby="h-zmiany" hidden><header><h1 id="h-zmiany">Historia zmian</h1><p>Wszystkie wersje gry - najnowsze na górze.</p></header><div class="prose changelog">{changes}</div></section>
{self.list_page('bloki', 'Bloki', 'Wszystkie bloki z ekwipunku kreatywnego według kategorii. Czas kopania dotyczy trybu przygody (w nawiasie - pasującym narzędziem); w kreatywnym bloki znikają od razu.', blocks, True, 'Szukaj bloku (po polsku albo nazwie z komend)...')}
{self.list_page('przedmioty', 'Przedmioty', 'Rzeczy, których nie stawia się jak bloku: owoce i nasiona do sadzenia, narzędzia i surowce do przepisów.', d['items'], False, 'Szukaj przedmiotu...')}
{self.recipes_page()}
{self.achievements_page()}
<footer class="foot">Wygenerowano {date.today().isoformat()} z kodu gry w wersji {esc(d['version'])}. Ikonki rysowane z atlasu tekstur, tak jak w grze.</footer>
</main>
</div>"""
        # Strony poza pierwszą schowane do czasu skryptu (bez skryptu widać start).
        body = body.replace('<section data-page id="bloki"', '<section data-page id="bloki" hidden', 1)
        body = body.replace('<section data-page id="przedmioty"', '<section data-page id="przedmioty" hidden', 1)
        body = body.replace('<section data-page id="przepisy"', '<section data-page id="przepisy" hidden', 1)
        body = body.replace('<section data-page id="osiagniecia"', '<section data-page id="osiagniecia" hidden', 1)
        head = ('<title>Voxel Game Wiki</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
                '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600'
                '&family=Pixelify+Sans:wght@400;600&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap">\n'
                f'<style>{STYLE}</style>\n')
        return head, body + f'\n<script>{SCRIPT}</script>\n'


def main():
    args = sys.argv[1:]
    artifact = None
    if '--strona' in args:
        artifact = args[args.index('--strona') + 1]
    data = load_data()
    wiki = Wiki(data)
    os.makedirs(WIKI, exist_ok=True)
    wiki.write_icons()
    wiki.write_markdown()
    head, body = Page(wiki).build()
    full = ('<!doctype html>\n<html lang="pl">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'{head}</head>\n<body>{body}</body>\n</html>\n')
    write(os.path.join(WIKI, 'index.html'), full)
    if artifact:
        write(artifact, head + body)
    print(f'Gotowe: wiki w {os.path.relpath(WIKI, ROOT)} (wersja {data["version"]}: '
          f'{len(data["blocks"])} bloków, {len(data["items"])} przedmiotów, {len(data["recipes"])} przepisów, '
          f'{len(data["achievements"])} osiągnięć)')


if __name__ == '__main__':
    main()
