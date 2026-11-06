// Actual bootstrap/main/menu and a small real Game in a disposable Chrome profile.
// The test server only appends accessors to main.js and disables the decorative
// menu backdrop after startup; production files and user saves are never changed.
// Synthetic errors/stalls are explicit QA probes, not defects of the game.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.VOXEL_TEST_OUTPUT ?? 'test-results/diagnostics');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-diagnostics-'));
const index = await readFile(resolve(root, 'index.html'), 'utf8');
assert.match(index, /src\/bootstrap\.js/, 'Production entrypoint must capture import failures');
const mainAccessors = `
// Test-server-only access to actual application instances.
menuBackdrop.stop();
menuBackdrop.start = async () => {};
window.diagnosticsQA = {
 diagnostics, settings, menu, frameDiagnostics, renderer,
 get game() { return game; }, get state() { return state; },
 phase(value) { state = value; if (value === 'playing') menu.hide(); },
 async start() {
  const info = createWorldInfo('Diagnostyka QA', 731, 'flat', 'developer');
  await storage?.saveWorld(info);
  await playWorld(info);
  return Boolean(game);
 }
};
`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
let bootFailure = false;
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        response.setHeader('Cache-Control', 'no-store');
        if (pathname === '/' || pathname === '/__boot_failure__') {
            bootFailure = pathname === '/__boot_failure__';
            response.setHeader('Content-Type', 'text/html'); response.end(index); return;
        }
        const file = resolve(root, '.' + pathname);
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
        if (pathname === '/src/main.js') {
            response.end(bootFailure ? `throw new Error('QA_EXPECTED_BOOT_FAILURE');`
                : (await readFile(file, 'utf8')) + mainAccessors);
            return;
        }
        response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let chrome, socket, logs = '', checks = 0;
