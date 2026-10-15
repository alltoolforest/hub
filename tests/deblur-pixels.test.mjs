import assert from 'node:assert/strict';
import { unpackDeblurPixels } from '../assets/js/image-enhancer-deblur-pixels.js';
import { validateDeblurOutput } from '../assets/js/image-enhancer-deblur-validation.js';

// Reproduce the former heuristic failure: one >2 overshoot must never dim
// other pixels. Valid normalized midtones remain 128, overshoot clips locally.
const values=new Float32Array(3*16*16).fill(.5);
values[0]=2.1; values[256]=-.2;
const out=unpackDeblurPixels(values,16,16,15,15);
assert.deepEqual([...out.slice(0,8)],[255,0,128,255,128,128,128,255]);
for(const bad of [NaN,Infinity,-Infinity,17,-17]) {
  const broken=values.slice();broken[broken.length-1]=bad;
  assert.throws(()=>unpackDeblurPixels(broken,16,16,15,15),/Unstable/);
}
assert.throws(()=>unpackDeblurPixels(values,0,1,1,1));
assert.throws(()=>unpackDeblurPixels(values,1025,1,1,1));

assert.throws(()=>unpackDeblurPixels(values,16,16,17,16));
assert.throws(()=>unpackDeblurPixels(values.slice(1),16,16,16,16));
console.log('PASS: normalized overshoot regression, corruption and bounds rejection.');
