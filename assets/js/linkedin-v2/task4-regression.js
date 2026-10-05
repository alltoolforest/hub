import { createTask3State,generateProfileSections } from "./task3-state.js";
import { createLinkedInDraftStore,LINKEDIN_STORAGE_KEY } from "./task3-storage.js";
import { LINKEDIN_PRIVACY_NOTICE,inspectMaximumProfilePerformance } from "./task4-hardening.js";
import { LINKEDIN_SEO,LINKEDIN_GUIDANCE,LINKEDIN_FAQ,LINKEDIN_INTERNAL_LINKS } from "./task4-seo-content.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

function memoryStorage(){
  const map=new Map([["unrelated.key","keep"]]);
  return {
    getItem:k=>map.has(k)?map.get(k):null,
    setItem:(k,v)=>map.set(k,String(v)),
    removeItem:k=>map.delete(k),
    raw:(k,v)=>map.set(k,String(v)),
    value:k=>map.get(k),
    has:k=>map.has(k)
  };
}

export function runTask4Regression(){
  assert(/processed in this browser/i.test(LINKEDIN_PRIVACY_NOTICE),"Privacy notice must disclose browser-local processing.");
  assert(/local storage/i.test(LINKEDIN_PRIVACY_NOTICE),"Privacy notice must disclose local storage.");
  assert(/does not require LinkedIn login/i.test(LINKEDIN_PRIVACY_NOTICE),"Privacy notice must disclose no LinkedIn login.");

  const storage=memoryStorage();
  const store=createLinkedInDraftStore(storage);
  let state=createTask3State({targetRole:"Data Analyst",skillsText:"Excel\nSQL"});
  state=generateProfileSections(state);
  assert(store.save(state).ok,"Valid state should save.");
  assert(storage.has(LINKEDIN_STORAGE_KEY),"Scoped LinkedIn key should exist.");
  assert(store.clear().ok,"Clear should succeed.");
  assert(!storage.has(LINKEDIN_STORAGE_KEY),"LinkedIn draft should be removed.");
  assert(storage.value("unrelated.key")==="keep","Unrelated browser storage must remain untouched.");

  storage.raw(LINKEDIN_STORAGE_KEY,JSON.stringify({schema:99,state:{}}));
  const unsupported=store.load();
  assert(!unsupported.ok&&unsupported.reason==="unsupported_schema","Unsupported saved schema must fail safely.");

  let tick=0;
  const perf=inspectMaximumProfilePerformance(()=>{tick+=10;return tick});
  assert(perf.pass,"Maximum practical profile pipeline must remain inside the performance budget.");

  assert(LINKEDIN_SEO.title.includes("LinkedIn Profile Helper"),"SEO title must identify the tool.");
  assert(LINKEDIN_SEO.description.length>=110&&LINKEDIN_SEO.description.length<=180,"SEO description length is unsuitable.");
  assert(LINKEDIN_SEO.canonicalPath==="/hub/work/linkedin/","Canonical path must match the production route.");
  assert(LINKEDIN_SEO.h1==="LinkedIn Profile Helper","Expected H1 is incorrect.");
  assert(LINKEDIN_SEO.structuredData===null,"Do not force structured data for launch.");

  const headings=LINKEDIN_GUIDANCE.map(x=>x.heading);
  [
    "How to write a strong LinkedIn headline",
    "How to improve your LinkedIn About section",
    "How to improve LinkedIn experience descriptions",
    "Choosing LinkedIn skills",
    "Using target-role keywords",
    "LinkedIn profiles for freshers and students",
    "LinkedIn profiles for career changers",
    "Writing truthful achievements",
    "Privacy"
  ].forEach(required=>assert(headings.includes(required),"Missing guidance section: "+required));

  const text=LINKEDIN_GUIDANCE.map(x=>x.body).join(" ")+" "+LINKEDIN_FAQ.map(x=>x.answer).join(" ");
  assert(/220 characters/.test(text),"Headline limit guidance is missing.");
  assert(/2,600 characters/.test(text),"About limit guidance is missing.");
  assert(/never be presented as a skill you already possess/i.test(text),"Suggested-skill truthfulness guidance is missing.");
  assert(/not require LinkedIn login/i.test(text),"Privacy/login guidance is missing.");
  assert(LINKEDIN_FAQ.length>=4,"FAQ coverage is insufficient.");
  assert(LINKEDIN_INTERNAL_LINKS.length===3,"Internal-link set should stay focused.");

  return {
    pass:true,
    privacy:true,
    scopedStorage:true,
    schemaGuard:true,
    performance:true,
    performanceBudgetMs:perf.budgetMs,
    seoMetadata:true,
    guidanceSections:LINKEDIN_GUIDANCE.length,
    faq:LINKEDIN_FAQ.length,
    internalLinks:LINKEDIN_INTERNAL_LINKS.length
  };
}
