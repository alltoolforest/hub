import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLifecycle,validateFile,stage} from '../assets/js/scanned-pdf-ocr-lifecycle.js';
import {boundedRanges} from '../assets/js/scanned-pdf-ocr-performance.js';
const f=(name,body)=>new File([body],name);
for(const [name,body,err] of [['good.pdf','%PDF-1.7',null],['good.PDF','%PDF-2.0',null],['empty.pdf','','non-empty'],['fake.pdf','not pdf','header'],['bad.pdf','%PDF-abc','version'],['truncated.pdf','%PDF-1','version'],['wrong.png','%PDF-1.7','PDF file']]) test(name,async()=>{if(err)await assert.rejects(validateFile(f(name,body),15),new RegExp(err));else await validateFile(f(name,body),15)});
test('size cap',async()=>assert.rejects(validateFile(f('large.pdf','%PDF-1.7'),0),/no larger/));
test('exclusive jobs and reset',()=>{const l=createLifecycle(),j=l.start();assert.throws(()=>l.start(),/already/);j.finish();const k=l.start();j.finish();assert.equal(l.active,k);k.finish();assert.equal(l.active,null)});
test('cancel once and late listener',()=>{const j=createLifecycle().start();let n=0;j.onCancel(()=>n++);j.cancel();j.cancel();j.onCancel(()=>n++);assert.equal(n,2);assert.throws(()=>j.check(),/Cancelled/)});
test('unsubscribe',()=>{const j=createLifecycle().start();let n=0;j.onCancel(()=>n++)();j.cancel();assert.equal(n,0)});
test('resolve',async()=>assert.equal(await stage(Promise.resolve(42),createLifecycle().start(),100,'test'),42));
test('reject',async()=>assert.rejects(stage(Promise.reject(Error('broken')),createLifecycle().start(),100,'test'),/broken/));
test('timeout cancels job',async()=>{const j=createLifecycle().start();await assert.rejects(stage(new Promise(()=>{}),j,10,'test'),/timed out/);assert.ok(j.reason)});
test('cancel during stage and late dispose',async()=>{const j=createLifecycle().start();let resolve,disposed;const p=stage(new Promise(r=>resolve=r),j,100,'test',v=>disposed=v);j.cancel();await assert.rejects(p,/Cancelled/);resolve(42);await new Promise(r=>setImmediate(r));assert.equal(disposed,42)});
test('cancelled before stage',async()=>{const j=createLifecycle().start();j.cancel();await assert.rejects(stage(Promise.resolve(1),j,100,'test'),/Cancelled/)});
test('late rejection consumed',async()=>{const j=createLifecycle().start();let reject;const p=stage(new Promise((_,r)=>reject=r),j,100,'test');j.cancel();await assert.rejects(p,/Cancelled/);reject(Error('late'));await new Promise(r=>setImmediate(r))});
test('resolved stage does not later cancel',async()=>{const j=createLifecycle().start();await stage(Promise.resolve(1),j,10,'test');await new Promise(r=>setTimeout(r,25));assert.equal(j.reason,null)});

test('selected pages are deduplicated and processed in document order', () => {
 assert.deepEqual(boundedRanges('7, 3-5, 1, 4',8,8),[0,2,3,4,6]);
});


test('mixed extraction preserves repeated raster lines beyond native duplicates', async () => {
 const {mergeMixed}=await import('../assets/js/scanned-pdf-ocr-quality.js');
 const result=mergeMixed('Repeated heading\nNative only', 'Repeated heading\nRepeated heading\nScanned text\nScanned text');
 assert.equal(result.text.split('Repeated heading').length-1,2);
 assert.equal(result.text.split('Scanned text').length-1,2);
 assert.equal(result.review,true);
});
