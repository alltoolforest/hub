import { createBuilderState, updateBuilderState, BUILDER_STEPS } from "./builder-state.js";
import { COVER_LETTER_TEMPLATES } from "./template-contracts.js";
import { createDraftStore, DRAFT_STORAGE_KEY } from "./draft-store.js";
import { createPreviewModel, splitLetterForPreview } from "./template-renderer.js";
import { createCoverLetterDraft } from "./task2-engine.js";
import { CANDIDATE_TYPES } from "./contracts.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    has:key=>map.has(key),
  };
}

export function runTask3Regression(){
  assert(BUILDER_STEPS.length===7,"Guided workflow must have seven approved stages.");
  assert(COVER_LETTER_TEMPLATES.length===4,"Exactly four Task 3 templates are required.");
  assert(new Set(COVER_LETTER_TEMPLATES.map(t=>t.id)).size===4,"Template IDs must be unique.");

  const input={
    candidate:{
      candidateType:CANDIDATE_TYPES.EXPERIENCED,
      fullName:"Alex Candidate",
      email:"alex@example.com",
      phone:"+91 9000000000",
      location:"Hyderabad",
      targetPosition:"Compliance Analyst",
      company:"Example Bank",
      recipient:"Hiring Manager",
      motivation:"the role aligns with investigation and customer protection work",
    },
    resumeText:"Skills\nAML\nKYC\nExperience\nInvestigated transaction monitoring alerts and completed KYC reviews.",
    jobDescription:"Required: Anti-Money Laundering. Required: Know Your Customer. Required: transaction monitoring.",
  };

  const generated=createCoverLetterDraft(input);
  const original=generated.generated.letter;
  const edited=original.replace("Thank you for considering my application.","Thank you for reviewing my application.");
  let state=createBuilderState({input,draft:original});
  state=updateBuilderState(state,{draft:edited,manualEdit:true,templateId:"modern"});
  assert(state.draft===edited,"Manual edits must remain in state.");
  assert(state.manualEdit===true,"Manual edit flag must persist.");
  assert(state.templateId==="modern","Template selection must persist.");

  const models=COVER_LETTER_TEMPLATES.map(t=>createPreviewModel({letter:edited,templateId:t.id}));
  assert(models.every(m=>m.blocks.length>0),"All templates must receive preview blocks.");
  assert(new Set(models.map(m=>m.templateId)).size===4,"All four template models must remain distinct.");
  assert(splitLetterForPreview("One\n\nTwo").length===2,"Preview should preserve document blocks.");

  const storage=memoryStorage();
  const store=createDraftStore(storage);
  assert(store.save(state).ok,"Draft save should succeed.");
  assert(storage.has(DRAFT_STORAGE_KEY),"Draft must be stored under scoped key.");
  const restored=store.load();
  assert(restored.ok&&restored.state,"Saved draft should restore.");
  assert(restored.state.draft===edited,"Restored draft must preserve manual edits.");
  assert(restored.state.templateId==="modern","Restored draft must preserve template.");
  assert(store.clear().ok,"Draft clear should succeed.");
  assert(!storage.has(DRAFT_STORAGE_KEY),"Clear must remove saved draft.");

  const unavailable=createDraftStore(null);
  assert(!unavailable.save(state).ok,"Unavailable storage must fail safely.");
  assert(!unavailable.load().ok,"Unavailable storage load must fail safely.");

  const invalid=createBuilderState({templateId:"unknown",step:"not-a-step"});
  assert(invalid.templateId==="classic","Invalid template should safely fall back.");
  assert(invalid.step==="details","Invalid step should safely fall back.");

  return {
    pass:true,
    workflowStages:BUILDER_STEPS.length,
    templates:COVER_LETTER_TEMPLATES.map(t=>t.id),
    manualEditPreserved:true,
    livePreviewModels:true,
    draftSaveRestoreClear:true,
    storageFailureSafe:true,
  };
}
