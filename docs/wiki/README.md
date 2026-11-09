# Voxel Game - wiki

Klockowa gra w przeglądarce, na komputerze (Windows) i na telefonie
(Android). Nieskończony świat z prawdziwymi formami terenu i skałami,
lasy dwunastu gatunków drzew, krzaki owocowe, woda, dzień i noc
z fazami księżyca, meteoryty, kopanie, wytwarzanie - i jeden sekret
wysoko nad chmurami.

**Strony wiki:** [Historia zmian](../../CHANGELOG.md) ·
[Bloki](bloki.md) · [Przedmioty](przedmioty.md) ·
[Przepisy](przepisy.md) · [Osiągnięcia](osiagniecia.md)

Strony *Bloki*, *Przedmioty*, *Przepisy* i *Osiągnięcia* (i plik
`index.html` - całe wiki jako jedna strona) generuje
`python tools/wiki.py` prosto z kodu gry, więc zawsze pasują do
aktualnej wersji. Tę stronę i historię zmian pisze się ręcznie.

## Jak zacząć

1. **Nowy świat** na ekranie tytułowym: nazwa, seed (puste = losowy),
   *Teren: Realistyczny* i *Tryb gry: Przygoda*.
2. Rozejrzyj się i wykop kilka bloków ziemi - **trzymaj LPM**, blok
   pęka i po chwili wpada do ekwipunku.
3. Znajdź drzewo i zetnij pień. W ekwipunku (**E**) połóż pień w siatce
   wytwarzania - powstaną **deski**, z desek **patyki**, a z patyków
   i kamieni **kilof**, **łopata** i **siekiera**.
4. Nocą robi się ciemno - lampę zrobisz z **lepidolitu** (fioletowe
   żyły w granicie), **żywicy** z sosny i **kory brzozowej**.

Przycisk 📖 *Przepisy* w ekwipunku i komenda `/przepisy` podpowiadają,
co z czego zrobić.

![Ekwipunek: księga przepisów, siatka wytwarzania i wynik](wytwarzanie.jpg)

## Sterowanie

| Klawisz | Co robi |
|---|---|
| WASD | chodzenie |
| Spacja | skok; w wodzie - w górę; 2 x Spacja - latanie (kreatywny) |
| Shift | kucanie (nie spadasz z krawędzi); w wodzie - nurkowanie |
| 2 x W albo R | bieg |
| LPM (trzymany) | kopanie bloku |
| PPM | stawianie bloku, zbieranie owoców, sadzenie, siekierą - okorowanie pnia |
| środkowy przycisk | weź blok, na który patrzysz |
| 1-9, kółko | miejsce na pasku |
| E | ekwipunek i wytwarzanie |
| F5 | widok: z oczu / zza pleców / z przodu |
| F8 | zaznacz moment problemu w raporcie diagnostycznym |
| T albo / | czat i komendy (`/pomoc`) |
| M | mapa terenu |
| L | księga osiągnięć |
| ESC | pauza i ustawienia |

**Na telefonie:** lewa część ekranu - joystick, reszta - rozglądanie
palcem, stuknięcie - postaw, przytrzymanie - kop; przyciski skoku,
kucania, kopania i stawiania, u góry ekwipunek, czat, mapa i inne.

## Tryby gry

- **Przygoda** - zaczynasz z niczym. Bloki trzeba wykopać (czas zależy
  od materiału, narzędzie przyspiesza 3 razy), trafiają do ekwipunku,
  a stawianie je zużywa. Z liści czasem wypadają sadzonki i nasiona.
- **Kreatywny** - wszystkie bloki pod **E**, bloki znikają od razu,
  nic się nie zużywa, **2 x Spacja** - latanie.

Zmiana w trakcie gry: `/tryb przygoda` albo `/tryb kreatywny`.

## Świat

- **Teren realistyczny** - morze, wybrzeża, niziny, wyżyny i góry,
  a w nich doliny, wąwozy, turnie, płaskowyże. Pod ziemią warstwy skał:
  bazalt, granit, kamień, piaskowiec, wapień i łupek, a w granicie
  rzadkie żyły **lepidolitu**. Świat ma 128 bloków wysokości i ciągnie
  się 30 000 bloków w każdą stronę.
- **Lasy** - świerk, sosna, buk, lipa, dąb i brzoza, każdy tam, gdzie
  pasuje mu klimat, a w ciepłych lasach na nizinach czasem **jabłoń**. Łąki z kwiatami i dzikie **krzaki owocowe**
  (truskawki, jeżyny, papryczki chili, leszczyna).
