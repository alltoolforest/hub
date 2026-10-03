import { CANDIDATE_TYPES } from "./contracts.js";
import { LETTER_LENGTHS, LETTER_TONES } from "./writing-contracts.js";
import { createCoverLetterDraft, generateCoverLetter, rewriteLetterSection, checkCoverLetterQuality } from "./task2-engine.js";
import { buildTask1Foundation } from "./task1-foundation.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };

const base = {
  candidate: {
    candidateType: CANDIDATE_TYPES.EXPERIENCED,
    fullName: "Alex Candidate",
    email: "alex@example.com",
    phone: "+91 9000000000",
    location: "Hyderabad",
    targetPosition: "Compliance Analyst",
    company: "Example Bank",
    recipient: "Hiring Manager",
    motivation: "the role combines investigation work with customer protection",
  },
  resumeText: `Summary
Compliance professional
Skills
AML
KYC
Microsoft Excel
Experience
Compliance Analyst at Example Services
Investigated transaction monitoring alerts and completed KYC reviews
Reviewed 120 cases per month and documented findings
Education
Bachelor of Commerce`,
  jobDescription: `Required: Anti-Money Laundering.
Required: transaction monitoring.
Required: Know Your Customer.
Preferred: MS Excel.
Preferred: CPA.`,
};

function runMode(candidateType, resumeText, jobDescription, role) {
  return createCoverLetterDraft({
    candidate: { ...base.candidate, candidateType, targetPosition: role },
    resumeText,
    jobDescription,
  }, { tone: LETTER_TONES.PROFESSIONAL, length: LETTER_LENGTHS.STANDARD });
}

