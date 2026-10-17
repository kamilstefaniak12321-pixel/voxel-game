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
| zwykłe | Zielone palce | posadź owoc albo orzech |
| zwykłe | Mokra robota | popływaj |
| zwykłe | Nocny marek | bądź w świecie o północy |
| rzadkie | Murarz | postaw 500 bloków (postęp liczy się w księdze) |
| rzadkie | Głębinowiec | zanurkuj 10 bloków pod powierzchnię |
| rzadkie | Ponad chmurami | wzleć na wysokość 1000 |
| rzadkie | Naoczny świadek | bądź do 60 bloków od uderzenia meteorytu |
| rzadkie | Pełne kosze | zbierz owoce z każdego rodzaju krzaka |
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
| `blockBroken` | `type` - zniszczony blok | `Game.breakTarget` |
| `blockPlaced` | `type` - postawiony blok | `Game.update` (PPM) |
| `planted` | `type` - sadzonka, `item` - posadzony owoc | `Game.update` (PPM owocem) |
| `harvested` | `type` - krzak, `item` - zebrany owoc | `Game.harvestTarget` |
| `meteorImpact` | `distance` - odległość od gracza | `Meteorites.impact` |
| `skyfallLanded` | `x, y, z` - krater | `space/Skyfall.js` |
| `skyfallSplash` | `speed` | `space/Skyfall.js` |

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
