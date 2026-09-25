function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b;}
function colorDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}
function quant(v){return Math.max(0,Math.min(255,Math.round(v/16)*16));}
function dominantColor(samples){
  const bins=new Map();
  for(const p of samples){const k=`${quant(p.r)},${quant(p.g)},${quant(p.b)}`;bins.set(k,(bins.get(k)||0)+1);}
  let best=null,count=0;for(const [k,n] of bins)if(n>count){best=k;count=n;}
  if(!best)return null;
  const [qr,qg,qb]=best.split(',').map(Number);let r=0,g=0,b=0,n=0;
  for(const p of samples){if(Math.abs(p.r-qr)<=24&&Math.abs(p.g-qg)<=24&&Math.abs(p.b-qb)<=24){r+=p.r;g+=p.g;b+=p.b;n++;}}
  return {r:Math.round(r/Math.max(1,n)),g:Math.round(g/Math.max(1,n)),b:Math.round(b/Math.max(1,n)),ratio:count/Math.max(1,samples.length)};
}
function pixelAt(data,width,x,y){const i=(y*width+x)*4;return {r:data[i],g:data[i+1],b:data[i+2],a:data[i+3]};}
function isContrast(p,bg,threshold=42){return Math.abs(luminance(p.r,p.g,p.b)-luminance(bg.r,bg.g,bg.b))>threshold||colorDistance(p,bg)>72;}
function mergeIndexes(indexes,maxGap=1){
  if(!indexes.length)return [];
  const sorted=[...new Set(indexes)].sort((a,b)=>a-b),runs=[];let start=sorted[0],prev=sorted[0];
  for(let i=1;i<sorted.length;i++){const v=sorted[i];if(v-prev>maxGap+1){runs.push([start,prev]);start=v;}prev=v;}runs.push([start,prev]);return runs;
}
function detectCrossingLines(data,width,height,inner,bg){
  const horizontals=[],verticals=[];
  const leftWidth=Math.max(1,Math.floor(inner.x0)),rightStart=Math.min(width-1,Math.ceil(inner.x1));
  const topHeight=Math.max(1,Math.floor(inner.y0)),bottomStart=Math.min(height-1,Math.ceil(inner.y1));
  for(let y=0;y<height;y++){
    let left=0,ln=0,right=0,rn=0;
    for(let x=0;x<leftWidth;x++){ln++;if(isContrast(pixelAt(data,width,x,y),bg))left++;}
    for(let x=rightStart;x<width;x++){rn++;if(isContrast(pixelAt(data,width,x,y),bg))right++;}
    if(ln&&rn&&left/ln>=.45&&right/rn>=.45)horizontals.push(y);
  }
  for(let x=0;x<width;x++){
    let top=0,tn=0,bottom=0,bn=0;
    for(let y=0;y<topHeight;y++){tn++;if(isContrast(pixelAt(data,width,x,y),bg))top++;}
    for(let y=bottomStart;y<height;y++){bn++;if(isContrast(pixelAt(data,width,x,y),bg))bottom++;}
    if(tn&&bn&&top/tn>=.45&&bottom/bn>=.45)verticals.push(x);
  }
  return {
    horizontal:mergeIndexes(horizontals,1).map(([a,b])=>({axis:'h',pos:(a+b)/2,thickness:b-a+1})),
    vertical:mergeIndexes(verticals,1).map(([a,b])=>({axis:'v',pos:(a+b)/2,thickness:b-a+1})),
  };
}

