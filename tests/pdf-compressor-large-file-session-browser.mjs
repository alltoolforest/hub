// Reproducible real-content stress fixtures through the File-owned session.
import {chromium} from 'playwright';
import {startManagedWorkerSampler} from './pdf-compressor-managed-worker-memory.mjs';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto((process.env.PDF_COMPRESSOR_TEST_ORIGIN??'http://127.0.0.1:8766')+'/');
 const stopSampler=await startManagedWorkerSampler(browser);
 const evidence=await page.evaluate(async({fixture,mode,privateData})=>{
  await import('/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');const PDF=globalThis.PDFLib,N=PDF.PDFName.of;
  let bytes;
  if(privateData){bytes=Uint8Array.from(atob(privateData),c=>c.charCodeAt(0));}
  else {
   const doc=await PDF.PDFDocument.create();
   if(fixture.startsWith('scan')){
    const storedDeflate=raw=>{
     const blocks=Math.ceil(raw.length/65535),out=new Uint8Array(raw.length+5*blocks+6);out.set([0x78,0x01]);let offset=2,a=1,b=0;
     for(let i=0;i<raw.length;i+=65535){const n=Math.min(65535,raw.length-i);out.set([i+n===raw.length?1:0,n&255,n>>8,(~n)&255,((~n)>>8)&255],offset);offset+=5;out.set(raw.subarray(i,i+n),offset);offset+=n;
      for(let j=i;j<i+n;j++){a=(a+raw[j])%65521;b=(b+a)%65521;}}
     const sum=((b<<16)|a)>>>0;out.set([sum>>>24,(sum>>>16)&255,(sum>>>8)&255,sum&255],offset);return out;
    };
    const font=fixture==='scan-mixed'?await doc.embedFont(PDF.StandardFonts.Helvetica):null;let seed=123456;
    for(let n=0;n<4;n++){
     const width=2500,height=3200,raw=new Uint8Array(width*height*3);
     for(let p=0;p<width*height;p++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=p%width,y=Math.floor(p/width),stroke=y%90>=20&&y%90<26&&x>100&&x<width-100&&x%120<90;const gray=(stroke?20:220)+(seed>>>28);raw[p*3]=raw[p*3+1]=raw[p*3+2]=gray;}
     const stream=doc.context.register(doc.context.stream(storedDeflate(raw),{Type:'XObject',Subtype:'Image',Width:width,Height:height,BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'FlateDecode'}));
     const page=doc.addPage([600,800]);page.node.set(N('Resources'),doc.context.obj({XObject:{Image:stream}}));page.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Image'),PDF.popGraphicsState());
     if(font)page.drawText('Native selectable text — page '+(n+1),{font,size:12,x:30,y:20});
    }
   }else{
    doc.addPage([600,800]);const names=[];
    for(let n=0;n<10;n++){const entropy=fixture==='entropy',data=new Uint8Array(entropy?9999600:9999670),row=new TextEncoder().encode(`timestamp,station,temperature,humidity\n2026-10-13,synthetic-station-${n},24.5,62\n`);let seed=123456+n;
     for(let i=0;i<data.length;i++){if(entropy){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed&255;}else data[i]=row[i%row.length];}
     const stream=doc.context.register(doc.context.stream(data,{Type:'EmbeddedFile',Subtype:entropy?'application/octet-stream':'text/csv'})),name=PDF.PDFString.of(`dataset-${n}.csv`),spec=doc.context.register(doc.context.obj({Type:'Filespec',F:name,EF:{F:stream}}));names.push(name,spec);
    }
    doc.catalog.set(N('Names'),doc.context.obj({EmbeddedFiles:{Names:names}}));
   }
   bytes=await doc.save({useObjectStreams:false});
  }
  const {createCompressionSession}=await import('/assets/js/pdf-compressor-v2/compression-session.mjs');
  const {createWorkerBridge}=await import('/assets/js/pdf-compressor-v2/worker-bridge.mjs');
  const {INPUT_LIMITS}=await import('/assets/js/pdf-compressor-v2/input-inspector.mjs');
  let started=0,terminated=0,ticks=0,last=performance.now(),maxGap=0;
  const timer=setInterval(()=>{const now=performance.now();ticks++;maxGap=Math.max(maxGap,now-last);last=now;},100);
  const engine=createWorkerBridge({fileInput:true,timeoutMs:180000,workerFactory:()=>{const worker=new Worker('/tests/pdf-compressor-task11-worker.mjs',{type:'module'}),end=worker.terminate.bind(worker);started++;worker.terminate=()=>{end();terminated++;};return worker;}});
  const session=createCompressionSession({engine,limits:INPUT_LIMITS});
  const file=new File([bytes],'synthetic.pdf',{type:'application/pdf'});bytes=null;const before=performance.now();
  try{
   await session.select(file);const inspected=session.snapshot();if(inspected.state!=='ready')throw Error(JSON.stringify(inspected));
   const inspectMs=Math.round(performance.now()-before),compressStart=performance.now();await session.compress(mode);const state=session.snapshot();
   if(state.state!=='completed')throw Error(JSON.stringify(state));const {url,name,...result}=state.result;
   return {fixture:privateData?'provided complex digital PDF':fixture,mode,inputBytes:file.size,inspectMs,compressMs:Math.round(performance.now()-compressStart),uiTicks:ticks,maxUiGapMs:Math.round(maxGap),workersStarted:started,workersTerminated:terminated,result};
  }finally{clearInterval(timer);session.dispose();}
 },{fixture:process.env.PDF_COMPRESSOR_LARGE_FIXTURE??'attachments',mode:process.env.PDF_COMPRESSOR_TEST_MODE??'balanced',privateData:process.env.PDF_COMPRESSOR_PRIVATE_SOURCE?readFileSync(process.env.PDF_COMPRESSOR_PRIVATE_SOURCE).toString('base64'):null});
 evidence.managedWorkerMemory=await stopSampler();
 assert.ok(evidence.result.outputBytes<=evidence.inputBytes);assert.equal(evidence.result.integrity.independentTextVerified,true);assert.equal(evidence.workersStarted,evidence.workersTerminated);
 if(evidence.fixture==='entropy'){assert.equal(evidence.result.savedBytes,0);assert.equal(evidence.result.integrity.sourceDigest,evidence.result.integrity.outputDigest);}
 console.log(JSON.stringify(evidence));if(process.env.PDF_COMPRESSOR_LARGE_EVIDENCE)writeFileSync(process.env.PDF_COMPRESSOR_LARGE_EVIDENCE,JSON.stringify(evidence,null,2));
}finally{await browser.close();}
