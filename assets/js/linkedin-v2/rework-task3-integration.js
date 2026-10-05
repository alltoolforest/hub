import { PROFILE_MODE } from "./contracts.js";
import { STARTER_STATE,STARTER_SECTION } from "./rework-task2-starter-pack.js";
import { generateOptimization,HEADLINE_MAX } from "./task2-optimizer.js";
import { reviewProfile } from "./task2-review.js";

function clean(value){
  return String(value||"").trim().replace(/\s+/g," ");
}
function unique(values){
  const seen=new Set();
  return values.map(clean).filter(Boolean).filter(value=>{
    const normalized=value.toLowerCase();
    if(seen.has(normalized))return false;
    seen.add(normalized);
    return true;
  });
}
function lines(value){
  return String(value||"").split("\n").map(clean).filter(Boolean);
}
function eligible(item){
  return Boolean(
    item&&
    (item.state===STARTER_STATE.CONFIRMED||item.state===STARTER_STATE.USER_ENTERED)&&
    clean(item.text)&&
    !item.requiresEdit&&
    !item.text.includes("___")&&
    !/^Add /i.test(item.text)
  );
}
function sectionItems(pack,section){
  return (pack?.sections?.[section]||[]).filter(eligible);
}
function joinLines(existing,added){
  return unique([...lines(existing),...added.map(item=>item.text)]).join("\n");
}
function safeHeadlineFacts(pack){
  return sectionItems(pack,STARTER_SECTION.HEADLINE)
    .filter(item=>item.kind!=="prompt")
    .map(item=>item.text);
}
function aboutGuidance(pack){
  return sectionItems(pack,STARTER_SECTION.ABOUT).map(item=>item.text);
}
function clampHeadline(text){
  const value=clean(text);
  if(value.length<=HEADLINE_MAX)return value;
  const cut=value.slice(0,HEADLINE_MAX+1);
  const boundary=cut.lastIndexOf(" ");
  return (boundary>140?cut.slice(0,boundary):cut.slice(0,HEADLINE_MAX)).trim();
}
function headlineAlternatives(state,safeInput,baseGenerated){
  const target=clean(safeInput.targetRole);
  const facts=unique(safeHeadlineFacts(state.starterPack).filter(text=>text.toLowerCase()!==target.toLowerCase()));
  const skills=unique(lines(safeInput.skillsText));
  const achievement=lines(safeInput.achievementsText)[0]||"";
  if(!facts.length&&!skills.length)return baseGenerated.headlines;

  const balanced=clampHeadline(unique([target,...facts.slice(0,2),...skills.slice(0,2)]).join(" | "));
  const concise=clampHeadline(unique([target,facts[0]||skills[0],skills[1]]).join(" | "));
  const evidence=clampHeadline(unique([target,...skills.slice(0,3),achievement]).join(" | "));

  return Object.freeze([
    Object.freeze({id:"balanced",label:"Professional / balanced",text:balanced||baseGenerated.headlines[0]?.text||target}),
    Object.freeze({id:"concise",label:"Concise",text:concise||baseGenerated.headlines[1]?.text||target}),
    Object.freeze({id:"evidence",label:"Evidence / keyword focused",text:evidence||baseGenerated.headlines[2]?.text||balanced||target}),
  ]);
}

export function buildConfirmedOptimizationInput(state){
  const input=state?.input||{};
  const pack=state?.starterPack||null;

  const experience=sectionItems(pack,STARTER_SECTION.EXPERIENCE)
    .filter(item=>item.kind==="claim_candidate"||item.kind==="user_fact");
  const skills=sectionItems(pack,STARTER_SECTION.SKILLS)
    .filter(item=>item.kind==="claim_candidate"||item.kind==="user_fact");
  const achievements=sectionItems(pack,STARTER_SECTION.ACHIEVEMENTS)
    .filter(item=>item.kind==="evidence_prompt"||item.kind==="user_fact");
  const focus=sectionItems(pack,STARTER_SECTION.PROFESSIONAL_FOCUS);
  const headline=sectionItems(pack,STARTER_SECTION.HEADLINE);
  const about=sectionItems(pack,STARTER_SECTION.ABOUT);

  const safeInput=Object.freeze({
    mode:input.mode,
    targetRole:clean(state?.roleSelection?.title||input.targetRole),
    currentRole:clean(input.currentRole)||(input.mode===PROFILE_MODE.EXPERIENCED?"professional":""),
    industry:clean(input.industry),
    currentHeadline:String(input.currentHeadline||""),
    currentAbout:String(input.currentAbout||""),
    experienceText:joinLines(input.experienceText,experience),
    skillsText:joinLines(input.skillsText,skills),
    achievementsText:joinLines(input.achievementsText,achievements),
    professionalGoal:unique([clean(input.professionalGoal),...focus.map(item=>item.text)]).join(" "),
    resumeText:String(input.resumeText||""),
  });

  const included=Object.freeze({
    headline:Object.freeze(headline.map(item=>item.id)),
    about:Object.freeze(about.map(item=>item.id)),
    experience:Object.freeze(experience.map(item=>item.id)),
    skills:Object.freeze(skills.map(item=>item.id)),
    achievements:Object.freeze(achievements.map(item=>item.id)),
    professionalFocus:Object.freeze(focus.map(item=>item.id)),
  });
  const suggestedExcluded=Object.freeze(Object.fromEntries(
    Object.entries(pack?.sections||{}).map(([section,items])=>[
      section,
      Object.freeze(items.filter(item=>item.state===STARTER_STATE.SUGGESTED).map(item=>item.id))
    ])
  ));

  return Object.freeze({
    safeInput,
    evidenceAudit:Object.freeze({
      included,
      suggestedExcluded,
      aboutGuidance:Object.freeze(aboutGuidance(pack)),
      existingProfileUsed:Boolean(
        clean(input.currentHeadline)||clean(input.currentAbout)||clean(input.experienceText)||clean(input.skillsText)
      ),
      resumeUsed:Boolean(clean(input.resumeText)),
    }),
  });
}

export function generateReworkedOptimization(state){
  const {safeInput,evidenceAudit}=buildConfirmedOptimizationInput(state);
  const base=generateOptimization(safeInput);
  const generated=Object.freeze({
    ...base,
    headlines:headlineAlternatives(state,safeInput,base),
  });
  const review=reviewProfile(base.foundation);
  return Object.freeze({generated,review,safeInput,evidenceAudit});
}

export function factualOutputText(result){
  const generated=result?.generated||result;
  return [
    ...(generated?.headlines||[]).map(item=>item.text),
    generated?.about?.text||"",
    ...(generated?.experience||[]).map(item=>item.rewritten),
    ...(generated?.skills?.supported||[]),
  ].join("\n");
}
