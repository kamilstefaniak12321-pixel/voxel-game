// Renderuje rzeczywiste modele/shadery pochodni i ręki w Chrome (WebGL2).
// Bez npm install; Node >= 22.15, CHROME_BIN albo google-chrome w PATH.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function browserChecks() {
    const errors=[];
    const originalError=console.error;
    console.error=(...args)=>{errors.push(args.map(String).join(' '));originalError(...args);};
    addEventListener('error',event=>errors.push(event.message));
    addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    const THREE=await import('three');
    const {createTorchModel,disposeTorchModel,awaitTorchTextures,updateTorchTime,torchTime}=await import('/src/rendering/TorchMaterial.js');
    const {TorchRenderer}=await import('/src/rendering/TorchRenderer.js');
    const {TORCH_VARIANTS,torchType}=await import('/src/blocks/torches.js');
    const {getBlockId}=await import('/src/blocks/BlockRegistry.js');
    const {Chunk}=await import('/src/world/Chunk.js');
    const {FirstPersonHand}=await import('/src/player/FirstPersonHand.js');
    const {PlayerModel}=await import('/src/player/PlayerModel.js');
    const {atlasReady}=await import('/src/rendering/TextureAtlas.js');
    const {skinReady}=await import('/src/player/skin.js');
    const {lightingUniforms}=await import('/src/rendering/LightingDiagnostics.js');
    await atlasReady;check(await skinReady!=='error','Nie wczytano skórki');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(960,540);renderer.setClearColor(0x182329,1);document.body.append(renderer.domElement);
    check(renderer.capabilities.isWebGL2,'Brak WebGL2');
    const lightScene=scene=>{
        scene.add(new THREE.HemisphereLight(0xfff4df,0x657b85,2));
        const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(2,4,3);scene.add(sun);
    };
    const probeScene=new THREE.Scene();probeScene.background=new THREE.Color(0x182329);lightScene(probeScene);
    const camera=new THREE.OrthographicCamera(-.65,.65,.65,-.65,.01,20);
    camera.position.set(1.25,1.05,2);camera.lookAt(0,.49,0);
    const probe=createTorchModel();probeScene.add(probe);
    const second=createTorchModel('plain','north');
    await awaitTorchTextures();
    const data=probe.userData.torch;
    check(data.texture===second.userData.torch.texture,'Modele dublują tę samą teksturę');
    check(data.flame.material.transparent&&data.flame.material.alphaTest===0&&!data.flame.material.depthWrite,'Płomień traci półprzezroczystość źródła');
    check(data.flame.material.userData.torchTime===torchTime&&data.shaft.material.userData.torchTime===torchTime,'Trzonek i płomień nie korzystają ze wspólnego zegara');
    const size=new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3());
    check(Math.abs(size.x-3/16)<1e-6&&Math.abs(size.z-3/16)<1e-6&&Math.abs(size.y-15.5/16)<1e-6,'Pochodnia ma rozmiar pełnego bloku albo złą wysokość');
    const target=new THREE.WebGLRenderTarget(256,256);
    const sample=time=>{
        updateTorchTime(time);renderer.setRenderTarget(target);renderer.render(probeScene,camera);
        const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
        check(renderer.getContext().getError()===0,'Błąd WebGL podczas animacji');return pixels;
    };
    const difference=(a,b)=>{let pixels=0,total=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>2)pixels++;total+=d;}return {pixels,total};};
    const frames=new Map([0,.05,.1,1.9,1.95,2].map(time=>[time,sample(time)]));
    const version=data.texture.version;
    const pairs=[[0,.1],[0,.05],[.05,.1],[1.9,1.95],[1.95,2]];
    const differences=pairs.map(([a,b])=>({a,b,...difference(frames.get(a),frames.get(b))}));
    for(const d of differences)check(d.pixels>8,`Obraz nie zmienił się między ${d.a}s a ${d.b}s: ${d.pixels} pikseli`);
    check(difference(frames.get(0),frames.get(2)).total===0,'Pętla po dwóch sekundach ma szew');
    let disposed=0;data.texture.addEventListener('dispose',()=>disposed++);
    disposeTorchModel(second);disposeTorchModel(second);
    check(disposed===0,'Usunięcie jednego modelu zwolniło teksturę drugiego');
    check(difference(frames.get(.1),sample(.1)).total===0,'Usunięcie współdzielonego modelu zmieniło pozostały');
    check(data.texture.version===version,'Animacja ponownie wysyła teksturę do GPU');

    // Ten sam materiał płomienia na planszy 16×16: każdy piksel porównujemy
    // z oryginalnym PNG, także alfa oraz przejście ostatniej klatki do pierwszej.
    const sourceCanvas=document.createElement('canvas');sourceCanvas.width=16;sourceCanvas.height=320;
    const sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});
    if(data.texture.userData.regionImageFlipped){sourceContext.translate(0,320);sourceContext.scale(1,-1);}
    sourceContext.drawImage(data.texture.image,0,0);
    const source=sourceContext.getImageData(0,0,16,320).data;
    const pixelTarget=new THREE.WebGLRenderTarget(16,16);
    const pixelScene=new THREE.Scene();
    const quadGeometry=new THREE.PlaneGeometry(1,1);
    pixelScene.add(new THREE.Mesh(quadGeometry,data.flame.material));
    const pixelCamera=new THREE.OrthographicCamera(-.5,.5,.5,-.5,.1,3);pixelCamera.position.z=1;
    const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
    let checkedPixels=0,maxPixelError=0;
    renderer.setClearColor(0,0);
    for(const time of [0,.05,.1,1.95]){
        updateTorchTime(time);renderer.setRenderTarget(pixelTarget);renderer.render(pixelScene,pixelCamera);
        const actual=new Uint8Array(16*16*4);renderer.readRenderTargetPixels(pixelTarget,0,0,16,16,actual);
        const phase=time*10,frame=Math.floor(phase),next=(frame+1)%20,mix=phase-frame;
        for(let y=0;y<16;y++)for(let x=0;x<16;x++){
            const a=(frame*256+y*16+x)*4,b=(next*256+y*16+x)*4,targetIndex=((15-y)*16+x)*4;
            const alpha=(source[a+3]*(1-mix)+source[b+3]*mix)/255;
            for(let channel=0;channel<4;channel++){
                const expected=channel===3?alpha*255:linear((source[a+channel]*(1-mix)+source[b+channel]*mix)/255)*alpha*255;
                const error=Math.abs(actual[targetIndex+channel]-expected);maxPixelError=Math.max(maxPixelError,error);
                check(error<=4,`PNG/GLSL różnią się w t=${time}, piksel ${x},${y}, kanał ${channel}: ${actual[targetIndex+channel]} zamiast ${expected.toFixed(1)}`);
            }
            checkedPixels++;
        }
    }
    quadGeometry.dispose();pixelTarget.dispose();renderer.setClearColor(0x182329,1);

    // Rzeczywista dłoń oraz model postaci używają tej samej animacji.
    const hand=new FirstPersonHand({attachLights:lightScene});
    hand.resize(1);hand.show('torch_red');hand.place();await awaitTorchTextures();
    check(hand.torch?.userData.torch.colorKey==='red'&&!hand.held.visible,'Dłoń pokazuje sześcian zamiast pochodni');
    check(hand.torch.userData.torch.flame.material.userData.torchTime===torchTime,'Dłoń nie jest podłączona do zegara animacji');
    const handSample=time=>{
        updateTorchTime(time);renderer.setRenderTarget(target);renderer.render(hand.scene,hand.camera);
        const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);return pixels;
    };
    const handDifference=difference(handSample(0),handSample(.1));
    check(handDifference.pixels>8,'Pochodnia w pierwszej osobie nie animuje tekstury');
    const playerModel=new PlayerModel();playerModel.setHeldBlock('torch_red');
    check(playerModel.heldTorch?.userData.torch.colorKey==='red'&&!playerModel.held.visible,'Model gracza nie trzyma właściwej pochodni');
    check(playerModel.heldTorch.userData.torch.texture===hand.torch.userData.torch.texture,'Widoki ręki i postaci dublują arkusz');
    playerModel.setHeldBlock('stone');check(!playerModel.heldTorch&&playerModel.held.visible,'Zmiana trzymanego przedmiotu zostawia pochodnię');

    // Indeks chunków: wszystkie 17 barw + cztery mocowania ścienne.
    const scene=new THREE.Scene();scene.background=new THREE.Color(0x182329);lightScene(scene);
    const galleryCamera=new THREE.PerspectiveCamera(42,960/540,.1,60);
    galleryCamera.position.set(5.5,6.5,15.5);galleryCamera.lookAt(5,1.0,4.5);
    const chunk=new Chunk(0,0);
    TORCH_VARIANTS.forEach((variant,i)=>chunk.setId(1+i%9,1,3+Math.floor(i/9)*3,getBlockId(variant.type)));
    for(const [i,attach] of ['north','south','east','west'].entries())chunk.setId(2+i*2,2,9,getBlockId(torchType('plain',attach)));
    const world={chunks:new Map([['0,0',chunk]]),version:1,
        getLight:()=>({sky:15,red:180,green:130,blue:85}),
        setBlock(){throw Error('Animacja próbuje przebudować bloki/światło');}};
    const game={scene,camera:galleryCamera,world,sky:{},bounce:{enabled:false},renderer,settings:{get:()=>false}};
    const torches=new TorchRenderer(game);torches.update(0);await awaitTorchTextures();
    check(torches.views.size===21,'Renderer nie pokazał wszystkich barw/mocowań');
    const objects=[...torches.views.values()].map(view=>view.group);
    const textures=[...new Set(objects.map(group=>group.userData.torch.texture))];
    const versions=textures.map(texture=>texture.version),pool=torches.particles;
    for(let i=0;i<120;i++)torches.update(1/60);
    check(torches.views.size===21&&[...torches.views.values()].every((view,i)=>view.group===objects[i]),'Klatka animacji przebudowuje modele');
    check(textures.every((texture,i)=>texture.version===versions[i]),'Renderer aktualizuje piksele PNG co klatkę');
    check(torches.particles===pool&&pool.length<=96,'Cząsteczki nie mają stałej, ograniczonej puli');
    check(torches.emitters.length<=24,'Nieograniczona liczba emiterów cząsteczek');
    let bounceSamples=0;
    game.bounce={enabled:true,sample(){bounceSamples++;return [.1,.2,.3];}};
    torches.updateBounce();check(bounceSamples===21,'Światło odbite nie obejmuje wszystkich pochodni');
    for(let i=0;i<10;i++)torches.updateBounce();check(bounceSamples===21,'Światło odbite próbkowane wiele razy w tej samej klatce');
    game.bounce.enabled=false;torches.updateBounce();
    check([...torches.views.values()].every(view=>view.lighting.uModelBounce.value.lengthSq()===0),'Wyłączone odbicia pozostają na pochodniach');
    torches.setLowDetail(true);renderer.setRenderTarget(target);renderer.render(scene,galleryCamera);torches.setLowDetail(false);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(10,.25,8),new THREE.MeshLambertMaterial({color:0x555d5b}));floor.position.set(5,.875,5.5);scene.add(floor);
    for(const z of [3.5,6.5]){
        const step=new THREE.Mesh(new THREE.BoxGeometry(9.8,.15,1.2),new THREE.MeshLambertMaterial({color:0x727773}));step.position.set(5,.925,z);scene.add(step);
    }
    const wall=new THREE.Mesh(new THREE.BoxGeometry(8,1,1),new THREE.MeshLambertMaterial({color:0x616a67}));wall.position.set(5,1.5,9.5);scene.add(wall);
    lightingUniforms.uLightingNatural.value=1;
    renderer.setRenderTarget(target);renderer.render(scene,galleryCamera);
    lightingUniforms.uLightingNatural.value=0;
    check(errors.length===0,errors.join('\n'));
    const result={status:'passed',differences,handDifference,checkedPixels,maxPixelError,modelSize:size.toArray(),variants:17,mountings:5,views:21,particleCapacity:pool.length};
    window.torchQA={result,errors,
        show(view,time=0){
            renderer.setRenderTarget(null);updateTorchTime(time);
            if(view==='gallery'){renderer.setSize(960,540);renderer.render(scene,galleryCamera);}
            else if(view==='hand'){renderer.setSize(480,480);renderer.render(hand.scene,hand.camera);}
            else{renderer.setSize(320,320);renderer.render(probeScene,camera);}
            return renderer.domElement.toDataURL('image/png').split(',')[1];
        },
        finish(){
            chunk.setId(1,1,3,0);world.version++;torches.update(0);check(torches.views.size===20,'Zniszczona pochodnia nadal jest rysowana');
            world.chunks.clear();world.version++;torches.update(0);check(torches.views.size===0,'Usunięty chunk zostawił modele');
            world.chunks.set('0,0',chunk);world.version++;torches.update(0);check(torches.views.size===20,'Powrót do chunka nie przywrócił pochodni');
            chunk.setId(2,1,3,getBlockId('torch_red'));world.version++;torches.update(0);
            check([...torches.views.values()].find(view=>view.x===2&&view.y===1&&view.z===3)?.group.userData.torch.colorKey==='red','Barwienie nie odświeżyło istniejącego modelu');
            torches.dispose();torches.dispose();check(!torches.points.parent,'Wyjście ze świata zostawiło cząsteczki');
            check(disposed===0,'Zamknięcie świata zwolniło teksturę aktywnego podglądu');
            hand.dispose();playerModel.dispose();disposeTorchModel(probe);
            check(disposed===1,'Ostatni model nie zwolnił tekstury albo zrobił to więcej niż raz');
            target.dispose();renderer.dispose();check(errors.length===0,errors.join('\n'));
            return {...result,lifecycle:'passed'};
        }
    };
}

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.env.VOXEL_TORCH_TEST_OUTPUT??'test-results/torches');
await mkdir(output,{recursive:true});
const profile=await mkdtemp(resolve(tmpdir(),'voxel-torches-'));
const html=`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#182329}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/lib/three/three.module.js"}}</script>
<script type="module">(${browserChecks.toString()})().then(()=>document.body.dataset.qa='ready').catch(e=>{document.body.dataset.qa='failed';document.body.dataset.error=e.stack;console.error(e)})</script>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ogg':'audio/ogg'};
const server=createServer(async(req,res)=>{
    try{
        const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        if(path==='/__torch_test__'){res.setHeader('Content-Type','text/html');res.end(html);return;}
        const file=resolve(root,'.'+path);
        if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
    }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,socket,logs='';
try{
    chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--disable-background-networking','--hide-scrollbars','--window-size=960,540','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
    let startupError;chrome.on('error',e=>startupError=e);chrome.stdout.on('data',d=>logs+=d);chrome.stderr.on('data',d=>logs+=d);
    const pause=ms=>new Promise(r=>setTimeout(r,ms));let port;const deadline=Date.now()+20000;
    while(!(port=logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1])){if(startupError)throw startupError;if(chrome.exitCode!==null||chrome.signalCode||Date.now()>deadline)throw Error('Chrome: '+logs);await pause(100);}
    const pages=await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json());socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await once(socket,'open');
    let sequence=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')logs+='\n'+JSON.stringify(m.params);});
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??JSON.stringify(r.exceptionDetails));return r.result?.value;};
    await call('Runtime.enable');await call('Page.enable');await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/__torch_test__`});
    let ready;const until=Date.now()+65000;
    while(Date.now()<until){ready=await evaluate('({qa:document.body?.dataset.qa,error:document.body?.dataset.error})');if(ready?.qa==='failed')throw Error(ready.error);if(ready?.qa==='ready')break;await pause(100);}
    assert.equal(ready?.qa,'ready','Nie zakończono renderowania pochodni');
    for(const [name,view,time] of [['pochodnie','gallery',.35],['dlon','hand',.35],['klatka-00','frame',0],['przejscie-005','frame',.05],['klatka-01','frame',.1]]){
        const data=await evaluate(`torchQA.show(${JSON.stringify(view)},${time})`);await writeFile(resolve(output,`${name}.png`),Buffer.from(data,'base64'));
        if(process.env.UI_SCREENSHOTS_IN_LOG==='1'&&name==='pochodnie')console.log(`UI_SCREENSHOT_torch=${data}`);
        if(process.env.UI_SCREENSHOTS_IN_LOG==='1'&&name==='dlon')console.log(`UI_SCREENSHOT_torch_hand=${data}`);
    }
    const result=await evaluate('torchQA.finish()');await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2));
    console.log('OK: pochodnie WebGL2 — rzeczywiste klatki, interpolacja RGBA, pętla, barwy, model dłoni, wspólne tekstury, stała pula cząsteczek i zwalnianie zasobów.');console.log(JSON.stringify(result));
}finally{
    await writeFile(resolve(output,'chrome.log'),logs);socket?.close();
    if(chrome?.pid&&chrome.exitCode===null&&!chrome.signalCode){const ended=once(chrome,'exit');chrome.kill('SIGKILL');await ended;}
    server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
