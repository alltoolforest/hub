import '../../assets/vendor/pdf-lib.js';
import {inspectSecurity} from './engine.js';
self.onmessage=async({data})=>{
  try {
    const P=self.PDFLib;
    const doc=await P.PDFDocument.load(data.bytes,{updateMetadata:false,throwOnInvalidObject:true});
    inspectSecurity(doc,P);
    const pages=doc.getPages();
    if(!pages.length||pages.length>2000)throw Error('This candidate supports 1–2,000 pages.');
    const sizes=pages.map(p=>[p.getWidth(),p.getHeight()]);
    if(sizes.some(s=>s.some(x=>!Number.isFinite(x)||x<=0)))throw Error('Invalid page dimensions.');
    self.postMessage({pages:pages.length,sizes,warnings:['AcroForm','Outlines','StructTreeRoot','PageLabels','Names','Metadata'].filter(k=>doc.catalog.has(P.PDFName.of(k)))});
  }catch(e){self.postMessage({error:e?.message||'Cannot safely read this PDF.'});}
};
