// ------------------------------------------------------------
// WIATR (0.82.0)
//
// Jeden łagodny wiatr dla całego świata: kierunek powoli kręci się
// wokół wschodu (tam też przechylają się rośliny - PlantWind.js), siła
// rośnie w porywach. Niosą go spadające liście (TreeParticles.js)
// i smugi wiatru (WindStreaks.js). Liczy się tylko z czasu gry, więc
// wszyscy widzą ten sam wiatr i nic nie trzeba zapisywać.
// ------------------------------------------------------------

// Kierunek bazowy (radiany, 0 = +x - wschód) i jak daleko odchodzi.
export const WIND_BASE_ANGLE = 0.25;
export const WIND_SWING = 0.7;
// Prędkość (bloki/s) bez porywu i w najsilniejszym porywie.
export const WIND_SPEED = [0.6, 2.4];

export function windAt(seconds) {
    const angle = WIND_BASE_ANGLE + WIND_SWING * (0.65 * Math.sin(seconds * 0.011) + 0.35 * Math.sin(seconds * 0.029 + 1.7));
    // Porywy: wolna fala i krótsze podmuchy na niej.
    const gust = Math.max(0, Math.min(1, 0.45 + 0.35 * Math.sin(seconds * 0.07) + 0.25 * Math.sin(seconds * 0.43 + 0.6)));
    const speed = WIND_SPEED[0] + (WIND_SPEED[1] - WIND_SPEED[0]) * gust;
    return { x: Math.cos(angle) * speed, z: Math.sin(angle) * speed, speed, gust, angle };
}
