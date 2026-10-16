import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {memoryAdvice,reducedDimensions} from '../assets/js/enhancer-v2/input-plan.js';
const source=readFileSync('assets/js/image-enhancer-simple.js','utf8').replace(/^import .*;\n/gm,'').replace('export function mount(root)','function mount(root)').replaceAll('import.meta.url',JSON.stringify('https://test.invalid/assets/js/simple.js'));
function fixture(meta={width:4,height:5}) {
 const elements=new Map(),events={},timers=new Map(),workers=[];let next=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{value:id==='split'?'50':'',hidden:['download','review','recovery','cameraPreview'].includes(id),style:{},handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},removeAttribute(k){delete this[k];}});return elements.get(id);};
 class TestURL extends URL{static createObjectURL(){return 'blob:'+next++;}static revokeObjectURL(){}}
 class Worker{constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage(message){this.message=message;}}
 const context={root:{append(){}},isEnhancerHeicInput:()=>false,inspectPhoto:async()=>meta,memoryAdvice,reducedDimensions,validatePngEnvelope:async()=>{},navigator:{deviceMemory:4},document:{createElement(){return{querySelector:s=>el(s.slice(1))};}},window:{Worker,OffscreenCanvas:class{},createImageBitmap:true,addEventListener(k,fn){events[k]=fn;}},Worker,URL:TestURL,Blob,setTimeout(fn){const id=next++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(source+'\nmount(root);',context);
 el('file').files=[{name:'camera.jpg',size:100*1048576,type:'image/jpeg'}];el('file').handlers.change();
 const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 return {context,el,workers,timers,events,tick,async click(id){el(id).handlers.click();await tick();},async result(width=4,height=5){await workers.at(-1).onmessage({data:{blob:new Blob(['png']),originalPreview:new Blob(['p']),resultPreview:new Blob(['p']),width,height}});}};
}
{
 const f=fixture({width:12000,height:8500});await f.click('run');assert.equal(f.workers.length,0);assert.equal(f.el('recovery').hidden,false);
 await f.click('smaller');assert.equal(f.workers.length,1);assert.equal(f.workers[0].message.decodeOptions.reduced,true);assert.equal(f.workers[0].message.decodeOptions.maxPixels,4e6);
 await f.result(2048,1450);assert.equal(f.el('download').hidden,false);assert.match(f.el('status').textContent,/smaller/);
}
{
 const f=fixture({width:12000,height:8500});await f.click('run');await f.click('run');assert.equal(f.workers.length,1);assert.equal(f.workers[0].message.decodeOptions.reduced,false);
}
{
 const f=fixture();await f.click('run');assert.equal(f.workers.length,1); // 100MB file is not rejected by file-size cutoff.
 f.workers[0].onerror({message:'allocation failed'});assert.equal(f.workers.length,1);assert.equal(f.el('download').hidden,true);
 for(const size of [4e6,1e6,250000]){await f.click('smaller');assert.equal(f.workers.at(-1).message.decodeOptions.maxPixels,size);f.workers.at(-1).onerror({message:'allocation failed'});}
 assert.equal(f.workers.length,4);assert.equal(f.el('smaller').hidden,true);
}
for(const trigger of ['cancel','pagehide','timeout','change']) {
 const f=fixture();await f.click('run');let done;f.context.validatePngEnvelope=()=>new Promise(r=>done=r);const work=f.result();
 if(trigger==='timeout')[...f.timers.values()][0]();else if(trigger==='pagehide')f.events.pagehide();else if(trigger==='change')f.el('file').handlers.change();else await f.click('cancel');
 done();await work;assert.equal(f.el('download').hidden,true);assert.equal(f.timers.size,0);
}
{
 const f=fixture();await f.click('run');await f.workers[0].onmessage({data:{error:'camera preview available',code:'PREVIEW_CONSENT'}});
 assert.equal(f.workers.length,1);assert.equal(f.el('cameraPreview').hidden,false);await f.click('cameraPreview');assert.equal(f.workers[1].message.decodeOptions.allowPreview,true);
}
{
 const f=fixture();await f.click('run');f.context.validatePngEnvelope=async()=>{throw new Error('bad CRC');};await f.result();assert.equal(f.el('download').hidden,true);assert.equal(f.el('recovery').hidden,false);
}
console.log('PASS: large-input advice, native override, no file-size cutoff, explicit progressive reduction, preview consent, stale-result cancellation and invalid export rejection (mocked browser APIs).');
