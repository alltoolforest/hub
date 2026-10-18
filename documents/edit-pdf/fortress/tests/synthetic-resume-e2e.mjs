import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
globalThis.PDFLib=require('../../../../assets/vendor/pdf-lib.js');

const { PDFDocument, StandardFonts, rgb }=await import('../src/core/pdf-lib.js');
const { loadPdfjs }=await import('../src/rendering/pdfjs.js');
const { buildLogicalBlocks }=await import('../src/text/text-blocks.js');
const { getPageContentStreams }=await import('../src/core/document-model.js');
const { mapBlocksToSources }=await import('../src/mapping/source-mapper.js');
const { createEditTransaction, createInsertTransaction }=await import('../src/editing/edit-transaction.js');
const { exportEditedPdf }=await import('../src/export/exporter.js');
const { extractPageText }=await import('../src/export/extraction-validator.js');

async function makeFixture(){
  const doc=await PDFDocument.create();
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize=[595,842];
  const pages=[doc.addPage(pageSize),doc.addPage(pageSize),doc.addPage(pageSize)];
  const draw=(page,text,x,y,{size=11,strong=false}={})=>page.drawText(text,{x,y,size,font:strong?bold:regular,color:rgb(0,0,0)});

  draw(pages[0],'E SAMPLE KUMAR',70,790,{size:16,strong:true});
  draw(pages[0],'E-Mail: sample@example.com',70,766);
  draw(pages[0],'Mobile: 9999999999',70,748);
  draw(pages[0],'WORK EXPERIENCE',70,710,{size:13,strong:true});
  draw(pages[0],'COMPANY NAME : ALPHA SERVICES',70,682,{strong:true});
  draw(pages[0],'TENURE : 2020 to 2022',70,662);
  draw(pages[0],'JOB DESCRIPTION:',70,642,{strong:true});
  draw(pages[0],'- First responsibility',90,620);
  draw(pages[0],'- Second responsibility',90,602);
  draw(pages[0],'- Third responsibility',90,584);
  draw(pages[0],'- Fourth responsibility',90,566);
  draw(pages[0],'- Fifth responsibility',90,548);
  draw(pages[0],'COMPANY NAME : BETA SERVICES',70,510,{strong:true});
  draw(pages[0],'TENURE : 2017 to 2020',70,490);
  draw(pages[0],'JOB DESCRIPTION:',70,470,{strong:true});
  draw(pages[0],'- Client support',90,448);
  draw(pages[0],'- Process improvement',90,430);

  draw(pages[1],'PREVIOUS COMPANY NAME : GAMMA SERVICES',70,790,{strong:true});
  draw(pages[1],'TENURE : 2 Years',70,770);
  draw(pages[1],'JOB DESCRIPTION:',70,750,{strong:true});
  draw(pages[1],'- Customer handling',90,728);
  draw(pages[1],'- Escalation support',90,710);
  draw(pages[1],'ROLES AND RESPONSIBILITIES:',70,680,{strong:true});
  draw(pages[1],'- Follow process rules',90,658);

  draw(pages[2],'EDUCATIONAL QUALIFICATION',70,790,{size:13,strong:true});
  draw(pages[2],'2021: Bachelor of Technology',70,765);
  draw(pages[2],'2012: Intermediate',70,747);
  draw(pages[2],'2010: S.S.C',70,729);
  draw(pages[2],'SKILLS',70,690,{size:13,strong:true});
  draw(pages[2],'- Communication',90,668);
  draw(pages[2],'- Hard working',90,650);
  draw(pages[2],'- Active performer',90,632);
  draw(pages[2],'- Integrity',90,614);
  draw(pages[2],'Personal Profile',70,430,{size:13,strong:true});
  draw(pages[2],'Name : E SAMPLE KUMAR',70,408);
  draw(pages[2],'Declaration',70,300,{size:13,strong:true});
  draw(pages[2],'Date: E SAMPLE KUMAR',70,278);

  return new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
}

async function visualBlocks(bytes,pdfDoc,pageIndex){
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    const page=await pdf.getPage(pageIndex+1);
    const tc=await page.getTextContent({disableNormalization:false});
    const blocks=buildLogicalBlocks(tc.items,{pageIndex,pageRotation:page.rotate||0});
    const streams=getPageContentStreams(pdfDoc,pageIndex);
    return mapBlocksToSources(pdfDoc,pageIndex,streams,blocks).blocks;
  }finally{
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}

function exactBlock(blocks,text){
  const target=blocks.find(block=>String(block.text||'').trim()===text);
  assert.ok(target,`Missing block: ${text}`);
  assert.ok(target.tier==='DIRECT_EDIT'||target.tier==='FONT_SUBSTITUTION',`Block is not editable: ${text} (${target.tier}/${target.reason})`);
  return target;
}

