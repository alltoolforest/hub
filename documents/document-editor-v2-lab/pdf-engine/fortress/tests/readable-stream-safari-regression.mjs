import assert from 'node:assert/strict';
import { installReadableStreamAsyncIteration } from '../src/rendering/browser-compat.js';

class FakeReadableStream{
  constructor(chunks=[]){this.chunks=[...chunks];this.cancelled=[];this.releases=0;}
  getReader(){
    const owner=this;let index=0;
    return {
      async read(){return index<owner.chunks.length?{value:owner.chunks[index++],done:false}:{value:undefined,done:true};},
      async cancel(value){owner.cancelled.push(value);},
      releaseLock(){owner.releases++;},
    };
  }
}

assert.equal(typeof FakeReadableStream.prototype.values,'undefined');
assert.equal(typeof FakeReadableStream.prototype[Symbol.asyncIterator],'undefined');
assert.equal(installReadableStreamAsyncIteration(FakeReadableStream),true);
assert.equal(typeof FakeReadableStream.prototype.values,'function');
assert.equal(typeof FakeReadableStream.prototype[Symbol.asyncIterator],'function');

const stream=new FakeReadableStream(['a','b','c']);
const seen=[];
for await(const value of stream)seen.push(value);
assert.deepEqual(seen,['a','b','c']);
assert.equal(stream.releases,1);
assert.deepEqual(stream.cancelled,[]);

const stopped=new FakeReadableStream([1,2,3]);
const iterator=stopped.values();
assert.deepEqual(await iterator.next(),{value:1,done:false});
assert.deepEqual(await iterator.return('stop'),{value:'stop',done:true});
assert.deepEqual(stopped.cancelled,['stop']);
assert.equal(stopped.releases,1);

const preserved=new FakeReadableStream([1,2]);
const noCancel=preserved.values({preventCancel:true});
await noCancel.next();
await noCancel.return('done');
assert.deepEqual(preserved.cancelled,[]);
assert.equal(preserved.releases,1);

class NativeLikeStream{}
const nativeValues=function nativeValues(){};
const nativeIterator=function nativeIterator(){};
Object.defineProperty(NativeLikeStream.prototype,'values',{value:nativeValues,configurable:true});
Object.defineProperty(NativeLikeStream.prototype,Symbol.asyncIterator,{value:nativeIterator,configurable:true});
installReadableStreamAsyncIteration(NativeLikeStream);
assert.equal(NativeLikeStream.prototype.values,nativeValues);
assert.equal(NativeLikeStream.prototype[Symbol.asyncIterator],nativeIterator);

console.log('PASS 4/4');
console.log('✓ missing ReadableStream.values is installed');
console.log('✓ for-await consumption releases the reader lock');
console.log('✓ early return cancels unless preventCancel is set');
console.log('✓ native implementations are left untouched');
