// Atrapy importów dla testów komend (Node, bez przeglądarki).
//
// Komendy leżą w kilku plikach src/commands/*.js (od 0.96.0). Testy
// wczytują prawdziwe komendy, ale niepotrzebne im moduły (dźwięk, niebo,
// interfejs) zastępują pustymi atrapami. commandStubs(allowed) zwraca
// mapę "adres pliku z komendami|importowany moduł" -> adres atrapy;
// moduły z listy allowed i sąsiednie pliki komend (./...) zostają
// prawdziwe.
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../../src/commands/', import.meta.url);

export const commandFiles = readdirSync(directory).filter((name) => name.endsWith('.js'))
    .map((name) => new URL(name, directory).href);

export function commandStubs(allowed) {
    const stubs = new Map();
    for (const parent of commandFiles) {
        const source = readFileSync(new URL(parent), 'utf8');
        for (const [, bindings, specifier] of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
            if (specifier.startsWith('./') || allowed.has(specifier)) continue;
            const names = bindings.trim().startsWith('{')
                ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}')).split(',')
                    .map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)
                : [];
            stubs.set(`${parent}|${specifier}`,
                `data:text/javascript,${encodeURIComponent(names.map((name) => `export const ${name}=undefined;`).join('\n'))}`);
        }
    }
    return stubs;
}
