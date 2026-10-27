import test from 'node:test';import assert from 'node:assert/strict';
import {pdfOperationQueue} from '../assets/js/document-editor-v2/pdf-operations.js';
test('PDF queue waits for applied edits and serializes autosave/export',async()=>{
 const state={commitPending:true,hasPendingEdit:true},queue=pdfOperationQueue(()=>({getState:()=>state}),{interval:1,timeout:500}),events=[];
 const a=queue.run(async()=>{events.push('snapshot');await new Promise(r=>setTimeout(r,10));events.push('saved');});
 const b=queue.run(async()=>events.push('export'));
 setTimeout(()=>{state.commitPending=false;state.hasPendingEdit=false;events.push('committed');},10);
 await Promise.all([a,b]);assert.deepEqual(events,['committed','snapshot','saved','export']);
});
test('unfinished edits are refused and a failed queue operation does not poison subsequent exports',async()=>{
 const state={hasPendingEdit:true},queue=pdfOperationQueue(()=>({getState:()=>state}),{interval:1,timeout:5});
 await assert.rejects(queue.run(()=>assert.fail()),/Press Done/);state.hasPendingEdit=false;
 assert.equal(await queue.run(()=>42),42);state.busy=true;await assert.rejects(queue.ready(),/still running/);
});
