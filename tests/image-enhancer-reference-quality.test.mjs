import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceQuality} from './image-enhancer-reference-quality.mjs';
const w=128,h=96,target=new Uint8ClampedArray(w*h*4),source=target.slice();let state=42;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(y*w+x)*4,v=80+((x>>3)%2)*50+((y>>3)%2)*25+15*Math.sin(x*1.2);
 state=(Math.imul(state,1664525)+1013904223)>>>0;const noise=(state/2**32-.5)*48;
 for(let c=0;c<3;c++){target[i+c]=v;source[i+c]=v+noise;}target[i+3]=source[i+3]=255;
}
test('known clean recovery passes while unchanged noisy pixels fail',()=>{
 assert.equal(referenceQuality(source,target,target,w,h).accepted,true);
 assert.equal(referenceQuality(source,source,target,w,h).accepted,false);
});
test('flat, softened and over-sharpened images fail even when noise energy drops',()=>{
 const flat=target.slice(),soft=target.slice(),sharp=target.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;let sum=0,n=0;
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){sum+=target[(Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx)))*4];n++;}
  for(let c=0;c<3;c++){flat[i+c]=118;soft[i+c]=sum/n;sharp[i+c]=118+(target[i+c]-118)*2;}
 }
 for(const bad of [flat,soft,sharp])assert.equal(referenceQuality(source,bad,target,w,h).accepted,false);
});
test('mismatched reference dimensions fail explicitly',()=>assert.throws(()=>referenceQuality(source,target,target,1,1),RangeError));
