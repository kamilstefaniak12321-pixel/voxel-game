// ------------------------------------------------------------
// SPRAWDZENIE PACZKI PLIKÓW GRY W PRAWDZIWEJ PRZEGLĄDARCE (1.1.3)
//
// Buduje paczkę (tools/pakiet.mjs) w folderze tymczasowym i uruchamia
// z niej prawdziwą grę:
//   - menu i świat z paczki: żaden plik gry poza bootstrap.js nie
//     pochodzi z src/, wątki w tle (teren, daleki teren, zapis) działają,
//     wersja gry odczytana, zero błędów,
//   - bez prośby o paczkę gra rusza z src/ (praca nad grą, testy),
//   - uszkodzona paczka: gra rusza z src/ i zostawia ślad.
//
// SwiftShader sprawdza poprawność, nie szybkość.
// Uruchomienie: node tools/sprawdz_pakiet_webgl.mjs
// Opcjonalnie na Windows: --d3d11 uruchamia test na GPU.
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile, cp } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { buildBundle, WORKERS } from './pakiet.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const d3d11 = process.argv.includes('--d3d11');
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/pakiet');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-pakiet-'));
const stage = await mkdtemp(resolve(tmpdir(), 'voxel-pakiet-pliki-'));

// Kopia gry do zbudowania paczki; main.js dostaje dostęp do gry dla testu.
const mainAccessors = `
// Tylko w teście: dostęp do prawdziwych obiektów aplikacji.
menuBackdrop.stop();
menuBackdrop.start = async () => {};
import { blockIconsSource as __iconsSource } from './ui/BlockIcons.js';
window.pakietQA = {
 diagnostics,
 reloadGame,
 get game() { return game; },
 async hasRetriedEdit() {
  const chunks = await storage.loadChunks(sessionStorage.getItem('retry-world'));
  return chunks.get('0,0')?.[(120 * 16 + 8) * 16 + 8] === Number(sessionStorage.getItem('retry-type'));
 },
 // Ikonki: skąd są (pamięć startu albo rysowanie) i skrót wszystkich.
 get iconsSource() { return __iconsSource; },
 async iconsDigest() {
  const text = JSON.stringify([...blockIcons].sort(([a], [b]) => a < b ? -1 : 1));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return blockIcons.size + ':' + [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
 },
 // Bez przechwyconej myszy gra stoi na pauzie - test wznawia ją sam.
 play() { state = 'playing'; menu.hide(); return true; },
 async start() {
  const info = createWorldInfo('Pakiet QA', 731, 'realistic', 'developer');
  await storage?.saveWorld(info);
  await playWorld(info);
  return Boolean(game);
 }
};
`;
await cp(resolve(root, 'src'), resolve(stage, 'src'), { recursive: true });
await cp(resolve(root, 'lib'), resolve(stage, 'lib'), { recursive: true });
// Dane modeli to też kod (assets/models/**/model-data.js) - wchodzą do paczki.
await cp(resolve(root, 'assets/models'), resolve(stage, 'assets/models'), { recursive: true });
// Opisy roślin trafiają do pliku zbiorczego (pakiet/dane.json); tekstury - do odcisku gry.
for (const name of ['assets/rosliny', 'assets/textures', 'assets/ui']) await cp(resolve(root, name), resolve(stage, name), { recursive: true });
await cp(resolve(root, 'package.json'), resolve(stage, 'package.json'));
await writeFile(resolve(stage, 'src/main.js'), (await readFile(resolve(root, 'src/main.js'), 'utf8')) + mainAccessors);
const built = await buildBundle(stage);
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const index = await readFile(resolve(root, 'index.html'), 'utf8');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
let broken = false;
const served = [];
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        response.setHeader('Cache-Control', 'no-store');
        if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
        if (pathname === '/' || pathname === '/index.html') { response.setHeader('Content-Type', 'text/html'); response.end(index); return; }
        served.push(pathname);
        if (broken && pathname === '/pakiet/js/start.js') { response.writeHead(404).end(); return; }
        // Kod i paczka z kopii, reszta (obrazki, dźwięki, paczki roślin) z gry.
        const base = /^\/(src|pakiet|lib)\/|^\/package\.json$/.test(pathname) ? stage : root;
        const file = resolve(base, '.' + pathname);
        if (!file.startsWith(base.endsWith(sep) ? base : base + sep)) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let chrome, socket, logs = '', checks = 0;
