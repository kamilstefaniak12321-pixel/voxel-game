import { createPixelPlant } from './PixelPlantBuilder.js';

// ------------------------------------------------------------
// KĘPKA - mała roślina z paczki roślin jako model z pikseli 1/16 bloku
// (model "kepka" w roslina.json, src/blocks/plantPacks.js)
//
// Roślina niższa niż pół bloku z obrazka 16 x 16 byłaby rozmazaną plamą,
// więc zamiast obrazka jest prawdziwy, mały model - jak rośliny nad rzeką
// (RiverPlantGeometry.js, PixelPlantBuilder.js): przyziemna rozeta
// wąskich liści, łodygi z pikseli 1 x 1, na nich listki, a na górze
// kwiaty z kostek 1/16 bloku - "baldach" (kopułka z kilku kulistych
// koszyczków, np. kocanka), "pak" (zamknięty pąk) albo nic. Kolory
// z palety atlasu rośliny. 8 odmian (ta sama roślina w świecie ma różne
// kępki), widać je ze wszystkich stron, kołyszą się na wietrze.
//
// Parametry (już sprawdzone przez plantPacks.js - parseTuft):
//   leaves: { count: [od, do], length: [od, do] }
//   stems:  { count: [od, do], height: [od, do], radius }
//   flower: null | { kind: 'baldach' | 'pak', size: 1-2 }
//   colors: { leaf, leafLight, leafDark, stem, flower, flowerLight,
//             flowerDark, bud } - liniowe RGB 0-255 (jak COLORS
//             w RiverPlantGeometry.js)
//   height: wysokość w pikselach (do kołysania), seed
// ------------------------------------------------------------

function randomFor(seed) {
    let value = seed | 0;
    return () => {
        value = Math.imul(value ^ (value >>> 15), 2246822519);
        value = Math.imul(value ^ (value >>> 13), 3266489917);
        value ^= value >>> 16;
        return (value >>> 0) / 4294967296;
    };
}

export function makeTuftTemplate(tuft, variant) {

    const random = randomFor(40503 + variant * 7919 + tuft.seed);
    const between = ([low, high]) => low + Math.floor(random() * (high - low + 1));
    const height = tuft.height / 16;
    const model = createPixelPlant(tuft.colors, false, 0, Math.max(0.3, height));
    const { sheet, box } = model;


    // Rozeta: przyziemne liście - płaska gwiazda z pikseli tuż nad ziemią
    // (gracz patrzy na małe rośliny z góry), w środku kilka kostek.
    // Płaska warstwa łączy się w kilka prostokątów - mało ścian.

    const blades = between(tuft.leaves.count);
    const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const first = Math.floor(random() * 8);

    sheet(1, 1, ({ pixel }) => {
        for (let i = 0; i < blades; i++) {
            const [dx, dz] = directions[(first + Math.round(i * 8 / blades)) % 8];
            const length = between(tuft.leaves.length);
            const shade = (i + variant) % 2 ? 'leaf' : 'leafLight';
            for (let k = 1; k <= length; k++) {
                pixel(dx * k, dz * k, k === length ? 'leafLight' : shade);
                // Szersza nasada liścia przy środku.
                if (k === 1 && dx !== 0 && dz !== 0) pixel(dx, 0, shade);
            }
        }
    });

    box(0, 0, 0, 1, 2, 1, 'leafDark', 'leaf');

    // Kilka liści stojących - kępka ma objętość, nie tylko gwiazdę na ziemi.
    const upright = tuft.leaves.length[1] + 1;
    for (const axis of [2, 0]) {
        sheet(axis, 0, ({ leaf }) => {
            leaf(-1, 0, -between([1, 3]), upright - Math.floor(random() * 2), 'leafLight');
            leaf(0, 0, between([1, 3]), upright - Math.floor(random() * 2), 'leaf');
        });
    }


    // Łodygi w różnych miejscach kępki (bez dwóch w jednym miejscu).

    const stems = between(tuft.stems.count);
    const radius = tuft.stems.radius;
    const spots = [];

    for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
            if (x * x + z * z <= radius * radius + 1) {
                spots.push([x, z]);
            }
        }
    }

    for (let i = 0; i < stems && spots.length > 0; i++) {

        const [x, z] = spots.splice(Math.floor(random() * spots.length), 1)[0];

        // Sąsiednie miejsca też odpadają - kwiaty się nie zlewają.
        for (let k = spots.length - 1; k >= 0; k--) {
            if (Math.abs(spots[k][0] - x) <= 1 && Math.abs(spots[k][1] - z) <= 1) {
                spots.splice(k, 1);
            }
        }

        const top = between(tuft.stems.height);

        box(x, 0, z, 1, top, 1, 'stem');

        // Listki na łodydze: najwyżej dwa piksele, z dwóch stron.
        for (let y = 2 + Math.floor(random() * 2), side = random() < 0.5 ? -1 : 1, n = 0; y < top - 1 && n < 2; y += 3, side = -side, n++) {
            if (random() < 0.5) box(x + side, y, z, 1, 1, 1, 'leafLight');
            else box(x, y, z + side, 1, 1, 1, 'leaf');
        }

        const flower = tuft.flower;

        if (!flower) {
            continue;
        }

        if (flower.kind === 'pak') {
            box(x, top, z, 1, 1, 1, 'bud');
            continue;
        }

        // Baldach: kopułka z kostek - dolna warstwa krzyżyk (albo romb),
        // jeden koszyczek ciemniejszy (cień), górna warstwa jaśniejsza.
        // Jeden kolor na warstwę - ściany łączą się w większe prostokąty.
        const size = flower.size;
        const shadow = Math.floor(random() * 4);
        let arm = 0;
        for (let dz = -size; dz <= size; dz++) {
            for (let dx = -size; dx <= size; dx++) {
                const far = Math.abs(dx) + Math.abs(dz);
                if (far > size || (size === 2 && far === 2 && random() < 0.35)) continue;
                box(x + dx, top, z + dz, 1, 1, 1, far === 1 && arm++ === shadow ? 'flowerDark' : 'flower');
            }
        }
        for (let dz = -(size - 1); dz <= size - 1; dz++) {
            for (let dx = -(size - 1); dx <= size - 1; dx++) {
                if (Math.abs(dx) + Math.abs(dz) > size - 1) continue;
                box(x + dx, top + 1, z + dz, 1, 1, 1, 'flowerLight');
            }
        }

    }

    // Światło jak na zwykłych roślinach (płaszczyznach z normalną w górę):
    // boki kostek dostają normalną odchyloną mocno w górę, więc mała
    // kępka nie ciemnieje, gdy słońce jest za nią - kształt dalej widać
    // dzięki jaśniejszym i ciemniejszym pikselom.
    return model.finish().map((face) => {
        const [x, y, z] = face.normal;
        const length = Math.hypot(x * 0.45, y + 1.4, z * 0.45);
        return { ...face, normal: [x * 0.45 / length, (y + 1.4) / length, z * 0.45 / length] };
    });

}
