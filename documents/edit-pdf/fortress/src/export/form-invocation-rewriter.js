import { parseContentStream } from '../parser/content-stream-parser.js';
import { rewriteByteRanges } from '../mutation/content-stream-editor.js';

export function allocateSameLengthResourceName(existingNames,originalName,{seed=0}={}){
  const original=String(originalName||'');
  if(!original||!/^[A-Za-z0-9_]+$/.test(original))return null;
  const used=new Set([...(existingNames||[])].map(String));
  const length=original.length;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const capacity=Math.min(100000,Math.pow(alphabet.length,Math.min(length,4)));
  for(let offset=0;offset<capacity;offset++){
    let value=Math.max(0,Number(seed)||0)+offset,candidate='';
    for(let i=0;i<length;i++){candidate=alphabet[value%alphabet.length]+candidate;value=Math.floor(value/alphabet.length);}
    if(candidate!==original&&!used.has(candidate))return candidate;
  }
  return null;
}

export function rewriteFormInvocationName(bytes,{operatorIndex,expectedResourceName,newResourceName}={}){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes||0);
  const oldName=String(expectedResourceName||''),nextName=String(newResourceName||'');
  if(!oldName||!nextName)throw Object.assign(new Error('Form resource name is missing.'),{code:'FORM_INVOCATION_NAME_MISSING'});
  if(oldName.length!==nextName.length)throw Object.assign(new Error('Isolated Form resource name must preserve byte length.'),{code:'FORM_INVOCATION_NAME_LENGTH_MISMATCH'});
  if(!/^[A-Za-z0-9_]+$/.test(nextName))throw Object.assign(new Error('Isolated Form resource name is not PDF-name safe.'),{code:'FORM_INVOCATION_NAME_UNSAFE'});
  const {instructions}=parseContentStream(bytes);
  const index=Number(operatorIndex),instruction=instructions[index];
  if(!Number.isInteger(index)||index<0||!instruction||instruction.op!=='Do')throw Object.assign(new Error('Target Form invocation operator is unavailable.'),{code:'FORM_INVOCATION_OPERATOR_MISSING'});
  const token=instruction.args?.[0];
  if(!token||token.type!=='name'||String(token.value)!==oldName)throw Object.assign(new Error('Target Form invocation no longer references the expected resource.'),{code:'FORM_INVOCATION_RESOURCE_CHANGED'});
  const replacement=`/${nextName}`;
  if(replacement.length!==token.end-token.start)throw Object.assign(new Error('Form invocation rewrite would shift later source offsets.'),{code:'FORM_INVOCATION_BYTE_LENGTH_CHANGED'});
  const rewritten=rewriteByteRanges(bytes,[{start:token.start,end:token.end,replacement}]);
  if(rewritten.length!==bytes.length)throw Object.assign(new Error('Form invocation rewrite changed stream length.'),{code:'FORM_INVOCATION_STREAM_LENGTH_CHANGED'});
  return {bytes:rewritten,oldName,newName:nextName,operatorIndex:index,start:token.start,end:token.end};
}
