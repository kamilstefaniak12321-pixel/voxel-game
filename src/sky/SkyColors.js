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
//   ambient         - siła światła "z całego nieba" na blokach
//   sunLight        - siła światła słońca na blokach
//
// KOLOR światła na blokach nie jest wpisany w tabelę - wynika
// z kolorów nieba (patrz "Barwa światła" niżej). Dzięki temu inny
// wariant zachodu albo inny kolor księżyca sam lekko zabarwia świat.
//
// Światło księżyca dokłada się osobno (niżej, MOON_...).
// ------------------------------------------------------------

const SKY_TABLE = [

    // głęboka noc
    {
        at: -1, zenith: '#01030a', horizon: '#03070f',
        sunset: '#000000', high: '#000000', glow: 0, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.04, sunLight: 0
    },
    {
        at: -0.3, zenith: '#01030a', horizon: '#03070f',
        sunset: '#000000', high: '#000000', glow: 0, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.04, sunLight: 0
    },

    // zmierzch: ostatnie światło za horyzontem
    {
        at: -0.16, zenith: '#040a1e', horizon: '#0c1229',
        sunset: '#2a1430', high: '#1a1534', glow: 0.6, halo: '#000000', disc: '#ff5a1e',
        ambient: 0.07, sunLight: 0
    },
    {
        at: -0.07, zenith: '#0f1d44', horizon: '#30335a',
        sunset: '#a34428', high: '#5c3762', glow: 1, halo: '#2a0e04', disc: '#ff5a1e',
        ambient: 0.18, sunLight: 0
    },

    // słońce na horyzoncie
    {
        at: 0, zenith: '#23407c', horizon: '#7e7f9e',
        sunset: '#ff6a2c', high: '#b7678e', glow: 1, halo: '#8a3a12', disc: '#ff7020',
        ambient: 0.38, sunLight: 0.15
    },
    {
        at: 0.08, zenith: '#386ab6', horizon: '#b9b6b4',
        sunset: '#ffa24c', high: '#d79ca6', glow: 0.65, halo: '#8a5a2a', disc: '#ffc070',
        ambient: 0.55, sunLight: 0.6
    },

    // dzień
    {
        at: 0.22, zenith: '#4f8fdc', horizon: '#87ceeb',
        sunset: '#ffd9a0', high: '#cfe0f0', glow: 0, halo: '#5a5040', disc: '#fff4d8',
        ambient: 0.7, sunLight: 0.9
    },
    {
        at: 1, zenith: '#4f8fdc', horizon: '#87ceeb',
        sunset: '#ffd9a0', high: '#cfe0f0', glow: 0, halo: '#5a5040', disc: '#fff4d8',
        ambient: 0.7, sunLight: 0.9
    }

];


// NOC ZALEŻY OD KSIĘŻYCA
//
// Bez księżyca (nów) noc jest ciemna - na blokach zostaje tylko
// słabe światło gwiazd (`ambient` w nocnych wierszach tabeli).
// Księżyc dokłada światło - najwięcej w pełni, gdy jest wysoko:
// wtedy widać całkiem dobrze, ale w chłodnych, srebrnych barwach
// (świat jest nocą odbarwiony - NIGHT_DESATURATION).
// Kolory poniżej są dla zwykłego, białego księżyca - inny kolor
// księżyca (wariant) odpowiednio je zabarwia.

export const DEFAULT_MOON_COLOR = new THREE.Color('#f2f2ff');

const MOON_SKY_GLOW = new THREE.Color('#0b1733');
const MOON_AMBIENT = 0.2;
const MOON_AMBIENT_COLOR = new THREE.Color('#7f90c8');
const MOON_LIGHT = 0.32;
const MOON_LIGHT_COLOR = new THREE.Color('#a8b8f0');


// BARWA ŚWIATŁA - jak mocno światło na blokach bierze kolor od:

// nieba (otoczenie) - w dzień lekko, w nocy mocniej (niebieskawa noc),
const AMBIENT_TINT_DAY = 0.25;
const AMBIENT_TINT_NIGHT = 0.55;

// tarczy słońca (światło słońca - białe w południe, pomarańczowe o zachodzie),
const SUN_TINT = 0.75;

