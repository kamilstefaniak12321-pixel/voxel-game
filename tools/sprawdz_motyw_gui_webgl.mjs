// Rzeczywiste komponenty GUI w Chrome: motyw, zapis, A/B, układ i interakcje.
// Bez zależności npm. Node >= 22.15; CHROME_BIN lub google-chrome w PATH.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function setupUi(iconNames) {
    const errors = [];
    addEventListener('error', e => errors.push(e.message));
    addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const { Settings } = await import('/src/settings/Settings.js');
    const { UI_THEMES } = await import('/src/config.js');
    const { Menu } = await import('/src/ui/Menu.js');
    const { InventoryScreen } = await import('/src/ui/InventoryScreen.js');
    const { Inventory } = await import('/src/game/Inventory.js');
    const { Hotbar } = await import('/src/ui/Hotbar.js');
    const { PlayerModel } = await import('/src/player/PlayerModel.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    await atlasReady;
    const { skinReady } = await import('/src/player/skin.js');
    check(await skinReady !== 'error', 'Nie wczytano skórki gracza');
    const settings = window.settings = new Settings();
    settings.onChange(key => {
        if (key === 'theme') window.themeReady = loadTheme(settings.get('theme'));
        if (key === 'inventoryStyle') document.documentElement.dataset.invStyle = settings.get(key);
    });
    document.documentElement.dataset.invStyle = settings.get('inventoryStyle');
    const icons = new Map(iconNames.map(name => [name, `/docs/wiki/ikony/${name}.png`]));
    const game = { mode: 'adventure', inventory: Inventory.load({}, 'adventure'), model: new PlayerModel(), touchMode: false };
    for (const [index, type, count] of [[0,'pickaxe',1],[1,'axe',1],[2,'shovel',1],[9,'stone',32],[10,'oak_planks',16],[11,'blueberry',8],[18,'grass',24],[19,'stick',12]]) game.inventory.slots[index] = { type, count };
    const screen = new InventoryScreen(icons, { close() { screen.close(); } });
    const hotbar = new Hotbar(document.querySelector('#hotbar'), icons);
    const menu = new Menu(document.querySelector('#menu'), 'Voxel Game', { openWorldList() {} }, settings, UI_THEMES);
    const tick = async () => {
        await new Promise(r => requestAnimationFrame(r)); screen.update(); await document.fonts.ready;
        await Promise.all([...document.images].filter(img => img.getAttribute('src')).map(img => img.decode()));
    };
    const theme = async name => { settings.set('theme', name); await window.themeReady; await tick(); };
    const click = element => {
        check(element, 'Brak elementu interakcji');
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    };
    const signature = () => {
        const panel = getComputedStyle(document.querySelector('.inv-panel'));
        const slot = getComputedStyle(document.querySelector('.inv-slot'));
        const hud = getComputedStyle(document.querySelector('.hotbar-slot'));
        return [panel.backgroundImage, panel.borderImageSource, slot.backgroundColor, slot.boxShadow, hud.backgroundColor, hud.boxShadow].join('|');
    };
    const inventory = async (mode = 'adventure', book = false) => {
        screen.close(); menu.hide(); game.mode = mode; screen.tab = mode === 'creative' ? 'blocks' : 'inventory'; screen.book.open = book;
        screen.open(game); hotbar.update(game.inventory.slots.slice(0, 9), 0); await tick();
    };
    const layout = () => {
        const panel = document.querySelector('.inv-panel');
        const rect = panel.getBoundingClientRect();
        check(rect.left >= -1 && rect.right <= innerWidth + 1, `Okno wychodzi poza ekran ${innerWidth}: ${rect.left}..${rect.right}`);
        check(document.documentElement.scrollWidth <= innerWidth + 1, 'Cała strona przewija się poziomo');
        check(getComputedStyle(panel).borderImageOutset === '0', 'Rama wystaje poza panel');
        const slots = [...document.querySelectorAll('.inv-hotbar .inv-slot')];
        check(slots.length === 9, 'Nie ma dziewięciu miejsc paska');
        return { width: innerWidth, height: innerHeight, panel: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, slots: slots.length };
    };
    const tests = [];
    window.uiQA = {
        errors, tests, settings, game, screen, menu,
        async verify() {
            for (const name of ['planks', 'board', 'frame']) {
                const texture = new Image(); texture.src = `/assets/ui/themes/grey-wood/${name}.png`;
                await texture.decode(); check(texture.naturalWidth > 0, `Brak tekstury ${name}`);
            }
            tests.push('Trzy tekstury poprawnie zdekodowane');
            for (const style of ['wood', 'light']) {
                settings.set('inventoryStyle', style); await theme('default'); await inventory(); const before = signature();
                await theme('grey-wood'); const after = signature();
                check(after !== before && after.includes('/grey-wood/'), `Motyw nie objął ekwipunku ${style}`);
                check(getComputedStyle(document.querySelector('.inv-slot')).backgroundColor === 'rgb(53, 51, 48)', `Stary kolor przegródek ${style}`);
                check(getComputedStyle(document.querySelector('.hotbar-slot')).backgroundColor === 'rgb(53, 51, 48)', 'Motyw nie objął HUD');
                check(settings.get('inventoryStyle') === style, 'Motyw nadpisał preferencję ekwipunku');
                const saved = new Settings(); check(saved.get('theme') === 'grey-wood' && saved.get('inventoryStyle') === style, 'Zapis ustawień nie zachował motywu');
                await theme('default'); check(signature() === before, `Powrót do domyślnego nie odtworzył ${style}`);
                tests.push(`A/B i zapis: ${style}`);
            }
            settings.set('inventoryStyle', 'wood'); await theme('grey-wood'); await inventory();
            const item = game.inventory.slots[9];
            click(document.querySelector('[data-kind="slot"][data-index="9"]'));
            check(screen.cursor?.type === item.type && !game.inventory.slots[9], 'Podniesienie stosu nie działa');
            click(document.querySelector('[data-kind="slot"][data-index="12"]'));
            check(game.inventory.slots[12]?.count === item.count && !screen.cursor, 'Odłożenie stosu nie działa');
            const stoneSlot = document.querySelector('[data-kind="slot"][data-index="12"]');
            stoneSlot.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: innerWidth - 10, clientY: innerHeight - 10 }));
            check(!screen.tooltip.hidden && screen.tooltip.textContent.includes('stone'), 'Opis przedmiotu nie działa');
            check(getComputedStyle(screen.tooltip).backgroundColor === 'rgb(48, 46, 42)', 'Opis używa starego motywu');
            const tooltipRect = screen.tooltip.getBoundingClientRect();
            check(tooltipRect.right <= innerWidth && tooltipRect.bottom <= innerHeight, 'Opis wychodzi poza ekran');
            game.inventory.craft[0] = { type: 'oak_log', count: 2 }; screen.refresh();
            check(document.querySelector('.inv-result.ready'), 'Gotowy wynik wytwarzania nie jest wyróżniony');
            click(document.querySelector('.inv-result'));
            check(screen.cursor?.type === 'oak_planks', 'Wytwarzanie nie działa'); screen.returnCursor();
            click(document.querySelector('.inv-book-toggle')); check(screen.book.open && document.querySelector('.inv-book'), 'Nie otworzono księgi');
            tests.push('Przeniesienie stosu, opis przedmiotu, wytwarzanie, księga');
            await inventory('creative');
            const search = document.querySelector('.inv-search'); search.value = 'kamie'; search.dispatchEvent(new Event('input', { bubbles: true }));
            check(document.querySelectorAll('.inv-creative-grid .inv-slot').length > 0, 'Wyszukiwanie kreatywne puste');
            await theme('lepidolit'); check(!getComputedStyle(document.querySelector('.inv-panel')).backgroundImage.includes('grey-wood'), 'Pozostała tekstura szarego drewna');
            await theme('grey-wood'); tests.push('Wyszukiwanie kreatywne i przejście przez Lepidolit');
            screen.close(); menu.showSettings('title', 'look'); await tick();
            const button = [...document.querySelectorAll('button')].find(e => e.textContent.includes('Motyw:'));
            check(button?.textContent.includes('Szare drewno'), 'Motyw nie jest widoczny w ustawieniach');
            check(getComputedStyle(document.querySelector('.inventory-theme-note')).display !== 'none', 'Brak informacji o wyglądzie ekwipunku');
            check(getComputedStyle(document.querySelector('.settings-inventory-style > button')).display === 'none', 'Nieaktywny wybór wyglądu jest widoczny');
            button.click(); await window.themeReady; check(settings.get('theme') !== 'grey-wood', 'Przycisk nie zmienił motywu');
            check(getComputedStyle(document.querySelector('.inventory-theme-note')).display === 'none', 'Informacja pozostała po zmianie motywu');
            check(getComputedStyle(document.querySelector('.settings-inventory-style > button')).display !== 'none', 'Wybór dawnego wyglądu nie wrócił');
            await theme('grey-wood'); tests.push('Wybór motywu w menu');
            check(errors.length === 0, errors.join('\n')); return tests;
        },
        async show(view) {
            if (view === 'menu') { screen.close(); menu.showTitle(); }
            else if (view === 'settings') { screen.close(); menu.showSettings('title', 'look'); }
            else if (view === 'hud') { screen.close(); menu.hide(); hotbar.update(game.inventory.slots.slice(0,9),0); }
            else { await inventory(view === 'creative' ? 'creative' : 'adventure', view === 'book'); }
            if (view === 'tooltip') {
                const slot = document.querySelector('[data-kind="slot"][data-index="0"]');
                const rect = slot.getBoundingClientRect();
                slot.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rect.right, clientY: rect.top }));
            }
            await tick(); return view === 'menu' || view === 'settings' || view === 'hud' ? { view } : layout();
        }
    };
    await theme('grey-wood'); await inventory();
}

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.VOXEL_UI_TEST_OUTPUT ?? 'test-results/grey-wood');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'voxel-gui-'));
// Używamy dokładnie funkcji ładowania motywu z main.js, bez drugiej implementacji.
const main = await readFile(resolve(root, 'src/main.js'), 'utf8');
const loadTheme = main.match(/function loadTheme\(name\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(loadTheme, 'Brak funkcji loadTheme w main.js');
const iconNames = (await readdir(resolve(root, 'docs/wiki/ikony'))).filter(x => x.endsWith('.png')).map(x => x.slice(0,-4));
const index = await readFile(resolve(root, 'index.html'), 'utf8');
const html = index.replace('<script type="module" src="./src/main.js"></script>', `<script type="module">${loadTheme}\n(${setupUi.toString()})(${JSON.stringify(iconNames)}).then(()=>document.body.dataset.qa='ready').catch(e=>{document.body.dataset.qa='failed';document.body.dataset.error=e.stack;console.error(e)})</script>`);
const mime = { '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.ogg':'audio/ogg' };
const server = createServer(async(req,res) => {
    try {
        const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(path === '/__ui_test__') { res.setHeader('Content-Type','text/html');res.end(html);return; }
        const file = resolve(root, '.'+path);
        if(!file.startsWith(root.endsWith(sep)?root:root+sep)) {res.writeHead(403).end();return;}
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
    } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,socket,logs='';
try {
    chrome = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--disable-background-networking','--hide-scrollbars','--window-size=1100,900','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
    let startupError;chrome.on('error',e=>startupError=e);chrome.stdout.on('data',d=>logs+=d);chrome.stderr.on('data',d=>logs+=d);
    const pause=ms=>new Promise(r=>setTimeout(r,ms));let port;const deadline=Date.now()+20000;
    while(!(port=logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {if(startupError)throw startupError;if(chrome.exitCode!==null||chrome.signalCode||Date.now()>deadline)throw Error('Chrome: '+logs);await pause(100);}
    const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
    let sequence=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')logs+='\n'+JSON.stringify(m.params);});
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},30000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??JSON.stringify(r.exceptionDetails));return r.result?.value;};
    await call('Runtime.enable');await call('Page.enable');
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/__ui_test__`});
    let ready;const until=Date.now()+30000;
    while(Date.now()<until){ready=await evaluate('({qa:document.body?.dataset.qa,error:document.body?.dataset.error})');if(ready?.qa==='failed')throw Error(ready.error);if(ready?.qa==='ready')break;await pause(100);}
    assert.equal(ready?.qa,'ready','Nie uruchomiono komponentów GUI');
    const tests=await evaluate('uiQA.verify()');const layouts=[];
    for(const [name,width,height,view] of [['menu',1100,800,'menu'],['ekwipunek',1100,900,'inventory'],['opis-przedmiotu',1100,900,'tooltip'],['ksiega',1366,900,'book'],['kreatywny',1100,900,'creative'],['telefon',390,844,'inventory'],['telefon-ksiega',390,844,'book'],['telefon-kreatywny',390,844,'creative'],['niski-ekran',844,390,'book'],['ustawienia',1100,900,'settings'],['pasek',390,844,'hud']]){
        await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        layouts.push({name,...await evaluate(`uiQA.show(${JSON.stringify(view)})`)});
        const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(resolve(output,`${name}.png`),Buffer.from(shot.data,'base64'));
        if(process.env.UI_SCREENSHOTS_IN_LOG==='1'&&['menu','ekwipunek'].includes(name)){
            let preview=shot;
            for(const [previewWidth,previewHeight] of [[960,760],[800,680],[720,600]]){
                if(Buffer.byteLength(preview.data,'base64')<=100*1024)break;
                await call('Emulation.setDeviceMetricsOverride',{width:previewWidth,height:previewHeight,deviceScaleFactor:1,mobile:false});
                await evaluate(`uiQA.show(${JSON.stringify(view)})`);
                preview=await call('Page.captureScreenshot',{format:'png'});
            }
            console.log(`UI_SCREENSHOT_${name}=${preview.data}`);
        }
    }
    const errors=await evaluate('uiQA.errors');assert.deepEqual(errors,[]);
    const result={status:'passed',tests,layouts};await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2));console.log('OK: motyw GUI, rzeczywiste komponenty menu/ekwipunku/księgi/HUD, przełączanie, zapis, przenoszenie stosów, wytwarzanie i 11 ujęć desktop/telefon.');console.log(JSON.stringify(result));
} finally {
    await writeFile(resolve(output,'chrome.log'),logs);socket?.close();
    if(chrome?.pid&&chrome.exitCode===null&&!chrome.signalCode){const ended=once(chrome,'exit');chrome.kill('SIGKILL');await ended;}
    server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
