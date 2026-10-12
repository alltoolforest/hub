// Offline baseline measurement, not browser/phone qualification or a quality score.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as baseline from '../baseline/assets/js/image-enhancer-photo.js';
const hash = x => createHash('sha256').update(x).digest('hex');
const here=dirname(fileURLToPath(import.meta.url));
const repo=resolve(here,'../../..');
const corpus=JSON.parse(readFileSync(process.argv[2]));
const outdir=resolve(process.argv[3]);
const rel=relative(repo,outdir);
assert.ok(rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel), 'Outputs must be outside repository');
mkdirSync(outdir,{recursive:true});
const luminance=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
function metrics(input,out,w,h,box=[0,0,w,h],ref=null){
 const [x0,y0,rw,rh]=box;
 assert.ok([x0,y0,rw,rh].every(Number.isInteger)&&x0>=0&&y0>=0&&rw>0&&rh>0&&x0+rw<=w&&y0+rh<=h,'Invalid ROI');
 let pixels=0,alphaMismatch=0,delta=0,signedY=0,referenceSSE=0,inputSSE=0,gradientError=0,edges=0,newLow=0,newHigh=0;
 for(let y=y0;y<y0+rh;y++)for(let x=x0;x<x0+rw;x++){
  const p=(y*w+x)*4;
  alphaMismatch+=input[p+3]!==out[p+3]?1:0;
  if(input[p+3]!==255)continue;
  pixels++;signedY+=luminance(out,p)-luminance(input,p);
  for(let c=0;c<3;c++){
   delta+=Math.abs(out[p+c]-input[p+c]);
   newLow+=out[p+c]===0&&input[p+c]>0?1:0;
   newHigh+=out[p+c]===255&&input[p+c]<255?1:0;
   if(ref){referenceSSE+=(out[p+c]-ref[p+c])**2;inputSSE+=(input[p+c]-ref[p+c])**2;}
  }
  if(ref&&x+1<x0+rw&&y+1<y0+rh&&input[p+7]===255&&input[p+w*4+3]===255){
   for(const q of [p+4,p+w*4]){gradientError+=Math.abs((luminance(out,q)-luminance(out,p))-(luminance(ref,q)-luminance(ref,p)));edges++;}
  }
 }
 const mse=pixels&&ref?referenceSSE/(pixels*3):null;
 return {opaquePixels:pixels,alphaMismatch,changeMAE:pixels?delta/(pixels*3):null,meanLumaShift:pixels?signedY/pixels:null,newClippedLowChannels:newLow,newClippedHighChannels:newHigh,referenceMSE:mse,inputReferenceMSE:pixels&&ref?inputSSE/(pixels*3):null,referencePSNR:mse===0?'infinity':mse===null?null:10*Math.log10(255**2/mse),referenceGradientMAE:edges?gradientError/edges:null};
}
function run(data,w,h,options){
 const start=performance.now(),stats=baseline.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
 for(let y=0;y<h;y+=96){const rows=Math.min(96,h-y);baseline.collectPhotoStatistics(data.subarray(y*w*4,(y+rows)*w*4),w,rows,stats,step,y);}
 const plan=baseline.makePhotoPlan(stats,options),out=new Uint8ClampedArray(data.length);
 for(let y=0;y<h;y+=96){const top=Math.max(0,y-baseline.PHOTO_HALO),rows=Math.min(96,h-y),bottom=Math.min(h,y+rows+baseline.PHOTO_HALO);out.set(baseline.enhancePhotoStrip(data.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,rows,plan,{offsetY:top,faces:options.faces||[]}),y*w*4);}
 return {out,ms:performance.now()-start,plan};
}
const records=[];
for(const spec of corpus.cases){
 assert.match(spec.id,/^[a-z0-9-]+$/);
 // Held-out originals may not be run by a tuning/calibration script.
 assert.ok(['calibration','diagnostic'].includes(spec.split),'Held-out cases require final-review procedure');
 const bytes=readFileSync(spec.raw);assert.equal(hash(bytes),spec.input_sha256,'Input hash mismatch');
 const data=new Uint8ClampedArray(bytes),w=spec.width,h=spec.height;
 assert.ok(Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0&&w*h<=32000000);
 assert.equal(data.length,w*h*4);
 let ref=null;if(spec.reference){const raw=readFileSync(spec.reference);assert.equal(hash(raw),spec.reference_sha256,'Reference hash mismatch');assert.equal(raw.length,data.length);ref=new Uint8ClampedArray(raw);}
 run(data,w,h,spec.options); // One warm-up; three measured runs.
 const runs=Array.from({length:3},()=>run(data,w,h,spec.options));
 const hashes=runs.map(r=>hash(r.out));assert.equal(new Set(hashes).size,1,'Nondeterministic output');
 assert.equal(hash(data),spec.input_sha256,'Input was mutated');
 const result=runs[0],global=metrics(data,result.out,w,h,undefined,ref);
 assert.equal(global.alphaMismatch,0,'Alpha changed');
 writeFileSync(resolve(outdir,spec.id+'.rgba'),result.out);
 records.push({id:spec.id,source_id:spec.source_id,split:spec.split,variant:spec.variant,width:w,height:h,input_sha256:spec.input_sha256,output_sha256:hashes[0],reference_sha256:spec.reference_sha256||null,options:spec.options,repeatable:true,runtimeMs:runs.map(r=>r.ms),medianMs:runs.map(r=>r.ms).sort((a,b)=>a-b)[1],metrics:global,rois:spec.rois.map(roi=>({...roi,metrics:metrics(data,result.out,w,h,roi.box,ref)})),plan:Object.fromEntries(Object.entries(result.plan).filter(([k,v])=>typeof v==='number'||typeof v==='string'||typeof v==='boolean'||k==='wb')),phoneComparison:null,physicalDeviceTest:false});
}
const report={engine:'PR171 unchanged baseline',sourceCommit:'a672855f9c4047dafe31cd0823cfeb7de2bb04f7',runnerCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),runnerSHA256:hash(readFileSync(fileURLToPath(import.meta.url))),runtime:{node:process.version,platform:process.platform,architecture:process.arch},corpusGenerator:corpus.generator,limitations:['Calibration samples only; no held-out evaluation','No confirmed phone Auto-editor comparison','Synthetic degradation is not sensor/optical ground truth','No browser encode/decode, memory or physical-phone qualification','changeMAE is not a photographic quality score','No genuine face detection tested; face ROIs are for review only'],records};
writeFileSync(resolve(outdir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:records.length,deterministic:records.every(x=>x.repeatable),alphaPreserved:records.every(x=>x.metrics.alphaMismatch===0),report:resolve(outdir,'report.json')}));
