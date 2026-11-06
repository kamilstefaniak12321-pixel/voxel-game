import { SURFACE_PROFILES } from './SurfaceProfiles.js';

// ------------------------------------------------------------
// MODEL Z PŁASZCZYZN (poziom "półrealistyczny" - src/blocks/plantModels.js)
//
// Roślina złożona z małych, płaskich kart z tekstury 16 x 16: łodygi
// (dwie skrzyżowane karty), liście odchylone od łodygi, kwiat z kilku
// kart pod różnymi kątami. Piksele zostają pikselami (1 piksel tekstury
// = 1/16 bloku), a cieniowanie jest namalowane w teksturze.
//
// Tekstura (16 x 16, assets/models/rosliny/<roślina>/polrealistyczny.png):
//
//    x 0-7     x 8-15
//   +---------+---------+
//   | kwiat   | kwiat   |  y 0-7
//   | z boku  | z góry  |
//   +---------+-+-------+
//   | liść    |Ł| płatek|  y 8-15   Ł - łodyga (x 8-9)
//   |         | | / pąk |           płatek - x 10-15
//   +---------+-+-------+
//
// Opis kształtu (model.json, "polrealistyczny"):
//   lodygi:  { ile, wysokosc, promien, pochylenie }  (piksele, stopnie)
//   liscie:  { ile, dlugosc, wysokosc, nachylenie }  (wysokosc - gdzie
//            liść odchodzi od łodygi; nachylenie - od pionu)
//   kwiat:   { rodzaj, rozmiar }  rodzaj: kielich | gwiazda | pompon |
//            koszyczek | klos
//
// Wynik - ściany jak w BushyGrassGeometry.js (karty z teksturą, obie
// strony, waga wiatru rośnie z wysokością - korzenie stoją).
// ------------------------------------------------------------

const PX = 1 / 16;

// Obszary tekstury w pikselach: [x, y, szerokość, wysokość].
export const PLANE_REGIONS = {
    side: [0, 0, 8, 8],
    top: [8, 0, 8, 8],
    leaf: [0, 8, 8, 8],
    stem: [8, 8, 2, 8],
    petal: [10, 8, 6, 8]
};

export const PLANE_FLOWERS = ['kielich', 'gwiazda', 'pompon', 'koszyczek', 'klos', 'dzwonek', 'owoce'];

// Układ liści: wokol - od podstawy łodygi dookoła (rozeta, kępa),
// kopula - na kopułce (krzaki, sadzonki drzew), pion - prawie pionowe
// źdźbła rozstawione w promieniu (trawy, trzcina).
export const PLANE_LEAF_LAYOUTS = ['wokol', 'kopula', 'pion'];

function randomFor(seed) {
    let value = seed | 0;
    return () => {
        value = Math.imul(value ^ (value >>> 15), 2246822519);
        value = Math.imul(value ^ (value >>> 13), 3266489917);
        value ^= value >>> 16;
        return (value >>> 0) / 4294967296;
    };
}

const sub = (a, b) => a.map((n, i) => n - b[i]);
const add = (a, b) => a.map((n, i) => n + b[i]);
const scale = (a, s) => a.map((n) => n * s);

// Obrót wokół osi Y (yaw) i odchylenie od pionu w stronę (sin, cos) yaw.
function direction(yaw, tilt) {
    return [Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt)];
}


// Karta: dolna krawędź na środku w punkcie base, "up" - kierunek do góry
// karty (długość = wysokość), "right" - połowa szerokości w bok.
// region - obszar tekstury; flip - lustrzane odbicie poziome.

function card(faces, texture, region, base, up, right, height, flip = false) {

    const [rx, ry, rw, rh] = region;

    const u0 = rx / 16, u1 = (rx + rw) / 16, v0 = ry / 16, v1 = (ry + rh) / 16;

    const left = flip ? u1 : u0, right_ = flip ? u0 : u1;

    const a = sub(base, right);
    const b = add(base, right);
    const c = add(b, up);
    const d = add(a, up);

    // Rogi ściany jak w ChunkMesher: 0 lewy górny, 1 prawy górny,
    // 2 lewy dolny, 3 prawy dolny; druga strona - lustrzana.
    const vertices = [d, c, a, b];
    const uv = [[left, v0], [right_, v0], [left, v1], [right_, v1]];

    // Normalna: jak zwykłe rośliny (do góry), z lekkim odchyleniem
    // w stronę karty - obie strony jasne jak obrazek prostej rośliny,
    // a karty pod różnymi kątami różnią się trochę odcieniem.
    const normal = (() => {
        const ab = sub(b, a), ad = sub(d, a);
        let n = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
        const length = Math.hypot(...n) || 1;
        n = n.map((value) => value / length);
        if (n[1] < 0) n = n.map((value) => -value);
        const blended = [n[0] * 0.4, n[1] * 0.4 + 0.9, n[2] * 0.4];
        const size = Math.hypot(...blended);
        return blended.map((value) => value / size);
    })();

    for (const order of [[0, 1, 2, 3], [1, 0, 3, 2]]) {

        const points = order.map((i) => vertices[i]);

        faces.push({
            vertices: points,
            uv: order.map((i) => uv[i]),
            normal,
            texture,
            color: [255, 255, 255],
            surfaceProfile: SURFACE_PROFILES.leaf,
            movement: 0,
            weights: points.map((point) => Math.round(Math.max(0, Math.min(1, point[1] / height)) * 255))
        });

    }

}


