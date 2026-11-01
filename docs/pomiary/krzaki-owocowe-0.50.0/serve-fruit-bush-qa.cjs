const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const baseline=process.argv.includes('--baseline'),port=baseline?63517:63516;
const root=path.join(__dirname,baseline?'voxel-fruit-baseline':'voxel-fruit-bushes');
const proof=path.join(__dirname,'voxel-fruit-bush-proof');fs.mkdirSync(proof,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.png':'image/png','.ogg':'audio/ogg','.jpg':'image/jpeg','.webm':'video/webm'};
http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname);
  if(pathname==='/qa-report'||pathname==='/qa-image'){
    if(req.method!=='POST'||req.headers.origin!==`http://127.0.0.1:${port}`){res.writeHead(403).end();return;}
    const name=url.searchParams.get('name')||'result';if(!/^[a-z0-9-]+$/.test(name)){res.writeHead(400).end();return;}
    const chunks=[];let bytes=0;req.on('data',b=>{bytes+=b.length;if(bytes>10000000)req.destroy();else chunks.push(b);});
    req.on('end',()=>{const b=Buffer.concat(chunks);try{if(pathname==='/qa-report')JSON.parse(b);fs.writeFileSync(path.join(proof,`${baseline?'before':'after'}-${name}.${pathname==='/qa-report'?'json':'png'}`),b);res.writeHead(200).end('OK');}catch{res.writeHead(400).end();}});return;
  }
  if(pathname==='/fruit-bush-qa.js'){res.writeHead(200,{'Content-Type':mime['.js'],'Cache-Control':'no-store'}).end(fs.readFileSync(path.join(__dirname,'fruit-bush-qa.js')));return;}
  const rel=pathname==='/'?'/index.html':pathname,target=path.resolve(root,'.'+rel);
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  let data=fs.readFileSync(target);if(rel==='/index.html')data=data.toString().replace('./src/main.js','/fruit-bush-qa.js');
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log(`Fruit QA ${baseline?'baseline':'new'} ${port}`));
