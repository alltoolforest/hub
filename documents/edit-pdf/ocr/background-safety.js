function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b;}
function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function colorDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}
function solve3(a,b){
  const m=a.map((row,i)=>[...row,b[i]]);
  for(let col=0;col<3;col++){
    let pivot=col;for(let r=col+1;r<3;r++)if(Math.abs(m[r][col])>Math.abs(m[pivot][col]))pivot=r;
    if(Math.abs(m[pivot][col])<1e-8)return [0,0,0];
    [m[col],m[pivot]]=[m[pivot],m[col]];
    const d=m[col][col];for(let c=col;c<4;c++)m[col][c]/=d;
    for(let r=0;r<3;r++)if(r!==col){const f=m[r][col];for(let c=col;c<4;c++)m[r][c]-=f*m[col][c];}
  }
  return [m[0][3],m[1][3],m[2][3]];
}
function fitPlane(samples,key){
  let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0,sv=0,sxv=0,syv=0;
  for(const s of samples){const x=s.x,y=s.y,v=s[key];n++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;sv+=v;sxv+=x*v;syv+=y*v;}
  if(n<6)return [0,0,samples[0]?.[key]??255];
  return solve3([[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]],[sxv,syv,sv]);
}
function predict(model,x,y){return clamp(model[0]*x+model[1]*y+model[2],0,255);}

export function analyzeEditableBackground(ctx,bbox,{padding=5,maxRobustStd=22,minDominantFraction=.52,maxColorStd=28}={}){
  const canvas=ctx.canvas;
  const x0=clamp(Math.floor(bbox.x0-padding),0,canvas.width-1);
  const y0=clamp(Math.floor(bbox.y0-padding),0,canvas.height-1);
  const x1=clamp(Math.ceil(bbox.x1+padding),x0+1,canvas.width);
  const y1=clamp(Math.ceil(bbox.y1+padding),y0+1,canvas.height);
  const width=x1-x0,height=y1-y0;
  const data=ctx.getImageData(x0,y0,width,height).data;
  const inner={x0:bbox.x0-x0,y0:bbox.y0-y0,x1:bbox.x1-x0,y1:bbox.y1-y0};
  const ring=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    if(x>=inner.x0&&x<=inner.x1&&y>=inner.y0&&y<=inner.y1)continue;
    const i=(y*width+x)*4;if(data[i+3]<230)continue;
    const r=data[i],g=data[i+1],b=data[i+2];ring.push({x:x+x0,y:y+y0,r,g,b,l:luminance(r,g,b)});
  }
  if(ring.length<16)return {safe:false,reason:'OCR_BACKGROUND_SAMPLE_TOO_SMALL'};
  const medL=median(ring.map(s=>s.l));
  const deviations=ring.map(s=>Math.abs(s.l-medL));
  const mad=median(deviations)||1;
  const lumTol=Math.max(20,Math.min(55,mad*4.2+12));
  let dominant=ring.filter(s=>Math.abs(s.l-medL)<=lumTol);
  if(dominant.length<12){dominant=[...ring].sort((a,b)=>Math.abs(a.l-medL)-Math.abs(b.l-medL)).slice(0,Math.max(12,Math.floor(ring.length*.5)));}
  const fillColor={r:Math.round(median(dominant.map(s=>s.r))),g:Math.round(median(dominant.map(s=>s.g))),b:Math.round(median(dominant.map(s=>s.b)))};
  const meanL=dominant.reduce((s,p)=>s+p.l,0)/dominant.length;
  const robustStd=Math.sqrt(dominant.reduce((s,p)=>s+(p.l-meanL)**2,0)/dominant.length);
  const colorStd=Math.sqrt(dominant.reduce((s,p)=>s+colorDistance(p,fillColor)**2,0)/dominant.length);
  const dominantFraction=dominant.length/ring.length;
  const rawMin=Math.min(...ring.map(s=>s.l)),rawMax=Math.max(...ring.map(s=>s.l));
  const robustMin=Math.min(...dominant.map(s=>s.l)),robustMax=Math.max(...dominant.map(s=>s.l));
  const safe=robustStd<=maxRobustStd&&colorStd<=maxColorStd&&dominantFraction>=minDominantFraction;
  const model={r:fitPlane(dominant,'r'),g:fitPlane(dominant,'g'),b:fitPlane(dominant,'b')};
  const structured=safe&&(rawMax-rawMin)>(robustMax-robustMin+28);
  return {
    safe,
    reason:safe?null:'OCR_COMPLEX_BACKGROUND',
    fillColor,
    backgroundLuma:luminance(fillColor.r,fillColor.g,fillColor.b),
    polarity:luminance(fillColor.r,fillColor.g,fillColor.b)<125?'dark':'light',
    robustStd,
    colorStd,
    dominantFraction,
    rawRange:rawMax-rawMin,
    robustRange:robustMax-robustMin,
    structured,
    rect:{x0,y0,x1,y1},
    model,
  };
}

