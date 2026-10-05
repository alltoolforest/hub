const SKILL_ALIASES=new Map([
  ["ms excel","excel"],["microsoft excel","excel"],
  ["powerbi","power bi"],["power-bi","power bi"],
  ["amazon web services","aws"],
  ["anti money laundering","aml"],
  ["know your customer","kyc"],
]);

const PROTECTED_DISTINCTIONS=[
  ["java","javascript"],
  ["sap basis","sap fico"],
  ["power bi","tableau"],
];

function words(text){
  return (String(text||"").toLowerCase().match(/[a-z0-9+#.][a-z0-9+#. -]*/g)||[])
    .map(x=>x.trim()).filter(Boolean);
}

function canonical(value){
  const normalized=String(value||"").toLowerCase().trim().replace(/\s+/g," ");
  return SKILL_ALIASES.get(normalized)||normalized;
}

function addEvidence(map,type,value,source){
  const clean=String(value||"").trim();
  if(!clean)return;
  const key=`${type}::${canonical(clean)}`;
  const existing=map.get(key);
  if(existing){existing.sources.push(source);return}
  map.set(key,{type,value:clean,canonical:canonical(clean),sources:[source]});
}

function detectNumbers(text,source,map){
  for(const match of String(text||"").matchAll(/\b\d+(?:\.\d+)?%?\b/g))addEvidence(map,"metric",match[0],source);
}

function extractCandidatePhrases(text){
  return String(text||"")
    .split(/[\n,;|]/)
    .map(x=>x.trim())
    .filter(x=>x.length>=2&&x.length<=80);
}

export function extractEvidence(profile){
  const map=new Map();

  if(profile.currentRole)addEvidence(map,"role",profile.currentRole,"currentRole");
  if(profile.industry)addEvidence(map,"industry",profile.industry,"industry");

  profile.skills.forEach(v=>addEvidence(map,"skill",v,"skills"));
  profile.achievements.forEach(v=>{
    addEvidence(map,"achievement",v,"achievements");
    detectNumbers(v,"achievements",map);
  });

  for(const [field,type] of [
    ["currentHeadline","headline_phrase"],
    ["currentAbout","about_phrase"],
    ["experienceText","experience_phrase"],
    ["resumeText","resume_phrase"],
  ]){
    const text=profile[field];
    extractCandidatePhrases(text).forEach(v=>addEvidence(map,type,v,field));
    detectNumbers(text,field,map);
  }

  const allText=[profile.currentHeadline,profile.currentAbout,profile.experienceText,profile.resumeText].join("\n").toLowerCase();
  for(const skill of profile.skills){
    const c=canonical(skill);
    if(c&&allText.includes(c))addEvidence(map,"skill",skill,"profile_text");
  }

  return Object.freeze([...map.values()].map(item=>Object.freeze({...item,sources:Object.freeze([...new Set(item.sources)])})));
}

export function hasProtectedFalseEquivalence(a,b){
  const x=canonical(a),y=canonical(b);
  return PROTECTED_DISTINCTIONS.some(([left,right])=>(x===left&&y===right)||(x===right&&y===left));
}

export function canonicalTerm(value){return canonical(value)}
export function tokenizeEvidenceText(text){return words(text)}
