import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {nativeDraft, validateNativeDraft, sourceDigest} from '../documents/document-editor-v2-lab/pdf-engine/fortress/src/workspace/native-draft.js';

test('PDF draft serialization drops parser references, clones intent and binds source bytes', async () => {
  const digest=await sourceDigest(new Uint8Array([1,2,3]));
  const tx={id:'a',kind:'INSERT_TEXT',pageIndex:0,replacementUnicode:'Hello',x:1,y:2,fontSize:12,lineHeight:14,maxWidth:100,reflowPlan:{shift:2},block:{unsafe:'parser'}};
  const draft=nativeDraft([tx],digest,0,1);
  tx.reflowPlan.shift=9;
  assert.equal(draft.transactions[0].reflowPlan.shift,2);
  assert.equal(draft.transactions[0].block,undefined);
  assert.deepEqual(validateNativeDraft(draft,digest,1),draft);
  assert.throws(()=>validateNativeDraft(draft,'other-source',1),/match/);
  assert.throws(()=>validateNativeDraft({...draft,transactions:[...draft.transactions,...draft.transactions]},digest,1),/Duplicate/);
  assert.throws(()=>validateNativeDraft({...draft,pageIndex:1},digest,1),/invalid/);
});

test('native edit survives JSON recovery into a fresh engine and failed restore retains current edits', async () => {
  const dom=new JSDOM('<div id="first"></div><div id="second"></div>',{url:'https://example.invalid/'});
  for(const key of ['window','document','Option','HTMLElement'])globalThis[key]=dom.window[key];
  globalThis.innerHeight=900;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
  const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
  const {PDFDocument,StandardFonts}=await import(base+'core/pdf-lib.js');
  const {PdfRenderer}=await import(base+'rendering/renderer.js');
  const originalRender=PdfRenderer.prototype.render;
  PdfRenderer.prototype.render=async function(index,canvas,{scale=1}={}){
    const page=await this.getPage(index),viewport=page.getViewport({scale});
    return {viewport,matrix:[...viewport.transform],cssWidth:viewport.width,cssHeight:viewport.height};
  };
  const {createAdvancedPdfTextEngine}=await import(base+'main.js');
  const {extractPageText}=await import(base+'export/extraction-validator.js');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612,792]).drawText('Original sample text',{x:60,y:700,size:12,font});
  const bytes=await pdf.save({useObjectStreams:false});
  let status='';
  const first=createAdvancedPdfTextEngine({container:document.querySelector('#first'),onStatus:value=>status=value});
  const second=createAdvancedPdfTextEngine({container:document.querySelector('#second')});
  try{
    await first.open(bytes);
    document.querySelector('#first [aria-label="Edit text: Original sample text"]').click();
    document.querySelector('#first [aria-label="Edit PDF text"]').value='Updated sample text';
    assert.throws(()=>first.snapshot(),/Finish/);
    document.querySelector('#first .pdf-done').click();
    for(let attempt=0;attempt<200&&!status.includes('Edit applied');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(status,/Edit applied/);
    const draft=JSON.parse(JSON.stringify(first.snapshot()));
    first.destroy();
    await second.open(bytes);
    await second.restore(draft);
    let result=await second.save();
    assert.match(await extractPageText(result.bytes,0),/Updated sample text/);
    assert.equal(second.snapshot().transactions.length,1);
    const bad=structuredClone(draft);bad.transactions[0].originalUnicode='Different source text';
    await assert.rejects(()=>second.restore(bad),/no longer matches/);
    await assert.rejects(()=>second.restore({...draft,source:'wrong'}),/does not match/);
    result=await second.save();
    assert.match(await extractPageText(result.bytes,0),/Updated sample text/);
    const empty={...draft,transactions:[]};await second.restore(empty);
    result=await second.save();assert.match(await extractPageText(result.bytes,0),/Original sample text/);
  }finally{first.destroy();second.destroy();PdfRenderer.prototype.render=originalRender;dom.window.close();}
});
