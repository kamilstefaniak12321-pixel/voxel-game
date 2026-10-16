# Gracz - model, animacje, ruch

Trzeci rozdział gry (po świetle i terenie). Cel: postać gracza w stylu
Minecrafta, ale z większą liczbą stawów, żeby animacje chodzenia,
biegania, kucania i skakania były płynniejsze i bardziej naturalne.

## Gdzie jesteśmy

**Etap 1 - podstawy (zrobione):**

- **Model z 11 stawami** - ręce, nogi i tułów zginają się w środku
  (łokieć, kolano, talia).
- **Skórka 64 x 64** w układzie skórek Minecrafta (z drugą warstwą),
  domyślna skórka "Wędrowiec", wczytywanie własnej.
- **Widok z trzeciej osoby** (F5): z oczu / zza pleców / z przodu,
  kamera nie wchodzi w ściany.
- **Kucanie** (Shift) i **bieg** (2x W albo R) - też jako mechanika.
- **Animacje**: stanie (oddech), chód, bieg, kucanie, skradanie, skok,
  spadanie, lądowanie, machnięcie ręką, latanie, pływanie, obrót głowy i ciała.
- Blok z paska w prawej ręce, model oświetlony jak bloki (niebo, lampy,
  noc, dynamiczne światło, mgła).
- Narzędzia: `/kamera`, `/animacja`, `/model`, `/skorka`.

## Model

Wymiary w pikselach skórki - 32 piksele to wysokość gracza (1,8 bloku),
czyli jak w Minecrafcie:

```
              ┌──────┐
              │głowa │  8 x 8 x 8                    ── szyja
           ┌──┼──────┼──┐
   ramię   │  │klatka│  │  ramię    klatka 8 x 6 x 4 ── talia
           ├──┤      ├──┤  ── łokieć
 przedramię│  │brzuch│  │ przedramię brzuch 8 x 6 x 4 ── miednica
           └──┼──┬───┼──┘            ręce: 4 x 6 x 4 + 4 x 6 x 4
              │udo│udo│  ── biodra
              ├───┼───┤  ── kolana   nogi: 4 x 6 x 4 + 4 x 6 x 4
              │gol│gol│
              └───┴───┘
```

**Stawy (11):** miednica, talia, szyja, 2 barki, 2 łokcie, 2 biodra,
2 kolana. Kod: `src/player/PlayerModel.js` (lista `BONES`).

**Zginane klocki:** wyprostowana ręka wygląda jak jeden klocek 4 x 12 x 4
(jak w Minecrafcie), a w środku zgina się bez szpar - górna i dolna
połowa obracają się osobno, a wierzchołki w stawie leżą w połowie między
nimi. Dzięki temu tekstura jest ciągła, a zgięcie wygląda jak "ścięty"
klockowy łokieć.

Drugi styl - **klocki**: każda połowa jest osobnym, sztywnym klockiem
(wyraźnie widać dwie części, przy mocnym zgięciu - kanciasty staw).
Przełącza się w *Ustawienia → Gracz → Zgięcia rąk i nóg* albo
`/model klocki` / `/model gladki`.

**Kierunki:** model patrzy w stronę -Z, jego prawa strona to +X.

## Skórka

Obrazek PNG **64 x 64**, układ jak w skórkach Minecrafta (działa też
stary 64 x 32). Każda część ma 6 ścian, ułożonych jak siatka pudełka:

![Układ skórki](skorka-uklad.png)

- **Druga warstwa** (czapka, kurtka, rękawy, nogawki) jest trochę
  większa od zwykłej - przezroczyste piksele = nic. Można ją wyłączyć:
  *Ustawienia → Gracz* albo `/model warstwa wyl`.
- **Staw jest w połowie** ręki, nogi i tułowia (biała przerywana linia
  na rysunku). Ubranie, które się tam zmienia (podwinięty rękaw, pasek,
  cholewka buta), ładnie pokazuje zgięcie.
- Szablon do zamalowania (kolorowe pola): `assets/textures/player/skin-szablon.png`.
- Domyślna skórka: `assets/textures/player/skin.png` ("Wędrowiec":
  oliwkowa kurtka z podwiniętymi rękawami, fioletowy szalik w kolorze
  lepidolitu, pasek w talii, skórzane buty do kolan).

**Własna skórka:** *Ustawienia → Gracz → Skórka - wczytaj plik...*
albo `/skorka plik`. Zostaje zapamiętana w przeglądarce;
`/skorka domyslna` wraca do domyślnej. Pasują też skórki z Minecrafta.

## Animacje

Animacje są **proceduralne** - nie ma zapisanych klatek, tylko wzory
z liczbami w `src/player/animations.js` (kąty w stopniach, z opisami).
Silnik: `src/player/PlayerAnimator.js`.

