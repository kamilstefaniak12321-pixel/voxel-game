import { SUN_DIAMETER } from '../config.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Jedna tarcza dla obrazu i oświetlenia. Tak jak warstwa Sun, traktujemy
// ją jako koło na płaszczyźnie prostopadłej do kierunku jej środka.
// Horyzont fizyczny to Y=0; pozycja i kierunek kamery nie są wejściem.
// Jeden promień ze środka widocznego wycinka zastępuje rozszerzone źródło:
// zachowuje jego energię i kierunek, ale nie daje jeszcze półcienia.
export function sampleSolarDisc(sunHeight, diameter = SUN_DIAMETER) {
    const height = clamp(Number.isFinite(sunHeight) ? sunHeight : -1, -1, 1);
    const altitude = Math.asin(height);
    const radius = clamp(Number.isFinite(diameter) ? diameter : SUN_DIAMETER, 0.001, 179) * Math.PI / 360;

    if (altitude <= -radius) return { visibility: 0, lightHeight: 0 };
    if (altitude >= radius) return { visibility: 1, lightHeight: Math.max(0, height) };

    // Współrzędna pionowa przecięcia horyzontu z kołem jednostkowym.
    const cut = clamp(-Math.tan(altitude) / Math.tan(radius), -1, 1);
    const angle = Math.acos(cut);
    const sine = Math.sqrt(Math.max(0, 1 - cut * cut));
    // Pole wycinka: acos(cut) - cut * sqrt(1-cut²). Szereg dla małego
    // wycinka unika odejmowania niemal równych liczb przy końcu zachodu.
    const a2 = angle * angle;
    const area = angle < 0.001
        ? angle * a2 * (2 / 3 - a2 * (2 / 15 - a2 * 4 / 315))
        : angle - cut * sine;
    const centroid = area > 0 ? (2 / 3) * sine ** 3 / area : 1;
    const lightAltitude = altitude + Math.atan(clamp(centroid, 0, 1) * Math.tan(radius));

    return {
        visibility: clamp(area / Math.PI, 0, 1),
        lightHeight: Math.max(0, Math.sin(lightAltitude))
    };
}
