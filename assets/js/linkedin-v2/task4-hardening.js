import { PROFILE_MODE } from "./contracts.js";
import { generateOptimization } from "./task2-optimizer.js";
import { reviewProfile } from "./task2-review.js";

export const LINKEDIN_PRIVACY_NOTICE=
  "Profile text is processed in this browser. Saved drafts use this browser's local storage on this device. Core profile optimization does not require LinkedIn login, profile scraping, or sending your profile text to a server.";

export const PERFORMANCE_BUDGET_MS=150;

function repeated(prefix,count){
  return Array.from({length:count},(_,i)=>prefix+" "+(i+1)).join("\n");
}

export function buildMaximumProfileFixture(){
  return {
    mode:PROFILE_MODE.EXPERIENCED,
    targetRole:"Data Analyst",
    currentRole:"Operations Analyst",
    industry:"Business Services",
    currentHeadline:"Operations Analyst | Excel | SQL | Reporting",
    currentAbout:("Operations analyst focused on reporting, process review, Excel and SQL. ").repeat(60).slice(0,3500),
    experienceText:repeated("Reviewed operational records, prepared reports, and supported process improvements",180).slice(0,22000),
    skillsText:repeated("Skill",180).slice(0,7000),
    achievementsText:repeated("Documented supported achievement",90).slice(0,9000),
    professionalGoal:"Move into a data analyst role using verified reporting and analysis experience.",
    resumeText:repeated("Resume evidence line describing operations, reporting, Excel, SQL, documentation and customer support",260).slice(0,30000),
  };
}

export function inspectMaximumProfilePerformance(now=()=>globalThis.performance?.now?.()??Date.now()){
  const fixture=buildMaximumProfileFixture();
  const start=now();
  const optimization=generateOptimization(fixture);
  const review=reviewProfile(optimization.foundation);
  const elapsed=Math.max(0,now()-start);
  return Object.freeze({
    pass:Boolean(optimization.about.text)&&optimization.headlines.length===3&&review.checks.length>0&&elapsed<=PERFORMANCE_BUDGET_MS,
    elapsedMs:elapsed,
    budgetMs:PERFORMANCE_BUDGET_MS,
    headlineCount:optimization.headlines.length,
    reviewCheckCount:review.checks.length,
  });
}
