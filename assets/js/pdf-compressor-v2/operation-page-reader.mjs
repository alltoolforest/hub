// One compression operation only. Reuse independent page inspection solely for
// identical SHA-256-bound bytes AND identical parser limits. No PDF bytes or
// parser documents are retained, and callers receive isolated report copies.
export function createOperationPageReader(readPages){
  const reports=new Map();
  return async(bytes,options={})=>{
    options.signal?.throwIfAborted();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    const {signal,...limits}=options;
    const key=digest+'|'+JSON.stringify(Object.entries(limits).sort(([a],[b])=>a.localeCompare(b)));
    let report=reports.get(key);
    if(!report){
      report=await readPages(bytes,options);
      signal?.throwIfAborted();
      // Keep this bounded even if future pipelines introduce more stages.
      if(reports.size>=4)reports.delete(reports.keys().next().value);
      reports.set(key,structuredClone(report));
    }
    signal?.throwIfAborted();return structuredClone(report);
  };
}