const exceptions = [];
try {
    chrome = spawn(process.env.CHROME_BIN ?? (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage',
        ...(d3d11 ? ['--use-angle=d3d11', '--high-performance-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
        '--no-first-run', '--disable-background-networking', '--hide-scrollbars', '--window-size=640,400',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let startupError;
    chrome.on('error', error => { startupError = error; });
    chrome.stdout.on('data', data => { logs += data; });
    chrome.stderr.on('data', data => { logs += data; });
    const pause = ms => new Promise(r => setTimeout(r, ms));
    let port;
    const started = Date.now();
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || Date.now() - started > 60000) throw new Error(`Chrome startup failed: ${logs}`);
        await pause(100);
    }
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const page = pages.find(page => page.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl); await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const p = pending.get(message.id); pending.delete(message.id); clearTimeout(p.timer);
            if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            exceptions.push(message.params.exceptionDetails?.exception?.description ?? JSON.stringify(message.params).slice(0, 300));
        }
    });
    const call = (method, params = {}, timeoutMs = 120000) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? JSON.stringify(value.exceptionDetails));
        return value.result?.value;
    };
    const waitFor = async (expression, timeout = 180000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const value = await evaluate(expression);
            if (value) return value;
            await pause(250);
        }
        const state = await evaluate(`JSON.stringify({ gen: window.pakietQA?.game?.world.generation?.getStats?.(), kolejka: window.pakietQA?.game?.world.loadQueue.length, chunki: window.pakietQA?.game?.world.chunks.size })`).catch(() => '?');
        throw new Error(`Warunek nie został spełniony: ${expression}\nStan: ${state}\nPliki: ${served.filter(p => p.endsWith('.js')).join(', ')}\n${exceptions.join('\n')}`);
    };
    const check = (value, message) => { assert.ok(value, message); checks++; };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('voxel-game-settings',JSON.stringify({revision:3,
        potato:true,viewDistance:32,farTerrain:1024,renderScale:25,shadows:0,lightShafts:false,bounceLight:false,
        fpsLimit:60,volumeMaster:0,volumeMusic:0,autoUpdates:false,menuMotion:'off',tutorial:false}));` });
    const open = async (path) => {
        served.length = 0; exceptions.length = 0;
        await call('Page.navigate', { url: base + path });
        await waitFor(`document.querySelector('#menu button.menu-button') !== null && typeof window.__pakiet === 'boolean'`);
    };
    // Pliki kodu wczytane przez stronę i jej wątki (z serwera - widzi też wątki).
    const scripts = () => served.filter(path => path.endsWith('.js'));

    // --- 1. Gra z paczki -------------------------------------------------------------
    await open('/?pakiet');
    check(await evaluate('window.__pakiet') === true, 'Gra wystartowała z paczki');
    check(await evaluate(`typeof window.pakietQA === 'object'`), 'Menu działa (prawdziwy main.js w paczce)');
    let fromSource = scripts().filter(path => path.startsWith('/src/'));
    check(fromSource.join() === '/src/bootstrap.js', `Z src/ pochodzi tylko bootstrap.js (jest: ${fromSource.join(', ')})`);
    const menuScripts = scripts().length;
    check(menuScripts <= built.files.length + 1, `Start to najwyżej ${built.files.length + 1} plików kodu (jest ${menuScripts})`);
    check(scripts().every(path => path === '/src/bootstrap.js' || path.startsWith('/pakiet/js/')), 'Biblioteka three też jest w paczce');
    await waitFor(`window.pakietQA.diagnostics.snapshot().app?.version === ${JSON.stringify(version)} || window.pakietQA.diagnostics.version === ${JSON.stringify(version)} || JSON.stringify(window.pakietQA.diagnostics.snapshot()).includes(${JSON.stringify(`"${version}"`)})`, 30000);
    check(true, `Wersja gry (${version}) odczytana z paczki - adres liczony od strony gry`);

    check(await evaluate('window.pakietQA.start()'), 'Świat (teren realistyczny) wczytany z paczki');
    if (d3d11) {
        const adapter = await evaluate(`(() => { const gl = window.pakietQA.game.renderer.getContext();
            return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL); })()`);
        check(/Direct3D11/i.test(adapter) && !/SwiftShader|Basic Render|WARP/i.test(adapter), 'Sprzętowy WebGL2/D3D11');
        console.log('WebGL2:', adapter);
    }
    // Wątek terenu rusza przy pierwszym doczytywaniu - przenosimy gracza dalej.
    await evaluate(`(() => { window.pakietQA.play(); const g = window.pakietQA.game; g.player.flying = true; g.player.pos.x += 160; g.player.pos.y = 140; g.player.vel.set(0, 0, 0); return true; })()`);
    await waitFor(`(() => { const g = window.pakietQA.game, s = g?.world.generation?.getStats(); g.player.pos.y = 140; g.player.vel.set(0, 0, 0); return s?.enabled && s.workerReady && s.applied >= 6; })()`);
    check(true, 'Wątek terenu z paczki liczy chunki');
    await waitFor(`window.pakietQA.game.farTerrain.stats().shown > 0`);
    check(true, 'Wątek dalekiego terenu z paczki buduje kafelki');
    check(await evaluate(`(async () => { const g = window.pakietQA.game; const ok = await g.saver.flush(); return ok !== false; })()`), 'Zapis świata działa (wątek zapisu z paczki)');
    for (const worker of WORKERS) {
        const name = '/pakiet/js/' + worker.split('/').pop();
        const expected = name.includes('storage') ? await evaluate(`Boolean(window.pakietQA.game.saver.storage?.background)`) : true;
        if (expected) check(scripts().includes(name), `Wątek wczytany z paczki: ${name}`);
        check(!scripts().includes('/' + worker), `Wątek nie sięga do ${worker}`);
    }
    fromSource = scripts().filter(path => path.startsWith('/src/'));
    check(fromSource.join() === '/src/bootstrap.js', `Także w świecie nic poza bootstrap.js nie pochodzi z src/ (jest: ${fromSource.join(', ')})`);
    check(await evaluate(`window.pakietQA.game.renderer.info.render.frame > 2`), 'Świat się rysuje');
    check(exceptions.length === 0, `Bez błędów w paczce (${exceptions.slice(0, 2).join(' | ')})`);

    // Dane roślin i modeli: jeden plik zamiast kilkudziesięciu - także w wątkach.
    const dataRequests = served.filter(path => path === '/pakiet/dane.json').length;
    const looseData = served.filter(path => /^\/assets\/(rosliny|models\/rosliny)\/.*\.json$/.test(path));
    const terrainContexts = await evaluate('1 + Number(!!window.pakietQA.game.world.generation.worker) + window.pakietQA.game.farTerrain.workers.length');
    check(dataRequests >= 1 && dataRequests <= terrainContexts, `Dane roślin z jednego pliku na stronę i wątek (pobrań: ${dataRequests})`);
    check(looseData.length === 0, `Żaden opis rośliny nie jest pobierany osobno (jest ${looseData.length}: ${looseData.slice(0, 3).join(', ')})`);
    check(await evaluate(`window.pakietQA.game.world.generation.getStats().failures === 0`), 'Wątek terenu wczytał rośliny bez błędów');

    // Pamięć startu: pierwszy start rysuje ikonki, drugi bierze gotowe - identyczne.
    check(await evaluate('window.pakietQA.iconsSource') === 'rysowanie', 'Pierwszy start: ikonki narysowane');
    const drawn = await evaluate('window.pakietQA.iconsDigest()');
    check(/^\d{4}:/.test(drawn), `Komplet ikonek (${drawn.split(':')[0]})`);
    await pause(2500);
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, 'swiat-z-paczki.png'), Buffer.from(shot.data, 'base64'));
    const bundleScripts = scripts().length;

    // --- 1b. Drugi start z paczki: ikonki z pamięci -------------------------------------
    await evaluate(`(async () => {
        const qa = window.pakietQA, g = qa.game, store = g.saver.storage, write = store.saveWorldAndChunks;
        g.world.setBlock(8, 120, 8, 'oak_planks');
        sessionStorage.setItem('retry-world', g.worldInfo.id);
        sessionStorage.setItem('retry-type', g.world.getBlockId(8, 120, 8));
        store.saveWorldAndChunks = async () => { throw new Error('Test odmowy zapisu IndexedDB'); };
        try { await qa.reloadGame(); } finally { store.saveWorldAndChunks = write; }
        return true;
    })()`);
    check(await evaluate(`Boolean(document.querySelector('.screen-save-error') && window.pakietQA.game.world.hasUnsavedChanges())`),
        'Odmowa zapisu zatrzymuje restart, zachowuje edycję i pokazuje opcję ponowienia');
    await evaluate(`document.querySelector('.screen-save-error button').click(); true`);
    await waitFor(`Boolean(document.querySelector('.screen-title button') && window.pakietQA && !window.pakietQA.game)`);
    check(await evaluate('window.pakietQA.hasRetriedEdit()'), 'Ponowienie zapisu z menu zachowuje blok w IndexedDB po restarcie');
    check(await evaluate('window.pakietQA.iconsSource') === 'pamiec', 'Drugi start: ikonki z pamięci startu');
    check(await evaluate('window.pakietQA.iconsDigest()') === drawn, 'Zapamiętane ikonki są identyczne z narysowanymi');
    check(exceptions.length === 0, `Bez błędów przy starcie z pamięci (${exceptions.slice(0, 2).join(' | ')})`);
    // Wpis od innej wersji gry jest pomijany: ikonki rysują się od nowa.
    await evaluate(`new Promise((resolve, reject) => { const open = indexedDB.open('voxel-game-start-cache');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => { const tx = open.result.transaction('wpisy', 'readwrite'); const store = tx.objectStore('wpisy'); const get = store.get('ikonki');
            get.onsuccess = () => { const entry = get.result; entry.key = 'inna-wersja|' + entry.key; entry.value.urls[0] = 'data:image/png;base64,ZLE'; store.put(entry, 'ikonki'); };
            tx.oncomplete = () => { open.result.close(); resolve(true); }; tx.onerror = () => reject(tx.error); }; })`);
    await open('/?pakiet');
    check(await evaluate('window.pakietQA.iconsSource') === 'rysowanie' && await evaluate('window.pakietQA.iconsDigest()') === drawn, 'Wpis z innej wersji gry: ikonki narysowane od nowa, poprawne');
    await pause(2500);
    // Uszkodzony wpis z dobrym kluczem (obcięta lista): też od nowa.
    await evaluate(`new Promise((resolve, reject) => { const open = indexedDB.open('voxel-game-start-cache');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => { const tx = open.result.transaction('wpisy', 'readwrite'); const store = tx.objectStore('wpisy'); const get = store.get('ikonki');
            get.onsuccess = () => { const entry = get.result; entry.value.names.length = 100; entry.value.index.length = 100; store.put(entry, 'ikonki'); };
            tx.oncomplete = () => { open.result.close(); resolve(true); }; tx.onerror = () => reject(tx.error); }; })`);
    await open('/?pakiet');
    check(await evaluate('window.pakietQA.iconsSource') === 'rysowanie' && await evaluate('window.pakietQA.iconsDigest()') === drawn, 'Uszkodzony wpis: ikonki narysowane od nowa, poprawne');

    // --- 2. Bez prośby o paczkę: zwykłe pliki ------------------------------------------
    await open('/');
    check(await evaluate('window.__pakiet') === false, 'Bez ?pakiet gra rusza z src/');
    check(await evaluate('window.pakietQA.iconsSource') === 'rysowanie' && await evaluate('window.pakietQA.iconsDigest()') === drawn, 'Bez paczki ikonki zawsze się rysują (i są takie same)');
    check(!served.includes('/pakiet/dane.json') && served.some(path => /^\/assets\/rosliny\/.*\.json$/.test(path)), 'Bez paczki opisy roślin czytane ze zwykłych plików');
    check(!scripts().some(path => path.startsWith('/pakiet/')), 'I nie sięga do paczki');
    check(scripts().includes('/src/start.js') && scripts().includes('/src/main.js'), 'Start przez src/start.js i src/main.js');
    const sourceScripts = scripts().length;
    check(sourceScripts > menuScripts * 10, `Paczka to wielokrotnie mniej plików przy starcie (${menuScripts} zamiast ${sourceScripts})`);
    check(exceptions.length === 0, `Bez błędów z src/ (${exceptions.slice(0, 2).join(' | ')})`);

    // --- 3. Uszkodzona paczka: zapas ---------------------------------------------------
    broken = true;
    await open('/?pakiet');
    check(await evaluate('window.__pakiet') === false && await evaluate(`typeof window.__pakietBlad === 'string'`), 'Uszkodzona paczka: gra rusza z src/ i zostawia ślad');
    check(await evaluate(`typeof window.pakietQA === 'object'`) && scripts().includes('/src/main.js'), 'Menu działa z plików zapasowych');
    broken = false;

    await writeFile(resolve(output, 'result.json'), JSON.stringify({ version, bundle: built.files, bytes: built.bytes, inputs: built.inputs, menuScripts, bundleScripts, sourceScripts }, null, 2));
    console.log(`OK: paczka gry w prawdziwym Chrome - ${checks} kontroli; start: ${menuScripts} plików kodu zamiast ${sourceScripts}; paczka ${built.files.length} plików, ${(built.bytes / 1048576).toFixed(1)} MB z ${built.inputs} plików.`);
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs).catch(() => {});
    try { socket?.close(); } catch {}
    if (chrome && chrome.exitCode === null) { const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited; }
    server.closeAllConnections(); await new Promise(r => server.close(r));
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    await rm(stage, { recursive: true, force: true }).catch(() => {});
}
