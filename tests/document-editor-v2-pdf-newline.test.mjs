import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
const {PDFDocument}=await import(base+'core/pdf-lib.js');
const {exportEditedPdf}=await import(base+'export/exporter-core.js');
test('paragraph relocation cannot bypass deletion verification using an absent or mismatched paired insertion',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,300]);const bytes=await doc.save({useObjectStreams:false});
 const clear={id:'clear',kind:'REPLACE_TEXT',pageIndex:0,blockId:'body',replacementUnicode:'',expandedInsertId:'draw'};
 const insert={id:'draw',kind:'INSERT_TEXT',pageIndex:0,expandedFromBlockId:'body',replacementUnicode:'Retained declaration',x:20,y:200};
 for(const transactions of [[clear],[clear,{...insert,expandedFromBlockId:'other'}],[clear,{...insert,pageIndex:1}],[clear,{...insert,replacementUnicode:''}],[{...clear,replacementUnicode:'changed'},insert]]){
  await assert.rejects(exportEditedPdf(bytes,transactions),error=>error.code==='INVALID_EXPANDED_PARAGRAPH');
 }
});
test('Word page clipping paths do not count as painted graphics, while fills and strokes remain protected',async()=>{
 const {collectGraphicsBounds,graphicCrossesFlowBoundary}=await import(base+'export/graphics-flow-guard.js');
 const O={constructPath:91,endPath:28,fill:22,stroke:20,eoClip:30};
 const ops={fnArray:[O.eoClip,O.constructPath,O.constructPath,O.constructPath],argsArray:[null,[O.endPath,[],[0,0,595,842]],[O.fill,[],[50,500,550,520]],[O.stroke,[],[50,300,550,300]]]};
 const r=collectGraphicsBounds(ops,O);assert.equal(r.ok,true);assert.equal(r.boxes.length,2);assert.deepEqual(r.boxes[0],[50,500,550,520]);
 const geometry={bandLeft:30,bandRight:570,boundaries:[70,320]};assert.equal(r.boxes.some(b=>graphicCrossesFlowBoundary(b,geometry)),false);
 assert.equal(graphicCrossesFlowBoundary([50,300,550,340],geometry),true,'a painted object crossing the actual cut stays guarded');
});
