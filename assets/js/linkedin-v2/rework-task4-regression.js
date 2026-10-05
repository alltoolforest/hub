import { PROFILE_MODE } from "./contracts.js";
import { createTask3State,selectTargetRole,generateProfileSections,updateDraft } from "./task3-state.js";
import { createLinkedInDraftStore,LINKEDIN_STORAGE_KEY,LINKEDIN_STORAGE_SCHEMA } from "./task3-storage.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import {
  STARTER_SECTION,STARTER_STATE,createRoleStarterPack,setStarterItemConfirmed,addUserStarterItem
} from "./rework-task2-starter-pack.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function memoryStorage(){
  const map=new Map([["unrelated.key","keep"]]);
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    value:key=>map.get(key),
    raw:(key,value)=>map.set(key,String(value)),
    has:key=>map.has(key),
  };
}
function buildState(){
  let state=createTask3State({
    mode:PROFILE_MODE.CAREER_CHANGER,
    currentRole:"Customer Support Executive",
    currentHeadline:"Customer Support Executive | Disputes",
    currentAbout:"Customer support professional.",
    experienceText:"Handled customer disputes",
    skillsText:"Customer Service",
    resumeText:"Customer Support Executive\nHandled customer disputes."
  });
  const role=createLinkedInRoleRecord("Fraud Analyst");
  state=selectTargetRole(state,role);
  state={...state,starterPack:createRoleStarterPack(role,state.input.mode,{currentRole:state.input.currentRole})};
  const skill=state.starterPack.sections.skills.find(item=>!item.requiresEdit);
  state={...state,starterPack:setStarterItemConfirmed(state.starterPack,STARTER_SECTION.SKILLS,skill.id,true)};
  state={...state,starterPack:addUserStarterItem(state.starterPack,STARTER_SECTION.SKILLS,"Excel")};
  state={...state,starterPack:addUserStarterItem(state.starterPack,STARTER_SECTION.ACHIEVEMENTS,"Reduced repeat contacts by 12%")};
  state=generateProfileSections(state);
  state=updateDraft(state,"about","My manually edited About section.");
  return state;
}

export function runLinkedInReworkTask4Regression(){
  const storage=memoryStorage();
  const store=createLinkedInDraftStore(storage);
  const state=buildState();

  const save=store.save(state);
  assert(save.ok,"Full guided-flow state should save.");
  const raw=JSON.parse(storage.value(LINKEDIN_STORAGE_KEY));
  assert(raw.schema===LINKEDIN_STORAGE_SCHEMA&&LINKEDIN_STORAGE_SCHEMA===2,"Full-state schema should be version 2.");
  assert(raw.state.roleSelection?.title==="Fraud Analyst","Canonical role selection must persist.");
  assert(raw.state.starterPack?.sections?.skills?.length>0,"Starter-pack suggestions must persist.");
  assert(raw.state.workflow?.hasOptimized===true,"Optimized workflow stage must persist.");

  const load=store.load();
  assert(load.ok&&load.state,"Full guided-flow state should restore.");
  const restored=load.state;
  assert(restored.roleSelection?.title==="Fraud Analyst","Role selection should restore exactly.");
  assert(restored.starterPack?.roleTitle==="Fraud Analyst","Starter-pack target role should restore.");
  assert(restored.starterPack.sections.skills.some(item=>item.state===STARTER_STATE.CONFIRMED),"Confirmed suggestion state should restore.");
  assert(restored.starterPack.sections.skills.some(item=>item.state===STARTER_STATE.USER_ENTERED&&item.text==="Excel"),"User-entered starter information should restore.");
  assert(restored.starterPack.sections.achievements.some(item=>item.state===STARTER_STATE.USER_ENTERED&&/12%/.test(item.text)),"User achievement evidence should restore.");
  assert(restored.generated&&restored.review,"Optimized results should reconstruct after restore.");
  assert(restored.drafts.about==="My manually edited About section.","Manual optimized edits must survive save/restore.");
  assert(restored.dirty.about===true,"Manual-edit dirty state must restore.");
  assert(restored.optimizationEvidence?.included?.skills?.length>=2,"Reconstructed optimization must preserve included starter evidence.");
  assert(storage.value("unrelated.key")==="keep","Unrelated browser storage must remain untouched.");

  const schema1={
    schema:1,
    savedAt:"2026-10-05T00:00:00.000Z",
    state:{
      version:"linkedin-v2-task3",
      input:{...createTask3State({targetRole:"Data Analyst"}).input},
      drafts:{headline:"Old headline",about:"",experience:"",skills:""},
      dirty:{headline:true,about:false,experience:false,skills:false}
    }
  };
  storage.raw(LINKEDIN_STORAGE_KEY,JSON.stringify(schema1));
  const migrated=store.load();
  assert(migrated.ok&&migrated.state,"Schema 1 draft should migrate safely.");
  assert(migrated.state.input.targetRole==="Data Analyst","Migrated target role should be preserved.");
  assert(migrated.state.drafts.headline==="Old headline","Migrated manual draft should be preserved.");
  assert(migrated.state.starterPack===null,"Legacy draft should not fabricate starter suggestions.");

  storage.raw(LINKEDIN_STORAGE_KEY,JSON.stringify({schema:99,state:{}}));
  const unsupported=store.load();
  assert(!unsupported.ok&&unsupported.reason==="unsupported_schema","Unknown future schema should fail safely.");

  storage.raw(LINKEDIN_STORAGE_KEY,"{broken");
  const corrupt=store.load();
  assert(!corrupt.ok&&corrupt.reason==="corrupt_data","Corrupt full-state draft should fail safely.");

  store.save(state);
  assert(store.clear().ok,"Clear saved data should succeed.");
  assert(!storage.has(LINKEDIN_STORAGE_KEY),"Scoped LinkedIn draft should be cleared.");
  assert(storage.value("unrelated.key")==="keep","Clear must not remove unrelated storage.");

  return Object.freeze({
    pass:true,
    schema2:true,
    fullStateSaveRestore:true,
    roleSelectionPersistence:true,
    starterPackPersistence:true,
    confirmationPersistence:true,
    userEnteredPersistence:true,
    optimizedStageRestored:true,
    manualEditPersistence:true,
    schema1Migration:true,
    unsupportedSchemaGuard:true,
    corruptRecovery:true,
    scopedClear:true,
  });
}
