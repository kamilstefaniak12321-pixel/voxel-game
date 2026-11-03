# Tryb programisty i sceny testowe (0.55.0)

Trzeci tryb gry obok przygody i kreatywnego - do sprawdzania gry
(nowe bloki, światło, rośliny, woda...). Wybiera się go przy tworzeniu
świata (*Tryb gry: Programista*) albo w grze: `/tryb programista`.

## Co daje

- Wszystko z trybu kreatywnego: bloki bez końca, latanie (2 x Spacja),
  bloki znikają od razu.
- **Plac testowy** - teren nowego świata w tym trybie (*Teren: Plac
  testowy*; można też wybrać zwykły teren). Płaski, taki sam dla
  każdego seeda: jasna posadzka z tynku 73 x 73 bloki wokół (0, 0)
  z osiami z terakoty (x = 0 i z = 0), dookoła trawa, a daleko na
  wschodzie (x 128-320) trzy tarasy do sprawdzania dalekiego terenu
  i dalekich cieni. Kod: `src/world/terrain/TestSiteGenerator.js`.
- **Sceny testowe** - pauza (Esc) → *Sceny testowe* albo `/scena`:

| scena | `/scena` | co stawia |
|---|---|---|
| Światło i materiały | `swiatlo` | dawne „Laboratorium światła”: wnęki z tynku, terakoty, ochry i ciemnych desek, słupy 2-12 bloków, liście z pniem, basen, pokój z lampami i otworem w dachu |
| Paleta światła | `paleta` | materiały i owoce, taki sam krzak borówki w słońcu i pod dachem, okno, zamknięta komora na styku chunków, ciepła emisja meteorytu i ognisko |
| Odbicia i cienkie liście | `materialy` | ziemia, piasek i śnieg z tym samym krzakiem, kontrolne podłoża, dwa pokoje z przegrodą oraz liście, owoce, kora, drewno i kamień |
| Kolorowe lampy | `lampy` | zamknięty pokój z czterema kolorowymi lampami (`/demo swiatlo`) |
| Słońce przez okno | `okno` | ciemny pokój z oknami od strony słońca (`/demo okno`) |
| Budulec i światło odbite | `dom` | cztery pokoje z różnego budulca (`/demo dom`) |
| Woda | `basen` | basen z brodzikiem (`/woda basen`) |
| Rośliny | `rosliny` | ogródek ze wszystkimi roślinami z paczek, we wszystkich etapach (`/rosliny ogrod`) |
| Krzaki owocowe | `krzaki` | wszystkie krzaki we wszystkich etapach (`/krzaki ogrod`) |
| Drzewa | `drzewa` | aleja wszystkich gatunków (`/drzewa aleja`) |
| Warstwy skał | `skaly` | odkrywka do dna świata (`/demo skaly`) |

  Na placu testowym każda scena ma swoje stałe miejsce (*Światło
  i materiały* - środek placu, *Paleta światła* - (64, -96), pozostałe - rząd na z = 100, co 80
  bloków), a gracz trafia do punktu, z którego ją widać. Dzięki temu
  zrzuty ekranu i testy z różnych wersji gry da się porównywać. W innym
  terenie scena staje przed graczem.
- **Pora dnia** jednym kliknięciem (świt 6:15, południe, zachód 17:45,
  noc) i **zatrzymanie czasu** - na ekranie scen albo
  `/scena czas poludnie`, `/scena czas stop` (`start` - czas płynie).

Pozostałe komendy do testów działają w każdym trybie (`/pomoc`,
[lista komend](komendy.md)).

### Powtarzalne porównanie palety

Nowy świat: seed `42`, teren `flat`, tryb `developer`, potem `/scena paleta`.
`src/dev/LightingReference.js` eksportuje sześć par czasu i zachmurzenia
(`LIGHTING_REFERENCE_PRESETS`), pozycje oczu i cele siedmiu kamer
(`LIGHTING_REFERENCE_CAMERAS`) oraz `placeLightingReferenceCamera`.
Scena nie zmienia ustawień ani czasu. Przed porównaniem wersji trzeba
zablokować czas, ekspozycję, pogodę, rozdzielczość i jakość; poczekać na
wczytanie geometrii. Kadry porównujemy z bieżącym wydaniem, nie tylko
z dawnym modelem klasycznym. Ciepłą, stałą emisję zapewnia istniejący
meteoryt; ognisko jest osobnym, animowanym źródłem.

Zamknięta komora zajmuje `x=76..84, y=16..23, z=-84..-76`, przecinając
granice chunków `x=80` i `z=-80`. Próba nieba: usuń blok dachu
`(80,23,-80)`, sprawdź środek `(80,19,-80)` i sąsiednie chunki, następnie
wstaw z powrotem jasny tynk. W pełni zamknięta komora ma być ciemna.
Ponowne `/scena paleta` odtwarza bloki i początkowy stan ogniska.

### Odbicia i materiały 0.58.0

`/scena materialy` buduje osobny plac wokół `(160,16,-160)`, poza tarasami
testowego generatora. `LightingMaterialsReference.js` udostępnia stałe
kamery, sondy i edycje zwykłych bloków. Pokój A ma otwór w dachu, pokój B
jest zamknięty; wspólna ściana leży na `x=160`, a oba pokoje przecinają
granicę `z=-144`. Domyślnie nie ma lampy. Odtworzenie sceny usuwa edycje
stanowiska, przywraca podłoża i przegrodę oraz otwiera dach A.

[Natywny odbiór 0.58.0](pomiary/materialy-0.58.0/README.md) udostępnia
niezależne przełączniki odbić, transmisji i refleksów, pary OFF/ON w tym
samym rendererze, ciągłą trasę 180 s oraz zapis i wczytanie w izolowanej
pamięci. Nie zmienia istniejącej sceny palety ani zapisów gracza.

## Testy

- `tools/sprawdz_sceny.mjs` (w `npm test`) - ustawienia (każde na
  zakładce, jakość grafiki, eksperymenty), tryb programisty, lista scen;
  scenę światła, basen, rośliny, krzaki i drzewa stawia w prawdziwym
  świecie na placu testowym.
- `tools/sprawdz_swiatlo_webgl.mjs` - prawdziwa gra w Chrome (WebGL2):
  świat w trybie programisty, scena *Światło i materiały*, pory dnia,
  modele światła, cienie, ciemny pokój z lampą. Zrzut i wyniki:
  `test-results/sceny/`. W pull requeście z etykietą `kompilacja` - 
  workflow *Testy gry* (`.github/workflows/testy.yml`).

## Nowa scena

Wpis w `SCENES` w `src/dev/scenes.js`:

```js
{
    id: 'nazwa',                        // /scena nazwa
    name: 'Nazwa w menu',
    description: 'Co widać i co sprawdzić (jedno, dwa zdania).',
    build(ctx, origin) { ... },         // stawia bloki sama (origin - środek placu)
    // albo:
    command: ['komenda', 'argument'],   // istniejąca komenda, która stawia scenę przed graczem
    slot: { x: 360, z: 100 }            // miejsce na placu (gracz patrzy na +z)
}
```

Miejsca na placu nie mogą na siebie nachodzić (pilnuje tego
`tools/sprawdz_sceny.mjs`).
