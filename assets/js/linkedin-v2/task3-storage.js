import { createTask3State } from "./task3-state.js";

export const LINKEDIN_STORAGE_KEY="alltoolforest.linkedin-v2.draft";
export const LINKEDIN_STORAGE_SCHEMA=1;
export const LINKEDIN_STORAGE_MAX=120000;

function validStorage(storage){
  return storage&&typeof storage.getItem==="function"&&typeof storage.setItem==="function"&&typeof storage.removeItem==="function";
}
function serializableState(state){
  return {
    version:state.version,
    input:{...state.input},
    drafts:{...state.drafts},
    dirty:{...state.dirty},
  };
}
function validateLoaded(parsed){
  if(parsed?.schema!==LINKEDIN_STORAGE_SCHEMA)throw new Error("unsupported_schema");
  const saved=parsed.state;
  if(!saved||typeof saved!=="object"||!saved.input||!saved.drafts||!saved.dirty)throw new Error("corrupt_data");
  const next=createTask3State(saved.input);
  next.drafts={...next.drafts,...saved.drafts};
  next.dirty={...next.dirty,...saved.dirty};
  return next;
}

export function createLinkedInDraftStore(storage){
  const target=validStorage(storage)?storage:null;
  return {
    save(state){
      if(!target)return {ok:false,reason:"storage_unavailable"};
      try{
        const raw=JSON.stringify({
          schema:LINKEDIN_STORAGE_SCHEMA,
          savedAt:new Date().toISOString(),
          state:serializableState(state),
        });
        if(raw.length>LINKEDIN_STORAGE_MAX)return {ok:false,reason:"storage_too_large"};
        target.setItem(LINKEDIN_STORAGE_KEY,raw);
        return {ok:true};
      }catch(error){
        return {ok:false,reason:"storage_failed",message:error.message};
      }
    },
    load(){
      if(!target)return {ok:false,reason:"storage_unavailable",state:null};
      try{
        const raw=target.getItem(LINKEDIN_STORAGE_KEY);
        if(!raw)return {ok:true,state:null};
        if(raw.length>LINKEDIN_STORAGE_MAX)return {ok:false,reason:"storage_too_large",state:null};
        const parsed=JSON.parse(raw);
        return {ok:true,state:validateLoaded(parsed),savedAt:parsed.savedAt||null};
      }catch(error){
        return {ok:false,reason:error.message==="unsupported_schema"?"unsupported_schema":"corrupt_data",state:null};
      }
    },
    clear(){
      if(!target)return {ok:false,reason:"storage_unavailable"};
      try{target.removeItem(LINKEDIN_STORAGE_KEY);return {ok:true}}
      catch{return {ok:false,reason:"storage_failed"}}
    }
  };
}