// Karta pozioma (kwiat z góry): środek w center, bok size, lekko
// pochylona (tilt) w stronę yaw.

function flatCard(faces, texture, region, center, size, yaw, tilt, height) {

    const half = size / 2;
    const forward = [Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)];
    const right = [Math.cos(yaw) * half, 0, -Math.sin(yaw) * half];

    card(faces, texture, region, sub(center, scale(forward, half)), scale(forward, size), right, height);

}


// Kwiat na szczycie łodygi (top - punkt w blokach, size - piksele).

function flower(faces, texture, kind, top, size, yaw, height, random) {

    const s = size * PX;

    if (kind === 'kielich') {

        // Cztery płatki odchylone na zewnątrz i dno kielicha z góry.
        for (let i = 0; i < 4; i++) {
            const angle = yaw + Math.PI / 4 + i * Math.PI / 2;
            const up = scale(direction(angle, 0.45 + random() * 0.15), s);
            const right = [Math.cos(angle) * s * 0.42, 0, -Math.sin(angle) * s * 0.42];
            const base = add(top, [Math.sin(angle) * s * 0.12, 0, Math.cos(angle) * s * 0.12]);
            card(faces, texture, PLANE_REGIONS.petal, base, up, right, height, i % 2 === 1);
        }

        flatCard(faces, texture, PLANE_REGIONS.top, add(top, [0, s * 0.18, 0]), s * 0.7, yaw, 0, height);

    }

    else if (kind === 'gwiazda' || kind === 'pompon') {

        // Główka z boku na skrzyżowanych kartach i z góry.
        const cards = kind === 'pompon' ? 3 : 2;
        for (let i = 0; i < cards; i++) {
            const angle = yaw + i * Math.PI / cards;
            card(faces, texture, PLANE_REGIONS.side, add(top, [0, -s * 0.15, 0]), [0, s, 0], [Math.cos(angle) * s / 2, 0, -Math.sin(angle) * s / 2], height, i % 2 === 1);
        }
        flatCard(faces, texture, PLANE_REGIONS.top, add(top, [0, s * (kind === 'pompon' ? 0.62 : 0.5), 0]), s, yaw, 0.12, height);

    }

    else if (kind === 'koszyczek') {

        // Rumianek: koszyczek z góry, lekko przechylony, i wypukły środek z boku.
        flatCard(faces, texture, PLANE_REGIONS.top, add(top, [0, s * 0.12, 0]), s, yaw, 0.2 + random() * 0.25, height);
        card(faces, texture, PLANE_REGIONS.side, add(top, [0, -s * 0.3, 0]), [0, s * 0.7, 0], [Math.cos(yaw) * s * 0.35, 0, -Math.sin(yaw) * s * 0.35], height);

    }

    else if (kind === 'dzwonek') {

        // Dzwonek: kwiat zwisa z wygiętej łodygi - dwie skrzyżowane karty
        // z boku, trochę niżej i na zewnątrz końca łodygi.
        const out = [Math.sin(yaw) * s * 0.35, -s * 0.85, Math.cos(yaw) * s * 0.35];
        for (let i = 0; i < 2; i++) {
            const angle = yaw + i * Math.PI / 2;
            card(faces, texture, PLANE_REGIONS.side, add(top, out), [0, s, 0], [Math.cos(angle) * s / 2, 0, -Math.sin(angle) * s / 2], height, i === 1);
        }

    }

    else if (kind === 'klos') {

        // Kłos: dwie skrzyżowane, wąskie karty nad łodygą.
        for (let i = 0; i < 2; i++) {
            const angle = yaw + i * Math.PI / 2;
            card(faces, texture, PLANE_REGIONS.petal, top, [0, s * 4 / 3, 0], [Math.cos(angle) * s / 2, 0, -Math.sin(angle) * s / 2], height, i === 1);
        }

    }

}


