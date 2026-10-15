import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {transformEmbeddedImages} from '../assets/js/pdf-compressor-v2/embedded-image-transform.mjs';
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
].join('\\n');
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
test('malformed EXIF, unknown APP marker and unsafe trailing payload are still rejected',async()=>{
 const badExif=Buffer.from(exif);badExif[5]=88;
 const malformed=Buffer.from(exif);malformed[3]=255;
 for(const image of [prependMetadata(badExif),prependMetadata(malformed),
  prependMetadata(unknown),new Uint8Array(Buffer.concat([Buffer.from(base),Buffer.from([1,2])]))]){
  await assert.rejects(inspectPDFInput(await makePDF(image),{PDF,readPages:pages}),
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
