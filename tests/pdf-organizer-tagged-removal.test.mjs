// Organize PDF Pages — tagged PDF preservation and opt-in untagged fallback.
// Uses the same vendored pdf-lib as the browser exporter, never shared tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/vendor/pdf-lib.js');
const engine=readFileSync(new URL('../assets/js/pdf-organizer-integrity.js',import.meta.url),'utf8');
const {initialPlan,buildOrganizedPdf}=await import(
  'data:text/javascript;base64,'+Buffer.from(engine).toString('base64'));
const N=PDF.PDFName.of;

async function taggedPdf({complex=false,tagged=[0,1,2],ids=false,nestedParentTree=false}={}) {
  const doc=await PDF.PDFDocument.create({updateMetadata:false});
  for(let i=0;i<3;i++){
    const p=doc.addPage([300+i*50,440+i*20]);
    p.drawText('TEST PAGE '+i);
  }
  doc.setTitle('Tagged PDF fixture');
  const C=doc.context;
  const root=C.obj({Type:'StructTreeRoot'}),rootRef=C.register(root);
  const children=[],nums=[];
  for(const i of tagged) {
    const elem=C.obj({Type:'StructElem',S:'P',P:rootRef,
      Pg:doc.getPage(i).ref,K:0});
    const ref=C.register(elem);
    children.push(ref);
    nums.push(i,C.obj([ref]));
    doc.getPage(i).node.set(N('StructParents'),PDF.PDFNumber.of(i));
  }
  if(complex){
    const wrapper=C.obj({Type:'StructElem',S:'Sect',P:rootRef,K:C.obj(children)});
    const ref=C.register(wrapper);
    for(const c of children) C.lookup(c).set(N('P'),ref);
    root.set(N('K'),ref);
  }else root.set(N('K'),C.obj(children));
  const tree=C.obj({Nums:nums});
  if(nestedParentTree) tree.set(N('Kids'),C.obj([]));
  root.set(N('ParentTree'),C.register(tree));
  if(ids) root.set(N('IDTree'),C.obj({Names:[]}));
  doc.catalog.set(N('StructTreeRoot'),rootRef);
  doc.catalog.set(N('MarkInfo'),C.obj({Marked:true}));
  return doc;
}
async function run(doc,{remove=[1],allowUntagged=false,order=null,onTagFallbackApplied=null}={}) {
  const bytes=await doc.save();
  const src=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
  let plan=initialPlan(src);
  for(const i of remove)plan[i].keep=false;
  if(order)plan=order.map(i=>plan[i]);
  const saved=await buildOrganizedPdf(bytes,plan,PDF,{
    allowUntagged,onTagFallbackApplied
  });
  return {src,bytes,saved,result:await PDF.PDFDocument.load(saved,{updateMetadata:false})};
}
function indexKeys(doc){
  const root=doc.context.lookup(doc.catalog.get(N('StructTreeRoot')));
  const tree=doc.context.lookup(root.get(N('ParentTree')));
  const a=doc.context.lookup(tree.get(N('Nums')));
  return Array.from({length:a.size()/2},(_,i)=>doc.context.lookup(a.get(i*2)).asNumber());
}

test('repairs independent tagged-page subtrees and parent tree on removal',async()=>{
  const {result}=await run(await taggedPdf());
  assert.equal(result.getPageCount(),2);
  assert.ok(result.catalog.get(N('StructTreeRoot')));
  assert.ok(result.catalog.get(N('MarkInfo')));
  assert.deepEqual(indexKeys(result),[0,2]);
  const root=result.context.lookup(result.catalog.get(N('StructTreeRoot')));
  const children=result.context.lookup(root.get(N('K')));
  assert.equal(children.size(),2);
  assert.equal(children.get(0).toString(),result.context.lookup(root.get(N('ParentTree'))).get(N('Nums'))
    ? children.get(0).toString() : 'invalid');
  assert.equal(result.getTitle(),'Tagged PDF fixture');
});

test('untagging permission does not strip tags when preservation succeeds',async()=>{
  let fallback=false;
  const {result}=await run(await taggedPdf(),{
    allowUntagged:true,onTagFallbackApplied(){fallback=true;}
  });
  assert.equal(fallback,false);
  assert.ok(result.catalog.get(N('StructTreeRoot')));
});

test('preserve tags when removed page has no tagging',async()=>{
  const {result}=await run(await taggedPdf({tagged:[0,2]}));
  assert.ok(result.catalog.get(N('StructTreeRoot')));
  assert.deepEqual(indexKeys(result),[0,2]);
});

test('mixed-page structure refuses deletion without explicit permission',async()=>{
  await assert.rejects(run(await taggedPdf({complex:true})),
    /explicitly enable "Allow removing accessibility tags"/);
});

