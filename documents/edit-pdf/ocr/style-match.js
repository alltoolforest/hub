function lum(r,g,b){return .2126*r+.7152*g+.0722*b;}
function colorDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}

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
  const fallback={family,weight,italic:hint.italic??italic,coverage,charAspect};
  return matchScannedWord(ctx,data,width,height,x0,y0,value,background,hint,fallback);
}

export function cssFont(style,sizePx){
  const family=style.fontFace||(style.family==='monospace'?'ui-monospace,Consolas,"Courier New",monospace':style.family==='serif'?'Georgia,"Times New Roman",serif':'Arial,Helvetica,sans-serif');
  return `${style.italic?'italic ':''}${style.weight||400} ${Math.max(5,sizePx)}px ${family}`;
}

// Compare the recognized source word with locally available font candidates.
// The small scratch canvas bounds both memory use and work on mobile devices.
function matchScannedWord(ctx,data,width,height,x0,y0,text,background,hint,fallback){
  if(!text.trim()||/\s/.test(text.trim())||width>1500||height>300)return fallback;
  const canvas=ctx.canvas.ownerDocument?.createElement('canvas')||
    (typeof OffscreenCanvas==='function'?new OffscreenCanvas(1,1):null);
  if(!canvas)return fallback;
  const contrasts=new Float32Array(width*height);let peak=0;
  for(let i=0;i<contrasts.length;i++){
    const j=i*4;if(data[j+3]<180)continue;
    contrasts[i]=Math.hypot(data[j]-background.r,data[j+1]-background.g,data[j+2]-background.b);
    peak=Math.max(peak,contrasts[i]);
  }
  if(peak<35)return fallback;
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(contrasts[y*width+x]>Math.max(28,peak*.25)){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<=left||bottom<=top)return fallback;
  const inkWidth=right-left+1,inkHeight=bottom-top+1;
  const w=Math.min(192,inkWidth),h=Math.min(64,inkHeight);
  canvas.width=w;canvas.height=h;
  const probe=canvas.getContext('2d',{willReadFrequently:true});if(!probe)return fallback;
  const source=new Float32Array(w*h);let sourceEnergy=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=left+Math.min(inkWidth-1,Math.floor((x+.5)*inkWidth/w));
    const sy=top+Math.min(inkHeight-1,Math.floor((y+.5)*inkHeight/h));
    const v=Math.min(1,contrasts[sy*width+sx]/peak);source[y*w+x]=v;sourceEnergy+=v*v;
  }
  let best=null;
  const candidates=[
    {family:'sans-serif',fontFace:'Arial,Helvetica,sans-serif'},
    {family:'sans-serif',fontFace:'"DejaVu Sans",Arial,sans-serif'},
    {family:'sans-serif',fontFace:'Verdana,Geneva,sans-serif'},
    {family:'serif',fontFace:'Georgia,"Times New Roman",serif'},
    {family:'serif',fontFace:'"Times New Roman",Times,serif'},
    {family:'monospace',fontFace:'ui-monospace,Consolas,"Courier New",monospace'},
  ].filter(candidate=>!hint.fontFamily||candidate.family===hint.fontFamily);
  if(!candidates.length)candidates.push({family:fallback.family});
  const weights=hint.bold?[700]:[400,700];
  try{
    for(const candidate of candidates)for(const weight of weights){
      const style={...fallback,...candidate,weight};probe.font=cssFont(style,100);
      probe.textBaseline='alphabetic';probe.textAlign='left';
      const m=probe.measureText(text),mw=m.actualBoundingBoxLeft+m.actualBoundingBoxRight,mh=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent;
      if(!(mw>0&&mh>0))continue;
      probe.clearRect(0,0,w,h);probe.save();probe.scale(w/mw,h/mh);
      probe.fillStyle='#000';probe.fillText(text,m.actualBoundingBoxLeft,m.actualBoundingBoxAscent);probe.restore();
      const rendered=probe.getImageData(0,0,w,h).data;let dot=0,energy=0;
      for(let i=0;i<source.length;i++){const v=rendered[i*4+3]/255;dot+=v*source[i];energy+=v*v;}
      const shape=1-dot/Math.sqrt(Math.max(1e-8,energy*sourceEnergy));
      const aspect=Math.abs(Math.log((mw/mh)/(inkWidth/inkHeight)));
      const score=shape+aspect*.35;
      if(!best||score<best.score){
        const fontPx=100*inkHeight/mh;
        best={...style,score,fontPx,baseline:y0+top+m.actualBoundingBoxAscent*fontPx/100,inkX:x0+left};
      }
    }
    return best||fallback;
  }finally{canvas.width=1;canvas.height=1;}
}

// Keep the source baseline fixed, and contain every painted glyph in the same
// rectangle exported as a patch. This includes left bearings and descenders.
export function fitScannedWord(ctx,text,style,rect){
  if(!(style.fontPx>0&&Number.isFinite(style.baseline)))return null;
  ctx.save();
  try{
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
    const minimum=Math.max(5,style.fontPx*.54);
    for(let size=style.fontPx;size>=minimum;size-=.25){
      ctx.font=cssFont(style,size);const m=ctx.measureText(text);
      const x=style.inkX+m.actualBoundingBoxLeft;
      const top=style.baseline-m.actualBoundingBoxAscent,bottom=style.baseline+m.actualBoundingBoxDescent;
      if(Number.isFinite(x)&&x-m.actualBoundingBoxLeft>=rect.x&&x+m.actualBoundingBoxRight<=rect.x+rect.width&&top>=rect.y&&bottom<=rect.y+rect.height)
        return {fontPx:size,lines:[text],lineHeight:size*1.16,baseline:style.baseline,x};
    }
    return null;
  }finally{ctx.restore();}
}
