import test from 'node:test';
import assert from 'node:assert/strict';
import {rasterizePdfAggressively,AggressiveRasterError,RASTER_PROFILES,installV3StreamIterator,V3OffscreenCanvasFactory}
 from '../assets/js/pdf-compressor-v3/aggressive-raster-core.mjs';

const input=new Uint8Array(2000).fill(64);
function fixture({pages=3,outputBytes=140,failPage=null,onRender=()=>{}}={}){
 const stats={active:0,peak:0,rendered:[],destroyed:0,taskDestroyed:0,boxes:[]};
 const pdfjs={getDocument:()=>({promise:Promise.resolve({numPages:pages,
   getPage:async n=>({getViewport:({scale})=>({width:612*scale,height:792*scale}),
     render(){stats.active++;stats.peak=Math.max(stats.peak,stats.active);
       stats.rendered.push(n);onRender(n);
       if(n===failPage)throw Error('fixture-render-error');
       return {promise:Promise.resolve().finally(()=>stats.active--)};},cleanup(){}}),
   destroy:async()=>{stats.destroyed++}}),
   destroy:async()=>{stats.taskDestroyed++}})};
 class Document {
   constructor(){this.pages=[];}
   async embedJpg(bytes){assert.equal(bytes[0],255);return bytes;}
   addPage(box){this.pages.push(box);stats.boxes.push(box);return {drawImage(){}};}
   async save(){return new Uint8Array(outputBytes).fill(37);}
   getPageCount(){return pages;}
   getPages(){return Array.from({length:pages},()=>({getMediaBox:()=>({width:612,height:792})}));}
 }
 const PDF={PDFDocument:{create:async()=>new Document(),load:async()=>new Document()}};
 const makeCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},fillStyle:null}),
   convertToBlob:async()=>new Blob([Uint8Array.from([255,216,1,2,255,217])],{type:'image/jpeg'})});
 return {pdfjs,PDF,makeCanvas,stats};
}
const run=(f,overrides={})=>rasterizePdfAggressively(input,{...f,
 consentToFlatten:true,inspectRestrictions:async()=>({allowed:true}),...overrides});
const isError=code=>error=>error instanceof AggressiveRasterError&&error.code===code;

test('requires consent and independent permission before rendering',async()=>{
 const f=fixture();
 await assert.rejects(rasterizePdfAggressively(input,{...f,
   inspectRestrictions:async()=>({allowed:true})}),isError('flatten-consent-required'));
 await assert.rejects(rasterizePdfAggressively(input,{...f,consentToFlatten:true}),
   isError('security-inspection-required'));
 await assert.rejects(run(f,{inspectRestrictions:async()=>({allowed:false,code:'signed-pdf'})}),
   isError('signed-pdf'));
 assert.deepEqual(f.stats.rendered,[]);
});
test('renders each page once, keeps geometry and outputs only independently reopened PDF',async()=>{
 const f=fixture(),events=[];
 const out=await run(f,{onProgress:stage=>events.push(stage)});
 assert.equal(out.status,'compressed');assert.equal(out.pages,3);
 assert.equal(out.bytes.length,140);assert.equal(out.mode,'maximum');
 assert.deepEqual(f.stats.rendered,[1,2,3]);assert.equal(f.stats.peak,1);
 assert.deepEqual(f.stats.boxes,[[612,792],[612,792],[612,792]]);
 assert.deepEqual(events.map(x=>x.completed),[1,2,3]);
 assert.ok(out.maxResidentPixels<=RASTER_PROFILES.maximum.maxPagePixels+20000);
 assert.ok(out.warnings.includes('selectable-text-removed'));
 assert.equal(f.stats.destroyed,1);assert.equal(f.stats.taskDestroyed,1);
});
test('discards expanded output, enforces byte budget and never falsely reports savings',async()=>{
 const f=fixture({outputBytes:input.length+1});
 const out=await run(f);assert.equal(out.status,'not-smaller');assert.equal(out.bytes,null);
 await assert.rejects(run(fixture({outputBytes:3000}),{maxOutputBytes:2200}),
   isError('output-budget'));
});
test('cancellation and rendering errors fail closed and release resources',async()=>{
 await assert.rejects(run(fixture(),{signal:AbortSignal.abort()}),isError('cancelled'));
 const f=fixture({failPage:2});
 await assert.rejects(run(f),isError('raster-processing-failed'));
 assert.deepEqual(f.stats.rendered,[1,2]);assert.equal(f.stats.destroyed,1);
});
test('mode settings progressively reduce resolution and JPEG quality',()=>{
 const {balanced,strong,maximum}=RASTER_PROFILES;
 assert.ok(balanced.dpi>strong.dpi&&strong.dpi>maximum.dpi);
 assert.ok(balanced.jpegQuality>strong.jpegQuality&&strong.jpegQuality>maximum.jpegQuality);
});

test('WebKit stream iterator shim preserves chunks and releases stream lock',async()=>{
 let released=false,read=0;
 class MinimalReadableStream{
  getReader(){return {read:async()=>{
    read++;return read===1?{done:false,value:Uint8Array.of(1,2,3)}:
      read===2?{done:false,value:Uint8Array.of(4,5)}:{done:true};
  },cancel:async()=>{},releaseLock(){released=true;}};}
 }
 const context={ReadableStream:MinimalReadableStream};
 assert.equal(installV3StreamIterator(context),true);
 assert.equal(installV3StreamIterator(context),true);
 const values=[];
 for await(const chunk of new MinimalReadableStream())values.push(...chunk);
 assert.deepEqual(values,[1,2,3,4,5]);
 assert.equal(released,true);
});

test('worker-owned input avoids duplicate full-file copy and retains exact input byte accounting',async()=>{
 const f=fixture();
 let handed=null;const original=f.pdfjs.getDocument;
 f.pdfjs.getDocument=options=>{handed=options.data;return original(options);};
 const owned=await run(f,{workerOwnsInput:true});
 assert.equal(handed,input,'a dedicated worker must pass owned source without a full copy');
 assert.equal(owned.inputBytes,input.length);
 const borrowed=await run(f,{workerOwnsInput:false});
 assert.notEqual(handed,input,'borrowed input must still be isolated by copying');
 assert.equal(borrowed.inputBytes,input.length);
});
test('page-count and wall-time budgets fail closed',async()=>{
 await assert.rejects(run(fixture({pages:5}),{maxPages:4}),isError('invalid-page-count'));
 await assert.rejects(run(fixture(),{maxRunMs:100}),isError('invalid-time-budget'));
});

test('dedicated-worker intermediate OffscreenCanvasFactory allocates and releases canvases',()=>{
 const original=globalThis.OffscreenCanvas;
 try{
  class Canvas{constructor(width,height){this.width=width;this.height=height;}getContext(type){return type==='2d'?{}:null;}}
  globalThis.OffscreenCanvas=Canvas;
  const factory=new V3OffscreenCanvasFactory();
  const entry=factory.create(120,80);
  assert.equal(entry.canvas.width,120);
  factory.reset(entry,64,32);
  assert.equal(entry.canvas.height,32);
  factory.destroy(entry);
  assert.equal(entry.canvas,null);
  assert.equal(entry.context,null);
  assert.throws(()=>factory.create(0,10),/invalid-intermediate-canvas/);
 }finally{globalThis.OffscreenCanvas=original;}
});
