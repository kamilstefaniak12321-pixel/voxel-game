# Borówka — animacje 0.43.0

PR [#72](https://github.com/kamilstefaniak12321-pixel/voxel-game/pull/72),
zmiany względem wydanej wersji 0.42.0. Wydanie 0.43.0 jest przygotowane
w PR; publikacja nastąpi po scaleniu do `main`.

## Zachowanie

Krzywe z modelu Blockbench Kamila zostały zaadaptowane w grze:
owoce skalują się wokół własnych środków, ruch zaczyna się neutralnie,
usuwanie trwa 0,42 s, a odbicie zewnętrznych liści najwyżej 1/16 bloku.
Dodano płynny wzrost sadzonki i stopniowe narastanie owoców. Przy
przerwaniu animacji następna zaczyna się od bieżącej pozy. Reguła
dla kolejnych gatunków jest w [animacje-roslin.md](animacje-roslin.md)
i została wpisana do `AGENTS.md`.

[Nagranie całego cyklu](pomiary/borowka-animacje-0.43.0/cykl-borowki.webm)
pokazuje usunięcie, posadzenie, wzrost, odrastanie owoców, reakcję na
pełny ekwipunek i udany zbiór. Tempo podglądu wynosi 50% rzeczywistego,
aby było łatwiej ocenić przejścia. Plik źródłowy użytkownika `.bbmodel`
pozostał bez zmian.

[Podgląd z klatkami kontrolnymi](pomiary/borowka-animacje-0.43.0/podglad.html)
można otworzyć lokalnie w przeglądarce razem z plikiem nagrania.

## Sprawdzenie w aplikacji

Próba na komputerze Kamila w osobnym profilu Electron, bez zmian w jego
zapisach. Wykorzystano rzeczywiste `Game.harvestTarget`, `PlantGrowth`,
`World` i renderer, z przyciskami lokalnego panelu QA.

- Pełny ekwipunek: reakcja krzaka, owoce pozostają, brak dodatkowego plonu.
- Wolne miejsce: owoce trafiają do ekwipunku, zostaje dorosły pusty krzak.
- Pusty → częściowy → pełny: widoczne rozmiary pośrednie nowych owoców.
- Sadzonka → dorosły: płynna zmiana rozmiaru przy zakorzenionej podstawie.
- Usunięcie w trakcie wzrostu: brak pozostałego modelu i aktywnej animacji.
- Zapis oraz ponowne wczytanie: stabilny etap i zachowany ekwipunek.
- Brak błędów JavaScript; kontrola prawdziwych materiałów GPU przeszła,
  także warianty WebGL 1.

Pełne `npm test` przeszło. Nowy test obejmuje również przerwania,
ujemne współrzędne, przebudowę i usunięcie chunka, limit aktywnych roślin,
własne środki owoców oraz ograniczoną liczbę aktualizacji buforów.
Koniec animacji nie powoduje drugiej przebudowy terenu.

## Wydajność

RTX 3050 Laptop GPU, zasilacz, 1920×1080, skala 100%, ekran 144 Hz,
Electron 44.4.5 / ANGLE D3D11. Pełne bloki: 48; daleki teren: 8192;
cienie: 3; oświetlenie atmosferyczne; brak limitu FPS, domyślny VSync.
Świat klasyczny, seed 2138286349. Rozgrzewka 10 s i pomiar 30 s.

Scena zawiera 400 krzaków. Co 2,4 s zmienia się etap 24 krzaków;
maksymalnie 12 z nich animuje się równocześnie. Próba porównawcza
wyłącza samo rozpoczynanie animacji, zachowując zmiany etapów i meshowanie.

| Pomiar | Bez przejść | Z animacjami |
| --- | ---: | ---: |
| Średnie FPS | 142,3 | 140,9 |
| 1% low FPS | 64,9 | 57,8 |
| Średni czas GPU | 4,81 ms | 5,53 ms |
| Najdłuższa klatka | 27,0 ms | 24,2 ms |

Średni koszt sterownika animacji w drugiej próbie wyniósł 0,40 ms/klatkę.
Średnia płynność spadła o około 1%. To krótka próba obciążeniowa,
nie gwarancja stabilnych 60 FPS w całej grze: 1% low w tej scenie
wyniósł około 58 FPS. Wyniki pojedynczych skrajnych klatek są zmienne.

Początkowy limit 24 dawał 136,9 FPS i 1% low 52,1 FPS. Limit 12 oraz
usunięcie zbędnej przebudowy chunka po końcu przejścia zmniejszyły koszt.
Po animacji zostaje końcowa geometria bez aktywnego animatora; ściany
zwinięte do zerowej powierzchni usuwa kolejna zwykła przebudowa.
Limit i odległość 48 bloków dotyczą przejść, nie widoczności roślin.

## Materiały pomiarowe

- [Wyniki, ustawienia, próby integracji i GPU](pomiary/borowka-animacje-0.43.0/wyniki.json)
- [Log testów](pomiary/borowka-animacje-0.43.0/tests.log)
- [Lokalny panel QA](pomiary/borowka-animacje-0.43.0/qa.js), archiwum kodu użytego w próbie.

Panel służy wyłącznie do odtworzenia sceny testowej, poza aplikacją
produkcyjną. Należy podać go zamiast `src/main.js` przez lokalny serwer,
zapewnić endpoint JSON `/river-report` i endpoint nagrania
`/animation-recording`, a profil Electron oddzielić od normalnej gry.
Założyć klasyczny świat z podanym seedem; uruchomić „Sprawdź cały cykl”,
następnie oba pomiary (po 40 s), bez równoczesnych kompilacji.
