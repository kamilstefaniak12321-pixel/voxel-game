# Koncept gęstej trawy

Autor modelu i tekstury: **Kamil**. Źródło: dostarczony plik
`koncept na gęstą trawę.bbmodel`; jego SHA-256 i UUID wybranych grup zapisuje
`model-data.js`.

Źródłowe 3240 elementów tworzą demonstracyjny trawnik. Do gry trafia jedna
komórka: dwie nakładające się grupy po cztery karty, z których druga jest
obrócona o −90° wokół osi Y. Zachowane są oryginalne położenia ośmiu kart,
ich UV i skala 16 pikseli na blok. Importer uwzględnia obroty elementów oraz
cały łańcuch grup. Pomija pozostałe kopie trawnika, płaszczyzny podłoża i
animatory demonstracji. Ruch zapewnia wspólny shader wiatru gry, z nieruchomymi
korzeniami.

`texture.png` to oryginalny osadzony PNG 16 × 16, bez przemalowywania:

```text
SHA-256: 3edd58df8ba614213b206ebdd0779f0fbb61fdd53f9dde4fab0461c09ec7811e
```

Korzenie znajdują się w górnych wierszach PNG; źródłowe UV i obrót kart
umieszczają je na dole modelu. Nie należy dodatkowo odwracać tej tekstury.
Kolory otrzymują istniejące zabarwienie biomu.

Ponowny import z katalogu repozytorium:

```sh
node tools/import_trawa_kepiasta.mjs "SCIEZKA_DO_PLIKU/koncept na gęstą trawę.bbmodel"
```

Importer wybiera konkretne UUID, aby nie włączyć przez pomyłkę całej sceny.
Przebudowanie hierarchii w nowym pliku źródłowym może wymagać aktualizacji
tego wyboru. Pełna scena referencyjna nie jest potrzebna podczas działania gry.

Geometria ma dwa boki każdej karty i trzy poziomy szczegółowości:

- Blisko: osiem oryginalnych kart, 32 trójkąty.
- Średnio: cztery skrajne karty, symetrycznie po obu stronach każdej osi,
  16 trójkątów.
- Daleko: dwie karty z tą samą teksturą, przesunięte na środek kępy jako
  krzyż, osiem trójkątów.

Wysokość wynosi jeden blok dla wysokiej trawy i 0,75 bloku dla krótkiej.
Poziomy szczegółowości zachowują wysokość, barwy i szerokość kępy; rozmieszczenie
oraz losowy obrót nadal wynikają z ustawienia trawy w świecie.
