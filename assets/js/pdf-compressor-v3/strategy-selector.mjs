// Experimental strategy arbitration; measured bytes decide the winner.
// This owns no codecs and cannot authorize arbitrary candidate PDFs.
export class V3StrategyError extends Error {
 constructor(code){super(code);this.name='V3StrategyError';this.code=code;}
}
const fail=code=>{throw new V3StrategyError(code);};
const MODES=new Set(['balanced','strong','maximum']);
const fatal=new Set(['cancelled','signed-pdf','encrypted-pdf','restricted-document',
 'security-inspection-required','independent-verification-required','flatten-consent-required']);
export async function selectSmallestVerifiedPDF(original,{
  mode='maximum',allowDestructiveFlattening=false,
  inspectRestrictions,nonFlatten,raster,verifyResult,
  signal,onProgress=()=>{}
}={}){
 if(!(original instanceof Uint8Array)||original.length<16)fail('invalid-input');
 if(!MODES.has(mode))fail('invalid-mode');
 if(typeof inspectRestrictions!=='function')fail('security-inspection-required');
 if(typeof verifyResult!=='function')fail('independent-verification-required');
 if(typeof nonFlatten!=='function')fail('nonflatten-engine-required');
 if(allowDestructiveFlattening&&typeof raster!=='function')fail('raster-engine-required');
 if(signal?.aborted)fail('cancelled');
 const permitted=await inspectRestrictions(original,{signal,mode});
 if(permitted?.allowed!==true)fail(permitted?.code??'restricted-document');
 const choices=[],stages=[];
 const run=async(strategy,fn,destructive)=>{
  try{
   if(signal?.aborted)fail('cancelled');
   onProgress({strategy,stage:'processing'});
   const result=await fn(original,{mode,signal,consentToFlatten:allowDestructiveFlattening,
      inspectRestrictions:async()=>permitted});
   if(!result?.bytes){stages.push({strategy,status:result?.status??'no-candidate'});return;}
   const bytes=result.bytes;
   if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>=original.length)
     fail('candidate-size-invalid');
   if(result.destructive===true&&!allowDestructiveFlattening)fail('flatten-consent-required');
   if(destructive!==Boolean(result.destructive))fail('strategy-metadata-mismatch');
   if(await verifyResult({original,bytes,strategy,destructive,signal})!==true)
     fail('independent-output-verification-failed');
   if(signal?.aborted)fail('cancelled');
   choices.push({strategy,bytes,destructive,outputBytes:bytes.length});
   stages.push({strategy,status:'verified-candidate',outputBytes:bytes.length});
  }catch(error){
   if(signal?.aborted||fatal.has(error?.code))throw error;
   const reason=typeof error?.code==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(error.code)?
     error.code:'strategy-failed';
   stages.push({strategy,status:'failed-closed',reason});
  }
 };
 await run('nonflatten',nonFlatten,false);
 if(allowDestructiveFlattening)await run('raster',raster,true);
 if(!choices.length)return {status:'no-smaller-verified-output',bytes:null,
   inputBytes:original.length,outputBytes:null,stages};
 choices.sort((a,b)=>a.outputBytes-b.outputBytes);
 const best=choices[0];
 return {status:'compressed',bytes:best.bytes,inputBytes:original.length,
   outputBytes:best.outputBytes,savedBytes:original.length-best.outputBytes,
   reductionPercent:Number((100*(1-best.outputBytes/original.length)).toFixed(2)),
   selectedStrategy:best.strategy,destructive:best.destructive,stages};
}
