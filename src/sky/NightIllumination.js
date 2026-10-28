// Osobne źródła nocne, bez tabeli klasycznego zmierzchu.
// Słabe tło nocne jest umowną energią RGB do gry, nie pomiarem światła gwiazd.
const BACKGROUND = [0.025, 0.035, 0.055];

export function sampleNightIllumination(sunHeight, moonAmbient = [0, 0, 0]) {
    const height = Math.max(-1, Math.min(1, Number.isFinite(sunHeight) ? sunHeight : -1));
    const altitude = Math.asin(height) * 180 / Math.PI;
    // Tło pojawia się dopiero po zmierzchu cywilnym, płynnie do −12°.
    const t = Math.max(0, Math.min(1, (-altitude - 6) / 6));
    const background = BACKGROUND.map(c => c * t * t * (3 - 2 * t));
    const moon = BACKGROUND.map((_, i) => Math.max(0, Number.isFinite(moonAmbient[i]) ? moonAmbient[i] : 0));
    const sky = background.map((c, i) => c + moon[i]);
    return { background, moon, sky, ground: sky.map(c => c * 0.18) };
}
