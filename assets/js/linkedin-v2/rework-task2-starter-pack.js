import { PROFILE_MODE } from "./contracts.js";
import { createLinkedInRoleRecord,isCatalogRole } from "./rework-task1-role-adapter.js";

export const STARTER_STATE=Object.freeze({
  SUGGESTED:"suggested",
  CONFIRMED:"confirmed",
  USER_ENTERED:"user_entered",
});

export const STARTER_SECTION=Object.freeze({
  HEADLINE:"headline",
  ABOUT:"about",
  EXPERIENCE:"experience",
  SKILLS:"skills",
  ACHIEVEMENTS:"achievements",
  PROFESSIONAL_FOCUS:"professionalFocus",
});

const SECTION_KEYS=Object.freeze(Object.values(STARTER_SECTION));
const MIN_OPTIONS=5;
const MAX_OPTIONS=8;

function clean(value){
  return String(value||"").trim().replace(/\s+/g," ");
}

function key(value){
  return clean(value).toLowerCase();
}

function slug(value){
  return key(value).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
}

function unique(values){
  const seen=new Set();
  return values.filter(value=>{
    const normalized=key(value);
    if(!normalized||seen.has(normalized))return false;
    seen.add(normalized);
    return true;
  });
}

function itemId(section,text,index,sourceRoleId=""){
  return [section,sourceRoleId||"general",slug(text)||"item",index].join("--");
}

function makeItem(section,text,index,{
  kind="claim_candidate",
  source="target_role",
  sourceRoleId="",
  requiresEdit=false,
  group="main",
  state=STARTER_STATE.SUGGESTED,
  staleForTarget=false,
}={}){
  return Object.freeze({
    id:itemId(section,text,index,sourceRoleId),
    section,
    text:clean(text),
    state,
    kind,
    source,
    sourceRoleId,
    requiresEdit:Boolean(requiresEdit),
    group,
    staleForTarget:Boolean(staleForTarget),
  });
}

function roleFamilyRecords(roleRecord){
  if(!roleRecord||!isCatalogRole(roleRecord))return [];
  const records=[roleRecord];
  for(const title of roleRecord.relatedTitles||[]){
    const related=createLinkedInRoleRecord(title);
    if(related.family===roleRecord.family)records.push(related);
  }
  return records;
}

function roleSkills(roleRecord){
  const skills=[];
  for(const record of roleFamilyRecords(roleRecord))skills.push(...(record.commonSkills||[]));
  return unique(skills).slice(0,MAX_OPTIONS);
}

function roleResponsibilities(roleRecord){
  const responsibilities=[];
  for(const record of roleFamilyRecords(roleRecord))responsibilities.push(...(record.commonResponsibilities||[]));
  const direct=unique(responsibilities);
  const skills=roleSkills(roleRecord);
  for(const skill of skills){
    if(direct.length>=MAX_OPTIONS)break;
    direct.push("Applied "+skill+" in day-to-day work");
  }
  return unique(direct).slice(0,MAX_OPTIONS);
}

function genericEditablePrompts(roleTitle,noun){
  const role=clean(roleTitle)||"your target role";
  const values=[
    "Add a verified "+noun+" relevant to "+role,
    "Add a second verified "+noun+" relevant to "+role,
    "Add a role-specific "+noun+" you can support with evidence",
    "Add a "+noun+" that reflects your real tools, methods or responsibilities",
    "Add a "+noun+" that differentiates your background without exaggeration",
    "Add a "+noun+" connected to your industry or domain",
    "Add a "+noun+" that reflects a real outcome or contribution",
    "Add a final "+noun+" only if it accurately describes you",
  ];
  return values.slice(0,MAX_OPTIONS);
}

