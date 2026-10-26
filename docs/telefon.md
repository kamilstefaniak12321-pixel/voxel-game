# Telefon i tablet - aplikacja na Androida i sterowanie dotykowe

Na telefonie i tablecie gra ma **sterowanie dotykowe**: joystick,
rozglądanie palcem i przyciski na ekranie. Można w nią grać na dwa
sposoby:

- **aplikacja na Androida** - instalowana jak każda inna, z ikonką na
  ekranie, działa bez internetu (niżej),
- **w przeglądarce telefonu** (Android i iPhone), bez instalacji - gra
  z komputera przez sieć Wi-Fi (dalej: *W przeglądarce telefonu*).

## Aplikacja na Androida

### Instalacja (dla gracza)

1. Na telefonie otwórz wydania:
   <https://github.com/kamilstefaniak12321-pixel/voxel-game-wydania/releases/latest>
   i pobierz **`Voxel-Game-<wersja>-android.apk`**.
2. Otwórz pobrany plik (z powiadomienia albo z folderu *Pobrane*).
3. Android zapyta, czy przeglądarka może instalować aplikacje -
   **zezwól** (*Ustawienia → Zezwalaj z tego źródła*), wróć i stuknij
   **Zainstaluj**.
4. Google Play Protect może ostrzec o *nieznanej aplikacji* (gra nie jest
   w sklepie Google Play) - **Więcej szczegółów → Zainstaluj mimo to**.
5. Na ekranie telefonu pojawia się ikonka **Voxel Game** (blok trawy).

Aplikacja uruchamia się zawsze poziomo, na cały ekran (pasek stanu
i przyciski nawigacji wysuwają się po przeciągnięciu palcem od
krawędzi), ekran nie gaśnie w trakcie gry, a przycisk **wstecz** robi
pauzę. Wyjście do innej aplikacji = pauza i zapis świata.

**Nowa wersja:** od wersji 0.19.0 aplikacja **aktualizuje się sama**
(niżej, *Aktualizacje*). Starszą (do 0.18.0) trzeba raz zaktualizować
ręcznie: pobierz nowy `.apk` z wydań i zainstaluj tak samo - instaluje
się na poprzedniej, **światy, ustawienia i osiągnięcia zostają**.
Wersja gry jest na ekranie tytułowym (lewy dolny róg) i pod
`/aktualizacja`.

### Aktualizacje

Jak w aplikacji na komputer: przy każdym uruchomieniu (i co 3 godziny)
gra sprawdza wydania na GitHubie i sama pobiera nową wersję w tle. Na
ekranie tytułowym, w lewym dolnym rogu, widać wersję i stan aktualizacji.
Są dwa rodzaje:

- **Nowa wersja gry** (zwykle - zmiany w samej grze): pobierają się tylko
  pliki gry (ok. 2 MB) i **włączają się przy następnym uruchomieniu**
  gry - albo od razu: *Uruchom ponownie teraz* (świat zapisuje się
  przedtem). Nic nie trzeba instalować ani zatwierdzać.
- **Nowa aplikacja** (rzadko - gdy zmieni się część na telefon: kod
  w `android/`, Capacitor): przez Wi-Fi pobiera się sama, na danych
  komórkowych - po stuknięciu *Pobierz* (ok. 6 MB). Potem *Zainstaluj* -
  Android zapyta o zgodę (po cichu instalować nie pozwala). Za pierwszym
  razem otworzą się ustawienia: **zezwól Voxel Game na instalowanie
  aplikacji**, wróć i stuknij *Zainstaluj* jeszcze raz. Światy zostają.

Gdy nowa wersja gry się nie uruchomi (np. błąd w niej), po dwóch
nieudanych uruchomieniach aplikacja sama wraca do wersji wbudowanej
i tej wersji już nie pobiera. Ręcznie: `/aktualizacja wroc`.

Bez internetu gra działa normalnie - sprawdzi wydania następnym razem.
Wersja testowa (*Voxel Game (test)*) się nie aktualizuje - nowe testowe
`.apk` są w Actions.

Komenda **`/aktualizacja`** - wersja i stan; `sprawdz` (sprawdź wydania
teraz), `pobierz` (nowa aplikacja na danych komórkowych), `instaluj`
(nowa wersja od razu), `wroc` (wersja wbudowana w aplikację).

**Zapisy:** światy są w danych aplikacji (osobno od przeglądarki
telefonu i od komputera). Odinstalowanie aplikacji je usuwa.

### Wersja testowa

Każdy pull request, który zmienia aplikację, buduje ją na próbę:
**Actions** → przebieg → *Artifacts* → `Voxel-Game-<wersja>-android...`
(plik zip z `.apk` w środku - na telefonie trzeba być zalogowanym na
GitHubie; plik jest tam przez 2 dni, `docs/aplikacja.md`). Bez klucza do podpisu (niżej) powstaje **Voxel Game (test)** -
osobna aplikacja z własnymi światami, którą można mieć obok prawdziwej.
Wersja testowa ma swój stały klucz w gicie (`android/app/klucz-testowy.keystore`,
celowo jawny - prawdziwej aplikacji nim się nie podpisze), więc kolejne
testowe `.apk` instalują się na poprzednich. (Tylko testowa z wersji
0.9.0 była podpisana innym kluczem - ją trzeba raz odinstalować.)

