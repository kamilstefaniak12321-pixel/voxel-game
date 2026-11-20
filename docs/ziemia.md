# Ziemia i owoce z charakterem (1.25.0)

Dwie małe rzeczy, które sprawiają, że **miejsce i gatunek mają
znaczenie**: ziemia decyduje, jak szybko rośnie roślina, a część owoców
coś daje - słabiej niż napar, ale prosto z krzaka.

## Ziemia

Liczy się blok **dokładnie pod rośliną** (sadzonka, młody krzew, roślina
niska, owocujący krzak).

| Ziemia pod rośliną | Wzrost |
|---|---|
| pole z kompostem ([psucie.md](psucie.md)) | × 1,5 |
| czarnoziem i **rozgrzebany czarnoziem** | × 1,3 |
| trawa, ziemia, ściółka, zwykłe pole | × 1 |
| ziemia kamienista i **rozgrzebana ziemia kamienista** | × 0,7 |
| **woda do 3 bloków** od ziemi (na jej wysokości albo blok niżej) | jeszcze × 1,25 |

Mnożniki się mnożą: pole z kompostem przy stawie to × 1,875, a ziemia
kamienista z dala od wody - × 0,7.

### Nowe pola

- **Czarnoziem i ziemię kamienistą da się rozgrzebać łopatą** (PPM) -
  dotąd tylko trawę i ziemię. Powstaje *rozgrzebany czarnoziem*
  (`tilled_humus`, numer 15401) albo *rozgrzebana ziemia kamienista*
  (`tilled_coarse`, 15402). Sadzi się na nich jak na zwykłym polu.
- Puste pole zarasta z powrotem **w swoją ziemię** - czarnoziem się nie
  marnuje. Wykopane też oddaje swoją ziemię.
- Rozgrzebany czarnoziem jest żyzny także dla sadu
  ([sad.md](sad.md)): roślina chętniej rozwija się po zimie.
- **Kompost** posypuje się na zwykłe i kamieniste pole (powstaje pole
  z kompostem). Rozgrzebanego czarnoziemu nie trzeba nawozić.

Skąd czarnoziem: spod opadłych owoców ([sad.md](sad.md)), z kompostu
na trawie albo ziemi, z przepisu i z okolic upadku meteorytu - w zwykłym
terenie sam nie leży. Ziemia kamienista trafia się płatami w kilku
biomach (w części obok żwiru albo piasku).

### Woda

Wystarczy jeden blok wody w odległości do 3 bloków w poziomie (kwadrat
7 × 7 wokół ziemi), na wysokości ziemi albo jeden blok niżej - staw,
rzeka, wykopany rów. Deszcz się nie liczy.

## Owoce z charakterem

Zjedzony owoc włącza działanie na 2 godziny gry (godzina to 50 sekund).
Widać je w oknie statusu (klawisz **C**, wiersz *Działa*). Zjedzenie
kolejnego odnawia czas, nie wydłuża go.

| Owoce | Działanie | Dla porównania napar |
|---|---|---|
| dzika róża, żurawina, borówka brusznica | **lekkie gojenie**: stłuczona noga goi się 1,5 raza szybciej | leczniczy: 3 razy, 4 godziny |
| aronia, rokitnik, czarna porzeczka, czarny bez | **pokrzepienie**: energii ubywa o 1/10 wolniej | wzmacniający: o 1/5, 5 godzin |
| chili | **rozgrzanie**: kopiesz o 6% szybciej | - |

Owoc i napar działają razem (mnożą się). Suszone owoce i potrawy
z garnka działania nie mają.

**Nowe zioła do naparów** ([ziola.md](ziola.md)): **płatki róży** - napar
na sen, **kwiat czarnego bzu** - napar leczniczy.

### Napis pod celownikiem

(Od 1.29.0.) Pod celownikiem pojawia się mały napis, np. **„Wzrost:
pole z kompostem ×1,5 · woda ×1,25 = ×1,88"** - zielony, gdy ziemia jest
żyzna, pomarańczowy, gdy jałowa. Widać go:

- na każdym polu (zwykłym, z kompostem, z czarnoziemu, kamienistym),
- na rosnącej roślinie (sadzonka, krzak, roślina niska) - liczy się
  ziemia pod nią,
- na zwykłej ziemi (trawa, ziemia, czarnoziem, kamienista), gdy w ręce
  jest coś do sadzenia, łopata albo kompost.

Z pustą ręką na łące napisu nie ma, żeby nie przeszkadzał. Napis liczy
się przy zmianie celu i co pół sekundy (szukanie wody to kilkadziesiąt
odczytów bloków), nie w każdej klatce.

**Pole kamieniste** ma od 1.29.0 wyraźniejsze kamyki (większe 2 × 2
z cieniem i małe) - łatwo je odróżnić od zwykłego pola.

## Osiągnięcia i komendy

*Czarna bruzda* - rozgrzeb czarnoziem. *Owoc z charakterem* - zjedz
owoc, który coś daje. *Najlepsza grządka* (1.29.0) - wyceluj
w pole z kompostem przy wodzie (napis ×1,88).

`/ziemia` - ziemia pod celownikiem (albo pod nogami): rodzaj, mnożnik,
czy jest woda w pobliżu i ile wychodzi razem.

## Dla programisty

- `src/blocks/soil.js` - `SOIL_GROWTH` (mnożniki), `WATER_REACH`,
  `WATER_GROWTH`, `nearWater`, `soilInfo`.
- `src/blocks/fertilizers.js` - `FIELDS`: wszystkie pola z mnożnikiem,
  żyznością (`rich`) i tym, czy da się je nawozić (`fertilize`).
- `PlantGrowth.tick` - mnożnik ziemi z numeru bloku pod rośliną; wody
  szuka się tylko wtedy, gdy los wypadł tuż ponad zwykłą szansę
  (98 odczytów bloków na taki przypadek, nie na każdą roślinę co krok).
- Efekty owoców: `mend`, `tonic`, `warm` w `src/items/effects.js`,
  przypisanie w `FOODS` (`src/items/foods.js`).
- Test: `tools/sprawdz_ziemi.mjs`. Tekstury pól: `tools/pola_tekstury.py`.
- Napis pod celownikiem: `src/ui/SoilHint.js` (`soilHintTarget`,
  `soilHintText`), test `tools/sprawdz_wygody.mjs`.

## Czego nie ma (luki)

- Napis pod celownikiem pokazuje mnożnik ziemi i wody, ale nie pory
  roku ani sadu (zimą rośliny i tak stoją - [pory-owocowania.md](pory-owocowania.md)).
- Owoców w koronie drzewa napis nie dotyczy (nie stoją na ziemi).
- Owoce w koronie drzewa i w wysokim krzewie nie stoją na ziemi: ziemia
  i woda nie zmieniają tempa ich dojrzewania. Dotyczy to też drzew -
  na tempo rośnięcia sadzonki ziemia działa, na owocowanie korony nie.
- Ziemia nie zmienia wielkości plonu od razu (tylko przez sad, po
  zimie) ani smaku owoców.
- „Rozgrzanie" po chili na razie tylko przyspiesza pracę - zimna
  i ciepła w grze jeszcze nie ma. Gdy przyjdą, chili ma przed zimnem
  chronić.
- Tylko 8 owoców ma działanie; pozostałe są zwykłym jedzeniem.
- Woda liczy się w kwadracie, nie w kole, i nie patrzy na przeszkody
  (ściana między polem a wodą nie przeszkadza).
- Liczby (1,3 / 0,7 / 1,25, siła efektów) dobrałem na oko.
