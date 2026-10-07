// Optional local evidence runner. User photos remain outside the repository.
// npm dependency @napi-rs/canvas is used only by this offline QA runner.
import { createCanvas, loadImage, ImageData } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { photoStatistics, collectPhotoStatistics, makePhotoPlan, enhancePhotoStrip, PHOTO_HALO } from '../assets/js/image-enhancer-photo.js';
const outdir = process.env.PHOTO_QA_OUTPUT;
if (outdir) await mkdir(outdir,{recursive:true});
const inputs=process.argv.slice(2);
if(!inputs.length) inputs.push('tests/fixtures/nafnet-natural-sharp.png');
const report=[];
const mae=(a,b)=>{let sum=0;for(let p=0;p<a.length;p++)if(p%4!==3)sum+=Math.abs(a[p]-b[p]);return sum/(a.length*.75);};
for(const path of inputs){
  const img=await loadImage(path),w=img.width,h=img.height;
  const canvas=createCanvas(w,h),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const reference=ctx.getImageData(0,0,w,h).data;
  let seed=52;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(const kind of ['clean','underexposed','noise','jpeg']){
    let data=new Uint8ClampedArray(reference);
    if(kind==='underexposed') data=Uint8ClampedArray.from(data,(v,i)=>i%4===3?v:v*.58);
    if(kind==='noise') data=Uint8ClampedArray.from(data,(v,i)=>i%4===3?v:v+(rand()-.5)*34);
    if(kind==='jpeg'){const jpeg=await loadImage(canvas.toBuffer('image/jpeg',65));const c=createCanvas(w,h),cx=c.getContext('2d');cx.drawImage(jpeg,0,0);data=cx.getImageData(0,0,w,h).data;}
    const start=performance.now(),stats=photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
    for(let y=0;y<h;y+=96){const rows=Math.min(96,h-y);collectPhotoStatistics(data.subarray(y*w*4,(y+rows)*w*4),w,rows,stats,step);}
    const plan=makePhotoPlan(stats,{sourceMime:kind==='jpeg'||/\.jpe?g$/i.test(path)?'image/jpeg':'image/png'}),output=new Uint8ClampedArray(data.length);
    for(let y=0;y<h;y+=96){const top=Math.max(0,y-PHOTO_HALO),rows=Math.min(96,h-y),bottom=Math.min(h,y+rows+PHOTO_HALO);output.set(enhancePhotoStrip(data.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,rows,plan,{offsetY:top}),y*w*4);}
    const ms=Math.round(performance.now()-start);
    const entry={image:basename(path),kind,width:w,height:h,ms,inputMae:mae(data,reference),outputMae:mae(output,reference),changeMae:mae(output,data),noiseEstimate:plan.noise};
    entry.improvesReference=kind==='clean'?null:entry.outputMae<entry.inputMae;
    report.push(entry);
    if(outdir){const pair=createCanvas(w*2,h),pctx=pair.getContext('2d');pctx.putImageData(new ImageData(data,w,h),0,0);pctx.putImageData(new ImageData(output,w,h),w,0);await writeFile(resolve(outdir,basename(path)+'-'+kind+'.png'),pair.toBuffer('image/png'));}
  }
}
console.log(JSON.stringify(report,null,2));
if(outdir)await writeFile(resolve(outdir,'report.json'),JSON.stringify(report,null,2));
