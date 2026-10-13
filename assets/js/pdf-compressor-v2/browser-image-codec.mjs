// Worker-local browser codec. Unsupported OffscreenCanvas fails safely.
import {inflateExact} from './embedded-image-transform.mjs';
export async function encodeBrowserJpeg({rgb,width,height,quality,signal}) {
  if(signal?.aborted)throw Error('cancelled');
  if(typeof OffscreenCanvas!=='function')throw Error('browser-codec-unavailable');
  const canvas=new OffscreenCanvas(width,height),context=canvas.getContext('2d');
  if(!context)throw Error('browser-codec-unavailable');
  try {
    const pixels=context.createImageData(width,height);
    for(let p=0;p<width*height;p++){
      pixels.data.set(rgb.subarray(p*3,p*3+3),p*4);pixels.data[p*4+3]=255;
    }
    context.putImageData(pixels,0,0);
    const blob=await canvas.convertToBlob({type:'image/jpeg',quality});
    if(blob.type!=='image/jpeg')throw Error('jpeg-codec-unavailable');
    if(signal?.aborted)throw Error('cancelled');
    return new Uint8Array(await blob.arrayBuffer());
  }finally{canvas.width=1;canvas.height=1;}
}

export async function verifyBrowserJpeg({bytes,originalStream,descriptor,width,height,mode}) {
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')throw Error('image-verification-unavailable');
  const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
  const source=new OffscreenCanvas(descriptor.width,descriptor.height),target=new OffscreenCanvas(width,height);
  try {
    if(image.width!==width||image.height!==height)return false;
    const gray=descriptor.colorSpace==='/DeviceGray',raw=await inflateExact(originalStream.contents,descriptor.width*descriptor.height*(gray?1:3));
    const ctx=source.getContext('2d'),pixels=ctx.createImageData(descriptor.width,descriptor.height);
    for(let p=0;p<descriptor.width*descriptor.height;p++){
      pixels.data[p*4]=raw[p*(gray?1:3)];pixels.data[p*4+1]=raw[p*(gray?1:3)+(gray?0:1)];
      pixels.data[p*4+2]=raw[p*(gray?1:3)+(gray?0:2)];pixels.data[p*4+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    const out=target.getContext('2d');out.imageSmoothingEnabled=true;out.imageSmoothingQuality='high';
    out.drawImage(source,0,0,width,height);const reference=out.getImageData(0,0,width,height).data;
    out.clearRect(0,0,width,height);out.drawImage(image,0,0);const actual=out.getImageData(0,0,width,height).data;
    let square=0;const bias=[0,0,0];
    for(let p=0;p<width*height;p++)for(let c=0;c<3;c++){
      const delta=actual[p*4+c]-reference[p*4+c];square+=delta*delta;bias[c]+=delta;
    }
    const rmse=Math.sqrt(square/(width*height*3));
    return rmse<=(mode==='strong'?40:30)&&bias.every(sum=>Math.abs(sum/(width*height))<=5);
  }finally{image.close();source.width=source.height=target.width=target.height=1;}
}
