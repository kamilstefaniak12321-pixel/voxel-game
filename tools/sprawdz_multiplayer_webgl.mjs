// ------------------------------------------------------------
// GRA WIELOOSOBOWA W PRAWDZIWEJ GRZE (0.92.0) - dwie karty Chrome
//
// Gospodarz i gość w osobnych kartach (prawdziwe Game, NetHost,
// NetClient; połączenie przez BroadcastChannel zamiast internetu -
// tools/fixtures/net-loopback.js). Sprawdza:
// - wejście gościa i ten sam teren (chunki niezmienione: z ziarna, zmienione:
//   od gospodarza),
// - bloki w obie strony, chunk zmieniony daleko (pobrany, gdy gość dojdzie),
//   zmiana w chunku, którego gość jeszcze nie ma,
// - skrzynia w obie strony, pora dnia, czat, model i imię drugiego gracza,
// - wyjście gościa: ekwipunek zapisany u gospodarza.
// Zrzuty: test-results/multiplayer/.
//
// Uruchomienie: node tools/sprawdz_multiplayer_webgl.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/multiplayer');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-multiplayer-'));
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
        if (pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`<!doctype html><html lang="pl"><meta charset="utf-8"><style>body{margin:0;background:#888}canvas{display:block}</style><body>
                <script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script>
                <script type="module">import * as mp from '/tools/fixtures/multiplayer.js'; window.mp = mp; window.ready = true;</script>`);
            return;
        }
        const path = resolve(root, '.' + pathname);
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream'); res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
let chrome, logs = '', startupError;
const sockets = [];
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

