# Niebo i światło

Jak są zbudowane dzień i noc, niebo, daleki teren i oświetlenie
bloków - i gdzie podepną się rzeczy planowane na później.

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
kopuła (0), księżyc (1), słońce (2), galaktyki (2.5), gwiazdy (3),
spadające gwiazdy (3.5). Księżyc zapisuje głębię, więc zasłania słońce
i gwiazdy za sobą - dzięki temu zaćmienie słońca "dzieje się samo".

### Kolejność rysowania klatki

```
1. niebo            własna scena i kamera (Sky.render)
   (kula Ziemi      tylko wysoko - src/space/Globe.js, docs/kosmos.md)
2. daleki teren     własna scena i kamera (FarTerrain.render)
   (chmury na kuli  tylko wysoko)
3. świat            chunki, meteoryty, ramka bloku...
```

Między krokami czyszczona jest tylko głębia, więc każdy kolejny krok
jest na wierzchu poprzedniego: góry dalekiego terenu zasłaniają
zachodzące słońce, a prawdziwe chunki zawsze zasłaniają daleki teren.
Słońce i księżyc chowają się pod linią `Sky.horizonDip` - z dalekim
terenem i z wysoka to brzeg terenu, który jest trochę pod linią poziomu.

### Mgła i mgiełka

Funkcja `skyColor(kierunek)` w `skyShader.js` liczy kolor nieba
i jest używana przez kopułę nieba, mgłę na blokach i mgiełkę na
dalekim terenie. Dlatego teren w oddali ginie dokładnie w kolorze nieba
za nim, także o zachodzie, gdy niebo z jednej strony jest pomarańczowe.
Każda zmiana wyglądu nieba w `skyColor` automatycznie zmienia mgłę.

- **Bez dalekiego terenu** bloki od ~45% zasięgu widzenia znikają we
  mgle (jak dawniej).
- **Z dalekim terenem** bloki nie znikają: od ~65% zasięgu ich tekstury
  zlewają się w średni kolor (`atlasAverageTexture` w `TextureAtlas.js`),
  a cały teren - bliski i daleki - dostaje tę samą mgiełkę rosnącą
  z odległością (`farHaze` w `src/rendering/viewUniforms.js`,
  `FAR_HAZE_DISTANCE` i `FAR_HAZE_MAX` w `config.js`). Na końcu zasięgu
  bloki wyglądają więc tak jak daleki teren za nimi.

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

### Dynamiczne światło - ZROBIONE

`src/world/DynamicLight.js`: pudełko 32 x 32 x 32 komórek wokół gracza.
Gdy któreś źródło przejdzie do innego bloku (albo zmienią się bloki
w pudełku), liczy w nim rozlewanie tym samym zanikiem co lampy
(`COLOR_DECAY` z `Light.js`) - więc światło omija ściany - i wysyła
wynik na kartę jako teksturę 3D. Shader bloków (`BlockRenderData.js`)
czyta z niej światło w komórce przed każdą ścianą i bierze jaśniejsze
z tego i zwykłego światła. Meshe chunków się nie zmieniają.

Źródło to `{ position, color: [r, g, b], strength: 0-15 }`. Dziś
źródłami są: lampa trzymana w ręce (wybrana na pasku), lecący meteoryt,
błysk uderzenia i kule z `/demo kula` - zbiera je
`Game.updateDynamicLight()`. Nowe źródło (płonąca strzała, świecący
potwór...) = dopisanie go do tej listy. Całość wyłącza ustawienie
„Dynamiczne światło” (WebGL2; na starszym WebGL1 go nie ma).

Ograniczenie: światło liczy się tylko w pudełku wokół gracza, więc
źródło dalej niż ~16 bloków nie oświetla terenu (samo świecenie
- np. kulę ognia - dalej widać).

### Daleki teren (horyzont) - ZROBIONE

`src/world/FarTerrain.js`: za zasięgiem widzenia, do odległości
z ustawienia "Daleki teren", rysuje się gładka siatka wysokości
z generatora terenu (`TerrainGenerator.getHeightLod`) - te same góry
i wzgórza, które wygenerowałyby się tam naprawdę, ale bez bloków.

- **Kafelki** (drzewo czwórkowe): 32 x 32 kratki, blisko gracza kratka
  ma 4 bloki, dalej 8, 16, 32, 64 (`DETAIL`; w trybie ziemniaka
  rzadsza siatka `POTATO_DETAIL`).
  Rzadsze kafelki liczą mniej oktaw szumu - z daleka drobnych pagórków
  nie widać, a próbkowane co kilkadziesiąt bloków dałyby "kolce".
  Kafelki leżą w stałych miejscach świata, budują się z limitem czasu
  (`BUILD_BUDGET_MS`) i nowy zestaw pokazuje się dopiero, gdy jest gotowy.
  Szczeliny między kafelkami różnej dokładności zasłaniają fartuchy.
