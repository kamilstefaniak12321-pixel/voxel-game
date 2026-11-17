// ------------------------------------------------------------
// SPRAWDZENIE PACZKI PLIKÓW GRY (1.1.3) - bez przeglądarki
//
// - paczka się buduje: start gry, trzy wątki, wspólne części,
// - zasady, dzięki którym kod nie wie, że jest w paczce:
//   adresy plików liczone od pliku mają postać, która z pakiet/js/
//   trafia w to samo miejsce co z src/<folder>/; każdy wątek z kodu jest
//   na liście WORKERS; start gry liczy adresy od strony, nie od pliku,
// - bootstrap.js niczego nie importuje na stałe i ma zapas (src/start.js),
// - aplikacje dostają paczkę: package.json, android-www.mjs, workflow.
//
// Prawdziwą grę z paczki uruchamia tools/sprawdz_pakiet_webgl.mjs.
// Uruchomienie: node tools/sprawdz_pakiet.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, cpSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildBundle, ENTRY, WORKERS, BUNDLE_DIR, DATA_FILE, DATA_FOLDERS } from './pakiet.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const read = (path) => readFileSync(join(root, path), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
    const path = posix.join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
});
const sources = walk('src').filter((path) => path.endsWith('.js'));


// --- Zasady w kodzie gry ---------------------------------------------------------------