### Klucz do podpisu (raz, w ustawieniach repozytorium)

Android instaluje nową wersję na starej tylko wtedy, gdy obie są
podpisane **tym samym kluczem**. Klucz gry jest w dwóch sekretach
repozytorium `voxel-game` (*Settings → Secrets and variables → Actions →
New repository secret*):

| sekret | co to |
|---|---|
| `ANDROID_KEYSTORE` | plik klucza (`voxelgame.p12`) zapisany jako tekst base64 |
| `ANDROID_KEYSTORE_PASSWORD` | hasło do klucza |

Bez nich do wydań trafia tylko instalator dla Windowsa (w przebiegu
widać ostrzeżenie *Android*), a w *Artifacts* jest wersja testowa.
Po dodaniu sekretów do już wydanej wersji: **Actions** → *Aplikacje
(komputer i telefon)* → **Run workflow** - przebieg zbuduje podpisany
`.apk` i dołoży go do wydania (instalatora nie buduje drugi raz).
Odcisk klucza (SHA-256) widać w adnotacji *Aplikacja (release)*.

> **Kopia klucza jest ważniejsza niż wygląda.** Sekretów GitHuba nie da
> się odczytać - jeśli zginie też kopia zapasowa, nowej wersji nie da się
> zainstalować na starej: trzeba odinstalować grę (razem ze światami)
> i zainstalować od nowa. Klucz trzymaj prywatnie (nie do gita, nie do
> czatu) - kto go ma, może podpisać "aktualizację" gry.

Nowy klucz (gdyby był potrzebny), np. w terminalu z Javą:
`keytool -genkeypair -storetype PKCS12 -keystore voxelgame.p12 -alias voxelgame -keyalg RSA -keysize 4096 -validity 36500`,
potem base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("voxelgame.p12"))`).

### Jak powstaje (kod)

- **`android/`** - projekt aplikacji ([Capacitor](https://capacitorjs.com/)):
  okienko przeglądarki (WebView) z grą na cały ekran. W środku są te same
  pliki co w przeglądarce (`index.html`, `src/`, `assets/`, `lib/`) -
  kopiuje je `npm run android:sync` (`tools/android-www.mjs` + `npx cap
  sync android`), więc nic nie trzeba zmieniać w grze osobno dla telefonu.
- `android/app/src/main/java/pl/kamil/voxelgame/MainActivity.java` -
  pełny ekran, ekran nie gaśnie, "wstecz", pauza przy wyjściu
  (zdarzenie `apppause` w `main.js`).
- `android/app/src/main/AndroidManifest.xml` - zawsze poziomo, nazwa,
  ikonka; `android/app/build.gradle` - wersja (z `package.json`:
  `0.9.0` → versionCode 900), podpis, odmiana testowa.
- Ikonki i ekran startowy - `tools/android_ikony.py` (z `desktop/icon.png`;
  po zmianie ikonki: `python tools/android_ikony.py`).
- Budowanie: GitHub Actions, job **android** w
  `.github/workflows/aplikacja.yml` (po instalatorze dla Windowsa,
  ~5 minut). Nowa wersja w `package.json` → nowy `.apk` w wydaniu obok
  instalatora; wydanie bez `.apk` jest uzupełniane.
- W grze: `window.Capacitor` = aplikacja (`nativeApp` w `main.js`) - bez
  przycisku pełnego ekranu, osiągnięcie *Lokator z ikonką*.
- **Aktualizacje**:
  - `android/app/src/main/java/pl/kamil/voxelgame/AktualizacjePlugin.java` -
    wtyczka Capacitora *Aktualizacje*: sprawdza `android-latest.json`
    w najnowszym wydaniu, pobiera (z kontrolą rozmiaru i SHA-256)
    i rozpakowuje pliki gry do `files/gra/<wersja>/`, a Capacitor podaje
    grę z tego folderu zamiast z wbudowanych plików (to samo, czego
    używa przy aktualizacjach "na żywo" - `serverBasePath`); pobiera
    i otwiera instalację `.apk`; pilnuje, żeby zepsuta wersja nie
    zablokowała gry (próba, powrót). Zarejestrowana w `MainActivity`.
  - `src/app/AndroidUpdates.js` - kiedy co pobrać i co pokazać w menu
    (`Menu.setUpdateStatus`) i na czacie; `/aktualizacja`.
  - `tools/android-www.mjs` dokłada do plików gry `wersja.json`: wersję,
    repozytorium z wydaniami i **odcisk części na telefon** (Java,
    manifest, pliki Gradle, wersja Capacitora). Same pliki gry można
    podmienić tylko między wersjami o tym samym odcisku - inaczej
    potrzebna jest nowa aplikacja (gra sama to rozpoznaje).
    `node tools/android-www.mjs --odcisk` - odcisk teraz.
  - W wydaniu (GitHub Actions, job *android*): `Voxel-Game-<wersja>-android.apk`,
    `Voxel-Game-<wersja>-android-www.zip` (pliki gry z aplikacji)
    i `android-latest.json` (wersja, odcisk, nazwy, rozmiary, SHA-256 -
    jak `latest.yml` dla komputera).
  - Uprawnienia w manifeście: stan sieci (czy Wi-Fi) i instalowanie
    aplikacji (zgoda gracza i tak przy każdej instalacji).
- Samemu na komputerze (niekonieczne): Android Studio,
  `npm run android:sync`, potem `npx cap open android` i ▶.

## W przeglądarce telefonu

Telefon i komputer muszą być w **tej samej sieci Wi-Fi**.

1. Na komputerze, w folderze gry: `npx serve` (potrzebny Node.js).
2. W konsoli pojawią się dwa adresy - **Local** (dla komputera) i
   **Network**, np. `http://192.168.1.23:3000`.
