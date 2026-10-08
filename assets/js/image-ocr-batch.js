// Image OCR multi-image extension: order, rotation and output composition.
// Pure helpers, never mutates the user-selected images or other AllToolForest tools.
export const LIMITS={mobileCount:10,desktopCount:20,mobilePixels:24_000_000,desktopPixels:48_000_000};
export function rotateBy(angle,step){
 if(![0,90,180,270].includes(angle)||![90,-90].includes(step))throw Error('Invalid rotation.');
 return (angle+step+360)%360;
}
export function moveBy(items,id,step){
 if(![-1,1].includes(step))throw Error('Move must be one position at a time.');
 const index=items.findIndex(item=>item.id===id);
 if(index<0)throw Error('Image not found.');
 const to=index+step;
 if(to<0||to>=items.length)return [...items];
 const next=[...items];[next[index],next[to]]=[next[to],next[index]];
 return next;
}
export function batchCapacity(current,adding,isMobile){
 const max=isMobile?LIMITS.mobileCount:LIMITS.desktopCount;
 if(current.length+adding>max)throw Error('Maximum '+max+' images per batch on this device. Remove an image before adding more.');
 const sum=current.reduce((n,i)=>n+i.image.width*i.image.height,0);
 const maxPixels=isMobile?LIMITS.mobilePixels:LIMITS.desktopPixels;
 return {max,maxPixels,usedPixels:sum};
}
export function batchText(items){
 if(!items.length)throw Error('Add at least one image.');
 if(items.some(item=>typeof item.text!=='string'||!item.text.trim()))throw Error('Some images have no recognized text. Run OCR before exporting.');
 if(items.length===1)return items[0].text.trim();
 return items.map((i,n)=>'Image '+(n+1)+' — '+i.name+'\n'+i.text.trim()).join('\n\n');
}
export function drawRotatedPreview(canvas,image,angle,maxSide=720){
 if(![0,90,180,270].includes(angle))throw Error('Invalid image rotation.');
 if(!image?.width||!image?.height)throw Error('Cannot preview this image.');
 const scale=Math.min(1,maxSide/image.width,maxSide/image.height);
 const w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
 canvas.width=angle%180?h:w;
 canvas.height=angle%180?w:h;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('Canvas preview is unavailable.');
 ctx.save();
 try{
  if(angle===90){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);}
  if(angle===180){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI);}
  if(angle===270){ctx.translate(0,canvas.height);ctx.rotate(-Math.PI/2);}
  ctx.drawImage(image,0,0,w,h);
 }finally{ctx.restore();}
}
export function normalizedLines(text){
 // Preserve intentional line breaks while rejecting invisible control characters that
 // break PDF font encoding. Do not replace actual OCR letters or punctuation.
 return text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').split('\n');
}
