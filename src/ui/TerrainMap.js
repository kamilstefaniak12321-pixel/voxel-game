import { CHUNK_HEIGHT } from '../config.js';
import { getBlockTypeById } from '../blocks/BlockRegistry.js';
import { LANDFORMS, RELIEFS } from '../world/terrain/landforms.js';
import { ROCK_INFO, SOIL_INFO, blockNamePl } from '../world/terrain/rocks.js';

// ------------------------------------------------------------
// MAPA TERENU (komenda /mapa, klawisz M)
//
// Widok z góry na teren wokół gracza - prosto z generatora (nie
// z wczytanych chunków), więc widać daleko i szybko. Do oglądania
// i strojenia generatora terenu (docs/generator-terenu.md).
//
// Warstwy (MAP_LAYERS):
//   teren   - wysokość w kolorach jak na mapie fizycznej, z cieniowaniem,
//   formy   - formy terenu (góry, doliny, kotliny, wąwozy...) z legendą,
//   pasy    - niziny / wyżyny / góry / depresje / morze,
//   skaly   - skała na wierzchu albo tuż pod glebą (mapa geologiczna),
//   lasy    - lasy: gatunek drzew, który przeważa, im gęściej, tym
//             mocniejszy kolor (src/world/trees/Forests.js),
//   przekroj - przekrój pionowy terenu w kierunku patrzenia: wszystkie
//             skały pod ziemią, żyły lepidolitu, woda,
//   pola    - pojedyncze pola generatora (kontynent, erozja, grzbiety...).
//
// Mapa liczy się kawałkami (kilka ms na klatkę), więc gra nie
// przycina. Północ jest na górze, gracz to czerwona strzałka.
// Przy otwartym czacie mysz jest wolna - wskazany punkt mapy
// pokazuje swoje współrzędne i formę terenu.
// ------------------------------------------------------------

// Rozmiar mapy w punktach (każdy punkt = `scale` bloków).
const MAP_SIZE = 192;

// Ile ms na klatkę może zająć liczenie mapy.
const BUDGET_MS = 6;


export const MAP_LAYERS = {
    teren: 'wysokość terenu',
    formy: 'formy terenu',
    pasy: 'niziny, wyżyny, góry',
    skaly: 'skały (na wierzchu i pod glebą)',
    lasy: 'lasy (gatunek drzew, gęstość)',
    przekroj: 'przekrój pionowy w kierunku patrzenia',
    kontynent: 'pole: kontynent (morze ↔ ląd)',
    wypietrzenie: 'pole: wypiętrzenie (niziny ↔ góry)',
    erozja: 'pole: erozja (poszarpany ↔ wygładzony)',
    grzbiety: 'pole: grzbiety gór',
    gory: 'pole: góry (po kotlinach)',
    wyzyny: 'pole: wyżyny',
    temperatura: 'pole: temperatura (pod biomy)',
    wilgotnosc: 'pole: wilgotność (pod biomy)'
};

export const MAP_SCALES = [1, 2, 4, 8, 16, 32];

// Rzeki i jeziora na mapie.
const RIVER_COLOR = '#3fa9f5';
const LAKE_COLOR = '#2f80d8';

// Warstwy-pola (szare plamy wartości) - bez rzek.
const FIELD_LAYERS = {
    kontynent: true,
    wypietrzenie: true,
    erozja: true,
    grzbiety: true,
    gory: true,
    wyzyny: true,
    temperatura: true,
    wilgotnosc: true
};


const RELIEF_COLORS = {
    sea: '#2f5fb0',
    depression: '#16a085',
    lowland: '#7fbf5f',
    upland: '#e2c66b',
    mountains: '#9c6b45'
};


// Lasy: kolor gatunku, który przeważa (im gęstszy las, tym mocniej),
// łąki jasne.

const FOREST_COLORS = {
    spruce: ['#1d4a2a', 'świerk'],
    pine: ['#7a8f2e', 'sosna'],
    beech: ['#3d9a4a', 'buk'],
    linden: ['#d8c440', 'lipa'],
    oak: ['#b5742f', 'dąb'],
    birch: ['#ecebe2', 'brzoza']
};

const MEADOW_COLOR = [176, 206, 132];


// Kolory bloków na mapie skał i przekroju.

const BLOCK_COLORS = { ...SOIL_INFO, ...ROCK_INFO };

