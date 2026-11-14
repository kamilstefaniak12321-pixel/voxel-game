# Płynność: plan na kolejne wersje

Kamil: *„dla mnie jedną z ważniejszych rzeczy jest właśnie płynność
i wydajność - idźmy w tę stronę przez najbliższe wersje"*. Osiem
kroków, po kolei. Każdy krok to osobna wersja z pomiarem przed i po.

| Nr | Krok | Stan |
|---|---|---|
| 1 | Programy cieniujące przygotowane pod ekranem wczytywania | **zrobione - 1.1.2** (niżej) |
| 2 | Połączenie ok. 400 plików gry w kilka paczek (szybszy start) | do zrobienia |
| 3 | Zapamiętywanie gotowych rzeczy między uruchomieniami (ikonki, kolory tekstur) | do zrobienia |
| 4 | Dopasowanie pracy do sprzętu w locie (ile terenu na klatkę, zasięg efektów) | do zrobienia |
| 5 | Więcej wątków do liczenia terenu | do zrobienia |
| 6 | Rysowanie wielu takich samych rzeczy jednym poleceniem | do zrobienia |
| 7 | Pomijanie tego, co zasłonięte (np. jaskinie pod ziemią) | do zrobienia |
| 8 | Rzadsze odświeżanie dalekich rzeczy | do zrobienia |

Wcześniej, w 1.1.1: ikonki odmian bloków rysowane raz (start gry około
dwa razy krótszy) - [celowanie-i-ladowanie.md](celowanie-i-ladowanie.md).

## Krok 1: programy cieniujące przed grą (1.1.2)

**Skąd przycięcia.** Karta graficzna kompiluje program cieniujący
dopiero wtedy, gdy coś pierwszy raz się nim rysuje - i gra na ten moment
staje. Dotąd działo się to:

- w pierwszej klatce po zniknięciu ekranu wczytywania (25 programów
  naraz),
- **w trakcie gry**, przy pierwszym użyciu rzeczy: przedmiot w ręce,
  pochodnia w ręce, postawiona pochodnia, ramka celownika, ognisko,
  płomień ogniska, wyrzucony przedmiot, deszcz, meteoryt, widok zza
  pleców, kręgi na wodzie, pierwszy kafelek dalekiego terenu.

Do tego gra **kasowała** program, gdy znikała ostatnia rzecz danego
rodzaju. Podniesienie ostatniego leżącego przedmiotu albo zgaszenie
ostatniej pochodni oznaczało, że następny przedmiot czy pochodnia
kompilowały program od nowa - przycięcie wracało za każdym razem.

**Co się zmieniło.** Wszystko powstaje pod ekranem wczytywania świata:

1. gra prosi o programy dla każdego obiektu każdej sceny, także
   ukrytego (deszcz, ramka, kręgi na wodzie);
2. rzeczy, które powstają dopiero w grze, mają w scenie ukryty **wzór**
   z prawdziwym materiałem - wzór nic nie rysuje, ale daje programowi
   powstać i trzyma go do końca gry;
3. na koniec jedna próbna klatka (cienie, promienie światła, końcowe
   złożenie obrazu mają własne przebiegi rysowania).

Gdy karta umie kompilować w tle (prawie każda), programy z punktów 1 i 2
kompilują się równolegle i nie blokują gry.

**Pomiar** - ten sam scenariusz w prawdziwej grze przed i po (wejście do
świata, przedmioty w ręce, pochodnia, skrzynia, schody, ognisko,
wyrzucone przedmioty, niszczenie bloku, deszcz, noc, meteoryt, widok
zza pleców, zaćmienie, woda, lot):

| Programy kompilowane... | Było | Jest |
|---|---|---|
| w pierwszej klatce po ekranie wczytywania | 25 | 0 |
| w trakcie gry | 18 | 2 |
| pod ekranem wczytywania | 2 | 55 |

Dwa pozostałe to małe programy samych cieni (cień przedmiotu w ręce
i mapa cieni dalekiego terenu) - są krótkie i powstają raz.

Czego ten pomiar **nie** mówi: ile milisekund trwało każde przycięcie
na Twoim sprzęcie. Maszyna testowa nie ma karty graficznej, więc liczę
programy, nie czas. Na zwykłej karcie jeden program to zwykle od
kilkudziesięciu do kilkuset milisekund, na telefonie więcej.

**Jak sprawdzić u siebie:** `/wydajnosc` ma nowy wiersz *Programy
cieniujące: N, z tego skompilowane w trakcie gry: M*. Jeśli po dłuższej
grze M rośnie powyżej 2, to znaczy, że jakaś rzecz nie ma jeszcze wzoru.

## Dla programisty

- `src/rendering/ShaderWarmup.js` - `warmupObject` (ukryty wzór),
  `prewarmScenes` (zgłoszenie, czekanie, dokończenie programów),
  `lateShaderPrograms` (licznik).
- `Game.prewarmShaders` zbiera wzory: `shaderPrototypes()` w
  `TorchRenderer`, `DropRenderer`, `CampfireRenderer`, `Meteorites`,
  `FarTerrain` oraz przedmiot w dłoni (model gracza i ręka z oczu).
- **Nowy efekt tworzony dopiero w grze** (obiekt dodawany do sceny po
  starcie, z własnym materiałem): dodaj `shaderPrototypes()` albo wzór
  w `Game.prewarmShaders`. Wzór musi mieć ten sam materiał (te same
  opcje) i ten sam rozmiar atrybutu koloru co prawdziwy obiekt.
- Program zależy też od celu rysowania i świateł sceny - dlatego wzory
  kompilują się z tym samym celem i ze sceną, do której trafią.
- Test: `node tools/sprawdz_shadery.mjs`.