export function assessFlatBackground(ctx,bbox,{padding=7,minDominantRatio=.42,maxResidualFraction=.30}={}){
  const canvas=ctx.canvas;
  const x0=clamp(Math.floor(bbox.x0-padding),0,Math.max(0,canvas.width-1));
  const y0=clamp(Math.floor(bbox.y0-padding),0,Math.max(0,canvas.height-1));
  const x1=clamp(Math.ceil(bbox.x1+padding),x0+1,canvas.width);
  const y1=clamp(Math.ceil(bbox.y1+padding),y0+1,canvas.height);
  const width=x1-x0,height=y1-y0;
  const data=ctx.getImageData(x0,y0,width,height).data;
  const inner={x0:bbox.x0-x0,y0:bbox.y0-y0,x1:bbox.x1-x0,y1:bbox.y1-y0};
  const ring=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=inner.x0&&x<=inner.x1&&y>=inner.y0&&y<=inner.y1;if(inside)continue;
    const p=pixelAt(data,width,x,y);if(p.a<230)continue;ring.push(p);
  }
  if(ring.length<16)return {safe:false,reason:'OCR_BACKGROUND_SAMPLE_TOO_SMALL'};
  const dom=dominantColor(ring);if(!dom)return {safe:false,reason:'OCR_BACKGROUND_SAMPLE_TOO_SMALL'};
  const bg={r:dom.r,g:dom.g,b:dom.b};
  let residual=0;for(const p of ring)if(isContrast(p,bg))residual++;
  const residualFraction=residual/ring.length;
  const lines=detectCrossingLines(data,width,height,inner,bg);
  const decorations=[];
  const ix0=Math.max(0,Math.floor(inner.x0)),ix1=Math.min(width,Math.ceil(inner.x1)),iy0=Math.max(0,Math.floor(inner.y0)),iy1=Math.min(height,Math.ceil(inner.y1));
  const innerWidth=Math.max(1,ix1-ix0),innerHeight=Math.max(1,iy1-iy0);
  for(let y=Math.floor(iy0+innerHeight*.52);y<iy1;y++){
    let run=0,best=0,start=ix0,bestStart=ix0;
    for(let x=ix0;x<ix1;x++){if(isContrast(pixelAt(data,width,x,y),bg)){if(run===0)start=x;run++;if(run>best){best=run;bestStart=start;}}else run=0;}
    if(best>=innerWidth*.72)decorations.push({axis:'h',x0:x0+bestStart,x1:x0+bestStart+best,y:y0+y,thickness:1});
  }
  const linePixels=(lines.horizontal.reduce((n,l)=>n+l.thickness*width,0)+lines.vertical.reduce((n,l)=>n+l.thickness*height,0));
  const lineFraction=Math.min(1,linePixels/Math.max(1,width*height));
  const backgroundLuminance=luminance(bg.r,bg.g,bg.b);
  const lineAwareResidual=Math.max(0,residualFraction-lineFraction*.85);
  const safe=dom.ratio>=minDominantRatio&&lineAwareResidual<=maxResidualFraction;
  return {
    safe,
    reason:safe?null:'OCR_COMPLEX_BACKGROUND',
    fillColor:bg,
    backgroundLuminance,
    tone:backgroundLuminance<118?'dark':'light',
    dominantRatio:dom.ratio,
    residualFraction,
    lineAwareResidual,
    preservedLines:lines,
    decorations,
    rect:{x0,y0,x1,y1},
  };
}

export function estimateTextColor(ctx,bbox,background){
  const x0=Math.max(0,Math.floor(bbox.x0)),y0=Math.max(0,Math.floor(bbox.y0));
  const x1=Math.min(ctx.canvas.width,Math.ceil(bbox.x1)),y1=Math.min(ctx.canvas.height,Math.ceil(bbox.y1));
  if(x1<=x0||y1<=y0)return luminance(background.r,background.g,background.b)<128?{r:245,g:245,b:245}:{r:0,g:0,b:0};
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const candidates=[];
  for(let i=0;i<data.length;i+=4){if(data[i+3]<180)continue;const p={r:data[i],g:data[i+1],b:data[i+2]};if(isContrast(p,background,28))candidates.push(p);}
  if(!candidates.length)return luminance(background.r,background.g,background.b)<128?{r:245,g:245,b:245}:{r:0,g:0,b:0};
  const bgL=luminance(background.r,background.g,background.b);
  const preferred=candidates.filter(p=>bgL<128?luminance(p.r,p.g,p.b)>bgL+35:luminance(p.r,p.g,p.b)<bgL-35);
  const pool=preferred.length>=Math.max(3,candidates.length*.18)?preferred:candidates;
  let r=0,g=0,b=0;for(const p of pool){r+=p.r;g+=p.g;b+=p.b;}
  return {r:Math.round(r/pool.length),g:Math.round(g/pool.length),b:Math.round(b/pool.length)};
}