function headlineItems(roleRecord){
  const values=[
    roleRecord.title,
    ...(roleRecord.category&&roleRecord.category!=="General"?[roleRecord.category]:[]),
    ...roleSkills(roleRecord),
  ];
  const specific=unique(values).slice(0,MAX_OPTIONS);
  if(isCatalogRole(roleRecord)&&specific.length>=MIN_OPTIONS)return specific.map((text,index)=>makeItem(
    STARTER_SECTION.HEADLINE,text,index,{sourceRoleId:roleRecord.id}
  ));
  const fallback=unique([...specific,...genericEditablePrompts(roleRecord.title,"headline point")]).slice(0,MAX_OPTIONS);
  return fallback.map((text,index)=>makeItem(STARTER_SECTION.HEADLINE,text,index,{
    sourceRoleId:roleRecord.id,
    kind:index<specific.length?"claim_candidate":"prompt",
    requiresEdit:index>=specific.length,
  }));
}

function aboutItems(roleRecord,mode){
  const skills=roleSkills(roleRecord).slice(0,3);
  const modePrompt=mode===PROFILE_MODE.FRESHER
    ? "Explain why you are building toward "+roleRecord.title+" using projects, education or practical evidence"
    : mode===PROFILE_MODE.CAREER_CHANGER
      ? "Connect your existing background to "+roleRecord.title+" using only genuine transferable experience"
      : "Open with your current professional identity and explain how it connects to "+roleRecord.title;
  const values=[
    modePrompt,
    ...skills.map(skill=>"Include verified evidence related to "+skill),
    "Mention one role-relevant responsibility you have actually performed",
    "Add one measurable achievement only if you can verify it",
    "Mention your industry or domain experience when it is relevant",
    "Close with your professional direction toward "+roleRecord.title,
    "Remove generic claims and keep only evidence you can support",
  ];
  return unique(values).slice(0,MAX_OPTIONS).map((text,index)=>makeItem(STARTER_SECTION.ABOUT,text,index,{
    kind:"prompt",sourceRoleId:roleRecord.id,requiresEdit:false
  }));
}

function experienceItems(roleRecord){
  let values=roleResponsibilities(roleRecord);
  if(!isCatalogRole(roleRecord)||values.length<MIN_OPTIONS){
    values=unique([...values,...genericEditablePrompts(roleRecord.title,"responsibility")]).slice(0,MAX_OPTIONS);
  }
  return values.map((text,index)=>makeItem(STARTER_SECTION.EXPERIENCE,text,index,{
    sourceRoleId:roleRecord.id,
    kind:/^Add /.test(text)?"prompt":"claim_candidate",
    requiresEdit:/^Add /.test(text),
    group:"target_role",
  }));
}

function transferableExperienceItems(currentRole){
  const title=clean(currentRole);
  if(!title)return [];
  const record=createLinkedInRoleRecord(title);
  if(!isCatalogRole(record))return [];
  return roleResponsibilities(record).slice(0,5).map((text,index)=>makeItem(
    STARTER_SECTION.EXPERIENCE,text,index,{
      source:"current_role",
      sourceRoleId:record.id,
      group:"transferable_current_role",
    }
  ));
}

function skillItems(roleRecord){
  let values=roleSkills(roleRecord);
  if(!isCatalogRole(roleRecord)||values.length<MIN_OPTIONS){
    values=unique([...values,...genericEditablePrompts(roleRecord.title,"skill")]).slice(0,MAX_OPTIONS);
  }
  return values.map((text,index)=>makeItem(STARTER_SECTION.SKILLS,text,index,{
    sourceRoleId:roleRecord.id,
    kind:/^Add /.test(text)?"prompt":"claim_candidate",
    requiresEdit:/^Add /.test(text),
  }));
}

function achievementItems(roleRecord){
  const prompts=[
    "Improved ___ by ___",
    "Reduced ___ by ___",
    "Resolved ___ cases, requests or issues over ___",
    "Supported ___ process, project or improvement",
    "Recognized for ___",
    "Improved accuracy, quality or turnaround in ___",
    "Completed ___ project or certification",
    "Helped reduce ___ through ___",
  ];
  return prompts.map((text,index)=>makeItem(STARTER_SECTION.ACHIEVEMENTS,text,index,{
    kind:"evidence_prompt",
    source:"achievement_prompt",
    sourceRoleId:roleRecord.id,
    requiresEdit:true,
  }));
}

