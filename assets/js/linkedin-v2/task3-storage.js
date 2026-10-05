import { createTask3State,generateProfileSections } from "./task3-state.js";

export const LINKEDIN_STORAGE_KEY="alltoolforest.linkedin-v2.draft";
export const LINKEDIN_STORAGE_SCHEMA=2;
export const LINKEDIN_STORAGE_MAX=180000;

function validStorage(storage){
  return storage&&typeof storage.getItem==="function"&&typeof storage.setItem==="function"&&typeof storage.removeItem==="function";
}
function cloneJson(value){
  if(value==null)return null;
  return JSON.parse(JSON.stringify(value));
}
function serializableState(state){
  return {
    version:state.version,
    input:{...state.input},
    roleSelection:cloneJson(state.roleSelection),
    starterPack:cloneJson(state.starterPack),
    drafts:{...state.drafts},
    dirty:{...state.dirty},
    workflow:{
      hasOptimized:Boolean(state.generated||state.review),
    },
  };
}
function validObject(value){
  return Boolean(value&&typeof value==="object"&&!Array.isArray(value));
}
function restoreBase(saved){
  if(!validObject(saved)||!validObject(saved.input)||!validObject(saved.drafts)||!validObject(saved.dirty)){
    throw new Error("corrupt_data");
  }
  let next=createTask3State({
    ...saved.input,
    roleSelection:validObject(saved.roleSelection)?saved.roleSelection:null,
    starterPack:validObject(saved.starterPack)?saved.starterPack:null,
  });
  next.drafts={...next.drafts,...saved.drafts};
  next.dirty={...next.dirty,...saved.dirty};
  if(saved.workflow?.hasOptimized){
    next=generateProfileSections(next);
  }
  return next;
}
function migrateSchema1(parsed){
  const saved=parsed?.state;
  if(!validObject(saved))throw new Error("corrupt_data");
  return restoreBase({
    input:saved.input,
    drafts:saved.drafts,
    dirty:saved.dirty,
    roleSelection:null,
    starterPack:null,
    workflow:{hasOptimized:false},
  });
}
function validateLoaded(parsed){
  if(parsed?.schema===1)return migrateSchema1(parsed);
  if(parsed?.schema!==LINKEDIN_STORAGE_SCHEMA)throw new Error("unsupported_schema");
  return restoreBase(parsed.state);
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
        return {
          ok:false,
          reason:error.message==="unsupported_schema"?"unsupported_schema":"corrupt_data",
          state:null
        };
      }
    },
    clear(){
      if(!target)return {ok:false,reason:"storage_unavailable"};
      try{target.removeItem(LINKEDIN_STORAGE_KEY);return {ok:true}}
      catch{return {ok:false,reason:"storage_failed"}}
    }
  };
}
