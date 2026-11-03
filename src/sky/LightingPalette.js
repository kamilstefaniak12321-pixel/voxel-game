// Palety v1 z planu oświetlenia (03.11.2026). HEX to próbki sRGB,
// a moce są osobnymi, względnymi jednostkami energii. Nie są luksami.
// Moduł nie zna materiałów, kamery ani chunków: zmiana doby/chmur
// aktualizuje kilka źródeł, nigdy geometrię albo albedo świata.
import { sampleSolarDisc } from './SolarDisc.js';
import { relativeAirMass } from './SolarAtmosphere.js';
import { MOON_DIAMETER } from '../config.js';

export const LIGHTING_PALETTE_VERSION = 1;

export const LIGHTING_PRESETS = Object.freeze(Object.fromEntries(Object.entries({
    noon: {
        altitude: 35, sun: '#FFF4E0', sky: '#B9D2F0', ground: '#86745E',
        sunPower: 2.4, skyPower: 0.75, groundPower: 1.0,
        zenith: '#72A4CE', horizon: '#C6D4DC', glow: 0
    },
    golden: {
        altitude: 10, sun: '#FFE2A6', sky: '#8EAFCE', ground: '#9B7B54',
        sunPower: 1.7, skyPower: 0.75, groundPower: 0.75,
        zenith: '#668FB7', horizon: '#C1C0B1', glow: 0.4
    },
    sunset: {
        altitude: 0, sun: '#FFB66E', sky: '#7D92B5', ground: '#846451',
        sunPower: 0.8, skyPower: 0.6, groundPower: 0.6,
        zenith: '#465F85', horizon: '#BC9E91', glow: 0.85
    },
    overcast: {
        sun: '#EEF1F2', sky: '#CBD5DB', ground: '#857F6E',
        // Mnożniki względem bieżącej pory, nie drugie źródło światła.
        sunTransmission: 0.04, skyPowerScale: 1.15,
        zenith: '#929FA6', horizon: '#C5CDD0'
    },
    blueHour: {
        altitude: -6, sun: null, sky: '#697FAD', ground: '#565966',
        sunPower: 0, skyPower: 0.4, groundPower: 0.2,
        zenith: '#253653', horizon: '#62708D', glow: 0.35
    },
    moonlit: {
        altitude: -18, sun: null, moon: '#C1CEDF', sky: '#38465D', ground: '#34383A',
        sunPower: 0, skyPower: 0.25, groundPower: 0.13,
        moonPower: 0.24, moonSkyPower: 0.035,
        zenith: '#02050B', horizon: '#070D18', glow: 0
    }
}).map(([name, preset]) => [name, Object.freeze(preset)])));

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((value, i) => lerp(value, b[i], t));
const scale = (rgb, power) => rgb.map(value => value * power);
const add = (a, b) => a.map((value, i) => value + b[i]);
const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;

