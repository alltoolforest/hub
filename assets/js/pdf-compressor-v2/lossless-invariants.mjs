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
const bytesEqual=(a,b)=>{
  if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
};
function adler32(bytes){
  // RFC 1950 Adler-32, chunked to keep the sums in safe integer range.
  let a=1,b=0;
  for(let offset=0;offset<bytes.length;offset+=5552){
    const end=Math.min(bytes.length,offset+5552);
    for(let i=offset;i<end;i++){a+=bytes[i];b+=a;}
    a%=65521;b%=65521;
  }
  return ((b<<16)|a)>>>0;
}
function hasPlainZlibHeader(bytes){
  if(bytes.length<3)return false;
  const cmf=bytes[0],flg=bytes[1];
  // CM=8 (DEFLATE), CINFO<=7, FCHECK valid, no preset dictionary.
  return (cmf&15)===8&&(cmf>>>4)<=7&&(((cmf<<8)|flg)%31)===0&&(flg&32)===0;
}
const LENGTH_BASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_EXTRA=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DISTANCE_BASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DISTANCE_EXTRA=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
function reverseDeflateBits(value,count){let result=0;for(let i=0;i<count;i++){result=(result<<1)|(value&1);value>>>=1;}return result;}
function buildDeflateTree(lengths){
  let max=0;for(const length of lengths)if(length>max)max=length;
  if(max===0)throw new LosslessInvariantError('invalid-deflate-tree');
  const count=Array(max+1).fill(0);for(const length of lengths)if(length)count[length]++;
  let left=1;for(let bits=1;bits<=max;bits++){left=(left<<1)-count[bits];if(left<0)throw new LosslessInvariantError('invalid-deflate-tree');}
  const next=Array(max+1).fill(0);let code=0;
  for(let bits=1;bits<=max;bits++){code=(code+(count[bits-1]??0))<<1;next[bits]=code;}
  const map=new Map();
  lengths.forEach((length,symbol)=>{if(length)map.set(length+':'+reverseDeflateBits(next[length]++,length),symbol);});
  return {map,max};
}
const FIXED_LITERAL_TREE=buildDeflateTree(Array.from({length:288},(_,i)=>i<=143?8:i<=255?9:i<=279?7:8));
const FIXED_DISTANCE_TREE=buildDeflateTree(Array(32).fill(5));
function validateExactRawDeflate(bytes,maxBytes){
  let bit=0,outputLength=0,final=0;
  const need=count=>{if(bit+count>bytes.length*8)throw new LosslessInvariantError('truncated-deflate-payload');};
  const readBits=count=>{need(count);let value=0;for(let i=0;i<count;i++){value|=((bytes[bit>>3]>>(bit&7))&1)<<i;bit++;}return value;};
  const readSymbol=tree=>{let code=0;for(let length=1;length<=tree.max;length++){code|=readBits(1)<<(length-1);const symbol=tree.map.get(length+':'+code);if(symbol!==undefined)return symbol;}throw new LosslessInvariantError('invalid-deflate-code');};
  while(!final){
    final=readBits(1);const type=readBits(2);
    if(type===0){
      bit=(bit+7)&~7;need(32);const offset=bit>>3;
      const length=bytes[offset]|bytes[offset+1]<<8,complement=bytes[offset+2]|bytes[offset+3]<<8;bit+=32;
      if(((length^0xffff)&0xffff)!==complement)throw new LosslessInvariantError('invalid-deflate-stored-length');
      need(length*8);bit+=length*8;outputLength+=length;
      if(outputLength>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');
      continue;
    }
    if(type===3)throw new LosslessInvariantError('invalid-deflate-block-type');
    let literalTree,distanceTree;
    if(type===1){literalTree=FIXED_LITERAL_TREE;distanceTree=FIXED_DISTANCE_TREE;}
    else{
      const literalCount=readBits(5)+257,distanceCount=readBits(5)+1,codeLengthCount=readBits(4)+4;
      if(literalCount>286||distanceCount>32)throw new LosslessInvariantError('invalid-deflate-dynamic-count');
      const order=[16,17,18,0,8,7,9,6,11,4,12,3,13,2,14,1,15],codeLengths=Array(19).fill(0);
      order.splice(8,0,10,5);
      for(let i=0;i<codeLengthCount;i++)codeLengths[order[i]]=readBits(3);
      const codeLengthTree=buildDeflateTree(codeLengths),lengths=[];
      while(lengths.length<literalCount+distanceCount){
        const symbol=readSymbol(codeLengthTree);
        if(symbol<=15)lengths.push(symbol);
        else if(symbol===16){
          if(!lengths.length)throw new LosslessInvariantError('invalid-deflate-repeat');
          const repeat=readBits(2)+3,previous=lengths[lengths.length-1];for(let i=0;i<repeat;i++)lengths.push(previous);
        }else if(symbol===17){const repeat=readBits(3)+3;for(let i=0;i<repeat;i++)lengths.push(0);}
        else if(symbol===18){const repeat=readBits(7)+11;for(let i=0;i<repeat;i++)lengths.push(0);}
        if(lengths.length>literalCount+distanceCount)throw new LosslessInvariantError('invalid-deflate-repeat');
      }
      if(!lengths[256])throw new LosslessInvariantError('invalid-deflate-missing-eob');
      literalTree=buildDeflateTree(lengths.slice(0,literalCount));
      const distanceLengths=lengths.slice(literalCount);
      if(distanceLengths.every(length=>length===0))distanceTree=null;
      else distanceTree=buildDeflateTree(distanceLengths);
    }
    for(;;){
      const symbol=readSymbol(literalTree);
      if(symbol<256){outputLength++;if(outputLength>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');continue;}
      if(symbol===256)break;
      if(symbol<257||symbol>285||!distanceTree)throw new LosslessInvariantError('invalid-deflate-length-symbol');
      const index=symbol-257,length=LENGTH_BASE[index]+readBits(LENGTH_EXTRA[index]);
      const distanceSymbol=readSymbol(distanceTree);
      if(distanceSymbol>29)throw new LosslessInvariantError('invalid-deflate-distance-symbol');
      const distance=DISTANCE_BASE[distanceSymbol]+readBits(DISTANCE_EXTRA[distanceSymbol]);
      if(distance>outputLength)throw new LosslessInvariantError('invalid-deflate-distance');
      outputLength+=length;if(outputLength>maxBytes)throw new LosslessInvariantError('decoded-stream-limit');
    }
  }
  const used=Math.ceil(bit/8);
  if(used!==bytes.length)throw new LosslessInvariantError('trailing-deflate-data');
  const remainder=bit&7;
  if(remainder&&bytes[bytes.length-1]&((0xff<<remainder)&0xff))throw new LosslessInvariantError('nonzero-deflate-padding');
  return outputLength;
}
async function boundedInflateMissingTrailer(bytes,maxBytes){
  if(!hasPlainZlibHeader(bytes)||typeof DecompressionStream!=='function')
    throw new LosslessInvariantError('invalid-zlib-recovery-input');
  const rawPayload=bytes.subarray(2);
  // Chromium's raw inflater tolerates bytes after BFINAL, so validate the
  // DEFLATE grammar ourselves before decoding. This is what distinguishes a
  // wholly missing trailer from partial Adler bytes or arbitrary trailing data.
  const expectedLength=validateExactRawDeflate(rawPayload,maxBytes);
  let raw;
  try{raw=await boundedInflateStrict(rawPayload,maxBytes,'deflate-raw');}
  catch(error){
    if(error?.code==='decoded-stream-limit')throw error;
    throw new LosslessInvariantError('invalid-zlib-recovery-input');
  }
  if(raw.length!==expectedLength)throw new LosslessInvariantError('zlib-recovery-length-mismatch');
  const sum=adler32(raw),repaired=new Uint8Array(bytes.length+4);
  repaired.set(bytes,0);
  repaired[bytes.length]=(sum>>>24)&255;
  repaired[bytes.length+1]=(sum>>>16)&255;
  repaired[bytes.length+2]=(sum>>>8)&255;
  repaired[bytes.length+3]=sum&255;
  // Prove that the exact raw payload becomes a checksum-valid zlib stream.
  // This accepts only a wholly absent Adler trailer; partial trailers, trailing
  // junk and damaged raw DEFLATE remain rejected by the raw/strict decoders.
  const strict=await boundedInflateStrict(repaired,maxBytes,'deflate');
  if(!bytesEqual(raw,strict))throw new LosslessInvariantError('zlib-recovery-mismatch');
  return strict;
}
// Some PDF producers include PDF whitespace immediately after an otherwise
// complete Flate/zlib stream. Browser DecompressionStream rejects that padding
// even though tolerant PDF readers accept the decoded content. A smaller class
// of legacy generators omit the four-byte Adler-32 trailer entirely while
// still writing a complete raw DEFLATE payload. Recover only that exact case:
// raw DEFLATE must close cleanly, stay within budget, and a reconstructed
// checksum must then pass the strict zlib decoder. Never recover checksum
// mismatches, partial trailers, trailing arbitrary bytes or truncated DEFLATE.
async function boundedInflate(bytes,maxBytes){
  try{return await boundedInflateStrict(bytes,maxBytes);}
  catch(error){
    const message=String(error);
    if(error?.name==='TypeError'||/(?:Compressed input was truncated|unexpected end|incomplete compressed)/i.test(message)){
      try{return await boundedInflateMissingTrailer(bytes,maxBytes);}
      catch(recoveryError){
        if(recoveryError?.code==='decoded-stream-limit')throw recoveryError;
        // A TypeError may also represent strict trailing-junk rejection.
        // If missing-trailer recovery does not prove the stream, continue to
        // the pre-existing whitespace-tail verifier instead of weakening it.
      }
    }
    if(!/(?:Junk found after end of compressed data|Trailing junk found after the end of the compressed stream)/i.test(message))throw error;
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
        // Large plain scan images are validated incrementally and compared by
        // exact encoded identity rather than materializing their decoded pixels.
        // Use a threshold below the per-stream ceiling so a many-page scan with
        // individually moderate images cannot exhaust the aggregate invariant
        // byte budget. This is stricter, not looser: equivalent recompression of
        // these large streams is rejected unless the exact encoded bytes remain.
        const streamImageThreshold=Math.min(maxStreamBytes,16000000);
        const streamedImage=plainResource&&String(dict.get(N('Subtype')))==='/Image'&&
          filters.length===1&&filters[0]==='/FlateDecode'&&
          Number.isSafeInteger(width*height*channels)&&width>0&&height>0&&
          width*channels<=maxStreamBytes&&width*height*channels>streamImageThreshold;
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
