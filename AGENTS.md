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
- Przygotowanie PR nie oznacza publikacji. Obecny workflow publikuje
  nową wersję po scaleniu do `main`. W odpowiedzi jasno odróżnij
  „przygotowane w PR” od „wydane i dostępne do pobrania”.
- Po publikacji sprawdź pliki w `voxel-game-wydania` oraz numery
  w `latest.yml` i `android-latest.json`. Podaj link do gotowego wydania.

Szczegóły procesu: [docs/aplikacja.md](docs/aplikacja.md),
Android: [docs/telefon.md](docs/telefon.md).

## Animacje krzaków i roślinności

Przy nowych roślinach stosuj kierunek zatwierdzony przez Kamila:
[docs/animacje-roslin.md](docs/animacje-roslin.md). Krótkie, subtelnie
sprężyste reakcje na stawianie, zbiór, nieudany zbiór i usunięcie;
płynne zmiany rozmiaru oraz odrastanie owoców. Owoce skaluj wokół
własnych środków, zachowaj zakorzenienie i neutralny początek/koniec.
Animacja jest warstwą wizualną — nie opóźnia ani nie zmienia zasad
ekwipunku, wzrostu i zapisu. Ogranicz koszt do aktywnych roślin i
sprawdź przejścia oraz wydajność w grze. Borówka jest pierwszym
wdrożeniem; pozostałe gatunki dostają tę zasadę przy ich opracowaniu.
