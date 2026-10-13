// Task 4 source-build adapter. Factory is injected: no network loading, shared
// engine imports, production binary approval or image conversion is implicit.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {losslessFingerprint} from './lossless-invariants.mjs';
import {optimizeLosslessly} from './lossless-core.mjs';
import {deduplicateOpaqueImages} from './lossless-image-dedup.mjs';
export function createQpdfLosslessProvider(createModule){
  if(typeof createModule!=='function')throw new TypeError('A reviewed local qpdf module factory is required');
  return async bytes=>{
    if(!(bytes instanceof Uint8Array)||bytes.length>INPUT_LIMITS.maxBytes)
      throw Error('invalid-or-oversize-input');
    const module=await createModule({noInitialRun:true,print:()=>{},printErr:()=>{}});
    const input='/compressor-input.pdf',output='/compressor-output.pdf';
    try{
      module.FS.writeFile(input,bytes);
      const exitCode=module.callMain(['--object-streams=generate','--compress-streams=y',
        '--decode-level=generalized','--recompress-flate','--compression-level=9',
        '--preserve-unreferenced','--remove-unreferenced-resources=no',input,output]);
      if(exitCode!==0)throw Error('qpdf-unclean-exit');
      const result=module.FS.readFile(output);
      if(!(result instanceof Uint8Array)||result.length>INPUT_LIMITS.maxBytes)
        throw Error('invalid-or-oversize-output');
      return result.slice();
    }finally{
      for(const path of [input,output]){
        try{module.FS.unlink(path);}catch{/* May not exist after a failed run. */}
      }
    }
  };
}
export async function runVerifiedLossless(bytes,{PDF,readPages,optimize,signal}={}){
  const inspect=async data=>{
    const report=await inspectPDFInput(data,{PDF,readPages,signal});
    return {...report,signed:false,encrypted:false,
      fingerprint:await losslessFingerprint(data,{PDF})};
  };
  const optimizeWithSafeDedup=async input=>{
    // Classical staging removes obsolete xref/object-stream containers only.
    // qpdf may then preserve all material orphan objects without retaining old
    // object-stream payloads that confuse independent scan-based parsers.
    const prepared=await deduplicateOpaqueImages(input,{PDF,serializeClassic:true});
    return optimize(prepared.bytes);
  };
  return optimizeLosslessly(bytes,{optimize:optimizeWithSafeDedup,inspect,maximumBytes:INPUT_LIMITS.maxBytes});
}
