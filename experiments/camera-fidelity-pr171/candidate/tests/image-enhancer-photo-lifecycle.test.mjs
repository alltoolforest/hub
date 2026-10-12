import test from 'node:test';
import assert from 'node:assert/strict';
import { enhancePhotograph } from '../assets/js/image-enhancer-photo-engine.js';

for(const scenario of ['success','cancel','worker-error','message-error','invalid-size','post-error','constructor-error','pre-aborted','decode-aborted']) {
  test(`photo worker lifecycle: ${scenario}`, async()=>{
    const saved={Worker:globalThis.Worker,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap};
    const controller=new AbortController();let closed=0,terminated=0,created=0,posted=0;
    globalThis.OffscreenCanvas=class {};
    globalThis.createImageBitmap=async()=>{if(scenario==='decode-aborted')controller.abort();return {close(){closed++;}};};
    globalThis.Worker=class {
      constructor(){created++;if(scenario==='constructor-error')throw new Error('constructor failed');}
      terminate(){terminated++;}
      postMessage(){
        posted++;
        if(scenario==='post-error')throw new Error('post failed');
        queueMicrotask(()=>{
          if(scenario==='cancel')controller.abort();
          else if(scenario==='worker-error')this.onerror({message:'worker failed'});
          else if(scenario==='message-error')this.onmessageerror();
          else this.onmessage({data:{blob:new Blob(['PNG']),width:scenario==='invalid-size'?12:10,height:10}});
        });
      }
    };
    try {
      if(scenario==='pre-aborted')controller.abort();
      const promise=enhancePhotograph({width:10,height:10},{},controller.signal);
      if(scenario==='success')assert.equal((await promise).width,10);
      else await assert.rejects(promise, scenario.includes('aborted')||scenario==='cancel'?{name:'AbortError'}:Error);
      if(['pre-aborted','decode-aborted'].includes(scenario)){assert.equal(created,0);assert.equal(posted,0);}
      else if(scenario==='constructor-error'){assert.equal(closed,1);assert.equal(terminated,0);}
      else assert.equal(terminated,1,'all terminal paths must release the worker');
      if(scenario==='decode-aborted'||scenario==='post-error')assert.equal(closed,1);
    } finally {Object.assign(globalThis,saved);}
  });
}