// koloru księżyca (światło księżyca i poświata nieba wokół niego).
const MOON_TINT = 0.5;


// Jak bardzo świat traci kolory w nocy (0 = wcale, 1 = szaro-niebieski).
// Światło lamp zostaje kolorowe.
const NIGHT_DESATURATION = 0.6;

// Jaka część gwiazd (najsłabszych) znika w pełni, gdy księżyc jest wysoko.
const MOON_HIDES_STARS = 0.75;

// Spadające gwiazdy na minutę w najciemniejszą noc (nów)
// i ile razy więcej w noc z deszczem meteorów.
const METEORS_PER_MINUTE = 10;
const METEOR_SHOWER_FACTOR = 5;


// Zamieniamy teksty kolorów na obiekty Color (raz, przy starcie).

const COLOR_FIELDS = [
    'zenith', 'horizon', 'sunset', 'high', 'halo', 'disc'
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


// Sam odcień koloru: najjaśniejsza składowa = 1.

function hueOf(out, color) {

    const brightest = Math.max(color.r, color.g, color.b, 0.00001);

    return out.copy(color).multiplyScalar(1 / brightest);

}


// Jasność koloru (jak ją widzi oko).

function luminance(color) {

    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

}


// Zmienia odcień koloru na odcień `hue`, zachowując jasność
// najjaśniejszej składowej.

function retint(color, hue) {

    const brightest = Math.max(color.r, color.g, color.b);

    hueOf(color, hue).multiplyScalar(brightest);

}


// Kolor `base` zabarwiony odcieniem koloru księżyca (dla zwykłego
// księżyca wychodzi `base` bez zmian), z siłą MOON_TINT.

function tintByMoon(out, base, moonHue, defaultMoonHue) {

    out.setRGB(
        base.r * moonHue.r / defaultMoonHue.r,
        base.g * moonHue.g / defaultMoonHue.g,
        base.b * moonHue.b / defaultMoonHue.b
    );

    // Ta sama jasność co bez zabarwienia.

    out.multiplyScalar(luminance(base) / Math.max(luminance(out), 0.00001));

    return out.lerp(base, 1 - MOON_TINT);

}


const _hue = new THREE.Color();
const _moonHue = new THREE.Color();
const _defaultMoonHue = hueOf(new THREE.Color(), DEFAULT_MOON_COLOR);
const _tinted = new THREE.Color();
const _white = new THREE.Color(1, 1, 1);


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

        // Jaka część najsłabszych gwiazd jest schowana (0 = widać
        // wszystkie, w nowiu), jak bardzo widać Drogę Mleczną i ile
        // spadających gwiazd przypada na minutę.

        this.starLimit = 0;
        this.galaxyVisibility = 0;
        this.meteorsPerMinute = 0;

        // Noc z deszczem meteorów (ustawia Sky).

        this.meteorShower = false;

        // Nocne odbarwienie świata i barwa, w którą idzie.

        this.nightDesaturation = 0;
        this.nightTint = new THREE.Color(1, 1, 1);

        // Światło na blokach.

        this.ambientIntensity = 0.7;
        this.ambientColor = new THREE.Color();

        this.sunLightIntensity = 0.9;
        this.sunLightColor = new THREE.Color();

        this.moonLightIntensity = 0;
        this.moonLightColor = new THREE.Color().copy(MOON_LIGHT_COLOR);

        // Kolor tarczy księżyca.

        this.moonColor = new THREE.Color().copy(DEFAULT_MOON_COLOR);

    }


    // Liczy stan nieba z położenia słońca i księżyca (Celestial).
    //
    // variant - zmiany wyglądu nieba (patrz Sky.variant):
    //   sunsetColor - inny kolor łuny wschodu/zachodu (albo null)
    //   moonColor   - inny kolor księżyca (albo null)

    update(celestial, variant = {}) {

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

        this.sunset = a.glow + (b.glow - a.glow) * t;
        this.ambientIntensity = a.ambient + (b.ambient - a.ambient) * t;
        this.sunLightIntensity = a.sunLight + (b.sunLight - a.sunLight) * t;


        this.daylight = smoothstep(-0.16, 0.05, sun);


        // Wariant zachodu: inny odcień łuny (ta sama jasność).

        if (variant.sunsetColor) {

            retint(this.sunsetColor, variant.sunsetColor);

            // Słońce nisko nad horyzontem też bierze trochę tego koloru
            // (a od niego światło słońca na blokach).

            _tinted.copy(this.sunDiscColor);

            retint(_tinted, variant.sunsetColor);

            this.sunDiscColor.lerp(_tinted, this.sunset * 0.5);

            this.sunsetHigh.lerp(
                _tinted.copy(this.sunsetHigh).multiply(hueOf(_hue, variant.sunsetColor)),
                0.6
            );

        }


        // Kolor księżyca (zwykły albo z wariantu).

        this.moonColor.copy(variant.moonColor ?? DEFAULT_MOON_COLOR);

        hueOf(_moonHue, this.moonColor);


        // Księżyc: im wyżej, bliżej pełni i ciemniejsza noc,
        // tym bardziej rozjaśnia niebo i świat.

        const moonUp = smoothstep(-0.03, 0.12, celestial.moonHeight);

        const moonGlow =
            celestial.moonIllumination * moonUp * (1 - this.daylight);

        tintByMoon(_tinted, MOON_SKY_GLOW, _moonHue, _defaultMoonHue);

        addScaled(this.zenith, _tinted, moonGlow);
        addScaled(this.horizon, _tinted, moonGlow * 1.3);


        // BARWA ŚWIATŁA OTOCZENIA: odcień całego nieba (zenit, horyzont
        // i łuna zachodu), lekko - w dzień ledwo, w nocy wyraźniej.

        _hue.copy(this.zenith).add(this.horizon);

        addScaled(_hue, this.sunsetColor, this.sunset * 0.6);

        hueOf(_hue, _hue);

        const ambientTint =
            AMBIENT_TINT_NIGHT + (AMBIENT_TINT_DAY - AMBIENT_TINT_NIGHT) * this.daylight;

        this.ambientColor.copy(_white).lerp(_hue, ambientTint);

        // Ta sama jasność co białe światło.

        this.ambientColor.multiplyScalar(1 / luminance(this.ambientColor));


        // Poświata księżyca w nocy (w jego kolorze).

        tintByMoon(_tinted, MOON_AMBIENT_COLOR, _moonHue, _defaultMoonHue);

        this.ambientColor.lerp(_tinted, moonGlow * 0.5);
        this.ambientIntensity += MOON_AMBIENT * moonGlow;


        // BARWA ŚWIATŁA SŁOŃCA: odcień tarczy słońca.

        this.sunLightColor.copy(_white).lerp(hueOf(_hue, this.sunDiscColor), SUN_TINT);


        // BARWA ŚWIATŁA KSIĘŻYCA: niebieskawa, zabarwiona kolorem księżyca.

        tintByMoon(this.moonLightColor, MOON_LIGHT_COLOR, _moonHue, _defaultMoonHue);

        this.moonLightIntensity = MOON_LIGHT * moonGlow;


        // W dzień księżyc jest blady, w nocy jasny.

        this.moonBrightness = 0.45 + 0.55 * (1 - this.daylight);


        // Nocą świat traci kolory i idzie w barwę światła księżyca.

        this.nightDesaturation = NIGHT_DESATURATION * (1 - this.daylight);

        hueOf(this.nightTint, this.moonLightColor);

        this.nightTint.multiplyScalar(1 / luminance(this.nightTint));


        // NIEBO NOCĄ: im ciemniejsze niebo, tym więcej na nim widać.
        // Zmierzch i jasny księżyc chowają najsłabsze gwiazdy.

        const night = 1 - smoothstep(-0.2, -0.03, sun);

        const moonLight = celestial.moonIllumination * moonUp;

        this.starVisibility = night;

        const twilightLimit = 1 - night;
        const moonLimit = MOON_HIDES_STARS * moonLight;

        this.starLimit = 1 - (1 - twilightLimit) * (1 - moonLimit);

        this.galaxyVisibility = night * night * (1 - 0.92 * moonLight);

        this.meteorsPerMinute =
            METEORS_PER_MINUTE *
            night *
            (0.15 + 0.85 * (1 - moonLight)) *
            (this.meteorShower ? METEOR_SHOWER_FACTOR : 1);

    }

}
