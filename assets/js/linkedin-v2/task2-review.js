import { buildProfileFoundation } from "./task1-foundation.js";
import { generateHeadlines,generateAbout,rewriteExperience,buildSkillsOutput,GENERIC_PHRASES,HEADLINE_MAX } from "./task2-optimizer.js";

const STATUS=Object.freeze({STRONG:"strong",ATTENTION:"needs_attention",MISSING:"missing"});
function item(id,label,status,message){return Object.freeze({id,label,status,message})}
function repetitions(text){
  const words=String(text||"").toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)||[];
  const counts=new Map();
  words.forEach(w=>counts.set(w,(counts.get(w)||0)+1));
  return [...counts.entries()].filter(([,count])=>count>=4).map(([word])=>word);
}

export function reviewProfile(rawOrFoundation){
  const foundation=rawOrFoundation?.profile?rawOrFoundation:buildProfileFoundation(rawOrFoundation);
  const profile=foundation.profile;
  const headlines=generateHeadlines(foundation);
  const about=generateAbout(foundation);
  const experience=rewriteExperience(foundation);
  const skills=buildSkillsOutput(foundation);
  const combined=[profile.currentHeadline,profile.currentAbout,profile.experienceText].join(" ");
  const generic=GENERIC_PHRASES.filter(p=>combined.toLowerCase().includes(p));
  const repeated=repetitions(combined);

  const checks=[
    profile.currentHeadline
      ? item("headline","Headline",profile.currentHeadline.length<=HEADLINE_MAX?STATUS.STRONG:STATUS.ATTENTION,
          profile.currentHeadline.length<=HEADLINE_MAX?"A current headline is present.":"Current headline is unusually long and should be tightened.")
      : item("headline","Headline",STATUS.MISSING,"No current headline was provided."),
    profile.currentAbout
      ? item("about","About",profile.currentAbout.length>=80?STATUS.STRONG:STATUS.ATTENTION,
          profile.currentAbout.length>=80?"An About section is present.":"About section is very short and may not communicate enough evidence.")
      : item("about","About",STATUS.MISSING,"No current About section was provided."),
    experience.length
      ? item("experience","Experience",STATUS.STRONG,"Experience evidence was provided for rewriting.")
      : item("experience","Experience",STATUS.MISSING,"No experience text was provided."),
    skills.supported.length
      ? item("skills","Skills",STATUS.STRONG,String(skills.supported.length)+" user-supported skill"+(skills.supported.length===1?"":"s")+" captured.")
      : item("skills","Skills",STATUS.MISSING,"No user-supported skills were provided."),
    foundation.evidence.some(x=>x.type==="achievement"||x.type==="metric")
      ? item("evidence","Evidence strength",STATUS.STRONG,"Achievement or metric evidence is present.")
      : item("evidence","Evidence strength",STATUS.ATTENTION,"No explicit achievement or metric evidence was provided. Do not invent one."),
    generic.length
      ? item("generic","Generic wording",STATUS.ATTENTION,"Generic wording detected: "+generic.join(", ")+".")
      : item("generic","Generic wording",STATUS.STRONG,"No common generic phrases were detected."),
    repeated.length
      ? item("repetition","Repetition",STATUS.ATTENTION,"Repeated terms to review: "+repeated.slice(0,5).join(", ")+".")
      : item("repetition","Repetition",STATUS.STRONG,"No heavy term repetition was detected."),
  ];

  const target=profile.targetRole.toLowerCase();
  const current=(profile.currentHeadline+" "+profile.currentAbout).toLowerCase();
  checks.push(current&&current.includes(target)
    ? item("target_consistency","Target-role consistency",STATUS.STRONG,"Current profile text already references the target role.")
    : item("target_consistency","Target-role consistency",STATUS.ATTENTION,"Current profile text does not clearly reference the target role."));

  return Object.freeze({
    statuses:STATUS,
    checks:Object.freeze(checks),
    recommended:Object.freeze({headlines,about,experience,skills}),
  });
}
