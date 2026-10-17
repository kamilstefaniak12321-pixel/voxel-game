// ------------------------------------------------------------
// APLIKACJA NA TELEFON (Android) - pliki gry do aplikacji
//
// Kopiuje to, czego gra potrzebuje (index.html, src/, assets/, lib/)
// do folderu www/, a stamtąd "npx cap sync android" wkłada je do
// aplikacji (android/). Uruchamiane przez: npm run android:www
// (w GitHub Actions - .github/workflows/aplikacja.yml). Opis:
// docs/telefon.md.
// ------------------------------------------------------------

import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const FILES = ['index.html', 'src', 'assets', 'lib'];

rmSync('www', { recursive: true, force: true });
mkdirSync('www');

for (const name of FILES) {

    if (!existsSync(name)) {
        console.error(`Brak ${name} - uruchom w folderze gry.`);
        process.exit(1);
    }

    cpSync(name, `www/${name}`, { recursive: true });

}

console.log(`Pliki gry skopiowane do www/: ${FILES.join(', ')}`);
