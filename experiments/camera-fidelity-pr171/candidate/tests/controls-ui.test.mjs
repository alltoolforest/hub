// Small DOM/event test double: checks option/state wiring, not browser layout.
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';import{BUILD_ID}from'../assets/js/photo-build.js';
function setup(){
 const html=readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'),nodes=new Map(),calls=[];
 class Element{constructor(){this.value='';this.listeners={};this.dataset={};this.scrollLeft=this.scrollTop=0;this.classList={toggle(){}};}addEventListener(n,f){this.listeners[n]=f;}setAttribute(){}removeAttribute(){}append(){}remove(){}click(){return this.listeners.click?.();}querySelectorAll(){return [...nodes.values()];}}
 for(const m of html.matchAll(/id="([^"]+)"/g))nodes.set(m[1],new Element());
 const get=id=>{assert.ok(nodes.has(id),id);return nodes.get(id);};
 const views=['original','baseline','candidate'].map(v=>{const e=new Element();e.dataset.view=v;return e;});
 for(const [k,v] of Object.entries({mode:'both',preset:'auto',budget:'256','tone-base':'pr171',brightness:'0',contrast:'0',detail:'0','face-review':'unreviewed','face-x':'0','face-y':'0','face-width':'1','face-height':'1'}))get(k).value=v;
 get('file').files=[new Blob(['sample'])];
 const context={BUILD_ID,Blob,AbortController,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},window:{addEventListener(){}},document:{getElementById:get,querySelectorAll:()=>views,createElement:()=>new Element(),body:new Element()},preflightFile:async()=>({width:80,height:123,mime:'image/png'}),enhanceFile:async(file,options)=>{calls.push(options);return {blob:new Blob(['result']),width:80,height:123,diagnostics:{build:BUILD_ID,newTechniques:{detail:{reason:'Off'}}}};}};
 const code=readFileSync(new URL('../ui/lab.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');vm.runInNewContext(code,context);
 return {get,calls};
}
test('UI defaults, R3 preset, reset and baseline-only controls are wired',async()=>{
 const {get,calls}=setup();await get('file').listeners.change();await get('run').click();
 assert.equal(calls.length,2);assert.equal(calls[0].experiment,undefined);assert.equal(calls[1].experiment.brightness,0);
 await get('r3-brighter').click();assert.equal(get('brightness-value').value,'100');await get('run').click();
 assert.equal(calls.at(-1).experiment.tone,'restrained');assert.equal(calls.at(-1).experiment.contrast,100);assert.equal(calls.at(-1).experiment.detail,0);
 get('mode').value='baseline';get('mode').listeners.change();assert.equal(get('experiment-settings').disabled,true);
 await get('reset-adjustments').click();assert.equal(get('brightness').value,'0');
});
test('new files clear face review/detail; text preset maps to supported core option',async()=>{
 const {get,calls}=setup();get('face-review').value='protected';get('detail').value='75';await get('file').listeners.change();assert.equal(get('detail').value,'0');assert.equal(get('face-review').value,'unreviewed');assert.equal(get('face-region').hidden,true);
 get('preset').value='text';await get('run').click();assert.ok(calls.every(c=>c.content==='text-logo'));assert.equal(get('experiment-settings').disabled,false);
});
