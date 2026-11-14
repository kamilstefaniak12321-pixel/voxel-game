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
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/pakiet');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-pakiet-'));
const stage = await mkdtemp(resolve(tmpdir(), 'voxel-pakiet-pliki-'));

// Kopia gry do zbudowania paczki; main.js dostaje dostęp do gry dla testu.
const mainAccessors = `
// Tylko w teście: dostęp do prawdziwych obiektów aplikacji.
menuBackdrop.stop();
menuBackdrop.start = async () => {};
window.pakietQA = {
 diagnostics,
 get game() { return game; },
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
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
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
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, 'swiat-z-paczki.png'), Buffer.from(shot.data, 'base64'));
    const bundleScripts = scripts().length;

    // --- 2. Bez prośby o paczkę: zwykłe pliki ------------------------------------------
    await open('/');
    check(await evaluate('window.__pakiet') === false, 'Bez ?pakiet gra rusza z src/');
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
