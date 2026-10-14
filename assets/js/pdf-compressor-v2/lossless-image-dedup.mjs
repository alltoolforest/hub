import {collectFontPrograms,reachableObjects} from './font-program-policy.mjs';
// Exact-byte deduplication of opaque images and compatible font programs. No codec, pixel conversion or metadata
// removal. Masked, tagged/structured, profiled and custom image dictionaries are
// deliberately excluded. The final independent lossless verifier is mandatory.
const allowedKeys=new Set(['/Type','/Subtype','/Width','/Height','/ColorSpace',
  '/BitsPerComponent','/Filter','/Length']);
export function isPlainOpaqueImage(stream,PDF){
  if(!(stream instanceof PDF.PDFRawStream))return false;
  const N=PDF.PDFName.of,d=stream.dict;
  const filter=d.get(N('Filter'));
  const filters=filter instanceof PDF.PDFArray?
    Array.from({length:filter.size()},(_,i)=>String(filter.get(i))):filter?[String(filter)]:[];
  if(String(d.get(N('Subtype')))!=='/Image'||
    !['/DeviceRGB','/DeviceGray'].includes(String(d.get(N('ColorSpace'))))||
    d.get(N('BitsPerComponent'))?.asNumber?.()!==8||
    !filters.every(value=>['/FlateDecode','/DCTDecode','/ASCII85Decode','/ASCIIHexDecode'].includes(value)))return false;
  return d.keys().every(key=>allowedKeys.has(String(key))&&!(d.get(key) instanceof PDF.PDFRef));
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function deduplicateOpaqueImages(bytes,{PDF,serializeClassic=false}={}){
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  const fonts=collectFontPrograms(doc,PDF),reachable=reachableObjects(doc,PDF);
  const {context}=doc,known=new Map(),replacements=new Map();
  for(const [ref,stream] of context.enumerateIndirectObjects()){
    // Detached material/history stays intact, even when its bytes duplicate a font.
    const font=fonts.has(stream)&&reachable.has(stream);
    if(!isPlainOpaqueImage(stream,PDF)&&!font)continue;
    const fields=stream.dict.keys().filter(key=>String(key)!=='/Length')
      .sort((a,b)=>String(a).localeCompare(String(b),'en')).map(key=>[String(key),String(stream.dict.get(key))]);
    const signature=(font?'font:':'image:')+JSON.stringify(fields)+'|'+await hash(stream.contents);
    if(known.has(signature))replacements.set(String(ref),{from:ref,to:known.get(signature)});
    else known.set(signature,ref);
  }
  if(!replacements.size&&!serializeClassic)return {bytes:bytes.slice(),deduplicated:0};
  const seen=new Set();
  function rewrite(object){
    if(!object||seen.has(object))return;seen.add(object);
    if(object instanceof PDF.PDFRawStream){rewrite(object.dict);return;}
    if(object instanceof PDF.PDFDict){
      for(const [key,value] of object.entries()){
        if(value instanceof PDF.PDFRef&&replacements.has(String(value)))object.set(key,replacements.get(String(value)).to);
        else rewrite(value);
      }
    }else if(object instanceof PDF.PDFArray){
      for(let i=0;i<object.size();i++){
        const value=object.get(i);
        if(value instanceof PDF.PDFRef&&replacements.has(String(value)))object.set(i,replacements.get(String(value)).to);
        else rewrite(value);
      }
    }
  }
  for(const [,object] of context.enumerateIndirectObjects())rewrite(object);
  for(const {from} of replacements.values())context.delete(from);
  if(serializeClassic)for(const [ref,object] of context.enumerateIndirectObjects()){
    const dict=object instanceof PDF.PDFRawStream?object.dict:object;
    if(dict instanceof PDF.PDFDict&&['/ObjStm','/XRef'].includes(String(dict.get(PDF.PDFName.of('Type')))))context.delete(ref);
  }
  return {bytes:await doc.save({useObjectStreams:!serializeClassic}),deduplicated:replacements.size};
}
