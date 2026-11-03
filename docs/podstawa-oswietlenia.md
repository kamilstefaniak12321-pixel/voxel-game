# Podstawa oświetlenia 0.57.0

Pierwszy odbiór obejmuje E00–E04 i E07 planu: wspólne składanie światła,
słońce i niebo, zasłonięte miejsca, cienie/AO oraz paletę doby. Rozbudowane
odbicia otoczenia, transmisja liści i nowa symulacja atmosfery pozostają
kolejnymi etapami po ocenie wyglądu. Dotychczasowe eksperymentalne odbicia
pozostają domyślnie wyłączone.

## Porównanie i odbiór

**Obraz → Zaawansowane → Paleta światła** przełącza „Naturalna” i
„Poprzednia (0.56.1)”. Poprzednia paleta przywraca dawny tor wyświetlania
oraz statyczne cienie roślin; można porównać ten sam świat i kamerę.
Naturalna paleta korzysta ze światła atmosferycznego również wtedy, gdy
stary eksperyment „Światło: Klasyczne” jest zapisany w ustawieniach.
Ten eksperyment dotyczy tylko poprzedniej palety.

Scena `/scena paleta` zawiera siedem stałych kamer, krzewy z owocami,
kamień, odmiany drewna, jasną i szarą kostkę, dach, okno, zamknięte
pomieszczenie na styku czterech chunków, emiter i ognisko.
Powtarzalny harness i raporty opisuje [pomiar](pomiary/swiatlo-0.57.0/README.md).
Zwykła scena nie zapisuje ani nie zmienia wyglądu innych światów.

Komendy diagnostyczne:

- `/swiatlo paleta naturalna` lub `poprzednia` — wariant A/B.
- `/swiatlo widok albedo|normals|sunVisibility|skyAccess|ao` — dane materiału.
- `/swiatlo widok sun|moon|sky|bounce|local|emission` — składniki radiancji.
- `/swiatlo widok grayscale` — pełny obraz w szarości.
- `/swiatlo zrodlo sun|moon|sky|bounce|local|emission wl|wyl` — kontrola zależności.
- `/swiatlo chmury 0–100` — jednorodny profil światła zachmurzonego.
- `/swiatlo reset` — pełny obraz i wszystkie składniki.

Widoki źródeł mają wspólną ekspozycję, bez automatycznego dopasowania
jasności. Albedo i maski omijają kompresję świateł. Diagnostyka dotyczy
powierzchni; tarcze niebieskie, dekoracje i interfejs nie są maskami
powierzchni. Zachmurzenie jest profilem światła, bez deszczu, losowania
pogody i geometrii chmur nad graczem. Przełączniki diagnostyczne nie
zapisują się i resetują po wyjściu ze świata.

## Właściciele obliczeń

| Dane / operacja | Miejsce | Znaczenie |
|---|---|---|
| Renderer | vendored Three.js r160, WebGLRenderer | Liniowe obliczenia w świecie; wyjście sRGB |
| Kolor tekstur | TextureAtlas, mapy modeli | Tekstury kolorowe sRGB; dekodowanie przez Three |
| Tinty i dalekie materiały | ChunkMesher, SurfaceMaterials, farSamples | Albedo liniowe; osobne kodowanie bajtowe LOD |
| Voxelowy skyAccess | Light, ChunkMesher | Dostęp rozproszonego nieba, nie bezpośredniego słońca |
| Wagi lamp / AO / emisji | atmosphereLight, surfaceOcclusion, surfaceEmission | Rozdzielone wejścia; pow(2.2) dekoduje wagi, nie teksturę sRGB |
| Ciała niebieskie | Celestial, SolarDisc | Kierunki i widoczna część tarczy |
| Paleta i moce | LightingPalette v1, Sky | Ciągłe źródła według wysokości, fazy księżyca i chmur |
| Kierunkowe otoczenie | HemisphereLight | Górna/dolna półkula, lokalnie ograniczona skyAccess i AO |
| Widoczność bezpośrednia | Shadows, CampfireLight | Mapy głębi i maski alpha; osobne od skyAccess |
| Suma powierzchni | SurfaceLighting | Lambert + lampy + odbicia + własna emisja |
| Mgła | viewUniforms, skyShader, materiały świata | W naturalnym torze miesza się w liniowym render target |
| Prezentacja | WorldOutput | Stała ekspozycja 1, jeden neutralny shoulder i jedno kodowanie sRGB |
| Ułatwienie widoczności | suwak Jasność | Jawna pomoc w grze; w odbiorze wartość 0 |

