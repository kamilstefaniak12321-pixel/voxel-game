# Diagnostyka błędów i wydajności — 0.67.0

Gra prowadzi lokalny dziennik błędów i pomiarów. Raport łączy moment
problemu z ustawieniami, sprzętem, stanem świata i pracą CPU/GPU.
Nie wysyła danych automatycznie.

## Gdy pojawi się problem

1. Naciśnij **F8**, gdy zauważysz przycięcie lub inne nieprawidłowe
   zachowanie. Możesz też wpisać `/logi problem`.
2. Otwórz **Pauza → Diagnostyka i logi** albo wpisz `/logi`
   (alias `/diagnostyka`). Panel jest także w **Ustawienia → Gra**.
3. Rozwiń ostatni błąd lub spadek FPS. Panel pokazuje ostatnią próbkę,
   najdroższe zmierzone etapy CPU i dostępne wskazania GPU.
4. Wybierz **Zapisz raport**. W aplikacji Windows można zapisać JSON
   ze szczegółowymi danymi albo czytelne podsumowanie TXT. Przycisk
   **Folder logów** pokazuje automatyczny dziennik na dysku.
5. Jeśli pobieranie pliku w przeglądarce lub Android WebView jest
   niedostępne, **Pokaż treść** pozwala skopiować czytelny raport.

F8 zapisuje znacznik i ostatnie dostępne podsumowanie; pomiary z chwili
trwającej klatki pojawiają się po zakończeniu jej okresu pomiarowego.
Raport zawiera również wcześniejszą historię, więc nie trzeba trafić
w przycięcie co do milisekundy. Przy błędzie podczas uruchamiania
przycisk zapisania raportu jest dostępny na ekranie błędu startowego.

**Ustawienia → Gra → Logi wydajności** wyłącza zbieranie nowych
pomiarów CPU/GPU. Błędy, ostrzeżenia i znaczniki pozostają zapisywane.
Wyłączenie nie kasuje już zgromadzonej historii.

## Jak czytać wynik

**CPU** obejmuje wykonywanie kodu gry: fizykę, generowanie i odbiór
terenu, budowanie siatek, światło, rośliny, przygotowanie zapisu i
wysyłanie poleceń renderowania. Etapy są rozłączne: czas zagnieżdżonego
etapu odejmujemy od jego rodzica, aby nie liczyć tej samej pracy dwa razy.
Generacja wykonana w workerze ma osobne liczniki; czas oczekiwania na
workera nie jest przypisywany jako praca CPU głównej klatki.

Raport podaje zarówno najdroższe etapy całego zachowanego okresu, jak
i **ranking CPU w konkretnych wolnych klatkach**. Ten drugi obejmuje
najwyżej trzy najwolniejsze klatki każdego okresu i pięć najdroższych
etapów każdej z nich. Sumy tego rankingu nie oznaczają wszystkich
przycięć ani kosztu całej sesji.

**GPU** jest mierzone osobno, asynchronicznymi zapytaniami karty.
Wyniki mogą przyjść kilka klatek później; raport zachowuje ich zakres
czasu i opóźnienie. Wysoki koszt GPU jest wskazaniem dla okresu,
nie dowodem, że konkretna klatka zwolniła właśnie przez GPU. Gdy
rozszerzenie nie działa, widać brak pomiaru zamiast wartości udającej zero.

**P95 czasu klatki** oznacza, że 95% zmierzonych klatek mieściło się
w tym czasie. Przy celu 60 FPS budżet klatki wynosi około 16,67 ms.
Wysokie średnie FPS nie wykluczają pojedynczych przycięć.

Raport używa określeń „zmierzony koszt”, „próbki okresu” i „brak
wystarczającego wyjaśnienia”. Nie przypisuje bez dowodu przyczyny
sterownikowi, odśmiecaniu pamięci, temperaturze ani innemu procesowi.
Liczba rysowań i trójkątów jest kontekstem obciążenia, nie czasem GPU.

## Co zapisujemy

- Błędy JavaScript, nieobsłużone odrzucenia Promise, ostrzeżenia i błędy
  konsoli, utratę kontekstu WebGL oraz błędy ładowania i zapisu świata.
- Na Windows także błędy procesu aplikacji, zakończenie renderera/GPU
  i przekroczenie czasu zamykania, nawet gdy okno gry nie odpowiada.