const AIR_COLOR = [196, 222, 244];


function hexToRgb(hex) {

    const value = parseInt(hex.slice(1), 16);

    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];

}


function mix(a, b, t) {

    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
    ];

}


// Kolory wysokości (bloki nad poziomem morza) - jak na mapie fizycznej.

const HEIGHT_COLORS = [
    [-40, [12, 34, 92]],
    [-10, [30, 84, 170]],
    [-1, [70, 140, 210]],
    [0, [222, 210, 150]],
    [1, [88, 160, 72]],
    [12, [150, 190, 90]],
    [20, [222, 205, 120]],
    [32, [196, 150, 90]],
    [48, [140, 100, 70]],
    [62, [190, 190, 190]],
    [80, [250, 250, 250]]
];


function heightColor(above) {

    for (let i = 1; i < HEIGHT_COLORS.length; i++) {

        if (above <= HEIGHT_COLORS[i][0]) {

            const [h0, c0] = HEIGHT_COLORS[i - 1];
            const [h1, c1] = HEIGHT_COLORS[i];

            return mix(c0, c1, Math.max(0, (above - h0) / (h1 - h0)));

        }

    }

    return HEIGHT_COLORS[HEIGHT_COLORS.length - 1][1];

}


// Pole -1..1: niebieski - biały - czerwony.

function fieldColor(value) {

    const t = Math.max(-1, Math.min(1, value));

    return t < 0
        ? mix([255, 255, 255], [40, 90, 200], -t)
        : mix([255, 255, 255], [200, 50, 40], t);

}

// ------------------------------------------------------------

export class TerrainMap {

    constructor() {

        this.root = document.createElement('div');
        this.root.id = 'terrain-map';
        this.root.hidden = true;

        this.title = document.createElement('div');
        this.title.className = 'terrain-map-title';

        this.canvas = document.createElement('canvas');
        this.canvas.width = MAP_SIZE;
        this.canvas.height = MAP_SIZE;

        this.marker = document.createElement('div');
        this.marker.className = 'terrain-map-player';

        const view = document.createElement('div');
        view.className = 'terrain-map-view';
        view.append(this.canvas, this.marker);

        this.hover = document.createElement('div');
        this.hover.className = 'terrain-map-hover';

        this.legend = document.createElement('div');
        this.legend.className = 'terrain-map-legend';

        this.root.append(this.title, view, this.hover, this.legend);

        document.body.appendChild(this.root);


        this.context = this.canvas.getContext('2d');

        this.image = this.context.createImageData(MAP_SIZE, MAP_SIZE);


        this.layer = 'teren';
        this.scale = 8;

        this.generator = null;
        this.center = null;
        this.job = null;


        this.canvas.addEventListener('mousemove', (event) => this.onHover(event));
        this.canvas.addEventListener('mouseleave', () => { this.hover.textContent = ''; });

    }


    get isOpen() {

        return !this.root.hidden;

    }


    // Otwiera mapę wokół (x, z). layer, scale - opcjonalnie;
    // yaw - kierunek patrzenia (dla przekroju).

    open(generator, x, z, layer = this.layer, scale = this.scale, yaw = 0) {

        this.generator = generator;
        this.layer = layer;
        this.scale = scale;

        this.center = { x: Math.round(x), z: Math.round(z) };

        // Kierunek przekroju (do przodu, jak patrzy gracz).
        this.direction = { x: -Math.sin(yaw), z: -Math.cos(yaw) };

        this.root.hidden = false;


        const size = MAP_SIZE * scale;

        const unit = `${scale === 1 ? 'blok' : [2, 4, 32].includes(scale) ? 'bloki' : 'bloków'}`;

        this.title.textContent = this.isSection
            ? `Mapa: ${MAP_LAYERS[layer]} | ${size} bloków w poziomie (1 punkt = ${scale} ${unit}), ` +
              `wysokość 0-${CHUNK_HEIGHT - 1} | ← za tobą, przed tobą → | M albo /mapa - zamknij`
            : `Mapa: ${MAP_LAYERS[layer]} | ${size} x ${size} bloków (1 punkt = ${scale} ${unit}) | ` +
              `środek ${this.center.x}, ${this.center.z} | M albo /mapa - zamknij`;


        // Liczenie od nowa: najpierw wysokości (z ramką na nachylenie),
        // potem kolory - wiersz po wierszu w kolejnych klatkach.

        this.job = {
            heightRow: 0,
            row: 0,
            heights: new Float32Array((MAP_SIZE + 2) * (MAP_SIZE + 2)),
            samples: new Array(MAP_SIZE * MAP_SIZE),
            present: new Set()
        };

        this.image.data.fill(0);

        this.context.putImageData(this.image, 0, 0);

        this.legend.replaceChildren();

    }


