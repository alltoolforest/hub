// Worker-operation-local reuse: the page inspector already extracts exact text.
// Bind that result to immutable byte content, never a filename or array identity.
import {createIndependentInputReader} from './independent-input-reader.mjs';
import {createIndependentTextReader,createTextFingerprintCollector} from './independent-text-reader.mjs';
import {digestPDFBytes} from './output-integrity.mjs';
export function createIndependentReaders(pdfjs){
 const textReports=new Map(),fallback=createIndependentTextReader(pdfjs);
 return {
  async readPages(bytes,options={}){
   const collector=createTextFingerprintCollector();
   const reader=createIndependentInputReader(pdfjs,{onPageText:collector.add,getMaxTextItems:()=>collector.remainingItems});
   const report=await reader(bytes,options);
   const digest=await digestPDFBytes(bytes);
   options.signal?.throwIfAborted();
   if(textReports.size>=4)textReports.delete(textReports.keys().next().value);
   textReports.set(digest,collector.pages.slice());return report;
  },
  async readText(bytes,options={}){
   options.signal?.throwIfAborted();
   const standard=Object.keys(options).every(key=>key==='signal');
   if(standard){
    const pages=textReports.get(await digestPDFBytes(bytes));
    options.signal?.throwIfAborted();
    if(pages&&pages.length<=500)return pages.slice();
   }
   return fallback(bytes,options);
  }
 };
}
