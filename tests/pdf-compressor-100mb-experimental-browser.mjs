// Experimental target-size probe. Does not enable advertised 100 MB support.
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8766/');
  const evidence=await page.evaluate(async ({mode,entropy})=>{
    await import('/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
    const PDF=globalThis.PDFLib,doc=await PDF.PDFDocument.create(),N=PDF.PDFName.of;
    doc.addPage([600,800]);const names=[];
    for(let i=0;i<10;i++){
      const data=new Uint8Array(entropy?9999600:9999670);
      // Real embedded datasets, not bytes appended after PDF EOF.
      const row=new TextEncoder().encode(`timestamp,station,temperature,humidity\n2026-10-13,synthetic-station-${i},24.5,62\n`);
      let seed=123456+i;
      for(let j=0;j<data.length;j++){
        if(entropy){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[j]=seed&255;}
        else data[j]=row[j%row.length];
      }
      const stream=doc.context.register(doc.context.stream(data,{Type:'EmbeddedFile',Subtype:entropy?'application/octet-stream':'text/csv'}));
      const name=PDF.PDFString.of(`dataset-${i}.${entropy?'bin':'csv'}`);
      const spec=doc.context.register(doc.context.obj({Type:'Filespec',F:name,EF:{F:stream}}));
      names.push(name,spec);
    }
    doc.catalog.set(N('Names'),doc.context.obj({EmbeddedFiles:{Names:names}}));
    const bytes=new Uint8Array(await doc.save({useObjectStreams:false})),started=performance.now(),inputBytes=bytes.length;
    let ticks=0;const timer=setInterval(()=>ticks++,100);
    const worker=new Worker('/tests/pdf-compressor-100mb-experimental-worker.mjs',{type:'module'});
    try{
      const response=await new Promise(resolve=>{
        const timeout=setTimeout(()=>resolve({ok:false,code:'probe-timeout'}),180000);
        worker.onerror=e=>{clearTimeout(timeout);resolve({ok:false,code:'worker-error',message:e.message});};
        worker.onmessage=e=>{if(typeof e.data?.ok!=='boolean')return;clearTimeout(timeout);resolve(e.data);};
        worker.postMessage({bytes,mode},[bytes.buffer]);
      });
      const {bytes:output,...result}=response.result??{};
      return {fixture:entropy?'ten distinct high-entropy binary attachments near 100 MB':'ten distinct embedded CSV datasets near 100 MB',inputBytes,
        wallMs:Math.round(performance.now()-started),uiTicks:ticks,...response,result,
        outputBytes:output?.length};
    }finally{worker.terminate();clearInterval(timer);}
  },{mode:process.env.PDF_COMPRESSOR_TEST_MODE??'lossless',entropy:process.env.PDF_COMPRESSOR_TEST_ENTROPY==='1'});
  // Keep only measurements/receipt; never serialize the large output buffer.
  console.log(JSON.stringify(evidence));
  if(process.env.PDF_COMPRESSOR_100MB_EVIDENCE)
    writeFileSync(process.env.PDF_COMPRESSOR_100MB_EVIDENCE,JSON.stringify(evidence,null,2));
  assert.ok(evidence.inputBytes>=99000000&&evidence.inputBytes<=100000000);
  assert.equal(evidence.ok,true,JSON.stringify(evidence));
  assert.ok(evidence.outputBytes<=evidence.inputBytes);
  assert.equal(evidence.result.integrity.independentTextVerified,true);
}finally{await browser.close();}
