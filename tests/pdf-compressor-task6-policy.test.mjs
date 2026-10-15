import test from 'node:test';
import assert from 'node:assert/strict';
import {planCompression} from '../assets/js/pdf-compressor-v2/mode-policy.mjs';
import {compressPDF} from '../assets/js/pdf-compressor-v2/compression-pipeline.mjs';
const jpeg={width:800,height:1100,bitsPerComponent:8,filter:'/DCTDecode',colorSpace:'/DeviceRGB'};
test('JPEG routing requires a decoder and painted images; masked/profiled images remain intact',()=>{
  assert.equal(planCompression({images:[jpeg]}).imageCandidates,0);
  assert.equal(planCompression({images:[jpeg],allowJpeg:true,classification:'image-only'}).imageCandidates,1);
  assert.equal(planCompression({images:[jpeg],allowJpeg:true,classification:'digital'}).imageCandidates,0);
  for(const unsafe of [{...jpeg,mask:true},{...jpeg,colorSpace:'/ICCBased'}])
    assert.equal(planCompression({images:[unsafe],allowJpeg:true}).imageCandidates,0);
  const defaultPlan=planCompression({images:[jpeg],allowJpeg:true});
  assert.equal(defaultPlan.mode,'balanced');assert.equal(defaultPlan.settings.jpegQuality,.82);
  const max=planCompression({mode:'maximum',images:[jpeg],allowJpeg:true,classification:'image-only'});
  assert.equal(max.imageCandidates,1);
  assert.equal(max.settings.jpegQuality,.42);
  assert.equal(max.settings.maxDimension,1200);
});
test('cancelled/invalid mode jobs cannot enter PDF inspection or produce output',async()=>{
  await assert.rejects(compressPDF(new Uint8Array(30),{signal:AbortSignal.abort()}),e=>e.code==='cancelled');
  await assert.rejects(compressPDF(new Uint8Array(30),{mode:'extreme'}),RangeError);
});
