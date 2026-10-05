import { PROFILE_MODE } from "./contracts.js";
import { createTask3State,selectTargetRole,generateProfileSections,updateDraft } from "./task3-state.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import {
  STARTER_SECTION,STARTER_STATE,createRoleStarterPack,
  setStarterItemConfirmed,addUserStarterItem,refreshRoleStarterPack
} from "./rework-task2-starter-pack.js";
import {
  buildConfirmedOptimizationInput,generateReworkedOptimization,factualOutputText
} from "./rework-task3-integration.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function withRole(mode,title,currentRole=""){
  let state=createTask3State({mode,currentRole});
  const role=createLinkedInRoleRecord(title);
  state=selectTargetRole(state,role);
  state={...state,starterPack:createRoleStarterPack(role,mode,{currentRole})};
  return state;
}
function addFact(state,section,text){
  return {...state,starterPack:addUserStarterItem(state.starterPack,section,text)};
}
function confirmFirst(state,section,predicate=()=>true){
  const item=(state.starterPack.sections[section]||[]).find(entry=>!entry.requiresEdit&&predicate(entry));
  if(!item)throw new Error("No confirmable item in "+section);
  return {...state,starterPack:setStarterItemConfirmed(state.starterPack,section,item.id,true)};
}

export function runLinkedInReworkTask3Regression(){
  let experienced=withRole(PROFILE_MODE.EXPERIENCED,"Fraud Analyst","Customer Support Executive");
  experienced=addFact(experienced,STARTER_SECTION.SKILLS,"Excel");
  experienced=addFact(experienced,STARTER_SECTION.EXPERIENCE,"Handled customer disputes");
  experienced=addFact(experienced,STARTER_SECTION.ACHIEVEMENTS,"Reduced repeat contacts by 12%");
  experienced=addFact(experienced,STARTER_SECTION.PROFESSIONAL_FOCUS,"Move into fraud operations using verified dispute-handling experience.");
  experienced=confirmFirst(experienced,STARTER_SECTION.HEADLINE,item=>/Fraud Analyst/i.test(item.text));

  const expResult=generateReworkedOptimization(experienced);
  const expFacts=factualOutputText(expResult);
  assert(/Fraud Analyst/.test(expFacts),"Target role should appear as positioning intent.");
  assert(/Excel/.test(expFacts),"User-entered skill should reach factual output.");
  assert(/customer disputes/i.test(expFacts),"User-entered experience should reach factual output.");
  assert(/12%/.test(expFacts),"User-entered verified metric should reach factual output.");
  assert(!/KYC review/i.test(expFacts),"Unconfirmed role skill must not leak into factual output.");
  assert(!/Transaction monitoring/i.test(expFacts),"Unconfirmed role suggestion must not leak into factual output.");

  const audit=buildConfirmedOptimizationInput(experienced);
  assert(audit.evidenceAudit.suggestedExcluded.skills.length>0,"Unconfirmed skill suggestions should be explicitly excluded.");
  assert(audit.evidenceAudit.included.skills.length===1,"Only the user-entered Excel skill should be included.");

  let fresher=withRole(PROFILE_MODE.FRESHER,"Data Analyst");
  fresher=addFact(fresher,STARTER_SECTION.SKILLS,"Excel");
  fresher=addFact(fresher,STARTER_SECTION.SKILLS,"SQL");
  fresher=addFact(fresher,STARTER_SECTION.ACHIEVEMENTS,"Built a college sales dashboard project");
  fresher=addFact(fresher,STARTER_SECTION.PROFESSIONAL_FOCUS,"Start a data analyst career.");
  const fresherResult=generateReworkedOptimization(fresher);
  assert(/building my career toward Data Analyst/i.test(fresherResult.generated.about.text),"Fresher output must keep fresher positioning.");
  assert(!/years of experience/i.test(factualOutputText(fresherResult)),"Fresher output must not invent professional tenure.");

  let changer=withRole(PROFILE_MODE.CAREER_CHANGER,"SAP Basis Administrator","Customer Support Executive");
  changer=addFact(changer,STARTER_SECTION.SKILLS,"Customer Service");
  changer=addFact(changer,STARTER_SECTION.EXPERIENCE,"Handled support tickets");
  changer=addFact(changer,STARTER_SECTION.PROFESSIONAL_FOCUS,"Transition to SAP Basis.");
  const changerResult=generateReworkedOptimization(changer);
  const changerFacts=factualOutputText(changerResult);
  assert(/transitioning toward SAP Basis Administrator/i.test(changerResult.generated.about.text),"Career changer positioning must remain distinct.");
  assert(!/SAP FICO/i.test(changerFacts),"Career changer must not gain unrelated SAP FICO claims.");
  assert(!/Transport management/i.test(changerFacts),"Unconfirmed SAP Basis skill must not become a factual claim.");

  let existing=withRole(PROFILE_MODE.EXPERIENCED,"Data Analyst");
  existing={...existing,input:{...existing.input,
    currentHeadline:"Operations Analyst | Excel",
    currentAbout:"Operations professional working with reporting and customer data.",
    experienceText:"Prepared weekly reports",
    skillsText:"Excel",
    achievementsText:"",
    resumeText:"Operations Analyst\nPrepared reports using Excel."
  }};
  const existingResult=generateReworkedOptimization(existing);
  assert(existingResult.evidenceAudit.existingProfileUsed,"Existing LinkedIn profile content should remain an optional evidence source.");
  assert(existingResult.evidenceAudit.resumeUsed,"Optional resume text should remain an evidence source.");
  assert(/Prepared weekly reports/i.test(existingResult.safeInput.experienceText),"Existing experience should be preserved.");

  let unsupported=withRole(PROFILE_MODE.EXPERIENCED,"Data Analyst");
  const unconfirmed=(unsupported.starterPack.sections.skills||[]).find(item=>item.state===STARTER_STATE.SUGGESTED);
  assert(Boolean(unconfirmed),"Role skill should start Suggested.");
  unsupported=addFact(unsupported,STARTER_SECTION.SKILLS,"Excel");
  const unsupportedFacts=factualOutputText(generateReworkedOptimization(unsupported)).toLowerCase();
  assert(unsupportedFacts.includes("excel"),"User-entered skill should appear.");
  assert(!unsupportedFacts.includes(unconfirmed.text.toLowerCase()),"Unconfirmed role skill must stay out of factual outputs.");

  let noMetric=withRole(PROFILE_MODE.EXPERIENCED,"Customer Support Executive");
  noMetric=addFact(noMetric,STARTER_SECTION.EXPERIENCE,"Handled customer enquiries");
  const noMetricText=factualOutputText(generateReworkedOptimization(noMetric));
  assert(!/\b\d+(?:\.\d+)?%\b/.test(noMetricText),"No-metric input must not create percentage metrics.");

  let changed=withRole(PROFILE_MODE.EXPERIENCED,"Fraud Analyst");
  changed=confirmFirst(changed,STARTER_SECTION.SKILLS);
  const oldConfirmed=changed.starterPack.sections.skills.find(item=>item.state===STARTER_STATE.CONFIRMED);
  changed=addFact(changed,STARTER_SECTION.SKILLS,"Excel");
  const newRole=createLinkedInRoleRecord("Data Analyst");
  changed=selectTargetRole(changed,newRole);
  changed={...changed,starterPack:refreshRoleStarterPack(changed.starterPack,newRole,changed.input.mode)};
  const changedResult=generateReworkedOptimization(changed);
  assert(changed.starterPack.sections.skills.some(item=>item.id===oldConfirmed.id&&item.staleForTarget),"Old confirmed fact should be preserved but flagged after target change.");
  assert(changedResult.safeInput.skillsText.includes(oldConfirmed.text),"A previously confirmed true skill remains usable after a target change.");
  assert(changedResult.safeInput.skillsText.includes("Excel"),"User-entered facts remain usable after target change.");

  let integration=withRole(PROFILE_MODE.EXPERIENCED,"Fraud Analyst");
  integration=addFact(integration,STARTER_SECTION.SKILLS,"Excel");
  integration=addFact(integration,STARTER_SECTION.EXPERIENCE,"Handled customer disputes");
  integration=generateProfileSections(integration);
  assert(integration.optimizationEvidence?.included?.skills?.length===1,"State-level Review & Optimize should use confirmed evidence integration.");
  assert(/Excel/.test(integration.drafts.headline+integration.drafts.about+integration.drafts.skills),"Generated drafts should use safe starter evidence.");

  const manual=updateDraft(integration,"about","My manually edited final About.");
  const regenerated=generateProfileSections(manual);
  assert(regenerated.drafts.about==="My manually edited final About.","Manual final edits must survive re-optimization.");

  return Object.freeze({
    pass:true,
    experiencedFromScratch:true,
    blankFresher:true,
    careerChanger:true,
    existingProfileOptional:true,
    resumeOptional:true,
    unconfirmedSuggestionsExcluded:true,
    confirmedAndUserEnteredIntegrated:true,
    noInventedMetrics:true,
    roleChangePreservesTrueFacts:true,
    stateReviewOptimizeIntegration:true,
    manualEditsPreserved:true,
  });
}
