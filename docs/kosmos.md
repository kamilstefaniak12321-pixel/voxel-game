# Kosmos (sekret)

> Uwaga, spoiler - to easter egg. W grze nie ma o nim słowa (komendy
> `/kosmos` nie ma na liście `/pomoc`), dopóki ktoś sam nie poleci
> bardzo wysoko.

## Co się dzieje

1. **Lot w górę.** W locie (tryb kreatywny: 2× Spacja, albo `/latanie`)
   Spacja i Shift przyspieszają z wysokością: przy ziemi zwykle,
   na 1000 blokach ~15 razy szybciej, w kosmosie kilkaset bloków na
   sekundę. Z ziemi do kosmosu leci się ~40 sekund. W poziomie lot
   jest zwykły.
2. **Świat się zagina.** Od ~350 bloków daleki teren zaczyna się
   zaginać w dół, a za jego końcem pojawia się reszta kuli - od
   ~1600 bloków świat to kula o promieniu 4000 bloków
   (`GLOBE_RADIUS`). Horyzont jest dokładnie tam, gdzie kończy się
   kula, a niebo ma gradient od tego horyzontu.
3. **Kosmos.** Od 800 bloków niebo ciemnieje (najpierw nad głową),
   od 3000 jest czarne: gwiazdy i Droga Mleczna świecą też w dzień
   i nie migoczą, słońce jest białe, księżyc jasny, a wśród gwiazd
   widać **planety**: Marsa, Jowisza (z wielką czerwoną plamą),
   Saturna z pierścieniami i Neptuna. Słychać cichy pomruk kosmosu.
   Na czacie: *Witaj w kosmosie!* (raz) z podpowiedzią, jak wrócić.
4. **Ziemia z kosmosu.** Kula ma kontynenty i morza z prawdziwego
   terenu świata (płytkie morze jaśniejsze, głębokie ciemne), cieniowane
   góry, białe czapy lodowe na północy i południu, chmury przesuwane
   wiatrem, połysk słońca na morzu, świecącą krawędź atmosfery i granicę
   dnia i nocy - każde miejsce kuli ma własną porę dnia (w nocy u gracza
   widać nad krawędzią kuli oświetloną słońcem stronę).
5. **Powrót jak meteoryt.** Wystarczy wyłączyć latanie (2× Spacja) -
   gracz spada z prędkością zależną od wysokości (z 6000 bloków ~500
   bloków na sekundę, przy ziemi ~200). Z 6000 bloków to ~18 sekund.
   W kosmosie leci się w ciszy, a po wejściu w powietrze (poniżej ~3500)
   z hukiem zapala się **powłoka ognia**: kula ognia wokół gracza,
   płomienie na brzegach ekranu, iskry mijające gracza w górę, smuga
   dymu, teren w dole coraz jaśniej pomarańczowy, drżąca kamera,
   szersze pole widzenia, ryk ognia i pęd powietrza.
6. **Uderzenie** to wybuch jak przy meteorycie (`Meteorites.explode`):
   błysk, wstrząs, fala, deszcz odłamków, dymiący i żarzący się krater
   (1,2 raza większy od krateru meteorytu, bez bloku meteorytu - to
   gracz był meteorytem). Na czacie: *Wylądowałeś jak meteoryt!*
   Krater powstaje wszędzie - także na budowlach (ostrożnie!).
   Wpadnięcie do **wody** to wielki plusk i para, bez krateru.

Z każdej wysokości powyżej 1000 bloków (np. po `/tp ~ 2000 ~`) gracz,
który nie leci, spada jak meteoryt - także w trybie przygody.

## Komenda

| komenda | co robi |
|---|---|
| `/kosmos` | przenosi na 6000 bloków (w locie) - widok na Ziemię |
| `/kosmos lec <wysokość>` | to samo na podanej wysokości (1000-30000) |
| `/kosmos spadaj [wysokość]` | od razu spadanie jak meteoryt (domyślnie z 6000) |
| `/kosmos status` | wysokość, ile kosmosu i kuli, postęp mapy kuli, prędkość spadania i ogień |

Komenda jest ukryta (`hidden: true` w `gameCommands.js`): nie ma jej
w `/pomoc` ani w podpowiedziach, ale `/pomoc kosmos` ją opisuje.

## Liczby do strojenia (`src/config.js`, sekcja KOSMOS)

| stała | co |
|---|---|
| `FLY_BOOST_START`, `FLY_BOOST_BLOCKS` | od jakiej wysokości i jak szybko lot w pionie przyspiesza |
| `SPACE_MAX_ALTITUDE` | sufit (30000) |
| `SPACE_START`, `SPACE_FULL` | niebo zaczyna ciemnieć / jest czarne |
| `SPACE_CURVE_START`, `SPACE_CURVE_FULL` | świat zaczyna się zaginać / jest kulą |
| `GLOBE_RADIUS` | promień kuli (mniej = mniejsza planeta) |
| `SKYFALL_START` | od jakiej wysokości spada się jak meteoryt |
| `SKYFALL_SPEED`, `SKYFALL_SPEED_PER_BLOCK`, `SKYFALL_MAX_SPEED` | prędkość spadania (z wysokością) |
| `SKYFALL_CRATER_SCALE` | wielkość krateru (razy krater meteorytu) |

