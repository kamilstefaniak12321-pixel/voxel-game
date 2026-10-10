# Voxel Game

Gra voxelowa w przeglądarce, napisana w JavaScripcie z użyciem three.js.

> Nazwa robocza - do zmiany, gdy gra dostanie prawdziwą nazwę.

## Jak uruchomić

Gra używa modułów JavaScript, więc nie zadziała po dwukliku w `index.html`.
Trzeba ją otworzyć przez lokalny serwer, na przykład:

- **VS Code:** rozszerzenie *Live Server* -> prawy przycisk na `index.html` -> *Open with Live Server*
- **Node.js:** w folderze gry `npx serve`, potem adres podany w konsoli

Do działania potrzebny jest internet (three.js pobierany z unpkg).

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD | ruch |
| Spacja | skok |
| Mysz | rozglądanie się |
| LPM | zniszcz blok |
| PPM | postaw blok |
| 1-5 | wybór bloku: trawa, ziemia, kamień, lampa, lepidolit |
| ESC | pauza (wróć do gry albo zapisz i wyjdź do menu) |

## Zapis świata

Świat zapisuje się sam w przeglądarce (IndexedDB): zmienione bloki
2 sekundy po zmianie, pozycja gracza co 10 sekund, a całość także przy
przełączeniu albo zamknięciu karty i przy każdej pauzie. Światy wybiera
się, tworzy i usuwa w menu.

Zapisy są przypisane do adresu, pod którym otwierasz grę
(np. `http://localhost:5500`). Inny adres albo port = inne zapisy.

## Menu i motywy

Wygląd menu jest w **motywie**: jeden folder w `assets/ui/themes/`
z plikiem `theme.css` (kolory, czcionka, rozmiary) i teksturą tła
`background.png`. W grze są dwa motywy: `default` (ziemia) i
`lepidolit` (fioletowy).

**Zmiana motywu:** w `src/config.js` ustaw `UI_THEME` na nazwę folderu,
np. `UI_THEME = 'lepidolit'`.

**Własny motyw:**

1. Skopiuj folder `assets/ui/themes/default` i nazwij go po swojemu.
2. Podmień `background.png` na swoją teksturę (np. 16x16).
3. Zmień kolory i rozmiary w `theme.css` - każda wartość ma opis.
4. Ustaw `UI_THEME` w `src/config.js` na nazwę nowego folderu.

Inne rzeczy do zmiany:

- **nazwa gry** - `GAME_TITLE` w `src/config.js`,
- **napisy w menu** - `src/ui/texts.js`,
- **rozmieszczenie elementów** - `src/ui/menu.css`,
- **czcionka** - `--ui-font` w motywie; dołączona czcionka
  Pixelify Sans jest na licencji SIL OFL (`assets/fonts/pixelify-sans/OFL.txt`).

## Struktura projektu

```
index.html                  strona gry
assets/textures/blocks/     tekstury bloków (terrain.png = atlas)
assets/ui/themes/           motywy menu (kolory, czcionka, tło)
assets/fonts/               czcionki
src/
  main.js                   start aplikacji, menu, pauza, pętla
  config.js                 ustawienia: chunki, teren, gracz, menu
  game/                     jeden uruchomiony świat (Game)
  ui/                       ekrany menu, ich układ i napisy
  blocks/                   lista bloków (BlockRegistry)
  world/                    świat, chunki, szum, generator terenu
  storage/                  zapis i wczytywanie światów
  rendering/                atlas tekstur, budowanie meshy chunków
  player/                   ruch i kolizje gracza
  input/                    klawiatura i mysz
  interaction/              raycast, niszczenie, stawianie, podświetlenie
```

## Dodawanie nowego bloku

1. Narysuj teksturę 16x16 i wklej ją do wolnego kafelka w `assets/textures/blocks/terrain.png`.
2. Dopisz pozycję kafelka w `ATLAS_TILES` w `src/rendering/TextureAtlas.js`.
3. Dopisz blok w `BLOCK_TYPES` w `src/blocks/BlockRegistry.js` (nowe, unikalne `id`).
