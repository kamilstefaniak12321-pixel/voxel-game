import { DAY_LENGTH_MINUTES } from '../config.js';
import { seasonWeights } from '../sky/Seasons.js';
import { seedToNumber } from '../world/Noise.js';

// ------------------------------------------------------------
// POLE POGODY (1.11.0)
//
// Pogoda nie jest włącznikiem dla całego świata, tylko mapą: w każdym
// miejscu (x, z) i każdej chwili (czas gry w dobach) da się policzyć,
// jakie tam są chmury, czy pada i skąd wieje. Liczy się to wyłącznie
// z ziarna świata i czasu gry - nic nie trafia do zapisu, a w grze ze
// znajomymi wszyscy widzą ten sam front w tym samym miejscu.
//
// Skąd bierze się pogoda:
//   1. PRZEPŁYW - stały dla świata kierunek, z którego nadciąga pogoda
//      (przeważnie z zachodu) i prędkość, z jaką wszystko płynie.
//   2. UKŁADY - na dwóch siatkach płynących razem z przepływem. W każdym
//      oczku dużej siatki żyje po kolei jeden duży układ: wyż, front
//      ciepły, front chłodny albo niż z niskimi chmurami. W oczkach
//      małej siatki - zjawiska mniejsze: gniazdo burz, przelotne
//      deszcze, pole chmur pierzastych. Układ rośnie, trwa i zanika;
//      rodzaj losuje się z porą roku (latem burze i wyże, jesienią
//      fronty ciepłe i niskie chmury).
//   3. TŁO - chmury kłębiaste dobrej pogody (najwięcej po południu,
//      nocą znikają) i trochę chmur średnich i wysokich.
//
// Front ma przekrój jak prawdziwy: przed frontem ciepłym najpierw
// chmury pierzaste, potem średnie, potem niskie z jednostajnym
// deszczem; front chłodny to wąska ściana chmur burzowych, za nią
// szybkie przejaśnienie i porywisty wiatr z innej strony.
//
// Wynik próbki (sample):
//   low    0-1  pokrycie nieba chmurami niskimi,
//   thick  0-1  jak wysoko się piętrzą (0 - cienka warstwa, 1 - burzowe),
//   mid    0-1  chmury średnie,   high 0-1  chmury wysokie (pierzaste),
//   rain   0-1  opad,             storm 0-1 burza,
//   hail   0-1  grad (środek najsilniejszych burz),
//   clear  0-1  wpływ wyżu,
//   fog    0-1  mgła (poranna, przy czystym niebie i słabym wietrze),
//   temp        temperatura powietrza na poziomie morza (°C) - z pory
//               roku, klimatu, pory doby i układów; tempSlow - sama pora
//               roku i klimat (od niej zależy zimowa pokrywa śnieżna),
//   frost  0-1  szron (mroźna, pogodna, cicha noc i ranek),
//   windX, windZ, speed (bloki/s), gust 0-1 (porywistość), angle.
// ------------------------------------------------------------

export const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;

// Oczko dużej siatki układów (bloki). Żaden układ nie sięga dalej niż
// jedno oczko swojej siatki od środka, więc próbka sprawdza 3 x 3 oczka.
export const WEATHER_CELL = 8000;

// Prędkość przepływu (bloki/s): tak szybko suną fronty i niskie chmury.
export const FLOW_SPEED = 5.5;

export const SYSTEM_NAMES = {
    wyz: 'wyż',
    front_cieply: 'front ciepły',
    front_chlodny: 'front chłodny',
    niz: 'niż z niskimi chmurami',
    burze: 'burze',
    przelotne: 'przelotne deszcze',
    pierzaste: 'chmury pierzaste'
};

export const SYSTEM_TYPES = Object.keys(SYSTEM_NAMES);

