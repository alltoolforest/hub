import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import * as core from './dist/assets/image-enhancer-photo.js';
import * as old from './dist/assets/original/image-enhancer-photo.js';
const off={wb:false,denoise:false,detail:false,deblock:false,local:false,vibrance:false,punch:false,tone:false};
function plan(c,d,w,h,o={}){const s=c.photoStatistics({width:w,height:h});c.collectPhotoStatistics(d,w,h,s,2);return c.makePhotoPlan(s,{strength:'balanced',sharpness:'auto',sourceMime:'image/png',...o});}
function run(c,d,w,h,p,rows=h){const out=new Uint8ClampedArray(d.length);for(let y=0;y<h;y+=rows){const n=Math.min(rows,h-y),top=Math.max(0,y-c.PHOTO_HALO),bottom=Math.min(h,y+n+c.PHOTO_HALO);out.set(c.enhancePhotoStrip(d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,p,{offsetY:top}),y*w*4);}return out;}
function gray(w,h,f){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;d.set([f(x,y),f(x,y),f(x,y),255],i);}return d;}
const report={tests:[],photos:[]};
for(const orientation of ['vertical','horizontal']){
 const w=160,h=180,d=gray(w,h,(x,y)=>(orientation==='vertical'?x<80:y<90)?80:160),o={modules:{...off,detail:true}};
 const before=run(old,d,w,h,plan(old,d,w,h,o)),after=run(core,d,w,h,plan(core,d,w,h,o));
 const range=a=>{let min=255,max=0;for(let i=0;i<a.length;i+=4){min=Math.min(min,a[i]);max=Math.max(max,a[i]);}return[min,max];};
 assert.deepEqual(range(after),[80,160]);report.tests.push({test:orientation+' neutral edge overshoot',original:range(before),revised:range(after),pass:true});
}
const d=gray(64,300,(x,y)=>y===0?230:80);for(let y=1;y<180;y++)for(let x=0;x<64;x++)d.set([13,23,33,0],(y*64+x)*4);
const p=plan(core,d,64,300),whole=run(core,d,64,300,p);for(const rows of [17,32,96,192])assert.deepEqual(run(core,d,64,300,p,rows),whole);
const hidden=d.slice();for(let i=0;i<hidden.length;i+=4)if(hidden[i+3]!==255)hidden.set([255,0,255,0],i);
const hiddenOut=run(core,hidden,64,300,plan(core,hidden,64,300),32);for(let i=0;i<d.length;i+=4){if(d[i+3]===255)assert.deepEqual(whole.slice(i,i+4),hiddenOut.slice(i,i+4));else assert.deepEqual(whole.slice(i,i+4),d.slice(i,i+4));}
report.tests.push({test:'transparent gap strip equality (17/32/96/192), hidden RGB independence, alpha preservation',pass:true});
const waves=gray(173,215,(x,y)=>Math.round(125+30*Math.sin(x/9)+20*Math.cos(y/31)));
const sharpOff=plan(core,waves,173,215,{sharpness:'off',modules:{...off,detail:true}});assert.ok(sharpOff.levels.every(l=>l.gain===0));assert.deepEqual(run(core,waves,173,215,sharpOff),waves);
report.tests.push({test:'sharpness off disables every detail scale',pass:true});
if(process.argv[2]){
 const root=process.argv[2];const cases=JSON.parse(readFileSync(root+'/cases.json'));
 for(const c of cases){const d=new Uint8ClampedArray(readFileSync(root+'/'+c.name+'.rgba')),copy=d.slice(),options={sourceMime:'image/jpeg'};
  const outputs={};for(const [name,engine] of [['original',old],['revised',core]]){const p=plan(engine,d,c.width,c.height,options),start=performance.now();outputs[name]=run(engine,d,c.width,c.height,p,96);const ms=performance.now()-start;writeFileSync(root+'/'+c.name+'-'+name+'.rgba',outputs[name]);if(name==='revised'){assert.deepEqual(outputs[name],run(engine,d,c.width,c.height,p,c.height));assert.deepEqual(d,copy);}report.photos.push({image:c.name,engine:name,width:c.width,height:c.height,runtimeMs:Math.round(ms),noiseEstimate:p.noise});}
  let changed=0;for(let i=0;i<d.length;i+=4)if(outputs.original[i]!==outputs.revised[i]||outputs.original[i+1]!==outputs.revised[i+1]||outputs.original[i+2]!==outputs.revised[i+2])changed++;
  report.tests.push({test:c.name+' native dimensions, input immutability and full/96-row equality',pass:true,changedPixels:changed});
 }
 writeFileSync(root+'/revision-tests.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