export function predictBackgroundColor(analysis,x,y){
  const m=analysis?.model;
  if(!m)return analysis?.fillColor||{r:255,g:255,b:255};
  return {r:Math.round(predict(m.r,x,y)),g:Math.round(predict(m.g,x,y)),b:Math.round(predict(m.b,x,y))};
}

export function estimateTextColor(ctx,bbox,analysisOrBackground){
  const background=analysisOrBackground?.fillColor||analysisOrBackground||{r:255,g:255,b:255};
  const x0=Math.max(0,Math.floor(bbox.x0)),y0=Math.max(0,Math.floor(bbox.y0));
  const x1=Math.min(ctx.canvas.width,Math.ceil(bbox.x1)),y1=Math.min(ctx.canvas.height,Math.ceil(bbox.y1));
  if(x1<=x0||y1<=y0)return luminance(background.r,background.g,background.b)<128?{r:245,g:245,b:245}:{r:0,g:0,b:0};
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const bgL=luminance(background.r,background.g,background.b);
  const candidates=[];
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<180)continue;
    const r=data[i],g=data[i+1],b=data[i+2],l=luminance(r,g,b);
    if(Math.abs(l-bgL)<28)continue;
    candidates.push({r,g,b,l,contrast:Math.abs(l-bgL)});
  }
  if(!candidates.length)return bgL<128?{r:245,g:245,b:245}:{r:0,g:0,b:0};
  const sign=candidates.reduce((s,p)=>s+(p.l>bgL?1:-1),0)>=0?1:-1;
  const samePolarity=candidates.filter(p=>(p.l>bgL?1:-1)===sign).sort((a,b)=>b.contrast-a.contrast);
  const selected=samePolarity.slice(0,Math.max(6,Math.floor(samePolarity.length*.32)));
  let weight=0,r=0,g=0,b=0;
  for(const p of selected){const w=Math.max(1,p.contrast);weight+=w;r+=p.r*w;g+=p.g*w;b+=p.b*w;}
  return {r:Math.round(r/Math.max(1,weight)),g:Math.round(g/Math.max(1,weight)),b:Math.round(b/Math.max(1,weight))};
}

function buildContrastMask(ctx,bbox,analysis,{padding=null}={}){
  const wordWidth=Math.max(1,bbox.x1-bbox.x0),wordHeight=Math.max(1,bbox.y1-bbox.y0);
  const pad=padding??Math.max(4,Math.round(wordHeight*.35));
  const x0=clamp(Math.floor(bbox.x0-pad),0,ctx.canvas.width-1),y0=clamp(Math.floor(bbox.y0-pad),0,ctx.canvas.height-1);
  const x1=clamp(Math.ceil(bbox.x1+pad),x0+1,ctx.canvas.width),y1=clamp(Math.ceil(bbox.y1+pad),y0+1,ctx.canvas.height);
  const width=x1-x0,height=y1-y0,data=ctx.getImageData(x0,y0,width,height).data;
  const mask=new Uint8Array(width*height);
  const foreground=estimateTextColor(ctx,bbox,analysis),bg=analysis?.fillColor||{r:255,g:255,b:255};
  const fgL=luminance(foreground.r,foreground.g,foreground.b),bgL=luminance(bg.r,bg.g,bg.b),direction=fgL>=bgL?1:-1;
  const minContrast=Math.max(6,Math.abs(fgL-bgL)*.12);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;if(data[i+3]<180)continue;
    const localBg=predictBackgroundColor(analysis,x+x0,y+y0),localBgL=luminance(localBg.r,localBg.g,localBg.b),l=luminance(data[i],data[i+1],data[i+2]);
    const signed=(l-localBgL)*direction;
    if(signed>=minContrast)mask[y*width+x]=1;
  }
  return {x0,y0,width,height,data,mask,pad,foreground,word:{x0:bbox.x0-x0,y0:bbox.y0-y0,x1:bbox.x1-x0,y1:bbox.y1-y0,width:wordWidth,height:wordHeight}};
}

