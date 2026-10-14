// Share only opaque font-program bytes. Font dictionaries, descriptors, glyph
// mappings, widths, encodings and ToUnicode streams retain their own identities.
const keys=new Set(['/Length','/Length1','/Length2','/Length3','/Filter','/Subtype']);
export function collectFontPrograms(doc,PDF){
 const N=PDF.PDFName.of,programs=new Set();
 for(const [,dict]of doc.context.enumerateIndirectObjects()){
  if(!(dict instanceof PDF.PDFDict)||String(dict.get(N('Type')))!=='/FontDescriptor')continue;
  for(const key of ['FontFile','FontFile2','FontFile3']){
   const stream=doc.context.lookup(dict.get(N(key)));
   if(!(stream instanceof PDF.PDFRawStream))continue;
   if(!stream.dict.keys().every(k=>{
    if(!keys.has(String(k)))return false;
    const value=stream.dict.get(k);
    return value instanceof PDF.PDFNumber||value instanceof PDF.PDFName||
      (String(k)==='/Filter'&&value instanceof PDF.PDFArray&&value.asArray().every(v=>v instanceof PDF.PDFName));
   }))continue;
   programs.add(stream);
  }
 }
 return programs;
}
export function reachableObjects(doc,PDF){
 const seen=new Set();
 function visit(value){
  if(value instanceof PDF.PDFRef)value=doc.context.lookup(value);
  if(!value||seen.has(value))return;seen.add(value);
  if(value instanceof PDF.PDFRawStream)visit(value.dict);
  else if(value instanceof PDF.PDFDict)for(const [,child]of value.entries())visit(child);
  else if(value instanceof PDF.PDFArray)for(const child of value.asArray())visit(child);
 }
 visit(doc.context.trailerInfo.Root);visit(doc.context.trailerInfo.Info);return seen;
}
