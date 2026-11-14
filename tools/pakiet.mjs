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
import { rmSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Wejścia: start gry i wątki w tle.
export const ENTRY = 'src/start.js';
export const WORKERS = [
    'src/world/ChunkGenerationWorker.js',
    'src/world/FarTerrainWorker.js',
    'src/storage/storage-worker.js'
];

export const BUNDLE_DIR = 'pakiet/js';

// version - wersja gry do spisu (domyślnie z package.json w root).
export async function buildBundle(root = '.', { version = null } = {}) {

    const base = resolve(root);
    const outdir = join(base, BUNDLE_DIR);

    for (const file of [ENTRY, ...WORKERS, 'lib/three/three.module.js']) {
        if (!existsSync(join(base, file))) throw new Error(`Brak ${file} w ${base}`);
    }

    rmSync(join(base, 'pakiet'), { recursive: true, force: true });

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
        metafile: true
    });

    const files = readdirSync(outdir).sort();
    const bytes = files.reduce((sum, name) => sum + statSync(join(outdir, name)).size, 0);
    const inputs = Object.keys(result.metafile.inputs).length;

    // Spis: z czego powstała paczka (do sprawdzeń i raportów).
    version ??= existsSync(join(base, 'package.json')) ? JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')).version : null;
    writeFileSync(join(base, 'pakiet', 'spis.json'), JSON.stringify({ version, inputs, files, bytes }, null, 4) + '\n');

    return { outdir, files, bytes, inputs, warnings: result.warnings.length };

}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    const at = process.argv.indexOf('--root');
    const root = at >= 0 ? process.argv[at + 1] : '.';
    const { files, bytes, inputs } = await buildBundle(root);
    console.log(`Paczka gry: ${inputs} plików -> ${files.length} w ${join(root, BUNDLE_DIR)} (${(bytes / 1048576).toFixed(1)} MB)`);
}
