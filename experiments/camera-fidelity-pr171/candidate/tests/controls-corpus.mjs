// Verify composed defaults against retained PR171 and the R3 preset against its
// earlier offline output. No quality measurements are rerun or relabeled.
import{readFileSync,writeFileSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import * as e from'../assets/js/image-enhancer-photo.js';
import{experimentControls,controlledPlan,renderControlledStrip}from'../assets/js/photo-controls.js';
const corpus=JSON.parse(readFileSync(process.argv[2])),baseline=JSON.parse(readFileSync(process.argv[3])),r3=JSON.parse(readFileSync(process.argv[4])),hash=a=>createHash('sha256').update(a).digest('hex'),records=[];
for(const c of corpus.cases){const d=new Uint8ClampedArray(readFileSync(c.raw)),w=c.width,h=c.height,s=e.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));assert.equal(hash(d),c.input_sha256);
 for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);e.collectPhotoStatistics(d.subarray(y*w*4,(y+n)*w*4),w,n,s,step,y);}
 const basePlan=e.makePhotoPlan(s,c.options);
 for(const kind of ['default','r3']){const cts=experimentControls(kind==='r3'?{tone:'restrained',brightness:100,contrast:100}:{},w,h),plan=controlledPlan(basePlan,cts),out=new Uint8ClampedArray(d.length);
  for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-10),bottom=Math.min(h,y+n+10);out.set(renderControlledStrip(e,d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,plan,cts,{enabled:false},{offsetY:top}),y*w*4);}
  const ref=kind==='default'?baseline.records.find(r=>r.id===c.id):r3.records.find(r=>r.id===c.id&&r.variant==='brighter');if(ref){assert.equal(hash(out),ref.output_sha256,`${c.id} ${kind} changed`);records.push({id:c.id,kind,exact:true,sha256:hash(out)});}
 }
 assert.equal(hash(d),c.input_sha256);
}
if(process.argv[5])writeFileSync(resolve(process.argv[5]),JSON.stringify(records,null,2)+'\n');console.log(`PASS ${records.length} retained default/R3 output hashes`);
