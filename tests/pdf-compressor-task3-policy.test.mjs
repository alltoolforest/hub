import test from 'node:test';
import assert from 'node:assert/strict';
import {assessImage,classifyDocument,IMAGE_LIMITS} from '../assets/js/pdf-compressor-v2/image-policy.mjs';
const rgb={width:1200,height:1600,bitsPerComponent:8,
  filter:'/FlateDecode',colorSpace:'/DeviceRGB',
  softMask:false,mask:false,decode:false,decodeParms:false};
test('bounded opaque RGB image classified as candidate, never as completed compression',()=>{
  for(const mode of ['balanced','strong']){
    const item=assessImage(rgb,mode);
    assert.equal(item.eligible,true);
    assert.equal(item.action,'candidate-only');
    assert.equal(item.expectedRawBytes,1200*1600*3);
    assert.equal(classifyDocument([rgb],{pages:2,mode}).outputStatus,'not-compressed');
  }
});
test('mask, transparency, ICC/CMYK, decode params and unsupported encodings fail closed',()=>{
  for(const patch of [
    {softMask:true},{mask:true},{colorSpace:'/DeviceCMYK'},
    {colorSpace:'/ICCBased'},{decode:true},{decodeParms:true},
    {bitsPerComponent:1},{bitsPerComponent:16},{filter:'/JPXDecode'},
    {filter:'/CCITTFaxDecode'},{filter:'/DCTDecode'}
  ])assert.equal(assessImage({...rgb,...patch}).eligible,false,
    JSON.stringify(patch));
});
test('image bomb, malformed dimensions, unsupported quality mode',()=>{
  assert.equal(assessImage({...rgb,width:1_000_000,height:1_000_000}).eligible,false);
  assert.equal(assessImage({...rgb,width:NaN}).eligible,false);
  assert.equal(assessImage({...rgb,width:0}).eligible,false);
  assert.equal(assessImage({...rgb,width:Infinity}).eligible,false);
  assert.throws(()=>assessImage(rgb,'unknown'),RangeError);
  assert.equal(IMAGE_LIMITS.maxDecodedBytes,32_000_000);
});
test('signed/encrypted documents categorically rejected',()=>{
  assert.equal(classifyDocument([rgb],{hasSignature:true}).safe,false);
  assert.equal(classifyDocument([rgb],{encrypted:true}).safe,false);
  assert.equal(classifyDocument([rgb],{pages:0}).safe,false);
  assert.equal(classifyDocument([rgb],{pages:1}).safe,true);
});
test('no mutation of source descriptors',()=>{
  const source=structuredClone(rgb),snapshot=structuredClone(rgb);
  assert.equal(classifyDocument([source],{mode:'strong'}).candidates,1);
  assert.deepEqual(source,snapshot);
});
