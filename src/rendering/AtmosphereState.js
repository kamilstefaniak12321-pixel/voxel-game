import { sampleAerialProfile } from '../sky/AerialPerspective.js';
import { viewUniforms } from './viewUniforms.js';
import { GLOBE_RADIUS, FAR_HAZE_MAX } from '../config.js';

// O ile burza piaskowa (pył 1) zagęszcza powietrze.
export const AERIAL_DUST = 30;

// Wspólny stan gry i żywego menu. Tylko kilka parametrów shaderów:
// zmiana pory, zachmurzenia lub wariantu nie przebudowuje chunków.
// weather (od 1.12.0): { fog 0-1, rain 0-1, dust 0-1 } nad graczem - mgła,
// deszcz i pył (od 1.15.0) zagęszczają powietrze. Mgła leży nisko (mała
// wysokość warstwy), więc doliny toną w niej, a szczyty wystają; pył
// sięga wysoko - w burzy piaskowej widać na kilkadziesiąt bloków.
export function updateAerialPerspective(settings, sky, cameraSky = 1, weather = null) {
    const natural = settings.get('atmosphereLook') === 'natural'
        && sky.lightingLook === 'natural';
    // Krzywizna planety zaczyna się wcześniej niż czernienie nieba.
    // Wygaszamy lokalny model również wtedy, żeby łączył się z kulą.
    const space = Math.min(1, Math.max(0, (sky.space || 0) / 0.2,
        viewUniforms.uCurvature.value * GLOBE_RADIUS / 0.15));
    const blend = 1 - space * space * (3 - 2 * space);
    const profile = sampleAerialProfile(sky.celestial?.sunHeight ?? -1,
        { cloudCover: sky.cloudCover ?? 0 });
    viewUniforms.uAerialPerspective.value = natural ? blend : 0;
    const fog = Math.min(1, Math.max(0, weather?.fog ?? 0)) * blend;
    const rain = Math.min(1, Math.max(0, weather?.rain ?? 0)) * blend;
    const dust = Math.min(1, Math.max(0, weather?.dust ?? 0)) * blend;
    const thick = Math.max(fog, 0.45 * rain, dust);
    viewUniforms.uAerialDensity.value = profile.density * (1 + 13 * fog * fog + 2.6 * rain + AERIAL_DUST * dust * dust);
    viewUniforms.uAerialHeight.value = profile.scaleHeight + (48 - profile.scaleHeight) * fog;
    viewUniforms.uHazeMax.value = FAR_HAZE_MAX + (0.97 - FAR_HAZE_MAX) * thick;
    viewUniforms.uAerialCameraSky.value = Number.isFinite(cameraSky)
        ? Math.min(1, Math.max(0, cameraSky)) : 0;
}
