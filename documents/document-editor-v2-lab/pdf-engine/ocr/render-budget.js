export const OCR_RENDER_LIMITS=Object.freeze({
  maxLongSide:2000,
  maxPixels:3_500_000,
  maxScale:2.15,
  minScale:.30,
});

export function computeOcrRenderPlan(width,height,options={}){
  width=Number(width);height=Number(height);
  if(!Number.isFinite(width)||!Number.isFinite(height)||!(width>0&&height>0))throw new Error('Invalid PDF page size for OCR rendering.');
  const limits={...OCR_RENDER_LIMITS,...options};
  for(const key of ['maxLongSide','maxPixels','maxScale']){
    if(!Number.isFinite(limits[key])||limits[key]<=0)throw new Error('Invalid OCR rendering limit.');
  }
  const longSide=Math.max(width,height);
  const byLong=limits.maxLongSide/longSide;
  const byPixels=Math.sqrt(limits.maxPixels/(width*height));
  // A minimum quality scale cannot override the hard allocation budget.
  let scale=Math.min(limits.maxScale,byLong,byPixels)*(1-1e-12);
  // Reserve one pixel per axis for canvas rounding.
  if(Math.ceil(width*scale)*Math.ceil(height*scale)>limits.maxPixels){
    scale=Math.min(scale,Math.max(0,(Math.floor(width*scale)-1)/width),Math.max(0,(Math.floor(height*scale)-1)/height));
  }
  if(!(scale>0))throw new Error('OCR rendering budget is too small.');
  const pixelWidth=Math.max(1,Math.ceil(width*scale));
  const pixelHeight=Math.max(1,Math.ceil(height*scale));
  const pixels=pixelWidth*pixelHeight;
  return {
    scale,pixelWidth,pixelHeight,pixels,
    estimatedWorkingBytes:pixels*4*2,
    capped:scale<limits.maxScale-.001,
    limits,
  };
}
