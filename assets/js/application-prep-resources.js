// Isolated resource policy for Application Document Prep (Task 3).
// No other image or document tool imports this module.
export function applicationResourceProfile({userAgent='',coarsePointer=false,touchPoints=0,deviceMemory=null,viewportWidth=null}={}){
 const handheld=/Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle/i.test(userAgent);
 const ipadDesktop=/Macintosh/i.test(userAgent)&&touchPoints>1;
 const memory=Number(deviceMemory);
 const lowMemory=Number.isFinite(memory)&&memory>0&&memory<=4;
 const narrow=Number.isFinite(viewportWidth)&&viewportWidth>0&&viewportWidth<=700;
 const constrained=handheld||ipadDesktop||lowMemory||narrow||(coarsePointer&&touchPoints>0);
 return Object.freeze({
  constrained,
  maxFileMB:constrained?20:60,
  inputPixels:constrained?16_000_000:30_000_000,
  outputPixels:constrained?8_000_000:24_000_000,
  // HEIC decoding expands into a full decoded bitmap and often a PNG intermediate.
  heicPixels:constrained?12_000_000:20_000_000,
  heicFileMB:constrained?12:30,
  decodeDeadlineMs:constrained?60_000:90_000,
  exportDeadlineMs:constrained?60_000:90_000
 });
}

// HEIC/HEIF ISO-BMFF 'ispe' (Image Spatial Extents) box metadata. Read
// dimensions *before* the expensive HEIC->PNG conversion. Reject unknown
// or truncated geometry rather than decoding an unbounded image.
export function sniffHeicDimensions(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(bytes.length<28||String.fromCharCode(...bytes.subarray(4,8))!=='ftyp')return null;
 const brands=['heic','heix','hevc','hevx','heim','heis','mif1','msf1','heif'];
 const ascii=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
 let heif=brands.includes(ascii(8,4));
 for(let p=16;p+4<=Math.min(bytes.length,80);p+=4)if(brands.includes(ascii(p,4)))heif=true;
 if(!heif)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let largest=null;
 for(let i=4;i+16<=bytes.length;i++){
  if(ascii(i,4)!=='ispe')continue;
  const begin=i-4,size=view.getUint32(begin);
  if(size<20||size>0x100000||begin+20>bytes.length)continue;
  const width=view.getUint32(i+8),height=view.getUint32(i+12);
  if(width<1||height<1||width>65535||height>65535)continue;
  if(!largest||width*height>largest.width*largest.height)largest={width,height};
 }
 return largest;
}

// Avoid always allocating a full-source working canvas when a small output is
// requested. Keep extra resolution for high-quality downsampling and cover crops.
export function workingCanvasSize(sourceWidth,sourceHeight,outputWidth,outputHeight,rotation,fit,limit){
 const rotated=rotation%180!==0;
 const fitWidth=rotated?sourceHeight:sourceWidth,fitHeight=rotated?sourceWidth:sourceHeight;
 if(![sourceWidth,sourceHeight,outputWidth,outputHeight,limit].every(Number.isFinite)||
  sourceWidth<1||sourceHeight<1||outputWidth<1||outputHeight<1||limit<1)
  throw Error('Invalid working image dimensions.');
 const required=fit==='cover'?
  Math.max(outputWidth/fitWidth,outputHeight/fitHeight):
  Math.min(outputWidth/fitWidth,outputHeight/fitHeight);
 const limitScale=Math.sqrt(limit/(sourceWidth*sourceHeight));
 const scale=Math.min(1,Math.max(0,required)*1.5,limitScale);
 return {
  width:Math.max(1,Math.min(sourceWidth,Math.round(sourceWidth*scale))),
  height:Math.max(1,Math.min(sourceHeight,Math.round(sourceHeight*scale)))
 };
}

// A stalled decoder or encoder must not hold the UI in Processing forever.
// Late image-bitmap completions are explicitly disposed of.
export function deadline(promise,ms,label='Operation',onLateResult=()=>{}){
 if(!Number.isFinite(ms)||ms<=0)throw Error('Invalid processing deadline.');
 return new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>{
   settled=true;
   reject(Error(label+' took too long on this device. Try a smaller image or JPG/PNG and retry. Your previous output is preserved.'));
  },ms);
  Promise.resolve(promise).then(value=>{
   if(settled){try{onLateResult(value);}catch{};return;}
   settled=true;clearTimeout(timer);resolve(value);
  },error=>{
   if(settled)return;
   settled=true;clearTimeout(timer);reject(error);
  });
 });
}
