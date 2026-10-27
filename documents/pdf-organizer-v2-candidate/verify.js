// A second parser/renderer checks the final serialized file against source pages.
// Bounded preview comparison complements the structural engine; it is not a
// full-resolution proof of fidelity or a confidential-data sanitization proof.
export async function verifyExport({pdfjs,bytes,items,sources,cancelled,onTask,onProgress}) {
  const check=()=>{if(cancelled())throw new DOMException('Cancelled','AbortError');};
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:true,
    cMapUrl:new URL('../../assets/vendor/cmaps/',import.meta.url).href,cMapPacked:true,
    standardFontDataUrl:new URL('../../assets/vendor/standard_fonts/',import.meta.url).href,
    wasmUrl:new URL('../../assets/vendor/wasm/',import.meta.url).href});
  onTask(task);let out;
  const canvases=[];
  async function pixels(page,rotation){
    check();const base=page.getViewport({scale:1,rotation});
    const viewport=page.getViewport({scale:320/Math.max(base.width,base.height),rotation});
    const canvas=document.createElement('canvas');canvases.push(canvas);
    canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
    const context=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:context,viewport}).promise;check();
    return {width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data};
  }
  const textShape=t=>JSON.stringify(t.items.map(i=>({str:i.str,dir:i.dir,transform:i.transform,width:i.width,height:i.height,hasEOL:i.hasEOL})));
  try {
    out=await task.promise;check();
    if(out.numPages!==items.length)throw Error('Independent verification: incorrect page count.');
    for(let i=0;i<items.length;i++) {
      const item=items[i],page=await out.getPage(i+1);check();
      onProgress(99,'Independent visual/text check '+(i+1)+'/'+items.length);
      if(item.blank){const text=await page.getTextContent();if(text.items.some(x=>x.str?.trim()))throw Error('A blank page unexpectedly contains text.');}
      else {
        const src=sources.find(s=>s.id===item.src),original=await src.pdfjs.getPage(item.page+1);
        const originalText=await original.getTextContent(),outputText=await page.getTextContent();
        if(textShape(originalText)!==textShape(outputText))throw Error('Independent verification: text or positioning changed on output page '+(i+1)+'.');
        const expected=await pixels(original,(original.rotate+item.rot)%360),actual=await pixels(page,page.rotate);
        if(expected.width!==actual.width||expected.height!==actual.height||expected.data.length!==actual.data.length)throw Error('Independent verification: page geometry changed.');
        for(let k=0;k<expected.data.length;k++)if(expected.data[k]!==actual.data[k])throw Error('Independent verification: page appearance changed on output page '+(i+1)+'.');
      }
      for(const c of canvases){c.width=0;c.height=0;}canvases.length=0;page.cleanup();
      await new Promise(r=>setTimeout(r,0));check();
    }
  }finally{for(const c of canvases){c.width=0;c.height=0;}onTask(null);await task.destroy();}
}
