import { DAY_SECONDS, SYSTEM_NAMES } from './WeatherField.js';

// ------------------------------------------------------------
// POGODA SŁOWAMI (1.11.0)
//
// Opis pogody z liczb pola pogody (WeatherField.js): do komendy
// /pogoda, prognozy i mapy pogody.
// ------------------------------------------------------------

// Rodzaje nieba - od najgroźniejszego (pierwszy pasujący wygrywa).
export const SKY_NAMES = {
    burza: 'burza',
    ulewa: 'ulewa',
    deszcz: 'deszcz',
    mzawka: 'słaby deszcz',
    ciemne: 'ciemne chmury deszczowe',
    pochmurno: 'pochmurno (niskie chmury warstwowe)',
    duze: 'duże zachmurzenie',
    klebiaste: 'chmury kłębiaste',
    srednie: 'chmury średnie',
    pierzaste: 'chmury pierzaste',
    pogodnie: 'pogodnie'
};


export function skyKey(sample) {

    if (sample.storm > 0.3) return 'burza';
    if (sample.rain > 0.55) return 'ulewa';
    if (sample.rain > 0.2) return 'deszcz';
    if (sample.rain > 0.05) return 'mzawka';
    if (sample.low > 0.85) return sample.thick > 0.4 ? 'ciemne' : 'pochmurno';
    if (sample.low > 0.5) return 'duze';
    if (sample.low > 0.2) return 'klebiaste';
    if (sample.mid > 0.5) return 'srednie';
    if (sample.high > 0.4) return 'pierzaste';

    return 'pogodnie';

}


// Strona świata, w którą wskazuje kąt (0 = wschód, +x; północ to -z,
// jak na mapie).

const SIDES = ['wschód', 'południowy wschód', 'południe', 'południowy zachód', 'zachód', 'północny zachód', 'północ', 'północny wschód'];
const SIDES_FROM = ['ze wschodu', 'z południowego wschodu', 'z południa', 'z południowego zachodu', 'z zachodu', 'z północnego zachodu', 'z północy', 'z północnego wschodu'];

function sideIndex(angle) {

    return ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;

}

// "na zachód" - dokąd (kierunek od gracza do czegoś).
export function sideName(angle) {

    return SIDES[sideIndex(angle)];

}

// "z zachodu" - skąd wieje wiatr, który leci w kierunku `angle`.
export function windFrom(angle) {

    return SIDES_FROM[sideIndex(angle + Math.PI)];

}


export function windName(speed) {

    if (speed < 0.6) return 'cisza';
    if (speed < 2) return 'słaby wiatr';
    if (speed < 3.5) return 'umiarkowany wiatr';
    if (speed < 5.5) return 'silny wiatr';
    if (speed < 8) return 'bardzo silny wiatr';

    return 'wichura';

}


// Godzina z czasu gry ("14:30").

export function clockText(days) {

    const minutes = Math.round((days - Math.floor(days)) * 24 * 60) % (24 * 60);

    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

}


const percent = (value) => `${Math.round(value * 100)}%`;
const decimal = (value) => value.toFixed(1).replace('.', ',');


// Jedno zdanie o próbce: niebo, piętra chmur, wiatr.

export function sampleText(sample) {

    return `${SKY_NAMES[skyKey(sample)]} | chmury: niskie ${percent(sample.low)}, średnie ${percent(sample.mid)}, ` +
        `wysokie ${percent(sample.high)} | ${windName(sample.speed)} ${windFrom(sample.angle)}, ${decimal(sample.speed)} bl./s`;

}


// Najbliższy układ, który ma znaczenie dla gracza: co to jest, gdzie
// i czy nadciąga. Zwraca tekst albo ''.

export function systemText(field, x, z, days) {

    let best = null;

    for (const type of ['front_chlodny', 'front_cieply', 'burze', 'niz', 'przelotne']) {

        const found = field.nearest(x, z, days, type);

        if (found && (!best || found.distance < best.distance)) {
            best = found;
        }

    }

    if (!best) {
        return '';
    }

    const system = best.system;
    const name = SYSTEM_NAMES[system.type];

    if (best.distance < 1200) {
        return `Jesteś w zasięgu: ${name}.`;
    }

    // Czy gracz leży przed układem (na jego drodze)?
    const ahead = (x - system.x) * system.dx + (z - system.z) * system.dz;
    const side = Math.abs((z - system.z) * system.dx - (x - system.x) * system.dz);
    const where = `${Math.round(best.distance / 100) * 100} bloków na ${sideName(best.angle)}`;

    if (ahead > 0 && side < 4000 && system.speed > 0.1) {

        const minutes = Math.max(1, Math.round(ahead / system.speed / 60));

        return `Nadciąga ${name}: ${where}, będzie tu za ok. ${minutes} min.`;

    }

    return `W okolicy: ${name}, ${where}${ahead <= 0 ? ' (oddala się)' : ''}.`;

}


// Stan pogody nad graczem (/pogoda) w chwili `days` - liczony wprost
// z pola, więc zaraz po /pogoda ustaw pokazuje już nową pogodę.

export function weatherStatus(weather, x, z, days = weather.days) {

    const system = systemText(weather.field, x, z, days);

    return `Pogoda: ${sampleText(weather.field.sample(x, z, days))}.` + (system ? ` ${system}` : '');

}


// Prognoza w miejscu (x, z): kolejne zmiany nieba od teraz przez `days`
// dób gry. Zwraca wiersze tekstu.

export function forecastLines(field, x, z, days, span = 1.5) {

    const steps = field.forecast(x, z, days, span, 1 / 48);
    const lines = [];

    let last = null;

    for (const sample of steps) {

        const key = skyKey(sample);

        if (key === last) continue;

        last = key;

        const ahead = sample.time - days;
        const day = Math.floor(sample.time) - Math.floor(days);
        const when = ahead < 1e-6 ? 'teraz' : `${day === 0 ? '' : day === 1 ? 'jutro ' : 'pojutrze '}${clockText(sample.time)}`;
        const minutes = Math.round(ahead * DAY_SECONDS / 60);

        lines.push(`${when}${ahead < 1e-6 ? '' : ` (za ${minutes} min)`}: ${SKY_NAMES[key]}, ${windName(sample.speed)} ${windFrom(sample.angle)}`);

        if (lines.length >= 12) break;

    }

    return lines;

}
