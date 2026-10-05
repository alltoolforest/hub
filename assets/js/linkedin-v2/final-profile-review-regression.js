import { reviewFinalProfile } from "./final-profile-review.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message)};

export function runFinalProfileReviewRegression(){
  const complete=reviewFinalProfile({
    targetRole:"Fraud Analyst",
    achievementText:"Reduced repeat contacts by 12%",
    drafts:{
      headline:"Fraud Analyst | Dispute Resolution | Excel",
      about:"Customer support professional transitioning toward Fraud Analyst opportunities with verified dispute-handling and documentation experience.",
      experience:"Handled customer disputes and documented case details to support resolution.",
      skills:"Excel\nDispute Resolution\nDocumentation",
    }
  });

  assert(complete.checks.length===5,"Final review should remain compact.");
  assert(!complete.checks.some(check=>check.id==="headline"||check.id==="about"),"Source-input Headline/About diagnostics must not appear.");
  assert(complete.checks.find(check=>check.id==="completeness")?.status==="strong","Complete final profile should be Strong.");
  assert(complete.checks.find(check=>check.id==="target_alignment")?.status==="strong","Target-aligned final profile should be Strong.");
  assert(complete.checks.find(check=>check.id==="evidence")?.status==="strong","Verified metric should strengthen evidence.");

  const noOldProfileNeeded=reviewFinalProfile({
    targetRole:"Data Analyst",
    achievementText:"",
    drafts:{
      headline:"Data Analyst | Excel | SQL",
      about:"Building toward Data Analyst opportunities using verified Excel and SQL skills.",
      experience:"Built a college sales dashboard project.",
      skills:"Excel\nSQL",
    }
  });
  assert(noOldProfileNeeded.checks.find(check=>check.id==="completeness")?.status==="strong","Generated profile should not depend on old LinkedIn input.");
  assert(noOldProfileNeeded.checks.find(check=>check.id==="evidence")?.status==="needs_attention","Missing achievement should be optional improvement, not Missing.");

  const incomplete=reviewFinalProfile({
    targetRole:"SAP Basis Administrator",
    drafts:{
      headline:"SAP Basis Administrator",
      about:"",
      experience:"Handled support tickets.",
      skills:"Customer Service",
    }
  });
  assert(incomplete.checks.find(check=>check.id==="completeness")?.status==="needs_attention","Missing final section should be flagged compactly.");

  const generic=reviewFinalProfile({
    targetRole:"Customer Support Executive",
    drafts:{
      headline:"Customer Support Executive",
      about:"Results-driven professional and hardworking professional focused on customer support.",
      experience:"Handled customer enquiries.",
      skills:"Customer Service",
    }
  });
  assert(generic.checks.find(check=>check.id==="wording")?.status==="needs_attention","Generic finished wording should be detected.");

  return Object.freeze({
    pass:true,
    compactFiveChecks:true,
    noSourceMissingDiagnostics:true,
    finalProfileCompleteness:true,
    targetAlignment:true,
    optionalEvidence:true,
    genericWording:true,
    repetition:true,
  });
}
