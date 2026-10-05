import { canonicalTerm,hasProtectedFalseEquivalence } from "./evidence-extractor.js";

const ROLE_LIBRARY=Object.freeze([
  {match:["customer support","customer service","support associate","bpo"],terms:["customer service","communication","issue resolution","crm","escalation handling"]},
  {match:["fraud","fraud analyst","financial crime","aml","kyc"],terms:["fraud investigation","aml","kyc","transaction monitoring","case review"]},
  {match:["sap basis","basis administrator"],terms:["sap basis","system administration","user administration","transport management","monitoring"]},
  {match:["data analyst"],terms:["data analysis","excel","sql","power bi","reporting"]},
  {match:["software engineer","developer"],terms:["software development","debugging","version control","testing","problem solving"]},
  {match:["finance","financial analyst"],terms:["financial analysis","excel","reporting","forecasting","reconciliation"]},
  {match:["hr","human resources"],terms:["recruitment","employee relations","hr operations","onboarding","communication"]},
  {match:["sales"],terms:["sales","lead generation","customer relationship","negotiation","pipeline management"]},
  {match:["marketing"],terms:["marketing","campaigns","content","analytics","brand"]},
  {match:["nurse","healthcare"],terms:["patient care","clinical documentation","care coordination","communication","safety"]},
  {match:["electrician","technician","trade"],terms:["maintenance","troubleshooting","safety","installation","repair"]},
]);

export function getRoleSuggestions(targetRole){
  const text=String(targetRole||"").toLowerCase();
  const found=ROLE_LIBRARY.find(item=>item.match.some(term=>text.includes(term)));
  return Object.freeze(found?[...found.terms]:[]);
}

export function alignEvidenceToRole(profile,evidence,alignment){
  const suggestions=getRoleSuggestions(profile.targetRole);
  const verifiedSkills=evidence.filter(item=>item.type==="skill").map(item=>canonicalTerm(item.value));

  const suggested=suggestions.filter(term=>
    !verifiedSkills.some(skill=>skill===canonicalTerm(term)||hasProtectedFalseEquivalence(skill,term))
  );

  return Object.freeze({
    role:profile.targetRole,
    verifiedRelevant:Object.freeze(
      evidence.filter(item=>item.type==="skill"&&suggestions.some(term=>canonicalTerm(term)===canonicalTerm(item.value)))
    ),
    supporting:Object.freeze(
      evidence.filter(item=>["achievement","experience_phrase","resume_phrase","industry"].includes(item.type))
    ),
    suggestedToReview:Object.freeze(suggested),
    missingOrUnknown:Object.freeze(
      suggestions.filter(term=>!verifiedSkills.includes(canonicalTerm(term)))
    ),
    alignmentLabels:alignment,
  });
}
