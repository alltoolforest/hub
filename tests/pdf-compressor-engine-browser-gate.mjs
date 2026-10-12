// Independent browser-WASM lossless integration gate, CI experiment ONLY.
// The community package is installed only in disposable CI node_modules.
// Not a production binary or implementation permission.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {optimizeLosslessly} from '../assets/js/pdf-compressor-v2/lossless-core.mjs';
const N=PDF.PDFName.of;
function profile(bytes){
  return PDF.PDFDocument.load(bytes,{updateMetadata:false}).then(doc=>{
    const present=key=>Boolean(doc.catalog.get(N(key)));
    const fields=doc.getForm().getFields().map(f=>({
      name:f.getName(),value:f.getText?.()??null
    }));
    return {valid:true,signed:present('Perms'),encrypted:doc.isEncrypted,
      fingerprint:JSON.stringify({
        geometry:doc.getPages().map(p=>[p.getWidth(),p.getHeight(),p.getRotation().angle]),
        title:doc.getTitle(),author:doc.getAuthor(),subject:doc.getSubject(),
        fields,outline:present('Outlines'),attachments:present('AF'),
        names:present('Names'),tags:present('StructTreeRoot'),mark:present('MarkInfo')
      })};
  }).catch(()=>({valid:false}));
}
const contexts=[['chromium',chromium],['firefox',firefox],['webkit',webkit]];
const report=[];
for(const [name,engine] of contexts){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:8765/documents/pdf-compressor/');
    for(const id of ['scanned','image-heavy','mixed','form','bookmarks','attachment','tagged','digital']){
      const {bytes}=await buildFixture(id);
      const optimize=async input=>{
        const raw=await page.evaluate(async arr=>{
          const source=await import('/node_modules/qpdf-wasm-esm-embedded/qpdf.mjs');
          const module=await source.default({noInitialRun:true,print:()=>{},printErr:()=>{}});
          const a='/task-input.pdf',b='/task-output.pdf';
          module.FS.writeFile(a,new Uint8Array(arr));
          module.callMain(['--object-streams=generate','--compress-streams=y',
            '--recompress-flate','--compression-level=9',a,b]);
          return Array.from(module.FS.readFile(b));
        },Array.from(input));
        return new Uint8Array(raw);
      };
      const result=await optimizeLosslessly(bytes,{optimize,inspect:profile});
      assert.ok(result.outputBytes<=bytes.length);
      const checked=await profile(result.bytes);
      assert.equal(checked.fingerprint,(await profile(bytes)).fingerprint);
      report.push({browser:name,fixture:id,status:result.status,savedBytes:result.savedBytes});
      await page.reload();
    }
    const signed=await buildFixture('signed-marker');
    await assert.rejects(optimizeLosslessly(signed.bytes,{optimize:async()=>signed.bytes,
      inspect:profile}),e=>e.code==='restricted-pdf');
  }finally{await browser.close();}
}
assert.equal(report.length,24);
console.log(JSON.stringify({scope:'Task 3–5 dependency: experimental WASM lossless integration',
  productionApproved:false,report},null,2));
