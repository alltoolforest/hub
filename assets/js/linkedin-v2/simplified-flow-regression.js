import { PROFILE_MODE } from "./contracts.js";
import { createTask3State,selectTargetRole } from "./task3-state.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import { createRoleStarterPack,setStarterItemConfirmed,STARTER_SECTION } from "./rework-task2-starter-pack.js";
import { getSimpleStarterOptions,validateSimpleBuild } from "./simplified-flow.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function stateFor(mode,title,currentRole=""){
  let state=createTask3State({mode,currentRole});
  const role=createLinkedInRoleRecord(title);
  state=selectTargetRole(state,role);
  state={...state,starterPack:createRoleStarterPack(role,mode,{currentRole})};
  return state;
}
function confirmFirst(state,section){
  const item=state.starterPack.sections[section].find(entry=>!entry.requiresEdit);
  return {...state,starterPack:setStarterItemConfirmed(state.starterPack,section,item.id,true)};
}

export function runSimplifiedFlowRegression(){
  let experienced=stateFor(PROFILE_MODE.EXPERIENCED,"Fraud Analyst","Customer Support Executive");
  const options=getSimpleStarterOptions(experienced.starterPack,experienced.input.mode);
  assert(options.skills.length<=8&&options.skills.length>=5,"Primary skills should stay between 5 and 8.");
  assert(options.experience.length<=6&&options.experience.length>=5,"Primary responsibilities should stay between 5 and 6.");
  assert(!validateSimpleBuild(experienced).ok,"Build should require at least one truthful evidence item.");
  experienced=confirmFirst(experienced,STARTER_SECTION.SKILLS);
  assert(validateSimpleBuild(experienced).ok,"One confirmed skill should be enough to build.");

  const fresher=stateFor(PROFILE_MODE.FRESHER,"Data Analyst");
  assert(getSimpleStarterOptions(fresher.starterPack,fresher.input.mode).experience.length<=6,"Fresher primary responsibilities should stay compact.");

  let changer=stateFor(PROFILE_MODE.CAREER_CHANGER,"SAP Basis Administrator","");
  assert(!validateSimpleBuild(changer).ok&&/current role/i.test(validateSimpleBuild(changer).message),"Career changer should require current role.");
  changer=stateFor(PROFILE_MODE.CAREER_CHANGER,"SAP Basis Administrator","Customer Support Executive");
  const changerOptions=getSimpleStarterOptions(changer.starterPack,changer.input.mode);
  assert(changerOptions.experience.length<=6,"Career changer responsibilities should stay compact.");
  assert(changerOptions.experience.some(item=>item.group==="transferable_current_role"),"Career changer should surface transferable current-role ideas.");

  let existing=stateFor(PROFILE_MODE.EXPERIENCED,"Data Analyst");
  existing={...existing,input:{...existing.input,currentHeadline:"Operations Analyst | Excel"}};
  assert(validateSimpleBuild(existing).ok,"Existing profile evidence should allow build without chip selection.");

  return Object.freeze({
    pass:true,
    compactSkills:true,
    compactResponsibilities:true,
    truthfulSelectionGate:true,
    careerChangerCurrentRoleGate:true,
    transferableIdeas:true,
    existingProfileFallback:true,
  });
}
