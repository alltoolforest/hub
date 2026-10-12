import{readFileSync,writeFileSync}from'node:fs';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import * as e from'../assets/js/image-enhancer-photo.js';import{createIntegrity,inspectStrip,finishIntegrity,assertFiniteTree}from'../assets/js/photo-integrity.js';
const corpus=JSON.parse(readFileSync(process.argv[2]));const baseline=JSON.parse(readFileSync(process.argv[3]));const records=[];
for(const c of corpus.cases){const d=new Uint8ClampedArray(readFileSync(c.raw)),w=c.width,h=c.height,stats=e.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);e.collectPhotoStatistics(d.subarray(y*w*4,(y+n)*w*4),w,n,stats,step,y);}
const p=e.makePhotoPlan(stats,c.options);assertFiniteTree(p);const out=new Uint8ClampedArray(d.length),s=createIntegrity(w,h);
for(let y=0;y<h;y+=96){const top=Math.max(0,y-e.PHOTO_HALO),n=Math.min(96,h-y),bottom=Math.min(h,y+n+e.PHOTO_HALO),input=d.subarray(top*w*4,bottom*w*4);const result=e.enhancePhotoStrip(input,w,bottom-top,y-top,n,p,{offsetY:top,faces:[]});inspectStrip(s,input,result,y-top,n,y);out.set(result,y*w*4);}
const hash=createHash('sha256').update(out).digest('hex');assert.equal(hash,baseline.records.find(r=>r.id===c.id).output_sha256);records.push({id:c.id,baselineExact:true,integrity:finishIntegrity(s)});}
if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(records,null,2)+'\n');console.log(`PASS ${records.length} cases baseline-exact and integrity guards accept inherited outputs`);
