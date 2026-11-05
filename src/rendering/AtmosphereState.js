import { sampleAerialProfile } from '../sky/AerialPerspective.js';
import { viewUniforms } from './viewUniforms.js';
import { GLOBE_RADIUS } from '../config.js';

// Wspólny stan gry i żywego menu. Tylko kilka parametrów shaderów:
// zmiana pory, zachmurzenia lub wariantu nie przebudowuje chunków.
export function updateAerialPerspective(settings, sky, cameraSky = 1) {
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
    viewUniforms.uAerialDensity.value = profile.density;
    viewUniforms.uAerialHeight.value = profile.scaleHeight;
    viewUniforms.uAerialCameraSky.value = Number.isFinite(cameraSky)
        ? Math.min(1, Math.max(0, cameraSky)) : 0;
}
