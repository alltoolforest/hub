import { createWritingUiState } from "./task2-state.js";

export const WRITING_STORAGE_KEY="alltoolforest.professional-writing-v2.draft";
export const WRITING_STORAGE_SCHEMA=1;
export const WRITING_STORAGE_MAX=120000;

function validStorage(storage){
  return storage&&typeof storage.getItem==="function"&&typeof storage.setItem==="function"&&typeof storage.removeItem==="function";
}

export function createWritingDraftStore(storage){
  const target=validStorage(storage)?storage:null;
  return {
    save(state){
      if(!target)return {ok:false,reason:"storage_unavailable"};
      try{
        const raw=JSON.stringify({
          schema:WRITING_STORAGE_SCHEMA,
          savedAt:new Date().toISOString(),
          state:createWritingUiState(state),
        });
        if(raw.length>WRITING_STORAGE_MAX)return {ok:false,reason:"storage_too_large"};
        target.setItem(WRITING_STORAGE_KEY,raw);
        return {ok:true};
      }catch(error){
        return {ok:false,reason:"storage_failed",message:error.message};
      }
    },
    load(){
      if(!target)return {ok:false,reason:"storage_unavailable",state:null};
      try{
        const raw=target.getItem(WRITING_STORAGE_KEY);
        if(!raw)return {ok:true,state:null};
        if(raw.length>WRITING_STORAGE_MAX)return {ok:false,reason:"storage_too_large",state:null};
        const parsed=JSON.parse(raw);
        if(parsed?.schema!==WRITING_STORAGE_SCHEMA)return {ok:false,reason:"unsupported_schema",state:null};
        if(!parsed?.state||typeof parsed.state!=="object")return {ok:false,reason:"corrupt_data",state:null};
        return {ok:true,state:createWritingUiState(parsed.state),savedAt:parsed.savedAt||null};
      }catch{
        return {ok:false,reason:"corrupt_data",state:null};
      }
    },
    clear(){
      if(!target)return {ok:false,reason:"storage_unavailable"};
      try{
        target.removeItem(WRITING_STORAGE_KEY);
        return {ok:true};
      }catch{
        return {ok:false,reason:"storage_failed"};
      }
    }
  };
}
