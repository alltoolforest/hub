import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateDeblurOutput, validateDeblurFidelity } from '../assets/js/image-enhancer-deblur-validation.js';
const source = await readFile(new URL('../assets/js/image-enhancer.js',import.meta.url),'utf8');
const begin=source.indexOf('class OnnxDeblurEngine extends');
const end=source.indexOf('\nfunction clampByte',begin);
const Engine=vm.runInNewContext(source.slice(begin,end)+'\nOnnxDeblurEngine;', {
  EnhancementEngine:class {},validateDeblurOutput,validateDeblurFidelity,DOMException
});
for(const scenario of ['valid','corrupt','nonfinite','dimensions','cancelled','conversion-error']) {
  const w=64,h=64,n=w*h*3;
  const input=new Float32Array(n).fill(.4),values=input.slice();
  if(scenario==='corrupt') for(let y=0;y<32;y++)for(let x=0;x<32;x++)for(let c=0;c<3;c++) values[c*w*h+y*w+x]=1;
  if(scenario==='nonfinite') values[n-1]=NaN;
  let inputFreed=0,outputFreed=0,converted=0;
  const processor={packTile:async()=>input,deblurTensorToBitmap:async(data,pw,ph,cw,ch)=>{
    converted++; assert.deepEqual([pw,ph,cw,ch],[w,h,w,h]);
    if(scenario==='conversion-error')throw new Error('conversion failed');
    return {width:cw,height:ch};
  }};
  const engine=new Engine(null,{},processor);
  engine.ort={Tensor:class {dispose(){inputFreed++;}}};
  engine.session={inputNames:['input'],outputNames:['output'],run:async()=>({output:{
    data:values,dims:[1,3,h,scenario==='dimensions'?w-1:w],dispose(){outputFreed++;}
  }})};
  const work=engine.inferTile({},0,0,w,h,{aborted:scenario==='cancelled'});
  if(scenario==='valid')assert.deepEqual(await work,{width:w,height:h});
  else await assert.rejects(work);
  assert.equal(inputFreed,1); assert.equal(outputFreed,1);
  assert.equal(converted,['valid','conversion-error'].includes(scenario)?1:0);
}

// Model-independent validation fixtures: legitimate edge recovery passes;
// severe localized corruption cannot hide inside an otherwise unchanged tile.
const w=192,h=192,plane=w*h;
const input=new Float32Array(plane*3),restored=new Float32Array(plane*3);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++) {
  const i=c*plane+y*w+x;
  input[i]=.2+.6/(1+Math.exp(-(x-96)/2));
  restored[i]=x<96?.2:.8;
}
validateDeblurFidelity(restored,input,w,h);
for(let y=64;y<96;y++)for(let x=64;x<96;x++)for(let c=0;c<3;c++)restored[c*plane+y*w+x]=1;
assert.throws(()=>validateDeblurFidelity(restored,input,w,h),/distortion/);
console.log('PASS: six inference lifecycle scenarios, edge recovery, localized corruption rejection. Model execution mocked.');
