// Controlled softness diagnostic, keeping tone unchanged. Inputs are synthetic
// Gaussian-blurred calibration originals, never held-out camera ground truth.
import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';import{detailStrip}from'./detail-r4.js';
const corpus=JSON.parse(readFileSync(process.argv[2])),hash=x=>createHash('sha256').update(x).digest('hex'),results=[];
for(const c of corpus.cases){const d=new Uint8ClampedArray(readFileSync(c.raw)),ref=new Uint8ClampedArray(readFileSync(c.reference));assert.equal(hash(d),c.input_sha256);assert.equal(hash(ref),c.reference_sha256);assert.equal(d.length,c.width*c.height*4);assert.equal(ref.length,d.length);
 const out=new Uint8ClampedArray(d.length),w=c.width,h=c.height;
 for(let y=0;y<h;y+=96){const n=Math.min(96,h-y),top=Math.max(0,y-4),bottom=Math.min(h,y+n+4),s=d.subarray(top*w*4,bottom*w*4);out.set(detailStrip(s,s,w,bottom-top,y-top,n,{noise:1,offsetY:top,faces:c.faces,faceReviewComplete:true}),y*w*4);}
 const mse=a=>{let s=0;for(let p=0;p<a.length;p+=4)for(let k=0;k<3;k++)s+=(a[p+k]-ref[p+k])**2;return s/(w*h*3);};
 results.push({id:c.id,input_sha256:hash(d),output_sha256:hash(out),beforeMSE:mse(d),afterMSE:mse(out)});
}
const report={generator:corpus.generator,limitations:'Synthetic blur on three calibration scenes; not proof of recovered facial detail or real-photo preference',results};if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results,null,2));
