import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { textureManifest, readTextureRegion, readTexturePng, decodeTexturePng } from './texture_regions.mjs';

// Recorded from the actual 0.79.0 browser atlas before the migration. The
// fixture is independent of new packing code: every visible tile must retain
// its exact pixels, dimensions and runtime UV position, including large models.
const baseline=JSON.parse(readFileSync(new URL('./fixtures/texture-atlas-079.json',import.meta.url),'utf8'));
const torchSource=JSON.parse(readFileSync(new URL('../assets/models/torch/SOURCE.json',import.meta.url),'utf8'));
const torchFrames=Object.fromEntries(torchSource.textures.map(row=>[row.file.replace(/\.png$/,''),row.firstFrameRgbaSha256]));
const data=textureManifest(), hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let checks=0;
const equal=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
equal(data.tileSize,baseline.tileSize,'Texture pixel scale is unchanged');
equal(data.columns,baseline.columns,'GPU atlas width is unchanged');
check(data.rows>=baseline.rows,'GPU atlas retains every original row');
// Nowe tekstury (np. skrzynia 0.81.0) dochodzą na końcu, w wolnych miejscach.
equal(Object.keys(data.tiles).slice(0,Object.keys(baseline.tiles).length),Object.keys(baseline.tiles),'All existing texture keys and ordering survive');
{
    const taken=new Map();
    for(const [name,tile] of Object.entries(data.tiles)) for(let dx=0;dx<(tile.w??1);dx++) for(let dy=0;dy<(tile.h??1);dy++) {
        const key=`${tile.x+dx},${tile.y+dy}`;
        check(!taken.has(key),`${name}: atlas cell ${key} also used by ${taken.get(key)}`);
        taken.set(key,name);
    }
}
for(const [name,old] of Object.entries(baseline.tiles)) {
    const {rgbaSha256,...layout}=old, {region,...current}=data.tiles[name];
    equal(current,layout,`${name}: UV rectangle remains unchanged`);
    const image=readTextureRegion(region);
    equal([image.width,image.height],[(layout.w??1)*16,(layout.h??1)*16],`${name}: complete model tile dimensions`);
    // A torch icon now views frame0 of its original animation directly.
    // Check its unpremultiplied source bytes here; the browser regression
    // checks all363 final GPU tiles against the old Canvas2D-visible pixels.
    equal(hash(image.rgba),torchFrames[name]??rgbaSha256,`${name}: all original source pixels are preserved`);
}
for(const [name,sheet] of Object.entries(data.sheets)) {
    check(/^[a-z0-9_-]+\.png$/.test(sheet.file),`${name}: one local thematic PNG`);
    const image=decodeTexturePng(readFileSync(new URL('../assets/textures/'+sheet.file,import.meta.url)));
    equal([image.width,image.height],[sheet.width,sheet.height],`${name}: declared sheet dimensions`);
}
for(const name of Object.keys(data.regions)) {
    const image=readTextureRegion(name); // includes explicit integer/bounds checks
    check(image.rgba.length===image.width*image.height*4,`${name}: complete region inside its sheet`);
}
for(const [path,name] of Object.entries(data.legacy??data.aliases)) {
    check(path.startsWith('assets/')&&path.endsWith('.png'),`${path}: asset alias stays relative`);
    const expected=readTextureRegion(name),actual=readTextureRegion(path);
    equal(hash(actual.rgba),hash(expected.rgba),`${path}: legacy filename maps to identical pixels`);
}
for(const name of ['grass_top','models/blueberry/atlas','campfire_bald_cypress','assets/models/torch/torch.png']) {
    const source=readTextureRegion(name), encoded=readTexturePng(name), decoded=decodeTexturePng(encoded);
    equal(decoded,source,`${name}: offline tools get lossless PNG regions`);
}
assert.throws(()=>readTextureRegion('../unlisted.png'),/Unknown texture region/);checks++;
console.log(`OK: atlasy tekstur — ${checks} sprawdzeń, ${Object.keys(data.tiles).length} źródeł kafelków zgodnych z 0.79.0, ${Object.keys(data.sheets).length} arkuszy, pełne regiony i zgodne aliasy.`);