| animacja | co się dzieje |
|---|---|
| **stanie** | oddech (klatka lekko się unosi), ręce trochę odstają i kołyszą się |
| **chód** | nogi do przodu i do tyłu, kolano zgina się, gdy noga idzie do przodu; ręce na przemian z nogami, łokcie lekko zgięte; miednica i klatka skręcają się w przeciwne strony |
| **bieg** | dłuższe kroki, kolana mocno w górę, łokcie zgięte (praca rąk), pochylenie do przodu, podskok w fazie lotu |
| **kucanie** | miednica i klatka pochylone, uda do przodu, kolana zgięte, ręce przed sobą |
| **skradanie** | chód w kucki - krótkie kroki |
| **skok / spadanie** | noga z przodu idzie w górę, ręce lekko w bok; przy spadaniu ręce rozkładają się szerzej |
| **lądowanie** | ugięcie kolan - tym mocniejsze, im szybciej gracz spadał |
| **machnięcie** | prawa ręka do przodu i w dół (niszczenie / stawianie bloku), klatka skręca się za nią |
| **latanie** | nogi luźno, lekko z tyłu; przy ruchu pochylenie do przodu |
| **pływanie** | żabka: ręce do przodu i na boki, nogi kopią; płynąc - ciało prawie poziomo, w miejscu - utrzymywanie się na wodzie (liczby: `swim` w `animations.js`) |
| **głowa i ciało** | głowa patrzy tam, gdzie kamera (do 60° w bok); ciało obraca się za kamerą, a przy chodzeniu w bok - w stronę ruchu |

Najważniejsze sztuczki:

- **Faza kroku rośnie z przebytą drogą**, nie z czasem - nogi
  przebierają się tak szybko, jak gracz naprawdę idzie.
- **Stany mieszają się płynnie** (wagi 0-1): chód przechodzi w bieg,
  kucanie dochodzi do każdej pozy, skok wtapia się w krok.
- **Stopy zostają na ziemi** - miednica obniża się dokładnie o tyle, o ile
  skróciły się ugięte nogi (kucanie, lądowanie, kroki).

Strojenie: zmień liczbę w `animations.js`, odśwież grę i sprawdź
`/animacja chodzenie` (model idzie w miejscu, kamera z przodu)
i `/model tempo 0.25` (zwolnione 4 razy).

## Sterowanie i ruch

| klawisz | co robi |
|---|---|
| **Shift** | kucanie: 30% prędkości, gracz ma 1,5 bloku wysokości (wejdzie pod półtora bloku), oczy niżej, **nie spada z krawędzi** |
| **2x W** albo **R** + W | bieg: 130% prędkości, pole widzenia o 10% szersze; kończy się po puszczeniu W, przy kucaniu albo na ścianie |
| **F5** | widok: z oczu → zza pleców → z przodu |

Bieg nie jest pod Ctrl (jak w Minecrafcie), bo Ctrl+W w przeglądarce
zamyka kartę. Liczby: `CROUCH_...`, `SPRINT_...`, `THIRD_PERSON_DISTANCE`
w `src/config.js`. Odległość kamery: *Ustawienia → Gracz* albo
`/ustaw kamera 3`.

## Narzędzia

| komenda | do czego |
|---|---|
| `/kamera [oczy \| tyl \| przod]` | widok kamery (jak F5) |
| `/animacja <nazwa>` | podgląd animacji w miejscu: `stanie`, `chodzenie`, `bieg`, `kucanie`, `skradanie`, `skok`, `machanie`, `latanie`, `plywanie`, `plywanie-w-miejscu`; `/animacja wyl` |
| `/model` | informacje; `/model gladki` / `klocki`, `/model warstwa wl\|wyl`, `/model tempo 0.25` |
| `/skorka plik`, `/skorka domyslna` | własna skórka / domyślna |
| F3 | w debugu: czy gracz kuca / biegnie, widok kamery, wagi animacji |

## Plan - co dalej

1. **Ręka w pierwszej osobie** - prawa ręka i blok w ręce widoczne
   z oczu gracza, z machnięciem przy niszczeniu i stawianiu.
2. **Więcej animacji**: obrót w miejscu (przestępowanie z nogi na nogę),
   lądowanie z dużej wysokości (przyklęk), zmęczenie po długim biegu,
   pływanie (razem z prawdziwą wodą z rozdziału o terenie), wspinanie,
   siadanie, emotki (`/emotka machanie`, `/emotka taniec`).
3. **Szczegóły modelu**: smukłe ręce (3 piksele, jak skórki "Alex"),
   mruganie oczami, szalik / peleryna, które powiewają przy biegu.
4. **Edytor póz** - ustawianie stawów myszką i zapisywanie póz / klatek
   animacji do pliku (np. do emotek).
5. **Cień pod graczem** (miękka plama na ziemi).
6. Ten sam model dla innych postaci (NPC, w przyszłości inni gracze).

## Do ustalenia z Kamilem

- Który styl zgięć ma być domyślny: gładki czy klocki?
- Czy bieg pod R + dwuklik W pasuje (Ctrl odpada przez przeglądarkę)?
- Wygląd domyślnej skórki - zostaje "Wędrowiec", czy robisz własną?
