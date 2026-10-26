// ------------------------------------------------------------
// PACZKA TEKSTUR - wczytanie, rozdzielczość, usunięcie
//
// Wspólne dla zakładki Ustawienia -> Tekstury (Menu.js) i komendy
// /tekstury. Same tekstury (zip, skalowanie, zapis) - TexturePacks.js,
// atlas w grze - TextureAtlas.js. Każda zmiana działa po ponownym
// uruchomieniu gry: reload() (main.js) zapisuje świat i wczytuje grę
// od nowa.
// ------------------------------------------------------------

import {
    ATLAS_TILES,
    ATLAS_ROWS,
    atlasReady,
    atlasTileSize
} from '../rendering/TextureAtlas.js';

import {
    RESOLUTIONS,
    importTexturePack,
    getPackInfo,
    loadPackTiles,
    removeTexturePack,
    gameResolution,
    maxResolution,
    reducedResolution,
    templateUrl
} from '../rendering/TexturePacks.js';


// Ile czekamy z ponownym uruchomieniem, żeby dało się przeczytać wynik.
const RELOAD_DELAY_MS = 1500;


// Rozdzielczości do wyboru na tym urządzeniu (0 = automatyczna).

export function resolutionChoices() {

    const max = maxResolution(ATLAS_ROWS);

    return [0, ...RESOLUTIONS.filter((size) => size <= max)];

}


// Wybór pliku .zip i wczytanie paczki. onStatus(tekst, błąd?) - postęp
// i wynik; reload() - ponowne uruchomienie gry (po sukcesie).

export function chooseTexturePack(settings, onStatus, reload) {

    const input = document.createElement('input');

    input.type = 'file';

    // Na telefonie (aplikacja) bez filtra - niektóre telefony nie
    // rozpoznają .zip jako zip i nie dałoby się go wybrać.

    if (!window.Capacitor?.isNativePlatform?.()) {
        input.accept = '.zip,application/zip,application/x-zip-compressed';
    }

    input.addEventListener('change', () => {

        const file = input.files?.[0];

        if (file) {
            loadTexturePackFile(file, settings, onStatus, reload);
        }

    });

    input.click();

}


export async function loadTexturePackFile(file, settings, onStatus, reload) {

    try {

        onStatus(`Wczytuję paczkę ${file.name}...`);

        reducedResolution(true);

        const pack = await importTexturePack(file, Object.keys(ATLAS_TILES), (done, total) => {
            onStatus(`Wczytuję paczkę ${file.name}... ${done} / ${total} plików`);
        });

        const size = gameResolution(pack.source, settings.get('textureResolution'), ATLAS_ROWS);

        await loadPackTiles(size, (done, total) => {
            onStatus(`Skaluję tekstury do ${size} x ${size}... ${done} / ${total}`);
        });

        const tiles = Object.keys(pack.files).length;

        onStatus(
            `Paczka "${pack.name}": ${tiles} tekstur ${pack.source} x ${pack.source} - w grze ${size} x ${size}` +
            `${pack.unknown.length ? ` (pominięte pliki: ${pack.unknown.length})` : ''}. Uruchamiam grę ponownie...`
        );

        setTimeout(reload, RELOAD_DELAY_MS);

    }
    catch (error) {

        console.warn('Paczka tekstur:', error);

        onStatus(`Nie udało się wczytać paczki: ${error.message}`, true);

    }

}


// Nowa rozdzielczość (0 = automatyczna). Z paczką - przeskalowanie
// i ponowne uruchomienie; bez paczki - tylko zapis (na później).

export async function setTextureResolution(settings, value, onStatus, reload) {

    settings.set('textureResolution', value);

    const reduced = reducedResolution(true);

    const info = await getPackInfo();

    if (!info) {

        onStatus(`Rozdzielczość tekstur: ${resolutionName(value)} - zadziała z paczką tekstur.`);

        return false;

    }

    const size = gameResolution(info.source, value, ATLAS_ROWS);

    if (size === atlasTileSize && !reduced) {

        onStatus(`Tekstury już są ${size} x ${size}.`);

        return false;

    }

    try {

        await loadPackTiles(size, (done, total) => {
            onStatus(`Skaluję tekstury do ${size} x ${size}... ${done} / ${total}`);
        });

        onStatus(`Tekstury ${size} x ${size}. Uruchamiam grę ponownie...`);

        setTimeout(reload, RELOAD_DELAY_MS);

        return true;

    }
    catch (error) {

        onStatus(`Nie udało się przeskalować tekstur: ${error.message}`, true);

        return false;

    }

}


export async function resetTexturePack(onStatus, reload) {

    if (!(await getPackInfo())) {

        onStatus('Gra już ma oryginalne tekstury.');

        return false;

    }

    await removeTexturePack();

    reducedResolution(true);

    onStatus('Wracam do oryginalnych tekstur. Uruchamiam grę ponownie...');

    setTimeout(reload, RELOAD_DELAY_MS);

    return true;

}


// Szablon paczki (najnowsze wydanie) - w przeglądarce telefonu albo
// komputera (aplikacja na telefon otwiera zewnętrzne adresy
// w przeglądarce sama).

export function openTemplate() {

    const url = templateUrl();

    if (window.Capacitor?.isNativePlatform?.()) {
        location.href = url;
    }
    else {
        window.open(url, '_blank', 'noopener');
    }

    return url;

}


export function resolutionName(value) {
    return value > 0 ? `${value} x ${value}` : 'automatyczna';
}


// Opis stanu: paczka, rozdzielczość w grze, ile tekstur.

export async function describeTextures(settings) {

    const [info, atlas] = await Promise.all([getPackInfo(), atlasReady.catch(() => null)]);

    const setting = settings.get('textureResolution');

    const inGame = atlas?.tileSize ?? 16;

    if (!info) {
        return `Tekstury oryginalne (16 x 16). Rozdzielczość dla paczek: ${resolutionName(setting)}, najwyżej ${maxResolution(ATLAS_ROWS)} x ${maxResolution(ATLAS_ROWS)} na tym urządzeniu.`;
    }

    const author = info.author ? ` (${info.author})` : '';

    const reduced = reducedResolution();

    const warning = reduced
        ? ` Uwaga: gra nie uruchomiła się z teksturami ${reduced.failed} x ${reduced.failed} (za mało pamięci?) - działa z ${reduced.used ? `${reduced.used} x ${reduced.used}` : 'oryginalnymi'}.`
        : '';

    const loaded = atlas?.pack?.stamp === info.stamp;

    return `Paczka "${info.name}"${author}: ${info.tiles} z ${Object.keys(ATLAS_TILES).length} tekstur, ${info.source} x ${info.source}` +
        `${info.extras.length ? ` + ${info.extras.map((name) => name === 'cracks' ? 'pęknięcia' : 'księżyc').join(', ')}` : ''}. ` +
        (loaded
            ? `W grze ${inGame} x ${inGame} (rozdzielczość: ${resolutionName(setting)}).`
            : reduced && !reduced.used ? 'W grze - oryginalne tekstury.' : 'Zadziała po ponownym uruchomieniu gry.') +
        warning;

}
