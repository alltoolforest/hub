// TASK 2 RESEARCH BENCHMARK ONLY. Never imported by production UI.
// Compare document-level preservation and actual bytes/time for the frozen
// Task 1 synthetic corpus. qpdf, when installed, is a CLI reference only:
// running native qpdf does NOT establish qpdf-WASM browser compatibility.
// Run: node tests/pdf-compressor-task2-benchmark.mjs
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixtureCases,buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
const N=PDF.PDFName.of;
const qpdfPath=process.env.QPDF_BIN||'qpdf';
const qpdfAvailable=spawnSync(qpdfPath,['--version'],{encoding:'utf8'}).status===0;
const qpdfVersion=qpdfAvailable?
  (spawnSync(qpdfPath,['--version'],{encoding:'utf8'}).stdout||'').split('\n')[0]:null;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const presence=(doc,key)=>Boolean(doc.catalog.get(N(key)));
function profile(doc){
  const fieldNames=doc.getForm().getFields().map(f=>f.getName()).sort();
  const fieldValues=doc.getForm().getFields().map(f=>{
    try{return f.getText?.()??null;}catch{return 'unavailable';}
  });
  return {
    pages:doc.getPageCount(),
    sizes:doc.getPages().map(p=>[p.getWidth(),p.getHeight(),p.getRotation().angle]),
    title:doc.getTitle()||null,
    author:doc.getAuthor()||null,
    subject:doc.getSubject()||null,
    fields:fieldNames,values:fieldValues,
    names:presence(doc,'Names'),associatedFiles:presence(doc,'AF'),
    outlines:presence(doc,'Outlines'),tags:presence(doc,'StructTreeRoot'),
    markInfo:presence(doc,'MarkInfo'),signatureMarker:presence(doc,'Perms')
  };
}
async function variant(bytes,method){
  if(method==='legacy-copy'){
    const source=await PDF.PDFDocument.load(bytes),dest=await PDF.PDFDocument.create();
    for(const page of await dest.copyPages(source,source.getPageIndices()))dest.addPage(page);
    return new Uint8Array(await dest.save({useObjectStreams:true}));
  }
  if(method==='in-place-object-streams'||method==='in-place-classic'){
    // Reference baseline only. Even if /Perms persists, cryptographic
    // signatures can be invalidated by reserialization.
    const source=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
    return new Uint8Array(await source.save({
      useObjectStreams:method==='in-place-object-streams',updateFieldAppearances:false
    }));
  }
  if(method==='qpdf-cli'){
    const dir=mkdtempSync(join(tmpdir(),'atf-compressor-task2-'));
    try{
      const input=join(dir,'input.pdf'),output=join(dir,'output.pdf');
      writeFileSync(input,bytes);
      const args=['--object-streams=generate','--compress-streams=y',
        '--recompress-flate','--compression-level=9',input,output];
      const result=spawnSync(qpdfPath,args,{encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
      if(result.status!==0)throw Error('qpdf CLI status '+result.status+': '+String(result.stderr||'').slice(0,260));
      return new Uint8Array(readFileSync(output));
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
  throw Error('Unknown reference candidate: '+method);
}
const methods=['legacy-copy','in-place-object-streams','in-place-classic'];
if(qpdfAvailable)methods.push('qpdf-cli');
const rows=[];
for(const item of fixtureCases.filter(x=>x.pages>0)){
  const {bytes}=await buildFixture(item.id);
  const expected=profile(await PDF.PDFDocument.load(bytes,{updateMetadata:false}));
  for(const method of methods){
    // Warm-up once for pdf-lib variants. Report one measured trial (not
    // statistically representative; avoid claiming real-device performance).
    let output,elapsedMs=null,peakRssKiB=null,error=null,actual=null;
    const before=process.memoryUsage().rss;
    const start=performance.now();
    try{
      output=await variant(bytes,method);
      elapsedMs=Number((performance.now()-start).toFixed(2));
      peakRssKiB=Math.max(0,Math.round((process.memoryUsage().rss-before)/1024));
      actual=profile(await PDF.PDFDocument.load(output,{updateMetadata:false}));
    }catch(e){error=String(e?.message||e).slice(0,260);}
    const altered=actual?Object.keys(expected).filter(k=>
      JSON.stringify(expected[k])!==JSON.stringify(actual[k])):null;
    rows.push({
      fixture:item.id,method,sourceBytes:bytes.length,outputBytes:output?.length??null,
      changePct:output?Number(((output.length/bytes.length-1)*100).toFixed(2)):null,
      elapsedMs,observedRssDeltaKiB:peakRssKiB,
      parsed:Boolean(actual),preserved:altered?.length===0,
      alteredFields:altered??[],error,
      outputSha256:output?sha256(output):null
    });
  }
}
const qpdfStatus=qpdfAvailable?'reference benchmark available':'native reference unavailable; qpdf omitted';
const report={
  task:'PDF Compressor v1.0 — Task 2 feasibility only',
  source:'Task 1 reproducible synthetic fixture corpus',
  qpdfStatus,qpdfVersion,methods,
  environment:{node:process.version,platform:process.platform,arch:process.arch},
  measurementCautions:[
    'One measured run per candidate; timings and rss deltas are approximate, not production performance guarantees.',
    'Synthetic fixtures, not independent real-world PDFs.',
    'Native qpdf CLI results do not validate browser WASM builds.',
    'Presence/field-value checks are necessary but insufficient for comprehensive PDF conformance.',
    'Signing marker is not cryptographically signed; every rewriting method must be considered unsafe for signed PDFs until specifically verified.'
  ],rows
};
console.log('PDF_COMPRESSOR_TASK2_BENCHMARK_JSON_START');
console.log(JSON.stringify(report,null,2));
console.log('PDF_COMPRESSOR_TASK2_BENCHMARK_JSON_END');
assert.equal(rows.length,fixtureCases.filter(x=>x.pages>0).length*methods.length);
assert.ok(rows.every(x=>x.sourceBytes>0));
for(const x of rows.filter(r=>r.method==='legacy-copy')){
  // A negative-control test: the selected architecture must improve on
  // documented legacy silent document losses; no defect is "fixed" here.
  if(['form','attachment','bookmarks','tagged','signed-marker'].includes(x.fixture))
    assert.equal(x.preserved,false,'Legacy loss was unexpectedly hidden for '+x.fixture);
}
for(const x of rows.filter(r=>r.method==='in-place-object-streams')){
  // Feasibility gate: reference serialization should preserve the measured
  // synthetic structure fingerprint. Do not interpret this as full fidelity.
  assert.equal(x.error,null,'In-place feasibility failed on '+x.fixture+': '+x.error);
  assert.equal(x.preserved,true,'In-place reference changed '+x.fixture+': '+x.alteredFields.join(','));
}