export function runTask2Regression() {
  const standard = createCoverLetterDraft(base, { tone: LETTER_TONES.PROFESSIONAL, length: LETTER_LENGTHS.STANDARD });
  assert(standard.generated.status === "ready", "Standard generation should succeed.");
  assert(standard.generated.grounding.safe, "Generated standard letter must pass grounding.");
  assert(standard.generated.selectedEvidence.length >= 1 && standard.generated.selectedEvidence.length <= 3, "Select 1-3 evidence items.");
  assert(standard.generated.letter.includes("Compliance Analyst"), "Target role must be present.");
  assert(standard.generated.letter.includes("Example Bank"), "Company must be present.");
  assert(!/\bCPA\b/.test(standard.generated.letter), "Missing CPA must not be invented.");
  assert(standard.generated.letter.includes("120"), "Supported metric may be used.");

  const concise = createCoverLetterDraft(base, { tone: LETTER_TONES.CONCISE, length: LETTER_LENGTHS.CONCISE });
  assert(concise.generated.selectedEvidence.length === 1, "Concise mode should focus on one evidence item.");
  assert(concise.generated.letter.length < standard.generated.letter.length, "Concise output should be shorter.");

  const tones = Object.values(LETTER_TONES).map((tone) => createCoverLetterDraft(base, { tone, length: LETTER_LENGTHS.STANDARD }));
  assert(new Set(tones.map((draft) => draft.generated.letter)).size >= 3, "Tone controls should meaningfully alter wording.");

  const fresher = runMode(
    CANDIDATE_TYPES.FRESHER,
    "Education\nBachelor of Computer Science\nProjects\nBuilt a Java inventory application\nSkills\nJava\nSQL",
    "Required: Java. Preferred: SQL. Preferred: 2 years professional experience.",
    "Junior Java Developer"
  );
  assert(/education|project/i.test(fresher.generated.letter), "Fresher output should use education/project evidence.");
  assert(!/2 years professional experience/i.test(fresher.generated.letter), "Fresher output must not claim missing experience.");

  const changer = runMode(
    CANDIDATE_TYPES.CAREER_CHANGER,
    "Skills\nCustomer Service\nMicrosoft Excel\nExperience\nRetail Associate assisting customers and preparing Excel reports.",
    "Required: customer service. Required: MS Excel. Preferred: banking experience.",
    "Banking Operations Associate"
  );
  assert(/transition|move into/i.test(changer.generated.letter), "Career changer output should acknowledge transition.");
  assert(!/banking experience/i.test(changer.generated.letter), "Career changer output must not invent missing banking experience.");

  const differentJob = createCoverLetterDraft({
    ...base,
    candidate: { ...base.candidate, targetPosition: "Excel Reporting Analyst", company: "Example Analytics" },
    jobDescription: "Required: Microsoft Excel. Required: reporting. Preferred: dashboard experience.",
  });
  assert(differentJob.generated.letter !== standard.generated.letter, "Different job should produce meaningfully different letter.");
  assert(differentJob.generated.letter.includes("Example Analytics"), "Different company must be reflected.");

  const trap = buildTask1Foundation({
    candidate: { ...base.candidate, targetPosition: "Senior Analyst", company: "Trap Corp" },
    resumeText: "Skills\nMicrosoft Excel\nExperience\nAnalyst with 3 years experience.",
    jobDescription: "Required: 5 years experience. Required: Power BI. Required: CPA.",
  });
  const trapLetter = generateCoverLetter(trap);
  assert(!trapLetter.letter.includes("5 years"), "Must not invent requested 5 years.");
  assert(!trapLetter.letter.includes("Power BI"), "Must not claim absent Power BI.");
  assert(!trapLetter.letter.includes("CPA"), "Must not claim absent CPA.");

  const falseEquivalence = createCoverLetterDraft({
    candidate: { ...base.candidate, targetPosition: "Developer", company: "Code Corp" },
    resumeText: "Skills\nJavaScript\nSAP FICO\nTableau\nExperience\nDeveloper using JavaScript and Tableau.",
    jobDescription: "Required: Java. Required: SAP Basis. Required: Power BI.",
  });
  assert(!/relevant to the role's emphasis on Java\b/.test(falseEquivalence.generated.letter), "JavaScript must not support Java.");
  assert(!/emphasis on SAP Basis/i.test(falseEquivalence.generated.letter), "SAP FICO must not support SAP Basis.");
  assert(!/emphasis on Power BI/i.test(falseEquivalence.generated.letter), "Tableau must not support Power BI.");

  const qualityBad = checkCoverLetterQuality("Hello. I can improve results by 99%.", standard.foundation);
  assert(qualityBad.status === "needs_work", "Unsafe/incomplete letter should need work.");
  assert(qualityBad.findings.some((f) => f.code === "unsupported_number"), "Quality checker should flag unsupported number.");
  assert(qualityBad.findings.some((f) => f.code === "missing_role"), "Quality checker should flag missing role.");
  assert(qualityBad.findings.some((f) => f.code === "missing_company"), "Quality checker should flag missing company.");

  const shortened = rewriteLetterSection("First supported sentence. Second supported sentence. Third supported sentence.", "shorten", standard.foundation);
  assert(!shortened.includes("Third supported sentence"), "Shorten should reduce section length.");
  const strengthened = rewriteLetterSection("I think I can support the team.", "strengthen", standard.foundation);
  assert(strengthened === "I can support the team.", "Strengthen should make controlled wording change.");

  const roles = [
    ["IT","Software Engineer","Skills\nJava\nSQL\nExperience\nBuilt Java services using SQL.","Required: Java. Required: SQL."],
    ["SAP","SAP Basis Administrator","Skills\nSAP Basis\nLinux\nExperience\nSupported SAP Basis on Linux.","Required: SAP Basis. Required: Linux."],
    ["BPO","Customer Service Associate","Skills\nCustomer Service\nExperience\nHandled customer queries.","Required: customer service."],
    ["Finance","Finance Analyst","Skills\nMicrosoft Excel\nExperience\nPrepared Excel reports.","Required: MS Excel."],
    ["Healthcare","Registered Nurse","Certifications\nRN license\nExperience\nProvided patient care.","Required: RN license. Required: patient care."],
    ["Engineering","Mechanical Engineer","Skills\nAutoCAD\nExperience\nCreated AutoCAD drawings.","Required: AutoCAD."],
    ["HR","Recruiter","Skills\nRecruitment\nExperience\nManaged recruitment.","Required: recruitment experience."],
    ["Sales","Sales Executive","Skills\nLead Generation\nExperience\nGenerated sales leads.","Required: lead generation."],
    ["Trade","Electrician","Certifications\nElectrician license\nExperience\nInstalled electrical wiring.","Required: electrician license."],
    ["Niche","Flux Operator","Skills\nCustom platform operations\nExperience\nSupported bespoke systems.","Required: FluxCapacitorOps orchestration."],
  ];

  const roleResults = roles.map(([name, role, resumeText, jobDescription]) => {
    const draft = createCoverLetterDraft({
      candidate: { ...base.candidate, targetPosition: role, company: "Example Employer" },
      resumeText,
      jobDescription,
    });
    assert(draft.generated.grounding.safe, `${name}: grounding must pass`);
    return { name, quality: draft.quality.status, evidence: draft.generated.selectedEvidence.length };
  });

  return {
    pass: true,
    standard: { quality: standard.quality.status, evidence: standard.generated.selectedEvidence.length },
    concise: { quality: concise.quality.status, evidence: concise.generated.selectedEvidence.length },
    tonesDistinct: new Set(tones.map((draft) => draft.generated.letter)).size,
    fresherGrounded: fresher.generated.grounding.safe,
    careerChangerGrounded: changer.generated.grounding.safe,
    jobTailoringDifferent: differentJob.generated.letter !== standard.generated.letter,
    trapClaimsPrevented: true,
    falseEquivalenceGuardrails: true,
    qualityChecker: true,
    controlledRefinement: true,
    roleResults,
  };
}
