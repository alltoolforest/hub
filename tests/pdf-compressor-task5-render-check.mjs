import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {resolve} from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {readPageTextContent} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
async function inspect(bytes){
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:true,
    disableFontFace:true,useSystemFonts:false,verbosity:0,
    standardFontDataUrl:resolve('assets/vendor/standard_fonts')+'/'});
  try{
    const doc=await task.promise,results=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),viewport=page.getViewport({scale:1});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),ctx=canvas.getContext('2d');
      await page.render({canvasContext:ctx,viewport}).promise;
      const text=await readPageTextContent(page);
      results.push({view:page.view,rotation:page.rotate,
        text:text.items.filter(x=>typeof x.str==='string').map(x=>({str:x.str,transform:x.transform,width:x.width,height:x.height})),
        pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data});page.cleanup();
    }
    return results;
  }finally{await task.destroy();}
}
export async function checkRenderedOutput(original,output,mode,{requireOCR=false}={}){
  const a=await inspect(original),b=await inspect(output);assert.equal(a.length,b.length);const rms=[];
  if(requireOCR)assert.ok(a.some(page=>page.text.some(item=>item.str.includes('Invoice 12345'))),'Fixture OCR text missing');
  for(let n=0;n<a.length;n++){
    const {pixels:x,...before}=a[n],{pixels:y,...after}=b[n];
    assert.deepEqual(after,before,'Text/OCR coordinates or page geometry changed');assert.equal(x.length,y.length);
    let squared=0;for(let p=0;p<x.length;p++)squared+=(x[p]-y[p])**2;
    const value=Math.sqrt(squared/x.length);assert.ok(value<=(mode==='strong'?35:25),'Rendered page RMS exceeds provisional quality gate');rms.push(value);
  }
  return rms;
}
