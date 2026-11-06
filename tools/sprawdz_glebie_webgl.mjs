// Browser correctness test, not a hardware FPS benchmark. No user profile/saves.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.VOXEL_TEST_OUTPUT??'test-results/depth-reuse');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'voxel-depth-reuse-'));
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
    try {
        const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(pathname==='/') {res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script><script type="module">import {run} from '/tools/fixtures/depth-reuse.js'; window.result=await run().catch(e=>({error:e.stack}));</script>`);return;}
        const path=resolve(root,'.'+pathname);
        if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));
    } catch {res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,socket,logs='',startupError;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
    chrome=spawn(process.env.CHROME_BIN??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome'),[
        '--headless','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader',
        '--no-first-run','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
    ],{stdio:['ignore','pipe','pipe']});
    chrome.on('error',e=>startupError=e);
    chrome.stdout.on('data',d=>logs+=d);chrome.stderr.on('data',d=>logs+=d);
    let port;const deadline=Date.now()+20000;
    while(!(port=logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])) {
        if(startupError)throw startupError;
        if(chrome.exitCode!==null||Date.now()>deadline)throw Error(`Chrome failed: ${logs}`);
        await pause(100);
    }
    const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());
    socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
    let sequence=0;const pending=new Map();
    socket.addEventListener('message',event=>{
        const m=JSON.parse(event.data),p=pending.get(m.id);
        if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
        else if(m.method==='Runtime.exceptionThrown')logs+='\n'+JSON.stringify(m.params);
    });
    const call=(method,params={})=>new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout ${method}`));},60000);
        pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    await call('Runtime.enable');await call('Page.enable');
    await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    let result;const until=Date.now()+90000;
    while(!result&&Date.now()<until){result=(await call('Runtime.evaluate',{expression:'window.result',returnByValue:true})).result?.value;await pause(100);}
    assert.ok(result,'Browser test completed');assert.ok(!result.error,result.error);
    await writeFile(resolve(output,'render.json'),JSON.stringify(result,null,2));
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await writeFile(resolve(output,'render.png'),Buffer.from(shot.data,'base64'));
    console.log(`OK: depth reuse WebGL — ${result.checks.length} checks; MSAA, foliage, water and continuous LOD.`);
} finally {
    await writeFile(resolve(output,'chrome.log'),logs);socket?.close();
    if(chrome&&chrome.exitCode===null&&!chrome.signalCode){const exited=once(chrome,'exit');chrome.kill('SIGKILL');await exited;}
    server.closeAllConnections();await new Promise(r=>server.close(r));
    const checked=resolve(profile);assert.ok(checked.startsWith(resolve(tmpdir())+sep)&&checked.split(sep).at(-1).startsWith('voxel-depth-reuse-'));
    await rm(checked,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
