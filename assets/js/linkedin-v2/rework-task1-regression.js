import { PROFILE_MODE } from "./contracts.js";
import { createTask3State,selectTargetRole,updateInput } from "./task3-state.js";
import {
  createLinkedInRoleRecord,
  searchLinkedInTargetRoles,
  getLinkedInRoleCatalogStats,
  isCatalogRole
} from "./rework-task1-role-adapter.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function firstTitle(query){
  return searchLinkedInTargetRoles(query,8)[0]?.title||"";
}

export function runLinkedInReworkTask1Regression(){
  const stats=getLinkedInRoleCatalogStats();
  assert(stats.titles>=300,"Role catalog coverage unexpectedly shrank.");
  assert(stats.categories>=30,"Role category coverage unexpectedly shrank.");

  const cases=[
    ["fra","Fraud Analyst"],
    ["data ana","Data Analyst"],
    ["sap bas","SAP Basis Administrator"],
    ["customer sup","Customer Support Executive"],
    ["nurs","Nurse Practitioner"],
    ["account","Accountant"],
    ["mechanical","Mechanical Engineer"],
    ["hr exec","HR Executive"],
    ["digital mark","Digital Marketing Executive"],
    ["teacher","Teacher"],
    ["electric","Electrician"],
    ["warehouse","Warehouse Supervisor"],
    ["cyber","Cybersecurity Analyst"],
    ["sales","Sales Executive"],
    ["hotel front","Hotel Manager"],
  ];
  for(const [query,expected] of cases){
    assert(firstTitle(query)===expected,"Unexpected top role for "+query+": "+firstTitle(query));
  }

  assert(searchLinkedInTargetRoles("FRA",8)[0]?.title==="Fraud Analyst","Role search should be case-insensitive.");
  assert(searchLinkedInTargetRoles("zzzzunknown",8).length===0,"Unknown role query should fail gracefully.");
  assert(searchLinkedInTargetRoles("f",8).length===0,"One-character query should not open noisy suggestions.");

  const fraud=createLinkedInRoleRecord("Fraud Analyst");
  assert(isCatalogRole(fraud),"Fraud Analyst should resolve to a catalog role.");
  assert(fraud.family==="financial-crime-compliance","Fraud Analyst family is incorrect.");
  assert(fraud.category==="Banking / Compliance","Fraud Analyst category is incorrect.");
  assert(fraud.commonSkills.length>0,"Canonical role should expose common skills for later tasks.");
  assert(fraud.commonResponsibilities.length>0,"Canonical role should expose common responsibilities for later tasks.");
  assert(fraud.provenance==="resume-studio-role-engine","Role provenance must identify the read-only Resume Studio engine.");
  assert(fraud.relatedTitles.some(title=>/Financial Crime Analyst|AML Analyst|KYC Analyst/.test(title)),"Related role titles should stay within the role family.");

  const custom=createLinkedInRoleRecord("Underwater Basket Specialist");
  assert(custom.confidence==="fallback","Unknown custom role should remain a safe fallback.");
  assert(custom.commonSkills.length===0&&custom.commonResponsibilities.length===0,"Fallback role must not invent catalog suggestions.");

  let state=createTask3State({mode:PROFILE_MODE.CAREER_CHANGER});
  state=selectTargetRole(state,fraud);
  assert(state.input.targetRole==="Fraud Analyst","Selected role title should populate targetRole.");
  assert(state.roleSelection?.id===fraud.id,"Canonical selected role should persist in working state.");
  assert(state.input.mode===PROFILE_MODE.CAREER_CHANGER,"Profile mode must remain intact.");

  state=updateInput(state,"industry","Banking");
  assert(state.roleSelection?.id===fraud.id,"Unrelated field changes must not clear selected role.");

  state=updateInput(state,"targetRole","Fraud Investigator");
  assert(state.roleSelection===null,"Manual target-role changes must clear stale canonical selection.");

  return Object.freeze({
    pass:true,
    catalogTitles:stats.titles,
    catalogCategories:stats.categories,
    representativeRoleQueries:cases.length,
    caseInsensitive:true,
    noResultSafe:true,
    twoCharacterThreshold:true,
    canonicalRoleRecord:true,
    readOnlyResumeStudioProvenance:true,
    customRoleFallback:true,
    profileModePreserved:true,
    workingSelectionPersistence:true,
    staleSelectionGuard:true,
  });
}
