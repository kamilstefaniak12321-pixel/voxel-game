// Read authoring sheets without a browser. Tests and offline icon tools use
// the same named regions as the game, including aliases for former PNG paths.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let manifest;
const images = new Map();
export function textureManifest() {
    return manifest ??= JSON.parse(readFileSync(new URL('../assets/textures/atlas.json', import.meta.url), 'utf8'));
}

export function decodeTexturePng(png) {
    if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw Error('Expected non-interlaced 8-bit RGBA PNG');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), chunks = [];
    for (let p = 8; p + 12 <= png.length;) {
        const size = png.readUInt32BE(p);
        if (p + size + 12 > png.length) throw Error('Truncated PNG');
        if (png.toString('ascii', p + 4, p + 8) === 'IDAT') chunks.push(png.subarray(p + 8, p + 8 + size));
        p += size + 12;
    }
    const stride = width * 4, raw = inflateSync(Buffer.concat(chunks)), rgba = Buffer.alloc(stride * height);
    if (raw.length !== height * (stride + 1)) throw Error('Invalid PNG data size');
    const paeth = (a,b,c) => {
        const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
        return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
    };
    for (let y=0;y<height;y++) {
        const filter=raw[y*(stride+1)];
        if (filter>4) throw Error('Unsupported PNG filter');
        for (let x=0;x<stride;x++) {
            const p=y*stride+x,a=x>=4?rgba[p-4]:0,b=y?rgba[p-stride]:0,c=y&&x>=4?rgba[p-stride-4]:0;
            const predictor=filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0;
            rgba[p]=(raw[y*(stride+1)+x+1]+predictor)&255;
        }
    }
    return {width,height,rgba};
}

export function textureRegionKey(value) {
    const data=textureManifest();
    let key=String(value);
    if (data.regions[key]) return key;
    if (key.startsWith('file:')) key=relative(root,fileURLToPath(key)).replaceAll('\\','/');
    else if (/^https?:/.test(key)) key=new URL(key).pathname.replace(/^\//,'');
    else if (/^[A-Za-z]:[\\/]/.test(key)) key=relative(root,key).replaceAll('\\','/');
    key=key.replace(/^\.\//,'').replace(/^\/+/, '');
    if (key.startsWith('../')) key=relative(root,resolve(root,'tools',key)).replaceAll('\\','/');
    const alias=(data.legacy??data.aliases??{})[key];
    if (alias && data.regions[alias]) return alias;
    if (data.regions[key]) return key;
    throw Error(`Unknown texture region: ${value}`);
}

export function readTextureRegion(value) {
    const data=textureManifest(), key=textureRegionKey(value), region=data.regions[key], sheet=data.sheets[region.sheet];
    if (!sheet) throw Error(`Missing sheet for ${key}`);
    if (!images.has(region.sheet)) images.set(region.sheet,decodeTexturePng(readFileSync(new URL('../assets/textures/'+sheet.file,import.meta.url))));
    const image=images.get(region.sheet), {x,y,width,height}=region;
    if (![x,y,width,height].every(Number.isInteger) || x<0||y<0||width<1||height<1||x+width>image.width||y+height>image.height) throw Error(`Region outside sheet: ${key}`);
    const rgba=Buffer.alloc(width*height*4);
    for(let row=0;row<height;row++) image.rgba.copy(rgba,row*width*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4);
    return {width,height,rgba};
}

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=data=>{let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
export function encodeTexturePng({width,height,rgba}) {
    const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const rows=Buffer.alloc(height*(width*4+1));
    for(let y=0;y<height;y++) Buffer.from(rgba).copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function readTexturePng(value) { return encodeTexturePng(readTextureRegion(value)); }

// Authoring tools replace an existing rectangle without recreating loose PNGs.
// Changing sheet layout is a separate, explicit manifest operation.
export function writeTextureRegion(value, {width,height,rgba}) {
    const data=textureManifest(),key=textureRegionKey(value),region=data.regions[key];
    if(width!==region.width||height!==region.height||rgba.length!==width*height*4) throw Error(`Texture region dimensions must stay ${region.width} x ${region.height}: ${key}`);
    readTextureRegion(key); // validate sheet and bounds; populate image cache
    const original=images.get(region.sheet),image={...original,rgba:Buffer.from(original.rgba)};
    for(let y=0;y<height;y++) Buffer.from(rgba).copy(image.rgba,((region.y+y)*image.width+region.x)*4,y*width*4,(y+1)*width*4);
    writeFileSync(new URL('../assets/textures/'+data.sheets[region.sheet].file,import.meta.url),encodeTexturePng(image));
    images.set(region.sheet,image);
}
