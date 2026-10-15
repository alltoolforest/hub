import assert from 'node:assert/strict';
import { recoverDeblurFallback } from '../assets/js/image-enhancer-deblur-fallback.js';
import { validateDeblurFidelity } from '../assets/js/image-enhancer-deblur-validation.js';

for(const value of [0,.5,1]) {
  const a=new Float32Array(31*37*3).fill(value);
  assert.deepEqual(recoverDeblurFallback(a,31,37),a);
}
const w=541,h=319,n=w*h,src=new Float32Array(n*3);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)src[c*n+y*w+x]=.4+c*.05+.16*Math.sin(x*.17)+.12*Math.cos(y*.11);
const before=src.slice(),full=recoverDeblurFallback(src,w,h),tiled=new Float32Array(src.length);
for(let y=0;y<h;y+=256)for(let x=0;x<w;x+=256) {
  const cw=Math.min(256,w-x),ch=Math.min(256,h-y),sx=Math.max(0,x-9),sy=Math.max(0,y-9);
  const rw=Math.min(w,x+cw+9)-sx,rh=Math.min(h,y+ch+9)-sy,rn=rw*rh,tile=new Float32Array(rn*3);
  for(let yy=0;yy<rh;yy++)for(let xx=0;xx<rw;xx++)for(let c=0;c<3;c++)tile[c*rn+yy*rw+xx]=src[c*n+(sy+yy)*w+sx+xx];
  const result=recoverDeblurFallback(tile,rw,rh);
  for(let yy=0;yy<ch;yy++)for(let xx=0;xx<cw;xx++)for(let c=0;c<3;c++)tiled[c*n+(y+yy)*w+x+xx]=result[c*rn+(yy+y-sy)*rw+xx+x-sx];
}
assert.deepEqual(src,before);
let maxDiff=0,maxDelta=0;
for(let i=0;i<src.length;i++) {
  maxDiff=Math.max(maxDiff,Math.abs(full[i]-tiled[i]));
  maxDelta=Math.max(maxDelta,Math.abs(full[i]-src[i]));
  assert.ok(Number.isFinite(full[i]) && full[i]>=0 && full[i]<=1);
}
assert.ok(maxDiff<1e-6,`seam error ${maxDiff}`);
assert.ok(maxDelta<=12/255+1e-7);
validateDeblurFidelity(full,src,w,h);
assert.throws(()=>recoverDeblurFallback(new Float32Array([NaN,0,0]),1,1));
assert.throws(()=>recoverDeblurFallback(new Float32Array(3),0,1));
console.log(`PASS: flat-image invariance, source immutability, bounded correction, finite range and full/tiled equivalence (max difference ${maxDiff}).`);