const urls = [];
for (const file of sources) {
    const text = read(file);
    for (const match of text.matchAll(/new URL\(\s*(['"`])([^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g)) urls.push({ file, target: match[2] });
    const all = [...text.matchAll(/import\.meta\.url/g)].length;
    const known = [...text.matchAll(/new URL\(\s*(['"`])([^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g)].length;
    // defaultWorker w ChunkGeneration i FarTerrain mają tę samą postać; inne użycie trzeba obejrzeć.
    check(all === known, `${file}: każde import.meta.url ma postać new URL('...', import.meta.url) (jest ${all}, rozpoznanych ${known})`);
}
check(urls.length >= 10, `Adresy liczone od pliku: ${urls.length}`);
const workersInCode = new Set();
for (const { file, target } of urls) {
    if (target.startsWith('../../assets/') || target === '../../pakiet/dane.json') {
        // Z src/<folder>/plik.js i z pakiet/js/plik.js '../../' to folder gry.
        check(file.split('/').length === 3, `${file}: '../../assets/' działa tylko z pliku w src/<folder>/ (dwa poziomy)`);
    }
    else if (/^\.\/[\w-]+\.js$/.test(target)) {
        workersInCode.add(posix.join(dirname(file), target));
    }
    else {
        check(false, `${file}: adres '${target}' nie zadziała z paczki - licz go od strony (document.baseURI) albo dopisz regułę`);
    }
}
check(workersInCode.size === WORKERS.length && WORKERS.every((worker) => workersInCode.has(worker)),
    `Każdy wątek z kodu jest na liście WORKERS w tools/pakiet.mjs (kod: ${[...workersInCode].join(', ')})`);
for (const file of sources) {
    const text = read(file);
    if (/new Worker\(/.test(text)) check(/import\.meta\.url/.test(text) || /workerFactory/.test(text), `${file}: wątek tworzony z adresu liczonego od pliku`);
}

const bootstrap = read('src/bootstrap.js'), start = read(ENTRY);
check(!/^\s*import\s[^(]/m.test(bootstrap), 'bootstrap.js niczego nie importuje na stałe (jedna kopia diagnostyki i gry)');
check(bootstrap.includes(`'../${BUNDLE_DIR}/start.js'`) && bootstrap.includes(`import('./start.js')`), 'bootstrap.js: paczka albo src/start.js');
check(/catch \(error\)[\s\S]*__pakietBlad/.test(bootstrap) && /if \(!loaded\)[\s\S]*import\('\.\/start\.js'\)/.test(bootstrap), 'bootstrap.js: uszkodzona paczka -> start z src/ i ślad');
check(/window\.desktop\.bundle === true/.test(bootstrap) && /pakiet === true/.test(bootstrap) && /has\('pakiet'\)/.test(bootstrap), 'bootstrap.js: komputer, telefon i przeglądarka na życzenie');
check(!/import\.meta\.url/.test(start) && /document\.baseURI/.test(start), 'start.js liczy adresy od strony gry');
check(/await import\('\.\/main\.js'\)/.test(start), 'start.js: diagnostyka, potem gra');
check(/src="\.\/src\/bootstrap\.js"/.test(read('index.html')), 'index.html dalej wczytuje src/bootstrap.js');


// --- Budowanie ---------------------------------------------------------------------------

const stage = mkdtempSync(join(tmpdir(), 'voxel-pakiet-'));
try {
    for (const name of ['src', 'lib', 'assets/models', 'assets/rosliny']) cpSync(join(root, name), join(stage, name), { recursive: true });
    cpSync(join(root, 'package.json'), join(stage, 'package.json'));
    const built = await buildBundle(stage);
    const version = JSON.parse(read('package.json')).version;
    check(built.warnings === 0, 'Budowanie bez ostrzeżeń');
    check(built.inputs >= 250 && built.files.length <= 40, `Z ${built.inputs} plików powstaje ${built.files.length}`);
    for (const name of ['start.js', ...WORKERS.map((worker) => worker.split('/').pop())]) {
        check(built.files.includes(name), `W paczce jest ${name} (ta sama nazwa co w src/)`);
    }
    check(built.files.every((name) => /^[\w.-]+\.js$/.test(name)), 'Wszystkie pliki paczki leżą w jednym folderze');
    // Importy między plikami paczki: tylko na początku linii albo import("...").
    const importsOf = (text) => [...text.matchAll(/^\s*(?:import|export)\b[^"'\n]*?\bfrom\s*"([^"]+)"|^\s*import\s*"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/gm)]
        .map((match) => match[1] ?? match[2] ?? match[3]);
    const outputs = Object.fromEntries(built.files.map((name) => [name, readFileSync(join(built.outdir, name), 'utf8')]));
    const whole = Object.values(outputs).join('\n');
    for (const [name, text] of Object.entries(outputs)) {
        const imports = importsOf(text).filter((target) => !target.startsWith('node:'));
        check(imports.every((target) => /^\.\/[\w.-]+\.js$/.test(target) && built.files.includes(target.slice(2))), `${name}: importuje tylko pliki paczki (${imports.filter((t) => !/^\.\//.test(t)).join(', ')})`);
    }
    check(whole.includes('WebGLRenderer') && !/from\s*"three"/.test(whole), 'Biblioteka three jest w paczce');
    check(whole.includes('class Game ') || whole.includes('Game = class'), 'Nazwy klas zostają czytelne (raport diagnostyczny)');
    check(/new URL\("\.\/FarTerrainWorker\.js", import\.meta\.url\)/.test(whole) && /new URL\("\.\/ChunkGenerationWorker\.js", import\.meta\.url\)/.test(whole) && /new URL\("\.\/storage-worker\.js", import\.meta\.url\)/.test(whole), 'Adresy wątków zostają liczone od pliku paczki');
    check(/new URL\(`?"?\.\.\/\.\.\/assets\//.test(whole), 'Adresy obrazków i dźwięków zostają liczone od pliku paczki');
    const list = JSON.parse(readFileSync(join(stage, 'pakiet', 'spis.json'), 'utf8'));
    check(list.version === version && list.files.length === built.files.length && list.bytes === built.bytes, 'spis.json: wersja i lista plików');
    // Odcisk gry: na początku każdego pliku paczki; zmiana dowolnego pliku gry go zmienia.
    check(/^\d+\.\d+\.\d+\+[0-9a-f]{16}$/.test(built.buildId) && built.buildId.startsWith(version + '+'), `Odcisk gry: ${built.buildId}`);
    check(Object.entries(outputs).every(([, text]) => text.startsWith(`globalThis.__VR_BUILD ??= ${JSON.stringify(built.buildId)};`)), 'Każdy plik paczki (także wątki) zaczyna się od odcisku gry');
    check(list.build === built.buildId, 'spis.json: odcisk');

    // Dane roślin i modeli: jeden plik, te same teksty bajt w bajt.
    const data = JSON.parse(readFileSync(join(stage, DATA_FILE), 'utf8'));
    const dataNames = Object.keys(data.files);
    check(data.build === built.buildId && dataNames.length === built.dataFiles && dataNames.length >= 60, `dane.json: ${dataNames.length} plików, ten sam odcisk`);
    check(dataNames.every((name) => DATA_FOLDERS.some((folder) => name.startsWith(folder + '/')) && name.endsWith('.json')), 'dane.json: tylko opisy roślin i modeli');
    check(dataNames.every((name) => data.files[name] === readFileSync(join(root, name), 'utf8')), 'dane.json: treść identyczna z plikami');
    for (const folder of DATA_FOLDERS) {
        const expected = walk(folder).filter((path) => path.endsWith('.json'));
        check(expected.length > 0 && expected.every((path) => path in data.files), `dane.json: wszystkie pliki z ${folder} (${expected.length})`);
    }
    check(dataNames.includes('assets/rosliny/lista.json') && dataNames.includes('assets/models/rosliny/lista.json'), 'dane.json: listy roślin i modeli');

    // Wątki nie ciągną całej gry: paczka wątku terenu nie zawiera rysowania.
    const reach = (entry, seen = new Set()) => {
        if (seen.has(entry)) return seen;
        seen.add(entry);
        for (const target of importsOf(outputs[entry])) if (outputs[target.slice(2)]) reach(target.slice(2), seen);
        return seen;
    };
    const size = (entry) => [...reach(entry)].reduce((sum, name) => sum + outputs[name].length, 0);
    check(size('ChunkGenerationWorker.js') < size('start.js') * 0.6, `Wątek terenu wczytuje część paczki (${(size('ChunkGenerationWorker.js') / 1048576).toFixed(1)} MB z ${(size('start.js') / 1048576).toFixed(1)} MB)`);
    check(![...reach('storage-worker.js')].some((name) => outputs[name].includes('WebGLRenderer')), 'Wątek zapisu nie wczytuje biblioteki three');
    // Ponowne budowanie zastępuje starą paczkę (bez resztek po poprzedniej wersji).
    const again = await buildBundle(stage);
    check(again.files.join() === built.files.join() && readdirSync(again.outdir).length === built.files.length, 'Ponowne budowanie daje te same pliki i nie zostawia starych');
    check(again.buildId === built.buildId, 'Te same pliki = ten sam odcisk gry');
    writeFileSync(join(stage, 'assets/rosliny/lista.json'), readFileSync(join(stage, 'assets/rosliny/lista.json'), 'utf8') + '\n');
    const changed = await buildBundle(stage);
    check(changed.buildId !== built.buildId && changed.buildId.startsWith(version + '+'), 'Zmiana pliku danych zmienia odcisk gry (pamięć startu przestaje pasować)');
    console.log(`  paczka: ${built.inputs} plików -> ${built.files.length} (${(built.bytes / 1048576).toFixed(1)} MB)`);
}
finally {
    rmSync(stage, { recursive: true, force: true });
}
{
    let failed = false;
    const empty = mkdtempSync(join(tmpdir(), 'voxel-pakiet-pusty-'));
    try { await buildBundle(empty); } catch { failed = true; } finally { rmSync(empty, { recursive: true, force: true }); }
    check(failed, 'Budowanie w złym folderze kończy się błędem, nie pustą paczką');
}


// --- Aplikacje dostają paczkę -------------------------------------------------------------

{
    const pkg = JSON.parse(read('package.json'));
    check(pkg.build.files.includes('pakiet/**/*') && pkg.build.files.includes('src/**/*'), 'Aplikacja na komputer: paczka i src/ (zapas)');
    check(/node tools\/pakiet\.mjs && electron-builder/.test(pkg.scripts.dist), 'npm run dist buduje paczkę przed instalatorem');
    check(pkg.devDependencies.esbuild && /^\d+\.\d+\.\d+$/.test(pkg.devDependencies.esbuild) && !pkg.dependencies?.esbuild, 'esbuild: dokładna wersja, tylko do budowania');
    const desktop = read('desktop/main.js'), preload = read('desktop/preload.js');
    check(/bundle: \(app\.isPackaged \|\| process\.env\.VOXEL_QA_BUNDLE === '1'\) &&\s*fs\.existsSync\(path\.join\(GAME_ROOT, 'pakiet', 'js', 'start\.js'\)\)/.test(desktop), 'Komputer: paczka tylko w zbudowanej aplikacji i tylko gdy plik jest');
    check(/bundle: info\.bundle === true/.test(preload), 'Komputer: gra dostaje desktop.bundle');
    const www = read('tools/android-www.mjs');
    check(/buildBundle\('www', \{ version: pkg\.version \}\)/.test(www) && /pakiet: true/.test(www) && www.indexOf("buildBundle('www'") > www.indexOf('cpSync(name'), 'Telefon: paczka budowana w www/ po skopiowaniu plików, znacznik w wersja.json');
    const workflow = read('.github/workflows/aplikacja.yml');
    check(workflow.indexOf('node tools/pakiet.mjs') > 0 && workflow.indexOf('node tools/pakiet.mjs') < workflow.indexOf('npx electron-builder --win'), 'Wydanie: paczka przed instalatorem');
    check(/\$PUBLIC\/pakiet\/js\/start\.js/.test(workflow), 'Wydanie: aplikacja na telefon bez paczki nie przejdzie');
    check(read('.gitignore').split(/\r?\n/).includes('pakiet/'), 'Paczka nie trafia do gita');
    check(!existsSync(join(root, 'pakiet')) || !read('.gitignore').includes('!pakiet'), 'Folder pakiet/ jest pomijany');
    check(read('.github/workflows/testy.yml').includes('sprawdz_pakiet_webgl.mjs'), 'Testy gry uruchamiają prawdziwą grę z paczki');
}


// --- Pamięć startu (storage/StartCache.js) ------------------------------------------------

{
    // Udawana baza IndexedDB: jeden magazyn klucz -> wartość.
    const stores = new Map();
    let failing = false;
    globalThis.indexedDB = {
        open(name) {
            const request = {};
            queueMicrotask(() => {
                if (failing) { request.error = new Error('brak miejsca'); request.onerror?.(); return; }
                const fresh = !stores.has(name);
                if (fresh) stores.set(name, new Map());
                const db = {
                    objectStoreNames: { contains: () => !fresh },
                    createObjectStore: () => {},
                    transaction() {
                        const tx = {};
                        tx.objectStore = () => ({
                            get(key) { const r = { result: structuredClone(stores.get(name).get(key)) }; queueMicrotask(() => tx.oncomplete?.()); return r; },
                            put(value, key) { stores.get(name).set(key, structuredClone(value)); const r = {}; queueMicrotask(() => tx.oncomplete?.()); return r; }
                        });
                        return tx;
                    }
                };
                request.result = db;
                if (fresh) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
    const load = (build, tag) => { if (build === null) delete globalThis.__VR_BUILD; else globalThis.__VR_BUILD = build; return import(`../src/storage/StartCache.js?${tag}`); };

    // Praca nad grą (bez odcisku): nic się nie zapamiętuje i nie czyta.
    const dev = await load(null, 'dev');
    check(dev.BUILD_ID === null && await dev.writeStartCache('ikonki', 'k', { a: 1 }) === false && await dev.readStartCache('ikonki', 'k') === null && stores.size === 0, 'Bez odcisku gry pamięć startu jest wyłączona (i nie tworzy bazy)');

    const a = await load('1.1.4+aaaa', 'a');
    check(a.BUILD_ID === '1.1.4+aaaa' && await a.readStartCache('ikonki', 'k') === null, 'Pusta pamięć: null');
    check(await a.writeStartCache('ikonki', 'k', { urls: ['x'], n: 3 }) === true, 'Zapis');
    check(JSON.stringify(await a.readStartCache('ikonki', 'k')) === '{"urls":["x"],"n":3}', 'Odczyt tego samego wpisu');
    check(await a.readStartCache('ikonki', 'inny-klucz') === null, 'Inny klucz (np. inne tekstury): null');
    check(await a.readStartCache('cos-innego', 'k') === null, 'Inna nazwa: null');
    check(await a.writeStartCache('ikonki', '', { a: 1 }) === false && await a.readStartCache('ikonki', null) === null, 'Bez klucza nic się nie dzieje');
    check([...stores.keys()].join() === 'voxel-game-start-cache', 'Osobna baza - nie dotyka światów ani ustawień');

    // Nowa wersja gry: stary wpis nie pasuje, nowy go zastępuje.
    const b = await load('1.1.5+bbbb', 'b');
    check(await b.readStartCache('ikonki', 'k') === null, 'Po aktualizacji gry stary wpis jest nieważny');
    await b.writeStartCache('ikonki', 'k', { urls: ['y'] });
    check((await b.readStartCache('ikonki', 'k')).urls[0] === 'y' && await a.readStartCache('ikonki', 'k') === null && stores.get('voxel-game-start-cache').size === 1, 'Jeden wpis na nazwę - stary zastąpiony');

    // Błąd bazy: gra liczy od nowa, bez wyjątku.
    failing = true;
    const c = await load('1.1.6+cccc', 'c');
    check(await c.readStartCache('ikonki', 'k') === null && await c.writeStartCache('ikonki', 'k', {}) === false, 'Błąd bazy: null i false, bez wyjątku');
    failing = false;
    check(await c.writeStartCache('ikonki', 'k', { ok: 1 }) === true && (await c.readStartCache('ikonki', 'k')).ok === 1, 'Po błędzie następna próba działa');
    delete globalThis.indexedDB; delete globalThis.__VR_BUILD;

    const icons = read('src/ui/BlockIcons.js');
    check(/if \(atlas\.pack\) \{\s*return null;/.test(icons), 'Z paczką tekstur gracza ikonek się nie zapamiętuje');
    check(/crypto\.subtle\.digest\('SHA-256', pixels\)/.test(icons) && /iconTileSize/.test(icons.slice(icons.indexOf('async function iconCacheKey'), icons.indexOf('function expectedIconNames'))), 'Klucz ikonek: skrót obrazka tekstur i rozmiar kafelka');
    check(/await installUiTextureSheets\(\);\s*const key = await iconCacheKey\(\);/.test(icons), 'Obrazki interfejsu instalują się także przy ikonkach z pamięci');
    check(/icons\.size === expectedIconNames\(\)\.size\) \{\s*void writeStartCache/.test(icons), 'Niepełnego zestawu ikonek się nie zapamiętuje');
    const dataFiles = read('src/blocks/dataFiles.js');
    check(/data\.build === BUILD_ID/.test(dataFiles) && /\.catch\(\(\) => null\)/.test(dataFiles), 'Dane z innego budowania albo błąd pobrania: zwykłe pliki');
    for (const file of ['src/blocks/plantPacks.js', 'src/blocks/plantModels.js']) {
        const text = read(file);
        check(text.indexOf('await bundledText(') > 0 && text.indexOf('await bundledText(') < text.indexOf('await fetch(url.href'), `${file}: najpierw plik zbiorczy, potem zwykły plik`);
    }
}

console.log(`OK: paczka plików gry - ${checks} sprawdzeń`);
