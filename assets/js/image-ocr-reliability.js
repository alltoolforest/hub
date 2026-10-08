// Image to Text OCR — Task 1 only. Source, resource and worker reliability guards.
// Kept isolated from the existing scanned-PDF-to-text and frozen PDF workspaces.
export const SOURCE_LIMITS={mobile:16_000_000,desktop:30_000_000,side:16384,recognition:3_000_000};
export function checkImageDimensions(width,height,isMobile=false){
 const limit=isMobile?SOURCE_LIMITS.mobile:SOURCE_LIMITS.desktop;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width>SOURCE_LIMITS.side||height>SOURCE_LIMITS.side||width*height>limit)
  throw Error('This image is too large for safe OCR processing on this device. Use an image under '+
    (limit/1_000_000)+' million pixels, with each side at most 16,384 pixels.');
 return {width,height};
}
export function recognitionSize(width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)
  throw Error('Image dimensions are invalid.');
 const scale=Math.min(1,Math.sqrt(SOURCE_LIMITS.recognition/(width*height)));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
const be16=(b,i)=>(b[i]<<8)|b[i+1];
export function imageHeaderDimensions(bytes,extension){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(extension==='png'){
  if(bytes.length<24||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71||
     bytes[4]!==13||bytes[5]!==10||bytes[6]!==26||bytes[7]!==10)
   throw Error('The selected PNG file has an invalid header.');
  if(String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')
   throw Error('The selected PNG file does not have a valid dimensions header.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:v.getUint32(16),height:v.getUint32(20)};
 }
 if(extension==='jpg'||extension==='jpeg'){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)
   throw Error('The selected JPEG file has an invalid header.');
  let i=2;
  while(i+4<=bytes.length){
   if(bytes[i]!==255){i++;continue;}
   const m=bytes[i+1];i+=2;
   if(m===0||m===255||m===216)continue;
   if(m===217||m===218)break;
   if(i+2>bytes.length)break;
   const len=be16(bytes,i);
   if(len<2||i+len>bytes.length)break;
   if(([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]).includes(m)&&len>=7)
    return {width:be16(bytes,i+5),height:be16(bytes,i+3)};
   i+=len;
  }
  return null; // Rare long EXIF/header variants are checked after decoding.
 }
 throw Error('Image type not supported for this OCR tool.');
}
export async function validateImageFile(file,extension,isMobile){
 const header=new Uint8Array(await file.slice(0,262144).arrayBuffer());
 const dimensions=imageHeaderDimensions(header,extension);
 if(dimensions)checkImageDimensions(dimensions.width,dimensions.height,isMobile);
 return dimensions;
}
export function networkFriendlyError(error){
 const message=String(error?.message||error||'Unknown OCR error');
 if(/timed out|timeout/i.test(message))return Error('OCR timed out. Check your connection and retry with a smaller, clearer image. The previous text is preserved.');
 if(/network|failed to fetch|load failed|fetch failed|404|503|cdn|language data|traineddata/i.test(message))
  return Error('OCR engine or English language data could not load. Check your connection and retry. The previous text is preserved.');
 return error instanceof Error?error:Error(message);
}
export async function withinTime(operation,timeoutMs,label){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('Invalid timeout.');
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(operation),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out.')),timeoutMs);})
  ]);
 }finally{clearTimeout(timer);}
}
export async function createWorkerSafely(factory,timeoutMs=120000){
 let expired=false,timer;
 const pending=Promise.resolve().then(factory);
 try{
  const worker=await Promise.race([pending,new Promise((_,reject)=>{
   timer=setTimeout(()=>{expired=true;reject(Error('OCR engine initialization timed out.'));},timeoutMs);
  })]);
  if(!worker||typeof worker.recognize!=='function'||typeof worker.terminate!=='function')
   throw Error('OCR engine initialization returned an invalid worker.');
  return worker;
 }catch(error){
  // A worker may become available after the timeout; never leave that late worker active.
  if(expired)pending.then(w=>Promise.resolve(w?.terminate?.()).catch(()=>{})).catch(()=>{});
  throw error;
 }finally{clearTimeout(timer);}
}
export async function withOcrWorker(factory,operation,{startupMs=120000}={}){
 let worker=null,failed=false;
 try{
  worker=await createWorkerSafely(factory,startupMs);
  return await operation(worker);
 }catch(error){failed=true;throw error;}
 finally{
  if(worker){
   try{await worker.terminate();}
   catch(error){if(!failed)throw Error('OCR worker cleanup failed. Please retry safely.');}
  }
 }
}
export async function recognizeSafely(worker,image,canvasFactory,{deadlineMs=120000}={}){
 const dimensions=recognitionSize(image.width,image.height);
 let canvas=null;
 try{
  canvas=canvasFactory(dimensions.width,dimensions.height);
  const context=canvas?.getContext('2d');
  if(!context)throw Error('Image processing canvas is unavailable in this browser.');
  context.drawImage(image,0,0,dimensions.width,dimensions.height);
  const result=await withinTime(()=>worker.recognize(canvas),deadlineMs,'OCR recognition');
  if(typeof result?.data?.text!=='string')throw Error('OCR engine did not return valid recognized text.');
  return result.data.text;
 }finally{
  if(canvas){canvas.width=0;canvas.height=0;}
 }
}
