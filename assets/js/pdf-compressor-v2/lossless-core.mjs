// Task 4 only: isolated preservation-first, lossless PDF compressor core.
// Provider is injected: no unapproved WASM binary is bundled or fetched.
// No image downsampling, rasterization, UI wiring or production imports.
export class LosslessCompressionError extends Error {
  constructor(code){super(code);this.name='LosslessCompressionError';this.code=code;}
}
const asBytes = v => v instanceof Uint8Array ? v : null;
export async function optimizeLosslessly(original,{optimize,inspect,maximumBytes=80*1024*1024,onProgress=()=>{},signal}={}){
  if(signal?.aborted)throw new LosslessCompressionError('cancelled');
  const input=asBytes(original);
  if(!input||input.length<8||input.length>maximumBytes)
    throw new LosslessCompressionError('invalid-or-oversize-input');
  if(typeof inspect!=='function'||typeof optimize!=='function')
    throw new LosslessCompressionError('unapproved-or-unavailable-engine');
  onProgress('lossless-inspection');
  const before=await inspect(input);
  if(signal?.aborted)throw new LosslessCompressionError('cancelled');
  if(!before||before.valid!==true)
    throw new LosslessCompressionError('invalid-pdf');
  if(before.signed||before.encrypted||before.unknownSecurity)
    throw new LosslessCompressionError('restricted-pdf');
  if(!before.fingerprint||typeof before.fingerprint!=='string')
    throw new LosslessCompressionError('unverifiable-original');
  // Provider must perform structural, *lossless* recompression only.
  // Defensive copy avoids a provider accidentally mutating caller's data.
  onProgress('lossless-optimization');
  let candidate;
  try { candidate=asBytes(await optimize(input.slice())); }
  catch(error){
    // Resource exhaustion, unsafe-input failures and cancellation are not
    // optional optimization errors. They must never be mislabeled as a safe
    // recoverable optimizer failure.
    if(signal?.aborted||error?.code==='cancelled'||error?.name==='AbortError')
      throw new LosslessCompressionError('cancelled');
    if(error instanceof RangeError||['RuntimeError','QuotaExceededError','OutOfMemoryError'].includes(error?.name)||
      /(?:out of memory|memory access out of bounds|cannot enlarge memory)/i.test(String(error?.message??''))||
      /^(?:invalid-|unsafe-|unsupported-|encrypted-|signed-|resource-|decoded-|invariant-|memory-|file-limit|processing-timeout)/.test(String(error?.code??'')))
      throw error;
    // Only an explicitly classified optimizer failure is recoverable.
    // Do not reclassify unknown JS/WASM exceptions as normal qpdf failures.
    if(error?.code==='qpdf-unclean-exit'||error?.code==='optimizer-failed')
      throw new LosslessCompressionError('optimizer-failed');
    throw error;
  }
  if(signal?.aborted)throw new LosslessCompressionError('cancelled');
  if(!candidate||candidate.length<8||candidate.length>maximumBytes)
    throw new LosslessCompressionError('invalid-output');
  if(candidate.length>=input.length)
    return {bytes:input.slice(),status:'original-retained',inputBytes:input.length,
      outputBytes:input.length,savedBytes:0};
  onProgress('lossless-verification');
  const after=await inspect(candidate);
  if(signal?.aborted)throw new LosslessCompressionError('cancelled');
  if(!after||after.valid!==true||after.signed||after.encrypted||after.unknownSecurity||
     after.fingerprint!==before.fingerprint)
    throw new LosslessCompressionError('preservation-check-failed');
  return {bytes:candidate,status:'compressed',inputBytes:input.length,
    outputBytes:candidate.length,savedBytes:input.length-candidate.length};
}
