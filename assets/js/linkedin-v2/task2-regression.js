import { PROFILE_MODE } from "./contracts.js";
import { buildProfileFoundation } from "./task1-foundation.js";
import {
  generateOptimization,generateHeadlines,generateAbout,rewriteExperience,buildSkillsOutput,
  containsUnsupportedMetric,containsSuggestedAsClaim,HEADLINE_MAX
} from "./task2-optimizer.js";
import { reviewProfile } from "./task2-review.js";
import { refineText } from "./task2-refinement.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function base(overrides={}){
  return {
    mode:PROFILE_MODE.EXPERIENCED,
    targetRole:"Fraud Analyst",
    currentRole:"Customer Support Associate",
    industry:"BPO",
    currentHeadline:"Customer Support Associate | Disputes",
    currentAbout:"Customer support professional handling disputes and escalations for customers.",
    experienceText:"Responsible for customer disputes\nReviewed disputed transactions\nHandled escalations",
    skillsText:"Excel\nCustomer Service\nDispute Resolution",
    achievementsText:"Reduced repeat contacts by 12%",
    professionalGoal:"Move into fraud operations.",
    resumeText:"Customer Support Associate\nHandled disputes and customer escalations.",
    ...overrides
  };
}

export function runTask2Regression(){
  const optimized=generateOptimization(base());
  assert(optimized.headlines.length===3,"Three headline alternatives are required.");
  assert(new Set(optimized.headlines.map(x=>x.text)).size>=2,"Headline alternatives must be meaningfully different.");
  assert(optimized.headlines.every(x=>x.text.length<=HEADLINE_MAX),"Headline character guard failed.");
  assert(optimized.headlines.every(x=>!/aml/i.test(x.text)),"Unverified AML must not appear in headline output.");

  assert(/Fraud Analyst/i.test(optimized.about.text),"About must reflect target positioning.");
  assert(/12%/.test(optimized.about.text),"Verified metric may be reused.");
  assert(!/aml/i.test(optimized.about.text),"Suggested AML must not become an About claim.");

  assert(optimized.experience.length===3,"Experience lines should be rewritten individually.");
  assert(optimized.experience[0].rewritten!==optimized.experience[0].original,"Experience should be rewritten, not just bullet-prefixed.");
  assert(/Handled customer disputes/i.test(optimized.experience[0].rewritten),"Responsibility rewrite should preserve meaning.");

  assert(optimized.skills.supported.includes("Excel"),"Supported skills must be preserved.");
  assert(optimized.skills.suggestedToReview.includes("aml"),"Target-role suggestions must remain separate.");
  assert(/Add them only if/i.test(optimized.skills.disclaimer),"Suggested skills require explicit verification guidance.");

  const foundation=buildProfileFoundation(base());
  assert(!containsUnsupportedMetric(optimized.about.text,foundation),"Generated About must not invent metrics.");
  assert(!containsSuggestedAsClaim(optimized.about.text,foundation),"Generated About must not claim suggested skills.");

  const noMetrics=generateOptimization(base({achievementsText:"",currentAbout:"Customer support professional.",experienceText:"Handled customer disputes"}));
  assert(!containsUnsupportedMetric(noMetrics.about.text,noMetrics.foundation),"No-metric input must not produce invented numbers.");

  const roleA=generateHeadlines(buildProfileFoundation(base({targetRole:"Fraud Analyst"}))).map(x=>x.text).join(" ");
  const roleB=generateHeadlines(buildProfileFoundation(base({targetRole:"Data Analyst"}))).map(x=>x.text).join(" ");
  assert(roleA!==roleB,"Different target roles must produce different positioning.");

  const fresher=generateAbout(buildProfileFoundation(base({
    mode:PROFILE_MODE.FRESHER,currentRole:"",targetRole:"Data Analyst",
    currentHeadline:"",currentAbout:"",experienceText:"",
    skillsText:"Excel\nSQL",achievementsText:"Built a college dashboard project",professionalGoal:"Start a data analyst career."
  })));
  assert(/building my career toward Data Analyst/i.test(fresher.text),"Fresher positioning must differ.");

  const changer=generateAbout(buildProfileFoundation(base({
    mode:PROFILE_MODE.CAREER_CHANGER,targetRole:"SAP Basis Administrator",
    currentRole:"Customer Support Associate",skillsText:"Customer Service\nSAP FICO",
    achievementsText:"",experienceText:"Handled support tickets",professionalGoal:"Transition to SAP Basis."
  })));
  assert(/transitioning toward SAP Basis Administrator/i.test(changer.text),"Career changer positioning must differ.");

  const review=reviewProfile(base({currentHeadline:"",achievementsText:""}));
  assert(review.checks.some(x=>x.id==="headline"&&x.status==="missing"),"Missing headline should be identified.");
  assert(review.checks.some(x=>x.id==="evidence"&&x.status==="needs_attention"),"Missing evidence should be identified.");
  assert(!("score" in review),"Profile review must not emit an opaque score.");

  const stuffed=reviewProfile(base({currentAbout:"Excel Excel Excel Excel Excel hardworking results-driven professional"}));
  assert(stuffed.checks.some(x=>x.id==="repetition"&&x.status==="needs_attention"),"Keyword repetition should be flagged.");
  assert(stuffed.checks.some(x=>x.id==="generic"&&x.status==="needs_attention"),"Generic wording should be flagged.");

  assert(refineText("I am responsible for customer support. I also handle escalations.","strengthen_opening").startsWith("I handle"),"Opening refinement failed.");
  assert(refineText("I am very highly focused on customer outcomes.","concise").length<"I am very highly focused on customer outcomes.".length,"Concise refinement failed.");

  const exp=rewriteExperience(buildProfileFoundation(base({experienceText:"Worked on customer tickets"})));
  assert(/Supported customer tickets/i.test(exp[0].rewritten),"Weak experience phrasing should be strengthened without new facts.");

  const skills=buildSkillsOutput(buildProfileFoundation(base({skillsText:"Java"})));
  assert(!skills.supported.some(x=>/javascript/i.test(x)),"Java must not imply JavaScript.");

  return {
    pass:true,
    headlineAlternatives:3,
    headlineGuard:true,
    aboutGrounding:true,
    experienceRewrite:true,
    skillsSeparation:true,
    noInventedMetrics:true,
    noSuggestedSkillClaims:true,
    targetRoleVariation:true,
    candidateModeVariation:true,
    deterministicReview:true,
    noOpaqueScore:true,
    repetitionCheck:true,
    genericWordingCheck:true,
    refinement:true,
    falseEquivalenceRegression:true,
  };
}
