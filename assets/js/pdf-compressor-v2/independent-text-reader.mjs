// Task 7: exact text/placement fingerprints with no extracted text leaving worker.
import {readPageTextContent} from './independent-input-reader.mjs';
import {digestPDFBytes,OutputIntegrityError} from './output-integrity.mjs';
export function createIndependentTextReader(pdfjs){
  return async(bytes,{signal,maxPages=500,maxItems=200000,maxCharacters=2000000}={})=>{
    const task=pdfjs.getDocument({data:bytes.slice(),stopAtErrors:true,
      isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
    const abort=()=>{void task.destroy().catch(()=>{});};
    signal?.addEventListener('abort',abort,{once:true});
    const collector=createTextFingerprintCollector({maxItems,maxCharacters});
    try{
      if(signal?.aborted)throw new OutputIntegrityError('cancelled');
      const doc=await task.promise;
      if(doc.numPages<1||doc.numPages>maxPages)throw new OutputIntegrityError('text-page-limit');
      const pages=collector.pages;
      for(let n=1;n<=doc.numPages;n++){
        if(signal?.aborted)throw new OutputIntegrityError('cancelled');
        const page=await doc.getPage(n);
        try{
          const text=await readPageTextContent(page,{signal,maxTextItems:collector.remainingItems});
          await collector.add(page,text);
        }finally{page.cleanup();}
      }
      return pages;
    }finally{
      signal?.removeEventListener('abort',abort);
      await task.destroy();
    }
  };
}

export function createTextFingerprintCollector({maxItems=200000,maxCharacters=2000000}={}){
 const pages=[];let totalItems=0,totalCharacters=0;
 return {pages,get remainingItems(){return maxItems-totalItems;},async add(page,text){
  totalItems+=text.items.length;
  if(totalItems>maxItems)throw new OutputIntegrityError('text-limit');
  const items=[];
  for(const item of text.items){
   if(typeof item.str!=='string')continue;
   totalCharacters+=item.str.length;
   if(totalCharacters>maxCharacters)throw new OutputIntegrityError('text-character-limit');
   items.push({str:item.str,transform:item.transform,width:item.width,
    height:item.height,dir:item.dir,hasEOL:item.hasEOL});
  }
  const encoded=new TextEncoder().encode(JSON.stringify({view:page.view,rotation:page.rotate,items}));
  if(encoded.length>16*1024*1024)throw new OutputIntegrityError('text-profile-limit');
  pages.push(await digestPDFBytes(encoded));
 }};
}
