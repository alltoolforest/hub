// Application Document Prep Task 2: keyboard-operable crop geometry.
// Coordinates are percentages of the original image, not of its displayed canvas.
export function cropFromPercent(x,y,w,h){
 const values=[x,y,w,h].map(v=>String(v).trim()===''?NaN:Number(v));
 if(values.some(v=>!Number.isFinite(v)))throw Error('Enter numeric crop values.');
 const [left,top,width,height]=values;
 if(left<0||top<0||width<=0||height<=0||left>=100||top>=100||
    left+width>100.00001||top+height>100.00001)
   throw Error('Crop position and size must stay within 0–100% of the original image.');
 return {x:left/100,y:top/100,w:width/100,h:height/100};
}
export function cropToPercent(crop){
 if(!crop)return {x:0,y:0,w:100,h:100};
 const rounded=v=>Math.round(v*10000)/100;
 return {x:rounded(crop.x),y:rounded(crop.y),w:rounded(crop.w),h:rounded(crop.h)};
}
export function cropToPixels(crop,width,height){
 const x=Math.max(0,Math.round(crop.x*width)),y=Math.max(0,Math.round(crop.y*height));
 const w=Math.min(width-x,Math.round(crop.w*width));
 const h=Math.min(height-y,Math.round(crop.h*height));
 if(w<1||h<1)throw Error('Crop is too small for this image. Increase the selection.');
 return {x,y,w,h};
}