function markHorizontal(protect,patch,y,start,end){for(let x=start;x<=end;x++)if(x>=0&&x<patch.width&&y>=0&&y<patch.height)protect[y*patch.width+x]=1;}
function markVertical(protect,patch,x,start,end){for(let y=start;y<=end;y++)if(x>=0&&x<patch.width&&y>=0&&y<patch.height)protect[y*patch.width+x]=1;}

function protectStructuralLines(patch){
  const {mask,width,height,word}=patch,protect=new Uint8Array(mask.length);
  const wordW=Math.max(1,word.width),wordH=Math.max(1,word.height);
  const topEdge=word.y0+wordH*.18,bottomEdge=word.y1-wordH*.18,leftEdge=word.x0+wordW*.12,rightEdge=word.x1-wordW*.12;
  for(let y=0;y<height;y++){
    let start=-1;
    for(let x=0;x<=width;x++){
      const on=x<width&&mask[y*width+x];
      if(on&&start<0)start=x;
      if((!on||x===width)&&start>=0){
        const end=x-1,len=end-start+1,leftExt=Math.max(0,word.x0-start),rightExt=Math.max(0,end-word.x1),extends=(leftExt+rightExt)>=Math.max(4,wordW*.12),nearEdge=y<=topEdge||y>=bottomEdge;
        if(len>=Math.max(14,wordW*1.15)||(nearEdge&&len>=Math.max(10,wordW*.72)&&extends))markHorizontal(protect,patch,y,start,end);
        start=-1;
      }
    }
  }
  for(let x=0;x<width;x++){
    let start=-1;
    for(let y=0;y<=height;y++){
      const on=y<height&&mask[y*width+x];
      if(on&&start<0)start=y;
      if((!on||y===height)&&start>=0){
        const end=y-1,len=end-start+1,topExt=Math.max(0,word.y0-start),bottomExt=Math.max(0,end-word.y1),extends=(topExt+bottomExt)>=Math.max(4,wordH*.20),nearEdge=x<=leftEdge||x>=rightEdge;
        if(len>=Math.max(14,wordH*1.18)||(nearEdge&&len>=Math.max(10,wordH*.78)&&extends))markVertical(protect,patch,x,start,end);
        start=-1;
      }
    }
  }
  return protect;
}

export function eraseRecognizedWord(workCtx,sourceCtx,word,analysis,{dilate=1}={}){
  const patch=buildContrastMask(sourceCtx,word.bbox,analysis);
  const protect=protectStructuralLines(patch);
  const erase=new Uint8Array(patch.mask.length);
  const margin=Math.max(1,Math.min(3,Math.round(patch.word.height*.07)));
  const wx0=Math.max(0,Math.floor(patch.word.x0)-margin),wy0=Math.max(0,Math.floor(patch.word.y0)-margin),wx1=Math.min(patch.width,Math.ceil(patch.word.x1)+margin),wy1=Math.min(patch.height,Math.ceil(patch.word.y1)+margin);
  for(let y=wy0;y<wy1;y++)for(let x=wx0;x<wx1;x++){const i=y*patch.width+x;if(patch.mask[i]&&!protect[i])erase[i]=1;}
  if(dilate>0){
    const src=erase.slice();
    for(let y=wy0;y<wy1;y++)for(let x=wx0;x<wx1;x++)if(src[y*patch.width+x]){
      for(let dy=-dilate;dy<=dilate;dy++)for(let dx=-dilate;dx<=dilate;dx++){
        const xx=x+dx,yy=y+dy;if(xx>=wx0&&yy>=wy0&&xx<wx1&&yy<wy1&&!protect[yy*patch.width+xx])erase[yy*patch.width+xx]=1;
      }
    }
  }
  const image=workCtx.getImageData(patch.x0,patch.y0,patch.width,patch.height);
  let erased=0;
  for(let y=wy0;y<wy1;y++)for(let x=wx0;x<wx1;x++){
    const idx=y*patch.width+x;if(!erase[idx])continue;
    const bg=predictBackgroundColor(analysis,patch.x0+x,patch.y0+y),i=idx*4;
    image.data[i]=bg.r;image.data[i+1]=bg.g;image.data[i+2]=bg.b;image.data[i+3]=255;erased++;
  }
  workCtx.putImageData(image,patch.x0,patch.y0);
  return {erasedPixels:erased,protectedPixels:protect.reduce((s,v)=>s+(v?1:0),0)};
}

export function assessFlatBackground(ctx,bbox,options={}){return analyzeEditableBackground(ctx,bbox,options);}
