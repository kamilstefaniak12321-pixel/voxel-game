# Telefon i tablet (sterowanie dotykowe) - wersja testowa

Gra działa też w przeglądarce na telefonie (Android - Chrome, Firefox,
Samsung Internet; iPhone - Safari) ze **sterowaniem dotykowym**: joystick,
rozglądanie palcem i przyciski na ekranie. To pierwsza, testowa wersja -
sprawdzamy, czy gra w ogóle się uruchamia, jak szybko działa i jak się
w nią gra palcami.

## Jak uruchomić na telefonie

Telefon i komputer muszą być w **tej samej sieci Wi-Fi**.

1. Na komputerze, w folderze gry: `npx serve` (potrzebny Node.js).
2. W konsoli pojawią się dwa adresy - **Local** (dla komputera) i
   **Network**, np. `http://192.168.1.23:3000`.
3. Ten adres **Network** wpisz w przeglądarce na telefonie.
4. Windows może zapytać o zaporę (firewall) dla Node.js - zezwól
   w sieciach prywatnych. Bez tego telefon nie połączy się z komputerem.
5. Obróć telefon poziomo i stuknij przycisk **pełnego ekranu** (prawy
   górny róg w grze) - wtedy nie przeszkadza pasek adresu.

Sterowanie dotykowe włącza się samo, gdy urządzenie ma ekran dotykowy
i nie ma myszy. Można je wymusić adresem z dopiskiem `?dotyk`
(np. `http://localhost:3000/index.html?dotyk` - na komputerze "palcem"
jest wtedy mysz, przydaje się do sprawdzania układu przycisków),
a wyłączyć - `?dotyk=0` (np. tablet z myszą). To samo z czatu:
**`/dotyk`** pokazuje, czy sterowanie dotykowe jest włączone, rozmiar
ekranu i ile pikseli gra rysuje, a `/dotyk wl` / `/dotyk wyl` zapisuje
świat i odświeża stronę z nim albo bez niego.

Światy na telefonie zapisują się w przeglądarce telefonu (osobno od
komputera), tak samo księga osiągnięć i ustawienia.

## Sterowanie

| Gdzie / co | Akcja |
|---|---|
| lewa część ekranu - przesuń palec | **joystick** (pojawia się pod palcem): chodzenie; do samego brzegu w przód - bieg |
| reszta ekranu - przesuń palec | rozglądanie się (czułość: *Ustawienia → Sterowanie → Czułość myszy*) |
| reszta ekranu - krótkie stuknięcie | postaw blok / zbierz owoce / posadź owoc (jak PPM) |
| reszta ekranu - przytrzymaj palec | kop (jak LPM) - trzymany niszczy kolejne bloki |
| ▲ (duży, prawy dół) | skok; **2× szybko** - latanie (tryb kreatywny); trzymany w locie - w górę, w wodzie - płyń w górę |
| ▼ | trzymany: kucanie; w locie - w dół; w wodzie - nurkuj |
| kilof / kostka | kop / postaw tam, gdzie celownik (środek ekranu) |
| pasek bloków | stuknięcie w miejsce - wybór |
| ☰ (lewy górny róg) | pauza (ustawienia, zapisz i wyjdź) |
| skrzynka, dymek | ekwipunek, czat (pisanie klawiaturą telefonu, Enter - wyślij) |
| księga, oko, mapa, ramka | osiągnięcia, widok (jak F5), mapa terenu, pełny ekran |
| ✕ | zamyka ekwipunek albo czat |
| przycisk "wstecz" telefonu | pauza (albo zamyka czat / ekwipunek) - nie wychodzi z gry |

Kop i postaw działają zawsze tam, gdzie jest celownik - jak na
komputerze. Wyjście do innej aplikacji albo zgaszenie ekranu to pauza
i zapis świata. Telefon trzymany pionowo: gra działa, ale pokazuje
podpowiedź, żeby go obrócić.

## Ustawienia na telefonie

Telefon ma słabszą kartę graficzną niż komputer (i baterię), więc gra
startuje na nim z innymi ustawieniami (tylko dopóki gracz sam ich nie
zmieni) - `TOUCH_SETTINGS` w `src/config.js`:

| ustawienie | telefon | komputer |
|---|---|---|
| zasięg widzenia | 32 | 48 |
| daleki teren | 512 | 1024 |
| rozdzielczość | 80% | 100% |
| limit FPS | 60 | bez limitu |
| informacje F3 | wyłączone | włączone |

Do tego obraz ma najwyżej 1.5 piksela na punkt ekranu
(`TOUCH_MAX_PIXEL_RATIO`) - telefony mają 2-3, ale różnicy prawie nie
widać, a karta graficzna rysuje 2-4 razy mniej pikseli. Gdy gra
chodzi wolno: *Ustawienia → Obraz → Tryb ziemniaka* albo adres
z `?ziemniak`. Licznik klatek: *Ustawienia → Inne → Licznik FPS*.

## Jak to działa (kod)

- `src/input/TouchControls.js` - przyciski i strefy dotyku. Gra nic nie
  wie o dotyku: ta klasa "udaje" klawiaturę i mysz w `InputManager`
  (joystick = klawisze W/A/S/D i R, rozglądanie = ruch myszy, stuknięcie
  = PPM, przytrzymanie = LPM, przyciski = Spacja, Shift, F5, 1-9). Każdy
  palec jest śledzony osobno (`pointerId`), więc można iść i rozglądać
  się naraz.
- `src/ui/touch.css` - wygląd i rozmieszczenie (rozmiary przycisków
  w zmiennych na górze: `--touch-button`, `--touch-jump`...).
- `src/main.js` - wykrycie (`touchMode`), gra bez przechwytywania myszy
  (`resume`), pauza (`pauseGame`), przycisk "wstecz" (`guardBackButton`),
  pełny ekran (`toggleFullscreen`).
- `index.html` - `<meta name="viewport">`: strona na cały ekran, bez
  powiększania palcami; przy otwartej klawiaturze strona się zmniejsza
  (czat zostaje widoczny).

Nowy przycisk = jedna linijka `this.button(...)` w konstruktorze
`TouchControls` (co ma "wcisnąć": klawisz, przycisk myszy albo funkcję
z `main.js`) i jego miejsce w `touch.css`.

## Co jeszcze nie działa / do zrobienia później

- **Ekwipunek** działa stuknięciami (stuknij blok - weź, stuknij miejsce -
  połóż), ale nie ma przeciągania ani "połowy stosu" (PPM).
- **Joystick** ma 8 kierunków (jak klawisze), nie płynny ruch.
- Brak "wybierz blok, na który patrzysz" (środkowy przycisk myszy).
- Prawdziwa aplikacja na Androida (plik .apk, ikonka na ekranie) - na
  razie gra działa tylko przez przeglądarkę i serwer na komputerze.
  Można by też wystawić ją w internecie (np. GitHub Pages) - wtedy
  wystarczyłby adres strony, bez komputera.