export function repaintPreservedLines(ctx,safety,eraseRect){
  const lines=safety?.preservedLines;if(!lines)return;
  const bg=safety.fillColor||{r:255,g:255,b:255};
  const lineColor=luminance(bg.r,bg.g,bg.b)<128?'rgba(245,245,245,.72)':'rgba(20,20,20,.72)';
  ctx.save();ctx.strokeStyle=lineColor;
  for(const line of lines.horizontal||[]){const y=(safety.rect?.y0||0)+line.pos;ctx.lineWidth=Math.max(1,line.thickness);ctx.beginPath();ctx.moveTo(eraseRect.x,y);ctx.lineTo(eraseRect.x+eraseRect.width,y);ctx.stroke();}
  for(const line of lines.vertical||[]){const x=(safety.rect?.x0||0)+line.pos;ctx.lineWidth=Math.max(1,line.thickness);ctx.beginPath();ctx.moveTo(x,eraseRect.y);ctx.lineTo(x,eraseRect.y+eraseRect.height);ctx.stroke();}
  for(const deco of safety.decorations||[]){ctx.lineWidth=Math.max(1,deco.thickness||1);ctx.beginPath();ctx.moveTo(deco.x0,deco.y);ctx.lineTo(deco.x1,deco.y);ctx.stroke();}
  ctx.restore();
}

function averageStrip(ctx,x,y,width,height){
  const sx=Math.max(0,Math.floor(x)),sy=Math.max(0,Math.floor(y));
  const sw=Math.max(1,Math.min(ctx.canvas.width-sx,Math.floor(width))),sh=Math.max(1,Math.min(ctx.canvas.height-sy,Math.floor(height)));
  if(sw<=0||sh<=0)return null;const d=ctx.getImageData(sx,sy,sw,sh).data;let r=0,g=0,b=0,n=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]<180)continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}
  return n?{r:r/n,g:g/n,b:b/n}:null;
}

export function reconstructBackground(workCtx,baseCtx,safety,eraseRect){
  const bg=safety?.fillColor||{r:255,g:255,b:255};
  const useEdgeBlend=safety?.tone==='dark'||(safety?.dominantRatio??1)<.62;
  if(!useEdgeBlend){workCtx.fillStyle=`rgb(${bg.r} ${bg.g} ${bg.b})`;workCtx.fillRect(eraseRect.x,eraseRect.y,eraseRect.width,eraseRect.height);repaintPreservedLines(workCtx,safety,eraseRect);return;}
  const image=workCtx.createImageData(eraseRect.width,eraseRect.height),d=image.data;
  for(let y=0;y<eraseRect.height;y++){
    const py=eraseRect.y+y;
    const left=averageStrip(baseCtx,eraseRect.x-4,py,3,1)||bg;
    const right=averageStrip(baseCtx,eraseRect.x+eraseRect.width+1,py,3,1)||bg;
    for(let x=0;x<eraseRect.width;x++){
      const t=eraseRect.width<=1?0:x/(eraseRect.width-1),i=(y*eraseRect.width+x)*4;
      d[i]=Math.round(left.r*(1-t)+right.r*t);d[i+1]=Math.round(left.g*(1-t)+right.g*t);d[i+2]=Math.round(left.b*(1-t)+right.b*t);d[i+3]=255;
    }
  }
  workCtx.putImageData(image,eraseRect.x,eraseRect.y);repaintPreservedLines(workCtx,safety,eraseRect);
}