- **Kolory**: średnie kolory tekstur trawy (płasko), boku trawy
  (stromo) i kamienia (wysoko) - nowa tekstura sama zmienia daleki teren.
- **Światło**: te same światła nieba co bloki (`Sky.attachLights`), to
  samo nocne odbarwienie, ten sam suwak jasności. Zaćmienie, faza
  księżyca, kolor zachodu - wszystko działa i tu.
- **Zmiany gracza**: kolumny w chunkach zmienionych przez gracza są
  liczone z ich bloków (`World.savedChunks`). Gdy taki chunk znika
  z pamięci, kafelki nad nim przebudowują się (`invalidateChunk`).
- **Sprawdzanie**: `/horyzont`, `/horyzont lod` (kolory dokładności),
  `/horyzont odswiez`, `/wydajnosc`.
- Pomysły: chmury rzucające cień na daleki teren, woda (gdy będzie)
  jako płaszczyzna w kafelkach, zimą śnieg na szczytach.

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
- Pomysły: zaćmienie księżyca (pełnia w cieniu Ziemi - czerwona tarcza;
  działałoby jak zaćmienie słońca, tylko w pełni), krwawy księżyc,
  faza wpływająca na potwory.

### Zaćmienia słońca - ZROBIONE

- **Kiedy** (`Celestial.js`): księżyc chodzi kilka-kilkanaście stopni
  na północ albo południe od drogi słońca, a ta "szerokość" zmienia się
  płynnie z cyklu na cykl (`newMoonLatitude`). W nowiu, w którym jest
  mniejsza niż suma promieni tarcz, księżyc przechodzi przed słońcem.
  Które nowie, wynika z numeru cyklu (zawsze te same), a ile ich jest -
  z `ECLIPSE_CHANCE` i `ECLIPSE_TOTAL_SHARE` w `config.js`. Pierwsze dwa
  nowie świata nie mają zaćmień.
- **Ile zasłania**: `Celestial.eclipse` - pole wspólnej części tarcz
  (`sunCoverage`) liczone z prawdziwego położenia słońca i księżyca.
  Pełne zaćmienie jest możliwe, bo księżyc jest trochę większy niż
  słońce (`MOON_DIAMETER` > `SUN_DIAMETER`); im większa różnica, tym
  dłużej trwa.
- **Wygląd** (`SkyColors.js`, `ECLIPSE_...`): światło słońca słabnie
  dokładnie o zasłoniętą część, niebo i światło otoczenia trochę wolniej
  (przy małym zaćmieniu prawie nic nie widać). W pełnym: zmrok,
  łuna dookoła horyzontu (`uEclipseGlow` w `skyColor`), korona wokół
  tarczy (`layers/Sun.js`), najjaśniejsze gwiazdy, słaba poświata
  ciemnej strony księżyca.
- **Sprawdzanie**: `/zacmienie`, `/zacmienie lista`, `/zacmienie
  nastepne`, `/zacmienie pokaz pelne | czesciowe | 50`.

### Noc zależna od księżyca - ZROBIONE

`SkyColors.js` liczy dla każdej chwili, jak ciemne jest niebo i ile
światła daje księżyc (faza x wysokość nad horyzontem):

- **światło na blokach**: w nowiu tylko słabe światło gwiazd, w pełni
  sporo światła księżyca (`MOON_AMBIENT`, `MOON_LIGHT`). Nocą świat
  traci kolory i idzie w barwę światła księżyca (`NIGHT_DESATURATION`,
  shader bloków) - pełnia jest jasna, ale srebrna, a nie dzienna,
- **gwiazdy**: `state.starLimit` - jaka część najsłabszych gwiazd
  znika (zmierzch, jasny księżyc: `MOON_HIDES_STARS`),
- **Droga Mleczna i galaktyki**: `state.galaxyVisibility`,
- **spadające gwiazdy**: `state.meteorsPerMinute`
  (`METEORS_PER_MINUTE`, `METEOR_SHOWER_FACTOR`).

### Gwiazdy, Droga Mleczna, galaktyki - ZROBIONE

- `layers/Stars.js`: `STAR_COUNT` gwiazd (w nowiu widać wszystkie), kolory,
  migotanie, zawsze te same (stały seed).
- `layers/Galaxies.js`: pas Drogi Mlecznej z obłokami i ciemnymi pasmami
  pyłu (szum w shaderze), cieplejsze jądro, trzy odległe galaktyki.
  Kierunek pasa i galaktyk - stałe na górze pliku.
- Pomysły: gwiazdozbiory, zorza polarna (nowa warstwa), pory roku
  (Droga Mleczna w innym miejscu o tej samej godzinie).

### Meteoryty - ZROBIONE

