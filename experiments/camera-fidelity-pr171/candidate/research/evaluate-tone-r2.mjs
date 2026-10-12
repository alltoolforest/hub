// Usage: node evaluate-tone-r2.mjs corpus.json retained-baseline-dir output-dir
// Offline calibration/diagnostic evidence only. Never treat an original as a
// clean reference unless the corpus explicitly declares that relationship.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as engine from '../assets/js/image-enhancer-photo.js';
import {restrainedTonePlan,TONE_R2} from './tone-r2.js';
import {createIntegrity,inspectStrip,finishIntegrity,assertDimensions} from '../assets/js/photo-integrity.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
const corpus=JSON.parse(readFileSync(process.argv[2]));
const baselineDir=resolve(process.argv[3]),outDir=resolve(process.argv[4]);
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
const rel=relative(repo,outDir);
assert.ok(rel==='..'||rel.startsWith('../')||isAbsolute(rel),'Private pixel outputs must stay outside repository');
mkdirSync(outDir,{recursive:true});
const retained=JSON.parse(readFileSync(resolve(baselineDir,'report.json')));
const Y=(a,p)=>a[p]*.2126+a[p+1]*.7152+a[p+2]*.0722;
function metrics(data,src,ref,w,h,box=[0,0,w,h]) {
  const [x0,y0,rw,rh]=box;assert.ok(box.every(Number.isInteger)&&x0>=0&&y0>=0&&rw>0&&rh>0&&x0+rw<=w&&y0+rh<=h);
  let n=0,sum=0,shift=0,sse=0,grad=0,edges=0,residual=0,resN=0,newHigh=0;
  for(let y=y0;y<y0+rh;y++)for(let x=x0;x<x0+rw;x++) {
    const p=(y*w+x)*4;if(src[p+3]!==255)continue;
    n++;sum+=Y(data,p);shift+=Y(data,p)-Y(src,p);
    for(let c=0;c<3;c++){if(ref)sse+=(data[p+c]-ref[p+c])**2;if(data[p+c]===255&&src[p+c]<255)newHigh++;}
    if(x>x0&&y>y0&&x+1<x0+rw&&y+1<y0+rh&&[p-4,p+4,p-w*4,p+w*4].every(q=>src[q+3]===255)) {
      const r=Y(data,p)-(Y(data,p-4)+Y(data,p+4)+Y(data,p-w*4)+Y(data,p+w*4))/4;
      residual+=r*r;resN++;
      if(ref)for(const q of [p+4,p+w*4]){grad+=Math.abs((Y(data,q)-Y(data,p))-(Y(ref,q)-Y(ref,p)));edges++;}
    }
  }
  return {opaquePixels:n,meanLuma:n?sum/n:null,meanLumaShift:n?shift/n:null,referenceMSE:ref&&n?sse/(n*3):null,referenceGradientMAE:edges?grad/edges:null,highFrequencyRMS:resN?Math.sqrt(residual/resN):null,newClippedHighChannels:newHigh};
}
function render(data,w,h,plan) {
  const out=new Uint8ClampedArray(data.length),integrity=createIntegrity(w,h),start=performance.now();
  for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-10),bottom=Math.min(h,y+n+10),strip=data.subarray(top*w*4,bottom*w*4);
    const result=engine.enhancePhotoStrip(strip,w,bottom-top,y-top,n,plan,{offsetY:top,faces:[]});
    inspectStrip(integrity,strip,result,y-top,n,y);out.set(result,y*w*4);
  }
  return {out,ms:performance.now()-start,integrity:finishIntegrity(integrity)};
}
const records=[];
for(const c of corpus.cases) {
  assert.ok(['calibration','diagnostic'].includes(c.split),'Held-out tuning prohibited');
  assert.match(c.id,/^[a-z0-9-]+$/);assertDimensions(c.width,c.height);
  assert.ok(!c.options.faces?.length,'This runner does not invent or discard supplied face masks');
  const data=new Uint8ClampedArray(readFileSync(c.raw)),w=c.width,h=c.height;
  assert.equal(data.length,w*h*4);assert.equal(hash(data),c.input_sha256);
  let ref=null;if(c.reference){ref=new Uint8ClampedArray(readFileSync(c.reference));assert.equal(ref.length,data.length);assert.equal(hash(ref),c.reference_sha256);}
  const stats=engine.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
  for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);engine.collectPhotoStatistics(data.subarray(y*w*4,(y+n)*w*4),w,n,stats,step,y);}
  const baselinePlan=engine.makePhotoPlan(stats,c.options),trialPlan=restrainedTonePlan(baselinePlan);
  let base,baselineReused=false;
  const prior=retained.records.find(r=>r.id===c.id);
  if(prior){assert.equal(prior.input_sha256,c.input_sha256);assert.deepEqual(prior.options,c.options);base=new Uint8ClampedArray(readFileSync(resolve(baselineDir,c.id+'.rgba')));assert.equal(hash(base),prior.output_sha256);baselineReused=true;}
  else {base=render(data,w,h,baselinePlan).out;writeFileSync(resolve(outDir,c.id+'-baseline.rgba'),base);}
  const result=render(data,w,h,trialPlan);assert.equal(hash(data),c.input_sha256);
  writeFileSync(resolve(outDir,c.id+'-tone-r2.rgba'),result.out);
  const observed=c.observedRaw?new Uint8ClampedArray(readFileSync(c.observedRaw)):null;
  if(observed){assert.equal(observed.length,data.length);assert.equal(hash(observed),c.observed_sha256);}
  const measure=box=>({input:metrics(data,data,ref,w,h,box),baseline:metrics(base,data,ref,w,h,box),trial:metrics(result.out,data,ref,w,h,box),observed:observed?metrics(observed,data,ref,w,h,box):null});
  records.push({id:c.id,split:c.split,width:w,height:h,input_sha256:c.input_sha256,baseline_sha256:hash(base),trial_sha256:hash(result.out),observed_sha256:c.observed_sha256||null,options:c.options,baselineReused,metrics:measure(),rois:c.rois.map(r=>({...r,metrics:measure(r.box)})),integrity:result.integrity,singleRunProcessingMs:result.ms,plan:{noise:baselinePlan.noise,shadowNoise:baselinePlan.shadowNoise,chromaNoise:baselinePlan.chromaNoise,mean:baselinePlan.mean,range:baselinePlan.range}});
}
const report={trial:TONE_R2,enabledInWorker:false,runnerSHA256:hash(readFileSync(fileURLToPath(import.meta.url))),moduleSHA256:hash(readFileSync(new URL('./tone-r2.js',import.meta.url))),runtime:process.version,limitations:['Three calibration scenes plus one user diagnostic are not representative or held-out','Uploaded output settings unknown; recreated baseline uses declared auto/balanced options and Pillow decode','High-frequency RMS combines genuine texture and noise; reducing it is not a detail/denoise quality pass','MSE and gradient errors are reference-based diagnostics, not preference scores','No browser/mobile qualification; single run timing is not a performance benchmark'],records};
writeFileSync(resolve(outDir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(records.map(r=>({id:r.id,baseMSE:r.metrics.baseline.referenceMSE,trialMSE:r.metrics.trial.referenceMSE,baseShift:r.metrics.baseline.meanLumaShift,trialShift:r.metrics.trial.meanLumaShift,integrity:r.integrity.passed})),null,2));
