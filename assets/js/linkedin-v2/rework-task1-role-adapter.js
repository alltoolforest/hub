import {
  getTargetRoleSuggestions,
  identifyRoleFamily,
  getRoleSuggestions,
  getRoleCatalogStats
} from "../resume-studio-v2/role-engine.js";

function clean(value){
  return String(value||"").trim().replace(/\s+/g," ");
}

function slug(value){
  return clean(value).toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,100);
}

function unique(values){
  const seen=new Set();
  return values.filter(value=>{
    const key=clean(value).toLowerCase();
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}

export function createLinkedInRoleRecord(roleTitle){
  const title=clean(roleTitle);
  if(!title)throw new Error("A target role is required.");

  const family=identifyRoleFamily(title);
  const source=getRoleSuggestions(title);
  const commonSkills=Object.freeze((source.skills||[]).map(item=>item.text));
  const commonResponsibilities=Object.freeze((source.responsibilities||[]).map(item=>item.text));

  const firstWord=title.split(" ")[0]||title;
  const nearby=getTargetRoleSuggestions(title,20);
  const broader=getTargetRoleSuggestions(firstWord,20);
  const relatedTitles=Object.freeze(
    unique([...nearby,...broader])
      .filter(candidate=>candidate.toLowerCase()!==title.toLowerCase())
      .filter(candidate=>identifyRoleFamily(candidate).id===family.id)
      .slice(0,8)
  );

  return Object.freeze({
    id:(family.id==="general"?"custom":family.id)+"--"+slug(title),
    title,
    family:family.id,
    category:family.category,
    confidence:family.confidence,
    relatedTitles,
    commonSkills,
    commonResponsibilities,
    positioningThemes:Object.freeze(commonSkills.slice(0,3)),
    provenance:"resume-studio-role-engine",
  });
}

export function searchLinkedInTargetRoles(query,limit=8){
  const safeLimit=Math.max(1,Math.min(Number(limit)||8,12));
  return Object.freeze(
    getTargetRoleSuggestions(query,safeLimit)
      .map(title=>createLinkedInRoleRecord(title))
  );
}

export function getLinkedInRoleCatalogStats(){
  return getRoleCatalogStats();
}

export function isCatalogRole(record){
  return Boolean(record&&record.confidence==="catalog"&&record.family!=="general");
}
