import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {transformEmbeddedImages} from '../assets/js/pdf-compressor-v2/embedded-image-transform.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
// Test-only deterministic Pillow encoder; no user photos or network calls.
// The input-integrity CI gate already pins Pillow and Python.
const py=[
 'from PIL import Image',
 'import io,sys',
 "img=Image.new('RGB',(16,16))",
 'img.putdata([((x*13+y*7)%256,(x*27+y*3)%256,(x*3+y*19)%256) for y in range(16) for x in range(16)])',
 'buf=io.BytesIO()',
 "img.save(buf,format='JPEG',quality=75,progressive=False)",
 'sys.stdout.buffer.write(buf.getvalue())'
].join('\n');
const base=new Uint8Array(execFileSync('python', ['-c',py]));
assert.equal(base.length,722,'fixture JPEG encoder output must be stable');
const N=PDF.PDFName.of;
const exif=Buffer.from([255,225,0,8,69,120,105,102,0,0]);
const photoshop=Buffer.from([255,237,0,8,56,66,73,77,0,0]);
const unknown=Buffer.from([255,239,0,8,65,66,67,68,0,0]);
function prependMetadata(...markers){
 return new Uint8Array(Buffer.concat([Buffer.from(base.subarray(0,2)),...markers,Buffer.from(base.subarray(2))]));
}
async function makePDF(jpg,colorSpace='DeviceRGB'){
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const page=doc.addPage([200,200]);
 const image=doc.context.register(doc.context.stream(jpg,{
  Type:'XObject',Subtype:'Image',Width:16,Height:16,
  BitsPerComponent:8,ColorSpace:colorSpace,Filter:'DCTDecode'
 }));
 page.node.set(N('Resources'),doc.context.obj({XObject:{Image:image}}));
 page.pushOperators(PDF.pushGraphicsState(),PDF.scale(200,200),
  PDF.drawObject('Image'),PDF.popGraphicsState());
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const pages=async()=>({pages:[{view:[0,0,200,200],rotation:0,
  textItems:0,imagePaints:1,annotations:0,links:0}]});
test('valid RGB EXIF and Photoshop JPEGs are inspectable without source-image mutation',async()=>{
 for(const markers of [[exif],[photoshop],[exif,photoshop]]){
  const image=prependMetadata(...markers),source=await makePDF(image);
  const snapshot=source.slice();
  const report=await inspectPDFInput(source,{PDF,readPages:pages});
  assert.equal(report.valid,true);
  assert.equal(report.pageCount,1);
  assert.equal(report.images.length,1);
  assert.deepEqual(source,snapshot);
  const parsed=await PDF.PDFDocument.load(source,{updateMetadata:false});
  const embedded=parsed.context.enumerateIndirectObjects()
    .map(([,obj])=>obj).find(obj=>obj instanceof PDF.PDFRawStream&&
    String(obj.dict.get(N('Subtype')))==='/Image');
  assert.deepEqual(embedded.contents,image);
 }
});
test('a real independent PDF.js parser accepts recognized EXIF JPEG framing and page paints',async()=>{
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const source=await makePDF(prependMetadata(exif));
 const report=await inspectPDFInput(source,{PDF,
  readPages:createIndependentInputReader(pdfjs)});
 assert.equal(report.valid,true);
 assert.equal(report.pageCount,1);
 assert.equal(report.pages[0].imagePaints,1);
 assert.equal(report.images[0].width,16);
 assert.equal(report.images[0].height,16);
});
test('legacy RGB EXIF metadata always takes preserve-only route, never color-reencodes',async()=>{
 const source=prependMetadata(exif);
 const decode=createPDFJpegDecoder(class FailIfDecoded{
  constructor(){throw Error('legacy EXIF must not enter lossy JPEG decoder');}
 });
 const result=await decode({bytes:source,descriptor:{width:1600,height:1600,
  bitsPerComponent:8,colorSpace:'/DeviceRGB',filter:'/DCTDecode',
  streamBytes:source.length}});
 assert.deepEqual(result,{status:'preserve'});
});
test('malformed EXIF and unsafe trailing JPEG payload remain rejected',async()=>{
 const badExif=Buffer.from(exif);badExif[5]=88;
 const malformed=Buffer.from(exif);malformed[3]=255;
 for(const image of [prependMetadata(badExif),prependMetadata(malformed),
  new Uint8Array(Buffer.concat([Buffer.from(base),Buffer.from([1,2])]))]){
  await assert.rejects(inspectPDFInput(await makePDF(image),{PDF,readPages:pages}),
    e=>e.code==='image-header-unverifiable');
 }
});
test('structurally valid unfamiliar APP15 or standard XMP APP1 is opaque and preserved',async()=>{
 const xmpId=Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/'),Buffer.from([0])]);
 const xmpSegment=Buffer.concat([Buffer.from([255,225,0,xmpId.length+2]),xmpId]);
 for(const app of [unknown,xmpSegment]){
  const src=prependMetadata(app),input=await makePDF(src);
  assert.equal((await inspectPDFInput(input,{PDF,readPages:pages})).valid,true);
  const parsed=await PDF.PDFDocument.load(input,{updateMetadata:false});
  const raw=parsed.context.enumerateIndirectObjects().map(([,v])=>v)
    .find(v=>v instanceof PDF.PDFRawStream&&String(v.dict.get(N('Subtype')))==='/Image');
  assert.deepEqual(raw.contents,src,'input JPEG must remain byte-for-byte intact');
  const decode=createPDFJpegDecoder(class AbortIfDecoded{
    constructor(){throw Error('unfamiliar metadata must not be decoded for lossy recompression');}
  });
  assert.deepEqual(await decode({bytes:src,descriptor:{width:1600,height:1600,
    bitsPerComponent:8,colorSpace:'/DeviceRGB',filter:'/DCTDecode',streamBytes:src.length}}),
    {status:'preserve'});
  const output=await transformEmbeddedImages(input,{PDF,mode:'maximum',
    inspectInput:async bytes=>inspectPDFInput(bytes,{PDF,readPages:pages}),
    decodeJpeg:decode,
    encodeJpeg:async()=>{throw Error('no opaque JPEG recompression');},
    verifyOutput:async()=>{throw Error('no opaque JPEG replacement');}});
  assert.equal(output.status,'original-retained');
  assert.deepEqual(output.bytes,input);
 }
});
test('invalid opaque APP segment lengths and spoofed Adobe headers remain rejected',async()=>{
 const truncated=Buffer.from([255,239,255,255,65,66]);
 const mistaggedAdobe=Buffer.from([255,239,0,10,65,100,111,98,101,0,0,0]);
 for(const app of [truncated,mistaggedAdobe]){
  await assert.rejects(inspectPDFInput(await makePDF(prependMetadata(app)),{PDF,readPages:pages}),
    e=>e.code==='image-header-unverifiable');
 }
});

test('legacy EXIF permission cannot hide RGB/gray component versus PDF colorspace mismatch',async()=>{
 const image=prependMetadata(exif);
 for(const space of ['DeviceGray','DeviceCMYK']){
  await assert.rejects(inspectPDFInput(await makePDF(image,space),{PDF,readPages:pages}),
    e=>e.code==='image-header-unverifiable');
 }
});
test('strong image stage retains the entire legacy-EXIF JPEG byte-for-byte without invoking a lossy encoder',async()=>{
 const src=await makePDF(prependMetadata(exif,photoshop));
 const decoder=createPDFJpegDecoder(class FailIfDecoded{
  constructor(){throw Error('unverified metadata must remain unchanged');}
 });
 const result=await transformEmbeddedImages(src,{
  PDF,mode:'strong',
  inspectInput:async()=>({valid:true}),
  decodeJpeg:decoder,
  encodeJpeg:async()=>{throw Error('must never reencode metadata JPEG');},
  verifyOutput:async()=>{throw Error('no image replacement should need verification');}
 });
 assert.equal(result.status,'original-retained');
 assert.equal(result.replacements,0);
 assert.deepEqual(result.bytes,src);
});


test('valid EXIF plus valid XMP in the same JPEG remains inspectable and preserve-only',async()=>{
 const xmpId=Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/'),Buffer.from([0])]);
 const xmp=Buffer.concat([Buffer.from([255,225,0,xmpId.length+2]),xmpId]);
 for(const markers of [[exif,xmp],[xmp,exif],[exif,photoshop,xmp,unknown]]){
  const jpeg=prependMetadata(...markers);
  const input=await makePDF(jpeg),snapshot=input.slice();
  const report=await inspectPDFInput(input,{PDF,readPages:pages});
  assert.equal(report.valid,true);
  assert.deepEqual(input,snapshot);
  const decode=createPDFJpegDecoder(class MustNotDecode{constructor(){throw Error('opaque metadata JPEG must not re-encode');}});
  const result=await transformEmbeddedImages(input,{PDF,mode:'maximum',
    inspectInput:b=>inspectPDFInput(b,{PDF,readPages:pages}),
    decodeJpeg:decode,encodeJpeg:async()=>{throw Error('must preserve opaque JPEG');},
    verifyOutput:async()=>{throw Error('no JPEG replacement authorized');}});
  assert.equal(result.status,'original-retained');
  assert.deepEqual(result.bytes,input);
 }
});

test('specific safe diagnostic reasons never waive malformed JPEG checks',async()=>{
 const invalid=Buffer.from(exif);invalid[5]=88;
 await assert.rejects(inspectPDFInput(await makePDF(prependMetadata(invalid)),{PDF,readPages:pages}),
   e=>e.code==='image-header-unverifiable'&&e.cause?.message==='jpeg-metadata-app1');
 const xmpId=Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/'),Buffer.from([0])]);
 const xmp=Buffer.concat([Buffer.from([255,225,0,xmpId.length+2]),xmpId]);
 const bad=Buffer.from(xmp);bad[3]=255;
 await assert.rejects(inspectPDFInput(await makePDF(prependMetadata(bad)),{PDF,readPages:pages}),
   e=>e.code==='image-header-unverifiable'&&['truncated-source-jpeg','invalid-source-jpeg'].includes(e.cause?.message));
});


// Synthetic-only reproductions of two real-world rejected PDF JPEG structures.
// Never copy or upload user medical-report content into the repository or CI.
const adobeRGB=transform=>Buffer.from([
  255,238,0,14,65,100,111,98,101,0,100,192,0,0,0,transform
]);
const ducky=Buffer.from([255,236,0,9,68,117,99,107,121,0,0]);
const xmpSig=Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/'),Buffer.from([0])]);
const xmp=Buffer.concat([Buffer.from([255,225,(xmpSig.length+2)>>8,(xmpSig.length+2)&255]),xmpSig]);
const fakeIcc=Buffer.from([255,226,0,18,73,67,67,95,80,82,79,70,73,76,69,0,1,1,0,0]);

test('real-world Adobe APP14 RGB/YCbCr plus EXIF, Ducky, XMP and Photoshop metadata is preserved',async()=>{
 for(const transform of [0,1]){
  const image=prependMetadata(exif,ducky,xmp,photoshop,adobeRGB(transform));
  const original=await makePDF(image),before=original.slice();
  const report=await inspectPDFInput(original,{PDF,readPages:pages});
  assert.equal(report.valid,true);
  assert.equal(report.images.length,1);
  assert.deepEqual(original,before,'input report must not mutate a source byte');
  const decoder=createPDFJpegDecoder(class RefuseColorChange{
    constructor(){throw Error('Adobe APP14 JPEG must never be decoded for lossy transform');}
  });
  assert.deepEqual(await decoder({bytes:image,descriptor:{width:1600,height:1600,
    bitsPerComponent:8,colorSpace:'/DeviceRGB',filter:'/DCTDecode',streamBytes:image.length}}),
    {status:'preserve'});
  const result=await transformEmbeddedImages(original,{PDF,mode:'maximum',
    inspectInput:b=>inspectPDFInput(b,{PDF,readPages:pages}),
    decodeJpeg:decoder,encodeJpeg:async()=>{throw Error('opaque RGB JPEG must not be encoded');},
    verifyOutput:async()=>{throw Error('unchanged image needs no candidate verifier');}});
  assert.equal(result.status,'original-retained');
  assert.deepEqual(result.bytes,original);
 }
});

test('valid EXIF + ICC APP2 + XMP metadata on ordinary RGB JPEG is inspected, not re-encoded',async()=>{
 const source=prependMetadata(exif,fakeIcc,xmp);
 const input=await makePDF(source);
 assert.equal((await inspectPDFInput(input,{PDF,readPages:pages})).valid,true);
 const decoder=createPDFJpegDecoder(class RejectLossyDecode{
  constructor(){throw Error('mixed EXIF/XMP must preserve source JPEG');}
 });
 assert.deepEqual(await decoder({bytes:source,descriptor:{width:1600,height:1600,
   bitsPerComponent:8,colorSpace:'/DeviceRGB',filter:'/DCTDecode',streamBytes:source.length}}),
   {status:'preserve'});
});

test('malformed, mismatched and conflicting Adobe RGB markers still fail closed',async()=>{
 for(const modifiers of [
   {transform:2},{transform:9},{transform:1,colorSpace:'DeviceGray'},
   {transform:1,colorSpace:'DeviceCMYK'},{transform:1,duplicate:true},
   {transform:1,malformed:true}
 ]){
  let adobe=adobeRGB(modifiers.transform);
  if(modifiers.malformed){adobe=Buffer.from(adobe);adobe[4]=88;}
  const jpeg=prependMetadata(exif,ducky,xmp,photoshop,adobe,
    ...(modifiers.duplicate?[adobeRGB(0)]:[]));
  await assert.rejects(inspectPDFInput(await makePDF(jpeg,modifiers.colorSpace??'DeviceRGB'),
    {PDF,readPages:pages}),e=>e.code==='image-header-unverifiable');
 }
});