- **Spadające gwiazdy** (`layers/ShootingStars.js`): smugi na niebie,
  co dwudziesta to kolorowy bolid. Mniej więcej co siódma noc to deszcz
  meteorów (`isMeteorShowerNight` w `Sky.js`) - kilka razy więcej smug
  i wszystkie lecą z jednego punktu nieba (radiantu).
- **Meteoryty spadające na ziemię** (`src/game/Meteorites.js`) - pokaz
  w trzech częściach:
  1. *przelot* (`FLIGHT_SECONDS`, 8 s): z daleka (`START_DISTANCE`),
     nisko nad horyzontem, na początku wolno, potem coraz szybciej.
     Rozżarzona, obracająca się bryła (tekstura bloku meteorytu)
     w trzech poświatach, świecący warkocz, kanciaste iskry
     (`rendering/CubeParticles.js` - świecące sześciany, stygną z bieli
     przez pomarańcz do czerwieni), smuga dymu i co chwilę odpadający
     płonący odłamek. Niebo wokół kuli łuna (`uMeteorGlow`
     w `skyShader.js`), a teren jaśnieje coraz mocniej
     (`rendering/meteorLight.js` - światło punktowe w shaderach bloków,
     roślin, dalekiego terenu, modelu gracza i cząsteczek; bez cieni,
     za to z każdej odległości). Z bliska działa też dynamiczne światło;
  2. *uderzenie*: błysk ekranu (nakładka), nieba (`uSkyFlash`)
     i terenu, wstrząs kamery (`Meteorites.shake`, `Game.render`), kula
     ognia, fala iskier, deszcz odłamków w kolorach rozbitych bloków
     (odbijają się od bloków i leżą chwilę), słup iskier, pierścień pyłu;
     krater z nierównym brzegiem, wyłożony żwirem i ziemią kamienistą,
     z wałem wyrzuconej ziemi, osmalona (czarnoziem) okolica bez roślin
     (`SCORCH_RADIUS`), na dnie blok `meteorite` (świeci) i czasem
     odłamki;
  3. *po uderzeniu* (`IMPACT_SECONDS`): słup dymu podświetlony od dołu,
     iskry z krateru, gasnący żar.
  Ile cząsteczek - `PARTICLES` (tryb ziemniaka: 40%). Częstość:
  `METEORITES_PER_NIGHT` w `config.js`. Nigdy nie spada w chunki
  zmieniane przez gracza. Komendy: `/meteor`, `/meteor tu`,
  `/meteor pokaz`, `/meteor tempo 0.25`.
- Pomysły: rzadki meteoryt z nowym surowcem w środku, meteoryt
  zostawiający płonące bloki (ogień), dźwięk przelotu i uderzenia.

### Kosmos - ZROBIONE (sekret)

Wysoko nad światem (`Sky.space`, `SkyState.space`): czarna kopuła
(`uSpace`), gwiazdy i Droga Mleczna także w dzień, bez horyzontu
i migotania, białe słońce, planety (`layers/Planets.js` - widoczne
tylko tam), a świat zagięty w kulę Ziemi. Opis: `docs/kosmos.md`.

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
| ile światła daje księżyc, jak bardzo noc traci kolory, ile gwiazd chowa pełnia, ile spadających gwiazd | `src/sky/SkyColors.js` (`MOON_...`, `NIGHT_DESATURATION`, `METEORS_...`) |
| wygląd Drogi Mlecznej i galaktyk | `src/sky/layers/Galaxies.js` |
| jak często spadają meteoryty, krater | `src/config.js` (`METEORITES_PER_NIGHT`), `src/game/Meteorites.js` |
| dynamiczne światło (pudełko, źródła) | `src/world/DynamicLight.js`, `Game.updateDynamicLight()` |
| jak często są zaćmienia, ile z nich pełnych, rozmiar tarcz | `src/config.js` (`ECLIPSE_...`, `SUN_DIAMETER`, `MOON_DIAMETER`) |
| jak ciemno jest w czasie zaćmienia, kolory nieba i łuny | `src/sky/SkyColors.js` (`ECLIPSE_...`) |
| korona przy pełnym zaćmieniu | `src/sky/layers/Sun.js` |
| daleki teren: dokładność kafelków, kolory | `src/world/FarTerrain.js` |
| gęstość mgiełki w oddali | `src/config.js` (`FAR_HAZE_DISTANCE`, `FAR_HAZE_MAX`) |
| jak bloki zlewają się w daleki teren, suwak jasności | `src/rendering/viewUniforms.js`, `BlockRenderData.js` |
| co upraszcza tryb ziemniaka | `src/config.js` (`POTATO_...`), `FarTerrain.js` (`POTATO_DETAIL`), define `POTATO` w shaderach bloków i dalekiego terenu |
| komendy do sprawdzania | `src/commands/gameCommands.js`, opis: `docs/komendy.md` |
