# Pływanie i efekty wody — 0.75.0

Baza: wydana 0.74.0. Kolejność prac zatwierdzona przez Kamila:
najpierw wyporność gracza i ciągłość spływania rzeką, następnie pięć
poniższych efektów. Funkcje wizualne i dźwiękowe nie sterują fizyką gracza.

## Najpierw ruch gracza

- Automatyczne utrzymywanie przy tafli bez trzymania Spacji; oczy nad wodą.
- Zachowanie świadomego nurkowania Shiftem i wychodzenia na brzeg Spacją.
- Sprawdzenie relacji między proceduralnym nurtem rzeki a lokalnym
  spływaniem wody, zwłaszcza na spadkach i granicach bloków.
- Testy spokojnej wody, spadków, dna, zakrętów, nurkowania oraz różnych
  kroków czasowych. Kolizje z prawdziwym brzegiem muszą pozostać aktywne.

Wyporność została sprawdzona na rzeczywistym `Player.update`: 244
sprawdzenia, kroki 30/60/120 Hz i zmienny krok. Równowaga bez klawiszy
to 78% zanurzenia (oczy około 20 cm nad taflą); Spacja podnosi gracza
wyżej, Shift pozwala nurkować. Spadająca struga daje opór i zwilża
ciało, ale nie działa jak automatyczna winda. Różnica przebiegu
wynurzania między 30/60/120 Hz nie przekroczyła 0,85 cm.

Reprodukcja błędu nurtu w 0.74: źródło o bazowej wysokości 0,875
obok pełnej spadającej komórki 1,0 tworzyło pozorny lokalny spadek
pod prąd. Ten wektor zastępował zapisany nurt rzeki. Gracz oscylował
przy granicy komórek bez kontaktu ze ścianą. Osobno brak wyporności
pozwalał opaść na dno i utknąć na jego schodku. To dwa różne problemy.

## Wdrożone efekty po naprawach

1. **Płaskie smugi piany.** Nieregularne łaty przy uderzeniu, przesuwane
   przez nurt i stopniowo rozpadające się. Zastępują sześcienną pianę;
   korzystają z maski rzeczywistej tafli i ograniczonej liczby pól.
2. **Mokre skały.** Ciemniejszy pas i delikatny połysk blisko rozbryzgu,
   z ograniczonym zasięgiem oraz rzadkim odświeżaniem powierzchni.
3. **Dźwięk zależny od wysokości spadku.** Mały plusk / silniejszy szum,
   płynne zmiany głośności, tłumienie przez skały i zanurzenie. Ograniczona
   liczba najbliższych źródeł i zwalnianie pętli po oddaleniu lub wyjściu.
4. **Delikatniejsza mgiełka.** Niewiele miękkich smug przy dużych spadkach,
   zależnych od siły i oświetlenia, z wygaszaniem na odległość oraz
   mniejszym limitem w trybie ziemniaka.
5. **Kręgi po graczu i deszczu.** Krótkie, wygasające impulsy na tafli,
   ograniczona częstość emisji i wspólny budżet efektów. Krople deszczu
   działają tylko podczas rzeczywistego deszczu nad odkrytą wodą.

Nurt w naturalnym korycie ma teraz jeden autorytatywny kierunek i prędkość.
Lokalny spływ nadal obsługuje wodę poza rzeką i boczny odpływ przy tamie.
Wysokość wypełnionej wodą komórki odpowiada jej rzeczywistemu stanowi.
Naturalne pionowe granice koryta są obliczane przy istniejącej generacji
i odtwarzaniu zapisów: dodatkowe 512 B tylko w chunkach z nurtem,
przenoszone przez workera. Basen nad rzeką nie dziedziczy jej wektora;
format zapisanych bloków nie zmienia się.

W teście A/B tego samego gracza przez 600 klatek/10 s stary resolver
oscylował w zakresie około ±0,0167 bloku (371 zmian kierunku, 370 cofnięć).
Nowy przeszedł od x=-1,5 do x=17,93 bez cofania i dotykania ściany.
Liczba odczytów całej fizyki spadła z 23 898 do 22 090. Potwierdzony
naturalny przypadek seed 42: (-207,72,-641); zapisany nurt (-1,9375,-1,75)
był wcześniej zastępowany przez (0,1). Regresje obejmują cztery kierunki,
ujemne granice chunków, tamę, worker i stare zapisy 8-bitowe.

## Sterowanie i zakres deszczu

- Bez klawiszy: utrzymywanie przy tafli i dryf z nurtem.
- Shift: świadome nurkowanie; puszczenie przywraca wyporność.
- Spacja: wyższe pływanie i dotychczasowe wychodzenie na brzeg.
- `/pogoda deszcz` albo `/pogoda deszcz 40`: lokalny deszcz o zadanym
  natężeniu procentowym. `/pogoda sucho` zatrzymuje opad.

