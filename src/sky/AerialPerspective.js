import { SEA_LEVEL, FAR_HAZE_DISTANCE, FAR_HAZE_MAX } from '../config.js';

// E08: niedrogie przybliżenie perspektywy powietrznej. Kolor pochodzi
// z istniejącego nieba; ten moduł opisuje wyłącznie ilość powietrza.
// Nie modeluje pogody, wilgotności ani oświetlenia każdego punktu drogi.
export const AERIAL_GROUND = SEA_LEVEL + 40;
export const AERIAL_NEAR_START = 16;
export const AERIAL_NEAR_END = 48;
export const AERIAL_SKY_OPEN = 0.18;

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
};

// Płynny profil tej samej pory i zachmurzenia co paleta światła.
// Gęstość nie jest mocą źródła: nocny kolor nadal pochodzi z nieba.
export function sampleAerialProfile(sunHeight, { cloudCover = 0 } = {}) {
    const height = clamp(finite(sunHeight, -1), -1, 1);
    const clouds = clamp(finite(cloudCover, 0));
    const twilight = 1 - smooth(0.02, 0.35, Math.abs(height));
    return {
        density: (0.82 + 0.18 * twilight) * (1 + 0.25 * clouds),
        scaleHeight: 250 - 50 * Math.max(twilight, clouds)
    };
}

// Dokładna średnia wykładniczej gęstości wzdłuż odcinka. Sortowanie
// końców daje ten sam wynik przy patrzeniu w górę i w dół. Poziomy
// promień ma granicę bez dzielenia przez zero lub odejmowania bliskich
// liczb. Pod umowną wysokością warstwy gęstość jest stała, nie rośnie
// wykładniczo pod ziemią; osłonięcie ogranicza ją niezależnie.
export function meanAirDensity(cameraY, surfaceY, scaleHeight = 250) {
    const a = finite(cameraY, AERIAL_GROUND) - AERIAL_GROUND;
    const b = finite(surfaceY, AERIAL_GROUND) - AERIAL_GROUND;
    const h = Math.max(1, finite(scaleHeight, 250));
    const low = Math.min(a, b), high = Math.max(a, b);
    if (high <= 0) return 1;
    const span = high - low;
    if (low < 0) return clamp((-low - h * Math.expm1(-high / h)) / span);
    if (span < 0.001 * h) return Math.exp(-Math.max(0, (low + high) * 0.5) / h);
    return clamp(-h * Math.exp(-low / h) * Math.expm1(-span / h) / span);
}

// Dostęp w dwóch końcach odcinka to jawne przybliżenie, nie ray marching.
// Oba końce zamknięte => brak atmosfery nieba w pomieszczeniu. Otwarty
// punkt za oknem zachowuje swój kolor zamiast ciemnieć od pozycji kamery.
export function aerialSkyAccess(cameraSky, surfaceSky) {
    return smooth(0, AERIAL_SKY_OPEN,
        Math.max(clamp(finite(cameraSky, 0)), clamp(finite(surfaceSky, 0))));
}

// CPU-odniesienie do identycznego wzoru GLSL. Nie zastępuje pomiarów
// rzeczywistych pikseli ani kosztu renderowania.
export function sampleAerialHaze(offset, {
    cameraY = AERIAL_GROUND, cameraSky = 1, surfaceSky = 1,
    density = 1, scaleHeight = 250, hazeDistance = FAR_HAZE_DISTANCE,
    hazeMax = FAR_HAZE_MAX, farOuter = 1024, farEnabled = true, globe = 0
} = {}) {
    const x = finite(offset?.[0] ?? offset?.x, 0);
    const y = finite(offset?.[1] ?? offset?.y, 0);
    const z = finite(offset?.[2] ?? offset?.z, 0);
    const d = Math.hypot(x, y, z);
    const mean = meanAirDensity(cameraY, finite(cameraY, AERIAL_GROUND) + y, scaleHeight);
    const optical = d * smooth(AERIAL_NEAR_START, AERIAL_NEAR_END, d)
        * mean * Math.max(0, finite(density, 1)) / Math.max(1, finite(hazeDistance, FAR_HAZE_DISTANCE));
    let haze = clamp(finite(hazeMax, FAR_HAZE_MAX)) * (1 - Math.exp(-optical));
    if (farEnabled) {
        const outer = Math.max(1, finite(farOuter, 1024));
        const edge = smooth(outer * 0.8, outer, Math.hypot(x, z)) * (1 - clamp(finite(globe, 0))) * 0.45;
        haze += (1 - haze) * edge;
    }
    return clamp(haze * aerialSkyAccess(cameraSky, surfaceSky));
}