// Dwie siatki układów. weights: jak często który rodzaj w danej porze
// roku (wiosna, lato, jesień, zima); ostatnia liczba to "cisza" - oczko
// bez układu. life: ile dób żyje układ (najkrócej, rozrzut).
const LATTICES = [
    {
        cell: WEATHER_CELL, salt: 0, life: [1.5, 1.1],
        types: ['wyz', 'front_cieply', 'front_chlodny', 'niz'],
        weights: [
            [1.6, 1.6, 1.6, 1.0, 0.8],
            [2.4, 0.7, 1.3, 0.2, 1.0],
            [1.0, 2.0, 1.4, 2.8, 0.5],
            [1.4, 1.8, 1.2, 2.8, 0.6]
        ]
    },
    {
        cell: 4500, salt: 1013, life: [0.9, 0.8],
        types: ['burze', 'przelotne', 'pierzaste'],
        weights: [
            [0.7, 1.5, 1.2, 2.2],
            [2.4, 0.9, 1.0, 2.0],
            [0.25, 1.0, 1.2, 2.6],
            [0.03, 0.5, 1.2, 3.0]
        ]
    }
];

// Pora roku: chmury kłębiaste dobrej pogody, siła wiatru, burzowość frontów.
const SEASON_CUMULUS = [0.32, 0.38, 0.27, 0.18];
const SEASON_WIND = [1.0, 0.85, 1.2, 1.15];
const SEASON_STORMS = [0.6, 0.9, 0.35, 0.12];

// Mgła poranna: jak często w danej porze roku (jesienią prawie co rano).
const SEASON_FOG = [0.5, 0.3, 0.9, 0.6];

// TEMPERATURA (od 1.14.0), w stopniach Celsjusza.
//   SEASON_TEMP  - średnia na poziomie morza w umiarkowanym klimacie
//                  (wiosna, lato, jesień, zima),
//   CLIMATE_TEMP - o tyle cieplej albo chłodniej w gorących i zimnych
//                  stronach świata (pole temperatury generatora terenu),
//   DAY_SWING    - o tyle cieplej po południu i chłodniej przed świtem
//                  przy czystym niebie (pod chmurami dużo mniej),
//   TEMP_LAPSE   - o tyle chłodniej na każdy blok ponad poziom morza
//                  (w górach pada śnieg, gdy w dolinie deszcz).
export const SEASON_TEMP = [9, 20, 8, -5];
export const CLIMATE_TEMP = 11;
export const DAY_SWING = 5.5;
export const TEMP_LAPSE = 0.08;

// Jaka część opadu jest śniegiem w danej temperaturze: powyżej 2 stopni
// sam deszcz, poniżej zera sam śnieg, pomiędzy - deszcz ze śniegiem.
export function snowShare(temp) {

    return ramp(2, 0, temp);

}

// Temperatura na wysokości y (bloki) z temperatury na poziomie morza.
export function tempAtHeight(temp, y, seaLevel) {

    return temp - TEMP_LAPSE * Math.max(0, y - seaLevel);

}


export function weatherHash(a, b, c, seed) {

    let h = (seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1)) | 0;

    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);

    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;

}

const hash = weatherHash;


// Gładki szum 0-1 na siatce o oczku 1.

function noise2(x, z, seed) {

    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const a = hash(ix, iz, 0, seed);
    const b = hash(ix + 1, iz, 0, seed);
    const c = hash(ix, iz + 1, 0, seed);
    const d = hash(ix + 1, iz + 1, 0, seed);

    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;

}


// Gładkie przejście 0 -> 1 między a i b (a może być większe od b:
// wtedy przejście biegnie w drugą stronę).

function ramp(a, b, x) {

    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);

}

const frac = (x) => x - Math.floor(x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));


// Burze i chmury kłębiaste żyją ze słońca: rosną od południa, najwięcej
// ich po południu, wieczorem gasną.

function afternoon(timeOfDay, floor) {

    return floor + (1 - floor) * ramp(0.4, 0.58, timeOfDay) * ramp(0.97, 0.8, timeOfDay);

}


export function emptySample() {

    return {
        low: 0, thick: 0, mid: 0, high: 0, rain: 0, storm: 0, hail: 0, clear: 0, fog: 0,
        windX: 0, windZ: 0, speed: 0, gust: 0, angle: 0,
        temp: 10, tempSlow: 10, frost: 0
    };

}


export class WeatherField {

    // seed    - ziarno świata (tekst albo liczba),
    // climate - opcjonalnie (x, z) => wilgotność miejsca -1..1 (biomy):
    //           w suchych stronach chmur i deszczu jest mniej,
    // warmth  - opcjonalnie (x, z) => ciepło klimatu -1..1 (zimne
    //           i gorące strony świata).

