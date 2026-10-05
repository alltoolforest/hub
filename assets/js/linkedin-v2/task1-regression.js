import { PROFILE_MODE } from "./contracts.js";
import { buildProfileFoundation } from "./task1-foundation.js";
import { hasProtectedFalseEquivalence } from "./evidence-extractor.js";

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

export function runTask1Regression(){
  const experienced=buildProfileFoundation({
    mode:PROFILE_MODE.EXPERIENCED,
    targetRole:"Fraud Analyst",
    currentRole:"Customer Support Associate",
    industry:"BPO",
    currentHeadline:"Customer Support Associate | Disputes | Excel",
    currentAbout:"Handled customer disputes and escalations.",
    experienceText:"Resolved customer complaints and reviewed disputed transactions.",
    skillsText:"Excel\nCustomer Service\nDispute Resolution",
    achievementsText:"Reduced repeat contacts by 12%",
    professionalGoal:"Move into fraud operations.",
    resumeText:"Customer Support Associate\nHandled dispute cases and customer escalations."
  });

  assert(experienced.profile.targetRole==="Fraud Analyst","Target role must be preserved.");
  assert(experienced.evidence.some(x=>x.type==="metric"&&x.value==="12%"),"Metric should remain source-traceable.");
  assert(experienced.evidence.some(x=>x.type==="skill"&&/Excel/i.test(x.value)),"Verified skill should be captured.");
  assert(experienced.alignment.suggestedToReview.includes("aml"),"Role suggestions should be separated for review.");
  assert(!experienced.alignment.verifiedRelevant.some(x=>/aml/i.test(x.value)),"Suggested AML must not become verified.");

  const fresher=buildProfileFoundation({
    mode:PROFILE_MODE.FRESHER,
    targetRole:"Data Analyst",
    currentRole:"",
    industry:"",
    currentHeadline:"",
    currentAbout:"Recent graduate interested in data analysis.",
    experienceText:"",
    skillsText:"Excel\nSQL",
    achievementsText:"Built a college sales dashboard project.",
    professionalGoal:"Start a data analyst career.",
    resumeText:"Bachelor degree\nExcel\nSQL\nDashboard project"
  });
  assert(fresher.profile.mode===PROFILE_MODE.FRESHER,"Fresher mode should remain explicit.");
  assert(fresher.alignment.verifiedRelevant.some(x=>/Excel|SQL/i.test(x.value)),"Fresher verified skills should align.");

  const changer=buildProfileFoundation({
    mode:PROFILE_MODE.CAREER_CHANGER,
    targetRole:"SAP Basis Administrator",
    currentRole:"Customer Support Associate",
    industry:"BPO",
    currentHeadline:"",
    currentAbout:"",
    experienceText:"Customer support and ticket handling.",
    skillsText:"Customer Service\nSAP FICO",
    achievementsText:"",
    professionalGoal:"Move into SAP Basis.",
    resumeText:"Customer service experience"
  });
  assert(changer.profile.mode===PROFILE_MODE.CAREER_CHANGER,"Career changer mode should remain explicit.");
  assert(!changer.alignment.verifiedRelevant.some(x=>/sap basis/i.test(x.value)),"SAP FICO must not be treated as SAP Basis.");

  assert(hasProtectedFalseEquivalence("Java","JavaScript"),"Java and JavaScript distinction must be protected.");
  assert(hasProtectedFalseEquivalence("SAP Basis","SAP FICO"),"SAP Basis and SAP FICO distinction must be protected.");
  assert(hasProtectedFalseEquivalence("Power BI","Tableau"),"Power BI and Tableau distinction must be protected.");

  let threw=false;
  try{buildProfileFoundation({mode:PROFILE_MODE.EXPERIENCED,targetRole:"",skillsText:"Excel"})}catch{threw=true}
  assert(threw,"Missing target role must fail.");

  threw=false;
  try{buildProfileFoundation({mode:PROFILE_MODE.EXPERIENCED,targetRole:"Data Analyst",currentAbout:"x".repeat(12001)})}catch{threw=true}
  assert(threw,"Oversized About input must fail.");

  const scriptText=buildProfileFoundation({
    mode:PROFILE_MODE.EXPERIENCED,
    targetRole:"Software Engineer",
    currentAbout:"<script>alert(1)</script>",
    skillsText:"JavaScript"
  });
  assert(scriptText.profile.currentAbout.includes("<script>"),"Task 1 should preserve text literally rather than execute or reinterpret HTML.");

  return {
    pass:true,
    candidateModes:3,
    sourceTraceability:true,
    verifiedVsSuggested:true,
    roleAlignment:true,
    falseEquivalenceGuards:true,
    requiredFieldValidation:true,
    sizeLimits:true,
    literalTextSafety:true,
  };
}
