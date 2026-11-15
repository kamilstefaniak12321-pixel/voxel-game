# Trawa: wierzch z kwiatkami i wyraźne kolory biomów

Od wersji 1.2.0 (pomysł Kamila).

![Łąka z odsłoniętą trawą, 42 warianty wierzchu, skraj lasu](trawa-120.jpg)

## Wierzch bloku trawy z dodatkami

Co dziewiąty blok trawy ma na wierzchu płaski dodatek: kępki trawy,
koniczynę, rozetę liści, mech, stokrotki, mlecze, dmuchawce, maki,
chabry, fiołki, jaskry, niezapominajki, wrzos, krokusy, opadłe płatki,
poziomki albo mieszankę kwiatów. Razem **42 warianty**; z losowym
obrotem wierzchu każdy ma cztery ułożenia.

- To dalej zwykły blok trawy: ten sam przedmiot, te same zasady, ten sam
  zapis. Zmienia się tylko obrazek na wierzchu.
- Wariant zależy od miejsca bloku w świecie - w tym samym miejscu zawsze
  ten sam. Blok trawy postawiony w innym miejscu może mieć inny wierzch.
- Losowanie jest równe (bez plam): średnio jeden na dziewięć bloków.
- Wśród wariantów częściej trafia się sama zieleń (kępki, koniczyna),
  rzadziej kwiaty, najrzadziej całe łany (wagi w
  `src/rendering/SurfaceTextureVariants.js`).
- Bez grzybów, prześwitów ziemi i kamyków - same kwiatki i roślinki.
- Dodatek nie dotyka brzegu bloku, więc nic nie jest ucinane na styku.

**Kolor klimatu a kwiaty.** Trawa zmienia odcień z klimatem. Zmieniają
go tylko zielone piksele (trawa, liście, mech, łodygi); płatki - żółte,
białe, różowe, niebieskie, czerwone - zostają w swoim kolorze. Gra
robiła tak już wcześniej dla roślin; tekstury wariantów są narysowane
tak, żeby każdy piksel był wyraźnie zielony albo wyraźnie nie.

## Kolory trawy w biomach

Dotąd różnice koloru trawy między biomami były ledwo widoczne. Teraz
wejście do innego biomu widać po trawie:

![Kolor trawy w biomach: było i jest](trawa-kolory-120.jpg)

Trzy składniki:

- **klimat** - w cieple i suchu trawa jest żółtozielona (gaj oliwny),
  w chłodzie i wilgoci sinawa (świerczyna, las sekwojowy); ponad dwa
  razy mocniej niż wcześniej;
- **las** - w lesie trawa jest ciemniejsza i głębiej zielona, na
  otwartej łące i hali jasna; przejście na skraju lasu jest płynne;
- **góry** - wysoko trawa blednie i żółknie.

Ten sam kolor dostają kępki trawy i rośliny barwione jak trawa.

## Wydajność

Sprawdzone przy składaniu całości (prośba Kamila):

| Co | Koszt |
|---|---|
| rysowanie | **zero**: ten sam blok, te same trójkąty, ten sam materiał i to samo polecenie rysowania - zmienia się tylko, który kafelek atlasu jest na wierzchu |
| budowanie chunka | wybór wariantu to kilka mnożeń: ok. 30 ns na blok trawy, czyli ok. 0,01 ms na chunk |
| generowanie terenu | bez zmian: kolor trawy liczy się z tych samych gładkich pól klimatu co dotąd (pole lasów było już pod ręką) |
| pamięć | atlas tekstur wyższy o 3 wiersze kafelków (800 → 848 pikseli wysokości przed powiększeniem) |

Rozważone i odrzucone jako droższe: osobny blok na każdy wariant (więcej
rodzajów bloków, zmiana zapisu), nakładana druga warstwa z kwiatkami
(dodatkowe trójkąty na każdym bloku trawy) i kolor trawy z rodzaju biomu
(wymagałby liczenia terenu w wielu punktach każdego chunka).

## Znane ograniczenia

- Paczka tekstur gracza z własną trawą, ale bez wariantów, pokazuje
  na wszystkich blokach swoją zwykłą trawę (bez kwiatków). Wariant
  można podmienić w paczce jak każdy kafelek (`grass_top_<nazwa>`).

- Daleki teren (poza prawdziwymi chunkami) ma trawę w czterech
  uśrednionych kolorach, bez przyciemnienia w lesie - z daleka las
  i tak zakrywają korony.
- Kolory widać od razu także w istniejących światach (kolor liczy się
  przy wczytaniu, nie jest zapisany).

## Dla programisty

- `tools/tekstury_trawy.py` - rysuje warianty (pieczątki z kolorami
  roślin gry na prawdziwej teksturze `grass_top`) i dopisuje je do
  atlasu.
- `src/rendering/SurfaceTextureVariants.js` - `GRASS_TOP_VARIANTS`
  (nazwy i wagi), `GRASS_VARIANT_ONE_IN`, `grassTopVariant(x, y, z)`.
- `src/rendering/BlockRenderData.js` - `grassTopVariants`: zestawy UV
  różniące się tylko wierzchem; `ChunkMesher.js` wybiera zestaw.
- `src/world/terrain/Biomes.js` - `GRASS_TINT` i `grassTint`
  (klimat, las, góry).
- **Nowy wariant:** pieczątka i wpis w `V` w `tekstury_trawy.py`, ten sam
  wpis w `GRASS_TOP_VARIANTS`, uruchomić skrypt. Kolory dodatku muszą być
  wyraźnie zielone (barwione) albo wyraźnie nie.
- Test: `node tools/sprawdz_warianty_trawy.mjs`.
