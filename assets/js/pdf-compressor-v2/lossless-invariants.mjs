// Canonical Task 4: complete reachable object graph and decoded-stream identity.
// Conservative verifier only. It does not transform PDFs or approve an engine.
// Unlike presence-only profiles, form values, outline destinations, annotation
// dictionaries, attachments, tags, fonts and stream content participate in hashes.
import {collectFontPrograms} from './font-program-policy.mjs';
import {scalarBudget} from './scalar-budget.mjs';
import {isPlainOpaqueImage} from './lossless-image-dedup.mjs';
import {streamFlateImage} from './streaming-flate-image.mjs';
import {decodeASCIIStreamBounded} from './bounded-legacy-filters.mjs';
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
const hash=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
export class LosslessInvariantError extends Error {
  constructor(code){super(code);this.name='LosslessInvariantError';this.code=code;}
}
async function boundedInflateStrict(bytes,maxBytes,format='deflate'){
  // Feed resident bytes directly: Blob streams add asynchronous IO scheduling
  // for every small PDF stream (thousands in some digital documents). Drain
  // concurrently with writing so backpressure cannot deadlock large streams.
  const stream=new DecompressionStream(format);
  const reader=stream.readable.getReader(),writer=stream.writable.getWriter();
  const written=(async()=>{try{
    for(let offset=0;offset<bytes.length;offset+=65536)
      await writer.write(bytes.subarray(offset,offset+65536));
    await writer.close();}
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
// Narrow compatibility for PDFs that contain a COMPLETE RFC1951 DEFLATE block
// with a valid RFC1950 zlib header but NO trailing Adler-32 checksum.
// This is NOT a permissive inflate: the raw DEFLATE decoder must reach EOF,
// the checksum is recomputed from bounded decoded bytes, and the rebuilt zlib
// stream must pass the original checksum-enforcing browser decoder.
// Never modify original PDF/stream bytes. Other corruption still fails closed.
function hasValidZlibHeader(bytes){
 if(bytes.length<6)return false;
 const cmf=bytes[0],flg=bytes[1];
 return (cmf&15)===8&&(cmf>>4)<=7&&((cmf<<8)|flg)%31===0&&
   (flg&32)===0; // preset dictionary is not supported
}
function adler32(bytes){
 let a=1,b=0;
 for(let i=0;i<bytes.length;i+=5552){
   const end=Math.min(bytes.length,i+5552);
   for(let j=i;j<end;j++){a+=bytes[j];b+=a;}
   a%=65521;b%=65521;
 }
 return ((b<<16)|a)>>>0;
}
async function recoverChecksumlessZlib(bytes,maxBytes){
 if(!hasValidZlibHeader(bytes))throw Error('invalid-zlib-header');
 // Unsupported browsers fail closed here rather than fall back to an
 // unchecked decoder. Completed raw DEFLATE EOF is enforced by the platform.
 let decoded=await boundedInflateStrict(bytes.subarray(2),maxBytes,'deflate-raw');
 const expectedSize=decoded.length,adler=adler32(decoded);
 decoded=null;
 const verifiedBytes=new Uint8Array(bytes.length+4);
 verifiedBytes.set(bytes);
 verifiedBytes[bytes.length]=(adler>>>24)&255;
 verifiedBytes[bytes.length+1]=(adler>>>16)&255;
 verifiedBytes[bytes.length+2]=(adler>>>8)&255;
 verifiedBytes[bytes.length+3]=adler&255;
 const checked=await boundedInflateStrict(verifiedBytes,maxBytes);
 if(checked.length!==expectedSize||adler32(checked)!==adler)
   throw Error('inconsistent-deflate-recovery');
 return checked;
}
// Some PDF producers include PDF whitespace immediately after an otherwise
// complete Flate/zlib stream. Browser DecompressionStream rejects that padding
// even though tolerant PDF readers accept the decoded content. Retry only a
// verified, bounded whitespace tail after the native decoder reports junk.
// The retried decode must still validate the zlib checksum and output budget.
// Never trim arbitrary data, preemptively truncate a valid stream, or suppress
// a decompression/memory error.
async function boundedInflate(bytes,maxBytes){
  try{return await boundedInflateStrict(bytes,maxBytes);}
  catch(error){
    // Different engines report invalid/missing zlib trailers using unrelated
    // TypeError strings; never trust error wording to authorize recovery.
    // Authorization comes ONLY from the fully terminating raw DEFLATE decoder
    // plus the rebuilt, checksum-verified strict native decoder.
    const trailingJunk=/(?:Junk found after end of compressed data|Trailing junk found after the end of the compressed stream)/i.test(String(error));
    if(!trailingJunk){
      if(error?.code==='decoded-stream-limit')throw error;
      try{return await recoverChecksumlessZlib(bytes,maxBytes);}
      catch(recoveryError){
        if(recoveryError?.code==='decoded-stream-limit')throw recoveryError;
        throw error;
      }
    }
    // The zlib Adler checksum itself can end in PDF whitespace bytes.
    // Test one byte at a time and accept only a checksum-valid complete
    // stream; stripping all whitespace at once can truncate valid data.
    for(let trim=1;trim<=16&&trim<bytes.length;trim++){
      if(![0,9,10,12,13,32].includes(bytes[bytes.length-trim]))break;
      try{return await boundedInflateStrict(bytes.subarray(0,bytes.length-trim),maxBytes);}
      catch(retryError){
        if(retryError?.code==='decoded-stream-limit')throw retryError;
      }
    }
    throw error;
  }
}
export {boundedInflate as inflateStreamBounded,decodeASCIIStreamBounded as decodeAsciiStreamBounded};
export async function losslessFingerprint(bytes,{PDF,maxStreamBytes=32000000,
  maxTotalDecodedBytes=128000000,maxEntries=250000,maxDepth=100,onSnapshot}={}){
  if(!(bytes instanceof Uint8Array)||!PDF?.PDFDocument)
    throw new LosslessInvariantError('invalid-invariant-input');
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  const {context}=doc,N=PDF.PDFName.of,seen=new Map(),reachableRefs=new Set(),resourceCache=new Map();
  const fontPrograms=collectFontPrograms(doc,PDF),streamCache=new WeakMap(),encodedCache=new Map();
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
      const plainResource=isPlainOpaqueImage(value,PDF)||fontPrograms.has(value);
      if(plainResource&&resourceCache.has(value))return resourceCache.get(value);
      if(seen.has(value))return ['ref',seen.get(value)];
      const id=plainResource?null:seen.size;if(!plainResource)seen.set(value,id);
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
        const width=context.lookup(dict.get(N('Width')))?.asNumber?.();
        const height=context.lookup(dict.get(N('Height')))?.asNumber?.();
        const channels=String(dict.get(N('ColorSpace')))==='/DeviceGray'?1:3;
        const streamedImage=plainResource&&String(dict.get(N('Subtype')))==='/Image'&&
          filters.length===1&&filters[0]==='/FlateDecode'&&
          Number.isSafeInteger(width*height*channels)&&width>0&&height>0&&
          width*channels<=maxStreamBytes&&
          context.lookup(dict.get(N('BitsPerComponent')))?.asNumber?.()===8&&
          !dict.has(N('DecodeParms'))&&!dict.has(N('DP'))&&
          width*height*channels>Math.min(maxStreamBytes,8000000,
            Math.floor(maxTotalDecodedBytes/4));
        let cached=streamCache.get(value);
        if(!cached){
          // Repeated programs share decoding work, never dictionary identity.
          // Bind the exact encoded bytes AND the ordered decoder chain.
          const encodedDigest=await hash(value.contents);
          const cacheKey=JSON.stringify(filters)+'|'+encodedDigest;
          cached=encodedCache.get(cacheKey);
          if(!cached&&streamedImage){
            // Large unchanged image streams are validated incrementally and
            // compared by exact encoded identity, never fully inflated in RAM.
            await streamFlateImage(value.contents,{width,height,channels,maxRowBytes:maxStreamBytes});
            cached={remaining:filters,length:value.contents.length,digest:encodedDigest,streamedImage:true};
            encodedCache.set(cacheKey,cached);
          }
          if(!cached){
            let data=value.contents,consumed=0;
            for(const filter of filters){
              if(!['/FlateDecode','/ASCII85Decode','/ASCIIHexDecode'].includes(filter))break;
              data=filter==='/FlateDecode'?await boundedInflate(data,maxStreamBytes):decodeASCIIStreamBounded(data,filter,maxStreamBytes);
              consumed++;
            }
            const remaining=filters.slice(consumed);
            cached={remaining,length:data.length,digest:consumed?await hash(data):encodedDigest};
            encodedCache.set(cacheKey,cached);
          }
          streamCache.set(value,cached);
        }
        const {remaining,length,digest}=cached,decoded=remaining.length===0;
        if(!cached.streamedImage){
          totalDecoded+=length;
          if(length>maxStreamBytes||totalDecoded>maxTotalDecodedBytes)
            throw new LosslessInvariantError('invariant-byte-budget');
        }
        for(const key of dict.keys())checkScalar(key);
        const keys=dict.keys().filter(k=>!['/Length','/Filter'].includes(String(k)))
          .sort((a,b)=>String(a).localeCompare(String(b),'en'));
        const fields=[];for(const key of keys)fields.push([String(key),await canonical(dict.get(key),depth+1)]);
        if(remaining.length)fields.push(['/Filter',['filters',...remaining]]);
        const snapshot=['stream',id,decoded?'decoded':'encoded',fields,digest];
        if(plainResource)resourceCache.set(value,snapshot);
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
      seen.clear();resourceCache.clear();
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
