# Modele roślin (0.64.0)

*Ustawienia → Modele* - jeden wybór wyglądu dla wszystkich roślin:

| poziom | jak wygląda | tekstura |
|---|---|---|
| **Proste** (`simple`) | obrazek na skrzyżowanych płaszczyznach - jak pokrzywa czy koniczyna; najszybsze | 16 × 16, cała roślina |
| **Półrealistyczne** (`semi`, domyślne) | roślina z małych płaskich kart: łodygi, liście odchylone od łodygi, płatki i kwiaty pod różnymi kątami | 16 × 16 - arkusz części (niżej) |
| **Szczegółowe** (`detailed`) | model z pikseli - każdy listek i płatek osobno (model „kepka”, jak rośliny z paczek) | kolory z palety rośliny |

Roślina, która nie ma wybranej wersji, dostaje najbliższą, którą ma
(przy równej odległości - prostszą). Od 0.65.0 pełny komplet mają
**wszystkie rośliny** (45 gatunków, 89 etapów - `lista.json`): kwiaty,
trawy, paproć, koniczyna, pokrzywa, babka, trzcina, wrzos, krokus, trawa
wydmowa, sadzonki drzew, krzaki owocowe (wszystkie etapy), turzyca,
pałka, krwawnica i rośliny z paczek. Bez wersji zostają rośliny leżące
jedną warstwą pikseli na ziemi, ścianie albo wodzie - lilia wodna, rzęsa,
wywłócznik, porosty, huby i barwinek (wyglądają tak samo w każdej
wersji).

Zmiana działa od razu (chunki przebudowują się stopniowo, najbliższe
najpierw). Zmienia tylko obraz: bloki, zapisy światów, celownik, ikonki
w ekwipunku i przedmiot w dłoni zostają bez zmian.

W tej samej zakładce:

- **Kołysanie na wietrze** - wyłączone: rośliny stoją (shader:
  `uPlantSway` w `src/rendering/PlantWind.js`, także w cieniach). Liście
  na wodzie dalej falują z wodą.
- **Animacje roślin** - wyłączone: bez sprężystych reakcji na
  postawienie, wzrost, zbiór i zniszczenie (`PlantAnimations.setEnabled`).
  Wzrost i zbiór działają tak samo.

Z czatu: `/ustaw modele-roslin proste | polrealistyczne | szczegolowe`,
`/ustaw wiatr wl | wyl`, `/ustaw animacje-roslin wl | wyl`. Porównanie:
tryb programisty, `/scena modele` (wszystkie rośliny z listy w rzędach).

## Pliki

```
assets/models/rosliny/
  lista.json                 kolejność roślin
  podglad/<poziom>.png       obrazki wyboru w ustawieniach
  <roślina>/model.json       opis wersji
  <roślina>/polrealistyczny.png
  <roślina>/prosty-<etap>.png   (tylko gdy roślina nie ma obrazka w atlasie)
```

Skąd się biorą:

- arkusze części - `tools/modele_roslin.py` (5 pierwszych roślin -
  narysowane piksel po pikselu, reszta - ze szablonów liści i kwiatów
  w kolorach rośliny: `LEAVES`, `FLOWERS`, palety `VANILLA`, `BUSHES`,
  `PACKS`),
- proste obrazki roślin, które miały tylko model z pikseli (paczki,
  turzyca, pałka, krwawnica) - `tools/modele_roslin_proste.mjs`: widok
  tego modelu z przodu, pomniejszony do 16 × 16 (`"rozmiar"` w
  model.json),
- krzaki owocowe - prosty obrazek z atlasu (`{ "kafelek": ... }`),
  szczegółowy - ich dotychczasowy model.

Kod: `src/blocks/plantModels.js` (wczytanie i sprawdzenie opisów, wybór
najbliższego poziomu), `src/rendering/PlantModelLevels.js` (przełączenie
danych rysowania), `src/rendering/PlaneModelGeometry.js` (model z kart),
szczegółowy - `src/rendering/TuftGeometry.js`.