- **Woda** - przezroczysta, z falami; można pływać i nurkować.
- **Niebo** - doba trwa 20 minut, księżyc ma fazy (pełnia - jasna noc,
  nów - Droga Mleczna), czasem zaćmienie słońca, spadające gwiazdy
  i **meteoryty**, które robią kratery.
- **Daleki teren** - góry widać aż po horyzont.

## Eksperymentalna trawa

W **Ustawienia → Eksperymenty → Trawa kępiasta** można włączyć gęsty
model trawy według koncepcji Kamila. Od 0.62.0 kępki mają osiem warstw
z autorską teksturą 16 × 16, dwie wysokości i delikatny wiatr.
Dalsze kępki zachowują tę samą teksturę, ale mają mniej warstw.
Opcja jest domyślnie wyłączona, działa we wszystkich światach i nie
zmienia bloków ani zapisów. Wyłączenie przywraca zwykłą trawę.

## Rozgrywka

- **Kopanie** - blok pęka w 10 etapach, lecą odłamki; siekiera
  przyspiesza drewno, kilof skały, łopata ziemię i piasek.
- **Wytwarzanie** - siatka 2 x 2 w ekwipunku i księga przepisów.
- **Sadzenie** - owoce, orzechy, szyszki, żołędzie i kwiat lipy
  posadzone na ziemi wyrastają w krzak albo drzewo.
- **Zbieranie** - PPM na krzaku z owocami, na pniu sosny z żywicą,
  na kwitnącej lipie, na liściach jabłoni z jabłkami (jabłka odrastają).
- **Osiągnięcia** - 29 osiągnięć w czterech rangach (klawisz L).

## Ustawienia i komendy

**Diagnostyka i logi** w menu pauzy oraz w **Ustawienia → Gra** pokazuje
błędy i spadki FPS. Naciśnij **F8** podczas problemu albo wpisz
`/logi problem`, a następnie otwórz panel poleceniem `/logi`.
**Zapisz raport** eksportuje błędy, wcześniejsze pomiary, najdroższe
etapy CPU i dostępne pomiary GPU. W Windows można też otworzyć folder
automatycznych logów; **Pokaż treść** pozwala skopiować podsumowanie.

**Gra → Logi wydajności** wyłącza nowe pomiary, zachowując zapis błędów.
Raporty pozostają lokalne. Mogą zawierać seed i współrzędne; dane
nie są automatycznie wysyłane. Wskazanie kosztownego etapu pomaga
szukać przyczyny, ale nie oznacza, że każdy spadek udało się wyjaśnić.
[Sposób pomiaru, limity i odczytywanie raportu](../logi.md).

W *Ustawieniach* (ESC) są zakładki: Obraz (zasięg widzenia, daleki
teren, tryb ziemniaka dla słabych komputerów, liście...), Sterowanie,
Gracz (skórka, ręka w widoku z oczu, kołysanie), Dźwięk i Inne.

**Obraz → Zaawansowane → Atmosfera** przełącza naturalną perspektywę
powietrzną i poprzednią mgłę 0.62.0. Dalszy teren łagodnie przyjmuje barwę
nieba; bliskie obiekty i zamknięte wnętrza zachowują kontrast. Ustawienie
działa również w żywym menu. Szczegóły: [atmosfera](../atmosfera.md).

Najważniejsze komendy: `/pomoc`, `/przepisy`, `/kopanie`, `/daj`,
`/tryb`, `/czas ustaw noc`, `/tp`, `/drzewa`, `/krzaki`, `/mapa`,
`/teren`, `/osiagniecia`. Pełna lista: [docs/komendy.md](../komendy.md).

## Dla twórców gry

Opisy techniczne poszczególnych części gry są w `docs/`:
[gracz](../gracz.md), [drzewa](../drzewa.md),
[generator terenu](../generator-terenu.md),
[niebo i światło](../niebo-i-swiatlo.md), [kosmos](../kosmos.md),
[osiągnięcia](../osiagniecia.md), [telefon](../telefon.md),
[aplikacja](../aplikacja.md). Jak dodać blok, przedmiot albo przepis -
w głównym [README](../../README.md). Wszystkie drzewa opisuje wspólny
katalog `src/blocks/treeCatalog.js`, a tekstury są w [arkuszach tematycznych](../tekstury-atlasy.md).

## Ogniska

Pień i siekiera dają 4 opały; siekiera zostaje. Ułóż 6 polan, dodaj trawę i przytrzymaj PPM starterem z dwóch patyków. Ognisko pali się około 8 minut, zwęgla się i zostawia żar oraz popiół. Pełna instrukcja: [ogniska](../ogniska.md).
