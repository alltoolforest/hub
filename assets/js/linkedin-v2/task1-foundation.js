import { ALIGNMENT } from "./contracts.js";
import { createProfileInput } from "./profile-schema.js";
import { extractEvidence } from "./evidence-extractor.js";
import { alignEvidenceToRole } from "./role-intelligence.js";

export function buildProfileFoundation(raw){
  const profile=createProfileInput(raw);
  const evidence=extractEvidence(profile);
  const alignment=alignEvidenceToRole(profile,evidence,ALIGNMENT);

  return Object.freeze({
    profile,
    evidence,
    alignment,
  });
}
