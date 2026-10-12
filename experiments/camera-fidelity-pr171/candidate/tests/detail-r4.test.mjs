import test from'node:test';import assert from'node:assert/strict';
import{detailStrip}from'../research/detail-r4.js';
const w=80,h=73;
function image(fn){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4;d.set([fn(x,y),fn(x,y),fn(x,y),255],p);}return d;}
function run(d,rows=h,opts={}){const o=new Uint8ClampedArray(d.length);for(let y=0;y<h;y+=rows){const top=Math.max(0,y-4),n=Math.min(rows,h-y),bottom=Math.min(h,y+n+4),s=d.subarray(top*w*4,bottom*w*4);o.set(detailStrip(s,s,w,bottom-top,y-top,n,{offsetY:top,faceReviewComplete:true,...opts}),y*w*4);}return o;}
test('coherent soft edge gains definition; bounds prevent overshoot and large changes',()=>{
 const d=image(x=>60+100/(1+Math.exp(-(x-40)/2))),o=run(d);let changed=0;
 for(let p=0;p<d.length;p+=4){changed+=o[p]!==d[p];assert.ok(Math.abs(o[p]-d[p])<=4);assert.ok(o[p]>=60&&o[p]<=160);}assert.ok(changed>0);
 const cross=(a,level)=>{for(let x=1;x<w;x++){const v=a[(36*w+x)*4],prev=a[(36*w+x-1)*4];if(v>=level)return x-1+(level-prev)/(v-prev);}};
 const width=a=>cross(a,140)-cross(a,80);assert.ok(width(o)<width(d),'20–80 percent edge transition must narrow');
});
test('flat, hard-step and high-noise uncertain cases are not sharpened',()=>{
 for(const d of [image(()=>80),image(x=>x<40?50:180),image((x,y)=>90+((x*17+y*31)%19)-9)])assert.deepEqual(run(d,h,{noise:12}),d);
});
test('strip partitions match; face interior, alpha and input are preserved',()=>{
 const d=image(x=>60+100/(1+Math.exp(-(x-40)/2)));d[20*w*4+3]=0;const copy=d.slice(),faces=[{x:34,y:30,width:14,height:20}];
 const o=run(d,h,{faces});assert.deepEqual(run(d,16,{faces}),o);assert.deepEqual(run(d,31,{faces}),o);assert.deepEqual(d,copy);
 for(let y=30;y<50;y++)for(let x=34;x<48;x++){const p=(y*w+x)*4;assert.deepEqual(o.slice(p,p+4),d.slice(p,p+4));}
 for(let p=0;p<d.length;p+=4){assert.equal(o[p+3],d[p+3]);if(d[p+3]!==255)assert.deepEqual(o.slice(p,p+4),d.slice(p,p+4));}
});
test('unreviewed faces and malformed inputs are rejected',()=>{
 const d=image(()=>80);assert.throws(()=>detailStrip(d,d,w,h,0,h));assert.throws(()=>run(d,h,{noise:NaN}));assert.throws(()=>run(d,h,{faces:[{x:0,y:0,width:-1,height:3}]}));
});
