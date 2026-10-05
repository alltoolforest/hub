// Isolated evaluation adapter. Never imported by the production application.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createCanvas, ImageData} from '@napi-rs/canvas';
import {applyFaceIdentityGuard} from '../../assets/js/image-enhancer-face-safety.js';
import {applyArtifactFidelityGuard} from '../../assets/js/image-enhancer-artifact-guard.js';
const require=createRequire(import.meta.url);
export const WDN_HASH='2a2ee04b4a6436c8da3bb2b7346f72fbca7ca1aa90e075308f3f1ed9035416a3';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function installCanvasHarness(){
 globalThis.document={createElement(tag){if(tag!=='canvas')throw Error('Only canvas supported');return createCanvas(1,1);}};
 globalThis.requestAnimationFrame=fn=>setImmediate(fn);
}
export function canvasOf(frame){const c=createCanvas(frame.width,frame.height);c.getContext('2d').putImageData(new ImageData(frame.data.slice(),frame.width,frame.height),0,0);return c;}
export function frameOf(c){return {width:c.width,height:c.height,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data.slice()};}
function checkAbort(signal){if(signal?.aborted)throw Object.assign(Error('Cancelled'),{name:'AbortError'});}
export function registryForTrial({modelPath,ortPackage,faces=[],degradation={},capture=()=>{}}){
 const stats={loads:0,runs:0,releases:0,guardStages:0};
 return {stats,registry:{cleanup:{
  // Approval here is solely to execute this isolated diagnostic. No release clearance.
  approved:true,preservesAlpha:false,preservesText:false,preservesGrayscale:false,detectorIndependent:false,
  async load({signal}){
   checkAbort(signal);const bytes=await readFile(modelPath);
   if(hash(bytes)!==WDN_HASH)throw Error('Unverified WDN artifact');
   checkAbort(signal);const ort=require(resolve(ortPackage));ort.env.wasm.numThreads=1;
   let session;
   try{session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});stats.loads++;checkAbort(signal);}
   catch(e){if(session){await session.release();stats.releases++;}throw e;}
   return {async run({image,original,signal}){
    checkAbort(signal);
    const {width:w,height:h,data}=image;
    if(w*h>16384)throw Error('Diagnostic input budget exceeded');
    if(data.some((v,i)=>i%4===3&&v!==255))throw Error('Transparent inputs withheld');
    const input=new Float32Array(w*h*3);
    for(let i=0;i<w*h;i++)for(let k=0;k<3;k++)input[k*w*h+i]=data[4*i+k]/255;
    const tensor=new ort.Tensor('float32',input,[1,3,h,w]);let outputs;
    try{
     outputs=await session.run({[session.inputNames[0]]:tensor});stats.runs++;checkAbort(signal);
     const output=outputs[session.outputNames[0]];
     if(JSON.stringify(output.dims)!==JSON.stringify([1,3,h*4,w*4]))throw Error('Unexpected WDN shape');
     const rgba=new Uint8ClampedArray(w*h*16*4),pixels=w*h*16;
     for(let i=0;i<pixels;i++){for(let k=0;k<3;k++){const v=output.data[k*pixels+i];if(!Number.isFinite(v))throw Error('Nonfinite output');rgba[4*i+k]=Math.round(Math.max(0,Math.min(1,v))*255);}rgba[4*i+3]=255;}
     const raw=canvasOf({width:w*4,height:h*4,data:rgba}),same=createCanvas(w,h),ctx=same.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(raw,0,0,w,h);raw.width=raw.height=0;
     capture('model',frameOf(same));
     const source=canvasOf(original);applyFaceIdentityGuard(same,source,faces,degradation,'enhance');source.width=source.height=0;
     capture('face',frameOf(same));const accepted=frameOf(same);same.width=same.height=0;
     return {image:accepted,status:'processed',aiExecuted:true};
    }finally{tensor.dispose();for(const value of Object.values(outputs||{}))value.dispose();}
   },async dispose(){await session.release();stats.releases++;}};
  }
 },guard:{approved:true,preservesAlpha:false,preservesText:false,preservesGrayscale:false,detectorIndependent:false,
  async load(){return {async run({image,original,signal}){
   const c=canvasOf(image),source=canvasOf(original);
   try{const result=await applyArtifactFidelityGuard({canvas:c,sourceImage:source,faces,degradation,mode:'enhance',signal});stats.guardStages=result.stages;
    const accepted=frameOf(result.canvas);capture('guard',accepted);result.canvas.width=result.canvas.height=0;
    return {image:accepted,status:result.stages?'limited':'processed',aiExecuted:false};
   }finally{source.width=source.height=0;c.width=c.height=0;}
  },async dispose(){}};}
 }}};
}
