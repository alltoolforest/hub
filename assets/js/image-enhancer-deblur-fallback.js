// Bounded, non-generative recovery for tiles rejected by the learned model.
// Mild isotropic blur is assumed; this is not a motion-kernel estimator.
// Four regularized residual-backprojection steps, luminance only.
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
function blur(a,b,w,h) {
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    let sum=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const weight=(dy===0?2:1)*(dx===0?2:1);
      sum+=a[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]*weight;
    }
    b[y*w+x]=sum/16;
  }
}
export function recoverDeblurFallback(source,width,height) {
  const n=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1024||height>1024||source.length!==3*n)throw new Error('Invalid fallback tile.');
  for(const v of source)if(!Number.isFinite(v)||v<0||v>1)throw new Error('Invalid fallback pixels.');
  const original=new Float32Array(n);
  for(let i=0;i<n;i++)original[i]=source[i]*.2126+source[n+i]*.7152+source[2*n+i]*.0722;
  const estimate=original.slice(), filtered=new Float32Array(n), residual=new Float32Array(n), correction=new Float32Array(n);
  for(let iteration=0;iteration<4;iteration++) {
    blur(estimate,filtered,width,height);
    for(let i=0;i<n;i++)residual[i]=original[i]-filtered[i];
    blur(residual,correction,width,height);
    for(let i=0;i<n;i++)estimate[i]=clamp(estimate[i]+.9*correction[i]-.12*(estimate[i]-original[i]),0,1);
  }
  const out=source.slice();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*width+x, v=original[i];
    const l=original[y*width+Math.max(0,x-1)],r=original[y*width+Math.min(width-1,x+1)];
    const u=original[Math.max(0,y-1)*width+x],d=original[Math.min(height-1,y+1)*width+x];
    const gradient=Math.hypot(r-l,d-u)*.5;
    const residual=Math.abs(v-(l+r+u+d)*.25);
    const structure=clamp((gradient-.003)/.025,0,1);
    const noise=clamp((residual-gradient*.6-.004)/.025,0,1);
    const delta=clamp(estimate[i]-v,-12/255,12/255)*structure*(1-noise);
    // Same delta in every channel preserves chroma until gamut clipping.
    for(let c=0;c<3;c++)out[c*n+i]=clamp(source[c*n+i]+delta,0,1);
  }
  return out;
}
