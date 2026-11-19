# Zimno i zamarzanie (1.26.0)

Pomysł Kamila: kto nie dba o ciepło, ten **zamarza na kość w bryle
lodu**, a czas leci do odwilży. W grze się nie umiera - zamarznięcie
kosztuje czas (czasem całą zimę), siły i pełny żołądek, nie rzeczy.

## Odczuwalna temperatura

Liczy się co pół sekundy w miejscu gracza (`src/game/Warmth.js`):

| Część | Ile |
|---|---|
| powietrze | temperatura z pogody tam, gdzie stoisz: pora roku, klimat, pora doby, opad, wysokość (`/pogoda`) |
| schronienie | do +5°C - im mniej nieba nad głową, tym cieplej (zamknięta izba +5) |
| wiatr | na otwartym terenie -0,7°C na każdy blok/s wiatru, najwyżej -6°C; pod dachem nie wieje |
| woda | w wodzie -6°C |
| ognisko | płonące: +22°C tuż przy nim (do 1,5 bloku), słabiej dalej, nic dalej niż 7 bloków; żar - połowa |
| pochodnia, lampa | +6°C tuż obok, nic dalej niż 4 bloki; razem najwyżej +12°C; rozgrzany meteoryt +4°C |
| jedzenie | ciepła potrawa z garnka i każdy napar: **ciepło w brzuchu** +6°C przez 3 godziny gry; chili: +4°C przez 2 godziny |

`/zimno` pokazuje wszystkie części tu, gdzie stoisz.

## Wychłodzenie

Wychłodzenie (0-100) rośnie, gdy odczuwalnie jest **poniżej 5°C**,
i spada, gdy cieplej (przy ognisku szybko).

| Odczuwalnie | Od zera do zamarznięcia |
|---|---|
| -20°C | ok. 4 minut |
| -10°C | ok. 7 minut (zimowa noc trwa ok. 8) |
| -3°C | ok. 12 minut |
| od 0°C do 5°C | nie da się zamarznąć - najwyżej „zmarznięty" (70) |

- Ruch grzeje: idący marznie o 15% wolniej, biegnący o 30% (pływanie
  nie grzeje). Wyczerpany marznie szybciej, najedzony wolniej.
- **Chłodno** (od 30): praca trochę wolniejsza, przy sercu płatek
  śniegu, dreszcze i napis.
- **Zmarznięty** (od 60): coraz wolniej chodzisz (przy 100 - niecała
  połowa), od 85 nie biegasz, szybciej tracisz energię, brzegi obrazu
  pokrywa szron.
- **Zamarznięty** (100): bryła lodu.

## Bryła lodu

`src/game/Freeze.js`:

1. Lód rośnie od stóp w górę (ok. 2 s), słychać zamarzanie.
2. **Gra solo**: czas przyspiesza do odwilży - pierwszej godziny,
   w której powietrze w tym miejscu (ze schronieniem) dojdzie do +2°C.
   Zimą bywa, że to dopiero wiosna; jesienną nocą - ranek. Krótki
   przeskok (do 3/4 doby) widać przez lód - niebo jaśnieje powoli.
   Dłuższy zakrywa lód z licznikiem dni (żadnego migania dnia i nocy).
   Rośliny, ogniska i psucie się jedzenia liczą się za cały ten czas.
3. **Gra ze znajomymi**: zamarznięty stoi w lodzie i może się tylko
   rozglądać. Odtaje, gdy ktoś **rozpali obok ognisko albo postawi
   pochodnię** (ciepło od +5°C) albo gdy samo zrobi się ciepło. Inni
   widzą bryłę lodu z zastygłą postacią. Gdy zamarzną wszyscy, czas
   przyspiesza u gospodarza.
4. Lód pęka i topnieje. Zostajesz **wyczerpany, z pustym żołądkiem
   i zziębnięty** (wychłodzenie 55). Dni w lodzie nie obniżają kondycji.

## Sen na mrozie

Gdy noc przeskakuje, zimno za te godziny liczy się naraz - w cieple
miejsca snu przy pobudce. Łóżko grzeje o 8°C, posłanie o 4°C. We śnie
nie da się zamarznąć, ale na gołej ziemi w mróz budzisz się zmarznięty.

## Osiągnięcia i komendy

*Sopel lodu* - zamarznij. *Grzanie rąk* - zmarznięty ogrzej się przy
ognisku. *Ratownik* - bądź przy tym, jak inny gracz odtaje.

`/zimno` - odczuwalna temperatura w częściach i wychłodzenie;
`/zimno ustaw <0-99>`, `/zimno zamarznij`, `/zimno odmroz`.

## Dla programisty

- `src/game/Warmth.js` - liczby, `feltTemperature`, `fireHeat`,
  `blocksHeat`, `findWarm` (szukanie odwilży w polu pogody - rok co
  godzinę to ok. 15 ms), klasa `Warmth` (pomiar co pół sekundy).
- `src/game/Wellbeing.js` - `chill`, `cool`, `COLD_STATES`, skutki
  w `effects`, `frost`, `thawed`, `skipTo`, `sleep(..., felt)`.
- `src/game/Freeze.js` - fazy bryły lodu, przyspieszony czas, gra ze
  znajomymi.
- `PlayerModel.setIce`, `RemotePlayers` (flaga `frozen` w
  `net/protocol.js`), `StatusPanel.showFrost` (#frost w `index.html`).
- Dźwięki: `tools/dzwieki.py` grupa `lod`. Tekstura bryły:
  `tools/lod_tekstury.py`.
- Test: `tools/sprawdz_zimna.mjs`.

## Czego nie ma (luki)

- **Ubrań** - przyjdą z włóknami (1.27.0) i będą chronić przed zimnem.
- Mokre ubranie po kąpieli nie wychładza dłużej - liczy się tylko
  bycie w wodzie.
- Śnieg pod nogami i burza śnieżna nie wychładzają osobno (tylko przez
  temperaturę powietrza, opad i wiatr).
- Ciepło ogniska nie zależy od ścian - przechodzi przez nie.
- Schronienie liczy się po świetle nieba przy głowie: gęsta korona
  drzewa też trochę osłania.
- Gra ze znajomymi: nie próbowałem w dwóch kartach (logikę sprawdzają
  testy). Gdy zamarzną wszyscy, odwilż liczy się w miejscu gospodarza.
- Zwierzęta nie marzną.
- Liczby (5°C, tempo, ciepło ogniska) dobrałem na oko i na podstawie
  pogody w jednym świecie - do oceny w grze.
