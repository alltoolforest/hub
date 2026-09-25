function lum(r,g,b){return .2126*r+.7152*g+.0722*b;}
function colorDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}
function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}

export function inferScannedTextStyle(ctx,bbox,text='',background={r:255,g:255,b:255},hint={}){
  const x0=Math.max(0,Math.floor(bbox.x0)),y0=Math.max(0,Math.floor(bbox.y0));
  const x1=Math.min(ctx.canvas.width,Math.ceil(bbox.x1)),y1=Math.min(ctx.canvas.height,Math.ceil(bbox.y1));
  const width=Math.max(1,x1-x0),height=Math.max(1,y1-y0);
  const data=ctx.getImageData(x0,y0,width,height).data;
  const bgL=lum(background.r,background.g,background.b);
  let ink=0,total=0;const rowCenters=[];
  for(let y=0;y<height;y++){
    let sx=0,n=0;
    for(let x=0;x<width;x++){
      const i=(y*width+x)*4;if(data[i+3]<180)continue;total++;
      const p={r:data[i],g:data[i+1],b:data[i+2]};
      if(Math.abs(lum(p.r,p.g,p.b)-bgL)>34||colorDistance(p,background)>62){ink++;sx+=x;n++;}
    }
    if(n)rowCenters.push({y,x:sx/n});
  }
  const coverage=ink/Math.max(1,total);
  let italic=false;
  if(rowCenters.length>=4){
    const q=Math.max(1,Math.floor(rowCenters.length/4));
    const top=median(rowCenters.slice(0,q).map(r=>r.x));
    const bottom=median(rowCenters.slice(-q).map(r=>r.x));
    italic=Math.abs(top-bottom)>width*.07;
  }
  const charAspect=width/Math.max(1,String(text).length)/height;
  let family='sans-serif';
  if(hint.fontFamily)family=hint.fontFamily;
  else if(String(text).length>=3&&charAspect>.42&&charAspect<.78&&/^[A-Z0-9.,:/%+()\-]+$/.test(String(text)))family='monospace';
  else if(coverage<.145&&String(text).length>=5)family='serif';
  const weight=hint.bold?700:coverage>.225?700:coverage>.175?600:400;
  return {family,weight,italic:hint.italic??italic,coverage,charAspect};
}

export function cssFont(style,sizePx){
  const family=style.family==='monospace'?'ui-monospace,Consolas,"Courier New",monospace':style.family==='serif'?'Georgia,"Times New Roman",serif':'Arial,Helvetica,sans-serif';
  return `${style.italic?'italic ':''}${style.weight||400} ${Math.max(5,sizePx)}px ${family}`;
}