Wygląd planet - lista `PLANETS` w `src/sky/layers/Planets.js` (miejsce
na niebie, wielkość, pierścienie, wzór w shaderze). Chmury, czapy lodowe,
poświata atmosfery - shadery w `src/space/Globe.js`. Ogień i cząsteczki
spadania - `PARTICLES` i kolory w `src/space/Skyfall.js`, płomienie na
ekranie - `#reentry` w `src/ui/hud.css`.

## Jak to działa

Świat jest płaski - z wysoka **zawijamy go w kulę** wokół miejsca pod
graczem: punkt świata w odległości `d` od gracza trafia na kulę
w odległość łuku `d` w tym samym kierunku. Dzięki temu pod graczem
wszystko się zgadza, a im dalej, tym niżej leży teren.

- **`src/space/SpaceView.js`** - co klatkę z wysokości oczu liczy
  `space` (niebo) i `curve` (kula), ustawia je niebu (`Sky.space`),
  dalekiemu terenowi (`viewUniforms.uCurvature` = `curve / GLOBE_RADIUS`,
  czyli 1 / promień kuli - zanim świat całkiem się zagnie, kula jest
  ogromna i prawie płaska) i kuli; horyzont kuli dla nieba
  (`Sky.horizonDip`); pomruk kosmosu.
- **Daleki teren** (`src/world/FarTerrain.js`) wygina się w shaderze
  wierzchołków (pozycja i kierunek "w górę" do światła). Każde miejsce
  ma własną porę dnia: do światła u gracza dochodzi różnica między
  słońcem tutaj a słońcem u gracza (`GLOBE_LIGHT_GLSL`
  w `viewUniforms.js`). Brzeg dalekiego terenu nie znika w niebie,
  tylko - postrzępiony - przechodzi w kulę. Z wysoka bliskie kafelki
  są mniej dokładne (liczy się też wysokość kamery), a powyżej
  ~1200 bloków daleki teren jest także pod graczem (chunków już nie
  widać - `HIGH_VIEW` w `Game.js`).
- **Mgiełka** (`hazeAlong` w `viewUniforms.js`) z wysoka jest cieńsza -
  powietrze rzednie z wysokością (`HAZE_HEIGHT`), przy samej ziemi
  wszystko jak dawniej.
- **`src/space/Globe.js`** - kula nie jest siatką trójkątów: dla każdego
  piksela ekranu shader liczy, gdzie promień z kamery trafia w kulę
  (dokładnie przy każdej wielkości kuli). Dwa przejścia: powierzchnia
  i poświata atmosfery (przed dalekim terenem) oraz chmury (po nim, więc
  są też nad dalekim terenem). Światło i mgiełka liczone tak samo jak na
  dalekim terenie - na granicy obu nie widać szwu. W trybie ziemniaka
  mapa jest mniejsza, a chmur nie ma.
- **`src/space/GlobeMap.js`** - mapy terenu z generatora
  (`generator.farSurface` - to samo co daleki teren, dla morza też
  głębia): daleka (cała widoczna kula, ~30 bloków na piksel) i bliska
  (środek, dwa razy dokładniej). Liczą się po kawałku co klatkę
  (~4 ms), od zgrubnych do dokładnych, od ~230 bloków wysokości - zanim
  kula będzie potrzebna. Gdy gracz odleci daleko od środka mapy, liczy
  się nowa.
- **Niebo** (`src/sky/`): `SkyState.space` - gwiazdy i Droga Mleczna
  zawsze, białe słońce, bez spadających gwiazd; kopuła czernieje
  (`uSpace` w `skyShader.js`), gwiazdy bez horyzontu i migotania;
  nowa warstwa `layers/Planets.js` (widoczna tylko w kosmosie).
- **Fizyka** (`src/player/Player.js`): `flyBoost(y)` - przyspieszenie lotu,
  `skyfallSpeed(y)` i `updateSkyfall` - spadanie z kosmosu, a na końcu
  `skyfallImpact` (uderzenie w ziemię) albo `skyfallSplash` (woda).
- **`src/space/Skyfall.js`** - ogień, cząsteczki (wspólne z meteorytami),
  światło na terenie (`meteorLight.js` i dynamiczne), wstrząs, pole
  widzenia, dźwięki, krater (`Meteorites.explode` z wolnym od cząsteczek
  środkiem - gracz stoi w środku wybuchu) i plusk.
- **Dźwięki** (`assets/sounds/space/`, grupa `kosmos` w `tools/dzwieki.py`):
  `space_ambient` (pomruk kosmosu), `skyfall_wind` (pęd powietrza),
  `skyfall_ignite` (zapłon), a ryk ognia to `meteor_flight`.

Kolejność rysowania klatki (`Game.render`): niebo → kula Ziemi →
daleki teren → chmury na kuli → świat.
