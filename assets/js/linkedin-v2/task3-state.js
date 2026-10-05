import { PROFILE_MODE } from "./contracts.js";
import { generateOptimization } from "./task2-optimizer.js";
import { reviewProfile } from "./task2-review.js";

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
    generated:state.generated,
    review:state.review,
    drafts:{...state.drafts},
    dirty:{...state.dirty},
  };
}

export function updateInput(state,field,value){
  if(!(field in state.input))throw new Error("Unsupported profile field.");
  const next=cloneTask3State(state);
  next.input[field]=String(value??"");
  return next;
}

export function generateProfileSections(state){
  const next=cloneTask3State(state);
  const generated=generateOptimization(next.input);
  const review=reviewProfile(generated.foundation);
  next.generated=generated;
  next.review=review;

  if(!next.dirty.headline)next.drafts.headline=generated.headlines[0]?.text||"";
  if(!next.dirty.about)next.drafts.about=generated.about.text||"";
  if(!next.dirty.experience)next.drafts.experience=generated.experience.map(x=>"• "+x.rewritten).join("\n");
  if(!next.dirty.skills){
    next.drafts.skills=[
      ...generated.skills.supported.map(x=>"• "+x),
      ...(generated.skills.suggestedToReview.length
        ? ["","Suggested to review (verify before adding):",...generated.skills.suggestedToReview.map(x=>"• "+x)]
        : [])
    ].join("\n");
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
  else if(section==="skills")next.drafts.skills=[
    ...state.generated.skills.supported.map(x=>"• "+x),
    ...(state.generated.skills.suggestedToReview.length?["","Suggested to review (verify before adding):",...state.generated.skills.suggestedToReview.map(x=>"• "+x)]:[])
  ].join("\n");
  else throw new Error("Unsupported profile section.");
  next.dirty[section]=false;
  return next;
}
