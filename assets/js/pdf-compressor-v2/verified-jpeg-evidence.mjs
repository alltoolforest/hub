// Per-image-stage cryptographic evidence for an already quality-checked JPEG.
// The output verifier still compares every encoded byte to its declared image
// replacement, verifies the full restored PDF graph, independently reads both
// page profiles, and the final verifier rereads the document and all text.
// Positive results are cached only inside one operation, never across files.
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const sha=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
export function createVerifiedJpegEvidenceCache(verifyJpeg,{signal,maxEntries=512}={}){
  if(typeof verifyJpeg!=='function')return verifyJpeg;
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1000)
    throw Error('invalid-jpeg-verification-budget');
  const approvals=new Set();
  return async evidence=>{
    if(signal?.aborted)throw Error('cancelled');
    const {bytes,originalStream,descriptor,width,height,mode}=evidence??{};
    const source=originalStream?.contents;
    if(!(bytes instanceof Uint8Array)||!(source instanceof Uint8Array)||
       !descriptor||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
       width<1||height<1||typeof mode!=='string')return false;
    const raw=[await sha(source),await sha(bytes),descriptor.width,descriptor.height,
      descriptor.bitsPerComponent,descriptor.filter,descriptor.colorSpace,
      width,height,mode];
    if(signal?.aborted)throw Error('cancelled');
    const key=JSON.stringify(raw);
    if(approvals.has(key))return true;
    const result=await verifyJpeg(evidence);
    if(signal?.aborted)throw Error('cancelled');
    if(result!==true)return false;
    if(approvals.size>=maxEntries)approvals.delete(approvals.values().next().value);
    approvals.add(key);
    return true;
  };
}
