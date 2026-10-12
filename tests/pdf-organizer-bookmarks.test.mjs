// PDF Organizer bookmark /Outlines cleanup. No changes to shared tools.
// node --test tests/pdf-organizer-bookmarks.test.mjs
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

async function sample({destinations=[0,1,2,3],nested=false,action=false,external=false,
  namedIndex=-1,allOnRemoved=false,cycle=false}={}) {
  const doc=await PDF.PDFDocument.create({updateMetadata:false});
  for(let i=0;i<4;i++)doc.addPage([300+40*i,400]).drawText('Original '+i);
  doc.setTitle('Bookmark export fixture');
  const C=doc.context;
  const root=C.obj({Type:'Outlines',Count:0}),rootRef=C.register(root);
  const refs=[],items=[];
  for(let i=0;i<destinations.length;i++){
    const destIndex=allOnRemoved?1:destinations[i];
    const destination=i===namedIndex?N('unresolved-name'):
      C.obj([doc.getPage(destIndex).ref,N('Fit')]);
    const info={Title:PDF.PDFString.of('Bookmark '+i),Parent:rootRef};
    if(external&&i===0){
      info.A=C.obj({S:'URI',URI:PDF.PDFString.of('https://example.org')});
    }else if(action&&i===0){
      info.A=C.obj({S:'GoTo',D:destination});
    }else info.Dest=destination;
    const node=C.obj(info),ref=C.register(node);
    items.push(node);refs.push(ref);
  }
  const tops=refs.slice();
  if(nested&&refs.length>=3){
    const parent=items[1],kid=items[2];
    kid.set(N('Parent'),refs[1]);
    parent.set(N('First'),refs[2]);
    parent.set(N('Last'),refs[2]);
    parent.set(N('Count'),PDF.PDFNumber.of(-1)); // Collapsed.
    tops.splice(2,1);
  }
  for(let i=0;i<tops.length;i++){
    const o=C.lookup(tops[i]);
    if(i)o.set(N('Prev'),tops[i-1]);
    if(i+1<tops.length)o.set(N('Next'),tops[i+1]);
    else o.delete(N('Next'));
  }
  if(tops.length){root.set(N('First'),tops[0]);root.set(N('Last'),tops.at(-1));}
  root.set(N('Count'),PDF.PDFNumber.of(tops.length));
  if(cycle&&tops.length)C.lookup(tops.at(-1)).set(N('Next'),tops[0]);
  doc.catalog.set(N('Outlines'),rootRef);
  doc.catalog.set(N('PageMode'),N('UseOutlines'));
  return doc;
}

async function exportPages(doc,{removed=[1],allowBookmarkDiscard=false,keepOrder=null,
  onBookmarkCleanupApplied}={}) {
  const sourceBytes=await doc.save();
  const loaded=await PDF.PDFDocument.load(sourceBytes,{updateMetadata:false});
  let plan=initialPlan(loaded);
  for(const i of removed)plan[i].keep=false;
  if(keepOrder)plan=keepOrder.map(i=>plan[i]);
  const bytes=await buildOrganizedPdf(sourceBytes,plan,PDF,{
    allowBookmarkDiscard,onBookmarkCleanupApplied
  });
  const result=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
  return {source:loaded,sourceBytes,result,bytes};
}
function outlineTree(doc){
  const rootRef=doc.catalog.get(N('Outlines'));
  if(!rootRef)return null;
  const C=doc.context,root=C.lookup(rootRef),allowed=new Set(doc.getPages().map(p=>p.ref.toString()));
  const visited=new Set();
  const walk=(parentRef,parent)=>{
    const list=[];let nodeRef=parent.get(N('First')),prev=null;
    while(nodeRef){
      assert.ok(nodeRef instanceof PDF.PDFRef);
      assert.ok(!visited.has(nodeRef.toString()),'cycle or duplicate in exported bookmarks');
      visited.add(nodeRef.toString());
      const node=C.lookup(nodeRef);
      assert.equal(String(node.get(N('Parent'))),String(parentRef));
      assert.equal(node.get(N('Prev'))?.toString()??null,prev?.toString()??null);
      const dest=C.lookup(node.get(N('Dest'))??C.lookup(node.get(N('A')))?.get(N('D')));
      if(dest instanceof PDF.PDFArray){
        const ref=dest.get(0);
        assert.ok(allowed.has(String(ref)),'dangling bookmark page destination');
      }
      const children=walk(nodeRef,node);
      list.push({ref:nodeRef,title:node.get(N('Title'))?.decodeText?.(),children,
        count:node.get(N('Count'))?.asNumber?.()});
      prev=nodeRef;nodeRef=node.get(N('Next'));
    }
    if(list.length) assert.equal(String(parent.get(N('Last'))),String(list.at(-1).ref));
    return list;
  };
  return walk(rootRef,root);
}

test('the /Outlines catalog entry alone no longer blocks deleting a page',async()=>{
  const d=await sample();
  let removed=0;
  const {result}=await exportPages(d,{onBookmarkCleanupApplied:n=>removed=n});
  assert.equal(result.getPageCount(),3);
  assert.equal(removed,1);
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
});

test('valid bookmarks targeting remaining pages preserve title/order and linked tree',async()=>{
  const d=await sample({destinations:[0,2,3]});
  const {result}=await exportPages(d);
  assert.equal(result.getPageCount(),3);
  assert.deepEqual(outlineTree(result).map(x=>x.title),['Bookmark 0','Bookmark 1','Bookmark 2']);
  assert.equal(result.getTitle(),'Bookmark export fixture');
});

