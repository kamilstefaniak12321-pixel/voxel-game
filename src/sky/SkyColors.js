import * as THREE from 'three';

// ------------------------------------------------------------
// KOLORY NIEBA I ŚWIATŁA O RÓŻNYCH PORACH DNIA
//
// Wszystko zależy od tego, jak wysoko jest słońce ("at"):
//   1 = słońce w zenicie, 0 = na horyzoncie, -1 = pod stopami.
// Między wierszami tabeli kolory płynnie się mieszają.
//
// TU ZMIENIASZ WYGLĄD NIEBA:
//   zenith, horizon - niebo nad głową i przy horyzoncie
//   sunset, high    - łuna zachodu (przy słońcu) i różowy pas wyżej
//   glow            - jak mocny jest zachód (0-1)
//   halo            - poświata wokół słońca
//   disc            - kolor tarczy słońca
//   ambient         - światło "z całego nieba" na blokach (siła i kolor)
//   sunLight        - światło słońca na blokach (siła i kolor)
//
// Światło księżyca dokłada się osobno (niżej, MOON_...).
// ------------------------------------------------------------

const SKY_TABLE = [

    // głęboka noc
    {
        at: -1, zenith: '#01030a', horizon: '#03070f',
        sunset: '#000000', high: '#000000', glow: 0, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.08, ambientColor: '#6a78a8', sunLight: 0, sunLightColor: '#ff7a3c'
    },
    {
        at: -0.3, zenith: '#01030a', horizon: '#03070f',
        sunset: '#000000', high: '#000000', glow: 0, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.08, ambientColor: '#6a78a8', sunLight: 0, sunLightColor: '#ff7a3c'
    },

    // zmierzch: ostatnie światło za horyzontem
    {
        at: -0.16, zenith: '#040a1e', horizon: '#0c1229',
        sunset: '#2a1430', high: '#1a1534', glow: 0.6, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.1, ambientColor: '#6a74a8', sunLight: 0, sunLightColor: '#ff7a3c'
    },
    {
        at: -0.07, zenith: '#0f1d44', horizon: '#30335a',
        sunset: '#a34428', high: '#5c3762', glow: 1, halo: '#2a0e04', disc: '#ff5a1e',
        ambient: 0.18, ambientColor: '#8a84b4', sunLight: 0, sunLightColor: '#ff7a3c'
    },

    // słońce na horyzoncie
    {
        at: 0, zenith: '#23407c', horizon: '#7e7f9e',
        sunset: '#ff6a2c', high: '#b7678e', glow: 1, halo: '#8a3a12', disc: '#ff7020',
        ambient: 0.38, ambientColor: '#ffd4c4', sunLight: 0.15, sunLightColor: '#ff7a3c'
    },
    {
        at: 0.08, zenith: '#386ab6', horizon: '#b9b6b4',
        sunset: '#ffa24c', high: '#d79ca6', glow: 0.65, halo: '#8a5a2a', disc: '#ffc070',
        ambient: 0.55, ambientColor: '#fff0e6', sunLight: 0.6, sunLightColor: '#ffc68c'
    },

    // dzień
    {
        at: 0.22, zenith: '#4f8fdc', horizon: '#87ceeb',
        sunset: '#ffd9a0', high: '#cfe0f0', glow: 0, halo: '#5a5040', disc: '#fff4d8',
        ambient: 0.7, ambientColor: '#ffffff', sunLight: 0.9, sunLightColor: '#fff8ee'
    },
    {
        at: 1, zenith: '#4f8fdc', horizon: '#87ceeb',
        sunset: '#ffd9a0', high: '#cfe0f0', glow: 0, halo: '#5a5040', disc: '#fff4d8',
        ambient: 0.7, ambientColor: '#ffffff', sunLight: 0.9, sunLightColor: '#fff8ee'
    }

];


// Księżyc w nocy: rozjaśnia niebo i daje słabe, niebieskawe
// światło (najmocniej w pełni, wcale w nowiu).

const MOON_SKY_GLOW = new THREE.Color('#0b1733');
const MOON_AMBIENT = 0.1;
const MOON_AMBIENT_COLOR = new THREE.Color('#7f90c8');
const MOON_LIGHT = 0.22;
const MOON_LIGHT_COLOR = new THREE.Color('#a8b8f0');


// Zamieniamy teksty kolorów na obiekty Color (raz, przy starcie).

