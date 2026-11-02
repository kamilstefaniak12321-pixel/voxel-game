# Próba muzyki 0.53.0 — 2 listopada 2026

## Zakres

Pełne `npm test`, w tym 119 sprawdzeń sterowania muzyką: tasowanie,
przerwy, głośność, narastanie i wygaszanie, przejście do tła, stare
ustawienia, blokada autoplay, błędy plików i spóźnione Promise.
126 dodatkowych sprawdzeń obejmuje obsługę zakresów MP3 w aplikacji.
`npm run android:www` kopiuje wszystkie pięć MP3 do paczki 0.53.0.

Końcowa próba w oknie gry: **20/20**, bez błędów JS ani odtwarzacza
([native.json](native.json)). Wszystkie utwory: 180,035917 s,
niezerowy sygnał Web Audio, przewinięcie i zakończenie z przerwą.
Ten sam utwór „Pierwszy dom” przeszedł kolejno przez menu, wczytywanie,
rozgrywkę, ekwipunek, pauzę i powrót do menu bez restartu pozycji.
Suwak muzyki w menu sprawdzono również ręcznie: 60 → Wył. → 60.
Osobny odczyt rzeczywistych bajtów przez Electron potwierdza zakresy
([strumien.json](strumien.json)).

`native-launcher.cjs` uruchamia rzeczywistą grę w Electronie 44.4.5
przez `gra://voxel-game`, ze standardową polityką autoplay. Używa
oddzielnego profilu w `../voxel-music-proof/native-profile` i świata
„Próba muzyki”, seed 42. Nie odczytuje zapisów z zainstalowanej gry.
Preload udostępnia wyłącznie zapis raportu do stałej ścieżki.

## Odtworzenie

Uruchom istniejącym Electronem `docs/pomiary/muzyka-0.53.0/native-launcher.cjs`.
Kliknij „Sprawdź pięć MP3”, potem „Głośność i tło”. Pierwsza próba
odtwarza początek, fragment około 40. sekundy i końcówkę każdego pliku;
sprawdza długość, sygnał za regulacją muzyki i prawdziwe zdarzenie `ended`.
Druga sprawdza zatrzymanie zegara i wznowienie tego samego utworu,
wyciszenie przez oba suwaki oraz zdarzenie `apppause` używane na Androidzie.

Ręcznie przejdź przez ustawienia dźwięku, wybór świata, rozgrywkę,
ekwipunek, pauzę i powrót do menu. Panel pokazuje utwór i pozycję;
„Zapisz stan” zapisuje pomiar, a przejścia stanów są zapisywane automatycznie.
Ctrl+Shift+Q zamyka wyłącznie okno próby.

To kontrola odtwarzacza i integracji w grze, nie ocena brzmienia na
głośnikach ani pomiar FPS A/B. Zdarzenie Androida jest sprawdzane w
Electronie; odtwarzania na fizycznym telefonie w tej próbie nie sprawdzano.

## Problem wykryty podczas próby

`net.fetch(file://...)` w używanym Electronie przycina body zgodnie z
`Range`, ale nie przekazuje długości ani prawidłowego statusu 206.
Odtwarzacz traktował MP3 jako strumień o nieznanej długości. Obsługa
plików MP3 w aplikacji uzupełnia te informacje, zachowując strumieniowanie.
Pozostałe zasoby gry korzystają z dotychczasowej ścieżki.
