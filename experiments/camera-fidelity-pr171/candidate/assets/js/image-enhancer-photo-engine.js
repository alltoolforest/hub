import {BUILD_ID} from './photo-build.js';
import {assertDimensions,assertPNG} from './photo-integrity.js';
// Files decode inside a cancellable worker. Legacy image API remains for callers/tests.
function launch(payload,expected,signal,onProgress){
 if(signal?.aborted){payload.bitmap?.close();return Promise.reject(new DOMException('Processing cancelled.','AbortError'));}
 let worker;try{worker=new Worker(new URL('./image-enhancer-photo-worker.js?build='+BUILD_ID,import.meta.url),{type:'module'});}catch(error){payload.bitmap?.close();return Promise.reject(error);}
 return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>finish(new Error('Processing timed out. The original is unchanged.')),180000);
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(result);};
  const abort=()=>finish(new DOMException('Processing cancelled.','AbortError'));signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=async({data})=>{if(settled)return;try{if(!data||typeof data!=='object')throw new Error('Invalid worker response');if(data.progress){try{onProgress?.(data.progress);}catch{}return;}if(data.error)throw new Error(data.error);assertDimensions(data.width,data.height);if(expected&&(data.width!==expected.width||data.height!==expected.height))throw new Error('Original dimensions changed');await assertPNG(data.blob,data.width,data.height);finish(null,data);}catch(error){finish(error);}};
  worker.onerror=e=>finish(new Error(e.message||'Processing worker failed.'));worker.onmessageerror=()=>finish(new Error('Worker response could not be read.'));
  try{worker.postMessage(payload,payload.bitmap?[payload.bitmap]:[]);}catch(error){payload.bitmap?.close();finish(error);}
  if(signal?.aborted)abort();
 });
}
function capabilities(){if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')throw new Error('This browser needs background canvas processing. Try a current supported browser.');}
export async function enhancePhotograph(image,options={},signal,onProgress){if(signal?.aborted)throw new DOMException('Processing cancelled.','AbortError');capabilities();const bitmap=await createImageBitmap(image);return launch({bitmap,options},image,signal,onProgress);}
export async function enhanceFile(file,options={},signal,onProgress){if(signal?.aborted)throw new DOMException('Processing cancelled.','AbortError');capabilities();if(!(file instanceof Blob))throw new TypeError('Choose an image file');return launch({file,options:{...options,expectedBuild:BUILD_ID}},null,signal,onProgress);}
