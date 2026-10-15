// Task 3: narrow stage-local recovery allowlist. A bad output is NEVER used.
// An immutable, already inspected source or an independently approved earlier
// stage may be retained for the mandatory final PDF/text verification.
// This does not authorize bypassing unsafe input, cancellation, resource
// budgets, missing verifiers, or unexplained implementation failures.
const allowed=Object.freeze({
  'embedded-images':Object.freeze(new Set(['image-output-integrity-failed'])),
  'lossless':Object.freeze(new Set(['optimizer-failed','invalid-output','preservation-check-failed']))
});
const identifier=error=>{
  if(typeof error?.code==='string')return error.code;
  return error?.name==='Error'&&typeof error.message==='string'?error.message:null;
};
export function recoveryCode(stage,error,{signal}={}){
  if(signal?.aborted||error?.name==='AbortError'||error instanceof RangeError)return null;
  const code=identifier(error);
  return code&&allowed[stage]?.has(code)?code:null;
}
export async function attemptOptionalStage(stage,action,{signal,onFallback=()=>{}}={}){
  if(typeof action!=='function')throw Error('verified-stage-required');
  if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'cancelled'});
  try{
    const value=await action();
    if(signal?.aborted)throw Object.assign(Error('cancelled'),{code:'cancelled'});
    return {status:'completed',value};
  }catch(error){
    const reason=recoveryCode(stage,error,{signal});
    if(!reason)throw error;
    onFallback({stage,reason});
    return {status:'recovered',reason};
  }
}
