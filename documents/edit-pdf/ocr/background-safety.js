function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b;}

export function assessFlatBackground(ctx,bbox,{padding=3,maxStdDev=14,maxRange=42,maxDarkFraction=.18}={}){
  const canvas=ctx.canvas;
  const x0=clamp(Math.floor(bbox.x0-padding),0,canvas.width-1);
  const y0=clamp(Math.floor(bbox.y0-padding),0,canvas.height-1);
  const x1=clamp(Math.ceil(bbox.x1+padding),x0+1,canvas.width);
  const y1=clamp(Math.ceil(bbox.y1+padding),y0+1,canvas.height);
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const inner={x0:bbox.x0-x0,y0:bbox.y0-y0,x1:bbox.x1-x0,y1:bbox.y1-y0};
  const samples=[];

  for(let y=0;y<y1-y0;y++){
    for(let x=0;x<x1-x0;x++){
      const inside=x>=inner.x0&&x<=inner.x1&&y>=inner.y0&&y<=inner.y1;
      if(inside)continue;
      const i=(y*(x1-x0)+x)*4;
      if(data[i+3]<230)continue;
      samples.push([data[i],data[i+1],data[i+2]]);
    }
  }

  if(samples.length<12)return {safe:false,reason:'OCR_BACKGROUND_SAMPLE_TOO_SMALL'};
  let sr=0,sg=0,sb=0,sl=0,minL=255,maxL=0;
  const ls=[];
  for(const [r,g,b] of samples){
    const l=luminance(r,g,b);
    sr+=r;sg+=g;sb+=b;sl+=l;ls.push(l);minL=Math.min(minL,l);maxL=Math.max(maxL,l);
  }
  const meanL=sl/samples.length;
  let variance=0,dark=0;
  for(const l of ls){variance+=(l-meanL)**2;if(l<meanL-35)dark++;}
  const stdDev=Math.sqrt(variance/samples.length);
  const darkFraction=dark/samples.length;
  const fillColor={r:Math.round(sr/samples.length),g:Math.round(sg/samples.length),b:Math.round(sb/samples.length)};
  const safe=stdDev<=maxStdDev&&(maxL-minL)<=maxRange&&darkFraction<=maxDarkFraction;

  return {safe,reason:safe?null:'OCR_COMPLEX_BACKGROUND',fillColor,stdDev,range:maxL-minL,darkFraction,rect:{x0,y0,x1,y1}};
}

export function estimateTextColor(ctx,bbox,background){
  const x0=Math.max(0,Math.floor(bbox.x0)),y0=Math.max(0,Math.floor(bbox.y0));
  const x1=Math.min(ctx.canvas.width,Math.ceil(bbox.x1)),y1=Math.min(ctx.canvas.height,Math.ceil(bbox.y1));
  if(x1<=x0||y1<=y0)return {r:0,g:0,b:0};
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const bgL=luminance(background.r,background.g,background.b);
  let r=0,g=0,b=0,n=0;
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<180)continue;
    const l=luminance(data[i],data[i+1],data[i+2]);
    if(l<bgL-30){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}
  }
  return n?{r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)}:{r:0,g:0,b:0};
}
