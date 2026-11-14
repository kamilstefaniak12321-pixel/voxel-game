# Celowanie w bloki i przegląd ładowania (1.1.1)

Dwie rzeczy z prośby Kamila: celownik zahaczał o płaskie bloki, jakby
zajmowały całą kratkę, oraz przegląd tego, jak gra ładuje dane - czy
nie robi niepotrzebnej pracy.

## Celowanie: blok jest tam, gdzie go widać

**Co było źle.** Biała ramka rysowała się w prawdziwym kształcie bloku
(cienka na mchu, wąska na trawie), ale sam celownik dla większości
bloków brał **całą kratkę**. Dlatego celując w blok *za* płaskim mchem,
trafiało się w mech.

**Jak jest teraz.** Celownik i ramka biorą kształt z jednego miejsca
(`src/interaction/BlockBounds.js`), więc ramka zawsze pokazuje dokładnie
to, w co celownik trafia.

| Blok | W co trafia celownik | Było |
|---|---|---|
| mech, śnieg, opadłe liście (5 rodzajów) | cienka płytka przy ziemi (ok. 1/12 bloku) | cała kratka |
| wieńce (na ścianie) | cienka płytka przy ścianie | cała kratka |
| trawa, paproć, kwiaty, sadzonki drzew, trzcina (ponad 30 bloków) | kępka: 3/4 szerokości rośliny, jej prawdziwa wysokość i miejsce | cała kratka |
| rośliny z paczek większe niż blok (np. amarantus) | model rośliny | cała kratka, gdy promień wszedł w jej kratkę |
| skrzynie | 14 × 14 × 14 pikseli | cała kratka |
| schody, półbloki, płoty, furtki, drzwi, stół | ich pudełka (bez zmian); ramka płotu obejmuje teraz też ramiona | - |
| pochodnie, krzaki, kwiaty z modelem, ognisko | bez zmian | - |
| pełne bloki | cała kratka (bez zmian) | - |

Skutki w grze:

- nad płaskim mchem, śniegiem i liśćmi celuje się normalnie w bloki za
  nimi; w sam mech trafia się, celując w niego z góry albo nisko z boku;
- przez brzegi kępki trawy widać (i da się trafić) ziemię pod nią
  i blok za nią - mniej przypadkowego ścinania trawy;
- stojąc w wysokiej trawie, trafia się w to, co przed sobą;
- stawianie bloków bez zmian: na trawie i mchu blok dalej staje w ich
  miejscu.

Test `tools/sprawdz_celowanie.mjs` strzela siatką promieni z góry
i z boku w **każdy blok z rejestru** (2438 bloków, ok. 577 tys.
promieni): trafienie wtedy i tylko wtedy, gdy promień przechodzi przez
kształt bloku, inaczej leci do kamienia za nim; ramka = trafiony
kształt.

Nowy blok o kształcie mniejszym niż kratka dopisuje się w
`BlockBounds.js` (funkcja `kindOf` / `cellBoxes`) - celownik i ramka
dostają go razem.

## Ładowanie: co zmierzyłem

Pomiar w prawdziwej grze w przeglądarce (profil procesora przy starcie,
przy wejściu do świata, w bezruchu i w locie). Maszyna testowa nie ma
karty graficznej, więc **czasy bezwzględne są zawyżone** - liczą się
proporcje.

### Znalezione i naprawione: ikonki przy starcie

Przy każdym uruchomieniu gra rysowała osobną ikonkę dla **każdej
odmiany** bloku: obróconych schodów, otwartych drzwi, pochodni na każdej
ścianie, skrzyni w cztery strony. Tych odmian jest ok. 2100, a różnych
obrazków wśród nich wielokrotnie mniej. Teraz każdy obrazek rysuje się raz.

| | Było | Jest |
|---|---|---|
| rysowanie ikonek | 3,6 s | 1,2 s |
| start gry do menu | 9,9 s | ok. 5,2 s |

Wszystkie 2606 ikonek są identyczne jak wcześniej (porównane bajt
w bajt).

### Sprawdzone - bez zbędnej pracy

- **Teren wokół gracza** powstaje w osobnym wątku (2-40 ms na chunk),
  a gra przyjmuje **jeden chunk na klatkę** z limitem 4 ms. Główny
  wątek w bezruchu i w locie jest prawie cały czas wolny.
- **Programy cieniujące** kompilują się raz (27 sztuk) przy pierwszych
  klatkach świata; potem żaden nie powstaje od nowa.
- **Dźwięki** (169 plików, 2,3 MB) ładują się w tle i nie wstrzymują
  startu; muzyka dopiero przy odtwarzaniu.
- **Zapis świata** trzyma w pamięci tylko potrzebne chunki (pilnuje
  tego osobny test na GitHubie).

### Zauważone, nie zmieniane

- Tempo doczytywania terenu jest równe liczbie klatek na sekundę
  (jeden chunk na klatkę). Przy 60 klatkach to z zapasem; na słabym
  telefonie (20 klatek) pełny zasięg 128 bloków wypełnia się kilkanaście
  sekund. Dałoby się przyjmować dwa chunki na klatkę, gdy zostaje czas,
  ale to trzeba stroić na prawdziwym telefonie.
- Pierwsze klatki po wejściu do świata kompilują programy cieniujące -
  na prawdziwej karcie to krótkie przycięcie na ekranie wczytywania.
- Gra składa się z ok. 400 plików kodu ładowanych osobno. W aplikacji
  (pliki z dysku) to nie problem; przy grze z sieci połączenie ich
  w jeden plik skróciłoby start, ale zmienia sposób budowania gry.
