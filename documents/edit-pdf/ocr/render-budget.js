export const OCR_RENDER_LIMITS=Object.freeze({
  maxLongSide:2000,
  maxPixels:3_500_000,
  maxScale:2.15,
  minScale:.30,
});

export function computeOcrRenderPlan(width,height,options={}){
  width=Number(width);height=Number(height);
  if(!(width>0&&height>0))throw new Error('Invalid PDF page size for OCR rendering.');
  const limits={...OCR_RENDER_LIMITS,...options};
  const longSide=Math.max(width,height);
  const byLong=limits.maxLongSide/longSide;
  const byPixels=Math.sqrt(limits.maxPixels/(width*height));
  const scale=Math.max(limits.minScale,Math.min(limits.maxScale,byLong,byPixels));
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
