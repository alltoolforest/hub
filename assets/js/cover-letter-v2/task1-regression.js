import { buildTask1Foundation } from "./task1-foundation.js";
import { classifyResumeFile, createExtractionResult } from "./file-intake.js";
import { CANDIDATE_TYPES, EVIDENCE_STRENGTH } from "./contracts.js";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function roleCase(name, candidateType, resumeText, jobDescription) {
  const state = buildTask1Foundation({
    candidate: {
      candidateType,
      fullName: "Test Candidate",
      email: "candidate@example.com",
      targetPosition: name,
      company: "Example Company",
      motivation: "I am interested in the role because it aligns with my stated experience.",
    },
    resumeText,
    jobDescription,
  });
  assert(state.version === "cover-letter-v2-task1", `${name}: wrong state version`);
  assert(state.resume.status === "ready", `${name}: resume not ready`);
  assert(state.job.status === "ready", `${name}: JD not ready`);
  assert(state.evidenceMatches.length === state.job.requirements.length, `${name}: match count mismatch`);
  return state;
}

export function runTask1Regression() {
  const cases = [
    ["IT", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nJava\nSQL\nAWS\nExperience\nSoftware Engineer. Built Java APIs and SQL pipelines on Amazon Web Services.",
      "Required: Java. Required: SQL. Required: AWS. Preferred: Docker."],
    ["SAP", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nSAP Basis\nHANA\nLinux\nExperience\nSAP Basis Administrator supporting HANA and Linux.",
      "Required: SAP Basis. Required: Linux. Preferred: SAP FICO."],
    ["BPO", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nCustomer Service\nSalesforce\nCommunication\nExperience\nCustomer Support Associate handling customer issues in Salesforce.",
      "Required: customer service experience. Required: Salesforce. Preferred: escalations."],
    ["Financial crime", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nAML\nKYC\nTransaction Monitoring\nExperience\nInvestigated transaction monitoring alerts and completed KYC reviews.",
      "Required: Anti-Money Laundering. Required: Know Your Customer. Required: transaction monitoring."],
    ["Finance", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nMicrosoft Excel\nIFRS\nEducation\nBachelor of Commerce\nExperience\nPrepared IFRS reports in Excel.",
      "Required: IFRS. Required: MS Excel. Preferred: CPA."],
    ["Healthcare", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nPatient Care\nEMR\nCertifications\nRegistered Nurse license\nExperience\nDelivered patient care and documented in EMR.",
      "Required: RN license. Required: patient care. Preferred: ICU experience."],
    ["Engineering", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nAutoCAD\nSolidWorks\nEducation\nBachelor of Mechanical Engineering\nExperience\nCreated AutoCAD drawings.",
      "Required: AutoCAD. Required: mechanical engineering degree. Preferred: SolidWorks."],
    ["HR", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nRecruitment\nTalent Acquisition\nStakeholder Management\nExperience\nManaged recruitment and stakeholder communication.",
      "Required: recruitment experience. Required: stakeholder management."],
    ["Sales", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nSalesforce\nLead Generation\nDigital Marketing\nExperience\nGenerated leads and managed Salesforce pipeline.",
      "Required: Salesforce. Required: lead generation. Preferred: digital marketing."],
    ["Skilled trade", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nElectrical Wiring\nTroubleshooting\nCertifications\nElectrician license\nExperience\nInstalled electrical wiring and diagnosed faults.",
      "Required: electrician license. Required: electrical wiring. Required: troubleshooting."],
    ["Fresher", CANDIDATE_TYPES.FRESHER,
      "Education\nBachelor of Computer Science\nProjects\nBuilt a Java inventory application\nSkills\nJava\nSQL",
      "Required: Java. Preferred: SQL. Preferred: internship experience."],
    ["Career changer", CANDIDATE_TYPES.CAREER_CHANGER,
      "Skills\nCustomer Service\nMicrosoft Excel\nExperience\nRetail Associate assisting customers and preparing Excel reports.",
      "Required: customer service. Required: MS Excel. Preferred: banking experience."],
    ["Niche", CANDIDATE_TYPES.EXPERIENCED,
      "Skills\nCustom platform operations\nExperience\nSupported bespoke operational systems.",
      "Required: FluxCapacitorOps orchestration. Preferred: ChronoMesh calibration."],
  ];

  const results = cases.map((args) => {
    const state = roleCase(...args);
    return {
      role: args[0],
      requirements: state.job.requirements.length,
      strongOrRelevant: state.evidenceMatches.filter((m) =>
        m.strength === EVIDENCE_STRENGTH.STRONG || m.strength === EVIDENCE_STRENGTH.RELEVANT
      ).length,
      uncertainOrMissing: state.evidenceMatches.filter((m) =>
        m.strength === EVIDENCE_STRENGTH.UNCERTAIN || m.strength === EVIDENCE_STRENGTH.MISSING
      ).length,
    };
  });

  const aliases = roleCase("Alias test", CANDIDATE_TYPES.EXPERIENCED,
    "Skills\nAML\nMS Excel\nAWS\nPowerBI",
    "Required: Anti-Money Laundering. Required: Microsoft Excel. Required: Amazon Web Services. Required: Power BI."
  );
  assert(aliases.evidenceMatches.every((m) => m.strength !== EVIDENCE_STRENGTH.MISSING), "Known aliases should find supporting evidence.");

  const guardrails = roleCase("Non-equivalence", CANDIDATE_TYPES.EXPERIENCED,
    "Skills\nJavaScript\nSAP FICO\nTableau",
    "Required: Java. Required: SAP Basis. Required: Power BI."
  );
  assert(guardrails.evidenceMatches.every((m) => m.strength !== EVIDENCE_STRENGTH.STRONG), "Explicit non-equivalences must not be strong matches.");

  const unknown = results.find((item) => item.role === "Niche");
  assert(unknown.uncertainOrMissing > 0, "Unknown terminology must not be fabricated.");

  const pdf = classifyResumeFile({ name: "resume.pdf", type: "application/pdf", size: 1000 });
  const docx = classifyResumeFile({ name: "resume.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1000 });
  const bad = classifyResumeFile({ name: "resume.exe", type: "application/octet-stream", size: 1000 });
  const huge = classifyResumeFile({ name: "resume.pdf", type: "application/pdf", size: 9 * 1024 * 1024 });
  assert(pdf.ok && docx.ok, "PDF/DOCX should be accepted.");
  assert(!bad.ok && bad.code === "unsupported_format", "Unsupported format should be rejected.");
  assert(!huge.ok && huge.code === "file_too_large", "Oversized resume should be rejected.");

  const scanned = createExtractionResult({ fileLike: { name: "scan.pdf", type: "application/pdf", size: 1000 }, extractedText: "" });
  assert(scanned.status === "needs_paste_fallback", "Scanned/image-only PDF should use paste fallback.");

  const injection = buildTask1Foundation({
    candidate: { candidateType: CANDIDATE_TYPES.FRESHER, fullName: "<img src=x onerror=alert(1)>\u0000" },
    resumeText: "<script>alert(1)</script>\nSkills\nJava",
    jobDescription: "Required: Java.",
  });
  assert(!injection.candidate.fullName.includes("\u0000"), "Control characters should be removed.");
  assert(injection.resume.rawText.includes("<script>"), "User text should remain plain data rather than being silently rewritten.");

  return {
    pass: true,
    cases: results,
    fileIntake: { pdf: pdf.ok, docx: docx.ok, unsupportedRejected: !bad.ok, oversizedRejected: !huge.ok, scannedFallback: scanned.status },
    security: { controlCharactersRemoved: true, noHtmlExecutionLayerInTask1: true },
  };
}
