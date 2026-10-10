import * as THREE from 'three';

import {
    SUN_PATH_TILT,
    MOON_CYCLE_DAYS,
    SUN_DIAMETER,
    MOON_DIAMETER,
    ECLIPSE_CHANCE,
    ECLIPSE_TOTAL_SHARE
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
// Droga księżyca nie pokrywa się dokładnie z drogą słońca: księżyc
// chodzi kilka-kilkanaście stopni na północ albo na południe od niej
// ("szerokość"), a ta zmienia się płynnie z cyklu na cykl. Zwykle
// w nowiu mija słońce bokiem. Ale w niektóre nowie (ECLIPSE_CHANCE)
// przechodzi przed nim - to ZAĆMIENIE SŁOŃCA: częściowe (zasłania
// kawałek tarczy) albo pełne (zasłania całą). Które nowie to będą,
// wynika z numeru cyklu - zawsze te same, nic nie jest losowane
// w trakcie gry.
//
// GWIAZDY obracają się razem z niebem wokół bieguna (na północy,
// SUN_PATH_TILT stopni nad horyzontem) i z dnia na dzień trochę
// się przesuwają - po STAR_DRIFT_DAYS dniach niebo wraca na swoje
// miejsce o tej samej godzinie.
// ------------------------------------------------------------

const DEG = Math.PI / 180;


// Promienie tarcz w stopniach. Widoczna tarcza słońca jest trochę
// mniejsza niż jej kwadrat (brzeg jest rozmyty - patrz layers/Sun.js).

export const SUN_RADIUS = SUN_DIAMETER / 2 * 0.96;
export const MOON_RADIUS = MOON_DIAMETER / 2;


// Jak daleko od drogi słońca (w stopniach) chodzi księżyc w nowie
// bez zaćmienia: od brzegu tarczy słońca + MISS_MARGIN do + MISS_SPREAD.

const MISS_MARGIN = 1.5;
const MISS_SPREAD = 8;


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

// Oś, wokół której obraca się całe niebo (biegun). Szerokość
// księżyca to przesunięcie wzdłuż tej osi.

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


// Liczby 0..1 z numeru cyklu księżyca (zawsze te same dla tego numeru).

function cycleRandom(cycle, salt) {

    let h = Math.imul(cycle ^ 0x5bd1e995, 2654435761) ^ Math.imul(salt + 1, 0x27d4eb2d);

    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;

}


// Szerokość księżyca (w stopniach) w nowiu numer `cycle`, czyli jak
// daleko od środka słońca przechodzi. Mniej niż SUN_RADIUS +
// MOON_RADIUS = zaćmienie.
//
// override - zaćmienie wymuszone komendą: { cycle, latitude }

export function newMoonLatitude(cycle, override = null) {

    if (override && override.cycle === cycle) {
        return override.latitude;
    }


    const sign = cycleRandom(cycle, 3) < 0.5 ? -1 : 1;

    const touching = SUN_RADIUS + MOON_RADIUS;

    // Pełne zaćmienie: księżyc zakrywa całe słońce.
    const totalLimit = MOON_RADIUS - SUN_RADIUS;


    // Pierwsze dwa nowie nowego świata nigdy nie mają zaćmienia.

    if (cycle >= 3 && cycleRandom(cycle, 0) < ECLIPSE_CHANCE) {

        const spread = cycleRandom(cycle, 2);

        if (cycleRandom(cycle, 1) < ECLIPSE_TOTAL_SHARE) {
            return sign * spread * totalLimit * 0.8;
        }

        return sign * (totalLimit + spread * (touching * 0.9 - totalLimit));

    }


    return sign * (touching + MISS_MARGIN + cycleRandom(cycle, 2) * MISS_SPREAD);

}


// Jaka część tarczy słońca (0-1) jest zasłonięta przez księżyc,
// gdy ich środki dzieli `distance` stopni. Pole wspólnej części
// dwóch kół podzielone przez pole tarczy słońca.

export function sunCoverage(distance, sunRadius = SUN_RADIUS, moonRadius = MOON_RADIUS) {

    const R = sunRadius;
    const r = moonRadius;
    const d = distance;

    if (d >= R + r) {
        return 0;
    }

    if (d <= Math.abs(r - R)) {
        return r >= R ? 1 : (r * r) / (R * R);
    }


    const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
    const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
    const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));

    return Math.min(1, (a + b - c) / (Math.PI * R * R));

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


        // Zaćmienie słońca: odległość środków tarcz (stopnie) i jaka
        // część słońca jest zasłonięta (0 = nic, 1 = pełne zaćmienie).

        this.sunMoonDistance = 180;
        this.eclipse = 0;


        // Obrót sfery z gwiazdami.

        this.starRotation = new THREE.Quaternion();

    }


    // days     - czas świata (WorldTime.days)
    // override - zaćmienie wymuszone komendą (patrz newMoonLatitude)

    update(days, override = null) {

        const timeOfDay = days - Math.floor(days);

        const sunAngle = 2 * Math.PI * (timeOfDay - 0.25);

        pointOnPath(this.sunDirection, SUN_NOON, sunAngle);


        const cycle = (days + MOON_PHASE_OFFSET_DAYS) / MOON_CYCLE_DAYS;

        const cycleNumber = Math.floor(cycle);

        this.moonPhase = cycle - cycleNumber;

        const distanceFromSun = 2 * Math.PI * this.moonPhase;

        pointOnPath(this.moonDirection, SUN_NOON, sunAngle - distanceFromSun);

        this.moonIllumination = (1 - Math.cos(distanceFromSun)) / 2;


        // Szerokość księżyca płynnie przechodzi od wartości z tego nowiu
        // do wartości z następnego (w okolicy nowiu prawie się nie zmienia).

        const from = newMoonLatitude(cycleNumber, override);
        const to = newMoonLatitude(cycleNumber + 1, override);

        const blend = (1 - Math.cos(Math.PI * this.moonPhase)) / 2;

        const latitude = (from + (to - from) * blend) * DEG;

        this.moonDirection
            .multiplyScalar(Math.cos(latitude))
            .addScaledVector(SKY_AXIS, Math.sin(latitude));


        // Zaćmienie: jak blisko siebie są tarcze.

        const cosine = Math.max(-1, Math.min(1, this.sunDirection.dot(this.moonDirection)));

        this.sunMoonDistance = Math.acos(cosine) / DEG;

        this.eclipse = sunCoverage(this.sunMoonDistance);


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


// ------------------------------------------------------------
// NAJBLIŻSZE ZAĆMIENIA (dla komend)
//
// Zwraca listę `count` zaćmień od chwili `days`:
//   { cycle, days, coverage, total, visible }
//   days     - chwila największego zakrycia (czas świata),
//   coverage - jaka część słońca będzie zasłonięta (0-1),
//   total    - pełne zaćmienie,
//   visible  - słońce jest wtedy nad horyzontem.
// ------------------------------------------------------------

export function findEclipses(days, count = 1, override = null) {

    const found = [];

    const celestial = new Celestial();

    const first = Math.floor((days + MOON_PHASE_OFFSET_DAYS) / MOON_CYCLE_DAYS);


    for (let cycle = first; found.length < count && cycle < first + 2000; cycle++) {

        const latitude = Math.abs(newMoonLatitude(cycle, override));

        if (latitude >= SUN_RADIUS + MOON_RADIUS) {
            continue;
        }


        // Nów tego cyklu - wtedy tarcze są najbliżej siebie.

        const peak = cycle * MOON_CYCLE_DAYS - MOON_PHASE_OFFSET_DAYS;

        // Zaćmienie, które już się skończyło, pomijamy.

        if (peak < days - 0.1) {
            continue;
        }


        celestial.update(peak, override);

        found.push({
            cycle,
            days: peak,
            coverage: sunCoverage(latitude),
            total: latitude <= MOON_RADIUS - SUN_RADIUS,
            visible: celestial.sunHeight > 0
        });

    }


    return found;

}


// Numer cyklu księżyca, którego nów jest najbliżej po chwili `days`
// (dla wymuszonego zaćmienia).

export function nextNewMoonCycle(days) {

    return Math.floor((days + MOON_PHASE_OFFSET_DAYS) / MOON_CYCLE_DAYS) + 1;

}


// Chwila nowiu (czas świata) w cyklu numer `cycle`.

export function newMoonDays(cycle) {

    return cycle * MOON_CYCLE_DAYS - MOON_PHASE_OFFSET_DAYS;

}
