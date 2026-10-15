import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as candidate from './dist/assets/image-enhancer-photo.js';
import * as safety from './dist/assets/safety/image-enhancer-photo.js';
const variants={safety:{engine:safety},guard:{engine:candidate}};
function run(d,w,h,{engine:c,options={}},stripRows=c.photoStripRows(w)){
 const rows=c.photoStripRows(w),s=c.photoStatistics({width:w,height:h}),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
 for(let y=0;y<h;y+=rows)c.collectPhotoStatistics(d.subarray(y*w*4,Math.min(h,y+rows)*w*4),w,Math.min(rows,h-y),s,step,y);
 const plan=c.makePhotoPlan(s,{strength:'balanced',sharpness:'auto',sourceMime:'image/jpeg',...options}),out=new Uint8ClampedArray(d.length),t=performance.now();
 for(let y=0;y<h;y+=stripRows){const n=Math.min(stripRows,h-y),top=Math.max(0,y-c.PHOTO_HALO),bottom=Math.min(h,y+n+c.PHOTO_HALO);out.set(c.enhancePhotoStrip(d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,plan,{offsetY:top}),y*w*4);}
 return{out,ms:Math.round(performance.now()-t),plan};
}
const report={method:'Worker-equivalent statistics and strips, balanced/auto/general/JPEG; desktop Node runtime only.',photos:[],synthetic:[]};
const root=process.argv[2];
for(const c of JSON.parse(readFileSync(root+'/cases.json'))){
 const d=new Uint8ClampedArray(readFileSync(root+'/'+c.name+'.rgba'));for(const [name,v] of Object.entries(variants)){
 const {out,ms,plan}=run(d,c.width,c.height,v);if(name==='guard')assert.deepEqual(out,run(d,c.width,c.height,v,c.height).out);
 writeFileSync(root+'/'+c.name+'-shadow-'+name+'.rgba',out);report.photos.push({image:c.name,variant:name,runtimeMs:ms,noise:plan.noise,shadowNoise:plan.shadowNoise});
 }
}
let seed=1701;function rnd(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return(seed+.5)/4294967296;}function gaussian(){return Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd());}
for(const level of [12,24,100]){
 const w=256,h=160,clean=new Uint8ClampedArray(w*h*4),noisy=new Uint8ClampedArray(clean.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,l=level+(x>=128?4*Math.sin(x*Math.PI/4):0);for(let c=0;c<3;c++){clean[p+c]=l;noisy[p+c]=l+3*gaussian();}clean[p+3]=noisy[p+3]=255;}
 for(const [name,v] of Object.entries(variants)){
 const a=run(clean,w,h,v).out,b=run(noisy,w,h,v).out;let mse=0,count=0,signal=0;
 for(let y=10;y<h-10;y++)for(let x=10;x<w-10;x++){const p=(y*w+x)*4;for(let c=0;c<3;c++){mse+=(a[p+c]-b[p+c])**2;count++;}if(x>=138)signal+=Math.abs(a[p]-a[p-4]);}
 report.synthetic.push({sourceMean:level,variant:name,processedNoisyVsCleanRMSE:Math.sqrt(mse/count),cleanTextureAdjacentDifference:signal/((h-20)*(w-10-138))});
 }
}
// Exact compatibility when the new guard is disabled.
const c=JSON.parse(readFileSync(root+'/cases.json'))[0],d=new Uint8ClampedArray(readFileSync(root+'/'+c.name+'.rgba'));
assert.deepEqual(run(d,c.width,c.height,variants.safety).out,run(d,c.width,c.height,{engine:candidate,options:{shadowGuard:false}}).out);
report.guardOffMatchesSafety=true;report.realPhotosFullStripEquality=true;
writeFileSync(root+'/shadow-tests.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

for (const level of [12,24,100]) {
 const baseline=report.synthetic.find(x=>x.sourceMean===level&&x.variant==='safety');
 const guard=report.synthetic.find(x=>x.sourceMean===level&&x.variant==='guard');
 assert.ok(guard.processedNoisyVsCleanRMSE<=baseline.processedNoisyVsCleanRMSE);
 assert.equal(guard.cleanTextureAdjacentDifference,baseline.cleanTextureAdjacentDifference);
}
console.log('PASS: synthetic composite error non-increasing, clean-pattern contrast unchanged, guard-off compatibility, real-photo strip equality.');
