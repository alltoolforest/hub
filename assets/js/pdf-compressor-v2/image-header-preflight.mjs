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
  // Preserve common publishing/photography JPEG metadata exactly as-is.
  // We can validate image framing and dictionary dimensions without assuming
  // EXIF orientation/Photoshop resource blocks survive RGB re-encoding.
  // createPDFJpegDecoder already refuses transformation when either marker
  // is present (unsupportedMetadata): this broadens INPUT compatibility only.
  const compatibleLegacyMetadata=m=>{
    if(m.marker===225) // APP1: standard EXIF signature, not arbitrary payload
      return m.bytes.length>=10&&[69,120,105,102,0,0].every((n,i)=>m.bytes[i+4]===n);
    if(m.marker===237) // APP13: Photoshop 3.0 or legacy 8BIM header
      return m.bytes.length>=8&&(
        [56,66,73,77].every((n,i)=>m.bytes[i+4]===n)||
        (m.bytes.length>=18&&[80,104,111,116,111,115,104,111,112,32,51,46,48,0]
          .every((n,i)=>m.bytes[i+4]===n)));
    return false;
  };
  const space=String(context.lookup(stream.dict.get(PDF.PDFName.of('ColorSpace'))));
  const preserveLegacy=(frame.components===1&&space==='/DeviceGray'||
    frame.components===3&&space==='/DeviceRGB')&&
    frame.metadata.some(m=>compatibleLegacyMetadata(m))&&
    frame.metadata.every(m=>[224,226,254].includes(m.marker)||compatibleLegacyMetadata(m));
  // An APP marker can carry ordinary camera/editor metadata that the
  // compressor has no reason to interpret. Accept *well-framed* APP3–APP12
  // and APP15 only for opaque preservation, never for JPEG re-encoding.
  // The verified decoder sees unsupportedMetadata=true and returns 'preserve';
  // qpdf's lossless stage and the final PDF graph/encoded-stream SHA-256 gates
  // still require the exact original image bytes. Do not admit malformed
  // frame/segment lengths, post-scan metadata, unsupported color spaces,
  // unrecognized APP1/APP13 layouts or an invalid Adobe APP14 transform.
  const directColorSpace=(frame.components===1&&space==='/DeviceGray'||
    frame.components===3&&space==='/DeviceRGB'||
    frame.components===4&&space==='/DeviceCMYK'&&adobeCmyk);
  const spoofedAdobe=m=>m.bytes.length>=9&&
    [65,100,111,98,101].every((v,i)=>m.bytes[4+i]===v);
  const opaqueApp=m=>directColorSpace&&
    ((m.marker>=227&&m.marker<=236)||m.marker===239)&&
    m.bytes.length>=4&&!spoofedAdobe(m);
  const xmpSignature=new Uint8Array([...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/'),0]);
  const validXmp=m=>m.marker===225&&m.bytes.length>=4+xmpSignature.length&&
    xmpSignature.every((v,i)=>m.bytes[i+4]===v);
  const allowedMetadata=frame.metadata.every(m=>[224,226,254].includes(m.marker)||
    (preserveLegacy&&compatibleLegacyMetadata(m))||
    (m.marker===238&&(validAdobe||preservedLegacyCmyk))||
    (preservedLegacyCmyk&&compatibleLegacyMetadata(m))||
    (directColorSpace&&validXmp(m))||opaqueApp(m));
  if(frame.unsupported||frame.precision!==8||![1,3,4].includes(frame.components)||
    frame.width<1||frame.height<1||frame.metadataAfterScan||!allowedMetadata)
    throw Error('unsupported-jpeg-frame');
  return frame;
}
