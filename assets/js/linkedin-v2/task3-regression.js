import { PROFILE_MODE } from "./contracts.js";
import {
  createTask3State,updateInput,generateProfileSections,applyHeadlineAlternative,
  updateDraft,resetDraftToGenerated
} from "./task3-state.js";
import { createLinkedInDraftStore,LINKEDIN_STORAGE_KEY } from "./task3-storage.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function populated(){
  let state=createTask3State({
    mode:PROFILE_MODE.EXPERIENCED,
    targetRole:"Fraud Analyst",
    currentRole:"Customer Support Associate",
    currentHeadline:"Customer Support Associate | Disputes",
    currentAbout:"Customer support professional with dispute-handling experience.",
    experienceText:"Responsible for customer disputes\nHandled escalations",
    skillsText:"Excel\nCustomer Service",
    achievementsText:"Reduced repeat contacts by 12%",
    professionalGoal:"Move into fraud operations."
  });
  return generateProfileSections(state);
}
function memoryStorage(){
  const map=new Map([["unrelated.key","keep"]]);
  return {
    getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>map.set(k,String(v)),
    removeItem:k=>map.delete(k),
    value:k=>map.get(k),
    has:k=>map.has(k),
    raw:(k,v)=>map.set(k,String(v))
  };
}

export function runTask3Regression(){
  let state=populated();
  assert(state.review?.checks?.length>0,"Profile review should be present.");
  assert(state.drafts.headline,"Headline draft should be initialized.");
  assert(state.drafts.about,"About draft should be initialized.");
  assert(state.drafts.experience.includes("Handled customer disputes"),"Experience draft should contain rewritten wording.");
  assert(state.drafts.skills.includes("Suggested to review"),"Skills draft should keep suggestions visibly separate.");

  const first=state.drafts.headline;
  state=applyHeadlineAlternative(state,"concise");
  assert(state.drafts.headline!==first,"Headline alternative should replace the draft.");
  assert(state.dirty.headline,"Selecting headline alternative should mark it as edited.");

  state=updateDraft(state,"about","My manually edited About section.");
  const manual=state.drafts.about;
  state=updateInput(state,"industry","Financial Services");
  state=generateProfileSections(state);
  assert(state.drafts.about===manual,"Manual edits must survive regeneration.");

  state=resetDraftToGenerated(state,"about");
  assert(state.drafts.about!==manual,"Reset should restore generated About.");
  assert(!state.dirty.about,"Reset should clear dirty flag.");

  const storage=memoryStorage();
  const store=createLinkedInDraftStore(storage);
  assert(store.save(state).ok,"Draft should save.");
  assert(storage.has(LINKEDIN_STORAGE_KEY),"Scoped LinkedIn storage key required.");
  const loaded=store.load();
  assert(loaded.ok&&loaded.state,"Draft should restore.");
  assert(loaded.state.input.targetRole==="Fraud Analyst","Target role should persist.");
  assert(loaded.state.drafts.headline===state.drafts.headline,"Edited outputs should persist.");

  storage.raw(LINKEDIN_STORAGE_KEY,"{bad json");
  const corrupt=store.load();
  assert(!corrupt.ok&&corrupt.reason==="corrupt_data","Corrupt saved draft must fail safely.");

  store.save(state);
  assert(store.clear().ok,"Clear saved data should succeed.");
  assert(!storage.has(LINKEDIN_STORAGE_KEY),"LinkedIn draft should be removed.");
  assert(storage.value("unrelated.key")==="keep","Unrelated storage must remain untouched.");

  const fresh=createTask3State();
  assert(fresh.input.mode===PROFILE_MODE.EXPERIENCED,"New drafts should default to experienced mode.");
  assert(!fresh.generated&&!fresh.review,"New draft should not pre-generate later workflow state.");

  return {
    pass:true,
    reviewWorkflow:true,
    editableSections:true,
    headlineAlternatives:true,
    manualEditPreservation:true,
    resetToSuggestion:true,
    localSaveRestore:true,
    corruptStorageRecovery:true,
    scopedClear:true,
    unrelatedStoragePreserved:true
  };
}
