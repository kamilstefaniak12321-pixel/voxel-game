# Atmosfera i końcowy obraz — 0.63.0

Kontynuacja planu światła E08 po podstawie 0.57.0 (E00–E04/E07),
odbiciach i materiałach 0.58.0 (E05/E06) oraz optymalizacjach 0.60.0.
Pakiet rozwija perspektywę powietrzną bez zmiany albedo, palety źródeł,
połysku, transmisji liści ani cieni.

## Wygląd i porównanie

**Obraz → Zaawansowane → Atmosfera**: Naturalna lub Poprzednia (0.62.0).
Odpowiada temu `/ustaw atmosfera natural` i `/ustaw atmosfera baseline`.
Porównanie zachowuje naturalną paletę, HDR, stałą ekspozycję i te same
materiały. Dawna paleta 0.56.1 nadal używa dawnej mgły. Wybór atmosfery
nie zmienia zapisów świata. Gra i żywe menu używają jednego właściciela
parametrów `AtmosphereState`.

Nowy wariant zostawia najbliższe powierzchnie czytelne i stopniowo
zmniejsza kontrast odległych obiektów. Gęstość zależy łagodnie od
wysokości słońca i ustawionego zachmurzenia. Nie jest to nowy system
losowania pogody, deszczu ani lokalnych chmur. Kolor pochodzi ze
wspólnej funkcji nieba, więc zachód może ocieplać jedną stronę horyzontu,
zachowując chłodniejszą barwę po przeciwnej stronie.

## Ilość powietrza i wnętrza

Gęstość jest stała poniżej poziomu morza + 40 bloków, a powyżej maleje
wykładniczo. Shader oblicza analityczną średnią na odcinku od kamery do
powierzchni. Uwzględnia oba końce: widok z góry na pobliski szczyt ma
mniej mgły niż widok z tej samej wysokości w głęboką dolinę. Poziomy
promień ma skończoną granicę bez dzielenia przez zero.

Dostęp do nieba przy kamerze i przy powierzchni ogranicza zewnętrzną
mgłę. Dwa osłonięte końce dają zero poświaty nieba; otwarta przestrzeń
za oknem nadal otrzymuje kolor atmosfery. To przybliżenie oparte na
istniejącym świetle voxelowym, nie śledzenie wszystkich przeszkód
wzdłuż promienia ani symulacja rozproszenia w oświetlonym dymie.
Próbka przy kamerze zachowuje dotychczasowe wygładzanie, z czasem
dojścia około sekundy. Po wejściu do wnętrza lub zamknięciu otworu
ograniczenie mgły ustala się łagodnie, zamiast przeskakiwać natychmiast.

Bloki, kępki i modele używają swoich lokalnych danych nieba. Daleki
teren reprezentuje otwartą powierzchnię i korzysta z tego samego wzoru
odległości oraz wysokości. Mgła pod wodą ma odrębny kolor i gęstość.
Przejście w kosmos łagodnie wraca do istniejącej atmosfery planety.
Drobne cząstki i sprite'y płomieni zachowują dotychczasową mgłę sceny;
nie otrzymują w tym etapie lokalnego ograniczenia z obu końców odcinka.

## Końcowy obraz i koszt

Pozostaje jedna ekspozycja odniesienia (1), neutralne mapowanie tonów
oraz jedno kodowanie sRGB w `WorldOutput`. Nie dokładamy globalnego
filtra barwnego do zatwierdzonej palety: emitery i materiały zachowują
swoje barwy. HUD i ikony są poza korekcją świata, a suwak Jasność
pozostaje jawną pomocą widoczności (0 w pomiarach).

Nowy efekt nie tworzy render targetów, map cieni, próbek tekstur ani
dodatkowych wywołań rysowania. Zmienia kilka uniformów i analityczny
wzór w istniejących shaderach. Niski profil jakości zachowuje te same
zasady; kolor nieba nadal może być liczony w wierzchołkach. Zmiana
samej atmosfery nie przebudowuje geometrii chunków.

Powtarzalne sceny, wyniki i ograniczenia odbioru są w
[pomiarach 0.63.0](pomiary/atmosfera-0.63.0/README.md).
