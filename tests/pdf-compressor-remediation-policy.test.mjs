import test from 'node:test';
import assert from 'node:assert/strict';
import {planCompression,describeResult} from '../assets/js/pdf-compressor-v2/mode-policy.mjs';
import {createRunController} from '../assets/js/pdf-compressor-v2/run-controller.mjs';
test('Task 6 modes and security',()=>{
  for(const mode of ['lossless','balanced','strong'])
    assert.equal(planCompression({mode}).allowed,true);
  assert.equal(planCompression({mode:'strong',signed:true}).allowed,false);
  assert.equal(planCompression({encrypted:true}).allowed,false);
  assert.throws(()=>planCompression({mode:'extreme'}),RangeError);
});
test('Task 6 factual savings',()=>{
  assert.deepEqual(describeResult({inputBytes:100,outputBytes:90}).savedBytes,10);
  assert.equal(describeResult({inputBytes:100,outputBytes:100}).success,false);
  assert.equal(describeResult({inputBytes:100,outputBytes:101}).success,false);
});
test('Task 8 lifecycle, abort and stale result',()=>{
  const run=createRunController();
  const a=run.start();assert.equal(run.state,'running');
  assert.throws(()=>run.start());
  assert.equal(run.cancel(),true);assert.equal(a.aborted,true);
  assert.equal(run.complete(a),false);
  const b=run.start();assert.equal(run.complete(a),false);
  assert.equal(run.complete(b),true);assert.equal(run.state,'completed');
  assert.equal(run.reset(),true);assert.equal(run.state,'idle');
});
