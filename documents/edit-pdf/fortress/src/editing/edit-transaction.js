import { uniqueId } from '../utils/ids.js';
export function createEditTransaction({pageIndex,block,replacementUnicode}){
  return {id:uniqueId('edit'),pageIndex,blockId:block.id,sourceMap:block.sourceLines,originalUnicode:block.text,replacementUnicode,originalEncodedBytes:null,replacementEncodedBytes:null,originalOperators:block.sourceRuns,replacementOperators:null,fontContext:block.sourceRuns?.[0]?.fontContext||null,layoutValidation:null,status:'DRAFT',block};
}
