// Task 3 adapter: PDF.js dependency injected; no PDF writing or UI imports.
// The caller owns worker configuration and must run inspection in an isolated
// worker before production integration. Parser limits are provisional, not
// a physical-device memory guarantee.
import {InputInspectionError} from './input-inspector.mjs';
export function createIndependentInputReader(pdfjs){
  if(typeof pdfjs?.getDocument!=='function')throw new TypeError('PDF.js is required');
  return async (bytes,{signal,maxPages=500,maxOperators=200000}={})=>{
    const task=pdfjs.getDocument({data:bytes.slice(),stopAtErrors:true,
      isEvalSupported:false,enableXfa:false,useSystemFonts:false,
      disableFontFace:true,verbosity:0});
    const abort=()=>{void task.destroy().catch(()=>{});};
    signal?.addEventListener('abort',abort,{once:true});
    try{
      if(signal?.aborted)throw new InputInspectionError('cancelled','Inspection cancelled.');
      const doc=await task.promise;
      if(doc.numPages<1||doc.numPages>maxPages)
        throw new InputInspectionError('page-limit','This document exceeds the supported page limit.');
      const pages=[];
      let operations=0;
      const ops=pdfjs.OPS,imageOps=new Set([ops.paintImageXObject,ops.paintImageXObjectRepeat,
        ops.paintInlineImageXObject,ops.paintInlineImageXObjectGroup,
        ops.paintImageMaskXObject,ops.paintImageMaskXObjectGroup,ops.paintImageMaskXObjectRepeat,
        ops.paintSolidColorImageMask]);
      for(let i=1;i<=doc.numPages;i++){
        if(signal?.aborted)throw new InputInspectionError('cancelled','Inspection cancelled.');
        const page=await doc.getPage(i);
        try{
          const text=await page.getTextContent();
          const list=await page.getOperatorList();
          operations+=list.fnArray.length;
          if(operations>maxOperators)throw new InputInspectionError('operator-limit','This PDF has too many drawing operations for supported inspection.');
          const annotations=await page.getAnnotations({intent:'display'});
          pages.push({view:[...page.view],rotation:page.rotate,
            textItems:text.items.filter(x=>typeof x.str==='string'&&x.str.trim()).length,
            imagePaints:list.fnArray.filter(x=>imageOps.has(x)).length,
            annotations:annotations.length,
            links:annotations.filter(x=>x.subtype==='Link').length});
        }finally{page.cleanup();}
      }
      // Inventory attachment dictionaries in the structural inspector. Do not
      // decompress attachment payloads just to establish their presence.
      return {pages};
    }finally{
      signal?.removeEventListener('abort',abort);
      await task.destroy();
    }
  };
}