const results = { scope: 'Actual browser integration correctness; SwiftShader is not a native performance measurement', checks: [], shots: [] };
try {
    chrome = spawn(process.env.CHROME_BIN ?? (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome'), [
        '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--no-first-run', '--disable-background-networking', '--hide-scrollbars', '--window-size=1280,760',
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
        if (chrome.exitCode !== null || Date.now() - started > 20000) throw new Error(`Chrome startup failed: ${logs}`);
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
        } else if (message.method === 'Runtime.exceptionThrown') logs += '\n' + JSON.stringify(message.params);
    });
    const call = (method, params = {}, timeoutMs = 90000) => new Promise((resolve, reject) => {
        const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
        const value = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? JSON.stringify(value.exceptionDetails));
        return value.result?.value;
    };
    const waitFor = async (expression, timeout = 120000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const value = await evaluate(expression);
            if (value) return value;
            await pause(200);
        }
        throw new Error(`Condition timed out: ${expression}`);
    };
    const check = (value, message) => { assert.ok(value, message); checks++; results.checks.push(message); };
    const click = async text => {
        check(await evaluate(`(() => { const b=[...document.querySelectorAll('#menu button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true;})()`), `Button: ${text}`);
        await pause(100);
    };
    const screenshot = async (name, width, height) => {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await evaluate(`(() => { const text=document.querySelector('.diagnostics-report');text.hidden=true;text.blur();
            for(const e of [document.querySelector('#menu'),document.querySelector('.screen-diagnostics'),document.scrollingElement])if(e)e.scrollTop=0;
            window.scrollTo(0,0);return true;})()`);
        await pause(600);
        const layout = await evaluate(`(() => {const p=document.querySelector('.diagnostics-panel').getBoundingClientRect();
            return {width:innerWidth,height:innerHeight,panel:{left:p.left,right:p.right,width:p.width},scrollWidth:document.documentElement.scrollWidth,
                buttons:[...document.querySelectorAll('.diagnostics-actions button')].map(b=>({text:b.textContent,width:b.getBoundingClientRect().width}))};})()`);
        check(layout.panel.left >= -1 && layout.panel.right <= width + 1 && layout.scrollWidth <= width + 1,
            `Diagnostic panel fits ${width}×${height}`);
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(resolve(output, name), Buffer.from(shot.data, 'base64'));
        results.shots.push({ name, ...layout });
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 760, deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      if (!localStorage.getItem('voxel-game-settings')) localStorage.setItem('voxel-game-settings',JSON.stringify({revision:2,
        potato:true,viewDistance:24,farTerrain:0,renderScale:25,shadows:0,lightingLook:'baseline',lightingMaterials:'basic',
        lightShafts:false,bounceLight:false,surfaceBounce:false,fancyLeaves:false,plantModels:'simple',leafModel:'cube',
        fpsLimit:60,loadBudget:1,volumeMaster:0,volumeMusic:0,autoUpdates:false,menuMotion:'off',performanceLogs:true}));
      window.__exportBlobs=[];const create=URL.createObjectURL.bind(URL);
      URL.createObjectURL=blob=>{if(blob.type==='application/json')window.__exportBlobs.push(blob);return create(blob);};
    ` });
    await call('Page.navigate', { url: base + '/' });
    await waitFor('Boolean(window.diagnosticsQA)');
    check(await evaluate(`diagnosticsQA.diagnostics.snapshot().events.some(e=>e.kind==='app.ready')`), 'Actual main/bootstrap initialized diagnostics');
    check(await evaluate(`diagnosticsQA.diagnostics.snapshot().session.version !== 'nieznana'`), 'Browser version resolved from package');
    check(await evaluate(`diagnosticsQA.diagnostics.status().errors===0`), 'Startup has no unexpected errors');
    await click('Ustawienia'); await click('Gra');
    check(await evaluate(`Boolean([...document.querySelectorAll('#menu button')].find(b=>b.textContent.startsWith('Logi wydajności'))) `), 'Performance logging setting visible under Gra');
    check(await evaluate(`(() => {const b=[...document.querySelectorAll('#menu button')].find(b=>b.textContent.startsWith('Logi wydajności'));b.click();return !diagnosticsQA.settings.get('performanceLogs')&&!diagnosticsQA.frameDiagnostics.enabled;})()`), 'Toggle disables real application recorder');
    await call('Page.reload'); await waitFor('Boolean(window.diagnosticsQA)');
    check(await evaluate(`!diagnosticsQA.settings.get('performanceLogs')&&!diagnosticsQA.frameDiagnostics.enabled`), 'Toggle persists across real reload');
    await click('Ustawienia'); await click('Gra');
    await evaluate(`([...document.querySelectorAll('#menu button')].find(b=>b.textContent.startsWith('Logi wydajności'))).click()`);
    check(await evaluate('diagnosticsQA.frameDiagnostics.enabled'), 'Toggle re-enables recorder');
    await click('Diagnostyka i logi');
    await click('Zaznacz problem');
    check(await evaluate(`diagnosticsQA.diagnostics.snapshot().events.some(e=>e.kind==='user.problem')`), 'Mark problem records through actual menu handler');

    // Actual browser error events (rather than calling diagnostics.error directly).
    await evaluate(`setTimeout(()=>{throw new Error('QA_EXPECTED_WINDOW_ERROR')},0); Promise.reject(new Error('QA_EXPECTED_REJECTION')); true`);
    await waitFor(`diagnosticsQA.diagnostics.status().errors>=2`);
    const expectedEvents = await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.level==='error').map(e=>({kind:e.kind,message:e.message,data:e.data}))`);
    check(expectedEvents.some(e => JSON.stringify(e).includes('QA_EXPECTED_WINDOW_ERROR')), 'Uncaught browser error retained');
    check(expectedEvents.some(e => JSON.stringify(e).includes('QA_EXPECTED_REJECTION')), 'Unhandled promise retained');
    results.expectedErrors = expectedEvents;

    // Start the actual Game/World through main. The QA accessor selects gameplay
    // after pointer-lock rejection in headless Chrome; no input lock is faked.
    check(await evaluate('diagnosticsQA.start()'), 'Actual flat test world started');
    await pause(500);
    await evaluate(`diagnosticsQA.phase('playing');diagnosticsQA.frameDiagnostics.reset('qa-start');true`);
    await waitFor('Boolean(diagnosticsQA.frameDiagnostics.snapshot())');
    await evaluate(`(() => { const world=diagnosticsQA.game.world, original=world.updateMeshes;
      world.updateMeshes=function(...args){this.updateMeshes=original;const until=performance.now()+85;while(performance.now()<until){};return original.apply(this,args);};
      diagnosticsQA.frameDiagnostics.lastIncident=-Infinity;return true;})()`);
    await waitFor(`diagnosticsQA.diagnostics.snapshot().performance.some(p=>(p.data??p).slowFrames?.some(f=>f.stages.some(s=>s.id==='mesh'&&s.ms>=75)))`);
    const spike = await evaluate(`diagnosticsQA.diagnostics.snapshot().performance.map(p=>p.data??p).find(p=>p.slowFrames?.some(f=>f.stages.some(s=>s.id==='mesh'&&s.ms>=75)))`);
    check(spike.suspects.some(s => s.kind === 'cpu' && s.evidence.stage === 'mesh'), 'Controlled 85ms meshing spike attributed to measured same-frame CPU');
    results.controlledSpike = spike;
    const markersBefore = await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.kind==='user.problem').length`);
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'F8', key: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', code: 'F8', key: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119 });
    const markersAfter = await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.kind==='user.problem')`);
    check(markersAfter.length === markersBefore + 1, 'Actual F8 key creates a distinct problem marker');
    check(markersAfter.at(-1).data?.summary?.frames > 0 && markersAfter.at(-1).context?.state === 'playing',
        'F8 retains the latest performance snapshot and gameplay context');
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'F8', key: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119, autoRepeat: true });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', code: 'F8', key: 'F8', windowsVirtualKeyCode: 119, nativeVirtualKeyCode: 119 });
    check(await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.kind==='user.problem').length`) === markersAfter.length,
        'Held F8 does not flood problem markers');
    // Some native input providers expose the logical function key without its
    // physical code. Dispatch that precise event shape to the actual binding.
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',code:'Unidentified',bubbles:true,cancelable:true}));
        window.dispatchEvent(new KeyboardEvent('keyup',{key:'F8',code:'Unidentified',bubbles:true}));true`);
    check(await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.kind==='user.problem').length`) === markersAfter.length + 1,
        'Logical F8 key works when physical code is Unidentified');
    results.f8Marker = markersAfter.at(-1);
    await evaluate(`diagnosticsQA.phase('paused');diagnosticsQA.menu.showPause();true`);
    await pause(500);
    const pauseBefore = await evaluate('diagnosticsQA.diagnostics.status().samples'); await pause(1300);
    check(await evaluate('diagnosticsQA.diagnostics.status().samples') === pauseBefore, 'Paused game emits no performance samples');
    await evaluate(`diagnosticsQA.settings.set('fpsLimit',30);diagnosticsQA.phase('playing');diagnosticsQA.frameDiagnostics.reset('qa-cap');true`);
    await waitFor('diagnosticsQA.frameDiagnostics.snapshot()?.targetFps===30');
    check(await evaluate('diagnosticsQA.frameDiagnostics.snapshot().targetFps===30'), 'Real main loop passes chosen 30 FPS target');
    await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));true`);
    await pause(500);
    const hiddenBefore = await evaluate('diagnosticsQA.diagnostics.status().samples'); await pause(1200);
    check(await evaluate('diagnosticsQA.diagnostics.status().samples') === hiddenBefore, 'Hidden-tab guard excludes samples');
    await evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));diagnosticsQA.phase('paused');diagnosticsQA.menu.showPause();true`);
    await click('Diagnostyka i logi');
    const expandedSpike = await evaluate(`(() => {
        const event=diagnosticsQA.diagnostics.snapshot().events.find(e=>e.kind==='performance.drop'&&e.data?.summary?.suspects?.some(s=>s.evidence?.stage==='mesh'&&s.evidence?.ms>=75));
        const detail=[...document.querySelectorAll('.diagnostics-event')].find(node=>node.dataset.eventId===event?.id);
        if(!detail)return null;
        detail.querySelector('summary').click();
        return {open:detail.open,text:detail.querySelector('pre').textContent,
            evidence:event.data.summary.suspects.find(s=>s.evidence?.stage==='mesh').evidence};
    })()`);
    check(expandedSpike?.open && expandedSpike.text.includes(expandedSpike.evidence.ms.toFixed(2)+' ms'),
        'Expanded slow event shows measured stage cost in milliseconds');
    check(expandedSpike.text.includes(expandedSpike.evidence.cpuMs.toFixed(2)+' ms')
        && expandedSpike.text.includes(expandedSpike.evidence.frameMs.toFixed(2)+' ms'),
        'Expanded slow event distinguishes same-frame CPU work and frame interval');
    results.expandedSpike = expandedSpike;
    await click('Pokaż treść');
    check(await evaluate(`document.querySelector('.diagnostics-report').value.includes('QA_EXPECTED_WINDOW_ERROR')`), 'Readable fallback contains captured error');
    await click('Zapisz raport');
    await waitFor('window.__exportBlobs.length>0');
    const exported = await evaluate(`(async()=>JSON.parse(await window.__exportBlobs.at(-1).text()))()`);
    check(exported.events.some(e => e.kind === 'user.problem'), 'Browser file export includes marker');
    check(exported.performance.some(p => (p.data ?? p).slowFrames?.some(f => f.stages.some(s => s.id === 'mesh' && s.ms >= 75))), 'Browser file export preserves precise spike evidence');
    check(typeof exported.readableReport === 'string' && exported.readableReport.includes('QA_EXPECTED_REJECTION'), 'Download contains readable report plus raw records');
    await screenshot('diagnostyka-desktop.png', 1280, 760);
    await screenshot('diagnostyka-mobile.png', 390, 844);
    await writeFile(resolve(output, 'export.json'), JSON.stringify(exported, null, 2));
    const errorList = await evaluate(`diagnosticsQA.diagnostics.snapshot().events.filter(e=>e.level==='error'||e.level==='fatal').map(e=>({kind:e.kind,text:JSON.stringify(e)}))`);
    const unexpected = errorList.filter(e => !/QA_EXPECTED_WINDOW_ERROR|QA_EXPECTED_REJECTION/.test(e.text));
    check(unexpected.length === 0, `No unexpected runtime errors: ${JSON.stringify(unexpected)}`);

    await call('Page.navigate', { url: base + '/__boot_failure__' });
    await waitFor(`document.querySelector('#menu h2')?.textContent==='Nie udało się uruchomić gry'`, 30000);
    await click('Zapisz raport');
    await waitFor('window.__exportBlobs.length>0');
    const failure = await evaluate(`(async()=>JSON.parse(await window.__exportBlobs.at(-1).text()))()`);
    check(failure.events.some(e => e.kind === 'startup.failed' && JSON.stringify(e).includes('QA_EXPECTED_BOOT_FAILURE')), 'Bootstrap catches module failure and exports diagnostic report');
    check(Boolean(failure.previous), 'Next session preserves preceding session history');
    results.startupFailure = failure.events.filter(e => e.kind === 'startup.failed');
    results.status = 'passed'; results.count = checks;
    await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2));
    console.log(`OK: logi w prawdziwym Chrome — ${checks} kontroli, bootstrap, ustawienia, błędy, skok CPU, pauza, limit, eksport i dwa rozmiary panelu.`);
    console.log(`Wyniki: ${output}`);
} catch (error) {
    results.status = 'failed'; results.error = String(error.stack ?? error); results.count = checks;
    await writeFile(resolve(output, 'result.json'), JSON.stringify(results, null, 2));
    throw error;
} finally {
    await writeFile(resolve(output, 'chrome.log'), logs);
    socket?.close();
    if (chrome && chrome.exitCode === null && !chrome.signalCode) {
        const exited = once(chrome, 'exit'); chrome.kill('SIGKILL'); await exited;
    }
    server.closeAllConnections(); await new Promise(r => server.close(r));
    // Only the disposable profile created above is removed, never user browser data.
    const checked = resolve(profile), tempRoot = resolve(tmpdir()) + sep;
    assert.ok(checked.startsWith(tempRoot) && checked.split(sep).at(-1).startsWith('voxel-diagnostics-'));
    await rm(checked, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
