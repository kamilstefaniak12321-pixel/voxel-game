# Niebo i światło

Jak są zbudowane dzień i noc, niebo i oświetlenie bloków - i gdzie
podepną się rzeczy planowane na później: kolorowe światło, dynamiczne
światło, zachody słońca, księżyc, gwiazdy, meteoryty.

## Jak to działa teraz

```
czas świata (WorldTime)          jedna liczba: ile dni minęło (3.5 = 4. dzień, południe)
        │
        ▼
Celestial                        gdzie są słońce, księżyc i gwiazdy; faza księżyca
        │
        ▼
SkyState (SkyColors.js)          kolory nieba i światła o tej porze
        │
        ├──► warstwy nieba       kopuła, księżyc, słońce, gwiazdy (src/sky/layers/)
        ├──► skyUniforms         kolor nieba dla kopuły i dla mgły na blokach
        └──► światła świata      otoczenie (ambient), słońce, księżyc
```

Wszystko liczy się co klatkę z **czasu świata** - nie ma tu nic
losowego ani zapamiętanego (poza efektami jak migotanie gwiazd).
Dzięki temu po wczytaniu świata niebo jest dokładnie takie jak przy
wyjściu, a przestawienie zegara (`[` / `]` w debugu) od razu daje
właściwe niebo.

### Światło na blokach

Każdy róg ściany w meshu chunka ma cztery liczby (atrybut `color`):

| kanał | co zawiera | skąd |
|---|---|---|
| r, g, b | światło bloków (lamp), już w kolorze | `ChunkMesher.js` z `Light.js` |
| a | światło nieba (0-15 zamienione na jasność) | `ChunkMesher.js` z `Light.js` |

W shaderze bloków (`BlockRenderData.js`):

- światło nieba mnoży się przez światła sceny (otoczenie + słońce +
  księżyc), które co klatkę ustawia `Sky.js` według pory dnia,
- światło lamp nie zależy od pory dnia,
- liczy się jaśniejsze z nich.

Najważniejsza zasada: **mesh chunka nie zależy od pory dnia.** Zmiana
dnia w noc nie przebudowuje żadnego chunka - zmieniają się tylko
światła sceny i kolory nieba. Tę zasadę warto trzymać też przy
kolejnych rzeczach.

### Niebo z warstw

Niebo ma własną scenę i kamerę (`Sky.js`) i jest rysowane przed
światem. Każda rzecz na niebie to osobna **warstwa** w `src/sky/layers/`
z tymi samymi metodami:

```js
class MojaWarstwa {
    object                                       // obiekt three.js
    update(state, celestial, dt, pixelRatio)     // co klatkę
    dispose()                                    // przy wyjściu ze świata
}
```

Nowa warstwa = nowy plik + dopisanie jej do listy w konstruktorze
`Sky`. Kolejność rysowania ustala `object.renderOrder`. Obecnie:
kopuła (0), księżyc (1), słońce (2), gwiazdy (3). Księżyc zapisuje
głębię, więc zasłania słońce i gwiazdy za sobą.

### Mgła

Funkcja `skyColor(kierunek)` w `skyShader.js` liczy kolor nieba
i jest używana **dwa razy**: przez kopułę nieba i przez mgłę na
blokach. Dlatego daleki teren znika dokładnie w kolorze nieba za nim,
także o zachodzie, gdy niebo z jednej strony jest pomarańczowe.
Każda zmiana wyglądu nieba w `skyColor` automatycznie zmienia mgłę.

## Plan rozwoju

### Kolorowe światło - ZROBIONE

- `BlockRegistry.js`: pole bloku `lightColor` (np. `'#ff3a2a'`) obok `light`.
- `Light.js`: kanały nieba (0-15) i `RED`, `GREEN`, `BLUE` (0-255), każdy
  rozlewany tym samym kodem. Kolorowe światło traci 25% na blok (a nie
  stałą wartość), więc proporcje kanałów - kolor - zostają do końca
  zasięgu; zasięg dalej zgadza się z siłą `light` (15 = 14 bloków).
- `ChunkMesher.js`: jasność z poziomu najmocniejszego kanału, kolor
  z proporcji kanałów.
- Sprawdzanie: `/demo swiatlo`, `/swiatlo`.

### Barwa światła z nieba - ZROBIONE

Kolory światła na blokach nie są nigdzie wpisane na sztywno -
`SkyColors.js` liczy je z kolorów nieba:

- światło otoczenia - z odcienia całego nieba (w dzień lekko, w nocy
  mocniej),
- światło słońca - z koloru tarczy słońca,
- światło księżyca - niebieskawe, zabarwione kolorem księżyca.

**Warianty nieba** (`Sky.variant`): `sunsetColor` (kolor łuny wschodu
i zachodu) i `moonColor` (kolor księżyca). Dziś ustawiają je komendy
`/niebo zachod` i `/ksiezyc kolor`; w przyszłości np. losowy wariant
zachodu na każdy dzień (z seedu świata, żeby był zawsze taki sam) albo
krwawy księżyc co kilka pełni. Światło dostosuje się samo. Kolejne
rzeczy do zmiany (np. kolor zenitu, kolor gwiazd) warto dodawać jako
kolejne pola wariantu, liczone w `SkyState.update`.

