# Osiągnięcia

Za ciekawe rzeczy zrobione w grze gracz dostaje **osiągnięcie**:
na górze ekranu wyjeżdża powiadomienie z rangą, tytułem i żartobliwym
komentarzem (z melodyjką - im rzadsze, tym bogatszą), a osiągnięcie
trafia do **księgi osiągnięć** razem z datą i nazwą świata.

- **Księga**: klawisz **L** w grze, przycisk *Osiągnięcia* w pauzie
  i na ekranie tytułowym, albo `/osiagniecia ksiega`.
- Księga jest **jedna na gracza** - wspólna dla wszystkich światów
  (zapis w przeglądarce / aplikacji, `localStorage`, klucz
  `voxel-game-achievements`). Usunięcie świata nie zabiera osiągnięć.
- Zasada: **nowa rzecz w grze = nowe osiągnięcie** (jeśli jest za co
  je dać) - tak jak nowa rzecz = nowa komenda do testów.

## Rangi

| ranga | punkty | kolor | dla czego |
|---|---|---|---|
| Zwykłe | 10 | szary | pierwsze kroki: pierwszy blok, pierwsze owoce... |
| Rzadkie | 25 | niebieski | coś, co wymaga trochę wysiłku albo szczęścia |
| Bardzo rzadkie | 50 | fioletowy | duże wyprawy, rzadkie zjawiska |
| Legendarne | 100 | złoty | szaleństwa, o których się opowiada |

**Sekretne** osiągnięcia (`secret: true`) przed zdobyciem widać w księdze
tylko jako *Sekretne osiągnięcie* ze znakiem zapytania.

## Lista (spoilery!)

