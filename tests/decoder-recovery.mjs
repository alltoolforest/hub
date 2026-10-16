import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {reducedDimensions} from '../assets/js/enhancer-v2/input-plan.js';
let code=await readFile(new URL('../assets/js/enhancer-v2/decode-photo.js',import.meta.url),'utf8');
code=code.replace(/^import .*;\n/,'').replace(/let tiffPromise;[\s\S]*?export async function decodePhoto/,'async function tiffDecoder(){return UTIF;}\nasync function decodePhoto');
function fixture(){const calls=[];let closed=0;const context={Blob,reducedDimensions,inspectPhoto:async()=>({width:6000,height:3000}),UTIF:{decode:()=>[{t513:[0],t514:[10]}]},createImageBitmap:async(input,options)=>{calls.push(options);if(input.name)throw Error('native RAW unavailable');return{width:options.resizeWidth,height:options.resizeHeight,close(){closed++;}};}};vm.createContext(context);vm.runInContext(code+'\nthis.decodePhoto=decodePhoto;',context);return{context,calls,get closed(){return closed;}};}
const file=new Blob([new Uint8Array(10)]);file.name='camera.dng';
{const f=fixture();const r=await f.context.decodePhoto(file,{reduced:true,maxPixels:1e6,meta:{width:4000,height:3000},allowPreview:true});assert.ok(r.previewUsed);assert.ok(r.bitmap.width*r.bitmap.height<=1e6);assert.ok(Math.abs(r.bitmap.width/r.bitmap.height-2)<.005);assert.equal(f.calls.length,2);}
{const f=fixture();await assert.rejects(()=>f.context.decodePhoto(file,{reduced:true,maxPixels:1e6}),{code:'PREVIEW_CONSENT'});assert.equal(f.calls.length,1);}
{const f=fixture();let n=0;f.context.createImageBitmap=async()=>{if(n++)throw Error('allocation failed');return{width:8000,height:8000,close(){f.context.closed=true;}};};await assert.rejects(()=>f.context.decodePhoto(new Blob(['x']),{reduced:true,maxPixels:1e6}));assert.equal(f.context.closed,true);}
console.log('PASS RAW preview aspect ratio, reduced area, preview consent and failed-resize bitmap cleanup (mock decoder APIs)');
