// Offline, non-generative, edge-aware luma/chroma cleanup before R7 grading.
// Not a qualified sensor-noise model or non-local means implementation.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const DENOISE_R8=Object.freeze({low:{luma:.25,chroma:.35,sigmaY:6,sigmaC:12},medium:{luma:.5,chroma:.6,sigmaY:9,sigmaC:16},strong:{luma:.75,chroma:.85,sigmaY:12,sigmaC:20}});
export function denoiseStrip(data,w,h,start,rows,{strength='medium',offsetY=0,faces=[]}={}){
 const settings=DENOISE_R8[strength];
 if(!settings||!(data instanceof Uint8ClampedArray)||![w,h,start,rows,offsetY].every(Number.isInteger)||w<1||h<1||start<0||rows<1||offsetY<0||start+rows>h||data.length!==w*h*4)throw new Error('Invalid denoise strip');
 if(!Array.isArray(faces)||faces.some(f=>![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0))throw new Error('Invalid face annotations');
 const n=w*h,L=new Float32Array(n),R=new Float32Array(n),B=new Float32Array(n),out=data.slice(start*w*4,(start+rows)*w*4);
 for(let i=0;i<n;i++){const p=i*4;L[i]=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];R[i]=data[p]-L[i];B[i]=data[p+2]-L[i];}
 const yWeight=Float32Array.from({length:256},(_,i)=>Math.exp(-i*i/(2*settings.sigmaY**2))),cWeight=Float32Array.from({length:511},(_,i)=>Math.exp(-i*i/(2*settings.sigmaC**2)));
 const spatial=Array.from({length:5},(_,i)=>Math.exp(-((i-2)**2)/3));
 for(let y=start;y<start+rows;y++)for(let x=0;x<w;x++){
  const i=y*w+x,p=i*4,q=((y-start)*w+x)*4;if(data[p+3]!==255)continue;
  let sumL=0,sumR=0,sumB=0,total=0,mean=0,square=0,count=0;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
   const j=clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1);if(data[j*4+3]!==255)continue;
   const weight=spatial[dy+2]*spatial[dx+2]*yWeight[Math.min(255,Math.round(Math.abs(L[j]-L[i])))]*cWeight[Math.min(510,Math.round(Math.max(Math.abs(R[j]-R[i]),Math.abs(B[j]-B[i]))))];
   sumL+=L[j]*weight;sumR+=R[j]*weight;sumB+=B[j]*weight;total+=weight;mean+=L[j];square+=L[j]**2;count++;
  }
  const deviation=Math.sqrt(Math.max(0,square/count-(mean/count)**2)),flat=clamp((16-deviation)/12,.05,1);
  let edge=1;
  if(x>=2&&x<w-2&&y>=2&&y<h-2){let xx=0,yy=0,xy=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=(y+dy)*w+x+dx,gx=(L[j+1]-L[j-1])/2,gy=(L[j+w]-L[j-w])/2;xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;}const energy=xx+yy,coherence=Math.sqrt((xx-yy)**2+4*xy*xy)/(energy+1e-6);if(coherence>.6&&Math.sqrt(energy/9)>2)edge=.15;}
  const face=faces.some(f=>x>=f.x&&x<f.x+f.width&&y+offsetY>=f.y&&y+offsetY<f.y+f.height);
  const yl=settings.luma*flat*edge*(face?.4:1),cc=settings.chroma*Math.max(.2,flat)*edge*(face?.65:1);
  const target=L[i]+clamp((sumL/total-L[i])*yl,face?-1.5:-4,face?1.5:4);
  const red=R[i]+clamp((sumR/total-R[i])*cc,-5,5),blue=B[i]+clamp((sumB/total-B[i])*cc,-5,5),green=-(.2126*red+.0722*blue)/.7152;
  let scale=1;for(const chroma of[red,green,blue]){if(chroma>0)scale=Math.min(scale,(255-target)/chroma);if(chroma<0)scale=Math.min(scale,-target/chroma);}
  for(const[c,chroma]of[red,green,blue].entries())out[q+c]=target+chroma*scale;
 }
 return out;
}