    constructor(seed, { climate = null, warmth = null } = {}) {

        this.seed = (seedToNumber(seed) ^ 0x51ed270b) | 0;

        // Skąd nadciąga pogoda: przeważnie z zachodu (na wschód, +x),
        // w każdym świecie trochę inaczej.

        const angle = (hash(1, 2, 3, this.seed) - 0.5) * 1.3;

        this.flow = {
            angle,
            x: Math.cos(angle) * FLOW_SPEED * DAY_SECONDS,
            z: Math.sin(angle) * FLOW_SPEED * DAY_SECONDS
        };

        this.climate = climate;
        this.warmth = warmth;

        // Temperatura ustawiona komendą (/pogoda temperatura) albo null.
        this.tempOverride = null;

        // Układy ustawione komendą /pogoda (do końca sesji albo /pogoda auto).
        this.forced = [];

        this.season = [0, 0, 0, 0];
        this.pickSeason = [0, 0, 0, 0];
        this.acc = { low: 0, lowSum: 0, lowThick: 0, mid: 0, high: 0, rain: 0, storm: 0, clear: 0, gain: 0, turn: 0, gust: 0, temp: 0, cool: 0 };

    }


    // Układ żyjący w oczku (i, j) siatki `lattice` w chwili t (doby)
    // albo null.

    system(i, j, t, lattice = LATTICES[0]) {

        const seed = (this.seed + lattice.salt) | 0;
        const period = lattice.life[0] + lattice.life[1] * hash(i, j, 11, seed);
        const phase = hash(i, j, 12, seed);
        const clock = t / period + phase;
        const epoch = Math.floor(clock);
        const u = clock - epoch;
        const strength = ramp(0, 0.16, u) * ramp(1, 0.84, u);

        if (strength <= 0.002) {
            return null;
        }

        const born = (epoch - phase) * period;
        const type = this.pickType(lattice, hash(i, j, epoch * 7 + 1, seed), born + period / 2);

        if (!type) {
            return null;
        }

        // Własny ruch układu względem przepływu: fronty chłodne są
        // szybsze, reszta trochę wolniejsza albo szybsza.

        const turn = this.flow.angle + (hash(i, j, epoch * 7 + 4, seed) - 0.5) * 1.1;
        const extra = (type === 'front_chlodny' ? 0.12 : -0.08) + 0.22 * hash(i, j, epoch * 7 + 5, seed);
        // (Na małej siatce własny ruch jest mniejszy - układ nie może
        // wyjść ze swojego oczka.)
        const own = extra * FLOW_SPEED * DAY_SECONDS * lattice.cell / WEATHER_CELL;
        const driftX = Math.cos(turn) * own;
        const driftZ = Math.sin(turn) * own;
        const life = (u - 0.5) * period;

        const jx = hash(i, j, epoch * 7 + 2, seed) - 0.5;
        const jz = hash(i, j, epoch * 7 + 3, seed) - 0.5;

        const vx = this.flow.x + driftX;
        const vz = this.flow.z + driftZ;
        const speed = Math.hypot(vx, vz);

        return {
            type,
            id: `${lattice.salt}:${i},${j},${epoch}`,
            x: (i + 0.5 + jx * 0.5) * lattice.cell + driftX * life + this.flow.x * t,
            z: (j + 0.5 + jz * 0.5) * lattice.cell + driftZ * life + this.flow.z * t,
            dx: vx / speed,
            dz: vz / speed,
            // Prędkość w blokach na sekundę i czas życia (doby gry).
            speed: speed / DAY_SECONDS,
            born,
            ends: born + period,
            strength,
            size: 0.8 + 0.35 * hash(i, j, epoch * 7 + 6, seed),
            reach: lattice.cell,
            h: hash(i, j, epoch * 7 + 7, seed),
            key: (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(epoch, 83492791) ^ lattice.salt) | 0,
            forced: false
        };

    }


    pickType(lattice, roll, days) {

        const season = seasonWeights(days, 2, this.pickSeason);
        const W = lattice.weights;
        const count = W[0].length;

        let total = 0;

        for (let k = 0; k < count; k++) {
            total += season[0] * W[0][k] + season[1] * W[1][k] + season[2] * W[2][k] + season[3] * W[3][k];
        }

        let left = roll * total;

        for (let k = 0; k < count; k++) {

            left -= season[0] * W[0][k] + season[1] * W[1][k] + season[2] * W[2][k] + season[3] * W[3][k];

            if (left <= 0) {
                return lattice.types[k] ?? null;
            }

        }

        return null;

    }


