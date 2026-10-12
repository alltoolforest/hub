// Task 2 research ONLY: trial third-party qpdf WASM inside disposable CI
// browsers. Package lives only in CI node_modules; NOT production/repository.
// Candidate failure is reported, not hidden or transformed into a success.
import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
const BASE=process.env.PDF_COMPRESSOR_BASE_URL||'http://127.0.0.1:8765/';
const trials=[
  ['chromium-desktop',chromium,{width:1280,height:800}],
  ['chromium-mobile-viewport',chromium,{width:360,height:780}],
  ['firefox-desktop',firefox,{width:1280,height:800}],
  ['webkit-mobile-viewport',webkit,{width:390,height:844}]
];
const results=[];
for(const [browserName,browserType,viewport] of trials){
  const browser=await browserType.launch({headless:true});
  const page=await browser.newPage({viewport});
  try{
    await page.goto(new URL('documents/pdf-compressor/',BASE).href);
    for(const id of ['digital','scanned','image-heavy','mixed','form',
      'bookmarks','attachment','tagged','signed-marker']){
      // Reclaim the prior WASM module and heap between independent trials.
      await page.goto(new URL('documents/pdf-compressor/',BASE).href);
      const fixture=await buildFixture(id);
      let sample;
      try{
        sample=await page.evaluate(async bytes=>{
          const time=performance.now();
          const source=await import('/node_modules/qpdf-wasm-esm-embedded/qpdf.mjs');
          const QPDF=source.default;
          if(typeof QPDF!=='function')throw Error('qpdf WASM ESM default factory missing');
          const errors=[];
          const m=await QPDF({noInitialRun:true,
            print:()=>{},printErr:line=>errors.push(String(line))});
          if(!m.FS||typeof m.callMain!=='function')throw Error('qpdf wasm FS/callMain missing');
          m.FS.writeFile('/atf-task2-input.pdf',new Uint8Array(bytes));
          const input='/atf-task2-input.pdf',output='/atf-task2-output.pdf';
          m.callMain(['--object-streams=generate','--compress-streams=y',
            '--recompress-flate','--compression-level=9',input,output]);
          const saved=m.FS.readFile(output);
          return {status:'processed',saved:Array.from(saved),wasmElapsedMs:performance.now()-time,
            diagnostics:errors.slice(0,5)};
        },Array.from(fixture.bytes));
      }catch(e){
        results.push({browser:browserName,fixture:id,status:'unsupported-candidate',
          reason:String(e?.message||e).slice(0,340)});
        continue;
      }
      const loaded=await PDF.PDFDocument.load(new Uint8Array(sample.saved),{updateMetadata:false});
      const original=await PDF.PDFDocument.load(fixture.bytes,{updateMetadata:false});
      const guarded={
        pageCount:loaded.getPageCount()===original.getPageCount(),
        title:loaded.getTitle()===original.getTitle(),
        author:loaded.getAuthor()===original.getAuthor(),
        names:!!loaded.catalog.get(PDF.PDFName.of('Names'))===
          !!original.catalog.get(PDF.PDFName.of('Names')),
        attachments:!!loaded.catalog.get(PDF.PDFName.of('AF'))===
          !!original.catalog.get(PDF.PDFName.of('AF')),
        outlines:!!loaded.catalog.get(PDF.PDFName.of('Outlines'))===
          !!original.catalog.get(PDF.PDFName.of('Outlines')),
        tags:!!loaded.catalog.get(PDF.PDFName.of('StructTreeRoot'))===
          !!original.catalog.get(PDF.PDFName.of('StructTreeRoot')),
        markInfo:!!loaded.catalog.get(PDF.PDFName.of('MarkInfo'))===
          !!original.catalog.get(PDF.PDFName.of('MarkInfo')),
        signatureMarker:!!loaded.catalog.get(PDF.PDFName.of('Perms'))===
          !!original.catalog.get(PDF.PDFName.of('Perms')),
        formFields:JSON.stringify(loaded.getForm().getFields().map(f=>f.getName()))===
          JSON.stringify(original.getForm().getFields().map(f=>f.getName()))
      };
      results.push({browser:browserName,fixture:id,status:'processed',
        originalBytes:fixture.bytes.length,outputBytes:sample.saved.length,
        reductionPct:Number((100*(1-sample.saved.length/fixture.bytes.length)).toFixed(2)),
        elapsedMs:Number(sample.wasmElapsedMs.toFixed(1)),
        invariants:guarded,allMeasuredInvariantsKept:Object.values(guarded).every(Boolean),
        note:'Research-only small synthetic samples; not a browser release approval'});
    }
  }finally{await browser.close();}
}
console.log('PDF_COMPRESSOR_TASK2_WASM_TRIAL_JSON_START');
console.log(JSON.stringify({package:'qpdf-wasm-esm-embedded@1.1.1',
  context:'Experimental, not a production dependency',results},null,2));
console.log('PDF_COMPRESSOR_TASK2_WASM_TRIAL_JSON_END');
// A candidate is assessed as workable ONLY if a valid document is produced
// with all basic structural invariants; this harness does not assert success
// since an unsupported candidate should be disqualified rather than
// forcing a risky workaround in Tasks 3+.
assert.equal(results.length,trials.length*9,'Candidate corpus is incomplete');
for(const row of results){
  assert.equal(row.status,'processed',row.browser+'/'+row.fixture+': '+row.reason);
  assert.equal(row.allMeasuredInvariantsKept,true,
    row.browser+'/'+row.fixture+' lost a measured document feature');
}
