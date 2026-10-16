import { inspectPhoto, reducedDimensions } from './input-plan.js';
let tiffPromise;
async function tiffDecoder() {
  tiffPromise ||= (async()=>{await import('../../vendor/utif/pako.min.js');await import('../../vendor/utif/UTIF.js');return self.UTIF;})();
  return tiffPromise;
}
export async function decodePhoto(file,{reduced=false,maxPixels=4e6,meta=null,allowPreview=false}={}) {
  const resize=reduced?(meta?reducedDimensions(meta.width,meta.height,maxPixels):{width:Math.min(1024,Math.round(Math.sqrt(maxPixels))),height:null}):null;
  const options=resize?{resizeWidth:resize.width,...(resize.height?{resizeHeight:resize.height}:{}),resizeQuality:'high'}:{};
  try {
    let bitmap=await createImageBitmap(file,options);
    if(reduced&&bitmap.width*bitmap.height>maxPixels){const fit=reducedDimensions(bitmap.width,bitmap.height,maxPixels);let small;try{small=await createImageBitmap(bitmap,{resizeWidth:fit.width,resizeHeight:fit.height,resizeQuality:'high'});}finally{bitmap.close();}bitmap=small;}
    return {bitmap,previewUsed:false};
  }catch(error){
    const raw=/\.(dng|cr2|nef|arw|raw)$/i.test(file.name||'');
    if(!raw&&!/\.(tif|tiff)$/i.test(file.name||'')&&!/tiff/i.test(file.type||''))throw new Error('This browser could not decode the file. Try the smaller-output option; some camera RAW formats still need conversion to JPEG or TIFF.');
    const UTIF=await tiffDecoder(),buffer=await file.arrayBuffer(),ifds=UTIF.decode(buffer);
    const pages=ifds.flatMap(p=>[p,...(p.subIFD||[])]);
    if(raw) {
      const previews=pages.filter(p=>p.t513?.[0]>=0&&p.t514?.[0]>0&&p.t513[0]+p.t514[0]<=buffer.byteLength).sort((a,b)=>b.t514[0]-a.t514[0]);
      if(!previews.length)throw new Error('This camera RAW file has no supported JPEG preview. Full RAW development is not available; use a JPEG or TIFF camera export.');
      if(!allowPreview) {const e=new Error('This RAW file requires its embedded camera JPEG preview. Using that preview can reduce resolution and uses the camera-rendered colors.');e.code='PREVIEW_CONSENT';throw e;}
      const p=previews[0],blob=new Blob([buffer.slice(p.t513[0],p.t513[0]+p.t514[0])],{type:'image/jpeg'});
      // The embedded JPEG can have different dimensions/aspect ratio from the RAW IFD.
      // Decode using its own header, then apply the same reduced-size validation.
      const previewMeta=await inspectPhoto(blob);
      const decoded=await decodePhoto(blob,{reduced,maxPixels,meta:previewMeta,allowPreview:false});
      return {...decoded,previewUsed:true};
    }
    const page=ifds[0];if(!page)throw new Error('No image was found in this TIFF.');
    if(page.t262?.[0]===32803)throw new Error('This TIFF contains RAW sensor data and needs camera RAW conversion.');
    UTIF.decodeImage(buffer,page);const rgba=UTIF.toRGBA8(page),w=page.width,h=page.height;
    if(!w||!h||rgba.length!==w*h*4)throw new Error('TIFF decoding returned invalid pixels.');
    const bitmap=await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer,rgba.byteOffset,rgba.byteLength),w,h));
    const orientation=page.t274?.[0]||1,swap=orientation>=5&&orientation<=8,ow=swap?h:w,oh=swap?w:h;
    const fit=reduced?reducedDimensions(ow,oh,maxPixels):{width:ow,height:oh};
    if(orientation===1&&!reduced)return {bitmap,previewUsed:false};
    let canvas;
    try {
      canvas=new OffscreenCanvas(fit.width,fit.height);
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('TIFF orientation workspace is unavailable.');
      ctx.scale(fit.width/ow,fit.height/oh);
      const transforms={2:[-1,0,0,1,w,0],3:[-1,0,0,-1,w,h],4:[1,0,0,-1,0,h],5:[0,1,1,0,0,0],6:[0,1,-1,0,h,0],7:[0,-1,-1,0,h,w],8:[0,-1,1,0,0,w]};
      if(transforms[orientation])ctx.transform(...transforms[orientation]);ctx.drawImage(bitmap,0,0);
      return {bitmap:canvas.transferToImageBitmap(),previewUsed:false};
    }finally{bitmap.close();if(canvas)canvas.width=canvas.height=0;}
  }
}
