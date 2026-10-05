import { PROFILE_MODE } from "./contracts.js";
import { buildProfileFoundation } from "./task1-foundation.js";

export const HEADLINE_MAX=220;
export const ABOUT_SOFT_MAX=2600;

export const GENERIC_PHRASES=Object.freeze([
  "hardworking","hard-working","team player","results driven","results-driven",
  "go getter","go-getter","passionate professional","dynamic professional"
]);

function clean(value){
  return String(value||"").replace(/\s+/g," ").trim().replace(/[|·]+$/,"").trim();
}
function unique(values){
  const seen=new Set();
  return values.map(clean).filter(Boolean).filter(value=>{
    const key=value.toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function sentence(value){
  const text=clean(value).replace(/^[•-]\s*/,"");
  if(!text)return "";
  return /[.!?]$/.test(text)?text:text+".";
}
function clamp(text,max){
  const value=clean(text);
  if(value.length<=max)return value;
  const sliced=value.slice(0,max+1);
  const boundary=sliced.lastIndexOf(" ");
  return (boundary>Math.floor(max*.65)?sliced.slice(0,boundary):sliced.slice(0,max)).trim();
}
function verifiedSkills(foundation){
  return unique(foundation.evidence.filter(item=>item.type==="skill").map(item=>item.value));
}
function achievements(foundation){
  return unique(foundation.evidence.filter(item=>item.type==="achievement").map(item=>item.value));
}
function experienceLines(profile){
  return unique(String(profile.experienceText||"").split(/\n+/).map(x=>x.replace(/^[•-]\s*/,"").trim()).filter(Boolean));
}
function modePositioning(profile){
  if(profile.mode===PROFILE_MODE.FRESHER)return "Aspiring "+profile.targetRole;
  if(profile.mode===PROFILE_MODE.CAREER_CHANGER)return profile.targetRole+" Career Transition";
  return profile.targetRole;
}
function makeHeadline(parts){
  return clamp(unique(parts).join(" | "),HEADLINE_MAX);
}

export function generateHeadlines(rawOrFoundation){
  const foundation=rawOrFoundation?.profile?rawOrFoundation:buildProfileFoundation(rawOrFoundation);
  const profile=foundation.profile;
  const skills=verifiedSkills(foundation);

  const balanced=makeHeadline([modePositioning(profile),...skills.slice(0,2),profile.industry]);
  const concise=makeHeadline([modePositioning(profile),skills[0]]);
  const evidenceFocused=makeHeadline([
    modePositioning(profile),
    ...skills.slice(0,3),
    achievements(foundation)[0]?clamp(achievements(foundation)[0],70):""
  ]);

  return Object.freeze([
    Object.freeze({id:"balanced",label:"Professional / balanced",text:balanced}),
    Object.freeze({id:"concise",label:"Concise",text:concise}),
    Object.freeze({id:"evidence",label:"Evidence / keyword focused",text:evidenceFocused||balanced}),
  ]);
}

export function generateAbout(rawOrFoundation,{variant="standard"}={}){
  const foundation=rawOrFoundation?.profile?rawOrFoundation:buildProfileFoundation(rawOrFoundation);
  const profile=foundation.profile;
  const skills=verifiedSkills(foundation);
  const proof=unique([...achievements(foundation),...experienceLines(profile)]);

  let opening;
  if(profile.mode===PROFILE_MODE.FRESHER){
    opening="I am building my career toward "+profile.targetRole+(profile.industry?" in "+profile.industry:"")+".";
  }else if(profile.mode===PROFILE_MODE.CAREER_CHANGER){
    opening="I am transitioning toward "+profile.targetRole+", building on my background as "+(profile.currentRole||"a professional in my current field")+".";
  }else{
    opening="I am a "+(profile.currentRole||profile.targetRole)+" focused on "+profile.targetRole+(profile.industry?" in "+profile.industry:"")+".";
  }

  const skillLine=skills.length?"My supported skills include "+skills.slice(0,6).join(", ")+".":"";
  const evidenceLines=proof.slice(0,variant==="concise"?1:3).map(sentence);
  const goal=profile.professionalGoal?sentence(profile.professionalGoal):"";
  const text=[opening,skillLine,...evidenceLines,goal].filter(Boolean).join(variant==="concise"?" ":"\n\n");

  return Object.freeze({
    variant,
    text:clamp(text,ABOUT_SOFT_MAX),
    usedVerifiedSkills:Object.freeze(skills.slice(0,6)),
    usedEvidence:Object.freeze(proof.slice(0,variant==="concise"?1:3)),
  });
}

const ACTION_START=/^(led|managed|built|created|delivered|resolved|supported|handled|reviewed|analyzed|developed|implemented|coordinated|improved|reduced|increased|maintained|processed|investigated|assisted|prepared|monitored|trained|worked)\b/i;

function strengthenLine(line){
  let text=clean(line).replace(/^[•-]\s*/,"");
  if(!text)return "";
  if(ACTION_START.test(text))return sentence(text);
  if(/^responsible for\s+/i.test(text))text=text.replace(/^responsible for\s+/i,"Handled ");
  else if(/^worked on\s+/i.test(text))text=text.replace(/^worked on\s+/i,"Supported ");
  else if(/^helped with\s+/i.test(text))text=text.replace(/^helped with\s+/i,"Supported ");
  else text="Handled "+text.charAt(0).toLowerCase()+text.slice(1);
  return sentence(text);
}

export function rewriteExperience(rawOrFoundation){
  const foundation=rawOrFoundation?.profile?rawOrFoundation:buildProfileFoundation(rawOrFoundation);
  return Object.freeze(experienceLines(foundation.profile).map((original,index)=>Object.freeze({
    index,
    original,
    rewritten:strengthenLine(original),
  })));
}

export function buildSkillsOutput(rawOrFoundation){
  const foundation=rawOrFoundation?.profile?rawOrFoundation:buildProfileFoundation(rawOrFoundation);
  const supported=verifiedSkills(foundation);
  const suggested=foundation.alignment.suggestedToReview.filter(term=>
    !supported.some(skill=>skill.toLowerCase()===String(term).toLowerCase())
  );
  return Object.freeze({
    supported:Object.freeze(supported),
    suggestedToReview:Object.freeze([...suggested]),
    disclaimer:"Suggested skills are target-role ideas to review. Add them only if they accurately describe your experience.",
  });
}

export function containsUnsupportedMetric(text,foundation){
  const used=[...String(text||"").matchAll(/\b\d+(?:\.\d+)?(?:%|\b)/g)].map(m=>m[0]);
  const known=new Set(foundation.evidence.filter(item=>item.type==="metric").map(item=>item.value));
  return used.some(metric=>!known.has(metric));
}

export function containsSuggestedAsClaim(text,foundation){
  const haystack=String(text||"").toLowerCase();
  const supported=new Set(verifiedSkills(foundation).map(x=>x.toLowerCase()));
  return foundation.alignment.suggestedToReview.some(term=>{
    const t=String(term).toLowerCase();
    return !supported.has(t)&&haystack.includes(t);
  });
}

export function generateOptimization(raw){
  const foundation=buildProfileFoundation(raw);
  return Object.freeze({
    foundation,
    headlines:generateHeadlines(foundation),
    about:generateAbout(foundation),
    aboutConcise:generateAbout(foundation,{variant:"concise"}),
    experience:rewriteExperience(foundation),
    skills:buildSkillsOutput(foundation),
  });
}