function focusItems(roleRecord,mode){
  const role=roleRecord.title;
  const category=roleRecord.category&&roleRecord.category!=="General"?roleRecord.category:"this field";
  let values;
  if(mode===PROFILE_MODE.FRESHER){
    values=[
      "Building toward "+role+" opportunities using verified skills, projects and practical evidence",
      "Seeking an entry path into "+role+" while continuing to develop role-relevant capability",
      "Focused on presenting genuine projects, education and supported skills for "+role,
      "Interested in "+category+" opportunities aligned with my verified strengths",
      "Developing a professional profile for "+role+" without overstating experience",
    ];
  }else if(mode===PROFILE_MODE.CAREER_CHANGER){
    values=[
      "Transitioning toward "+role+" by highlighting genuine transferable experience",
      "Seeking "+role+" opportunities where my verified background can support the transition",
      "Focused on connecting my current experience to "+role+" without overstating target-role exposure",
      "Building role-relevant capability for "+role+" while preserving my existing professional background",
      "Interested in "+category+" opportunities aligned with my confirmed transferable strengths",
    ];
  }else{
    values=[
      "Seeking "+role+" opportunities aligned with my verified experience and skills",
      "Strengthening my positioning for "+role+" using only evidence I can support",
      "Focused on "+category+" opportunities that match my confirmed professional background",
      "Building a profile around "+role+" responsibilities that reflect my actual experience",
      "Open to "+role+" opportunities where I can apply confirmed strengths and continue developing role-specific capability",
    ];
  }
  return values.map((text,index)=>makeItem(STARTER_SECTION.PROFESSIONAL_FOCUS,text,index,{
    kind:"intention",sourceRoleId:roleRecord.id
  }));
}

function emptySections(){
  return {
    [STARTER_SECTION.HEADLINE]:[],
    [STARTER_SECTION.ABOUT]:[],
    [STARTER_SECTION.EXPERIENCE]:[],
    [STARTER_SECTION.SKILLS]:[],
    [STARTER_SECTION.ACHIEVEMENTS]:[],
    [STARTER_SECTION.PROFESSIONAL_FOCUS]:[],
  };
}

export function createRoleStarterPack(roleRecord,mode,{currentRole=""}={}){
  if(!roleRecord||!clean(roleRecord.title))throw new Error("Select a target role before creating starter suggestions.");
  if(!Object.values(PROFILE_MODE).includes(mode))throw new Error("Unsupported profile mode.");

  const sections=emptySections();
  sections.headline=headlineItems(roleRecord);
  sections.about=aboutItems(roleRecord,mode);
  sections.experience=[
    ...experienceItems(roleRecord),
    ...(mode===PROFILE_MODE.CAREER_CHANGER?transferableExperienceItems(currentRole):[]),
  ];
  sections.skills=skillItems(roleRecord);
  sections.achievements=achievementItems(roleRecord);
  sections.professionalFocus=focusItems(roleRecord,mode);

  return Object.freeze({
    version:"linkedin-rework-task2",
    roleId:roleRecord.id,
    roleTitle:roleRecord.title,
    mode,
    sections:Object.freeze(Object.fromEntries(
      Object.entries(sections).map(([section,items])=>[section,Object.freeze(items)])
    )),
  });
}

function clonePack(pack){
  return {
    ...pack,
    sections:Object.fromEntries(
      SECTION_KEYS.map(section=>[section,[...(pack?.sections?.[section]||[])]])
    ),
  };
}

function replaceItem(pack,section,id,transform){
  if(!SECTION_KEYS.includes(section))throw new Error("Unsupported starter-pack section.");
  const next=clonePack(pack);
  let found=false;
  next.sections[section]=next.sections[section].map(item=>{
    if(item.id!==id)return item;
    found=true;
    return Object.freeze(transform(item));
  });
  if(!found)throw new Error("Starter suggestion was not found.");
  return Object.freeze({...next,sections:Object.freeze(Object.fromEntries(
    Object.entries(next.sections).map(([name,items])=>[name,Object.freeze(items)])
  ))});
}

