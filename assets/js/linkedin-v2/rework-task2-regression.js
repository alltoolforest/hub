import { PROFILE_MODE } from "./contracts.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import {
  STARTER_STATE,STARTER_SECTION,
  createRoleStarterPack,editStarterItem,setStarterItemConfirmed,
  addUserStarterItem,removeStarterItem,refreshRoleStarterPack,
  canConfirmStarterItem,starterPackCounts
} from "./rework-task2-starter-pack.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function section(pack,name){return pack.sections[name]||[]}

export function runLinkedInReworkTask2Regression(){
  const fraud=createLinkedInRoleRecord("Fraud Analyst");
  let pack=createRoleStarterPack(fraud,PROFILE_MODE.EXPERIENCED,{currentRole:"Customer Support Executive"});

  for(const name of [
    STARTER_SECTION.HEADLINE,STARTER_SECTION.ABOUT,STARTER_SECTION.EXPERIENCE,
    STARTER_SECTION.SKILLS,STARTER_SECTION.ACHIEVEMENTS,STARTER_SECTION.PROFESSIONAL_FOCUS
  ]){
    const count=section(pack,name).filter(item=>item.group!=="transferable_current_role").length;
    assert(count>=5&&count<=8,name+" should provide 5-8 main starter options, got "+count);
  }

  assert(section(pack,STARTER_SECTION.SKILLS).every(item=>item.state===STARTER_STATE.SUGGESTED),"Role skills must begin as Suggested.");
  assert(section(pack,STARTER_SECTION.EXPERIENCE).every(item=>item.state===STARTER_STATE.SUGGESTED),"Role responsibilities must begin as Suggested.");
  assert(section(pack,STARTER_SECTION.SKILLS).some(item=>/KYC|AML|Transaction monitoring|Risk assessment/i.test(item.text)),"Fraud starter pack should contain relevant role skills.");

  const skill=section(pack,STARTER_SECTION.SKILLS).find(item=>!item.requiresEdit);
  pack=setStarterItemConfirmed(pack,STARTER_SECTION.SKILLS,skill.id,true);
  assert(section(pack,STARTER_SECTION.SKILLS).find(item=>item.id===skill.id).state===STARTER_STATE.CONFIRMED,"Explicit selection should move Suggested to Confirmed.");
  pack=setStarterItemConfirmed(pack,STARTER_SECTION.SKILLS,skill.id,false);
  assert(section(pack,STARTER_SECTION.SKILLS).find(item=>item.id===skill.id).state===STARTER_STATE.SUGGESTED,"Deselection should return Confirmed to Suggested.");

  pack=addUserStarterItem(pack,STARTER_SECTION.SKILLS,"Dispute Resolution");
  const userSkill=section(pack,STARTER_SECTION.SKILLS).find(item=>item.state===STARTER_STATE.USER_ENTERED);
  assert(userSkill?.text==="Dispute Resolution","Manual skill should be User-entered.");
  assert(userSkill.source==="user","Manual skill provenance should be user.");

  const achievement=section(pack,STARTER_SECTION.ACHIEVEMENTS)[0];
  assert(!canConfirmStarterItem(achievement),"Blank achievement prompt must not be confirmable.");
  let blocked=false;
  try{setStarterItemConfirmed(pack,STARTER_SECTION.ACHIEVEMENTS,achievement.id,true)}catch{blocked=true}
  assert(blocked,"Achievement prompt with blanks must reject confirmation.");
  pack=editStarterItem(pack,STARTER_SECTION.ACHIEVEMENTS,achievement.id,"Reduced repeat contacts by 12%");
  const editedAchievement=section(pack,STARTER_SECTION.ACHIEVEMENTS).find(item=>item.id===achievement.id);
  assert(canConfirmStarterItem(editedAchievement),"Completed evidence statement should become confirmable.");
  pack=setStarterItemConfirmed(pack,STARTER_SECTION.ACHIEVEMENTS,achievement.id,true);
  assert(section(pack,STARTER_SECTION.ACHIEVEMENTS).find(item=>item.id===achievement.id).state===STARTER_STATE.CONFIRMED,"Edited evidence should confirm.");

  pack=addUserStarterItem(pack,STARTER_SECTION.ABOUT,"I work with customer disputes.");
  const userAbout=section(pack,STARTER_SECTION.ABOUT).find(item=>item.state===STARTER_STATE.USER_ENTERED);
  pack=removeStarterItem(pack,STARTER_SECTION.ABOUT,userAbout.id);
  assert(!section(pack,STARTER_SECTION.ABOUT).some(item=>item.id===userAbout.id),"User-entered item should be removable.");

  let preserved=createRoleStarterPack(fraud,PROFILE_MODE.EXPERIENCED);
  const confirmedFraud=section(preserved,STARTER_SECTION.SKILLS).find(item=>!item.requiresEdit);
  preserved=setStarterItemConfirmed(preserved,STARTER_SECTION.SKILLS,confirmedFraud.id,true);
  preserved=addUserStarterItem(preserved,STARTER_SECTION.SKILLS,"Excel");
  const data=createLinkedInRoleRecord("Data Analyst");
  const refreshed=refreshRoleStarterPack(preserved,data,PROFILE_MODE.EXPERIENCED);
  const preservedConfirmed=section(refreshed,STARTER_SECTION.SKILLS).find(item=>item.id===confirmedFraud.id);
  assert(preservedConfirmed?.state===STARTER_STATE.CONFIRMED,"Role change must preserve confirmed information.");
  assert(preservedConfirmed.staleForTarget===true,"Confirmed information from the old target should be marked for review, not silently deleted.");
  assert(section(refreshed,STARTER_SECTION.SKILLS).some(item=>item.state===STARTER_STATE.USER_ENTERED&&item.text==="Excel"),"Role change must preserve user-entered information.");
  assert(section(refreshed,STARTER_SECTION.SKILLS).some(item=>item.state===STARTER_STATE.SUGGESTED&&/SQL|Data analysis|Data visualization/i.test(item.text)),"Role change should refresh unconfirmed suggestions for the new role.");

  const changer=createRoleStarterPack(
    createLinkedInRoleRecord("SAP Basis Administrator"),
    PROFILE_MODE.CAREER_CHANGER,
    {currentRole:"Customer Support Executive"}
  );
  const transfer=section(changer,STARTER_SECTION.EXPERIENCE).filter(item=>item.group==="transferable_current_role");
  const target=section(changer,STARTER_SECTION.EXPERIENCE).filter(item=>item.group==="target_role");
  assert(target.length>=5,"Career changer should still receive target-role responsibility ideas.");
  assert(transfer.length>0,"Career changer with a recognized current role should receive separate transferable responsibility ideas.");
  assert(transfer.every(item=>item.source==="current_role"),"Transferable ideas must preserve current-role provenance.");
  assert(!section(changer,STARTER_SECTION.SKILLS).some(item=>/SAP FICO/i.test(item.text)),"SAP Basis target skills must not be replaced by SAP FICO.");

  const fresher=createRoleStarterPack(createLinkedInRoleRecord("Data Analyst"),PROFILE_MODE.FRESHER);
  assert(section(fresher,STARTER_SECTION.ABOUT).some(item=>/projects, education or practical evidence/i.test(item.text)),"Fresher About prompts should avoid implied employment history.");

  const cyber=createRoleStarterPack(createLinkedInRoleRecord("Cybersecurity Analyst"),PROFILE_MODE.CAREER_CHANGER,{currentRole:"IT Support Engineer"});
  assert(section(cyber,STARTER_SECTION.SKILLS).every(item=>item.state===STARTER_STATE.SUGGESTED),"Cybersecurity target skills must stay Suggested until confirmed.");

  const custom=createRoleStarterPack(createLinkedInRoleRecord("Underwater Basket Specialist"),PROFILE_MODE.EXPERIENCED);
  assert(section(custom,STARTER_SECTION.SKILLS).every(item=>item.kind==="prompt"&&item.requiresEdit),"Unknown-role skills must be editable prompts, not fabricated skills.");
  assert(section(custom,STARTER_SECTION.EXPERIENCE).every(item=>item.kind==="prompt"&&item.requiresEdit),"Unknown-role responsibilities must be editable prompts, not fabricated duties.");

  const achievements=section(fraud?createRoleStarterPack(fraud,PROFILE_MODE.EXPERIENCED):pack,STARTER_SECTION.ACHIEVEMENTS);
  assert(achievements.every(item=>!/[0-9]+%/.test(item.text)),"Achievement prompts must not fabricate percentage metrics.");

  const counts=starterPackCounts(refreshed);
  assert(counts.skills.confirmed>=1&&counts.skills.userEntered>=1,"Starter pack counts should preserve evidence-state distinctions.");

  return Object.freeze({
    pass:true,
    starterSections:6,
    fiveToEightOptions:true,
    suggestedDefault:true,
    confirmDeselect:true,
    userEntered:true,
    achievementTruthGuard:true,
    editDelete:true,
    roleChangePreservation:true,
    staleConfirmedReviewFlag:true,
    newRoleRefresh:true,
    careerChangerTransferables:true,
    fresherSafety:true,
    customRoleNoFabrication:true,
    noInventedMetrics:true,
    evidenceStateCounts:true,
  });
}