// spec - "polrealistyczny" z model.json (już sprawdzony - plantModels.js),
// texture - nazwa kafelka atlasu, variant 0-7 - odmiana (obrót liści,
// pochylenie łodyg). Zwraca listę ścian.

export function makePlaneModel(spec, texture, variant, seed = 0) {

    const random = randomFor(seed * 7919 + variant * 104729 + 17);

    const faces = [];


    // Prosty poziom bloku z własnym modelem (krzaki, rośliny nad wodą):
    // dwie skrzyżowane karty z całym obrazkiem 16 x 16.

    if (spec.krzyz) {

        const size = spec.krzyz.rozmiar * PX;
        const yaw = variant * Math.PI / 8;

        for (let i = 0; i < 2; i++) {
            const angle = yaw + Math.PI / 4 + i * Math.PI / 2;
            card(faces, texture, [0, 0, 16, 16], [0, 0, 0], [0, size, 0], [Math.cos(angle) * size * 0.45, 0, -Math.sin(angle) * size * 0.45], size, i === 1);
        }

        return faces;

    }

    const stems = spec.lodygi ?? { ile: 0 };
    const leaves = spec.liscie ?? { ile: 0 };
    const bloom = spec.kwiat ?? null;

    const stemCount = stems.ile ?? 0;
    const stemHeight = (stems.wysokosc ?? 8) * PX;
    const flowerSize = bloom ? (bloom.rozmiar ?? 6) : 0;
    const layout = leaves.uklad ?? 'wokol';
    const dome = (leaves.kopula ?? 8) * PX;
    const height = Math.max(stemHeight + flowerSize * PX, (leaves.dlugosc ?? 0) * PX + (layout === 'kopula' ? dome : 0), 0.1);
    const yaw0 = variant * Math.PI / 4 + random() * 0.4;


    // Kopułka: liście na kilku wysokościach, odchylone na zewnątrz
    // (wyżej - mniej, u góry prawie płasko); owoce między nimi.

    if (layout === 'kopula') {

        const radius = (leaves.promien ?? 4) * PX;
        const count = leaves.ile ?? 8;
        const spots = [];

        for (let i = 0; i < count; i++) {
            const t = (i + 0.5) / count;
            const yaw = yaw0 + i * 2.39996 + (random() - 0.5) * 0.4;
            const level = Math.sqrt(t) * dome;
            const out = radius * Math.sqrt(Math.max(0, 1 - (level / Math.max(dome, PX)) ** 2)) * (0.6 + random() * 0.4);
            const length = (leaves.dlugosc ?? 6) * PX * (0.85 + random() * 0.3);
            // Niżej - liście bardziej na boki, u góry - w górę: okrągła kopułka.
            const tilt = ((leaves.nachylenie ?? 50) * (1.25 - 0.7 * t) + (random() - 0.5) * 14) * Math.PI / 180;
            const base = [Math.sin(yaw) * out * 0.7, level * 0.8, Math.cos(yaw) * out * 0.7];
            const right = [Math.cos(yaw) * length / 2, 0, -Math.sin(yaw) * length / 2];
            card(faces, texture, PLANE_REGIONS.leaf, base, scale(direction(yaw, Math.min(1.45, tilt)), length), right, height, i % 2 === 1);
            spots.push(add(base, scale(direction(yaw, Math.min(1.45, tilt)), length * 0.6)));
        }

        // Pień / gałązki w środku (sadzonki, krzaki).
        if (leaves.pien) {
            for (let j = 0; j < 2; j++) {
                const angle = yaw0 + j * Math.PI / 2;
                card(faces, texture, PLANE_REGIONS.stem, [0, 0, 0], [0, dome * 0.8, 0], [Math.cos(angle) * PX, 0, -Math.sin(angle) * PX], height, j === 1);
            }
        }

        if (bloom?.rodzaj === 'owoce') {
            const s = (bloom.rozmiar ?? 4) * PX;
            for (let i = 0; i < (bloom.ile ?? 4); i++) {
                const spot = spots[(i * 3 + variant) % spots.length];
                const yaw = yaw0 + i * 1.7;
                card(faces, texture, PLANE_REGIONS.petal, add(spot, [0, -s * 0.5, 0]), [0, s * 4 / 3, 0], [Math.cos(yaw) * s / 2, 0, -Math.sin(yaw) * s / 2], height, i % 2 === 1);
            }
        }

    }


    // Źdźbła: prawie pionowe, w promieniu, różnej długości.

    else if (layout === 'pion') {

        const radius = (leaves.promien ?? 3) * PX;

        for (let i = 0; i < (leaves.ile ?? 6); i++) {
            const yaw = yaw0 + i * 2.39996 + (random() - 0.5) * 0.6;
            const out = radius * Math.sqrt((i + 0.5) / (leaves.ile ?? 6)) * (0.5 + random() * 0.5);
            const length = (leaves.dlugosc ?? 12) * PX * (0.7 + random() * 0.45);
            const tilt = ((leaves.nachylenie ?? 12) * (0.4 + random() * 0.9)) * Math.PI / 180;
            const base = [Math.sin(yaw) * out, 0, Math.cos(yaw) * out];
            const width = length * 0.5;
            const turn = yaw + Math.PI / 2 + (random() - 0.5);
            const right = [Math.cos(turn) * width / 2, 0, -Math.sin(turn) * width / 2];
            card(faces, texture, PLANE_REGIONS.leaf, base, scale(direction(yaw, tilt), length), right, height, i % 2 === 1);
        }

    }


    // Liście przy łodydze, rozłożone dookoła.

    else for (let i = 0; i < (leaves.ile ?? 0); i++) {

        const yaw = yaw0 + i * 2 * Math.PI / leaves.ile + (random() - 0.5) * 0.5;
        const length = (leaves.dlugosc ?? 6) * PX * (0.85 + random() * 0.3);
        const tilt = ((leaves.nachylenie ?? 50) + (random() - 0.5) * 16) * Math.PI / 180;
        const base = [Math.sin(yaw) * PX, (leaves.wysokosc ?? 0) * PX + (i % 2) * PX, Math.cos(yaw) * PX];
        const right = [Math.cos(yaw) * length / 2, 0, -Math.sin(yaw) * length / 2];

        card(faces, texture, PLANE_REGIONS.leaf, base, scale(direction(yaw, tilt), length), right, height, i % 2 === 1);

    }


    // Łodygi (skrzyżowane karty) z kwiatem na końcu.

    for (let i = 0; i < stemCount; i++) {

        const yaw = yaw0 + i * 2 * Math.PI / Math.max(1, stemCount) + random();
        const offset = stemCount > 1 ? (stems.promien ?? 2) * PX * (0.5 + random() * 0.5) : 0;
        const base = [Math.sin(yaw) * offset, 0, Math.cos(yaw) * offset];
        const lean = ((stems.pochylenie ?? 6) + random() * 6) * Math.PI / 180 * (stemCount > 1 ? 1 : 0.5);
        const length = stemHeight * (0.85 + random() * 0.15) * (stemCount > 1 && i > 0 ? 0.9 : 1);
        const up = scale(direction(yaw, lean), length);

        // Łodyga: odcinki po 8 pikseli (cała wysokość obszaru tekstury).
        const segments = Math.max(1, Math.ceil(length / (8 * PX)));
        for (let k = 0; k < segments; k++) {
            const from = add(base, scale(up, k / segments));
            const part = scale(up, 1 / segments);
            for (let j = 0; j < 2; j++) {
                const angle = yaw + j * Math.PI / 2;
                card(faces, texture, PLANE_REGIONS.stem, from, part, [Math.cos(angle) * PX, 0, -Math.sin(angle) * PX], height, j === 1);
            }
        }

        if (bloom && bloom.rodzaj !== 'owoce') {
            flower(faces, texture, bloom.rodzaj, add(base, up), flowerSize * (0.85 + random() * 0.15), yaw, height, random);
        }

    }

    return faces;

}


// Modele zarejestrowane pod nazwą rodzaju ("plane:<roślina>:<etap>") -
// RiverPlantGeometry.getRiverPlantFaces bierze je stąd (osobno dla
// każdej odmiany 0-7, raz policzone).

const REGISTERED = new Map();
const FACES = new Map();

export function registerPlaneModel(kind, spec, texture, seed) {

    REGISTERED.set(kind, { spec, texture, seed });

    for (let variant = 0; variant < 8; variant++) {
        FACES.delete(`${kind}:${variant}`);
    }

}

export function getPlaneModelFaces(kind, variant) {

    const key = `${kind}:${variant & 7}`;

    let faces = FACES.get(key);

    if (!faces) {
        const model = REGISTERED.get(kind);
        faces = model ? makePlaneModel(model.spec, model.texture, variant & 7, model.seed) : [];
        FACES.set(key, faces);
    }

    return faces;

}