const COLOR_FIELDS = [
    'zenith', 'horizon', 'sunset', 'high', 'halo', 'disc',
    'ambientColor', 'sunLightColor'
];

for (const row of SKY_TABLE) {

    for (const field of COLOR_FIELDS) {
        row[field] = new THREE.Color(row[field]);
    }

}


// color += other * amount

function addScaled(color, other, amount) {

    color.r += other.r * amount;
    color.g += other.g * amount;
    color.b += other.b * amount;

}


function smoothstep(edge0, edge1, x) {

    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}

// ------------------------------------------------------------
// STAN NIEBA - wszystko, czego potrzebują warstwy nieba i światła
// świata w danej chwili. Liczony raz na klatkę.
// ------------------------------------------------------------

export class SkyState {

    constructor() {

        this.zenith = new THREE.Color();
        this.horizon = new THREE.Color();
        this.sunsetColor = new THREE.Color();
        this.sunsetHigh = new THREE.Color();
        this.sunset = 0;
        this.sunHalo = new THREE.Color();

        this.sunDiscColor = new THREE.Color();

        // 1 = jasny dzień, 0 = noc (słońce głęboko pod horyzontem).

        this.daylight = 1;

        // Jak bardzo widać gwiazdy (0-1) i jak jasny jest księżyc.

        this.starVisibility = 0;
        this.moonBrightness = 1;

        // Światło na blokach.

        this.ambientIntensity = 0.7;
        this.ambientColor = new THREE.Color();

        this.sunLightIntensity = 0.9;
        this.sunLightColor = new THREE.Color();

        this.moonLightIntensity = 0;
        this.moonLightColor = new THREE.Color().copy(MOON_LIGHT_COLOR);

    }


    // Liczy stan nieba z położenia słońca i księżyca (Celestial).

    update(celestial) {

        const sun = celestial.sunHeight;


        // Dwa sąsiednie wiersze tabeli i jak daleko między nimi.

        let i = 0;

        while (i < SKY_TABLE.length - 2 && SKY_TABLE[i + 1].at <= sun) {
            i++;
        }

        const a = SKY_TABLE[i];
        const b = SKY_TABLE[i + 1];

        const t = Math.min(1, Math.max(0, (sun - a.at) / (b.at - a.at)));


        this.zenith.lerpColors(a.zenith, b.zenith, t);
        this.horizon.lerpColors(a.horizon, b.horizon, t);
        this.sunsetColor.lerpColors(a.sunset, b.sunset, t);
        this.sunsetHigh.lerpColors(a.high, b.high, t);
        this.sunHalo.lerpColors(a.halo, b.halo, t);
        this.sunDiscColor.lerpColors(a.disc, b.disc, t);
        this.ambientColor.lerpColors(a.ambientColor, b.ambientColor, t);
        this.sunLightColor.lerpColors(a.sunLightColor, b.sunLightColor, t);

        this.sunset = a.glow + (b.glow - a.glow) * t;
        this.ambientIntensity = a.ambient + (b.ambient - a.ambient) * t;
        this.sunLightIntensity = a.sunLight + (b.sunLight - a.sunLight) * t;


        this.daylight = smoothstep(-0.16, 0.05, sun);


        // Księżyc: im wyżej, bliżej pełni i ciemniejsza noc,
        // tym bardziej rozjaśnia niebo i świat.

        const moonUp = smoothstep(-0.03, 0.12, celestial.moonHeight);

        const moonGlow =
            celestial.moonIllumination * moonUp * (1 - this.daylight);

        addScaled(this.zenith, MOON_SKY_GLOW, moonGlow);
        addScaled(this.horizon, MOON_SKY_GLOW, moonGlow * 1.3);

        this.ambientColor.lerp(MOON_AMBIENT_COLOR, moonGlow * 0.5);
        this.ambientIntensity += MOON_AMBIENT * moonGlow;

        this.moonLightIntensity = MOON_LIGHT * moonGlow;


        // W dzień księżyc jest blady, w nocy jasny.

        this.moonBrightness = 0.45 + 0.55 * (1 - this.daylight);


        // Gwiazdy wychodzą po zmierzchu; jasny księżyc część zagłusza.

        this.starVisibility =
            (1 - smoothstep(-0.2, -0.03, sun)) *
            (1 - 0.35 * celestial.moonIllumination * moonUp);

    }

}
