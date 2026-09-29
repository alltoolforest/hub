// Preserve CSS geometry and text hitboxes while bounding the backing bitmap.
export function canvasRenderPlan(width,height,devicePixelRatio=1){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid PDF render dimensions.');
  const ratio=Math.min(Math.max(Number(devicePixelRatio)||1,.1),2,4096/width,4096/height,Math.sqrt(4_000_000/(width*height)));
  const pixelWidth=Math.max(1,Math.floor(width*ratio));
  const pixelHeight=Math.max(1,Math.floor(height*ratio));
  return {pixelWidth,pixelHeight,scaleX:pixelWidth/width,scaleY:pixelHeight/height};
}
