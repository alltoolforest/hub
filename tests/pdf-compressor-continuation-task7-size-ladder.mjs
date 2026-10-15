// Task 7: real-content synthetic 10/20/50 MB valid PDFs through the same
// independently verified worker used for near-100 MB probes. Not phone evidence.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const targetMB=Number(process.env.PDF_COMPRESSOR_TASK7_MB);
if(![10,20,50].includes(targetMB))throw Error('Size ladder must select 10, 20 or 50 MB');
const mode=({10:'lossless',20:'strong',50:'maximum'})[targetMB];
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const requests=[];
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin==='http://127.0.0.1:8766'&&request.method()==='GET')return route.continue();
  requests.push({url:request.url(),method:request.method()});return route.abort();
 });
 await page.goto('http://127.0.0.1:8766/');
 const results=await page.evaluate(async ({targetMB,mode})=>{
  await import('/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
  const PDF=globalThis.PDFLib,doc=await PDF.PDFDocument.create(),N=PDF.PDFName.of;
  const page=doc.addPage([600,800]);
  page.drawText('AllToolForest synthetic '+targetMB+' MB regression file',{x:35,y:650});
  const named=[];
  for(let i=0;i<targetMB/10;i++){
   const block=new Uint8Array(9_999_600);
   const text=new TextEncoder().encode('date,location,reading\\n2026-10-15,sample-'+i+',123.45\\n');
   for(let j=0;j<block.length;j++)block[j]=text[j%text.length];
   const stream=doc.context.register(doc.context.stream(block,{Type:'EmbeddedFile',
     Subtype:'text/csv'}));
   const filename=PDF.PDFString.of('synthetic-'+i+'.csv');
   const spec=doc.context.register(doc.context.obj({Type:'Filespec',F:filename,EF:{F:stream}}));
   named.push(filename,spec);
  }
  doc.catalog.set(N('Names'),doc.context.obj({EmbeddedFiles:{Names:named}}));
  const input=new Uint8Array(await doc.save({useObjectStreams:false}));
  const inputBytes=input.length;
  const sourceDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input)),
     b=>b.toString(16).padStart(2,'0')).join('');
  const worker=new Worker('/tests/pdf-compressor-100mb-experimental-worker.mjs',{type:'module'});
  const start=performance.now(),deadline=180000;
  try{
   const reply=await new Promise(resolve=>{
    const timeout=setTimeout(()=>resolve({ok:false,code:'timeout'}),deadline);
    worker.onerror=error=>{clearTimeout(timeout);resolve({ok:false,code:'worker-error',message:error.message});};
    worker.onmessage=event=>{
     if(typeof event.data?.ok!=='boolean')return;
     clearTimeout(timeout);resolve(event.data);
    };
    worker.postMessage({bytes:input,mode},[input.buffer]);
   });
   if(!reply.ok)return {task:7,targetMB,mode,inputBytes,ok:false,
      failure:reply.code,elapsedMs:Math.round(performance.now()-start)};
   const output=reply.result?.bytes;
   if(!(output instanceof Uint8Array))throw Error('Output must be byte array');
   const result=reply.result;
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',output)),
     b=>b.toString(16).padStart(2,'0')).join('');
   return {task:7,targetMB,mode,inputBytes,outputBytes:output.length,
     savedBytes:result.savedBytes,elapsedMs:Math.round(performance.now()-start),
     ok:true,sourceDigest,outputDigest:digest,receipt:result.integrity,
     status:result.status,stageTimings:result.stageTimings};
  }finally{worker.terminate();}
 },{targetMB,mode});
 assert.equal(results.ok,true,JSON.stringify(results).slice(0,2000));
 assert.ok(results.inputBytes>=targetMB*1e6-10000&&results.inputBytes<=targetMB*1e6+10000);
 assert.ok(results.outputBytes<=results.inputBytes);
 assert.equal(results.savedBytes,results.inputBytes-results.outputBytes);
 assert.equal(results.receipt.sourceDigest,results.sourceDigest);
 assert.equal(results.receipt.outputDigest,results.outputDigest);
 assert.equal(results.receipt.independentTextVerified,true);
 assert.equal(results.receipt.inputBytes,results.inputBytes);
 assert.equal(results.receipt.outputBytes,results.outputBytes);
 assert.equal(results.receipt.savedBytes,results.savedBytes);
 assert.deepEqual(requests,[],'no PDF bytes may be sent to a network service');
 const {receipt,...record}=results;
 record.independentTextVerified=receipt.independentTextVerified;
 record.hashesMatch=true;
 record.requestsOutsideLocalGet=0;
 record.fixture='synthetic actual embedded CSV file streams; not physical scans';
 console.log(JSON.stringify(record));
 if(process.env.PDF_COMPRESSOR_TASK7_EVIDENCE)
  writeFileSync(process.env.PDF_COMPRESSOR_TASK7_EVIDENCE,JSON.stringify(record,null,2));
}finally{await browser.close();}
