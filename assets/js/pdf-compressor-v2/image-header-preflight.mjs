// Bound direct and generally wrapped JPEG headers before independent decoding.
import {inspectJpegHeader} from './jpeg-source-decoder.mjs';
import {inflateStreamBounded,decodeAsciiStreamBounded} from './lossless-invariants.mjs';
const aliases={'/DCT':'/DCTDecode','/Fl':'/FlateDecode','/A85':'/ASCII85Decode','/AHx':'/ASCIIHexDecode'};
export async function inspectEncodedJpeg(stream,{PDF,context,maxBytes}={}){
  const filter=context.lookup(stream.dict.get(PDF.PDFName.of('Filter')));
  const values=filter instanceof PDF.PDFArray?filter.asArray().map(value=>context.lookup(value)):[filter];
  const filters=values.map(value=>aliases[String(value)]??String(value));
  if(!filters.includes('/DCTDecode'))return null;
  if(filters.at(-1)!=='/DCTDecode'||filters.filter(value=>value==='/DCTDecode').length!==1)
    throw Error('unverifiable-jpeg-filter-chain');
  let bytes=stream.contents;
  if(bytes.length>maxBytes)throw Error('jpeg-stream-budget');
  for(const name of filters.slice(0,-1)){
    if(name==='/FlateDecode')bytes=await inflateStreamBounded(bytes,maxBytes);
    else if(['/ASCIIHexDecode','/ASCII85Decode'].includes(name))bytes=decodeAsciiStreamBounded(bytes,name,maxBytes);
    else throw Error('unverifiable-jpeg-filter-chain');
  }
  const frame=inspectJpegHeader(bytes);
  if(frame.unsupported||frame.precision!==8||![1,3,4].includes(frame.components))throw Error('unsupported-jpeg-frame');
  return frame;
}