// Dokładna krzywa sRGB, tylko przy ładowaniu danych. Interpolacja
// palet i sumowanie źródeł odbywa się już w przestrzeni liniowej.
function decodeHex(hex) {
    return [1, 3, 5].map(offset => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
}

const COLORS = Object.fromEntries(Object.entries(LIGHTING_PRESETS).map(([name, preset]) => [
    name, Object.fromEntries(['sun', 'sky', 'ground', 'moon', 'zenith', 'horizon']
        .filter(key => preset[key]).map(key => [key, decodeHex(preset[key])]))
]));
const DAY_KEYS = ['moonlit', 'blueHour', 'sunset', 'golden', 'noon'];

function sampleDay(altitude) {
    let index = 0;
    while (index < DAY_KEYS.length - 2 && altitude >= LIGHTING_PRESETS[DAY_KEYS[index + 1]].altitude) index++;
    const aKey = DAY_KEYS[index], bKey = DAY_KEYS[index + 1];
    const a = LIGHTING_PRESETS[aKey], b = LIGHTING_PRESETS[bKey];
    const t = smooth(a.altitude, b.altitude, altitude);
    const color = field => mix(COLORS[aKey][field], COLORS[bKey][field], t);
    return {
        // Pod horyzontem zachowujemy odcień ostatniej tarczy, ale jej
        // energia znika według widocznego wycinka SolarDisc.
        sun: mix(COLORS[aKey].sun ?? COLORS.sunset.sun, COLORS[bKey].sun ?? COLORS.sunset.sun, t),
        sky: color('sky'), ground: color('ground'), zenith: color('zenith'), horizon: color('horizon'),
        sunPower: lerp(a.sunPower, b.sunPower, t),
        skyPower: lerp(a.skyPower, b.skyPower, t),
        groundPower: lerp(a.groundPower, b.groundPower, t),
        glow: lerp(a.glow, b.glow, t)
    };
}

/**
 * Wspólny stan naturalnego oświetlenia. Kierunki pozostają w Celestial.
 * cloudCover 0..1 to jednolity profil zachmurzenia, bez losowania pogody.
 * RGB wyjściowe zawiera już moc źródeł; nie dekodować ich ponownie.
 * Lokalny skyAccess/AO i widoczność słońca nakładają dopiero materiały.
 */
export function sampleLightingPalette(sunHeight, {
    cloudCover = 0, eclipse = 0, moonHeight = -1, moonIllumination = 0, moonTint = null
} = {}) {
    const height = clamp(finite(sunHeight, -1), -1, 1);
    const altitude = Math.asin(height) * 180 / Math.PI;
    const clouds = clamp(finite(cloudCover, 0));
    const covered = clamp(finite(eclipse, 0));
    const moonY = clamp(finite(moonHeight, -1), -1, 1);
    const moonPhase = clamp(finite(moonIllumination, 0));
    const disc = sampleSolarDisc(height);
    const day = sampleDay(altitude);
    const night = 1 - smooth(-12, 2, altitude);
    const cloudTransmission = 1 - (1 - LIGHTING_PRESETS.overcast.sunTransmission) * clouds * clouds;
    const skyEclipse = 1 - 0.9 * covered ** 1.8;
    const cloudSky = clouds * (1 - 0.6 * night);

    const sunColor = mix(day.sun, COLORS.overcast.sun, clouds);
    const direct = scale(sunColor, day.sunPower * disc.visibility * (1 - covered) * cloudTransmission);

    // Pochmurne niebo jest mniej niebieskie. W dzień część energii
    // przechodzi w rozproszenie, nocą chmury zasłaniają słabe tło.
    const skyColor = mix(day.sky, COLORS.overcast.sky, cloudSky);
    const groundColor = mix(day.ground, COLORS.overcast.ground, cloudSky);
    // Zmiana odcienia nie może przypadkiem rozjaśnić nocnego nieba:
    // jego energią steruje moc, a nie jasność szarej próbki HEX.
    const skyHueScale = luminance(day.sky) / Math.max(luminance(skyColor), 1e-8);
    const groundHueScale = luminance(day.ground) / Math.max(luminance(groundColor), 1e-8);
    const skyPower = day.skyPower * skyHueScale * lerp(1, LIGHTING_PRESETS.overcast.skyPowerScale, clouds * (1 - night))
        * (1 - 0.7 * clouds * night) * skyEclipse;
    const groundPower = day.groundPower * groundHueScale * (1 - 0.5 * clouds * night) * skyEclipse;

    // Księżyc ma własną fazę, wysokość i zasłonięcie. Nie jest
    // mnożnikiem całego obrazu; ognisko i emisja zachowują swój kolor.
    const moonDisc = sampleSolarDisc(moonY, MOON_DIAMETER);
    const moonVisibility = moonDisc.visibility * (0.25 + 0.75 * smooth(0, 0.4, moonY));
    const moonAmount = moonPhase * moonVisibility * night * cloudTransmission;
    let moonColor = COLORS.moonlit.moon;
    if (moonTint) {
        const tinted = moonColor.map((value, i) => value * clamp(finite(moonTint[i], 1)));
        moonColor = scale(tinted, luminance(moonColor) / Math.max(luminance(tinted), 1e-8));
    }
    const moon = scale(moonColor, LIGHTING_PRESETS.moonlit.moonPower * moonAmount);
    const moonSky = scale(moonColor, LIGHTING_PRESETS.moonlit.moonSkyPower * moonAmount);
    const sky = add(scale(skyColor, skyPower), moonSky);
    const ground = add(scale(groundColor, groundPower), scale(moonSky, 0.18));

    // Kolor widocznej atmosfery jest częścią tych samych presetów,
    // ale nie udaje całki światła padającego ze wszystkich kierunków.
    const visualDay = smooth(-12, 10, altitude);
    const zenith = scale(mix(day.zenith, scale(COLORS.overcast.zenith, visualDay), clouds), skyEclipse);
    const horizon = scale(mix(day.horizon, scale(COLORS.overcast.horizon, visualDay), clouds), skyEclipse);

    return {
        paletteVersion: LIGHTING_PALETTE_VERSION,
        altitude, cloudCover: clouds, cloudTransmission,
        airMass: relativeAirMass(disc.lightHeight),
        discVisibility: disc.visibility, lightHeight: disc.lightHeight,
        direct, sky, ground, moon, moonSky,
        sunColor, skyColor, groundColor, moonColor: [...moonColor],
        sunDiscColor: scale(sunColor, cloudTransmission),
        nightDesaturation: 0,
        visual: {
            zenith: add(zenith, scale(moonSky, 0.15)),
            horizon: add(horizon, scale(moonSky, 0.25)),
            sunset: day.glow * (1 - clouds) ** 2 * skyEclipse,
            sunsetColor: scale(day.sun, 0.65),
            sunsetHigh: mix(day.sky, day.sun, 0.2),
            sunHalo: scale(sunColor, 0.13 * disc.visibility * (1 - covered) * cloudTransmission)
        }
    };
}
