// Test prawdziwej gry w Chrome, bez npm install i bez bibliotek automatyzacji.
// Node >= 22.15; Chrome w PATH lub CHROME_BIN=/pełna/ścieżka/do/chrome.
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
    // Dajemy wątkom dalekiego terenu i teksturom czas na odpowiedź.
    for (let i = 0; i < 80; i++) { frame(); await new Promise(r => setTimeout(r, 16)); }
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
    // Warianty shaderów: bez cieni, bliskie/dalekie, model gracza i tryb ziemniaka.
    for (const quality of [0, 1, 3]) { settings.set('shadows', quality); frame(); }
    game.setCameraMode('back'); frame();
    settings.set('potato', true); frame();
    settings.set('potato', false); frame();
    game.setCameraMode('first');
    game.time.days = 0.5; frame();
    check(renderer.info.programs.length > 0, 'Nie skompilowano shaderów');
    check(renderer.info.programs.every(p => p.diagnostics?.runnable !== false), 'Shader nie skompilował się');
    check(errors.length === 0, errors.join('\n'));
    return { status: 'passed', shaders: renderer.info.programs.length, samples };
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
try {
    const { stdout, stderr } = await promisify(execFile)(process.env.CHROME_BIN ?? 'google-chrome', [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--hide-scrollbars', '--window-size=960,900', '--virtual-time-budget=20000',
        `--user-data-dir=${profile}`, `--screenshot=${resolve(output, 'laboratorium.png')}`, '--dump-dom',
        `http://127.0.0.1:${server.address().port}/__light_test__`
    ], { timeout: 150000, maxBuffer: 4 * 1024 * 1024 });
    await writeFile(resolve(output, 'result.html'), stdout);
    await writeFile(resolve(output, 'chrome.log'), stderr);
    if (!stdout.includes('<body data-result="passed">')) {
        throw new Error(`Test WebGL nie przeszedł: ${stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] ?? stderr}`);
    }
    console.log('OK: WebGL2, prawdziwa gra, cień dachu, lampy, 12 ujęć dnia/nocy, A/B, cienie 0/1/3, trzecia osoba i tryb ziemniaka.');
    console.log(stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1]);
} finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    await rm(profile, { recursive: true, force: true });
}
