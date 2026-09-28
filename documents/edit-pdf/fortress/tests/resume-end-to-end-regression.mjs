import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
globalThis.PDFLib=require('../../../../assets/vendor/pdf-lib.js');

const {PDFDocument,StandardFonts}=await import('../src/core/pdf-lib.js');
const {loadPdfForEditing}=await import('../src/core/pdf-loader.js');
const {DocumentModel,getPageContentStreams}=await import('../src/core/document-model.js');
const {PdfRenderer}=await import('../src/rendering/renderer.js');
const {extractVisualText}=await import('../src/rendering/text-layer.js');
const {buildLogicalBlocks}=await import('../src/text/text-blocks.js');
const {mapBlocksToSources}=await import('../src/mapping/source-mapper.js');
const {createEditTransaction,createInsertTransaction}=await import('../src/editing/edit-transaction.js');
const {exportEditedPdf}=await import('../src/export/exporter.js');
const {loadPdfjs}=await import('../src/rendering/pdfjs.js');

function norm(value){return String(value||'').replace(/\s+/g,' ').trim();}
function exact(blocks,text){
  const target=norm(text);
  const block=(blocks||[]).find(item=>norm(item?.text)===target);
  assert.ok(block,`Missing mapped block: ${text}`);
  assert.ok(block.tier==='DIRECT_EDIT'||block.tier==='FONT_SUBSTITUTION',`Block is not editable: ${text} (${block.tier}/${block.reason})`);
  return block;
}

async function createFixture(){
  const doc=await PDFDocument.create();
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const draw=(page,text,x,y,{font=regular,size=11}={})=>page.drawText(text,{x,y,size,font});

  const p1=doc.addPage([595,842]);
  draw(p1,'E SAI KUMAR',72,790,{font:bold,size:15});
  draw(p1,'WORK EXPERIENCE',72,748,{font:bold,size:12});
  draw(p1,'COMPANY NAME : TECH MAHINDRA',72,718,{font:bold,size:10});
  draw(p1,'Bullet one',90,680);
  draw(p1,'Bullet two',90,660);
  draw(p1,'Bullet three',90,640);
  draw(p1,'Bullet four',90,620);
  draw(p1,'NEXT SECTION',72,580,{font:bold,size:11});
  draw(p1,'Following content remains intact.',72,558);

  const p2=doc.addPage([595,842]);
  draw(p2,'EDUCATIONAL QUALIFICATION',72,760,{font:bold,size:12});
  draw(p2,'Bachelor of Technology',72,730);
  draw(p2,'SKILLS',72,690,{font:bold,size:12});
  draw(p2,'Communication',72,665);
  draw(p2,'Personal Profile',72,430,{font:bold,size:12});
  draw(p2,'Name : E SAI KUMAR',72,405);
  draw(p2,'Declaration',72,350,{font:bold,size:12});
  return new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
}

async function mapPage(pdfDoc,renderer,pageIndex){
  const pageInfo=await renderer.pageInfo(pageIndex);
  const visual=await extractVisualText(renderer,pageIndex);
  const blocks=buildLogicalBlocks(visual.items,{pageIndex,pageRotation:pageInfo.rotation});
  return mapBlocksToSources(pdfDoc,pageIndex,getPageContentStreams(pdfDoc,pageIndex),blocks).blocks;
}

async function extractAll(bytes){
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  const pages=[];
  try{
    for(let i=1;i<=pdf.numPages;i++){
      const tc=await (await pdf.getPage(i)).getTextContent();
      pages.push(tc.items.map(item=>item.str||'').join(' '));
    }
    return {pageCount:pdf.numPages,text:norm(pages.join(' '))};
  }finally{
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}

const source=await createFixture();
const loaded=await loadPdfForEditing(source);
const model=new DocumentModel(loaded.pdfDoc);
assert.equal(model.pdfDoc.getPageCount(),2);
const renderer=new PdfRenderer(source);
await renderer.load();

const page1=await mapPage(loaded.pdfDoc,renderer,0);
const page2=await mapPage(loaded.pdfDoc,renderer,1);
const edits=[];

edits.push(createEditTransaction({pageIndex:0,block:exact(page1,'E SAI KUMAR'),replacementUnicode:'ch. Vamshi'}));
edits.push(createEditTransaction({pageIndex:0,block:exact(page1,'WORK EXPERIENCE'),replacementUnicode:'PROFESSIONAL EXPERIENCE'}));
edits.push(createEditTransaction({pageIndex:0,block:exact(page1,'COMPANY NAME : TECH MAHINDRA'),replacementUnicode:'Organization'}));
edits.push(createEditTransaction({pageIndex:0,block:exact(page1,'Bullet four'),replacementUnicode:''}));
edits.push(createEditTransaction({pageIndex:1,block:exact(page2,'Name : E SAI KUMAR'),replacementUnicode:'Name : ch. Vamshi'}));

edits.push(createInsertTransaction({
  pageIndex:1,
  text:'PG: Post Graduation\nPHD: Doctor of Philosophy\nCustomer Support & Client Handling\nTechnical Troubleshooting\nCRM & Ticketing\nProcess Improvement\nProblem Solving',
  x:72,y:625,fontSize:10,lineHeight:16,maxWidth:360,fontFamily:'sans',
  reflowPlan:{enabled:false,reason:'SYNTHETIC_SAFE_WHITESPACE'},
}));

const result=await exportEditedPdf(source,edits,{validate:true});
assert.ok(result?.bytes?.length>0,'Expected exported PDF bytes.');
assert.ok(result?.validation?.ok!==false,'Expected export validation to pass.');

const reopened=await extractAll(result.bytes);
assert.equal(reopened.pageCount,2,'Page count changed unexpectedly.');
for(const required of [
  'ch. Vamshi','PROFESSIONAL EXPERIENCE','Organization','Bullet one','Bullet two','Bullet three','NEXT SECTION',
  'PG: Post Graduation','PHD: Doctor of Philosophy','Customer Support & Client Handling','Technical Troubleshooting','CRM & Ticketing','Process Improvement','Problem Solving','Name : ch. Vamshi','Declaration',
])assert.ok(reopened.text.includes(required),`Missing expected output text: ${required}`);

for(const removed of ['E SAI KUMAR','WORK EXPERIENCE','TECH MAHINDRA','Bullet four']){
  assert.ok(!reopened.text.includes(removed),`Removed source text is still extractable: ${removed}`);
}

assert.equal(norm((await extractAll(source)).text).includes('E SAI KUMAR'),true,'Source fixture was unexpectedly altered.');
renderer.destroy();

console.log('PASS 10/10');
console.log('✓ synthetic resume mapped through the real source mapper');
console.log('✓ repeated identity replacement exported and reopened');
console.log('✓ long heading replacement exported');
console.log('✓ employer replacement exported');
console.log('✓ semantic bullet deletion removed live PDF text');
console.log('✓ following content survived deletion compaction');
console.log('✓ multiline education/skills insertion exported');
console.log('✓ page count remained stable');
console.log('✓ removed source strings are absent after reopen');
console.log('✓ original input bytes remain logically unchanged');
