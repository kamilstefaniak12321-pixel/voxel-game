// ------------------------------------------------------------
// APLIKACJA NA TELEFON (Android) - pliki gry do aplikacji
//
// Kopiuje to, czego gra potrzebuje (index.html, src/, assets/, lib/,
// LICENSE.md)
// do folderu www/, a stamtąd "npx cap sync android" wkłada je do
// aplikacji (android/). Uruchamiane przez: npm run android:www
// (w GitHub Actions - .github/workflows/aplikacja.yml). Opis:
// docs/telefon.md.
//
// Do www/ trafia też wersja.json: { version, native, repo } -
//   version - wersja gry (package.json),
//   native  - odcisk części aplikacji na telefon (kod Javy, manifest,
//             pliki Gradle, Capacitor - NATIVE_FILES niżej). Aktualizacja
//             samych plików gry (bez instalowania .apk) jest możliwa
//             tylko między wersjami o tym samym odcisku
//             (AktualizacjePlugin.java, src/app/AndroidUpdates.js),
//   repo    - repozytorium z wydaniami (package.json -> build.publish).
// node tools/android-www.mjs --odcisk - tylko wypisuje odcisk.
// ------------------------------------------------------------

import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// LICENSE.md - licencja gry (PolyForm Noncommercial, docs/licencja.md).
const FILES = ['index.html', 'src', 'assets', 'lib', 'LICENSE.md'];

// Część na telefon: zmiana czegoś tutaj = nowa aplikacja (.apk).
const NATIVE_FILES = [
    'android/app/src/main/java',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/xml',
    'android/app/build.gradle',
    'android/app/capacitor.build.gradle',
    'android/build.gradle',
    'android/settings.gradle',
    'android/capacitor.settings.gradle',
    'android/variables.gradle',
    'capacitor.config.json'
];


// Wszystkie pliki (ścieżki) w kolejności alfabetycznej.

function listFiles(path) {

    if (!existsSync(path)) {
        return [];
    }

    if (!statSync(path).isDirectory()) {
        return [path];
    }

    return readdirSync(path)
        .sort()
        .flatMap((name) => listFiles(join(path, name).replaceAll('\\', '/')));

}


// Odcisk: SHA-256 nazw i treści plików (końce linii jak w gicie - na
// Windowsie i w GitHub Actions wychodzi to samo) i wersji paczek
// Capacitora; 16 znaków.

function nativeFingerprint() {

    const hash = createHash('sha256');

    for (const file of NATIVE_FILES.flatMap(listFiles)) {
        hash.update(file + '\n');
        hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n') + '\n');
    }

    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

    const capacitor = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
        .filter(([name]) => name.includes('capacitor'))
        .sort(([a], [b]) => a.localeCompare(b));

    hash.update(JSON.stringify(capacitor));

    return hash.digest('hex').slice(0, 16);

}


if (process.argv.includes('--odcisk')) {
    console.log(nativeFingerprint());
    process.exit(0);
}


rmSync('www', { recursive: true, force: true });
mkdirSync('www');

for (const name of FILES) {

    if (!existsSync(name)) {
        console.error(`Brak ${name} - uruchom w folderze gry.`);
        process.exit(1);
    }

    cpSync(name, `www/${name}`, { recursive: true });

}


const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const info = {
    version: pkg.version,
    native: nativeFingerprint(),
    repo: `${pkg.build.publish.owner}/${pkg.build.publish.repo}`
};

writeFileSync('www/wersja.json', JSON.stringify(info, null, 4) + '\n');

console.log(`Pliki gry skopiowane do www/: ${FILES.join(', ')} + wersja.json (${info.version}, odcisk ${info.native})`);
