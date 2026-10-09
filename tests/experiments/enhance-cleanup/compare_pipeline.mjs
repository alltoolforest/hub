// Offline integration simulation; production modules are imported without edits.
import {readFile,writeFile} from 'node:fs/promises';
import {createCanvas,loadImage,ImageData} from '@napi-rs/canvas';
import {photoStatistics,collectPhotoStatistics,makePhotoPlan,enhancePhotoStrip} from '../../../assets/js/image-enhancer-photo.js';
const dir=process.argv[2];if(!dir)throw Error('Pass an external trial output directory');
const records=JSON.parse(await readFile(dir+'/report.json','utf8'));
function run(data,w,h,portrait,sourceMime,faces){
 const stats=photoStatistics(),step=Math.max(2,Math.ceil(Math.sqrt(w*h/90000)));
 for(let y=0;y<h;y+=96)collectPhotoStatistics(data.subarray(y*w*4,Math.min(h,y+96)*w*4),w,Math.min(96,h-y),stats,step,y);
 const plan=makePhotoPlan(stats,{content:portrait?'portrait':'auto',strength:'balanced',sharpness:'auto',sourceMime});
 const output=new Uint8ClampedArray(data.length);
 for(let y=0;y<h;y+=96){const top=Math.max(0,y-10),rows=Math.min(96,h-y),bottom=Math.min(h,y+rows+10);output.set(enhancePhotoStrip(data.subarray(top*w*4,bottom*w*4),w,bottom-top,y-top,rows,plan,{offsetY:top,faces}),y*w*4);}
 return output;
}
const mae=(a,b)=>a.reduce((sum,v,i)=>sum+(i%4!==3?Math.abs(v-b[i]):0),0)/(a.length*.75);
const report=[];
for(const r of records){
 const portrait=r.case.startsWith('portrait');
 const faces=r.case==='portrait-old'?[{x:200,y:250,width:530,height:600}]:r.case==='portrait-sari'?[{x:136,y:65,width:127,height:158}]:[];
 const outputs={};
 for(const key of ['input','reference','metadata','evidence']){
  if(!r.paths[key])continue;
  const im=await loadImage(r.paths[key]),c=createCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);
  const output=run(ctx.getImageData(0,0,im.width,im.height).data,im.width,im.height,portrait,key==='reference'||r.quantization_mean===null?'image/png':'image/jpeg',faces);
  outputs[key]=output;ctx.putImageData(new ImageData(output,im.width,im.height),0,0);
  // All rendered outputs stay in the external experiment directory.
  await writeFile(r.paths[key].replace('.png','-enhanced.png'),c.toBuffer('image/png'));
 }
 const result={case:r.case,baselineReferenceMae:outputs.reference?mae(outputs.input,outputs.reference):null,variants:{}};
 for(const key of ['metadata','evidence'])result.variants[key]={changeMae:mae(outputs[key],outputs.input),referenceMae:outputs.reference?mae(outputs[key],outputs.reference):null};
 report.push(result);
}
await writeFile(dir+'/pipeline-report.json',JSON.stringify(report,null,2));console.log('Compared '+report.length+' cases against the unchanged deployed Enhance module.');
