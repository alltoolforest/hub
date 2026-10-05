import { GENERIC_PHRASES } from "./task2-optimizer.js";

const STATUS=Object.freeze({
  STRONG:"strong",
  ATTENTION:"needs_attention",
});

function clean(value){
  return String(value||"").trim();
}

function item(id,label,status,message){
  return Object.freeze({id,label,status,message});
}

function repetitions(text){
  const words=String(text||"").toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g)||[];
  const stop=new Set([
    "and","the","with","for","from","your","you","this","that","into","using",
    "profile","experience","skills","role","professional"
  ]);
  const counts=new Map();
  for(const word of words){
    if(stop.has(word))continue;
    counts.set(word,(counts.get(word)||0)+1);
  }
  return [...counts.entries()]
    .filter(([,count])=>count>=5)
    .sort((a,b)=>b[1]-a[1])
    .map(([word])=>word);
}

function targetTerms(targetRole){
  const target=clean(targetRole).toLowerCase();
  if(!target)return [];
  const words=target.split(/s+/).filter(word=>word.length>=4);
  return [target,...words];
}

export function reviewFinalProfile({drafts={},targetRole="",achievementText=""}={}){
  const headline=clean(drafts.headline);
  const about=clean(drafts.about);
  const experience=clean(drafts.experience);
  const skills=clean(drafts.skills);
  const combined=[headline,about,experience,skills].filter(Boolean).join(" ");
  const combinedLower=combined.toLowerCase();

  const missing=[
    ["Headline",headline],
    ["About",about],
    ["Experience",experience],
    ["Skills",skills],
  ].filter(([,value])=>!value).map(([label])=>label);

  const generic=GENERIC_PHRASES.filter(phrase=>combinedLower.includes(String(phrase).toLowerCase()));
  const repeated=repetitions(combined);
  const terms=targetTerms(targetRole);
  const targetAligned=terms.length
    ? terms.some(term=>combinedLower.includes(term))
    : true;

  const hasAchievement=Boolean(clean(achievementText));
  const hasMetric=/d+(?:.d+)?%?/.test(String(achievementText||""));

  const checks=[
    missing.length
      ? item(
          "completeness",
          "Profile completeness",
          STATUS.ATTENTION,
          "Review the final "+missing.join(", ")+" section"+(missing.length===1?"":"s")+" before copying your profile."
        )
      : item(
          "completeness",
          "Profile completeness",
          STATUS.STRONG,
          "Headline, About, Experience and Skills are all ready for review."
        ),

    targetAligned
      ? item(
          "target_alignment",
          "Target-role alignment",
          STATUS.STRONG,
          "The finished profile clearly reflects the selected target role."
        )
      : item(
          "target_alignment",
          "Target-role alignment",
          STATUS.ATTENTION,
          "The finished profile could reference the target role more clearly."
        ),

    hasAchievement
      ? item(
          "evidence",
          "Evidence strength",
          STATUS.STRONG,
          hasMetric
            ? "A verified achievement or measurable result strengthens the profile."
            : "Achievement evidence is included. Add a metric only if you can verify it."
        )
      : item(
          "evidence",
          "Evidence strength",
          STATUS.ATTENTION,
          "The profile is usable without a metric, but one verified achievement can make it stronger."
        ),

    generic.length
      ? item(
          "wording",
          "Wording quality",
          STATUS.ATTENTION,
          "Consider replacing generic wording such as: "+generic.slice(0,3).join(", ")+"."
        )
      : item(
          "wording",
          "Wording quality",
          STATUS.STRONG,
          "No common generic phrases were detected in the finished profile."
        ),

    repeated.length
      ? item(
          "repetition",
          "Repetition",
          STATUS.ATTENTION,
          "Repeated terms to review: "+repeated.slice(0,4).join(", ")+"."
        )
      : item(
          "repetition",
          "Repetition",
          STATUS.STRONG,
          "No heavy term repetition was detected in the finished profile."
        ),
  ];

  return Object.freeze({
    statuses:STATUS,
    checks:Object.freeze(checks),
  });
}
