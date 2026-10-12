// Independent, opt-in research stage. No generative model or reconstruction.
// Source-guided edge confidence + two-scale luminance unsharp masking.
// NOT a reproduction of Local Laplacian or WLS filtering from the literature.
export const DETAIL_HALO = 4;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const luminance=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
function blur(a,w,h,k){
  const r=k.length>>1,tmp=new Float32Array(a.length),out=new Float32Array(a.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let j=-r;j<=r;j++)s+=a[y*w+clamp(x+j,0,w-1)]*k[j+r];tmp[y*w+x]=s;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let j=-r;j<=r;j++)s+=tmp[clamp(y+j,0,h-1)*w+x]*k[j+r];out[y*w+x]=s;}
  return out;
}
function protection(x,y,faces){
  let result=0;
  for(const f of faces){const dx=Math.max(f.x-x,0,x-(f.x+f.width-1)),dy=Math.max(f.y-y,0,y-(f.y+f.height-1));
    const t=clamp(Math.hypot(dx,dy)/12,0,1);result=Math.max(result,1-t*t*(3-2*t));}
  return result;
}
export function detailStrip(data,source,w,h,start,rows,{offsetY=0,noise=1,faces=[],faceReviewComplete=false}={}){
  if(!faceReviewComplete)throw new Error('Review face regions before running this offline trial');
  if(![w,h,start,rows,offsetY].every(Number.isInteger)||w<1||h<1||start<0||rows<1||offsetY<0||start+rows>h||
    !(data instanceof Uint8ClampedArray)||!(source instanceof Uint8ClampedArray)||data.length!==w*h*4||source.length!==data.length)
    throw new RangeError('Invalid aligned RGBA strips');
  if(!Number.isFinite(noise)||noise<0||noise>32)throw new RangeError('Invalid noise estimate');
  if(!Array.isArray(faces)||faces.length>64||faces.some(f=>![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0))throw new RangeError('Invalid face rectangles');
  const n=w*h,lum=new Float32Array(n),guide=new Float32Array(n),alpha=new Float32Array(n);
  for(let i=0;i<n;i++){lum[i]=luminance(data,i*4);guide[i]=luminance(source,i*4);alpha[i]=data[i*4+3]===255&&source[i*4+3]===255?1:0;}
  const fine=blur(lum,w,h,[.25,.5,.25]),coarse=blur(lum,w,h,[1,8,28,56,70,56,28,8,1].map(v=>v/256));
  const valid=blur(alpha,w,h,Array(9).fill(1/9));
  const out=data.slice(start*w*4,(start+rows)*w*4),floor=Math.max(1,noise);
  for(let y=start;y<start+rows;y++)for(let x=0;x<w;x++){
    const i=y*w+x,p=i*4,q=((y-start)*w+x)*4,l=lum[i];
    if(x<4||x>=w-4||y<4||y>=h-4||valid[i]<.999999||l<12||l>240)continue;
    const protect=protection(x,y+offsetY,faces);if(protect===1)continue;
    // Confidence comes from the ORIGINAL, so amplified JPEG/grain is not
    // automatically accepted as new structure. Coherence is only a heuristic.
    let xx=0,yy=0,xy=0,residual=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const j=(y+dy)*w+x+dx,gx=(guide[j+1]-guide[j-1])/2,gy=(guide[j+w]-guide[j-w])/2;
      xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;
      residual+=Math.abs(guide[j]-(guide[j-1]+guide[j+1]+guide[j-w]+guide[j+w])/4);
    }
    const energy=xx+yy,coherence=Math.sqrt((xx-yy)**2+4*xy*xy)/(energy+1e-6),gradient=Math.sqrt(energy/9);
    if(coherence<.65||gradient<Math.max(2,floor*2)||residual/9>gradient*.6)continue;
    const confidence=clamp((coherence-.65)/.3,0,1)*clamp((gradient-floor*2)/4,0,1)*(1-protect);
    const f=l-fine[i],m=l-coarse[i];
    // Soft threshold the fine band; strong coarse differences are boundaries,
    // not detail. Limit total adjustment and stay inside the local envelope.
    const fineTerm=Math.sign(f)*Math.max(0,Math.abs(f)-floor*1.5);
    const edgeGate=clamp((28-Math.abs(m))/16,0,1);
    let delta=clamp((.30*fineTerm+.40*m*edgeGate)*confidence,-4,4);
    let lo=l,hi=l;for(const j of [i-1,i+1,i-w,i+w]){lo=Math.min(lo,lum[j]);hi=Math.max(hi,lum[j]);}
    delta=clamp(delta,Math.max(lo-l,-Math.min(data[p],data[p+1],data[p+2])),Math.min(hi-l,255-Math.max(data[p],data[p+1],data[p+2])));
    for(let c=0;c<3;c++)out[q+c]=data[p+c]+delta;
  }
  return out;
}
