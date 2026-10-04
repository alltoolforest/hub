import {
  TIMESHEET_SEO,
  TIMESHEET_GUIDANCE_SECTIONS,
  TIMESHEET_FAQ,
  TIMESHEET_INTERNAL_LINKS,
} from "./task6-seo-content.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

export function runTask6Regression(){
  assert(TIMESHEET_SEO.title.includes("Timesheet & Work Hours"),"SEO title must identify the tool.");
  assert(TIMESHEET_SEO.description.length>=100&&TIMESHEET_SEO.description.length<=180,"Meta description should be useful and concise.");
  assert(TIMESHEET_SEO.canonicalPath==="/hub/work/timesheet/","Canonical path must match production route.");
  assert(TIMESHEET_SEO.h1==="Timesheet & Work Hours","Expected single production H1 text is wrong.");
  assert(TIMESHEET_SEO.og.title&&TIMESHEET_SEO.og.description&&TIMESHEET_SEO.og.type==="website","OG metadata must be complete.");
  assert(TIMESHEET_SEO.structuredData===null,"Do not force structured data without a genuine need.");

  const headings=TIMESHEET_GUIDANCE_SECTIONS.map(section=>section.heading);
  [
    "How the Timesheet & Work Hours calculator works",
    "How work hours are calculated",
    "How unpaid breaks are deducted",
    "How overnight shifts work",
    "Decimal hours vs hours and minutes",
    "How weekly overtime is calculated",
    "How time rounding works",
    "Timesheets for employees, freelancers and shift workers",
    "Privacy",
  ].forEach(required=>assert(headings.includes(required),`Missing guidance section: ${required}`));

  const allText=TIMESHEET_GUIDANCE_SECTIONS.map(section=>section.body).join(" ")+" "+TIMESHEET_FAQ.map(item=>item.answer).join(" ");
  assert(/does not (?:automatically )?apply country, state, union, employer, daily-overtime, double-time, weekend-premium, or payroll rules/i.test(allText),"Overtime guidance must remain legally neutral.");
  assert(/stored in this browser on this device/i.test(allText),"Privacy guidance must match local persistence.");
  assert(/do not send your entries to a server/i.test(allText),"Privacy guidance must match core network behavior.");
  assert(/up to three work periods per day/i.test(allText),"Guidance must match the implemented period limit.");
  assert(/CSV/i.test(allText)&&/Print \/ Save PDF/i.test(allText),"Guidance must match implemented exports.");

  assert(TIMESHEET_FAQ.length>=4,"FAQ should answer core launch questions.");
  assert(TIMESHEET_INTERNAL_LINKS.length===3,"Only a small relevant internal-link set should be included.");
  assert(TIMESHEET_INTERNAL_LINKS.some(link=>link.href.includes("time-duration")),"Time & Duration internal link is required.");
  assert(TIMESHEET_INTERNAL_LINKS.every(link=>/^\.\.\/\.\.\//.test(link.href)),"Internal links must remain local relative routes.");

  return {
    pass:true,
    title:true,
    description:true,
    canonical:true,
    h1:true,
    og:true,
    structuredDataOmittedIntentionally:true,
    guidanceSections:TIMESHEET_GUIDANCE_SECTIONS.length,
    faq:TIMESHEET_FAQ.length,
    legalNeutrality:true,
    privacyAccuracy:true,
    internalLinks:TIMESHEET_INTERNAL_LINKS.length,
  };
}
