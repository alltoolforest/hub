// Native diagnostic comparison only. No increased sharpening is evaluated.
// node evaluate-user-photo-r6.mjs input.json output-directory
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{resolve,relative,dirname}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import * as core from'../assets/js/image-enhancer-photo.js';
import{brillianceTrial,vibranceTrial}from'./light-color-r6.js';
import{createIntegrity,inspectStrip,finishIntegrity}from'../assets/js/photo-integrity.js';
const spec=JSON.parse(readFileSync(process.argv[2])),dest=resolve(process.argv[3]),repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');assert.ok(relative(repo,dest).startsWith('../'));mkdirSync(dest,{recursive:true});
const d=new Uint8ClampedArray(readFileSync(spec.raw)),w=spec.width,h=spec.height,hash=x=>createHash('sha256').update(x).digest('hex');assert.equal(hash(d),spec.raw_sha256);assert.equal(d.length,w*h*4);
const faces=spec.faces,stats=core.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);core.collectPhotoStatistics(d.subarray(y*w*4,(y+n)*w*4),w,n,stats,step,y);}
const options={content:'auto',strength:'balanced',sharpness:'auto',sourceMime:'image/jpeg',faces:[]},plan=core.makePhotoPlan(stats,options),base=new Uint8ClampedArray(d.length);
for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-10),bottom=Math.min(h,y+n+10);base.set(core.enhancePhotoStrip(d.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,n,plan,{offsetY:top,faces:[]}),y*w*4);}
const brilliant=brillianceTrial(base,w,h,{amount:.5,noise:plan.noise,faces});
const variants={original:d,pr171:base,brilliance:brilliant,vibrance:vibranceTrial(base,w,h,{amount:1,faces}),combined:vibranceTrial(brilliant,w,h,{amount:.5,faces})},records=[];
for(const [variant,a]of Object.entries(variants)){const integrity=createIntegrity(w,h);for(let y=0;y<h;y+=96){const n=Math.min(96,h-y);inspectStrip(integrity,d.subarray(y*w*4,(y+n)*w*4),a.subarray(y*w*4,(y+n)*w*4),0,n,y);}writeFileSync(resolve(dest,variant+'.rgba'),a);
records.push({variant,sha256:hash(a),integrity:finishIntegrity(integrity)});}
assert.equal(hash(d),spec.raw_sha256);
writeFileSync(resolve(dest,'evidence.json'),JSON.stringify({width:w,height:h,source_sha256:spec.source_sha256,input_sha256:spec.raw_sha256,options,faces,sharpnessTesting:'Excluded; default PR171 auto amount only',plan:{noise:plan.noise,chromaNoise:plan.chromaNoise,mean:plan.mean,range:plan.range,sharp:plan.sharp},variants:records,limitations:['Single diagnostic; not held-out or a clean reference','Manual face regions apply only to new Vibrance/local clarity; baseline has no detected faces','No browser/device validation or quality preference score']},null,2)+'\n');console.log(JSON.stringify(records.map(r=>({variant:r.variant,integrity:r.integrity.passed,meanLumaShift:r.integrity.meanLumaShift,newClippedHighChannels:r.integrity.newClippedHighChannels}))));
