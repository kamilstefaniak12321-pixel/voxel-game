# Aplikacja na komputer (Windows)

Gra może działać jako zwykły program na Windowsie: instalator, skrót na
pulpicie, własne okno, praca bez internetu i **automatyczne
aktualizacje**. W środku to ta sama gra co w przeglądarce (te same pliki
`index.html`, `src/`, `assets/`, `lib/`) - opakowana w
[Electron](https://www.electronjs.org/) (okno z wbudowaną przeglądarką
Chromium).

## Dla gracza

**Instalacja:** z wydań
<https://github.com/kamilstefaniak12321-pixel/voxel-game-wydania/releases/latest>
pobierz `Voxel-Game-<wersja>-instalator.exe` i uruchom. Instalator
(po polsku) pyta, dla kogo zainstalować grę - wybierz **tylko dla
mnie** (wtedy nie trzeba uprawnień administratora, a aktualizacje
instalują się bez pytania) - i gdzie, a na koniec robi skrót na
pulpicie.

> Windows może pokazać **„System Windows ochronił ten komputer”** -
> aplikacja nie jest podpisana płatnym certyfikatem. Kliknij
> *Więcej informacji* → *Uruchom mimo to*. To samo może się zdarzyć
> przy pierwszym uruchomieniu po aktualizacji.

**Aktualizacje:** przy każdym starcie gra sprawdza, czy w wydaniach jest
nowsza wersja. Jeśli tak - pobiera ją w tle (postęp w lewym dolnym rogu
ekranu tytułowego). Gotowa aktualizacja instaluje się sama po zamknięciu
gry, a przycisk **Zainstaluj teraz** na ekranie tytułowym zamyka grę
(z zapisem świata), instaluje nową wersję i uruchamia ją od nowa.
Wersja gry jest w lewym dolnym rogu ekranu tytułowego. Z ustawieniem
**Aktualizacje automatyczne: Wył.** (Ustawienia → Inne) aplikacja tylko
sprawdza wydania i pokazuje nową wersję z przyciskiem **Pobierz**
(ustawienie zapamiętuje w `aktualizacje.json` w swoim folderze -
sprawdza wydania, zanim gra wystartuje).

**Zapisy:** światy i ustawienia są w folderze
`%APPDATA%\Voxel Game` (wpisz to w pasek adresu Eksploratora). Zostają
po aktualizacji i po odinstalowaniu gry. Są osobne od światów z gry
w przeglądarce. Przy zamykaniu okna gra najpierw zapisuje świat.

**Klawisze aplikacji:** **F11** - pełny ekran, **F12** - narzędzia
programisty (konsola błędów). Reszta klawiszy działa jak w przeglądarce
(F5 zmienia widok kamery, nie odświeża strony).

## Jak powstaje nowa wersja

Każdy pull request otrzymuje numer wersji w tytule i opisie oraz
przygotowanie wydania. Przykład: `0.23.1 — Poprawki światła i cieni`.
Szablon PR zawiera listę sprawdzeń, a zasady dla pracy nad projektem
są zapisane w [`AGENTS.md`](../AGENTS.md).

1. W `package.json` podnosi się `"version"` - np. `0.1.0` → `0.2.0`
   (większe zmiany: środkowa liczba, poprawki: ostatnia). Ten sam numer
   wpisuje się do głównego `version` i `packages[""].version`
   w `package-lock.json`. `CHANGELOG.md` dostaje sekcję z numerem wersji,
   numerem PR i zmianami względem ostatniego pobieralnego wydania.
   Numer sprawdza się względem `main`, otwartych PR-ów i wydań, żeby
   kolejne scalenia nie próbowały opublikować tego samego numeru.
   Android używa tej samej wersji i wylicza kod wersji automatycznie.
   W PR sprawdza się próbne kompilacje Windowsa i Androida.
2. Zmiana trafia do gałęzi `main` (scalony pull request).
3. GitHub Actions (`.github/workflows/aplikacja.yml`) widzi, że takiej
   wersji jeszcze nie ma w repozytorium z wydaniami, buduje instalator
   na Windowsie (electron-builder) i publikuje wydanie `v0.2.0` w
   `kamilstefaniak12321-pixel/voxel-game-wydania` (GitHub CLI) - z trzema
   plikami: `Voxel-Game-0.2.0-instalator.exe`, `...exe.blockmap`
   i `latest.yml` (5-10 minut - widać to w zakładce **Actions**).
4. Na koniec przebieg sam sprawdza wydanie z zewnątrz: listę plików
   i czy instalator da się pobrać bez logowania. Wynik jest w adnotacji
   **Wydanie** na stronie przebiegu (np. *Pobieranie ... HTTP 206* =
   działa).
5. Zainstalowane gry same pobierają nową wersję przy następnym starcie.
6. Potem (job *android*, z kluczem do podpisu) do tego samego wydania
   trafia aplikacja na telefon: `Voxel-Game-0.2.0-android.apk`, paczka
   plików gry `...-android-www.zip` i `android-latest.json` - z niego
   zainstalowane aplikacje na telefonie wiedzą o nowej wersji
   (`docs/telefon.md`, *Aktualizacje*).

Scalenie bez zmiany wersji niczego nie wydaje - chyba że wydaniu tej
wersji brakuje któregoś z trzech plików: wtedy instalator jest budowany
od nowa i dosyłany. Wydanie można też uruchomić ręcznie: **Actions** →
*Aplikacje (komputer i telefon)* → **Run workflow**.

