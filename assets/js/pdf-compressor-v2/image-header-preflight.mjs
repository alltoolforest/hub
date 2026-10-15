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
  // A well-formed Adobe APP14 marker is normal in CMYK/YCCK PDFs produced
  // by print-layout applications. Verify exact marker bytes and colorspace,
  // without permitting arbitrary APP markers, DNL, or post-scan metadata.
  const adobe=frame.metadata.filter(m=>m.marker===238);
  const adobeMarkerValid=m=>m.bytes.length===16&&m.bytes[0]===255&&
    m.bytes[1]===238&&m.bytes[2]===0&&m.bytes[3]===14&&
    [65,100,111,98,101].every((v,i)=>m.bytes[4+i]===v)&&
    [0,2].includes(m.bytes[15]);
  const adobeCmyk=adobe.length>0&&frame.components===4&&
    String(context.lookup(stream.dict.get(PDF.PDFName.of('ColorSpace'))))==='/DeviceCMYK'&&
    adobe.every(m=>adobeMarkerValid(m)&&m.bytes[15]===adobe[0].bytes[15]);
  const validAdobe=adobeCmyk&&adobe.length===1;
  // Legacy publishing software can embed valid APP1 (EXIF) and APP13
  // (Photoshop) blocks alongside repeated compatible Adobe APP14 markers.
  // Inspect their JPEG framing but preserve these complex images unchanged:
  // verifiedAdobeCmyk / unsupportedMetadata still deny lossy transformation.
  // Malformed segment lengths, conflicting transforms, unknown APP markers,
  // or four-component frames mislabeled as RGB remain rejected.
  const preservedLegacyCmyk=adobeCmyk&&
    (adobe.length>1||frame.metadata.some(m=>[225,237].includes(m.marker)));
  const allowedMetadata=frame.metadata.every(m=>[224,226,254].includes(m.marker)||
    (m.marker===238&&(validAdobe||preservedLegacyCmyk))||
    (preservedLegacyCmyk&&[225,237].includes(m.marker)));
  if(frame.unsupported||frame.precision!==8||![1,3,4].includes(frame.components)||
    frame.metadataAfterScan||!allowedMetadata)throw Error('unsupported-jpeg-frame');
  return frame;
}
