import {load} from '../core.js';
import {PdfRenderer} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/renderer.js';

// Conversion modes are explicit: editable extraction or rendered page fidelity.
// Neither mode claims to reconstruct Word tables, columns or editable graphics.
export async function pdfToDocx(bytes,{mode='text',onProgress=()=>{},signal}={}){
  if(!['text','pages'].includes(mode))throw new Error('Choose a Word conversion mode.');
  const d=await load('docx'),renderer=new PdfRenderer(bytes,{maxCachedPages:1});
  const cancelled=()=>{if(signal?.aborted)throw new Error('Word conversion cancelled.');};
  try{
    const pdf=await renderer.load(),sections=[];let characters=0,imageBytes=0;
    for(let index=0;index<pdf.numPages;index++){
      cancelled();onProgress(index,pdf.numPages);
      const info=await renderer.pageInfo(index),children=[];
      if(mode==='text'){
        const content=await renderer.getTextContent(index);let line='';
        const flush=()=>{if(line){children.push(new d.Paragraph({children:[new d.TextRun({text:line,size:22})]}));line='';}};
        for(const item of content.items){
          if(typeof item.str!=='string')continue;
          characters+=item.str.length;if(characters>2_000_000)throw new Error('Extracted text exceeds the Word conversion memory budget.');
          line+=item.str;if(item.hasEOL)flush();
        }
        flush();
        if(!children.length)throw new Error(`Page ${index+1} has no extractable text. Run OCR and enable searchable output, or choose page images.`);
      }else{
        const canvas=document.createElement('canvas');
        try{
          await renderer.render(index,canvas,{scale:Math.min(1.5,1600/Math.max(info.width,info.height))});cancelled();
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('A page image could not be created.');
          imageBytes+=blob.size;if(imageBytes>96*1024*1024)throw new Error('Rendered pages exceed the Word conversion memory budget.');
          children.push(new d.Paragraph({spacing:{before:0,after:0},children:[new d.ImageRun({data:new Uint8Array(await blob.arrayBuffer()),type:'png',transformation:{width:info.width*96/72,height:Math.max(1,info.height-2)*96/72}})]}));
        }finally{canvas.width=1;canvas.height=1;}
      }
      sections.push({properties:{page:{size:{width:Math.round(info.width*20),height:Math.round(info.height*20)},margin:mode==='pages'?{top:0,right:0,bottom:0,left:0}:{top:720,right:720,bottom:720,left:720}}},children});
    }
    cancelled();onProgress(pdf.numPages,pdf.numPages);
    const blob=await d.Packer.toBlob(new d.Document({sections}));cancelled();return blob;
  }finally{await renderer.destroy();}
}
export function pdfConversionPanel(getBytes,filename){
  const panel=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Convert PDF to Word';
  const note=document.createElement('p');note.textContent='Editable text extracts the PDF reading order and does not preserve tables, images or exact layout. Page images preserve the rendered appearance, but text and objects are not editable in Word. Scanned pages need searchable OCR for editable extraction.';
  const select=document.createElement('select');select.setAttribute('aria-label','Word conversion mode');select.append(new Option('Editable text','text'),new Option('Page images (appearance only)','pages'));
  const start=document.createElement('button'),stop=document.createElement('button'),status=document.createElement('p');start.type=stop.type='button';start.textContent='Download Word copy';stop.textContent='Cancel conversion';stop.disabled=true;status.setAttribute('role','status');let controller=null,disposed=false;
  start.addEventListener('click',async()=>{
    if(controller||disposed)return;controller=new AbortController();start.disabled=select.disabled=true;stop.disabled=false;
    try{
      status.textContent='Preparing current PDF…';const bytes=await getBytes();
      const blob=await pdfToDocx(bytes,{mode:select.value,signal:controller.signal,onProgress:(done,total)=>{status.textContent=`Converting page ${Math.min(done+1,total)} of ${total}…`;}});
      if(disposed||controller.signal.aborted)return;
      const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename.replace(/\.pdf$/i,'')+'-converted.docx';a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);status.textContent='Word copy prepared.';
    }catch(error){if(!disposed)status.textContent=error.message;}
    finally{controller=null;start.disabled=select.disabled=false;stop.disabled=true;}
  });
  stop.addEventListener('click',()=>{controller?.abort();status.textContent='Stopping after the current operation…';});
  panel.append(summary,note,select,start,stop,status);panel.dispose=()=>{disposed=true;controller?.abort();};return panel;
}