| ranga | tytuł | jak zdobyć |
|---|---|---|
| zwykłe | Od czegoś trzeba zacząć | zniszcz pierwszy blok |
| zwykłe | Architekt amator | postaw pierwszy blok |
| zwykłe | Witaminki | zbierz owoce z krzaka |
| zwykłe | Sadownik | zbierz owoce z drzewa owocowego (np. jabłka z jabłoni) - jest, gdy któraś paczka drzewa ma owoce (`docs/drzewa-paczki.md`) |
| zwykłe | Zielone palce | posadź owoc, orzech albo szyszkę |
| zwykłe | Drwal | zetnij pień drzewa |
| zwykłe | Brzozowy papirus | zdejmij siekierą korę z brzozy |
| zwykłe | Ostrze w ruch | w trybie przygody zetnij pień siekierą |
| zwykłe | Prawie robi różnicę *(sekret)* | w trybie przygody puść LPM, gdy blok jest już prawie rozbity (od 90%) |
| zwykłe | Złota rączka | wytwórz coś w ekwipunku (siatka 2 x 2) |
| zwykłe | Kolorowe światła | zrób kolorową lampę |
| zwykłe | Mokra robota | popływaj |
| zwykłe | Nocny marek | bądź w świecie o północy |
| zwykłe | Złota godzina | popatrz prosto na zachodzące (albo wschodzące) słońce |
| zwykłe | Nowe szaty | zagraj z własną paczką tekstur (Ustawienia → Tekstury) |
| zwykłe | Borówkowy język | zbierz borówki z krzaka (bory i świerczyny) |
| zwykłe | Wyższy od ciebie | zbierz wiechy z dojrzałego amarantusa (łąki, roślina z paczki roślin) |
| zwykłe | Nieśmiertelnik | zbierz bukiet z kwitnącej kocanki (piasek w borach i na plażach, roślina z paczki roślin) |
| zwykłe | Zapach lata | zbierz bukiet z kwitnącej lawendy (łąki i hale, roślina z paczki roślin) |
| zwykłe | Róża bez kolców | zbierz kwiat z kwitnącej piwonii (lasy liściaste i brzeziny, roślina z paczki roślin) |
| zwykłe | Pierwszy zwiastun | zbierz kwiat z kwitnącego zawilca (buczyny i lasy liściaste, roślina z paczki roślin) |
| zwykłe | Kto dzwoni? | zbierz kwiat z kwitnącego dzwonka gołębiego (hale i skaliste góry, roślina z paczki roślin) |
| zwykłe | Ogródek zielarza | zbierz liście z kwitnącej szałwii (łąki i skaliste góry, roślina z paczki roślin) |
| zwykłe | Słoneczko | zbierz kwiat z kwitnącego nagietka (łąki i plaże, roślina z paczki roślin) |
| zwykłe | Piętrowy kwiat | zbierz kwiat z kwitnącej cynii (brzeziny i łąki, roślina z paczki roślin) |
| zwykłe | Kłujący błękit | zbierz kwiat z kwitnącego mikołajka (plaże i skaliste góry, roślina z paczki roślin) |
| zwykłe | Dywan z kwiatów | zbierz kwiat z kwitnącego barwinka (lasy liściaste, buczyny i łąki, roślina z paczki roślin) |
| zwykłe | Lniana robota | zbierz wiązkę z dojrzałego, suchego lnu (hale i łąki, roślina z paczki roślin) |
| rzadkie | Murarz | postaw 500 bloków (postęp liczy się w księdze) |
| rzadkie | Głębinowiec | zanurkuj 10 bloków pod powierzchnię |
| rzadkie | Ponad chmurami | wzleć na wysokość 1000 |
| rzadkie | Naoczny świadek | bądź do 60 bloków od uderzenia meteorytu |
| rzadkie | Pełne kosze | zbierz owoce z każdego rodzaju krzaka (pięć - z borówkami) |
| rzadkie | Leśniczy | zetnij pień każdego z sześciu gatunków drzew (postęp w księdze) |
| rzadkie | Z małego ziarenka | wyhoduj drzewo z sadzonki (`docs/drzewa.md`) |
| rzadkie | Komplet narzędzi | zrób siekierę, kilof i łopatę (postęp w księdze) |
| rzadkie | Kopalnia w kieszeni | zagraj na telefonie / tablecie i zniszcz blok palcem (`docs/telefon.md`) |
| rzadkie | Lokator z ikonką | zagraj w aplikacji na Androida (`docs/telefon.md`) |
| rzadkie | Spływ | daj się ponieść nurtowi rzeki przez 100 bloków (`docs/rzeki.md`) |
| rzadkie | Turysta | odwiedź każdy z 11 biomów lądowych (`docs/biomy.md`, `/biom lista`) |
| rzadkie | Dach świata | stań na śniegu na ośnieżonym szczycie (`/biom znajdz snieg tp`) |
| rzadkie | Projektant wnętrz | postaw każdy z pięciu budulców: tynk wapienny, tynk ochrowy, terakotę, polerowany kamień i ciemne deski (postęp w księdze) |
| rzadkie | Promyk słońca | stań w plamie słońca pod dachem (słońce przez okno - `/demo okno`) |
| bardzo rzadkie | Dzień jak noc | zobacz pełne zaćmienie słońca |
| bardzo rzadkie | Kosmiczny złom | wykop blok meteorytu |
| bardzo rzadkie | Houston, mamy widok *(sekret)* | wyleć w kosmos |
| bardzo rzadkie | Koniec świata | dojdź do granicy świata |
| legendarne | Problem spadł z nieba *(sekret)* | wyląduj jako meteoryt - „Tym razem problemem byłeś ty.” |
| legendarne | Skok do basenu *(sekret)* | wpadnij do wody prosto z kosmosu |

## Komendy (do testów)

| komenda | co robi |
|---|---|
| `/osiagniecia` | lista: co zdobyte (✔), punkty, id osiągnięć |
| `/osiagniecia ksiega` | otwiera księgę |
| `/osiagniecia pokaz <ranga \| id>` | samo powiadomienie (bez zdobywania) - rangi: `zwykle`, `rzadkie`, `bardzo-rzadkie`, `legendarne` |
| `/osiagniecia daj <id>` | przyznaje osiągnięcie (w księdze z dopiskiem „przyznane komendą”) |
| `/osiagniecia zabierz <id \| wszystkie>` | zabiera jedno albo wszystkie (także postęp) |

