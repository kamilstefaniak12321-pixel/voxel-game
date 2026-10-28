// Eksperymentalny model RGB, niezależny od kamery, renderera i świata.
// Wartości są względną energią liniową, nie luksami. To przybliżenie
// do porównań w grze, nie pełny transport światła w atmosferze.

import { sampleSolarDisc } from './SolarDisc.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};

export function usesSolarAtmosphere(choice, terrain) {
    // Dawny wybór „Według świata” jest domyślnym profilem, także dla
    // istniejących zapisów. Jawny „Klasyczny” pozostaje bez zmian.
    return choice === 'atmosphere' || choice === 'world';
}

// Długość drogi przez jednorodną, kulistą powłokę / jej grubość.
// Przy horyzoncie pozostaje skończona. Grubość i współczynniki RGB
// są dobrane wizualnie; nie opisują pionowego profilu prawdziwego powietrza.
export function relativeAirMass(sunHeight) {
    const mu = clamp(Number.isFinite(sunHeight) ? sunHeight : -1, 0, 1);
    const thickness = 0.00125;
    return (2 + thickness) / (Math.sqrt(mu * mu + 2 * thickness + thickness * thickness) + mu);
}

export function sampleSolarAtmosphere(sunHeight, eclipse = 0) {
    const height = clamp(Number.isFinite(sunHeight) ? sunHeight : -1, -1, 1);
    const covered = clamp(Number.isFinite(eclipse) ? eclipse : 0, 0, 1);
    const disc = sampleSolarDisc(height);
    const airMass = relativeAirMass(disc.lightHeight);
    const altitude = Math.asin(height) * 180 / Math.PI;

    // Krótkie fale znikają z wiązki szybciej. Tłumienie wykładnicze
    // daje cieplejsze i słabsze światło nisko nad horyzontem.
    const transmission = [0.055, 0.12, 0.28].map(tau => Math.exp(-tau * airMass));
    // Energia widocznego wycinka tarczy; gdy jej środek jest już pod
    // horyzontem, górny fragment nadal świeci znad horyzontu.
    const direct = transmission.map(t => 2.4 * t * disc.visibility * (1 - covered));

    // Rozproszone światło trwa również przed wschodem / po zachodzie.
    // Osobna, empiryczna krzywa zmierzchu; nie suma fotonów z direct.
    const twilight = smooth(-12, 2, altitude);
    const day = smooth(0, 25, altitude);
    const skyScale = twilight * (1 - 0.9 * covered ** 1.8);
    const sky = [0.28 + 0.04 * day, 0.20 + 0.28 * day, 0.25 + 0.45 * day]
        .map(c => c * skyScale);

    // Uśredniony grunt (albedo 0.18), bez odczytu sąsiednich bloków.
    // Lokalne kolorowe odbicia pozostają osobnym eksperymentem BounceLight.
    const ground = sky.map((c, i) => 0.18 * (c + direct[i] * disc.lightHeight));

    return { airMass, altitude, transmission, direct, sky, ground, discVisibility: disc.visibility, lightHeight: disc.lightHeight };
}
