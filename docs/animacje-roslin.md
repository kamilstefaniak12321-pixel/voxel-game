# Animacje krzaków i roślinności

Kierunek zatwierdzony przez Kamila 31 października 2026, na podstawie
jego modelu Blockbench „krzaczek borówki”. Pierwsze wdrożenie: borówka,
wersja 0.43.0. Stosować przy opracowywaniu kolejnych gatunków.

## Wygląd i zachowanie

- Pikselowe modele zachowują charakter bryłek 1/16 bloku i płaskich liści.
  Ruch może być płynny; nie musi przeskakiwać co piksel.
- Stawianie: krótki wzrost modelu i delikatne, wygasające odbicie liści.
  Podstawa pozostaje w ziemi; rdzeń krzaka nie podskakuje.
- Zbiór: owoce maleją wokół własnych środków. Nie wciągamy całej grupy
  do podstawy krzaka. Liście reagują niewielkim kołysaniem.
- Pełny ekwipunek: reakcja na dotyk i komunikat, owoce pozostają.
- Niszczenie: krótki zanik części, bez długiej pustej końcówki.
- Wzrost krzaka: płynna zmiana rozmiaru wokół podstawy, bez zmiany pozycji
  i losowego obrotu. Owoce pojawiają się łagodnie po rozwinięciu liści.
- Odrastanie: nowe owoce powiększają się w małych, przesuniętych w czasie
  grupach. Istniejące owoce nie znikają i nie zaczynają od zera.
- Neutralny początek i koniec, wygaszanie ruchu. Przy kolejnej akcji
  przejście zaczyna się od aktualnej pozy, zamiast przeskakiwać do początku.
- Spokojny wiatr działa niezależnie od krótkich reakcji na gracza.

## Reguły gry i wydajność

Stan świata zmienia się od razu po udanej akcji; animacja tylko przedstawia
wynik. Nie zmienia ilości plonu, czasu losowania wzrostu, kolizji ani
przedmiotów w ekwipunku. Zapis w trakcie animacji zawiera końcowy etap;
ponowne wczytanie pokazuje stabilną roślinę. Szybkie klikanie nie może
powielać plonu ani resetować reakcji na pełny ekwipunek w nieskończoność.

Nie twórz stale aktualizowanych obiektów/animatorów dla każdej dzikiej
rośliny. W borówce maksymalnie 12 pobliskich roślin (48 bloków) ma
tymczasowy stan animacji. Pozostałe od razu otrzymują prawidłowy etap.
Rośliny za limitem nadal rosną i dają plon; ograniczenie dotyczy tylko
przejścia, nie zasięgu widzenia roślinności.

Borówka pozostaje we wspólnej geometrii i materiale chunka. Zwykła przebudowa
po zmianie bloku przygotowuje model; potem zmieniają się tylko zakresy
wierzchołków aktywnych krzaków. Po zakończeniu zostaje końcowa poza,
bez dodatkowej przebudowy całego terenu. Złożone do zerowej powierzchni
ściany owoców usuwa następna zwykła przebudowa; nie ma już aktywnego
animatora ani pracy CPU dla tej rośliny. Te same pozycje obsługują
bliskie cienie. Zwykłe światło, mgła i wiatr pozostają wspólne ze światem.
Nie ma dodatkowego rysowania każdego krzaka. Wygenerowanie lub wczytanie
świata nie odtwarza zbiorowo animacji stawiania.

## Borówka 0.43.0

- Stawianie 0,60 s, odbicie zewnętrznych liści maksymalnie 1/16 bloku.
- Zbiór 0,64 s, owoce znikają w pierwszych 0,275 s.
- Brak miejsca 0,66 s; kolejne kliknięcia podczas reakcji jej nie restartują.
- Usunięcie 0,42 s (zamiast 1,125 s w dostarczonym pliku).
- Wzrost 1,80 s; krzak dorasta przez 1,15 s, nowe owoce narastają stopniowo.
- Identyfikatory 94–97, tempo biologicznego wzrostu, ilość owoców i zapisy
  są zgodne z wersją 0.42.0. Rośliny innych gatunków pozostają bez zmian.

Kod: `src/rendering/BlueberryAnimation.js` (krzywe i pozy),
`PlantAnimations.js` (przejścia), `ChunkMesher.js` (wspólna geometria).
Sprawdzenie: `node tools/sprawdz_animacje_roslin.mjs` oraz próba w grze.

## Rośliny z paczek (kępki i krzewy) 0.49.0

Ten sam kierunek dla wszystkich roślin z modelem z pikseli (`kepka` -
od kocanki po indygowiec i marzannę). Każdy etap ma inny model (inne
kostki), więc animacja rysuje model jednego etapu i zmienia go wokół
podstawy - roślina stoi zakorzeniona, a ugięcie rośnie z kwadratem
wysokości (pędy giną się, podstawa nie):

- Posadzenie 0,60 s: wyrasta z ok. 1/3 rozmiaru z lekkim przeskokiem
  (do ok. 106%) i wygasającym kołysaniem.
- Wzrost 1,20 s: nowy etap rośnie płynnie od wysokości poprzedniego
  (bez skoku), lekkie kołysanie.
- Zbiór 0,70 s: najpierw kwiaty (części w kolorach kwiatów, pąków
  i środka) maleją wokół własnych środków (0,24 s), potem widać etap po
  zbiorze - płynnie od wysokości poprzedniego, z lekkim ugięciem
  i kołysaniem. Zmiana modelu w połowie to jedna zwykła przebudowa
  chunka (jak przy zmianie bloku).
- Pełny ekwipunek 0,66 s: ugięcie i kołysanie, kwiaty zostają; kolejne
  kliknięcia nie restartują reakcji.
- Usunięcie 0,42 s: szybki zanik do podstawy (od obecnego rozmiaru, gdy
  roślina akurat rosła).
- Początek i koniec neutralne; koniec = model jak bez animacji.

Ten sam limit co borówka (12 roślin, 48 bloków, wspólny dla obu rodzin),
ta sama wspólna geometria chunka - bez dodatkowych obiektów i rysowania.
Dywany (barwinek), porosty i huby zależą od sąsiadów - bez animacji.

Kod: `src/rendering/TuftAnimation.js` (przejścia i pozy),
`PlantAnimations.js` (rodziny: borówka i paczki). Sprawdzenie:
`node tools/sprawdz_animacje_kepek.mjs`.
