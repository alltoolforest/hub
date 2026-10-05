import { PROFILE_MODE } from "./contracts.js";
import { generateOptimization } from "./task2-optimizer.js";
import { reviewProfile } from "./task2-review.js";
import { generateReworkedOptimization } from "./rework-task3-integration.js";

export function createTask3State(seed={}){
  const input={
    mode:seed.mode||PROFILE_MODE.EXPERIENCED,
    targetRole:String(seed.targetRole||""),
    currentRole:String(seed.currentRole||""),
    industry:String(seed.industry||""),
    currentHeadline:String(seed.currentHeadline||""),
    currentAbout:String(seed.currentAbout||""),
    experienceText:String(seed.experienceText||""),
    skillsText:String(seed.skillsText||""),
    achievementsText:String(seed.achievementsText||""),
    professionalGoal:String(seed.professionalGoal||""),
    resumeText:String(seed.resumeText||""),
  };
  return {
    version:"linkedin-v2-task3",
    input,
    roleSelection:seed.roleSelection||null,
    starterPack:seed.starterPack||null,
    optimizationEvidence:null,
    generated:null,
    review:null,
    drafts:{
      headline:"",
      about:"",
      experience:"",
      skills:"",
    },
    dirty:{
      headline:false,
      about:false,
      experience:false,
      skills:false,
    }
  };
}

export function cloneTask3State(state){
  return {
    ...state,
    input:{...state.input},
    roleSelection:state.roleSelection,
    starterPack:state.starterPack,
    optimizationEvidence:state.optimizationEvidence,
    generated:state.generated,
    review:state.review,
    drafts:{...state.drafts},
    dirty:{...state.dirty},
  };
}

export function updateInput(state,field,value){
  if(!(field in state.input))throw new Error("Unsupported profile field.");
  const next=cloneTask3State(state);
  const normalized=String(value??"");
  next.input[field]=normalized;
  if(field==="targetRole"&&next.roleSelection&&next.roleSelection.title!==normalized.trim())next.roleSelection=null;
  return next;
}

export function selectTargetRole(state,roleRecord){
  if(!roleRecord||typeof roleRecord.title!=="string"||!roleRecord.title.trim())throw new Error("A valid target role selection is required.");
  const next=cloneTask3State(state);
  next.input.targetRole=roleRecord.title.trim();
  next.roleSelection=roleRecord;
  return next;
}

export function generateProfileSections(state){
  const next=cloneTask3State(state);
  let generated;
  let review;
  let evidenceAudit=null;

  if(next.starterPack&&(next.roleSelection||next.input.targetRole)){
    const integrated=generateReworkedOptimization(next);
    generated=integrated.generated;
    review=integrated.review;
    evidenceAudit=integrated.evidenceAudit;
  }else{
    generated=generateOptimization(next.input);
    review=reviewProfile(generated.foundation);
  }

  next.generated=generated;
  next.review=review;
  next.optimizationEvidence=evidenceAudit;

  if(!next.dirty.headline)next.drafts.headline=generated.headlines[0]?.text||"";
  if(!next.dirty.about)next.drafts.about=generated.about.text||"";
  if(!next.dirty.experience)next.drafts.experience=generated.experience.map(x=>"• "+x.rewritten).join("\n");
  if(!next.dirty.skills){
    next.drafts.skills=generated.skills.supported.map(x=>"• "+x).join("\n");
  }
  return next;
}

export function applyHeadlineAlternative(state,id){
  if(!state.generated)throw new Error("Generate profile suggestions first.");
  const found=state.generated.headlines.find(item=>item.id===id);
  if(!found)throw new Error("Headline alternative not found.");
  const next=cloneTask3State(state);
  next.drafts.headline=found.text;
  next.dirty.headline=true;
  return next;
}

export function updateDraft(state,section,value){
  if(!(section in state.drafts))throw new Error("Unsupported profile section.");
  const next=cloneTask3State(state);
  next.drafts[section]=String(value??"");
  next.dirty[section]=true;
  return next;
}

export function resetDraftToGenerated(state,section){
  if(!state.generated)throw new Error("Generate profile suggestions first.");
  const next=cloneTask3State(state);
  if(section==="headline")next.drafts.headline=state.generated.headlines[0]?.text||"";
  else if(section==="about")next.drafts.about=state.generated.about.text||"";
  else if(section==="experience")next.drafts.experience=state.generated.experience.map(x=>"• "+x.rewritten).join("\n");
  else if(section==="skills")next.drafts.skills=state.generated.skills.supported.map(x=>"• "+x).join("\n");
  else throw new Error("Unsupported profile section.");
  next.dirty[section]=false;
  return next;
}
