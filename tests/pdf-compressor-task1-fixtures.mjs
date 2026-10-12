// Task 1 ONLY — deterministic synthetic PDF corpus for baseline verification.
// Usage: import {buildFixture, fixtureCases} from './pdf-compressor-task1-fixtures.mjs';
// No production PDF processing, source changes, uploads or user documents.
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
const require=createRequire(import.meta.url);
export const PDF=require('../assets/vendor/pdf-lib.js');
const N=PDF.PDFName.of;
const FIXED_DATE=new Date('2020-01-02T03:04:05.000Z');

export const fixtureCases=Object.freeze([
  {id:'digital',type:'text-native',pages:3,expected:'content-preserving',source:'synthetic'},
  {id:'scanned',type:'raster-only scanned-like',pages:2,expected:'image-preservation',source:'synthetic-not-real-scan'},
  {id:'image-heavy',type:'image-heavy',pages:3,expected:'image-preservation',source:'synthetic'},
  {id:'mixed',type:'mixed text/image',pages:2,expected:'text-and-image-preservation',source:'synthetic'},
  {id:'form',type:'interactive form',pages:2,expected:'form-preservation',source:'synthetic'},
  {id:'bookmarks',type:'navigation bookmarks',pages:3,expected:'bookmark-preservation',source:'synthetic'},
  {id:'attachment',type:'embedded attachment',pages:2,expected:'attachment-preservation',source:'synthetic'},
  {id:'tagged',type:'logical structure tags',pages:2,expected:'tag-preservation',source:'synthetic'},
  {id:'signed-marker',type:'signature-permission marker',pages:1,expected:'signature-safety',source:'synthetic-marker-not-cryptographically-signed'},
  {id:'invalid',type:'malformed PDF bytes',pages:0,expected:'safe-error',source:'synthetic'}
]);

function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,body){
  const name=Buffer.from(type,'ascii'),size=Buffer.alloc(4),check=Buffer.alloc(4);
  size.writeUInt32BE(body.length,0);
  check.writeUInt32BE(crc32(Buffer.concat([name,body])),0);
  return Buffer.concat([size,name,body,check]);
}
function makeRasterPng(width,height,seed){
  // Deterministic raster-only grayscale scan approximation. Does not simulate OCR.
  const raw=Buffer.alloc(height*(1+width*3));
  let value=seed>>>0,offset=0;
  for(let y=0;y<height;y++){
    raw[offset++]=0; // PNG per-scanline filter None
    for(let x=0;x<width;x++){
      value=(Math.imul(value,1664525)+1013904223)>>>0;
      const stroke=(y%35>=8&&y%35<=11&&x>20&&x<width-20&&x%47<39);
      const noise=(value>>>23)&15;
      const gray=stroke?18+noise:227+noise;
      raw[offset++]=gray;raw[offset++]=gray;raw[offset++]=gray;
    }
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
  ihdr[8]=8;ihdr[9]=2; // RGB, 8-bit
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:6})),
    chunk('IEND',Buffer.alloc(0))
  ]);
}
function stableMeta(doc){
  doc.setTitle('ATF Task 1 synthetic fixture');
  doc.setAuthor('AllToolForest Test Suite');
  doc.setSubject('Baseline fixture — not a user document');
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
}
function pages(doc,count,label){
  for(let i=0;i<count;i++){
    const p=doc.addPage([440+i*11,610+i*7]);
    p.drawText(label+' #'+(i+1),{x:24,y:560,size:14});
  }
}
function addOutlines(doc){
  const C=doc.context;
  const root=C.obj({Type:'Outlines',Count:2}),rootRef=C.register(root);
  const first=C.obj({Title:PDF.PDFString.of('First page'),Parent:rootRef,
    Dest:C.obj([doc.getPage(0).ref,N('Fit')])});
  const second=C.obj({Title:PDF.PDFString.of('Third page'),Parent:rootRef,
    Dest:C.obj([doc.getPage(2).ref,N('Fit')])});
  const a=C.register(first),b=C.register(second);
  first.set(N('Next'),b);second.set(N('Prev'),a);
  root.set(N('First'),a);root.set(N('Last'),b);
  doc.catalog.set(N('Outlines'),rootRef);
}
function addTagging(doc){
  const C=doc.context,root=C.obj({Type:'StructTreeRoot'}),ref=C.register(root);
  const elements=[],pairs=[];
  for(let i=0;i<doc.getPageCount();i++){
    const e=C.obj({Type:'StructElem',S:'P',P:ref,Pg:doc.getPage(i).ref,K:0});
    const eref=C.register(e);elements.push(eref);pairs.push(i,C.obj([eref]));
    doc.getPage(i).node.set(N('StructParents'),PDF.PDFNumber.of(i));
  }
  root.set(N('K'),C.obj(elements));
  root.set(N('ParentTree'),C.register(C.obj({Nums:pairs})));
  doc.catalog.set(N('StructTreeRoot'),ref);
  doc.catalog.set(N('MarkInfo'),C.obj({Marked:true}));
}
export async function buildFixture(id){
  if(id==='invalid')return {
    id,bytes:new Uint8Array(Buffer.from('%PDF-1.7\nthis is not a valid PDF\n','utf8')),
    kind:'invalid',synthetic:true
  };
  if(!fixtureCases.some(c=>c.id===id))throw new Error('Unknown fixture: '+id);
  const doc=await PDF.PDFDocument.create({updateMetadata:false});
  stableMeta(doc);
  if(id==='digital'){
    pages(doc,3,'Digital text');
  }else if(id==='scanned'||id==='image-heavy'){
    const count=id==='scanned'?2:3;
    for(let i=0;i<count;i++){
      const p=doc.addPage([400,560]);
      const png=makeRasterPng(id==='scanned'?380:460,id==='scanned'?510:590,i+107);
      const image=await doc.embedPng(png);
      p.drawImage(image,{x:0,y:0,width:400,height:560});
    }
  }else if(id==='mixed'){
    pages(doc,2,'Selectable mixed text');
    const img=await doc.embedPng(makeRasterPng(340,380,212));
    doc.getPage(1).drawImage(img,{x:30,y:100,width:280,height:360});
  }else if(id==='form'){
    pages(doc,2,'Interactive form');
    const field=doc.getForm().createTextField('client.reference');
    field.addToPage(doc.getPage(1));field.setText('ATF-REFERENCE-123');
  }else if(id==='bookmarks'){
    pages(doc,3,'Bookmarked document');addOutlines(doc);
  }else if(id==='attachment'){
    pages(doc,2,'Attachment document');
    await doc.attach(new Uint8Array([33,44,55,66,77]),'receipt-data.xml',{
      mimeType:'application/xml',description:'Synthetic attachment'
    });
  }else if(id==='tagged'){
    pages(doc,2,'Tagged document');addTagging(doc);
  }else if(id==='signed-marker'){
    pages(doc,1,'Signature marker');
    // A /Perms marker is NOT a cryptographically valid signature.
    doc.catalog.set(N('Perms'),doc.context.obj({DocMDP:doc.context.obj({})}));
  }
  return {id,bytes:new Uint8Array(await doc.save({useObjectStreams:true})),
    kind:id,synthetic:true};
}
export function fixtureDescriptor(id){
  const item=fixtureCases.find(c=>c.id===id);
  if(!item)throw new Error('Unknown fixture: '+id);
  return {...item};
}
