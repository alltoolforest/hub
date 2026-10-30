// Deterministic 56-page, ~30.27 MB synthetic PDF with sizeable, ordinary
// Flate-compressed raster streams. Generated on demand; no user files stored.
// The 56 image resources are not drawn so preview performance measures the
// organizer's inspection and export, not high-resolution image rendering.
import {deflateSync} from 'node:zlib';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const MiB=1024*1024;
export {P,MiB};
function variedBytes(length,step=64,seed=0xACE931){
  const bytes=Buffer.alloc(length);
  let x=seed>>>0;
  for(let i=0;i<length;i+=step){
    x^=(x<<13);x^=x>>>17;x^=(x<<5);
    bytes[i]=x&255;
  }
  return bytes;
}
export async function buildRealistic56PagePdf(){
  const doc=await P.PDFDocument.create({updateMetadata:false});
  let totalDecoded=0,largestDecoded=0,largestEncoded=0;
  for(let i=0;i<56;i++){
    const p=doc.addPage([595,842]);
    p.drawText('SYNTHETIC PAGE '+(i+1),{x:50,y:730,size:14});
    const raw=variedBytes(3*MiB,64,0x110000+i*1279);
    const zipped=deflateSync(raw,{level:6});
    const ref=doc.context.register(doc.context.stream(Uint8Array.from(zipped),{
      Type:'XObject',Subtype:'Image',Width:2048,Height:1536,
      ColorSpace:'DeviceGray',BitsPerComponent:8,Filter:'FlateDecode'
    }));
    const resources=doc.context.lookup(p.node.get(P.PDFName.of('Resources')));
    resources.set(P.PDFName.of('XObject'),doc.context.obj({QAImage:ref}));
    totalDecoded+=raw.length;
    largestDecoded=Math.max(largestDecoded,raw.length);
    largestEncoded=Math.max(largestEncoded,zipped.length);
  }
  // Normal-size Flate stream that exceeds the OLD 24 MiB per-stream cap,
  // with ~50x compression (not the unsafe >256x ratio of our bomb corpus).
  const raster=variedBytes(48*MiB,128,0x12345678);
  const zipped=deflateSync(raster,{level:6});
  doc.catalog.set(P.PDFName.of('SyntheticLargeImageData'),
    doc.context.register(doc.context.stream(Uint8Array.from(zipped),{
      Type:'XObject',Subtype:'Image',Width:8192,Height:6144,
      ColorSpace:'DeviceGray',BitsPerComponent:8,Filter:'FlateDecode'
    })));
  totalDecoded+=raster.length;
  largestDecoded=Math.max(largestDecoded,raster.length);
  largestEncoded=Math.max(largestEncoded,zipped.length);
  const initial=await doc.save({useObjectStreams:false});
  const target=30270000; // user's reported 30.27 MB (decimal)
  const filler=Math.max(0,target-initial.length-400);
  doc.catalog.set(P.PDFName.of('SyntheticUnfilteredDocumentData'),
    doc.context.register(doc.context.stream(new Uint8Array(filler))));
  const bytes=Uint8Array.from(await doc.save({useObjectStreams:false}));
  return {bytes,meta:{pages:56,bytes:bytes.length,decodedBytes:totalDecoded,
    largestDecoded,largestEncoded,largestCompressionRatio:largestDecoded/largestEncoded}};
}
