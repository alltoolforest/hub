import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const base=new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmvAWm/wCq+X0rqbe3jvPGN9LGjBVlER3DnKKEP4ZU03wIkKmIBWbpyBSx6tDHfX1zaKWF1cyGBs7SVZid2Oo4P5kVniKWXrEVL1E3a2l3v6J9jowcPYOviZrSMf129XbQ/9k=','base64'));
const N=PDF.PDFName.of;
const exif=Buffer.from([255,225,0,8,69,120,105,102,0,0]);
const photoshop=Buffer.from([255,237,0,8,56,66,73,77,0,0]);
const unknown=Buffer.from([255,239,0,8,65,66,67,68,0,0]);
function prependMetadata(...markers){
 return new Uint8Array(Buffer.concat([Buffer.from(base.subarray(0,2)),...markers,Buffer.from(base.subarray(2))]));
}
async function makePDF(jpg){
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const page=doc.addPage([200,200]);
 const image=doc.context.register(doc.context.stream(jpg,{
  Type:'XObject',Subtype:'Image',Width:16,Height:16,
  BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'DCTDecode'
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
