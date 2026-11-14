// ------------------------------------------------------------
// DANE ROŚLIN I MODELI Z JEDNEGO PLIKU (1.1.4)
//
// Opisy roślin (assets/rosliny/*/roslina.json) i ich modeli
// (assets/models/rosliny/*/model.json) to ok. 80 małych plików. Gra
// i każdy z wątków w tle pobierały je pojedynczo przy każdym starcie.
// W zbudowanej aplikacji tools/pakiet.mjs zbiera je w jeden plik
// pakiet/dane.json - te same teksty, bajt w bajt - i tutaj są z niego
// podawane.
//
// bundledText('assets/rosliny/len/roslina.json') zwraca tekst pliku
// albo null: przy pracy nad grą, w testach, gdy pliku zbiorczego nie ma,
// gdy pochodzi z innej wersji gry albo nie zawiera tego pliku. null
// znaczy: wczytaj plik zwyczajnie (plantPacks.js, plantModels.js).
// ------------------------------------------------------------
import { BUILD_ID } from '../storage/StartCache.js';

let loading = null;

function load() {

    loading ??= !BUILD_ID || typeof fetch !== 'function'
        ? Promise.resolve(null)
        // Adres jak przy obrazkach: dwa foldery w górę od pliku - działa
        // z src/blocks/ i z pakiet/js/.
        : fetch(new URL('../../pakiet/dane.json', import.meta.url))
            .then((response) => (response.ok ? response.json() : null))
            // Plik z innego budowania niż kod (np. po przerwanej
            // aktualizacji) pomijamy - zwykłe pliki są zawsze aktualne.
            .then((data) => (data && data.build === BUILD_ID && data.files && typeof data.files === 'object' ? data.files : null))
            .catch(() => null);

    return loading;

}

export async function bundledText(path) {

    const files = await load();

    return files && typeof files[path] === 'string' ? files[path] : null;

}