## Jak dodać nowe osiągnięcie

Wszystkie są w **`src/achievements/list.js`** (lista `ACHIEVEMENTS`).
Nowe = nowy wpis:

```js
{
    id: 'first_lamp',                 // nazwa w zapisie - nie zmieniać po wydaniu
    tier: 'common',                   // common, rare, epic, legendary
    title: 'Światełko w tunelu',
    task: 'Postaw lampę.',            // widać w księdze przed zdobyciem
    comment: 'Wreszcie widać, jaki tu bałagan.',
    icon: 'lamp',                     // blok albo przedmiot (ikonka)
    on: 'blockPlaced',                // zdarzenie z gry...
    when: (data) => data.type === 'lamp'   // ...i warunek (bez when - zawsze)
}
```

Zamiast `on` + `when` można dać **`check(game, book)`** - sprawdzane
co pół sekundy w trakcie gry (np. wysokość gracza, pora dnia).

**Postęp** ("zrób coś 500 razy"): w `when` licz przez `book.count('klucz')`
(zwraca nową liczbę) albo `book.collect('klucz', wartość)` (zwraca, ile
różnych wartości) i dodaj `goal: { key: 'klucz', count: 500 }` - księga
pokaże *Postęp: 123 z 500*.

### Zdarzenia z gry

Gra zgłasza je przez `game.achieve('nazwa', dane)`:

| zdarzenie | dane | skąd |
|---|---|---|
| `blockBroken` | `type` - zniszczony blok, `mode` - tryb gry, `tool` - narzędzie w ręce (`axe` albo null) | `Game.breakTarget` |
| `miningAbandoned` | `type` - kopany blok, `progress` - jak daleko było kopanie (0-1) | `Game.updateMining` (puszczony LPM w trybie przygody) |
| `crafted` | `type` - wyrób, `count` - ile sztuk, `recipe` - nazwa przepisu | `InventoryScreen` (wynik wytwarzania), `/wytworz` |
| `blockPlaced` | `type` - postawiony blok | `Game.update` (PPM) |
| `planted` | `type` - sadzonka, `item` - posadzony owoc | `Game.update` (PPM owocem) |
| `harvested` | `type` - krzak (pień z żywicą, kwitnąca lipa), `item` - zebrany owoc (żywica, kwiat lipy) | `Game.harvestTarget` |
| `stripped` | `type` - pień, `into` - okorowany pień, `item` - kora (brzoza) albo null | `Game.stripTarget` (PPM siekierą) |
| `treeGrown` | `species` - gatunek drzewa | `PlantGrowth.grow` (sadzonka wyrosła) |
| `meteorImpact` | `distance` - odległość od gracza | `Meteorites.impact` |
| `skyfallLanded` | `x, y, z` - krater | `space/Skyfall.js` |
| `skyfallSplash` | `speed` | `space/Skyfall.js` |
| `texturePack` | `size` - rozdzielczość tekstur w grze, `name` - nazwa paczki | `main.js` (start świata z paczką tekstur) |

Nowe zdarzenie = jedna linijka `this.achieve('nazwa', { ... })` w miejscu,
gdzie coś się dzieje (w klasach, które znają grę: `this.game.achieve?.(...)`).

### Wygląd i dźwięk

- rangi (nazwy, punkty, kolory, dźwięki) - `TIERS` w `list.js`,
- powiadomienie i księga - `src/ui/achievements.css` (kolory rang też
  tam: `--tier-...`), napisy - `src/ui/texts.js` (`achievement...`),
- melodyjki - `achievement_common` ... `achievement_legendary`
  w `assets/sounds/ui/` (grupa `osiagniecia` w `tools/dzwieki.py`),
  głośność - suwak *Menu, ekwipunek, osiągnięcia*.
- kod: `src/achievements/AchievementBook.js` (zapis, zdarzenia,
  powiadomienia), księga w menu - `Menu.showAchievements`.
