import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from '../src/core/pdf-lib.js';
import { getPageContentStreams, getPageFormXObjectStream, replacePageFormXObjectInvocationStream } from '../src/core/document-model.js';
import { parseContentStream } from '../src/parser/content-stream-parser.js';

const enc=value=>new TextEncoder().encode(value);
const dec=value=>new TextDecoder('latin1').decode(value);

function rawStreamBytes(ctx,ref){
  const raw=ctx.lookup(ref);
  return new Uint8Array(decodePDFRawStream(raw).getBytes());
}

const doc=await PDFDocument.create();
const page=doc.addPage([400,300]);
const ctx=doc.context;

const formDict=ctx.obj({
  Type:'XObject',
  Subtype:'Form',
  BBox:[0,0,100,40],
  Resources:{},
});
const originalFormBytes=enc('q 1 0 0 1 0 0 cm Q');
const formRef=ctx.register(PDFRawStream.of(formDict,originalFormBytes));
const xobjects=ctx.obj({Fm1:formRef});
const resources=ctx.obj({XObject:xobjects});
page.node.set(PDFName.of('Resources'),resources);

const pageBytes=enc('q /Fm1 Do Q q 1 0 0 1 120 0 cm /Fm1 Do Q');
const pageRef=ctx.register(PDFRawStream.of(ctx.obj({}),pageBytes));
page.node.set(PDFName.of('Contents'),pageRef);

const parsed=parseContentStream(pageBytes).instructions;
const doIndexes=parsed.map((item,index)=>item.op==='Do'?index:-1).filter(index=>index>=0);
assert.equal(doIndexes.length,2);

const replacementFormBytes=enc('q 1 0 0 1 10 0 cm Q');
const result=replacePageFormXObjectInvocationStream(doc,0,{
  resourceName:'Fm1',
  expectedRefKey:formRef.toString(),
  pageStreamIndex:0,
  invocationOperatorIndex:doIndexes[1],
},replacementFormBytes);

assert.notEqual(result.resourceName,'Fm1');
assert.equal(result.resourceName.length,'Fm1'.length);

const rewrittenPage=getPageContentStreams(doc,0)[0].bytes;
const text=dec(rewrittenPage);
assert.match(text,/\/Fm1 Do/);
assert.match(text,new RegExp(`/${result.resourceName} Do`));
assert.equal((text.match(/\/Fm1 Do/g)||[]).length,1);
assert.equal((text.match(new RegExp(`/${result.resourceName} Do`,'g'))||[]).length,1);

const originalAfter=getPageFormXObjectStream(doc,0,{resourceName:'Fm1',expectedRefKey:formRef.toString()});
assert.equal(dec(originalAfter.bytes),dec(originalFormBytes));
const isolated=getPageFormXObjectStream(doc,0,{resourceName:result.resourceName});
assert.equal(dec(isolated.bytes),dec(replacementFormBytes));

const saved=await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false});
const reopened=await PDFDocument.load(saved,{ignoreEncryption:true,updateMetadata:false});
const reopenedText=dec(getPageContentStreams(reopened,0)[0].bytes);
assert.match(reopenedText,/\/Fm1 Do/);
assert.match(reopenedText,new RegExp(`/${result.resourceName} Do`));

console.log('PASS 1/1');
console.log('✓ repeated Form invocation is isolated, edited, saved, and reopened without changing the sibling invocation');
