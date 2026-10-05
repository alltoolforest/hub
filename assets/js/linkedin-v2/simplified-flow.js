import { PROFILE_MODE } from "./contracts.js";
import { STARTER_STATE,STARTER_SECTION } from "./rework-task2-starter-pack.js";

function active(item){
  return item&&item.state!==undefined&&!item.staleForTarget;
}
function confirmed(item){
  return item&&(item.state===STARTER_STATE.CONFIRMED||item.state===STARTER_STATE.USER_ENTERED);
}
function priority(item){
  if(item.state===STARTER_STATE.USER_ENTERED)return 0;
  if(item.state===STARTER_STATE.CONFIRMED)return 1;
  return 2;
}
function prioritize(items){
  return [...items].sort((a,b)=>priority(a)-priority(b));
}

export function getSimpleStarterOptions(pack,mode){
  const skillItems=prioritize((pack?.sections?.[STARTER_SECTION.SKILLS]||[])
    .filter(active))
    .slice(0,8);

  const allExperience=prioritize((pack?.sections?.[STARTER_SECTION.EXPERIENCE]||[]).filter(active));
  let experienceItems;
  if(mode===PROFILE_MODE.CAREER_CHANGER){
    const transferable=allExperience.filter(item=>item.group==="transferable_current_role").slice(0,3);
    const target=allExperience.filter(item=>item.group!=="transferable_current_role").slice(0,Math.max(0,6-transferable.length));
    experienceItems=[...transferable,...target];
  }else{
    experienceItems=allExperience.filter(item=>item.group!=="transferable_current_role").slice(0,6);
  }
  return Object.freeze({
    skills:Object.freeze(skillItems),
    experience:Object.freeze(experienceItems),
  });
}

export function simpleEvidenceCount(state){
  const pack=state?.starterPack;
  const skills=(pack?.sections?.[STARTER_SECTION.SKILLS]||[]).filter(confirmed).length;
  const experience=(pack?.sections?.[STARTER_SECTION.EXPERIENCE]||[]).filter(confirmed).length;
  const existing=Boolean(
    String(state?.input?.skillsText||"").trim()||
    String(state?.input?.experienceText||"").trim()||
    String(state?.input?.achievementsText||"").trim()||
    String(state?.input?.currentHeadline||"").trim()||
    String(state?.input?.currentAbout||"").trim()||
    String(state?.input?.resumeText||"").trim()
  );
  return Object.freeze({skills,experience,existing,total:skills+experience+(existing?1:0)});
}

export function validateSimpleBuild(state){
  if(!state?.roleSelection&&!String(state?.input?.targetRole||"").trim()){
    return Object.freeze({ok:false,message:"Choose a target role first."});
  }
  if(state?.input?.mode===PROFILE_MODE.CAREER_CHANGER&&!String(state?.input?.currentRole||"").trim()){
    return Object.freeze({ok:false,message:"Add your current role so the tool can separate transferable experience from target-role ideas."});
  }
  const evidence=simpleEvidenceCount(state);
  if(evidence.total<1){
    return Object.freeze({ok:false,message:"Select at least one skill or responsibility that is true about you, or add existing profile information."});
  }
  return Object.freeze({ok:true,message:"",evidence});
}