Naturalna paleta nie używa dawnych mnożników kontrastu słońca ani
odbarwiania całego naturalnego oświetlenia nocą. Ciepły kolor ogniska
pozostaje kolorem źródła. Cień słoneczny ogranicza światło kierunkowe;
AO ogranicza światło pośrednie i nie wygasza własnej emisji.
Promienie w powietrzu otrzymują osobną kalibrację liniowej mocy (0.10
dawnej skali ekranowej). Zachowuje to delikatne rozproszenie bez
rozjaśniania całego lasu; efekt nie wykonuje drugiego tonowania.
Voxelowe lampy zachowują istniejącą lokalną propagację oraz cieniowanie
ścian; statyczna i dynamiczna reprezentacja tej samej lampy łączą się
maksimum, aby nie liczyć jej dwa razy.

## Paleta i wyświetlanie

Sześć profili w `LightingPalette.js` przechowuje próbki HEX sRGB oraz
osobne moce względne. Po jednorazowym dekodowaniu miesza się je liniowo
według wysokości słońca. Zniknięcie tarczy zeruje bezpośredni składnik;
zmierzch pozostaje w niebie. Noc ma własny księżyc i słabe otoczenie,
a pełne zachmurzenie osłabia wiązkę i ogranicza błękit otoczenia.

Niebo, teren bliski i daleki, woda, modele oraz efekty trafiają do
liniowego bufora HDR. Końcowy operator zachowuje proporcje RGB:
poniżej 0.6 jest tożsamością, powyżej łagodnie kompresuje szczytowy
kanał ku 1. Interfejs DOM i osobny renderer ikon ekwipunku pozostają
poza tym torem. Antialiasing zachowuje ustawienie kontekstu.

Na GPU bez renderowania do half-float używany jest liniowy RGBA8.
Nadal ma pojedyncze kodowanie wyjścia, ale nie zachowuje informacji
powyżej 1 przed kompresją — to ograniczenie jakości fallbacku.

## Cienie poruszających się roślin

Kolor i caster korzystają z tej samej funkcji `plantWindOffset`.
Osobna mapa bliskich traw i krzewów ma promień 32 bloków, 1024² i
odświeżanie do 10 Hz. Powstaje w drugim buforze z limitem 8 rysowań,
40 tys. trójkątów i 0.5 ms składania pracy na klatkę. Macierz, tekstura,
czas wiatru i amplituda fal tworzą jeden snapshot.
Roślin nie rysuje się drugi raz w nieruchomych mapach terenu.

Duże korony drzew nadal należą do kaskad terenu sięgających ponad
800 bloków. Cienie drobnej roślinności łagodnie zanikają przy brzegu
bliskiej mapy. Ognisko odświeża sześć ścian mapy do 4 Hz, gdy w jego
zasięgu rzeczywiście są ruchome rośliny, zachowując limit źródeł.
Barwy ani pora doby nie wymagają przebudowy geometrii chunków.

## Granice pierwszego odbioru

- To fundament i wersja palety do oceny, bez nowych materiałów liści,
  przeświecania i rozbudowanego odbicia światła od podłoża.
- Daleki LOD nie odtwarza lokalnych lamp, jaskiń ani drobnych krzewów;
  współdzieli źródła nieba/słońca i materiały powierzchni terenu.
- Dodatkowy koszt końcowego bufora i cieni roślin jest raportowany
  oddzielnie od aktualizacji samych kolorów. Limit 5% nie oznacza
  automatycznie, że cały pakiet nowych efektów jest bezkosztowy.
- Odbiór wydajności tej iteracji dotyczy Windows/RTX 3050 na zasilaczu.
  Fizyczny telefon Android nie był dostępny do pomiaru.
