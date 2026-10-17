import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
// Reports are reusable only inside one operation for identical bytes and limits.
// This avoids reparsing the same unchanged source at every pipeline boundary.
export function createOperationInspector({PDF,readPages}){
 const reports=new Map();
 return async(bytes,{signal,limits=INPUT_LIMITS}={})=>{
  signal?.throwIfAborted();
  if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>limits.maxBytes)
   return inspectPDFInput(bytes,{PDF,readPages,signal,limits});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  const key=digest+'|'+JSON.stringify(Object.entries(limits).sort(([a],[b])=>a.localeCompare(b)));
  let report=reports.get(key);
  if(!report){
   report=await inspectPDFInput(bytes,{PDF,readPages,signal,limits});
   signal?.throwIfAborted();
   if(reports.size>=4)reports.delete(reports.keys().next().value);
   reports.set(key,report);
  }
  signal?.throwIfAborted();return structuredClone(report);
 };
}