    // Wszystkie układy, które mogą sięgać w kwadrat (x, z) ± radius,
    // razem z ustawionymi komendą.

    systemsNear(x, z, t, radius = 0, out = []) {

        out.length = 0;

        const qx = x - this.flow.x * t;
        const qz = z - this.flow.z * t;

        for (const lattice of LATTICES) {

            const reach = radius + lattice.cell;
            const i0 = Math.floor((qx - reach) / lattice.cell);
            const i1 = Math.floor((qx + reach) / lattice.cell);
            const j0 = Math.floor((qz - reach) / lattice.cell);
            const j1 = Math.floor((qz + reach) / lattice.cell);

            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {

                    const system = this.system(i, j, t, lattice);

                    if (system) {
                        out.push(system);
                    }

                }
            }

        }

        for (const forced of this.forced) {
            out.push(this.forcedAt(forced, t));
        }

        return out;

    }


    // Układ z komendy w chwili t: płynie jak zwykły, ale nie zanika.

    forcedAt(forced, t) {

        const moved = (t - forced.t0) * DAY_SECONDS * forced.speed;

        forced.now ??= { ...forced, forced: true };
        forced.now.x = forced.x0 + forced.dx * moved;
        forced.now.z = forced.z0 + forced.dz * moved;

        return forced.now;

    }


    // Ustawia układ komendą. ahead - ile bloków przed graczem (pod wiatr)
    // ma się zacząć, żeby dało się patrzeć, jak nadciąga; stay - układ
    // stoi nad miejscem (nie płynie).

    force(type, x, z, t, { ahead = 0, stay = false, size = 1, h = 0.6 } = {}) {

        const angle = this.flow.angle;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);

        const forced = {
            type,
            id: `komenda-${this.forced.length}`,
            x0: x - dx * ahead,
            z0: z - dz * ahead,
            t0: t,
            dx, dz,
            speed: stay ? 0 : FLOW_SPEED * (type === 'front_chlodny' ? 1.2 : 1),
            born: t, ends: Infinity,
            strength: 1, size, h, reach: WEATHER_CELL,
            key: 977 + this.forced.length * 131,
            now: null
        };

        this.forced.push(forced);

        return forced;

    }


    clearForced() {

        this.forced.length = 0;

    }


    // Pogoda w punkcie (x, z) w chwili t. systems - lista z systemsNear
    // (gdy liczy się wiele punktów naraz), inaczej zbierana tutaj.

    sample(x, z, t, out = emptySample(), systems = null) {

        const seed = this.seed;
        const list = systems ?? this.systemsNear(x, z, t, 0, this.scratch ??= []);
        const season = seasonWeights(t, 2, this.season);
        const timeOfDay = frac(t);

        // Rama płynąca z przepływem - w niej leżą brzegi chmur i tło.

        const qx = x - this.flow.x * t;
        const qz = z - this.flow.z * t;
        const wiggle = (noise2(qx / 2600, qz / 2600, seed + 77) - 0.5) * 900;
        const patch = noise2(qx / 1500 + 9, qz / 1500 - 4, seed + 78);

        const acc = this.acc;

        acc.low = acc.lowSum = acc.lowThick = acc.mid = acc.high = acc.rain = acc.storm = 0;
        acc.clear = acc.gain = acc.turn = acc.gust = acc.temp = acc.cool = 0;

        // Układ z komendy wypiera naturalną pogodę wokół siebie.

        let override = 0;

        for (const system of list) {
            if (system.forced) {
                override = Math.max(override, ramp(8000, 5000, Math.hypot(x - system.x, z - system.z)));
            }
        }

        const stormy = season[0] * SEASON_STORMS[0] + season[1] * SEASON_STORMS[1] +
            season[2] * SEASON_STORMS[2] + season[3] * SEASON_STORMS[3];

        for (const system of list) {

            const scale = system.forced ? 1 : 1 - override;

            if (scale > 0.001) {
                this.apply(system, x, z, t, timeOfDay, wiggle, patch, stormy, scale);
            }

        }

        // Tło: chmury kłębiaste dobrej pogody, trochę średnich i wysokich.

        const natural = 1 - override;
        const cumulusSeason = season[0] * SEASON_CUMULUS[0] + season[1] * SEASON_CUMULUS[1] +
            season[2] * SEASON_CUMULUS[2] + season[3] * SEASON_CUMULUS[3];
        const n1 = noise2(qx / 5200 + t * 0.13, qz / 5200, seed + 31);
        const n2 = noise2(qx / 7000 + 40, qz / 7000 - t * 0.09, seed + 32);
        const n3 = noise2(qx / 9000 - t * 0.07, qz / 9000 + 17, seed + 33);
        const calm = 1 - 0.9 * acc.clear;

        const cumulus = natural * calm * cumulusSeason * afternoon(timeOfDay, 0.22) * clamp01((n1 - 0.22) * 1.7) * 1.25;
        const cumulusThick = 0.2 + 0.2 * season[1] + 0.12 * n2;

        // W suchych stronach (pustynia, sawanna) chmur i deszczu jest mniej.

        const humidity = this.climate ? this.climate(x, z) : 0;
        const wet = Math.max(0.3, Math.min(1.25, 1 + 0.6 * humidity));

        let low = acc.low * (1 - 0.6 * acc.clear);
        const lowWeight = acc.lowSum + cumulus;

        out.thick = lowWeight > 0.001 ? clamp01((acc.lowThick + cumulus * cumulusThick) / lowWeight) : 0;
        low = 1 - (1 - low) * (1 - cumulus);
        // Zamknięte niebo frontu zostaje zamknięte także na pustyni -
        // susza przerzedza dopiero chmury z przerwami.
        out.low = clamp01(low * (wet < 1 ? wet + (1 - wet) * ramp(0.7, 0.97, low) : wet));
        out.mid = clamp01(1 - (1 - acc.mid * (1 - 0.7 * acc.clear)) * (1 - natural * calm * 0.3 * clamp01((n2 - 0.55) / 0.4)));
        out.high = clamp01(1 - (1 - acc.high * (1 - 0.5 * acc.clear)) * (1 - natural * (1 - 0.5 * acc.clear) * 0.5 * clamp01((n3 - 0.46) / 0.45)));
        out.rain = clamp01(acc.rain * Math.min(1, wet));
        out.storm = clamp01(acc.storm * Math.min(1, wet));
        // Grad pada tylko w samym środku najsilniejszych burz - przez
        // minutę, dwie, gdy komórka jest w szczycie.
        out.hail = ramp(0.86, 0.97, out.storm);
        out.clear = clamp01(acc.clear);

        // Wiatr: wieje stamtąd, skąd nadciąga pogoda, i powoli się kręci;
        // układy go wzmacniają i skręcają.

        const seconds = t * DAY_SECONDS;
        const windSeason = season[0] * SEASON_WIND[0] + season[1] * SEASON_WIND[1] +
            season[2] * SEASON_WIND[2] + season[3] * SEASON_WIND[3];
        const angle = this.flow.angle + acc.turn +
            0.45 * (0.65 * Math.sin(seconds * 0.006 + seed % 7) + 0.35 * Math.sin(seconds * 0.017 + 1.7));
        const base = (1.2 + 1.1 * noise2(t * 2.3, 5, seed + 34)) * windSeason;
        const speed = Math.min(11, base * (1 + acc.gain) * (1 - 0.55 * acc.clear));

        out.angle = angle;
        out.speed = speed;
        out.windX = Math.cos(angle) * speed;
        out.windZ = Math.sin(angle) * speed;
        out.gust = clamp01(0.3 + acc.gust - 0.2 * acc.clear);

        // Mgła poranna: zbiera się przed świtem i rozchodzi przed południem,
        // gdy niebo jest czyste, a wiatr słaby. Nie każdego ranka i nie
        // wszędzie (plamy po kilka kilometrów, co rano inne); częściej
        // jesienią i w wilgotnym klimacie, na pustyni prawie nigdy.

        const dawn = ramp(0.09, 0.2, timeOfDay) * ramp(0.38, 0.27, timeOfDay);

        out.fog = 0;

        if (dawn > 0 && natural > 0) {

            const day = Math.floor(t);
            const fogSeason = season[0] * SEASON_FOG[0] + season[1] * SEASON_FOG[1] +
                season[2] * SEASON_FOG[2] + season[3] * SEASON_FOG[3];
            const need = 0.72 - 0.35 * fogSeason - 0.25 * Math.max(0, humidity);
            const bank = ramp(need, need + 0.15, noise2(x / 7000 + day * 5.37, z / 7000 - day * 3.11, seed + 35));
            const patches = 0.55 + 0.45 * noise2(x / 900 + 3, z / 900 - 8, seed + 36);

            out.fog = clamp01(natural * dawn * bank * patches * (1 - Math.max(out.low, 0.6 * out.mid)) *
                ramp(3, 1.2, speed) * Math.max(0.12, Math.min(1, 1 + humidity)));

        }

        // Temperatura: pora roku i klimat (zmieniają się powoli), do tego
        // pora doby (najcieplej po południu, najzimniej przed świtem - pod
        // chmurami różnica jest mała), układy (za frontem chłodnym zimno,
        // w wycinku ciepłym frontu ciepłego cieplej, wyż latem grzeje,
        // a zimą mrozi) i sam opad, który chłodzi.

        const overcast = Math.max(out.low, 0.6 * out.mid);
        const slow = season[0] * SEASON_TEMP[0] + season[1] * SEASON_TEMP[1] + season[2] * SEASON_TEMP[2] + season[3] * SEASON_TEMP[3] +
            CLIMATE_TEMP * (this.warmth ? this.warmth(x, z) : 0);

        out.tempSlow = slow;
        out.temp = slow + DAY_SWING * (1 - 0.65 * overcast) * Math.cos((timeOfDay - 0.62) * Math.PI * 2) +
            acc.temp - acc.cool - 2.5 * out.rain;

        if (this.tempOverride !== null) {
            out.temp = out.tempSlow = this.tempOverride;
        }

        // Szron: osiada wieczorem i nocą, gdy jest mroźno, pogodnie i cicho;
        // rano znika. W suchym klimacie słabszy.

        const night = timeOfDay < 0.5 ? ramp(0.37, 0.28, timeOfDay) : ramp(0.86, 0.99, timeOfDay);

        out.frost = night > 0 && out.rain < 0.02
            ? clamp01(night * ramp(1.5, -2.5, out.temp) * (1 - 0.85 * overcast) * ramp(4.5, 2, speed) *
                Math.max(0.2, Math.min(1, 0.75 + 0.5 * humidity)))
            : 0;

        return out;

    }


    // Wkład jednego układu do sumy (this.acc).

    apply(system, x, z, t, timeOfDay, wiggle, patch, stormy, scale) {

        const acc = this.acc;
        const rx = x - system.x;
        const rz = z - system.z;

        if (rx * rx + rz * rz > system.reach * system.reach) {
            return;
        }

        const e = system.strength * scale;
        const inverse = 1 / system.size;
        const h = system.h;

        // Wzdłuż ruchu układu (s > 0: przed nim) i w poprzek.
        let s = (rx * system.dx + rz * system.dz) * inverse;
        const c = (rz * system.dx - rx * system.dz) * inverse;
        const distance = Math.hypot(rx, rz) * inverse;

        const union = (cover, thick) => {
            acc.low = 1 - (1 - acc.low) * (1 - cover);
            acc.lowSum += cover;
            acc.lowThick += cover * thick;
        };

        switch (system.type) {

            case 'front_cieply': {

                const w = e * ramp(5000, 3600, Math.abs(c));

                if (w <= 0) break;

                // Front wygięty w łuk, brzeg poszarpany.
                s += c * c * (0.25 + 0.3 * h) / 6000 + wiggle;

                acc.high = Math.max(acc.high, w * 0.9 * ramp(4400, 3000, s) * ramp(-700, 300, s));
                acc.mid = Math.max(acc.mid, w * ramp(2900, 1700, s) * ramp(-1000, -100, s));

                const nimbus = w * ramp(1500, 600, s) * ramp(-1900, -1000, s);
                const sector = w * 0.55 * ramp(-3900, -2900, s) * ramp(-900, -1800, s);

                union(nimbus, 0.5);
                union(sector, 0.22);

                acc.rain = Math.max(acc.rain, w * (0.3 + 0.3 * h) * (0.75 + 0.5 * patch) * ramp(1000, 200, s) * ramp(-1500, -900, s));
                acc.gain += w * 0.9 * ramp(2600, 800, s) * ramp(-2600, -1200, s);
                acc.turn += w * 0.45 * (1 - 2 * ramp(-400, 400, s)) * ramp(3600, 2000, Math.abs(s));
                acc.gust += w * 0.2 * ramp(1500, 0, Math.abs(s));
                // Za frontem wycinek ciepły, przed nim trochę chłodniej.
                acc.temp += w * (3.5 * ramp(-600, -1800, s) * ramp(-4200, -3000, s) - ramp(0, 1200, s) * ramp(3200, 1800, s));
                break;

            }

            case 'front_chlodny': {

                const w = e * ramp(5000, 3500, Math.abs(c));

                if (w <= 0) break;

                s += c * c * (0.3 + 0.3 * h) / 6000 + wiggle * 0.6;

                const line = w * ramp(700, 250, s) * ramp(-900, -300, s);
                const post = w * ramp(-4600, -3400, s) * ramp(-1300, -1900, s);
                const slot = w * ramp(-1750, -1300, s) * ramp(-800, -1100, s);

                union(line * 0.96, 0.85 + 0.15 * h);
                union(post * 0.4 * (0.5 + patch), 0.5);

                acc.clear = Math.max(acc.clear, slot * 0.8);
                acc.high = Math.max(acc.high, w * 0.75 * ramp(2700, 1200, s) * ramp(-700, 0, s));
                acc.mid = Math.max(acc.mid, w * 0.85 * ramp(1400, 500, s) * ramp(-900, -300, s));
                acc.rain = Math.max(acc.rain, line * (0.7 + 0.3 * h), post * 0.5 * ramp(0.62, 0.8, patch));

                // Wzdłuż frontu burza raz mocniejsza, raz słabsza.
                acc.storm = Math.max(acc.storm, line * stormy * (0.55 + 0.45 * patch));
                acc.gain += w * (1.8 * ramp(1200, 300, s) * ramp(-600, 0, s) + 0.9 * ramp(-4200, -2600, s) * ramp(0, -600, s));
                acc.turn += w * 0.9 * ramp(200, -400, s) * ramp(-5200, -3600, s);
                acc.gust += line * 0.8 + post * 0.5;
                // Przed frontem ciepło i duszno, za nim wyraźnie zimniej.
                acc.temp += w * (2 * ramp(1800, 600, s) * ramp(-200, 300, s) - 6 * ramp(-200, -900, s) * ramp(-5200, -3800, s));
                break;

            }

            case 'burze': {

                const power = e * afternoon(timeOfDay, system.forced ? 1 : 0.12);

                if (power <= 0.01 || distance > 4400) break;

                union(power * 0.35 * ramp(3400, 1500, distance), 0.55);

                const cells = 3 + Math.floor(h * 3);

                for (let m = 0; m < cells; m++) {

                    const a = hash(system.key, m, 1, this.seed) * Math.PI * 2;
                    // (Burza z komendy ma główną komórkę nad środkiem.)
                    const far = system.forced && m === 0 ? 0 : 1200 * Math.sqrt(hash(system.key, m, 2, this.seed));
                    const radius = 430 + 330 * hash(system.key, m, 3, this.seed);

                    // Komórka burzowa rośnie i zamiera (kilka minut gry).
                    const pulse = Math.sin(Math.PI * frac(t * 3.1 + hash(system.key, m, 4, this.seed))) ** 2;
                    // (Główna komórka burzy z komendy trwa: błyska, ale nie
                    // sypie gradem bez przerwy - do gradu jest /pogoda grad.)
                    const cell = power * (0.35 + 0.65 * (m === 0 && system.forced ? 0.72 : pulse));
                    const ux = rx * inverse - Math.cos(a) * far;
                    const uz = rz * inverse - Math.sin(a) * far;
                    const d = Math.hypot(ux, uz);

                    if (d > radius * 3.4) continue;

                    union(cell * ramp(radius, radius * 0.35, d), 0.9 + 0.1 * h);

                    acc.mid = Math.max(acc.mid, cell * 0.7 * ramp(radius * 1.5, radius * 0.7, d));

                    // Kowadło: wysokie chmury wyniesione z wiatrem przed burzę.
                    const anvil = Math.hypot(ux - system.dx * radius * 0.9, uz - system.dz * radius * 0.9);

                    acc.high = Math.max(acc.high, cell * 0.85 * ramp(radius * 2.4, radius * 1.2, anvil));

                    const core = cell * ramp(radius * 0.75, radius * 0.2, d);

                    acc.rain = Math.max(acc.rain, core * 0.9);
                    acc.storm = Math.max(acc.storm, core);
                    acc.gain += cell * 1.4 * ramp(radius * 1.9, radius, d);
                    acc.gust += cell * 0.9 * ramp(radius * 2.2, radius, d);
                    // Pod burzą chłodny podmuch.
                    acc.cool = Math.max(acc.cool, 4 * cell * ramp(radius * 1.6, radius * 0.5, d));

                }

                break;

            }

            case 'przelotne': {

                // Pole wypiętrzonych chmur kłębiastych, z których tu i tam
                // przez chwilę pada.

                const power = e * afternoon(timeOfDay, system.forced ? 1 : 0.4);
                const field = power * ramp(3300, 1900, distance + wiggle);

                if (field <= 0) break;

                union(field * (0.35 + 0.3 * patch), 0.6);

                acc.rain = Math.max(acc.rain, field * 0.55 * ramp(0.6, 0.78, patch));
                acc.gain += field * 0.4;
                acc.gust += field * 0.35;
                acc.cool = Math.max(acc.cool, 1.5 * field * ramp(0.6, 0.78, patch));
                break;

            }

            case 'niz': {

                const radius = 3400 + 1300 * h;
                const deck = e * ramp(radius, radius * 0.72, distance + wiggle * 1.2);

                if (deck <= 0) break;

                const drizzle = ramp(0.5, 0.72, patch);

                union(deck, 0.16 + 0.26 * drizzle);

                acc.mid = Math.max(acc.mid, e * 0.5 * ramp(radius * 0.9, radius * 0.4, distance));
                acc.rain = Math.max(acc.rain, deck * drizzle * 0.22);
                acc.gain += deck * 0.3;
                // Niż: zimą łagodny i mokry, latem chłodny.
                acc.temp += deck * (2.5 * this.season[3] - 2 * this.season[1]);
                break;

            }

            case 'wyz': {

                const radius = 4800 + 1500 * h;

                const clear = e * ramp(radius, radius * 0.55, distance);

                acc.clear = Math.max(acc.clear, clear);
                // Wyż: latem upał, zimą mróz.
                acc.temp += clear * (2.5 * this.season[1] - 3.5 * this.season[3]);
                break;

            }

            case 'pierzaste': {

                acc.high = Math.max(acc.high, e * 0.85 * ramp(3900, 2000, distance + wiggle));
                break;

            }

        }

    }


    // Najbliższy układ danego rodzaju (albo dowolny, gdy type = null)
    // w promieniu trzech oczek: { system, distance, angle } albo null.
    // angle - kierunek od (x, z) do układu.

    nearest(x, z, t, type = null, minStrength = 0.3) {

        const systems = this.systemsNear(x, z, t, WEATHER_CELL * 2, []);

        let best = null;

        for (const system of systems) {

            if ((type && system.type !== type) || system.strength < minStrength) continue;

            const distance = Math.hypot(system.x - x, system.z - z);

            if (!best || distance < best.distance) {
                best = { system, distance, angle: Math.atan2(system.z - z, system.x - x) };
            }

        }

        return best;

    }


    // Pogoda w jednym miejscu w kolejnych chwilach: od t przez `days` dób,
    // co `step` doby. Do prognozy (/pogoda prognoza).

    forecast(x, z, t, days = 1.5, step = 1 / 48) {

        const result = [];
        const count = Math.round(days / step);

        for (let k = 0; k <= count; k++) {

            const time = t + k * step;
            const sample = this.sample(x, z, time, emptySample());

            sample.time = time;
            result.push(sample);

        }

        return result;

    }

}
