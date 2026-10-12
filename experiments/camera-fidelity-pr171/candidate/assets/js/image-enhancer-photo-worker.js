import {BUILD_ID} from './photo-build.js';
import * as candidate from './image-enhancer-photo.js';
import * as baseline from '../../../baseline/assets/js/image-enhancer-photo.js';
import {assertDimensions,assertFiniteTree,createIntegrity,inspectStrip,finishIntegrity,assertPNG}from './photo-integrity.js';
import {createNoiseMap,collectNoise,finishNoise}from './photo-noise.js';
import {validateFaces,facePolicy}from './photo-faces.js';
import {memoryPlan,preflightFile}from './photo-budget.js';
self.onmessage=async({data})=>{
 let bitmap=data?.bitmap,output,scratch;const started=performance.now();
 try{
  let options=data?.options||{};
  if(options.expectedBuild&&options.expectedBuild!==BUILD_ID)throw new Error('Worker version mismatch. Reload the page.');
  if(data?.file){const header=await preflightFile(data.file);memoryPlan(header.width,header.height,{...options,retainedBytes:(options.retainedBytes||0)+data.file.size});options={...options,sourceMime:header.mime};self.postMessage({progress:'Decoding original on background worker…'});bitmap=await createImageBitmap(data.file);}
  if(!bitmap)throw new Error('Missing decoded image');const {width,height}=bitmap;assertDimensions(width,height);
  options={...options,faces:validateFaces(options.faces,width,height)};
  const budget=memoryPlan(width,height,{...options,retainedBytes:(options.retainedBytes||0)+(data?.file?.size||0)}),rows=budget.rows;
  if(options.engine!==undefined&&!['baseline','candidate'].includes(options.engine))throw new Error('Unknown engine');
  const engine=options.engine==='baseline'?baseline:candidate;
  const {PHOTO_HALO,photoStatistics,collectPhotoStatistics,makePhotoPlan,enhancePhotoStrip}=engine;
  output=new OffscreenCanvas(width,height);scratch=new OffscreenCanvas(width,Math.max(96,rows+PHOTO_HALO*2));
  const ctx=scratch.getContext('2d',{willReadFrequently:true}),out=output.getContext('2d');if(!ctx||!out)throw new Error('Processing canvas unavailable');
  function read(top,count){ctx.clearRect(0,0,width,scratch.height);ctx.drawImage(bitmap,0,top,width,count,0,0,width,count);return ctx.getImageData(0,0,width,count).data;}
  const stats=photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(width*height/90000)));
  // PR171 analysis partition stays fixed even when processing strips shrink.
  for(let y=0;y<height;y+=96){const count=Math.min(96,height-y);collectPhotoStatistics(read(y,count),width,count,stats,step,y);}
  let regionalNoise=null;
  if(options.diagnostics===true){const map=createNoiseMap(width,height);for(let y=0;y<height;y+=rows){const top=Math.max(0,y-2),n=Math.min(rows,height-y),bottom=Math.min(height,y+n+2);collectNoise(map,read(top,bottom-top),width,bottom-top,y-top,n,top);}regionalNoise=finishNoise(map);}
  const plan=makePhotoPlan(stats,options);assertFiniteTree(plan);const diagnosisMs=performance.now()-started,integrity=createIntegrity(width,height);
  for(let y=0;y<height;y+=rows){const top=Math.max(0,y-PHOTO_HALO),count=Math.min(rows,height-y),bottom=Math.min(height,y+count+PHOTO_HALO),input=read(top,bottom-top);const rgba=enhancePhotoStrip(input,width,bottom-top,y-top,count,plan,{offsetY:top,faces:options.faces});inspectStrip(integrity,input,rgba,y-top,count,y);out.putImageData(new ImageData(rgba,width,count),0,y);if(y%(rows*4)===0)self.postMessage({progress:`Processing native pixels · ${Math.round((y+count)/height*100)}%`});}
  const check=finishIntegrity(integrity);bitmap.close();bitmap=null;
  const processingMs=performance.now()-started-diagnosisMs;self.postMessage({progress:'Encoding native-resolution PNG…'});
  const blob=await output.convertToBlob({type:'image/png'});await assertPNG(blob,width,height);
  // Decode the encoded result to reject truncated/invalid PNGs, beyond header checks.
  output.width=output.height=0;scratch.width=scratch.height=0;
  const decoded=await createImageBitmap(blob);try{if(decoded.width!==width||decoded.height!==height)throw new Error('Encoded dimensions changed');}finally{decoded.close();}
  self.postMessage({blob,width,height,diagnostics:{build:BUILD_ID,engine:options.engine||'candidate',newTechniques:'disabled: real-photo gates unmet',facePolicy:facePolicy(options.faces),regionalNoise,budget,integrity:check,timing:{diagnosisMs,processingMs,totalMs:performance.now()-started},noise:plan.noise,chromaNoise:plan.chromaNoise,shadowLift:plan.shadowLift,mean:plan.mean,range:plan.range,wb:plan.wb}});
 }catch(error){self.postMessage({error:error?.message||'Processing failed; no output was accepted.'});}
 finally{bitmap?.close();if(output)output.width=output.height=0;if(scratch)scratch.width=scratch.height=0;}
};
