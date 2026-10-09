// Offline comparison against the deployed PR165 engine. User images stay external.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCanvas,loadImage,ImageData} from '@napi-rs/canvas';
import * as candidate from '../assets/js/image-enhancer-photo.js';
const baselineSha='a17605e52f9efc6fd71385368cac0247c9070254';
let source=execFileSync('git',['show',baselineSha+':assets/js/image-enhancer-photo.js'],{encoding:'utf8'});
source=source.replace("'./image-enhancer-portrait.js'",JSON.stringify(pathToFileURL(resolve('assets/js/image-enhancer-portrait.js')).href));
const baseline=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const output=process.env.PHOTO_QA_OUTPUT;if(!output)throw Error('Set external PHOTO_QA_OUTPUT');
if(resolve(output).startsWith(process.cwd()+'/'))throw Error('Output must be outside repo');await mkdir(output,{recursive:true});
const mae=(a,b)=>{let n=0;for(let i=0;i<a.length;i++)if(i%4!==3)n+=Math.abs(a[i]-b[i]);return n/(a.length*.75);};
function run(engine,data,w,h,options){
 const stats=engine.photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
 for(let y=0;y<h;y+=96)engine.collectPhotoStatistics(data.subarray(y*w*4,Math.min(h,y+96)*w*4),w,Math.min(96,h-y),stats,step,y);
 const plan=engine.makePhotoPlan(stats,options),out=new Uint8ClampedArray(data.length);
 const start=performance.now();
 for(let y=0;y<h;y+=96){const top=Math.max(0,y-10),rows=Math.min(96,h-y),bottom=Math.min(h,y+rows+10);out.set(engine.enhancePhotoStrip(data.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,rows,plan,{offsetY:top,faces:options.content==='portrait'?[{x:0,y:0,width:w,height:h}]:[]}),y*w*4);}
 return {out,plan,ms:performance.now()-start};
}
const records=[];
for(const path of process.argv.slice(2)){
 const im=await loadImage(path),w=im.width,h=im.height,c=createCanvas(w,h),ctx=c.getContext('2d');ctx.drawImage(im,0,0);const original=ctx.getImageData(0,0,w,h).data;
 const privateInput=basename(path).startsWith('WhatsApp')||basename(path).startsWith('T4es1');
 for(const variant of privateInput?['original']:['original','mixed-exposure']){
  const data=new Uint8ClampedArray(original);
  // Synthetic exposure degradation of existing darker pixels; native dimensions.
  if(variant==='mixed-exposure')for(let p=0;p<data.length;p+=4){const y=data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722;const t=Math.max(0,Math.min(1,(170-y)/70));const gain=1-.55*t*t*(3-2*t);for(let j=0;j<3;j++)data[p+j]*=gain;}
  const opts={sourceMime:/\.jpe?g$/i.test(path)?'image/jpeg':'image/png',content:privateInput?'portrait':'auto',strength:'balanced',sharpness:'auto'};
  // Whole-frame protection for supplied portrait comparison isolates exposure changes;
  // detector performance is not tested here.
  const a=run(baseline,data,w,h,opts),b=run(candidate,data,w,h,opts);
  const ref=variant==='mixed-exposure'?run(baseline,original,w,h,opts).out:null;
  const id=(privateInput?basename(path).startsWith('WhatsApp')?'private-old':'private-sari':basename(path))+'-'+variant;
  records.push({id,width:w,height:h,shadowLift:b.plan.shadowLift,shadowNoise:b.plan.shadowNoise,changeMae:mae(a.out,b.out),baselineReferenceMae:ref?mae(a.out,ref):null,candidateReferenceMae:ref?mae(b.out,ref):null,baselineMs:a.ms,candidateMs:b.ms});
  if(b.plan.shadowLift>0||privateInput){const height=Math.min(h,600),width=Math.round(w*height/h),pair=createCanvas(width*3,height+30),px=pair.getContext('2d');px.fillStyle='white';px.fillRect(0,0,pair.width,pair.height);px.fillStyle='black';px.font='15px sans-serif';for(const [i,array] of [data,a.out,b.out].entries()){ctx.putImageData(new ImageData(array,w,h),0,0);px.fillText(['Input','Deployed','Candidate'][i],i*width+3,20);px.drawImage(c,i*width,30,width,height);}await writeFile(resolve(output,id+'.png'),pair.toBuffer('image/png'));}
 }
}
await writeFile(resolve(output,'report.json'),JSON.stringify({baselineSha,records},null,2));console.log(JSON.stringify(records));