To pierwszy prosty opad, włączany na czas sesji; bez automatycznego
kalendarza pogody, burz i zmian biomów. Krople trafiają w pierwszą
rzeczywistą powierzchnię: dach zatrzymuje je przed wodą. Krąg powstaje
przy dotknięciu odkrytej tafli przez kroplę. Gracz wywołuje krótkie fale
przy wejściu i ruchu przy powierzchni, także podczas szybkiego wpadnięcia.

## Budżety

| Warstwa | Zwykły detal | Tryb ziemniaka |
| --- | ---: | ---: |
| Stałe kręgi wodospadów | 12 pól | 4 pola |
| Krótkie kręgi gracza i deszczu łącznie | 12 pól | 4 pola |
| Piana, na gotowej masce kręgów | 2028 quadów | 676 quadów |
| Mgiełka | 32 billboardy | 8 billboardów |
| Mokre skały | 4 pola / 256 ścian | 2 pola / 128 ścian |
| Krople deszczu | 96 | 24 |
| Dźwięki wodospadów | 4 głosy | 2 głosy |

Stałe i krótkie kręgi współdzielą limit 48 odkrywanych komórek na klatkę.
Piana pożycza gotową maskę, bez własnego BFS. Mokre skały odkrywają
najwyżej 32 komórki z miękkim terminem 0,2 ms; deszcz najwyżej 64
odczyty, łącznie z wysokością trójkąta; promienie zasłonięcia dźwięku
najwyżej 96 komórek z miękkim terminem 0,25 ms. Te terminy nie obejmują
wszystkich kosztów uploadu i rysowania i nie są gwarancją czasu klatki.

Każda nowa warstwa wizualna korzysta z jednej siatki / jednego rysowania.
Piana i mgiełka zastępują poprzednie sześcienne odpowiedniki; sześcienne
krople rozbryzgu pozostają. Mgiełka płynnie zanika między 24 a 38 blokami.
Kręgi, piana, mgiełka i mokre skały współdzielą istniejące oświetlenie
pochodni, ognisk i meteorów; nie tworzą nowego wolumenu światła.
Kręgi, piana i mokre skały nie odczytują bloków ponownie podczas stabilnej
animacji. Deszcz rezerwuje część miejsc na kręgi gracza. Wyłączanie,
zmiany chunków i wyjście ze świata usuwają właściwe zasoby.

Audio wykorzystuje istniejące nagrania `water_waves` i `water_stream`.
Wysokość zmienia nagranie, głośność i ton; skała tłumi dźwięk, zanurzenie
korzysta też z istniejącego filtra podwodnego. Wygaszany głos blokuje
miejsce aż do rzeczywistego `onended`. Po przełączeniu na niski detal
nadmiarowe głosy kończą krótki fade, zanim pula zostanie ponownie użyta.

## Sprawdzenie całości

Nowe skrypty Node: `sprawdz_plywanie`, `sprawdz_nurt_rzeki`,
`sprawdz_piane_mgielke`, `sprawdz_mokre_skaly`, `sprawdz_dzwiek_wodospadow`,
`sprawdz_impulsy_deszcz` i `sprawdz_dynamiczne_swiatlo_wody` (pliki `.mjs`
w `tools/`). Wchodzą do `npm test`.

`node tools/sprawdz_plywanie_webgl.mjs` wykonuje pełne `Game.update`,
sprawdza zegar gracza, zapisuje ślady 30/60/120 Hz, testy nurkowania/brzegu
i spływ naturalną rzeką seed 42. Wyniki: `test-results/river-swimming/`.
`node tools/sprawdz_fale_wodospadow_webgl.mjs` porównuje obrazy warstw,
dzień/noc, deszcz i dach, dźwięki Web Audio, mutacje i wyjście ze świata.
Wyniki: `test-results/waterfall-ripples/`.

[Pięć prób kontrolera dźwięków](pomiary/woda-0.75.0/dzwiek-cpu.json):
mediana stabilnej aktualizacji 0,00184 ms; największa próbka ponownego
odkrywania przeszkody 0,03972 ms. To CPU kontrolera z kontrolowanym
zegarem Web Audio, bez pomiaru przetwarzania dźwięku i bez oceny odsłuchowej.

Pełne pomiary należy odczytywać z etapu gry, ponieważ indywidualny
`lastMs` piany/mgiełki nie obejmuje odświeżenia emiterów. Programowy WebGL
w CI nie zastępuje pomiaru FPS i przezroczystych warstw na sprzęcie gracza.
Końcowy opis PR zawiera wyniki CI i linki do próbnych aplikacji.
