function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b;}
function colorDistance(a,b){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}

export function estimateRasterStyle(ctx,region,analysis){
  const bb=region.bbox;
  const x0=clamp(Math.floor(bb.x0),0,ctx.canvas.width-1),y0=clamp(Math.floor(bb.y0),0,ctx.canvas.height-1);
  const x1=clamp(Math.ceil(bb.x1),x0+1,ctx.canvas.width),y1=clamp(Math.ceil(bb.y1),y0+1,ctx.canvas.height);
  const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
  const bg=analysis?.fillColor||{r:255,g:255,b:255};
  const bgL=luminance(bg.r,bg.g,bg.b);
  let ink=0,total=0,light=0,dark=0,r=0,g=0,b=0,n=0;
  const threshold=Math.max(24,Math.min(58,(analysis?.robustRange||45)*.55));
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<180)continue;
    total++;
    const px={r:data[i],g:data[i+1],b:data[i+2]};
    if(colorDistance(px,bg)<threshold)continue;
    const l=luminance(px.r,px.g,px.b);
    if(Math.abs(l-bgL)<threshold*.65)continue;
    ink++;if(l>bgL)light++;else dark++;
    r+=px.r;g+=px.g;b+=px.b;n++;
  }
  const foreground=n?{r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)}:(bgL<128?{r:245,g:245,b:245}:{r:20,g:20,b:20});
  const inkFraction=ink/Math.max(1,total);
  const height=Math.max(7,bb.y1-bb.y0);
  const words=region.words||[];
  const ratios=words.filter(w=>String(w.text||'').length>=2).map(w=>(w.bbox.x1-w.bbox.x0)/(Math.max(1,w.bbox.y1-w.bbox.y0)*String(w.text).length));
  const mean=ratios.reduce((s,v)=>s+v,0)/Math.max(1,ratios.length);
  const variance=ratios.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,ratios.length);
  const cv=mean?Math.sqrt(variance)/mean:1;
  const mono=ratios.length>=2&&cv<.16&&mean>.34&&mean<.78;
  const bold=inkFraction>.245;
  const serif=!mono&&estimateSerifSignal(data,x1-x0,y1-y0,bg,threshold)>.16;
  return {
    foreground,
    polarity:light>dark?'light':'dark',
    fontPx:Math.max(7,height*.90),
    weight:bold?'700':'400',
    italic:false,
    familyHint:mono?'mono':serif?'serif':'sans',
    inkFraction,
  };
}

function estimateSerifSignal(data,width,height,bg,threshold){
  if(width<6||height<6)return 0;
  const bgL=luminance(bg.r,bg.g,bg.b);
  let edge=0,mid=0,edgeN=0,midN=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;if(data[i+3]<180)continue;
    const l=luminance(data[i],data[i+1],data[i+2]);
    const isInk=Math.abs(l-bgL)>threshold*.75;
    if(y<height*.22||y>height*.78){edgeN++;if(isInk)edge++;}
    else if(y>height*.35&&y<height*.65){midN++;if(isInk)mid++;}
  }
  const e=edge/Math.max(1,edgeN),m=mid/Math.max(1,midN);
  return Math.max(0,e-m);
}

const FAMILIES={
  mono:['"Courier New"','Courier','monospace'],
  serif:['"Times New Roman"','Georgia','serif'],
  sans:['Arial','Helvetica','sans-serif'],
};

export function chooseFontForRegion(ctx,text,region,style){
  const height=Math.max(7,region.bbox.y1-region.bbox.y0);
  const preferred=style.familyHint||'sans';
  const families=[preferred,...['sans','serif','mono'].filter(x=>x!==preferred)];
  let best=null;
  for(const key of families){
    const family=FAMILIES[key].join(',');
    const px=Math.max(7,style.fontPx||height*.9);
    const font=`${style.italic?'italic ':''}${style.weight||'400'} ${px}px ${family}`;
    ctx.save();ctx.font=font;const width=ctx.measureText(String(text||'M')).width;ctx.restore();
    const target=Math.max(1,region.bbox.x1-region.bbox.x0);
    const widthScore=Math.abs(Math.log(Math.max(.05,width/target)));
    const prior=key===preferred?0:.11;
    const score=widthScore+prior;
    if(!best||score<best.score)best={family,key,fontPx:px,score};
  }
  return best||{family:FAMILIES.sans.join(','),key:'sans',fontPx:Math.max(7,height*.9),score:0};
}

export function layoutReplacement(ctx,region,text,style,{minFontRatio=.55,maxWidthFactor=null}={}){
  const replacement=String(text??'');
  if(!replacement)return {ok:true,lines:[],fontPx:style.fontPx,family:FAMILIES[style.familyHint||'sans'].join(','),lineHeight:style.fontPx*1.15};
  const bb=region.bbox;
  const width=Math.max(6,bb.x1-bb.x0);
  const height=Math.max(7,bb.y1-bb.y0);
  const chosen=chooseFontForRegion(ctx,replacement.replace(/\s+/g,' '),region,style);
  let fontPx=chosen.fontPx;
  const maxWidth=width*(maxWidthFactor??(region.type==='word'?1.12:1.04));
  const maxLines=region.type==='paragraph'?Math.max(1,region.lines?.length||1):1;
  const minPx=Math.max(6,height*(region.type==='paragraph'?1/Math.max(1,maxLines):1)*minFontRatio);

  function setFont(){ctx.font=`${style.italic?'italic ':''}${style.weight||'400'} ${fontPx}px ${chosen.family}`;}
  function wrap(){
    setFont();
    if(maxLines===1)return [replacement.replace(/\s+/g,' ').trim()];
    const hard=replacement.split(/\n/);const out=[];
    for(const part of hard){
      const tokens=part.trim().split(/\s+/).filter(Boolean);let line='';
      for(const token of tokens){const probe=line?`${line} ${token}`:token;if(ctx.measureText(probe).width<=maxWidth||!line)line=probe;else{out.push(line);line=token;}}
      if(line)out.push(line);else if(!tokens.length)out.push('');
    }
    return out;
  }

  let lines=wrap();
  for(let i=0;i<10;i++){
    setFont();
    const widest=Math.max(0,...lines.map(line=>ctx.measureText(line).width));
    const lineHeight=fontPx*1.16;
    if(widest<=maxWidth*1.01&&lines.length<=maxLines&&lineHeight*lines.length<=height*1.08)return {ok:true,lines,fontPx,family:chosen.family,lineHeight};
    const scale=Math.min(maxWidth/Math.max(1,widest),(height*.98)/Math.max(1,lineHeight*lines.length),.94);
    fontPx=Math.max(minPx,fontPx*scale);
    lines=wrap();
    if(fontPx<=minPx+.05)break;
  }
  setFont();
  const widest=Math.max(0,...lines.map(line=>ctx.measureText(line).width));
  const lineHeight=fontPx*1.16;
  const ok=widest<=maxWidth*1.02&&lines.length<=maxLines&&lineHeight*lines.length<=height*1.10&&fontPx>=minPx-.05;
  return {ok,lines,fontPx,family:chosen.family,lineHeight,reason:ok?null:'OCR_TEXT_TOO_WIDE'};
}
