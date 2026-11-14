// ------------------------------------------------------------
// WEJŚCIE DO GRY (index.html wczytuje ten plik)
//
// Gra to kilkaset plików w src/. W wydanej aplikacji są one połączone
// w kilka paczek w pakiet/js/ (tools/pakiet.mjs) - start jest szybszy,
// bo aplikacja otwiera kilka plików zamiast kilkuset. Ten plik wybiera:
//
//   - aplikacja na komputer i na telefon z gotową paczką -> pakiet/js/start.js
//   - przeglądarka przy pracy nad grą, testy                -> src/start.js
//   - paczki nie da się wczytać (brak pliku, uszkodzona)    -> src/start.js
//
// Pliki src/ są w aplikacji zawsze - to zapas, gdyby paczka zawiodła.
// Ten plik niczego nie importuje na stałe: diagnostyka i gra muszą
// pochodzić z JEDNEGO miejsca (inaczej byłyby dwie kopie).
//
// Czy paczka jest:
//   komputer - desktop.bundle (desktop/main.js sprawdza plik),
//   telefon  - pole "pakiet" w wersja.json (tools/android-www.mjs),
//   przeglądarka - tylko na życzenie: adres z ?pakiet (do sprawdzania).
// ------------------------------------------------------------

const BUNDLE = '../pakiet/js/start.js';

async function bundled() {

    if (window.desktop) {
        return window.desktop.bundle === true;
    }

    if (window.Capacitor?.isNativePlatform?.()) {
        try {
            const response = await fetch(new URL('wersja.json', document.baseURI));
            return response.ok && (await response.json()).pakiet === true;
        }
        catch {
            return false;
        }
    }

    return new URLSearchParams(location.search).has('pakiet');

}

let loaded = false;

if (await bundled()) {

    try {
        await import(BUNDLE);
        loaded = true;
    }
    catch (error) {
        // Paczka nie wczytała się w ogóle (żaden jej plik się nie wykonał) -
        // gra rusza ze zwykłych plików. Ślad trafia do raportu diagnostycznego.
        console.warn('Paczka gry (pakiet/js) nie wczytała się - start z plików src/.', error);
        window.__pakietBlad = String(error?.message ?? error);
    }

}

window.__pakiet = loaded;

if (!loaded) {
    await import('./start.js');
}
