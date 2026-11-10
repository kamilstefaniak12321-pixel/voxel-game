// ------------------------------------------------------------
// SPRAWDZENIE OPISU KOMEND (0.82.2)
//
// docs/komendy.md ma nadążać za grą (w 0.82.1 rozjechał się ręcznie):
// - każda komenda z GAME_COMMANDS (także sekretna) jest w opisie
//   jako `/nazwa`, a każda podkomenda z `usage` - jako `/nazwa słowo`,
// - każda nazwa ustawienia z /ustaw (SETTING_WORDS) jest w opisie
//   w odwrotnych apostrofach,
// - każda scena testowa (src/dev/scenes.js) jest w liście `/scena`
//   i w tabeli docs/tryb-programisty.md,
// - opis nie wymienia komend, których gra nie zna.
//
// Uruchomienie: node tools/sprawdz_komendy_opis.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const url = path => new URL(`../${path}`, import.meta.url).href;
const commandUrl = url('src/commands/gameCommands.js');
const allowed = new Set(['./CommandRegistry.js', '../blocks/BlockRegistry.js', '../items/ItemRegistry.js',
    '../blocks/trees.js', '../blocks/treeCatalog.js', '../audio/sounds.js', '../world/terrain/rocks.js', '../config.js']);
const stubs = new Map();
for (const [, bindings, specifier] of readFileSync(new URL(commandUrl), 'utf8').matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
    if (allowed.has(specifier)) continue;
    const names = bindings.trim().startsWith('{')
        ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}')).split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)
        : [];
    // Atrapy: moduły niepotrzebne do listy komend (jak w sprawdz_komendy_czyszczenie.mjs).
    stubs.set(specifier, `data:text/javascript,${encodeURIComponent(names.map(name => `export const ${name}=undefined;`).join('\n'))}`);
}
registerHooks({
    resolve(specifier, context, next) {
        const stub = context.parentURL === commandUrl ? stubs.get(specifier) : null;
        return stub ? { url: stub, shortCircuit: true } : next(specifier === 'three' ? url('lib/three/three.module.js') : specifier, context);
    },
    load(path, context, next) {
        return next(path, path.endsWith('.js') && path.includes('/src/') ? { ...context, format: 'module' } : context);
    }
});

const { GAME_COMMANDS, SETTING_WORDS } = await import(commandUrl);
const doc = readFileSync(new URL('../docs/komendy.md', import.meta.url), 'utf8');
const devDoc = readFileSync(new URL('../docs/tryb-programisty.md', import.meta.url), 'utf8');
const scenesSource = readFileSync(new URL('../src/dev/scenes.js', import.meta.url), 'utf8');

let checks = 0;
const problems = [];
const check = (condition, message) => { checks++; if (!condition) problems.push(message); };

// --- Komendy i podkomendy --------------------------------------------------

const known = new Set();
for (const command of GAME_COMMANDS) {
    known.add(command.name);
    for (const alias of command.aliases ?? []) known.add(alias);
    check(new RegExp(`\`/${command.name}(?![a-z0-9-])`).test(doc), `docs/komendy.md: brak komendy /${command.name} (${command.usage})`);
    // Podkomendy: pierwsze stałe słowo po nazwie w każdym wariancie usage.
    for (const variant of String(command.usage ?? '').split(/\s+\|\s+(?=\/)/)) {
        const words = variant.trim().split(/\s+/);
        if (words[0] !== `/${command.name}` || !words[1] || !/^[a-z][a-z0-9-]*$/.test(words[1])) continue;
        const sub = words[1];
        // Słowo w pierwszej komórce wiersza tej komendy (np. `/model gladki \| klocki`)
        // albo w opisie jako `słowo`.
        const rows = doc.split('\n').filter(line => line.startsWith(`| \`/${command.name}`));
        const word = new RegExp(`(^|[^a-z0-9-])${sub}(?![a-z0-9-])`);
        check(rows.some(row => word.test(row.split(" | ")[0]) || row.includes(`\`${sub}\``) || row.includes(`/${command.name} ${sub}`)),
            `docs/komendy.md: brak /${command.name} ${sub}`);
    }
}
check(GAME_COMMANDS.length >= 40, `Za mało komend (${GAME_COMMANDS.length}) - zła atrapa?`);

for (const [, name] of doc.matchAll(/^\| `\/([a-z0-9-]+)/gm)) {
    check(known.has(name), `docs/komendy.md opisuje /${name}, a gra jej nie zna`);
}


// --- Nazwy ustawień w /ustaw ----------------------------------------------------

const settingWords = Object.keys(SETTING_WORDS);
check(settingWords.length > 30, 'Brak listy SETTING_WORDS');
for (const word of settingWords) {
    check(doc.includes(`\`${word}\``), `docs/komendy.md: brak ustawienia \`${word}\` w liście nazw /ustaw`);
}


// --- Sceny testowe ----------------------------------------------------------------

const sceneList = scenesSource.slice(scenesSource.indexOf('export const SCENES'));
const scenes = [...sceneList.matchAll(/^\s+id: '([a-z0-9-]+)'/gm)].map(match => match[1]);
check(scenes.length >= 10, `Za mało scen (${scenes.length})`);
const sceneLine = doc.split('\n').find(line => line.startsWith('| `/scena <nazwa>`')) ?? '';
for (const scene of scenes) {
    check(new RegExp(`[(, ]${scene}[,)]`).test(sceneLine), `docs/komendy.md: /scena <nazwa> nie wymienia sceny ${scene}`);
    check(devDoc.includes(`| \`${scene}\` |`), `docs/tryb-programisty.md: brak sceny ${scene} w tabeli`);
}


assert.deepEqual(problems, [], `Opis komend nie nadąża za grą:\n- ${problems.join('\n- ')}`);
console.log(`OK: opis komend - ${checks} sprawdzeń (${GAME_COMMANDS.length} komend, ${settingWords.length} nazw ustawień, ${scenes.length} scen).`);
