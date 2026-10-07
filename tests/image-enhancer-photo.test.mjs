import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { photoStatistics, collectPhotoStatistics, makePhotoPlan, enhancePhotoStrip, PHOTO_HALO } from '../assets/js/image-enhancer-photo.js';
const rgba = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return data;
};
function plan(data, w, h, options) { const stats = photoStatistics(); collectPhotoStatistics(data, w, h, stats, 2); return makePhotoPlan(stats, options); }
function process(data, w, h, options) { return enhancePhotoStrip(data, w, h, 0, h, plan(data, w, h, options)); }
function mae(a, b) { let sum = 0; for (let p = 0; p < a.length; p++) if (p % 4 !== 3) sum += Math.abs(a[p] - b[p]); return sum / (a.length * .75); }

test('recoverable low exposure improves against known tonal reference', () => {
  const w = 160, h = 100;
  const ref = rgba(w,h,(x,y) => { const v=40+x*.85+y*.2; return [v,v,v,255]; });
  const dark = Uint8ClampedArray.from(ref,(v,i) => i%4===3?v:v*.58);
  const out = process(dark,w,h);
  assert.ok(mae(out,ref) < mae(dark,ref)*.75);
});
test('native-pixel noise cleanup improves flat neutral reference without color cast', () => {
  let state=42; const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  const w=160,h=100,ref=rgba(w,h,()=>[128,128,128,255]);
  const noisy=rgba(w,h,()=>[128+(rand()-.5)*28,128+(rand()-.5)*28,128+(rand()-.5)*28,255]);
  const out=process(noisy,w,h);
  assert.ok(mae(out,ref)<mae(noisy,ref)*.9, `${mae(out,ref)} vs ${mae(noisy,ref)}`);
});
test('clean neutral ramp changes remain bounded and monotonic', () => {
  const data=rgba(256,40,x=>[x,x,x,255]), out=process(data,256,40);
  assert.ok(mae(out,data)<1.5);
  for(let x=1;x<256;x++) assert.ok(out[x*4]>=out[(x-1)*4]);
});
test('text mode protects binary glyphs and alpha, including hidden RGB', () => {
  const data=rgba(64,64,(x,y)=>{const v=((x>>2)+(y>>2))%2?255:0;return[v,v,v,x<8?0:x<16?128:255];});
  assert.deepEqual(process(data,64,64,{content:'text-logo'}),data);
});
test('halo strips exactly match whole-image processing, including seams', () => {
  const w=83,h=211, data=rgba(w,h,(x,y)=>[(x*7+y*3)%256,(x+y*2)%256,(x*3+y)%256,255]);
  const p=plan(data,w,h), full=enhancePhotoStrip(data,w,h,0,h,p), tiled=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y+=48){const top=Math.max(0,y-PHOTO_HALO),n=Math.min(48,h-y),bottom=Math.min(h,y+n+PHOTO_HALO); tiled.set(enhancePhotoStrip(data.slice(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{offsetY:top}),y*w*4);}
  assert.deepEqual(tiled,full);
});
test('small images, transparent source and invalid input are handled',()=>{
  for(const [w,h] of [[1,1],[1,9],[9,1],[2,2]]){const data=rgba(w,h,()=>[25,70,130,0]);assert.deepEqual(process(data,w,h),data);}
  assert.throws(()=>enhancePhotoStrip(new Uint8ClampedArray(3),1,1,0,1,{}),RangeError);
});
test('Enhance, Deblur and Upscale dispatch are separate; Upscale stays byte-identical',()=>{
  const file='assets/js/image-enhancer.js', current=readFileSync(file,'utf8');
  const section=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
  const up='  async function runUpscalePipeline(',end="  enhanceButton.addEventListener('click'";
  // SHA256 of the full Upscale function at ad91869; works in shallow CI checkouts.
  assert.equal(createHash('sha256').update(section(current,up,end)).digest('hex'), '5c07b1af1a73181252c7c5a575b36eab591f6aa548abb5fb48b8aa5a66250c60');
  const enhance=section(current,'  async function runEnhancePipeline(','  async function runDeblurPipeline(');
  assert.doesNotMatch(enhance,/aiEngine\.process|deblurEngine|prepareAiInferenceInput|finishInBackground/);
  const deblur=section(current,'  async function runDeblurPipeline(',up);
  assert.doesNotMatch(deblur,/aiEngine\.process|enhancePhotograph|applyRegionAwarePass|finishInBackground/);
  assert.match(current,/await runDeblurPipeline\(signal\)/);
});