async function page(port, url) {
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((r) => r.json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    sockets.push(socket);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map(), exceptions = [];
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data), request = pending.get(message.id);
        if (request) {
            pending.delete(message.id); clearTimeout(request.timer);
            message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown') {
            exceptions.push(message.params); logs += '\n' + JSON.stringify(message.params);
        }
    });
    const call = (method, params = {}, timeout = 240000) => new Promise((done, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout ${method}`)); }, timeout);
        pending.set(id, { resolve: done, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
        const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
        return response.result?.value;
    };
    await call('Runtime.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
    const deadline = Date.now() + 60000;
    while (!(await evaluate('Boolean(window.ready)').catch(() => false))) {
        assert.ok(Date.now() < deadline, 'Strona testu się wczytuje');
        await pause(100);
    }
    return { evaluate, exceptions };
}

async function savePng(name, dataUrl) {
    assert.ok(typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,'), `Zrzut ${name}`);
    await writeFile(resolve(output, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
}

try {
    chrome = spawn(process.env.CHROME_BIN ?? (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--window-size=960,600',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    chrome.on('error', (error) => { startupError = error; });
    chrome.stdout.on('data', (data) => { logs += data; });
    chrome.stderr.on('data', (data) => { logs += data; });
    let port;
    const startupDeadline = Date.now() + 20000;
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || Date.now() > startupDeadline) throw Error(`Chrome failed: ${logs}`);
        await pause(100);
    }
    const host = await page(port, pageUrl);
    const guest = await page(port, pageUrl);

    // --- Gospodarz: świat, zmiany przed otwarciem, kod -------------------------
    const code = await host.evaluate(`(async () => {
        window.h = await mp.startHost();
        const g = h.game, p = g.player.pos;
        const x = Math.floor(p.x), z = Math.floor(p.z);
        window.spawn = [x, z];
        const y = h.ground(x + 3, z) + 1;
        h.set(x + 3, y, z, 'oak_planks'); h.set(x + 3, y + 1, z, 'oak_planks');
        window.planks = [x + 3, y + 1, z];
        // Daleko: zmieniony chunk, gość pobierze go, gdy tam dojdzie.
        h.set(x + 200, 40, z, 'oak_planks'); window.far = [x + 200, 40, z];
        const cy = h.ground(x + 5, z + 2) + 1;
        h.set(x + 5, cy, z + 2, 'chest');
        const chest = g.chests.ensure({ x: x + 5, y: cy, z: z + 2 });
        chest.layers[0][0] = { type: 'stone', count: 7 }; g.chests.changed();
        window.chestPos = [x + 5, cy, z + 2];
        await h.run(1);
        return h.open();
    })()`);
    check(/^VOXEL-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(code), `Kod zaproszenia ${code}`);

    // Gospodarz gra dalej, gdy gość wchodzi (wysyła mu chunki).
    const hostLoop = (seconds) => host.evaluate(`h.run(${seconds})`);
    const loop = host.evaluate('(async () => { window.hostRunning = true; while (window.hostRunning) await h.run(0.2); })()');
    const started = Date.now();
    await guest.evaluate(`(async () => { window.g = await mp.startGuest(${JSON.stringify(code)}); })()`);
    const joinSeconds = (Date.now() - started) / 1000;
    await host.evaluate('window.hostRunning = false'); await loop;
    check(joinSeconds < 60, `Gość w świecie po ${joinSeconds.toFixed(1)} s`);
    await Promise.all([hostLoop(2), guest.evaluate('g.run(2)')]);

    // --- Ten sam teren ---------------------------------------------------------
    const hashes = async (side, name) => side.evaluate(`(() => { const r = {}; for (const k of ${name}.loadedKeys()) { const [cx, cz] = k.split(',').map(Number); r[k] = ${name}.chunkHash(cx, cz); } return r; })()`);
    const [hostChunks, guestChunks] = await Promise.all([hashes(host, 'h'), hashes(guest, 'g')]);
    const common = Object.keys(hostChunks).filter((key) => key in guestChunks);
    const different = common.filter((key) => hostChunks[key] !== guestChunks[key]);
    check(common.length >= 40 && different.length === 0, `Ten sam teren u obu (${common.length} chunków, różnych: ${different.join(' ')})`);
    const planks = await host.evaluate('window.planks');
    check(await guest.evaluate(`g.block(${planks.join(',')})`) === 'oak_planks', 'Gość widzi zmianę sprzed otwarcia świata');

    // --- Bloki w obie strony ---------------------------------------------------
    const origin = await host.evaluate('window.spawn');
    const placed = await guest.evaluate(`(() => { const y = g.ground(${origin[0] - 2}, ${origin[1]}) + 1; g.set(${origin[0] - 2}, y, ${origin[1]}, 'stone'); return [${origin[0] - 2}, y, ${origin[1]}]; })()`);
    await Promise.all([hostLoop(1), guest.evaluate('g.run(1)')]);
    check(await host.evaluate(`h.block(${placed.join(',')})`) === 'stone', 'Blok postawiony przez gościa u gospodarza');
    await host.evaluate(`h.set(${planks.join(',')}, null)`);
    await Promise.all([hostLoop(1), guest.evaluate('g.run(1)')]);
    check(await guest.evaluate(`g.block(${planks.join(',')})`) === null, 'Blok zniszczony przez gospodarza znika u gościa');

    // --- Skrzynia, pora dnia, czat ---------------------------------------------
    const chestPos = await host.evaluate('window.chestPos');
    const chestExpr = (name) => `${name}.game.chests.get({ x: ${chestPos[0]}, y: ${chestPos[1]}, z: ${chestPos[2]} })`;
    check(await guest.evaluate(`${chestExpr('g')}?.layers[0][0]?.count`) === 7, 'Gość widzi zawartość skrzyni');
    await guest.evaluate(`(() => { const c = ${chestExpr('g')}; c.layers[0][1] = { type: 'oak_planks', count: 3 }; g.game.chests.changed(); })()`);
    await Promise.all([hostLoop(1), guest.evaluate('g.run(1)')]);
    check(await host.evaluate(`${chestExpr('h')}?.layers[0][1]?.count`) === 3, 'Gospodarz widzi, co gość włożył do skrzyni');
    await host.evaluate('h.game.time.days = 3.2');
    await Promise.all([hostLoop(4.5), guest.evaluate('g.run(4.5)')]);
    check(Math.abs(await guest.evaluate('g.game.time.days') - 3.2) < 0.01, 'Pora dnia od gospodarza');
    await guest.evaluate("g.net.chatLine('cześć!')");
    await host.evaluate("h.net.chatLine('hej Ola')");
    await Promise.all([hostLoop(0.5), guest.evaluate('g.run(0.5)')]);
    const hostChat = await host.evaluate('h.net.chat'), guestChat = await guest.evaluate('g.net.chat');
    check(hostChat.includes('Ola dołącza do gry') && hostChat.includes('Ola: cześć!'), 'Czat u gospodarza');
    check(guestChat.includes('Kamil: hej Ola'), 'Czat u gościa');

    // --- Zmiana tam, gdzie gościa nie ma; zmieniony chunk daleko ---------------
    const near = await host.evaluate(`(() => { const x = ${origin[0] + 120}, z = ${origin[1]}; h.set(x, 40, z, 'stone'); return [x, 40, z]; })()`);
    await Promise.all([hostLoop(0.5), guest.evaluate('g.run(0.5)')]);
    const far = await host.evaluate('window.far');
    for (const [target, expected, label] of [[far, 'oak_planks', 'Chunk zmieniony daleko - pobrany, gdy gość doszedł'], [near, 'stone', 'Zmiana w chunku, którego gość nie miał']]) {
        const running = host.evaluate('(async () => { window.hostRunning = true; while (window.hostRunning) await h.run(0.2); })()');
        const seen = await guest.evaluate(`(async () => {
            const t = ${JSON.stringify(target)};
            g.game.player.flying = true; g.game.player.pos.set(t[0] + 0.5, 100, t[2] + 3.5);
            for (let i = 0; i < 120; i++) { await g.run(0.25); if (g.game.world.getChunk(Math.floor(t[0] / 16), Math.floor(t[2] / 16))) break; }
            await g.run(0.5);
            return g.block(t[0], t[1], t[2]);
        })()`);
        await host.evaluate('window.hostRunning = false'); await running;
        check(seen === expected, `${label} (${seen})`);
    }

    // --- Drugi gracz w świecie (model, imię) ------------------------------------
    await host.evaluate('h.game.time.days = 3.45');
    // Gość wraca do gospodarza (chunki wczytują się od nowa).
    const back = host.evaluate('(async () => { window.hostRunning = true; while (window.hostRunning) await h.run(0.2); })()');
    await guest.evaluate(`(async () => {
        const s = ${JSON.stringify(origin)};
        g.game.player.flying = true; g.game.player.pos.set(s[0] + 1.5, 100, s[1] + 0.5);
        for (let i = 0; i < 120; i++) { await g.run(0.25); if (g.game.world.getChunk(Math.floor(s[0] / 16), Math.floor(s[1] / 16)) && g.ground(s[0] + 1, s[1]) > 1) break; }
        g.game.player.flying = false; g.game.player.vel.set(0, 0, 0);
        g.game.player.pos.set(s[0] + 1.5, g.ground(s[0] + 1, s[1]) + 1, s[1] + 0.5);
    })()`);
    await host.evaluate('window.hostRunning = false'); await back;
    await Promise.all([hostLoop(4.5), guest.evaluate('g.run(4.5)')]);
    const seenGuest = await host.evaluate('h.report().players[0]');
    check(seenGuest?.name === 'Ola' && Math.abs(seenGuest.pos[0] - (origin[0] + 1.5)) < 0.5, 'Gospodarz widzi gościa w jego miejscu');
    check(await host.evaluate('[...h.net.players.players.values()][0].model.object.visible'), 'Model gościa widoczny');
    await savePng('gospodarz-widzi-goscia.png', await host.evaluate(`(() => { const p = [...h.net.players.players.values()][0].state; return h.frame([p.x + 3, p.y + 2.5, p.z + 4], [p.x, p.y + 1, p.z]); })()`));
    await savePng('gosc-widzi-gospodarza.png', await guest.evaluate(`(() => { const p = [...g.net.players.players.values()][0].state; return g.frame([p.x + 3, p.y + 2.5, p.z + 4], [p.x, p.y + 1, p.z]); })()`));

    // --- Wyjście gościa ------------------------------------------------------------
    await guest.evaluate("(async () => { g.game.inventory.set(3, { type: 'oak_planks', count: 11 }); await g.game.stop({ save: false }); })()");
    await hostLoop(1);
    const saved = await host.evaluate("(() => { const r = h.game.worldInfo.guests?.fedcba9876543210; return { slot: r?.inventory?.slots?.[3], player: Boolean(r?.player), players: h.net.players.players.size, chat: h.net.chat.at(-1) }; })()");
    check(saved.slot?.count === 11 && saved.player, 'Ekwipunek i miejsce gościa zapisane u gospodarza');
    check(saved.players === 0 && saved.chat === 'Ola opuszcza grę', 'Gość wyszedł - znika z gry');

    const [hostReport, guestErrors] = await Promise.all([host.evaluate('h.report()'), guest.evaluate('g.errors')]);
    check(hostReport.errors.length === 0 && guestErrors.length === 0 && host.exceptions.length === 0 && guest.exceptions.length === 0,
        `Bez błędów (${[...hostReport.errors, ...guestErrors].join(' | ')})`);
    await writeFile(resolve(output, 'raport.json'), JSON.stringify({ code, joinSeconds, commonChunks: common.length, hostReport, checks }, null, 2) + '\n');
    await host.evaluate('h.net.close()');
    console.log(`OK: gra wieloosobowa w dwóch kartach - ${checks} sprawdzeń (wejście w ${joinSeconds.toFixed(1)} s, ${common.length} wspólnych chunków).`);
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs);
    for (const socket of sockets) socket.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) { const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited; }
    server.closeAllConnections(); await new Promise((done) => server.close(done));
    const checked = resolve(profile);
    assert.ok(checked.startsWith(resolve(tmpdir()) + sep) && checked.split(sep).at(-1).startsWith('voxel-multiplayer-'));
    await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
