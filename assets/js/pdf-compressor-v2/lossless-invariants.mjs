// Canonical Task 4: complete reachable object graph and decoded-stream identity.
// Conservative verifier only. It does not transform PDFs or approve an engine.
// Unlike presence-only profiles, form values, outline destinations, annotation
// dictionaries, attachments, tags, fonts and stream content participate in hashes.
import {scalarBudget} from './scalar-budget.mjs';
import {isPlainOpaqueImage} from './lossless-image-dedup.mjs';
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
export class LosslessInvariantError extends Error {
  constructor(code){super(code);this.name='LosslessInvariantError';this.code=code;}
}
async function boundedInflate(bytes,maxBytes){
  // Feed resident bytes directly: Blob streams add asynchronous IO scheduling
  // for every small PDF stream (thousands in some digital documents). Drain
  // concurrently with writing so backpressure cannot deadlock large streams.
  const stream=new DecompressionStream('deflate');
  const reader=stream.readable.getReader(),writer=stream.writable.getWriter();
  const written=(async()=>{try{await writer.write(bytes);await writer.close();}
    catch(error){return error;}})();
  const chunks=[];let length=0;
  try{
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      length+=value.length;
      if(length>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');
      chunks.push(value);
    }
    const error=await written;if(error)throw error;
  }finally{
    await reader.cancel().catch(()=>{});
    await writer.abort().catch(()=>{});await written;
    reader.releaseLock();writer.releaseLock();
  }
  const output=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  return output;
}
function decodeAscii(bytes,filter,maxBytes){
  const text=new TextDecoder('ascii').decode(bytes).replace(/\s/g,'');
  if(filter==='/ASCIIHexDecode'){
    let encoded=text.endsWith('>')?text.slice(0,-1):text;
    if(!/^[0-9a-f]*$/i.test(encoded))throw new LosslessInvariantError('invalid-ascii-hex');
    if(encoded.length%2)encoded+='0';
    if(encoded.length/2>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');
    const output=new Uint8Array(encoded.length/2);
    const nibble=code=>code<=57?code-48:code<=70?code-55:code-87;
    for(let i=0;i<output.length;i++)output[i]=nibble(encoded.charCodeAt(i*2))*16+nibble(encoded.charCodeAt(i*2+1));
    return output;
  }
  let encoded=text.startsWith('<~')?text.slice(2):text;
  if(!encoded.endsWith('~>'))throw new LosslessInvariantError('invalid-ascii85');
  encoded=encoded.slice(0,-2);
  const output=new Uint8Array(Math.min(maxBytes+1,encoded.length*4));let used=0,group=[];
  const emit=(count)=>{
    let number=0;for(const digit of group)number=number*85+digit;
    if(number>0xffffffff)throw new LosslessInvariantError('invalid-ascii85');
    if(used+count>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');
    for(let n=0;n<count;n++)output[used++]=(number>>>((3-n)*8))&255;
    group=[];
  };
  for(const char of encoded){
    if(char==='z'){
      if(group.length)throw new LosslessInvariantError('invalid-ascii85');
      group=[0,0,0,0,0];emit(4);continue;
    }
    const digit=char.charCodeAt(0)-33;
    if(digit<0||digit>84)throw new LosslessInvariantError('invalid-ascii85');
    group.push(digit);if(group.length===5)emit(4);
  }
  if(group.length===1)throw new LosslessInvariantError('invalid-ascii85');
  if(group.length){const count=group.length-1;while(group.length<5)group.push(84);emit(count);}
  return output.slice(0,used);
}
export {boundedInflate as inflateStreamBounded,decodeAscii as decodeAsciiStreamBounded};
export async function losslessFingerprint(bytes,{PDF,maxStreamBytes=32000000,
  maxTotalDecodedBytes=128000000,maxEntries=250000,maxDepth=100,onSnapshot}={}){
  if(!(bytes instanceof Uint8Array)||!PDF?.PDFDocument)
    throw new LosslessInvariantError('invalid-invariant-input');
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  const {context}=doc,N=PDF.PDFName.of,seen=new Map(),reachableRefs=new Set(),imageCache=new Map();
  let entries=0,totalDecoded=0;
  const checkScalar=scalarBudget(PDF,code=>{throw new LosslessInvariantError(code);});
  async function canonical(value,depth=0){
    if(++entries>maxEntries||depth>maxDepth)throw new LosslessInvariantError('invariant-structure-limit');
    if(value instanceof PDF.PDFRef){
      reachableRefs.add(String(value));
      value=context.lookup(value);
      if(!value)throw new LosslessInvariantError('invariant-broken-reference');
    }
    checkScalar(value);
    if(value instanceof PDF.PDFInvalidObject)throw new LosslessInvariantError('invariant-invalid-object');
    if(value instanceof PDF.PDFString||value instanceof PDF.PDFHexString)
      return ['string',hex(value.asBytes())];
    if(value instanceof PDF.PDFNumber)return ['number',value.asNumber()];
    if(value instanceof PDF.PDFName)return ['name',value.decodeText()];
    if(value instanceof PDF.PDFRawStream||value instanceof PDF.PDFDict||value instanceof PDF.PDFArray){
      const plainImage=isPlainOpaqueImage(value,PDF);
      if(plainImage&&imageCache.has(value))return imageCache.get(value);
      if(seen.has(value))return ['ref',seen.get(value)];
      const id=plainImage?null:seen.size;if(!plainImage)seen.set(value,id);
      if(value instanceof PDF.PDFArray){
        const items=[];for(let i=0;i<value.size();i++)items.push(await canonical(value.get(i),depth+1));
        return ['array',id,items];
      }
      if(value instanceof PDF.PDFRawStream){
        const dict=value.dict,filter=context.lookup(dict.get(N('Filter')));
        const filters=filter instanceof PDF.PDFArray?
          Array.from({length:filter.size()},(_,i)=>String(context.lookup(filter.get(i)))):
          filter?[String(filter)]:[];
        // Decode supported general-purpose filters: predictor parameters remain
        // part of the dictionary and cannot silently change.
        // Other filters are retained as encoded-byte invariants. This avoids
        // pretending that an unsupported decoder proves pixel equivalence.
        let data=value.contents,consumed=0;
        for(const filter of filters){
          if(!['/FlateDecode','/ASCII85Decode','/ASCIIHexDecode'].includes(filter))break;
          data=filter==='/FlateDecode'?await boundedInflate(data,maxStreamBytes):decodeAscii(data,filter,maxStreamBytes);
          consumed++;
        }
        const remaining=filters.slice(consumed),decoded=remaining.length===0;
        totalDecoded+=data.length;
        if(data.length>maxStreamBytes||totalDecoded>maxTotalDecodedBytes)
          throw new LosslessInvariantError('invariant-byte-budget');
        for(const key of dict.keys())checkScalar(key);
        const keys=dict.keys().filter(k=>!['/Length','/Filter'].includes(String(k)))
          .sort((a,b)=>String(a).localeCompare(String(b),'en'));
        const fields=[];for(const key of keys)fields.push([String(key),await canonical(dict.get(key),depth+1)]);
        if(remaining.length)fields.push(['/Filter',['filters',...remaining]]);
        const snapshot=['stream',id,decoded?'decoded':'encoded',fields,await hash(data)];
        if(plainImage)imageCache.set(value,snapshot);
        return snapshot;
      }
      const fields=[];for(const key of value.keys())checkScalar(key);
      for(const key of value.keys().sort((a,b)=>String(a).localeCompare(String(b),'en')))
        fields.push([String(key),await canonical(value.get(key),depth+1)]);
      return ['dict',id,fields];
    }
    return ['scalar',String(value)];
  }
  const catalog=await canonical(context.trailerInfo.Root);
  const info=context.trailerInfo.Info?await canonical(context.trailerInfo.Info):null;
  const initiallyReachable=new Set(reachableRefs),orphans=[];
  for(const [ref,object] of context.enumerateIndirectObjects()){
    if(initiallyReachable.has(String(ref)))continue;
    // Superseded xref/object-stream containers are structural overhead. Other
    // detached objects might contain private attachments/history: do not allow
    // a rewriting engine to silently drop them under a content-preserving claim.
    const dict=object instanceof PDF.PDFRawStream?object.dict:object;
    const type=dict instanceof PDF.PDFDict?String(dict.get(N('Type'))):'';
    if(!['/ObjStm','/XRef'].includes(type)){
      // Normalize each orphan graph independently of original object numbers.
      // Sorting these snapshots preserves even detached material/history.
      seen.clear();imageCache.clear();
      orphans.push(JSON.stringify(await canonical(ref)));
    }
  }
  // File IDs, xref location and object-stream packing are structural overhead;
  // they are excluded. Catalog, Info and all their reachable resources remain.
  const snapshot={catalog,info,orphans:orphans.sort()};
  // Explicit local QA hook only; no logging/network behavior in this verifier.
  if(typeof onSnapshot==='function')onSnapshot(snapshot);
  return hash(new TextEncoder().encode(JSON.stringify(snapshot)));
}