Ten sam przebieg buduje też **aplikację na Androida** (`.apk`) i dokłada
ją do wydania - `docs/telefon.md`.

### Gdy wydanie się nie uda

Błąd widać od razu na stronie przebiegu w **Actions** (czerwone
adnotacje z ostatnimi liniami błędu):

- **WYDANIA_TOKEN ... HTTP 401** - token wygasł albo został usunięty:
  zrób nowy (punkt 2 niżej) i podmień sekret (punkt 3).
- **Wydanie ... 403 / Resource not accessible** - token nie ma prawa
  zapisu: przy tokenie ma być *Contents: Read and write* dla
  `voxel-game-wydania`.
- inny błąd wysyłania - zwykle wystarczy **Run workflow** jeszcze raz:
  przebieg dośle brakujące pliki do istniejącego wydania.

Pull request, który zmienia aplikację (`desktop/`, `package.json`),
buduje instalator na próbę - bez wydania. Ten instalator można pobrać
z przebiegu w zakładce **Actions** (sekcja *Artifacts*, plik zip) przez
**2 dni**. Dłużej nie: repozytorium gry jest prywatne, a darmowy plan
GitHuba ma tylko 0,5 GB miejsca na takie pliki na miesiąc (liczone za
każdą godzinę, w której leżą). Gdy miejsca zabraknie, GitHub przysyła
maila *GitHub Actions Usage*, a pliki próbne przestają się zapisywać
do początku następnego miesiąca - budowanie i wydania działają dalej.

> Kod gry jest w prywatnym repozytorium `voxel-game`, a do publicznego
> `voxel-game-wydania` trafiają tylko gotowe instalatory - zainstalowana
> gra musi móc je pobrać bez logowania.

## Jednorazowa konfiguracja (Kamil)

Raz trzeba założyć repozytorium na wydania i dać GitHub Actions prawo do
publikowania w nim.

1. **Repozytorium na wydania** - na GitHubie *New repository*:
   - Owner: `kamilstefaniak12321-pixel`, nazwa: **`voxel-game-wydania`**,
   - **Public**,
   - zaznacz **Add a README file** (repozytorium nie może być puste),
   - *Create repository*.
2. **Token** - zdjęcie profilu → *Settings* → *Developer settings* →
   *Personal access tokens* → **Fine-grained tokens** →
   *Generate new token*:
   - Token name: `voxel-game-wydania`,
   - Expiration: najdłuższy możliwy (po wygaśnięciu trzeba zrobić nowy
     i podmienić sekret z punktu 3),
   - Repository access: **Only select repositories** →
     `voxel-game-wydania`,
   - Permissions → Repository permissions → **Contents: Read and write**,
   - *Generate token* i skopiuj token (widać go tylko raz).
3. **Sekret** - w repozytorium `voxel-game`: *Settings* → *Secrets and
   variables* → *Actions* → **New repository secret**:
   - Name: **`WYDANIA_TOKEN`**,
   - Secret: wklej token → *Add secret*.
4. **Pierwsze wydanie** - *Actions* → *Aplikacja na komputer* →
   **Run workflow** (gałąź `main`). Po kilku minutach w
   `voxel-game-wydania` → *Releases* jest wydanie `v0.1.0`
   z instalatorem.

Minuty GitHub Actions: w prywatnym repozytorium darmowy plan ma limit
minut na miesiąc, a minuty na Windowsie liczą się podwójnie. Jedno
zbudowanie to kilka minut, a przy scaleniu bez zmiany wersji działa
tylko krótkie sprawdzenie na Linuksie.

## Uruchamianie ze źródeł (dla programisty)

Potrzebny [Node.js](https://nodejs.org/) (22 albo nowszy). W folderze gry:

```
npm install        biblioteki (Electron, electron-builder, electron-updater)
npm start          gra w oknie aplikacji, prosto z plików w folderze
npm run dist       instalator do folderu dist/ (bez wydania)
```

Uruchomiona ze źródeł gra nie sprawdza aktualizacji. Korzysta z tych
samych zapisów co zainstalowana (`%APPDATA%\Voxel Game`), więc nie da
się uruchomić obu naraz.

## Jak to działa (pliki)

- `package.json` - wersja aplikacji, biblioteki i ustawienia instalatora
  (`build`: nazwa, ikonka, instalator NSIS po polsku, `publish` - gdzie
  są wydania).
- `desktop/main.js` - okno gry. Pliki gry są podawane pod adresem
  `gra://voxel-game/` (dla gry to zwykła strona - działają moduły,
  IndexedDB i localStorage). Zamykanie okna z zapisem świata, F11/F12,
  jedna kopia gry naraz, aktualizacje (electron-updater).
- `desktop/preload.js` - most do gry: obiekt `window.desktop`
  (wersja, zapis przed zamknięciem, stan aktualizacji). W przeglądarce go
  nie ma i gra działa po staremu.
- `desktop/icon.png` - ikonka (256 x 256, z tekstur trawy).
- `src/main.js` (koniec pliku) i `src/ui/Menu.js` (`appInfoElement`) -
  wersja i aktualizacje na ekranie tytułowym.
- `.github/workflows/aplikacja.yml` - budowanie i wydawanie.
