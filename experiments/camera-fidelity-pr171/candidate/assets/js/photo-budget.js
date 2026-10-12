import {assertDimensions} from './photo-integrity.js';
export function memoryPlan(w,h,{memoryBudgetMiB=256,retainedBytes=0,experimentalDetail=false}={}){
 assertDimensions(w,h);
 if(!Number.isFinite(memoryBudgetMiB)||memoryBudgetMiB<64||memoryBudgetMiB>1024||!Number.isSafeInteger(retainedBytes)||retainedBytes<0)throw new Error('Invalid memory budget');
 const stripBytes=experimentalDetail?80:32,haloRows=experimentalDetail?28:20;
 const rows=Math.max(16,Math.min(96,Math.floor(24*1024*1024/(w*stripBytes))-haloRows));
 // Decode, output canvas, encoding reserve + strip floats + diagnostics + retained blobs.
 const estimatedBytes=w*h*12+w*(rows+haloRows)*stripBytes+16*1024*1024+retainedBytes;
 if(estimatedBytes>memoryBudgetMiB*1024*1024)throw new Error('This image exceeds the conservative memory budget. Try a smaller original or a device with more memory; resolution will not be silently reduced.');
 return {rows,estimatedBytes,budgetBytes:memoryBudgetMiB*1024*1024,qualification:'estimate only; browser/GPU/decoder allocations can exceed it'};
}
export async function preflightFile(file){
 if(!(file instanceof Blob)||file.size<12||file.size>160*1024*1024)throw new Error('Choose a valid PNG, JPEG or WebP file up to 160MB.');
 const b=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer()),v=new DataView(b.buffer);
 let width,height,mime;
 if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b.length>=24){width=v.getUint32(16);height=v.getUint32(20);mime='image/png';}
 else if(b[0]===255&&b[1]===216){mime='image/jpeg';let p=2;while(p+3<b.length){if(b[p++]!==255)throw new Error('Invalid JPEG header');while(b[p]===255)p++;const marker=b[p++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const length=(b[p]<<8)|b[p+1];if(length<2||p+length>b.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){height=(b[p+3]<<8)|b[p+4];width=(b[p+5]<<8)|b[p+6];break;}p+=length;}}
 else if(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'){
  mime='image/webp';const kind=String.fromCharCode(...b.slice(12,16));
  if(kind==='VP8X'&&b.length>=30){if(b[20]&2)throw new Error('Animated WebP is not supported.');width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}
  else if(kind==='VP8L'&&b.length>=25&&b[20]===47){width=1+(b[21]|((b[22]&63)<<8));height=1+((b[22]>>6)|(b[23]<<2)|((b[24]&15)<<10));}
  else if(kind==='VP8 '&&b.length>=30&&b[23]===157&&b[24]===1&&b[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
 }
 if(!width||!height)throw new Error('Image dimensions could not be safely read. Use a standard PNG, JPEG or WebP.');
 assertDimensions(width,height);return {width,height,mime};
}
