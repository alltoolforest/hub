// Offline ablation only. Active R5 controls and JPEG detail policy are unchanged.
// node evaluate-r6.mjs corpus.json output-directory
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,relative,dirname}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import * as core from'../assets/js/image-enhancer-photo.js';
import{brillianceTrial,vibranceTrial}from'./light-color-r6.js';
import{createIntegrity,inspectStrip,finishIntegrity}from'../assets/js/photo-integrity.js';
const corpus=JSON.parse(readFileSync(process.argv[2])),dest=resolve(process.argv[3]),repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');assert.ok(relative(repo,dest).startsWith('../'));mkdirSync(dest,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex'),Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
function render(d,w,h,p){const o=new Uint8ClampedArray(d.length);for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-10),bottom=Math.min(h,y+n+10);o.set(core.enhancePhotoStrip(d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{offsetY:top,faces:[]}),y*w*4);}return o;}
function protect(out,base,w,h,faces){for(let y=0;y<h;y++)for(let x=0;x<w;x++){let weight=0;for(const f of faces){const dx=Math.max(f.x-x,0,x-(f.x+f.width-1)),dy=Math.max(f.y-y,0,y-(f.y+f.height-1)),t=Math.min(1,Math.hypot(dx,dy)/12);weight=Math.max(weight,1-t*t*(3-2*t));}if(weight){const p=(y*w+x)*4;for(let k=0;k<3;k++)out[p+k]=base[p+k]*weight+out[p+k]*(1-weight);}}return out;}
function metrics(a,src,ref,w,h,box=[0,0,w,h]){let n=0,ySum=0,sse=0,grad=0,edges=0,rms=0,rn=0,newHigh=0;const[x0,y0,rw,rh]=box;
 for(let y=y0;y<y0+rh;y++)for(let x=x0;x<x0+rw;x++){const p=(y*w+x)*4;if(src[p+3]!==255)continue;n++;ySum+=Y(a,p);for(let k=0;k<3;k++){if(ref)sse+=(a[p+k]-ref[p+k])**2;newHigh+=a[p+k]===255&&src[p+k]<255?1:0;}
  if(x>x0&&y>y0&&x+1<x0+rw&&y+1<y0+rh&&[p-4,p+4,p-w*4,p+w*4].every(q=>src[q+3]===255)){const residual=Y(a,p)-(Y(a,p-4)+Y(a,p+4)+Y(a,p-w*4)+Y(a,p+w*4))/4;rms+=residual**2;rn++;if(ref)for(const q of[p+4,p+w*4]){grad+=Math.abs(Y(a,q)-Y(a,p)-Y(ref,q)+Y(ref,p));edges++;}}
 }return {meanLuma:n?ySum/n:null,referenceMSE:ref&&n?sse/(n*3):null,referenceGradientMAE:edges?grad/edges:null,highFrequencyRMS:rn?Math.sqrt(rms/rn):null,newHighChannels:newHigh};}
const records=[];
for(const c of corpus.cases){assert.match(c.id,/^[a-z0-9-]+$/);assert.ok(['calibration','diagnostic'].includes(c.split));const d=new Uint8ClampedArray(readFileSync(c.raw)),w=c.width,h=c.height;assert.equal(hash(d),c.input_sha256);assert.equal(d.length,w*h*4);
 let ref=null;if(c.reference){ref=new Uint8ClampedArray(readFileSync(c.reference));assert.equal(hash(ref),c.reference_sha256);}
 const stats=core.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);core.collectPhotoStatistics(d.subarray(y*w*4,(y+n)*w*4),w,n,stats,step,y);}const p=core.makePhotoPlan(stats,c.options),base=render(d,w,h,p);
 let faces=[];if(c.id.startsWith('astronaut-'))faces=[{x:160,y:50,width:135,height:145}];else if(c.id==='user-print-portrait')faces=[{x:205,y:230,width:535,height:575}];else assert.ok(c.id.startsWith('coffee-')||c.id.startsWith('chelsea-')||c.id==='alpha-diagnostic');
 const variants={pr171:base,brilliance:brillianceTrial(base,w,h,{amount:.5,noise:p.noise,faces}),vibrance:vibranceTrial(base,w,h,{amount:1,faces})};
 for(const multiplier of[1.25,1.5,2])variants['sharp-'+multiplier]=protect(render(d,w,h,{...p,sharp:p.sharp*multiplier}),base,w,h,faces);
 for(const [variant,out] of Object.entries(variants)){const integrity=createIntegrity(w,h);for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);inspectStrip(integrity,d.subarray(y*w*4,(y+n)*w*4),out.subarray(y*w*4,(y+n)*w*4),0,n,y);}let changed=0,faceChanges=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const q=(y*w+x)*4,delta=Math.max(...[0,1,2].map(k=>Math.abs(out[q+k]-base[q+k])));changed+=delta>0;if(delta&&faces.some(f=>x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.height))faceChanges++;}
  if(variant!=='brilliance')assert.equal(faceChanges,0);if(c.id==='user-print-portrait'||c.variant==='blur')writeFileSync(resolve(dest,c.id+'-'+variant+'.rgba'),out);
  records.push({id:c.id,variant,width:w,height:h,input_sha256:hash(d),output_sha256:hash(out),baseSharp:p.sharp,faceAnnotations:faces,changedPixels:changed,faceChanges,metrics:metrics(out,d,ref,w,h),rois:c.rois.map(r=>({id:r.id,metrics:metrics(out,d,ref,w,h,r.box)})),integrity:finishIntegrity(integrity)});
 }assert.equal(hash(d),c.input_sha256);
}
writeFileSync(resolve(dest,'evidence.json'),JSON.stringify({status:'Offline ablations; no active R5 changes',sharpnessDefinition:'PR171 sharp amount multiplied once; same radius, local contrast, noise threshold and ±3 sharpening-term cap. Added face exclusion/feather for all non-Brilliance variants.',limitations:['Four independent scenes including one user diagnostic; no held-out/phone pairs','Brilliance changes face tone but excludes extra local clarity there','Vibrance preserves manually marked faces; warm-color attenuation is heuristic','High-frequency RMS includes true texture and artifacts; MSE is not preference'],records},null,2)+'\n');
console.log(JSON.stringify({cases:corpus.cases.length,outputs:records.length,integrityPassed:records.every(r=>r.integrity.passed)}));
