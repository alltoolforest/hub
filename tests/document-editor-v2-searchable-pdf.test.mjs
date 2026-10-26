import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const base='../documents/document-editor-v2-lab/pdf-engine/';
const {PDFDocument}=await import(base+'fortress/src/core/pdf-lib.js');
const {addSearchableText}=await import(base+'ocr/searchable-text.js');
const {extractPageText}=await import(base+'fortress/src/export/extraction-validator.js');
for(const transform of [[1,0,0,-1,0,300],[0,1,1,0,0,0],[-1,0,0,1,300,0],[0,-1,-1,0,300,300]]){
  test(`searchable OCR text extracts after export for transform ${transform}`,async()=>{
    const doc=await PDFDocument.create(),page=doc.addPage([300,300]);
    await addSearchableText(doc,page,{viewportTransform:transform,words:[{text:'Reviewed text',bbox:{x0:20,y0:20,x1:180,y1:40}}]});
    assert.equal((await extractPageText(await doc.save(),0)).trim(),'Reviewed text');
  });
}
test('Unicode OCR text, including supplementary characters, extracts exactly',async()=>{
  for(const text of ['తెలుగు','नमस्ते','café Ελληνικά','😀 rocket 🚀']){
    const doc=await PDFDocument.create(),page=doc.addPage([300,300]);
    await addSearchableText(doc,page,{viewportTransform:[1,0,0,-1,0,300],words:[{text,bbox:{x0:20,y0:20,x1:180,y1:40}}]});
    assert.equal((await extractPageText(await doc.save(),0)).trim(),text);
  }
});
test('malformed Unicode is refused before creating a searchable layer',async()=>{
  const doc=await PDFDocument.create(),page=doc.addPage([300,300]);
  await assert.rejects(()=>addSearchableText(doc,page,{viewportTransform:[1,0,0,-1,0,300],words:[{text:'bad\ud800',bbox:{x0:20,y0:20,x1:180,y1:40}}]}),/malformed Unicode/);
});

test('searchable text retains font-chunk boundaries and phrases after viewer whitespace normalization',async()=>{
  for(const text of ['Keep  two spaces; a+b = 3.',Array.from({length:270},(_,i)=>String.fromCodePoint(0x400+i)).join('')]){
    const doc=await PDFDocument.create(),page=doc.addPage([1000,300]);
    await addSearchableText(doc,page,{viewportTransform:[1,0,0,-1,0,300],words:[{text,bbox:{x0:20,y0:20,x1:980,y1:40}}]});
    assert.equal((await extractPageText(await doc.save(),0)).trim(),text.replace(/\s+/g,' '));
  }
});