    close() {

        this.root.hidden = true;

        this.job = null;

    }


    get isSection() {

        return this.layer === 'przekroj';

    }


    // Kolumna przekroju i (od lewej) - pozycja w świecie.

    sectionColumn(i) {

        const along = (i - MAP_SIZE / 2) * this.scale;

        return {
            x: Math.round(this.center.x + this.direction.x * along),
            z: Math.round(this.center.z + this.direction.z * along)
        };

    }


    // Wysokość (y) w wierszu j przekroju (góra mapy = góra świata).

    sectionY(j) {

        return Math.floor((MAP_SIZE - 1 - j) * CHUNK_HEIGHT / MAP_SIZE);

    }


    // Pozycja bloku pod punktem mapy (i, j).

    blockAt(i, j) {

        const half = MAP_SIZE / 2;

        return {
            x: this.center.x + Math.round((i - half) * this.scale),
            z: this.center.z + Math.round((j - half) * this.scale)
        };

    }


    // Co klatkę: liczenie kolejnych wierszy i strzałka gracza.

    update(playerX, playerZ, yaw, playerY = 0) {

        if (!this.isOpen) {
            return;
        }


        if (this.isSection) {

            this.updateSection(playerX, playerY, playerZ);

            return;

        }


        // Strzałka gracza (gracz mógł się przesunąć od otwarcia mapy).

        const half = MAP_SIZE / 2;

        const px = half + (playerX - this.center.x) / this.scale;
        const pz = half + (playerZ - this.center.z) / this.scale;

        this.marker.style.left = `${(px / MAP_SIZE) * 100}%`;
        this.marker.style.top = `${(pz / MAP_SIZE) * 100}%`;
        this.marker.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
        this.marker.hidden = px < 0 || pz < 0 || px > MAP_SIZE || pz > MAP_SIZE;


        const job = this.job;

        if (!job || job.row >= MAP_SIZE) {
            return;
        }


        const deadline = performance.now() + BUDGET_MS;

        const W = MAP_SIZE + 2;


        // Najpierw wysokości całej siatki (z ramką - do nachylenia
        // i cieniowania), potem wiersze opisu i kolorów.

        while (job.heightRow < W) {

            if (performance.now() >= deadline) {
                return;
            }

            const j = job.heightRow++;

            for (let i = 0; i < W; i++) {

                const { x, z } = this.blockAt(i - 1, j - 1);

                job.heights[j * W + i] = this.generator.getHeight(x, z);

            }

        }


        while (job.row < MAP_SIZE && performance.now() < deadline) {

            const j = job.row;

            for (let i = 0; i < MAP_SIZE; i++) {

                const k = (j + 1) * W + (i + 1);

                const height = job.heights[k];

                const slope = Math.max(
                    Math.abs(height - job.heights[k - 1]),
                    Math.abs(height - job.heights[k + 1]),
                    Math.abs(height - job.heights[k - W]),
                    Math.abs(height - job.heights[k + W])
                ) / this.scale;

                const { x, z } = this.blockAt(i, j);

                // Przy dużej skali nachylenie z siatki mapy jest zbyt
                // wygładzone - wtedy generator liczy je sam (wolniej).

                // Rzeki węższe niż punkt mapy i tak są widoczne (zalewają punkt).

                const info = this.generator.describe(x, z, this.scale <= 2 ? slope : null, this.scale);

                job.samples[j * MAP_SIZE + i] = info;


                // Cieniowanie: światło z północnego zachodu.

                const shade = Math.max(0.55, Math.min(1.35,
                    1 + (job.heights[k - W - 1] - job.heights[k + W + 1]) / (this.scale * 4)
                ));

                const color = this.colorFor(info, shade);

                const o = (j * MAP_SIZE + i) * 4;

                this.image.data[o] = color[0];
                this.image.data[o + 1] = color[1];
                this.image.data[o + 2] = color[2];
                this.image.data[o + 3] = 255;

            }

            job.row++;

        }


        this.context.putImageData(this.image, 0, 0);

        if (job.row >= MAP_SIZE) {
            this.showLegend();
        }

    }


