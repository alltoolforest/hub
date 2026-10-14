// Task 7 final handoff checks. Protected graph and image quality approval remain
// mandatory in the engines; this gate independently reopens their composed output.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {compressPDF} from './compression-pipeline.mjs';
import {createOperationPageReader} from './operation-page-reader.mjs';
import {createOperationInspector} from './operation-inspector.mjs';
import {MODES} from './mode-policy.mjs';
export class OutputIntegrityError extends Error {
  constructor(code){super(code);this.name='OutputIntegrityError';this.code=code;}
}
const fail=code=>{throw new OutputIntegrityError(code);};
const cancel=signal=>{if(signal?.aborted)fail('cancelled');};
export const digestPDFBytes=async bytes=>Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');

// This is a final postcondition, not standalone authorization for arbitrary
// lossy output. Only compressAndVerifyPDF supplies the verified stage composition.
export async function verifyFinalOutput(original,result,{PDF,readPages,readText,signal,limits=INPUT_LIMITS,inspectInput=inspectPDFInput}={}){
  cancel(signal);
  if(!(original instanceof Uint8Array)||!(result?.bytes instanceof Uint8Array)||
    !MODES.includes(result.mode)||typeof readText!=='function')fail('unverifiable-output');
  const output=result.bytes,saved=original.length-output.length;
  if(output.length<16||saved<0||result.inputBytes!==original.length||
    result.outputBytes!==output.length||result.savedBytes!==saved||
    result.status!==(saved>0?'compressed':'original-retained'))fail('invalid-output-report');
  if(saved===0&&output.some((value,index)=>value!==original[index]))fail('false-original-fallback');
  const before=await inspectInput(original,{PDF,readPages,signal,limits});
  const after=await inspectInput(output,{PDF,readPages,signal,limits});
  for(const key of ['pageCount','classification','hasTextLayer','possibleOCR','geometry','pages','structures'])
    if(JSON.stringify(before[key])!==JSON.stringify(after[key]))fail('final-document-profile-changed');
  const sourceText=await readText(original,{signal});
  const outputText=await readText(output,{signal});
  if(!Array.isArray(sourceText)||sourceText.length!==before.pageCount||
    !Array.isArray(outputText)||JSON.stringify(sourceText)!==JSON.stringify(outputText))
    fail('final-text-or-geometry-changed');
  const sourceDigest=await digestPDFBytes(original),outputDigest=await digestPDFBytes(output);
  cancel(signal);
  return Object.freeze({version:1,mode:result.mode,pageCount:after.pageCount,
    sourceDigest,outputDigest,inputBytes:original.length,outputBytes:output.length,
    savedBytes:saved,independentTextVerified:true});
}
export async function compressAndVerifyPDF(bytes,options){
  options={...options,readPages:createOperationPageReader(options.readPages)};
  options.inspectInput=createOperationInspector(options);
  const result=await compressPDF(bytes,options);
  options?.onProgress?.('final-output');
  const integrity=await verifyFinalOutput(bytes,result,options);
  return {...result,integrity};
}
