const DEFAULTS={
  targetLongSide:2200,
  maxPixels:3600000,
  maxScale:2.15,
  minScale:.28,
};

export function resolveOcrRenderBudget({deviceMemory=null,smallScreen=null}={}){
  const memory=Number(deviceMemory ?? globalThis.navigator?.deviceMemory);
  const narrow=smallScreen ?? (typeof globalThis.innerWidth==='number'&&globalThis.innerWidth<760);
  if((Number.isFinite(memory)&&memory<=4)||narrow){
    return {targetLongSide:1900,maxPixels:2800000,maxScale:1.9,minScale:.28,tier:'mobile'};
  }
  return {...DEFAULTS,tier:'standard'};
}

export function computeOcrRenderPolicy(page,{budget=null}={}){
  if(!page?.getViewport)throw new Error('PDF page is required for OCR render planning.');
  const base=page.getViewport({scale:1});
  const width=Math.max(1,Number(base.width)||1);
  const height=Math.max(1,Number(base.height)||1);
  const cfg={...DEFAULTS,...(budget||resolveOcrRenderBudget())};
  const longSide=Math.max(width,height);
  const byLong=cfg.targetLongSide/longSide;
  const byPixels=Math.sqrt(cfg.maxPixels/(width*height));
  let scale=Math.min(cfg.maxScale,byLong,byPixels);
  scale=Math.max(cfg.minScale,scale);
  const pixelWidth=Math.max(1,Math.ceil(width*scale));
  const pixelHeight=Math.max(1,Math.ceil(height*scale));
  const pixels=pixelWidth*pixelHeight;
  const rgbaBytes=pixels*4;
  return {
    scale,
    pixelWidth,
    pixelHeight,
    pixels,
    rgbaBytes,
    workingPairBytes:rgbaBytes*2,
    baseWidth:width,
    baseHeight:height,
    tier:cfg.tier||'custom',
  };
}
