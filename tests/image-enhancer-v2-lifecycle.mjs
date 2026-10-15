import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('assets/js/image-enhancer-simple.js','utf8').replace(/^import .*;\n/, '').replace('export function mount(root)', 'function mount(root)').replaceAll('import.meta.url',JSON.stringify('https://test.invalid/assets/test-app.js'));
function fixture(){
 const elements=new Map(),events={},timers=new Map(),workers=[],revoked=[],urls=[];let next=0;
 const el=id=>{if(!elements.has(id))elements.set(id,{value:({engine:'revised',strength:'balanced',sharpness:'auto',content:'auto',local:'on',split:'50'})[id]||'',hidden:['download','review'].includes(id),style:{},handlers:{},addEventListener(k,fn){this.handlers[k]=fn;},removeAttribute(k){delete this[k];}});return elements.get(id);};
 class TestURL extends URL{static createObjectURL(){const u='blob:test/'+next++;urls.push(u);return u;}static revokeObjectURL(u){revoked.push(u);}}
 class Worker{constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage(v){this.message=v;}}
 const context={root:{append(){}},isEnhancerHeicInput:()=>false,document:{getElementById:el,createElement(){return{querySelector:s=>el(s.slice(1))};}},window:{Worker,OffscreenCanvas:class{},createImageBitmap:true,addEventListener(k,fn){events[k]=fn;}},Worker,URL:TestURL,Blob,setTimeout(fn){const id=next++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},createImageBitmap:async()=>({width:4,height:5,close(){this.closed=true;}})};
 vm.runInNewContext(source+'\nmount(root);',context);el('file').files=[{name:'fixture.jpg',type:'image/jpeg',size:10}];el('file').handlers.change();
 return {context,el,events,timers,workers,revoked,urls,run:()=>el('run').handlers.click(),cancel:()=>el('cancel').handlers.click(),timeout(){[...timers.values()][0]();},result:()=>workers.at(-1).onmessage({data:{blob:new Blob(['fakePNG']),width:4,height:5,diagnostics:{}}})};
}
let passed=0;
for(const trigger of ['cancel','timeout','pagehide']){
 const f=fixture();let resolve;const bitmap={width:4,height:5,close(){this.closed=true;}};f.context.createImageBitmap=()=>new Promise(r=>resolve=r);const pending=f.run();assert.equal(f.timers.size,1);
 if(trigger==='pagehide')f.events.pagehide();else f[trigger]();resolve(bitmap);await pending;assert.ok(bitmap.closed);assert.equal(f.workers.length,0);assert.ok(f.el('download').hidden);assert.equal(f.timers.size,0);passed++;
}
for(const trigger of ['cancel','timeout']){
 const f=fixture();await f.run();let resolve;const check={width:4,height:5,close(){this.closed=true;}};f.context.createImageBitmap=()=>new Promise(r=>resolve=r);const pending=f.result();assert.equal(f.timers.size,1);f[trigger]();resolve(check);await pending;assert.ok(check.closed);assert.ok(f.el('download').hidden);assert.equal(f.timers.size,0);passed++;
}
{
 const f=fixture();await f.run();await f.result();assert.equal(f.el('download').hidden,false);assert.equal(f.timers.size,0);const old=f.el('download').href;f.events.pagehide();assert.ok(f.revoked.includes(old));assert.ok(f.el('download').hidden);assert.ok(!f.el('download').href);await f.run();await f.result();assert.ok(f.el('download').href!==old);assert.equal(f.el('download').hidden,false);passed++;
}
for(const kind of ['worker-error','wrong-dimensions','empty-blob','decode-error']){
 const f=fixture();await f.run();if(kind==='worker-error')f.workers[0].onerror({message:'test failure'});
 else if(kind==='empty-blob')await f.workers[0].onmessage({data:{blob:new Blob([]),width:4,height:5}});
 else {f.context.createImageBitmap=kind==='decode-error'?async()=>{throw new Error('decode failed');}:async()=>({width:3,height:5,close(){}});await f.result();}
 assert.ok(f.el('download').hidden);assert.equal(f.timers.size,0);assert.equal(f.el('run').disabled,false);passed++;
}
console.log(`PASS: ${passed} adapter lifecycle/fault scenarios. Node mocks only; no browser/canvas/OS verification.`);
{
 const f=fixture(),decoded={width:4,height:5,close(){this.closed=true;}};
 f.context.isEnhancerHeicInput=()=>true;f.context.decodeEnhancerHeic=async()=>decoded;
 f.context.OffscreenCanvas=class{constructor(w,h){this.width=w;this.height=h;}getContext(){return{drawImage(){}};}async convertToBlob(){return new Blob(['preview']);}};
 await f.run();assert.ok(decoded.closed);assert.equal(f.workers.length,1);await f.result();assert.equal(f.el('download').hidden,false);
 assert.equal(f.workers[0].message.options.strength,'balanced');assert.equal(f.workers[0].message.options.sharpness,'auto');
}
{
 const f=fixture();await f.run();f.workers[0].onmessageerror();assert.ok(f.el('download').hidden);assert.equal(f.timers.size,0);
}
console.log('PASS: HEIC decode-to-preview lifecycle, automatic approved settings and message-decode failure (mocked).');