3. Ten adres **Network** wpisz w przeglądarce na telefonie.
4. Windows może zapytać o zaporę (firewall) dla Node.js - zezwól
   w sieciach prywatnych. Bez tego telefon nie połączy się z komputerem.
5. Obróć telefon poziomo i stuknij przycisk **pełnego ekranu** (prawy
   górny róg w grze) - wtedy nie przeszkadza pasek adresu.

Sterowanie dotykowe włącza się samo: w aplikacji na Androida zawsze,
a w przeglądarce, gdy głównym "wskaźnikiem" jest palec. Niektóre
telefony (np. z rysikiem) i okienka przeglądarki w aplikacjach udają
komputer z myszą - wtedy sterowanie dotykowe włącza się przy pierwszym
dotknięciu ekranu palcem (a gra nie próbuje już przechwytywać myszy, co
na telefonie kończyło się napisem *Nie udało się przechwycić myszy*).
Można je wymusić adresem z dopiskiem `?dotyk`
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
| reszta ekranu - przytrzymaj palec | kop (jak trzymany LPM): w trybie przygody blok pęka i znika po czasie kopania, w kreatywnym - kolejne bloki co chwilę; przesunięcie palca (rozglądanie) przerywa kopanie |
| ▲ (duży, prawy dół) | skok; **2× szybko** - latanie (tryb kreatywny); trzymany w locie - w górę, w wodzie - płyń w górę |
| ▼ | trzymany: kucanie; w locie - w dół; w wodzie - nurkuj |
| kilof / kostka | kop (trzymany - kopie dalej) / postaw tam, gdzie celownik (środek ekranu) |
| pasek bloków | stuknięcie w miejsce - wybór |
| ☰ (lewy górny róg) | pauza (ustawienia, zapisz i wyjdź) |
| skrzynka, dymek | ekwipunek, czat (pisanie klawiaturą telefonu, Enter - wyślij) |
| księga, oko, mapa, ramka | osiągnięcia, widok (jak F5), mapa terenu, pełny ekran |
| ✕ | zamyka ekwipunek albo czat |
| przycisk "wstecz" telefonu | pauza (albo zamyka czat / ekwipunek) - nie wychodzi z gry |

Kop i postaw działają zawsze tam, gdzie jest celownik - jak na
komputerze. W ekwipunku (skrzynka) jest też **wytwarzanie**: stuknięcie
bierze i kładzie stos jak klik myszą, a najwygodniej przez księgę
przepisów (📖 *Przepisy*) - na telefonie otwiera się w miejscu
ekwipunku; stuknięcie w przepis układa składniki w siatce (kolejne -
następny komplet), a stuknięcie w wynik wkłada wyrób prosto do
ekwipunku. Wyjście do innej aplikacji albo zgaszenie ekranu to pauza
i zapis świata. Telefon trzymany pionowo: gra działa, ale pokazuje
podpowiedź, żeby go obrócić.

## Ustawienia na telefonie

Telefon ma słabszą kartę graficzną niż komputer (i baterię), więc gra
startuje na nim z innymi ustawieniami (tylko dopóki gracz sam ich nie
zmieni) - `TOUCH_SETTINGS` w `src/config.js`:

| ustawienie | telefon | komputer |
|---|---|---|
| zasięg widzenia | 32 | 48 |
| daleki teren | 1024 | 8192 |
| szczegóły dalekiego terenu | niskie | średnie |
| rozdzielczość | 80% | 100% |
| limit FPS | 60 | bez limitu |
| liście drzew | szybkie | ładne (z prześwitami) |
| cienie słońca, promienie światła | wyłączone | dalekie, włączone |
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
- Nowa aplikacja (`.apk`) instaluje się dopiero po zgodzie gracza -
  po cichu Android pozwala tylko sklepom (Google Play). Nowe wersje
  samej gry instalują się bez pytania.
- iPhone: tylko przeglądarka (aplikacja na iOS wymaga Maca i płatnego
  konta Apple).
- Gra w przeglądarce bez komputera: wystawienie jej w internecie (np.
  GitHub Pages) - wtedy wystarczyłby adres strony.
