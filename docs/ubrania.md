# Włókna i ubrania (1.27.0)

Pomysł Kamila: stół do szycia, na którym z materiału powstaje płótno
zależne od materiału, z płótna - ubranie wybranego kroju i wzoru, a na
koniec da się je zabarwić.

## Od rośliny do włókna

1. **Moczenie.** Wiązkę lnu (nożem z kwitnącego lnu), pokrzywę albo korę
   lipową (siekierą z pnia lipy) wrzuć do wody - klawisz wyrzucania.
   Po **półtorej minuty w wodzie** cały stos zamienia się w moczony len,
   moczoną pokrzywę albo łyko. Wyjęte wcześniej - zaczyna od nowa.
2. **Włókno.** Moczony len w siatce wytwarzania daje 2 włókna lniane,
   moczona pokrzywa - 1 włókno pokrzywowe. Łyko jest włóknem od razu.
3. **Sznur.** Trzy dowolne włókna.
4. **Stół krawiecki.** Dwie deski na dwóch sznurach.

## Stół krawiecki

PPM na stole otwiera ekwipunek ze stołem zamiast siatki wytwarzania
(górny rząd okna ma wtedy jeden wiersz więcej; plecak i pas chowają się).

### Krosno

Włókno w polu krosna; klik w wynik tka jedno płótno z dwóch włókien
(Shift - ile się da). Płótno zależy od włókna:

| Włókno | Płótno | Kolor | Grzeje (mnożnik) | Kroje |
|---|---|---|---|---|
| włókno lniane | płótno lniane | jasny len | × 0,8 | wszystkie poza łapciami |
| włókno pokrzywowe | płótno pokrzywowe | szarozielone | × 1,1 | wszystkie poza łapciami |
| łyko | plecionka z łyka | brązowa | × 0,8 | kamizelka, łapcie |

### Szycie

Płótno w polu materiału, krój i wzór przyciskami pod spodem, barwniki
w dwóch polach obok (kolor ubrania i kolor wzoru - oba można pominąć,
wtedy zostaje naturalny kolor płótna). **Postać w podglądzie od razu
przymierza to, co powstanie.** Klik w wynik szyje.

| Krój | Gdzie | Płócien | Grzeje (lniane / pokrzywowe) |
|---|---|---|---|
| czapka | głowa | 1 | 1,2 / 1,7 °C |
| chusta | głowa | 1 | 0,8 / 1,1 °C |
| opaska | głowa | 1 | 0,4 / 0,6 °C |
| koszula | tułów | 3 | 2,4 / 3,3 °C |
| kamizelka | tułów | 2 | 1,2 / 1,7 °C (z łyka 1,2) |
| tunika | tułów (i góra nóg) | 4 | 3,2 / 4,4 °C |
| spodnie | nogi | 3 | 2 / 2,8 °C |
| krótkie spodnie | nogi | 2 | 0,8 / 1,1 °C |
| buty | stopy | 2 | 1,2 / 1,7 °C |
| łapcie | stopy | 2 plecionki z łyka | 0,8 °C |

**Wzory**: gładki, paski (co cztery wiersze), krata, haft (wyszywany
brzeg przy dole, mankietach i kołnierzu). Wzór ma swój kolor - barwnik
w drugim polu; bez niego wzór jest ciemniejszym odcieniem ubrania.

### Barwienie

Gotowe ubranie zamiast płótna: wybierz wzór, połóż barwnik (albo oba).
Potrzebny choć jeden barwnik; każdy użyty kolor zużywa jeden barwnik.
Barwników jest 16 - te same co do pochodni.

## Noszenie

Obok postaci w ekwipunku są cztery miejsca: **głowa, tułów, nogi,
stopy**. Klik ubraniem w pasujące miejsce zakłada je (zamiana z noszonym),
pusta ręka zdejmuje, Shift + klik zdejmuje do ekwipunku. Shift + klik na
ubraniu w ekwipunku od razu je zakłada.

Ubrania widać na postaci - z trzeciej osoby, w podglądzie ekwipunku
i u innych graczy w grze ze znajomymi. Barwione ubrania mają ikonki
w swoich kolorach (ekwipunek, pasek). Ubrania się nie układają w stosy.

Ubrania grzeją: ich ciepło dodaje się do odczuwalnej temperatury
([zimno.md](zimno.md)). Cały pokrzywowy strój (czapka, tunika, spodnie,
buty) to ok. +10,6°C - w zwykłą zimę dobrze ubrany nie zamarza, ale bez
ognia i dachu dalej marznie.

## Stare krzaki owocowe

Od 1.27.0 w nowym terenie nie rosną już stare krzaki truskawki, jeżyny,
leszczyny i borówki - ich owoce dają nowe krzewy (zarośla jeżyn, krzew
leszczyny, borówka wysoka - także w świerkowym lesie) i rośliny niskie
(truskawka). Zostaje chili. Krzaki w już wygenerowanych miejscach zostają.

## Osiągnięcia i komendy

*Moczenie lnu*, *Tkacz*, *Krawiec*, *Kolorowo*, *Od stóp do głów*.

`/ubrania` - co masz na sobie i ile grzeje; `/ubrania daj [len|pokrzywa|lyko]`
- materiały do wypróbowania szycia; `/ubrania zestaw <barwnik> [wzór]` -
od razu cały strój; `/ubrania zdejmij`.

## Dla programisty

- `src/items/clothing.js` - moczenie, płótna, kroje, wzory, kolory,
  `weave`, `sewResult`, `wornWarmth`, `clothesCode` / `parseClothes`.
- `src/items/freshness.js` - stos niesie `look` (wygląd ubrania),
  `stackSize` (ubrania - 1).
- `src/ui/SewingPanel.js` - stół w ekwipunku; `InventoryScreen` - miejsca
  na ubrania (`clickEquip`), tooltipy.
- `src/player/clothes.js` - malowanie ubrań na skórce 64 x 64 (`CUTS` -
  które części i wiersze pokrywa krój); `player/skin.js` - skórka
  z ubraniami (`setWornClothes`), inni gracze dostają samą skórkę i kod
  ubrań w stanie gracza (`net/protocol.js`).
- `src/ui/garmentIcons.js` - ikonki barwionych ubrań (przemalowanie
  ikonki z atlasu).
- Tekstury: `tools/ubrania_tekstury.py`. Test: `tools/sprawdz_ubran.mjs`.

## Czego nie ma (luki)

- Ubrania nie zużywają się i nie brudzą.
- Barwione ubranie leżące na ziemi, w skrzyni i w ręce ma naturalną
  ikonkę/model - kolory widać w ekwipunku, na pasku i na postaci.
- Nie ma wełny (nie ma owiec), skóry ani futer - tylko len, pokrzywa
  i łyko. Płaszcz i kapelusz z rondem wymagałyby nowych kształtów modelu.
- Plecak i pas na narzędzia nadal czekają.
- Ubrania nie chronią przed deszczem i nie grzeją za mocno latem.
- Na telefonie stół krawiecki ma ciasny układ (nie sprawdzałem na
  telefonie).
- Liczby (ciepło krojów, czas moczenia) dobrane na oko.
