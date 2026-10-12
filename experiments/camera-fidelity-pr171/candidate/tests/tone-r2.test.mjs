import test from 'node:test';
import assert from 'node:assert/strict';
import {restrainedTonePlan} from '../research/tone-r2.js';
import * as engine from '../assets/js/image-enhancer-photo.js';

test('bounded tone is monotonic, preserves endpoints and cannot exceed original lift', () => {
  for (const gamma of [.4, .68, .9, 1, 1.16, 2]) {
    const tone = Float32Array.from({length:256}, (_,i) => 255 * (i/255)**gamma);
    const p = {tone, graphic:false}, original = tone.slice(), r = restrainedTonePlan(p);
    assert.deepEqual(tone, original);
    assert.equal(r.tone[0],0); assert.equal(r.tone[255],255);
    for (let i=0;i<256;i++) {
      const t=r.tone[i];
      if(i) assert.ok(t>=r.tone[i-1]);
      if(tone[i]>i) {
        assert.ok(t>=i && t<=tone[i]);
        assert.ok(t-i<=18.00002 && t<=i*1.35+.00002);
        assert.ok(t-i<=(255-i)*.3+.00002);
      } else assert.equal(t,tone[i]);
    }
  }
});
test('graphic plans are unchanged and malformed curves fail closed', () => {
  const tone=Float32Array.from({length:256},(_,i)=>i);
  assert.deepEqual(restrainedTonePlan({tone,graphic:true}).tone,tone);
  for(const value of [NaN,Infinity,-1,300,1]) {
    const bad=tone.slice();bad[100]=value;
    assert.throws(()=>restrainedTonePlan({tone:bad}));
  }
});

test('full frame and different strip sizes match; alpha, hidden RGB and input survive', () => {
  const w=71,h=153,data=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=(y*w+x)*4;data.set([x*2,y%140,(x+y)%200,x<7?x*40:255],p);
  }
  const original=data.slice(),stats=engine.photoStatistics();
  for(let y=0;y<h;y+=96)engine.collectPhotoStatistics(data.subarray(y*w*4,Math.min(h,y+96)*w*4),w,Math.min(96,h-y),stats,2,y);
  const plan=restrainedTonePlan(engine.makePhotoPlan(stats,{strength:'balanced'}));
  const render=rows=>{
    const out=new Uint8ClampedArray(data.length);
    for(let y=0;y<h;y+=rows){const n=Math.min(rows,h-y),top=Math.max(0,y-10),bottom=Math.min(h,y+n+10);
      out.set(engine.enhancePhotoStrip(data.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,plan,{offsetY:top}),y*w*4);
    }return out;
  };
  const whole=render(h);
  for(const rows of [16,37,96])assert.deepEqual(render(rows),whole);
  assert.deepEqual(data,original);
  for(let p=0;p<data.length;p+=4){assert.equal(whole[p+3],data[p+3]);if(data[p+3]!==255)assert.deepEqual(whole.slice(p,p+4),data.slice(p,p+4));}
});
