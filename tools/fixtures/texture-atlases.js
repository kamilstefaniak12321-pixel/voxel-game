// A real isolated Game plus exact atlas, icon and animated texture checks.
export async function run(expected) {
    const checks=[], errors=[], captures=[];
    const check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
    addEventListener('error',event=>errors.push(event.message));
    addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
    const originalError=console.error;
    console.error=(...args)=>{errors.push(args.map(String).join(' '));originalError(...args);};
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    const imageData=(image,flipY=false)=>{const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});if(flipY){ctx.translate(0,c.height);ctx.scale(1,-1);}ctx.drawImage(image,0,0);return {canvas:c,ctx,pixels:ctx.getImageData(0,0,c.width,c.height).data};};
    const imageHash=async (image,flipY=false)=>{const d=imageData(image,flipY);return {width:image.width,height:image.height,rgbaSha256:await hash(d.pixels)};};
    const THREE=await import('three');
    const atlas=await import('/src/rendering/TextureAtlas.js'), ready=await atlas.atlasReady;
    const pixels=imageData(ready.image), atlasHashes={};
    check(ready.image.width===expected.width&&ready.image.height===expected.height,'GPU atlas dimensions unchanged');
    check(JSON.stringify(Object.keys(atlas.ATLAS_TILES))===JSON.stringify(Object.keys(expected.tiles)),'All original texture names preserved');
    for(const [name,tile] of Object.entries(atlas.ATLAS_TILES)) {
        const {rgbaSha256,...rect}=expected.tiles[name];
        check(JSON.stringify(tile)===JSON.stringify(rect),`${name}: original runtime UV rectangle`);
        const rgba=pixels.ctx.getImageData(tile.x*16,tile.y*16,(tile.w??1)*16,(tile.h??1)*16).data;
        atlasHashes[name]=await hash(rgba);
        check(atlasHashes[name]===rgbaSha256,`${name}: original visible RGBA pixels`);
    }
    const {Game}=await import('/src/game/Game.js');
    const {Settings}=await import('/src/settings/Settings.js');
    const {createWorldInfo}=await import('/src/storage/WorldStorage.js');
    const {TREE_NAMES}=await import('/src/blocks/trees.js');
    const {getBlockId}=await import('/src/blocks/BlockRegistry.js');
    const {PlayerModel,createPose}=await import('/src/player/PlayerModel.js');
    const {skinReady,skinTexture}=await import('/src/player/skin.js');
    const {createBlockIcons}=await import('/src/ui/BlockIcons.js');
    const {createTorchModel,disposeTorchModel,awaitTorchTextures}=await import('/src/rendering/TorchMaterial.js');
    const {TORCH_VARIANTS}=await import('/src/blocks/torches.js');
    const {newCampfire}=await import('/src/game/CampfireState.js');
    check(await skinReady!=='error','Player skin loads');
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.info.autoReset=false;renderer.setSize(1280,800);document.body.append(renderer.domElement);
    const settings=new Settings();
    for(const [key,value] of Object.entries({viewDistance:80,farTerrain:0,shadows:1,meteorites:false,plantWind:false,leafModel:'parts',fancyLeaves:true,lightShafts:false,bounceLight:false,showHand:false,volumeMusic:0,cloudCover:0,renderScale:100}))settings.set(key,value);
    const input=new Proxy({}, {get:(_,name)=>name==='consumeMouseDelta'?()=>({x:0,y:0}):()=>0});
    const info=createWorldInfo('Kontrola atlasów',42,'flat','developer');
    const game=await Game.start(renderer,input,null,info,settings);game.resize(1280,800);
    game.player.flying=true;game.time.speed=0;game.time.days=.43;game.world.setDistanceLod(false);
    const x0=-192,z0=-32;game.world.loadAround(x0+16,z0,5);const ground=game.world.getGroundY(x0,z0);
    for(const [i,name] of TREE_NAMES.entries()) {
        for(const [row,part] of ['log','log_stripped','planks','leaves'].entries()) {
            const type=`${name}_${part}`;check(getBlockId(type)>0,`${type}: preserved block`);
            game.world.setBlock(x0+i*3,ground+row,z0,type);
        }
        game.world.setBlock(x0+i*3,ground,z0+3,`${name}_sapling`);
    }
    for(const [i,type] of ['short_grass','tall_grass','fern','strawberry_bush_full','blackberry_bush_full','chili_bush_full','hazel_bush_full','blueberry_bush_full'].entries()) {
        check(getBlockId(type)>0,`${type}: plant fixture`);game.world.setBlock(x0+i*2,ground,z0+8,type);
    }
    const marker=new PlayerModel();marker.setPose(createPose());marker.place(new THREE.Vector3(x0+24,ground,z0+8),Math.PI);marker.setHeldBlock('blueberry');game.scene.add(marker.object);
    const torches=TORCH_VARIANTS.map((variant,i)=>{
        const color=variant.key??variant.color??(variant.texture==='torch'?'plain':variant.texture.slice(6));
        const model=createTorchModel(color);model.position.set(x0+i*1.8,ground,z0+12);game.scene.add(model);return model;
    });
    await awaitTorchTextures();
    const fire=newCampfire(x0+29,ground,z0+8);fire.logs=Array.from({length:6},()=>({wood:'bald_cypress',burn:.3}));fire.phase='burning';
    game.world.setBlock(fire.x,fire.y,fire.z,'campfire');game.campfires.fires.set(`${fire.x},${fire.y},${fire.z}`,fire);
    const until=Date.now()+15000;
    while(!game.campfires.renderer.fireTexture.image?.width&&Date.now()<until)await new Promise(r=>setTimeout(r,20));
    check(!!game.campfires.renderer.fireTexture.image?.width,'Campfire flame texture loads');
    const extraTextures={skin:await imageHash(skinTexture.image),campfire:await imageHash(game.campfires.renderer.fireTexture.image)};
    for(const [i,model] of torches.entries()){const texture=model.userData.torch.texture;extraTextures[TORCH_VARIANTS[i].texture]=await imageHash(texture.image,texture.userData.regionImageFlipped);}
    const icons=await createBlockIcons(), iconHashes={};
    const iconCanvas=document.createElement('canvas');iconCanvas.width=768;iconCanvas.height=256;
    const iconContext=iconCanvas.getContext('2d');iconContext.fillStyle='#dedede';iconContext.fillRect(0,0,768,256);iconContext.imageSmoothingEnabled=false;
    const iconNames=['blueberry','strawberry','blackberry','chili_pepper','hazelnut','oak_firewood','bald_cypress_firewood','cherry_firewood','axe','pickaxe','shovel','stick',...TREE_NAMES.map(name=>`${name}_planks`)];
    for(const [i,name] of iconNames.entries()) {
        check(icons.has(name),`${name}: inventory icon exists`);
        const image=new Image();image.src=icons.get(name);await image.decode();iconHashes[name]=await imageHash(image);
        iconContext.drawImage(image,(i%12)*64,Math.floor(i/12)*128,64,64);iconContext.fillStyle='#252525';iconContext.font='9px monospace';iconContext.fillText(name,(i%12)*64+2,Math.floor(i/12)*128+78,62);
    }
    async function capture(name) {
        if(name==='icons')return iconCanvas.toDataURL('image/png').split(',')[1];
        game.time.days=name==='night'?.8:.43;
        const eye=[x0+16,ground+7,z0+32],target=[x0+16,ground+2,z0+4];
        game.player.pos.set(eye[0],eye[1]-1.6,eye[2]);game.update(0);game.world.updateMeshes();
        for(let i=0;i<4;i++){game.camera.position.set(...eye);game.camera.lookAt(...target);game.render();await new Promise(r=>setTimeout(r,0));}
        check(renderer.getContext().getError()===0,`${name}: no WebGL error`);
        check(!(renderer.info.programs??[]).some(p=>p.diagnostics?.runnable===false),`${name}: shaders compiled`);
        check(renderer.info.render.triangles>1000,`${name}: actual world rendered`);
        captures.push({name,triangles:renderer.info.render.triangles,calls:renderer.info.render.calls});
        return renderer.domElement.toDataURL('image/png').split(',')[1];
    }
    return {capture,report:()=>({checks,errors,captures,atlasHashes,extraTextures,iconHashes,
        textureRequests:performance.getEntriesByType('resource').filter(r=>/\.png(?:$|\?)/.test(r.name)).map(r=>({path:new URL(r.name).pathname,duration:r.duration})),
        renderer:renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL??renderer.getContext().RENDERER)}),
        stop:async()=>{torches.forEach(disposeTorchModel);marker.dispose();await game.stop({save:false});renderer.dispose();console.error=originalError;}};
}
