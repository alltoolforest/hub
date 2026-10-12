// Task 4 native qpdf reference only; not a browser adapter or deployed engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {optimizeLosslessly} from '../assets/js/pdf-compressor-v2/lossless-core.mjs';
const N=PDF.PDFName.of;
const qpdf=spawnSync('qpdf',['--version'],{encoding:'utf8'});
const available=qpdf.status===0;
async function inspect(bytes){
  try{
    const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
    const marker=k=>Boolean(doc.catalog.get(N(k)));
    const fields=doc.getForm().getFields().map(f=>[f.getName(),f.getText?.()??null]);
    return {valid:true,signed:marker('Perms'),encrypted:doc.isEncrypted,
      fingerprint:JSON.stringify({
        pages:doc.getPages().map(p=>[p.getWidth(),p.getHeight(),p.getRotation().angle]),
        title:doc.getTitle(),author:doc.getAuthor(),subject:doc.getSubject(),
        fields,bookmarks:marker('Outlines'),tags:marker('StructTreeRoot'),
        markInfo:marker('MarkInfo'),names:marker('Names'),AF:marker('AF')
      })};
  }catch{return {valid:false};}
}
async function optimize(bytes){
  const dir=mkdtempSync(join(tmpdir(),'atf-task4-'));
  try{
    const a=join(dir,'in.pdf'),b=join(dir,'out.pdf');
    writeFileSync(a,bytes);
    const result=spawnSync('qpdf',['--object-streams=generate','--compress-streams=y',
      '--recompress-flate','--compression-level=9',a,b],{timeout:20000});
    if(result.status!==0)throw Error('native qpdf failed');
    return new Uint8Array(readFileSync(b));
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('Task 4 native lossless synthetic verification', {skip:!available},async()=>{
  for(const id of ['digital','scanned','image-heavy','mixed','form','bookmarks','attachment','tagged']){
    const {bytes}=await buildFixture(id);
    const result=await optimizeLosslessly(bytes,{optimize,inspect});
    assert.ok(result.outputBytes<=result.inputBytes,id);
    assert.ok(['compressed','original-retained'].includes(result.status),id);
    if(result.status==='compressed')assert.ok(result.savedBytes>0);
    console.log(JSON.stringify({id,status:result.status,input:result.inputBytes,
      output:result.outputBytes,saved:result.savedBytes}));
  }
  const signed=await buildFixture('signed-marker');
  await assert.rejects(optimizeLosslessly(signed.bytes,{optimize,inspect}),
    error=>error.code==='restricted-pdf');
  const invalid=await buildFixture('invalid');
  await assert.rejects(optimizeLosslessly(invalid.bytes,{optimize,inspect}),
    error=>error.code==='invalid-pdf');
});
