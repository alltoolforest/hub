// RESEARCH ONLY. Not imported by the shipping/default worker. Each stage is opt-in
// to the offline trial runner. No technique here has passed real-photo acceptance.
import {noiseAt} from './photo-noise.js';
import {portraitProtectionAt} from './image-enhancer-portrait.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
export function trialDenoise(data,w,h,map,{faces=[],offsetY=0}={}){
 const out=data.slice();
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const p=(y*w+x)*4,l=Y(data,p),cell=noiseAt(map,x,y+offsetY,l);
  if(data[p+3]!==255||portraitProtectionAt(x,y+offsetY,faces)>0||cell.confidence<.55||cell.noise===null||Math.max(cell.noise,cell.chroma)<2)continue;
  let sum=[0,0,0],weight=0;const sigma=Math.max(3,cell.noise*1.5);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=((y+dy)*w+x+dx)*4;if(data[q+3]!==255)continue;const d=Y(data,q)-l,k=Math.exp(-d*d/(2*sigma*sigma))*(dx===0&&dy===0?2:1);weight+=k;for(let c=0;c<3;c++)sum[c]+=data[q+c]*k;}
  const ds=sum.map((v,c)=>v/weight-data[p+c]),dl=.2126*ds[0]+.7152*ds[1]+.0722*ds[2];
  for(let c=0;c<3;c++)out[p+c]=data[p+c]+clamp((dl*.12+(ds[c]-dl)*.35)*cell.confidence,-3,3);
 }
 return out;
}
function boxMean(data,w,h,r){const horizontal=new Float32Array(w*h),out=new Float32Array(w*h),size=r*2+1;
 for(let y=0;y<h;y++){let sum=0;for(let k=-r;k<=r;k++)sum+=Y(data,(y*w+clamp(k,0,w-1))*4);for(let x=0;x<w;x++){horizontal[y*w+x]=sum/size;sum+=Y(data,(y*w+clamp(x+r+1,0,w-1))*4)-Y(data,(y*w+clamp(x-r,0,w-1))*4);}}
 for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=horizontal[clamp(k,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/size;sum+=horizontal[clamp(y+r+1,0,h-1)*w+x]-horizontal[clamp(y-r,0,h-1)*w+x];}}return out;
}
export function trialDetail(data,w,h,map,{faces=[],offsetY=0,sourceMime='image/png'}={}){
 const out=data.slice(),radius=clamp(Math.round(Math.sqrt(map.width*map.height)/250),2,6),fine=boxMean(data,w,h,1),medium=boxMean(data,w,h,radius);
 // Radius is explicitly bounded; these trials are not browser defaults.
 for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
  const i=y*w+x,p=i*4,l=Y(data,p),cell=noiseAt(map,x,y+offsetY,l);
  if(data[p+3]!==255||l<16||l>239||portraitProtectionAt(x,y+offsetY,faces)>0||cell.confidence<.55||cell.noise===null||cell.noise>3)continue;
  if(sourceMime==='image/jpeg'&&(x%8===0||x%8===7||(y+offsetY)%8===0||(y+offsetY)%8===7))continue;
  let lo=l,hi=l,valid=true;for(const q of[p-4,p+4,p-w*4,p+w*4]){lo=Math.min(lo,Y(data,q));hi=Math.max(hi,Y(data,q));valid&&=data[q+3]===255;}
  if(!valid||hi-lo>36)continue;
  const f=l-fine[i],m=l-medium[i];if(Math.abs(f)<Math.max(1.5,cell.noise*2)||Math.abs(m)>25)continue;
  let delta=clamp((f*.16+m*.055)*cell.confidence,-2,2);
  // Common-channel delta prevents hue rotation and clipping; local envelope avoids overshoot.
  delta=clamp(delta,Math.max(lo-l,-Math.min(data[p],data[p+1],data[p+2])),Math.min(hi-l,255-Math.max(data[p],data[p+1],data[p+2])));
  for(let c=0;c<3;c++)out[p+c]=data[p+c]+delta;
 }
 return out;
}
export function trialTone(data,w,h,map,{faces=[],offsetY=0}={}){
 const out=data.slice(),mean=boxMean(data,w,h,8);let sum=0,n=0;for(let p=0;p<data.length;p+=4)if(data[p+3]===255){sum+=Y(data,p);n++;}if(!n||sum/n<110)return out;
 for(let y=8;y<h-8;y++)for(let x=8;x<w-8;x++){const i=y*w+x,p=i*4,l=Y(data,p),cell=noiseAt(map,x,y+offsetY,l);if(data[p+3]!==255||l<24||l>120||mean[i]<36||mean[i]>100||cell.confidence<.55||cell.noise===null||cell.noise>2||portraitProtectionAt(x,y+offsetY,faces)>0)continue;const ramp=clamp((l-24)/32,0,1)*clamp((120-l)/40,0,1);const delta=Math.min(2*ramp*cell.confidence,255-Math.max(data[p],data[p+1],data[p+2]));for(let c=0;c<3;c++)out[p+c]=data[p+c]+delta;}
 return out;
}
export function trialVibrance(data,w,h,map,{faces=[],offsetY=0}={}){
 const out=data.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4,l=Y(data,p),hi=Math.max(data[p],data[p+1],data[p+2]),lo=Math.min(data[p],data[p+1],data[p+2]);if(data[p+3]!==255||portraitProtectionAt(x,y+offsetY,faces)>0||l<24||l>230||hi-lo>80)continue;
  let scale=1+.025*(1-(hi-lo)/80);for(let c=0;c<3;c++){const chroma=data[p+c]-l;if(chroma>0)scale=Math.min(scale,(255-l)/chroma);if(chroma<0)scale=Math.min(scale,-l/chroma);}for(let c=0;c<3;c++)out[p+c]=l+(data[p+c]-l)*scale;
 }return out;
}
