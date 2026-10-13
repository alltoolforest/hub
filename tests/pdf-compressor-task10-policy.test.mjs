import test from 'node:test';
import {deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
import {buildImageFixture} from './pdf-compressor-task5-fixtures.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {selectDeviceProfile,detectDeviceProfile,DEVICE_PROFILES} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
import {createCompressionSession} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {decodeAsciiStreamBounded} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
test('small/unknown mobile hints select conservative budgets without measuring RAM',()=>{
  assert.equal(selectDeviceProfile({mobile:true,deviceMemoryGB:2}).id,'low-memory');
  assert.equal(selectDeviceProfile({mobile:true}).id,'mobile-unknown');
  assert.equal(selectDeviceProfile({mobile:true,deviceMemoryGB:8}).id,'mobile');
  assert.equal(detectDeviceProfile({platform:'MacIntel',maxTouchPoints:5}).id,'mobile-unknown');
  assert.ok(DEVICE_PROFILES['low-memory'].limits.maxTotalImagePixels<DEVICE_PROFILES.standard.limits.maxTotalImagePixels);
});
test('wrapped JPEGs, aliases and component-count forgery cannot bypass header budgets',async()=>{
  const original=await buildImageFixture({jpegQuality:98}),N=PDF.PDFName.of;
  for(const variant of ['valid-flate','forged-flate','forged-alias','forged-components']){
    const doc=await PDF.PDFDocument.load(original,{updateMetadata:false});
    for(const [ref,image] of doc.context.enumerateIndirectObjects()){
      if(!(image instanceof PDF.PDFRawStream)||String(image.dict.get(N('Filter')))!=='/DCTDecode')continue;
      const data=image.contents.slice(),dict=image.dict.clone(doc.context);
      if(variant!=='valid-flate')for(let i=0;i<data.length-10;i++)if(data[i]===255&&[192,193,194].includes(data[i+1])){
        if(variant==='forged-components')data[i+9]=250;
        else {data[i+5]=255;data[i+6]=255;data[i+7]=255;data[i+8]=255;}break;
      }
      if(variant==='forged-alias')dict.set(N('Filter'),N('DCT'));
      else if(variant.includes('flate'))dict.set(N('Filter'),doc.context.obj(['FlateDecode','DCTDecode']));
      doc.context.assign(ref,PDF.PDFRawStream.of(dict,variant.includes('flate')?new Uint8Array(deflateSync(data)):data));
    }
    const bytes=new Uint8Array(await doc.save());
    if(variant==='valid-flate')assert.equal((await inspectPDFInput(bytes,{PDF,readPages:createIndependentInputReader(pdfjs)})).valid,true);
    else {let called=false;await assert.rejects(inspectPDFInput(bytes,{PDF,readPages:async()=>{called=true;}}));assert.equal(called,false);}
  }
});
test('shared bounded ASCII decoding retains exact bytes without large match arrays',()=>{
  assert.deepEqual(decodeAsciiStreamBounded(new TextEncoder().encode('00 aB ff 1>'),'/ASCIIHexDecode',4),new Uint8Array([0,171,255,16]));
  assert.throws(()=>decodeAsciiStreamBounded(new TextEncoder().encode('00010203>'),'/ASCIIHexDecode',3));
  assert.deepEqual(decodeAsciiStreamBounded(new TextEncoder().encode('z~>'),'/ASCII85Decode',4),new Uint8Array(4));
});
test('device file limits apply before reading and state the selected budget',async()=>{
  let read=false;
  const session=createCompressionSession({limits:DEVICE_PROFILES['low-memory'].limits,
    engine:{inspect:async()=>{},compress:async()=>{}}});
  await session.select({name:'source.pdf',size:9*1024*1024,arrayBuffer:async()=>{read=true;}});
  assert.equal(read,false);assert.equal(session.snapshot().error.code,'file-limit');
  assert.match(session.snapshot().error.message,/8 MiB/);
});
test('forged JPEG frame dimensions are rejected before independent decoding',async()=>{
  const doc=await PDF.PDFDocument.load(await buildImageFixture({jpegQuality:98}),{updateMetadata:false});
  const N=PDF.PDFName.of;let changed=false;
  for(const [,image] of doc.context.enumerateIndirectObjects()){
    if(!(image instanceof PDF.PDFRawStream)||String(image.dict.get(N('Filter')))!=='/DCTDecode')continue;
    const data=image.contents;
    for(let i=0;i<data.length-10;i++)if(data[i]===255&&[192,193,194].includes(data[i+1])){
      data[i+5]=255;data[i+6]=255;data[i+7]=255;data[i+8]=255;changed=true;break;
    }
  }
  assert.equal(changed,true);let read=false;
  await assert.rejects(inspectPDFInput(new Uint8Array(await doc.save()),{PDF,readPages:async()=>{read=true;}}),e=>e.code==='encoded-image-dimensions');
  assert.equal(read,false);
});
