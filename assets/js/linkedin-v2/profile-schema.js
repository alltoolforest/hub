import { PROFILE_MODE } from "./contracts.js";
import { normalizeText, normalizeLines } from "./input-safety.js";

export function createProfileInput(raw={}){
  const mode=raw.mode||PROFILE_MODE.EXPERIENCED;
  if(!Object.values(PROFILE_MODE).includes(mode))throw new Error("Unsupported profile mode.");

  const targetRole=normalizeText(raw.targetRole,"targetRole");
  if(!targetRole)throw new Error("Target role is required.");

  return Object.freeze({
    mode,
    targetRole,
    currentRole:normalizeText(raw.currentRole,"currentRole"),
    industry:normalizeText(raw.industry,"industry"),
    currentHeadline:normalizeText(raw.currentHeadline,"currentHeadline"),
    currentAbout:normalizeText(raw.currentAbout,"currentAbout"),
    experienceText:normalizeText(raw.experienceText,"experienceText"),
    skills:normalizeLines(raw.skillsText,"skillsText"),
    achievements:normalizeLines(raw.achievementsText,"achievementsText"),
    professionalGoal:normalizeText(raw.professionalGoal,"professionalGoal"),
    resumeText:normalizeText(raw.resumeText,"resumeText"),
  });
}
