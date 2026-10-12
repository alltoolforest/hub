import test from 'node:test';
import assert from 'node:assert/strict';
import {FINISH_R3,finishLuma,finishStrip} from '../research/finish-r3.js';

test('both tone presets preserve endpoints, monotonicity and raise midtones',()=>{
  for(const s of Object.values(FINISH_R3)) {
    assert.equal(finishLuma(0,s),0);assert.equal(finishLuma(255,s),255);
    let previous=0;
    for(let y=0;y<=255;y+=.125){const v=finishLuma(y,s);assert.ok(v>=previous&&v<=255);previous=v;}
    assert.ok(finishLuma(100,s)>100);
    assert.ok(finishLuma(140,s)-finishLuma(110,s)>30);
  }
});
test('no spatial mixing, exact strip independence and alpha/hidden RGB preservation',()=>{
  const d=Uint8ClampedArray.from({length:4096},(_,i)=>(i*37)%256),original=d.slice();
  for(let p=3;p<d.length;p+=8)d[p]=255;
  const input=d.slice(),out=finishStrip(d,FINISH_R3.brighter);
  assert.deepEqual(d,input);
  for(let p=0;p<d.length;p+=4){assert.deepEqual(finishStrip(d.slice(p,p+4),FINISH_R3.brighter),out.slice(p,p+4));if(d[p+3]!==255)assert.deepEqual(out.slice(p,p+4),original.slice(p,p+4));assert.equal(out[p+3],d[p+3]);}
});
test('neutral colors and black/white stay neutral, chroma is retained away from gamut',()=>{
  const d=new Uint8ClampedArray([0,0,0,255,255,255,255,255,60,60,60,255,90,60,50,255]);
  const o=finishStrip(d,FINISH_R3.brighter);
  assert.deepEqual(o.slice(0,8),d.slice(0,8));assert.equal(o[8],o[9]);assert.equal(o[9],o[10]);
  assert.equal(o[12]-o[13],30);assert.equal(o[13]-o[14],10);
});
test('invalid parameters or buffers fail closed',()=>{
  for(const s of [{brightness:NaN,contrast:0},{brightness:.3,contrast:0},{brightness:0,contrast:-1}])assert.throws(()=>finishStrip(new Uint8ClampedArray(4),s));
  assert.throws(()=>finishStrip(new Uint8ClampedArray(3),FINISH_R3.balanced));
});
