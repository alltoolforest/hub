import test from 'node:test';
import assert from 'node:assert/strict';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
import {buildImageFixture} from './pdf-compressor-task5-fixtures.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {selectDeviceProfile,detectDeviceProfile,DEVICE_PROFILES} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
import {createCompressionSession} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
test('small/unknown mobile hints select conservative budgets without measuring RAM',()=>{
  assert.equal(selectDeviceProfile({mobile:true,deviceMemoryGB:2}).id,'low-memory');
  assert.equal(selectDeviceProfile({mobile:true}).id,'mobile-unknown');
  assert.equal(selectDeviceProfile({mobile:true,deviceMemoryGB:8}).id,'mobile');
  assert.equal(detectDeviceProfile({platform:'MacIntel',maxTouchPoints:5}).id,'mobile-unknown');
  assert.ok(DEVICE_PROFILES['low-memory'].limits.maxTotalImagePixels<DEVICE_PROFILES.standard.limits.maxTotalImagePixels);
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