test('bookmark on deleted page with valid descendants promotes surviving descendants',async()=>{
  const {result}=await exportPages(await sample({nested:true}));
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
  assert.equal(result.getPageCount(),3);
});

test('deleting only a nested child preserves the remaining parent hierarchy',async()=>{
  const {result}=await exportPages(await sample({nested:true}),{removed:[2]});
  const tree=outlineTree(result);
  assert.deepEqual(tree.map(x=>x.title),['Bookmark 0','Bookmark 1','Bookmark 3']);
  assert.deepEqual(tree[1].children,[]);
});

test('keeping a nested child retains collapsed state',async()=>{
  const {result}=await exportPages(await sample({nested:true}),{removed:[3]});
  const tree=outlineTree(result);
  assert.equal(tree[1].count,-1);
  assert.equal(tree[1].children[0].title,'Bookmark 2');
});

test('all bookmarks pointing to removed page removes empty outline root and PageMode',async()=>{
  const {result}=await exportPages(await sample({allOnRemoved:true}));
  assert.equal(result.getPageCount(),3);
  assert.equal(result.catalog.get(N('Outlines')),undefined);
  assert.equal(result.catalog.get(N('PageMode'))?.toString(),'/UseNone');
});

test('normal GoTo action uses retained-page destination correctly',async()=>{
  const {result}=await exportPages(await sample({action:true,destinations:[0,1,2,3]}));
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
});

test('external URL bookmarks survive unrelated PDF page removal',async()=>{
  const {result}=await exportPages(await sample({external:true}));
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
});

test('named or unresolved bookmark destination requires explicit consent',async()=>{
  const d=await sample({namedIndex:0});
  await assert.rejects(exportPages(d),/Allow removing unsupported bookmarks/);
  const {result}=await exportPages(d,{allowBookmarkDiscard:true});
  assert.equal(result.getPageCount(),3);
  assert.equal(result.catalog.get(N('Outlines')),undefined);
  assert.equal(result.catalog.get(N('PageMode'))?.toString(),'/UseNone');
});

test('explicitly discarding unsupported bookmarks keeps attachments and form values',async()=>{
  const d=await sample({namedIndex:0});
  await d.attach(new Uint8Array([1,2,3]),'associated.xml',{mimeType:'application/xml'});
  const field=d.getForm().createTextField('keptField');
  field.addToPage(d.getPage(3));field.setText('Preserved');
  let cleaned=0;
  const {result}=await exportPages(d,{allowBookmarkDiscard:true,
    onBookmarkCleanupApplied:v=>{cleaned=v;}});
  assert.equal(cleaned,-1);
  assert.ok(result.catalog.get(N('AF')));
  assert.equal(result.getForm().getTextField('keptField').getText(),'Preserved');
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[300,380,420]);
});

test('explicit consent never discards repairable bookmark structures',async()=>{
  const {result}=await exportPages(await sample(),{allowBookmarkDiscard:true});
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
});

test('cyclic bookmarks are rejected or safely dropped with explicit permission',async()=>{
  const d=await sample({cycle:true});
  await assert.rejects(exportPages(d),/Allow removing unsupported bookmarks/);
  const {result}=await exportPages(d,{allowBookmarkDiscard:true});
  assert.equal(result.getPageCount(),3);
  assert.equal(result.catalog.get(N('Outlines')),undefined);
});

test('digital signatures remain protected even when bookmark deletion is allowed',async()=>{
  const d=await sample();
  d.catalog.set(N('Perms'),d.context.obj({}));
  await assert.rejects(exportPages(d,{allowBookmarkDiscard:true}),/digital signature/);
});

test('unsupported OpenAction remains blocked even with bookmark consent',async()=>{
  const d=await sample();
  d.catalog.set(N('OpenAction'),d.context.obj([d.getPage(0).ref,N('Fit')]));
  await assert.rejects(exportPages(d,{allowBookmarkDiscard:true}),/OpenAction/);
});

test('bookmark-bearing PDFs still support reorder, rotation and deletion together',async()=>{
  const d=await sample();
  const src=await d.save(),loaded=await PDF.PDFDocument.load(src);
  let plan=initialPlan(loaded);plan[1].keep=false;plan[3].rotation=90;
  plan=[plan[3],plan[0],plan[1],plan[2]];
  const bytes=await buildOrganizedPdf(src,plan,PDF);
  const result=await PDF.PDFDocument.load(bytes);
  assert.deepEqual(result.getPages().map(p=>p.getWidth()),[420,300,380]);
  assert.deepEqual(result.getPages().map(p=>p.getRotation().angle),[90,0,0]);
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 2','Bookmark 3']);
});

test('source PDF is not changed when bookmark cleanup exports',async()=>{
  const d=await sample();
  const raw=await d.save(),copy=new Uint8Array(raw);
  const plan=initialPlan(await PDF.PDFDocument.load(raw));plan[1].keep=false;
  await buildOrganizedPdf(raw,plan,PDF);
  assert.deepEqual(raw,copy);
});

test('no page removal leaves bookmarks unchanged',async()=>{
  const {result}=await exportPages(await sample(),{removed:[]});
  assert.deepEqual(outlineTree(result).map(x=>x.title),
    ['Bookmark 0','Bookmark 1','Bookmark 2','Bookmark 3']);
});
