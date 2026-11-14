# Voxel Game

Gra voxelowa w przeglądarce, jako aplikacja na komputer (Windows) i na
telefon (Android), napisana w JavaScripcie z użyciem three.js.

> Nazwa robocza - do zmiany, gdy gra dostanie prawdziwą nazwę.

**Wiki gry** (dla graczy - jak grać, wszystkie bloki, przedmioty,
przepisy i osiągnięcia z ikonkami): [`docs/wiki/`](docs/wiki/README.md),
całe wiki jako jedna strona: `docs/wiki/index.html`. **Historia
zmian** - wszystko, co weszło do gry, wersja po wersji:
[`CHANGELOG.md`](CHANGELOG.md). Ten plik (README) to krótki wstęp dla
tych, którzy ją rozwijają; pełny opis gry od środka:
[`docs/opis-gry.md`](docs/opis-gry.md).

## Jak uruchomić

**Aplikacja na komputer (Windows):** instalator z wydań -
<https://github.com/kamilstefaniak12321-pixel/voxel-game-wydania/releases/latest>
(plik `Voxel-Game-...-instalator.exe`). Gra sama sprawdza aktualizacje
przy starcie, pobiera je w tle i instaluje po zamknięciu (albo od razu
- *Zainstaluj teraz* na ekranie tytułowym). Wszystko o aplikacji -
instalacja, zapisy, wydawanie nowych wersji: `docs/aplikacja.md`.

**W przeglądarce:** gra używa modułów JavaScript, więc nie zadziała po
dwukliku w `index.html`. Trzeba ją otworzyć przez lokalny serwer, na
przykład:

- **VS Code:** rozszerzenie *Live Server* -> prawy przycisk na `index.html` -> *Open with Live Server*
- **Node.js:** w folderze gry `npx serve`, potem adres podany w konsoli

Internet nie jest potrzebny - three.js jest w `lib/three/`. Światy
z przeglądarki i z aplikacji są zapisywane osobno.

**Aplikacja na telefon (Android):** na telefonie z wydań (link wyżej)
pobierz `Voxel-Game-...-android.apk` i otwórz - Android zapyta, czy
zezwolić na instalację z przeglądarki (zezwól). Gra ma ikonkę na
ekranie, działa bez internetu, zawsze poziomo i na cały ekran. Od
wersji 0.19.0 **aktualizuje się sama** (nowa wersja gry pobiera się
w tle i włącza przy następnym uruchomieniu; rzadziej potrzebna nowa
aplikacja - wtedy *Zainstaluj* na ekranie tytułowym). Starszą wersję
trzeba raz zaktualizować ręcznie: nowy `.apk` zainstalowany na starym
(światy zostają).

**W przeglądarce telefonu / tabletu:** na komputerze w folderze
gry `npx serve`, a na telefonie (w tej samej sieci Wi-Fi) adres
**Network** z konsoli, np. `http://192.168.1.23:3000`.

Na ekranie dotykowym gra sama włącza **sterowanie dotykowe** - joystick,
rozglądanie palcem i przyciski (sterowanie poniżej). Wymuszenie na
komputerze: `?dotyk` w adresie albo `/dotyk wl` (`?dotyk=0`, `/dotyk wyl`
wyłącza). Instalacja, aktualizacje, klucz do podpisu aplikacji,
ustawienia na telefonie i co jeszcze nie działa: `docs/telefon.md`.

## Testy poprawności