    // Przekrój: kolumny po kolei (cała kolumna bloków z generatora).

    updateSection(playerX, playerY, playerZ) {

        // Gracz: strzałka "przed siebie" w środku przekroju, na jego
        // wysokości (o ile nie odszedł w bok od linii przekroju).

        const dx = playerX - this.center.x;
        const dz = playerZ - this.center.z;

        const along = dx * this.direction.x + dz * this.direction.z;
        const aside = Math.abs(dx * this.direction.z - dz * this.direction.x);

        const px = MAP_SIZE / 2 + along / this.scale;
        const py = MAP_SIZE * (1 - playerY / CHUNK_HEIGHT);

        this.marker.style.left = `${(px / MAP_SIZE) * 100}%`;
        this.marker.style.top = `${(py / MAP_SIZE) * 100}%`;
        this.marker.style.transform = 'translate(-50%, -50%) rotate(90deg)';
        this.marker.hidden = px < 0 || px > MAP_SIZE || aside > 2 * this.scale;


        const job = this.job;

        if (!job || job.row >= MAP_SIZE) {
            return;
        }


        if (!this.generator.columnBlocks) {

            job.row = MAP_SIZE;

            this.hover.textContent = 'Ten typ terenu nie ma przekroju.';

            return;

        }


        const deadline = performance.now() + BUDGET_MS;

        const data = this.image.data;

        while (job.row < MAP_SIZE && performance.now() < deadline) {

            const i = job.row++;

            const { x, z } = this.sectionColumn(i);

            const { blocks } = this.generator.columnBlocks(x, z);

            job.samples[i] = blocks.slice();


            for (let j = 0; j < MAP_SIZE; j++) {

                const y = this.sectionY(j);

                const id = blocks[y];

                let color = AIR_COLOR;

                if (id !== 0) {

                    const type = getBlockTypeById(id);

                    job.present.add(type);

                    color = hexToRgb(BLOCK_COLORS[type]?.color ?? '#808080');

                    // Co drugi blok w pionie odrobinę ciemniej - widać warstwy.

                    if (y % 2 === 1) {
                        color = color.map((c) => c * 0.94);
                    }

                }

                const o = (j * MAP_SIZE + i) * 4;

                data[o] = color[0];
                data[o + 1] = color[1];
                data[o + 2] = color[2];
                data[o + 3] = 255;

            }

        }


        this.context.putImageData(this.image, 0, 0);

        if (job.row >= MAP_SIZE) {
            this.showLegend();
        }

    }


    colorFor(info, shade) {

        const sea = this.generator.seaLevel ?? 0;

        const water = info.relief === 'sea';

        let color;


        // Rzeki i jeziora - na każdej warstwie (poza polami).

        if ((info.water === 'river' || info.water === 'lake') && !(this.layer in FIELD_LAYERS)) {

            if (this.layer === 'formy') {
                this.job.present.add(info.water);
            }

            return hexToRgb(info.water === 'river' ? RIVER_COLOR : LAKE_COLOR);

        }

        switch (this.layer) {

            case 'teren':

                // Ląd poniżej poziomu morza (depresja) - ciemna zieleń.

                color = info.relief === 'depression'
                    ? [52, 120, 70]
                    : heightColor(info.height - sea);

                return water ? color : color.map((c) => Math.min(255, c * shade));

            case 'formy': {

                this.job.present.add(info.landform);

                color = hexToRgb(LANDFORMS[info.landform]?.color ?? '#808080');

                return water ? color : color.map((c) => Math.min(255, c * (0.75 + shade * 0.25)));

            }

            case 'pasy': {

                this.job.present.add(info.relief);

                color = hexToRgb(RELIEF_COLORS[info.relief] ?? '#808080');

                return water ? color : color.map((c) => Math.min(255, c * (0.7 + shade * 0.3)));

            }

            case 'lasy': {

                if (water) {
                    return hexToRgb(SOIL_INFO.water.color);
                }

                const forest = info.forest;

                if (!forest?.species || info.surface !== 'grass') {
                    return (info.surface === 'grass' ? MEADOW_COLOR : [170, 166, 160]).map((c) => c * (0.8 + 0.2 * shade));
                }

                const cover = Math.min(1, Math.max(0, (forest.density - 0.03) / 0.4));

                if (cover > 0.25) {
                    this.job.present.add(forest.species);
                }

                color = mix(MEADOW_COLOR, hexToRgb(FOREST_COLORS[forest.species][0]), cover);

                return color.map((c) => Math.min(255, c * (0.8 + 0.2 * shade)));

            }

            case 'skaly': {

                if (water) {
                    return hexToRgb(SOIL_INFO.water.color);
                }

                this.job.present.add(info.rock);

                color = hexToRgb(ROCK_INFO[info.rock]?.color ?? '#808080');

                return color.map((c) => Math.min(255, c * (0.75 + shade * 0.25)));

            }

            default: {

                const value = info.fields[this.layer];

                if (value === undefined) {
                    return [90, 90, 90];
                }

                color = fieldColor(value);

                return color.map((c) => c * (0.8 + 0.2 * shade));

            }

        }

    }


