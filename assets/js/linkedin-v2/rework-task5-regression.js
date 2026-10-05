import { STARTER_ITEM_MAX,STARTER_SECTION,createRoleStarterPack,addUserStarterItem } from "./rework-task2-starter-pack.js";
import { PROFILE_MODE } from "./contracts.js";
import { createLinkedInRoleRecord } from "./rework-task1-role-adapter.js";
import { LINKEDIN_SEO,LINKEDIN_GUIDANCE,LINKEDIN_FAQ } from "./task4-seo-content.js";
import { inspectGuidedFlowPerformance } from "./rework-task5-hardening.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
  };
}

export function runLinkedInReworkTask5Regression(){
  const custom=createRoleStarterPack(createLinkedInRoleRecord("Data Analyst"),PROFILE_MODE.EXPERIENCED);
  let blocked=false;
  try{addUserStarterItem(custom,STARTER_SECTION.ABOUT,"x".repeat(STARTER_ITEM_MAX+1))}catch{blocked=true}
  assert(blocked,"Oversized starter text must be rejected.");

  let tick=0;
  const performance=inspectGuidedFlowPerformance(memoryStorage(),()=>{tick+=15;return tick});
  assert(performance.pass,"Worst-case guided flow should stay inside the release performance budget.");

  assert(LINKEDIN_SEO.title.includes("LinkedIn Profile Helper"),"SEO title must identify the tool.");
  assert(LINKEDIN_SEO.description.length>=110&&LINKEDIN_SEO.description.length<=180,"SEO description length is unsuitable.");
  assert(LINKEDIN_SEO.canonicalPath==="/hub/work/linkedin/","Canonical route is incorrect.");
  assert(LINKEDIN_SEO.structuredData===null,"Structured data should not be forced for launch.");

  const headings=LINKEDIN_GUIDANCE.map(item=>item.heading);
  [
    "Create a LinkedIn profile from scratch",
    "Improve an existing LinkedIn profile",
    "How role-based suggestions work",
    "Suggested vs Confirmed information",
    "LinkedIn profiles for freshers and students",
    "LinkedIn profiles for experienced professionals",
    "LinkedIn profiles for career changers",
    "Writing a strong LinkedIn headline",
    "Building your LinkedIn About section",
    "Improving LinkedIn experience",
    "Choosing LinkedIn skills",
    "Writing truthful achievements",
    "Privacy"
  ].forEach(required=>assert(headings.includes(required),"Missing launch guidance section: "+required));

  const allText=LINKEDIN_GUIDANCE.map(item=>item.body).join(" ")+" "+LINKEDIN_FAQ.map(item=>item.answer).join(" ");
  assert(/Suggested/.test(allText)&&/Confirmed/.test(allText),"SEO guidance must explain suggestion confirmation.");
  assert(/does not require LinkedIn login/i.test(allText),"Privacy guidance must explain no LinkedIn login.");
  assert(!/guarantee|hiring probability|algorithm score/i.test(allText),"SEO copy must avoid unsupported hiring/algorithm claims.");

  return Object.freeze({
    pass:true,
    starterInputBound:true,
    performance:true,
    performanceBudgetMs:performance.budgetMs,
    seoMetadata:true,
    guidanceSections:LINKEDIN_GUIDANCE.length,
    faq:LINKEDIN_FAQ.length,
    noUnsupportedClaims:true,
  });
}
