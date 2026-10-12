import test from'node:test';import assert from'node:assert/strict';import{trialDenoise,trialDetail}from'../assets/js/photo-trials.js';
const w=64,h=64;const image=()=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:100+((i*37)%13)-6);
const map={width:w,height:h,tile:64,cols:1,rows:1,cells:Array.from({length:3},()=>({noise:4,chroma:5,confidence:1}))};
test('denoise lowers synthetic flat error without shifting dimensions/alpha',()=>{const d=image(),o=trialDenoise(d,w,h,map);const err=a=>a.reduce((s,v,i)=>s+(i%4===3?0:(v-100)**2),0);assert.ok(err(o)<err(d));assert.equal(o.length,d.length);for(let p=3;p<d.length;p+=4)assert.equal(o[p],d[p]);});
test('unknown confidence leaves trials unchanged',()=>{const m={...map,cells:map.cells.map(c=>({...c,confidence:0}))},d=image();assert.deepEqual(trialDenoise(d,w,h,m),d);assert.deepEqual(trialDetail(d,w,h,m),d);});
test('actual face rectangles protect all new trial changes',()=>{const d=image(),faces=[{x:10,y:10,width:25,height:25}];for(const fn of[trialDenoise,trialDetail]){const o=fn(d,w,h,map,{faces});for(let y=10;y<35;y++)for(let x=10;x<35;x++)assert.deepEqual(o.slice((y*w+x)*4,(y*w+x)*4+4),d.slice((y*w+x)*4,(y*w+x)*4+4));}});
test('transparency preserved',()=>{const d=image();for(let p=3;p<d.length;p+=4)d[p]=127;for(const fn of[trialDenoise,trialDetail])assert.deepEqual(fn(d,w,h,map),d);});
