import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 OCR_ROTATIONS,OCR_PREPARATIONS,ocrSettings,preparedDimensions,drawPreparedOcr,
 webpDimensions,isHeifContainer,validatePhoneImage,ocrProgressMilestone
} from '../assets/js/image-ocr-prep.js';
import {recognizeSafely,withinTime,createWorkerSafely,withOcrWorker} from '../assets/js/image-ocr-reliability.js';

const app=readFileSync(new URL('../assets/js/image-to-text-ocr.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/image-to-text-ocr.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../documents/image-to-text/index.html',import.meta.url),'utf8');

test('supported orientation and contrast are validated, never inferred',()=>{
 assert.deepEqual(OCR_ROTATIONS,[0,90,180,270]);
 assert.deepEqual(OCR_PREPARATIONS,['original','contrast']);
 assert.deepEqual(ocrSettings('90','original'),{rotation:90,preparation:'original'});
 assert.throws(()=>ocrSettings('45'),/rotation/);
 assert.throws(()=>ocrSettings('NaN'),/rotation/);
 assert.throws(()=>ocrSettings('90','hallucinate'),/Original or Gentle contrast/);
});
test('90 and 270 degrees swap dimensions under the existing three-megapixel limit',()=>{
 assert.deepEqual(preparedDimensions(140,80,0),{width:140,height:80});
 assert.deepEqual(preparedDimensions(140,80,90),{width:80,height:140});
 assert.deepEqual(preparedDimensions(140,80,180),{width:140,height:80});
 assert.deepEqual(preparedDimensions(140,80,270),{width:80,height:140});
});
test('original preparation uses exactly one image draw and no filter',()=>{
 let drawn=0,saves=0,restores=0;
 const ctx={save(){saves++},restore(){restores++},drawImage(...args){drawn++;assert.deepEqual(args.slice(1),[0,0,140,80])},
  translate(){throw Error('unexpected translation')},rotate(){throw Error('unexpected rotation')},
  set filter(v){throw Error('unexpected filter: '+v)}};
 drawPreparedOcr(ctx,{width:140,height:80},{width:140,height:80},ocrSettings('0','original'));
 assert.equal(drawn,1);assert.equal(saves,1);assert.equal(restores,1);
});
test('conservative preparation rotates and grayscale contrast, no synthetic text generation',()=>{
 const events=[];
 const ctx={save(){events.push('save')},restore(){events.push('restore')},
  translate(...a){events.push(['translate',...a])},rotate(a){events.push(['rotate',a])},
  drawImage(...a){events.push(['draw',...a.slice(1)])},
  set filter(v){events.push(['filter',v])}};
 drawPreparedOcr(ctx,{width:140,height:80},{width:80,height:140},ocrSettings('90','contrast'));
 assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='filter'&&/grayscale/.test(e[1])));
 assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='rotate'&&Math.abs(e[1]-Math.PI/2)<0.001));
 assert.deepEqual(events.at(-1),'restore');
});
test('render failures restore canvas drawing state',()=>{
 let restored=false;
 const ctx={save(){},restore(){restored=true},drawImage(){throw Error('decode error')}};
 assert.throws(()=>drawPreparedOcr(ctx,{width:30,height:20},{width:30,height:20},ocrSettings()),/decode error/);
 assert.ok(restored);
});
test('invalid rotation dimensions are rejected before render',()=>{
 assert.throws(()=>drawPreparedOcr({}, {width:100,height:50},{width:100,height:50},ocrSettings('90')),/dimensions/);
});
test('WebP VP8X extended dimensions and source limits are preflighted',async()=>{
 const b=new Uint8Array(30);
 b.set(Buffer.from('RIFF'),0);b.set(Buffer.from('WEBP'),8);b.set(Buffer.from('VP8X'),12);
 b[24]=143;b[25]=1;b[27]=99;
 assert.deepEqual(webpDimensions(b),{width:400,height:100});
 const file={slice:()=>({arrayBuffer:async()=>b.buffer}),size:b.byteLength};
 assert.deepEqual(await validatePhoneImage(file,'webp',true),{width:400,height:100});
 b[24]=255;b[25]=255;b[26]=0;b[27]=255;b[28]=255;b[29]=0;
 await assert.rejects(()=>validatePhoneImage(file,'webp',true),/too large/);
});
test('WebP VP8 lossy and VP8L lossless headers are parsed',()=>{
 const p=new Uint8Array(30);p.set(Buffer.from('RIFF'),0);p.set(Buffer.from('WEBP'),8);
 p.set(Buffer.from('VP8 '),12);p[23]=157;p[24]=1;p[25]=42;p[26]=120;p[28]=80;
 assert.deepEqual(webpDimensions(p),{width:120,height:80});
 p.set(Buffer.from('VP8L'),12);p[20]=47;p[21]=99;p[22]=0;p[23]=0;p[24]=0;
 assert.deepEqual(webpDimensions(p),{width:100,height:1});
});
test('invalid WebP header is not accepted',()=>{
 for(const b of [new Uint8Array([1,2,3]),new Uint8Array(30)])
  assert.throws(()=>webpDimensions(b),/invalid header/);
});
test('HEIF brand is required and large HEIC is rejected before decode',async()=>{
 const header=new Uint8Array(32);
 header.set(Buffer.from('ftyp'),4);header.set(Buffer.from('heic'),8);
 assert.ok(isHeifContainer(header));
 const file={size:1000,slice:()=>({arrayBuffer:async()=>header.buffer})};
 assert.equal(await validatePhoneImage(file,'heic',true),null);
 assert.equal(isHeifContainer(new Uint8Array(32)),false);
 await assert.rejects(()=>validatePhoneImage({...file,size:20*1024*1024},'heic',true),/too large/);
 await assert.rejects(()=>validatePhoneImage({...file,slice:()=>({arrayBuffer:async()=>new ArrayBuffer(32)})},'heic',true),/invalid/);
});
test('accessible milestones announce at most once per 20 percent',()=>{
 assert.deepEqual(ocrProgressMilestone(.2,'recognizing',0),{value:20,announce:true,milestone:20,text:'recognizing'});
 assert.equal(ocrProgressMilestone(.26,'recognizing',20).announce,false);
 assert.equal(ocrProgressMilestone(.399,'recognizing',20).milestone,20);
 assert.equal(ocrProgressMilestone(.99,'recognizing',80).announce,false);
 assert.equal(ocrProgressMilestone(1,'recognizing',80).announce,true);
});
test('abort before operation leaves no recognition work started',async()=>{
 const controller=new AbortController();controller.abort();
 let invoked=false;
 await assert.rejects(()=>withinTime(()=>{invoked=true},100,'OCR',controller.signal),{name:'AbortError'});
 assert.equal(invoked,false);
});
test('abort in progress rejects promptly, then ignores late operation success',async()=>{
 const controller=new AbortController();
 const work=withinTime(()=>new Promise(resolve=>setTimeout(()=>resolve('late'),70)),500,'OCR',controller.signal);
 controller.abort();
 await assert.rejects(()=>work,{name:'AbortError'});
});
test('abort during late worker startup cleans the arriving worker',async()=>{
 let terminations=0;
 const ctrl=new AbortController();
 const task=createWorkerSafely(()=>new Promise(resolve=>setTimeout(()=>resolve({
  recognize:async()=>({data:{text:'late'}}),terminate:async()=>{terminations++}
 }),25)),1000,ctrl.signal);
 ctrl.abort();
 await assert.rejects(()=>task,{name:'AbortError'});
 await new Promise(r=>setTimeout(r,45));
 assert.equal(terminations,1);
});
test('abort during canvas recognition releases canvas and worker',async()=>{
 const ctrl=new AbortController();let workerClose=0,canvas;
 const process=withOcrWorker(async()=>({recognize:()=>new Promise(()=>{}),terminate:async()=>{workerClose++}}),
  worker=>recognizeSafely(worker,{width:50,height:30},(w,h)=>{
   canvas={width:w,height:h,getContext:()=>({drawImage(){}})};return canvas;
  },{signal:ctrl.signal}),{signal:ctrl.signal});
 await new Promise(r=>setTimeout(r,10));ctrl.abort();
 await assert.rejects(()=>process,{name:'AbortError'});
 assert.equal(workerClose,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});
test('source preview, progress, retry and cancellation controls are wired within the isolated tool',()=>{
 assert.match(app,/class:'ocr-source'/);
 assert.match(app,/class:'selected-ocr-source'/);
 assert.match(app,/const previewRegion=/);
 assert.match(app,/class:'ocr-progress-area'/);
 assert.match(app,/aria-label':'OCR recognition progress'/);
 assert.match(app,/cancel\.addEventListener\('click'/);
 assert.match(app,/activeController\.abort\(\)/);
 assert.match(app,/text\.readOnly=true/);
 assert.match(app,/clearOutputs\(\);\s*text\.value=recognized/);
 assert.match(app,/role:'status','aria-live':'polite'/);
 assert.match(app,/\.webp,.heic,.heif/);
});
test('stylesheet remains strictly scoped to image-to-text and contains small screen rules',()=>{
 assert.match(html,/assets\/css\/image-to-text-ocr\.css/);
 assert.match(css,/body\[data-tool="image-to-text"\]/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.doesNotMatch(html,/assets\/css\/application-prep\.css/);
});
