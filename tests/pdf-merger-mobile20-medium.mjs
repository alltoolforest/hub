// 20 actual image-heavy PDFs (~4.5MB each), 400 pages, real PDF-lib verification.
// This is a CI machine stress benchmark, not proof for every physical phone.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {preparePdfBatch} from '../assets/js/pdf-merger-input.js';
import {verifiedMerge} from '../assets/js/pdf-merger-verify.js';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const MB=1024*1024,start=performance.now();
function chunk(name,body){
 const tag=Buffer.from(name,'ascii'),out=Buffer.allocUnsafe(12+body.length);
 out.writeUInt32BE(body.length,0);tag.copy(out,4);body.copy(out,8);
 let crc=0xffffffff;
 for(let i=4;i<8+body.length;i++){
  crc^=out[i];
  for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 out.writeUInt32BE((crc^0xffffffff)>>>0,8+body.length);
 return out;
}
function noisyImage(){
 const width=1240,height=1240;
 const scan=Buffer.allocUnsafe(height*(1+width*3));
 let seed=0x5b3a71c9;
 for(let y=0;y<height;y++){
  let k=y*(width*3+1);scan[k++]=0;
  for(let x=0;x<width*3;x++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   scan[k++]=seed>>>24;
  }
 }
 const ihdr=Buffer.alloc(13);
 ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
 ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan,{level:1})),chunk('IEND',Buffer.alloc(0))
 ]);
}
const png=noisyImage();
const originals=[];
let combinedBytes=0;
for(let i=0;i<20;i++){
 const doc=await lib.PDFDocument.create();
 const embedded=await doc.embedPng(png);
 for(let p=0;p<20;p++){
  const pg=doc.addPage([350+i*6,520+p]);
  if(p===0)pg.drawImage(embedded,{x:16,y:16,width:300,height:470});
  if(p===1)pg.setRotation(lib.degrees(90));
 }
 const bytes=new Uint8Array(await doc.save());
 const name='medium-'+(i+1)+'.pdf';
 combinedBytes+=bytes.length;
 originals.push({
  name,size:bytes.length,lastModified:i+1,
  slice:(a,b)=>({arrayBuffer:async()=>bytes.slice(a,b).buffer}),
  arrayBuffer:async()=>bytes.slice().buffer
 });
}
assert.ok(combinedBytes>=75*MB,'Real-image fixture is too small to represent a medium batch: '+Math.round(combinedBytes/MB)+'MB');
assert.ok(combinedBytes<=200*MB,'Fixtures exceeded intended resource envelope.');
const admissionStart=performance.now();
const prepared=await preparePdfBatch([],originals,{isMobile:true,
 loadPdf:bytes=>lib.PDFDocument.load(bytes,{updateMetadata:false})
});
assert.equal(prepared.entries.length,20);
assert.equal(prepared.totalPages,400);
const mergeStart=performance.now();
const result=await verifiedMerge(prepared.entries,lib,{isMobile:true});
assert.equal(result.pageCount,400);
const merged=await lib.PDFDocument.load(await result.blob.arrayBuffer());
assert.equal(merged.getPageCount(),400);
for(let i=0;i<20;i++){
 const p=merged.getPage(i*20);
 assert.equal(Math.round(p.getWidth()),350+i*6);
 assert.equal(merged.getPage(i*20+1).getRotation().angle,90);
 // The first page must still contain the embedded visual image.
 const xobjects=p.node.Resources()?.lookup(lib.PDFName.of('XObject'),lib.PDFDict);
 assert.ok(xobjects?.keys().length>0,'Missing source image in document '+i);
}
const seconds=(performance.now()-start)/1000;
const rss=Math.round(process.memoryUsage().rss/MB);
assert.ok(seconds<240,'Image-heavy merge exceeded four-minute CI budget: '+seconds+'s');
assert.ok(rss<2100,'Image-heavy merge exceeded 2.1GB RSS CI budget: '+rss+'MB');
console.log('PDF_MERGER_MOBILE20_MEDIUM_PASS: 20 PDFs, 400 pages, '+Math.round(combinedBytes/MB)+' MB source, '+Math.round(result.byteLength/MB)+' MB output, '+seconds.toFixed(1)+'s total, '+rss+' MB CI process RSS, admission '+((mergeStart-admissionStart)/1000).toFixed(1)+'s.');
