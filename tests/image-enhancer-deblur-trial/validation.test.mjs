import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDeblurOutput} from '../../assets/js/image-enhancer-deblur-validation.js';
const good=()=>({dims:[1,3,1,1],data:new Float32Array([-.02,.5,1.01])});
test('permits normal RGB and small reconstruction overshoot',()=>assert.doesNotThrow(()=>validateDeblurOutput(good(),1,1)));
test('rejects observed numerical explosion, nonfinite values and malformed shapes',()=>{
 for(const value of [-114.875,278.5,NaN,Infinity]){const x=good();x.data[0]=value;assert.throws(()=>validateDeblurOutput(x,1,1),/unstable/);}
 for(const dims of [[1,1,1,1],[3,1,1,1],[1,3,2,1]])assert.throws(()=>validateDeblurOutput({...good(),dims},1,1),/unexpected/);
 assert.throws(()=>validateDeblurOutput({...good(),data:new Float32Array(2)},1,1),/unexpected/);
});
// Exercise the actual application engine method, with a minimal tensor/session
// double. No copied inference implementation; browser UI is not initialized.
const code=await readFile(new URL('../../assets/js/image-enhancer.js',import.meta.url),'utf8');
const classText=code.slice(code.indexOf('class OnnxDeblurEngine'),code.indexOf('\nfunction clampByte'));
const Engine=new Function('EnhancementEngine','validateDeblurOutput',`return (${classText});`)(class{},validateDeblurOutput);
for(const scenario of ['valid','unstable','session-failure','conversion-failure','cancelled'])test(`actual deblur tile lifecycle: ${scenario}`,async()=>{
 let inputReleased=0,outputReleased=0,converted=0;
 const output={...good(),dispose(){outputReleased++;}};if(scenario==='unstable')output.data[0]=278.5;
 const processor={async packTile(){return new Float32Array(3);},async tensorToBitmap(){converted++;if(scenario==='conversion-failure')throw Error('conversion');return 'bitmap';}};
 const engine=new Engine(null,null,processor);engine.ort={Tensor:class{dispose(){inputReleased++;}}};
 engine.session={inputNames:['input'],outputNames:['output'],async run(){if(scenario==='session-failure')throw Error('inference');return {output};}};
 const controller=new AbortController();if(scenario==='cancelled')controller.abort();
 const promise=engine.inferTile(null,0,0,1,1,controller.signal);
 if(scenario==='valid')assert.equal(await promise,'bitmap');else await assert.rejects(promise);
 assert.equal(inputReleased,1);assert.equal(outputReleased,scenario==='session-failure'?0:1);assert.equal(converted,['valid','conversion-failure'].includes(scenario)?1:0);
});
