// Full-reference QA for noise cleanup. Source edge energy includes noise and is
// not a detail target. This gate uses the known clean image and adversarial tests.
export function referenceQuality(source, output, target, width, height) {
  if ([source,output,target].some(d=>d.length!==width*height*4)) throw new RangeError('Mismatched reference images');
  const gray=d=>Float64Array.from({length:width*height},(_,i)=>d[i*4]*.2126+d[i*4+1]*.7152+d[i*4+2]*.0722);
  const a=gray(source),b=gray(output),t=gray(target);
  let before=0,after=0,dot=0,energy=0,outputEnergy=0,strongEdges=0;
  let sourceSsim=0,outputSsim=0,windows=0,structured=0,retained=0;
  for(let i=0;i<t.length;i++){before+=Math.abs(a[i]-t[i]);after+=Math.abs(b[i]-t[i]);}
  const ssim=(x,ids)=>{
    let mx=0,mt=0;for(const i of ids){mx+=x[i];mt+=t[i];}mx/=ids.length;mt/=ids.length;
    let vx=0,vt=0,cov=0;for(const i of ids){vx+=(x[i]-mx)**2;vt+=(t[i]-mt)**2;cov+=(x[i]-mx)*(t[i]-mt);}vx/=ids.length;vt/=ids.length;cov/=ids.length;
    return {score:((2*mx*mt+6.5025)*(2*cov+58.5225))/((mx*mx+mt*mt+6.5025)*(vx+vt+58.5225)), variance:vt, covariance:cov};
  };
  for(let y=0;y<height;y+=8)for(let x=0;x<width;x+=8){
    const ids=[];for(let dy=y;dy<Math.min(height,y+8);dy++)for(let dx=x;dx<Math.min(width,x+8);dx++)ids.push(dy*width+dx);
    const s=ssim(a,ids),o=ssim(b,ids);sourceSsim+=s.score;outputSsim+=o.score;windows++;
    if(o.variance>=16){structured++;const response=o.covariance/o.variance;if(response>=.75&&response<=1.5&&o.score>=s.score-.02)retained++;}
  }
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x,tx=(t[i+1]-t[i-1])/2,ty=(t[i+width]-t[i-width])/2;
    if(tx*tx+ty*ty<64)continue;
    const bx=(b[i+1]-b[i-1])/2,by=(b[i+width]-b[i-width])/2;
    dot+=tx*bx+ty*by;energy+=tx*tx+ty*ty;outputEnergy+=bx*bx+by*by;strongEdges++;
  }
  before/=t.length;after/=t.length;sourceSsim/=windows;outputSsim/=windows;
  const edgeResponse=energy?dot/energy:0,edgeCorrelation=energy&&outputEnergy?dot/Math.sqrt(energy*outputEnergy):0;
  const structureRetention=structured?retained/structured:0;
  const accepted=before>0 && after<=before*.9 && outputSsim>=sourceSsim+.03 && strongEdges>=16 && structured>=8 && edgeResponse>=.75 && edgeResponse<=1.5 && edgeCorrelation>=.65 && structureRetention>=.9;
  return {accepted,sourceMae:before,outputMae:after,sourceSsim,outputSsim,edgeResponse,edgeCorrelation,strongEdges,structured,structureRetention};
}
