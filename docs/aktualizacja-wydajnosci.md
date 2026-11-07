# Aktualizacja wydajności 0.60.0

Celem jest krótsza praca na głównym wątku podczas eksploracji, zmian
roślin i dużych autozapisów. Paleta, światło, cienie, modele i ustawienia
zasięgu zachowują dotychczasowy wygląd. Rozbudowa atmosfery pozostaje
następnym etapem planu oświetlenia.

## Generowanie terenu

Realistyczny teren podczas rozgrywki przygotowuje jeden modułowy worker.
W locie pozostają najwyżej dwa zadania wraz z gotowymi wynikami. Przesyła
bloki, nurt, tint i dane biomu; główny wątek przyjmuje wynik i aktualizuje
światło w budżecie ładowania. Oczekujące fragmenty pozostają w kolejce
zasięgu, żeby daleki teren nie odsłaniał dziury przed ukończeniem pracy.

Worker potwierdza gotowość dopiero po wczytaniu paczek modeli. Dopiero
wtedy dostaje inicjalizację i zadania; wiadomości nie giną podczas
asynchronicznych importów. Osobny limit czasu obejmuje jego uruchamianie.

Po szybkim przeniesieniu gracz czeka na rzeczywiste bloki pod sobą.
Nie wykonujemy wtedy zimnej generacji w klatce fizyki. Spóźniony wynik
nie zastępuje fragmentu, który już powstał lub został zmieniony.
Rozpoznawanie biomu pod graczem korzysta z danych chunka, więc osiągnięcia
nie uruchamiają ponownie kosztownego przygotowania sieci rzek.

Powiązane pamięci podręczne rzek są odnawiane razem pomiędzy zadaniami
workerów. Usuwanie pojedynczych współdzielonych tras mogłoby zmienić
połączenia rzek. Testy porównują bloki, nurt, tint i biomy dla kilku
seedów, kolejności generacji oraz odtworzenia zapisów.

Początkowe wczytywanie, jawne komendy i środowisko bez obsługi workera
zachowują ścieżkę synchroniczną. Brak odpowiedzi lub awaria workera
przywraca tę ścieżkę; świat pozostaje dostępny, lecz może wtedy przycinać.

## Geometria roślin

Niezmienne dane modeli są kompilowane do współdzielonych tablic.
Przebudowa chunka kopiuje je zbiorczo i wylicza lokalne położenie oraz
światło. Kolejność wierzchołków, grupy materiałów, dane animacji i kształt
modeli pozostają zgodne z dotychczasowym mesherem.

Małe partie rysowania cieni dziedziczą gotową obwiednię oryginalnej
geometrii. Sortowanie przez renderer nie skanuje już całego dużego
modelu osobno dla każdej partii. Zasięg i wygląd cieni pozostają takie same.

Nowe wzorce przygotowują się stopniowo przed przebudową. Do ukończenia
całej geometrii widoczny pozostaje poprzedni mesh, wraz z jego cieniem.
Pamięci wzorców mają limity; po usunięciu z cache model można odtworzyć
z takim samym wynikiem.

Nie jest to jeszcze podział chunka na mniejsze jednostki przebudowy ani
instancing wszystkich roślin. Ekstremalnie gęste ogrody nadal mogą
przekroczyć budżet pojedynczej klatki. Wyniki odbioru podają ten koszt.

## Zapis i pamięć

Duży autozapis (od 16 chunków) przekazuje migawkę danych do osobnego
workera. Pakowanie bloków i transakcja IndexedDB wykonują się tam;
potwierdzenie wraca dopiero po zakończeniu atomowej transakcji metadanych
świata i bloków. Osobne kopie bloków są przekazywane przez transfer,
bez odłączania tablic używanych przez grę. Koszt utworzenia tych kopii
nadal należy do głównego wątku.

Zamknięcie lub ukrycie strony uruchamia zapis bezpośrednio. Jeśli trwa
zapis w tle, worker zostaje zatrzymany, jego pakiet wraca do bieżących
zmian i komplet trafia do nowej transakcji. Starsza transakcja nie może
zostać uruchomiona później przez zatrzymany worker. Po powrocie do gry
worker może powstać ponownie. Błędy zachowują zmiany do ponowienia;
brak odpowiedzi przez 30 sekund kończy oczekiwanie błędem.

Odczyt zapisanych chunków pobiera partie po 64 rekordy w jednej transakcji,
bez dodatkowej tablicy wszystkich rekordów ani osobnego wywołania bazy
dla każdego chunka. Od 0.71.0 każda partia od razu trafia do
`SavedChunkStore`: bezstratnie spakowanych migawek i dokładnych podsumowań
powierzchni. Pełne tablice bloków są odtwarzane na żądanie, z limitem
pamięci podręcznej 8 MiB i 128 wpisów. Po przekazaniu bloków do świata lub
workera nie trzeba zachowywać drugiej rozpakowanej kopii w cache.

Indeks przestrzenny pozwala dalekiemu terenowi odwiedzać tylko potrzebne
podsumowania bez odtwarzania całego zapisu. Typ Uint8/Uint16, dane jaskiń,
wody i budowli oraz istniejący format dyskowy pozostają zachowane.
Rewizja migawki oddziela prawdziwą edycję od samego usunięcia tablicy z cache.
Ponowne odwiedzanie niezmienionych budowli nie pakuje ich ponownie przy
wyładowaniu. Autozapis używa dostępnego żywego chunka bez dekodowania
jego wcześniejszej migawki.

**Cały spakowany zapis nadal pozostaje w RAM.** To nie jest stronicowanie
z IndexedDB na żądanie ani stały limit pamięci całej gry. Nieskompresowalne
chunki zachowują surową kopię, a otwarcie dużego świata wykonuje dodatkową
pracę pakowania. Liczniki w diagnostyce podają osobno bajty migawek,
podsumowań i rozpakowanego cache; nie obejmują narzutu obiektów JS ani VRAM.
Metodyka, wyniki i ograniczenia: [pamięć i streaming 0.71.0](pomiary/pamiec-streaming-0.71.0/WYNIKI.md).

## Odbiór

Procedura i wyniki: [pomiary/wydajnosc-0.60.0/](pomiary/wydajnosc-0.60.0/).
Porównujemy tę samą trasę i ogrody przy niezmienionych ustawieniach obrazu.
Średni FPS jest uzupełniony o percentyle, długie klatki, czas CPU/GPU,
stan kolejek, dane zapisu oraz kontrolę wyglądu.
