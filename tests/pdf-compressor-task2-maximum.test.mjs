import test from 'node:test';
import assert from 'node:assert/strict';
import {MODES,planCompression} from '../assets/js/pdf-compressor-v2/mode-policy.mjs';
import {QUALITY_MODES,assessImage} from '../assets/js/pdf-compressor-v2/image-policy.mjs';
import {encodeRasterCandidate} from '../assets/js/pdf-compressor-v2/image-candidate.mjs';
import {scaledImageDimensions} from '../assets/js/pdf-compressor-v2/adaptive-image-candidate.mjs';

const jpg={width:2600,height:1200,bitsPerComponent:8,filter:'/DCTDecode',
  colorSpace:'/DeviceRGB',streamBytes:4_000_000};

test('Task 2 adds Maximum while leaving existing mode settings exactly unchanged',()=>{
 assert.deepEqual(MODES,['lossless','balanced','strong','maximum']);
 assert.deepEqual(QUALITY_MODES.balanced,{jpegQuality:.82,maxDimension:2400});
 assert.deepEqual(QUALITY_MODES.strong,{jpegQuality:.68,maxDimension:1800});
 assert.deepEqual(QUALITY_MODES.maximum,{jpegQuality:.42,maxDimension:1200});
 assert.deepEqual(scaledImageDimensions(2600,1200,'maximum'),{width:1200,height:554});
 assert.equal(planCompression({mode:'maximum',images:[jpg],classification:'mixed',allowJpeg:true}).imageCandidates,1);
 assert.equal(planCompression({mode:'maximum',images:[jpg],classification:'digital',allowJpeg:true}).imageCandidates,0);
 assert.equal(planCompression({mode:'lossless',images:[jpg],classification:'mixed',allowJpeg:true}).imageCandidates,0);
});

test('maximum mode never bypasses unsupported image protections',()=>{
 for(const im of [
  {...jpg,mask:true},{...jpg,softMask:true},{...jpg,decode:[0,1]},
  {...jpg,colorSpace:'/ICCBased'},{...jpg,bitsPerComponent:16},
  {...jpg,filter:'/JPXDecode'},{...jpg,encrypted:true}
 ])assert.equal(assessImage(im,'maximum',undefined,{allowJpeg:true,allowAdaptive:true}).eligible,false);
});

test('maximum candidate uses its distinct JPEG and downsample settings',async()=>{
 const width=1400,height=2,rgba=new Uint8Array(width*height*4);
 for(let i=0;i<width*height;i++)rgba.set([80,140,200,255],i*4);
 let called=0;
 const result=await encodeRasterCandidate({descriptor:{...jpg,filter:'/FlateDecode',
  colorSpace:'/DeviceRGB',width,height,streamBytes:100000},rgba,mode:'maximum',
  encodeJpeg:async({quality,width:w,height:h,rgb})=>{
   assert.equal(quality,.42);assert.equal(w,1200);assert.equal(h,2);
   assert.equal(rgb.length,w*h*3);called++;
   return new Uint8Array([255,216,0,1,255,217]);
  }});
 assert.equal(called,1);assert.equal(result.status,'candidate-only');
 assert.equal(result.width,1200);
 assert.equal(result.requiresIndependentPDFValidation,true);
});