test('complex tagged page can be removed after explicit untagged consent',async()=>{
  const doc=await taggedPdf({complex:true});
  await doc.attach(Uint8Array.from([1,2,3]),'kept.xml',{mimeType:'application/xml'});
  const form=doc.getForm().createTextField('keptField');
  form.addToPage(doc.getPage(2));form.setText('Kept value');
  let calls=0;
  const {src,bytes,saved,result}=await run(doc,{
    allowUntagged:true,onTagFallbackApplied(){calls++;}
  });
  assert.equal(calls,1);
  assert.equal(result.getPageCount(),2);
  assert.equal(result.catalog.get(N('StructTreeRoot')),undefined);
  assert.equal(result.catalog.get(N('MarkInfo')),undefined);
  assert.ok(result.catalog.get(N('AF')));
  assert.ok(result.catalog.get(N('Names')));
  assert.equal(result.getForm().getTextField('keptField').getText(),'Kept value');
  assert.ok(result.getPages().every(p=>p.node.get(N('StructParents'))===undefined));
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[300,400]);
  assert.notDeepEqual(Array.from(saved),[]);
  assert.equal(src.getPageCount(),3);
  assert.equal(bytes.byteLength>0,true);
});

test('no explicit consent leaves the original PDF and tags untouched',async()=>{
  const doc=await taggedPdf({complex:true});
  const before=await doc.save();
  const parsed=await PDF.PDFDocument.load(before);
  const plan=initialPlan(parsed);plan[1].keep=false;
  await assert.rejects(buildOrganizedPdf(before,plan,PDF),/accessibility tags/);
  assert.ok(parsed.catalog.get(N('StructTreeRoot')));
  assert.equal(parsed.getPageCount(),3);
});

test('unknown IDTree and nested ParentTree need explicit untagged consent',async()=>{
  for(const cfg of [{ids:true},{nestedParentTree:true}]){
    await assert.rejects(run(await taggedPdf(cfg)),/accessibility tags/);
    const {result}=await run(await taggedPdf(cfg),{allowUntagged:true});
    assert.equal(result.getPageCount(),2);
    assert.equal(result.catalog.get(N('StructTreeRoot')),undefined);
  }
});

test('tagged-page reorder with deletion requires opting out of original reading order',async()=>{
  const options={remove:[1],order:[2,1,0]};
  await assert.rejects(run(await taggedPdf(),options),/accessibility tags/);
  const {result}=await run(await taggedPdf(),{...options,allowUntagged:true});
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[400,300]);
  assert.equal(result.catalog.get(N('StructTreeRoot')),undefined);
});

test('untagged ordinary PDF remains unaffected without consent',async()=>{
  const d=await PDF.PDFDocument.create();
  d.addPage([200,300]);d.addPage([350,450]);
  const {result}=await run(d,{remove:[0]});
  assert.equal(result.getPageCount(),1);
  assert.equal(result.getPage(0).getWidth(),350);
});

test('digital signatures remain a hard stop even with untagging consent',async()=>{
  const d=await taggedPdf({complex:true});
  d.catalog.set(N('Perms'),d.context.obj({}));
  await assert.rejects(run(d,{allowUntagged:true}),/digital signature/);
});

test('XFA form restrictions remain independent of tag fallback',async()=>{
  const d=await taggedPdf({complex:true});
  const acro=d.getForm().acroForm;
  acro.dict.set(N('XFA'),d.context.obj([]));
  await assert.rejects(run(d,{allowUntagged:true}),/XFA forms/);
});

test('unsupported PDF navigation is not bypassed by accessibility fallback',async()=>{
  const d=await taggedPdf({complex:true});
  d.catalog.set(N('Outlines'),d.context.obj({Count:0}));
  await assert.rejects(run(d,{allowUntagged:true}),/Outlines/);
});

test('unrelated tagged annotation data is removed from kept pages in fallback',async()=>{
  const d=await taggedPdf({complex:true});
  const annotation=d.context.obj({Type:'Annot',Subtype:'Text',StructParent:2});
  const ref=d.context.register(annotation);
  d.getPage(2).node.set(N('Annots'),d.context.obj([ref]));
  d.getPage(2).node.set(N('Tabs'),N('S'));
  const {result}=await run(d,{allowUntagged:true});
  const annot=result.context.lookup(result.getPage(1).node.Annots().get(0));
  assert.equal(annot.get(N('StructParent')),undefined);
  assert.equal(result.getPage(1).node.get(N('Tabs')),undefined);
});

test('no-op reorganizations never remove accessibility tags',async()=>{
  const d=await taggedPdf({complex:true});
  const bytes=await d.save(),parsed=await PDF.PDFDocument.load(bytes);
  const copy=await buildOrganizedPdf(bytes,initialPlan(parsed),PDF,{allowUntagged:true});
  const result=await PDF.PDFDocument.load(copy);
  assert.equal(result.getPageCount(),3);
  assert.ok(result.catalog.get(N('StructTreeRoot')));
});