- Wersję, czas, stan menu/gry, ustawienia, GPU, rozdzielczość, seed
  i współrzędne oraz ostatnie zdarzenia potrzebne do odtworzenia sytuacji.
- Podsumowania wydajności, kolejki terenu, liczniki generacji, światła,
  cieni, geometrii, tekstur i dostępnej pamięci sterty JavaScript.

Nie odczytujemy zawartości czatu, ekwipunku, zapisów bloków ani
zrzutów ekranu. Nazwa świata oraz zawartość skórki i paczki tekstur
nie trafiają do kontekstu. Filtry usuwają rozpoznane tokeny, hasła,
adresy e-mail, parametry URL i prywatne ścieżki; ze stosu błędu
zachowujemy nazwę pliku i numer linii.

## Limity i zachowanie zapisu

| Mechanizm | Limit / zachowanie |
| --- | --- |
| Historia w pamięci | 300 zdarzeń oraz 180 podsumowań, zwykle około 3 minut aktywnej gry |
| Powtórzenia | Ten sam błąd i ten sam początek stosu są grupowane przez 10 s; licznik wystąpień pozostaje widoczny |
| Zalew zdarzeń | Najwyżej 60 nowych zdarzeń na 10 s; pominięcia i powtórzenia mają jawne liczniki |
| Powiadomienia | Monotoniczny licznik błędów uwzględnia także powtórzenia i pominięcia; rotacja historii go nie cofa |
| Automatyczny zapis | Zwykle co 5 s; błąd przyspiesza próbę zapisu do około 100 ms |
| IPC | Do 32 rekordów i 96 KiB na pakiet; rekord dziennika desktop do 16 KiB |
| Windows | Obracany dziennik JSONL w `userData/logs`: maksymalnie 8 plików po 2 MiB, najwyżej 5 sesji |
| Przeglądarka / awaryjny zapis | Bieżąca i poprzednia sesja łącznie do 256 KiB w localStorage; najstarsze próbki są usuwane |
| Odczyt poprzedniej sesji desktop | Ograniczony końcowy fragment: do 256 rekordów / 256 KiB; ucięcie jest oznaczone |
| Błąd dysku lub limit miejsca | Raport pozostaje w pamięci; próba zapisu awaryjnego i informacja o stanie zapisu w panelu |
| Zamykanie | Opróżnienie kolejki renderera ma limit 3 s; całe zamykanie aplikacji nadal ma 8 s oraz do 500 ms na dziennik procesu |

Pomiary powstają mniej więcej co sekundę aktywnej gry. Pauza, menu,
ukryte okno i przerwy zegara dłuższe niż 10 s nie są interpretowane
jako zwykłe spadki FPS. Próg odniesienia to maksymalnie 60 FPS lub
niższy limit wybrany przez gracza. Automatyczny incydent powstaje przy
utrzymaniu mniej niż 90% tego celu (co najmniej 12 klatek próbki)
albo klatce dłuższej niż 50 ms lub dwa budżety klatki — wybieramy
większy z tych dwóch progów. Incydenty mają odstęp co najmniej 10 s.

GPU jest próbkowane co ósmą renderowaną klatkę, z maksymalnie czterema
oczekującymi zapytaniami. Kod nie czeka na kartę. Nieważne wyniki
(`disjoint`), utrata kontekstu i przeterminowanie zapytań są obsługiwane
jawnie. Nieprawidłowa próbka nie służy do rozpoznania przeciążenia.

Nagłe wyłączenie komputera lub zabicie procesu może usunąć ostatnią
niezapisaną partię. Niepotwierdzone zamknięcie poprzedniej sesji nie
jest samo w sobie dowodem awarii gry. Raport zaznacza tę niepewność.

## Sprawdzenia

Testy rdzenia: `node tools/sprawdz_logi.mjs`; przypisanie klatek,
etapy i zapytania GPU: `node tools/sprawdz_logi_wydajnosci.mjs`;
dziennik, IPC i eksport po restarcie: `node tools/sprawdz_logi_desktop.mjs`.
Próba WebGL: `node tools/sprawdz_logi_webgl.mjs`.
Są to sprawdzenia poprawności; rzeczywisty narzut wydajności wymaga
osobnego pomiaru w grze na docelowej karcie.
