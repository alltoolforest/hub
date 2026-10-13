// Offline research: no AI, coordinate changes, extra sharpening or luma smoothing.
import {validateFaces} from '../assets/js/photo-faces.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const Y=(d,p)=>.2126*d[p]+.7152*d[p+1]+.0722*d[p+2];
const median=a=>{a.sort((a,b)=>a-b);return a[Math.floor(a.length/2)]||0;};
function valid(d,w,h){if(!(d instanceof Uint8ClampedArray)||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||d.length!==w*h*4)throw new Error('Invalid R9 pixels');}
const inside=(x,y,faces)=>faces.some(f=>x>=f.x&&x<f.x+f.width&&y>=f.y&&y<f.y+f.height);
function put(out,p,l,r,b){const g=-(.2126*r+.0722*b)/.7152;let k=1;for(const c of[r,g,b]){if(c>0)k=Math.min(k,(255-l)/c);if(c<0)k=Math.min(k,-l/c);}out[p]=l+r*k;out[p+1]=l+g*k;out[p+2]=l+b*k;}
export function estimateChroma(d,w,h){
 valid(d,w,h);const residual=[];const step=Math.max(1,Math.ceil(Math.sqrt(w*h/60000)));
 for(let y=1;y<h-1;y+=step)for(let x=1;x<w-1;x+=step){const p=(y*w+x)*4;if(d[p+3]!==255)continue;const l=Y(d,p),rr=[],bb=[];let low=l,high=l,opaque=true;
  for(const [dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const q=((y+dy)*w+x+dx)*4,ly=Y(d,q);opaque&&=d[q+3]===255;low=Math.min(low,ly);high=Math.max(high,ly);rr.push(d[q]-ly);bb.push(d[q+2]-ly);}
  if(opaque&&high-low<10)residual.push(Math.max(Math.abs(d[p]-l-median(rr)),Math.abs(d[p+2]-l-median(bb))));
 }
 return {sigma:residual.length>=64?median(residual)/.954:0,samples:residual.length};
}
export function selectiveChromaStrip(d,w,h,start,rows,{sigma=0,offsetY=0,faces=[]}={}){
 valid(d,w,h);if(![start,rows,offsetY].every(Number.isInteger)||start<0||rows<1||offsetY<0||start+rows>h||!Number.isFinite(sigma)||sigma<0)throw new Error('Invalid R9 strip');
 // Validate global rectangles in the runner; strips may not contain the whole face.
 if(!Array.isArray(faces)||faces.some(f=>![f.x,f.y,f.width,f.height].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0))throw new Error('Invalid faces');
 const out=d.slice(start*w*4,(start+rows)*w*4);if(sigma<2)return out;
 for(let y=Math.max(1,start);y<Math.min(h-1,start+rows);y++)for(let x=1;x<w-1;x++){
  const p=(y*w+x)*4,q=((y-start)*w+x)*4;if(d[p+3]!==255||inside(x,y+offsetY,faces))continue;
  const l=Y(d,p),r=d[p]-l,b=d[p+2]-l,rs=[],bs=[];let low=l,high=l,opaque=true;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const j=((y+dy)*w+x+dx)*4,ly=Y(d,j);opaque&&=d[j+3]===255;low=Math.min(low,ly);high=Math.max(high,ly);rs.push(d[j]-ly);bs.push(d[j+2]-ly);}
  if(!opaque||high-low>12)continue;
  const mr=median(rs),mb=median(bs),spread=Math.max(median(rs.map(v=>Math.abs(v-mr))),median(bs.map(v=>Math.abs(v-mb))));
  const threshold=Math.max(5,2*sigma,3*spread),distance=Math.max(Math.abs(r-mr),Math.abs(b-mb));
  if(distance<=threshold)continue;
  const gain=.45*clamp((distance-threshold)/threshold,0,1);
  put(out,q,l,r+clamp((mr-r)*gain,-3,3),b+clamp((mb-b)*gain,-3,3));
 }
 return out;
}
export function coordinatedTone(source,baseline,w,h,{mean,mode='natural'}={}){
 valid(source,w,h);valid(baseline,w,h);if(!Number.isFinite(mean)||mean<0||mean>255||!['natural','brighter'].includes(mode))throw new Error('Invalid tone');
 const out=source.slice(),dark=clamp((100-mean)/55,0,1),lift=(mode==='brighter'?9:5)+8*dark,blend=.35+.65*dark,limit=8+27*dark;
 for(let p=0;p<source.length;p+=4){if(source[p+3]!==255)continue;const l=Y(source,p),guide=Y(baseline,p),t=l/255;
  // Source chroma retained; limit baseline darkening and high-end changes.
  const delta=clamp(guide-l,-2,limit)*blend;
  const hi=Math.max(source[p],source[p+1],source[p+2]);
  // Stop at channel headroom rather than desaturating to fit a brighter target.
  // Existing saturated highlights and blacks stay intact; never add white clipping.
  const target=Math.max(l,Math.min(l+(delta+lift*4*t*(1-t))*clamp((250-l)/40,0,1),l+Math.max(0,254-hi)));
  put(out,p,target,source[p]-l,source[p+2]-l);
 }
 return out;
}
export function validateReviewFaces(faces,w,h){return validateFaces(faces,w,h);}
