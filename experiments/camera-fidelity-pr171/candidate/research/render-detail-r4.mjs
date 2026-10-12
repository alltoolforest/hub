// Offline detail isolation: run on normal retained baseline AND brighter R3.
// node render-detail-r4.mjs corpus.json baseline-dir r3-dir output-dir
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,relative,dirname}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{detailStrip}from'./detail-r4.js';
import{createIntegrity,inspectStrip,finishIntegrity}from'../assets/js/photo-integrity.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const corpus=JSON.parse(readFileSync(process.argv[2])),base=resolve(process.argv[3]),r3=resolve(process.argv[4]),dest=resolve(process.argv[5]);
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');assert.ok(relative(repo,dest).startsWith('../'));mkdirSync(dest,{recursive:true});
const bReport=JSON.parse(readFileSync(resolve(base,'report.json'))),rReport=JSON.parse(readFileSync(resolve(r3,'render-report.json')));
const records=[];
for(const c of corpus.cases){
 assert.match(c.id,/^[a-z0-9-]+$/);assert.ok(['diagnostic','calibration'].includes(c.split));
 const source=new Uint8ClampedArray(readFileSync(c.raw));assert.equal(hash(source),c.input_sha256);
 // Explicit diagnostic annotations, not detector predictions. Unknown scene
 // IDs fail closed so this runner cannot silently skip a person's protection.
 let faces=[];
 if(c.id.startsWith('astronaut-'))faces=[{x:160,y:50,width:135,height:145}];
 else if(c.id==='user-print-portrait')faces=[{x:205,y:230,width:535,height:575}];
 else assert.ok(c.id.startsWith('coffee-')||c.id.startsWith('chelsea-')||c.id==='alpha-diagnostic','Unreviewed scene');
 for(const kind of ['baseline','brighter']){
  const record=kind==='baseline'?bReport.records.find(r=>r.id===c.id):rReport.records.find(r=>r.id===c.id&&r.variant==='brighter');if(!record)continue;
  const path=kind==='baseline'?resolve(base,c.id+'.rgba'):resolve(r3,c.id+'-brighter.rgba');
  const input=new Uint8ClampedArray(readFileSync(path));assert.equal(hash(input),record.output_sha256);assert.equal(source.length,input.length);
  const w=c.width,h=c.height,out=new Uint8ClampedArray(input.length),s=createIntegrity(w,h),noise=kind==='baseline'?record.plan.noise:1.5;
  const started=performance.now();
  for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-4),bottom=Math.min(h,y+n+4),a=top*w*4,b=bottom*w*4;
   const result=detailStrip(input.subarray(a,b),source.subarray(a,b),w,bottom-top,y-top,n,{offsetY:top,noise,faces,faceReviewComplete:true});out.set(result,y*w*4);inspectStrip(s,input.subarray(a,b),result,y-top,n,y);
  }
  const processingMs=performance.now()-started;assert.equal(hash(input),record.output_sha256);
  let changedPixels=0,maxDelta=0,protectedPixelsChanged=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,d=Math.max(...[0,1,2].map(k=>Math.abs(out[p+k]-input[p+k])));changedPixels+=d>0;maxDelta=Math.max(maxDelta,d);if(d&&faces.some(f=>x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.height))protectedPixelsChanged++;}
  assert.equal(protectedPixelsChanged,0);assert.ok(maxDelta<=4);writeFileSync(resolve(dest,c.id+'-'+kind+'-detail.rgba'),out);
  records.push({id:c.id,kind,width:w,height:h,input_sha256:hash(input),source_sha256:hash(source),output_sha256:hash(out),noise,faceAnnotations:faces,changedPixels,maxDelta,protectedPixelsChanged,integrity:finishIntegrity(s),processingMs});
 }
}
writeFileSync(resolve(dest,'report.json'),JSON.stringify({status:'offline opt-in; not deployed or accepted',records},null,2)+'\n');console.log(JSON.stringify(records.map(r=>({id:r.id,kind:r.kind,changedPixels:r.changedPixels,maxDelta:r.maxDelta,faceChanges:r.protectedPixelsChanged})),null,2));
