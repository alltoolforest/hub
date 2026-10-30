import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
const {PDFDocument,PDFName,PDFString}=await import(base+'core/pdf-lib.js');
const {detectDocumentFlags}=await import(base+'core/document-model.js');
const {applyDocumentSafety}=await import(base+'core/classifier.js');
const {formFingerprint,verifyFormPreservation}=await import(base+'core/form-protection.js');
async function fixture(){const doc=await PDFDocument.create();const page=doc.addPage([612,792]);page.drawText('Ordinary text outside the field',{x:40,y:700,size:12});const form=doc.getForm(),field=form.createTextField('Customer');field.setText('Keep this value');field.addToPage(page,{x:40,y:100,width:200,height:30});return doc;}
test('form-region classification unlocks ordinary text while protecting widgets and uncertain forms',async()=>{
 const doc=await fixture(),flags=detectDocumentFlags(doc);assert.equal(flags.formSafetyKnown,true);assert.equal(flags.formWidgets.length,1);
 const blocks=[{id:'ordinary',tier:'DIRECT_EDIT',confidence:1,bounds:{x:40,y:690,width:160,height:14}},{id:'field',tier:'DIRECT_EDIT',confidence:1,bounds:{x:50,y:105,width:100,height:12}}];
 assert.deepEqual(applyDocumentSafety(blocks,flags,{pageIndex:0}).map(b=>b.tier),['DIRECT_EDIT','LIMITED_EDIT']);
 for(const overrides of [{signed:true},{encrypted:true}])assert.ok(applyDocumentSafety(blocks,{...flags,...overrides},{pageIndex:0}).every(b=>b.tier==='LOCKED'));
 doc.getForm().acroForm.dict.set(PDFName.of('XFA'),PDFString.of('unsupported'));assert.equal(detectDocumentFlags(doc).formSafetyKnown,false);assert.ok(applyDocumentSafety(blocks,detectDocumentFlags(doc),{pageIndex:0}).every(b=>b.tier==='LIMITED_EDIT'));
});
test('form preservation compares field values, widget geometry and appearance streams',async()=>{
 const doc=await fixture(),original=new Uint8Array(await doc.save({useObjectStreams:false,updateFieldAppearances:false}));
 const same=await PDFDocument.load(original);same.getPage(0).drawText('Safe ordinary insertion',{x:40,y:650,size:12});
 await verifyFormPreservation(original,new Uint8Array(await same.save({updateFieldAppearances:false})));
 for(const change of ['value','rectangle','appearance']){
  const edited=await PDFDocument.load(original),field=edited.getForm().getTextField('Customer');
  if(change==='value')field.setText('Changed value');
  if(change==='rectangle')field.acroField.getWidgets()[0].setRectangle({x:10,y:10,width:200,height:30});
  if(change==='appearance')field.updateAppearances(await edited.embedFont('Courier'));
  const output=new Uint8Array(await edited.save({updateFieldAppearances:false}));
  await assert.rejects(verifyFormPreservation(original,output),/form fields or appearances/);
 }
 assert.equal(formFingerprint(await PDFDocument.load(original)),formFingerprint(await PDFDocument.load(original)));
});
test('signature fields retain exact-byte protection at final export',async()=>{
 const doc=await fixture();doc.getForm().getTextField('Customer').acroField.dict.set(PDFName.of('FT'),PDFName.of('Sig'));
 const original=new Uint8Array(await doc.save({updateFieldAppearances:false}));
 await verifyFormPreservation(original,original.slice());
 const edited=await PDFDocument.load(original);edited.getPage(0).drawText('Must not invalidate signature',{x:40,y:600,size:12});
 await assert.rejects(verifyFormPreservation(original,new Uint8Array(await edited.save({updateFieldAppearances:false}))),/Signed PDFs/);
});
test('export independently rejects new text over a form widget',async()=>{
 const {exportEditedPdf}=await import(base+'export/exporter.js');
 const doc=await fixture(),source=new Uint8Array(await doc.save({useObjectStreams:false,updateFieldAppearances:false}));
 const tx={id:'overlay',kind:'INSERT_TEXT',pageIndex:0,replacementUnicode:'Overlay',x:50,y:118,fontSize:12,maxWidth:150};
 await assert.rejects(exportEditedPdf(source,[tx],{preview:true}),error=>error.code==='PDF_FORM_REGION_PROTECTED');
});

test('same-page compaction preserves stationary widgets, moves whole widgets and rejects split widgets',async()=>{
 const{applyUpwardCompaction}=await import(base+'export/upward-compaction-v3.js');
 for(const y of [245,100,170]){const doc=await PDFDocument.create(),page=doc.addPage([300,300]);for(const[text,baseline]of [['Header',280],['Following first line',160],['Following second line',140],['Following third line',120]])page.drawText(text,{x:40,y:baseline,size:12});const field=doc.getForm().createTextField('Keep');field.setText('Value');field.addToPage(page,{x:40,y,width:180,height:20});const original=new Uint8Array(await doc.save({updateFieldAppearances:false})),tx={id:'delete',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'Deleted line',replacementUnicode:'',block:{text:'Deleted line',bounds:{x:40,y:177,width:110,height:13},fontSize:12,lines:[{y:180,fontSize:12}]}};
 if(y===245){const result=await applyUpwardCompaction({bytes:original,reflowMetrics:[]},[tx]);assert.equal(result.upwardCompactionCount,1);await verifyFormPreservation(original,result.bytes);const output=await PDFDocument.load(result.bytes);assert.equal(output.getForm().getTextField('Keep').getText(),'Value');assert.equal(output.getForm().getTextField('Keep').acroField.getWidgets()[0].getRectangle().y,244.5);}else if(y===100){const result=await applyUpwardCompaction({bytes:original,reflowMetrics:[]},[tx]);await verifyFormPreservation(original,result.bytes,{reflowMetrics:result.reflowMetrics});const output=await PDFDocument.load(result.bytes);assert.equal(output.getForm().getTextField('Keep').acroField.getWidgets()[0].getRectangle().y,99.5+result.reflowMetrics[0].shiftY);await assert.rejects(verifyFormPreservation(original,result.bytes),/form fields/);}else await assert.rejects(applyUpwardCompaction({bytes:original,reflowMetrics:[]},[tx]),e=>e.code==='FORM_WIDGET_REFLOW_PROTECTED');
 }
});
