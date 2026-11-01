# Praca nad Voxel Game

## Pull requesty i wydania

Ustalona zasada projektu: każdy pull request ma wskazywać wersję gry
i przygotowywać ją do wydania w `kamilstefaniak12321-pixel/voxel-game-wydania`.

- Tytuł PR zaczynaj od `0.x.y — opis zmiany`. W opisie podaj wersję,
  zmiany dla gracza, wyniki sprawdzeń i stan wydania.
- Przed wybraniem numeru sprawdź `main`, otwarte PR-y i ostatnie wydanie.
  Numer ma być nowy i rosnący: poprawki zwiększają ostatnią liczbę,
  większe funkcje środkową. Przy równoległych PR-ach uzgodnij kolejność
  i uaktualnij numer przed scaleniem. Nie zmieniaj numeru po każdym
  kolejnym commicie w tym samym PR.
- Uaktualnij `version` w `package.json` oraz główną wersję i wersję
  `packages[""]` w `package-lock.json`. Android pobiera numer stąd
  automatycznie. Nie zmieniaj wersji zależności przy samym wydaniu.
- Dopisz sekcję tej wersji w `CHANGELOG.md`, z numerem PR i zmianami
  względem ostatniej pobieralnej wersji. Uwzględnij wcześniejsze scalone,
  ale jeszcze niewydane poprawki.
- Uruchom sprawdzenia odpowiednie do zmiany i sprawdź próbne kompilacje
  Windowsa i Androida w workflow „Aplikacje (komputer i telefon)”.
  Próby ruszają dopiero po dodaniu etykiety `kompilacja` — dodaj ją,
  gdy PR jest gotowy (testy lokalne przeszły), a nie przy każdej
  poprawce: minuty Actions są ograniczone. Przy PR-ach ułożonych
  w stos wystarczy etykieta na najwyższym. Opis: `docs/aplikacja.md`.
- Przygotowanie PR nie oznacza publikacji. Obecny workflow publikuje
  nową wersję po scaleniu do `main`. W odpowiedzi jasno odróżnij
  „przygotowane w PR” od „wydane i dostępne do pobrania”.
- Po publikacji sprawdź pliki w `voxel-game-wydania` oraz numery
  w `latest.yml` i `android-latest.json`. Podaj link do gotowego wydania.

Szczegóły procesu: [docs/aplikacja.md](docs/aplikacja.md),
Android: [docs/telefon.md](docs/telefon.md).

## Repozytorium publiczne i licencja

Kod gry jest na licencji PolyForm Noncommercial 1.0.0 (`LICENSE.md`,
streszczenie: `docs/licencja.md`) i może być publiczny.

- Nigdy nie dodawaj do repozytorium sekretów (tokenów, haseł, klucza
  wydań Androida) ani danych osobowych - tylko do sekretów GitHuba.
  Wyjątek: celowo publiczny klucz testowy `android/app/klucz-testowy.keystore`.
- Cudzy plik (dźwięk, tekstura, biblioteka) tylko na licencji, która
  na to pozwala; dopisz go do tabeli w `docs/licencja.md`.
- Nie zmieniaj tekstu w `LICENSE.md` (poza linią `Required Notice:` na
  prośbę Kamila).

## Animacje krzaków i roślinności

Przy nowych roślinach stosuj kierunek zatwierdzony przez Kamila:
[docs/animacje-roslin.md](docs/animacje-roslin.md). Krótkie, subtelnie
sprężyste reakcje na stawianie, zbiór, nieudany zbiór i usunięcie;
płynne zmiany rozmiaru oraz odrastanie owoców. Owoce skaluj wokół
własnych środków, zachowaj zakorzenienie i neutralny początek/koniec.
Animacja jest warstwą wizualną — nie opóźnia ani nie zmienia zasad
ekwipunku, wzrostu i zapisu. Ogranicz koszt do aktywnych roślin i
sprawdź przejścia oraz wydajność w grze. Borówka jest pierwszym
wdrożeniem; od 0.49.0 wszystkie rośliny z paczek z modelem `kepka`
(kępki i krzewy) mają te reakcje automatycznie (`TuftAnimation.js`) —
nowa roślina z paczki dostaje je bez dodatkowego kodu. Dywany, porosty
i huby (zależą od sąsiadów) jeszcze bez animacji.

Od 0.50.0 również truskawka, jeżyna, chili i leszczyna mają pełne
przejścia wzrostu i owocowania (`FruitBushAnimation.js`). Model owocu
w ekwipunku i w dłoni musi pochodzić z tej samej geometrii co owoc na
roślinie (`FruitBushGeometry.js`), z zachowaniem kształtu i kolorów.
