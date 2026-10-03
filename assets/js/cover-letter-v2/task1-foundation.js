import { createCandidateProfile, createTask1State } from "./schema.js";
import { analyzeResumeText, buildCandidateEvidenceIndex } from "./resume-intelligence.js";
import { analyzeJobDescription } from "./job-intelligence.js";
import { matchEvidenceToRequirements } from "./evidence-matcher.js";

export function buildTask1Foundation({
  candidate = {},
  resumeText = "",
  resumeSource = "pasted_text",
  jobDescription = "",
} = {}) {
  const profile = createCandidateProfile(candidate);
  const resume = analyzeResumeText(resumeText, resumeSource);
  const job = analyzeJobDescription(jobDescription);
  const evidenceIndex = buildCandidateEvidenceIndex(resume);
  const evidenceMatches = matchEvidenceToRequirements(evidenceIndex, job.requirements);

  return createTask1State({
    candidate: profile,
    resume,
    job,
    evidenceMatches,
  });
}
