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
test('unclipped overexposure moves toward a known reference without a threshold jump', () => {
  const w=160,h=100,ref=rgba(w,h,(x,y)=>{const v=70+x*.65+y*.1;return[v,v,v,255];});
  const bright=Uint8ClampedArray.from(ref,(v,i)=>i%4===3?v:v*1.34);
  const out=process(bright,w,h);
  assert.ok(mae(out,ref)<mae(bright,ref)*.9);
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

test('white balance requires agreement across midtones and highlights',()=>{
 const w=128,h=96;
 const mid=rgba(w,h,()=>[131,120,116,255]);
 assert.deepEqual(plan(mid,w,h).wb,[1,1,1]);
 const cast=rgba(w,h,(x)=>{const v=70+x;return[v*1.06,v,v*.96,255];});
 const p=plan(cast,w,h);assert.ok(p.wb[0]<1&&p.wb[2]>1);
});
test('narrow-range usable images retain their tone rather than being stretched',()=>{
 const w=128,h=96,data=rgba(w,h,(x,y)=>{const v=110+x*.2+Math.sin(y)*2;return[v+5,v,v-3,255];});
 assert.ok(mae(process(data,w,h),data)<1);
});
test('JPEG boundary cleanup reduces weak block error without altering strong edges or non-JPEG grids',()=>{
 const w=128,h=128,ref=rgba(w,h,()=>[128,128,128,255]);
 const blocks=rgba(w,h,(x,y)=>{const v=128+(((x>>3)+(y>>3))%2?3:-3);return[v,v,v,255];});
 const opts={sourceMime:'image/jpeg',sharpness:'off'};
 const p=plan(blocks,w,h,opts);assert.ok(p.blockStrength>0);
 const out=enhancePhotoStrip(blocks,w,h,0,h,p);assert.ok(mae(out,ref)<mae(blocks,ref));
 assert.equal(plan(blocks,w,h).blockStrength,0,'PNG grid alone is not JPEG evidence');
 const edges=rgba(w,h,(x,y)=>{const v=(((x>>3)+(y>>3))%2)?200:50;return[v,v,v,255];});
 assert.equal(plan(edges,w,h,opts).blockStrength,0,'Strong photographed edges are not block evidence');
 const assembled=new Uint8ClampedArray(blocks.length);
 for(let y=0;y<h;y+=33){const top=Math.max(0,y-PHOTO_HALO),n=Math.min(33,h-y),bottom=Math.min(h,y+n+PHOTO_HALO);assembled.set(enhancePhotoStrip(blocks.slice(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{offsetY:top}),y*w*4);}
 assert.deepEqual(assembled,out,'block correction must preserve global phase across strips');
});


test('portrait protection preserves fine luminance texture while reducing chroma noise', async()=>{
 const { portraitProtectionAt } = await import('../assets/js/image-enhancer-portrait.js');
 const w=96,h=96,faces=[{x:20,y:20,width:55,height:55}];
 assert.equal(portraitProtectionAt(20,20,faces),1);
 assert.equal(portraitProtectionAt(75,75,faces),1);
 assert.equal(portraitProtectionAt(0,0,faces),0);
 assert.ok(portraitProtectionAt(16,40,faces)>portraitProtectionAt(12,40,faces));
 assert.equal(portraitProtectionAt(40,40,[{x:0,y:0,width:NaN,height:5}]),0);
 const data=rgba(w,h,(x,y)=>{const v=125+((x+y)%2?4:-4),n=(x*17+y*11)%9-4;return[v+n,v,v-n,255];});
 const p=plan(data,w,h,{content:'portrait',sharpness:'off'});
 p.noise=12;p.local=0;p.wb=[1,1,1];p.tone=Float32Array.from({length:256},(_,i)=>i);
 const guarded=enhancePhotoStrip(data,w,h,0,h,p,{faces});
 const normal=enhancePhotoStrip(data,w,h,0,h,p);
 let guardedError=0,normalError=0,originalChroma=0,cleanChroma=0;
 for(let y=24;y<70;y++)for(let x=24;x<70;x++){
  const i=(y*w+x)*4,Y=d=>d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
  guardedError+=Math.abs(Y(guarded)-Y(data));normalError+=Math.abs(Y(normal)-Y(data));
  originalChroma+=Math.abs(data[i]-data[i+2]);cleanChroma+=Math.abs(guarded[i]-guarded[i+2]);
 }
 assert.ok(guardedError<normalError*.6,`${guardedError} vs ${normalError}`);
 assert.ok(cleanChroma<originalChroma);
 const strips=new Uint8ClampedArray(data.length);
 for(let y=0;y<h;y+=27){const top=Math.max(0,y-PHOTO_HALO),n=Math.min(27,h-y),bottom=Math.min(h,y+n+PHOTO_HALO);strips.set(enhancePhotoStrip(data.slice(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{faces,offsetY:top}),y*w*4);}
 assert.deepEqual(strips,guarded,'portrait boundaries must not create strip seams');
});

test('portrait exposure lift does not multiply an existing color cast by full brightness gain',()=>{
 const w=64,h=64,data=rgba(w,h,()=>[100,40,55,255]);
 const out=process(data,w,h,{content:'portrait',sharpness:'off'});
 const luma=d=>d[0]*.2126+d[1]*.7152+d[2]*.0722;
 const gain=luma(out)/luma(data);
 assert.ok(gain>1.25,'underexposed portrait must still become visibly brighter');
 assert.ok(out[0]-out[1] < (data[0]-data[1])*gain*.85,'avoid exposure-induced red amplification');
 assert.ok(out[0]>out[2]&&out[2]>out[1],'retain original channel ordering');
});

test('contrast correction preserves distinctions in photographed shadows',()=>{
 const w=160,h=100,data=rgba(w,h,x=>{const v=50+x*.9;return[v,v,v,255];});
 const p=plan(data,w,h,{content:'portrait'});
 for(let i=1;i<40;i++) assert.ok(p.tone[i]>p.tone[i-1],'no flat clipped shadow interval');
 assert.ok(p.tone[8]>5,'keep dark detail instead of forcing it toward black');
});

test('isolated chroma noise is cleaned without erasing protected luminance structure',()=>{
 let seed=531;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const w=100,h=80,reference=rgba(w,h,(x)=>{const v=110+(x%7)*2;return[v,v,v,255];});
 const data=rgba(w,h,x=>{const v=110+(x%7)*2,n=(rand()-.5)*30;return[v+n,v-n*.2126/.7152,v,255];});
 const p=plan(data,w,h,{content:'portrait',sharpness:'off'});
 assert.ok(p.chromaNoise>p.noise*2,'separate color and luminance noise estimates');
 const out=enhancePhotoStrip(data,w,h,0,h,p,{faces:[{x:0,y:0,width:w,height:h}]});
 assert.ok(mae(out,reference)<mae(data,reference)*.9,'measurable color noise reduction');
 let error=0;
 for(let i=0;i<data.length;i+=4)error+=Math.abs((out[i]-data[i])*.2126+(out[i+1]-data[i+1])*.7152+(out[i+2]-data[i+2])*.0722);
 assert.ok(error/(w*h)<1,'preserve fine luminance signal in protected regions');
});

// Mixed-light exposure regression cases.
{
const w=240,h=120;
const rgba=fn=>{const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);return data;};
const plan=(data,options={})=>{const s=photoStatistics();collectPhotoStatistics(data,w,h,s,2);return makePhotoPlan(s,{strength:'balanced',sharpness:'off',...options});};
const process=(data,options={})=>enhancePhotoStrip(data,w,h,0,h,plan(data,options));
const luma=(d,p)=>d[p]*.2126+d[p+1]*.7152+d[p+2]*.0722;
const mixed=()=>rgba((x,y)=>{const v=x<85?38+y*.15:220+y*.15;return[v,v,v,255];});

test('a bright background no longer causes the dark foreground to be darkened',()=>{
 const source=mixed(),out=process(source);let before=0,after=0,count=0;
 for(let y=10;y<h-10;y++)for(let x=10;x<70;x++){const p=(y*w+x)*4;before+=source[p];after+=out[p];count++;}
 assert.ok(after/count>before/count+8,'foreground gets a visible bounded lift');
 assert.ok(after/count<before/count+17,'no aggressive exposure change');
 for(let y=10;y<h-10;y++)for(let x=110;x<w-10;x++){const p=(y*w+x)*4;assert.ok(Math.abs(out[p]-source[p])<=3,'preserve the bright background');}
});

test('strong shadow noise disables the additional shadow lift',()=>{
 const s=photoStatistics();const source=mixed();collectPhotoStatistics(source,w,h,s,2);
 const quiet=makePhotoPlan(s,{strength:'balanced'});
 // Inject known shadow residual evidence to test tone-plan response independent of a noise estimator.
 s.shadowResiduals.fill(0);s.shadowResiduals[32]=200;s.shadowCount=200;
 const noisy=makePhotoPlan(s,{strength:'balanced'});
 assert.ok(quiet.shadowLift>8);assert.equal(noisy.shadowLift,0);
});

test('full tonal gradients, sparse highlights and graphic content avoid new correction',()=>{
 for(const source of [rgba(x=>{const v=x*255/(w-1);return[v,v,v,255];}),rgba(x=>{const v=x<220?45:235;return[v,v,v,255];})])assert.equal(plan(source).shadowLift,0);
 assert.equal(plan(mixed(),{content:'text-logo'}).shadowLift,0);
 assert.equal(plan(mixed(),{content:'illustration'}).shadowLift,0);
});

test('mixed-light tone curves remain monotonic and do not lift absolute black',()=>{
 for(const strength of ['fidelity','balanced','recovery']){
  const p=plan(mixed(),{strength});assert.equal(p.tone[0],0);
  for(let i=1;i<256;i++)assert.ok(p.tone[i]>=p.tone[i-1],`nonmonotonic at ${i}`);
 }
});

test('shadow exposure keeps skin-color ordering without prescribing a complexion',()=>{
 const data=rgba((x,y)=>x<85?[58+y*.1,35+y*.1,28+y*.1,255]:[225,225,225,255]);
 const out=process(data,{content:'portrait'});const p=(40*w+40)*4;
 assert.ok(luma(out,p)>luma(data,p)+3);
 assert.ok(out[p]>out[p+1]&&out[p+1]>out[p+2]);
 assert.ok(out[p]-out[p+2]<(data[p]-data[p+2])*1.25,'no large chroma amplification');
});
}
