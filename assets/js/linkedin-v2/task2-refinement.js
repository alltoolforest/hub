function clean(text){return String(text||"").replace(/\s+/g," ").trim()}
function sentences(text){return String(text||"").split(/(?<=[.!?])\s+/).map(clean).filter(Boolean)}

export function refineText(text,action){
  const value=String(text||"").trim();
  if(!value)return "";
  switch(action){
    case "shorten":{
      const s=sentences(value);
      if(s.length>1)return s.slice(0,Math.max(1,Math.ceil(s.length*.65))).join(" ");
      const words=clean(value).split(" ");
      return words.slice(0,Math.max(6,Math.ceil(words.length*.7))).join(" ");
    }
    case "strengthen_opening":{
      const s=sentences(value);
      if(!s.length)return value;
      const first=s[0].replace(/^i am responsible for\s+/i,"I handle ").replace(/^responsible for\s+/i,"Handling ");
      return [first,...s.slice(1)].join(" ");
    }
    case "concise":
      return clean(value).replace(/\b(very|really|highly|extremely|basically|actually)\b\s*/gi,"").trim();
    case "professional":
      return clean(value).replace(/\bhelped\b/gi,"supported").replace(/\bworked on\b/gi,"contributed to").replace(/\bstuff\b/gi,"work");
    default:throw new Error("Unsupported refinement action.");
  }
}
