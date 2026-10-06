// Capture the exact six development inputs already measured in native ordering.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas, loadImage} from '@napi-rs/canvas';
import {hash, frameOf, canvasOf} from '../image-enhancer-cleanup/adapter.mjs';
const [fixtures,intake,out] = process.argv.slice(2);
if (!out) throw Error('Usage: capture-defocus.mjs FIXTURES NASA_INTAKE OUTPUT');
await mkdir(out,{recursive:true});
const report=JSON.parse(await readFile(new URL('./native-ordering-results.json',import.meta.url)));
const manifest=[];
for(const row of report.rows.filter(r=>r.condition==='defocus')) {
  const path=row.id.startsWith('nasa')?resolve(intake,'images',row.id+'.jpg'):resolve(fixtures,row.id+'-reference.png');
  const bytes=await readFile(path);assert.equal(hash(bytes),row.sourceHash);
  const image=await loadImage(bytes),scale=Math.min(1,128/Math.max(image.width,image.height));
  const c=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
  c.getContext('2d').drawImage(image,0,0,c.width,c.height);
  const reference=frameOf(c),source={...reference,data:reference.data.slice()},taps=[];
  for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(x*x+y*y<=4)taps.push([x,y]);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)for(let k=0;k<3;k++){
    let sum=0;for(const [dx,dy] of taps)sum+=reference.data[(Math.max(0,Math.min(source.height-1,y+dy))*source.width+Math.max(0,Math.min(source.width-1,x+dx)))*4+k];
    source.data[(y*source.width+x)*4+k]=Math.round(sum/taps.length);
  }
  assert.equal(hash(source.data),row.inputHash,'Exact previously measured input');
  await writeFile(resolve(out,row.id+'-input.png'),canvasOf(source).toBuffer('image/png'));
  await writeFile(resolve(out,row.id+'-reference.png'),c.toBuffer('image/png'));
  manifest.push({id:row.id,sourceHash:row.sourceHash,inputHash:row.inputHash,inputMae:row.inputMae,
    nafRawMae:row.paths[0].stages.find(s=>s.name==='raw-deblur').mae});
}
await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Captured and hash-verified '+manifest.length+' exact paired inputs');
