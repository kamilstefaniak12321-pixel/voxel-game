// ------------------------------------------------------------
// PACZKA PLIKÓW GRY (1.1.3) - szybszy start aplikacji
//
// Łączy kilkaset plików z src/ (i bibliotekę three) w kilka plików
// w pakiet/js/. Aplikacja otwiera wtedy kilka plików zamiast kilkuset -
// także każdy z trzech wątków w tle (teren, daleki teren, zapis), który
// wcześniej wczytywał swoje sto kilkadziesiąt plików od nowa.
//
//   node tools/pakiet.mjs                 - paczka w ./pakiet/js
//   node tools/pakiet.mjs --root www      - paczka w www/pakiet/js
//                                            (aplikacja na telefon)
//
// Uruchamiane przy budowaniu aplikacji: npm run dist (komputer)
// i npm run android:www (telefon). Folder pakiet/ nie trafia do gita.
// Przy pracy nad grą i w testach paczki nie ma - gra działa z src/.
//
// Zasady, dzięki którym kod nie wie, że jest w paczce:
//   - pliki paczki leżą dwa foldery pod stroną gry (pakiet/js/), tak jak
//     pliki src/<folder>/ - adresy '../../assets/...' liczone od pliku
//     trafiają w to samo miejsce,
//   - wątki mają te same nazwy plików co w src/ i leżą obok siebie -
//     new URL('./FarTerrainWorker.js', import.meta.url) dalej działa,
//   - nazwy funkcji i klas zostają (bez zaciemniania) - raport
//     diagnostyczny pokazuje czytelne miejsca błędów.
//
// Nowy wątek (new Worker(new URL('./X.js', import.meta.url))): dopisz
// plik do WORKERS - inaczej w paczce go zabraknie (pilnuje tego
// tools/sprawdz_pakiet.mjs).
// ------------------------------------------------------------
import { build } from 'esbuild';
import { rmSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Wejścia: start gry i wątki w tle.
export const ENTRY = 'src/start.js';
export const WORKERS = [
    'src/world/ChunkGenerationWorker.js',
    'src/world/FarTerrainWorker.js',
    'src/storage/storage-worker.js'
];

export const BUNDLE_DIR = 'pakiet/js';

// Dane roślin i modeli w jednym pliku (src/blocks/dataFiles.js).
export const DATA_FILE = 'pakiet/dane.json';
export const DATA_FOLDERS = ['assets/rosliny', 'assets/models/rosliny'];

// Od tych plików zależy odcisk gry (pamięć startu).
export const FINGERPRINT = ['src', 'lib/three', 'assets/models', 'assets/rosliny', 'assets/textures', 'assets/ui'];

// Pliki folderu (ścieżki z ukośnikami, w stałej kolejności); brak folderu = nic.
function listFiles(base, folder) {
    const path = join(base, folder);
    if (!existsSync(path)) return [];
    return readdirSync(path).sort().flatMap((name) => {
        const relative = `${folder}/${name}`;
        return statSync(join(base, relative)).isDirectory() ? listFiles(base, relative) : [relative];
    });
}

// version - wersja gry do spisu (domyślnie z package.json w root).
export async function buildBundle(root = '.', { version = null } = {}) {

    const base = resolve(root);
    const outdir = join(base, BUNDLE_DIR);

    for (const file of [ENTRY, ...WORKERS, 'lib/three/three.module.js']) {
        if (!existsSync(join(base, file))) throw new Error(`Brak ${file} w ${base}`);
    }

    rmSync(join(base, 'pakiet'), { recursive: true, force: true });

    version ??= existsSync(join(base, 'package.json')) ? JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')).version : null;

    // ODCISK GRY: wersja + skrót wszystkich plików, od których zależy to,
    // co gra liczy przy starcie (kod, biblioteka, modele, rośliny,
    // tekstury). Pamięć startu (src/storage/StartCache.js) jest ważna
    // tylko dla tego samego odcisku - każda zmiana pliku ją unieważnia.
    const hash = createHash('sha256');
    for (const folder of FINGERPRINT) {
        for (const file of listFiles(base, folder)) {
            hash.update(file + '\n');
            hash.update(readFileSync(join(base, file)));
        }
    }
    const buildId = `${version ?? 'bez-wersji'}+${hash.digest('hex').slice(0, 16)}`;

    // DANE ROŚLIN I MODELI: ok. 80 małych plików .json w jednym pliku.
    // Gra (i każdy wątek) pobiera jeden plik zamiast kilkudziesięciu
    // (src/blocks/dataFiles.js). Te same teksty, bajt w bajt.
    const data = {};
    for (const folder of DATA_FOLDERS) {
        for (const file of listFiles(base, folder)) {
            if (file.endsWith('.json')) data[file] = readFileSync(join(base, file), 'utf8');
        }
    }

    const result = await build({
        absWorkingDir: base,
        entryPoints: [ENTRY, ...WORKERS],
        outdir,
        bundle: true,
        format: 'esm',
        // Wspólny kod startu i wątków (bloki, generator terenu) trafia do
        // wspólnych części zamiast do każdego pliku osobno.
        splitting: true,
        entryNames: '[name]',
        chunkNames: 'czesc-[hash]',
        platform: 'browser',
        target: ['chrome120'],
        alias: { three: './lib/three/three.module.js' },
        // Pliki roślin w testach (Node) czytane z dysku - w aplikacji nieużywane.
        external: ['node:*'],
        minify: false,
        keepNames: false,
        legalComments: 'inline',
        charset: 'utf8',
        logLevel: 'warning',
        // Odcisk na początku każdego pliku paczki (także wątków).
        banner: { js: `globalThis.__VR_BUILD ??= ${JSON.stringify(buildId)};` },
        metafile: true
    });

    mkdirSync(join(base, 'pakiet'), { recursive: true });
    writeFileSync(join(base, DATA_FILE), JSON.stringify({ build: buildId, files: data }));

    const files = readdirSync(outdir).sort();
    const bytes = files.reduce((sum, name) => sum + statSync(join(outdir, name)).size, 0);
    const inputs = Object.keys(result.metafile.inputs).length;

    // Spis: z czego powstała paczka (do sprawdzeń i raportów).
    writeFileSync(join(base, 'pakiet', 'spis.json'), JSON.stringify({ version, build: buildId, inputs, files, bytes, data: Object.keys(data).length }, null, 4) + '\n');

    return { outdir, files, bytes, inputs, warnings: result.warnings.length, buildId, dataFiles: Object.keys(data).length };

}

// Uruchomione wprost (nie zaimportowane przez inne narzędzie).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const at = process.argv.indexOf('--root');
    const root = at >= 0 ? process.argv[at + 1] : '.';
    const { files, bytes, inputs, buildId, dataFiles } = await buildBundle(root);
    console.log(`Paczka gry: ${inputs} plików -> ${files.length} w ${join(root, BUNDLE_DIR)} (${(bytes / 1048576).toFixed(1)} MB), dane: ${dataFiles} plików w jednym, odcisk ${buildId}`);
}
