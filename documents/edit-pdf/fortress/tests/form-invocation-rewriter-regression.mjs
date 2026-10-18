import assert from 'node:assert/strict';
import {allocateSameLengthResourceName,rewriteFormInvocationName} from '../src/export/form-invocation-rewriter.js';
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const enc=value=>new TextEncoder().encode(value),dec=value=>new TextDecoder('latin1').decode(value);

test('allocator preserves resource-name length and avoids collisions',()=>{
  const name=allocateSameLengthResourceName(new Set(['Fm1','AAA','AAB']),'Fm1',{seed:0});
  assert.equal(name.length,3);assert.notEqual(name,'Fm1');assert.equal(new Set(['Fm1','AAA','AAB']).has(name),false);
});

test('only selected repeated Do invocation is redirected',()=>{
  const source=enc('q /Fm1 Do Q q /Fm1 Do Q');
  const first=rewriteFormInvocationName(source,{operatorIndex:1,expectedResourceName:'Fm1',newResourceName:'A01'});
  assert.equal(dec(first.bytes),'q /A01 Do Q q /Fm1 Do Q');
  assert.equal(first.bytes.length,source.length);
});

test('second repeated invocation can be isolated independently',()=>{
  const source=enc('q /Fm1 Do Q q /Fm1 Do Q');
  const second=rewriteFormInvocationName(source,{operatorIndex:4,expectedResourceName:'Fm1',newResourceName:'B02'});
  assert.equal(dec(second.bytes),'q /Fm1 Do Q q /B02 Do Q');
});

test('wrong expected resource fails closed',()=>{
  assert.throws(()=>rewriteFormInvocationName(enc('/Fm1 Do'),{operatorIndex:0,expectedResourceName:'Fm2',newResourceName:'A02'}),error=>error?.code==='FORM_INVOCATION_RESOURCE_CHANGED');
});

test('different-length resource name is refused to protect later byte offsets',()=>{
  assert.throws(()=>rewriteFormInvocationName(enc('/Fm1 Do'),{operatorIndex:0,expectedResourceName:'Fm1',newResourceName:'LONG'}),error=>error?.code==='FORM_INVOCATION_NAME_LENGTH_MISMATCH');
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