function replace(pageIndex,blocks,from,to){return createEditTransaction({pageIndex,block:exactBlock(blocks,from),replacementUnicode:to});}

const sourceBytes=await makeFixture();
const sourceDoc=await PDFDocument.load(sourceBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
const blocks=[];
for(let pageIndex=0;pageIndex<3;pageIndex++)blocks.push(await visualBlocks(sourceBytes,sourceDoc,pageIndex));

const transactions=[
  replace(0,blocks[0],'E SAMPLE KUMAR','ch. Vamshi'),
  replace(0,blocks[0],'E-Mail: sample@example.com','E-Mail: vamshichandragiri05@gmail.com'),
  replace(0,blocks[0],'Mobile: 9999999999','Mobile: 00000000'),
  replace(0,blocks[0],'WORK EXPERIENCE','PROFESSIONAL EXPERIENCE'),
  replace(0,blocks[0],'COMPANY NAME : ALPHA SERVICES','Organization'),
  replace(0,blocks[0],'TENURE : 2020 to 2022','EXPERIENCE DATES : 2020 to 2022'),
  replace(0,blocks[0],'JOB DESCRIPTION:','ROLE AND RESPONSIBILITIES'),
  replace(0,blocks[0],'- Fourth responsibility',''),
  replace(0,blocks[0],'- Fifth responsibility',''),
  replace(0,blocks[0],'COMPANY NAME : BETA SERVICES','Organization'),
  replace(0,blocks[0],'TENURE : 2017 to 2020','EXPERIENCE DATES : 2017 to 2020'),
  replace(1,blocks[1],'PREVIOUS COMPANY NAME : GAMMA SERVICES','Organization'),
  replace(1,blocks[1],'TENURE : 2 Years','EXPERIENCE DATES : 2 Years'),
  replace(1,blocks[1],'JOB DESCRIPTION:','ROLE AND RESPONSIBILITIES'),
  createInsertTransaction({pageIndex:2,text:'PG: Post Graduation\nPHD: Doctor of Philosophy',x:70,y:705,fontSize:10,maxWidth:300,reflowPlan:{enabled:false,reason:'EXISTING_WHITESPACE_SUFFICIENT'}}),
  createInsertTransaction({pageIndex:2,text:'Customer Support & Client Handling\nTechnical Troubleshooting\nCRM & Ticketing\nProcess Improvement\nProblem Solving',x:300,y:668,fontSize:10,maxWidth:240,reflowPlan:{enabled:false,reason:'EXISTING_WHITESPACE_SUFFICIENT'}}),
  replace(2,blocks[2],'Name : E SAMPLE KUMAR','Name : ch. Vamshi'),
  replace(2,blocks[2],'Date: E SAMPLE KUMAR','Date: ch. Vamshi'),
];

const result=await exportEditedPdf(sourceBytes,transactions,{validate:true});
assert.ok(result?.bytes?.length>0,'Export produced no bytes');
assert.equal(result.validation?.ok,true,'Final validation did not pass');
assert.equal(result.visualValidation?.ok,true,'Final visual validation did not pass');

const reopened=await PDFDocument.load(result.bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
assert.equal(reopened.getPageCount(),3,'Page count changed');

const pageTexts=[];
for(let pageIndex=0;pageIndex<3;pageIndex++)pageTexts.push(await extractPageText(result.bytes,pageIndex));
const all=pageTexts.join(' ');
for(const required of [
  'ch. Vamshi','vamshichandragiri05@gmail.com','00000000','PROFESSIONAL EXPERIENCE','Organization',
  'EXPERIENCE DATES','ROLE AND RESPONSIBILITIES','PG: Post Graduation','PHD: Doctor of Philosophy',
  'Customer Support & Client Handling','Technical Troubleshooting','CRM & Ticketing','Process Improvement','Problem Solving',
])assert.ok(all.includes(required),`Missing exported text: ${required}`);
for(const removed of ['E SAMPLE KUMAR','sample@example.com','9999999999','WORK EXPERIENCE','ALPHA SERVICES','BETA SERVICES','GAMMA SERVICES','- Fourth responsibility','- Fifth responsibility'])assert.ok(!all.includes(removed),`Removed source text still extracts: ${removed}`);
for(const kept of ['- First responsibility','- Second responsibility','- Third responsibility'])assert.ok(all.includes(kept),`Required retained bullet missing: ${kept}`);

console.log('PASS 1/1');
console.log('✓ privacy-safe 3-page resume survives replacement, repeated deletion/compaction, additions, save, reopen, extraction, and visual validation');
