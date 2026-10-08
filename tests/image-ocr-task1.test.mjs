import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 SOURCE_LIMITS,checkImageDimensions,recognitionSize,imageHeaderDimensions,validateImageFile,
 networkFriendlyError,withinTime,createWorkerSafely,withOcrWorker,recognizeSafely
} from '../assets/js/image-ocr-reliability.js';

const imageUI=readFileSync(new URL('../assets/js/image-to-text-ocr.js',import.meta.url),'utf8');
const pdf=readFileSync(new URL('../assets/js/pdf.js',import.meta.url),'utf8');

test('source dimensions and encoded-pixel budgets reject memory-risk images',()=>{
 assert.deepEqual(checkImageDimensions(4000,3000,true),{width:4000,height:3000});
 assert.equal(SOURCE_LIMITS.recognition,3_000_000);
 for(const [w,h] of [[0,50],[50,0],[-1,1],[1.25,10],[16385,1],[5000,5000],[NaN,10]])
  assert.throws(()=>checkImageDimensions(w,h,true),/too large/);
 assert.deepEqual(checkImageDimensions(5000,5000,false),{width:5000,height:5000});
 assert.throws(()=>checkImageDimensions(7000,5000,false),/too large/);
});

test('OCR canvas dimensions remain bounded without increasing input size',()=>{
 assert.deepEqual(recognitionSize(1200,750),{width:1200,height:750});
 const r=recognitionSize(6000,4000);
 assert.ok(r.width*r.height<=3_002_000);
 assert.ok(r.width<6000&&r.height<4000);
 assert.throws(()=>recognitionSize(0,90),/invalid/);
});

test('PNG header is verified and dimensions are obtained before decode',async()=>{
 const png=new Uint8Array(24);
 png.set([137,80,78,71,13,10,26,10],0);png.set([73,72,68,82],12);
 const v=new DataView(png.buffer);v.setUint32(16,8000);v.setUint32(20,5000);
 assert.deepEqual(imageHeaderDimensions(png,'png'),{width:8000,height:5000});
 assert.throws(()=>imageHeaderDimensions(new Uint8Array([1,2,3]),'png'),/invalid header/);
 const f={slice:()=>({arrayBuffer:async()=>png.buffer})};
 await assert.rejects(()=>validateImageFile(f,'png',true),/too large/);
});

test('JPEG SOF0 header preflight and invalid masquerading file detection',()=>{
 const jpeg=new Uint8Array([255,216,255,192,0,17,8,0,100,0,200,3,1,17,0,2,17,0,3,17,0,255,217]);
 assert.deepEqual(imageHeaderDimensions(jpeg,'jpg'),{width:200,height:100});
 assert.deepEqual(imageHeaderDimensions(jpeg,'jpeg'),{width:200,height:100});
 assert.throws(()=>imageHeaderDimensions(new Uint8Array([1,2,3,4]),'jpeg'),/invalid header/);
 assert.equal(imageHeaderDimensions(new Uint8Array([255,216,255,217]),'jpeg'),null);
});

test('valid source preflight is non-destructive',async()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10],0);
 png.set([73,72,68,82],12);
 const v=new DataView(png.buffer);v.setUint32(16,128);v.setUint32(20,64);
 const f={slice:()=>({arrayBuffer:async()=>png.buffer})};
 assert.deepEqual(await validateImageFile(f,'png',true),{width:128,height:64});
});

test('successful worker execution terminates the worker exactly once',async()=>{
 let closes=0;
 const result=await withOcrWorker(async()=>({
  recognize:async()=>({data:{text:'hello'}}),
  terminate:async()=>{closes++}
 }),async w=>(await w.recognize()).data.text);
 assert.equal(result,'hello');assert.equal(closes,1);
});

test('recognition rejection still terminates the worker and preserves its error',async()=>{
 let closes=0;
 await assert.rejects(()=>withOcrWorker(async()=>({
  recognize:async()=>{throw Error('recognition failed')},
  terminate:async()=>{closes++}
 }),async w=>w.recognize()),/recognition failed/);
 assert.equal(closes,1);
});

test('failed worker initialization skips recognition safely',async()=>{
 let used=false;
 await assert.rejects(()=>withOcrWorker(async()=>{throw Error('network fail')},async()=>{used=true}),/network fail/);
 assert.equal(used,false);
});

test('invalid worker returned by initializer is terminated when possible',async()=>{
 let closes=0;
 await assert.rejects(()=>createWorkerSafely(async()=>({
  terminate:async()=>{closes++}
 })),/invalid worker/);
 assert.equal(closes,1);
});

