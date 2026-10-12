import test from 'node:test';import assert from 'node:assert/strict';
import {assertDimensions,assertFiniteTree,createIntegrity,inspectStrip,finishIntegrity,assertPNG}from '../assets/js/photo-integrity.js';
const rgba=(w,h,v=80,a=255)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?a:v);
test('legitimate flat black/white/transparent/1px pass',()=>{for(const v of[0,80,255])for(const a of[0,127,255]){const d=rgba(1,3,v,a),s=createIntegrity(1,3);inspectStrip(s,d,d,0,3,0);assert.equal(finishIntegrity(s).passed,true);}});
test('whiteout and blackout rejected',()=>{for(const v of[0,255])assert.throws(()=>inspectStrip(createIntegrity(20,10),rgba(20,10,120),rgba(20,10,v),0,10,0),/Catastrophic/);});
test('alpha and hidden RGB corruption rejected',()=>{const d=rgba(2,2,80,0),o=d.slice();o[3]=255;assert.throws(()=>inspectStrip(createIntegrity(2,2),d,o,0,2,0),/Alpha/);o[3]=0;o[0]=90;assert.throws(()=>inspectStrip(createIntegrity(2,2),d,o,0,2,0),/Transparent/);});
test('incomplete and reordered strips fail',()=>{assert.throws(()=>finishIntegrity(createIntegrity(2,2)),/Incomplete/);assert.throws(()=>inspectStrip(createIntegrity(2,2),rgba(2,2),rgba(2,1),0,1,1),/order/);});
test('cross-strip false seam rejected',()=>{const s=createIntegrity(20,2);inspectStrip(s,rgba(20,1),rgba(20,1),0,1,0);assert.throws(()=>inspectStrip(s,rgba(20,1),rgba(20,1,160),0,1,1),/row shift/);});
test('nonfinite values rejected',()=>{for(const v of[NaN,Infinity,-Infinity])assert.throws(()=>assertFiniteTree({tone:new Float32Array([0,v])}),/Non-finite/);});
test('dimension bounds',()=>{assert.doesNotThrow(()=>assertDimensions(6400,5000));for(const d of[[6401,5000],[0,1],[1.5,10],[16385,1]])assert.throws(()=>assertDimensions(...d));});
test('bad encoding and header size mismatch rejected',async()=>{await assert.rejects(assertPNG(new Blob(['bad']),1,1));const d=new Uint8Array(33);d.set([137,80,78,71,13,10,26,10]);const v=new DataView(d.buffer);v.setUint32(8,13);v.setUint32(12,0x49484452);v.setUint32(16,20);v.setUint32(20,10);await assertPNG(new Blob([d],{type:'image/png'}),20,10);await assert.rejects(assertPNG(new Blob([d],{type:'image/png'}),21,10));});

test('severe false color rejected even without whiteout',()=>{const d=rgba(20,10,128),o=d.slice();for(let p=0;p<o.length;p+=4){o[p]=255;o[p+1]=90;o[p+2]=60;}assert.throws(()=>inspectStrip(createIntegrity(20,10),d,o,0,10,0),/false color/);});
