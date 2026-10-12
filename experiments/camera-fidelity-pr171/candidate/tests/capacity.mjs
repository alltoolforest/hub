// Node processing qualification ONLY: no browser decode/encode/device claims.
import{createHash}from'node:crypto';import{writeFileSync}from'node:fs';import assert from'node:assert/strict';
import * as e from'../assets/js/image-enhancer-photo.js';import{memoryPlan}from'../assets/js/photo-budget.js';import{createIntegrity,inspectStrip,finishIntegrity}from'../assets/js/photo-integrity.js';
const records=[];
for(const[w,h]of[[1000,1000],[3000,2000],[4000,3000],[6000,4000],[6400,5000],[16384,3]]){
 const budget=memoryPlan(w,h,{memoryBudgetMiB:512}),rows=budget.rows;
 const stats=e.photoStatistics(),sample=new Uint8ClampedArray(w*96*4);for(let p=0;p<sample.length;p+=4){sample[p]=sample[p+1]=sample[p+2]=128;sample[p+3]=255;}
 for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);e.collectPhotoStatistics(sample.subarray(0,w*n*4),w,n,stats,Math.max(2,Math.ceil(Math.sqrt(w*h/90000))),y);}
 const plan=e.makePhotoPlan(stats,{}),state=createIntegrity(w,h),hash=createHash('sha256'),start=performance.now();let totalBytes=0;
 for(let y=0;y<h;y+=rows){const top=Math.max(0,y-10),n=Math.min(rows,h-y),bottom=Math.min(h,y+n+10),d=new Uint8ClampedArray(w*(bottom-top)*4);for(let p=0;p<d.length;p+=4){d[p]=d[p+1]=d[p+2]=128;d[p+3]=255;}const o=e.enhancePhotoStrip(d,w,bottom-top,y-top,n,plan,{offsetY:top});inspectStrip(state,d,o,y-top,n,y);hash.update(o);totalBytes+=o.length;}
 assert.equal(totalBytes,w*h*4);records.push({width:w,height:h,pixels:w*h,rows,processedBytes:totalBytes,hash:hash.digest('hex'),ms:performance.now()-start,integrity:finishIntegrity(state),budget,scope:'Node synthetic processing; output streamed into hash, no encoded image or phone test'});console.log('PASS',w,h,Math.round(records.at(-1).ms)+'ms');}
writeFileSync(process.argv[2],JSON.stringify(records,null,2)+'\n');
