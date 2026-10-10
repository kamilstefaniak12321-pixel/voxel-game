import * as THREE from 'three';

import {
    SUN_PATH_TILT,
    MOON_CYCLE_DAYS
} from '../config.js';

// ------------------------------------------------------------
// CIAŁA NIEBIESKIE
//
// Gdzie na niebie jest słońce, księżyc i gwiazdy w danej chwili
// (sama matematyka, nic tu nie jest rysowane).
//
// Kierunki są wektorami długości 1 w układzie świata:
//   +X = wschód, -X = zachód, +Y = góra, +Z = południe, -Z = północ.
//
// SŁOŃCE wschodzi o 6:00 na wschodzie, w południe jest najwyżej
// (po południowej stronie nieba, patrz SUN_PATH_TILT), zachodzi
// o 18:00 na zachodzie.
//
// KSIĘŻYC krąży po prawie tej samej drodze, ale co dzień zostaje
// trochę w tyle za słońcem (wschodzi później). Faza wynika z tego,
// jak daleko jest od słońca - tak jak naprawdę:
//   blisko słońca  -> nów (niewidoczny, wędruje razem ze słońcem w dzień)
//   90° za słońcem -> pierwsza kwadra (widoczny po południu i wieczorem)
//   naprzeciw      -> pełnia (wschodzi o zachodzie słońca, świeci całą noc)
//   270°           -> ostatnia kwadra (świeci nad ranem i przed południem)
// Oświetlona strona tarczy jest zawsze zwrócona do słońca.
//
// GWIAZDY obracają się razem z niebem wokół bieguna (na północy,
// SUN_PATH_TILT stopni nad horyzontem) i z dnia na dzień trochę
// się przesuwają - po STAR_DRIFT_DAYS dniach niebo wraca na swoje
// miejsce o tej samej godzinie.
// ------------------------------------------------------------

const DEG = Math.PI / 180;


// Droga księżyca jest lekko nachylona do drogi słońca (jak naprawdę
// o ~5°), więc tylko czasem przechodzi dokładnie przez słońce.

const MOON_ORBIT_TILT = 5 * DEG;


// Przesunięcie cyklu księżyca: nowy świat zaczyna się tak, że
// pierwszej nocy księżyc jest blisko pełni.

const MOON_PHASE_OFFSET_DAYS = MOON_CYCLE_DAYS * 0.44;


const STAR_DRIFT_DAYS = 40;


const EAST = new THREE.Vector3(1, 0, 0);

// Punkt drogi słońca w południe (nad południowym horyzontem).

const SUN_NOON = new THREE.Vector3(
    0,
    Math.cos(SUN_PATH_TILT * DEG),
    Math.sin(SUN_PATH_TILT * DEG)
);

const MOON_NOON = new THREE.Vector3(
    0,
    Math.cos(SUN_PATH_TILT * DEG + MOON_ORBIT_TILT),
    Math.sin(SUN_PATH_TILT * DEG + MOON_ORBIT_TILT)
);

// Oś, wokół której obraca się całe niebo (biegun).

const SKY_AXIS = new THREE.Vector3()
    .crossVectors(EAST, SUN_NOON)
    .normalize();


// Nazwy ośmiu faz księżyca (do debugu).

export const MOON_PHASE_NAMES = [
    'nów',
    'przybywający sierp',
    'pierwsza kwadra',
    'przybywający garb',
    'pełnia',
    'ubywający garb',
    'ostatnia kwadra',
    'ubywający sierp'
];


// Punkt na drodze ciała niebieskiego: angle = 0 -> wschód na
// horyzoncie, PI/2 -> najwyżej (noon), PI -> zachód.

function pointOnPath(out, noon, angle) {

    return out
        .copy(EAST)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(noon, Math.sin(angle));

}

// ------------------------------------------------------------

export class Celestial {

    constructor() {

        // Kierunek DO słońca i DO księżyca.

        this.sunDirection = new THREE.Vector3(0, 1, 0);
        this.moonDirection = new THREE.Vector3(0, -1, 0);


        // Faza księżyca: 0 = nów, 0.25 = pierwsza kwadra,
        // 0.5 = pełnia, 0.75 = ostatnia kwadra.

        this.moonPhase = 0;

        // Jaka część tarczy jest oświetlona (0 = nów, 1 = pełnia).

        this.moonIllumination = 0;


        // Obrót sfery z gwiazdami.

        this.starRotation = new THREE.Quaternion();

    }


    // days - czas świata (WorldTime.days)

    update(days) {

        const timeOfDay = days - Math.floor(days);

        const sunAngle = 2 * Math.PI * (timeOfDay - 0.25);

        pointOnPath(this.sunDirection, SUN_NOON, sunAngle);


        const cycle = (days + MOON_PHASE_OFFSET_DAYS) / MOON_CYCLE_DAYS;

        this.moonPhase = cycle - Math.floor(cycle);

        const distanceFromSun = 2 * Math.PI * this.moonPhase;

        pointOnPath(this.moonDirection, MOON_NOON, sunAngle - distanceFromSun);

        this.moonIllumination = (1 - Math.cos(distanceFromSun)) / 2;


        this.starRotation.setFromAxisAngle(
            SKY_AXIS,
            sunAngle + 2 * Math.PI * days / STAR_DRIFT_DAYS
        );

    }


    // Jak wysoko jest słońce: -1 (pod stopami) .. 0 (horyzont) .. 1.

    get sunHeight() {

        return this.sunDirection.y;

    }


    get moonHeight() {

        return this.moonDirection.y;

    }


    get moonPhaseName() {

        return MOON_PHASE_NAMES[Math.round(this.moonPhase * 8) % 8];

    }

}
