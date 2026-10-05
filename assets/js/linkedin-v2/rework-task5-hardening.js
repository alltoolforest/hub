import { PROFILE_MODE } from "./contracts.js";
import { createTask3State,selectTargetRole,generateProfileSections } from "./task3-state.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import {
  STARTER_SECTION,createRoleStarterPack,setStarterItemConfirmed,addUserStarterItem
} from "./rework-task2-starter-pack.js";
import { createLinkedInDraftStore } from "./task3-storage.js";

export const REWORK_PERFORMANCE_BUDGET_MS=200;

function repeated(prefix,count){
  return Array.from({length:count},(_,index)=>prefix+" "+(index+1)).join("\n");
}

export function buildMaximumGuidedFlowState(){
  let state=createTask3State({
    mode:PROFILE_MODE.EXPERIENCED,
    currentRole:"Operations Analyst",
    industry:"Business Services",
    currentHeadline:"Operations Analyst | Excel | SQL | Reporting",
    currentAbout:("Operations professional working with reporting, process review, customer data and documentation. ").repeat(40).slice(0,3500),
    experienceText:repeated("Prepared reports and reviewed operational records",120).slice(0,18000),
    skillsText:repeated("Verified skill",100).slice(0,6000),
    achievementsText:repeated("Verified achievement evidence",60).slice(0,7000),
    professionalGoal:"Move into data analysis using verified reporting and analytical experience.",
    resumeText:repeated("Resume evidence describing reporting, Excel, SQL, documentation and operations",220).slice(0,28000),
  });

  const role=createLinkedInRoleRecord("Data Analyst");
  state=selectTargetRole(state,role);
  state={...state,starterPack:createRoleStarterPack(role,state.input.mode,{currentRole:state.input.currentRole})};

  for(const section of [STARTER_SECTION.HEADLINE,STARTER_SECTION.EXPERIENCE,STARTER_SECTION.SKILLS,STARTER_SECTION.PROFESSIONAL_FOCUS]){
    const confirmable=(state.starterPack.sections[section]||[]).filter(item=>!item.requiresEdit).slice(0,5);
    for(const item of confirmable){
      state={...state,starterPack:setStarterItemConfirmed(state.starterPack,section,item.id,true)};
    }
  }

  for(const [section,text] of [
    [STARTER_SECTION.SKILLS,"Excel"],
    [STARTER_SECTION.SKILLS,"SQL"],
    [STARTER_SECTION.EXPERIENCE,"Prepared weekly operational reports"],
    [STARTER_SECTION.ACHIEVEMENTS,"Reduced repeat reporting errors by 12%"],
    [STARTER_SECTION.PROFESSIONAL_FOCUS,"Seeking Data Analyst opportunities aligned with verified reporting experience"],
  ]){
    state={...state,starterPack:addUserStarterItem(state.starterPack,section,text)};
  }
  return state;
}

export function inspectGuidedFlowPerformance(storage,now=()=>globalThis.performance?.now?.()??Date.now()){
  let state=buildMaximumGuidedFlowState();
  const start=now();
  for(let index=0;index<10;index++)state=generateProfileSections(state);
  const store=createLinkedInDraftStore(storage);
  const save=store.save(state);
  const load=store.load();
  const elapsed=Math.max(0,now()-start);
  return Object.freeze({
    pass:Boolean(save.ok&&load.ok&&load.state&&state.generated&&elapsed<=REWORK_PERFORMANCE_BUDGET_MS),
    elapsedMs:elapsed,
    budgetMs:REWORK_PERFORMANCE_BUDGET_MS,
    repeatedOptimizations:10,
    saved:Boolean(save.ok),
    restored:Boolean(load.ok&&load.state),
  });
}