test('expired initialization terminates any worker that arrives late',async()=>{
 let closes=0;
 await assert.rejects(()=>createWorkerSafely(()=>new Promise(resolve=>setTimeout(()=>resolve({
  recognize:async()=>({data:{text:'late'}}),
  terminate:async()=>{closes++}
 }),15)),3),/initialization timed out/);
 await new Promise(resolve=>setTimeout(resolve,35));
 assert.equal(closes,1);
});

test('no unhandled timeout after fast operations',async()=>{
 assert.equal(await withinTime(async()=>42,100,'test'),42);
 await assert.rejects(()=>withinTime(()=>new Promise(()=>{}),3,'OCR recognition'),/OCR recognition timed out/);
});

test('image recognition cleans canvas after success and uses bounded dimensions',async()=>{
 let canvas=null,drawCalls=0;
 const result=await recognizeSafely({recognize:async c=>{
  assert.equal(c.width,100);assert.equal(c.height,80);
  return {data:{text:'123 ABC'}};
 }},{width:100,height:80},(width,height)=>{
  canvas={width,height,getContext:()=>({drawImage(){drawCalls++}})};
  return canvas;
 });
 assert.equal(result,'123 ABC');
 assert.equal(drawCalls,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});

test('recognition errors, missing context and timeout all release canvases',async()=>{
 const factories=[];
 const make=(w,h,ctx={drawImage(){}})=>{const c={width:w,height:h,getContext:()=>ctx};factories.push(c);return c;};
 await assert.rejects(()=>recognizeSafely({recognize:async()=>{throw Error('bad model')}},{width:60,height:30},make),/bad model/);
 await assert.rejects(()=>recognizeSafely({recognize:async()=>{}},{width:60,height:30},(w,h)=>make(w,h,null)),/unavailable/);
 await assert.rejects(()=>recognizeSafely({recognize:()=>new Promise(()=>{})},{width:60,height:30},make,{deadlineMs:3}),/timed out/);
 for(const c of factories){assert.equal(c.width,0);assert.equal(c.height,0);}
});

test('malformed OCR output fails closed',async()=>{
 await assert.rejects(()=>recognizeSafely({recognize:async()=>({data:{text:null}})},{width:60,height:30},
  (w,h)=>({width:w,height:h,getContext:()=>({drawImage(){}})})),/valid recognized text/);
});

test('engine errors provide actionable retries without exposing source data',()=>{
 assert.match(networkFriendlyError(Error('Failed to fetch')).message,/connection and retry/);
 assert.match(networkFriendlyError(Error('OCR recognition timed out.')).message,/timed out/);
 assert.match(networkFriendlyError(Error('traineddata missing')).message,/language data/);
 const err=Error('Original OCR rejection');
 assert.equal(networkFriendlyError(err),err);
});

test('Image OCR routes independently; scanned PDF and PDF editors keep previous implementation',()=>{
 assert.match(pdf,/if\(slug==='image-to-text'\)return \(await import\('\.\/image-to-text-ocr\.js'\)\)\.mount\(root\);/);
 assert.match(pdf,/if\(\['image-to-text','scanned-pdf-to-text'\]\.includes\(slug\)\)return mountOCR\(root,slug\);/);
 assert.match(pdf,/if\(slug==='edit-pdf'\)return mountEditor\(root\)/);
});

test('recognition commits only on success and preserves edited text during failure',()=>{
 assert.match(imageUI,/text\.readOnly=true/);
 assert.match(imageUI,/progressActive=false;text\.readOnly=false;/);
 assert.match(imageUI,/if\(!recognized\.trim\(\)\)throw Error\(/);
 const sourceIdx=imageUI.indexOf('const {blob');
 const recognitionIdx=imageUI.indexOf("if(!recognized.trim())throw Error");
 const clearIdx=imageUI.indexOf('clearOutputs();',recognitionIdx);
 const commitIdx=imageUI.indexOf('text.value=recognized',recognitionIdx);
 assert.ok(recognitionIdx>=0&&clearIdx>recognitionIdx&&commitIdx>clearIdx);
 assert.doesNotMatch(imageUI.slice(imageUI.indexOf("recognize.addEventListener('click'"),recognitionIdx),/text\.value\s*=\s*['"]{2}/);
 assert.match(imageUI,/if\(decoded!==image\)decoded\?\.close\?\.\(\)/);
 assert.match(imageUI,/window\.addEventListener\('pagehide'/);
});
