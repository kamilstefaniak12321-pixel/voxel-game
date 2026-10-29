// Test prawdziwej gry w Chrome, bez npm install i bez bibliotek automatyzacji.
// Node >= 22.15; Chrome w PATH lub CHROME_BIN=/pełna/ścieżka/do/chrome.
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function browserChecks() {
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
    addEventListener('error', event => errors.push(event.message));
    addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    const { GAME_COMMANDS } = await import('/src/commands/gameCommands.js');
    const { createWorldInfo } = await import('/src/storage/WorldStorage.js');
    const { shadowUniforms } = await import('/src/rendering/Shadows.js');
    const { modelLight } = await import('/src/rendering/ModelMaterial.js');
    const { checkDarkRoom } = await import('/tools/light_room_checks.js');
    const { checkSurfaceRendering } = await import('/tools/surface_render_checks.js');
    const { checkDistantShadowRendering } = await import('/tools/shadow_render_checks.js');
    await atlasReady;
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(960, 640);
    document.body.prepend(renderer.domElement);
    check(renderer.capabilities.isWebGL2, 'Brak WebGL2');
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 64, farTerrain: 512, loadBudget: 8, meteorites: false, lightShafts: false, bounceLight: false, showHand: true, lightingModel: 'world' })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Test światła', 42, 'light-lab', 'creative');
    const game = await Game.start(renderer, input, null, info, settings);
    game.camera.aspect = 960 / 640;
    game.camera.updateProjectionMatrix();
    game.hand.resize(960 / 640);
    settings.onChange(key => game.applySettings(key));
    game.player.flying = true;
    game.player.pos.set(7.5, 28, 34);
    game.player.pitch = -0.45;
    game.time.speed = 0;
    game.time.days = 0.5;
    const frame = () => { game.update(0); game.render(); };
    // SwiftShader może rysować serię klatek dłużej niż limit pojedynczej
    // komendy CDP. Pomiędzy klatkami obsługujemy kolejkę przeglądarki.
    const yieldBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
    // Dajemy wątkom dalekiego terenu i teksturom czas na odpowiedź.
    for (let i = 0; i < 32; i++) { frame(); await new Promise(r => setTimeout(r, 16)); }
    check(game.sky.solarAtmosphere, 'Laboratorium nie włączyło atmosfery');
    check(game.world.generator.type === 'light-lab', 'Niewłaściwy generator');
    check(game.world.getLight(17, 20, 13).sky < game.world.getLight(7, 20, 30).sky, 'Dach nie ogranicza dostępu do nieba');
    check(game.world.getLight(16, 19, 6).red > 0, 'Brak czerwonego światła lampy');
    const command = GAME_COMMANDS.find(c => c.name === 'swiatlo');
    const context = { game, world: game.world };
    const samples = [];
    const meanFrame = () => {
        const gl = renderer.getContext(), pixels = new Uint8Array(960 * 640 * 4);
        gl.readPixels(0, 0, 960, 640, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4) sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
        check(gl.getError() === gl.NO_ERROR, 'Błąd odczytu WebGL');
        return sum / (960 * 640 * 3);
    };
    for (const mode of ['atmosfera', 'klasyczne']) {
        command.run(['model', mode], context);
        for (const time of [0.23, 0.26, 0.5, 0.74, 0.77, 0.1]) {
            game.time.days = time;
            frame();
            samples.push({ mode, time, brightness: meanFrame() });
            await yieldBrowser();
        }
    }
    for (const mode of ['atmosfera', 'klasyczne']) {
        const values = samples.filter(s => s.mode === mode);
        check(values.find(s => s.time === 0.5).brightness > values.find(s => s.time === 0.1).brightness + 5, `${mode}: noc nie jest ciemniejsza od dnia`);
    }
    const a = samples.find(s => s.mode === 'atmosfera' && s.time === 0.5).brightness;
    const b = samples.find(s => s.mode === 'klasyczne' && s.time === 0.5).brightness;
    check(Math.abs(a - b) > 0.2, 'Przełączenie modelu nie zmieniło obrazu');
    command.run(['model', 'swiat'], context);
    frame();
    check(game.sky.solarAtmosphere, 'Powrót do trybu świata nie włączył atmosfery');
    // Niskie Słońce: prawdziwe mapy cieni mają nadal całkowicie przesłaniać
    // pozostałą wiązkę. Zanik energii źródła testujemy osobno w modelu CPU.
    settings.set('shadows', 1);
    const horizonSamples = [];
    for (const time of [0.251, 0.254, 0.26, 0.74, 0.746, 0.749]) {
        game.time.days = time;
        frame();
        check(game.shadows.light === 'sun', 'Niskie Słońce nie jest głównym źródłem');
        check(game.shadows.active && shadowUniforms.uSunShadowInfo.value.y === 1, 'Przesłonięcie Słońca znika przed zachodem');
        horizonSamples.push({ time, altitude: game.sky.atmosphere.altitude, strength: game.shadows.strength });
        // Ręka i model muszą mieć takie samo doświetlenie otoczenia co
        // bloki. Częściowy dostęp do nieba ujawnia różnicę wykładników.
        const savedModelSky = game.modelSky;
        game.modelSky = 0.5;
        game.updateModel(0);
        const expectedAmbient = 0.5 ** (2.2 + shadowUniforms.uSunShadowAmbient.value);
        check(Math.abs(modelLight.uModelAmbient.value - expectedAmbient) < 1e-10, 'Otoczenie modelu gracza rozbiega się ze światłem bloków');
        game.modelSky = savedModelSky;
        game.updateModel(0);
        await yieldBrowser();
    }
    // Porównanie tych samych pikseli przy niezmienionym świetle nieba:
    // dawne wygaszanie maski wpuszczało dodatkowe światło przez bloki.
    game.time.days = 0.74;
    frame();
    const fixedBrightness = meanFrame();
    await yieldBrowser();
    const ambientBefore = shadowUniforms.uSunShadowAmbient.value;
    game.shadows.strength = game.shadows.ambientStrength;
    game.shadows.syncUniforms();
    game.render();
    const legacyBrightness = meanFrame();
    check(shadowUniforms.uSunShadowAmbient.value === ambientBefore, 'Porównanie zmieniło doświetlenie wnętrz');
    check(legacyBrightness > fixedBrightness + 0.001, 'Usunięcie przecieku nie przyciemniło cieni w obrazie');
    frame();
    // Warianty shaderów: bez cieni, bliskie/dalekie, model gracza i tryb ziemniaka.
    for (const quality of [0, 1, 3]) { settings.set('shadows', quality); frame(); await yieldBrowser(); }
    game.setCameraMode('back'); frame();
    settings.set('potato', true); frame();
    settings.set('potato', false); frame();
    game.setCameraMode('first');

    // Renderujemy prawdziwy materiał tarczy osobno, bez poświaty.
    // Widoczna tarcza i energia źródła zanikają po tym samym zachodzie.
    const sunLayer = game.sky.layers.find(layer => layer.material?.uniforms?.uAtmosphere);
    check(sunLayer, 'Brak warstwy tarczy Słońca');
    const discSamples = [];
    const target = new THREE.WebGLRenderTarget(256, 256);
    const probeScene = new THREE.Scene();
    probeScene.background = new THREE.Color(0, 0, 0);
    const probeCamera = new THREE.PerspectiveCamera(75, 1, 0.5, 200);
    const probe = new THREE.Mesh(sunLayer.object.geometry, sunLayer.material.clone());
    probeScene.add(probe);
    const previousAutoClear = renderer.autoClear;
    for (const time of [0.75, 0.76, 0.77]) {
        game.time.days = time;
        game.update(0);
        const sample = game.sky.atmosphere;
        probe.material.uniforms.uColor.value.copy(sunLayer.material.uniforms.uColor.value);
        probe.material.uniforms.uGlow.value = 0;
        probe.material.uniforms.uCorona.value = 0;
        probe.material.uniforms.uAtmosphere.value = 1;
        probe.position.copy(sunLayer.object.position);
        probe.quaternion.copy(sunLayer.object.quaternion);
        probe.scale.copy(sunLayer.object.scale);
        probeCamera.lookAt(probe.position);
        renderer.autoClear = true;
        renderer.setRenderTarget(target);
        renderer.render(probeScene, probeCamera);
        const pixels = new Uint8Array(256 * 256 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels);
        let litPixels = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 3) litPixels++;
        check((litPixels > 0) === (sample.direct[0] > 0), 'Tarcza i źródło mają różny moment zachodu');
        if (time === 0.76) check(game.sky.celestial.sunHeight < 0 && game.sky.sunLightDirection.y > 0, 'Wiązka widocznego wycinka biegnie spod horyzontu');
        discSamples.push({ time, visible: sample.discVisibility, litPixels, direct: sample.direct[0] });
        renderer.setRenderTarget(null);
        await yieldBrowser();
    }
    renderer.autoClear = previousAutoClear;
    target.dispose();
    probe.material.dispose();
    const room = await checkDarkRoom({ game, settings, renderer, meanFrame, yieldBrowser });
    const surfaces = await checkSurfaceRendering({ game, settings, renderer, yieldBrowser });
    const distantShadows = await checkDistantShadowRendering({ renderer, yieldBrowser });
    game.time.days = 0.5; frame();
    check(renderer.info.programs.length > 0, 'Nie skompilowano shaderów');
    check(renderer.info.programs.every(p => p.diagnostics?.runnable !== false), 'Shader nie skompilował się');
    check(errors.length === 0, errors.join('\n'));
    return { status: 'passed', shaders: renderer.info.programs.length, samples, horizonSamples, discSamples, room, surfaces, distantShadows, sunsetComparison: { fixedBrightness, legacyBrightness } };
}

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/light-lab');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-light-'));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#161c24;color:white}pre{white-space:pre-wrap}</style><script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script></head><body data-result="running"><pre id="result">Test WebGL…</pre><script type="module">(${browserChecks.toString()})().then(result=>{document.body.dataset.result='passed';document.querySelector('#result').textContent=JSON.stringify(result)}).catch(error=>{document.body.dataset.result='failed';document.querySelector('#result').textContent=error.stack;console.error(error)})</script></body></html>`;
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/__light_test__') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = resolve(root, '.' + pathname);
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let chrome, socket;
let logs = '';
try {
    chrome = spawn(process.env.CHROME_BIN ?? 'google-chrome', [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--hide-scrollbars', '--window-size=960,900',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let startupError;
    chrome.on('error', error => { startupError = error; });
    chrome.stdout.on('data', data => { logs += data; });
    chrome.stderr.on('data', data => { logs += data; });
    const pause = ms => new Promise(r => setTimeout(r, ms));
    const start = Date.now();
    let port;
    while (!(port = logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if (startupError) throw startupError;
        if (chrome.exitCode !== null || chrome.signalCode || Date.now() - start > 20000) throw new Error(`Chrome nie uruchomił się: ${logs}`);
        await pause(100);
    }
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
    const page = pages.find(p => p.type === 'page');
    if (!page) throw new Error('Chrome nie utworzył karty testowej');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const request = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(request.timer);
            if (message.error) request.reject(new Error(JSON.stringify(message.error)));
            else request.resolve(message.result);
        } else if (message.method === 'Runtime.consoleAPICalled' || message.method === 'Runtime.exceptionThrown') {
            logs += '\n' + JSON.stringify(message.params);
        }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Brak odpowiedzi Chrome: ${method}`)); }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await call('Runtime.enable');
    await call('Page.enable');
    await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/__light_test__` });
    let result;
    const deadline = Date.now() + 180000;
    // Rzeczywisty zegar: pętle wczytywania chunków używają performance.now().
    // Wirtualny czas Chrome zatrzymuje ten zegar wewnątrz takiej pętli.
    while (Date.now() < deadline) {
        const response = await call('Runtime.evaluate', { expression: `({status: document.body?.dataset.result, text: document.querySelector('#result')?.textContent})`, returnByValue: true });
        result = response.result?.value;
        if (result?.status === 'passed' || result?.status === 'failed') break;
        await pause(500);
    }
    await writeFile(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(output, 'laboratorium.png'), Buffer.from(shot.data, 'base64'));
    if (result?.status !== 'passed') throw new Error(`Test WebGL nie przeszedł: ${result?.text ?? 'brak wyniku'}\n${logs.slice(-10000)}`);
    console.log('OK: WebGL2, prawdziwa gra, cień dachu, lampy, 12 ujęć dnia/nocy, 6 położeń niskiego Słońca, widoczna tarcza, ciemny pokój z lampą, porównanie przecieku światła, A/B, cienie 0/1/3, trzecia osoba i tryb ziemniaka.');
    console.log(result.text);
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs);
    socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) {
        const exited = once(chrome, 'exit');
        chrome.kill('SIGKILL');
        await exited;
    }
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    // Procesy pomocnicze Chrome mogą kończyć zapis profilu tuż po wyjściu
    // głównego procesu. Node ponowi usuwanie przy przejściowym ENOTEMPTY.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