## Arkusz części (półrealistyczny)

```
   x 0-7     x 8-15
  +---------+---------+
  | kwiat   | kwiat   |  y 0-7
  | z boku  | z góry  |
  +---------+-+-------+
  | liść    |Ł| płatek|  y 8-15     Ł - łodyga (x 8-9, 2 piksele)
  | (podst. | | / pąk |             płatek - x 10-15
  |  na dole)| |       |
  +---------+-+-------+
```

Cieniowanie malujemy w teksturze (jaśniejsze brzegi od światła,
ciemniejsze przy łodydze). Tekstury rysuje `tools/modele_roslin.py`
(piksele zapisane literami - łatwo poprawić jeden piksel; można też
malować same pliki PNG).

## model.json

```jsonc
{
    "nazwa": "Mak",
    "bloki": ["poppy"],                   // albo "paczka": "lawenda" (etapy paczki)
    "kolory": { "lisc": "#327c20" },      // wspólne kolory szczegółowych etapów (jak w paczkach)
    "etapy": [
        {
            "prosty": null,               // null - obrazek bloku z atlasu; "prosty-1.png";
                                          // { "plik": "prosty-1.png", "rozmiar": 26 }; { "kafelek": "bush_leaves" }
            "polrealistyczny": {
                "lodygi": { "ile": 1, "wysokosc": 10, "promien": 2, "pochylenie": 6 },
                "liscie": { "ile": 4, "dlugosc": 7, "nachylenie": 55, "wysokosc": 0 },
                "kwiat": { "rodzaj": "kielich", "rozmiar": 6 }
            },
            "szczegolowy": { "rodzaj": "kepka", ... }   // jak w paczkach roślin (docs/rosliny.md);
                                                        // null - dotychczasowy model bloku
        }
    ]
}
```

- `lodygi` - ile (1-12), wysokość w pikselach (2-24), promień rozstawienia
  (0-8), pochylenie w stopniach (0-45),
- `liscie` - ile (0-24), długość (2-24 pikseli), wysokość, na której
  odchodzą od łodygi, nachylenie od pionu (0-85°); `uklad`: `wokol`
  (domyślny - od podstawy dookoła), `kopula` (kopułka: `kopula` - wysokość
  w pikselach, `promien`, `pien: true` - pień w środku; krzaki, wrzos,
  sadzonki), `pion` (źdźbła w `promien`: trawy, trzcina, turzyca),
- `kwiat.rodzaj` - `kielich` (cztery płatki z obszaru „płatek”, dno
  z góry - mak), `gwiazda` (dwie skrzyżowane karty z boku i karta z góry
  - chaber), `pompon` (trzy karty z boku i z góry - mniszek), `koszyczek`
  (karta z góry lekko przechylona i środek z boku - rumianek), `klos`
  (dwie wąskie karty z obszaru „płatek” - lawenda), `dzwonek` (zwisa
  z końca łodygi), `owoce` (karty z obszaru „płatek” między liśćmi
  kopułki, `ile`); `rozmiar` 2-12 pikseli.

Każda roślina dostaje 8 odmian (obrót liści, pochylenie łodyg) - sąsiednie
nie są identyczne. Wiatr porusza górą, korzenie stoją.

## Nowa roślina

1. Dopisz arkusz (i ewentualnie prosty obrazek) do
   `tools/modele_roslin.py` i uruchom go.
2. `assets/models/rosliny/<roślina>/model.json`, nazwa w `lista.json`.
3. `node tools/sprawdz_modele_roslin.mjs` i `/scena modele` w grze.

Styl półrealistycznych modeli inspirowany paczkami zasobów z roślinami
z płaskich, ustawionych pod kątem kart; tekstury i modele są własne
(nic nie jest skopiowane).