`npm test` uruchamia po kolei ponad 100 sprawdzeń z `tools/sprawdz_*.mjs` -
od przedmiotów pod kursorem, łupów i przepisów, przez numery bloków,
zapis świata, atlasy tekstur, drzewa, rośliny, wodę, wodospady
i rzeki, po ekwipunek, skrzynię, cząsteczki drzew, diagnostykę
i zgodność opisu komend z grą.
Potrzebny jest Node.js 22.15 lub nowszy; testy nie wymagają instalowania
zależności ani uruchamiania okna gry i nie zmieniają zapisanych światów.
Testy w prawdziwej grze (Chrome, WebGL2: tratwa, wodospady, rozlewanie,
logi...) uruchamia workflow *Testy gry* w GitHub Actions
(`.github/workflows/`).

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD | ruch |
| Spacja | skok; w wodzie - płyń w górę (przy brzegu - wyjście z wody) |
| 2× Spacja | latanie (tryb kreatywny): Spacja - w górę, Shift - w dół (wysoko coraz szybciej), lądowanie kończy lot |
| Shift | kucanie (wolniej, niżej, nie spada się z krawędzi); w wodzie - nurkuj |
| 2× W albo R | bieg |
| F5 | widok: z oczu / zza pleców / z przodu |
| Mysz | rozglądanie się |
| LPM | zniszcz blok (w trybie przygody trzymaj - kopanie trwa chwilę, blok pęka; w kreatywnym trzymany LPM niszczy blok za blokiem) |
| PPM | postaw blok / zbierz owoce z krzaka (żywicę, kwiaty lipy) / zjedz owoc / łopatą - rozgrzeb ziemię / posadź owoc, szyszkę, żołądź na rozgrzebanej ziemi / siekierą - okoruj pień |
| 1-9 / kółko myszy | wybór miejsca na pasku bloków |
| Środkowy przycisk myszy | weź blok, na który patrzysz, na pasek |
| E | ekwipunek (w trybie kreatywnym też wszystkie bloki gry i owoce) |
| F | zjedz to, co trzymasz (owoce, orzechy - tryb przygody; to samo robi PPM poza polem) |
| C | okno statusu: samopoczucie, energia, kondycja, posiłki (skrót stanu: serce w lewym górnym rogu) |
| ESC | pauza (wróć do gry, ustawienia, zapisz i wyjdź do menu) |
| F3 | informacje debugowania w lewym górnym rogu |
| [ / ] (z F3) | cofnij / przesuń czas o godzinę |
| T, / | czat i komendy (`/pomoc`) |
| M | mapa terenu z góry (to samo co `/mapa`) |
| L | księga osiągnięć |

**Na telefonie** (sterowanie dotykowe, `docs/telefon.md`):

| Dotyk | Akcja |
|---|---|
| lewa część ekranu | joystick - chodzenie (do samego brzegu w przód - bieg) |
| reszta ekranu - przesuń palec | rozglądanie się |
| stuknięcie / przytrzymanie palca | postaw blok (zbierz owoce) / kop |
| ▲ / ▼ (prawy dół) | skok (2× - latanie) / kucanie, w locie w dół |
| kilof, kostka | kop / postaw tam, gdzie celownik |
| pasek bloków | stuknięcie - wybór miejsca |
| przyciski u góry | pauza, ekwipunek, czat, serce (samopoczucie; stuknięcie - okno statusu z przyciskiem *Zjedz*), osiągnięcia, widok (F5), mapa, pełny ekran |
| "wstecz" w telefonie | pauza (nie wychodzi z gry) |

**Tratwa (0.76.0):** dwie dowolne deski obok siebie w siatce dają jedną
tratwę 2×1. Wybierz ją na pasku i użyj PPM na tafli wody. Kolejne PPM na
tratwie pozwala wsiąść: WASD / joystick sterują, nurt sam niesie pokład,
a wodospady można spływać. Shift / przycisk ▼ pozwala wysiąść; LPM / Kop
zabiera pustą tratwę do ekwipunku. [Szczegóły i testy](docs/tratwa.md).

## Co jest w grze

Pełny opis każdej części (zasady, liczby, pliki, komendy do testów)
jest w [`docs/opis-gry.md`](docs/opis-gry.md). Skrót:

| Część gry | Co obejmuje | Pełny opis | Osobna strona |
|---|---|---|---|
| Osiągnięcia | 55 osiągnięć w księdze (klawisz L), powiadomienia, rangi | [opis](docs/opis-gry.md#osiągnięcia) | [osiagniecia.md](docs/osiagniecia.md) |
| Energia i samopoczucie | energia z jedzenia, kondycja, serce i okno statusu; utykanie po upadku, pobudka na brzegu po utonięciu, pieczenie nad ogniskiem ([skutki.md](docs/skutki.md)) | [opis](docs/opis-gry.md#energia-i-samopoczucie) | [energia.md](docs/energia.md) |
| Tryby gry i ekwipunek | przygoda, kreatywny, programista; ekwipunek, skrzynie, wytwarzanie | [opis](docs/opis-gry.md#tryby-gry-i-ekwipunek) | [tryb-programisty.md](docs/tryb-programisty.md) |
| Bloki naturalne i rośliny | skały, krzaki owocowe, rośliny z paczek, drzewa i lasy, uprawa | [opis](docs/opis-gry.md#bloki-naturalne-i-rośliny) | [drzewa.md](docs/drzewa.md) |
| Woda | rzeki, rozlewanie, wodospady, pływanie, tratwa | [opis](docs/opis-gry.md#woda) | [tratwa.md](docs/tratwa.md) |
| Ustawienia | wszystkie ustawienia gry i ich zakładki | [opis](docs/opis-gry.md#ustawienia) | - |
| Tekstury | arkusze tekstur, paczki tekstur gracza | [opis](docs/opis-gry.md#tekstury) | [tekstury-atlasy.md](docs/tekstury-atlasy.md) |
| Dźwięki | efekty, kroki, muzyka | [opis](docs/opis-gry.md#dźwięki) | [muzyka.md](docs/muzyka.md) |
| Gracz | model, animacje, skórka, widok z trzeciej osoby | [opis](docs/opis-gry.md#gracz) | [gracz.md](docs/gracz.md) |
| Tryb ziemniaka | najsłabsze komputery i telefony | [opis](docs/opis-gry.md#tryb-ziemniaka) | - |
| Wydajność | pomiar klatek, diagnostyka, logi | [opis](docs/opis-gry.md#wydajność) | - |
| Świat | chunki, generator terenu, biomy, daleki teren | [opis](docs/opis-gry.md#świat) | [generator-terenu.md](docs/generator-terenu.md) |
| Oświetlenie | światło bloków i nieba, cienie, światło odbite | [opis](docs/opis-gry.md#oświetlenie) | [podstawa-oswietlenia.md](docs/podstawa-oswietlenia.md) |
| Czat i komendy | czat, komendy do testowania każdej części gry | [opis](docs/opis-gry.md#czat-i-komendy) | [komendy.md](docs/komendy.md) |
| Dzień i noc | czas, słońce, księżyc, gwiazdy, zaćmienia, meteoryty | [opis](docs/opis-gry.md#dzień-i-noc) | - |
| Sekret: kosmos | lot ponad świat, kula Ziemi, spadanie jak meteoryt | [opis](docs/opis-gry.md#sekret-kosmos) | [kosmos.md](docs/kosmos.md) |
| Gra ze znajomymi | gospodarz i goście przez kod zaproszenia | [opis](docs/opis-gry.md#gra-ze-znajomymi) | [multiplayer.md](docs/multiplayer.md) |
| Zapis świata | co i gdzie się zapisuje | [opis](docs/opis-gry.md#zapis-świata) | - |
| Menu i motywy | ekrany menu, żywe tło, motywy interfejsu | [opis](docs/opis-gry.md#menu-i-motywy) | [zywe-menu.md](docs/zywe-menu.md) |

Pozostałe strony: [uprawa i rozgrzebana ziemia](docs/uprawa.md),
[aplikacja na komputer i wydania](docs/aplikacja.md),
[telefon](docs/telefon.md), [numery bloków](docs/numery-blokow.md),
[rośliny z paczek](docs/rosliny.md), [styl tekstur](docs/styl-tekstur.md),
[licencja](docs/licencja.md). Wszystkie są w folderze `docs/`.

## Struktura projektu

```
index.html                  strona gry
package.json                aplikacja na komputer: wersja, biblioteki, ustawienia instalatora
desktop/                    aplikacja na komputer (okno, aktualizacje, ikonka)
android/                    aplikacja na telefon (Android, Capacitor): pełny ekran, ikonki
capacitor.config.json       aplikacja na telefon: nazwa, identyfikator
lib/three/                  three.js 0.160.0 (biblioteka 3D)
lib/peerjs/                 PeerJS 1.5.5 (połączenie z innymi graczami - gra ze znajomymi)
.github/workflows/          testy gry oraz automatyczne budowanie instalatora i wydań
assets/textures/            dziewięć arkuszy tematycznych PNG i atlas.json (docs/tekstury-atlasy.md)
assets/ui/themes/           opisy motywów menu (kolory, czcionka; grafiki w interfejs.png)
assets/fonts/               czcionki
assets/sounds/              dźwięki (.ogg): bloki, kroki, zbieranie, meteoryt, menu (ui/), woda, kosmos, ciało (body/)
assets/rosliny/             opisy roślin i etapów (roslina.json), lista.json; obrazy w rosliny.png
tools/                      narzędzia atlasów, generatory tekstur, testy, dźwięki, wiki i pliki aplikacji na Androida
docs/                       opisy, jak działają większe części gry (całość: docs/opis-gry.md)
docs/wiki/                  wiki gry dla graczy (strony generuje tools/wiki.py)
CHANGELOG.md                historia zmian - wszystkie wersje gry
src/
  bootstrap.js              start: diagnostyka przed grą, komunikat o nieudanym starcie
  main.js                   start aplikacji, menu, pauza, pętla
  config.js                 ustawienia: chunki, teren, światło, dzień i noc, gracz, menu
  game/                     jeden uruchomiony świat (Game; kliknięcia, kopanie i jedzenie - GameInteraction), energia (Wellbeing), ekwipunek, skrzynie, ogniska, tratwy, meteoryty, wzrost roślin, woda (obraz i dźwięk)
  menu/                     żywe tło menu (mały świat za ekranem tytułowym)
  dev/                      tryb programisty: sceny testowe (scenes.js) i wzorce światła
  diagnostics/              logi, raport błędów i wydajności (/logi, F8)
  ui/                       ekrany menu, pasek bloków, ikonki, napisy
  settings/                 ustawienia gracza (zapis w przeglądarce)
  blocks/                   lista bloków (BlockRegistry), krzaki owocowe, drzewa (trees.js) i wspólny katalog gatunków (treeCatalog.js)
  items/                    przedmioty, które nie są blokami (owoce, szyszki, narzędzia...), kategorie
  crafting/                 wytwarzanie: przepisy (recipes.js) i siatka 2 x 2 (Crafting.js)
  world/                    świat, chunki, szum, światło, daleki teren
  world/terrain/            generatory terenu (realistyczny, lista typów, formy terenu, skały)
  world/trees/              drzewa: kształty gatunków, lasy w terenie, sadzenie drzewa
  sky/                      czas, słońce, księżyc, gwiazdy, planety, kolory nieba
  space/                    sekret: kosmos - kula Ziemi, spadanie jak meteoryt
  achievements/             osiągnięcia: lista (list.js) i księga (zapis, powiadomienia)
  storage/                  zapis i wczytywanie światów
  rendering/                atlas tekstur, budowanie meshy chunków, cienie, cząsteczki (drzewa, wiatr, wodospady), modele (skrzynia, ognisko, rośliny)
  player/                   ruch i kolizje gracza, model, animacje, skórka
  input/                    klawiatura i mysz, sterowanie dotykowe (telefon)
  audio/                    dźwięk (lista dźwięków, odtwarzanie, dźwięki menu)
  commands/                 komendy czatu (do testowania): pliki według tematu, gameCommands.js składa listę
  app/                      części aplikacji wydzielone z main.js: czat (ChatControl.js), klawisze (keys.js), aktualizacje na telefonie (AndroidUpdates.js)
  interaction/              raycast, niszczenie, stawianie, podświetlenie
  net/                      gra ze znajomymi: połączenie, gospodarz i gość, inni gracze (docs/multiplayer.md)
```

## Dodawanie nowego bloku

**Nowe drzewo** wymaga wpisu w `src/blocks/treeCatalog.js`, wolnego
stałego zakresu numerów bloków i regionów w `drzewa.png` oraz
`atlas.json`. Opis: `docs/drzewa.md` i `docs/tekstury-atlasy.md`.
Poniżej — pozostałe bloki.

1. Narysuj teksturę 16×16 i umieść ją w odpowiednim arkuszu tematycznym
   w `assets/textures/`. Dodaj nazwany region do `atlas.json`.
2. Dodaj stabilne miejsce kafelka w sekcji `tiles` manifestu i wykonaj
   `python tools/atlasy.py sync`. Nie przesuwaj istniejących regionów bez
   aktualizacji mapowania i sprawdzenia gry.
3. Dopisz blok w `BLOCK_TYPES` w `src/blocks/BlockRegistry.js` (nowe, unikalne `id` -
   bloki gry: 256-999, numery 2-bajtowe: `docs/numery-blokow.md`;
   polska nazwa w `label`). Opis wszystkich pól jest na początku pliku.
   Blok, który ma świecić, dostaje `light: 1-15` (jak lampa: `light: 15`)
   i opcjonalnie kolor światła, np. `lightColor: '#ff3020'`.
   Roślina: `solid: false`, `model: 'cross'`, `plant: { planes, height, width }`
   (tekstura z przezroczystym tłem - każda roślina kołysze się na wietrze).
   Roślina, która rośnie etapami: `grows: { into: 'następny_etap', seconds }`,
   a taka, z której zbiera się owoce: `harvest: { item, count: [min, max],
   becomes }` (przykład - krzaki owocowe na początku `BlockRegistry.js`).
   Liście: `model: 'leaves'` (sześcian z przezroczystymi prześwitami),
   płaska dekoracja przy ścianie sąsiada (opadłe liście, wieniec):
   `model: 'flat'`, `flat: { attach: 'down' }` - przykłady w
   `src/blocks/trees.js`.
   Dźwięki kroków, stawiania i niszczenia: `sound: 'grass'` (albo `dirt`,
   `stone`, `sand`, `gravel`, `mud`, `plant`, `glass`, `wood`). Od tego
   materiału zależy też czas kopania w trybie przygody (`BREAK_SECONDS`
   w `src/config.js`); inny czas - pole `hardness` (sekundy, np. granit
   `hardness: 2.8`). Sprawdzisz: `/kopanie <nazwa>`.
4. Blok sam trafia do zakładki *Wszystkie bloki* w trybie kreatywnym
   (chyba że ma `creative: false`). Szybki test: `/daj <nazwa>`.

**Nowy przedmiot** (coś, czego nie da się postawić jak bloku - np. owoc):
ikonka 16x16 jako nowy region w `assets/textures/przedmioty.png` + wpis
w `regions` i `tiles` w `atlas.json`, potem `python tools/atlasy.py sync`
([arkusze](docs/tekstury-atlasy.md)), a na końcu wpis w `ITEM_TYPES` w `src/items/ItemRegistry.js` (polska nazwa,
ikonka, opcjonalnie `plants` - jaka roślina wyrasta po posadzeniu,
`tool` - narzędzie). Kategoria (ekwipunek kreatywny, księga przepisów,
wiki) dobiera się sama (`src/items/categories.js`), a inną podaje
pole `category`. Przepis na nową rzecz: `src/crafting/recipes.js`.

**Po każdej zmianie bloków, przedmiotów, przepisów albo osiągnięć**
odśwież wiki: `python tools/wiki.py` (potrzebny Node.js i Python
z numpy, Pillow i markdown) - przerysuje ikonki i strony w
`docs/wiki/`. Nową wersję gry dopisz też do `CHANGELOG.md`.

## Licencja

Voxel Game jest na licencji **PolyForm Noncommercial 1.0.0**
([`LICENSE.md`](LICENSE.md)): grę można oglądać, zmieniać (mody, paczki
tekstur, roślin i drzew) i udostępniać za darmo - **niekomercyjnie**,
z informacją o autorze (linia `Required Notice:` z `LICENSE.md`).
Sprzedawanie gry albo jej części i zarabianie na niej wymaga osobnej
zgody autora. Części cudze (three.js - MIT, czcionka Pixelify Sans -
OFL, Gradle Wrapper - Apache 2.0) zostają na swoich licencjach.
Efekty dźwiękowe: ElevenLabs (elevenlabs.io). Streszczenie po polsku,
lista i źródła muzyki oraz dźwięków: [`docs/licencja.md`](docs/licencja.md).