export function editStarterItem(pack,section,id,text){
  const value=clean(text);
  return replaceItem(pack,section,id,item=>({
    ...item,
    text:value,
    requiresEdit:item.requiresEdit&&(!value||value.includes("___")||/^Add /i.test(value)),
  }));
}

export function canConfirmStarterItem(item){
  if(!item||!clean(item.text))return false;
  if(item.requiresEdit)return false;
  if(item.text.includes("___"))return false;
  if(/^Add /i.test(item.text))return false;
  return true;
}

export function setStarterItemConfirmed(pack,section,id,confirmed){
  return replaceItem(pack,section,id,item=>{
    if(item.state===STARTER_STATE.USER_ENTERED)return item;
    if(confirmed&&!canConfirmStarterItem(item))throw new Error("Edit this suggestion into a truthful statement before confirming it.");
    return {...item,state:confirmed?STARTER_STATE.CONFIRMED:STARTER_STATE.SUGGESTED};
  });
}

let userSequence=0;
export function addUserStarterItem(pack,section,text=""){
  if(!SECTION_KEYS.includes(section))throw new Error("Unsupported starter-pack section.");
  const next=clonePack(pack);
  userSequence+=1;
  const item=Object.freeze({
    id:"user--"+section+"--"+userSequence,
    section,
    text:clean(text),
    state:STARTER_STATE.USER_ENTERED,
    kind:"user_fact",
    source:"user",
    sourceRoleId:"",
    requiresEdit:false,
    group:"user",
    staleForTarget:false,
  });
  next.sections[section].push(item);
  return Object.freeze({...next,sections:Object.freeze(Object.fromEntries(
    Object.entries(next.sections).map(([name,items])=>[name,Object.freeze(items)])
  ))});
}

export function removeStarterItem(pack,section,id){
  if(!SECTION_KEYS.includes(section))throw new Error("Unsupported starter-pack section.");
  const next=clonePack(pack);
  next.sections[section]=next.sections[section].filter(item=>item.id!==id);
  return Object.freeze({...next,sections:Object.freeze(Object.fromEntries(
    Object.entries(next.sections).map(([name,items])=>[name,Object.freeze(items)])
  ))});
}

export function refreshRoleStarterPack(existingPack,newRoleRecord,mode,{currentRole=""}={}){
  const fresh=createRoleStarterPack(newRoleRecord,mode,{currentRole});
  if(!existingPack)return fresh;

  const sections=emptySections();
  for(const section of SECTION_KEYS){
    const preserved=(existingPack.sections?.[section]||[])
      .filter(item=>item.state===STARTER_STATE.CONFIRMED||item.state===STARTER_STATE.USER_ENTERED)
      .map(item=>Object.freeze({
        ...item,
        staleForTarget:item.state===STARTER_STATE.CONFIRMED&&item.source==="target_role"&&item.sourceRoleId!==newRoleRecord.id,
      }));
    const preservedKeys=new Set(preserved.map(item=>key(item.text)));
    const freshSuggestions=(fresh.sections?.[section]||[]).filter(item=>!preservedKeys.has(key(item.text)));
    sections[section]=[...preserved,...freshSuggestions];
  }

  return Object.freeze({
    ...fresh,
    sections:Object.freeze(Object.fromEntries(
      Object.entries(sections).map(([section,items])=>[section,Object.freeze(items)])
    )),
  });
}

export function starterPackCounts(pack){
  const result={};
  for(const section of SECTION_KEYS){
    const items=pack?.sections?.[section]||[];
    result[section]=Object.freeze({
      total:items.length,
      suggested:items.filter(item=>item.state===STARTER_STATE.SUGGESTED).length,
      confirmed:items.filter(item=>item.state===STARTER_STATE.CONFIRMED).length,
      userEntered:items.filter(item=>item.state===STARTER_STATE.USER_ENTERED).length,
    });
  }
  return Object.freeze(result);
}
