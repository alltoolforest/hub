// True browser smoke of experimental v3 raster core. All content synthetic.
// No change to the current route; no user files or PDF bytes uploaded to CI.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const root=resolve(import.meta.dirname,'..');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.pdf':'application/pdf'};
const server=createServer((req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.writeHead(200,{'content-type':'text/html'});
    res.end('<!doctype html><html><script src="/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js"></script><body>v3 isolated raster test</body></html>');return;}
  const full=resolve(root,'.'+pathname);
  if(!(full.startsWith(root+sep)&&!pathname.includes('..')))throw Error('bad path');
  res.writeHead(200,{'content-type':mime[extname(full)]??'application/octet-stream',
    'x-content-type-options':'nosniff'});res.end(readFileSync(full));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,origin='http://127.0.0.1:'+port;
const fixture=await PDF.PDFDocument.create();
for(let p=0;p<3;p++){
 const page=fixture.addPage([612,792]);page.drawRectangle({x:28,y:20,width:500,height:45,
   color:PDF.rgb(0.25+p*0.2,0.5,0.3)});
 page.drawText('AllToolForest v3 synthetic page '+(p+1),{x:35,y:700,size:24});
}
const source=new Uint8Array(await fixture.save());
let failed=0;
try{
 for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage(),errors=[],blocked=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    if(!route.request().url().startsWith(origin+'/')){blocked.push(route.request().url());return route.abort();}
    return route.continue();
   });
   await page.goto(origin+'/');
   const outcome=await page.evaluate(async source=>{
    const {rasterizePdfAggressively,installV3StreamIterator}=await import('/assets/js/pdf-compressor-v3/aggressive-raster-core.mjs');
    if(!installV3StreamIterator())throw Error('No browser stream reader available');
    const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
    const events=[];
    const result=await rasterizePdfAggressively(new Uint8Array(source),{
      pdfjs,PDF:globalThis.PDFLib,consentToFlatten:true,mode:'maximum',
      inspectRestrictions:async()=>({allowed:true}),requireSavings:false,
      onProgress:value=>events.push(value)});
    const decodedTask=pdfjs.getDocument({data:result.bytes.slice()});
    const decoded=await decodedTask.promise;
    if(decoded.numPages!==3)throw Error('PDF.js output page count changed');
    const pg=await decoded.getPage(1),vp=pg.getViewport({scale:0.5});
    const canvas=new OffscreenCanvas(Math.ceil(vp.width),Math.ceil(vp.height));
    await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    const parsed=await pg.getTextContent();
    const resultInfo={status:result.status,size:result.outputBytes,
      pages:result.pages,pageRenderWidth:vp.width,events:events.length,
      selectableTextAfterRaster:parsed.items.length,
      initialDpi:78,warning:result.warnings.includes('selectable-text-removed')};
    await decodedTask.destroy();
    return {info:resultInfo,bytes:Array.from(result.bytes)};
   },Array.from(source));
   assert.equal(outcome.info.status,'compressed');
   assert.equal(outcome.info.pages,3);assert.equal(outcome.info.events,3);
   assert.equal(outcome.info.selectableTextAfterRaster,0,'destructive output must disclose lost text');
   assert.equal(outcome.info.warning,true);
   const output=new Uint8Array(outcome.bytes);
   assert.equal((await PDF.PDFDocument.load(output)).getPageCount(),3);
   // Non-flattening JPEG path: exercise actual browser image transcoding AND
   // the v2 independent graph/page verification that protects page text, forms,
   // annotations and all non-image streams. No unverified candidate download.
   const nonflat=await page.evaluate(async()=>{
     const {recompressJpegXObjects}=await import('/assets/js/pdf-compressor-v3/nonflatten-jpeg-recode.mjs');
     const {createImageOutputVerifier}=await import('/assets/js/pdf-compressor-v2/image-output-verifier.mjs');
     const {createIndependentInputReader}=await import('/assets/js/pdf-compressor-v2/independent-input-reader.mjs');
     const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
     pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
     const PDF=globalThis.PDFLib;
     const canvas=new OffscreenCanvas(1400,1000),ctx=canvas.getContext('2d');
     const colors=ctx.createImageData(1400,1000),values=colors.data;
     let seed=1234567;
     for(let i=0;i<values.length;i+=4){
       seed=(Math.imul(seed,1664525)+1013904223)>>>0;
       values[i]=seed&255;values[i+1]=(seed>>>8)&255;
       values[i+2]=(seed>>>16)&255;values[i+3]=255;
     }
     ctx.putImageData(colors,0,0);
     const jpeg=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality:0.98})).arrayBuffer());
     const srcDoc=await PDF.PDFDocument.create();
     const page=srcDoc.addPage([612,792]);
     page.drawText('Important searchable text must remain selectable',{x:22,y:720,size:18});
     const embedded=await srcDoc.embedJpg(jpeg);
     page.drawImage(embedded,{x:20,y:100,width:560,height:500});
     const original=new Uint8Array(await srcDoc.save());
     const verifyJpeg=async({bytes,width,height})=>{
       const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
       try{return image.width===width&&image.height===height;}
       finally{image.close();}
     };
     const verifyOutput=createImageOutputVerifier({PDF,readPages:createIndependentInputReader(pdfjs),verifyJpeg});
     const result=await recompressJpegXObjects(original,{PDF,mode:'maximum',
       inspectRestrictions:async()=>({allowed:true}),verifyOutput});
     if(result.status!=='compressed')return {status:result.status};
     const origTask=pdfjs.getDocument({data:original.slice()}),outTask=pdfjs.getDocument({data:result.bytes.slice()});
     const orig=await origTask.promise,out=await outTask.promise;
     const sourceText=(await (await orig.getPage(1)).getTextContent()).items.map(x=>x.str).join('');
     const outputText=(await (await out.getPage(1)).getTextContent()).items.map(x=>x.str).join('');
     await origTask.destroy();await outTask.destroy();
     return {status:result.status,pages:result.pageCount,replacements:result.replacements.length,
       saved:original.length-result.bytes.length,sourceText,outputText};
   });
   assert.equal(nonflat.status,'compressed','non-flattening JPEG candidate must reduce actual bytes');
   assert.ok(nonflat.saved>50000,'large real JPEG must have significant savings');
   assert.ok(nonflat.replacements>=1);
   assert.equal(nonflat.pages,1);
   assert.equal(nonflat.outputText,nonflat.sourceText,'nonflatten output must keep selectable text');
   assert.deepEqual(errors,[],'browser console must remain clean');
   assert.deepEqual(blocked,[],'no outgoing upload/external requests');
   console.log(JSON.stringify({browser:name,...outcome.info,inputBytes:source.length}));
   await page.close();
  }catch(e){failed++;console.error(name,e);throw e;}
  finally{await browser.close();}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
if(failed)process.exitCode=1;