### Dynamiczne światło (lampa w ręce, płonąca strzała, meteoryt)

Nie przez `Light.js` - przebudowywanie chunków co klatkę byłoby za
wolne. Dwa sposoby:

- **Prosty:** lista kilku świateł (pozycja, kolor, zasięg) jako uniformy
  w shaderze bloków; w miejscu oznaczonym komentarzem w
  `BlockRenderData.js` liczymy ich jasność z odległości i bierzemy
  jaśniejsze ze świateł. Wada: świeci przez ściany.
- **Porządny:** małe pudełko światła wokół gracza (np. 32x32x32 komórki)
  jako tekstura 3D. Gdy źródło światła przejdzie do innego bloku, liczymy
  rozlewanie (to samo co w `Light.js`) tylko w tym pudełku - to kilka
  tysięcy komórek, ułamek milisekundy - i wysyłamy teksturę na kartę.
  Shader odczytuje z niej światło po pozycji. Światło omija ściany jak
  zwykłe, a mesh dalej się nie zmienia.

### Słońce i kolorowe wschody / zachody

- Kolory: tabela w `SkyColors.js` (wiersze dla różnych wysokości słońca).
- Kształt łuny i poświaty: funkcja `skyColor` w `skyShader.js`.
- Tarcza słońca: `layers/Sun.js` (rozmiar, kolor, można dać teksturę jak
  księżycowi).
- Pomysły: łuna zależna od pogody, promienie słońca (nowa warstwa), pory
  roku - w `Celestial.js` słońce może chodzić wyżej latem i niżej zimą
  (dłuższe i krótsze dni).

### Księżyc

- Ruch i fazy: `Celestial.js` (`MOON_CYCLE_DAYS`, nachylenie orbity
  `MOON_ORBIT_TILT`). Faza nie jest „wpisana” - wynika z tego, gdzie
  księżyc jest względem słońca, a tarcza jest oświetlana z kierunku
  słońca. Inny cykl albo inna orbita = fazy dalej się zgadzają.
- Wygląd: `layers/Moon.js` i `assets/textures/sky/moon.png`.
- Pomysły: **zaćmienia** (geometrycznie już możliwe - księżyc może
  zasłonić słońce; brakuje przyciemnienia nieba i świata, czyli kilku
  linijek w `SkyState`), krwawy księżyc, faza wpływająca na potwory.

### Gwiazdy

- `layers/Stars.js`: liczba (`STAR_COUNT`), kolory, migotanie. Gwiazdy są
  zawsze te same (stały seed), więc gracz może się ich nauczyć.
- Pomysły: Droga Mleczna (tekstura na osobnej kopule, obracana razem
  z gwiazdami), gwiazdozbiory, spadające gwiazdy (patrz niżej).

### Meteoryty

- **Spadające gwiazdy:** nowa warstwa `layers/Meteors.js`. Gdy
  `state.starVisibility` jest duże, co jakiś czas losuje smugę (linia
  z poświatą, która przelatuje po niebie w 1-2 sekundy).
- **Meteoryt spadający na ziemię:** zdarzenie świata. Gra wybiera miejsce
  upadku (zapisane w świecie, żeby nie zginęło przy wyjściu), warstwa
  rysuje smugę w stronę tego miejsca, a przy upadku `World` robi krater
  i stawia nowy blok, a dynamiczne światło pokazuje rozbłysk.

### Chmury (na przyszłość)

Warstwa w scenie nieba (płaskie, przesuwane z wiatrem) albo bryły
w scenie świata; kolor z `SkyState` (różowe o zachodzie, szare nocą).

## Gdzie co zmienić - ściąga

| chcę zmienić... | plik |
|---|---|
| długość doby, godzinę startu, cykl księżyca, liczbę gwiazd | `src/config.js` (DZIEŃ I NOC) |
| kolory nieba i światła o różnych porach | `src/sky/SkyColors.js` |
| wygląd gradientu, łuny zachodu, poświaty słońca | `src/sky/skyShader.js` |
| rozmiar i wygląd słońca / księżyca | `src/sky/layers/Sun.js`, `Moon.js` |
| teksturę księżyca | `assets/textures/sky/moon.png` |
| jak światło słabnie z odległością, domyślny kolor lamp, cienie w kątach | `src/config.js` (OŚWIETLENIE) |
| kolor i siłę światła konkretnego bloku | `src/blocks/BlockRegistry.js` (`light`, `lightColor`) |
| jak mocno niebo i księżyc barwią światło | `src/sky/SkyColors.js` (`AMBIENT_TINT_...`, `SUN_TINT`, `MOON_TINT`) |
| komendy do sprawdzania | `src/commands/gameCommands.js`, opis: `docs/komendy.md` |
