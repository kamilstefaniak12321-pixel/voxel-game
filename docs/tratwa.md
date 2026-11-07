# Tratwa — 0.76.0

Prosty pokład dla jednego gracza: 2×1 bloki, grubość 3/16 bloku,
tekstura istniejących dębowych desek 16×16. Ten sam model jest widoczny
w świecie, dłoni i ekwipunku. Na razie wszystkie gatunki składników
dają ten sam dębowy wariant, bez wioseł, masztu i ładowni.

## Wytwarzanie i obsługa

Dwie dowolne deski **obok siebie w jednym rzędzie** siatki 2×2 dają
jedną tratwę. Można mieszać gatunki. Pionowy przepis na patyki pozostaje.

| Czynność | Komputer | Telefon |
|---|---|---|
| Postaw wybraną tratwę | PPM na tafli wody | Postaw / stuknięcie na tafli |
| Wsiądź | PPM na pokładzie | Postaw / stuknięcie na pokładzie |
| Płyń względem kierunku patrzenia | WASD | Joystick |
| Wysiądź obok pokładu | Shift | ▼ / W dół |
| Zabierz pustą tratwę | LPM | Kop |

W przygodzie udane postawienie zużywa jedną tratwę. Zebranie oddaje
jedną; przy pełnym ekwipunku pokład pozostaje w świecie. Kreatywny
nie zużywa przedmiotów. Brak miejsca, skała i ściana blokują interakcję.
Wsiadanie jest interakcją — samo wejście na pusty model nie daje podparcia.

## Ruch i zapis

Pokład utrzymuje się przy rzeczywistej, także pochyłej tafli. Nurt
korzysta z tego samego resolvera co pływanie gracza w 0.75.0; na pokładzie
nie działa równocześnie druga siła pływania. Sterowanie dodaje ruch
do nurtu, a puszczenie klawiszy pozwala swobodnie dryfować.

Pionowa struga nie podpiera tratwy. Po opuszczeniu progu działa grawitacja
i zachowany pęd; dolna tafla przywraca wyporność. Prostokątny obrys,
obrót i głowa pasażera mają kolizje z blokami. Wysiadanie sprawdza
miejsce i drogę obok pokładu. Teleport lub włączenie lotu odłącza gracza.
Tratwa stojąca na suchym gruncie nie jeździ jak samochód — można ją zabrać.

Pozycje, prędkości, obrót oraz zajęta tratwa zapisują się razem z graczem
i ekwipunkiem, także przy wyjściu. Starszy świat zaczyna z pustą listą.
To pierwszy wariant pojazdu: tratwy nie zderzają się wzajemnie podczas
ruchu; przy stawianiu blokowane jest nakładanie się pokładów.

## Koszt i sprawdzanie

- Do 32 tratw w zapisie, najwyżej 8 najbliższych w promieniu 48 bloków
  aktualizowanych i rysowanych; zajęta tratwa ma pierwszeństwo.
- Jedna wspólna geometria: 40 wierzchołków / 20 trójkątów na tratwę,
  istniejący atlas desek i shader oświetlenia modeli. Brak przebudowy
  chunków, nowej tekstury i generowania terenu przez tratwę.
- Maksymalnie 6 kroków fizyki po przerwie klatki; ruch dzielony na
  odcinki do 0,18 bloku. Brak załadowanych danych pod obrysem zatrzymuje
  ruch. Promień interakcji liczony tylko po kliknięciu.
- `node tools/sprawdz_tratwe.mjs`: przepisy wszystkich gatunków,
  geometria, 30/60/120 Hz, wodospady 1/8/16/32 bloki, prawdziwa rzeka
  seeda 42, brzeg, most, lądowanie, limit puli, zapis i zwalnianie zasobów.
- `node tools/sprawdz_tratwe_webgl.mjs`: rzeczywisty `Game.update`, PPM,
  LPM, sterowanie, wysiadanie, zapis pasażera, rzeka i renderowanie
  w Chrome/WebGL2. Wyniki i cztery ujęcia: artefakt CI `testy-gry/rafts`.

Pomiary skryptów opisują czas CPU badanej części. Programowy renderer
SwiftShader w CI nie jest pomiarem FPS na komputerze ani telefonie gracza.