    // Legenda: dla form i pasów - kolory tych, które są na mapie.

    showLegend() {

        this.legend.replaceChildren();

        const entries = [];

        if (this.layer === 'formy') {

            for (const [key, landform] of Object.entries(LANDFORMS)) {
                if (this.job.present.has(key)) entries.push([landform.color, landform.name]);
            }

        }
        else if (this.layer === 'pasy') {

            for (const [key, name] of Object.entries(RELIEFS)) {
                if (this.job.present.has(key)) entries.push([RELIEF_COLORS[key], name]);
            }

        }
        else if (this.layer === 'skaly' || this.layer === 'przekroj') {

            for (const [type, info] of Object.entries(BLOCK_COLORS)) {
                if (this.job.present.has(type)) entries.push([info.color, info.name]);
            }

            if (this.layer === 'skaly') {
                entries.push([SOIL_INFO.water.color, 'morze']);
            }

        }
        else if (this.layer === 'lasy') {

            for (const [species, [color, name]] of Object.entries(FOREST_COLORS)) {
                if (this.job.present.has(species)) entries.push([color, name]);
            }

            entries.push([`rgb(${MEADOW_COLOR.join(',')})`, 'łąki']);

        }
        else if (this.layer === 'teren') {

            entries.push(['#1e54aa', 'morze'], ['#dece96', 'brzeg'], ['#347846', 'depresja'], ['#58a048', 'nizina'], ['#decd78', 'wyżyna'], ['#8c6446', 'góry'], ['#fafafa', 'szczyty']);

        }
        else {

            entries.push(['#285ac8', '-1'], ['#ffffff', '0'], ['#c83228', '+1']);

        }


        for (const [color, name] of entries) {

            const item = document.createElement('span');

            item.className = 'terrain-map-legend-item';

            const swatch = document.createElement('span');

            swatch.className = 'terrain-map-swatch';
            swatch.style.background = color;

            item.append(swatch, name);

            this.legend.append(item);

        }

    }


    // Wskazany myszą punkt: współrzędne i opis.

    onHover(event) {

        if (!this.job) {
            return;
        }

        const rect = this.canvas.getBoundingClientRect();

        const i = Math.floor((event.clientX - rect.left) / rect.width * MAP_SIZE);
        const j = Math.floor((event.clientY - rect.top) / rect.height * MAP_SIZE);


        if (this.isSection) {

            const blocks = this.job.samples[i];

            if (!blocks) {
                return;
            }

            const { x, z } = this.sectionColumn(i);

            const y = this.sectionY(j);

            const id = blocks[y];

            this.hover.textContent =
                `${x}, ${y}, ${z} | ${id === 0 ? 'powietrze' : blockNamePl(getBlockTypeById(id))}`;

            return;

        }


        const info = this.job.samples[j * MAP_SIZE + i];

        if (!info) {
            return;
        }

        const { x, z } = this.blockAt(i, j);

        this.hover.textContent =
            `${x}, ${z} | wysokość ${info.height} | ${RELIEFS[info.relief] ?? info.relief} | ` +
            `${LANDFORMS[info.landform]?.name ?? info.landform}` +
            (info.rock ? ` | skała: ${blockNamePl(info.rock)}` : '') +
            (info.forest?.species && info.forest.density > 0.03
                ? ` | las ${Math.round(info.forest.density * 100)}%: ${FOREST_COLORS[info.forest.species][1]}`
                : '');

    }

}
