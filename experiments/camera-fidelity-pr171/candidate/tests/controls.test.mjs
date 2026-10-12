import test from 'node:test';import assert from 'node:assert/strict';
import * as e from '../assets/js/image-enhancer-photo.js';
import {experimentControls,detailDecision,controlledPlan,renderControlledStrip,finishControlled} from '../assets/js/photo-controls.js';
import {detailStrip} from '../research/detail-r4.js';
import {memoryPlan} from '../assets/js/photo-budget.js';
test('zero controls are a pixel-exact no-op and invalid values fail closed',()=>{
 const c=experimentControls(undefined,80,123),d=new Uint8ClampedArray([1,2,3,255]);assert.equal(finishControlled(d,c),d);
 for(const value of [{brightness:NaN},{contrast:101},{detail:-1},{tone:'bad'},{brightness:'5'},null])assert.throws(()=>experimentControls(value,80,123));
});
test('detail needs reviewed valid faces; JPEG/noise/graphics gates stay closed',()=>{
 assert.throws(()=>experimentControls({detail:50},80,123));
 assert.throws(()=>experimentControls({detail:50,faceReview:'protected'},80,123));
 assert.throws(()=>experimentControls({detail:50,faceReview:'protected',regions:[{x:70,y:0,width:20,height:20}]},80,123));
 const c=experimentControls({detail:50,faceReview:'no-faces'},80,123),p={noise:1,chromaNoise:1,blockStrength:0};
 assert.equal(detailDecision(c,p,'image/png').enabled,true);
 for(const [plan,mime] of [[p,'image/jpeg'],[{...p,noise:4},'image/png'],[{...p,chromaNoise:4},'image/png'],[{...p,graphic:true},'image/png'],[{...p,portrait:true},'image/png']])assert.equal(detailDecision(c,plan,mime).enabled,false);
});
test('combined core/tone/detail equals full-frame reference across strip boundaries',()=>{
 const w=83,h=211,d=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,v=50+90/(1+Math.exp(-(x+y*.1-45)/2));d.set([v+8,v,v-5,(x<3&&y<40)?80:255],p);}
 const s=e.photoStatistics();for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);e.collectPhotoStatistics(d.subarray(y*w*4,(y+n)*w*4),w,n,s,2,y);}
 const c=experimentControls({tone:'restrained',brightness:100,contrast:100,detail:80,faceReview:'protected',regions:[{x:25,y:80,width:25,height:45}]},w,h),p=controlledPlan(e.makePhotoPlan(s,{}),c),decision={enabled:true};
 const core=e.enhancePhotoStrip(d,w,h,0,h,p),tone=finishControlled(core,c);
 const expected=detailStrip(tone,d,w,h,0,h,{noise:Math.max(1,p.noise),faces:c.faces,faceReviewComplete:true,amount:.8});
 for(const rows of [16,37,96]){const out=new Uint8ClampedArray(d.length);for(let y=0;y<h;y+=rows){const n=Math.min(rows,h-y),top=Math.max(0,y-14),bottom=Math.min(h,y+n+14);out.set(renderControlledStrip(e,d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,c,decision,{offsetY:top}),y*w*4);}assert.deepEqual(out,expected);}
 for(let y=80;y<125;y++)for(let x=25;x<50;x++){const q=(y*w+x)*4;assert.deepEqual(expected.slice(q,q+4),tone.slice(q,q+4));}
});
test('detail working buffers are included in memory estimate',()=>{
 const a=memoryPlan(4000,3000,{memoryBudgetMiB:768}),b=memoryPlan(4000,3000,{memoryBudgetMiB:768,experimentalDetail:true});assert.ok(b.estimatedBytes>a.estimatedBytes);assert.ok(b.rows<=a.rows);
 assert.throws(()=>memoryPlan(8000,4000,{experimentalDetail:true}));
});
