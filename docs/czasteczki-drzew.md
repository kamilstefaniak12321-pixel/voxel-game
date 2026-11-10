# Spadające liście, owoce i smugi wiatru (0.82.0)

Pomysł Kamila: drzewa ożywają, bo z koron powoli spadają liście w ich
kolorach, a z drzew owocowych czasem spada owoc. Do tego dochodzi lekki
wiatr w postaci delikatnych, półprzezroczystych smug.

## W grze

- **Liście:** z dolnych bloków koron (pod liściem jest powietrze) w promieniu
  28 bloków od gracza spadają małe liście. Od 0.84.0 to obrazki 6 × 6
  „minipikseli” (dawniej kwadratowe płatki) w kształcie liścia gatunku:
  iglaki (świerk, sosna, cyprys błotny, kosodrzewina, sekwoja) gubią igły
  i gałązki, klon - klonowe liście z wcięciami, wiśnia - płatki, oliwka,
  wierzba, akacja i eukaliptus - wąskie liście, brzoza i lipa - okrągłe,
  reszta - owalne. Mają kolory zwykłych liści tego gatunku, bez owoców
  i kwiatów, a minipiksele są ostre (bez rozmycia). Spadają powoli, kołyszą się na boki
  i płyną z wiatrem, a potem chwilę leżą na ziemi i znikają. Każdy dół
  korony puszcza średnio jeden liść na 40 s (w porywie trochę więcej),
  w sumie najwyżej 14 na sekundę.
- **Owoce:** z liści z owocami drzew z katalogu (np. jabłoń) średnio raz
  na 75 s spada owoc w kolorach swojej ikonki. Spada szybko, odbija się
  i zostaje na ziemi. To tylko obraz, owoce do zbioru na drzewie zostają.
- **Wiatr:** jeden łagodny wiatr dla świata (`src/world/AmbientWind.js`).
  Kierunek kręci się powoli wokół wschodu (tam też przechylają się
  rośliny), a siła rośnie w porywach. Smugi wiatru to białe, falujące
  kreski, które płyną z nim wokół gracza. Pojawiają się tylko pod gołym
  niebem (nie w lesie pod koroną, nie w jaskini, nie pod wodą), w porywie
  jest ich więcej, a w nocy są ciemniejsze.
- **Ustawienia → Modele:** *Spadające liście i owoce* i *Smugi wiatru*
  (domyślnie włączone; z czatu `/ustaw spadajace-liscie wyl`,
  `/ustaw smugi-wiatru wyl`). W trybie ziemniaka liści jest około jednej
  trzeciej, a smug nie ma.

## Pliki

| Plik | Co robi |
| --- | --- |
| `src/world/AmbientWind.js` | wiatr z czasu gry: kierunek, siła, porywy |
| `src/rendering/TreeParticles.js` | doły koron (po jednym chunku na klatkę), liście i owoce; kształty liści (`LEAF_SPRITES`) i gatunek → kształt (`leafSprites`) |
| `src/rendering/WindStreaks.js` | smugi wiatru (jedno rysowanie, przezroczystość na wierzchołek) |
| `src/rendering/CubeParticles.js` | płaskie płatki (`flat`), obrazki 6 × 6 na instancję (`sprites`, `spriteTexture`), kołysanie (`flutter`) i niesienie przez wiatr (`carry`) |

## Sprawdzanie

`node tools/sprawdz_czasteczki_drzew.mjs` (w `npm test`) sprawdza:
- wiatr: granice, zmiany kierunku i porywów,
- które liście spadają i liście z owocami,
- kształty liści: każdy 6 × 6, każdy gatunek z katalogu ma swój, iglaki
  igły i gałązki, klon - liść klonu, wiśnia - płatki,
- ruch płatka (powoli, z wiatrem) i owocu (leży na ziemi),
- smugi: tylko pod niebem, półprzezroczyste, wyłączalne,
- ustawienia.
