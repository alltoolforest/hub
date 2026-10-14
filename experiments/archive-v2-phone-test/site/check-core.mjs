import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import * as core from './dist/assets/image-enhancer-photo.js';
const modules={wb:false,denoise:false,detail:false,deblock:false,local:false,vibrance:false,punch:false,tone:false};
function plan(d,w,h,options={}){const stats=core.photoStatistics({width:w,height:h});core.collectPhotoStatistics(d,w,h,stats,2);return core.makePhotoPlan(stats,options);}
function run(d,w,h,p,rows=96,faces=[]){const out=new Uint8ClampedArray(d.length);for(let y=0;y<h;y+=rows){const n=Math.min(rows,h-y),top=Math.max(0,y-core.PHOTO_HALO),bottom=Math.min(h,y+n+core.PHOTO_HALO);out.set(core.enhancePhotoStrip(d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{offsetY:top,faces}),y*w*4);}return out;}
const w=512,h=512,d=new Uint8ClampedArray(readFileSync(process.argv[2])),copy=d.slice(),p=plan(d,w,h,{strength:'balanced',sharpness:'auto',sourceMime:'image/png'}),whole=run(d,w,h,p,h),strips=run(d,w,h,p,96);assert.deepEqual(whole,strips);assert.deepEqual(d,copy);
const faces=[{x:0,y:0,width:w,height:h}],portrait=run(d,w,h,plan(d,w,h,{content:'portrait',faceProtection:'strict'}),96,faces);assert.equal(portrait.length,d.length);
assert.deepEqual(run(d,w,h,plan(d,w,h,{modules})),d);assert.deepEqual(run(d,w,h,plan(d,w,h,{content:'text-logo'})),d);
const alpha=d.slice();for(let i=0;i<alpha.length;i+=400){alpha[i+3]=0;}const a=run(alpha,w,h,plan(alpha,w,h));for(let i=0;i<a.length;i+=4)if(alpha[i+3]!==255)assert.deepEqual(a.slice(i,i+4),alpha.slice(i,i+4));
for(const name of ['image-enhancer-photo.js','image-enhancer-wavelet.js','image-enhancer-photo-worker.js'])assert.deepEqual(readFileSync('dist/assets/original/'+name),readFileSync(process.argv[3]+'/'+name));
core.releasePhotoWorkspace();console.log('PASS: opaque strip equality, native buffer length, unchanged input, real portrait dependency, modules-off/graphic identity, alpha/hidden RGB preservation, exact archive engine/worker files. Browser/UI flow not executed.');
