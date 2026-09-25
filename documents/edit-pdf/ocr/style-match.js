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
  // Camera perspective frequently mimics italics. Automatic italic inference is
  // intentionally disabled until line-level slant evidence is reliable.
  const italic=false;
  const value=String(text),charAspect=width/Math.max(1,value.length)/height;
  const digits=(value.match(/[0-9]/g)||[]).length;
  const numericRatio=digits/Math.max(1,value.length);
  let family='sans-serif';
  if(hint.fontFamily)family=hint.fontFamily;
  else if(value.length>=3&&charAspect>.30&&charAspect<1.10&&numericRatio>=.55)family='monospace';
  else if(coverage<.145&&value.length>=5)family='serif';
  // Be conservative: camera blur/antialiasing inflates ink coverage and previously
  // caused normal text to be rendered too bold.
  const weight=hint.bold?700:coverage>.58?700:coverage>.48?600:coverage>.38?500:400;
  return {family,weight,italic:hint.italic??italic,coverage,charAspect};
}

export function cssFont(style,sizePx){
  const family=style.family==='monospace'?'ui-monospace,Consolas,"Courier New",monospace':style.family==='serif'?'Georgia,"Times New Roman",serif':'Arial,Helvetica,sans-serif';
  return `${style.italic?'italic ':''}${style.weight||400} ${Math.max(5,sizePx)}px ${family}`;
}
