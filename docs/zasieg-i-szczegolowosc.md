# Stopniowa szczegółowość świata — 0.69.0

Zasięg widzenia określa odległość krajobrazu, a nie promień pełnych,
edytowalnych danych każdego bloku. W pobliżu pozostają oryginalne modele,
dalej zmniejsza się liczba ich części. Za strefą pełnych bloków obraz
przejmują zbiorcze modele powierzchni, drzew i roślinności.

## Strefy

| Odległość orientacyjna | Reprezentacja |
|---|---|
| Do 48–64 bloków | Wybrana przez gracza jakość roślin i liści |
| 48–112 bloków | Pośrednie modele roślin i cztery części bloku liści |
| 112–192 bloków | Proste modele roślin i jedna bryła bloku liści |
| 144–192 bloków | Nakładanie pełnego terenu i gotowych modeli oddali |
| Dalej, do około 800 bloków | Coraz większe komórki terenu, uproszczone sylwetki drzew i kępy roślin |
| Dalszy horyzont | Coraz większe fragmenty powierzchni i zbiorczy obraz lasów |

Progi nie są jedną twardą linią. Przy zmianach modeli występuje zapas
odległości: liście 16 bloków, rośliny 12 bloków. Zapobiega to ciągłym
przebudowom przy chodzeniu wzdłuż granicy strefy. Gotowa siatka zastępuje
poprzednią dopiero w całości; ruch lub zmiana bloku unieważnia nieaktualną
pracę. Bliski model nigdy nie ma większej jakości niż wybrana w ustawieniach.

Daleki zamiennik musi być gotowy, zanim zacznie znikać pełna geometria.
Maska chunków odróżnia brak pełnej siatki, pełną siatkę bez zamiennika oraz
pełną siatkę z gotowym pokryciem oddali. Dwa ostatnie stany umożliwiają
komplementarne, stopniowe przejście. Nowe kafelki horyzontu zastępują stare
przez krótkie przenikanie tylko tam, gdzie poprzedni zestaw pokrywa cały
ich obszar; nowo odsłonięte fragmenty są w pełni widoczne, zanim bliska
geometria zacznie oddawać im obraz.

## Dane świata

Przy zasięgu 800 pełne dane są wczytywane do około 192 bloków z zapasem
chunków wymaganym dla sąsiadów i zwalniania pamięci. Odległy świat jest
rysowany z tego samego generatora. Pozycje i gatunki drzew pochodzą z tych
samych reguł co rzeczywiste drzewa; do przygotowania sylwetki nie trzeba
budować wszystkich komórek jej korony. Drobna roślinność w oddali jest
przybliżeniem pokrycia terenu, a nie osobnym obiektem dla każdej trawki.

Kolizje, interakcje, wzrost, numery bloków i zapis pozostają właściwością
pełnego świata. Wizualne poziomy nie zapisują nic do chunków. Zmienione
przez gracza fragmenty są nadal uwzględniane przez daleki teren.

## Współdzielenie pracy oświetlenia

Promienie światła korzystają z głębi głównego obrazu, gdy renderer ma
odpowiedni cel z teksturą głębi. Efekt nie musi wówczas ponownie rysować
geometrii świata. Ścieżka bez takiego celu zachowuje osobny przebieg.
W głównym obrazie powierzchnia wody zatrzymuje promień powietrza; dawny
przebieg kończył go na dnie. Promienie pod wodą nadal są wyłączone.

Wielkości zależne tylko od mapy cienia są przygotowywane przy jej
aktualizacji. Obliczenia i próbki dające zerowy udział w ostatecznym
kolorze są pomijane. Nie zmienia to ustawionej palety ani jakości cieni.

Wyniki pomiaru, kadry i ograniczenia: [próba 0.69.0](pomiary/zasieg-0.69.0/WYNIKI.md).
