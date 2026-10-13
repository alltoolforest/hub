// Offline research only; no worker/UI imports. Brilliance is an independent
// prototype combining bounded midtone lift, highlight restraint and clarity.
// It is not Apple's proprietary algorithm. Vibrance is not Adobe's algorithm.
import {validateFaces} from '../assets/js/photo-faces.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
const knots=[0,16,32,64,96,128,160,192,224,255];
const adjustments=[0,0,4,10,12,8,3,-2,-5,0];
function valid(data,w,h,amount){if(!(data instanceof Uint8ClampedArray)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data.length!==w*h*4||!Number.isFinite(amount)||amount<0||amount>1)throw new RangeError('Invalid trial input');}
const inside=(x,y,faces)=>faces.some(f=>x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.height);
export function brillianceLuma(l,amount){
 for(let i=1;i<knots.length;i++)if(l<=knots[i]){const t=(l-knots[i-1])/(knots[i]-knots[i-1]);return l+amount*(adjustments[i-1]*(1-t)+adjustments[i]*t);}return l;
}
function putLuma(out,data,p,l,target){
 let scale=1;for(let c=0;c<3;c++){const chroma=data[p+c]-l;if(chroma>0)scale=Math.min(scale,(255-target)/chroma);if(chroma<0)scale=Math.min(scale,-target/chroma);}
 for(let c=0;c<3;c++)out[p+c]=target+(data[p+c]-l)*scale;
}
export function brillianceTrial(data,w,h,{amount=.5,noise=1.5,faces=[]}={}){
 valid(data,w,h,amount);if(!Number.isFinite(noise)||noise<0)throw new RangeError('Invalid noise');if(!amount)return data.slice();
 faces=validateFaces(faces,w,h);
 const out=data.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;if(data[p+3]!==255)continue;const l=Y(data,p);let target=brillianceLuma(l,amount);
  // Extra local contrast is excluded from face rectangles and deep shadows.
  // This is not a qualified texture/noise classifier and cannot recover blur.
  if(x>=2&&x<w-2&&y>=2&&y<h-2&&l>24&&l<224&&!inside(x,y,faces)){
   let sum=0,opaque=true;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const q=((y+dy)*w+x+dx)*4;opaque&&=data[q+3]===255;sum+=Y(data,q);}
   const residual=l-sum/25;if(opaque&&Math.abs(residual)>Math.max(2,noise*3)&&Math.abs(residual)<24)target+=clamp(residual*.06*amount,-1,1);
  }
  putLuma(out,data,p,l,clamp(target,0,255));
 }
 return out;
}
export function vibranceTrial(data,w,h,{amount=.5,faces=[]}={}){
 valid(data,w,h,amount);const out=data.slice();
 faces=validateFaces(faces,w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=(y*w+x)*4;if(data[p+3]!==255||inside(x,y,faces))continue;
  const l=Y(data,p),hi=Math.max(...data.subarray(p,p+3)),lo=Math.min(...data.subarray(p,p+3));if(l<24||l>230)continue;
  const saturation=(hi-lo)/Math.max(hi,1),warm=data[p]>data[p+1]*1.05&&data[p]>data[p+2]*1.08;
  let gain=1+.05*amount*(1-saturation)**2*(warm?.15:1);
  for(let c=0;c<3;c++){const chroma=data[p+c]-l;if(chroma>0)gain=Math.min(gain,(255-l)/chroma);if(chroma<0)gain=Math.min(gain,-l/chroma);}
  for(let c=0;c<3;c++)out[p+c]=l+(data[p+c]-l)*gain;
 }
 return out;
}
