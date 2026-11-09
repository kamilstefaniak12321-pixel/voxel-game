import * as THREE from 'three';
import { loadTextureRegion } from '../rendering/TextureSheets.js';

// ------------------------------------------------------------
// SKÓRKA GRACZA (tekstura modelu)
//
// Obrazek 64 x 64 w tym samym układzie co skórki z Minecrafta
// (głowa, tułów, ręce i nogi + druga, wierzchnia warstwa: czapka,
// kurtka, rękawy, nogawki) - opis i szablon: docs/gracz.md.
//
// Domyślna skórka pochodzi ze wspólnego arkusza gracza. Gracz może
// wczytać własną (Ustawienia -> Gracz albo /skorka plik) - zostaje
// zapamiętana w przeglądarce. Stary format 64 x 32 też działa (lewa
// ręka i noga są wtedy kopią prawych).
// ------------------------------------------------------------

const STORAGE_KEY = 'voxel-game-skin';

const DEFAULT_TEXTURE = 'assets/textures/player/skin.png';

const SIZE = 64;


const canvas = document.createElement('canvas');

canvas.width = SIZE;
canvas.height = SIZE;

const context = canvas.getContext('2d', { willReadFrequently: true });


// Wspólna tekstura modelu - po wczytaniu innej skórki zmienia się
// tylko obrazek, więc model nie musi nic przebudowywać.

export const skinTexture = new THREE.CanvasTexture(canvas);

skinTexture.magFilter = THREE.NearestFilter;
skinTexture.minFilter = THREE.NearestFilter;
skinTexture.generateMipmaps = false;
skinTexture.colorSpace = THREE.SRGBColorSpace;


// Czy gracz ma własną skórkę (zapisaną w przeglądarce).

export function hasCustomSkin() {

    try {
        return localStorage.getItem(STORAGE_KEY) !== null;
    }
    catch {
        return false;
    }

}


function loadImage(url) {

    return new Promise((resolve, reject) => {

        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Nie udało się wczytać obrazka skórki.'));

        image.src = url;

    });

}


// Rysuje obrazek skórki na płótnie tekstury. Zwraca false, gdy obrazek
// ma zły rozmiar.

function drawSkin(image) {

    const legacy = image.width === SIZE && image.height === SIZE / 2;

    if (image.width !== SIZE || (image.height !== SIZE && !legacy)) {
        return false;
    }


    context.clearRect(0, 0, SIZE, SIZE);

    context.drawImage(image, 0, 0);


    // Stary format (64 x 32): bez lewej ręki i nogi - kopiujemy prawe.

    if (legacy) {

        context.drawImage(canvas, 0, 16, 16, 16, 16, 48, 16, 16);
        context.drawImage(canvas, 40, 16, 16, 16, 32, 48, 16, 16);

    }


    skinTexture.needsUpdate = true;

    return true;

}


// Wczytuje skórkę: własną (jeśli jest i jest poprawna) albo domyślną.

export async function loadSkin() {

    let custom = null;

    try {
        custom = localStorage.getItem(STORAGE_KEY);
    }
    catch {
        custom = null;
    }


    if (custom) {

        try {

            if (drawSkin(await loadImage(custom))) {
                return 'custom';
            }

        }
        catch {
            // zła zapisana skórka - wracamy do domyślnej
        }

    }


    drawSkin(await loadTextureRegion(DEFAULT_TEXTURE));

    return 'default';

}


// Ustawia własną skórkę z pliku (File z <input type="file">).
// Zwraca komunikat dla gracza. Rzuca błąd przy złym pliku.

export async function setSkinFromFile(file) {

    const url = await new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));

        reader.readAsDataURL(file);

    });


    const image = await loadImage(url);

    if (!drawSkin(image)) {
        throw new Error(`Skórka musi mieć 64 x 64 (albo 64 x 32) piksele, a ma ${image.width} x ${image.height}.`);
    }


    try {
        localStorage.setItem(STORAGE_KEY, url);
    }
    catch {
        return 'Skórka wczytana, ale przeglądarka nie pozwala jej zapamiętać (po odświeżeniu wróci domyślna).';
    }

    return `Wczytano skórkę: ${file.name}.`;

}


// Okno wyboru pliku. onDone(komunikat, czyBłąd) po wyborze.

export function chooseSkinFile(onDone) {

    const input = document.createElement('input');

    input.type = 'file';
    input.accept = 'image/png';

    input.addEventListener('change', async () => {

        const file = input.files?.[0];

        if (!file) {
            return;
        }

        try {
            onDone?.(await setSkinFromFile(file), false);
        }
        catch (error) {
            onDone?.(error.message, true);
        }

    });

    input.click();

}


// Wraca do domyślnej skórki.

export async function resetSkin() {

    try {
        localStorage.removeItem(STORAGE_KEY);
    }
    catch {
        // nic - i tak wczytujemy domyślną
    }

    await loadSkin();

}


// Na starcie gry - od razu wczytujemy skórkę.

export const skinReady = loadSkin().catch(() => 'error');
