import '../../assets/vendor/pdf-lib.js';
import {inspectSecurity,assertResourceAdmission,assertExpandedStreamBudget} from './engine.js';
import {MAX_PDF_FILE_BYTES,MAX_PDF_PAGES} from './limits.js';
self.onmessage=async({data})=>{
  try {
    if(!(data.bytes instanceof Uint8Array)||data.bytes.byteLength>MAX_PDF_FILE_BYTES)
      throw Error('Organize PDF accepts individual PDFs up to 100 MB.');
    const P=self.PDFLib;
    const doc=await P.PDFDocument.load(data.bytes,{updateMetadata:false,throwOnInvalidObject:true});
    inspectSecurity(doc,P);
    assertResourceAdmission(doc,P);
    const compressed=await assertExpandedStreamBudget(doc,P);
    const pages=doc.getPages();
    if(!pages.length||pages.length>MAX_PDF_PAGES)throw Error('Organize PDF supports 1–2,000 pages.');
    const sizes=pages.map(p=>[p.getWidth(),p.getHeight()]);
    if(sizes.some(s=>s.some(x=>!Number.isFinite(x)||x<=0)))throw Error('Invalid page dimensions.');
    self.postMessage({pages:pages.length,sizes,warnings:[...['AcroForm','Outlines','StructTreeRoot','PageLabels','Names','Metadata'].filter(k=>doc.catalog.has(P.PDFName.of(k))),...(compressed.recoveredStreams?['recoverable incomplete Flate checksum (verify downloaded pages)']:[])]});
  }catch(e){self.postMessage({error:e?.message||'Cannot safely read this PDF.'});}
};
